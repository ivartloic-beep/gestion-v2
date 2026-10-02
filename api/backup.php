<?php
/**
 * Sauvegarde / restauration complète (admin uniquement).
 * Format : ZIP contenant manifest.json, database.json, fichiers sous files/api_uploads/ et files/root_uploads/
 * Hypothèse : même serveur / mêmes chemins relatifs qu'à l'export.
 */
require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (!class_exists('ZipArchive')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Extension PHP ZipArchive non disponible sur ce serveur.']);
    exit;
}

$userId = verifyToken();
$pdo = getDB();
$stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$user || $user['role'] !== 'admin') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Accès réservé aux administrateurs.']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$apiDir = __DIR__;
$rootDir = dirname($apiDir);

try {
    if ($method === 'GET') {
        handleExport($pdo, $apiDir, $rootDir);
    } elseif ($method === 'POST') {
        handleImport($pdo, $apiDir, $rootDir);
    } else {
        http_response_code(405);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Méthode non autorisée']);
    }
} catch (Throwable $e) {
    error_log('backup.php: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Erreur: ' . $e->getMessage()]);
}

// -------------------------------------------------------------------------
function getTableNames(PDO $pdo) {
    $db = $pdo->query('SELECT DATABASE()')->fetchColumn();
    $stmt = $pdo->prepare("
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
    ");
    $stmt->execute([$db]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function getBinaryColumns(PDO $pdo, $table) {
    $db = $pdo->query('SELECT DATABASE()')->fetchColumn();
    $stmt = $pdo->prepare("
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        AND DATA_TYPE IN ('blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary')
    ");
    $stmt->execute([$db, $table]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function exportTableData(PDO $pdo, $table) {
    $binaryCols = getBinaryColumns($pdo, $table);
    $binarySet = array_flip($binaryCols);
    $stmt = $pdo->query('SELECT * FROM `' . str_replace('`', '``', $table) . '`');
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        foreach ($row as $k => $v) {
            if ($v !== null && isset($binarySet[$k])) {
                $row[$k] = ['__blob_b64' => base64_encode($v)];
            }
        }
        $rows[] = $row;
    }
    return $rows;
}

function addFolderToZip(ZipArchive $zip, $realBase, $zipPrefix) {
    $realBase = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $realBase), DIRECTORY_SEPARATOR);
    if (!is_dir($realBase)) {
        return;
    }
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($realBase, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iterator as $file) {
        /** @var SplFileInfo $file */
        if (!$file->isFile()) {
            continue;
        }
        $full = $file->getRealPath();
        $rel = substr($full, strlen($realBase) + 1);
        $rel = str_replace('\\', '/', $rel);
        $zipPath = $zipPrefix . '/' . $rel;
        $zip->addFile($full, $zipPath);
    }
}

function handleExport(PDO $pdo, $apiDir, $rootDir) {
    @set_time_limit(0);
    @ini_set('memory_limit', '512M');

    $tables = getTableNames($pdo);
    $database = [];
    $rowCounts = [];
    foreach ($tables as $t) {
        $database[$t] = exportTableData($pdo, $t);
        $rowCounts[$t] = count($database[$t]);
    }

    $manifest = [
        'format' => 'gestion-v2-full-backup',
        'formatVersion' => 1,
        'exportedAt' => gmdate('c'),
        'phpVersion' => PHP_VERSION,
        'dbName' => $pdo->query('SELECT DATABASE()')->fetchColumn(),
        'tables' => $tables,
        'rowCounts' => $rowCounts,
        'paths' => [
            'apiUploads' => 'files/api_uploads',
            'rootUploads' => 'files/root_uploads',
            'note' => 'Restaurer sur la même arborescence (chemins relatifs à api/ et au dossier parent).',
        ],
    ];

    $tmpZip = tempnam(sys_get_temp_dir(), 'gvbk');
    if ($tmpZip === false) {
        throw new RuntimeException('Impossible de créer un fichier temporaire.');
    }

    $zip = new ZipArchive();
    if ($zip->open($tmpZip, ZipArchive::OVERWRITE | ZipArchive::CREATE) !== true) {
        @unlink($tmpZip);
        throw new RuntimeException('Impossible de créer l’archive ZIP.');
    }

    $zip->addFromString('manifest.json', json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    $zip->addFromString('database.json', json_encode($database, JSON_UNESCAPED_UNICODE));

    addFolderToZip($zip, $apiDir . '/uploads', 'files/api_uploads');
    addFolderToZip($zip, $rootDir . '/uploads', 'files/root_uploads');

    $zip->close();

    $fname = 'gestion-sauvegarde-complete-' . date('Y-m-d-His') . '.zip';
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $fname . '"');
    header('Content-Length: ' . filesize($tmpZip));
    header('Cache-Control: no-store');

    readfile($tmpZip);
    @unlink($tmpZip);
    exit;
}

function copyExtractedDirTo($from, $to) {
    $from = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $from), DIRECTORY_SEPARATOR);
    $to = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $to), DIRECTORY_SEPARATOR);
    if (!is_dir($from)) {
        return;
    }
    if (!is_dir($to)) {
        if (!@mkdir($to, 0755, true)) {
            throw new RuntimeException('Impossible de créer le dossier : ' . $to);
        }
    }
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iterator as $file) {
        /** @var SplFileInfo $file */
        $sub = substr($file->getPathname(), strlen($from) + 1);
        $destPath = $to . DIRECTORY_SEPARATOR . $sub;
        if ($file->isDir()) {
            if (!is_dir($destPath)) {
                @mkdir($destPath, 0755, true);
            }
        } else {
            $parent = dirname($destPath);
            if (!is_dir($parent)) {
                @mkdir($parent, 0755, true);
            }
            if (!@copy($file->getRealPath(), $destPath)) {
                throw new RuntimeException('Copie impossible : ' . $destPath);
            }
        }
    }
}

function handleImport(PDO $pdo, $apiDir, $rootDir) {
    header('Content-Type: application/json; charset=utf-8');
    @set_time_limit(0);
    @ini_set('memory_limit', '512M');

    $confirm = isset($_POST['confirmRestore']) ? trim((string) $_POST['confirmRestore']) : '';
    if ($confirm !== 'RESTAURER') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Confirmation invalide. Saisissez exactement RESTAURER.']);
        return;
    }

    if (empty($_FILES['backup']) || !isset($_FILES['backup']['tmp_name'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Fichier de sauvegarde manquant.']);
        return;
    }
    if ($_FILES['backup']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Erreur upload : code ' . (int) $_FILES['backup']['error']]);
        return;
    }

    $tmpZip = $_FILES['backup']['tmp_name'];
    $extractDir = sys_get_temp_dir() . '/gvbk_' . bin2hex(random_bytes(8));
    if (!@mkdir($extractDir, 0700, true)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Impossible de créer un dossier temporaire.']);
        return;
    }

    try {
        $zip = new ZipArchive();
        if ($zip->open($tmpZip) !== true) {
            throw new RuntimeException('Fichier ZIP invalide ou corrompu.');
        }
        $zip->extractTo($extractDir);
        $zip->close();

        $manifestPath = $extractDir . '/manifest.json';
        if (!is_file($manifestPath)) {
            throw new RuntimeException('manifest.json introuvable dans l’archive.');
        }
        $manifest = json_decode(file_get_contents($manifestPath), true);
        if (!is_array($manifest) || ($manifest['format'] ?? '') !== 'gestion-v2-full-backup') {
            throw new RuntimeException('Format de sauvegarde non reconnu.');
        }

        $dbPath = $extractDir . '/database.json';
        if (!is_file($dbPath)) {
            throw new RuntimeException('database.json introuvable dans l’archive.');
        }
        $database = json_decode(file_get_contents($dbPath), true);
        if (!is_array($database)) {
            throw new RuntimeException('database.json invalide.');
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        $pdo->beginTransaction();

        $tables = getTableNames($pdo);
        foreach ($tables as $t) {
            $pdo->exec('DELETE FROM `' . str_replace('`', '``', $t) . '`');
        }

        foreach ($database as $table => $rows) {
            if (!in_array($table, $tables, true)) {
                continue;
            }
            if (!is_array($rows) || count($rows) === 0) {
                continue;
            }
            $first = $rows[0];
            if (!is_array($first)) {
                continue;
            }
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $cols = [];
                foreach ($row as $k => $v) {
                    if (is_array($v) && array_key_exists('__blob_b64', $v)) {
                        $decoded = base64_decode((string) $v['__blob_b64'], true);
                        $cols[$k] = $decoded !== false ? $decoded : null;
                    } else {
                        $cols[$k] = $v;
                    }
                }
                $colNames = array_keys($cols);
                $quoted = array_map(function ($c) {
                    return '`' . str_replace('`', '``', $c) . '`';
                }, $colNames);
                $placeholders = implode(',', array_fill(0, count($quoted), '?'));
                $sql = 'INSERT INTO `' . str_replace('`', '``', $table) . '` (' . implode(',', $quoted) . ') VALUES (' . $placeholders . ')';
                $stmt = $pdo->prepare($sql);
                $stmt->execute(array_values($cols));
            }
        }

        $pdo->commit();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');

        $apiUploadsSrc = $extractDir . '/files/api_uploads';
        $rootUploadsSrc = $extractDir . '/files/root_uploads';
        $destApi = $apiDir . '/uploads';
        if (!is_dir($destApi)) {
            @mkdir($destApi, 0755, true);
        }
        emptyDirContents($destApi);
        if (is_dir($apiUploadsSrc)) {
            copyExtractedDirTo($apiUploadsSrc, $destApi);
        }
        $destRoot = $rootDir . '/uploads';
        if (!is_dir($destRoot)) {
            @mkdir($destRoot, 0755, true);
        }
        emptyDirContents($destRoot);
        if (is_dir($rootUploadsSrc)) {
            copyExtractedDirTo($rootUploadsSrc, $destRoot);
        }

        rrmdir($extractDir);

        echo json_encode([
            'success' => true,
            'message' => 'Restauration terminée. Rechargez la page (F5) pour resynchroniser l’application.',
        ], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        try {
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        } catch (Throwable $ignored) {
        }
        if (is_dir($extractDir)) {
            rrmdir($extractDir);
        }
        throw $e;
    }
}

function emptyDirContents($dir) {
    if (!is_dir($dir)) {
        return;
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        /** @var SplFileInfo $item */
        $path = $item->getPathname();
        if ($item->isDir()) {
            @rmdir($path);
        } else {
            @unlink($path);
        }
    }
}

function rrmdir($dir) {
    if (!is_dir($dir)) {
        return;
    }
    emptyDirContents($dir);
    @rmdir($dir);
}
