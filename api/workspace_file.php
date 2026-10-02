<?php
/**
 * Téléchargement / affichage sécurisé des fichiers workspace (Mon Bureau + projets).
 * Les fichiers dans api/uploads/ ne sont pas accessibles directement (.htaccess).
 */
require_once 'config.php';
require_once 'workspace_helpers.php';

if (isset($_GET['token']) && !isset($_SERVER['HTTP_AUTHORIZATION']) && !isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . trim($_GET['token']);
}

$userId = verifyToken();
$pdo = getDB();

$elementId = isset($_GET['id']) ? trim($_GET['id']) : '';
if ($elementId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'ID manquant']);
    exit;
}

$stmt = $pdo->prepare("
    SELECT id, type, visibility, created_by, access_list, project_id, file_path, file_name
    FROM workspace_elements
    WHERE id = ?
");
$stmt->execute([$elementId]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || $row['type'] !== 'file' || empty($row['file_path'])) {
    http_response_code(404);
    echo json_encode(['error' => 'Fichier introuvable']);
    exit;
}

if (!workspaceCanRead($row, $userId)) {
    if (!workspaceUserMentionedElement($pdo, $userId, $elementId)) {
        http_response_code(403);
        echo json_encode(['error' => 'Accès refusé']);
        exit;
    }
}

$filePath = resolveWorkspaceStoredPath($row['file_path']);
if (!$filePath || !is_file($filePath)) {
    http_response_code(404);
    echo json_encode(['error' => 'Fichier physique introuvable']);
    exit;
}

$mimeType = function_exists('mime_content_type') ? mime_content_type($filePath) : 'application/octet-stream';
$fileName = $row['file_name'] ?: basename($filePath);
$forceDownload = isset($_GET['download']) && ($_GET['download'] === '1' || $_GET['download'] === 'true');

header('Content-Type: ' . $mimeType);
header('Content-Length: ' . filesize($filePath));
header('Content-Disposition: ' . ($forceDownload ? 'attachment' : 'inline') . '; filename="' . addslashes($fileName) . '"');
header('Cache-Control: private, max-age=3600');
readfile($filePath);
exit;

function resolveWorkspaceStoredPath($storedPath) {
    $storedPath = ltrim(str_replace('\\', '/', $storedPath), '/');
    if (strpos($storedPath, 'api/uploads/workspace/') === 0) {
        return __DIR__ . '/uploads/workspace/' . basename($storedPath);
    }
    if (strpos($storedPath, 'uploads/workspace/') === 0) {
        return __DIR__ . '/' . $storedPath;
    }
    return __DIR__ . '/uploads/workspace/' . basename($storedPath);
}
