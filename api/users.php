<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken(); // Vérifier que l'utilisateur est connecté
$pdo = getDB();
$stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch();

// Vérifier que l'utilisateur est admin (même avec un profil, les admins peuvent gérer les utilisateurs)
if (!$user || $user['role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['error' => 'Accès refusé. Admin requis.']);
    exit;
}

$pdo = getDB();

try {
    switch ($method) {
        case 'GET':
            // Liste tous les utilisateurs
            try {
                error_log("users.php GET: Début de la récupération des utilisateurs");
                
                // Récupérer d'abord tous les utilisateurs
                $sqlUsers = "SELECT id, username, nom, prenom, email, role, 
                             COALESCE(role_professionnel, '') as role_professionnel, 
                             COALESCE(role_professionnel_autre, '') as role_professionnel_autre, 
                             permission_profile_id,
                             COALESCE(societies, '[\"lcom\"]') as societies,
                             created_at
                             FROM users 
                             ORDER BY created_at DESC";
                
                $stmtUsers = $pdo->query($sqlUsers);
                $users = $stmtUsers->fetchAll(PDO::FETCH_ASSOC);
                
                error_log("users.php GET: " . count($users) . " utilisateurs trouvés dans la table users");
                
                // Récupérer les permissions pour chaque utilisateur
                $userIds = array_column($users, 'id');
                $permissionsMap = [];
                
                if (!empty($userIds)) {
                    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
                    $sqlPerms = "SELECT user_id, section, can_view, can_edit 
                                FROM user_permissions 
                                WHERE user_id IN ($placeholders)";
                    $stmtPerms = $pdo->prepare($sqlPerms);
                    $stmtPerms->execute($userIds);
                    $permissions = $stmtPerms->fetchAll(PDO::FETCH_ASSOC);
                    
                    foreach ($permissions as $perm) {
                        if (!isset($permissionsMap[$perm['user_id']])) {
                            $permissionsMap[$perm['user_id']] = [];
                        }
                        $permissionsMap[$perm['user_id']][$perm['section']] = [
                            'can_view' => (bool)$perm['can_view'],
                            'can_edit' => (bool)$perm['can_edit']
                        ];
                    }
                }
                
                error_log("users.php GET: " . count($permissionsMap) . " utilisateurs avec permissions");
                
                // Formater les données utilisateurs avec leurs permissions
                foreach ($users as &$user) {
                    $user['permissions'] = $permissionsMap[$user['id']] ?? [];
                    $user['role_professionnel'] = $user['role_professionnel'] ?? '';
                    $user['role_professionnel_autre'] = $user['role_professionnel_autre'] ?? '';
                    $user['societies'] = normalizeUserSocieties($user['societies'] ?? '["lcom"]');
                    unset($user['password']);
                }
                
                error_log("users.php GET: " . count($users) . " utilisateurs formatés et prêts à être retournés");
                $response = ['success' => true, 'users' => $users];
                error_log("users.php GET: Réponse JSON préparée, taille: " . strlen(json_encode($response)));
                echo json_encode($response, JSON_UNESCAPED_UNICODE);
            } catch (PDOException $e) {
                error_log("users.php GET ERROR: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(['error' => 'Erreur lors de la récupération des utilisateurs: ' . $e->getMessage()]);
            }
            break;
            
        case 'POST':
            // Créer un nouvel utilisateur
            $input = json_decode(file_get_contents('php://input'), true);
            
            $username = $input['username'] ?? '';
            $password = $input['password'] ?? '';
            $nom = $input['nom'] ?? '';
            $prenom = $input['prenom'] ?? '';
            $email = $input['email'] ?? '';
            $role = $input['role'] ?? 'user';
            $roleProfessionnel = $input['role_professionnel'] ?? null;
            $roleProfessionnelAutre = $input['role_professionnel_autre'] ?? null;
            $permissions = $input['permissions'] ?? [];
            
            if (empty($username) || empty($password)) {
                http_response_code(400);
                echo json_encode(['error' => 'Username et password requis']);
                exit;
            }
            
            // Vérifier si le username existe déjà
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            if ($stmt->rowCount() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Ce username existe déjà']);
                exit;
            }
            
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            $permissionProfileId = $input['permission_profile_id'] ?? null;
            $societiesJson = json_encode(normalizeUserSocieties($input['societies'] ?? ['lcom']));
            
            $stmt = $pdo->prepare("
                INSERT INTO users (username, password, nom, prenom, email, role, role_professionnel, role_professionnel_autre, permission_profile_id, societies) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$username, $hashedPassword, $nom, $prenom, $email, $role, $roleProfessionnel, $roleProfessionnelAutre, $permissionProfileId, $societiesJson]);
            
            $newUserId = $pdo->lastInsertId();
            
            // Ajouter les permissions
            $stmt = $pdo->prepare("
                INSERT INTO user_permissions (user_id, section, can_view, can_edit) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit)
            ");
            
            foreach ($permissions as $section => $perms) {
                $stmt->execute([
                    $newUserId,
                    $section,
                    $perms['can_view'] ? 1 : 0,
                    $perms['can_edit'] ? 1 : 0
                ]);
            }
            
            echo json_encode(['success' => true, 'user_id' => $newUserId]);
            break;
            
        case 'PUT':
            // Modifier un utilisateur
            $input = json_decode(file_get_contents('php://input'), true);
            $targetUserId = $input['id'] ?? 0;
            
            if (!$targetUserId) {
                http_response_code(400);
                echo json_encode(['error' => 'ID utilisateur requis']);
                exit;
            }

            $isSelfEdit = (int)$targetUserId === (int)$userId;

            if ($isSelfEdit) {
                // Auto-édition : infos personnelles + permissions (pas le rôle système).
                $nom = $input['nom'] ?? null;
                $prenom = $input['prenom'] ?? null;
                $email = $input['email'] ?? null;
                $roleProfessionnel = $input['role_professionnel'] ?? null;
                $roleProfessionnelAutre = $input['role_professionnel_autre'] ?? null;
                $password = $input['password'] ?? null;
                $permissions = $input['permissions'] ?? null;

                $updates = [];
                $params = [];

                if ($nom !== null) {
                    $updates[] = "nom = ?";
                    $params[] = $nom;
                }
                if ($prenom !== null) {
                    $updates[] = "prenom = ?";
                    $params[] = $prenom;
                }
                if ($email !== null) {
                    $updates[] = "email = ?";
                    $params[] = $email;
                }
                if ($roleProfessionnel !== null) {
                    $updates[] = "role_professionnel = ?";
                    $params[] = $roleProfessionnel;
                }
                if ($roleProfessionnelAutre !== null) {
                    $updates[] = "role_professionnel_autre = ?";
                    $params[] = $roleProfessionnelAutre;
                }
                if (isset($input['permission_profile_id'])) {
                    $updates[] = "permission_profile_id = ?";
                    $params[] = $input['permission_profile_id'] ?: null;
                }
                if ($password !== null && $password !== '') {
                    $updates[] = "password = ?";
                    $params[] = password_hash($password, PASSWORD_DEFAULT);
                }

                if (!empty($updates)) {
                    $params[] = $targetUserId;
                    $stmt = $pdo->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?");
                    $stmt->execute($params);
                }

                if ($permissions !== null) {
                    $stmt = $pdo->prepare("DELETE FROM user_permissions WHERE user_id = ?");
                    $stmt->execute([$targetUserId]);

                    $stmt = $pdo->prepare("
                        INSERT INTO user_permissions (user_id, section, can_view, can_edit) 
                        VALUES (?, ?, ?, ?)
                    ");

                    foreach ($permissions as $section => $perms) {
                        $stmt->execute([
                            $targetUserId,
                            $section,
                            !empty($perms['can_view']) ? 1 : 0,
                            !empty($perms['can_edit']) ? 1 : 0
                        ]);
                    }
                }

                echo json_encode(['success' => true, 'self_edit' => true]);
                break;
            }
            
            $nom = $input['nom'] ?? null;
            $prenom = $input['prenom'] ?? null;
            $email = $input['email'] ?? null;
            $role = $input['role'] ?? null;
            $roleProfessionnel = $input['role_professionnel'] ?? null;
            $roleProfessionnelAutre = $input['role_professionnel_autre'] ?? null;
            $password = $input['password'] ?? null;
            $permissions = $input['permissions'] ?? null;
            
            // Mettre à jour les informations de base
            $updates = [];
            $params = [];
            
            if ($nom !== null) {
                $updates[] = "nom = ?";
                $params[] = $nom;
            }
            if ($prenom !== null) {
                $updates[] = "prenom = ?";
                $params[] = $prenom;
            }
            if ($email !== null) {
                $updates[] = "email = ?";
                $params[] = $email;
            }
            if ($role !== null) {
                $updates[] = "role = ?";
                $params[] = $role;
            }
            if ($roleProfessionnel !== null) {
                $updates[] = "role_professionnel = ?";
                $params[] = $roleProfessionnel;
            }
            if ($roleProfessionnelAutre !== null) {
                $updates[] = "role_professionnel_autre = ?";
                $params[] = $roleProfessionnelAutre;
            }
            if (isset($input['permission_profile_id'])) {
                $updates[] = "permission_profile_id = ?";
                $params[] = $input['permission_profile_id'] ?: null;
            }
            if (isset($input['societies'])) {
                $updates[] = "societies = ?";
                $params[] = json_encode(normalizeUserSocieties($input['societies']));
            }
            if ($password !== null && !empty($password)) {
                $updates[] = "password = ?";
                $params[] = password_hash($password, PASSWORD_DEFAULT);
            }
            
            if (!empty($updates)) {
                $params[] = $targetUserId;
                $stmt = $pdo->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?");
                $stmt->execute($params);
            }
            
            // Mettre à jour les permissions
            if ($permissions !== null) {
                $stmt = $pdo->prepare("DELETE FROM user_permissions WHERE user_id = ?");
                $stmt->execute([$targetUserId]);
                
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
            }
            
            echo json_encode(['success' => true]);
            break;
            
        case 'DELETE':
            // Supprimer un utilisateur
            $input = json_decode(file_get_contents('php://input'), true);
            $targetUserId = $input['id'] ?? 0;
            
            if (!$targetUserId) {
                http_response_code(400);
                echo json_encode(['error' => 'ID utilisateur requis']);
                exit;
            }
            
            // Ne pas permettre de supprimer son propre compte
            if ($targetUserId == $userId) {
                http_response_code(400);
                echo json_encode(['error' => 'Vous ne pouvez pas supprimer votre propre compte']);
                exit;
            }
            
            $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
            $stmt->execute([$targetUserId]);
            
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
