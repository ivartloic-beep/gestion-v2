<?php
/**
 * Sert les images de signature mail (URL publique pour Gmail et autres clients).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mail_helper.php';

$publicId = preg_replace('/[^a-f0-9]/', '', strtolower((string)($_GET['id'] ?? '')));
if (strlen($publicId) < 16) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}

try {
    $pdo = getDB();
    mailEnsureTablesExist($pdo);
    $stmt = $pdo->prepare('SELECT mime, file_path FROM mail_signature_assets WHERE public_id = ? LIMIT 1');
    $stmt->execute([$publicId]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $mime = mailNormalizeImageMime((string)($row['mime'] ?? 'image/png'));
    $relative = str_replace('\\', '/', (string)($row['file_path'] ?? ''));
    if ($relative === '' || strpos($relative, '..') !== false) {
        http_response_code(404);
        exit;
    }
    $fullPath = __DIR__ . '/' . ltrim($relative, '/');
    if (!is_file($fullPath) || !is_readable($fullPath)) {
        http_response_code(404);
        exit;
    }

    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    readfile($fullPath);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Error';
}
