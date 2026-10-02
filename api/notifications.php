<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

// Créer la table si elle n'existe pas (sans FOREIGN KEY pour compatibilité maximale)
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT,
            type VARCHAR(50) DEFAULT 'info',
            read_flag TINYINT(1) DEFAULT 0,
            link_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_read (user_id, read_flag)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
} catch (PDOException $e) {
    error_log('notifications.php CREATE TABLE: ' . $e->getMessage());
}
try {
    $check = $pdo->query("SHOW COLUMNS FROM notifications LIKE 'link_data'");
    if ($check && $check->rowCount() === 0) {
        $pdo->exec("ALTER TABLE notifications ADD COLUMN link_data TEXT NULL AFTER read_flag");
    }
} catch (PDOException $e) { /* colonne existe peut-être déjà */ }

try {
    switch ($method) {
        case 'GET':
            // Récupérer les notifications de l'utilisateur connecté
            try {
                $stmt = $pdo->prepare("
                    SELECT id, title, message, type, read_flag, link_data, created_at 
                    FROM notifications 
                    WHERE user_id = ? 
                    ORDER BY created_at DESC 
                    LIMIT 50
                ");
                $stmt->execute([(int)$userId]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $notifications = array_map(function($r) {
                    $r['read'] = (bool)($r['read_flag'] ?? 0);
                    $r['link'] = !empty($r['link_data']) ? json_decode($r['link_data'], true) : null;
                    return $r;
                }, $rows);
            } catch (PDOException $e) {
                error_log('notifications GET: ' . $e->getMessage());
                $notifications = [];
            }
            echo json_encode(['success' => true, 'notifications' => $notifications]);
            break;

        case 'POST':
            // Créer une notification pour un utilisateur (par soi-même ou admin)
            $input = json_decode(file_get_contents('php://input'), true);
            $targetUserId = $input['userId'] ?? $input['user_id'] ?? $userId;
            $title = $input['title'] ?? '';
            $message = $input['message'] ?? '';
            $type = $input['type'] ?? 'info';
            $link = $input['link'] ?? null;
            $linkData = is_array($link) ? json_encode($link) : null;

            if (empty($title)) {
                http_response_code(400);
                echo json_encode(['error' => 'Le titre est requis']);
                exit;
            }

            $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ?");
            $stmt->execute([$targetUserId]);
            if ($stmt->rowCount() === 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Utilisateur cible introuvable']);
                exit;
            }

            $stmt = $pdo->prepare("
                INSERT INTO notifications (user_id, title, message, type, link_data) 
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([(int)$targetUserId, $title, $message, $type, $linkData]);
            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
            break;

        case 'PUT':
            // Marquer une notification comme lue
            $input = json_decode(file_get_contents('php://input'), true);
            $notifId = $input['id'] ?? 0;
            if (!$notifId) {
                http_response_code(400);
                echo json_encode(['error' => 'ID requis']);
                exit;
            }
            $stmt = $pdo->prepare("UPDATE notifications SET read_flag = 1 WHERE id = ? AND user_id = ?");
            $stmt->execute([$notifId, $userId]);
            echo json_encode(['success' => true]);
            break;

        case 'DELETE':
            // Supprimer toutes les notifications de l'utilisateur connecté
            $stmt = $pdo->prepare("DELETE FROM notifications WHERE user_id = ?");
            $stmt->execute([(int)$userId]);
            echo json_encode(['success' => true, 'deleted' => $stmt->rowCount()]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Méthode non autorisée']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage()]);
}
