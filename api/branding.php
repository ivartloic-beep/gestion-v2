<?php
/**
 * Identité visuelle publique (page de connexion, favicon) — sans authentification.
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

$pdo = getDB();
$pdo->exec("CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY DEFAULT 1,
    data LONGTEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$stmt = $pdo->query('SELECT data FROM settings WHERE id = 1');
$row = $stmt->fetch();
$settings = ($row && !empty($row['data'])) ? json_decode($row['data'], true) : [];
if (!is_array($settings)) {
    $settings = [];
}

$appName = trim((string)($settings['appName'] ?? '')) ?: 'L&Com Gestion';
$logoFileId = $settings['logoFileId'] ?? null;
$logo = $settings['logo'] ?? '';

$response = [
    'success' => true,
    'app_name' => $appName,
    'logo_url' => null,
    'logo_data' => null,
];

if (!empty($logoFileId)) {
    $response['logo_url'] = 'logo.php';
} elseif (is_string($logo) && $logo !== '') {
    if (strpos($logo, 'data:') === 0) {
        $response['logo_data'] = $logo;
    } elseif (strpos($logo, 'download.php') === false) {
        $response['logo_url'] = $logo;
    }
}

echo json_encode($response, JSON_UNESCAPED_UNICODE);
