<?php
/**
 * API Espaces de travail (Projets L&Com) — projets + templates
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
verifyToken();
$pdo = getDB();

const WP_STORE_ID = 'default';

$pdo->exec("
    CREATE TABLE IF NOT EXISTS work_projects_store (
        id VARCHAR(32) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

function getDefaultWorkProjectsData(): array
{
    return [
        'projects' => [],
        'templates' => [
            [
                'id' => 'tpl_comm',
                'name' => 'Communication',
                'description' => 'Campagne, affichage, RP',
                'color' => '#9b59b6',
                'icon' => '📣',
                'defaultTasks' => [
                    ['title' => 'Brief client', 'description' => 'Recueillir les besoins', 'dueDays' => 0],
                    ['title' => 'Proposition créative', 'description' => '', 'dueDays' => 5],
                    ['title' => 'Validation client', 'description' => '', 'dueDays' => 10],
                    ['title' => 'Production & livraison', 'description' => '', 'dueDays' => 21],
                ],
                'order' => 0,
                'createdAt' => date('c'),
            ],
            [
                'id' => 'tpl_commande',
                'name' => 'Commande client',
                'description' => 'Vente produit ou prestation',
                'color' => '#27ae60',
                'icon' => '🛒',
                'defaultTasks' => [
                    ['title' => 'Devis', 'description' => '', 'dueDays' => 0],
                    ['title' => 'Confirmation commande', 'description' => '', 'dueDays' => 3],
                    ['title' => 'Préparation / production', 'description' => '', 'dueDays' => 7],
                    ['title' => 'Livraison', 'description' => '', 'dueDays' => 14],
                    ['title' => 'Facturation', 'description' => '', 'dueDays' => 21],
                ],
                'order' => 1,
                'createdAt' => date('c'),
            ],
            [
                'id' => 'tpl_mairie',
                'name' => 'Dossier mairie',
                'description' => 'Prospection et suivi collectivité',
                'color' => '#3498db',
                'icon' => '🏛️',
                'defaultTasks' => [
                    ['title' => 'Premier contact', 'description' => '', 'dueDays' => 0],
                    ['title' => 'Envoi dossier / proposition', 'description' => '', 'dueDays' => 7],
                    ['title' => 'Relance', 'description' => '', 'dueDays' => 14],
                    ['title' => 'Négociation', 'description' => '', 'dueDays' => 21],
                ],
                'order' => 2,
                'createdAt' => date('c'),
            ],
        ],
    ];
}

function getOrMigrateWorkProjects(PDO $pdo): array
{
    $stmt = $pdo->prepare('SELECT data FROM work_projects_store WHERE id = ?');
    $stmt->execute([WP_STORE_ID]);
    $row = $stmt->fetch();

    if ($row && isset($row['data']) && $row['data'] !== '') {
        $decoded = json_decode($row['data'], true);
        if (is_array($decoded)) {
            if (!isset($decoded['projects'])) {
                $decoded['projects'] = [];
            }
            if (!isset($decoded['templates']) || !is_array($decoded['templates']) || count($decoded['templates']) === 0) {
                $defaults = getDefaultWorkProjectsData();
                $decoded['templates'] = $defaults['templates'];
            }
            return $decoded;
        }
    }

    $data = getDefaultWorkProjectsData();
    $json = json_encode($data, JSON_UNESCAPED_UNICODE);
    $ins = $pdo->prepare('
        INSERT INTO work_projects_store (id, data) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
    ');
    $ins->execute([WP_STORE_ID, $json]);

    return $data;
}

try {
    if ($method === 'GET') {
        $data = getOrMigrateWorkProjects($pdo);
        echo json_encode(['success' => true, 'workProjects' => $data], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !array_key_exists('workProjects', $input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Objet workProjects manquant']);
            exit;
        }
        if (!is_array($input['workProjects'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'workProjects doit être un objet']);
            exit;
        }

        $existing = getOrMigrateWorkProjects($pdo);
        $incoming = $input['workProjects'];
        $existingProjects = $existing['projects'] ?? [];
        $incomingProjects = $incoming['projects'] ?? [];

        // Ne jamais effacer tous les projets par une sauvegarde accidentelle (liste vide côté client)
        if (count($existingProjects) > 0 && count($incomingProjects) === 0 && empty($input['forceEmptyProjects'])) {
            $incoming['projects'] = $existingProjects;
        }

        $json = json_encode($incoming, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Encodage JSON impossible']);
            exit;
        }

        $stmt = $pdo->prepare('
            INSERT INTO work_projects_store (id, data) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
        ');
        $stmt->execute([WP_STORE_ID, $json]);

        echo json_encode(['success' => true, 'message' => 'Espaces de travail sauvegardés'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
} catch (PDOException $e) {
    error_log('work_projects.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
}
