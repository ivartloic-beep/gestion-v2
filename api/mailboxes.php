<?php
/**
 * API Boîtes mail utilisateur — configuration admin, liste pour l'utilisateur connecté.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mail_helper.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();
mailEnsureTablesExist($pdo);

$action = $_GET['action'] ?? '';

function mailboxesPublicRow(array $row): array
{
    return mailFormatMailboxRow($row, false);
}

try {
    if ($method === 'GET') {
        if ($action === 'mine') {
            $stmt = $pdo->prepare('SELECT * FROM user_mailboxes WHERE user_id = ? ORDER BY sort_order ASC, id ASC');
            $stmt->execute([$userId]);
            $rows = $stmt->fetchAll();
            $includeUnread = isset($_GET['unread']) && $_GET['unread'] !== '0';
            $mailboxes = [];
            foreach ($rows as $row) {
                $mb = mailboxesPublicRow($row);
                if ($includeUnread) {
                    try {
                        $full = mailGetMailboxForUser($pdo, (int)$userId, (int)$row['id'], true);
                        $mb['unread_count'] = $full ? mailGetInboxUnreadCount($full) : 0;
                    } catch (Throwable $e) {
                        $mb['unread_count'] = 0;
                    }
                }
                $mailboxes[] = $mb;
            }
            echo json_encode([
                'success' => true,
                'mailboxes' => $mailboxes,
                'has_mailboxes' => count($mailboxes) > 0,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'unread_counts') {
            $stmt = $pdo->prepare('SELECT id FROM user_mailboxes WHERE user_id = ? ORDER BY sort_order ASC, id ASC');
            $stmt->execute([$userId]);
            $rows = $stmt->fetchAll();
            $counts = [];
            foreach ($rows as $row) {
                $id = (int)$row['id'];
                $unread = 0;
                try {
                    $full = mailGetMailboxForUser($pdo, (int)$userId, $id, true);
                    $unread = $full ? mailGetInboxUnreadCount($full) : 0;
                } catch (Throwable $e) {
                    $unread = 0;
                }
                $counts[] = ['id' => $id, 'unread_count' => $unread];
            }
            echo json_encode([
                'success' => true,
                'counts' => $counts,
                'total_unread' => array_sum(array_column($counts, 'unread_count')),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'has') {
            echo json_encode([
                'success' => true,
                'has_mailboxes' => mailUserHasMailboxes($pdo, (int)$userId),
            ]);
            exit;
        }

        if ($action === 'send_log') {
            mailRequireAdmin($pdo, (int)$userId);
            $mailboxId = (int)($_GET['mailbox_id'] ?? 0);
            $targetUserId = (int)($_GET['user_id'] ?? 0);
            if (!$mailboxId || !$targetUserId) {
                http_response_code(400);
                echo json_encode(['error' => 'mailbox_id et user_id requis']);
                exit;
            }
            $mailbox = mailGetMailboxForUser($pdo, $targetUserId, $mailboxId, false);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            echo json_encode([
                'success' => true,
                'email' => $mailbox['email'],
                'stats' => mailGetSendLogStats($pdo, $mailboxId),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'my_send_log') {
            $mailboxId = (int)($_GET['mailbox_id'] ?? 0);
            if (!$mailboxId) {
                http_response_code(400);
                echo json_encode(['error' => 'mailbox_id requis']);
                exit;
            }
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, false);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            echo json_encode([
                'success' => true,
                'email' => $mailbox['email'],
                'stats' => mailGetSendLogStats($pdo, $mailboxId),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $targetUserId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        if (!$targetUserId) {
            http_response_code(400);
            echo json_encode(['error' => 'user_id requis']);
            exit;
        }
        mailRequireAdmin($pdo, (int)$userId);
        $stmt = $pdo->prepare('SELECT * FROM user_mailboxes WHERE user_id = ? ORDER BY sort_order ASC, id ASC');
        $stmt->execute([$targetUserId]);
        $rows = $stmt->fetchAll();
        echo json_encode([
            'success' => true,
            'mailboxes' => array_map('mailboxesPublicRow', $rows),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        mailRequireAdmin($pdo, (int)$userId);
        $input = json_decode(file_get_contents('php://input'), true) ?: [];

        if (($input['action'] ?? '') === 'test') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $targetUserId = (int)($input['user_id'] ?? 0);
            if (!$mailboxId || !$targetUserId) {
                http_response_code(400);
                echo json_encode(['error' => 'mailbox_id et user_id requis']);
                exit;
            }
            $mailbox = mailGetMailboxForUser($pdo, $targetUserId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            echo json_encode(mailTestConnection($mailbox), JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (($input['action'] ?? '') === 'test_smtp') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $targetUserId = (int)($input['user_id'] ?? 0);
            if (!$mailboxId || !$targetUserId) {
                http_response_code(400);
                echo json_encode(['error' => 'mailbox_id et user_id requis']);
                exit;
            }
            $mailbox = mailGetMailboxForUser($pdo, $targetUserId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            $result = mailTestSmtp($mailbox);
            if (!empty($result['success'])) {
                $result['stats'] = mailGetSendLogStats($pdo, $mailboxId);
            }
            echo json_encode($result, JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (($input['action'] ?? '') === 'test_credentials') {
            $email = trim($input['email'] ?? '');
            $password = (string)($input['password'] ?? '');
            $username = trim($input['username'] ?? $email);
            if ($email === '' || $password === '') {
                http_response_code(400);
                echo json_encode(['error' => 'email et password requis']);
                exit;
            }
            $mailbox = mailNormalizeMailboxCredentials([
                'email' => $email,
                'username' => $username,
                'password' => $password,
                'imap_host' => trim($input['imap_host'] ?? 'ssl0.ovh.net'),
                'imap_port' => (int)($input['imap_port'] ?? 993),
            ]);
            echo json_encode(mailTestConnection($mailbox), JSON_UNESCAPED_UNICODE);
            exit;
        }

        $targetUserId = (int)($input['user_id'] ?? 0);
        $email = trim($input['email'] ?? '');
        $username = trim($input['username'] ?? $email);
        $password = (string)($input['password'] ?? '');
        if (!$targetUserId || $email === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['error' => 'user_id, email et password requis']);
            exit;
        }
        $normalized = mailNormalizeMailboxCredentials(['email' => $email, 'username' => $username]);
        $username = $normalized['username'];

        $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$targetUserId]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Utilisateur introuvable']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO user_mailboxes
            (user_id, label, email, imap_host, imap_port, imap_encryption, smtp_host, smtp_port, smtp_encryption, username, password_enc, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $targetUserId,
            trim($input['label'] ?? $email),
            $email,
            trim($input['imap_host'] ?? 'ssl0.ovh.net'),
            (int)($input['imap_port'] ?? 993),
            trim($input['imap_encryption'] ?? 'ssl'),
            trim($input['smtp_host'] ?? 'ssl0.ovh.net'),
            (int)($input['smtp_port'] ?? 465),
            trim($input['smtp_encryption'] ?? 'ssl'),
            $username,
            mailEncryptCredential($password),
            (int)($input['sort_order'] ?? 0),
        ]);

        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
        exit;
    }

    if ($method === 'PUT') {
        mailRequireAdmin($pdo, (int)$userId);
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $mailboxId = (int)($input['id'] ?? 0);
        $targetUserId = (int)($input['user_id'] ?? 0);
        if (!$mailboxId || !$targetUserId) {
            http_response_code(400);
            echo json_encode(['error' => 'id et user_id requis']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT * FROM user_mailboxes WHERE id = ? AND user_id = ?');
        $stmt->execute([$mailboxId, $targetUserId]);
        $existing = $stmt->fetch();
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['error' => 'Boîte mail introuvable']);
            exit;
        }

        $fields = [];
        $params = [];
        $map = [
            'label' => 'label',
            'email' => 'email',
            'imap_host' => 'imap_host',
            'imap_port' => 'imap_port',
            'imap_encryption' => 'imap_encryption',
            'smtp_host' => 'smtp_host',
            'smtp_port' => 'smtp_port',
            'smtp_encryption' => 'smtp_encryption',
            'username' => 'username',
            'sort_order' => 'sort_order',
        ];
        foreach ($map as $key => $col) {
            if (array_key_exists($key, $input)) {
                $fields[] = "$col = ?";
                $params[] = $input[$key];
            }
        }
        if (!empty($input['password'])) {
            $fields[] = 'password_enc = ?';
            $params[] = mailEncryptCredential($input['password']);
        }
        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'Aucune modification']);
            exit;
        }
        $params[] = $mailboxId;
        $params[] = $targetUserId;
        $sql = 'UPDATE user_mailboxes SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
        $pdo->prepare($sql)->execute($params);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        mailRequireAdmin($pdo, (int)$userId);
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $mailboxId = (int)($input['id'] ?? $_GET['id'] ?? 0);
        $targetUserId = (int)($input['user_id'] ?? $_GET['user_id'] ?? 0);
        if (!$mailboxId || !$targetUserId) {
            http_response_code(400);
            echo json_encode(['error' => 'id et user_id requis']);
            exit;
        }
        $stmt = $pdo->prepare('DELETE FROM user_mailboxes WHERE id = ? AND user_id = ?');
        $stmt->execute([$mailboxId, $targetUserId]);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
