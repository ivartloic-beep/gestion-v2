<?php
// Configuration de la base de données MySQL
define('DB_HOST', 'votre-host.mysql.db');
define('DB_PORT', null); // ex. 35194 pour Web Cloud Databases — ou mettre host:port dans DB_HOST
define('DB_NAME', 'votre_base');
define('DB_USER', 'votre_user');
define('DB_PASS', 'VOTRE_MOT_DE_PASSE');
define('DB_CHARSET', 'utf8mb4');

// Construit le DSN (supporte DB_HOST = "hostname:port" comme recommandé par OVH)
function buildMysqlDsn() {
    $host = DB_HOST;
    $port = defined('DB_PORT') && DB_PORT ? (int) DB_PORT : null;
    if (strpos($host, ':') !== false) {
        $parts = explode(':', $host, 2);
        $host = $parts[0];
        $port = (int) $parts[1];
    }
    $dsn = 'mysql:host=' . $host;
    if ($port) {
        $dsn .= ';port=' . $port;
    }
    $dsn .= ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    return $dsn;
}

// Configuration de la session
define('SESSION_LIFETIME', 3600 * 24 * 7); // 7 jours d'inactivité

// VAPID keys for Web Push Notifications
define('VAPID_PUBLIC_KEY', 'VOTRE_VAPID_PUBLIC_KEY');
define('VAPID_PRIVATE_KEY', 'VOTRE_VAPID_PRIVATE_KEY');
define('VAPID_SUBJECT', 'mailto:contact@example.com');

// Groq API - Assistant IA (spectacles / tournées)
define('GROQ_API_KEY', 'gsk_VOTRE_CLE_GROQ');

// Chiffrement des mots de passe des boîtes mail (module Mails)
define('MAIL_ENCRYPTION_KEY', 'LcomMails_' . DB_PASS . '_v1');
// URL publique de l'app pour les images de signature dans les e-mails (ex. https://www.example.com/gestion). Vide = détection auto.
define('MAIL_PUBLIC_BASE_URL', '');

// Fonction de connexion à la base de données
function getDB() {
    static $pdo = null;
    
    if ($pdo === null) {
        try {
            $dsn = buildMysqlDsn();
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Erreur de connexion à la base de données']);
            exit;
        }
    }
    
    return $pdo;
}

// Fonction pour vérifier le token de session
function verifyToken() {
    $token = null;
    
    // Debug: logger tous les headers disponibles
    $debugInfo = [
        'HTTP_AUTHORIZATION' => isset($_SERVER['HTTP_AUTHORIZATION']) ? substr($_SERVER['HTTP_AUTHORIZATION'], 0, 20) . '...' : 'non défini',
        'REDIRECT_HTTP_AUTHORIZATION' => isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? substr($_SERVER['REDIRECT_HTTP_AUTHORIZATION'], 0, 20) . '...' : 'non défini',
        'GET_token' => isset($_GET['token']) ? (strlen(trim((string)$_GET['token'])) > 0 ? 'présent' : 'vide') : 'absent',
        'all_headers' => []
    ];
    
    // Token en query string (liens fichiers / nouvel onglet) — prioritaire
    foreach (['token', 'auth', 't'] as $key) {
        if (!$token && isset($_GET[$key])) {
            $candidate = trim((string)$_GET[$key]);
            if ($candidate !== '') {
                $token = $candidate;
                break;
            }
        }
    }
    if (!$token && isset($_POST['token'])) {
        $candidate = trim((string)$_POST['token']);
        if ($candidate !== '') {
            $token = $candidate;
        }
    }
    
    // Chercher le token dans les headers (plusieurs méthodes pour compatibilité OVH)
    // Méthode 1: Header Authorization direct
    if (!$token && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $candidate = str_replace('Bearer ', '', trim($_SERVER['HTTP_AUTHORIZATION']));
        if ($candidate !== '') {
            $token = $candidate;
        }
    }
    // Méthode 2: Redirection Apache (si mod_rewrite passe le header)
    if (!$token && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $candidate = str_replace('Bearer ', '', trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']));
        if ($candidate !== '') {
            $token = $candidate;
        }
    }
    // Méthode 3: apache_request_headers() (fonctionne en Apache mod_php)
    if (!$token && function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        // Normaliser les clés (première lettre en majuscule)
        $requestHeaders = array_combine(
            array_map('ucwords', array_keys($requestHeaders)),
            array_values($requestHeaders)
        );
        $debugInfo['all_headers'] = array_keys($requestHeaders);
        if (isset($requestHeaders['Authorization'])) {
            $candidate = str_replace('Bearer ', '', trim($requestHeaders['Authorization']));
            if ($candidate !== '') {
                $token = $candidate;
            }
        } elseif (isset($requestHeaders['authorization'])) {
            $candidate = str_replace('Bearer ', '', trim($requestHeaders['authorization']));
            if ($candidate !== '') {
                $token = $candidate;
            }
        }
    }
    // Méthode 4: getallheaders() (fallback pour certains serveurs)
    if (!$token && function_exists('getallheaders')) {
        $headers = getallheaders();
        $debugInfo['all_headers'] = array_keys($headers);
        if (isset($headers['Authorization'])) {
            $candidate = str_replace('Bearer ', '', trim($headers['Authorization']));
            if ($candidate !== '') {
                $token = $candidate;
            }
        } elseif (isset($headers['authorization'])) {
            $candidate = str_replace('Bearer ', '', trim($headers['authorization']));
            if ($candidate !== '') {
                $token = $candidate;
            }
        }
    }
    // Méthode 5: Header personnalisé X-Auth-Token (utilisé comme fallback)
    if (!$token && isset($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        $candidate = trim($_SERVER['HTTP_X_AUTH_TOKEN']);
        if ($candidate !== '') {
            $token = $candidate;
        }
    }
    // Méthode 6: Dans le body JSON (pour les requêtes POST/PUT)
    if (!$token) {
        $input = json_decode(file_get_contents('php://input'), true);
        if (isset($input['token'])) {
            $candidate = trim((string)$input['token']);
            if ($candidate !== '') {
                $token = $candidate;
            }
        }
    }
    
    if (!$token) {
        // Log pour déboguer
        error_log('verifyToken: Token manquant. Debug: ' . json_encode($debugInfo));
        http_response_code(401);
        echo json_encode(['error' => 'Token manquant', 'debug' => $debugInfo]);
        exit;
    }
    
    // Nettoyer le token (enlever les espaces, etc.)
    $token = trim($token);
    
    $pdo = getDB();
    
    // Debug: logger le token reçu (tronqué pour sécurité)
    error_log('verifyToken: Token reçu: ' . substr($token, 0, 20) . '... (longueur: ' . strlen($token) . ')');
    
    $stmt = $pdo->prepare("SELECT user_id, expires_at FROM user_sessions WHERE token = ? AND expires_at > NOW()");
    $stmt->execute([$token]);
    $session = $stmt->fetch();
    
    if (!$session) {
        // Vérifier si le token existe mais est expiré
        $stmt2 = $pdo->prepare("SELECT user_id, expires_at FROM user_sessions WHERE token = ?");
        $stmt2->execute([$token]);
        $expiredSession = $stmt2->fetch();
        
        if ($expiredSession) {
            error_log('verifyToken: Token trouvé mais expiré. Expires_at: ' . $expiredSession['expires_at']);
            http_response_code(401);
            echo json_encode(['error' => 'Token expiré']);
            exit;
        } else {
            error_log('verifyToken: Token non trouvé dans la base de données');
            http_response_code(401);
            echo json_encode(['error' => 'Token invalide']);
            exit;
        }
    }
    
    error_log('verifyToken: Token valide pour user_id: ' . $session['user_id']);
    
    // Renouvellement glissant : repousser l'expiration à chaque appel API réussi
    $newExpiry = date('Y-m-d H:i:s', time() + SESSION_LIFETIME);
    $stmtUpdate = $pdo->prepare("UPDATE user_sessions SET expires_at = ? WHERE token = ?");
    $stmtUpdate->execute([$newExpiry, $token]);
    
    return $session['user_id'];
}

// Fonction pour obtenir les informations de l'utilisateur
function getUserInfo($userId) {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id, username, nom, prenom, email, role FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

/** Société unique : tout est rattaché à L&Com (legacy production → lcom). */
function normalizeUserSocieties($societies) {
    return ['lcom'];
}

// Fonction pour obtenir les permissions d'un utilisateur
function getUserPermissions($userId) {
    $pdo = getDB();
    
    // Récupérer l'utilisateur avec son profil de permissions
    $stmt = $pdo->prepare("SELECT role, permission_profile_id FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    $permissions = [];
    
    // Si l'utilisateur a un profil de permissions, utiliser les permissions du profil
    if ($user && $user['permission_profile_id']) {
        $stmt = $pdo->prepare("
            SELECT section, can_view, can_edit 
            FROM permission_profile_permissions 
            WHERE profile_id = ?
        ");
        $stmt->execute([$user['permission_profile_id']]);
        
        while ($row = $stmt->fetch()) {
            $permissions[$row['section']] = [
                'can_view' => (bool)$row['can_view'],
                'can_edit' => (bool)$row['can_edit']
            ];
        }
    }
    
    // Admin sans profil : droits complets par défaut (surchargeables ci-dessous)
    if ($user && $user['role'] === 'admin' && !$user['permission_profile_id']) {
        $sections = ['budget', 'billetterie', 'visuels', 'technique', 'taches'];
        foreach ($sections as $section) {
            $permissions[$section] = ['can_view' => true, 'can_edit' => true];
        }
    }
    
    // Permissions personnalisées : priorité sur profil et défauts admin
    $stmt = $pdo->prepare("SELECT section, can_view, can_edit FROM user_permissions WHERE user_id = ?");
    $stmt->execute([$userId]);
    
    while ($row = $stmt->fetch()) {
        $permissions[$row['section']] = [
            'can_view' => (bool)$row['can_view'],
            'can_edit' => (bool)$row['can_edit']
        ];
    }
    
    // Les admins ont toujours accès à la section admin
    if ($user && $user['role'] === 'admin') {
        $permissions['admin'] = ['can_view' => true, 'can_edit' => true];
    }
    
    return $permissions;
}

// Fonction pour vérifier une permission
function checkPermission($userId, $section, $action = 'view') {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT role, permission_profile_id FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    // Les admins ont toujours accès à la section admin
    if ($section === 'admin' && $user && $user['role'] === 'admin') {
        return true;
    }
    
    $permissions = getUserPermissions($userId);
    
    if (!isset($permissions[$section])) {
        return false;
    }
    
    if ($action === 'view') {
        return $permissions[$section]['can_view'];
    } elseif ($action === 'edit') {
        return $permissions[$section]['can_edit'];
    }
    
    return false;
}

// Fonction pour générer un token de session
function generateToken($length = 64) {
    return bin2hex(random_bytes($length / 2));
}

// Fonction pour créer une session
function createSession($userId) {
    $pdo = getDB();
    $token = generateToken();
    $expiresAt = date('Y-m-d H:i:s', time() + SESSION_LIFETIME);
    
    $stmt = $pdo->prepare("INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)");
    $stmt->execute([$userId, $token, $expiresAt]);
    
    return $token;
}

// Fonction pour supprimer une session
function deleteSession($token) {
    $pdo = getDB();
    $stmt = $pdo->prepare("DELETE FROM user_sessions WHERE token = ?");
    $stmt->execute([$token]);
}

// Fonction pour nettoyer les sessions expirées
function cleanExpiredSessions() {
    $pdo = getDB();
    $stmt = $pdo->prepare("DELETE FROM user_sessions WHERE expires_at < NOW()");
    $stmt->execute();
}

// Headers CORS
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
?>
