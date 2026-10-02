<?php
/**
 * Téléchargement / aperçu des pièces jointes d'une note workspace (page, idée, note rapide).
 */
require_once 'config.php';
require_once 'workspace_helpers.php';

if (isset($_GET['token']) && !isset($_SERVER['HTTP_AUTHORIZATION']) && !isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . trim($_GET['token']);
}

$userId = verifyToken();
$pdo = getDB();

$elementId = isset($_GET['element_id']) ? trim($_GET['element_id']) : '';
$attachmentId = isset($_GET['attachment_id']) ? trim($_GET['attachment_id']) : '';
if ($elementId === '' || $attachmentId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Paramètres manquants']);
    exit;
}

$stmt = $pdo->prepare("SELECT * FROM workspace_elements WHERE id = ?");
$stmt->execute([$elementId]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    http_response_code(404);
    echo json_encode(['error' => 'Note introuvable']);
    exit;
}

$canRead = workspaceCanRead($row, $userId);
if (!$canRead && !workspaceUserMentionedElement($pdo, $userId, $elementId)) {
    http_response_code(403);
    echo json_encode(['error' => 'Accès refusé']);
    exit;
}

$content = $row['content'] ? json_decode($row['content'], true) : [];
if (!is_array($content)) {
    $content = [];
}
$attachments = isset($content['attachments']) && is_array($content['attachments']) ? $content['attachments'] : [];
$attachment = null;
foreach ($attachments as $att) {
    if (isset($att['id']) && (string)$att['id'] === (string)$attachmentId) {
        $attachment = $att;
        break;
    }
}
if (!$attachment || empty($attachment['path'])) {
    http_response_code(404);
    echo json_encode(['error' => 'Pièce jointe introuvable']);
    exit;
}

$filePath = resolveWorkspaceNoteAttachmentPath($attachment['path']);
if (!$filePath || !is_file($filePath)) {
    http_response_code(404);
    echo json_encode(['error' => 'Fichier physique introuvable']);
    exit;
}

$mimeType = !empty($attachment['type']) ? $attachment['type'] : (function_exists('mime_content_type') ? mime_content_type($filePath) : 'application/octet-stream');
$fileName = !empty($attachment['name']) ? $attachment['name'] : basename($filePath);
$forceDownload = isset($_GET['download']) && ($_GET['download'] === '1' || $_GET['download'] === 'true');

header('Content-Type: ' . $mimeType);
header('Content-Length: ' . filesize($filePath));
header('Content-Disposition: ' . ($forceDownload ? 'attachment' : 'inline') . '; filename="' . addslashes($fileName) . '"');
header('Cache-Control: private, max-age=3600');
readfile($filePath);
exit;

function resolveWorkspaceNoteAttachmentPath($storedPath) {
    $storedPath = ltrim(str_replace('\\', '/', (string)$storedPath), '/');
    if (strpos($storedPath, 'api/uploads/workspace/') === 0) {
        return __DIR__ . '/uploads/workspace/' . basename($storedPath);
    }
    if (strpos($storedPath, 'uploads/workspace/') === 0) {
        return __DIR__ . '/' . $storedPath;
    }
    return __DIR__ . '/uploads/workspace/' . basename($storedPath);
}
