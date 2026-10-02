<?php
/**
 * users_list.php — Liste des utilisateurs accessible à TOUS les utilisateurs authentifiés
 * 
 * Retourne les infos de base des utilisateurs (nom, email, téléphone, rôle)
 * pour les assignations, la carte contacts, etc.
 * 
 * Contrairement à users.php qui requiert le rôle admin,
 * ce endpoint est accessible à tout utilisateur connecté avec un token valide.
 * 
 * GET  → Retourne { success: true, users: [...] }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- Authentification via config.php (même méthode que messaging.php, users.php, etc.) ---

require_once __DIR__ . '/config.php';
$userId = verifyToken();
$pdo = getDB();

// --- Retourner la liste des utilisateurs (champs non-sensibles uniquement) ---

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->query("SELECT 
            id, 
            username, 
            COALESCE(nom, '') as nom, 
            COALESCE(prenom, '') as prenom, 
            COALESCE(NULLIF(CONCAT(TRIM(prenom), ' ', TRIM(nom)), ' '), username) as name,
            COALESCE(email, '') as email, 
            COALESCE(role, 'user') as role,
            COALESCE(role_professionnel, '') as role_professionnel
        FROM users 
        ORDER BY prenom ASC, nom ASC, username ASC");
        
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($users as &$user) {
            if (empty(trim($user['name']))) {
                $user['name'] = $user['username'];
            }
            $user['email'] = $user['email'] ?: '';
        }
        unset($user);
        
        echo json_encode([
            'success' => true,
            'users' => $users
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Erreur récupération utilisateurs: ' . $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée. Utilisez GET.']);
}