<?php
require_once 'config.php';

$fileId = '';
$authToken = '';

foreach (['token', 'auth', 't'] as $key) {
    if (!empty($_GET[$key]) && trim((string) $_GET[$key]) !== '') {
        $authToken = trim((string) $_GET[$key]);
        break;
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    if ($fileId === '' && !empty($_POST['id'])) {
        $fileId = trim((string) $_POST['id']);
    }
    if ($fileId === '' && !empty($_POST['file_id'])) {
        $fileId = trim((string) $_POST['file_id']);
    }
    if ($authToken === '' && !empty($_POST['token'])) {
        $authToken = trim((string) $_POST['token']);
    }
}

if ($fileId === '' && !empty($_GET['id'])) {
    $fileId = trim((string) $_GET['id']);
}

if ($authToken !== '') {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $authToken;
    $_GET['token'] = $authToken;
}

$userId = verifyToken();

if ($fileId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'ID de fichier manquant']);
    exit;
}

try {
    $pdo = getDB();
    
    $stmt = $pdo->prepare("SELECT stored_path, original_name, mime_type FROM uploaded_files WHERE file_id = ?");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch();
    
    if (!$file) {
        http_response_code(404);
        echo json_encode(['error' => 'Fichier non trouvé']);
        exit;
    }
    
    $filePath = __DIR__ . '/' . $file['stored_path'];
    
    if (!file_exists($filePath)) {
        http_response_code(404);
        echo json_encode(['error' => 'Fichier physique non trouvé']);
        exit;
    }
    
    $mimeType = $file['mime_type'];
    if (empty($mimeType)) {
        $mimeType = mime_content_type($filePath);
    }
    
    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . filesize($filePath));
    header('Content-Disposition: inline; filename="' . addslashes($file['original_name']) . '"');
    header('Cache-Control: private, max-age=3600');
    
    readfile($filePath);
    exit;
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur']);
}
