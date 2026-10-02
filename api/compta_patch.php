<?php
/**
 * PATCH pour compta.php — Ajoutez ce code dans votre compta.php existant
 * 
 * Ce patch ajoute la gestion du stockage séparé des fichiers de justificatifs.
 * Le problème : quand un justificatif avec un fichier (photo/PDF) est ajouté depuis
 * le téléphone, le base64 du fichier rend le payload JSON trop gros pour être
 * sauvegardé en une seule requête (limites PHP post_max_size / upload_max_filesize).
 * 
 * Solution : les fichiers base64 sont envoyés séparément via l'action 'save_justificatif_file'.
 * 
 * INSTRUCTIONS :
 * 1. Ajoutez le bloc ci-dessous dans votre compta.php, dans le switch/if qui gère les actions POST
 * 2. Créez le dossier 'justificatifs_files/' dans le même répertoire que compta.php
 * 3. Vérifiez que ce dossier a les permissions d'écriture (chmod 755 ou 777)
 * 4. Augmentez aussi post_max_size et upload_max_filesize dans php.ini :
 *    post_max_size = 50M
 *    upload_max_filesize = 50M
 */

// === À AJOUTER DANS VOTRE COMPTA.PHP (section POST) ===

// Dossier de stockage des fichiers de justificatifs
$justifFilesDir = __DIR__ . '/justificatifs_files/';
if (!is_dir($justifFilesDir)) {
    mkdir($justifFilesDir, 0755, true);
}

// Gérer l'action 'save_justificatif_file'
if ($action === 'save_justificatif_file') {
    $justifId = $data['justificatifId'] ?? null;
    $fileBase64 = $data['fileBase64'] ?? null;
    $fileType = $data['fileType'] ?? 'image/jpeg';
    $nomFichier = $data['nomFichier'] ?? 'justificatif';
    
    if (!$justifId || !$fileBase64) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'justificatifId et fileBase64 requis']);
        exit;
    }
    
    // Déterminer l'extension
    $ext = 'jpg';
    if (strpos($fileType, 'pdf') !== false) $ext = 'pdf';
    elseif (strpos($fileType, 'png') !== false) $ext = 'png';
    elseif (strpos($fileType, 'webp') !== false) $ext = 'webp';
    
    // Sauvegarder le fichier
    $filename = $justifId . '.' . $ext;
    $filepath = $justifFilesDir . $filename;
    $decoded = base64_decode($fileBase64);
    
    if ($decoded === false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Base64 invalide']);
        exit;
    }
    
    if (file_put_contents($filepath, $decoded) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Erreur écriture fichier']);
        exit;
    }
    
    // Mettre à jour le justificatif dans les données compta pour y ajouter le chemin du fichier
    $comptaFile = __DIR__ . '/data/compta.json'; // Ajustez le chemin selon votre configuration
    if (file_exists($comptaFile)) {
        $comptaData = json_decode(file_get_contents($comptaFile), true);
        if ($comptaData && isset($comptaData['justificatifs'])) {
            foreach ($comptaData['justificatifs'] as &$j) {
                if ($j['id'] === $justifId) {
                    $j['filePath'] = 'justificatifs_files/' . $filename;
                    $j['hasFile'] = true;
                    break;
                }
            }
            unset($j);
            file_put_contents($comptaFile, json_encode($comptaData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
    }
    
    echo json_encode([
        'success' => true,
        'filePath' => 'justificatifs_files/' . $filename,
        'fileSize' => strlen($decoded)
    ]);
    exit;
}

// === OPTIONNEL : Action pour récupérer un fichier de justificatif ===
// Ajoutez aussi dans la section GET :

if ($action === 'get_justificatif_file' || isset($_GET['justificatif_file'])) {
    $justifId = $_GET['justificatif_file'] ?? $_GET['id'] ?? null;
    if (!$justifId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'ID requis']);
        exit;
    }
    
    // Chercher le fichier
    $files = glob($justifFilesDir . $justifId . '.*');
    if (empty($files)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Fichier non trouvé']);
        exit;
    }
    
    $filepath = $files[0];
    $ext = pathinfo($filepath, PATHINFO_EXTENSION);
    
    // Retourner le fichier en base64
    $content = file_get_contents($filepath);
    $base64 = base64_encode($content);
    
    $mimeTypes = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'pdf' => 'application/pdf',
        'webp' => 'image/webp'
    ];
    
    echo json_encode([
        'success' => true,
        'fileBase64' => $base64,
        'fileType' => $mimeTypes[$ext] ?? 'application/octet-stream',
        'fileName' => basename($filepath)
    ]);
    exit;
}

/**
 * IMPORTANT : Vérifiez aussi dans votre php.ini ou .htaccess :
 * 
 * php_value post_max_size 50M
 * php_value upload_max_filesize 50M
 * php_value max_input_vars 10000
 * php_value max_execution_time 120
 * 
 * Si vous utilisez un .htaccess, ajoutez :
 * php_value post_max_size 50M
 * php_value upload_max_filesize 50M
 */
?>
