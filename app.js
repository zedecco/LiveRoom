// DropChat Client Engine

const CONFIG = {
    POLL_INTERVAL_ACTIVE: 450,       // Ultra-fast sub-half-second poll
    POLL_INTERVAL_INACTIVE: 3000,    // Throttled poll when tab is backgrounded
    MAX_FILE_SIZE_MB: 8,
    API_URL: 'api.php'
};

const THEMES = [
    { id: 'dark', name: 'Modern Dark', icon: '🌙' },
    { id: 'light', name: 'Clean Light', icon: '☀️' },
    { id: 'cyberpunk', name: 'Cyberpunk Neon', icon: '🔮' },
    { id: 'oled', name: 'OLED Black', icon: '🖤' },
    { id: 'sunset', name: 'Sunset Glow', icon: '🌅' }
];

const AVATARS = ['🦊', '🐱', '🐼', '🦁', '🚀', '💎', '⚡', '🔥', '🌸', '👑', '🎮', '🦄'];

// App State
const state = {
    userId: '',
    username: '',
    avatar: '🦊',
    theme: 'dark',
    soundEnabled: true,
    lastMessageId: 0,
    lastMtime: 0,
    selectedFile: null,
    replyingTo: null,
    isPolling: false,
    pollTimer: null,
    isScrolledToBottom: true
};

// --- 2. Cookies & Local Storage Management ---
function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
    const cname = name + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(cname) === 0) {
            return c.substring(cname.length, c.length);
        }
    }
    return '';
}

function loadStoredUser() {
    state.userId = localStorage.getItem('chat_uid') || getCookie('chat_uid') || '';
    state.username = localStorage.getItem('chat_uname') || getCookie('chat_uname') || '';
    state.avatar = localStorage.getItem('chat_uavatar') || getCookie('chat_uavatar') || '🦊';
    state.theme = localStorage.getItem('chat_theme') || getCookie('chat_theme') || 'dark';
    
    // Auto-clear legacy Persian usernames or corrupted cookies from previous builds
    if (/[\u0600-\u06FF]/.test(state.username)) {
        state.username = '';
        localStorage.removeItem('chat_uname');
        setCookie('chat_uname', '', -1);
    }

    const storedSound = localStorage.getItem('chat_sound');
    state.soundEnabled = storedSound !== null ? storedSound === 'true' : true;

    if (!state.userId) {
        state.userId = 'u_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        localStorage.setItem('chat_uid', state.userId);
        setCookie('chat_uid', state.userId);
    }
}

function saveUserData(username, avatar) {
    state.username = username.trim();
    state.avatar = avatar;

    localStorage.setItem('chat_uname', state.username);
    localStorage.setItem('chat_uavatar', state.avatar);
    setCookie('chat_uname', state.username);
    setCookie('chat_uavatar', state.avatar);

    updateHeaderUserInfo();
}

// --- 3. Audio Synthesizer (Web Audio API) ---
function playNotificationSound() {
    if (!state.soundEnabled) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    } catch (e) {
        // Prevent autoplay console warning
    }
}

// --- 4. Theme Engine ---
function applyTheme(themeId) {
    state.theme = themeId;
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('chat_theme', themeId);
    setCookie('chat_theme', themeId);
}

function cycleTheme() {
    const currentIndex = THEMES.findIndex(t => t.id === state.theme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    const nextTheme = THEMES[nextIndex];
    applyTheme(nextTheme.id);
    showToast(`Switched to ${nextTheme.name} ${nextTheme.icon}`);
}

// --- 5. DOM References ---
const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    chatInput: document.getElementById('chatInput'),
    sendBtn: document.getElementById('sendBtn'),
    fileInput: document.getElementById('fileInput'),
    attachBtn: document.getElementById('attachBtn'),
    emojiBtn: document.getElementById('emojiBtn'),
    emojiPopover: document.getElementById('emojiPopover'),
    filePreviewBanner: document.getElementById('filePreviewBanner'),
    filePreviewName: document.getElementById('filePreviewName'),
    filePreviewSize: document.getElementById('filePreviewSize'),
    filePreviewThumb: document.getElementById('filePreviewThumb'),
    filePreviewIcon: document.getElementById('filePreviewIcon'),
    fileCancelBtn: document.getElementById('fileCancelBtn'),
    replyBanner: document.getElementById('replyBanner'),
    replyUser: document.getElementById('replyUser'),
    replyText: document.getElementById('replyText'),
    replyCloseBtn: document.getElementById('replyCloseBtn'),
    scrollBottomPill: document.getElementById('scrollBottomPill'),
    headerUserAvatar: document.getElementById('headerUserAvatar'),
    headerUserName: document.getElementById('headerUserName'),
    changeNameBtn: document.getElementById('changeNameBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    nameModal: document.getElementById('nameModal'),
    nameInput: document.getElementById('nameInput'),
    avatarGrid: document.getElementById('avatarGrid'),
    saveNameBtn: document.getElementById('saveNameBtn'),
    nameModalTitle: document.getElementById('nameModalTitle'),
    lightboxOverlay: document.getElementById('lightboxOverlay'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxClose: document.getElementById('lightboxClose'),
    toastContainer: document.getElementById('toastContainer')
};

function showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 2800);
}

function updateHeaderUserInfo() {
    if (elements.headerUserAvatar) elements.headerUserAvatar.textContent = state.avatar;
    if (elements.headerUserName) elements.headerUserName.textContent = state.username || 'Profile';
}

function renderAvatarGrid(selectedAvatar) {
    elements.avatarGrid.innerHTML = '';
    AVATARS.forEach(av => {
        const item = document.createElement('div');
        item.className = 'avatar-option' + (av === selectedAvatar ? ' selected' : '');
        item.textContent = av;
        item.onclick = () => {
            document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            state.avatar = av;
        };
        elements.avatarGrid.appendChild(item);
    });
}

function openNameModal(isEditing = false) {
    elements.nameModalTitle.textContent = isEditing ? 'Edit Profile' : 'Welcome to DropChat';
    elements.nameInput.value = state.username || '';
    renderAvatarGrid(state.avatar);
    elements.nameModal.classList.add('active');
    setTimeout(() => elements.nameInput.focus(), 150);
}

function closeNameModal() {
    elements.nameModal.classList.remove('active');
}

// --- 6. Message Rendering ---
function createMessageElement(msg) {
    if (msg.is_system) {
        const sysDiv = document.createElement('div');
        sysDiv.className = 'message-system';
        sysDiv.dataset.id = msg.id;
        sysDiv.innerHTML = `<span class="sys-icon">📢</span> <span>${escapeHtml(msg.text)}</span> <span style="opacity:0.6;font-size:10px;margin-left:4px;">${msg.time}</span>`;
        return sysDiv;
    }

    const isMe = msg.user_id === state.userId || (!msg.user_id && msg.username === state.username);
    const row = document.createElement('div');
    row.className = `message-row ${isMe ? 'me' : 'other'}`;
    row.dataset.id = msg.id;

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = msg.avatar || '👤';

    // Bubble Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'message-bubble-wrapper';

    // Header info
    const header = document.createElement('div');
    header.className = 'message-header-info';
    header.innerHTML = `<span class="message-sender">${isMe ? 'You' : escapeHtml(msg.username)}</span>`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Reply quote block
    if (msg.reply_to) {
        const replyBox = document.createElement('div');
        replyBox.className = 'reply-quote-box';
        replyBox.innerHTML = `
            <div class="reply-quote-user">${escapeHtml(msg.reply_to.username)}</div>
            <div class="reply-quote-text">${escapeHtml(msg.reply_to.text)}</div>
        `;
        bubble.appendChild(replyBox);
    }

    // Message text with clickable links
    if (msg.text) {
        const textNode = document.createElement('div');
        textNode.innerHTML = formatMessageText(msg.text);
        bubble.appendChild(textNode);
    }

    // Attached Media
    if (msg.file) {
        if (msg.file.type === 'image') {
            const img = document.createElement('img');
            img.src = msg.file.url;
            img.className = 'message-media-img';
            img.loading = 'lazy';
            img.onclick = () => openLightbox(msg.file.url);
            bubble.appendChild(img);
        } else if (msg.file.type === 'audio') {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.className = 'message-media-audio';
            audio.src = msg.file.url;
            bubble.appendChild(audio);
        } else {
            const fileLink = document.createElement('a');
            fileLink.href = msg.file.url;
            fileLink.target = '_blank';
            fileLink.download = msg.file.name;
            fileLink.className = 'message-media-file';
            fileLink.innerHTML = `
                <div class="file-icon">📄</div>
                <div class="file-meta">
                    <div class="file-name">${escapeHtml(msg.file.name)}</div>
                    <div class="file-size">${msg.file.size}</div>
                </div>
                <span style="font-size:15px;opacity:0.8;">⬇️</span>
            `;
            bubble.appendChild(fileLink);
        }
    }

    // Timestamp
    const timeNode = document.createElement('div');
    timeNode.className = 'message-time';
    timeNode.textContent = msg.time || '';
    bubble.appendChild(timeNode);

    // Floating Reply Action
    const actions = document.createElement('div');
    actions.className = 'bubble-actions';
    const replyBtn = document.createElement('button');
    replyBtn.className = 'action-pill-btn';
    replyBtn.title = 'Reply';
    replyBtn.innerHTML = '↩️';
    replyBtn.onclick = () => setReplyTo(msg);
    actions.appendChild(replyBtn);

    bubble.appendChild(actions);

    wrapper.appendChild(header);
    wrapper.appendChild(bubble);

    row.appendChild(avatar);
    row.appendChild(wrapper);

    return row;
}

// Convert links and sanitize text
function formatMessageText(text) {
    let safe = escapeHtml(text);
    const urlPattern = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
    safe = safe.replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">$1</a>');
    return safe.replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto scroll management
function scrollToBottom(force = false) {
    const container = elements.messagesContainer;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    
    if (force || isNearBottom) {
        container.scrollTop = container.scrollHeight;
        elements.scrollBottomPill.style.display = 'none';
    } else {
        elements.scrollBottomPill.style.display = 'flex';
    }
}

// Reply handler
function setReplyTo(msg) {
    state.replyingTo = {
        id: msg.id,
        username: msg.username,
        text: msg.text || (msg.file ? `[File: ${msg.file.name}]` : '')
    };
    elements.replyUser.textContent = `Replying to ${state.replyingTo.username}:`;
    elements.replyText.textContent = state.replyingTo.text;
    elements.replyBanner.classList.add('active');
    elements.chatInput.focus();
}

function clearReply() {
    state.replyingTo = null;
    elements.replyBanner.classList.remove('active');
}

// Lightbox
function openLightbox(url) {
    elements.lightboxImg.src = url;
    elements.lightboxOverlay.classList.add('active');
}

function closeLightbox() {
    elements.lightboxOverlay.classList.remove('active');
    elements.lightboxImg.src = '';
}

// --- 7. Fast Polling Engine with Micro-Caching ---
async function fetchMessages() {
    if (state.isPolling) return;
    state.isPolling = true;

    try {
        const params = new URLSearchParams({
            action: 'get_messages',
            after_id: state.lastMessageId,
            mtime: state.lastMtime
        });

        const res = await fetch(`${CONFIG.API_URL}?${params.toString()}`);
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();

        if (data.success) {
            if (data.mtime) {
                state.lastMtime = data.mtime;
            }

            let hasNewForeignMessage = false;

            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    if (msg.id > state.lastMessageId) {
                        state.lastMessageId = msg.id;

                        // Check if optimistic bubble exists
                        const existingTemp = document.querySelector(`.message-row[data-temp-id="${msg.id}"]`);
                        if (existingTemp) {
                            existingTemp.dataset.id = msg.id;
                            existingTemp.removeAttribute('data-temp-id');
                            return;
                        }

                        const msgElem = createMessageElement(msg);
                        elements.messagesContainer.appendChild(msgElem);

                        if (msg.user_id !== state.userId && !msg.is_system) {
                            hasNewForeignMessage = true;
                        }
                    }
                });

                scrollToBottom();

                if (hasNewForeignMessage) {
                    playNotificationSound();
                }
            }
        }
    } catch (err) {
        console.warn('Poll check:', err);
    } finally {
        state.isPolling = false;
        scheduleNextPoll();
    }
}

function scheduleNextPoll() {
    clearTimeout(state.pollTimer);
    const interval = document.hidden ? CONFIG.POLL_INTERVAL_INACTIVE : CONFIG.POLL_INTERVAL_ACTIVE;
    state.pollTimer = setTimeout(fetchMessages, interval);
}

// Send Message
async function sendMessage() {
    const text = elements.chatInput.value.trim();
    const file = state.selectedFile;

    if (!text && !file) return;

    if (!state.username) {
        openNameModal();
        return;
    }

    elements.sendBtn.disabled = true;

    const formData = new FormData();
    formData.append('action', 'send_message');
    formData.append('username', state.username);
    formData.append('avatar', state.avatar);
    formData.append('user_id', state.userId);
    formData.append('text', text);

    if (state.replyingTo) {
        formData.append('reply_to', JSON.stringify(state.replyingTo));
    }

    if (file) {
        formData.append('file', file);
    }

    // Reset inputs immediately
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
    clearSelectedFile();
    clearReply();

    try {
        const res = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success && data.message) {
            if (data.message.id > state.lastMessageId) {
                state.lastMessageId = data.message.id;
            }
            const msgElem = createMessageElement(data.message);
            elements.messagesContainer.appendChild(msgElem);
            scrollToBottom(true);
        } else {
            showToast(data.error || 'Failed to send message');
        }
    } catch (err) {
        showToast('Network error while sending message!');
    } finally {
        elements.sendBtn.disabled = false;
        elements.chatInput.focus();
    }
}

// File Attachment Handler
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
        showToast(`File size must not exceed ${CONFIG.MAX_FILE_SIZE_MB} MB.`);
        elements.fileInput.value = '';
        return;
    }

    state.selectedFile = file;
    elements.filePreviewName.textContent = file.name;
    elements.filePreviewSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            elements.filePreviewThumb.src = ev.target.result;
            elements.filePreviewThumb.style.display = 'block';
            elements.filePreviewIcon.style.display = 'none';
        };
        reader.readAsDataURL(file);
    } else {
        elements.filePreviewThumb.style.display = 'none';
        elements.filePreviewIcon.style.display = 'block';
        elements.filePreviewIcon.textContent = file.type.startsWith('audio/') ? '🎵' : '📄';
    }

    elements.filePreviewBanner.classList.add('active');
}

function clearSelectedFile() {
    state.selectedFile = null;
    elements.fileInput.value = '';
    elements.filePreviewBanner.classList.remove('active');
    elements.filePreviewThumb.src = '';
}

// Broadcast System Events (Join / Rename)
async function sendSystemEvent(type, oldName, newName) {
    try {
        const formData = new FormData();
        formData.append('action', 'system_event');
        formData.append('type', type);
        formData.append('username', newName);
        formData.append('old_name', oldName);
        await fetch(CONFIG.API_URL, { method: 'POST', body: formData });
        fetchMessages();
    } catch (e) {}
}

// --- 8. Extended Rich Emoji Set (56 Emojis) ---
const POPULAR_EMOJIS = [
    '😀', '😂', '🤣', '😍', '😎', '🥳', '🤔', '😴',
    '😭', '😱', '🤯', '😇', '🤠', '🤐', '🤫', '🤩',
    '❤️', '💖', '🔥', '✨', '⭐', '💯', '👍', '👏',
    '🙌', '🤝', '✌️', '💪', '🙏', '🎉', '🚀', '⚡',
    '🍕', '🍔', '☕', '🍷', '🍺', '🍿', '🎧', '🎮',
    '🕶️', '👑', '💎', '🌈', '🌸', '🍀', '💡', '🏆',
    '👀', '💬', '📱', '💻', '🔮', '🧸', '👻', '🤖'
];

function setupEmojiPicker() {
    const grid = elements.emojiPopover.querySelector('.emoji-grid');
    grid.innerHTML = '';
    POPULAR_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.onclick = () => {
            elements.chatInput.value += emoji;
            elements.chatInput.focus();
        };
        grid.appendChild(btn);
    });

    elements.emojiBtn.onclick = (e) => {
        e.stopPropagation();
        elements.emojiPopover.classList.toggle('active');
    };

    document.addEventListener('click', (e) => {
        if (!elements.emojiPopover.contains(e.target) && e.target !== elements.emojiBtn) {
            elements.emojiPopover.classList.remove('active');
        }
    });
}

// --- 9. Event Listeners & Startup ---
function initEventListeners() {
    // Send on Enter (Shift+Enter for newline)
    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-grow textarea
    elements.chatInput.addEventListener('input', () => {
        elements.chatInput.style.height = 'auto';
        elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 120) + 'px';
    });

    elements.sendBtn.onclick = sendMessage;

    // Attachments
    elements.attachBtn.onclick = () => elements.fileInput.click();
    elements.fileInput.onchange = handleFileSelect;
    elements.fileCancelBtn.onclick = clearSelectedFile;

    // Reply banner close
    elements.replyCloseBtn.onclick = clearReply;

    // Scroll to bottom
    elements.scrollBottomPill.onclick = () => scrollToBottom(true);
    elements.messagesContainer.addEventListener('scroll', () => {
        const c = elements.messagesContainer;
        const isNearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 100;
        if (isNearBottom) {
            elements.scrollBottomPill.style.display = 'none';
        }
    });

    // Theme Switch
    elements.themeToggleBtn.onclick = cycleTheme;

    // Audio Mute Toggle
    elements.soundToggleBtn.onclick = () => {
        state.soundEnabled = !state.soundEnabled;
        localStorage.setItem('chat_sound', state.soundEnabled);
        elements.soundToggleBtn.textContent = state.soundEnabled ? '🔔' : '🔕';
        showToast(state.soundEnabled ? 'Sound enabled 🔔' : 'Sound muted 🔕');
    };

    // Lightbox
    elements.lightboxClose.onclick = closeLightbox;
    elements.lightboxOverlay.onclick = (e) => {
        if (e.target === elements.lightboxOverlay) closeLightbox();
    };

    // Change Name Button in Header
    elements.changeNameBtn.onclick = () => openNameModal(true);

    // Save Name via Enter key
    elements.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            elements.saveNameBtn.click();
        }
    });

    // Dismiss modal if user already has a name and clicks backdrop
    elements.nameModal.addEventListener('click', (e) => {
        if (e.target === elements.nameModal && state.username) {
            closeNameModal();
        }
    });

    // Save Name Button Click
    elements.saveNameBtn.onclick = () => {
        const newName = elements.nameInput.value.trim();
        if (!newName) {
            showToast('Please enter a display name');
            return;
        }

        const oldName = state.username;
        saveUserData(newName, state.avatar);
        closeNameModal();

        if (oldName && oldName !== newName) {
            sendSystemEvent('rename', oldName, newName);
            showToast(`Profile name changed to "${newName}"`);
        } else if (!oldName) {
            sendSystemEvent('join', '', newName);
            showToast(`Welcome to DropChat, ${newName}! 🎉`);
        }
    };

    // Zero-delay poll triggers on focus
    elements.chatInput.addEventListener('focus', () => fetchMessages());

    // Accelerate poll when tab becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            fetchMessages();
        }
    });
}

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
    loadStoredUser();
    applyTheme(state.theme);
    elements.soundToggleBtn.textContent = state.soundEnabled ? '🔔' : '🔕';
    updateHeaderUserInfo();
    setupEmojiPicker();
    initEventListeners();

    if (!state.username) {
        openNameModal(false);
    } else {
        fetchMessages();
    }
});
