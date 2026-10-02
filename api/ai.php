<?php
/**
 * API Assistant IA - Spectacles (et tournées plus tard)
 * - Contexte spectacle construit côté serveur (données agrégées)
 * - Appel Groq pour la réponse
 * - Conversations par entité (spectacle/tournée) avec visibilité équipe ou privée
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$userId = verifyToken();
$pdo = getDB();

// Créer les tables si nécessaire (plusieurs conversations privées par spectacle/utilisateur)
$pdo->exec("
    CREATE TABLE IF NOT EXISTS ai_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_type VARCHAR(20) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        title VARCHAR(255) DEFAULT NULL,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_entity_user (entity_type, entity_id, created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");
try { $pdo->exec("ALTER TABLE ai_conversations DROP INDEX uq_conv"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE ai_conversations ADD COLUMN title VARCHAR(255) DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE ai_conversations DROP COLUMN visibility"); } catch (Exception $e) {}
$pdo->exec("
    CREATE TABLE IF NOT EXISTS ai_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
        INDEX idx_conv (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

/**
 * Calcul total billets vendus (aligné sur getTotalBillets en JS)
 */
function getTotalBilletsFromSpectacle($spectacle) {
    if (empty($spectacle['releves']) || !is_array($spectacle['releves'])) return 0;
    $releves = $spectacle['releves'];
    $last = end($releves);
    $reseaux = isset($spectacle['reseaux']) && is_array($spectacle['reseaux']) ? $spectacle['reseaux'] : [];
    $total = 0;
    foreach ($reseaux as $r) {
        $total += (int)(isset($last[$r]) ? $last[$r] : 0);
    }
    $guichet = isset($spectacle['guichet']) ? $spectacle['guichet'] : null;
    if ($guichet && !empty($guichet['stockReserve'])) {
        $stockReserve = (int)$guichet['stockReserve'];
        $ventesReelles = (int)(isset($guichet['ventesReelles']) ? $guichet['ventesReelles'] : 0);
        $invendusGuichet = max(0, $stockReserve - $ventesReelles);
        $total -= $invendusGuichet;
    }
    return max(0, $total);
}

/**
 * Calcul CA total (aligné sur getTotalCA en JS)
 */
function getTotalCAFromSpectacle($spectacle) {
    if (empty($spectacle['releves']) || !is_array($spectacle['releves'])) return 0;
    $releves = $spectacle['releves'];
    $last = end($releves);
    $reseaux = isset($spectacle['reseaux']) && is_array($spectacle['reseaux']) ? $spectacle['reseaux'] : [];
    $totalCA = 0;
    foreach ($reseaux as $r) {
        $key = $r . '_ca';
        $totalCA += (float)(isset($last[$key]) ? $last[$key] : 0);
    }
    $guichet = isset($spectacle['guichet']) ? $spectacle['guichet'] : null;
    if ($guichet && !empty($guichet['stockReserve'])) {
        $stockReserve = (int)$guichet['stockReserve'];
        $ventesReelles = (int)(isset($guichet['ventesReelles']) ? $guichet['ventesReelles'] : 0);
        $invendusGuichet = max(0, $stockReserve - $ventesReelles);
        $bwBillets = (int)(isset($last['billetweb']) ? $last['billetweb'] : 0);
        $bwCA = (float)(isset($last['billetweb_ca']) ? $last['billetweb_ca'] : 0);
        $prixMoyenBW = $bwBillets > 0 ? $bwCA / $bwBillets : 0;
        $totalCA -= $invendusGuichet * $prixMoyenBW;
        $totalCA += (float)(isset($guichet['ca']) ? $guichet['ca'] : 0);
    }
    return max(0, $totalCA);
}

/**
 * CA maximum depuis billetCategories
 */
function getCAMaxFromSpectacle($spectacle) {
    if (empty($spectacle['billetCategories']) || !is_array($spectacle['billetCategories'])) return 0;
    $caMax = 0;
    foreach ($spectacle['billetCategories'] as $cat) {
        $n = (float)(isset($cat['nombreDisponible']) ? $cat['nombreDisponible'] : 0);
        $p = (float)(isset($cat['prix']) ? $cat['prix'] : 0);
        $caMax += $n * $p;
    }
    return $caMax;
}

/**
 * Budget total TTC estimé
 */
function getBudgetTotalFromSpectacle($spectacle, $totalCA) {
    if (empty($spectacle['budget']) || !is_array($spectacle['budget'])) return 0;
    $total = 0;
    foreach ($spectacle['budget'] as $line) {
        $montantHT = 0;
        if (isset($line['montantType']) && $line['montantType'] === 'percent') {
            $pct = (float)(isset($line['percentBilletterie']) ? $line['percentBilletterie'] : 0);
            $montantHT = $totalCA * ($pct / 100);
        } else {
            $montantHT = (float)(isset($line['montantFixe']) ? $line['montantFixe'] : 0);
        }
        $tva = (float)(isset($line['tvaRate']) ? $line['tvaRate'] : 0);
        $total += $montantHT * (1 + $tva / 100);
    }
    return $total;
}

/**
 * Charge les paramètres app (lieux, prestataires) pour résoudre les noms
 */
function getAppSettings($pdo) {
    static $cached = null;
    if ($cached !== null) return $cached;
    $stmt = $pdo->query("SELECT data FROM settings WHERE id = 1");
    $row = $stmt->fetch();
    $cached = ($row && $row['data']) ? json_decode($row['data'], true) : [];
    return $cached ?: [];
}

/**
 * Construit le contexte texte pour l'IA (spectacle avec toutes les données disponibles)
 */
function buildSpectacleContext($pdo, $spectacleId) {
    $stmt = $pdo->query("SELECT data FROM projects WHERE id = 'all'");
    $row = $stmt->fetch();
    if (!$row || !$row['data']) return null;
    $projects = json_decode($row['data'], true);
    if (!is_array($projects)) return null;

    $spectacle = null;
    $tournee = null;
    foreach ($projects as $p) {
        if (isset($p['id']) && $p['id'] === $spectacleId) $spectacle = $p;
        if ($spectacle && !empty($spectacle['parentId']) && isset($p['id']) && $p['id'] === $spectacle['parentId']) $tournee = $p;
    }
    if (!$spectacle) return null;

    $settings = getAppSettings($pdo);
    $lieux = isset($settings['lieux']) && is_array($settings['lieux']) ? $settings['lieux'] : [];
    $prestataires = isset($settings['prestataires']) && is_array($settings['prestataires']) ? $settings['prestataires'] : [];

    $totalBillets = getTotalBilletsFromSpectacle($spectacle);
    $totalCA = getTotalCAFromSpectacle($spectacle);
    $caMax = getCAMaxFromSpectacle($spectacle);
    $capacite = (int)(isset($spectacle['capacite']) ? $spectacle['capacite'] : 0);
    if ($capacite <= 0 && !empty($spectacle['billetCategories'])) {
        foreach ($spectacle['billetCategories'] as $c) {
            $capacite += (int)(isset($c['nombreDisponible']) ? $c['nombreDisponible'] : 0);
        }
    }
    $tauxRemplissage = $capacite > 0 ? round(($totalBillets / $capacite) * 100) : 0;
    $budgetTotal = getBudgetTotalFromSpectacle($spectacle, $totalCA);
    $prixMoyen = $totalBillets > 0 ? $totalCA / $totalBillets : ($caMax > 0 && $capacite > 0 ? $caMax / $capacite : 0);
    $seuilBillets = $prixMoyen > 0 && $budgetTotal > 0 ? (int)ceil($budgetTotal / $prixMoyen) : null;
    $estRentable = $seuilBillets !== null ? $totalBillets >= $seuilBillets : null;
    $billetsManquants = $seuilBillets !== null ? max(0, $seuilBillets - $totalBillets) : null;
    $joursRestants = null;
    if (!empty($spectacle['date'])) {
        $d = strtotime($spectacle['date'] . ' 23:59:59');
        $joursRestants = $d ? max(0, (int)(($d - time()) / 86400)) : null;
    }

    $lines = [];
    $lines[] = "## SPECTACLE : " . (isset($spectacle['name']) ? $spectacle['name'] : $spectacleId);
    $lines[] = "Date : " . (isset($spectacle['date']) ? $spectacle['date'] : 'Non définie');
    $lines[] = "Heure : " . (isset($spectacle['time']) ? $spectacle['time'] : 'Non définie');
    $lines[] = "Lieu : " . (isset($spectacle['location']) ? $spectacle['location'] : 'Non défini');
    $lines[] = "Capacité : " . $capacite;
    $lines[] = "Mode d'exploitation : " . (isset($spectacle['modeExploitation']) ? $spectacle['modeExploitation'] : 'organise');
    $lines[] = "Statut : " . (isset($spectacle['status']) ? $spectacle['status'] : 'confirmed');
    $lines[] = "";

    $lines[] = "### Billetterie";
    $lines[] = "Billets vendus : " . $totalBillets . " / " . $capacite . " (" . $tauxRemplissage . " %)";
    $lines[] = "Chiffre d'affaires : " . number_format($totalCA, 2, ',', ' ') . " €";
    $lines[] = "CA maximum possible : " . number_format($caMax, 2, ',', ' ') . " €";
    $lines[] = "Prix moyen du billet : " . number_format($prixMoyen, 2, ',', ' ') . " €";

    if (!empty($spectacle['releves']) && is_array($spectacle['releves'])) {
        $releves = $spectacle['releves'];
        $last = end($releves);
        $reseaux = isset($spectacle['reseaux']) && is_array($spectacle['reseaux']) ? $spectacle['reseaux'] : [];
        $lines[] = "Détail par réseau de vente (dernier relevé) :";
        foreach ($reseaux as $r) {
            $billets = (int)(isset($last[$r]) ? $last[$r] : 0);
            $ca = (float)(isset($last[$r . '_ca']) ? $last[$r . '_ca'] : 0);
            $lines[] = "  - " . $r . " : " . $billets . " billets, " . number_format($ca, 2, ',', ' ') . " €";
        }
        if (count($releves) >= 2) {
            $prev = $releves[count($releves) - 2];
            $prevTotal = 0;
            foreach ($reseaux as $r) {
                $prevTotal += (int)(isset($prev[$r]) ? $prev[$r] : 0);
            }
            $evolution = $totalBillets - $prevTotal;
            $lines[] = "Évolution depuis le relevé précédent : " . ($evolution >= 0 ? '+' : '') . $evolution . " billets";
        }
    }
    if (!empty($spectacle['guichet']) && (isset($spectacle['guichet']['stockReserve']) || isset($spectacle['guichet']['ventesReelles']))) {
        $g = $spectacle['guichet'];
        $lines[] = "Guichet : stock réservé " . (isset($g['stockReserve']) ? $g['stockReserve'] : 0) . ", ventes réelles " . (isset($g['ventesReelles']) ? $g['ventesReelles'] : 0) . ", CA " . (isset($g['ca']) ? number_format($g['ca'], 2, ',', ' ') . ' €' : '-');
    }
    if (!empty($spectacle['billetCategories'])) {
        $lines[] = "Catégories de billets :";
        foreach ($spectacle['billetCategories'] as $cat) {
            $nom = isset($cat['nom']) ? $cat['nom'] : 'Catégorie';
            $n = isset($cat['nombreDisponible']) ? $cat['nombreDisponible'] : 0;
            $p = isset($cat['prix']) ? $cat['prix'] : 0;
            $v = isset($cat['vendus']) ? $cat['vendus'] : 0;
            $lines[] = "  - " . $nom . " (" . $p . " €) : " . $v . " / " . $n . " vendus";
        }
    }
    if (!empty($spectacle['reseaux'])) {
        $lines[] = "Réseaux actifs : " . implode(', ', $spectacle['reseaux']);
    }
    $lines[] = "";

    $lines[] = "### Budget";
    $lines[] = "Budget total TTC estimé : " . number_format($budgetTotal, 2, ',', ' ') . " €";
    $lines[] = "Seuil de rentabilité : " . ($seuilBillets !== null ? $seuilBillets . " billets" : 'Non calculable');
    $lines[] = "Rentable : " . ($estRentable === true ? 'Oui' : ($estRentable === false ? 'Non (il manque ' . $billetsManquants . ' billets)' : 'N/A'));
    if (!empty($spectacle['budget']) && is_array($spectacle['budget'])) {
        $lines[] = "Détail des lignes budgétaires :";
        foreach ($spectacle['budget'] as $i => $line) {
            $designation = isset($line['designation']) ? $line['designation'] : (isset($line['label']) ? $line['label'] : 'Ligne ' . ($i + 1));
            $montantHT = 0;
            if (isset($line['montantType']) && $line['montantType'] === 'percent') {
                $pct = (float)(isset($line['percentBilletterie']) ? $line['percentBilletterie'] : 0);
                $montantHT = $totalCA * ($pct / 100);
            } else {
                $montantHT = (float)(isset($line['montantFixe']) ? $line['montantFixe'] : 0);
            }
            $tva = (float)(isset($line['tvaRate']) ? $line['tvaRate'] : 0);
            $ttc = $montantHT * (1 + $tva / 100);
            $reel = !empty($line['isReel']) ? ' [engagé]' : '';
            $lines[] = "  - " . $designation . " : " . number_format($ttc, 2, ',', ' ') . " € TTC" . $reel;
        }
    }
    if (!empty($spectacle['apportsFinanciers']) && is_array($spectacle['apportsFinanciers'])) {
        $totalApports = 0;
        foreach ($spectacle['apportsFinanciers'] as $a) {
            $totalApports += (float)(isset($a['montant']) ? $a['montant'] : 0);
        }
        $lines[] = "Apports financiers : " . count($spectacle['apportsFinanciers']) . " poste(s), total " . number_format($totalApports, 2, ',', ' ') . " €";
    }
    if ($joursRestants !== null) {
        $lines[] = "Jours restants avant la date : " . $joursRestants;
    }
    $lines[] = "";

    if (!empty($spectacle['communications']) && is_array($spectacle['communications'])) {
        $lines[] = "### Communication (actions planifiées)";
        foreach ($spectacle['communications'] as $i => $comm) {
            $nom = isset($comm['nom']) ? $comm['nom'] : 'Action';
            $dates = isset($comm['dateDebut']) ? date('d/m', strtotime($comm['dateDebut'])) : '';
            if (!empty($comm['dateFin'])) $dates .= ' → ' . date('d/m', strtotime($comm['dateFin']));
            $prix = isset($comm['prix']) ? number_format($comm['prix'], 2, ',', ' ') . ' €' : '';
            $prestataireId = isset($comm['prestataire_id']) ? $comm['prestataire_id'] : null;
            $prestataireNom = '';
            if ($prestataireId) {
                foreach ($prestataires as $pr) {
                    if (isset($pr['id']) && $pr['id'] == $prestataireId) {
                        $prestataireNom = isset($pr['nom']) ? $pr['nom'] : $prestataireId;
                        break;
                    }
                }
            }
            $lines[] = "  " . ($i + 1) . ". " . $nom . " (" . $dates . ") " . $prix . ($prestataireNom ? " - Prestataire : " . $prestataireNom : "");
        }
        $lines[] = "";
    }

    if (!empty($spectacle['tech']) && is_array($spectacle['tech'])) {
        $tech = $spectacle['tech'];
        $lines[] = "### Technique & logistique";
        if (!empty($tech['lieuId'])) {
            $lieuNom = $tech['lieuId'];
            foreach ($lieux as $l) {
                if (isset($l['id']) && $l['id'] == $tech['lieuId']) {
                    $lieuNom = isset($l['name']) ? $l['name'] : (isset($l['nom']) ? $l['nom'] : $tech['lieuId']);
                    break;
                }
            }
            $lines[] = "Lieu technique : " . $lieuNom;
        }
        if (!empty($tech['prestataires'])) {
            $lines[] = "Prestataires (" . count($tech['prestataires']) . ") :";
            foreach ($tech['prestataires'] as $pr) {
                $id = is_array($pr) ? (isset($pr['id']) ? $pr['id'] : '') : $pr;
                $nom = $id;
                foreach ($prestataires as $p) {
                    if (isset($p['id']) && $p['id'] == $id) {
                        $nom = isset($p['nom']) ? $p['nom'] : $id;
                        break;
                    }
                }
                $lines[] = "  - " . $nom;
            }
        }
        if (!empty($tech['voyages'])) {
            $lines[] = "Voyages (" . count($tech['voyages']) . ") : " . json_encode(array_map(function ($v) {
                return isset($v['nom']) ? $v['nom'] : (isset($v['destination']) ? $v['destination'] : '-');
            }, $tech['voyages']));
        }
        if (!empty($tech['hebergements'])) {
            $lines[] = "Hébergements (" . count($tech['hebergements']) . ")";
        }
        if (!empty($tech['planning'])) {
            $lines[] = "Planning : " . count($tech['planning']) . " élément(s)";
        }
        if (!empty($tech['notes']) && is_array($tech['notes'])) {
            foreach ($tech['notes'] as $key => $note) {
                if (!empty($note) && is_string($note)) {
                    $lines[] = "Note " . $key . " : " . substr($note, 0, 200) . (strlen($note) > 200 ? '...' : '');
                }
            }
        }
        $lines[] = "";
    }

    if (!empty($spectacle['tasks']) && is_array($spectacle['tasks'])) {
        $tasksEnCours = array_filter($spectacle['tasks'], function ($t) { return empty($t['completed']) || $t['completed'] !== true; });
        $lines[] = "### Tâches : " . count($tasksEnCours) . " en cours / " . count($spectacle['tasks']) . " au total";
        foreach ($spectacle['tasks'] as $t) {
            $titre = isset($t['title']) ? $t['title'] : (isset($t['name']) ? $t['name'] : '-');
            $cat = isset($t['category']) ? $t['category'] : '';
            $done = !empty($t['completed']) ? ' [terminée]' : '';
            $lines[] = "  - " . $titre . ($cat ? " (" . $cat . ")" : "") . $done;
        }
        $lines[] = "";
    }

    if (!empty($spectacle['members']) || !empty($spectacle['membersManual'])) {
        $nb = count($spectacle['members'] ?? []) + count($spectacle['membersManual'] ?? []);
        $lines[] = "### Équipe / Membres : " . $nb . " membre(s)";
        $lines[] = "";
    }

    if (!empty($spectacle['visuels']) && is_array($spectacle['visuels'])) {
        $lines[] = "### Visuels : " . count($spectacle['visuels']) . " fichier(s)";
        foreach (array_slice($spectacle['visuels'], 0, 10) as $v) {
            $lines[] = "  - " . (isset($v['name']) ? $v['name'] : (isset($v['fileName']) ? $v['fileName'] : '-'));
        }
        if (count($spectacle['visuels']) > 10) {
            $lines[] = "  ... et " . (count($spectacle['visuels']) - 10) . " autre(s)";
        }
        $lines[] = "";
    }
    if (!empty($spectacle['documents']) && is_array($spectacle['documents'])) {
        $lines[] = "### Documents : " . count($spectacle['documents']) . " fichier(s)";
        foreach (array_slice($spectacle['documents'], 0, 10) as $d) {
            $lines[] = "  - " . (isset($d['name']) ? $d['name'] : (isset($d['fileName']) ? $d['fileName'] : '-'));
        }
        if (count($spectacle['documents']) > 10) {
            $lines[] = "  ... et " . (count($spectacle['documents']) - 10) . " autre(s)";
        }
        $lines[] = "";
    }

    if ($tournee) {
        $lines[] = "### Tournée parente : " . (isset($tournee['name']) ? $tournee['name'] : $tournee['id']);
        $autresSpectacles = array_filter($projects, function ($p) use ($spectacle, $tournee) {
            return isset($p['parentId']) && $p['parentId'] === $tournee['id'] && isset($p['id']) && $p['id'] !== $spectacle['id'];
        });
        if (!empty($autresSpectacles)) {
            $lines[] = "Autres spectacles de la tournée :";
            foreach ($autresSpectacles as $s) {
                $sb = getTotalBilletsFromSpectacle($s);
                $cap = (int)(isset($s['capacite']) ? $s['capacite'] : 0);
                $pct = $cap > 0 ? round(($sb / $cap) * 100) : 0;
                $lines[] = "  - " . (isset($s['name']) ? $s['name'] : $s['id']) . " : " . (isset($s['date']) ? $s['date'] : '') . ", " . $sb . "/" . $cap . " (" . $pct . " %)";
            }
        }
    }

    return implode("\n", $lines);
}

/**
 * Appel API Groq (compatible OpenAI)
 */
function callGroq($systemPrompt, $messages, $userMessage) {
    $apiKey = defined('GROQ_API_KEY') ? GROQ_API_KEY : '';
    if (!$apiKey) {
        return ['error' => 'Clé API Groq non configurée'];
    }
    $allMessages = [
        ['role' => 'system', 'content' => $systemPrompt]
    ];
    foreach ($messages as $m) {
        $allMessages[] = ['role' => $m['role'], 'content' => $m['content']];
    }
    $allMessages[] = ['role' => 'user', 'content' => $userMessage];

    $body = [
        'model' => 'llama-3.3-70b-versatile',
        'messages' => $allMessages,
        'max_tokens' => 2048,
        'temperature' => 0.4
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
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false) {
        return ['error' => 'Erreur de connexion à l\'API Groq'];
    }
    $data = json_decode($response, true);
    if ($httpCode !== 200) {
        $err = isset($data['error']['message']) ? $data['error']['message'] : $response;
        return ['error' => 'API Groq : ' . $err];
    }
    if (empty($data['choices'][0]['message']['content'])) {
        return ['error' => 'Réponse vide de l\'API'];
    }
    return ['content' => trim($data['choices'][0]['message']['content'])];
}

$input = $method === 'POST' ? json_decode(file_get_contents('php://input'), true) : $_GET;
$action = isset($input['action']) ? $input['action'] : '';

try {
    switch ($action) {

        case 'list_conversations':
            $entityType = isset($input['entity_type']) ? $input['entity_type'] : 'spectacle';
            $entityId = isset($input['entity_id']) ? trim($input['entity_id']) : '';
            if (!$entityId) {
                echo json_encode(['success' => false, 'error' => 'entity_id manquant']);
                exit;
            }
            $stmt = $pdo->prepare("
                SELECT c.id, c.title, c.created_at, c.updated_at,
                (SELECT content FROM ai_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
                FROM ai_conversations c
                WHERE c.entity_type = ? AND c.entity_id = ? AND c.created_by = ?
                ORDER BY c.updated_at DESC
            ");
            $stmt->execute([$entityType, $entityId, $userId]);
            $conversations = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'conversations' => $conversations]);
            break;

        case 'create_conversation':
            $entityType = isset($input['entity_type']) ? $input['entity_type'] : 'spectacle';
            $entityId = isset($input['entity_id']) ? trim($input['entity_id']) : '';
            if (!$entityId) {
                echo json_encode(['success' => false, 'error' => 'entity_id manquant']);
                exit;
            }
            $title = 'Conversation du ' . date('d/m/Y à H:i');
            $stmt = $pdo->prepare("INSERT INTO ai_conversations (entity_type, entity_id, title, created_by) VALUES (?, ?, ?, ?)");
            $stmt->execute([$entityType, $entityId, $title, $userId]);
            $convId = (int)$pdo->lastInsertId();
            $conv = ['id' => $convId, 'entity_type' => $entityType, 'entity_id' => $entityId, 'title' => $title, 'created_by' => $userId, 'created_at' => date('Y-m-d H:i:s'), 'updated_at' => date('Y-m-d H:i:s'), 'last_message' => null];
            echo json_encode(['success' => true, 'conversation' => $conv]);
            break;

        case 'get_messages':
            $conversationId = isset($input['conversation_id']) ? (int)$input['conversation_id'] : 0;
            if ($conversationId <= 0) {
                echo json_encode(['success' => false, 'error' => 'conversation_id manquant']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT id, created_by FROM ai_conversations WHERE id = ?");
            $stmt->execute([$conversationId]);
            $conv = $stmt->fetch();
            if (!$conv) {
                echo json_encode(['success' => false, 'error' => 'Conversation introuvable']);
                exit;
            }
            if ((int)$conv['created_by'] !== (int)$userId) {
                echo json_encode(['success' => false, 'error' => 'Accès non autorisé à cette conversation']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT id, role, content, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC");
            $stmt->execute([$conversationId]);
            $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'messages' => $messages]);
            break;

        case 'send_message':
            $conversationId = isset($input['conversation_id']) ? (int)$input['conversation_id'] : 0;
            $content = isset($input['content']) ? trim($input['content']) : '';
            $entityType = isset($input['entity_type']) ? $input['entity_type'] : 'spectacle';
            $entityId = isset($input['entity_id']) ? trim($input['entity_id']) : '';
            if ($conversationId <= 0 || $content === '') {
                echo json_encode(['success' => false, 'error' => 'conversation_id ou content manquant']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT created_by FROM ai_conversations WHERE id = ?");
            $stmt->execute([$conversationId]);
            $convCheck = $stmt->fetch();
            if (!$convCheck || (int)$convCheck['created_by'] !== (int)$userId) {
                echo json_encode(['success' => false, 'error' => 'Conversation introuvable ou accès non autorisé']);
                exit;
            }
            $stmt = $pdo->prepare("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, 'user', ?)");
            $stmt->execute([$conversationId, $content]);

            $stmt = $pdo->prepare("SELECT id, role, content, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC");
            $stmt->execute([$conversationId]);
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $contextText = '';
            if ($entityType === 'spectacle' && $entityId) {
                $contextText = buildSpectacleContext($pdo, $entityId);
            }
            $systemPrompt = "Tu es un assistant expert en production de spectacles vivants et en stratégie de communication. Tu travailles pour une société de production. Réponds en français, de façon concise et actionnable.";
            if ($contextText) {
                $systemPrompt .= "\n\nVoici les données du spectacle concerné par la conversation :\n\n" . $contextText;
            }

            $messagesForGroq = [];
            foreach ($history as $m) {
                if ($m['role'] === 'user' || $m['role'] === 'assistant') {
                    $messagesForGroq[] = ['role' => $m['role'], 'content' => $m['content']];
                }
            }
            $lastUser = array_pop($messagesForGroq);
            $result = callGroq($systemPrompt, $messagesForGroq, $lastUser['content']);

            if (isset($result['error'])) {
                echo json_encode(['success' => false, 'error' => $result['error']]);
                exit;
            }

            $stmt = $pdo->prepare("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, 'assistant', ?)");
            $stmt->execute([$conversationId, $result['content']]);
            $msgId = (int)$pdo->lastInsertId();

            echo json_encode([
                'success' => true,
                'message' => ['id' => $msgId, 'role' => 'assistant', 'content' => $result['content'], 'created_at' => date('Y-m-d H:i:s')]
            ]);
            break;

        default:
            echo json_encode(['success' => false, 'error' => 'Action inconnue']);
    }
} catch (Exception $e) {
    error_log('ai.php ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
