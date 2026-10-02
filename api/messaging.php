<?php
/**
 * API Messagerie Interne
 * À placer dans api/ (même emplacement que users.php, projects.php, etc.)
 */

// Charger la config existante (getDB, verifyToken, etc.)
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/push_send.php';

// Connexion DB via votre fonction existante
$pdo = getDB();

// Authentification via votre fonction existante
$userId = verifyToken();

// ============================
// AUTO-CRÉATION DES TABLES
// ============================

function ensureTablesExist($pdo) {
    try {
        $pdo->query("SELECT 1 FROM msg_conversations LIMIT 1");
    } catch (Exception $e) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS msg_conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type ENUM('dm','group') NOT NULL DEFAULT 'dm',
            name VARCHAR(120) DEFAULT NULL,
            created_by INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS msg_conversation_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            user_id INT NOT NULL,
            joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_read_at DATETIME DEFAULT NULL,
            UNIQUE KEY unique_member (conversation_id, user_id),
            INDEX idx_user (user_id),
            FOREIGN KEY (conversation_id) REFERENCES msg_conversations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS msg_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_id INT NOT NULL,
            content TEXT,
            reply_to_id INT DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_conversation (conversation_id, created_at),
            INDEX idx_sender (sender_id),
            FOREIGN KEY (conversation_id) REFERENCES msg_conversations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS msg_message_attachments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            file_type VARCHAR(100) DEFAULT NULL,
            file_size INT DEFAULT NULL,
            FOREIGN KEY (message_id) REFERENCES msg_messages(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
}

ensureTablesExist($pdo);

// Expression SQL pour le nom complet (prenom + nom)
define('USER_NAME_EXPR', "TRIM(CONCAT(COALESCE(u.prenom,''),' ',COALESCE(u.nom,u.username,'')))");

// ============================
// ROUTING
// ============================

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

if ($method === 'POST' && !$action) {
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strpos($ct, 'multipart') !== false) {
        $action = $_POST['action'] ?? null;
    } else {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = $input['action'] ?? null;
    }
}

try {
    switch ($action) {
        case 'conversations':       handleGetConversations($pdo, $userId); break;
        case 'messages':            handleGetMessages($pdo, $userId); break;
        case 'check_new':           handleCheckNew($pdo, $userId); break;
        case 'unread_count':        handleUnreadCount($pdo, $userId); break;
        case 'create_conversation': handleCreateConversation($pdo, $userId); break;
        case 'send_message':        handleSendMessage($pdo, $userId); break;
        case 'mark_read':           handleMarkRead($pdo, $userId); break;
        case 'add_members':         handleAddMembers($pdo, $userId); break;
        case 'leave_conversation':  handleLeaveConversation($pdo, $userId); break;
        case 'delete_conversation': handleDeleteConversation($pdo, $userId); break;
        case 'diagnostic':          handleDiagnostic($pdo, $userId); break;
        default:
            echo json_encode(['success' => false, 'error' => 'Action inconnue: ' . ($action ?? 'null')]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erreur serveur: ' . $e->getMessage()]);
}

// ============================
// HANDLERS
// ============================

function handleGetConversations($pdo, $userId) {
    $n = USER_NAME_EXPR;
    $stmt = $pdo->prepare("
        SELECT c.id, c.type, c.name, c.created_at, cm.last_read_at,
            (SELECT COUNT(*) FROM msg_messages m 
             WHERE m.conversation_id = c.id 
             AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01') 
             AND m.sender_id != ?) as unread_count,
            (SELECT m.content FROM msg_messages m 
             WHERE m.conversation_id = c.id 
             ORDER BY m.created_at DESC LIMIT 1) as last_message,
            (SELECT m.created_at FROM msg_messages m 
             WHERE m.conversation_id = c.id 
             ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
            (SELECT {$n} FROM msg_messages m 
             JOIN users u ON u.id = m.sender_id 
             WHERE m.conversation_id = c.id 
             ORDER BY m.created_at DESC LIMIT 1) as last_message_sender
        FROM msg_conversations c
        JOIN msg_conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
        ORDER BY last_message_at DESC, c.created_at DESC
    ");
    $stmt->execute([$userId, $userId]);
    $convs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($convs as &$c) {
        $c['members'] = getConversationMembers($pdo, $c['id']);
        $c['unreadCount'] = (int) $c['unread_count'];
        $c['lastMessage'] = $c['last_message'];
        $c['lastMessageAt'] = $c['last_message_at'];
        $c['lastMessageSender'] = trim($c['last_message_sender'] ?? '');
        unset($c['unread_count'], $c['last_message'], $c['last_message_at'], $c['last_message_sender'], $c['last_read_at']);
    }

    echo json_encode(['success' => true, 'conversations' => $convs]);
}

function handleGetMessages($pdo, $userId) {
    $convId = $_GET['conversationId'] ?? null;
    if (!$convId) { echo json_encode(['success' => false, 'error' => 'conversationId requis']); return; }
    if (!isMember($pdo, $convId, $userId)) { echo json_encode(['success' => false, 'error' => 'Acces interdit']); return; }

    $n = USER_NAME_EXPR;
    $stmt = $pdo->prepare("
        SELECT m.id, m.content, m.sender_id, m.reply_to_id, m.created_at,
            {$n} as sender_name,
            rm.content as reply_to_content,
            (SELECT {$n} FROM users u WHERE u.id = rm.sender_id) as reply_to_author
        FROM msg_messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN msg_messages rm ON rm.id = m.reply_to_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC
        LIMIT 500
    ");
    $stmt->execute([$convId]);
    $msgs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($msgs as &$m) {
        $m['senderId'] = (int) $m['sender_id'];
        $m['senderName'] = trim($m['sender_name']);
        $m['createdAt'] = $m['created_at'];
        $m['replyTo'] = $m['reply_to_id'];
        $m['replyToContent'] = $m['reply_to_content'];
        $m['replyToAuthor'] = trim($m['reply_to_author'] ?? '');

        // Pièce jointe
        $a = $pdo->prepare("SELECT file_name, file_path, file_type, file_size FROM msg_message_attachments WHERE message_id = ? LIMIT 1");
        $a->execute([$m['id']]);
        $att = $a->fetch(PDO::FETCH_ASSOC);
        if ($att) {
            $m['attachment'] = [
                'name' => $att['file_name'],
                'url' => $att['file_path'],
                'type' => $att['file_type'],
                'size' => (int) $att['file_size']
            ];
        }

        unset($m['sender_id'], $m['sender_name'], $m['created_at'], $m['reply_to_id'], $m['reply_to_content'], $m['reply_to_author']);
    }

    $readStmt = $pdo->prepare("
        SELECT cm.user_id, cm.last_read_at, {$n} as name
        FROM msg_conversation_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ? AND cm.user_id != ?
    ");
    $readStmt->execute([$convId, $userId]);
    $readPositions = array_map(function($rp) {
        return [
            'userId' => (int) $rp['user_id'],
            'name' => trim($rp['name']),
            'lastReadAt' => $rp['last_read_at']
        ];
    }, $readStmt->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode(['success' => true, 'messages' => $msgs, 'readPositions' => $readPositions]);
}

function handleCheckNew($pdo, $userId) {
    $n = USER_NAME_EXPR;
    $stmt = $pdo->prepare("
        SELECT c.id,
            (SELECT COUNT(*) FROM msg_messages m 
             WHERE m.conversation_id = c.id 
             AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01') 
             AND m.sender_id != ?) as unread_count,
            (SELECT m.content FROM msg_messages m 
             WHERE m.conversation_id = c.id 
             ORDER BY m.created_at DESC LIMIT 1) as last_message,
            (SELECT m.created_at FROM msg_messages m 
             WHERE m.conversation_id = c.id 
             ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
            (SELECT {$n} FROM msg_messages m 
             JOIN users u ON u.id = m.sender_id 
             WHERE m.conversation_id = c.id 
             ORDER BY m.created_at DESC LIMIT 1) as last_message_sender
        FROM msg_conversations c
        JOIN msg_conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
    ");
    $stmt->execute([$userId, $userId]);

    $hasNew = false;
    $result = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $u = (int) $c['unread_count'];
        if ($u > 0) $hasNew = true;
        $result[] = [
            'id' => $c['id'],
            'unreadCount' => $u,
            'lastMessage' => $c['last_message'],
            'lastMessageAt' => $c['last_message_at'],
            'lastMessageSender' => trim($c['last_message_sender'] ?? '')
        ];
    }

    echo json_encode(['success' => true, 'conversations' => $result, 'hasNewMessages' => $hasNew]);
}

function handleUnreadCount($pdo, $userId) {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM msg_messages m
        JOIN msg_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
        WHERE m.created_at > COALESCE(cm.last_read_at, '1970-01-01')
        AND m.sender_id != ?
    ");
    $stmt->execute([$userId, $userId]);
    echo json_encode(['success' => true, 'totalUnread' => (int) $stmt->fetchColumn()]);
}

function handleCreateConversation($pdo, $userId) {
    $input = getPostData();
    $type = $input['type'] ?? 'dm';
    $memberIds = $input['memberIds'] ?? [];
    $name = $input['name'] ?? null;

    if (empty($memberIds)) { echo json_encode(['success' => false, 'error' => 'Aucun membre']); return; }

    // DM : vérifier si conversation existe déjà
    if ($type === 'dm' && count($memberIds) === 1) {
        $ex = findExistingDm($pdo, $userId, (int) $memberIds[0]);
        if ($ex) {
            $ex['members'] = getConversationMembers($pdo, $ex['id']);
            $ex['unreadCount'] = 0;
            $ex['lastMessage'] = null;
            $ex['lastMessageAt'] = null;
            $ex['lastMessageSender'] = null;
            echo json_encode(['success' => true, 'conversation' => $ex]);
            return;
        }
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("INSERT INTO msg_conversations (type, name, created_by, created_at) VALUES (?, ?, ?, NOW())");
        $stmt->execute([$type, $name, $userId]);
        $convId = $pdo->lastInsertId();

        // Ajouter le créateur
        $pdo->prepare("INSERT INTO msg_conversation_members (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, NOW(), NOW())")
            ->execute([$convId, $userId]);

        // Ajouter les autres membres
        foreach ($memberIds as $mid) {
            $mid = (int) $mid;
            if ($mid !== $userId) {
                $pdo->prepare("INSERT INTO msg_conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, NOW())")
                    ->execute([$convId, $mid]);
            }
        }

        $pdo->commit();

        echo json_encode(['success' => true, 'conversation' => [
            'id' => (string) $convId,
            'type' => $type,
            'name' => $name,
            'created_at' => date('Y-m-d H:i:s'),
            'members' => getConversationMembers($pdo, $convId),
            'unreadCount' => 0,
            'lastMessage' => null,
            'lastMessageAt' => null,
            'lastMessageSender' => null
        ]]);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function handleSendMessage($pdo, $userId) {
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    $multi = strpos($ct, 'multipart') !== false;

    if ($multi) {
        $convId = $_POST['conversationId'] ?? null;
        $content = $_POST['content'] ?? '';
        $replyTo = $_POST['replyTo'] ?? null;
    } else {
        $input = getPostData();
        $convId = $input['conversationId'] ?? null;
        $content = $input['content'] ?? '';
        $replyTo = $input['replyTo'] ?? null;
    }

    if (!$convId) { echo json_encode(['success' => false, 'error' => 'conversationId requis']); return; }
    if (!isMember($pdo, $convId, $userId)) { echo json_encode(['success' => false, 'error' => 'Acces interdit']); return; }
    if ($replyTo === '' || $replyTo === 'null') $replyTo = null;

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("INSERT INTO msg_messages (conversation_id, sender_id, content, reply_to_id, created_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$convId, $userId, $content, $replyTo]);
        $msgId = $pdo->lastInsertId();

        // Pièce jointe
        $attachment = null;
        if ($multi && isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $f = $_FILES['file'];
            $dir = __DIR__ . '/../uploads/messaging/';
            if (!is_dir($dir)) @mkdir($dir, 0755, true);

            $safe = $msgId . '_' . time() . '.' . pathinfo($f['name'], PATHINFO_EXTENSION);
            if (move_uploaded_file($f['tmp_name'], $dir . $safe)) {
                $rel = 'uploads/messaging/' . $safe;
                $pdo->prepare("INSERT INTO msg_message_attachments (message_id, file_name, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)")
                    ->execute([$msgId, $f['name'], $rel, $f['type'], $f['size']]);
                $attachment = ['name' => $f['name'], 'url' => $rel, 'type' => $f['type'], 'size' => (int) $f['size']];
            }
        }

        // Marquer comme lu pour l'expéditeur
        $pdo->prepare("UPDATE msg_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?")
            ->execute([$convId, $userId]);

        $pdo->commit();

        // Push notifications to other conversation members
        try {
            $memberStmt = $pdo->prepare("SELECT user_id FROM msg_conversation_members WHERE conversation_id = ? AND user_id != ?");
            $memberStmt->execute([$convId, $userId]);
            while ($member = $memberStmt->fetch(PDO::FETCH_ASSOC)) {
                sendPushToUser($pdo, $member['user_id']);
            }
        } catch (Exception $pushErr) {
            error_log('Push notification error: ' . $pushErr->getMessage());
        }

        // Nom de l'expéditeur
        $n = USER_NAME_EXPR;
        $us = $pdo->prepare("SELECT {$n} as name FROM users u WHERE u.id = ?");
        $us->execute([$userId]);
        $sn = trim($us->fetchColumn() ?: 'Utilisateur');

        $msg = [
            'id' => (string) $msgId,
            'content' => $content,
            'senderId' => $userId,
            'senderName' => $sn,
            'createdAt' => date('Y-m-d H:i:s'),
            'replyTo' => $replyTo,
            'replyToContent' => null,
            'replyToAuthor' => null,
            'attachment' => $attachment
        ];

        if ($replyTo) {
            $r = $pdo->prepare("SELECT m.content, {$n} as author FROM msg_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?");
            $r->execute([$replyTo]);
            $rr = $r->fetch(PDO::FETCH_ASSOC);
            if ($rr) {
                $msg['replyToContent'] = $rr['content'];
                $msg['replyToAuthor'] = trim($rr['author']);
            }
        }

        echo json_encode(['success' => true, 'message' => $msg]);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function handleMarkRead($pdo, $userId) {
    $input = getPostData();
    $convId = $input['conversationId'] ?? null;
    if (!$convId) { echo json_encode(['success' => false, 'error' => 'conversationId requis']); return; }

    $pdo->prepare("UPDATE msg_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?")
        ->execute([$convId, $userId]);
    echo json_encode(['success' => true]);
}

function handleAddMembers($pdo, $userId) {
    $input = getPostData();
    $convId = $input['conversationId'] ?? null;
    $ids = $input['memberIds'] ?? [];

    if (!$convId || empty($ids)) { echo json_encode(['success' => false, 'error' => 'Params manquants']); return; }
    if (!isMember($pdo, $convId, $userId)) { echo json_encode(['success' => false, 'error' => 'Acces interdit']); return; }

    foreach ($ids as $mid) {
        $mid = (int) $mid;
        $ck = $pdo->prepare("SELECT 1 FROM msg_conversation_members WHERE conversation_id = ? AND user_id = ?");
        $ck->execute([$convId, $mid]);
        if (!$ck->fetch()) {
            $pdo->prepare("INSERT INTO msg_conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, NOW())")
                ->execute([$convId, $mid]);
        }
    }

    echo json_encode(['success' => true]);
}

function handleLeaveConversation($pdo, $userId) {
    $input = getPostData();
    $convId = $input['conversationId'] ?? null;
    if (!$convId) { echo json_encode(['success' => false, 'error' => 'conversationId requis']); return; }

    $pdo->prepare("DELETE FROM msg_conversation_members WHERE conversation_id = ? AND user_id = ?")
        ->execute([$convId, $userId]);

    // Supprimer la conversation si plus aucun membre
    $cnt = $pdo->prepare("SELECT COUNT(*) FROM msg_conversation_members WHERE conversation_id = ?");
    $cnt->execute([$convId]);
    if ((int) $cnt->fetchColumn() === 0) {
        deleteConversationData($pdo, $convId);
    }

    echo json_encode(['success' => true]);
}

function handleDeleteConversation($pdo, $userId) {
    $input = getPostData();
    $convId = $input['conversationId'] ?? null;
    if (!$convId) { echo json_encode(['success' => false, 'error' => 'conversationId requis']); return; }
    if (!isMember($pdo, $convId, $userId)) { echo json_encode(['success' => false, 'error' => 'Acces interdit']); return; }

    deleteConversationData($pdo, $convId);
    echo json_encode(['success' => true]);
}

function deleteConversationData($pdo, $convId) {
    // Supprimer les fichiers attachés physiquement
    $files = $pdo->prepare("
        SELECT a.file_path FROM msg_message_attachments a
        JOIN msg_messages m ON m.id = a.message_id
        WHERE m.conversation_id = ?
    ");
    $files->execute([$convId]);
    foreach ($files->fetchAll(PDO::FETCH_COLUMN) as $path) {
        $fullPath = __DIR__ . '/../' . $path;
        if (file_exists($fullPath)) @unlink($fullPath);
    }

    // Supprimer en base (CASCADE gère les messages et attachments)
    $pdo->prepare("DELETE FROM msg_conversation_members WHERE conversation_id = ?")->execute([$convId]);
    $pdo->prepare("DELETE FROM msg_message_attachments WHERE message_id IN (SELECT id FROM msg_messages WHERE conversation_id = ?)")->execute([$convId]);
    $pdo->prepare("DELETE FROM msg_messages WHERE conversation_id = ?")->execute([$convId]);
    $pdo->prepare("DELETE FROM msg_conversations WHERE id = ?")->execute([$convId]);
}

function handleDiagnostic($pdo, $userId) {
    $info = ['success' => true, 'userId' => $userId, 'phpVersion' => PHP_VERSION, 'tables' => []];

    foreach (['msg_conversations', 'msg_conversation_members', 'msg_messages', 'msg_message_attachments'] as $t) {
        try {
            $info['tables'][$t] = 'OK (' . $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn() . ' rows)';
        } catch (Exception $e) {
            $info['tables'][$t] = 'ERROR: ' . $e->getMessage();
        }
    }

    // Info utilisateur connecté
    $userInfo = getUserInfo($userId);
    $info['currentUser'] = $userInfo ? ($userInfo['prenom'] . ' ' . $userInfo['nom']) : 'inconnu';

    echo json_encode($info, JSON_PRETTY_PRINT);
}

// ============================
// HELPERS
// ============================

function getPostData() {
    static $d = null;
    if ($d === null) {
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
    }
    return $d;
}

function isMember($pdo, $cid, $uid) {
    $s = $pdo->prepare("SELECT 1 FROM msg_conversation_members WHERE conversation_id = ? AND user_id = ?");
    $s->execute([$cid, $uid]);
    return (bool) $s->fetch();
}

function getConversationMembers($pdo, $convId) {
    $n = USER_NAME_EXPR;
    $s = $pdo->prepare("
        SELECT u.id, u.username, u.prenom, u.nom, u.role, 
               {$n} as display_name, cm.joined_at
        FROM msg_conversation_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ?
        ORDER BY cm.joined_at ASC
    ");
    $s->execute([$convId]);

    return array_map(function ($m) {
        return [
            'id' => (int) $m['id'],
            'username' => $m['username'] ?? '',
            'name' => trim($m['display_name'] ?? $m['username'] ?? 'Utilisateur'),
            'role' => $m['role'] ?? ''
        ];
    }, $s->fetchAll(PDO::FETCH_ASSOC));
}

function findExistingDm($pdo, $u1, $u2) {
    $s = $pdo->prepare("
        SELECT c.id, c.type, c.name, c.created_at
        FROM msg_conversations c
        WHERE c.type = 'dm'
        AND EXISTS (SELECT 1 FROM msg_conversation_members WHERE conversation_id = c.id AND user_id = ?)
        AND EXISTS (SELECT 1 FROM msg_conversation_members WHERE conversation_id = c.id AND user_id = ?)
        AND (SELECT COUNT(*) FROM msg_conversation_members WHERE conversation_id = c.id) = 2
        LIMIT 1
    ");
    $s->execute([$u1, $u2]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}