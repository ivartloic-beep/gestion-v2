<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken(); // Vérifier que l'utilisateur est connecté
$pdo = getDB();
$stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch();

// Vérifier que l'utilisateur est admin (même avec un profil, les admins peuvent gérer les profils)
if (!$user || $user['role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['error' => 'Accès refusé. Admin requis.']);
    exit;
}

$pdo = getDB();

try {
    switch ($method) {
        case 'GET':
            // Liste tous les profils
            $stmt = $pdo->query("
                SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
                       GROUP_CONCAT(
                           CONCAT(pp.section, ':', pp.can_view, ':', pp.can_edit) 
                           SEPARATOR '|'
                       ) as permissions
                FROM permission_profiles p
                LEFT JOIN permission_profile_permissions pp ON p.id = pp.profile_id
                GROUP BY p.id
                ORDER BY p.name ASC
            ");
            $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Formater les permissions
            foreach ($profiles as &$profile) {
                $perms = [];
                if (!empty($profile['permissions'])) {
                    $parts = explode('|', $profile['permissions']);
                    foreach ($parts as $part) {
                        if (!empty($part) && strpos($part, ':') !== false) {
                            list($section, $canView, $canEdit) = explode(':', $part);
                            $perms[$section] = [
                                'can_view' => (bool)$canView,
                                'can_edit' => (bool)$canEdit
                            ];
                        }
                    }
                }
                $profile['permissions'] = $perms;
            }
            
            echo json_encode(['success' => true, 'profiles' => $profiles]);
            break;
            
        case 'POST':
            // Créer un nouveau profil
            $input = json_decode(file_get_contents('php://input'), true);
            
            $name = $input['name'] ?? '';
            $description = $input['description'] ?? '';
            $permissions = $input['permissions'] ?? [];
            
            if (empty($name)) {
                http_response_code(400);
                echo json_encode(['error' => 'Le nom du profil est requis']);
                exit;
            }
            
            // Vérifier si le nom existe déjà
            $stmt = $pdo->prepare("SELECT id FROM permission_profiles WHERE name = ?");
            $stmt->execute([$name]);
            if ($stmt->rowCount() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Un profil avec ce nom existe déjà']);
                exit;
            }
            
            // Créer le profil
            $stmt = $pdo->prepare("INSERT INTO permission_profiles (name, description) VALUES (?, ?)");
            $stmt->execute([$name, $description]);
            $profileId = $pdo->lastInsertId();
            
            // Ajouter les permissions
            $stmt = $pdo->prepare("
                INSERT INTO permission_profile_permissions (profile_id, section, can_view, can_edit) 
                VALUES (?, ?, ?, ?)
            ");
            
            foreach ($permissions as $section => $perms) {
                $stmt->execute([
                    $profileId,
                    $section,
                    $perms['can_view'] ? 1 : 0,
                    $perms['can_edit'] ? 1 : 0
                ]);
            }
            
            echo json_encode(['success' => true, 'profile_id' => $profileId]);
            break;
            
        case 'PUT':
            // Modifier un profil
            $input = json_decode(file_get_contents('php://input'), true);
            $profileId = $input['id'] ?? 0;
            
            if (!$profileId) {
                http_response_code(400);
                echo json_encode(['error' => 'ID du profil requis']);
                exit;
            }
            
            $name = $input['name'] ?? null;
            $description = $input['description'] ?? null;
            $permissions = $input['permissions'] ?? null;
            
            // Mettre à jour le profil
            if ($name !== null || $description !== null) {
                $updates = [];
                $params = [];
                
                if ($name !== null) {
                    // Vérifier si le nom existe déjà (sauf pour ce profil)
                    $stmt = $pdo->prepare("SELECT id FROM permission_profiles WHERE name = ? AND id != ?");
                    $stmt->execute([$name, $profileId]);
                    if ($stmt->rowCount() > 0) {
                        http_response_code(400);
                        echo json_encode(['error' => 'Un profil avec ce nom existe déjà']);
                        exit;
                    }
                    $updates[] = "name = ?";
                    $params[] = $name;
                }
                if ($description !== null) {
                    $updates[] = "description = ?";
                    $params[] = $description;
                }
                
                $params[] = $profileId;
                $sql = "UPDATE permission_profiles SET " . implode(', ', $updates) . " WHERE id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
            }
            
            // Mettre à jour les permissions
            if ($permissions !== null) {
                // Supprimer les anciennes permissions
                $stmt = $pdo->prepare("DELETE FROM permission_profile_permissions WHERE profile_id = ?");
                $stmt->execute([$profileId]);
                
                // Ajouter les nouvelles permissions
                $stmt = $pdo->prepare("
                    INSERT INTO permission_profile_permissions (profile_id, section, can_view, can_edit) 
                    VALUES (?, ?, ?, ?)
                ");
                
                foreach ($permissions as $section => $perms) {
                    $stmt->execute([
                        $profileId,
                        $section,
                        $perms['can_view'] ? 1 : 0,
                        $perms['can_edit'] ? 1 : 0
                    ]);
                }
            }
            
            echo json_encode(['success' => true]);
            break;
            
        case 'DELETE':
            // Supprimer un profil
            $input = json_decode(file_get_contents('php://input'), true);
            $profileId = $input['id'] ?? 0;
            
            if (!$profileId) {
                http_response_code(400);
                echo json_encode(['error' => 'ID du profil requis']);
                exit;
            }
            
            // Vérifier si des utilisateurs utilisent ce profil
            $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM users WHERE permission_profile_id = ?");
            $stmt->execute([$profileId]);
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($result['count'] > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Ce profil est utilisé par ' . $result['count'] . ' utilisateur(s). Supprimez d\'abord les utilisateurs ou changez leur profil.']);
                exit;
            }
            
            // Supprimer le profil (les permissions seront supprimées automatiquement via CASCADE)
            $stmt = $pdo->prepare("DELETE FROM permission_profiles WHERE id = ?");
            $stmt->execute([$profileId]);
            
            echo json_encode(['success' => true]);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Méthode non autorisée']);
            break;
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage()]);
}
?>
