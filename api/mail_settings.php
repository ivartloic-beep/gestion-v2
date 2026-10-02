<?php
/**
 * API Paramètres mail utilisateur (signature par boîte mail).
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

try {
    if ($method === 'GET') {
        $mailboxId = (int)($_GET['mailbox_id'] ?? 0);
        if ($mailboxId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'mailbox_id requis']);
            exit;
        }
        if (!mailUserOwnsMailbox($pdo, (int)$userId, $mailboxId)) {
            http_response_code(404);
            echo json_encode(['error' => 'Boîte mail introuvable']);
            exit;
        }
        $settings = mailGetMailboxMailSettings($pdo, (int)$userId, $mailboxId);
        echo json_encode([
            'success' => true,
            'settings' => $settings,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $mailboxId = (int)($input['mailbox_id'] ?? 0);
        if ($mailboxId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'mailbox_id requis']);
            exit;
        }
        $signatureHtml = (string)($input['signature_html'] ?? '');
        $enabled = !isset($input['signature_enabled']) || !empty($input['signature_enabled']);
        mailSaveMailboxMailSettings($pdo, (int)$userId, $mailboxId, $signatureHtml, $enabled);
        $settings = mailGetMailboxMailSettings($pdo, (int)$userId, $mailboxId);
        echo json_encode([
            'success' => true,
            'settings' => $settings,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
