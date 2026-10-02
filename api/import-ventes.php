<?php
/**
 * Import des ventes - Remplace le workflow n8n
 * - BilletWeb : API directe
 * - Trium : API VPS (Puppeteer + Browserless)
 * - Fichiers : Extraction Groq Vision / parsing CSV
 * - France Billet : non géré (saisie manuelle côté frontend)
 */
require_once 'config.php';

/**
 * @param array $spectaclesList JSON client (id, date, …)
 * @param string $id
 */
function importVentesSpectacleIsPast(array $spectaclesList, $id) {
    if ($id === '' || $id === null) {
        return false;
    }
    foreach ($spectaclesList as $ref) {
        if (($ref['id'] ?? '') !== $id) {
            continue;
        }
        $d = $ref['date'] ?? '';
        if ($d === '' || $d === null) {
            return false;
        }
        $day = strtotime(substr((string) $d, 0, 10) . ' 00:00:00');
        if ($day === false) {
            return false;
        }
        $today = strtotime(date('Y-m-d') . ' 00:00:00');
        return $day < $today;
    }
    return false;
}

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

// Multipart: token peut être dans POST
if (isset($_POST['token']) && !isset($_SERVER['HTTP_AUTHORIZATION']) && !isset($_SERVER['HTTP_X_AUTH_TOKEN'])) {
    $_SERVER['HTTP_X_AUTH_TOKEN'] = $_POST['token'];
}

$userId = verifyToken();

// Permission import_ventes
if (!function_exists('checkPermission') || !checkPermission($userId, 'import_ventes', 'edit')) {
    if (!checkPermission($userId, 'admin', 'edit')) {
        http_response_code(403);
        echo json_encode(['error' => 'Permission refusée']);
        exit;
    }
}

$allSpectacles = [];
$spectaclesList = [];
$targetSpectacleId = null;
$triumError = null;
$triumDebug = null;

// Parser les paramètres POST
if (isset($_POST['spectacles'])) {
    $spectaclesList = json_decode($_POST['spectacles'], true);
    if (!is_array($spectaclesList)) $spectaclesList = [];
}
if (isset($_POST['targetSpectacleId']) && $_POST['targetSpectacleId']) {
    $targetSpectacleId = trim($_POST['targetSpectacleId']);
}

if ($targetSpectacleId && importVentesSpectacleIsPast($spectaclesList, $targetSpectacleId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Import des ventes indisponible pour un spectacle passé.']);
    exit;
}

// ========== BILLETWEB ==========
if (isset($_POST['billetweb']) && $_POST['billetweb'] === 'true' && !empty($_POST['billetwebOrgId']) && !empty($_POST['billetwebApiKey'])) {
    $orgId = trim($_POST['billetwebOrgId']);
    $apiKey = trim($_POST['billetwebApiKey']);
    
    $eventsUrl = "https://www.billetweb.fr/api/events?user=" . urlencode($orgId) . "&key=" . urlencode($apiKey) . "&version=1&past=0";
    
    $ch = curl_init($eventsUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true
    ]);
    $eventsResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200 && $eventsResponse) {
        $events = json_decode($eventsResponse, true);
        if (is_array($events)) {
            $eventMap = [];
            foreach ($events as $ev) {
                if (!empty($ev['id'])) {
                    $eventMap[$ev['id']] = [
                        'eventId' => $ev['id'],
                        'name' => $ev['name'] ?? '',
                        'date' => isset($ev['start']) ? substr($ev['start'], 0, 10) : null,
                        'location' => $ev['place'] ?? '',
                        'totalBillets' => 0,
                        'totalCA' => 0
                    ];
                }
            }
            
            foreach ($eventMap as $eventId => &$event) {
                $attendeesUrl = "https://www.billetweb.fr/api/event/" . $eventId . "/attendees?user=" . urlencode($orgId) . "&key=" . urlencode($apiKey) . "&version=1";
                $ch = curl_init($attendeesUrl);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 60,
                    CURLOPT_FOLLOWLOCATION => true
                ]);
                $attResponse = curl_exec($ch);
                curl_close($ch);
                
                if ($attResponse) {
                    $attendees = json_decode($attResponse, true);
                    if (is_array($attendees)) {
                        foreach ($attendees as $a) {
                            $event['totalBillets'] += 1;
                            $event['totalCA'] += floatval($a['price'] ?? 0);
                        }
                    }
                }
            }
            unset($event);
            
            foreach ($eventMap as $e) {
                $allSpectacles[] = [
                    'name' => $e['name'],
                    'date' => $e['date'],
                    'location' => $e['location'],
                    'totalBillets' => $e['totalBillets'],
                    'totalCA' => round($e['totalCA'] * 100) / 100,
                    'source' => 'billetweb',
                    'matchedId' => null
                ];
            }
        }
    }
}

// ========== TRIUM (API VPS) ==========
if (isset($_POST['ticketmaster']) && $_POST['ticketmaster'] === 'true' && !empty($_POST['triumUser2']) && !empty($_POST['triumPass2']) && !empty($_POST['triumApiUrl'])) {
    $triumUser1 = trim($_POST['triumUser1'] ?? 'ticketnet');
    $triumPass1 = trim($_POST['triumPass1'] ?? '');
    $triumUser2 = trim($_POST['triumUser2'] ?? '');
    $triumPass2 = trim($_POST['triumPass2'] ?? '');
    $triumApiUrl = rtrim(trim($_POST['triumApiUrl'] ?? ''), '/');
    
    $scrapeUrl = $triumApiUrl . '/scrape';
    $payload = json_encode([
        'triumUser1' => $triumUser1,
        'triumPass1' => $triumPass1,
        'triumUser2' => $triumUser2,
        'triumPass2' => $triumPass2
    ]);
    
    $ch = curl_init($scrapeUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_CONNECTTIMEOUT => 10
    ]);
    $output = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    
    if ($curlError) {
        $triumError = 'Connexion VPS impossible: ' . $curlError;
        $triumDebug = ['url' => $scrapeUrl, 'httpCode' => $httpCode, 'curlError' => $curlError];
    } elseif ($httpCode !== 200) {
        $triumError = 'API Trium: HTTP ' . $httpCode;
        $triumDebug = ['url' => $scrapeUrl, 'httpCode' => $httpCode];
    } elseif ($output) {
        $triumData = json_decode(trim($output), true);
        if (!is_array($triumData)) {
            $triumError = 'API Trium: réponse JSON invalide';
        } elseif (!empty($triumData['error'])) {
            $triumError = 'Trium: ' . $triumData['error'];
        } elseif (!empty($triumData['events']) && is_array($triumData['events'])) {
            $triumDebug = ['url' => $scrapeUrl, 'httpCode' => $httpCode, 'eventsCount' => count($triumData['events'])];
            foreach ($triumData['events'] as $ev) {
                $location = trim(($ev['lieu'] ?? '') . ' ' . ($ev['ville'] ?? ''));
                $allSpectacles[] = [
                    'name' => $ev['manifestation'] ?? '',
                    'date' => $ev['dateDebut'] ?? '',
                    'location' => $location,
                    'totalBillets' => intval($ev['vendu'] ?? 0),
                    'totalCA' => floatval(str_replace(',', '.', $ev['ca'] ?? 0)),
                    'source' => 'ticketmaster',
                    'matchedId' => null
                ];
            }
        } else {
            $triumError = 'Trium: aucun événement retourné (identifiants ou page modifiée ?)';
        }
    } else {
        $triumError = 'API Trium: réponse vide';
    }
}

// ========== FICHIERS (Groq Vision / CSV) ==========
$fileCount = intval($_POST['fileCount'] ?? 0);
for ($i = 0; $i < $fileCount; $i++) {
    $key = "file_$i";
    if (isset($_FILES[$key]) && $_FILES[$key]['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES[$key];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $mime = $file['type'] ?? '';
        
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp']) || strpos($mime, 'image/') === 0) {
            $base64 = base64_encode(file_get_contents($file['tmp_name']));
            $extracted = extractFromImageGroq($base64, $file['type'] ?? 'image/jpeg', $spectaclesList);
            if (!empty($extracted)) {
                $allSpectacles = array_merge($allSpectacles, $extracted);
            }
        } elseif (in_array($ext, ['csv'])) {
            $extracted = parseCsvVentes($file['tmp_name'], $spectaclesList);
            if (!empty($extracted)) {
                $allSpectacles = array_merge($allSpectacles, $extracted);
            }
        }
    }
}

// ========== MATCHING ==========
$allSpectacles = matchSpectacles($allSpectacles, $spectaclesList);

// Filtrer par targetSpectacleId si import ciblé
if ($targetSpectacleId) {
    $allSpectacles = array_filter($allSpectacles, function ($s) use ($targetSpectacleId) {
        return ($s['matchedId'] ?? null) === $targetSpectacleId;
    });
    $allSpectacles = array_values($allSpectacles);
}

$confidence = count($allSpectacles) > 0 ? 90 : 0;

$response = [
    'spectacles' => $allSpectacles,
    'confidence' => $confidence
];
if ($triumError !== null) {
    $response['triumError'] = $triumError;
}
if ($triumDebug !== null) {
    $response['triumDebug'] = $triumDebug;
}
echo json_encode($response);

// ========== FONCTIONS ==========

function extractFromImageGroq($base64, $mimeType, $spectaclesList) {
    $apiKey = defined('GROQ_API_KEY') ? GROQ_API_KEY : '';
    if (!$apiKey) return [];
    
    $spectaclesJson = json_encode(array_slice($spectaclesList, 0, 20));
    $prompt = "Extrais les données de ventes de billetterie de cette image. Pour chaque événement/spectacle visible, retourne un JSON avec: name (nom), date (YYYY-MM-DD ou DD/MM/YYYY), location (lieu/ville), totalBillets (nombre vendu), totalCA (chiffre d'affaires en €). Réponds UNIQUEMENT avec un JSON valide: {\"spectacles\": [{\"name\": \"...\", \"date\": \"...\", \"location\": \"...\", \"totalBillets\": 0, \"totalCA\": 0}]}. Si aucun spectacle trouvé, retourne {\"spectacles\": []}.";
    
    $body = [
        'model' => 'meta-llama/llama-4-scout-17b-16e-instruct',
        'messages' => [
            [
                'role' => 'user',
                'content' => [
                    ['type' => 'text', 'text' => $prompt],
                    ['type' => 'image_url', 'image_url' => ['url' => 'data:' . $mimeType . ';base64,' . $base64]]
                ]
            ]
        ],
        'max_tokens' => 1024,
        'temperature' => 0.2
    ];
    
    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    
    if (!$response) return [];
    $data = json_decode($response, true);
    if (empty($data['choices'][0]['message']['content'])) return [];
    
    $content = trim($data['choices'][0]['message']['content']);
    if (preg_match('/\{[\s\S]*\}/', $content, $m)) {
        $parsed = json_decode($m[0], true);
        if (!empty($parsed['spectacles']) && is_array($parsed['spectacles'])) {
            $out = [];
            foreach ($parsed['spectacles'] as $s) {
                $out[] = [
                    'name' => $s['name'] ?? '',
                    'date' => $s['date'] ?? '',
                    'location' => $s['location'] ?? '',
                    'totalBillets' => intval($s['totalBillets'] ?? 0),
                    'totalCA' => floatval($s['totalCA'] ?? 0),
                    'source' => 'fichier',
                    'matchedId' => null
                ];
            }
            return $out;
        }
    }
    return [];
}

function parseCsvVentes($path, $spectaclesList) {
    $out = [];
    $content = file_get_contents($path);
    if (!$content) return [];
    $delim = (strpos($content, ';') !== false) ? ';' : ',';
    $lines = explode("\n", trim($content));
    
    foreach ($lines as $i => $line) {
        $row = str_getcsv($line, $delim);
        if (count($row) < 2) continue;
        $name = trim($row[0] ?? '');
        $date = trim($row[1] ?? '');
        $location = trim($row[2] ?? '');
        $billets = intval($row[3] ?? $row[4] ?? 0);
        $ca = floatval(str_replace(',', '.', $row[4] ?? $row[5] ?? 0));
        if ($name && ($billets > 0 || $ca > 0)) {
            $out[] = [
                'name' => $name,
                'date' => $date,
                'location' => $location,
                'totalBillets' => $billets,
                'totalCA' => $ca,
                'source' => 'fichier',
                'matchedId' => null
            ];
        }
    }
    return $out;
}

function normalizeDateForMatch($date) {
    if (empty($date)) return null;
    $date = trim($date);
    // DD/MM/YYYY -> YYYY-MM-DD
    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $date, $m)) {
        return $m[3] . '-' . str_pad($m[2], 2, '0', STR_PAD_LEFT) . '-' . str_pad($m[1], 2, '0', STR_PAD_LEFT);
    }
    // Déjà YYYY-MM-DD
    if (preg_match('/^\d{4}-\d{2}-\d{2}/', $date)) {
        return substr($date, 0, 10);
    }
    return $date;
}

function normalizeForCompare($str) {
    if (empty($str)) return '';
    $str = mb_strtolower(trim($str), 'UTF-8');
    if (class_exists('Normalizer')) {
        $str = preg_replace('/[\x{0300}-\x{036f}]/u', '', Normalizer::normalize($str, Normalizer::FORM_D));
    } else {
        $accents = ['à'=>'a','á'=>'a','â'=>'a','ä'=>'a','è'=>'e','é'=>'e','ê'=>'e','ë'=>'e','ì'=>'i','í'=>'i','î'=>'i','ï'=>'i','ò'=>'o','ó'=>'o','ô'=>'o','ö'=>'o','ù'=>'u','ú'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n'];
        $str = strtr($str, $accents);
    }
    $str = preg_replace('/[^a-z0-9\s]/u', ' ', $str);
    $str = preg_replace('/\s+/', ' ', $str);
    return trim($str);
}

function extractBaseName($name) {
    $name = trim($name);
    if (preg_match('/^(.+?)\s*[-–—]\s*.+$/u', $name, $m)) {
        return trim($m[1]);
    }
    return $name;
}

function matchSpectacles($spectacles, $spectaclesList) {
    if (empty($spectaclesList)) return $spectacles;
    
    foreach ($spectacles as &$s) {
        $bestMatch = null;
        $bestScore = 0;
        $sName = normalizeForCompare($s['name'] ?? '');
        $sNameBase = normalizeForCompare(extractBaseName($s['name'] ?? ''));
        $sDate = normalizeDateForMatch($s['date'] ?? '');
        $sLoc = normalizeForCompare($s['location'] ?? '');
        
        foreach ($spectaclesList as $ref) {
            $rName = normalizeForCompare($ref['name'] ?? '');
            $rNameBase = normalizeForCompare(extractBaseName($ref['name'] ?? ''));
            $rDate = normalizeDateForMatch($ref['date'] ?? '');
            $rLoc = normalizeForCompare($ref['location'] ?? '');
            
            $score = 0;
            // Nom : contient, ou base name (avant " - Ville") identique
            if ($sName && $rName) {
                if (strpos($rName, $sName) !== false || strpos($sName, $rName) !== false) {
                    $score += 50;
                } elseif ($sNameBase && $rNameBase && strlen($sNameBase) >= 4 && (strpos($rNameBase, $sNameBase) !== false || strpos($sNameBase, $rNameBase) !== false || $sNameBase === $rNameBase)) {
                    $score += 50;
                }
            }
            // Date : normalisée
            if ($sDate && $rDate && $sDate === $rDate) $score += 30;
            // Lieu : comparaison normalisée
            if ($sLoc && $rLoc && (strpos($rLoc, $sLoc) !== false || strpos($sLoc, $rLoc) !== false)) $score += 20;
            
            if ($score > $bestScore && $score >= 50) {
                $bestScore = $score;
                $bestMatch = $ref['id'] ?? null;
            }
        }
        if ($bestMatch) $s['matchedId'] = $bestMatch;
    }
    unset($s);
    return $spectacles;
}
