<?php
/**
 * API Mails — lecture et envoi (boîtes de l'utilisateur connecté uniquement).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mail_helper.php';

$userId = verifyToken();
$pdo = getDB();
mailEnsureTablesExist($pdo);

if (!mailUserHasMailboxes($pdo, (int)$userId)) {
    http_response_code(403);
    echo json_encode(['error' => 'Aucune boîte mail configurée']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    if ($method === 'GET') {
        if ($action === 'list') {
            $mailboxId = (int)($_GET['mailbox_id'] ?? 0);
            $folder = $_GET['folder'] ?? 'INBOX';
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = min(50, max(1, (int)($_GET['limit'] ?? 30)));
            $unreadOnly = isset($_GET['unread']) && $_GET['unread'] !== '0';
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            $result = mailListMessages($mailbox, $folder, $page, $limit, $unreadOnly);
            $result['success'] = true;
            $result['folder'] = $folder;
            echo json_encode($result, JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'read') {
            $mailboxId = (int)($_GET['mailbox_id'] ?? 0);
            $uid = (int)($_GET['uid'] ?? 0);
            $folder = $_GET['folder'] ?? 'INBOX';
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox || !$uid) {
                http_response_code(404);
                echo json_encode(['error' => 'Message introuvable']);
                exit;
            }
            $msg = mailGetMessage($mailbox, $folder, $uid);
            echo json_encode(['success' => true, 'message' => $msg], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'folders') {
            $mailboxId = (int)($_GET['mailbox_id'] ?? 0);
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            echo json_encode([
                'success' => true,
                'folders' => [
                    ['key' => 'INBOX', 'label' => 'Réception'],
                    ['key' => 'Sent', 'label' => 'Envoyés'],
                    ['key' => 'Drafts', 'label' => 'Brouillons'],
                    ['key' => 'Trash', 'label' => 'Corbeille'],
                    ['key' => 'Spam', 'label' => 'Indésirables'],
                ],
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'recipient_suggestions') {
            $mailboxId = (int)($_GET['mailbox_id'] ?? 0);
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            $query = trim((string)($_GET['q'] ?? ''));
            $limit = min(50, max(5, (int)($_GET['limit'] ?? 30)));
            echo json_encode([
                'success' => true,
                'suggestions' => mailCollectRecipientSuggestions($pdo, $mailbox, $query, $limit),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Action GET invalide']);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = $input['action'] ?? $action;

        if ($action === 'send') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }

            $attachments = [];
            if (!empty($input['attachments']) && is_array($input['attachments'])) {
                foreach ($input['attachments'] as $att) {
                    $data = $att['data'] ?? '';
                    if ($data === '') {
                        continue;
                    }
                    $decoded = base64_decode($data, true);
                    if ($decoded === false) {
                        continue;
                    }
                    if (strlen($decoded) > 10 * 1024 * 1024) {
                        http_response_code(400);
                        echo json_encode(['error' => 'Pièce jointe trop volumineuse (max 10 Mo)']);
                        exit;
                    }
                    $attachments[] = [
                        'filename' => $att['filename'] ?? 'fichier',
                        'mime' => $att['mime'] ?? 'application/octet-stream',
                        'data' => $decoded,
                    ];
                }
            }

            $body = trim($input['body'] ?? '');
            $bodyHtml = trim($input['body_html'] ?? '');
            $settings = mailGetMailboxMailSettings($pdo, (int)$userId, $mailboxId);
            $settings['signature_html'] = mailEnsureSignatureHtmlReady(
                $pdo,
                (int)$userId,
                $mailboxId,
                $settings['signature_html'],
                true
            );
            if ($bodyHtml !== '') {
                $merged = mailPrepareComposeHtmlBody($bodyHtml, $body, $settings);
            } else {
                $merged = mailMergeBodyWithSignature($body, $settings['signature_html'], $settings['signature_enabled']);
            }

            $to = trim($input['to'] ?? '');
            $cc = trim($input['cc'] ?? '');
            $bcc = trim($input['bcc'] ?? '');
            $subject = trim($input['subject'] ?? '');
            $recipientList = mailResolveSendRecipients($to, $cc, $bcc);
            $recipientCount = count($recipientList);
            if ($recipientCount === 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Adresse destinataire invalide. Utilisez le format email@domaine.com']);
                exit;
            }
            if ($recipientCount > 25 && empty($input['confirm_large_send'])) {
                http_response_code(400);
                echo json_encode([
                    'error' => 'Ce message compte ' . $recipientCount . ' destinataire(s) distinct(s). OVH limite à 200/heure (chaque destinataire = 1). Confirmez l\'envoi.',
                    'recipient_count' => $recipientCount,
                    'recipients_list' => $recipientList,
                    'needs_confirm' => true,
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if ($recipientCount > 5) {
                error_log(sprintf(
                    'mail_send: user=%d mailbox=%d recipients=%d to=%s',
                    (int)$userId,
                    $mailboxId,
                    $recipientCount,
                    mb_substr($to, 0, 200)
                ));
            }
            $logMeta = static function (array $result = []) use ($recipientList, $to): array {
                $delivery = $result['smtp_delivery'] ?? [];
                $list = $result['recipients_list'] ?? $recipientList;
                return [
                    'recipients_json' => json_encode($list, JSON_UNESCAPED_UNICODE),
                    'smtp_host_used' => (string)($delivery['host'] ?? ''),
                    'smtp_port_used' => (int)($delivery['port'] ?? 0),
                    'smtp_encryption_used' => (string)($delivery['encryption'] ?? ''),
                ];
            };
            $loggedRecipientCount = static function (array $result) use ($recipientCount): int {
                $delivery = $result['smtp_delivery'] ?? [];
                $rcpt = (int)($delivery['rcpt_count'] ?? 0);
                if ($rcpt > 0) {
                    return $rcpt;
                }
                return (int)($result['recipients'] ?? $recipientCount);
            };

            try {
                $result = mailSendMessage($mailbox, [
                    'to' => $to,
                    'cc' => $cc,
                    'bcc' => $bcc,
                    'subject' => $subject,
                    'body_text' => $merged['body_text'],
                    'body_html' => $merged['body_html'],
                    'inline_images' => $merged['inline_images'],
                    'in_reply_to' => trim($input['in_reply_to'] ?? ''),
                    'attachments' => $attachments,
                ]);
                $finalCount = $loggedRecipientCount($result);
                mailLogSend($pdo, (int)$userId, $mailboxId, $mailbox['email'], $to, $subject, $finalCount, true, null, $logMeta($result));

                $deleteDraftUid = (int)($input['delete_draft_uid'] ?? 0);
                if ($deleteDraftUid > 0) {
                    try {
                        mailDeleteMessagesFromFolder($mailbox, 'Drafts', [$deleteDraftUid]);
                    } catch (Throwable $draftErr) {
                        // L'envoi a réussi — ne pas bloquer si le brouillon n'a pas pu être supprimé
                    }
                }
            } catch (Throwable $sendErr) {
                mailLogSend($pdo, (int)$userId, $mailboxId, $mailbox['email'], $to, $subject, $recipientCount, false, $sendErr->getMessage(), $logMeta());
                throw $sendErr;
            }

            echo json_encode([
                'success' => true,
                'message' => !empty($result['append_warning'])
                    ? 'Message envoyé (copie dans Envoyés non enregistrée)'
                    : 'Message envoyé',
                'recipients' => $result['recipients'] ?? $recipientCount,
                'recipients_list' => $result['recipients_list'] ?? $recipientList,
                'smtp_host' => $result['smtp_host'] ?? null,
                'append_warning' => $result['append_warning'] ?? null,
            ]);
            exit;
        }

        if ($action === 'mark_unread') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $uid = (int)($input['uid'] ?? 0);
            $folder = $input['folder'] ?? 'INBOX';
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox || !$uid) {
                http_response_code(404);
                echo json_encode(['error' => 'Message introuvable']);
                exit;
            }
            mailMarkUnread($mailbox, $folder, $uid);
            echo json_encode(['success' => true]);
            exit;
        }

        if ($action === 'move') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $uid = (int)($input['uid'] ?? 0);
            $folder = $input['folder'] ?? 'INBOX';
            $targetFolder = $input['target_folder'] ?? '';
            if (!in_array($targetFolder, ['Trash', 'Spam'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Dossier cible invalide']);
                exit;
            }
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox || !$uid) {
                http_response_code(404);
                echo json_encode(['error' => 'Message introuvable']);
                exit;
            }
            mailMoveMessage($mailbox, $folder, $uid, $targetFolder);
            echo json_encode(['success' => true, 'target_folder' => $targetFolder]);
            exit;
        }

        if ($action === 'delete_permanent') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $folder = $input['folder'] ?? 'INBOX';
            $uids = $input['uids'] ?? [];
            if (!is_array($uids)) {
                $uids = [];
            }
            if ($folder !== 'Trash') {
                http_response_code(400);
                echo json_encode(['error' => 'La suppression définitive n\'est possible que dans la corbeille']);
                exit;
            }
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }
            $deleted = mailDeleteMessagesPermanently($mailbox, $folder, $uids);
            echo json_encode(['success' => true, 'deleted' => $deleted]);
            exit;
        }

        if ($action === 'delete_draft') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $uids = $input['uids'] ?? [];
            if (!is_array($uids)) {
                $uids = [];
            }
            if (!$uids && !empty($input['uid'])) {
                $uids = [(int)$input['uid']];
            }
            $uids = array_values(array_unique(array_filter(array_map('intval', $uids), static function (int $uid): bool {
                return $uid > 0;
            })));
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox || !$uids) {
                http_response_code(404);
                echo json_encode(['error' => 'Brouillon introuvable']);
                exit;
            }
            $deleted = mailDeleteMessagesFromFolder($mailbox, 'Drafts', $uids);
            echo json_encode(['success' => true, 'deleted' => $deleted]);
            exit;
        }

        if ($action === 'save_draft') {
            $mailboxId = (int)($input['mailbox_id'] ?? 0);
            $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
            if (!$mailbox) {
                http_response_code(404);
                echo json_encode(['error' => 'Boîte mail introuvable']);
                exit;
            }

            $attachments = [];
            if (!empty($input['attachments']) && is_array($input['attachments'])) {
                foreach ($input['attachments'] as $att) {
                    $data = $att['data'] ?? '';
                    if ($data === '') {
                        continue;
                    }
                    $decoded = base64_decode($data, true);
                    if ($decoded === false) {
                        continue;
                    }
                    if (strlen($decoded) > 10 * 1024 * 1024) {
                        http_response_code(400);
                        echo json_encode(['error' => 'Pièce jointe trop volumineuse (max 10 Mo)']);
                        exit;
                    }
                    $attachments[] = [
                        'filename' => $att['filename'] ?? 'fichier',
                        'mime' => $att['mime'] ?? 'application/octet-stream',
                        'data' => $decoded,
                    ];
                }
            }

            $draftSettings = mailGetMailboxMailSettings($pdo, (int)$userId, $mailboxId);
            $draftSettings['signature_html'] = mailEnsureSignatureHtmlReady(
                $pdo,
                (int)$userId,
                $mailboxId,
                $draftSettings['signature_html'],
                true
            );
            $result = mailSaveDraft($mailbox, [
                'to' => trim($input['to'] ?? ''),
                'cc' => trim($input['cc'] ?? ''),
                'bcc' => trim($input['bcc'] ?? ''),
                'subject' => trim($input['subject'] ?? ''),
                'body' => trim($input['body'] ?? ''),
                'body_html' => trim($input['body_html'] ?? ''),
                'in_reply_to' => trim($input['in_reply_to'] ?? ''),
                'attachments' => $attachments,
                'replace_uid' => (int)($input['replace_uid'] ?? 0),
                'mail_settings' => $draftSettings,
            ]);

            echo json_encode([
                'success' => true,
                'message' => 'Brouillon enregistré',
                'draft_uid' => $result['draft_uid'] ?? null,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Action POST invalide']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
} catch (Throwable $e) {
    $status = function_exists('mailSendHttpStatus') ? mailSendHttpStatus($e) : 500;
    http_response_code($status);
    echo json_encode(['error' => $e->getMessage(), 'quota_exceeded' => $status === 429]);
}
