<?php
/**
 * API Catalogue — stockage séparé des fiches catalogue (hors blob settings)
 * Évite qu'une sauvegarde générale des paramètres écrase tout le catalogue.
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
verifyToken();
$pdo = getDB();

const CATALOGUE_STORE_ID = 'default';

$pdo->exec("
    CREATE TABLE IF NOT EXISTS catalogue_store (
        id VARCHAR(32) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

/**
 * Lit le catalogue depuis catalogue_store, ou migre depuis settings.data.catalogue une fois.
 */
function getOrMigrateCatalogue(PDO $pdo): array
{
    $stmt = $pdo->prepare('SELECT data FROM catalogue_store WHERE id = ?');
    $stmt->execute([CATALOGUE_STORE_ID]);
    $row = $stmt->fetch();

    if ($row && isset($row['data']) && $row['data'] !== '') {
        $decoded = json_decode($row['data'], true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    // Migration : catalogue encore dans settings (id=1)
    $catalogueFromSettings = [];
    $sStmt = $pdo->query('SELECT data FROM settings WHERE id = 1');
    $sRow = $sStmt ? $sStmt->fetch() : null;
    if ($sRow && !empty($sRow['data'])) {
        $settings = json_decode($sRow['data'], true);
        if (is_array($settings) && isset($settings['catalogue']) && is_array($settings['catalogue'])) {
            $catalogueFromSettings = $settings['catalogue'];
            unset($settings['catalogue']);
            $upd = $pdo->prepare('UPDATE settings SET data = ? WHERE id = 1');
            $upd->execute([json_encode($settings, JSON_UNESCAPED_UNICODE)]);
        }
    }

    $json = json_encode($catalogueFromSettings, JSON_UNESCAPED_UNICODE);
    $ins = $pdo->prepare('
        INSERT INTO catalogue_store (id, data) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
    ');
    $ins->execute([CATALOGUE_STORE_ID, $json]);

    return $catalogueFromSettings;
}

try {
    if ($method === 'GET') {
        $catalogue = getOrMigrateCatalogue($pdo);
        echo json_encode(['success' => true, 'catalogue' => $catalogue], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !array_key_exists('catalogue', $input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Tableau catalogue manquant']);
            exit;
        }
        if (!is_array($input['catalogue'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'catalogue doit être un tableau']);
            exit;
        }

        $json = json_encode($input['catalogue'], JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Encodage JSON impossible']);
            exit;
        }

        $stmt = $pdo->prepare('
            INSERT INTO catalogue_store (id, data) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
        ');
        $stmt->execute([CATALOGUE_STORE_ID, $json]);

        echo json_encode(['success' => true, 'message' => 'Catalogue sauvegardé'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
} catch (PDOException $e) {
    error_log('catalogue.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
}
