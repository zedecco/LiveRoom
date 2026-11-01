<?php
// DropChat Backend API

require_once __DIR__ . '/config.php';

// Prevent browser/CDN caching
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// Safe file lock helpers
function get_messages_store() {
    $file = DATA_DIR . '/messages.json';
    if (!file_exists($file)) {
        return [];
    }
    $fp = @fopen($file, 'r');
    if (!$fp) return [];
    @flock($fp, LOCK_SH);
    $content = @stream_get_contents($fp);
    @flock($fp, LOCK_UN);
    @fclose($fp);
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function save_messages_store(array $messages) {
    $file = DATA_DIR . '/messages.json';
    if (count($messages) > MAX_MESSAGES_HISTORY) {
        $messages = array_slice($messages, -MAX_MESSAGES_HISTORY);
    }
    $fp = @fopen($file, 'c+');
    if (!$fp) return false;
    if (@flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($messages, JSON_UNESCAPED_UNICODE));
        fflush($fp);
        @flock($fp, LOCK_UN);
    }
    @fclose($fp);
    return true;
}

$action = $_REQUEST['action'] ?? '';

try {
    switch ($action) {
        // 1. Fetch new messages with zero-I/O file modification check (mtime)
        case 'get_messages':
            $afterId = intval($_GET['after_id'] ?? 0);
            $clientMtime = intval($_GET['mtime'] ?? 0);

            $file = DATA_DIR . '/messages.json';
            $currentMtime = file_exists($file) ? filemtime($file) : time();

            // Zero I/O check: if file hasn't changed since client's last poll, return instantly
            if ($afterId > 0 && $clientMtime > 0 && $currentMtime <= $clientMtime) {
                echo json_encode([
                    'success' => true,
                    'messages' => [],
                    'mtime' => $currentMtime
                ]);
                exit;
            }

            $allMessages = get_messages_store();
            
            $newMessages = [];
            foreach ($allMessages as $msg) {
                if ($msg['id'] > $afterId) {
                    $newMessages[] = $msg;
                }
            }

            echo json_encode([
                'success' => true,
                'messages' => $newMessages,
                'mtime' => $currentMtime,
                'server_time' => time()
            ]);
            break;

        // 2. Send message (text and/or file)
        case 'send_message':
            $username = trim($_POST['username'] ?? '');
            $avatar = trim($_POST['avatar'] ?? '👤');
            $text = trim($_POST['text'] ?? '');
            $userId = trim($_POST['user_id'] ?? '');
            $replyToRaw = $_POST['reply_to'] ?? null;

            if (empty($username)) {
                echo json_encode(['success' => false, 'error' => 'Username is required']);
                exit;
            }

            $replyTo = null;
            if ($replyToRaw) {
                $decodedReply = json_decode($replyToRaw, true);
                if (is_array($decodedReply)) {
                    $replyTo = [
                        'id' => intval($decodedReply['id'] ?? 0),
                        'username' => htmlspecialchars($decodedReply['username'] ?? '', ENT_QUOTES, 'UTF-8'),
                        'text' => htmlspecialchars(mb_substr($decodedReply['text'] ?? '', 0, 80), ENT_QUOTES, 'UTF-8')
                    ];
                }
            }

            // Process uploaded attachment
            $fileData = null;
            if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
                $file = $_FILES['file'];
                $fileSizeMB = $file['size'] / (1024 * 1024);

                if ($fileSizeMB > MAX_FILE_SIZE_MB) {
                    echo json_encode(['success' => false, 'error' => 'File size exceeds limit (max ' . MAX_FILE_SIZE_MB . 'MB)']);
                    exit;
                }

                $originalName = pathinfo($file['name'], PATHINFO_FILENAME);
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

                if (!in_array($ext, ALLOWED_EXTENSIONS)) {
                    echo json_encode(['success' => false, 'error' => 'File extension not supported']);
                    exit;
                }

                $mediaType = 'file';
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'])) {
                    $mediaType = 'image';
                } elseif (in_array($ext, ['mp3', 'wav', 'ogg', 'm4a'])) {
                    $mediaType = 'audio';
                }

                $cleanBaseName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $originalName);
                if (empty($cleanBaseName)) {
                    $cleanBaseName = 'attachment';
                }
                $safeFileName = 'file_' . time() . '_' . substr(md5(uniqid()), 0, 6) . '.' . $ext;
                $destination = UPLOADS_DIR . '/' . $safeFileName;

                if (move_uploaded_file($file['tmp_name'], $destination)) {
                    $fileData = [
                        'url' => 'uploads/' . $safeFileName,
                        'name' => htmlspecialchars($file['name'], ENT_QUOTES, 'UTF-8'),
                        'size' => round($fileSizeMB, 2) . ' MB',
                        'type' => $mediaType,
                        'ext' => $ext
                    ];
                } else {
                    echo json_encode(['success' => false, 'error' => 'Failed to store file on server']);
                    exit;
                }
            }

            if (empty($text) && !$fileData) {
                echo json_encode(['success' => false, 'error' => 'Message or file cannot be empty']);
                exit;
            }

            $allMessages = get_messages_store();
            $lastId = !empty($allMessages) ? end($allMessages)['id'] : 0;
            $newId = max($lastId + 1, time());

            $newMessage = [
                'id' => $newId,
                'user_id' => htmlspecialchars($userId, ENT_QUOTES, 'UTF-8'),
                'username' => htmlspecialchars($username, ENT_QUOTES, 'UTF-8'),
                'avatar' => $avatar,
                'text' => htmlspecialchars($text, ENT_QUOTES, 'UTF-8'),
                'time' => date('H:i'),
                'timestamp' => time(),
                'file' => $fileData,
                'reply_to' => $replyTo,
                'is_system' => false
            ];

            $allMessages[] = $newMessage;
            save_messages_store($allMessages);

            echo json_encode([
                'success' => true,
                'message' => $newMessage
            ]);
            break;

        // 3. System events (user join / rename)
        case 'system_event':
            $type = $_POST['type'] ?? '';
            $username = trim($_POST['username'] ?? '');
            $oldName = trim($_POST['old_name'] ?? '');

            $systemText = '';
            if ($type === 'rename' && $oldName && $username) {
                $systemText = htmlspecialchars($oldName) . " changed their name to " . htmlspecialchars($username);
            } elseif ($type === 'join' && $username) {
                $systemText = htmlspecialchars($username) . " joined the chat.";
            }

            if ($systemText) {
                $allMessages = get_messages_store();
                $lastId = !empty($allMessages) ? end($allMessages)['id'] : 0;
                $newMessage = [
                    'id' => max($lastId + 1, time()),
                    'user_id' => 'system',
                    'username' => 'System',
                    'avatar' => '📢',
                    'text' => $systemText,
                    'time' => date('H:i'),
                    'timestamp' => time(),
                    'file' => null,
                    'reply_to' => null,
                    'is_system' => true
                ];
                $allMessages[] = $newMessage;
                save_messages_store($allMessages);
            }

            echo json_encode(['success' => true]);
            break;

        default:
            echo json_encode(['success' => false, 'error' => 'Invalid action']);
            break;
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
}
