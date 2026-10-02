<?php
/**
 * disk_usage.php - Retourne l'espace disque utilisé par l'application
 * À placer dans /www/public/outils/api/
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Vérification auth basique (même logique que les autres endpoints)
$token = null;
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $token = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']);
} elseif (isset($_SERVER['HTTP_X_AUTH_TOKEN'])) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'];
} elseif (isset($_GET['token'])) {
    $token = $_GET['token'];
}

if (!$token) {
    echo json_encode(['success' => false, 'error' => 'Non authentifié']);
    exit;
}

// Dossier racine à scanner : tout /www/public/
$appRoot = realpath(__DIR__ . '/../..');
if (!$appRoot) {
    // Fallback : essayer /www/public directement
    $appRoot = realpath('/www/public');
}
if (!$appRoot) {
    echo json_encode(['success' => false, 'error' => 'Dossier introuvable']);
    exit;
}

// Quota OVH (en octets) - 250 Go
$quotaBytes = 250 * 1024 * 1024 * 1024;

/**
 * Calcule la taille d'un dossier récursivement
 */
function getDirSize($dir) {
    $size = 0;
    if (!is_dir($dir)) return 0;
    
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    foreach ($iterator as $file) {
        if ($file->isFile()) {
            $size += $file->getSize();
        }
    }
    return $size;
}

/**
 * Compte les fichiers dans un dossier récursivement
 */
function countFiles($dir) {
    $count = 0;
    if (!is_dir($dir)) return 0;
    
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    
    foreach ($iterator as $file) {
        if ($file->isFile()) {
            $count++;
        }
    }
    return $count;
}

/**
 * Formate une taille en octets en format lisible
 */
function formatSize($bytes) {
    if ($bytes >= 1073741824) {
        return round($bytes / 1073741824, 2) . ' Go';
    } elseif ($bytes >= 1048576) {
        return round($bytes / 1048576, 2) . ' Mo';
    } elseif ($bytes >= 1024) {
        return round($bytes / 1024, 2) . ' Ko';
    }
    return $bytes . ' o';
}

// Scanner tous les sous-dossiers de premier niveau
$details = [];
$totalAppSize = 0;

$items = @scandir($appRoot);
if ($items) {
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $itemPath = $appRoot . '/' . $item;
        
        if (is_dir($itemPath)) {
            $size = getDirSize($itemPath);
            $files = countFiles($itemPath);
            $details[] = [
                'name' => $item,
                'size' => $size,
                'sizeFormatted' => formatSize($size),
                'files' => $files
            ];
            $totalAppSize += $size;
        }
    }
}

// Fichiers à la racine
$rootSize = 0;
$rootCount = 0;
if ($items) {
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $itemPath = $appRoot . '/' . $item;
        if (is_file($itemPath)) {
            $rootSize += filesize($itemPath);
            $rootCount++;
        }
    }
}
if ($rootSize > 0) {
    $details[] = [
        'name' => 'Fichiers racine',
        'size' => $rootSize,
        'sizeFormatted' => formatSize($rootSize),
        'files' => $rootCount
    ];
    $totalAppSize += $rootSize;
}

// Trier par taille décroissante
usort($details, function($a, $b) {
    return $b['size'] - $a['size'];
});

// Espace disque serveur (info complémentaire)
$diskTotal = @disk_total_space($appRoot);
$diskFree = @disk_free_space($appRoot);

$result = [
    'success' => true,
    'app' => [
        'path' => basename($appRoot),
        'totalSize' => $totalAppSize,
        'totalSizeFormatted' => formatSize($totalAppSize),
        'details' => $details
    ],
    'quota' => [
        'total' => $quotaBytes,
        'totalFormatted' => '250 Go',
        'used' => $totalAppSize,
        'usedFormatted' => formatSize($totalAppSize),
        'percentage' => round(($totalAppSize / $quotaBytes) * 100, 2)
    ],
    'disk' => [
        'total' => $diskTotal ?: 0,
        'totalFormatted' => $diskTotal ? formatSize($diskTotal) : 'N/A',
        'free' => $diskFree ?: 0,
        'freeFormatted' => $diskFree ? formatSize($diskFree) : 'N/A'
    ],
    'timestamp' => date('c')
];

echo json_encode($result, JSON_PRETTY_PRINT);
