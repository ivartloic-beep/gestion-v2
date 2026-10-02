<?php
/**
 * API Projects - Gestion des projets (tournées, spectacles)
 * GET: récupère tous les projets
 * POST: sauvegarde les projets
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

// Créer la table projects si elle n'existe pas
$pdo->exec("
    CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(50) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

/**
 * Nettoyer les données corrompues des projets
 * Corrige les champs qui doivent être des objets {} mais qui ont été stockés comme tableaux []
 */
function sanitizeProjectData($projects) {
    if (!is_array($projects)) return [];
    
    foreach ($projects as &$project) {
        // tech doit être un objet associatif, pas un tableau indexé
        if (isset($project['tech'])) {
            // Si tech est un tableau vide [] ou un tableau indexé, le convertir en objet
            if (is_array($project['tech']) && (empty($project['tech']) || array_keys($project['tech']) === range(0, count($project['tech']) - 1))) {
                // Vérifier si c'est vraiment un tableau indexé (pas associatif)
                if (empty($project['tech']) || !is_string(array_keys($project['tech'])[0])) {
                    $project['tech'] = new stdClass(); // Force {} en JSON
                }
            }
            // Si tech est un objet/tableau associatif, vérifier ses sous-propriétés
            if (is_array($project['tech']) || is_object($project['tech'])) {
                $tech = (array) $project['tech'];
                // notes doit être un objet
                if (isset($tech['notes']) && is_array($tech['notes'])) {
                    if (empty($tech['notes']) || array_keys($tech['notes']) === range(0, count($tech['notes']) - 1)) {
                        $tech['notes'] = new stdClass();
                    }
                }
                $project['tech'] = $tech;
            }
        }
        
        // billetterie doit être un objet associatif
        // billetterie est un tableau indexé de catégories de billets — le laisser tel quel
        // Ne PAS le convertir en objet stdClass
    }
    unset($project);
    
    return $projects;
}

try {
    switch ($method) {
        case 'GET':
            // Récupérer tous les projets (stockés dans une seule ligne id='all')
            $stmt = $pdo->prepare("SELECT data FROM projects WHERE id = 'all'");
            $stmt->execute();
            $row = $stmt->fetch();
            
            if ($row && $row['data']) {
                $projects = json_decode($row['data'], true);
                if (!is_array($projects)) {
                    $projects = [];
                }
                // Nettoyer les données corrompues avant de les renvoyer
                $projects = sanitizeProjectData($projects);
            } else {
                $projects = [];
            }
            
            echo json_encode([
                'success' => true,
                'projects' => $projects
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || !isset($input['projects'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Données projets manquantes']);
                exit;
            }
            
            $projects = $input['projects'];
            if (!is_array($projects)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Le format des projets est invalide']);
                exit;
            }
            
            // Nettoyer les données avant de sauvegarder
            $projects = sanitizeProjectData($projects);
            
            $projectsJson = json_encode($projects, JSON_UNESCAPED_UNICODE);
            
            // Vérifier que l'encodage JSON n'a pas échoué
            if ($projectsJson === false) {
                error_log('projects.php ERROR: json_encode failed: ' . json_last_error_msg());
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Erreur encodage JSON: ' . json_last_error_msg()]);
                exit;
            }
            
            $stmt = $pdo->prepare("
                INSERT INTO projects (id, data) VALUES ('all', ?)
                ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
            ");
            $stmt->execute([$projectsJson]);
            
            echo json_encode(['success' => true, 'message' => 'Projets sauvegardés']);
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Méthode non autorisée']);
    }
} catch (PDOException $e) {
    error_log('projects.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur: ' . $e->getMessage()]);
} catch (Exception $e) {
    error_log('projects.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>