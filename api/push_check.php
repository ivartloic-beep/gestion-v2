<?php
/**
 * Push Check — called by the Service Worker after receiving a push.
 * Identifies the user via push_token (no auth required).
 * Returns latest unread conversation info for notification display.
 */

require_once __DIR__ . '/config.php';

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$pushToken = $_GET['push_token'] ?? null;
if (!$pushToken) {
    echo json_encode(['success' => false, 'error' => 'push_token required']);
    exit;
}

$stmt = $pdo->prepare("SELECT user_id FROM push_subscriptions WHERE push_token = ?");
$stmt->execute([$pushToken]);
$row = $stmt->fetch();

if (!$row) {
    echo json_encode(['success' => false, 'error' => 'Invalid push_token']);
    exit;
}

$userId = $row['user_id'];
$nameExpr = "TRIM(CONCAT(COALESCE(u.prenom,''),' ',COALESCE(u.nom,u.username,'')))";

$stmt = $pdo->prepare("
    SELECT c.id as convId, c.type, c.name as groupName,
           m.content as lastMessage,
           {$nameExpr} as senderName,
           (SELECT COUNT(*) FROM msg_messages mm 
            WHERE mm.conversation_id = c.id 
            AND mm.created_at > COALESCE(cm.last_read_at, '1970-01-01')
            AND mm.sender_id != ?) as unreadCount
    FROM msg_conversation_members cm
    JOIN msg_conversations c ON c.id = cm.conversation_id
    LEFT JOIN msg_messages m ON m.id = (
        SELECT MAX(id) FROM msg_messages WHERE conversation_id = c.id
    )
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE cm.user_id = ?
    HAVING unreadCount > 0
    ORDER BY m.created_at DESC
    LIMIT 1
");
$stmt->execute([$userId, $userId]);
$conv = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$conv) {
    echo json_encode(['success' => true, 'hasUnread' => false]);
    exit;
}

$displayName = $conv['type'] === 'group'
    ? ($conv['groupName'] ?: 'Groupe')
    : ($conv['senderName'] ?: 'Nouveau message');

$preview = $conv['lastMessage'] ?: '';
if (mb_strlen($preview) > 80) {
    $preview = mb_substr($preview, 0, 80) . '…';
}

echo json_encode([
    'success' => true,
    'hasUnread' => true,
    'convId' => $conv['convId'],
    'title' => $displayName,
    'body' => $preview,
    'unreadCount' => (int)$conv['unreadCount']
]);
