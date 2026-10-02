<?php
/**
 * API CRM — stockage séparé (listes, prospects, catégories)
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
verifyToken();
$pdo = getDB();

const CRM_STORE_ID = 'default';

$pdo->exec("
    CREATE TABLE IF NOT EXISTS crm_store (
        id VARCHAR(32) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

function getOrMigrateCrm(PDO $pdo): array
{
    $stmt = $pdo->prepare('SELECT data FROM crm_store WHERE id = ?');
    $stmt->execute([CRM_STORE_ID]);
    $row = $stmt->fetch();

    if ($row && isset($row['data']) && $row['data'] !== '') {
        $decoded = json_decode($row['data'], true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    $fromSettings = ['lists' => [], 'categories' => [], 'activityLines' => [], 'globalAccessUsers' => [], 'deals' => []];
    $sStmt = $pdo->query('SELECT data FROM settings WHERE id = 1');
    $sRow = $sStmt ? $sStmt->fetch() : null;
    if ($sRow && !empty($sRow['data'])) {
        $settings = json_decode($sRow['data'], true);
        if (is_array($settings) && isset($settings['crm']) && is_array($settings['crm'])) {
            $fromSettings = $settings['crm'];
            unset($settings['crm']);
            $upd = $pdo->prepare('UPDATE settings SET data = ? WHERE id = 1');
            $upd->execute([json_encode($settings, JSON_UNESCAPED_UNICODE)]);
        }
    }

    $json = json_encode($fromSettings, JSON_UNESCAPED_UNICODE);
    $ins = $pdo->prepare('
        INSERT INTO crm_store (id, data) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
    ');
    $ins->execute([CRM_STORE_ID, $json]);

    return $fromSettings;
}

try {
    if ($method === 'GET') {
        $crm = getOrMigrateCrm($pdo);
        echo json_encode(['success' => true, 'crm' => $crm], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !array_key_exists('crm', $input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Objet crm manquant']);
            exit;
        }
        if (!is_array($input['crm'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'crm doit être un objet']);
            exit;
        }

        $json = json_encode($input['crm'], JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Encodage JSON impossible']);
            exit;
        }

        $stmt = $pdo->prepare('
            INSERT INTO crm_store (id, data) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
        ');
        $stmt->execute([CRM_STORE_ID, $json]);

        echo json_encode(['success' => true, 'message' => 'CRM sauvegardé'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
} catch (PDOException $e) {
    error_log('crm.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
}
