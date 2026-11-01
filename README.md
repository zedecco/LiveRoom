# DropChat

A lightweight, zero-database real-time chatroom built for PHP shared hosting.

Most modern chat scripts rely on WebSockets (Node.js, Socket.io) or require configuring MySQL databases. However, most free hosting providers (like InfinityFree, ByetHost, or standard shared cPanel) strictly block long-running persistent processes and daemons.

I built **DropChat** to solve this: a drop-in real-time chat that runs on plain PHP 8, stores messages in flat JSON files safely with atomic locks, and polls fast enough (~450ms) to feel real-time without exceeding server resource limits.

---

## Features

- **Zero database setup**: No MySQL credentials, tables, or phpMyAdmin imports. Just upload the files.
- **Fast polling engine (450ms)**: Uses `filemtime` checks against cached server memory to check for updates in ~0.05ms without hitting the disk constantly.
- **Optimistic UI**: Messages you send appear immediately on screen with zero delay.
- **Media attachments**: Send images (with full-size lightbox preview), audio clips (with built-in player), and documents (PDF, ZIP, TXT, etc.).
- **5 Built-in themes**: Modern Dark, Clean Light, Cyberpunk Neon, OLED Black, and Sunset Glow.
- **Persistent profiles**: Saves your username and avatar in cookies and LocalStorage for up to a year.
- **Message replies**: Quote and reply to specific messages.
- **Audio synthesizer**: Generates incoming message sounds directly through the browser Web Audio API (no missing MP3 files).
- **Mobile-friendly**: Includes iOS zoom-prevention fixes, keyboard viewport resizing, and slim custom scrollbars.
- **Basic security**: Upload folder script execution disabled via `.htaccess`, file extension whitelist, and strict no-cache headers.

---

## Installation

You do not need Composer, npm, or terminal access.

1. Download or clone this repository.
2. Log into your hosting control panel and open the **File Manager** (or connect via FTP like FileZilla).
3. Go to your root web directory (`htdocs` or `public_html`).
4. Upload all the files directly:
   ```text
   htdocs/
   ├── .htaccess
   ├── api.php
   ├── app.js
   ├── config.php
   ├── index.html
   ├── index.php
   ├── style.css
   ├── data/
   └── uploads/
   ```
5. Visit your domain in any browser.

*Note: If your host created a default placeholder file like `index2.html`, delete it so `index.html` loads by default.*

---

## Configuration

If you want to tweak limits, open `config.php`:

```php
// Number of messages kept in history before auto-pruning
define('MAX_MESSAGES_HISTORY', 150);

// Maximum upload file size in MB
define('MAX_FILE_SIZE_MB', 8);

// Allowed upload extensions
define('ALLOWED_EXTENSIONS', [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
    'mp3', 'wav', 'ogg', 'm4a',
    'pdf', 'txt', 'zip', 'rar', 'docx', 'xlsx', 'pptx'
]);
```

---

## How it works under the hood

Instead of heavy database queries or blocked WebSocket connections, DropChat uses a lightweight polling strategy:

1. When a client sends a message or file, `api.php` writes the entry into `data/messages.json` using `flock(LOCK_EX)` to prevent race conditions.
2. Active clients query `api.php?action=get_messages&mtime=...` every 450ms.
3. The server checks `filemtime('data/messages.json')`. If the timestamp matches the client's cached timestamp, it returns an empty response immediately without reading the file.
4. When a new message is written, the file timestamp changes, and all connected clients receive the new payload on their next poll.

---

## Clearing chat history

To reset the chat, open `data/messages.json` and replace its content with an empty array:

```json
[]
```

---

## License

MIT License. Feel free to use or modify for personal or commercial projects.
