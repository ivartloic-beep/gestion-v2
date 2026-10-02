<?php
/**
 * Helpers accès workspace (partage via messagerie, rôles viewer/editor).
 */

function workspaceParseAccessList($raw) {
    if ($raw === null || $raw === '') {
        return [];
    }
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
    } else {
        $decoded = $raw;
    }
    if (!is_array($decoded)) {
        return [];
    }
    $entries = [];
    foreach ($decoded as $item) {
        if (is_numeric($item)) {
            $entries[] = ['user_id' => (int)$item, 'role' => 'editor'];
        } elseif (is_array($item) && isset($item['user_id'])) {
            $role = isset($item['role']) && $item['role'] === 'viewer' ? 'viewer' : 'editor';
            $entries[] = ['user_id' => (int)$item['user_id'], 'role' => $role];
        }
    }
    return $entries;
}

function workspaceEncodeAccessList(array $entries) {
    $normalized = [];
    $seen = [];
    foreach ($entries as $entry) {
        $uid = (int)($entry['user_id'] ?? 0);
        if (!$uid || isset($seen[$uid])) {
            continue;
        }
        $seen[$uid] = true;
        $role = (isset($entry['role']) && $entry['role'] === 'viewer') ? 'viewer' : 'editor';
        $normalized[] = ['user_id' => $uid, 'role' => $role];
    }
    return json_encode($normalized);
}

function workspaceUserAccessRole(array $row, $userId) {
    $userId = (int)$userId;
    if ((int)$row['created_by'] === $userId) {
        return 'owner';
    }
    $visibility = $row['visibility'] ?? 'personal';
    if ($visibility === 'team' && !empty($row['project_id'])) {
        return 'editor';
    }
    if ($visibility === 'shared') {
        foreach (workspaceParseAccessList($row['access_list'] ?? null) as $entry) {
            if ($entry['user_id'] === $userId) {
                return $entry['role'];
            }
        }
    }
    return null;
}

function workspaceCanRead(array $row, $userId) {
    $role = workspaceUserAccessRole($row, $userId);
    return $role !== null;
}

function workspaceCanEdit(array $row, $userId) {
    $role = workspaceUserAccessRole($row, $userId);
    return $role === 'owner' || $role === 'editor';
}

function workspaceUserMentionedElement($pdo, $userId, $elementId) {
    $userId = (int)$userId;
    $elementId = trim((string)$elementId);
    if ($elementId === '') {
        return false;
    }
    try {
        $types = ['note_bureau', 'doc_bureau'];
        foreach ($types as $type) {
            $pattern = '%{{mn:' . $type . ':' . $elementId . ':%';
            $stmt = $pdo->prepare("
                SELECT 1
                FROM msg_messages m
                INNER JOIN msg_conversation_members cm
                    ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
                WHERE m.content LIKE ?
                LIMIT 1
            ");
            $stmt->execute([$userId, $pattern]);
            if ($stmt->fetch()) {
                return true;
            }
        }
    } catch (PDOException $e) {
        error_log('workspaceUserMentionedElement: ' . $e->getMessage());
    }
    return false;
}

function workspaceUpsertAccessEntry(array $entries, $userId, $role) {
    $userId = (int)$userId;
    $role = ($role === 'viewer') ? 'viewer' : 'editor';
    $found = false;
    foreach ($entries as &$entry) {
        if ($entry['user_id'] === $userId) {
            if ($role === 'editor') {
                $entry['role'] = 'editor';
            } elseif ($entry['role'] !== 'editor') {
                $entry['role'] = 'viewer';
            }
            $found = true;
            break;
        }
    }
    unset($entry);
    if (!$found) {
        $entries[] = ['user_id' => $userId, 'role' => $role];
    }
    return $entries;
}

function workspaceRemoveAccessEntry(array $entries, $userId) {
    $userId = (int)$userId;
    return array_values(array_filter($entries, function ($entry) use ($userId) {
        return (int)($entry['user_id'] ?? 0) !== $userId;
    }));
}

function workspaceElementToArray(array $row, $userId) {
    $tags = $row['tags'] ? json_decode($row['tags'], true) : null;
    $accessList = workspaceParseAccessList($row['access_list'] ?? null);
    $accessRole = workspaceUserAccessRole($row, $userId);
    return [
        'id' => $row['id'],
        'project_id' => $row['project_id'],
        'type' => $row['type'],
        'title' => $row['title'],
        'content' => $row['content'],
        'visibility' => $row['visibility'],
        'status' => $row['status'],
        'tags' => $tags,
        'access_list' => $accessList,
        'access_role' => $accessRole,
        'can_edit' => workspaceCanEdit($row, $userId),
        'is_owner' => (int)$row['created_by'] === (int)$userId,
        'folder_id' => $row['folder_id'],
        'file_path' => $row['file_path'],
        'file_name' => $row['file_name'],
        'file_size' => $row['file_size'] ? (int)$row['file_size'] : null,
        'created_by' => (int)$row['created_by'],
        'updated_by' => $row['updated_by'] ? (int)$row['updated_by'] : null,
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
        'created_by_name' => trim(($row['created_by_prenom'] ?? '') . ' ' . ($row['created_by_nom'] ?? '')) ?: null,
        'is_shared_with_me' => $accessRole && $accessRole !== 'owner',
    ];
}
