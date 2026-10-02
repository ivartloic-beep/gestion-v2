<?php
/**
 * Téléchargement de pièces jointes mail.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mail_helper.php';

$userId = verifyToken();
$pdo = getDB();
mailEnsureTablesExist($pdo);

if (!mailUserHasMailboxes($pdo, (int)$userId)) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Aucune boîte mail configurée']);
    exit;
}

$mailboxId = (int)($_GET['mailbox_id'] ?? 0);
$uid = (int)($_GET['uid'] ?? 0);
$part = $_GET['part'] ?? '';
$folder = $_GET['folder'] ?? 'INBOX';

if (!$mailboxId || !$uid || $part === '') {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Paramètres manquants']);
    exit;
}

try {
    $mailbox = mailGetMailboxForUser($pdo, (int)$userId, $mailboxId, true);
    if (!$mailbox) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Boîte mail introuvable']);
        exit;
    }

    $att = mailGetAttachmentContent($mailbox, $folder, $uid, $part);
    $filename = $att['filename'];
    $mime = $att['mime'] ?: 'application/octet-stream';

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($att['data']));
    header('Content-Disposition: attachment; filename="' . str_replace('"', '', $filename) . '"');
    header('Cache-Control: private, max-age=3600');
    echo $att['data'];
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $e->getMessage()]);
}
