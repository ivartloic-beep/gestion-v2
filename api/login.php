<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$username = $input['username'] ?? '';
$password = $input['password'] ?? '';

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'Username et password requis']);
    exit;
}

try {
    error_log("login.php: Tentative de connexion pour username: " . $username);
    
    $pdo = getDB();
    error_log("login.php: Connexion à la base de données réussie");
    
    // Nettoyer les sessions expirées
    cleanExpiredSessions();
    
    // Chercher l'utilisateur
    $stmt = $pdo->prepare("SELECT id, username, password, nom, prenom, email, role, permission_profile_id, COALESCE(societies, '[\"lcom\"]') as societies FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    
    if (!$user) {
        error_log("login.php: Utilisateur non trouvé: " . $username);
        http_response_code(401);
        echo json_encode(['error' => 'Identifiants incorrects']);
        exit;
    }
    
    error_log("login.php: Utilisateur trouvé, ID: " . $user['id']);
    
    if (!password_verify($password, $user['password'])) {
        error_log("login.php: Mot de passe incorrect pour username: " . $username);
        http_response_code(401);
        echo json_encode(['error' => 'Identifiants incorrects']);
        exit;
    }
    
    error_log("login.php: Mot de passe correct, création de la session");
    
    // Créer une session
    $token = createSession($user['id']);
    error_log("login.php: Session créée, token: " . substr($token, 0, 20) . "...");
    
    // Récupérer les permissions
    $permissions = getUserPermissions($user['id']);
    error_log("login.php: Permissions récupérées, nombre de sections: " . count($permissions));
    
    $societies = normalizeUserSocieties($user['societies'] ?? '["lcom"]');
    // Retourner les informations
    $response = [
        'success' => true,
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'nom' => $user['nom'],
            'prenom' => $user['prenom'],
            'email' => $user['email'],
            'role' => $user['role'],
            'permission_profile_id' => $user['permission_profile_id'],
            'societies' => $societies
        ],
        'permissions' => $permissions
    ];
    
    error_log("login.php: Connexion réussie pour user_id: " . $user['id']);
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    
} catch (PDOException $e) {
    error_log("login.php: ERREUR PDO: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage()]);
} catch (Exception $e) {
    error_log("login.php: ERREUR GENERALE: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage()]);
}
?>
