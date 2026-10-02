<?php
/**
 * API Notes de frais — persistance serveur (MySQL)
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$userId = (int) verifyToken();
$pdo = getDB();

$pdo->exec("
    CREATE TABLE IF NOT EXISTS notes_frais (
        id VARCHAR(80) PRIMARY KEY,
        user_id INT NOT NULL,
        statut VARCHAR(32) DEFAULT 'brouillon',
        data LONGTEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_statut (statut)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

function ndfCanValidate(int $userId): bool
{
    $user = getUserInfo($userId);
    if ($user && ($user['role'] ?? '') === 'admin') {
        return true;
    }
    $perms = getUserPermissions($userId);
    return !empty($perms['notes_de_frais_validation']['can_view']);
}

function ndfRowToNote(array $row): array
{
    $note = json_decode($row['data'] ?? '{}', true);
    if (!is_array($note)) {
        $note = [];
    }
    if (empty($note['id'])) {
        $note['id'] = $row['id'];
    }
    if (!isset($note['userId']) && isset($row['user_id'])) {
        $note['userId'] = (int) $row['user_id'];
    }
    return $note;
}

try {
    switch ($method) {
        case 'GET':
            $canValidate = ndfCanValidate($userId);
            if ($canValidate) {
                $stmt = $pdo->query('SELECT id, user_id, data FROM notes_frais ORDER BY updated_at DESC');
            } else {
                $stmt = $pdo->prepare('SELECT id, user_id, data FROM notes_frais WHERE user_id = ? ORDER BY updated_at DESC');
                $stmt->execute([$userId]);
            }
            $notes = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $notes[] = ndfRowToNote($row);
            }
            echo json_encode(['success' => true, 'notes' => $notes], JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (!is_array($input) || !isset($input['notes']) || !is_array($input['notes'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Tableau notes manquant']);
                exit;
            }

            $incoming = $input['notes'];
            $canValidate = ndfCanValidate($userId);
            $userIncomingIds = [];

            $upsert = $pdo->prepare("
                INSERT INTO notes_frais (id, user_id, statut, data)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    statut = VALUES(statut),
                    data = VALUES(data),
                    user_id = VALUES(user_id)
            ");

            foreach ($incoming as $note) {
                if (!is_array($note)) {
                    continue;
                }
                $id = trim((string) ($note['id'] ?? ''));
                if ($id === '') {
                    continue;
                }

                $owner = (int) ($note['userId'] ?? $userId);
                if ($owner !== $userId && !$canValidate) {
                    continue;
                }

                if ($owner !== $userId && $canValidate) {
                    $check = $pdo->prepare('SELECT id FROM notes_frais WHERE id = ?');
                    $check->execute([$id]);
                    if (!$check->fetch()) {
                        continue;
                    }
                }

                $note['userId'] = $owner;
                $statut = (string) ($note['statut'] ?? 'brouillon');
                $json = json_encode($note, JSON_UNESCAPED_UNICODE);
                if ($json === false) {
                    continue;
                }

                $upsert->execute([$id, $owner, $statut, $json]);

                if ($owner === $userId) {
                    $userIncomingIds[] = $id;
                }
            }

            // Supprimer les notes de l'utilisateur courant absentes du payload (brouillon supprimé, etc.)
            if (empty($userIncomingIds)) {
                $del = $pdo->prepare('DELETE FROM notes_frais WHERE user_id = ?');
                $del->execute([$userId]);
            } else {
                $placeholders = implode(',', array_fill(0, count($userIncomingIds), '?'));
                $params = array_merge([$userId], $userIncomingIds);
                $del = $pdo->prepare("DELETE FROM notes_frais WHERE user_id = ? AND id NOT IN ($placeholders)");
                $del->execute($params);
            }

            echo json_encode(['success' => true, 'message' => 'Notes de frais sauvegardées'], JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Méthode non autorisée']);
    }
} catch (PDOException $e) {
    error_log('notes_frais.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
}
