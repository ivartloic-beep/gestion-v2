<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();

$pdo = getDB();

try {
    switch ($method) {
        case 'GET':
            // Récupérer les permissions d'un utilisateur
            $targetUserId = $_GET['user_id'] ?? $userId;
            
            // Si ce n'est pas l'utilisateur lui-même, vérifier qu'il est admin
            if ($targetUserId != $userId) {
                $user = getUserInfo($userId);
                if ($user['role'] !== 'admin') {
                    http_response_code(403);
                    echo json_encode(['error' => 'Accès refusé']);
                    exit;
                }
            }
            
            $permissions = getUserPermissions($targetUserId);
            echo json_encode(['success' => true, 'permissions' => $permissions]);
            break;
            
        case 'PUT':
            // Modifier les permissions (admin only)
            $user = getUserInfo($userId);
            if ($user['role'] !== 'admin') {
                http_response_code(403);
                echo json_encode(['error' => 'Accès refusé. Admin requis.']);
                exit;
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $targetUserId = $input['user_id'] ?? 0;
            $permissions = $input['permissions'] ?? [];
            
            if (!$targetUserId) {
                http_response_code(400);
                echo json_encode(['error' => 'user_id requis']);
                exit;
            }
            
            // Supprimer les anciennes permissions
            $stmt = $pdo->prepare("DELETE FROM user_permissions WHERE user_id = ?");
            $stmt->execute([$targetUserId]);
            
            // Ajouter les nouvelles permissions
            $stmt = $pdo->prepare("
                INSERT INTO user_permissions (user_id, section, can_view, can_edit) 
                VALUES (?, ?, ?, ?)
            ");
            
            foreach ($permissions as $section => $perms) {
                $stmt->execute([
                    $targetUserId,
                    $section,
                    $perms['can_view'] ? 1 : 0,
                    $perms['can_edit'] ? 1 : 0
                ]);
            }
            
            echo json_encode(['success' => true]);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Méthode non autorisée']);
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage()]);
}
?>
