<?php
/**
 * Export CSV Billetweb (UTF-8 ;).
 * GET /invitations_export_csv.php?spectacle_id=...&tarif=INVITATION&date=YYYY-MM-DD
 */
require_once 'config.php';

$userId = verifyToken();
if (!checkPermission($userId, 'billetterie', 'view')) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'Accès refusé']);
    exit;
}

$pdo = getDB();

$spectacleId = isset($_GET['spectacle_id']) ? trim($_GET['spectacle_id']) : '';
if (!$spectacleId) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'spectacle_id manquant']);
    exit;
}

$tarif = isset($_GET['tarif']) ? trim($_GET['tarif']) : 'INVITATION';
$date = isset($_GET['date']) ? trim($_GET['date']) : '';
if ($date === '') $date = date('Y-m-d');

$stmt = $pdo->prepare("SELECT code, nom, prenom, email, created_at FROM invitations WHERE spectacle_id = ? ORDER BY created_at DESC, id DESC");
$stmt->execute([$spectacleId]);
$rows = $stmt->fetchAll();

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="invitations-' . preg_replace('/[^a-zA-Z0-9_-]+/', '-', $spectacleId) . '.csv"');

// UTF-8 BOM (helps Excel)
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');
// Custom delimiter ;
fputcsv($out, ['reference','nom','prenom','email','tarif','date','code'], ';');
foreach ($rows as $r) {
    $code = (string)$r['code'];
    $nom = (string)$r['nom'];
    $prenom = (string)$r['prenom'];
    $email = isset($r['email']) ? (string)$r['email'] : '';
    fputcsv($out, [$code, $nom, $prenom, $email, $tarif, $date, $code], ';');
}
fclose($out);
exit;

