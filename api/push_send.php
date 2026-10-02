<?php
/**
 * Web Push sender using VAPID (no payload, no external library).
 * Uses PHP's native openssl for ES256 JWT signing.
 */

require_once __DIR__ . '/config.php';

function sendPushToUser($pdo, $targetUserId) {
    $stmt = $pdo->prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?");
    $stmt->execute([$targetUserId]);
    $subs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($subs as $sub) {
        $result = sendWebPush($sub['endpoint']);
        if ($result === 410 || $result === 404) {
            $del = $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?");
            $del->execute([$targetUserId, $sub['endpoint']]);
        }
    }
}

function sendWebPush($endpoint) {
    $parsed = parse_url($endpoint);
    $audience = $parsed['scheme'] . '://' . $parsed['host'];

    $jwt = createVapidJwt($audience, VAPID_SUBJECT, VAPID_PRIVATE_KEY);
    if (!$jwt) {
        error_log('Push: Failed to create VAPID JWT');
        return false;
    }

    $headers = [
        'Authorization: vapid t=' . $jwt . ', k=' . VAPID_PUBLIC_KEY,
        'TTL: 86400',
        'Content-Length: 0',
        'Urgency: high'
    ];

    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, '');
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        error_log("Push: curl error for $endpoint: $error");
        return false;
    }

    if ($httpCode >= 400) {
        error_log("Push: HTTP $httpCode for $endpoint: $response");
    }

    return $httpCode;
}

function createVapidJwt($audience, $subject, $privateKeyBase64url) {
    $header = base64urlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));

    $payload = base64urlEncode(json_encode([
        'aud' => $audience,
        'exp' => time() + 43200,
        'sub' => $subject
    ]));

    $signingInput = $header . '.' . $payload;

    $privateKeyRaw = base64urlDecode($privateKeyBase64url);
    $pem = convertEcPrivateKeyToPem($privateKeyRaw);
    if (!$pem) return null;

    $key = openssl_pkey_get_private($pem);
    if (!$key) {
        error_log('Push: openssl_pkey_get_private failed: ' . openssl_error_string());
        return null;
    }

    $signature = '';
    if (!openssl_sign($signingInput, $signature, $key, OPENSSL_ALGO_SHA256)) {
        error_log('Push: openssl_sign failed: ' . openssl_error_string());
        return null;
    }

    $fixedSig = derToFixed($signature);
    if (!$fixedSig) return null;

    return $signingInput . '.' . base64urlEncode($fixedSig);
}

/**
 * Convert raw 32-byte EC private key to PEM format.
 * Builds a DER-encoded PKCS#8 structure for P-256.
 */
function convertEcPrivateKeyToPem($rawPrivateKey) {
    // P-256 OID: 1.2.840.10045.3.1.7
    // PKCS#8 DER prefix for EC P-256 private key
    $prefix = hex2bin(
        '30770201010420'  // SEQUENCE, version, OCTET STRING (32 bytes)
    );
    $oidSuffix = hex2bin(
        'a00a06082a8648ce3d030107' // [0] OID prime256v1
    );

    $der = $prefix . $rawPrivateKey . $oidSuffix;

    $pem = "-----BEGIN EC PRIVATE KEY-----\n"
         . chunk_split(base64_encode($der), 64, "\n")
         . "-----END EC PRIVATE KEY-----";

    return $pem;
}

/**
 * Convert DER-encoded ECDSA signature to fixed 64-byte (r || s) format.
 */
function derToFixed($der) {
    $seq = unpack('C*', $der);
    $idx = 1;
    if ($seq[$idx] !== 0x30) return null;
    $idx = 3; // skip SEQUENCE tag + length

    // Read r
    if ($seq[$idx] !== 0x02) return null;
    $idx++;
    $rLen = $seq[$idx]; $idx++;
    $r = substr($der, $idx - 1, $rLen); $idx += $rLen;

    // Read s
    if ($seq[$idx] !== 0x02) return null;
    $idx++;
    $sLen = $seq[$idx]; $idx++;
    $s = substr($der, $idx - 1, $sLen);

    // Pad/trim to exactly 32 bytes each
    $r = str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT);
    $s = str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);

    return $r . $s;
}

function base64urlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64urlDecode($data) {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}
