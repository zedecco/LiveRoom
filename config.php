<?php
// DropChat Configuration

// Storage directories
define('DATA_DIR', __DIR__ . '/data');
define('UPLOADS_DIR', __DIR__ . '/uploads');

// Chat Configuration
define('MAX_MESSAGES_HISTORY', 150);    // Max messages retained in message store
define('MAX_FILE_SIZE_MB', 8);          // Maximum upload file size in megabytes

// Whitelisted File Extensions
define('ALLOWED_EXTENSIONS', [
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
    // Audio / Voice notes
    'mp3', 'wav', 'ogg', 'm4a',
    // Documents & Archives
    'pdf', 'txt', 'zip', 'rar', 'docx', 'xlsx', 'pptx'
]);

// Auto-create directories with appropriate permissions if missing
if (!file_exists(DATA_DIR)) {
    @mkdir(DATA_DIR, 0777, true);
}
if (!file_exists(UPLOADS_DIR)) {
    @mkdir(UPLOADS_DIR, 0777, true);
}
