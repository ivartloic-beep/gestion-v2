<?php
/**
 * API Prévisionnels — stockage serveur (partagé entre utilisateurs)
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
verifyToken();
$pdo = getDB();

const PREVISIONNELS_STORE_ID = 'default';

$pdo->exec("
    CREATE TABLE IF NOT EXISTS previsionnels_store (
        id VARCHAR(32) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

function getPrevisionnelsFromDb(PDO $pdo): array
{
    $stmt = $pdo->prepare('SELECT data FROM previsionnels_store WHERE id = ?');
    $stmt->execute([PREVISIONNELS_STORE_ID]);
    $row = $stmt->fetch();

    if (!$row || $row['data'] === '' || $row['data'] === null) {
        return [];
    }

    $decoded = json_decode($row['data'], true);
    return is_array($decoded) ? $decoded : [];
}

function savePrevisionnelsToDb(PDO $pdo, array $previsionnels): void
{
    $json = json_encode(array_values($previsionnels), JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare('
        INSERT INTO previsionnels_store (id, data) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP
    ');
    $stmt->execute([PREVISIONNELS_STORE_ID, $json]);
}

function mergePrevisionnelsById(array $existing, array $incoming): array
{
    $byId = [];
    foreach ($existing as $item) {
        if (is_array($item) && isset($item['id'])) {
            $byId[$item['id']] = $item;
        }
    }
    $added = 0;
    foreach ($incoming as $item) {
        if (!is_array($item) || !isset($item['id'])) {
            continue;
        }
        if (!isset($byId[$item['id']])) {
            $byId[$item['id']] = $item;
            $added++;
        }
    }
    return [array_values($byId), $added];
}

try {
    if ($method === 'GET') {
        $previsionnels = getPrevisionnelsFromDb($pdo);
        echo json_encode(['success' => true, 'previsionnels' => $previsionnels], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Body JSON invalide']);
            exit;
        }

        $action = $input['action'] ?? 'save';

        if ($action === 'migrate_from_local') {
            $local = $input['previsionnels'] ?? [];
            if (!is_array($local)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'previsionnels doit être un tableau']);
                exit;
            }

            $existing = getPrevisionnelsFromDb($pdo);
            [$merged, $added] = mergePrevisionnelsById($existing, $local);
            savePrevisionnelsToDb($pdo, $merged);

            echo json_encode([
                'success' => true,
                'added' => $added,
                'total' => count($merged)
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (!array_key_exists('previsionnels', $input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Tableau previsionnels manquant']);
            exit;
        }
        if (!is_array($input['previsionnels'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'previsionnels doit être un tableau']);
            exit;
        }

        savePrevisionnelsToDb($pdo, $input['previsionnels']);
        echo json_encode([
            'success' => true,
            'count' => count($input['previsionnels'])
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Méthode non supportée']);
} catch (PDOException $e) {
    error_log('previsionnels.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
}
