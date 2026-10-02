<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

// Créer la table compta si elle n'existe pas
$pdo->exec("
    CREATE TABLE IF NOT EXISTS compta_data (
        id INT PRIMARY KEY DEFAULT 1,
        transactions LONGTEXT,
        justificatifs LONGTEXT,
        regles LONGTEXT,
        comptes LONGTEXT,
        factures LONGTEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

// Colonnes ajoutées après coup (rétrocompatibilité)
try { $pdo->exec("ALTER TABLE compta_data ADD COLUMN regles LONGTEXT"); } catch (PDOException $e) {}
try { $pdo->exec("ALTER TABLE compta_data ADD COLUMN comptes LONGTEXT"); } catch (PDOException $e) {}
try { $pdo->exec("ALTER TABLE compta_data ADD COLUMN factures LONGTEXT"); } catch (PDOException $e) {}
try { $pdo->exec("ALTER TABLE compta_data ADD COLUMN documents_emis LONGTEXT"); } catch (PDOException $e) {}
try { $pdo->exec("ALTER TABLE compta_data ADD COLUMN settings LONGTEXT"); } catch (PDOException $e) {}

// Table fichiers justificatifs (rétrocompatible)
$pdo->exec("
    CREATE TABLE IF NOT EXISTS compta_justificatif_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        justificatif_id VARCHAR(100) UNIQUE NOT NULL,
        file_data LONGBLOB,
        file_type VARCHAR(100) DEFAULT 'image/jpeg',
        file_name VARCHAR(255),
        file_size INT,
        file_path VARCHAR(500) DEFAULT NULL,
        migrated TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_justif_id (justificatif_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

// Ajouter colonnes file_path et migrated si absentes (mise à jour progressive)
try { $pdo->exec("ALTER TABLE compta_justificatif_files ADD COLUMN file_path VARCHAR(500) DEFAULT NULL"); } catch (PDOException $e) {}
try { $pdo->exec("ALTER TABLE compta_justificatif_files ADD COLUMN migrated TINYINT(1) DEFAULT 0"); } catch (PDOException $e) {}

// Dossier stockage justificatifs sur disque
$justifUploadDir = __DIR__ . '/uploads/justificatifs/';
if (!is_dir($justifUploadDir)) {
    mkdir($justifUploadDir, 0755, true);
}

try {
    switch ($method) {
        case 'GET':
            // === Récupérer un fichier justificatif ===
            if (isset($_GET['justificatif_file'])) {
                $justifId = $_GET['justificatif_file'];
                
                // Priorité 1 : fichier sur disque (via file_path en BDD)
                $stmt = $pdo->prepare("SELECT file_path, file_type, file_name FROM compta_justificatif_files WHERE justificatif_id = ?");
                $stmt->execute([$justifId]);
                $file = $stmt->fetch();
                
                if ($file && $file['file_path'] && file_exists(__DIR__ . '/' . $file['file_path'])) {
                    $content = file_get_contents(__DIR__ . '/' . $file['file_path']);
                    echo json_encode([
                        'success' => true,
                        'fileBase64' => base64_encode($content),
                        'fileType' => $file['file_type'],
                        'fileName' => $file['file_name'],
                        'source' => 'disk'
                    ]);
                    exit;
                }
                
                // Priorité 2 : fichier sur disque (glob par ID)
                $files = glob($justifUploadDir . $justifId . '.*');
                if (!empty($files)) {
                    $filepath = $files[0];
                    $ext = pathinfo($filepath, PATHINFO_EXTENSION);
                    $mimeTypes = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'pdf' => 'application/pdf', 'webp' => 'image/webp'];
                    echo json_encode([
                        'success' => true,
                        'fileBase64' => base64_encode(file_get_contents($filepath)),
                        'fileType' => $mimeTypes[$ext] ?? 'application/octet-stream',
                        'fileName' => basename($filepath),
                        'source' => 'disk_glob'
                    ]);
                    exit;
                }
                
                // Priorité 3 : BLOB MySQL (ancien système, pas encore migré)
                $stmt = $pdo->prepare("SELECT file_data, file_type, file_name FROM compta_justificatif_files WHERE justificatif_id = ? AND file_data IS NOT NULL AND LENGTH(file_data) > 0");
                $stmt->execute([$justifId]);
                $file = $stmt->fetch();
                
                if ($file && $file['file_data']) {
                    echo json_encode([
                        'success' => true,
                        'fileBase64' => base64_encode($file['file_data']),
                        'fileType' => $file['file_type'],
                        'fileName' => $file['file_name'],
                        'source' => 'mysql_blob'
                    ]);
                    exit;
                }
                
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Fichier non trouvé']);
                exit;
            }
            
            // === migrate_blobs_to_disk : Migrer BLOB MySQL → fichiers disque ===
            if (isset($_GET['action']) && $_GET['action'] === 'migrate_blobs_to_disk') {
                $stmt = $pdo->query("SELECT justificatif_id, file_data, file_type, file_name, file_size FROM compta_justificatif_files WHERE (migrated = 0 OR migrated IS NULL) AND file_data IS NOT NULL AND LENGTH(file_data) > 0");
                $migrated = 0;
                $totalSize = 0;
                $errors = [];
                
                while ($row = $stmt->fetch()) {
                    $ext = 'jpg';
                    if (strpos($row['file_type'], 'pdf') !== false) $ext = 'pdf';
                    elseif (strpos($row['file_type'], 'png') !== false) $ext = 'png';
                    elseif (strpos($row['file_type'], 'webp') !== false) $ext = 'webp';
                    
                    $filename = $row['justificatif_id'] . '.' . $ext;
                    $filepath = $justifUploadDir . $filename;
                    $relativePath = 'uploads/justificatifs/' . $filename;
                    
                    if (file_put_contents($filepath, $row['file_data']) !== false) {
                        $update = $pdo->prepare("UPDATE compta_justificatif_files SET file_path = ?, migrated = 1 WHERE justificatif_id = ?");
                        $update->execute([$relativePath, $row['justificatif_id']]);
                        $migrated++;
                        $totalSize += strlen($row['file_data']);
                    } else {
                        $errors[] = $row['justificatif_id'];
                    }
                }
                
                echo json_encode([
                    'success' => true,
                    'migrated' => $migrated,
                    'totalSizeBytes' => $totalSize,
                    'totalSizeMB' => round($totalSize / (1024 * 1024), 2),
                    'errors' => $errors
                ]);
                exit;
            }
            
            // === purge_blobs : Supprimer les BLOB des fichiers déjà migrés ===
            if (isset($_GET['action']) && $_GET['action'] === 'purge_blobs') {
                $stmt = $pdo->query("SELECT COUNT(*) as cnt, COALESCE(SUM(file_size), 0) as total_size FROM compta_justificatif_files WHERE migrated = 1 AND file_data IS NOT NULL AND LENGTH(file_data) > 0");
                $info = $stmt->fetch();
                
                if ($info['cnt'] > 0) {
                    $pdo->exec("UPDATE compta_justificatif_files SET file_data = '' WHERE migrated = 1");
                    echo json_encode([
                        'success' => true,
                        'purged' => (int)$info['cnt'],
                        'freedSizeMB' => round($info['total_size'] / (1024 * 1024), 2)
                    ]);
                } else {
                    echo json_encode(['success' => true, 'purged' => 0, 'message' => 'Aucun BLOB à purger']);
                }
                exit;
            }
            
            // === blob_stats : Stats des BLOB en base ===
            if (isset($_GET['action']) && $_GET['action'] === 'blob_stats') {
                $stmt = $pdo->query("
                    SELECT 
                        COUNT(*) as total_files,
                        SUM(CASE WHEN migrated = 1 THEN 1 ELSE 0 END) as migrated_files,
                        SUM(CASE WHEN (migrated = 0 OR migrated IS NULL) AND file_data IS NOT NULL AND LENGTH(file_data) > 0 THEN 1 ELSE 0 END) as pending_migration,
                        COALESCE(SUM(CASE WHEN file_data IS NOT NULL AND LENGTH(file_data) > 0 THEN file_size ELSE 0 END), 0) as blob_size_total,
                        COALESCE(SUM(CASE WHEN migrated = 1 AND file_data IS NOT NULL AND LENGTH(file_data) > 0 THEN file_size ELSE 0 END), 0) as blob_size_purgeable
                    FROM compta_justificatif_files
                ");
                $stats = $stmt->fetch();
                echo json_encode([
                    'success' => true,
                    'totalFiles' => (int)$stats['total_files'],
                    'migratedFiles' => (int)$stats['migrated_files'],
                    'pendingMigration' => (int)$stats['pending_migration'],
                    'blobSizeMB' => round($stats['blob_size_total'] / (1024 * 1024), 2),
                    'purgeableMB' => round($stats['blob_size_purgeable'] / (1024 * 1024), 2)
                ]);
                exit;
            }
            
            // === Récupérer toutes les données compta ===
            $stmt = $pdo->query("SELECT transactions, justificatifs, regles, comptes, factures, documents_emis, settings FROM compta_data WHERE id = 1");
            $row = $stmt->fetch();
            
            $transactions = $row ? (json_decode($row['transactions'] ?: '[]', true) ?: []) : [];
            $justificatifs = $row ? (json_decode($row['justificatifs'] ?: '[]', true) ?: []) : [];
            $regles = $row ? (json_decode($row['regles'] ?: '[]', true) ?: []) : [];
            $comptes = $row ? (json_decode($row['comptes'] ?: '[]', true) ?: []) : [];
            $factures = $row ? (json_decode($row['factures'] ?: '[]', true) ?: []) : [];
            $documentsEmis = $row ? (json_decode($row['documents_emis'] ?: '[]', true) ?: []) : [];
            $settings = $row ? (json_decode($row['settings'] ?: '{}', true) ?: []) : [];
            
            if (empty($comptes)) {
                $comptes = [['id' => 'principal', 'nom' => 'Compte principal']];
            }
            if (!is_array($documentsEmis)) $documentsEmis = [];
            if (!is_array($settings)) $settings = [];
            
            echo json_encode([
                'success' => true,
                'transactions' => $transactions,
                'justificatifs' => $justificatifs,
                'regles' => $regles,
                'comptes' => $comptes,
                'factures' => $factures,
                'documents_emis' => $documentsEmis,
                'settings' => $settings
            ]);
            break;
            
        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Body JSON invalide ou vide']);
                exit;
            }
            
            $action = $input['action'] ?? '';
            
            // === save_all ===
            if ($action === 'save_all') {
                $transactions = $input['transactions'] ?? [];
                $justificatifs = $input['justificatifs'] ?? [];
                $regles = $input['regles'] ?? [];
                $comptes = $input['comptes'] ?? [];
                $factures = $input['factures'] ?? [];

                // Préserver documents_emis / settings si absents du payload (anciens clients)
                $existing = $pdo->query("SELECT documents_emis, settings FROM compta_data WHERE id = 1")->fetch();
                $documentsEmis = array_key_exists('documents_emis', $input)
                    ? ($input['documents_emis'] ?? [])
                    : (json_decode(($existing['documents_emis'] ?? '[]') ?: '[]', true) ?: []);
                $settings = array_key_exists('settings', $input)
                    ? ($input['settings'] ?? new stdClass())
                    : (json_decode(($existing['settings'] ?? '{}') ?: '{}', true) ?: new stdClass());
                
                $txJson = json_encode($transactions, JSON_UNESCAPED_UNICODE);
                $justifJson = json_encode($justificatifs, JSON_UNESCAPED_UNICODE);
                $reglesJson = json_encode($regles, JSON_UNESCAPED_UNICODE);
                $comptesJson = json_encode($comptes, JSON_UNESCAPED_UNICODE);
                $facturesJson = json_encode($factures, JSON_UNESCAPED_UNICODE);
                $docsEmisJson = json_encode($documentsEmis, JSON_UNESCAPED_UNICODE);
                $settingsJson = json_encode($settings, JSON_UNESCAPED_UNICODE);
                
                $stmt = $pdo->prepare("
                    INSERT INTO compta_data (id, transactions, justificatifs, regles, comptes, factures, documents_emis, settings) 
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        transactions = VALUES(transactions), 
                        justificatifs = VALUES(justificatifs),
                        regles = VALUES(regles),
                        comptes = VALUES(comptes),
                        factures = VALUES(factures),
                        documents_emis = VALUES(documents_emis),
                        settings = VALUES(settings)
                ");
                $stmt->execute([$txJson, $justifJson, $reglesJson, $comptesJson, $facturesJson, $docsEmisJson, $settingsJson]);
                
                echo json_encode([
                    'success' => true,
                    'counts' => [
                        'transactions' => count($transactions),
                        'justificatifs' => count($justificatifs),
                        'regles' => count($regles),
                        'comptes' => count($comptes),
                        'factures' => count($factures),
                        'documents_emis' => is_array($documentsEmis) ? count($documentsEmis) : 0
                    ]
                ]);
                break;
            }
            
            // === save_justificatif_file : Sauvegarder sur DISQUE ===
            if ($action === 'save_justificatif_file') {
                $justifId = $input['justificatifId'] ?? null;
                $fileBase64 = $input['fileBase64'] ?? null;
                $fileType = $input['fileType'] ?? 'image/jpeg';
                $nomFichier = $input['nomFichier'] ?? 'justificatif';
                
                if (!$justifId || !$fileBase64) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'justificatifId et fileBase64 requis']);
                    exit;
                }
                
                $decoded = base64_decode($fileBase64);
                if ($decoded === false) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Base64 invalide']);
                    exit;
                }
                
                $ext = 'jpg';
                if (strpos($fileType, 'pdf') !== false) $ext = 'pdf';
                elseif (strpos($fileType, 'png') !== false) $ext = 'png';
                elseif (strpos($fileType, 'webp') !== false) $ext = 'webp';
                
                $filename = $justifId . '.' . $ext;
                $filepath = $justifUploadDir . $filename;
                $relativePath = 'uploads/justificatifs/' . $filename;
                
                if (file_put_contents($filepath, $decoded) === false) {
                    http_response_code(500);
                    echo json_encode(['success' => false, 'error' => 'Erreur écriture fichier']);
                    exit;
                }
                
                // Référence en BDD sans BLOB (file_data vide)
                $stmt = $pdo->prepare("
                    INSERT INTO compta_justificatif_files (justificatif_id, file_data, file_type, file_name, file_size, file_path, migrated) 
                    VALUES (?, '', ?, ?, ?, ?, 1)
                    ON DUPLICATE KEY UPDATE file_type = VALUES(file_type), file_name = VALUES(file_name), file_size = VALUES(file_size), file_path = VALUES(file_path), migrated = 1
                ");
                $stmt->execute([$justifId, $fileType, $nomFichier, strlen($decoded), $relativePath]);
                
                echo json_encode([
                    'success' => true,
                    'filePath' => $relativePath,
                    'fileSize' => strlen($decoded)
                ]);
                break;
            }
            
            // === migrate_from_local ===
            if ($action === 'migrate_from_local') {
                $localTx = $input['transactions'] ?? [];
                $localJustifs = $input['justificatifs'] ?? [];
                $localRegles = $input['regles'] ?? [];
                $localComptes = $input['comptes'] ?? [];
                $localFactures = $input['factures'] ?? [];
                
                $stmt = $pdo->query("SELECT transactions, justificatifs, regles, comptes, factures FROM compta_data WHERE id = 1");
                $row = $stmt->fetch();
                
                $existingTx = $row ? (json_decode($row['transactions'] ?: '[]', true) ?: []) : [];
                $existingJustifs = $row ? (json_decode($row['justificatifs'] ?: '[]', true) ?: []) : [];
                $existingRegles = $row ? (json_decode($row['regles'] ?: '[]', true) ?: []) : [];
                $existingComptes = $row ? (json_decode($row['comptes'] ?: '[]', true) ?: []) : [];
                $existingFactures = $row ? (json_decode($row['factures'] ?: '[]', true) ?: []) : [];
                
                $existingTxIds = array_column($existingTx, 'id');
                $addedTx = 0;
                foreach ($localTx as $tx) {
                    if (isset($tx['id']) && !in_array($tx['id'], $existingTxIds)) {
                        $existingTx[] = $tx;
                        $existingTxIds[] = $tx['id'];
                        $addedTx++;
                    }
                }
                
                $existingJustifIds = array_column($existingJustifs, 'id');
                $addedJustifs = 0;
                foreach ($localJustifs as $justif) {
                    if (isset($justif['id']) && !in_array($justif['id'], $existingJustifIds)) {
                        $existingJustifs[] = $justif;
                        $existingJustifIds[] = $justif['id'];
                        $addedJustifs++;
                    }
                }
                
                $existingRegleIds = array_column($existingRegles, 'id');
                $addedRegles = 0;
                foreach ($localRegles as $regle) {
                    if (isset($regle['id']) && !in_array($regle['id'], $existingRegleIds)) {
                        $existingRegles[] = $regle;
                        $existingRegleIds[] = $regle['id'];
                        $addedRegles++;
                    }
                }
                
                $existingCompteIds = array_column($existingComptes, 'id');
                $addedComptes = 0;
                foreach ($localComptes as $compte) {
                    if (isset($compte['id']) && !in_array($compte['id'], $existingCompteIds)) {
                        $existingComptes[] = $compte;
                        $existingCompteIds[] = $compte['id'];
                        $addedComptes++;
                    }
                }
                
                $existingFactureIds = array_column($existingFactures, 'id');
                $addedFactures = 0;
                foreach ($localFactures as $facture) {
                    if (isset($facture['id']) && !in_array($facture['id'], $existingFactureIds)) {
                        $existingFactures[] = $facture;
                        $existingFactureIds[] = $facture['id'];
                        $addedFactures++;
                    }
                }
                
                if (empty($existingComptes)) {
                    $existingComptes = [['id' => 'principal', 'nom' => 'Compte principal']];
                }
                
                $txJson = json_encode($existingTx, JSON_UNESCAPED_UNICODE);
                $justifJson = json_encode($existingJustifs, JSON_UNESCAPED_UNICODE);
                $reglesJson = json_encode($existingRegles, JSON_UNESCAPED_UNICODE);
                $comptesJson = json_encode($existingComptes, JSON_UNESCAPED_UNICODE);
                $facturesJson = json_encode($existingFactures, JSON_UNESCAPED_UNICODE);
                
                $stmt = $pdo->prepare("
                    INSERT INTO compta_data (id, transactions, justificatifs, regles, comptes, factures) 
                    VALUES (1, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        transactions = VALUES(transactions), 
                        justificatifs = VALUES(justificatifs),
                        regles = VALUES(regles),
                        comptes = VALUES(comptes),
                        factures = VALUES(factures)
                ");
                $stmt->execute([$txJson, $justifJson, $reglesJson, $comptesJson, $facturesJson]);
                
                echo json_encode([
                    'success' => true,
                    'counts' => [
                        'addedTransactions' => $addedTx,
                        'addedJustificatifs' => $addedJustifs,
                        'addedRegles' => $addedRegles,
                        'addedComptes' => $addedComptes,
                        'addedFactures' => $addedFactures,
                        'totalTransactions' => count($existingTx),
                        'totalJustificatifs' => count($existingJustifs),
                        'totalRegles' => count($existingRegles),
                        'totalComptes' => count($existingComptes),
                        'totalFactures' => count($existingFactures)
                    ]
                ]);
                break;
            }
            
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Action inconnue: ' . $action]);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Méthode non supportée']);
    }
    
} catch (PDOException $e) {
    error_log('compta.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur: ' . $e->getMessage()]);
}
?>