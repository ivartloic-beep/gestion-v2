<?php
/**
 * API Invitations - CRUD invitations par spectacle.
 * GET    /invitations.php?spectacle_id=...&q=...
 * POST   /invitations.php  { spectacle_id, invitations:[{nom,prenom,email?,commentaire?}] } ou { spectacle_id, nom, prenom, ... }
 * PUT    /invitations.php  { id, nom, prenom, email?, commentaire? }
 * DELETE /invitations.php?id=...
 */
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

// Permissions: lecture billetterie pour GET, édition billetterie pour mutations
if ($method === 'GET') {
    if (!checkPermission($userId, 'billetterie', 'view')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé']);
        exit;
    }
} else {
    if (!checkPermission($userId, 'billetterie', 'edit')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé']);
        exit;
    }
}

// Table
$pdo->exec("
    CREATE TABLE IF NOT EXISTS invitations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        spectacle_id VARCHAR(50) NOT NULL,
        code VARCHAR(64) NOT NULL,
        nom VARCHAR(120) NOT NULL,
        prenom VARCHAR(120) NOT NULL,
        email VARCHAR(190) NULL,
        commentaire TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_code (code),
        KEY idx_spectacle (spectacle_id),
        KEY idx_nom (nom),
        KEY idx_prenom (prenom),
        KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

function _inv_norm($s) {
    $s = trim((string)$s);
    $s = preg_replace('/\s+/', ' ', $s);
    return $s;
}

function _inv_generate_code($pdo) {
    // INVIT-XXXXXX (6 chars) - retry on collision
    for ($i = 0; $i < 12; $i++) {
        $rand = strtoupper(bin2hex(random_bytes(3))); // 6 hex chars
        $code = 'INVIT-' . $rand;
        try {
            $stmt = $pdo->prepare("SELECT 1 FROM invitations WHERE code = ? LIMIT 1");
            $stmt->execute([$code]);
            if (!$stmt->fetch()) return $code;
        } catch (Exception $e) {
            // ignore and retry
        }
    }
    // fallback very unlikely
    return 'INVIT-' . strtoupper(bin2hex(random_bytes(6)));
}

try {
    if ($method === 'GET') {
        $spectacleId = isset($_GET['spectacle_id']) ? trim($_GET['spectacle_id']) : '';
        if (!$spectacleId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'spectacle_id manquant']);
            exit;
        }
        $q = isset($_GET['q']) ? trim($_GET['q']) : '';

        $sql = "SELECT id, spectacle_id, code, nom, prenom, email, commentaire, created_at FROM invitations WHERE spectacle_id = ?";
        $params = [$spectacleId];
        if ($q !== '') {
            $sql .= " AND (nom LIKE ? OR prenom LIKE ? OR code LIKE ?)";
            $like = '%' . $q . '%';
            array_push($params, $like, $like, $like);
        }
        $sql .= " ORDER BY created_at DESC, id DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        echo json_encode(['success' => true, 'invitations' => $rows], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) $input = [];
        $spectacleId = isset($input['spectacle_id']) ? trim($input['spectacle_id']) : '';
        if (!$spectacleId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'spectacle_id manquant']);
            exit;
        }

        $list = [];
        if (isset($input['invitations']) && is_array($input['invitations'])) {
            $list = $input['invitations'];
        } else {
            $list = [$input];
        }

        $created = [];
        $pdo->beginTransaction();
        $stmtIns = $pdo->prepare("INSERT INTO invitations (spectacle_id, code, nom, prenom, email, commentaire) VALUES (?, ?, ?, ?, ?, ?)");

        foreach ($list as $inv) {
            $nom = _inv_norm($inv['nom'] ?? '');
            $prenom = _inv_norm($inv['prenom'] ?? '');
            if ($nom === '' || $prenom === '') {
                continue;
            }
            $email = _inv_norm($inv['email'] ?? '');
            if ($email === '') $email = null;
            $commentaire = isset($inv['commentaire']) ? trim((string)$inv['commentaire']) : null;
            if ($commentaire !== null && trim($commentaire) === '') $commentaire = null;

            $code = _inv_generate_code($pdo);
            // insert; if collision occurs, retry once
            try {
                $stmtIns->execute([$spectacleId, $code, $nom, $prenom, $email, $commentaire]);
            } catch (PDOException $e) {
                $code = _inv_generate_code($pdo);
                $stmtIns->execute([$spectacleId, $code, $nom, $prenom, $email, $commentaire]);
            }
            $created[] = [
                'id' => (int)$pdo->lastInsertId(),
                'spectacle_id' => $spectacleId,
                'code' => $code,
                'nom' => $nom,
                'prenom' => $prenom,
                'email' => $email,
                'commentaire' => $commentaire,
                'created_at' => date('Y-m-d H:i:s')
            ];
        }

        $pdo->commit();
        echo json_encode(['success' => true, 'created' => $created], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'PUT') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) $input = [];
        $id = isset($input['id']) ? (int)$input['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id manquant']);
            exit;
        }
        $nom = _inv_norm($input['nom'] ?? '');
        $prenom = _inv_norm($input['prenom'] ?? '');
        if ($nom === '' || $prenom === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Nom et prénom requis']);
            exit;
        }
        $email = _inv_norm($input['email'] ?? '');
        if ($email === '') $email = null;
        $commentaire = isset($input['commentaire']) ? trim((string)$input['commentaire']) : null;
        if ($commentaire !== null && trim($commentaire) === '') $commentaire = null;

        $stmt = $pdo->prepare("UPDATE invitations SET nom = ?, prenom = ?, email = ?, commentaire = ? WHERE id = ?");
        $stmt->execute([$nom, $prenom, $email, $commentaire, $id]);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id manquant']);
            exit;
        }
        $stmt = $pdo->prepare("DELETE FROM invitations WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Méthode non autorisée']);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('invitations.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
}

