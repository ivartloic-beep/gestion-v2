<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode non autorisee']);
    exit;
}

// Pour les requetes multipart/form-data, le token peut etre dans POST
if (isset($_POST['token']) && !isset($_SERVER['HTTP_AUTHORIZATION']) && !isset($_SERVER['HTTP_X_AUTH_TOKEN'])) {
    $_SERVER['HTTP_X_AUTH_TOKEN'] = $_POST['token'];
}

// Verifier le token
$userId = verifyToken();

// Verifier les permissions (admin, taches ou espaces de travail)
if (!checkPermission($userId, 'admin', 'edit')
    && !checkPermission($userId, 'taches', 'edit')
    && !checkPermission($userId, 'espaces_travail', 'edit')) {
    http_response_code(403);
    echo json_encode(['error' => 'Permission de modification refusee']);
    exit;
}

try {
    // Verifier qu'un fichier a ete uploade
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $uploadError = $_FILES['file']['error'] ?? null;
        $errorMsg = 'Aucun fichier recu ou erreur d\'upload';
        if ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
            $errorMsg = 'Fichier trop volumineux (limite serveur depassee, max 1 Go)';
        } elseif ($uploadError === UPLOAD_ERR_PARTIAL) {
            $errorMsg = 'Upload interrompu (fichier partiel)';
        } elseif ($uploadError === UPLOAD_ERR_NO_FILE) {
            $errorMsg = 'Aucun fichier recu';
        }
        http_response_code(400);
        echo json_encode(['error' => $errorMsg]);
        exit;
    }

    $file = $_FILES['file'];
    $type = $_POST['type'] ?? 'documents'; // 'visuels', 'documents', 'budget'
    
    // Types MIME autorises - tous formats acceptes dans toutes les categories
    $allAllowedMimes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'video/mp4', 'video/webm', 'video/quicktime'
    ];
    
    // Toutes les categories utilisent la meme liste
    $allowedMimes = [
        'visuels' => $allAllowedMimes,
        'documents' => $allAllowedMimes,
        'budget' => $allAllowedMimes,
        'videos' => $allAllowedMimes
    ];
    
    if (!isset($allowedMimes[$type])) {
        http_response_code(400);
        echo json_encode(['error' => 'Type de categorie non autorise: ' . $type]);
        exit;
    }
    
    // Detecter et nettoyer le type MIME
    $mimeType = $file['type'] ?? '';
    if (empty($mimeType) || $mimeType === 'application/octet-stream') {
        $mimeType = mime_content_type($file['tmp_name']) ?: '';
    }
    $mimeType = strtolower(trim($mimeType));
    
    // Extension du fichier
    $extension = strtolower(trim(pathinfo($file['name'], PATHINFO_EXTENSION)));
    
    // Pour "documents" : blacklist des extensions dangereuses, tout le reste est accepte
    $dangerousExtensions = ['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'js', 'jar', 'ps1', 'sh', 'bash'];
    if ($type === 'documents') {
        if (in_array($extension, $dangerousExtensions)) {
            http_response_code(400);
            echo json_encode(['error' => 'Extension non autorisee pour des raisons de securite: .' . $extension]);
            exit;
        }
        $mimeAllowed = true; // Tout type MIME accepte pour documents
    }
    
    // Table extension → MIME canonique
    $extensionToMime = [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
        'gif' => 'image/gif', 'webp' => 'image/webp',
        'pdf' => 'application/pdf',
        'doc' => 'application/msword', 
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel', 
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'txt' => 'text/plain',
        'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime'
    ];
    
    // Variantes MIME connues → MIME canonique
    $mimeAliases = [
        'image/jpg' => 'image/jpeg',
        'image/x-png' => 'image/png',
        'image/x-jpeg' => 'image/jpeg',
        'image/pjpeg' => 'image/jpeg',
        'application/x-pdf' => 'application/pdf'
    ];
    
    // Normaliser les alias
    if (isset($mimeAliases[$mimeType])) {
        $mimeType = $mimeAliases[$mimeType];
    }
    
    // Verifier si le MIME est autorise (sauf pour "documents" qui accepte tout)
    if ($type !== 'documents') {
        $mimeAllowed = in_array($mimeType, $allowedMimes[$type]);
        
        // Si le MIME n'est pas reconnu, essayer par extension
        if (!$mimeAllowed && isset($extensionToMime[$extension])) {
            $canonicalMime = $extensionToMime[$extension];
            if (in_array($canonicalMime, $allowedMimes[$type])) {
                $mimeType = $canonicalMime;
                $mimeAllowed = true;
            }
        }
        
        // Dernier recours : application/octet-stream avec extension connue
        if (!$mimeAllowed && ($mimeType === 'application/octet-stream' || empty($mimeType))) {
            if (isset($extensionToMime[$extension]) && in_array($extensionToMime[$extension], $allowedMimes[$type])) {
                $mimeType = $extensionToMime[$extension];
                $mimeAllowed = true;
            }
        }
    } else {
        $mimeAllowed = true; // Deja valide (blacklist verifiee plus haut)
    }
    
    if (!$mimeAllowed) {
        http_response_code(400);
        echo json_encode(['error' => 'Type MIME non autorise: ' . $mimeType . ' (extension: ' . $extension . ', categorie: ' . $type . ')']);
        exit;
    }

    // Generer un ID unique pour le fichier
    $fileId = bin2hex(random_bytes(16));
    
    // Creer la structure de dossiers : /uploads/[type]/[annee]/[mois]/
    $year = date('Y');
    $month = date('m');
    $uploadDir = __DIR__ . "/uploads/{$type}/{$year}/{$month}/";
    
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    // Obtenir l'extension du fichier
    if (empty($extension)) {
        // Deduire l'extension du type MIME
        $mimeToExt = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'application/pdf' => 'pdf',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.ms-excel' => 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
            'text/plain' => 'txt',
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
            'video/quicktime' => 'mov'
        ];
        $extension = $mimeToExt[$mimeType] ?? 'bin';
    }
    
    $storedPath = $uploadDir . $fileId . '.' . $extension;
    
    // Deplacer le fichier
    if (!move_uploaded_file($file['tmp_name'], $storedPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Erreur lors du deplacement du fichier']);
        exit;
    }
    
    // Enregistrer dans la base de donnees
    $pdo = getDB();
    
    // Auto-creation de la table si elle n'existe pas
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS uploaded_files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            file_id VARCHAR(64) NOT NULL UNIQUE,
            original_name VARCHAR(500) NOT NULL,
            stored_path VARCHAR(500) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            size BIGINT NOT NULL DEFAULT 0,
            type VARCHAR(50) NOT NULL DEFAULT 'documents',
            uploaded_by INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_file_id (file_id),
            INDEX idx_type (type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    
    $stmt = $pdo->prepare("
        INSERT INTO uploaded_files (file_id, original_name, stored_path, mime_type, size, type, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    
    // Chemin relatif pour la base de donnees
    $relativePath = "uploads/{$type}/{$year}/{$month}/{$fileId}.{$extension}";
    
    $stmt->execute([
        $fileId,
        $file['name'],
        $relativePath,
        $mimeType,
        $file['size'],
        $type,
        $userId
    ]);
    
    echo json_encode([
        'success' => true,
        'file_id' => $fileId,
        'url' => "download.php?id={$fileId}",
        'original_name' => $file['name'],
        'size' => $file['size'],
        'mime_type' => $mimeType
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage()]);
}
?>