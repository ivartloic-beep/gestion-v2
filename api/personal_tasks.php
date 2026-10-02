<?php
/**
 * Tâches personnelles du Bureau.
 * Stockage serveur : une tâche assignée à X apparaît dans la liste de X, pas du créateur.
 */
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

function personalTasksEnsureColumns($pdo) {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS personal_tasks (
                id VARCHAR(64) PRIMARY KEY,
                created_by INT NOT NULL,
                assigned_to INT NULL,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                priority VARCHAR(20) DEFAULT 'medium',
                due_date DATE NULL,
                completed TINYINT(1) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'todo',
                notes TEXT NULL,
                documents JSON NULL,
                activities JSON NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_assigned (assigned_to),
                INDEX idx_created (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (PDOException $e) {
        error_log('personal_tasks create: ' . $e->getMessage());
    }
    $alters = [
        "ALTER TABLE personal_tasks ADD COLUMN status VARCHAR(20) DEFAULT 'todo'",
        "ALTER TABLE personal_tasks ADD COLUMN notes TEXT NULL",
        "ALTER TABLE personal_tasks ADD COLUMN documents JSON NULL",
        "ALTER TABLE personal_tasks ADD COLUMN activities JSON NULL",
    ];
    foreach ($alters as $sql) {
        try { $pdo->exec($sql); } catch (PDOException $e) { /* colonne existante */ }
    }
}

function personalTasksRowToArray($r) {
    $docs = [];
    if (!empty($r['documents'])) {
        $decoded = json_decode($r['documents'], true);
        if (is_array($decoded)) $docs = $decoded;
    }
    $acts = [];
    if (!empty($r['activities'])) {
        $decoded = json_decode($r['activities'], true);
        if (is_array($decoded)) $acts = $decoded;
    }
    $completed = (bool)$r['completed'];
    $status = $r['status'] ?? ($completed ? 'done' : 'todo');
    return [
        'id' => $r['id'],
        'createdBy' => (int)$r['created_by'],
        'assignedTo' => $r['assigned_to'] ? (int)$r['assigned_to'] : null,
        'title' => $r['title'],
        'description' => $r['description'],
        'category' => $r['category'],
        'priority' => $r['priority'] ?? 'medium',
        'dueDate' => $r['due_date'],
        'completed' => $completed,
        'status' => $status,
        'notes' => $r['notes'] ?? '',
        'documents' => $docs,
        'activities' => $acts,
        'createdAt' => $r['created_at']
    ];
}

personalTasksEnsureColumns($pdo);

try {
    switch ($method) {
        case 'GET':
            $scope = $_GET['scope'] ?? 'mine';
            if ($scope === 'assigned_by_me') {
                $stmt = $pdo->prepare("
                    SELECT id, created_by, assigned_to, title, description, category, priority, due_date, completed, status, notes, documents, activities, created_at
                    FROM personal_tasks
                    WHERE created_by = ? AND assigned_to IS NOT NULL AND assigned_to != ?
                    ORDER BY completed ASC, created_at DESC
                ");
                $stmt->execute([$userId, $userId]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT id, created_by, assigned_to, title, description, category, priority, due_date, completed, status, notes, documents, activities, created_at
                    FROM personal_tasks
                    WHERE assigned_to = ? OR (assigned_to IS NULL AND created_by = ?)
                    ORDER BY completed ASC, created_at DESC
                ");
                $stmt->execute([$userId, $userId]);
            }
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $tasks = array_map('personalTasksRowToArray', $rows);
            echo json_encode(['success' => true, 'tasks' => $tasks]);
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            $id = $input['id'] ?? ('pt_' . time() . '_' . bin2hex(random_bytes(4)));
            $assignedTo = !empty($input['assignedTo']) ? (int)$input['assignedTo'] : null;
            $title = trim($input['title'] ?? '');
            if (!$title) {
                http_response_code(400);
                echo json_encode(['error' => 'Titre requis']);
                exit;
            }
            $stmt = $pdo->prepare("
                INSERT INTO personal_tasks (id, created_by, assigned_to, title, description, category, priority, due_date, completed, status, notes, documents, activities)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'todo', '', '[]', '[]')
            ");
            $stmt->execute([
                $id,
                $userId,
                $assignedTo,
                $title,
                $input['description'] ?? '',
                $input['category'] ?? '',
                $input['priority'] ?? 'medium',
                !empty($input['dueDate']) ? $input['dueDate'] : null
            ]);
            echo json_encode(['success' => true, 'id' => $id]);
            break;

        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);
            $taskId = $input['id'] ?? '';
            if (!$taskId) {
                http_response_code(400);
                echo json_encode(['error' => 'ID requis']);
                exit;
            }
            $allowed = $pdo->prepare("
                SELECT id FROM personal_tasks 
                WHERE id = ? AND (created_by = ? OR assigned_to = ?)
            ");
            $allowed->execute([$taskId, $userId, $userId]);
            if ($allowed->rowCount() === 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Tâche introuvable']);
                exit;
            }
            $updates = [];
            $params = [];
            if (isset($input['completed'])) {
                $updates[] = 'completed = ?';
                $params[] = (int)(bool)$input['completed'];
            }
            if (isset($input['status'])) {
                $updates[] = 'status = ?';
                $params[] = $input['status'];
                if (!isset($input['completed'])) {
                    $updates[] = 'completed = ?';
                    $params[] = (int)($input['status'] === 'done');
                }
            }
            if (isset($input['title'])) {
                $updates[] = 'title = ?';
                $params[] = trim($input['title']);
            }
            if (array_key_exists('description', $input)) {
                $updates[] = 'description = ?';
                $params[] = $input['description'] ?? '';
            }
            if (array_key_exists('category', $input)) {
                $updates[] = 'category = ?';
                $params[] = $input['category'] ?? '';
            }
            if (isset($input['priority'])) {
                $updates[] = 'priority = ?';
                $params[] = $input['priority'];
            }
            if (array_key_exists('dueDate', $input)) {
                $updates[] = 'due_date = ?';
                $params[] = !empty($input['dueDate']) ? $input['dueDate'] : null;
            }
            if (array_key_exists('assignedTo', $input)) {
                $updates[] = 'assigned_to = ?';
                $params[] = !empty($input['assignedTo']) ? (int)$input['assignedTo'] : null;
            }
            if (array_key_exists('notes', $input)) {
                $updates[] = 'notes = ?';
                $params[] = $input['notes'] ?? '';
            }
            if (array_key_exists('documents', $input)) {
                $updates[] = 'documents = ?';
                $params[] = json_encode($input['documents'] ?? [], JSON_UNESCAPED_UNICODE);
            }
            if (array_key_exists('activities', $input)) {
                $updates[] = 'activities = ?';
                $params[] = json_encode($input['activities'] ?? [], JSON_UNESCAPED_UNICODE);
            }
            if (!empty($updates)) {
                $params[] = $taskId;
                $pdo->prepare("UPDATE personal_tasks SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
            }
            echo json_encode(['success' => true]);
            break;

        case 'DELETE':
            $input = json_decode(file_get_contents('php://input'), true);
            $taskId = $input['id'] ?? '';
            if (!$taskId) {
                http_response_code(400);
                echo json_encode(['error' => 'ID requis']);
                exit;
            }
            $stmt = $pdo->prepare("DELETE FROM personal_tasks WHERE id = ? AND (created_by = ? OR assigned_to = ?)");
            $stmt->execute([$taskId, $userId, $userId]);
            echo json_encode(['success' => true]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Méthode non autorisée']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
