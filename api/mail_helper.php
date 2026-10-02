<?php
/**
 * Helpers IMAP/SMTP pour le module Mails (OVH).
 */

function mailEnsureTablesExist(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_mailboxes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        label VARCHAR(120) NOT NULL DEFAULT '',
        email VARCHAR(255) NOT NULL,
        imap_host VARCHAR(255) NOT NULL DEFAULT 'ssl0.ovh.net',
        imap_port INT NOT NULL DEFAULT 993,
        imap_encryption VARCHAR(10) NOT NULL DEFAULT 'ssl',
        smtp_host VARCHAR(255) NOT NULL DEFAULT 'ssl0.ovh.net',
        smtp_port INT NOT NULL DEFAULT 465,
        smtp_encryption VARCHAR(10) NOT NULL DEFAULT 'ssl',
        username VARCHAR(255) NOT NULL,
        password_enc TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_mailboxes_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_mail_settings (
        user_id INT NOT NULL,
        mailbox_id INT NOT NULL DEFAULT 0,
        signature_html MEDIUMTEXT NOT NULL,
        signature_enabled TINYINT(1) NOT NULL DEFAULT 1,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, mailbox_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    mailEnsureMailboxSettingsSchema($pdo);

    $pdo->exec("CREATE TABLE IF NOT EXISTS mail_signature_assets (
        public_id VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        mime VARCHAR(100) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mail_sig_assets_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS mail_send_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        mailbox_id INT NOT NULL,
        from_email VARCHAR(255) NOT NULL DEFAULT '',
        recipient_count INT NOT NULL DEFAULT 1,
        to_preview VARCHAR(500) NOT NULL DEFAULT '',
        subject VARCHAR(500) NOT NULL DEFAULT '',
        success TINYINT(1) NOT NULL DEFAULT 0,
        error_message TEXT NULL,
        recipients_json TEXT NULL,
        smtp_host_used VARCHAR(255) NOT NULL DEFAULT '',
        smtp_port_used INT NOT NULL DEFAULT 0,
        smtp_encryption_used VARCHAR(10) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mail_send_mailbox_time (mailbox_id, created_at),
        INDEX idx_mail_send_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    mailEnsureSendLogColumns($pdo);
}

function mailEnsureMailboxSettingsSchema(PDO $pdo): void
{
    try {
        $hasMailboxCol = (bool)$pdo->query("SHOW COLUMNS FROM user_mail_settings LIKE 'mailbox_id'")->fetch();
        if (!$hasMailboxCol) {
            $pdo->exec('ALTER TABLE user_mail_settings ADD COLUMN mailbox_id INT NOT NULL DEFAULT 0 AFTER user_id');
        }

        $pkCols = $pdo->query("SHOW INDEX FROM user_mail_settings WHERE Key_name = 'PRIMARY'")->fetchAll();
        $pkNames = array_map(static function ($row) {
            return $row['Column_name'] ?? '';
        }, $pkCols);
        $needsPk = !in_array('mailbox_id', $pkNames, true);

        $legacyRows = $pdo->query('SELECT user_id, signature_html, signature_enabled FROM user_mail_settings WHERE mailbox_id = 0')->fetchAll();
        foreach ($legacyRows as $row) {
            $uid = (int)$row['user_id'];
            $stmt = $pdo->prepare('SELECT id FROM user_mailboxes WHERE user_id = ? ORDER BY sort_order ASC, id ASC');
            $stmt->execute([$uid]);
            $mboxes = $stmt->fetchAll();
            if (!$mboxes) {
                continue;
            }
            $pdo->prepare('DELETE FROM user_mail_settings WHERE user_id = ? AND mailbox_id = 0')->execute([$uid]);
            $ins = $pdo->prepare('INSERT INTO user_mail_settings (user_id, mailbox_id, signature_html, signature_enabled)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE signature_html = VALUES(signature_html), signature_enabled = VALUES(signature_enabled)');
            foreach ($mboxes as $mb) {
                $ins->execute([
                    $uid,
                    (int)$mb['id'],
                    (string)($row['signature_html'] ?? ''),
                    (int)($row['signature_enabled'] ?? 1),
                ]);
            }
        }

        if ($needsPk) {
            try {
                $pdo->exec('ALTER TABLE user_mail_settings DROP PRIMARY KEY');
            } catch (Throwable $e) {
                // Ancienne clé déjà composite ou absente
            }
            $pdo->exec('ALTER TABLE user_mail_settings ADD PRIMARY KEY (user_id, mailbox_id)');
        }
    } catch (Throwable $e) {
        error_log('mailEnsureMailboxSettingsSchema: ' . $e->getMessage());
    }
}

function mailUserOwnsMailbox(PDO $pdo, int $userId, int $mailboxId): bool
{
    if ($mailboxId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare('SELECT 1 FROM user_mailboxes WHERE id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$mailboxId, $userId]);
    return (bool)$stmt->fetchColumn();
}

function mailEnsureSendLogColumns(PDO $pdo): void
{
    $columns = [
        'recipients_json' => 'TEXT NULL',
        'smtp_host_used' => "VARCHAR(255) NOT NULL DEFAULT ''",
        'smtp_port_used' => 'INT NOT NULL DEFAULT 0',
        'smtp_encryption_used' => "VARCHAR(10) NOT NULL DEFAULT ''",
    ];
    foreach ($columns as $name => $definition) {
        try {
            $pdo->exec("ALTER TABLE mail_send_log ADD COLUMN {$name} {$definition}");
        } catch (Throwable $e) {
            // Colonne déjà présente
        }
    }
}

function mailEncryptCredential(string $plaintext): string
{
    $key = hash('sha256', MAIL_ENCRYPTION_KEY, true);
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        throw new RuntimeException('Échec du chiffrement');
    }
    return base64_encode($iv . $tag . $cipher);
}

function mailDecryptCredential(string $encoded): string
{
    $raw = base64_decode($encoded, true);
    if ($raw === false || strlen($raw) < 29) {
        throw new RuntimeException('Mot de passe boîte mail invalide');
    }
    $key = hash('sha256', MAIL_ENCRYPTION_KEY, true);
    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $cipher = substr($raw, 28);
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($plain === false) {
        throw new RuntimeException('Échec du déchiffrement');
    }
    return $plain;
}

function mailImapAvailable(): bool
{
    return function_exists('imap_open');
}

function mailFormatMailboxRow(array $row, bool $includeSecrets = false): array
{
    $out = [
        'id' => (int)$row['id'],
        'user_id' => (int)$row['user_id'],
        'label' => $row['label'],
        'email' => $row['email'],
        'imap_host' => $row['imap_host'],
        'imap_port' => (int)$row['imap_port'],
        'imap_encryption' => $row['imap_encryption'],
        'smtp_host' => $row['smtp_host'],
        'smtp_port' => (int)$row['smtp_port'],
        'smtp_encryption' => $row['smtp_encryption'],
        'username' => $row['username'],
        'sort_order' => (int)$row['sort_order'],
    ];
    if ($includeSecrets) {
        $out['password'] = mailDecryptCredential($row['password_enc']);
    }
    return $out;
}

function mailGetMailboxForUser(PDO $pdo, int $userId, int $mailboxId, bool $withPassword = true): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM user_mailboxes WHERE id = ? AND user_id = ?');
    $stmt->execute([$mailboxId, $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return mailFormatMailboxRow($row, $withPassword);
}

function mailUserHasMailboxes(PDO $pdo, int $userId): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM user_mailboxes WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    return (bool)$stmt->fetchColumn();
}

function mailNormalizeMailboxCredentials(array $mailbox): array
{
    $email = trim($mailbox['email'] ?? '');
    $user = trim($mailbox['username'] ?? $email);
    if ($email !== '' && strpos($user, '@') === false) {
        $at = strrpos($email, '@');
        if ($at !== false) {
            $user .= substr($email, $at);
        }
    }
    if ($user === '' && $email !== '') {
        $user = $email;
    }
    $mailbox['username'] = $user;
    $mailbox['email'] = $email;
    return $mailbox;
}

function mailIsExchangeHost(string $host): bool
{
    return (bool)preg_match('/^ex\d+\.mail\.ovh\.net$/i', trim($host));
}

function mailOvhImapHosts(string $configuredHost): array
{
    $configuredHost = trim($configuredHost) ?: 'ssl0.ovh.net';
    $hosts = [$configuredHost];

    // Exchange (ex*.mail.ovh.net) : auth Kerberos/GSSAPI, incompatible avec PHP IMAP standard.
    if (mailIsExchangeHost($configuredHost)) {
        return $hosts;
    }

    // Email classique / Email Pro uniquement — pas de fallback vers Exchange.
    foreach (['ssl0.ovh.net', 'pro1.mail.ovh.net', 'pro2.mail.ovh.net'] as $fallback) {
        if (!in_array($fallback, $hosts, true)) {
            $hosts[] = $fallback;
        }
    }
    return $hosts;
}

function mailPreferImapError(string $current, string $new): string
{
    if ($new === '') {
        return $current;
    }
    if ($current === '') {
        return $new;
    }
    $score = static function (string $err): int {
        if (stripos($err, 'AUTHENTICATIONFAILED') !== false || stripos($err, 'AUTHENTICATE failed') !== false) {
            return 40;
        }
        if (stripos($err, 'CLOSED') !== false || stripos($err, 'connection broken') !== false) {
            return 30;
        }
        if (stripos($err, 'Kerberos') !== false || stripos($err, 'GSSAPI') !== false) {
            return 5;
        }
        return 20;
    };
    return $score($new) >= $score($current) ? $new : $current;
}

function mailImapSuffixVariants(int $port, string $encryption): array
{
    $pairs = [];
    $enc = strtolower(trim($encryption) ?: 'ssl');

    if ($enc !== 'tls') {
        $sslPort = $port === 143 ? 993 : $port;
        foreach (['/imap/ssl/novalidate-cert', '/ssl/novalidate-cert', '/imap/ssl', '/ssl'] as $suffix) {
            $pairs[] = [$sslPort, $suffix];
        }
    }
    if ($enc !== 'ssl') {
        $tlsPort = ($port === 993 && $enc !== 'tls') ? 143 : ($enc === 'tls' ? ($port ?: 143) : 143);
        foreach (['/imap/tls/novalidate-cert', '/imap/tls', '/tls/novalidate-cert'] as $suffix) {
            $pairs[] = [$tlsPort, $suffix];
        }
    }
    return $pairs;
}

function mailImapConnectionVariants(array $mailbox): array
{
    $configuredHost = trim($mailbox['imap_host'] ?? '') ?: 'ssl0.ovh.net';
    $port = (int)($mailbox['imap_port'] ?? 993) ?: 993;
    $encryption = $mailbox['imap_encryption'] ?? 'ssl';
    $refs = [];
    $seen = [];
    foreach (mailOvhImapHosts($configuredHost) as $host) {
        foreach (mailImapSuffixVariants($port, $encryption) as [$tryPort, $suffix]) {
            $ref = '{' . $host . ':' . $tryPort . $suffix . '}';
            if (!isset($seen[$ref])) {
                $seen[$ref] = true;
                $refs[] = $ref;
            }
        }
    }
    return $refs;
}

function mailParseImapRef(string $ref): array
{
    if (preg_match('/^\{([^:}]+):(\d+)(\/[^}]+)?\}$/', $ref, $m)) {
        $flags = $m[3] ?? '';
        $encryption = (stripos($flags, 'tls') !== false) ? 'tls' : 'ssl';
        return [
            'host' => $m[1],
            'port' => (int)$m[2],
            'encryption' => $encryption,
        ];
    }
    return [];
}

function mailBuildImapMailboxString(array $mailbox): string
{
    $variants = mailImapConnectionVariants($mailbox);
    return $variants[0];
}

function mailFormatImapError(string $lastErr, array $mailbox): string
{
    $msg = 'Connexion IMAP impossible : ' . ($lastErr ?: 'erreur inconnue');
    $isAuth = stripos($lastErr, 'AUTHENTICATIONFAILED') !== false
        || stripos($lastErr, 'AUTHENTICATE failed') !== false;
    $isClosed = stripos($lastErr, 'CLOSED') !== false || stripos($lastErr, 'connection broken') !== false;
    $isKerberos = stripos($lastErr, 'Kerberos') !== false || stripos($lastErr, 'GSSAPI') !== false;
    if ($isAuth || $isClosed || $isKerberos) {
        $msg .= "\n\nVérifications OVH :";
        $msg .= "\n• Identifiant = adresse email complète (" . ($mailbox['username'] ?? '') . ')';
        $msg .= "\n• Mot de passe = celui de la boîte mail (webmail OVH), pas le compte client OVH";
        if ($isAuth) {
            $msg .= "\n• Chaque boîte a son propre mot de passe — vérifiez celui de cette adresse précise";
        }
        $msg .= "\n• Serveur IMAP selon l'offre (Manager OVH → Email → Configuration) :";
        $msg .= "\n  – Email classique / MX Plan : ssl0.ovh.net (port 993 SSL)";
        $msg .= "\n  – Email Pro : pro1.mail.ovh.net ou pro2.mail.ovh.net";
        $msg .= "\n  – Exchange : ex2.mail.ovh.net… (auth spécifique, non supportée ici)";
        $msg .= "\n• Serveur actuellement configuré : " . ($mailbox['imap_host'] ?? 'ssl0.ovh.net');
        $msg .= "\n• Si une autre boîte du même utilisateur fonctionne, reprenez le même serveur IMAP";
        $msg .= "\n• Testez la connexion sur webmail OVH avec les mêmes identifiants";
        if ($isAuth) {
            $msg .= "\n• Évitez les caractères < ou > dans le mot de passe (bug PHP IMAP)";
        }
        if ($isKerberos && mailIsExchangeHost($mailbox['imap_host'] ?? '')) {
            $msg .= "\n• Boîte Exchange : connexion IMAP standard non supportée par cette application";
        }
    }
    return $msg;
}

function mailClearImapErrors(): void
{
    if (function_exists('imap_errors')) {
        @imap_errors();
    }
    if (function_exists('imap_alerts')) {
        @imap_alerts();
    }
}

function mailFolderAliases(): array
{
    return [
        'INBOX' => ['INBOX', 'Inbox'],
        'Sent' => ['Sent', 'INBOX.Sent', 'Sent Messages', 'Éléments envoyés', 'Envoyés', 'INBOX.Envoyés'],
        'Drafts' => ['Drafts', 'INBOX.Drafts', 'Brouillons', 'INBOX.Brouillons'],
        'Trash' => ['Trash', 'INBOX.Trash', 'Deleted', 'Corbeille', 'INBOX.Corbeille', 'Éléments supprimés'],
        'Spam' => ['Spam', 'Junk', 'INBOX.Spam', 'INBOX.Junk', 'Courrier indésirable', 'Indésirables'],
    ];
}

function mailResolveFolder($imap, string $mailboxRef, string $folderKey): string
{
    $folderKey = $folderKey ?: 'INBOX';
    if ($folderKey === 'INBOX') {
        return $mailboxRef . 'INBOX';
    }
    $aliases = mailFolderAliases();
    $candidates = $aliases[$folderKey] ?? [$folderKey];
    $list = @imap_list($imap, $mailboxRef, '*');
    if (!$list) {
        return $mailboxRef . $folderKey;
    }
    $normalized = [];
    foreach ($list as $path) {
        $short = str_replace($mailboxRef, '', imap_utf7_decode($path));
        $normalized[$short] = $path;
        $normalized[mb_strtolower($short)] = $path;
    }
    foreach ($candidates as $candidate) {
        if (isset($normalized[$candidate])) {
            return $normalized[$candidate];
        }
        $lc = mb_strtolower($candidate);
        if (isset($normalized[$lc])) {
            return $normalized[$lc];
        }
    }
    foreach ($list as $path) {
        $short = str_replace($mailboxRef, '', imap_utf7_decode($path));
        foreach ($candidates as $candidate) {
            if (stripos($short, $candidate) !== false) {
                return $path;
            }
        }
    }
    return $mailboxRef . $folderKey;
}

/** Nom de boîte court pour imap_mail_move (sans préfixe serveur {host:port/...}) */
function mailImapMailboxMoveName(string $fullMailbox, string $mailboxRef): string
{
    if ($mailboxRef !== '' && strpos($fullMailbox, $mailboxRef) === 0) {
        return substr($fullMailbox, strlen($mailboxRef));
    }
    if (preg_match('/\}(.+)$/s', $fullMailbox, $m)) {
        return $m[1];
    }
    return $fullMailbox;
}

function mailOpenImap(array $mailbox, string $folderKey = 'INBOX')
{
    if (!mailImapAvailable()) {
        throw new RuntimeException('Extension PHP IMAP non disponible sur ce serveur');
    }
    $mailbox = mailNormalizeMailboxCredentials($mailbox);
    $password = $mailbox['password'] ?? mailDecryptCredential($mailbox['password_enc'] ?? '');
    if ($password === '') {
        throw new RuntimeException('Mot de passe boîte mail manquant');
    }

    $variants = mailImapConnectionVariants($mailbox);
    $configuredHost = trim($mailbox['imap_host'] ?? '') ?: 'ssl0.ovh.net';
    $lastErr = '';
    $imap = false;
    $usedRef = '';

    foreach ($variants as $ref) {
        mailClearImapErrors();
        $imap = @imap_open($ref . 'INBOX', $mailbox['username'], $password, 0, 1);
        if ($imap) {
            $usedRef = $ref;
            $GLOBALS['mail_last_imap_ref'] = $ref;
            break;
        }
        $errs = imap_errors();
        $err = $errs ? implode('; ', $errs) : (imap_last_error() ?: '');
        $attemptHost = mailParseImapRef($ref)['host'] ?? '';
        // Ignorer les erreurs Kerberos des serveurs Exchange non configurés.
        if (mailIsExchangeHost($attemptHost) && !mailIsExchangeHost($configuredHost)) {
            continue;
        }
        $lastErr = mailPreferImapError($lastErr, $err);
    }

    if (!$imap) {
        throw new RuntimeException(mailFormatImapError($lastErr, $mailbox));
    }

    if ($folderKey !== 'INBOX') {
        $target = mailResolveFolder($imap, $usedRef, $folderKey);
        if (!@imap_reopen($imap, $target)) {
            $errs = imap_errors();
            $err = $errs ? implode('; ', $errs) : imap_last_error();
            mailCloseImap($imap);
            throw new RuntimeException('Dossier inaccessible : ' . ($err ?: $folderKey));
        }
    }
    return $imap;
}

function mailCloseImap($imap): void
{
    if ($imap) {
        @imap_close($imap);
    }
}

function mailDecodePartBody($imap, int $uid, object $part, string $partNumber = '1'): string
{
    $body = imap_fetchbody($imap, $uid, $partNumber, FT_UID);
    if ($body === false) {
        return '';
    }
    $encoding = $part->encoding ?? 0;
    if ($encoding == 3) {
        $body = base64_decode($body);
    } elseif ($encoding == 4) {
        $body = quoted_printable_decode($body);
    }
    if (!empty($part->parameters)) {
        foreach ($part->parameters as $param) {
            if (strtolower($param->attribute) === 'charset') {
                $charset = $param->value;
                if ($charset && strtoupper($charset) !== 'UTF-8') {
                    $converted = @iconv($charset, 'UTF-8//IGNORE', $body);
                    if ($converted !== false) {
                        $body = $converted;
                    }
                }
                break;
            }
        }
    }
    return $body;
}

function mailExtractBodies($imap, int $uid, ?object $structure, string $prefix = ''): array
{
    $result = ['text' => '', 'html' => ''];
    if (!$structure) {
        $raw = imap_body($imap, $uid, FT_UID);
        $result['text'] = $raw ?: '';
        return $result;
    }
    if (!empty($structure->parts)) {
        foreach ($structure->parts as $index => $sub) {
            $partNum = $prefix === '' ? (string)($index + 1) : $prefix . '.' . ($index + 1);
            $type = $sub->type ?? 0;
            $subtype = strtolower($sub->subtype ?? '');
            if ($type == 0 && $subtype === 'plain' && $result['text'] === '') {
                $result['text'] = mailDecodePartBody($imap, $uid, $sub, $partNum);
            } elseif ($type == 0 && $subtype === 'html' && $result['html'] === '') {
                $result['html'] = mailDecodePartBody($imap, $uid, $sub, $partNum);
            } elseif ($type == 1) {
                $nested = mailExtractBodies($imap, $uid, $sub, $partNum);
                if ($result['text'] === '' && $nested['text'] !== '') {
                    $result['text'] = $nested['text'];
                }
                if ($result['html'] === '' && $nested['html'] !== '') {
                    $result['html'] = $nested['html'];
                }
            }
        }
    } else {
        $subtype = strtolower($structure->subtype ?? 'plain');
        $body = mailDecodePartBody($imap, $uid, $structure, $prefix ?: '1');
        if ($subtype === 'html') {
            $result['html'] = $body;
        } else {
            $result['text'] = $body;
        }
    }
    return $result;
}

function mailListAttachmentsFromStructure(?object $structure, string $prefix = ''): array
{
    $attachments = [];
    if (!$structure || empty($structure->parts)) {
        return $attachments;
    }
    foreach ($structure->parts as $index => $part) {
        $partNum = $prefix === '' ? (string)($index + 1) : $prefix . '.' . ($index + 1);
        $filename = '';
        if (!empty($part->dparameters)) {
            foreach ($part->dparameters as $param) {
                if (strtolower($param->attribute) === 'filename') {
                    $filename = $param->value;
                }
            }
        }
        if (!$filename && !empty($part->parameters)) {
            foreach ($part->parameters as $param) {
                if (strtolower($param->attribute) === 'name') {
                    $filename = $param->value;
                }
            }
        }
        $disposition = strtolower($part->disposition ?? '');
        $isAttachment = ($disposition === 'attachment') || ($filename && ($part->type ?? 0) != 0);
        if ($isAttachment && $filename) {
            $mime = 'application/octet-stream';
            if (!empty($part->subtype)) {
                $types = ['0' => 'text', '1' => 'multipart', '2' => 'message', '3' => 'application', '4' => 'audio', '5' => 'image', '6' => 'video', '7' => 'other'];
                $main = $types[(string)($part->type ?? 3)] ?? 'application';
                $mime = $main . '/' . strtolower($part->subtype);
            }
            $attachments[] = [
                'part' => $partNum,
                'filename' => $filename,
                'mime' => $mime,
                'size' => (int)($part->bytes ?? 0),
            ];
        } elseif (($part->type ?? 0) == 1) {
            $attachments = array_merge($attachments, mailListAttachmentsFromStructure($part, $partNum));
        }
    }
    return $attachments;
}

function mailPartMimeType(object $part): string
{
    $types = ['0' => 'text', '1' => 'multipart', '2' => 'message', '3' => 'application', '4' => 'audio', '5' => 'image', '6' => 'video', '7' => 'other'];
    $main = $types[(string)($part->type ?? 3)] ?? 'application';
    return $main . '/' . strtolower($part->subtype ?? 'octet-stream');
}

function mailCollectInlineImageParts(?object $structure, string $prefix = ''): array
{
    $inline = [];
    if (!$structure) {
        return $inline;
    }
    if (empty($structure->parts)) {
        $cid = !empty($structure->id) ? trim((string)$structure->id, '<>') : '';
        if ($cid !== '' && ($structure->type ?? 0) == 5) {
            $inline[] = [
                'part' => $prefix !== '' ? $prefix : '1',
                'cid' => $cid,
                'mime' => mailPartMimeType($structure),
                'structure' => $structure,
            ];
        }
        return $inline;
    }
    foreach ($structure->parts as $index => $part) {
        $partNum = $prefix === '' ? (string)($index + 1) : $prefix . '.' . ($index + 1);
        if (($part->type ?? 0) == 1) {
            $inline = array_merge($inline, mailCollectInlineImageParts($part, $partNum));
            continue;
        }
        $cid = !empty($part->id) ? trim((string)$part->id, '<>') : '';
        $disposition = strtolower($part->disposition ?? '');
        $isImage = ($part->type ?? 0) == 5;
        if ($cid !== '' && ($isImage || $disposition === 'inline')) {
            $inline[] = [
                'part' => $partNum,
                'cid' => $cid,
                'mime' => mailPartMimeType($part),
                'structure' => $part,
            ];
        }
    }
    return $inline;
}

function mailResolveCidInHtml($imap, int $uid, ?object $structure, string $html): string
{
    if ($html === '' || stripos($html, 'cid:') === false) {
        return $html;
    }
    foreach (mailCollectInlineImageParts($structure) as $item) {
        $cid = $item['cid'];
        $data = mailDecodePartBody($imap, $uid, $item['structure'], $item['part']);
        if ($data === '') {
            continue;
        }
        $dataUrl = 'data:' . $item['mime'] . ';base64,' . base64_encode($data);
        $patterns = [
            '/\bsrc=(["\'])cid:' . preg_quote($cid, '/') . '\1/i',
            '/\bsrc=(["\'])cid:' . preg_quote('<' . $cid . '>', '/') . '\1/i',
        ];
        foreach ($patterns as $pattern) {
            $html = preg_replace($pattern, 'src=$1' . $dataUrl . '$1', $html) ?? $html;
        }
    }
    return $html;
}

function mailGetInboxUnreadCount(array $mailbox): int
{
    try {
        $imap = mailOpenImap($mailbox, 'INBOX');
        try {
            $check = @imap_check($imap);
            if ($check && isset($check->Unread)) {
                return max(0, (int)$check->Unread);
            }
            $unseen = @imap_search($imap, 'UNSEEN', SE_UID);
            if (is_array($unseen)) {
                return count($unseen);
            }
            $unseen = @imap_search($imap, 'UNSEEN');
            return is_array($unseen) ? count($unseen) : 0;
        } finally {
            mailCloseImap($imap);
        }
    } catch (Throwable $e) {
        return 0;
    }
}

function mailListMessages(array $mailbox, string $folderKey, int $page, int $limit, bool $unreadOnly = false): array
{
    $imap = mailOpenImap($mailbox, $folderKey);
    try {
        if ($unreadOnly) {
            $uids = @imap_search($imap, 'UNSEEN', SE_UID);
            if (!is_array($uids)) {
                $uids = [];
            } else {
                rsort($uids);
            }
        } else {
            $uids = imap_sort($imap, SORTDATE, 1, SE_UID);
            if (!$uids) {
                $uids = imap_search($imap, 'ALL', SE_UID) ?: [];
                rsort($uids);
            }
        }
        $total = count($uids);
        if ($total === 0) {
            return ['messages' => [], 'total' => 0, 'page' => $page, 'limit' => $limit, 'unread_only' => $unreadOnly];
        }
        $offset = max(0, ($page - 1) * $limit);
        $slice = array_slice($uids, $offset, $limit);
        $messages = [];
        foreach ($slice as $uid) {
            $overview = imap_fetch_overview($imap, (string)$uid, FT_UID);
            if (!$overview || !isset($overview[0])) {
                continue;
            }
            $ov = $overview[0];
            $messages[] = [
                'uid' => (int)$uid,
                'message_id' => $ov->message_id ?? '',
                'subject' => isset($ov->subject) ? mailDecodeMimeHeader($ov->subject) : '(sans objet)',
                'from' => isset($ov->from) ? mailDecodeMimeHeader($ov->from) : '',
                'to' => isset($ov->to) ? mailDecodeMimeHeader($ov->to) : '',
                'date' => $ov->date ?? '',
                'seen' => !empty($ov->seen),
                'flagged' => !empty($ov->flagged),
                'has_attachments' => false,
            ];
            $structure = imap_fetchstructure($imap, $uid, FT_UID);
            $atts = mailListAttachmentsFromStructure($structure);
            $messages[count($messages) - 1]['has_attachments'] = count($atts) > 0;
        }
        return ['messages' => $messages, 'total' => $total, 'page' => $page, 'limit' => $limit, 'unread_only' => $unreadOnly];
    } finally {
        mailCloseImap($imap);
    }
}

function mailDecodeMimeHeader(string $value): string
{
    $decoded = @imap_mime_header_decode($value);
    if (!$decoded) {
        return $value;
    }
    $out = '';
    foreach ($decoded as $part) {
        $text = $part->text ?? '';
        $charset = $part->charset ?? 'default';
        if ($charset && strtoupper($charset) !== 'DEFAULT' && strtoupper($charset) !== 'UTF-8') {
            $converted = @iconv($charset, 'UTF-8//IGNORE', $text);
            if ($converted !== false) {
                $text = $converted;
            }
        }
        $out .= $text;
    }
    return $out;
}

function mailGetMessage(array $mailbox, string $folderKey, int $uid): array
{
    $imap = mailOpenImap($mailbox, $folderKey);
    try {
        if (!imap_fetch_overview($imap, (string)$uid, FT_UID)) {
            throw new RuntimeException('Message introuvable');
        }
        @imap_setflag_full($imap, (string)$uid, '\\Seen', ST_UID);
        $overview = imap_fetch_overview($imap, (string)$uid, FT_UID)[0];
        $structure = imap_fetchstructure($imap, $uid, FT_UID);
        $bodies = mailExtractBodies($imap, $uid, $structure);
        $bodyHtml = $bodies['html'];
        if ($bodyHtml !== '') {
            $bodyHtml = mailResolveCidInHtml($imap, $uid, $structure, $bodyHtml);
        }
        $attachments = mailListAttachmentsFromStructure($structure);
        return [
            'uid' => $uid,
            'message_id' => $overview->message_id ?? '',
            'subject' => isset($overview->subject) ? mailDecodeMimeHeader($overview->subject) : '',
            'from' => isset($overview->from) ? mailDecodeMimeHeader($overview->from) : '',
            'to' => isset($overview->to) ? mailDecodeMimeHeader($overview->to) : '',
            'cc' => isset($overview->cc) ? mailDecodeMimeHeader($overview->cc) : '',
            'date' => $overview->date ?? '',
            'body_text' => $bodies['text'],
            'body_html' => $bodyHtml,
            'attachments' => $attachments,
        ];
    } finally {
        mailCloseImap($imap);
    }
}

function mailGetAttachmentContent(array $mailbox, string $folderKey, int $uid, string $part): array
{
    $imap = mailOpenImap($mailbox, $folderKey);
    try {
        $structure = imap_fetchstructure($imap, $uid, FT_UID);
        $attachments = mailListAttachmentsFromStructure($structure);
        $match = null;
        foreach ($attachments as $att) {
            if ($att['part'] === $part) {
                $match = $att;
                break;
            }
        }
        if (!$match) {
            throw new RuntimeException('Pièce jointe introuvable');
        }
        $partStruct = mailFindPartStructure($structure, $part);
        $body = mailDecodePartBody($imap, $uid, $partStruct, $part);
        return [
            'filename' => $match['filename'],
            'mime' => $match['mime'],
            'data' => $body,
        ];
    } finally {
        mailCloseImap($imap);
    }
}

function mailFindPartStructure(?object $structure, string $partNumber): object
{
    if (!$structure) {
        throw new RuntimeException('Structure message invalide');
    }
    $indices = explode('.', $partNumber);
    $current = $structure;
    foreach ($indices as $idx) {
        $i = (int)$idx - 1;
        if (empty($current->parts[$i])) {
            throw new RuntimeException('Partie message introuvable');
        }
        $current = $current->parts[$i];
    }
    return $current;
}

function mailEncodeHeader(string $value): string
{
    if (preg_match('/[^\x20-\x7E]/', $value)) {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }
    return $value;
}

function mailGetMailboxMailSettings(PDO $pdo, int $userId, int $mailboxId): array
{
    mailEnsureTablesExist($pdo);
    if ($mailboxId <= 0 || !mailUserOwnsMailbox($pdo, $userId, $mailboxId)) {
        return [
            'signature_html' => '',
            'signature_enabled' => true,
            'mailbox_id' => $mailboxId,
        ];
    }
    $stmt = $pdo->prepare('SELECT signature_html, signature_enabled FROM user_mail_settings WHERE user_id = ? AND mailbox_id = ?');
    $stmt->execute([$userId, $mailboxId]);
    $row = $stmt->fetch();
    if (!$row) {
        return [
            'signature_html' => '',
            'signature_enabled' => true,
            'mailbox_id' => $mailboxId,
        ];
    }
    return [
        'signature_html' => (string)($row['signature_html'] ?? ''),
        'signature_enabled' => (bool)($row['signature_enabled'] ?? 1),
        'mailbox_id' => $mailboxId,
    ];
}

/** @deprecated Utiliser mailGetMailboxMailSettings */
function mailGetUserMailSettings(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT id FROM user_mailboxes WHERE user_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    $mailboxId = $row ? (int)$row['id'] : 0;
    $settings = mailGetMailboxMailSettings($pdo, $userId, $mailboxId);
    unset($settings['mailbox_id']);
    return $settings;
}

function mailSaveMailboxMailSettings(PDO $pdo, int $userId, int $mailboxId, string $signatureHtml, bool $enabled): void
{
    mailEnsureTablesExist($pdo);
    if (!mailUserOwnsMailbox($pdo, $userId, $mailboxId)) {
        throw new RuntimeException('Boîte mail introuvable');
    }
    $signatureHtml = mailSanitizeSignatureHtml($signatureHtml);
    $signatureHtml = mailPersistSignatureImages($pdo, (int)$userId, $signatureHtml);
    $stmt = $pdo->prepare('INSERT INTO user_mail_settings (user_id, mailbox_id, signature_html, signature_enabled)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE signature_html = VALUES(signature_html), signature_enabled = VALUES(signature_enabled)');
    $stmt->execute([$userId, $mailboxId, $signatureHtml, $enabled ? 1 : 0]);
}

/** @deprecated Utiliser mailSaveMailboxMailSettings */
function mailSaveUserMailSettings(PDO $pdo, int $userId, string $signatureHtml, bool $enabled): void
{
    $stmt = $pdo->prepare('SELECT id FROM user_mailboxes WHERE user_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new RuntimeException('Aucune boîte mail configurée');
    }
    mailSaveMailboxMailSettings($pdo, $userId, (int)$row['id'], $signatureHtml, $enabled);
}

function mailAppBaseUrl(): string
{
    if (defined('MAIL_PUBLIC_BASE_URL') && MAIL_PUBLIC_BASE_URL !== '') {
        return rtrim((string)MAIL_PUBLIC_BASE_URL, '/');
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return '';
    }
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $appRoot = rtrim(dirname(dirname($script)), '/');
    if ($appRoot === '/') {
        $appRoot = '';
    }
    return ($https ? 'https' : 'http') . '://' . $host . $appRoot;
}

function mailSignatureAssetPublicUrl(string $publicId): string
{
    $base = mailAppBaseUrl();
    if ($base === '') {
        return '';
    }
    return $base . '/api/mail_signature_asset.php?id=' . rawurlencode($publicId);
}

function mailSignatureAssetsDir(): string
{
    $dir = __DIR__ . '/uploads/mail_signatures';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function mailStoreSignatureImage(PDO $pdo, int $userId, string $mime, string $data): string
{
    $mime = mailNormalizeImageMime($mime);
    if ($data === '' || strlen($data) > 2 * 1024 * 1024) {
        throw new RuntimeException('Image de signature invalide ou trop volumineuse');
    }
    $publicId = bin2hex(random_bytes(16));
    $ext = mailImageMimeToExtension($mime);
    $dir = mailSignatureAssetsDir();
    $filename = $publicId . '.' . $ext;
    $fullPath = $dir . '/' . $filename;
    if (@file_put_contents($fullPath, $data) === false) {
        throw new RuntimeException('Impossible d\'enregistrer l\'image de signature');
    }
    $relativePath = 'uploads/mail_signatures/' . $filename;
    $stmt = $pdo->prepare('INSERT INTO mail_signature_assets (public_id, user_id, mime, file_path) VALUES (?, ?, ?, ?)');
    $stmt->execute([$publicId, $userId, $mime, $relativePath]);
    $url = mailSignatureAssetPublicUrl($publicId);
    if ($url === '') {
        throw new RuntimeException('URL publique de l\'application introuvable pour la signature');
    }
    return $url;
}

function mailPersistSignatureImages(PDO $pdo, int $userId, string $html): string
{
    if ($html === '' || stripos($html, '<img') === false || stripos($html, 'data:image') === false) {
        return $html;
    }
    $html = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $out = '';
    $pos = 0;
    $len = strlen($html);
    while (($imgStart = stripos($html, '<img', $pos)) !== false) {
        $out .= substr($html, $pos, $imgStart - $pos);
        $tagEnd = strpos($html, '>', $imgStart);
        if ($tagEnd === false) {
            $out .= substr($html, $imgStart);
            break;
        }
        $tag = substr($html, $imgStart, $tagEnd - $imgStart + 1);
        $pos = $tagEnd + 1;
        $src = mailParseImgTagSrc($tag);
        if ($src === null || $src === '' || !preg_match('/^data:image\/([^;]+);base64,(.+)$/is', $src, $dm)) {
            $out .= $tag;
            continue;
        }
        $mime = mailNormalizeImageMime('image/' . strtolower($dm[1]));
        $data = base64_decode(preg_replace('/\s+/', '', $dm[2]) ?? '', true);
        if ($data === false || $data === '') {
            $out .= $tag;
            continue;
        }
        try {
            $url = mailStoreSignatureImage($pdo, $userId, $mime, $data);
            $out .= mailReplaceImgTagSrc($tag, $url);
        } catch (Throwable $e) {
            $out .= $tag;
        }
    }
    $out .= substr($html, $pos);
    return $out;
}

function mailEnsureSignatureHtmlReady(PDO $pdo, int $userId, int $mailboxId, string $html, bool $updateDb = false): string
{
    if ($html === '' || stripos($html, 'data:image') === false) {
        return $html;
    }
    $processed = mailPersistSignatureImages($pdo, $userId, $html);
    if ($updateDb && $processed !== $html && $mailboxId > 0 && mailUserOwnsMailbox($pdo, $userId, $mailboxId)) {
        $stmt = $pdo->prepare('UPDATE user_mail_settings SET signature_html = ? WHERE user_id = ? AND mailbox_id = ?');
        $stmt->execute([$processed, $userId, $mailboxId]);
    }
    return $processed;
}

function mailStripDangerousHtml(string $html): string
{
    $html = trim($html);
    if ($html === '') {
        return '';
    }
    $html = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $html) ?? $html;
    $html = preg_replace('/<iframe\b[^>]*>.*?<\/iframe>/is', '', $html) ?? $html;
    $html = preg_replace('/\s+on\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? $html;
    $html = preg_replace('/javascript:/i', '', $html) ?? $html;
    return $html;
}

function mailSanitizeSignatureHtml(string $html): string
{
    $html = mailStripDangerousHtml($html);
    if ($html === '') {
        return '';
    }
    // MEDIUMTEXT — autoriser les logos en base64 (≈ 500 Ko fichier + marge)
    if (strlen($html) > 4000000) {
        $html = substr($html, 0, 4000000);
    }
    return $html;
}

function mailParseImgTagSrc(string $tag): ?string
{
    if (!preg_match('/\bsrc\s*=\s*(["\'])/i', $tag, $qm, PREG_OFFSET_CAPTURE)) {
        if (preg_match('/\bsrc\s*=\s*([^\s>]+)/i', $tag, $m)) {
            return html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        return null;
    }
    $quote = $qm[1][0];
    $start = (int)$qm[1][1] + 1;
    $end = strpos($tag, $quote, $start);
    if ($end === false) {
        return null;
    }
    return html_entity_decode(substr($tag, $start, $end - $start), ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function mailReplaceImgTagSrc(string $tag, string $newSrc): string
{
    if (!preg_match('/\bsrc\s*=\s*(["\'])/i', $tag, $qm, PREG_OFFSET_CAPTURE)) {
        return $tag;
    }
    $quote = $qm[1][0];
    $start = (int)$qm[1][1] + 1;
    $end = strpos($tag, $quote, $start);
    if ($end === false) {
        return $tag;
    }
    return substr($tag, 0, $start) . $newSrc . substr($tag, $end);
}

function mailStripComposeSignatureBlock(string $html): string
{
    if (stripos($html, 'data-mail-signature') === false) {
        return $html;
    }
    $html = preg_replace('/<div\b[^>]*\bmails-compose-signature-sep\b[^>]*>\s*<\/div>\s*/is', '', $html) ?? $html;

    $pos = stripos($html, 'data-mail-signature');
    if ($pos === false) {
        return $html;
    }
    $divStart = strripos(substr($html, 0, $pos), '<div');
    if ($divStart === false) {
        return $html;
    }

    $len = strlen($html);
    $depth = 0;
    $i = $divStart;
    while ($i < $len) {
        if (!preg_match('/<\/?div\b/i', $html, $m, PREG_OFFSET_CAPTURE, $i)) {
            break;
        }
        $tag = $m[0][0];
        $i = (int)$m[0][1];
        $isClose = ($tag[1] === '/');
        if ($isClose) {
            $depth--;
            if ($depth === 0) {
                $closeEnd = strpos($html, '>', $i);
                if ($closeEnd === false) {
                    break;
                }
                return trim(substr($html, 0, $divStart) . substr($html, $closeEnd + 1));
            }
        } else {
            $depth++;
        }
        $i++;
    }

    return $html;
}

function mailNormalizeImageMime(string $mime): string
{
    $mime = strtolower(trim($mime));
    if ($mime === 'image/jpg' || $mime === 'image/pjpeg') {
        return 'image/jpeg';
    }
    if ($mime === 'image/x-png') {
        return 'image/png';
    }
    return $mime;
}

function mailImageMimeToExtension(string $mime): string
{
    $mime = mailNormalizeImageMime($mime);
    $map = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
        'image/svg+xml' => 'svg',
    ];
    return $map[$mime] ?? 'img';
}

function mailParseSignatureAssetPublicId(string $src): ?string
{
    $src = trim(html_entity_decode($src, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($src === '' || stripos($src, 'mail_signature_asset.php') === false) {
        return null;
    }
    if (!preg_match('/mail_signature_asset\.php[^"\'\s>]*(?:\?|&|;)id=([a-f0-9]{16,})/i', $src, $m)) {
        if (!preg_match('/[?&;]id=([a-f0-9]{16,})/i', $src, $m)) {
            return null;
        }
    }
    $id = strtolower(preg_replace('/[^a-f0-9]/', '', $m[1]));
    return strlen($id) >= 16 ? $id : null;
}

function mailLoadSignatureAssetBinary(string $publicId): ?array
{
    $publicId = preg_replace('/[^a-f0-9]/', '', strtolower($publicId));
    if (strlen($publicId) < 16 || !function_exists('getDB')) {
        return null;
    }
    try {
        $pdo = getDB();
        mailEnsureTablesExist($pdo);
        $stmt = $pdo->prepare('SELECT mime, file_path FROM mail_signature_assets WHERE public_id = ? LIMIT 1');
        $stmt->execute([$publicId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        $relative = str_replace('\\', '/', (string)($row['file_path'] ?? ''));
        if ($relative === '' || strpos($relative, '..') !== false) {
            return null;
        }
        $fullPath = __DIR__ . '/' . ltrim($relative, '/');
        if (!is_file($fullPath) || !is_readable($fullPath)) {
            return null;
        }
        $data = file_get_contents($fullPath);
        if ($data === false || $data === '') {
            return null;
        }
        return [
            'mime' => mailNormalizeImageMime((string)($row['mime'] ?? 'image/png')),
            'data' => $data,
        ];
    } catch (Throwable $e) {
        return null;
    }
}

function mailEmbedInlineImagesInHtml(string $html, int $startIndex = 0): array
{
    $inline = [];
    if (trim($html) === '' || stripos($html, '<img') === false) {
        return ['html' => $html, 'inline' => $inline];
    }

    $html = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $index = $startIndex;
    $out = '';
    $pos = 0;
    $len = strlen($html);

    while (($imgStart = stripos($html, '<img', $pos)) !== false) {
        $out .= substr($html, $pos, $imgStart - $pos);
        $tagEnd = strpos($html, '>', $imgStart);
        if ($tagEnd === false) {
            $out .= substr($html, $imgStart);
            break;
        }
        $tag = substr($html, $imgStart, $tagEnd - $imgStart + 1);
        $pos = $tagEnd + 1;

        $src = mailParseImgTagSrc($tag);
        if ($src === null || $src === '') {
            $out .= $tag;
            continue;
        }

        $assetPublicId = mailParseSignatureAssetPublicId($src);
        if ($assetPublicId) {
            $asset = mailLoadSignatureAssetBinary($assetPublicId);
            if ($asset) {
                $index++;
                $cid = 'sigimg' . $index . '@lcom-gestion';
                $inline[] = ['cid' => $cid, 'mime' => $asset['mime'], 'data' => $asset['data']];
                $out .= mailReplaceImgTagSrc($tag, 'cid:' . $cid);
                continue;
            }
        }

        if (preg_match('/^https?:\/\//i', $src)) {
            $out .= $tag;
            continue;
        }

        $data = null;
        $mime = 'image/png';
        if (preg_match('/^data:image\/([^;]+);base64,(.+)$/is', $src, $dm)) {
            $mime = mailNormalizeImageMime('image/' . strtolower($dm[1]));
            $data = base64_decode(preg_replace('/\s+/', '', $dm[2]) ?? '', true);
        } elseif (preg_match('/^[A-Za-z0-9+\/=\s]{80,}$/', $src)) {
            $data = base64_decode(preg_replace('/\s+/', '', $src) ?? '', true);
        }

        if ($data === false || $data === '' || strlen($data) > 2 * 1024 * 1024) {
            $out .= $tag;
            continue;
        }

        $index++;
        $cid = 'sigimg' . $index . '@lcom-gestion';
        $inline[] = ['cid' => $cid, 'mime' => $mime, 'data' => $data];
        $out .= mailReplaceImgTagSrc($tag, 'cid:' . $cid);
    }
    $out .= substr($html, $pos);

    return ['html' => $out, 'inline' => $inline];
}

function mailAssertHtmlImagesSendable(string $html, string $errorMessage): void
{
    if ($html === '' || stripos($html, '<img') === false) {
        return;
    }
    $html = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $pos = 0;
    while (($imgStart = stripos($html, '<img', $pos)) !== false) {
        $tagEnd = strpos($html, '>', $imgStart);
        if ($tagEnd === false) {
            break;
        }
        $tag = substr($html, $imgStart, $tagEnd - $imgStart + 1);
        $pos = $tagEnd + 1;
        $src = mailParseImgTagSrc($tag);
        if ($src === null || trim($src) === '') {
            throw new RuntimeException($errorMessage);
        }
        if (preg_match('/^https?:\/\//i', $src) || preg_match('/^cid:/i', $src)) {
            continue;
        }
        if (stripos($src, 'mail_signature_asset.php') !== false) {
            throw new RuntimeException($errorMessage);
        }
        if (preg_match('/^data:image\//i', $src) || preg_match('/^blob:/i', $src)) {
            throw new RuntimeException($errorMessage);
        }
    }
}

function mailMergeBodyWithSignature(string $bodyText, string $signatureHtml, bool $enabled): array
{
    $bodyText = rtrim($bodyText);
    $bodyHtml = $bodyText !== ''
        ? '<div style="font-family:Segoe UI,Roboto,sans-serif;white-space:pre-wrap;">' . htmlspecialchars($bodyText, ENT_QUOTES, 'UTF-8') . '</div>'
        : '';
    $inline = [];

    if ($enabled && trim($signatureHtml) !== '') {
        $sig = mailStripDangerousHtml($signatureHtml);
        $embedded = mailEmbedInlineImagesInHtml($sig);
        $sigHtml = $embedded['html'];
        $inline = $embedded['inline'];
        mailAssertHtmlImagesSendable(
            $sigHtml,
            'La signature contient une image invalide. Rouvrez les paramètres mails et réinsérez votre logo.'
        );
        $wrapper = '<div style="font-family:Segoe UI,Roboto,sans-serif;font-size:14px;color:#202124;">' . $sigHtml . '</div>';
        if ($bodyHtml !== '') {
            $bodyHtml .= '<br><br><div style="border-top:1px solid #e0e0e0;margin-top:12px;padding-top:10px;">' . $wrapper . '</div>';
        } else {
            $bodyHtml = $wrapper;
        }
        $sigText = trim(preg_replace('/\s+/', ' ', strip_tags($sigHtml)) ?? '');
        if ($bodyText !== '' && $sigText !== '') {
            $bodyText .= "\n\n--\n" . $sigText;
        } elseif ($sigText !== '') {
            $bodyText = $sigText;
        }
    }

    return [
        'body_text' => $bodyText,
        'body_html' => $bodyHtml,
        'inline_images' => $inline,
    ];
}

function mailBuildMimeMessage(array $mailbox, array $opts): string
{
    $from = $mailbox['email'];
    $fromName = $mailbox['label'] ?: $from;
    $boundary = '=_Lcom_' . bin2hex(random_bytes(8));
    $altBoundary = '=_Lcom_alt_' . bin2hex(random_bytes(8));
    $headers = [];
    $headers[] = 'From: ' . mailEncodeHeader($fromName) . ' <' . $from . '>';
    $toEmails = $opts['to_emails'] ?? mailParseAddressList((string)($opts['to'] ?? ''));
    $ccEmails = $opts['cc_emails'] ?? mailParseAddressList((string)($opts['cc'] ?? ''));
    $bccEmails = $opts['bcc_emails'] ?? mailParseAddressList((string)($opts['bcc'] ?? ''));
    if ($toEmails) {
        $headers[] = 'To: ' . mailFormatRecipientHeader($toEmails);
    }
    if ($ccEmails) {
        $headers[] = 'Cc: ' . mailFormatRecipientHeader($ccEmails);
    }
    if ($bccEmails) {
        $headers[] = 'Bcc: ' . mailFormatRecipientHeader($bccEmails);
    }
    $headers[] = 'Subject: ' . mailEncodeHeader($opts['subject']);
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Date: ' . date('r');
    $headers[] = 'Message-ID: <' . bin2hex(random_bytes(16)) . '@lcom-gestion.local>';

    if (!empty($opts['in_reply_to'])) {
        $headers[] = 'In-Reply-To: ' . $opts['in_reply_to'];
        $headers[] = 'References: ' . $opts['in_reply_to'];
    }

    $bodyText = $opts['body_text'] ?? '';
    $bodyHtml = $opts['body_html'] ?? '';
    if ($bodyHtml === '' && $bodyText !== '') {
        $bodyHtml = '<pre style="font-family:inherit;white-space:pre-wrap;">' . htmlspecialchars($bodyText, ENT_QUOTES, 'UTF-8') . '</pre>';
    }
    if ($bodyText === '' && $bodyHtml !== '') {
        $bodyText = strip_tags($bodyHtml);
    }

    $attachments = $opts['attachments'] ?? [];
    $inlineImages = $opts['inline_images'] ?? [];
    $hasAttachments = count($attachments) > 0;
    $hasInline = count($inlineImages) > 0;

    $buildAltPart = static function (string $altBoundary) use ($bodyText, $bodyHtml): string {
        $part = "--{$altBoundary}\r\n";
        $part .= "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
        $part .= chunk_split(base64_encode($bodyText)) . "\r\n";
        $part .= "--{$altBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
        $part .= chunk_split(base64_encode($bodyHtml)) . "\r\n";
        $part .= "--{$altBoundary}--\r\n";
        return $part;
    };

    $buildInlineParts = static function (array $inlineImages, string $relatedBoundary): string {
        $chunk = '';
        $i = 0;
        foreach ($inlineImages as $img) {
            $cid = $img['cid'] ?? '';
            $mime = mailNormalizeImageMime($img['mime'] ?? 'image/png');
            $data = $img['data'] ?? '';
            if ($cid === '' || $data === '') {
                continue;
            }
            $i++;
            $filename = 'signature-' . $i . '.' . mailImageMimeToExtension($mime);
            $chunk .= "--{$relatedBoundary}\r\n";
            $chunk .= "Content-Type: {$mime}; name=\"{$filename}\"\r\n";
            $chunk .= "Content-Transfer-Encoding: base64\r\n";
            $chunk .= "Content-Disposition: inline\r\n";
            $chunk .= 'Content-ID: <' . $cid . ">\r\n";
            $chunk .= 'X-Attachment-Id: ' . $cid . "\r\n\r\n";
            $chunk .= chunk_split(base64_encode($data)) . "\r\n";
        }
        return $chunk;
    };

    if ($hasInline && !$hasAttachments) {
        $relatedBoundary = '=_Lcom_rel_' . bin2hex(random_bytes(6));
        $altBoundary = '=_Lcom_alt_' . bin2hex(random_bytes(6));
        $headers[] = 'Content-Type: multipart/related; boundary="' . $relatedBoundary . '"';
        $body = "--{$relatedBoundary}\r\n";
        $body .= "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"\r\n\r\n";
        $body .= $buildAltPart($altBoundary);
        $body .= $buildInlineParts($inlineImages, $relatedBoundary);
        $body .= "--{$relatedBoundary}--";
        return implode("\r\n", $headers) . "\r\n\r\n" . $body;
    }

    if ($hasInline || $hasAttachments) {
        $mixedBoundary = '=_Lcom_mix_' . bin2hex(random_bytes(6));
        $relatedBoundary = '=_Lcom_rel_' . bin2hex(random_bytes(6));
        $altBoundary = '=_Lcom_alt_' . bin2hex(random_bytes(6));
        $headers[] = 'Content-Type: multipart/mixed; boundary="' . $mixedBoundary . '"';
        $body = '';

        if ($hasInline) {
            $body .= "--{$mixedBoundary}\r\n";
            $body .= 'Content-Type: multipart/related; boundary="' . $relatedBoundary . '"' . "\r\n\r\n";
            $body .= "--{$relatedBoundary}\r\n";
            $body .= "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"\r\n\r\n";
            $body .= $buildAltPart($altBoundary);
            $body .= $buildInlineParts($inlineImages, $relatedBoundary);
            $body .= "--{$relatedBoundary}--\r\n";
        } else {
            $body .= "--{$mixedBoundary}\r\n";
            $body .= "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"\r\n\r\n";
            $body .= $buildAltPart($altBoundary);
        }

        foreach ($attachments as $att) {
            $filename = $att['filename'] ?? 'fichier';
            $mime = $att['mime'] ?? 'application/octet-stream';
            $data = $att['data'] ?? '';
            $body .= "--{$mixedBoundary}\r\n";
            $body .= 'Content-Type: ' . $mime . '; name="' . $filename . "\"\r\n";
            $body .= "Content-Transfer-Encoding: base64\r\n";
            $body .= 'Content-Disposition: attachment; filename="' . $filename . "\"\r\n\r\n";
            $body .= chunk_split(base64_encode($data)) . "\r\n";
        }
        $body .= "--{$mixedBoundary}--";
        return implode("\r\n", $headers) . "\r\n\r\n" . $body;
    }

    $altBoundary = '=_Lcom_alt_' . bin2hex(random_bytes(8));
    $headers[] = 'Content-Type: multipart/alternative; boundary="' . $altBoundary . '"';
    $body = rtrim($buildAltPart($altBoundary));

    return implode("\r\n", $headers) . "\r\n\r\n" . $body;
}

function mailOvhSmtpHosts(string $configuredHost): array
{
    return mailOvhImapHosts($configuredHost);
}

function mailSmtpConnectionAttempts(array $mailbox): array
{
    $mailbox = mailNormalizeMailboxCredentials($mailbox);
    $configuredSmtp = trim($mailbox['smtp_host'] ?? '') ?: 'ssl0.ovh.net';
    $configuredImap = trim($mailbox['imap_host'] ?? '') ?: 'ssl0.ovh.net';
    $port = (int)($mailbox['smtp_port'] ?: 465);
    $enc = strtolower(trim($mailbox['smtp_encryption'] ?? 'ssl') ?: 'ssl');

    $hosts = [];
    foreach ([$configuredSmtp, $configuredImap] as $host) {
        $host = trim($host);
        if ($host !== '' && !in_array($host, $hosts, true)) {
            $hosts[] = $host;
        }
    }
    foreach (mailOvhSmtpHosts($configuredSmtp) as $host) {
        if (!in_array($host, $hosts, true)) {
            $hosts[] = $host;
        }
    }

    $attempts = [];
    foreach ($hosts as $host) {
        if (mailIsExchangeHost($host)) {
            continue;
        }
        $attempts[] = ['host' => $host, 'port' => $port, 'encryption' => $enc];
        if ($enc === 'ssl' && $port === 465) {
            $attempts[] = ['host' => $host, 'port' => 587, 'encryption' => 'tls'];
        }
    }
    return $attempts;
}

function mailResolveSmtpHost(array $mailbox): string
{
    $smtp = trim($mailbox['smtp_host'] ?? '') ?: 'ssl0.ovh.net';
    $imap = trim($mailbox['imap_host'] ?? '');
    if ($smtp === 'ssl0.ovh.net' && preg_match('/^pro[12]\.mail\.ovh\.net$/i', $imap)) {
        return $imap;
    }
    return $smtp;
}

/** Une seule tentative SMTP pour l'envoi — évite TLS/SSL et multi-hôtes qui fausent le quota OVH. */
function mailSmtpConnectionAttemptsForDelivery(array $mailbox): array
{
    $mailbox = mailNormalizeMailboxCredentials($mailbox);
    $host = mailResolveSmtpHost($mailbox);
    $port = (int)($mailbox['smtp_port'] ?: 465);
    $enc = strtolower(trim($mailbox['smtp_encryption'] ?? 'ssl') ?: 'ssl');
    if ($enc !== 'ssl' && $enc !== 'tls') {
        $enc = ($port === 587) ? 'tls' : 'ssl';
    }
    return [['host' => $host, 'port' => $port, 'encryption' => $enc]];
}

function mailSmtpDotStuff(string $data): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $data);
    $lines = explode("\n", $normalized);
    $out = [];
    foreach ($lines as $line) {
        if ($line !== '' && $line[0] === '.') {
            $line = '.' . $line;
        }
        $out[] = $line;
    }
    return implode("\r\n", $out);
}

function mailSmtpRead($fp): string
{
    $data = '';
    while ($line = fgets($fp, 8192)) {
        $data .= $line;
        if (isset($line[3]) && $line[3] === ' ') {
            break;
        }
    }
    if ($data === '' && feof($fp)) {
        throw new RuntimeException('Connexion SMTP fermée de façon inattendue');
    }
    return $data;
}

function mailSmtpExpect($fp, array $codes): void
{
    $resp = mailSmtpRead($fp);
    $code = (int)substr($resp, 0, 3);
    if (!in_array($code, $codes, true)) {
        throw new RuntimeException(mailFormatSmtpError(trim($resp)));
    }
}

/** Message utilisateur pour les erreurs SMTP courantes (OVH, etc.) */
function mailFormatSmtpError(string $raw): string
{
    $lower = strtolower($raw);
    if (strpos($lower, 'quota exceeded') !== false
        || strpos($lower, 'too many mails') !== false
        || strpos($lower, 'limit of 200 messages') !== false) {
        if (preg_match('/for\s+([^\s:]+)/i', $raw, $m)) {
            $account = $m[1];
            return "Quota d'envoi OVH dépassé pour {$account} : maximum 200 e-mails par heure (chaque destinataire To/Cc/Cci compte pour 1). Si vous n'avez pas envoyé depuis l'application, vérifiez téléphone, Outlook ou webmail, puis contactez le support OVH.";
        }
        return "Quota d'envoi OVH dépassé : maximum 200 e-mails par heure (chaque destinataire compte pour 1). L'application n'envoie rien automatiquement — vérifiez les autres appareils utilisant cette adresse.";
    }
    return 'Erreur SMTP : ' . $raw;
}

/** Code HTTP adapté à une exception d'envoi mail */
function mailSendHttpStatus(Throwable $e): int
{
    $msg = strtolower($e->getMessage());
    if (strpos($msg, 'quota d\'envoi ovh') !== false || strpos($msg, 'quota exceeded') !== false) {
        return 429;
    }
    return 500;
}

function mailCountRecipients(string $to, string $cc = '', string $bcc = ''): int
{
    return count(mailResolveSendRecipients($to, $cc, $bcc));
}

function mailLogSend(
    PDO $pdo,
    int $userId,
    int $mailboxId,
    string $fromEmail,
    string $to,
    string $subject,
    int $recipientCount,
    bool $success,
    ?string $error = null,
    array $meta = []
): void {
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO mail_send_log (user_id, mailbox_id, from_email, recipient_count, to_preview, subject, success, error_message, recipients_json, smtp_host_used, smtp_port_used, smtp_encryption_used)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $mailboxId,
            $fromEmail,
            max(1, $recipientCount),
            mb_substr($to, 0, 500),
            mb_substr($subject, 0, 500),
            $success ? 1 : 0,
            $error,
            $meta['recipients_json'] ?? null,
            $meta['smtp_host_used'] ?? '',
            (int)($meta['smtp_port_used'] ?? 0),
            $meta['smtp_encryption_used'] ?? '',
        ]);
    } catch (Throwable $e) {
        // Ne pas bloquer l'envoi si le journal échoue
    }
}

function mailGetSendLogStats(PDO $pdo, int $mailboxId): array
{
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(recipient_count), 0) AS recipients
         FROM mail_send_log
         WHERE mailbox_id = ? AND success = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)"
    );
    $stmt->execute([$mailboxId]);
    $hour = $stmt->fetch() ?: ['cnt' => 0, 'recipients' => 0];

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(recipient_count), 0) AS recipients
         FROM mail_send_log
         WHERE mailbox_id = ? AND success = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    $stmt->execute([$mailboxId]);
    $day = $stmt->fetch() ?: ['cnt' => 0, 'recipients' => 0];

    $stmt = $pdo->prepare(
        "SELECT created_at, recipient_count, to_preview, subject, success, error_message, recipients_json, smtp_host_used, smtp_port_used, smtp_encryption_used
         FROM mail_send_log
         WHERE mailbox_id = ?
         ORDER BY id DESC
         LIMIT 15"
    );
    $stmt->execute([$mailboxId]);
    $recent = $stmt->fetchAll() ?: [];

    return [
        'last_hour' => [
            'sends' => (int)$hour['cnt'],
            'recipients' => (int)$hour['recipients'],
        ],
        'last_24h' => [
            'sends' => (int)$day['cnt'],
            'recipients' => (int)$day['recipients'],
        ],
        'recent' => $recent,
    ];
}

function mailSmtpConnectAndAuth(array $mailbox, bool $forDelivery = false): array
{
    $mailbox = mailNormalizeMailboxCredentials($mailbox);
    $user = $mailbox['username'];
    $pass = $mailbox['password'] ?? '';
    $lastErr = '';
    $attempts = $forDelivery
        ? mailSmtpConnectionAttemptsForDelivery($mailbox)
        : mailSmtpConnectionAttempts($mailbox);

    foreach ($attempts as $attempt) {
        $host = $attempt['host'];
        $port = (int)$attempt['port'];
        $enc = $attempt['encryption'];
        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $fp = @stream_socket_client($remote, $errno, $errstr, 30, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) {
            $lastErr = "Connexion SMTP impossible ($host:$port) : $errstr ($errno)";
            continue;
        }
        stream_set_timeout($fp, 30);

        try {
            mailSmtpExpect($fp, [220]);
            $ehloHost = 'lcom-gestion.local';
            fwrite($fp, "EHLO {$ehloHost}\r\n");
            mailSmtpExpect($fp, [250]);

            if ($enc === 'tls') {
                fwrite($fp, "STARTTLS\r\n");
                mailSmtpExpect($fp, [220]);
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new RuntimeException('Échec STARTTLS SMTP');
                }
                fwrite($fp, "EHLO {$ehloHost}\r\n");
                mailSmtpExpect($fp, [250]);
            }

            fwrite($fp, "AUTH LOGIN\r\n");
            mailSmtpExpect($fp, [334]);
            fwrite($fp, base64_encode($user) . "\r\n");
            mailSmtpExpect($fp, [334]);
            fwrite($fp, base64_encode($pass) . "\r\n");
            mailSmtpExpect($fp, [235]);

            $mailbox['smtp_host'] = $host;
            $mailbox['smtp_port'] = $port;
            $mailbox['smtp_encryption'] = $enc;
            $GLOBALS['mail_last_smtp_host'] = $host . ':' . $port . '/' . $enc;
            return [$fp, $mailbox];
        } catch (RuntimeException $e) {
            $lastErr = $e->getMessage();
            fclose($fp);
        }
    }

    throw new RuntimeException($lastErr ?: 'Connexion SMTP impossible');
}

function mailTestSmtp(array $mailbox): array
{
    try {
        [$fp, $mailbox] = mailSmtpConnectAndAuth($mailbox, true);
        fwrite($fp, "QUIT\r\n");
        fclose($fp);
        return [
            'success' => true,
            'email' => $mailbox['email'],
            'smtp_host' => $mailbox['smtp_host'] ?: mailResolveSmtpHost($mailbox),
            'smtp_port' => (int)($mailbox['smtp_port'] ?: 465),
            'smtp_encryption' => $mailbox['smtp_encryption'] ?: 'ssl',
            'message' => 'Connexion SMTP OK (authentification uniquement, aucun mail envoyé)',
        ];
    } catch (RuntimeException $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

function mailSendViaSmtp(array $mailbox, string $mimeMessage, array $recipients): void
{
    [$fp, $mailbox] = mailSmtpConnectAndAuth($mailbox, true);
    $from = $mailbox['email'];

    fwrite($fp, "MAIL FROM:<{$from}>\r\n");
    mailSmtpExpect($fp, [250]);

    $accepted = 0;
    foreach ($recipients as $rcpt) {
        $rcpt = trim($rcpt);
        if ($rcpt === '') {
            continue;
        }
        fwrite($fp, "RCPT TO:<{$rcpt}>\r\n");
        mailSmtpExpect($fp, [250, 251]);
        $accepted++;
    }
    if ($accepted === 0) {
        fwrite($fp, "QUIT\r\n");
        fclose($fp);
        throw new RuntimeException('Aucun destinataire accepté par le serveur SMTP');
    }

    fwrite($fp, "DATA\r\n");
    mailSmtpExpect($fp, [354]);
    fwrite($fp, mailSmtpDotStuff($mimeMessage) . "\r\n.\r\n");
    mailSmtpExpect($fp, [250]);
    fwrite($fp, "QUIT\r\n");
    fclose($fp);

    $GLOBALS['mail_last_smtp_delivery'] = [
        'host' => $mailbox['smtp_host'] ?? '',
        'port' => (int)($mailbox['smtp_port'] ?? 0),
        'encryption' => $mailbox['smtp_encryption'] ?? '',
        'recipients' => array_values($recipients),
        'rcpt_count' => $accepted,
    ];
}

function mailAppendToSentFolder(array $mailbox, string $mimeMessage): void
{
    mailAppendToFolder($mailbox, 'Sent', $mimeMessage, '\\Seen');
}

function mailAppendToFolder(array $mailbox, string $folderKey, string $mimeMessage, string $flags = '\\Seen'): void
{
    $imap = null;
    try {
        $imap = mailOpenImap($mailbox, $folderKey);
        $check = @imap_check($imap);
        $mbox = $check->Mailbox ?? '';
        if ($mbox === '') {
            throw new RuntimeException('Dossier inaccessible : ' . $folderKey);
        }
        if (!@imap_append($imap, $mbox, $mimeMessage, $flags)) {
            $errs = imap_errors();
            $err = $errs ? implode('; ', $errs) : (imap_last_error() ?: 'imap_append');
            throw new RuntimeException('Impossible d\'enregistrer dans ' . $folderKey . ' : ' . $err);
        }
    } finally {
        if ($imap) {
            mailCloseImap($imap);
        }
    }
}

function mailGetLatestFolderUid(array $mailbox, string $folderKey): ?int
{
    $imap = mailOpenImap($mailbox, $folderKey);
    try {
        $uids = @imap_sort($imap, SORTDATE, 1, SE_UID);
        if (!$uids || !is_array($uids) || count($uids) === 0) {
            return null;
        }
        return (int)$uids[0];
    } finally {
        mailCloseImap($imap);
    }
}

function mailDeleteMessagesFromFolder(array $mailbox, string $folderKey, array $uids): int
{
    $uids = array_values(array_unique(array_filter(array_map('intval', $uids), static function (int $uid): bool {
        return $uid > 0;
    })));
    if (!$uids) {
        return 0;
    }

    $imap = mailOpenImap($mailbox, $folderKey);
    $deleted = 0;
    try {
        foreach ($uids as $uid) {
            if (!@imap_delete($imap, (string)$uid, CP_UID)) {
                $errs = imap_errors();
                $err = $errs ? implode('; ', $errs) : (imap_last_error() ?: 'imap_delete');
                throw new RuntimeException('Impossible de supprimer le message : ' . $err);
            }
            $deleted++;
        }
        @imap_expunge($imap);
    } finally {
        mailCloseImap($imap);
    }

    return $deleted;
}

function mailPrepareComposeHtmlBody(string $bodyHtml, string $bodyText = '', array $mailSettings = []): array
{
    $html = mailStripDangerousHtml($bodyHtml);
    $userHtml = mailStripComposeSignatureBlock($html);
    $inline = [];
    $parts = [];

    if (trim($userHtml) !== '') {
        $embeddedUser = mailEmbedInlineImagesInHtml($userHtml);
        mailAssertHtmlImagesSendable(
            $embeddedUser['html'],
            'Le message contient une image invalide. Réinsérez votre logo depuis les paramètres mails.'
        );
        $inline = $embeddedUser['inline'];
        $parts[] = $embeddedUser['html'];
    }

    $sigEnabled = !empty($mailSettings['signature_enabled']);
    $sigRaw = trim((string)($mailSettings['signature_html'] ?? ''));
    $sigText = '';

    if ($sigEnabled && $sigRaw !== '') {
        $sig = mailStripDangerousHtml($sigRaw);
        $embeddedSig = mailEmbedInlineImagesInHtml($sig, count($inline));
        mailAssertHtmlImagesSendable(
            $embeddedSig['html'],
            'La signature contient une image invalide. Rouvrez les paramètres mails et réinsérez votre logo.'
        );
        $inline = array_merge($inline, $embeddedSig['inline']);
        $sigWrapper = '<div style="font-family:Segoe UI,Roboto,sans-serif;font-size:14px;color:#202124;">' . $embeddedSig['html'] . '</div>';
        if (count($parts) > 0) {
            $parts[] = '<br><br><div style="border-top:1px solid #e0e0e0;margin-top:12px;padding-top:10px;">' . $sigWrapper . '</div>';
        } else {
            $parts[] = $sigWrapper;
        }
        $sigText = trim(preg_replace('/\s+/', ' ', strip_tags($embeddedSig['html'])) ?? '');
    }

    if (count($parts) === 0) {
        return [
            'body_text' => $bodyText,
            'body_html' => '',
            'inline_images' => [],
        ];
    }

    $combinedHtml = implode('', $parts);
    $bodyHtmlOut = '<div style="font-family:Segoe UI,Roboto,sans-serif;font-size:14px;color:#202124;">' . $combinedHtml . '</div>';

    $plain = trim($bodyText);
    if ($plain !== '' && $sigText !== '') {
        $plain .= "\n\n--\n" . $sigText;
    } elseif ($plain === '' && $sigText !== '') {
        $plain = $sigText;
    } elseif ($plain === '') {
        $plain = trim(preg_replace('/\s+/', ' ', strip_tags(str_replace(
            ['<br>', '<br/>', '<br />', '</div>', '</p>', '</li>'],
            "\n",
            $combinedHtml
        ) ?? '')) ?? '');
    }

    return [
        'body_text' => $plain,
        'body_html' => $bodyHtmlOut,
        'inline_images' => $inline,
    ];
}

function mailSaveDraft(array $mailbox, array $opts): array
{
    $to = trim($opts['to'] ?? '');
    $cc = trim($opts['cc'] ?? '');
    $bcc = trim($opts['bcc'] ?? '');
    $subject = trim($opts['subject'] ?? '');
    $bodyHtml = trim($opts['body_html'] ?? '');
    $body = trim($opts['body_text'] ?? $opts['body'] ?? '');
    $attachments = $opts['attachments'] ?? [];
    $replaceUid = (int)($opts['replace_uid'] ?? 0);

    if ($to === '' && $cc === '' && $bcc === '' && $body === '' && $bodyHtml === '' && $subject === '' && count($attachments) === 0) {
        throw new RuntimeException('Rien à enregistrer dans le brouillon');
    }

    if ($bodyHtml !== '') {
        $mailSettings = $opts['mail_settings'] ?? ['signature_html' => '', 'signature_enabled' => false];
        $prepared = mailPrepareComposeHtmlBody($bodyHtml, $body, is_array($mailSettings) ? $mailSettings : []);
        $body = $prepared['body_text'];
        $bodyHtml = $prepared['body_html'];
        $inlineImages = $prepared['inline_images'];
    } else {
        $bodyHtml = $body !== ''
            ? '<pre style="font-family:inherit;white-space:pre-wrap;">' . htmlspecialchars($body, ENT_QUOTES, 'UTF-8') . '</pre>'
            : '';
        $inlineImages = [];
    }

    $mime = mailBuildMimeMessage($mailbox, [
        'to' => $to,
        'cc' => $cc,
        'bcc' => $bcc,
        'subject' => $subject !== '' ? $subject : '(sans objet)',
        'body_text' => $body,
        'body_html' => $bodyHtml,
        'inline_images' => $inlineImages,
        'attachments' => $attachments,
        'in_reply_to' => trim($opts['in_reply_to'] ?? ''),
    ]);

    if ($replaceUid > 0) {
        mailDeleteMessagesFromFolder($mailbox, 'Drafts', [$replaceUid]);
    }

    mailAppendToFolder($mailbox, 'Drafts', $mime, '\\Draft \\Seen');
    $draftUid = mailGetLatestFolderUid($mailbox, 'Drafts');

    return [
        'success' => true,
        'draft_uid' => $draftUid,
    ];
}

function mailIsDeliverableRecipientEmail(string $email): bool
{
    $email = strtolower(trim($email));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    $domain = substr(strrchr($email, '@') ?: '', 1);
    if ($domain === '') {
        return false;
    }
    $blocked = ['lcom-gestion', 'lcom-gestion.local', 'localhost'];
    if (in_array($domain, $blocked, true) || str_ends_with($domain, '.local')) {
        return false;
    }
    return true;
}

/** Limite stricte : chaque destinataire distinct = 1 unité quota OVH. */
function mailMaxSendRecipients(): int
{
    return 50;
}

function mailSanitizeAddressFieldInput(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') {
        return '';
    }
    if (strlen($raw) > 4000) {
        throw new RuntimeException('Champ destinataire trop long (max 4000 caractères).');
    }
    if (preg_match('/<[a-z][^>]*>/i', $raw) && !preg_match('/<[^@\s>]+@[^>]+>/', $raw)) {
        throw new RuntimeException('Le champ destinataire semble contenir du HTML. Saisissez uniquement des adresses e-mail.');
    }
    return $raw;
}

function mailParseAddressList(string $raw): array
{
    $raw = mailSanitizeAddressFieldInput($raw);
    if ($raw === '') {
        return [];
    }

    $max = mailMaxSendRecipients();
    $emails = [];
    $add = static function (string $candidate) use (&$emails, $max): void {
        if (count($emails) >= $max) {
            return;
        }
        $candidate = strtolower(trim($candidate, " \t\n\r\0\x0B<>\"'"));
        if (mailIsDeliverableRecipientEmail($candidate)) {
            $emails[] = $candidate;
        }
    };

    foreach (mailExtractEmailsFromAddressHeader($raw) as $item) {
        $add((string)($item['email'] ?? ''));
    }

    if (!$emails) {
        foreach (preg_split('/[;,]+/', $raw) as $part) {
            if (count($emails) >= $max) {
                break;
            }
            $part = trim($part);
            if ($part === '') {
                continue;
            }
            if (preg_match('/<([^>]+)>/', $part, $m)) {
                $add($m[1]);
            } else {
                $add($part);
            }
        }
    }

    $unique = array_values(array_unique($emails));
    if (count($unique) > $max) {
        throw new RuntimeException('Trop de destinataires dans un champ (max ' . $max . ').');
    }
    return $unique;
}

function mailResolveSendRecipients(string $to, string $cc = '', string $bcc = ''): array
{
    $recipients = mailParseAddressList($to);
    if ($cc !== '') {
        $recipients = array_merge($recipients, mailParseAddressList($cc));
    }
    if ($bcc !== '') {
        $recipients = array_merge($recipients, mailParseAddressList($bcc));
    }
    $recipients = array_values(array_unique($recipients));
    $max = mailMaxSendRecipients();
    if (count($recipients) > $max) {
        throw new RuntimeException(
            'Ce message compte ' . count($recipients) . ' destinataire(s) distinct(s). Maximum ' . $max . ' par envoi (chaque destinataire = 1 unité quota OVH).'
        );
    }
    return $recipients;
}

function mailFormatRecipientHeader(array $emails): string
{
    return implode(', ', $emails);
}

function mailSendMessage(array $mailbox, array $opts): array
{
    $to = trim($opts['to'] ?? '');
    if ($to === '') {
        throw new RuntimeException('Destinataire requis');
    }
    $cc = trim($opts['cc'] ?? '');
    $bcc = trim($opts['bcc'] ?? '');
    $toEmails = mailParseAddressList($to);
    $ccEmails = $cc !== '' ? mailParseAddressList($cc) : [];
    $bccEmails = $bcc !== '' ? mailParseAddressList($bcc) : [];
    $recipients = array_values(array_unique(array_merge($toEmails, $ccEmails, $bccEmails)));
    if (count($recipients) === 0) {
        throw new RuntimeException('Adresse destinataire invalide. Utilisez le format email@domaine.com');
    }

    $mime = mailBuildMimeMessage($mailbox, array_merge($opts, [
        'to_emails' => $toEmails,
        'cc_emails' => $ccEmails,
        'bcc_emails' => $bccEmails,
    ]));
    mailSendViaSmtp($mailbox, $mime, $recipients);

    $appendWarning = null;
    try {
        mailAppendToSentFolder($mailbox, $mime);
    } catch (Throwable $e) {
        $appendWarning = $e->getMessage();
        error_log('mailAppendToSentFolder: ' . $appendWarning);
    }

    $delivery = $GLOBALS['mail_last_smtp_delivery'] ?? [];

    return [
        'success' => true,
        'recipients' => count($recipients),
        'recipients_list' => $recipients,
        'smtp_host' => $GLOBALS['mail_last_smtp_host'] ?? null,
        'smtp_delivery' => $delivery,
        'append_warning' => $appendWarning,
    ];
}

function mailMarkUnread(array $mailbox, string $folderKey, int $uid): void
{
    $imap = mailOpenImap($mailbox, $folderKey);
    try {
        if (!@imap_clearflag_full($imap, (string)$uid, '\\Seen', ST_UID)) {
            throw new RuntimeException('Impossible de marquer comme non lu');
        }
    } finally {
        mailCloseImap($imap);
    }
}

function mailMoveMessage(array $mailbox, string $sourceFolderKey, int $uid, string $targetFolderKey): void
{
    if ($uid <= 0) {
        throw new RuntimeException('Message introuvable');
    }
    $sourceFolderKey = $sourceFolderKey ?: 'INBOX';
    $targetFolderKey = $targetFolderKey ?: 'Trash';
    if ($sourceFolderKey === $targetFolderKey) {
        return;
    }

    $imap = mailOpenImap($mailbox, $sourceFolderKey);
    try {
        $ref = $GLOBALS['mail_last_imap_ref'] ?? mailBuildImapMailboxString($mailbox);
        $targetFull = mailResolveFolder($imap, $ref, $targetFolderKey);
        $targetShort = mailImapMailboxMoveName($targetFull, $ref);

        $moved = @imap_mail_move($imap, (string)$uid, $targetShort, CP_UID);
        if (!$moved && $targetShort !== $targetFull) {
            mailClearImapErrors();
            $moved = @imap_mail_move($imap, (string)$uid, $targetFull, CP_UID);
        }
        if (!$moved) {
            mailClearImapErrors();
            $copied = @imap_mail_copy($imap, (string)$uid, $targetShort, CP_UID);
            if (!$copied && $targetShort !== $targetFull) {
                mailClearImapErrors();
                $copied = @imap_mail_copy($imap, (string)$uid, $targetFull, CP_UID);
            }
            if ($copied) {
                @imap_delete($imap, (string)$uid, CP_UID);
                @imap_expunge($imap);
                return;
            }
            $errs = imap_errors();
            $err = $errs ? implode('; ', $errs) : (imap_last_error() ?: 'imap_mail_move');
            throw new RuntimeException('Impossible de déplacer le message : ' . $err);
        }
        @imap_expunge($imap);
    } finally {
        mailCloseImap($imap);
    }
}

function mailDeleteMessagesPermanently(array $mailbox, string $folderKey, array $uids): int
{
    if ($folderKey !== 'Trash') {
        throw new RuntimeException('La suppression définitive n\'est possible que depuis la corbeille');
    }
    $uids = array_values(array_unique(array_filter(array_map('intval', $uids), static function (int $uid): bool {
        return $uid > 0;
    })));
    if (!$uids) {
        throw new RuntimeException('Aucun message sélectionné');
    }

    return mailDeleteMessagesFromFolder($mailbox, $folderKey, $uids);
}

function mailTestConnection(array $mailbox): array
{
    try {
        $mailbox = mailNormalizeMailboxCredentials($mailbox);
        $imap = mailOpenImap($mailbox, 'INBOX');
        try {
            $check = @imap_check($imap);
            if (!$check) {
                $errs = imap_errors();
                $err = $errs ? implode('; ', $errs) : (imap_last_error() ?: 'imap_check');
                throw new RuntimeException(mailFormatImapError($err, $mailbox));
            }
            $parsed = mailParseImapRef($GLOBALS['mail_last_imap_ref'] ?? '');
            $usedHost = $parsed['host'] ?? ($mailbox['imap_host'] ?? 'ssl0.ovh.net');
            $configuredHost = $mailbox['imap_host'] ?? 'ssl0.ovh.net';
            return [
                'success' => true,
                'mailbox' => $check->Mailbox ?? '',
                'messages' => (int)($check->Nmsgs ?? 0),
                'username' => $mailbox['username'],
                'host' => $configuredHost,
                'imap_host_used' => $usedHost,
                'imap_port_used' => $parsed['port'] ?? (int)($mailbox['imap_port'] ?? 993),
                'hint_update_host' => $usedHost !== $configuredHost,
            ];
        } finally {
            mailCloseImap($imap);
        }
    } catch (RuntimeException $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

function mailRequireAdmin(PDO $pdo, int $userId): void
{
    $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user || $user['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Accès réservé aux administrateurs']);
        exit;
    }
}

function mailExtractEmailsFromAddressHeader(string $raw): array
{
    $raw = trim($raw);
    if ($raw === '') {
        return [];
    }
    $out = [];
    if (function_exists('imap_rfc822_parse_adrlist')) {
        $addrs = @imap_rfc822_parse_adrlist($raw, 'localhost');
        if (is_array($addrs)) {
            foreach ($addrs as $addr) {
                $mailbox = trim($addr->mailbox ?? '');
                $host = trim($addr->host ?? '');
                if ($mailbox === '' || $host === '') {
                    continue;
                }
                $email = strtolower($mailbox . '@' . $host);
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    continue;
                }
                $name = isset($addr->personal) ? trim(mailDecodeMimeHeader((string)$addr->personal)) : '';
                $out[] = ['email' => $email, 'name' => $name];
            }
            if ($out) {
                return $out;
            }
        }
    }
    if (preg_match_all('/<([^<>\s]+@[^<>\s]+)>/', $raw, $matches)) {
        foreach ($matches[1] as $email) {
            $email = strtolower(trim($email));
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $out[] = ['email' => $email, 'name' => ''];
            }
        }
    }
    if (preg_match_all('/([^\s<>,;]+@[^\s<>,;]+)/', $raw, $matches)) {
        foreach ($matches[1] as $email) {
            $email = strtolower(trim($email, '<>"\''));
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $out[] = ['email' => $email, 'name' => ''];
            }
        }
    }
    $seen = [];
    $unique = [];
    foreach ($out as $item) {
        if (isset($seen[$item['email']])) {
            continue;
        }
        $seen[$item['email']] = true;
        $unique[] = $item;
    }
    return $unique;
}

function mailGetCrmRecipientSuggestions(PDO $pdo): array
{
    $stmt = $pdo->prepare('SELECT data FROM crm_store WHERE id = ?');
    $stmt->execute(['default']);
    $row = $stmt->fetch();
    if (!$row || empty($row['data'])) {
        return [];
    }
    $crm = json_decode($row['data'], true);
    if (!is_array($crm)) {
        return [];
    }

    $out = [];
    $add = static function (string $email, string $name, string $source) use (&$out): void {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        $out[] = [
            'email' => $email,
            'name' => trim($name),
            'source' => $source,
        ];
    };

    foreach ($crm['lists'] ?? [] as $list) {
        foreach ($list['prospects'] ?? [] as $prospect) {
            $email = trim((string)($prospect['email'] ?? ''));
            if ($email === '') {
                continue;
            }
            $name = trim(implode(' ', array_filter([
                $prospect['contactPrenom'] ?? '',
                $prospect['contactNom'] ?? '',
            ])));
            if ($name === '') {
                $name = trim((string)($prospect['organisme'] ?? ''));
            }
            $add($email, $name, 'crm');
        }
    }

    foreach ($crm['structures'] ?? [] as $structure) {
        $email = trim((string)($structure['email'] ?? ''));
        if ($email === '') {
            continue;
        }
        $name = trim((string)($structure['organisme'] ?? ''));
        $add($email, $name, 'crm');
    }

    return $out;
}

function mailCollectRecipientSuggestions(PDO $pdo, array $mailbox, string $query = '', int $limit = 40): array
{
    $query = trim(mb_strtolower($query));
    $byEmail = [];

    $merge = static function (array $items) use (&$byEmail, $query): void {
        foreach ($items as $item) {
            $email = strtolower(trim((string)($item['email'] ?? '')));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            $name = trim((string)($item['name'] ?? ''));
            $source = (string)($item['source'] ?? 'mail');
            $haystack = mb_strtolower($email . ' ' . $name);
            if ($query !== '' && mb_strpos($haystack, $query) === false) {
                continue;
            }
            if (!isset($byEmail[$email])) {
                $byEmail[$email] = [
                    'email' => $email,
                    'name' => $name,
                    'source' => $source,
                ];
                continue;
            }
            if ($name !== '' && $byEmail[$email]['name'] === '') {
                $byEmail[$email]['name'] = $name;
            }
            if ($byEmail[$email]['source'] !== 'crm' && $source === 'crm') {
                $byEmail[$email]['source'] = 'crm';
            }
        }
    };

    foreach (['INBOX', 'Sent'] as $folderKey) {
        try {
            $result = mailListMessages($mailbox, $folderKey, 1, 120);
            foreach ($result['messages'] ?? [] as $msg) {
                foreach (['from', 'to'] as $field) {
                    $extracted = mailExtractEmailsFromAddressHeader((string)($msg[$field] ?? ''));
                    $items = [];
                    foreach ($extracted as $entry) {
                        $items[] = [
                            'email' => $entry['email'],
                            'name' => $entry['name'],
                            'source' => 'mail',
                        ];
                    }
                    $merge($items);
                }
            }
        } catch (Throwable $e) {
            // Ignorer un dossier inaccessible
        }
    }

    $merge(mailGetCrmRecipientSuggestions($pdo));

    $list = array_values($byEmail);
    usort($list, static function (array $a, array $b): int {
        $nameA = mb_strtolower($a['name'] ?: $a['email']);
        $nameB = mb_strtolower($b['name'] ?: $b['email']);
        if ($nameA === $nameB) {
            return strcmp($a['email'], $b['email']);
        }
        return strcmp($nameA, $nameB);
    });

    if ($limit > 0 && count($list) > $limit) {
        $list = array_slice($list, 0, $limit);
    }

    return $list;
}
