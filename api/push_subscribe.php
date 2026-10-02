<?php
/**
 * Push Subscription Management
 * POST   → subscribe (save push subscription)
 * DELETE → unsubscribe (remove push subscription)
 * GET    → returns VAPID public key
 */

require_once __DIR__ . '/config.php';

$pdo = getDB();

ensurePushTable($pdo);

function ensurePushTable($pdo) {
    try {
        $pdo->query("SELECT 1 FROM push_subscriptions LIMIT 1");
    } catch (Exception $e) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh VARCHAR(255) NOT NULL,
            auth VARCHAR(255) NOT NULL,
            push_token VARCHAR(64) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_push_token (push_token)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method === 'GET') {
    echo json_encode([
        'success' => true,
        'publicKey' => VAPID_PUBLIC_KEY
    ]);
    exit;
}

$userId = verifyToken();

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $endpoint = $input['endpoint'] ?? null;
    $p256dh = $input['keys']['p256dh'] ?? null;
    $auth = $input['keys']['auth'] ?? null;

    if (!$endpoint || !$p256dh || !$auth) {
        echo json_encode(['success' => false, 'error' => 'Subscription data incomplete']);
        exit;
    }

    $pushToken = bin2hex(random_bytes(32));

    $stmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?");
    $stmt->execute([$userId, $endpoint]);

    $stmt = $pdo->prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, push_token) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$userId, $endpoint, $p256dh, $auth, $pushToken]);

    echo json_encode(['success' => true, 'pushToken' => $pushToken]);
    exit;
}

if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $endpoint = $input['endpoint'] ?? null;

    if ($endpoint) {
        $stmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?");
        $stmt->execute([$userId, $endpoint]);
    }

    echo json_encode(['success' => true]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Method not allowed']);
