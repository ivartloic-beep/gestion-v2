<?php
/**
 * CRUD des éléments de l'espace de travail (Mon Bureau).
 * Même pattern d'authentification que personal_tasks.php.
 */
require_once 'config.php';
require_once 'workspace_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

// Créer les tables si nécessaire
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS workspace_elements (
            id VARCHAR(50) PRIMARY KEY,
            project_id VARCHAR(50) DEFAULT NULL,
            type ENUM('page', 'idea', 'mindmap', 'drawing', 'file', 'quicknote', 'folder') NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT 'Sans titre',
            content LONGTEXT DEFAULT NULL,
            visibility ENUM('personal', 'team') NOT NULL DEFAULT 'personal',
            status VARCHAR(50) DEFAULT NULL,
            tags JSON DEFAULT NULL,
            folder_id VARCHAR(50) DEFAULT NULL,
            file_path VARCHAR(500) DEFAULT NULL,
            file_name VARCHAR(255) DEFAULT NULL,
            file_size INT DEFAULT NULL,
            created_by INT NOT NULL,
            updated_by INT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_visibility (visibility),
            INDEX idx_created_by (created_by),
            INDEX idx_type (type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS workspace_folders (
            id VARCHAR(50) PRIMARY KEY,
            parent_id VARCHAR(50) DEFAULT NULL,
            name VARCHAR(255) NOT NULL,
            visibility ENUM('personal', 'team') NOT NULL DEFAULT 'personal',
            created_by INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
} catch (PDOException $e) {
    error_log('workspace: ' . $e->getMessage());
}
// Ajouter access_list et visibilité 'shared' si nécessaire
try {
    $pdo->exec("ALTER TABLE workspace_elements ADD COLUMN access_list JSON DEFAULT NULL");
} catch (PDOException $e) {
    // Colonne existe déjà
}
try {
    $pdo->exec("ALTER TABLE workspace_elements MODIFY COLUMN visibility ENUM('personal', 'team', 'shared') NOT NULL DEFAULT 'personal'");
} catch (PDOException $e) {
    // Déjà à jour
}
try {
    $pdo->exec("ALTER TABLE workspace_elements MODIFY COLUMN type ENUM('page', 'idea', 'mindmap', 'drawing', 'file', 'quicknote', 'folder') NOT NULL");
} catch (PDOException $e) {
    // Déjà à jour
}

try {
    switch ($method) {
        case 'GET':
            $elementId = isset($_GET['id']) ? trim($_GET['id']) : null;
            $getAction = isset($_GET['action']) ? trim($_GET['action']) : '';

            if ($getAction === 'mention_preview' && $elementId) {
                if (!workspaceUserMentionedElement($pdo, $userId, $elementId)) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'error' => 'Ce contenu ne vous a pas été partagé via la messagerie']);
                    exit;
                }
                $stmt = $pdo->prepare("
                    SELECT we.id, we.type, we.title, we.visibility, we.created_by,
                           u.nom AS created_by_nom, u.prenom AS created_by_prenom
                    FROM workspace_elements we
                    LEFT JOIN users u ON u.id = we.created_by
                    WHERE we.id = ?
                ");
                $stmt->execute([$elementId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Élément introuvable']);
                    exit;
                }
                echo json_encode([
                    'success' => true,
                    'preview' => [
                        'id' => $row['id'],
                        'type' => $row['type'],
                        'title' => $row['title'],
                        'created_by_name' => trim(($row['created_by_prenom'] ?? '') . ' ' . ($row['created_by_nom'] ?? '')) ?: null,
                        'requires_access' => !workspaceCanRead($row, $userId),
                    ],
                ]);
                break;
            }

            if ($getAction === 'mention_view' && $elementId) {
                $stmt = $pdo->prepare("
                    SELECT we.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom
                    FROM workspace_elements we
                    LEFT JOIN users u ON u.id = we.created_by
                    WHERE we.id = ?
                ");
                $stmt->execute([$elementId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Élément introuvable']);
                    exit;
                }
                $canRead = workspaceCanRead($row, $userId);
                $mentioned = workspaceUserMentionedElement($pdo, $userId, $elementId);
                if (!$canRead && !$mentioned) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'error' => 'Ce contenu ne vous a pas été partagé via la messagerie']);
                    exit;
                }
                $el = workspaceElementToArray($row, $userId);
                $role = workspaceUserAccessRole($row, $userId);
                if ($role !== 'owner' && $role !== 'editor') {
                    $el['can_edit'] = false;
                    $el['access_role'] = 'viewer';
                    $el['is_ephemeral_view'] = true;
                } else {
                    $el['is_ephemeral_view'] = false;
                }
                echo json_encode(['success' => true, 'element' => $el]);
                break;
            }

            if ($elementId) {
                // Un seul élément
                $stmt = $pdo->prepare("
                    SELECT we.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom
                    FROM workspace_elements we
                    LEFT JOIN users u ON u.id = we.created_by
                    WHERE we.id = ?
                ");
                $stmt->execute([$elementId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Élément introuvable']);
                    exit;
                }
                if (!workspaceCanRead($row, $userId)) {
                    $mentioned = workspaceUserMentionedElement($pdo, $userId, $elementId);
                    http_response_code(403);
                    echo json_encode([
                        'success' => false,
                        'error' => 'Accès refusé',
                        'needs_access' => $mentioned,
                        'element_id' => $elementId,
                    ]);
                    exit;
                }
                echo json_encode(['success' => true, 'element' => workspaceElementToArray($row, $userId)]);
            } else {
                // Liste filtrée par visibility
                $visibility = isset($_GET['visibility']) ? $_GET['visibility'] : 'personal';
                if (!in_array($visibility, ['personal', 'team', 'shared'])) {
                    $visibility = 'personal';
                }
                $projectId = isset($_GET['project_id']) ? trim((string)$_GET['project_id']) : null;
                if ($projectId === '') $projectId = null;
                $type = isset($_GET['type']) ? strtolower(trim((string)$_GET['type'])) : null;
                if ($type === '') $type = null;
                $allowedTypes = ['page', 'idea', 'mindmap', 'drawing', 'file', 'quicknote', 'folder'];
                if ($type && !in_array($type, $allowedTypes)) {
                    $type = null;
                }
                if ($visibility === 'personal') {
                    $sql = "
                        SELECT we.id, we.type, we.title, we.content, we.visibility, we.status, we.tags, we.folder_id,
                               we.file_path, we.file_name, we.file_size, we.created_by, we.created_at, we.updated_at
                        FROM workspace_elements we
                        WHERE we.visibility = 'personal' AND we.created_by = ?
                    ";
                    $params = [$userId];
                    if ($projectId !== null) {
                        $sql .= " AND we.project_id = ? ";
                        $params[] = $projectId;
                    } else {
                        // Par défaut, on ne mélange pas avec des éléments liés à un projet
                        $sql .= " AND we.project_id IS NULL ";
                    }
                    if ($type !== null) {
                        $sql .= " AND we.type = ? ";
                        $params[] = $type;
                    }
                    $sql .= "
                        ORDER BY we.updated_at DESC, we.created_at DESC
                    ";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                } elseif ($visibility === 'shared') {
                    $sql = "
                        SELECT we.id, we.type, we.title, we.content, we.visibility, we.status, we.tags, we.folder_id,
                               we.file_path, we.file_name, we.file_size, we.created_by, we.access_list,
                               we.created_at, we.updated_at,
                               CONCAT(COALESCE(u.prenom,''), ' ', COALESCE(u.nom,'')) AS created_by_name
                        FROM workspace_elements we
                        LEFT JOIN users u ON u.id = we.created_by
                        WHERE we.visibility = 'shared'
                    ";
                    $params = [];
                    if ($projectId !== null) {
                        $sql .= " AND we.project_id = ? ";
                        $params[] = $projectId;
                    } else {
                        $sql .= " AND we.project_id IS NULL ";
                    }
                    if ($type !== null) {
                        $sql .= " AND we.type = ? ";
                        $params[] = $type;
                    }
                    $sql .= " ORDER BY we.updated_at DESC, we.created_at DESC ";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    $rows = array_values(array_filter($stmt->fetchAll(PDO::FETCH_ASSOC), function ($r) use ($userId) {
                        return workspaceCanRead($r, $userId);
                    }));
                } else {
                    $sql = "
                        SELECT we.id, we.type, we.title, we.content, we.visibility, we.status, we.tags, we.folder_id,
                               we.file_path, we.file_name, we.file_size, we.created_by, we.created_at, we.updated_at,
                               CONCAT(COALESCE(u.prenom,''), ' ', COALESCE(u.nom,'')) AS created_by_name
                        FROM workspace_elements we
                        LEFT JOIN users u ON u.id = we.created_by
                        WHERE we.visibility = 'team'
                    ";
                    $params = [];
                    if ($projectId !== null) {
                        $sql .= " AND we.project_id = ? ";
                        $params[] = $projectId;
                    } else {
                        $sql .= " AND we.project_id IS NULL ";
                    }
                    if ($type !== null) {
                        $sql .= " AND we.type = ? ";
                        $params[] = $type;
                    }
                    $sql .= "
                        ORDER BY we.updated_at DESC, we.created_at DESC
                    ";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
                if (!isset($rows)) {
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
                $elements = array_map(function ($r) use ($userId) {
                    $item = [
                        'id' => $r['id'],
                        'type' => $r['type'],
                        'title' => $r['title'],
                        'visibility' => $r['visibility'],
                        'status' => $r['status'],
                        'tags' => $r['tags'] ? json_decode($r['tags'], true) : null,
                        'folder_id' => $r['folder_id'],
                        'file_path' => $r['file_path'],
                        'file_name' => $r['file_name'],
                        'file_size' => $r['file_size'] ? (int)$r['file_size'] : null,
                        'created_by' => (int)$r['created_by'],
                        'created_at' => $r['created_at'],
                        'updated_at' => $r['updated_at'],
                        'access_role' => workspaceUserAccessRole($r, $userId),
                        'can_edit' => workspaceCanEdit($r, $userId),
                        'is_shared_with_me' => (int)$r['created_by'] !== (int)$userId,
                    ];
                    if (($r['type'] ?? '') === 'folder') {
                        $item['content'] = $r['content'] ?? null;
                    }
                    if (isset($r['created_by_name'])) {
                        $item['created_by_name'] = trim($r['created_by_name']) ?: null;
                    }
                    return $item;
                }, $rows);
                echo json_encode(['success' => true, 'elements' => $elements]);
            }
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true) ?: [];

            if (($input['action'] ?? '') === 'grant_access') {
                $elementId = isset($input['element_id']) ? trim($input['element_id']) : '';
                $mode = (isset($input['mode']) && $input['mode'] === 'view') ? 'viewer' : 'editor';
                if (!$elementId) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'ID requis']);
                    exit;
                }
                $stmt = $pdo->prepare("
                    SELECT we.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom
                    FROM workspace_elements we
                    LEFT JOIN users u ON u.id = we.created_by
                    WHERE we.id = ?
                ");
                $stmt->execute([$elementId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Élément introuvable']);
                    exit;
                }
                if ((int)$row['created_by'] === (int)$userId) {
                    echo json_encode(['success' => true, 'element' => workspaceElementToArray($row, $userId)]);
                    break;
                }
                if (!workspaceCanRead($row, $userId) && !workspaceUserMentionedElement($pdo, $userId, $elementId)) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'error' => 'Partage non autorisé']);
                    exit;
                }
                $entries = workspaceParseAccessList($row['access_list'] ?? null);
                $entries = workspaceUpsertAccessEntry($entries, $userId, $mode);
                $pdo->prepare("
                    UPDATE workspace_elements
                    SET visibility = 'shared', access_list = ?, updated_by = ?
                    WHERE id = ?
                ")->execute([workspaceEncodeAccessList($entries), $userId, $elementId]);
                $stmt->execute([$elementId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                echo json_encode(['success' => true, 'element' => workspaceElementToArray($row, $userId)]);
                break;
            }

            if (($input['action'] ?? '') === 'revoke_access') {
                $elementId = isset($input['element_id']) ? trim($input['element_id']) : '';
                if (!$elementId) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'ID requis']);
                    exit;
                }
                $stmt = $pdo->prepare("
                    SELECT we.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom
                    FROM workspace_elements we
                    LEFT JOIN users u ON u.id = we.created_by
                    WHERE we.id = ?
                ");
                $stmt->execute([$elementId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Élément introuvable']);
                    exit;
                }
                if ((int)$row['created_by'] === (int)$userId) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Vous êtes l\'auteur de cet élément']);
                    exit;
                }
                $entries = workspaceParseAccessList($row['access_list'] ?? null);
                $hadAccess = false;
                foreach ($entries as $entry) {
                    if ($entry['user_id'] === (int)$userId) {
                        $hadAccess = true;
                        break;
                    }
                }
                if ($hadAccess) {
                    $entries = workspaceRemoveAccessEntry($entries, $userId);
                    $pdo->prepare("
                        UPDATE workspace_elements
                        SET access_list = ?, updated_by = ?
                        WHERE id = ?
                    ")->execute([workspaceEncodeAccessList($entries), $userId, $elementId]);
                }
                echo json_encode(['success' => true]);
                break;
            }

            $id = isset($input['id']) ? trim($input['id']) : ('ws_' . time() . '_' . bin2hex(random_bytes(4)));
            $type = isset($input['type']) ? strtolower(trim((string)$input['type'])) : 'page';
            $allowedTypes = ['page', 'idea', 'mindmap', 'drawing', 'file', 'quicknote', 'folder'];
            if ($type !== 'folder' && !in_array($type, $allowedTypes)) {
                http_response_code(400);
                echo json_encode(['error' => 'Type invalide']);
                exit;
            }
            $title = isset($input['title']) ? trim($input['title']) : 'Sans titre';
            if (!$title) {
                $title = 'Sans titre';
            }
            $content = isset($input['content']) ? $input['content'] : null;
            $visibility = isset($input['visibility']) && in_array($input['visibility'], ['personal', 'team', 'shared']) ? $input['visibility'] : 'personal';
            $status = isset($input['status']) ? trim($input['status']) : null;
            $tags = isset($input['tags']) ? $input['tags'] : null;
            if (is_array($tags)) {
                $tags = json_encode($tags);
            } elseif (is_string($tags)) {
                // déjà JSON
            } else {
                $tags = null;
            }
            $accessList = null;
            if (isset($input['access_list'])) {
                if (is_string($input['access_list'])) {
                    $accessList = $input['access_list'];
                } elseif (is_array($input['access_list'])) {
                    $accessList = json_encode($input['access_list']);
                }
            }
            $folderId = isset($input['folder_id']) ? trim($input['folder_id']) : null;
            $projectId = isset($input['project_id']) ? trim($input['project_id']) : null;

            $stmt = $pdo->prepare("
                INSERT INTO workspace_elements (id, project_id, type, title, content, visibility, status, tags, folder_id, access_list, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$id, $projectId, $type, $title, $content, $visibility, $status, $tags, $folderId, $accessList, $userId]);
            echo json_encode(['success' => true, 'id' => $id]);
            break;

        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $id = isset($input['id']) ? trim($input['id']) : '';
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID requis']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT id, visibility, created_by, project_id, access_list FROM workspace_elements WHERE id = ?");
            $stmt->execute([$id]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['error' => 'Élément introuvable']);
                exit;
            }
            if (!workspaceCanEdit($existing, $userId)) {
                http_response_code(403);
                echo json_encode(['error' => 'Modification non autorisée']);
                exit;
            }
            // Un collaborateur ne peut pas retirer un élément partagé de l'espace partagé
            if ((int)$existing['created_by'] !== (int)$userId
                && ($existing['visibility'] ?? '') === 'shared'
                && isset($input['visibility'])
                && $input['visibility'] !== 'shared') {
                unset($input['visibility']);
            }
            $updates = [];
            $params = [];
            $allowed = ['title', 'content', 'visibility', 'status', 'tags', 'folder_id', 'project_id', 'access_list'];
            foreach ($allowed as $field) {
                if (!array_key_exists($field, $input)) {
                    continue;
                }
                if ($field === 'tags' || $field === 'access_list') {
                    $val = $input[$field];
                    if (is_array($val)) {
                        $val = json_encode($val);
                    }
                    $updates[] = "`$field` = ?";
                    $params[] = $val;
                } else {
                    $updates[] = "`$field` = ?";
                    $params[] = $input[$field];
                }
            }
            if (!empty($updates)) {
                $updates[] = 'updated_by = ?';
                $params[] = $userId;
                $params[] = $id;
                $pdo->prepare("UPDATE workspace_elements SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
            }
            echo json_encode(['success' => true]);
            break;

        case 'DELETE':
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $id = isset($input['id']) ? trim($input['id']) : '';
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID requis']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT created_by, visibility, project_id FROM workspace_elements WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Élément introuvable']);
                exit;
            }
            $isWpTeam = $row['visibility'] === 'team'
                && !empty($row['project_id'])
                && strpos($row['project_id'], 'wp_') === 0;
            if ((int)$row['created_by'] !== (int)$userId && !$isWpTeam) {
                http_response_code(403);
                echo json_encode(['error' => 'Suppression non autorisée']);
                exit;
            }
            $pdo->prepare("DELETE FROM workspace_elements WHERE id = ?")->execute([$id]);
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
