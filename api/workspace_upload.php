<?php
/**
 * Upload de fichiers pour l'espace de travail.
 * Accepte multipart/form-data : file, visibility, folder_id.
 * Stocke dans uploads/workspace/ et crée un élément type=file dans workspace_elements.
 */
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

// Pour multipart/form-data, le token peut être dans POST
if (isset($_POST['token']) && !isset($_SERVER['HTTP_AUTHORIZATION']) && !isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . trim($_POST['token']);
}

$userId = verifyToken();
$pdo = getDB();

// Vérifier qu'un fichier a été uploadé
if (!isset($_FILES['file']) || is_array($_FILES['file']['error'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Aucun fichier reçu']);
    exit;
}
if ($_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $code = (int) $_FILES['file']['error'];
    $messages = [
        UPLOAD_ERR_INI_SIZE => 'Fichier trop volumineux (limite serveur)',
        UPLOAD_ERR_FORM_SIZE => 'Fichier trop volumineux (limite formulaire)',
        UPLOAD_ERR_PARTIAL => 'Upload interrompu (fichier partiel)',
        UPLOAD_ERR_NO_FILE => 'Aucun fichier reçu',
        UPLOAD_ERR_NO_TMP_DIR => 'Dossier temporaire manquant sur le serveur',
        UPLOAD_ERR_CANT_WRITE => 'Impossible d\'écrire le fichier sur le serveur',
        UPLOAD_ERR_EXTENSION => 'Upload bloqué par une extension PHP',
    ];
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $messages[$code] ?? ('Erreur upload: ' . $code)]);
    exit;
}

$file = $_FILES['file'];
$visibility = isset($_POST['visibility']) && $_POST['visibility'] === 'team' ? 'team' : 'personal';
$folderId = isset($_POST['folder_id']) ? trim($_POST['folder_id']) : null;
$projectId = isset($_POST['project_id']) ? trim($_POST['project_id']) : null;
if ($projectId === '') $projectId = null;

$allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'video/mp4', 'video/quicktime', 'video/webm', 'audio/mp4', 'application/mp4',
];
$mimeType = $file['type'] ?? '';
if (empty($mimeType) || $mimeType === 'application/octet-stream') {
    $mimeType = function_exists('mime_content_type') ? mime_content_type($file['tmp_name']) : '';
}
$mimeType = strtolower(trim($mimeType));
$extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$extensionToMime = [
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
    'gif' => 'image/gif', 'webp' => 'image/webp', 'pdf' => 'application/pdf',
    'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt' => 'text/plain', 'csv' => 'text/csv',
    'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm',
];
// Priorité à l'extension connue (certains OS envoient un MIME incorrect pour les MP4)
if (isset($extensionToMime[$extension]) && in_array($extensionToMime[$extension], $allowedMimes, true)) {
    $mimeType = $extensionToMime[$extension];
} elseif (!in_array($mimeType, $allowedMimes, true) && isset($extensionToMime[$extension])) {
    $mimeType = $extensionToMime[$extension];
}
if (!in_array($mimeType, $allowedMimes, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Type de fichier non autorisé (' . ($mimeType ?: 'inconnu') . ')']);
    exit;
}

$uploadDir = __DIR__ . '/uploads/workspace/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}
$fileId = bin2hex(random_bytes(8));
if (empty($extension)) {
    $extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp', 'application/pdf' => 'pdf', 'text/plain' => 'txt', 'text/csv' => 'csv', 'video/mp4' => 'mp4'];
    $extension = $extMap[$mimeType] ?? 'bin';
}
$storedPath = $uploadDir . $fileId . '.' . $extension;
if (!move_uploaded_file($file['tmp_name'], $storedPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur déplacement fichier']);
    exit;
}

$relativePath = 'uploads/workspace/' . $fileId . '.' . $extension;
$fileName = $file['name'];
$fileSize = (int) $file['size'];
$attachOnly = isset($_POST['attach_only']) && ($_POST['attach_only'] === '1' || $_POST['attach_only'] === 'true');
$attachmentId = 'wsatt_' . time() . '_' . substr($fileId, 0, 8);

if ($attachOnly) {
    echo json_encode([
        'success' => true,
        'attachment' => [
            'id' => $attachmentId,
            'name' => $fileName,
            'path' => $relativePath,
            'type' => $mimeType,
            'size' => $fileSize,
        ],
    ]);
    exit;
}

$elementId = 'ws_file_' . time() . '_' . substr($fileId, 0, 8);

try {
    $stmt = $pdo->prepare("
        INSERT INTO workspace_elements (id, project_id, type, title, visibility, folder_id, file_path, file_name, file_size, created_by)
        VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$elementId, $projectId, $fileName, $visibility, $folderId, $relativePath, $fileName, $fileSize, $userId]);
} catch (PDOException $e) {
    @unlink($storedPath);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
}

$element = [
    'id' => $elementId,
    'type' => 'file',
    'title' => $fileName,
    'visibility' => $visibility,
    'file_path' => $relativePath,
    'file_name' => $fileName,
    'file_size' => $fileSize,
    'created_by' => $userId,
    'created_at' => date('Y-m-d H:i:s'),
    'updated_at' => date('Y-m-d H:i:s'),
];
echo json_encode(['success' => true, 'element' => $element]);
