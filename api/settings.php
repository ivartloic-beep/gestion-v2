<?php
/**
 * API Settings - Gestion des paramètres de l'application
 * Les paramètres (logo, nom de l'app, etc.) sont stockés de manière GLOBALE
 * pour être partagés entre tous les utilisateurs.
 */
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

// Créer la table settings si elle n'existe pas
$pdo->exec("
    CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY DEFAULT 1,
        data LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

function filterSettingsForUser(array $settings, int $userId): array
{
    if (checkPermission($userId, 'admin', 'view')) {
        return $settings;
    }
    $secretKeys = [
        'billetwebKey', 'billetwebUser',
        'triumPass1', 'triumPass2', 'triumUser1', 'triumUser2', 'triumApiUrl',
        'francebilletPass', 'francebilletUser', 'francebilletStructure',
    ];
    foreach ($secretKeys as $key) {
        unset($settings[$key]);
    }
    return $settings;
}

try {
    if ($method === 'GET') {
        // Charger les paramètres
        $stmt = $pdo->query("SELECT data FROM settings WHERE id = 1");
        $row = $stmt->fetch();
        
        if ($row && $row['data']) {
            $settings = json_decode($row['data'], true);
            if ($settings) {
                // Modules stockés séparément (api/catalogue.php, crm.php)
                if (is_array($settings)) {
                    unset($settings['catalogue'], $settings['crm'], $settings['workProjects']);
                    $settings = filterSettingsForUser($settings, (int)$userId);
                }
                echo json_encode(['success' => true, 'settings' => $settings]);
                exit;
            }
        }
        
        // Paramètres par défaut
        $defaults = [
            'logo' => null,
            'appName' => 'LOGO',
            'reseauxBilletterie' => [],
            'lieux' => [],
            'prestataires' => []
        ];
        echo json_encode(['success' => true, 'settings' => $defaults]);
        
    } elseif ($method === 'POST') {
        if (!checkPermission($userId, 'admin', 'edit')) {
            http_response_code(403);
            echo json_encode(['error' => 'Accès réservé aux administrateurs']);
            exit;
        }

        // Sauvegarder les paramètres
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($input['settings'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Paramètres manquants']);
            exit;
        }
        
        // Ne pas écraser les modules ayant leur propre API
        $settingsToSave = $input['settings'];
        if (is_array($settingsToSave)) {
            unset($settingsToSave['catalogue'], $settingsToSave['crm'], $settingsToSave['workProjects']);
        }
        
        $settingsJson = json_encode($settingsToSave, JSON_UNESCAPED_UNICODE);
        
        $stmt = $pdo->prepare("
            INSERT INTO settings (id, data) VALUES (1, ?)
            ON DUPLICATE KEY UPDATE data = VALUES(data)
        ");
        $stmt->execute([$settingsJson]);
        
        echo json_encode(['success' => true, 'message' => 'Paramètres sauvegardés']);
        
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Méthode non autorisée']);
    }
    
} catch (PDOException $e) {
    error_log('settings.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage()]);
}
?>