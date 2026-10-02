<?php
/**
 * Logo application — accès public (page de connexion), sans token.
 */
require_once __DIR__ . '/config.php';

$pdo = getDB();
$stmt = $pdo->query('SELECT data FROM settings WHERE id = 1');
$row = $stmt->fetch();
$settings = ($row && !empty($row['data'])) ? json_decode($row['data'], true) : [];
if (!is_array($settings)) {
    $settings = [];
}

$fileId = $settings['logoFileId'] ?? null;
if (!$fileId) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Logo non configuré']);
    exit;
}

try {
    $stmt = $pdo->prepare('SELECT stored_path, original_name, mime_type FROM uploaded_files WHERE file_id = ?');
    $stmt->execute([$fileId]);
    $file = $stmt->fetch();

    if (!$file) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Fichier logo introuvable']);
        exit;
    }

    $filePath = __DIR__ . '/' . $file['stored_path'];
    if (!file_exists($filePath)) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Fichier physique introuvable']);
        exit;
    }

    $mimeType = $file['mime_type'] ?: (mime_content_type($filePath) ?: 'image/png');
    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . filesize($filePath));
    header('Content-Disposition: inline; filename="' . addslashes($file['original_name'] ?: 'logo') . '"');
    header('Cache-Control: public, max-age=86400, immutable');

    readfile($filePath);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Erreur serveur']);
}
