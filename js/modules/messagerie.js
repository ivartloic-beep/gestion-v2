// ========== MODULE MESSAGERIE INTERNE ==========

let msgConversations = [];
let msgCurrentConvId = null;
let msgCurrentMessages = [];
let msgReadPositions = [];
let msgReplyTo = null;
let msgNewConvType = 'dm';
let msgNewConvSelectedUsers = [];
let msgAddMemberSelectedUsers = [];
let msgPollingInterval = null;
let msgBackgroundSyncInterval = null;
let msgLastCheck = null;
const MSG_BACKGROUND_SYNC_MS = 5000;

// --- Navigation ---
function openMessagingPage() {
    const resumeConvId = msgCurrentConvId;
    closeMsgFloatWidget(true);
    closeAllPages();
    const homeWelcome = document.getElementById('homeWelcome');
    if (homeWelcome) homeWelcome.style.display = 'none';
    const msgPage = document.getElementById('messageriePage');
    if (msgPage) {
        msgPage.classList.add('active');
    }
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const navItem = document.getElementById('navMessagerieItem');
    if (navItem) navItem.classList.add('active');
    loadConversations();
    startMsgPolling();
    closeSidebarOnMobile();
    syncMsgFloatToggleVisibility();
    if (resumeConvId) {
        setTimeout(function() { openConversation(resumeConvId, false); }, 150);
    }
}

function closeMessagingPage() {
    const msgPage = document.getElementById('messageriePage');
    if (msgPage) msgPage.classList.remove('active');
    const homeWelcome = document.getElementById('homeWelcome');
    if (homeWelcome) homeWelcome.style.display = '';
    stopMsgPolling();
    msgCurrentConvId = null;
    refreshMessagingState();
    navigateTo('home');
    syncMsgFloatToggleVisibility();
}

// --- Chargement conversations ---
async function loadConversations() {
    try {
        const data = await apiCall('messaging.php?action=conversations', 'GET');
        if (data?.success && Array.isArray(data.conversations)) {
            msgConversations = data.conversations;
        } else {
            msgConversations = [];
        }
    } catch(e) {
        console.warn('Messaging: Erreur chargement conversations', e);
        msgConversations = [];
    }
    renderConversationList();
    updateMsgBadges();
}

/** Rafraîchit conversations, badges et widget accueil (hors page messagerie). */
async function refreshMessagingState() {
    if (!authToken || !currentUser) return;
    try {
        const data = await apiCall('messaging.php?action=conversations', 'GET');
        if (!data?.success || !Array.isArray(data.conversations)) return;

        const prevTotal = msgConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        msgConversations = data.conversations;

        const msgPageActive = document.getElementById('messageriePage')?.classList.contains('active');
        const floatOpen = document.getElementById('msgFloatPanel')?.classList.contains('open');
        if (msgPageActive) {
            renderConversationList(document.getElementById('msgSearchInput')?.value || '');
        }
        if (floatOpen) {
            renderConversationList(document.getElementById('msgFloatSearchInput')?.value || '');
            if (msgCurrentConvId) await loadMessages(msgCurrentConvId);
        }
        updateMsgBadges();

        const total = msgConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        if (total > prevTotal && prevTotal >= 0 && !msgPageActive) {
            const newest = msgConversations.find(c => c.unreadCount > 0);
            if (newest) {
                showForegroundMsgNotification(
                    newest.lastMessageSender || 'Nouveau message',
                    newest.lastMessage || '',
                    newest.id
                );
            }
        }
        _lastKnownUnreadTotal = total;
    } catch (e) { /* silently fail */ }
}

function renderConversationList(pageFilter, floatFilter) {
    renderConversationListIn(
        'msgConvList', 'msgConvEmpty',
        pageFilter !== undefined ? pageFilter : (document.getElementById('msgSearchInput')?.value || ''),
        false
    );
    renderConversationListIn(
        'msgFloatConvList', 'msgFloatConvEmpty',
        floatFilter !== undefined ? floatFilter : (document.getElementById('msgFloatSearchInput')?.value || ''),
        true
    );
}

function renderConversationListIn(listId, emptyId, filter, isFloat) {
    const list = document.getElementById(listId);
    const empty = document.getElementById(emptyId);
    if (!list) return;

    const q = (filter || '').toLowerCase().trim();
    const filtered = q ? msgConversations.filter(c => {
        const name = getMsgConvDisplayName(c).toLowerCase();
        const preview = (c.lastMessage || '').toLowerCase();
        return name.includes(q) || preview.includes(q);
    }) : msgConversations;

    if (filtered.length === 0) {
        list.innerHTML = '';
        if (empty) { empty.style.display = ''; list.appendChild(empty); }
        return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = filtered.map(c => {
        const name = getMsgConvDisplayName(c);
        const initials = getMsgInitials(name);
        const isGroup = c.type === 'group';
        const isActive = String(c.id) === String(msgCurrentConvId);
        const unread = c.unreadCount > 0;
        const timeStr = c.lastMessageAt ? formatMsgTime(c.lastMessageAt) : '';
        const preview = c.lastMessageSender && c.lastMessageSender !== name
            ? `${getShortName(c.lastMessageSender)}: ${stripMsgMentions(c.lastMessage || '')}`
            : stripMsgMentions(c.lastMessage || 'Aucun message');

        return `
            <div class="msg-conv-item ${isActive ? 'active' : ''} ${unread ? 'unread' : ''}" onclick="openConversation('${c.id}', ${isFloat})">
                <div class="msg-conv-avatar ${isGroup ? 'group' : 'dm'}">${isGroup ? '👥' : initials}</div>
                <div class="msg-conv-info">
                    <div class="msg-conv-top">
                        <div class="msg-conv-name">${escHtml(name)}</div>
                        <div class="msg-conv-time">${timeStr}</div>
                    </div>
                    <div class="msg-conv-bottom">
                        <div class="msg-conv-preview">${escHtml(preview)}</div>
                        ${unread ? `<div class="msg-conv-badge">${c.unreadCount}</div>` : ''}
                    </div>
                </div>
                <button class="msg-conv-delete-btn" onclick="event.stopPropagation(); confirmDeleteConversation('${c.id}')" title="Supprimer">🗑️</button>
            </div>
        `;
    }).join('');
}

function filterFloatConversations(value) {
    renderConversationListIn('msgFloatConvList', 'msgFloatConvEmpty', value, true);
}

function filterConversations(value) {
    renderConversationListIn('msgConvList', 'msgConvEmpty', value, false);
}

// --- Ouvrir une conversation ---
async function openConversation(convId, useFloat) {
    msgCurrentConvId = convId;
    closeMsgMentionPicker();

    const pageActive = document.getElementById('messageriePage')?.classList.contains('active');
    const floatPanel = document.getElementById('msgFloatPanel');
    const floatOpen = floatPanel?.classList.contains('open');
    const inFloat = useFloat === true || (floatOpen && !pageActive);

    if (inFloat) {
        const listView = document.getElementById('msgFloatListView');
        const chatView = document.getElementById('msgFloatChatView');
        const backBtn = document.getElementById('msgFloatBackBtn');
        if (listView) listView.style.display = 'none';
        if (chatView) chatView.style.display = 'flex';
        if (backBtn) backBtn.style.display = '';
    }

    if (pageActive) {
        const sidebar = document.getElementById('msgSidebar');
        const chatArea = document.getElementById('msgChatArea');
        if (window.innerWidth <= 768) {
            sidebar.classList.add('hidden-mobile');
            chatArea.classList.add('visible-mobile');
        }
        document.getElementById('msgChatEmpty').style.display = 'none';
        document.getElementById('msgChatHeader').style.display = '';
        document.getElementById('msgChatMessages').style.display = '';
        document.getElementById('msgComposer').style.display = '';
        document.getElementById('msgGroupInfoPanel').classList.remove('visible');
    }

    const conv = msgConversations.find(c => String(c.id) === String(convId));
    if (!conv) return;

    const name = getMsgConvDisplayName(conv);
    const isGroup = conv.type === 'group';

    if (inFloat) {
        const titleEl = document.getElementById('msgFloatHeaderTitle');
        if (titleEl) titleEl.textContent = name;
    }

    if (pageActive) {
        document.getElementById('msgChatHeaderName').textContent = name;
        const avatar = document.getElementById('msgChatHeaderAvatar');
        avatar.className = `msg-chat-avatar ${isGroup ? 'group' : 'dm'}`;
        avatar.textContent = isGroup ? '👥' : getMsgInitials(name);
        document.getElementById('msgChatHeaderStatus').textContent = isGroup ? `${(conv.members || []).length} membres` : '';
        document.getElementById('msgInfoToggle').style.display = isGroup ? '' : 'none';
    }

    await loadMessages(convId);
    markConversationRead(convId);
    renderConversationList();

    setTimeout(() => {
        if (inFloat) document.getElementById('msgFloatInput')?.focus();
        else if (pageActive) document.getElementById('msgInput')?.focus();
    }, 100);
}

function msgBackToList() {
    const sidebar = document.getElementById('msgSidebar');
    const chatArea = document.getElementById('msgChatArea');
    sidebar.classList.remove('hidden-mobile');
    chatArea.classList.remove('visible-mobile');
    msgCurrentConvId = null;
}

// --- Messages ---
async function loadMessages(convId) {
    try {
        const data = await apiCall(`messaging.php?action=messages&conversationId=${convId}`, 'GET');
        if (data?.success && Array.isArray(data.messages)) {
            msgCurrentMessages = data.messages;
            msgReadPositions = Array.isArray(data.readPositions) ? data.readPositions : [];
        } else {
            msgCurrentMessages = [];
            msgReadPositions = [];
        }
    } catch(e) {
        console.warn('Messaging: Erreur chargement messages', e);
        msgCurrentMessages = [];
        msgReadPositions = [];
    }
    renderMessages();
}

function renderMessages() {
    renderMessagesIn(document.getElementById('msgChatMessages'), false);
    renderMessagesIn(document.getElementById('msgFloatChatMessages'), true);
}

function renderMessagesIn(container, compact) {
    if (!container) return;

    const uid = String(currentUser?.id || '');

    if (msgCurrentMessages.length === 0) {
        container.innerHTML = `
            <div class="msg-empty-state" style="padding: ${compact ? '2rem 1rem' : '3rem'};">
                <div class="msg-empty-state-icon">👋</div>
                <div class="msg-empty-state-title">Démarrez la conversation !</div>
                <div class="msg-empty-state-text">Envoyez le premier message</div>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = '';

    msgCurrentMessages.forEach(msg => {
        // Séparateur de date
        const msgDate = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
        if (msgDate && msgDate !== lastDate) {
            lastDate = msgDate;
            html += `<div class="msg-date-separator"><span>${msgDate}</span></div>`;
        }
        
        const isSent = String(msg.senderId) === uid;
        const senderName = msg.senderName || 'Utilisateur';
        const initials = getMsgInitials(senderName);
        const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        
        html += `<div class="msg-bubble-row ${isSent ? 'sent' : 'received'}">`;
        
        if (!isSent) {
            html += `<div class="msg-bubble-avatar-mini" style="background: ${stringToColor(senderName)};">${initials}</div>`;
        }
        
        html += `<div class="msg-bubble" oncontextmenu="msgBubbleContext(event, '${msg.id}')">`;
        
        if (!isSent) {
            html += `<div class="msg-bubble-sender" style="color: ${stringToColor(senderName)};">${escHtml(senderName)}</div>`;
        }
        
        // Reply
        if (msg.replyTo && msg.replyToContent) {
            html += `<div class="msg-bubble-reply" onclick="scrollToMessage('${msg.replyTo}')">
                <div class="msg-bubble-reply-author">${escHtml(msg.replyToAuthor || '')}</div>
                <div>${escHtml(truncate(msg.replyToContent, 80))}</div>
            </div>`;
        }
        
        // Contenu texte
        if (msg.content) {
            html += `<div class="msg-bubble-text">${formatMsgText(msg.content)}</div>`;
        }
        
        // Pièce jointe
        if (msg.attachment) {
            const att = msg.attachment;
            if (att.type && att.type.startsWith('image/')) {
                html += `<img class="msg-bubble-img" src="${escHtml(att.url)}" alt="${escHtml(att.name)}" onclick="window.open('${escHtml(att.url)}','_blank')">`;
            } else {
                html += `<div class="msg-bubble-attachment" onclick="window.open('${escHtml(att.url)}','_blank')">
                    <span class="msg-bubble-attachment-icon">📄</span>
                    <div class="msg-bubble-attachment-info">
                        <div class="msg-bubble-attachment-name">${escHtml(att.name)}</div>
                        <div class="msg-bubble-attachment-size">${att.size ? formatFileSize(att.size) : ''}</div>
                    </div>
                </div>`;
            }
        }
        
        let readIndicator = '';
        if (isSent) {
            const conv = msgConversations.find(c => String(c.id) === String(msgCurrentConvId));
            const isGroup = conv && conv.type === 'group';
            const msgTime = new Date(msg.createdAt).getTime();
            const readByMembers = msgReadPositions.filter(rp => rp.lastReadAt && new Date(rp.lastReadAt).getTime() >= msgTime);
            const totalOthers = msgReadPositions.length;

            if (totalOthers > 0) {
                if (isGroup) {
                    if (readByMembers.length === totalOthers) {
                        readIndicator = '<span class="msg-read-indicator read" title="Lu par tous">✓✓</span>';
                    } else if (readByMembers.length > 0) {
                        const names = readByMembers.map(r => r.name).join(', ');
                        readIndicator = `<span class="msg-read-indicator partial" title="Lu par ${escHtml(names)}">✓✓ ${readByMembers.length}/${totalOthers}</span>`;
                    } else {
                        readIndicator = '<span class="msg-read-indicator sent" title="Envoyé">✓</span>';
                    }
                } else {
                    if (readByMembers.length > 0) {
                        readIndicator = '<span class="msg-read-indicator read" title="Lu">✓✓</span>';
                    } else {
                        readIndicator = '<span class="msg-read-indicator sent" title="Envoyé">✓</span>';
                    }
                }
            }
        }

        html += `<div class="msg-bubble-meta">
            <span class="msg-bubble-time">${time}</span>
            ${readIndicator}
        </div>`;
        
        html += `</div></div>`; // ferme .msg-bubble et .msg-bubble-row
    });
    
    container.innerHTML = html;
    
    // Scroller en bas
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });
}

function scrollToMessage(msgId) {
    // Simple scroll to (si le message est visible)
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- Envoi de message ---
function isMsgFloatChatActive() {
    const panel = document.getElementById('msgFloatPanel');
    const chatView = document.getElementById('msgFloatChatView');
    const pageActive = document.getElementById('messageriePage')?.classList.contains('active');
    return !!(panel?.classList.contains('open') && chatView?.style.display !== 'none' && !pageActive);
}

function getMsgComposerEls() {
    if (isMsgFloatChatActive()) {
        return {
            input: document.getElementById('msgFloatInput'),
            sendBtn: document.getElementById('msgFloatSendBtn'),
            fileInput: document.getElementById('msgFloatFileInput'),
            replyBar: document.getElementById('msgFloatReplyBar'),
            replyAuthor: document.getElementById('msgFloatReplyAuthor'),
            replyText: document.getElementById('msgFloatReplyText')
        };
    }
    return {
        input: document.getElementById('msgInput'),
        sendBtn: document.getElementById('msgSendBtn'),
        fileInput: document.getElementById('msgFileInput'),
        replyBar: document.getElementById('msgReplyBar'),
        replyAuthor: document.getElementById('msgReplyAuthor'),
        replyText: document.getElementById('msgReplyText')
    };
}

async function sendMessage() {
    const composer = getMsgComposerEls();
    const input = composer.input;
    const text = (getMentionFieldPlainText(input) || '').trim();
    if (!text && !msgPendingFile) return;
    if (!msgCurrentConvId) return;

    const body = {
        action: 'send_message',
        conversationId: msgCurrentConvId,
        content: text,
        replyTo: msgReplyTo?.id || null
    };

    if (input) {
        if (input.isContentEditable) input.innerHTML = '';
        else input.value = '';
        autoResizeMsgInput(input);
    }
    cancelReply();
    if (composer.sendBtn) composer.sendBtn.disabled = true;
    
    try {
        // Si fichier en attente, envoyer en multipart
        if (msgPendingFile) {
            const formData = new FormData();
            formData.append('action', 'send_message');
            formData.append('conversationId', msgCurrentConvId);
            formData.append('content', text);
            if (msgReplyTo?.id) formData.append('replyTo', msgReplyTo.id);
            formData.append('file', msgPendingFile);
            
            const response = await fetch(`${API_URL}/messaging.php`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'X-Auth-Token': authToken
                },
                body: formData
            });
            const data = await response.json();
            msgPendingFile = null;
            if (data?.success && data.message) {
                msgCurrentMessages.push(data.message);
                renderMessages();
                updateConvAfterSend(data.message);
            }
        } else {
            const data = await apiCall('messaging.php', 'POST', body);
            if (data?.success && data.message) {
                msgCurrentMessages.push(data.message);
                renderMessages();
                updateConvAfterSend(data.message);
            }
        }
    } catch(e) {
        console.error('Messaging: Erreur envoi', e);
    }
}

let msgPendingFile = null;

function msgAttachFile() {
    getMsgComposerEls().fileInput?.click();
}

function handleMsgFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    msgPendingFile = file;
    const composer = getMsgComposerEls();
    if (composer.input && !composer.input.value.trim()) {
        composer.input.value = `📎 ${file.name}`;
    }
    if (composer.sendBtn) composer.sendBtn.disabled = false;
    e.target.value = '';
}

function updateConvAfterSend(msg) {
    const conv = msgConversations.find(c => String(c.id) === String(msgCurrentConvId));
    if (conv) {
        conv.lastMessage = stripMsgMentions(msg.content || '') || (msg.attachment ? '📎 Fichier' : '');
        conv.lastMessageAt = msg.createdAt;
        conv.lastMessageSender = msg.senderName || '';
    }
    // Remonter la conversation en haut
    const idx = msgConversations.findIndex(c => String(c.id) === String(msgCurrentConvId));
    if (idx > 0) {
        const [moved] = msgConversations.splice(idx, 1);
        msgConversations.unshift(moved);
    }
    renderConversationList();
}

// --- Reply ---
function setReply(msgId) {
    const msg = msgCurrentMessages.find(m => String(m.id) === String(msgId));
    if (!msg) return;
    msgReplyTo = msg;
    ['msgReplyBar', 'msgFloatReplyBar'].forEach(function(id) {
        const bar = document.getElementById(id);
        if (!bar) return;
        const author = bar.querySelector('.msg-reply-bar-author');
        const text = bar.querySelector('.msg-reply-bar-text');
        if (author) author.textContent = msg.senderName || 'Utilisateur';
        if (text) text.textContent = truncate(msg.content || '📎 Fichier', 100);
        bar.classList.add('visible');
    });
    getMsgComposerEls().input?.focus();
}

function cancelReply() {
    msgReplyTo = null;
    document.getElementById('msgReplyBar')?.classList.remove('visible');
    document.getElementById('msgFloatReplyBar')?.classList.remove('visible');
    closeMsgMentionPicker();
}

function msgBubbleContext(e, msgId) {
    e.preventDefault();
    setReply(msgId);
}

// --- Saisie ---
function handleMsgKeydown(e) {
    const pickerOpen = isMentionPickerOpen();
    if (pickerOpen && msgMentionResults.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); msgMentionMoveSelection(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); msgMentionMoveSelection(-1); return; }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            msgMentionSelectIndex(msgMentionSelectedIndex);
            return;
        }
    }
    if (e.key === 'Escape' && msgMentionActive) {
        e.preventDefault();
        closeMsgMentionPicker();
        return;
    }
    const sendBtn = getMsgComposerEls().sendBtn;
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
    // Activer/désactiver le bouton envoi
    setTimeout(() => {
        const composer = getMsgComposerEls();
        const val = (getMentionFieldPlainText(composer.input) || '').trim();
        if (composer.sendBtn) composer.sendBtn.disabled = !val && !msgPendingFile;
    }, 10);
}

function getMentionFieldPlainText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
    if (el.isContentEditable) return serializeContentEditableWithMentions(el);
    return '';
}

function serializeContentEditableWithMentions(root) {
    if (!root) return '';
    let out = '';
    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            if (el.classList && el.classList.contains('msg-mention-chip') && el.dataset.mentionToken) {
                out += el.dataset.mentionToken;
                return;
            }
            if (el.tagName === 'BR') {
                out += '\n';
                return;
            }
            if ((el.tagName === 'DIV' || el.tagName === 'P') && out && !out.endsWith('\n')) {
                out += '\n';
            }
            el.childNodes.forEach(walk);
        }
    }
    root.childNodes.forEach(walk);
    return out.replace(/\n+$/, '');
}

function autoResizeMsgInput(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    handleMsgMentionInput(el);
    if (el.isContentEditable && typeof syncMentionChipsInContentEditable === 'function') {
        syncMentionChipsInContentEditable(el);
    }
    const composer = getMsgComposerEls();
    const val = (getMentionFieldPlainText(el) || '').trim();
    if (composer.sendBtn) composer.sendBtn.disabled = !val && !msgPendingFile;
    const otherSendBtn = el.id === 'msgFloatInput'
        ? document.getElementById('msgSendBtn')
        : document.getElementById('msgFloatSendBtn');
    if (otherSendBtn && document.activeElement !== (el.id === 'msgFloatInput' ? document.getElementById('msgInput') : document.getElementById('msgFloatInput'))) {
        const otherInput = el.id === 'msgFloatInput' ? document.getElementById('msgInput') : document.getElementById('msgFloatInput');
        if (otherInput) otherSendBtn.disabled = !(getMentionFieldPlainText(otherInput) || '').trim() && !msgPendingFile;
    }
}

// --- Marquer comme lu ---
async function markConversationRead(convId) {
    try {
        await apiCall('messaging.php', 'POST', { action: 'mark_read', conversationId: convId });
        const conv = msgConversations.find(c => String(c.id) === String(convId));
        if (conv) conv.unreadCount = 0;
        updateMsgBadges();
    } catch(e) { /* silently fail */ }
}

// --- Polling ---
function startMsgPolling() {
    stopMsgPolling();
    msgPollingInterval = setInterval(async () => {
        try {
            const data = await apiCall('messaging.php?action=conversations', 'GET');
            if (data?.success && Array.isArray(data.conversations)) {
                const oldConvId = msgCurrentConvId;
                msgConversations = data.conversations;
                
                // Vérifier si la conversation ouverte existe encore
                if (oldConvId) {
                    const stillExists = msgConversations.find(c => String(c.id) === String(oldConvId));
                    if (!stillExists) {
                        // Conversation supprimée par un autre utilisateur
                        msgCurrentConvId = null;
                        msgCurrentMessages = [];
                        document.getElementById('msgGroupInfoPanel').classList.remove('visible');
                        document.getElementById('msgChatHeader').style.display = 'none';
                        document.getElementById('msgChatMessages').style.display = 'none';
                        document.getElementById('msgComposer').style.display = 'none';
                        document.getElementById('msgChatEmpty').style.display = '';
                    } else if (stillExists.lastMessageAt !== (msgConversations.find(c => String(c.id) === String(oldConvId))?.lastMessageAt)) {
                        // Nouveaux messages dans la conversation ouverte
                        await loadMessages(oldConvId);
                        markConversationRead(oldConvId);
                    }
                }
                
                renderConversationList();
                updateMsgBadges();
                if (msgCurrentConvId) {
                    const current = msgConversations.find(c => String(c.id) === String(msgCurrentConvId));
                    if (current && current.unreadCount > 0) {
                        await loadMessages(msgCurrentConvId);
                        markConversationRead(msgCurrentConvId);
                    }
                }
            }
        } catch(e) { /* silently fail */ }
    }, 5000);
}

function stopMsgPolling() {
    if (msgPollingInterval) {
        clearInterval(msgPollingInterval);
        msgPollingInterval = null;
    }
}

// --- Badges ---
function setMsgBadgeVisibility(el, count) {
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-flex' : 'none';
}

function updateMsgBadges() {
    const total = msgConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    setMsgBadgeVisibility(document.getElementById('msgNavBadge'), total);
    setMsgBadgeVisibility(document.getElementById('msgHomeBadge'), total);
    setMsgBadgeVisibility(document.getElementById('homeMessagesUnreadBadge'), total);
    setMsgBadgeVisibility(document.getElementById('msgFloatBadge'), total);
    syncMsgFloatCollapseBadge(total);

    const homeIndicatorMessages = document.getElementById('homeIndicatorMessagesCount');
    if (homeIndicatorMessages) {
        homeIndicatorMessages.textContent = total;
        const indicator = document.getElementById('homeIndicatorMessages');
        if (indicator) indicator.classList.toggle('has-unread', total > 0);
    }

    if (typeof renderHomeMessagesWidget === 'function') renderHomeMessagesWidget();
}

// --- Panneau info groupe ---
function toggleGroupInfoPanel() {
    const panel = document.getElementById('msgGroupInfoPanel');
    panel.classList.toggle('visible');
    
    if (panel.classList.contains('visible')) {
        const conv = msgConversations.find(c => String(c.id) === String(msgCurrentConvId));
        if (conv) renderGroupInfoPanel(conv);
    }
}

function renderGroupInfoPanel(conv) {
    document.getElementById('msgGroupInfoName').textContent = conv.name || 'Groupe';
    document.getElementById('msgGroupInfoCount').textContent = `${(conv.members || []).length} membres`;
    
    const membersEl = document.getElementById('msgGroupInfoMembers');
    if (membersEl && conv.members) {
        membersEl.innerHTML = conv.members.map(m => {
            const name = m.name || m.username || 'Utilisateur';
            const initials = getMsgInitials(name);
            const role = m.role === 'admin' ? 'Créateur' : '';
            return `<div class="msg-group-member-item">
                <div class="msg-group-member-avatar" style="background: ${stringToColor(name)};">${initials}</div>
                <div>
                    <div class="msg-group-member-name">${escHtml(name)}</div>
                    ${role ? `<div class="msg-group-member-role">${role}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }
}

// --- Nouvelle conversation ---
function openNewConversationModal() {
    try {
        msgNewConvType = 'dm';
        msgNewConvSelectedUsers = [];
        const modal = document.getElementById('newConvModal');
        if (!modal) {
            console.warn('openNewConversationModal: newConvModal introuvable');
            return;
        }
        // Déplacer la modale dans body pour garantir sa visibilité
        if (modal.parentNode !== document.body) {
            document.body.appendChild(modal);
        }
        const groupName = document.getElementById('newConvGroupName');
        const searchUser = document.getElementById('newConvSearchUser');
        const groupWrap = document.getElementById('newConvGroupNameWrap');
        const typeDm = document.getElementById('newConvTypeDm');
        const typeGroup = document.getElementById('newConvTypeGroup');
        const startBtn = document.getElementById('newConvStartBtn');
        const selectedUsers = document.getElementById('newConvSelectedUsers');
        if (groupName) groupName.value = '';
        if (searchUser) searchUser.value = '';
        if (groupWrap) groupWrap.style.display = 'none';
        if (typeDm) typeDm.classList.add('active');
        if (typeGroup) typeGroup.classList.remove('active');
        if (startBtn) startBtn.disabled = true;
        if (selectedUsers) selectedUsers.innerHTML = '';
        modal.classList.add('active');
        // Forcer l'affichage de la modale (au-dessus de la page messagerie z-index 99999)
        Object.assign(modal.style, {
            display: 'flex',
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            zIndex: '100002',
            visibility: 'visible',
            opacity: '1',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)'
        });
        populateNewConvUserPicker();
    } catch (e) {
        console.error('openNewConversationModal erreur:', e);
    }
}

function closeNewConvModal() {
    const modal = document.getElementById('newConvModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.cssText = '';
    }
}

function switchNewConvType(type) {
    msgNewConvType = type;
    msgNewConvSelectedUsers = [];
    document.getElementById('newConvSelectedUsers').innerHTML = '';
    document.getElementById('newConvGroupNameWrap').style.display = type === 'group' ? '' : 'none';
    document.getElementById('newConvTypeDm').classList.toggle('active', type === 'dm');
    document.getElementById('newConvTypeGroup').classList.toggle('active', type === 'group');
    document.getElementById('newConvStartBtn').disabled = true;
    populateNewConvUserPicker();
}

async function populateNewConvUserPicker(filter = '') {
    let users = [];
    try {
        if (typeof loadUsersForAssignments === 'function') {
            users = await loadUsersForAssignments();
        }
        if (!Array.isArray(users)) users = [];
    } catch (e) { console.warn('populateNewConvUserPicker:', e); }
    const uid = String(currentUser?.id || '');
    const q = filter.toLowerCase().trim();
    const picker = document.getElementById('newConvUserPicker');
    if (!picker) return;
    
    const filtered = users.filter(u => {
        if (String(u.id) === uid) return false;
        if (!q) return true;
        const name = `${u.prenom || ''} ${u.nom || u.username || ''}`.toLowerCase();
        return name.includes(q) || (u.email || '').toLowerCase().includes(q);
    });
    
    picker.innerHTML = filtered.map(u => {
        const name = `${u.prenom || ''} ${u.nom || u.username || ''}`.trim();
        const initials = getMsgInitials(name);
        const role = u.role_professionnel || u.role || '';
        const selected = msgNewConvSelectedUsers.some(s => String(s.id) === String(u.id));
        return `<div class="msg-user-pick-item ${selected ? 'selected' : ''}" onclick="toggleNewConvUser(${u.id}, '${escHtml(name)}')">
            <div class="msg-user-pick-avatar" style="background: ${stringToColor(name)};">${initials}</div>
            <div class="msg-user-pick-info">
                <div class="msg-user-pick-name">${escHtml(name)}</div>
                <div class="msg-user-pick-role">${escHtml(role)}</div>
            </div>
            <div class="msg-user-pick-check">${selected ? '✓' : ''}</div>
        </div>`;
    }).join('') || '<div style="padding: 1.5rem; text-align: center; color: #a0aec0;">Aucun utilisateur trouvé</div>';
}

function toggleNewConvUser(userId, name) {
    const idx = msgNewConvSelectedUsers.findIndex(u => String(u.id) === String(userId));
    
    if (idx >= 0) {
        msgNewConvSelectedUsers.splice(idx, 1);
    } else {
        if (msgNewConvType === 'dm') {
            msgNewConvSelectedUsers = [{ id: userId, name }];
        } else {
            msgNewConvSelectedUsers.push({ id: userId, name });
        }
    }
    
    renderNewConvSelectedTags();
    populateNewConvUserPicker(document.getElementById('newConvSearchUser')?.value || '');
    document.getElementById('newConvStartBtn').disabled = msgNewConvSelectedUsers.length === 0;
}

function renderNewConvSelectedTags() {
    const container = document.getElementById('newConvSelectedUsers');
    if (!container) return;
    container.innerHTML = msgNewConvSelectedUsers.map(u =>
        `<div class="msg-selected-tag">
            ${escHtml(u.name)}
            <button class="msg-selected-tag-remove" onclick="event.stopPropagation(); toggleNewConvUser(${u.id}, '${escHtml(u.name)}')">✕</button>
        </div>`
    ).join('');
}

function filterNewConvUsers(value) {
    populateNewConvUserPicker(value);
}

async function startNewConversation() {
    if (msgNewConvSelectedUsers.length === 0) return;
    
    const body = {
        action: 'create_conversation',
        type: msgNewConvType,
        memberIds: msgNewConvSelectedUsers.map(u => u.id),
        name: msgNewConvType === 'group' ? (document.getElementById('newConvGroupName')?.value || 'Groupe').trim() : null
    };
    
    try {
        const data = await apiCall('messaging.php', 'POST', body);
        if (data?.success && data.conversation) {
            closeNewConvModal();
            // Ajouter au début si pas déjà présent
            if (!msgConversations.find(c => String(c.id) === String(data.conversation.id))) {
                msgConversations.unshift(data.conversation);
            }
            renderConversationList();
            openConversation(data.conversation.id);
        }
    } catch(e) {
        console.error('Messaging: Erreur création conversation', e);
    }
}

// --- Ajouter membres ---
function openAddMembersModal() {
    msgAddMemberSelectedUsers = [];
    document.getElementById('addMemberSearchUser').value = '';
    document.getElementById('addMemberSelectedUsers').innerHTML = '';
    document.getElementById('addMemberConfirmBtn').disabled = true;
    document.getElementById('addMembersModal').classList.add('active');
    populateAddMemberUserPicker();
}

function closeAddMembersModal() {
    document.getElementById('addMembersModal').classList.remove('active');
}

async function populateAddMemberUserPicker(filter = '') {
    const users = await loadUsersForAssignments();
    const uid = String(currentUser?.id || '');
    const conv = msgConversations.find(c => String(c.id) === String(msgCurrentConvId));
    const existingIds = (conv?.members || []).map(m => String(m.id || m));
    const q = filter.toLowerCase().trim();
    const picker = document.getElementById('addMemberUserPicker');
    if (!picker) return;
    
    const filtered = users.filter(u => {
        if (String(u.id) === uid) return false;
        if (existingIds.includes(String(u.id))) return false;
        if (!q) return true;
        const name = `${u.prenom || ''} ${u.nom || u.username || ''}`.toLowerCase();
        return name.includes(q);
    });
    
    picker.innerHTML = filtered.map(u => {
        const name = `${u.prenom || ''} ${u.nom || u.username || ''}`.trim();
        const initials = getMsgInitials(name);
        const selected = msgAddMemberSelectedUsers.some(s => String(s.id) === String(u.id));
        return `<div class="msg-user-pick-item ${selected ? 'selected' : ''}" onclick="toggleAddMemberUser(${u.id}, '${escHtml(name)}')">
            <div class="msg-user-pick-avatar" style="background: ${stringToColor(name)};">${initials}</div>
            <div class="msg-user-pick-info">
                <div class="msg-user-pick-name">${escHtml(name)}</div>
            </div>
            <div class="msg-user-pick-check">${selected ? '✓' : ''}</div>
        </div>`;
    }).join('') || '<div style="padding: 1.5rem; text-align: center; color: #a0aec0;">Aucun utilisateur disponible</div>';
}

function toggleAddMemberUser(userId, name) {
    const idx = msgAddMemberSelectedUsers.findIndex(u => String(u.id) === String(userId));
    if (idx >= 0) msgAddMemberSelectedUsers.splice(idx, 1);
    else msgAddMemberSelectedUsers.push({ id: userId, name });
    
    document.getElementById('addMemberSelectedUsers').innerHTML = msgAddMemberSelectedUsers.map(u =>
        `<div class="msg-selected-tag">${escHtml(u.name)}
            <button class="msg-selected-tag-remove" onclick="event.stopPropagation(); toggleAddMemberUser(${u.id}, '${escHtml(u.name)}')">✕</button>
        </div>`
    ).join('');
    populateAddMemberUserPicker(document.getElementById('addMemberSearchUser')?.value || '');
    document.getElementById('addMemberConfirmBtn').disabled = msgAddMemberSelectedUsers.length === 0;
}

function filterAddMemberUsers(value) {
    populateAddMemberUserPicker(value);
}

async function confirmAddMembers() {
    if (msgAddMemberSelectedUsers.length === 0 || !msgCurrentConvId) return;
    try {
        await apiCall('messaging.php', 'POST', {
            action: 'add_members',
            conversationId: msgCurrentConvId,
            memberIds: msgAddMemberSelectedUsers.map(u => u.id)
        });
        closeAddMembersModal();
        await loadConversations();
        const conv = msgConversations.find(c => String(c.id) === String(msgCurrentConvId));
        if (conv) renderGroupInfoPanel(conv);
    } catch(e) {
        console.error('Messaging: Erreur ajout membres', e);
    }
}

// --- Quitter conversation ---
async function confirmLeaveConversation() {
    if (!msgCurrentConvId) return;
    if (!confirm('Êtes-vous sûr de vouloir quitter ce groupe ?')) return;
    try {
        await apiCall('messaging.php', 'POST', { action: 'leave_conversation', conversationId: msgCurrentConvId });
        msgCurrentConvId = null;
        document.getElementById('msgGroupInfoPanel').classList.remove('visible');
        document.getElementById('msgChatHeader').style.display = 'none';
        document.getElementById('msgChatMessages').style.display = 'none';
        document.getElementById('msgComposer').style.display = 'none';
        document.getElementById('msgChatEmpty').style.display = '';
        await loadConversations();
    } catch(e) {
        console.error('Messaging: Erreur quitter conversation', e);
    }
}

async function confirmDeleteConversation(convId) {
    const targetId = convId || msgCurrentConvId;
    if (!targetId) return;
    
    const conv = msgConversations.find(c => String(c.id) === String(targetId));
    const convName = conv ? getMsgConvDisplayName(conv) : 'cette conversation';
    
    if (!confirm(`Supprimer la conversation avec ${convName} ?\n\nTous les messages seront définitivement supprimés pour tous les participants.`)) return;
    
    try {
        const data = await apiCall('messaging.php', 'POST', { action: 'delete_conversation', conversationId: targetId });
        
        // Si c'était la conversation ouverte, fermer le chat
        if (String(msgCurrentConvId) === String(targetId)) {
            msgCurrentConvId = null;
            document.getElementById('msgGroupInfoPanel').classList.remove('visible');
            document.getElementById('msgChatHeader').style.display = 'none';
            document.getElementById('msgChatMessages').style.display = 'none';
            document.getElementById('msgComposer').style.display = 'none';
            document.getElementById('msgChatEmpty').style.display = '';
        }
        
        // Recharger la liste complète depuis le serveur
        await loadConversations();
    } catch(e) {
        console.error('Messaging: Erreur suppression conversation', e);
        alert('Erreur lors de la suppression de la conversation.');
    }
}

// --- Utilitaires messagerie ---
function getMsgConvDisplayName(conv) {
    if (conv.type === 'group') return conv.name || 'Groupe';
    // DM : afficher le nom de l'autre personne
    const uid = String(currentUser?.id || '');
    if (conv.members) {
        const other = conv.members.find(m => String(m.id || m) !== uid);
        if (other) return other.name || other.username || 'Utilisateur';
    }
    return conv.name || 'Conversation';
}

function getMsgInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function getShortName(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    return parts[0] || name;
}

function stringToColor(str) {
    if (!str) return '#667eea';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#667eea', '#764ba2', '#e94560', '#00b894', '#fdcb6e', '#6c5ce7', '#00cec9', '#e17055', '#0984e3', '#d63031'];
    return colors[Math.abs(hash) % colors.length];
}

function formatMsgTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    
    if (diff < 60000) return 'À l\'instant';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min';
    if (diff < 86400000 && d.getDate() === now.getDate()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diff < 172800000) return 'Hier';
    if (diff < 604800000) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

// --- Mentions d'entités (prospect, dossier, tâche, projet, note…) ---
let msgMentionActive = null;
let msgMentionInputEl = null;
let msgMentionResults = [];
let msgMentionSelectedIndex = 0;
let msgMentionSearchTimer = null;

const MSG_MENTION_TOKEN_RE = /\{\{mn:([^:{}]+):([^:{}]*):([^}]+)\}\}/g;

function buildMsgMentionToken(type, payload, label) {
    return '{{mn:' + type + ':' + payload + ':' + encodeURIComponent(label || '') + '}}';
}

function stripMsgMentions(text) {
    if (!text) return '';
    return text.replace(MSG_MENTION_TOKEN_RE, function(_, type, payload, enc) {
        try { return decodeURIComponent(enc); } catch (e) { return enc; }
    });
}

function getMsgMentionQuery(textarea) {
    if (!textarea) return null;
    const val = textarea.value;
    const pos = textarea.selectionStart ?? val.length;
    const before = val.slice(0, pos);
    const match = before.match(/@([^\s@{}]{0,48})$/);
    if (!match) return null;
    return { query: match[1], start: pos - match[0].length, end: pos };
}

function getMentionQueryFromField(el) {
    if (!el) return null;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return getMsgMentionQuery(el);
    if (el.isContentEditable) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.startContainer)) return null;
        const preRange = document.createRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.startContainer, range.startOffset);
        const before = preRange.toString();
        const match = before.match(/@([^\s@{}]{0,48})$/);
        if (!match) return null;
        return { query: match[1], start: before.length - match[0].length, end: before.length, contentEditable: true };
    }
    return null;
}

function getContentEditableRangeAtOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    let count = 0;
    while ((node = walker.nextNode())) {
        const len = node.textContent.length;
        if (count + len >= offset) return { node: node, offset: offset - count };
        count += len;
    }
    if (root.lastChild && root.lastChild.nodeType === Node.TEXT_NODE) {
        return { node: root.lastChild, offset: root.lastChild.textContent.length };
    }
    return { node: root, offset: 0 };
}

function insertMentionTokenInContentEditable(el, token) {
    const active = msgMentionActive;
    if (!active || active.start == null || active.end == null) return;
    const startPos = getContentEditableRangeAtOffset(el, active.start);
    const endPos = getContentEditableRangeAtOffset(el, active.end);
    if (!startPos || !endPos) return;
    const deleteRange = document.createRange();
    deleteRange.setStart(startPos.node, startPos.offset);
    deleteRange.setEnd(endPos.node, endPos.offset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(deleteRange);
    const spacer = active.start > 0 ? ' ' : '';
    document.execCommand('insertText', false, spacer + token + ' ');
    syncMentionChipsInContentEditable(el);
}

function closeMsgMentionPicker() {
    msgMentionActive = null;
    msgMentionInputEl = null;
    msgMentionResults = [];
    msgMentionSelectedIndex = 0;
    ['msgMentionPicker', 'msgFloatMentionPicker', 'appMentionPicker'].forEach(function(id) {
        const picker = document.getElementById(id);
        if (picker) { picker.style.display = 'none'; picker.innerHTML = ''; }
    });
}

function getMsgMentionPickerEl() {
    const el = msgMentionInputEl;
    if (!el) return document.getElementById('msgMentionPicker');
    if (el.id === 'msgFloatInput') return document.getElementById('msgFloatMentionPicker');
    if (el.id === 'msgInput') return document.getElementById('msgMentionPicker');
    return document.getElementById('appMentionPicker');
}

function isMentionPickerOpen() {
    if (!msgMentionActive) return false;
    const picker = getMsgMentionPickerEl();
    return picker && picker.style.display !== 'none';
}

function positionMentionPicker() {
    const picker = getMsgMentionPickerEl();
    const el = msgMentionInputEl;
    if (!picker || !el || picker.style.display === 'none') return;
    const rect = el.getBoundingClientRect();
    if (picker.id === 'appMentionPicker') {
        picker.style.position = 'fixed';
        picker.style.right = 'auto';
        picker.style.bottom = 'auto';
        picker.style.zIndex = '100080';
        picker.style.width = Math.min(320, Math.max(260, rect.width)) + 'px';
        picker.style.left = Math.min(Math.max(8, rect.left), window.innerWidth - 330) + 'px';
        const measure = function() {
            const pickerH = picker.offsetHeight || 220;
            let top = rect.top - pickerH - 8;
            if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - pickerH - 8);
            picker.style.top = Math.max(8, top) + 'px';
        };
        measure();
        requestAnimationFrame(measure);
    } else {
        picker.style.position = '';
        picker.style.top = '';
        picker.style.left = '';
        picker.style.width = '';
        picker.style.right = '';
        picker.style.bottom = '';
    }
}

function ensureAppMentionPickerInBody() {
    const picker = document.getElementById('appMentionPicker');
    if (picker && picker.parentNode !== document.body) {
        document.body.appendChild(picker);
    }
    if (!window._mentionPickerRepositionBound) {
        window._mentionPickerRepositionBound = true;
        window.addEventListener('scroll', function() {
            if (isMentionPickerOpen() && getMsgMentionPickerEl()?.id === 'appMentionPicker') positionMentionPicker();
        }, true);
        window.addEventListener('resize', function() {
            if (isMentionPickerOpen() && getMsgMentionPickerEl()?.id === 'appMentionPicker') positionMentionPicker();
        });
    }
}

function openMsgMentionPickerManual() {
    openAppMentionPicker(getMsgComposerEls().input || document.getElementById('msgInput'));
}

async function msgSearchMentionEntities(query, maxResults) {
    const q = (query || '').toLowerCase().trim();
    if (q.length < 1) return [];
    const results = [];
    const seen = {};

    function push(key, item) {
        if (seen[key]) return;
        seen[key] = true;
        results.push(item);
    }

    try {
        if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    } catch (e) { /* ignore */ }
    try {
        if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
    } catch (e) { /* ignore */ }
    try {
        if (typeof loadMyBureauData === 'function') await loadMyBureauData();
    } catch (e) { /* ignore */ }

    const crm = typeof crmData !== 'undefined' ? crmData : null;
    if (crm && typeof hasCrmListAccess === 'function' && typeof hasCrmAccess === 'function' && hasCrmAccess()) {
        const prospectItems = typeof getAllCrmProspectsUnique === 'function'
            ? getAllCrmProspectsUnique()
            : (crm.lists || []).filter(hasCrmListAccess).flatMap(function(list) {
                return (list.prospects || []).map(function(p) { return { prospect: p, list: list }; });
            });
        const pushProspect = function(p, list) {
            if (typeof findCrmProspect === 'function' && !findCrmProspect(p.id)) return;
            if (typeof ensureProspectShape === 'function') ensureProspectShape(p);
            const structure = typeof getCrmProspectStructure === 'function' ? getCrmProspectStructure(p) : null;
            const personName = typeof getCrmProspectPersonName === 'function'
                ? getCrmProspectPersonName(p)
                : ((p.contactPrenom || '') + ' ' + (p.contactNom || '')).trim();
            const orgName = structure ? (structure.organisme || '') : (p.organisme || '');
            const hay = [
                personName,
                typeof getCrmProspectDisplayName === 'function' ? getCrmProspectDisplayName(p) : '',
                p.contactNom, p.contactPrenom, p.email, p.telFixe, p.telMobile, p.tel, p.ville,
                orgName,
                structure ? structure.ville : '',
                structure ? structure.cp : ''
            ].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return;
            const label = typeof getCrmProspectMentionLabel === 'function'
                ? getCrmProspectMentionLabel(p)
                : (personName || orgName || 'Prospect');
            const subtitle = orgName && personName
                ? ('Prospect · ' + orgName)
                : ('Prospect · ' + (list && list.name ? list.name : 'CRM'));
            push('crm_p_' + p.id, {
                icon: '👤', title: label, subtitle: subtitle,
                token: buildMsgMentionToken('prospect', p.id, label)
            });
        };
        if (typeof getAllCrmProspectsUnique === 'function') {
            prospectItems.forEach(function(p) {
                const found = typeof findCrmProspect === 'function' ? findCrmProspect(p.id) : null;
                pushProspect(p, found ? found.list : null);
            });
        } else {
            prospectItems.forEach(function(item) { pushProspect(item.prospect, item.list); });
        }
        (crm.structures || []).forEach(function(s) {
            const hay = [s.organisme, s.ville, s.typeStructure, s.email].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return;
            const label = s.organisme || 'Structure';
            push('crm_s_' + s.id, {
                icon: '🏛️', title: label, subtitle: 'Structure · CRM',
                token: buildMsgMentionToken('structure', s.id, label)
            });
        });
        (crm.deals || []).forEach(function(d) {
            const hay = [d.title, d.notes, d.description].join(' ').toLowerCase();
            if (hay.indexOf(q) !== -1) {
                const label = d.title || 'Dossier';
                push('crm_d_' + d.id, {
                    icon: '📁', title: label, subtitle: 'Dossier · CRM',
                    token: buildMsgMentionToken('deal', d.id, label)
                });
            }
            (d.internalNotes || []).forEach(function(n) {
                const hayN = [n.title, n.content, n.text].join(' ').toLowerCase();
                if (hayN.indexOf(q) === -1) return;
                const label = n.title || stripHtmlTags(n.content || n.text || '').slice(0, 60) || 'Note';
                const payload = n.activityId
                    ? d.id + '~' + n.activityId + '~' + n.id
                    : d.id + '~' + n.id;
                const type = n.activityId ? 'note_activity' : 'note_crm';
                push('crm_n_' + d.id + '_' + n.id, {
                    icon: '📝', title: label, subtitle: 'Note · ' + (d.title || 'Dossier'),
                    token: buildMsgMentionToken(type, payload, label)
                });
            });
            (d.documents || []).forEach(function(doc) {
                const hayD = [doc.name, doc.fileName, doc.titre].join(' ').toLowerCase();
                if (hayD.indexOf(q) === -1) return;
                const label = doc.name || doc.fileName || 'Document';
                push('crm_doc_' + d.id + '_' + doc.id, {
                    icon: '📎', title: label, subtitle: 'Document · ' + (d.title || 'Dossier'),
                    token: buildMsgMentionToken('doc_crm', d.id + '~' + doc.id, label)
                });
            });
            msgPushTaskDocumentMentions(d.tasks, 'crm_deal', 'crm_' + d.id, d.title || 'Dossier', push, q);
        });
    }

    if (typeof hasWorkProjectsAccess === 'function' && hasWorkProjectsAccess() && typeof workProjectsData !== 'undefined') {
        (workProjectsData.projects || []).filter(function(p) { return !p.archived; }).forEach(function(p) {
            const hay = [p.title, p.description].join(' ').toLowerCase();
            if (hay.indexOf(q) !== -1) {
                push('wp_' + p.id, {
                    icon: p.icon || '📁', title: p.title || 'Projet', subtitle: 'Projet · Espace de travail',
                    token: buildMsgMentionToken('project', p.id, p.title || 'Projet')
                });
            }
            (p.tasks || []).forEach(function(t) {
                if ((t.title || '').toLowerCase().indexOf(q) !== -1) {
                    const label = t.title || 'Tâche';
                    push('wp_t_' + p.id + '_' + t.id, {
                        icon: '✅', title: label, subtitle: 'Tâche · ' + (p.title || 'Projet'),
                        token: buildMsgMentionToken('task', 'work_project~' + p.id + '~' + t.id, label)
                    });
                }
                msgPushTaskDocumentMentions([t], 'work_project', p.id, p.title || 'Projet', push, q);
            });
        });
    }

    if (Array.isArray(window.projects)) {
        window.projects.forEach(function(p) {
            const isSpectacle = !!p.parentId || p.type === 'spectacle';
            const type = isSpectacle ? 'spectacle' : 'tournee';
            const icon = isSpectacle ? '🎪' : '🎭';
            const typeLabel = isSpectacle ? 'Spectacle' : 'Tournée';
            const label = p.name || typeLabel;
            const hayProj = [p.name, p.lieu, p.location, p.city, p.description].join(' ').toLowerCase();
            if (hayProj.indexOf(q) !== -1) {
                push('evt_' + p.id, {
                    icon: icon, title: label, subtitle: typeLabel + ' · Événementiel',
                    token: buildMsgMentionToken(type, p.id, label)
                });
            }
            (p.documents || []).forEach(function(doc) {
                const hayD = [doc.name, doc.titre, doc.fileName, doc.type].join(' ').toLowerCase();
                if (hayD.indexOf(q) === -1) return;
                const docLabel = doc.name || doc.titre || doc.fileName || 'Document';
                push('evt_doc_' + p.id + '_' + doc.id, {
                    icon: '📎', title: docLabel, subtitle: 'Document · ' + label,
                    token: buildMsgMentionToken('doc_evt', p.id + '~' + doc.id, docLabel)
                });
            });
            (p.tasks || []).forEach(function(t) {
                if ((t.title || '').toLowerCase().indexOf(q) !== -1) {
                    const tLabel = t.title || 'Tâche';
                    push('evt_t_' + p.id + '_' + t.id, {
                        icon: '✅', title: tLabel, subtitle: 'Tâche · ' + label,
                        token: buildMsgMentionToken('task', 'event~' + p.id + '~' + t.id, tLabel)
                    });
                }
                msgPushTaskDocumentMentions([t], 'event', p.id, label, push, q);
            });
        });
    }

    const bureau = window.myBureau || { tasks: [] };
    (bureau.tasks || []).forEach(function(t) {
        if ((t.title || '').toLowerCase().indexOf(q) !== -1) {
            const label = t.title || 'Tâche';
            push('bureau_t_' + t.id, {
                icon: '📌', title: label, subtitle: 'Tâche · Mon Bureau',
                token: buildMsgMentionToken('task', 'personal~~' + t.id, label)
            });
        }
        msgPushTaskDocumentMentions([t], 'personal', '', 'Mon Bureau', push, q);
    });

    if (Array.isArray(window.workspaceElements)) {
        const typeLabels = { page: 'Note', idea: 'Idée', mindmap: 'Carte mentale', drawing: 'Dessin', file: 'Fichier', quicknote: 'Note rapide' };
        const icons = { page: '📝', idea: '💡', mindmap: '🧠', drawing: '🎨', file: '📎', quicknote: '📋' };
        window.workspaceElements.forEach(function(el) {
            const hay = [el.title, el.file_name, typeLabels[el.type]].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return;
            const elLabel = el.title || el.file_name || 'Élément';
            if (el.type === 'file') {
                push('ws_doc_' + el.id, {
                    icon: '📎', title: elLabel, subtitle: 'Document · Mon Bureau',
                    token: buildMsgMentionToken('doc_bureau', el.id, elLabel)
                });
            } else {
                push('ws_' + el.id, {
                    icon: icons[el.type] || '📄', title: elLabel, subtitle: (typeLabels[el.type] || el.type) + ' · Mon Bureau',
                    token: buildMsgMentionToken('note_bureau', el.id, elLabel)
                });
            }
        });
    }

    await msgSearchWpWorkspaceDocs(q, push);

    if (typeof comptaJustificatifs !== 'undefined' && Array.isArray(comptaJustificatifs)) {
        const uid = String((typeof currentUser !== 'undefined' && currentUser && currentUser.id) || '');
        const canValidate = typeof canValidateFactures === 'function' && canValidateFactures();
        comptaJustificatifs.forEach(function(j) {
            if (typeof isDepotFacture === 'function' && !isDepotFacture(j)) return;
            if (!canValidate && String(j.deposeParUserId || '') !== uid) return;
            const hay = [j.libelle, j.fournisseur, j.numeroFacture, j.nomFichier, j.commentaire].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return;
            const title = j.libelle || j.fournisseur || j.nomFichier || 'Facture';
            push('facture_' + j.id, {
                icon: '🧾', title: title, subtitle: 'Document · Comptabilité · Facture',
                token: buildMsgMentionToken('doc_compta', String(j.id), title)
            });
        });
    }

    if (typeof catalogueData !== 'undefined' && Array.isArray(catalogueData)) {
        catalogueData.forEach(function(f) {
            const hayF = [f.name, f.genre, f.duree, f.synopsis, f.resume, f.notes].join(' ').toLowerCase();
            if (hayF.indexOf(q) !== -1) {
                push('cat_' + f.id, {
                    icon: '📚', title: f.name || 'Fiche catalogue', subtitle: 'Catalogue · Événementiel',
                    token: buildMsgMentionToken('catalogue_fiche', f.id, f.name || 'Fiche catalogue')
                });
            }
            (f.documents || []).forEach(function(doc) {
                const hay = [doc.name, doc.titre, doc.fileName, f.name].join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return;
                const docLabel = doc.name || doc.titre || doc.fileName || 'Document';
                push('cat_doc_' + f.id + '_' + doc.id, {
                    icon: '📎', title: docLabel, subtitle: 'Document · Catalogue · ' + (f.name || ''),
                    token: buildMsgMentionToken('doc_catalogue', f.id + '~' + doc.id, docLabel)
                });
            });
        });
    }

    if (typeof notesfrais !== 'undefined' && Array.isArray(notesfrais)) {
        const uid = typeof getNdfCurrentUserId === 'function' ? getNdfCurrentUserId() : String((currentUser && currentUser.id) || '');
        const isValidator = typeof hasNdfValidationPermission === 'function' && hasNdfValidationPermission();
        notesfrais.forEach(function(n) {
            if (typeof ndfNoteBelongsToUser === 'function' && !isValidator && !ndfNoteBelongsToUser(n, uid)) return;
            let hay = [n.titre, n.utilisateurNom, n.associationLabel, n.associationTexte].join(' ');
            (n.lignes || []).forEach(function(l) {
                hay += ' ' + (l.description || '') + ' ' + (l.type || '') + ' ' + (l.typeAutre || '');
            });
            if (hay.toLowerCase().indexOf(q) === -1) return;
            const statutLabel = typeof getNdfStatutLabel === 'function' ? getNdfStatutLabel(n.statut) : (n.statut || '');
            push('ndf_' + n.id, {
                icon: '💳', title: n.titre || 'Note de frais', subtitle: 'Comptabilité · Note de frais · ' + statutLabel,
                token: buildMsgMentionToken('ndf', String(n.id), n.titre || 'Note de frais')
            });
        });
    }

    const limit = maxResults || 15;
    return results.slice(0, limit);
}

function msgPushTaskDocumentMentions(tasks, source, projectId, parentLabel, push, q) {
    (tasks || []).forEach(function(t) {
        (t.documents || []).forEach(function(doc) {
            const hay = [doc.name, doc.fileName, t.title, parentLabel].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return;
            const label = doc.name || doc.fileName || 'Document';
            push('tdoc_' + source + '_' + projectId + '_' + t.id + '_' + doc.id, {
                icon: '📎', title: label, subtitle: 'Document · ' + (t.title || parentLabel),
                token: buildMsgMentionToken('doc_task', source + '~' + (projectId || '') + '~' + t.id + '~' + doc.id, label)
            });
        });
    });
}

async function msgSearchWpWorkspaceDocs(q, push) {
    if (typeof hasWorkProjectsAccess !== 'function' || !hasWorkProjectsAccess()) return;
    if (typeof workProjectsData === 'undefined' || !workProjectsData.projects) return;
    const projects = (workProjectsData.projects || []).filter(function(p) { return !p.archived; }).slice(0, 20);
    await Promise.all(projects.map(async function(p) {
        try {
            const res = await apiCall('workspace.php?visibility=team&project_id=' + encodeURIComponent(p.id), 'GET');
            (res && res.elements ? res.elements : []).forEach(function(el) {
                if (el.type !== 'file') return;
                const hay = [el.title, el.file_name, p.title].join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return;
                const label = el.title || el.file_name || 'Document';
                push('wp_doc_' + p.id + '_' + el.id, {
                    icon: '📎', title: label, subtitle: 'Document · ' + (p.title || 'Projet'),
                    token: buildMsgMentionToken('doc_wp', p.id + '~' + el.id, label)
                });
            });
        } catch (e) { /* ignore */ }
    }));
}

async function msgFindTaskDocument(source, projectId, taskId, docId) {
    let task = null;
    if (source === 'crm_deal') {
        if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
        const dealId = String(projectId || '').replace(/^crm_/, '');
        const deal = typeof getCrmDealById === 'function' ? getCrmDealById(dealId) : null;
        task = (deal && deal.tasks || []).find(function(t) { return String(t.id) === String(taskId); });
    } else if (source === 'work_project') {
        if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
        const p = typeof getWorkProjectById === 'function' ? getWorkProjectById(projectId) : null;
        task = (p && p.tasks || []).find(function(t) { return String(t.id) === String(taskId); });
    } else if (source === 'personal') {
        if (typeof loadMyBureauData === 'function') await loadMyBureauData();
        task = ((window.myBureau && window.myBureau.tasks) || []).find(function(t) { return String(t.id) === String(taskId); });
    } else if (source === 'event') {
        const p = typeof getProjectById === 'function' ? getProjectById(projectId) : (window.projects || []).find(function(x) { return String(x.id) === String(projectId); });
        task = (p && p.tasks || []).find(function(t) { return String(t.id) === String(taskId); });
    }
    if (!task || !task.documents) return null;
    return task.documents.find(function(d) { return String(d.id) === String(docId); }) || null;
}

function msgOpenDocumentUrl(url) {
    if (!url) return false;
    window.open(url, '_blank', 'noopener');
    return true;
}

function stripHtmlTags(html) {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || d.innerText || '').trim();
}

function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
}

function decodeMentionLabel(enc) {
    try { return decodeURIComponent(enc); } catch (e) { return enc; }
}

function renderMentionChipHtml(type, payload, label, token) {
    const fullToken = token || buildMsgMentionToken(type, payload, label);
    return '<span class="msg-mention-chip" contenteditable="false" data-mention-token="' + escAttr(fullToken) + '">' +
        '<button type="button" class="msg-mention-link" data-mention-type="' + escAttr(type) + '" data-mention-payload="' + escAttr(payload) + '" onclick="openMsgEntityMention(this.dataset.mentionType, this.dataset.mentionPayload)">' + escHtml(label) + '</button></span>';
}

function replaceMentionTokensWithChips(textOrHtml) {
    if (!textOrHtml) return '';
    const re = new RegExp(MSG_MENTION_TOKEN_RE.source, 'g');
    return textOrHtml.replace(re, function(full, type, payload, enc) {
        return renderMentionChipHtml(type, payload, decodeMentionLabel(enc), full);
    });
}

function extractMentionTokensFromHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('.msg-mention-chip[data-mention-token]').forEach(function(chip) {
        chip.replaceWith(document.createTextNode(chip.getAttribute('data-mention-token') || ''));
    });
    div.querySelectorAll('.msg-mention-link[data-mention-type]').forEach(function(btn) {
        if (btn.closest('.msg-mention-chip[data-mention-token]')) return;
        const token = buildMsgMentionToken(btn.dataset.mentionType, btn.dataset.mentionPayload, btn.textContent.trim());
        btn.replaceWith(document.createTextNode(token));
    });
    return div.innerHTML;
}

function syncMentionChipsInContentEditable(el) {
    if (!el || !el.isContentEditable) return;
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function(textNode) {
        const text = textNode.textContent;
        if (!text || text.indexOf('{{mn:') === -1) return;
        const re = new RegExp(MSG_MENTION_TOKEN_RE.source, 'g');
        if (!re.test(text)) return;
        const wrapper = document.createElement('span');
        wrapper.innerHTML = replaceMentionTokensWithChips(text);
        const parent = textNode.parentNode;
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, textNode);
        parent.removeChild(textNode);
    });
}

function renderMsgMentionPicker(items) {
    const picker = getMsgMentionPickerEl();
    if (!picker) return;
    msgMentionResults = items || [];
    if (!msgMentionActive) { closeMsgMentionPicker(); return; }

    if (!msgMentionResults.length) {
        picker.innerHTML = '<div class="msg-mention-picker-header">Mentionner</div>' +
            '<div class="msg-mention-empty">' + (msgMentionActive.query ? 'Aucun résultat' : 'Tapez après @ pour rechercher') + '</div>';
        picker.style.display = 'block';
        positionMentionPicker();
        return;
    }

    if (msgMentionSelectedIndex >= msgMentionResults.length) msgMentionSelectedIndex = 0;

    picker.innerHTML = '<div class="msg-mention-picker-header">Mentionner</div>' +
        msgMentionResults.map(function(item, i) {
            return '<button type="button" class="msg-mention-item' + (i === msgMentionSelectedIndex ? ' active' : '') + '" data-idx="' + i + '" onmousedown="event.preventDefault()" onclick="msgMentionSelectIndex(' + i + ')">' +
                '<span class="msg-mention-item-icon">' + item.icon + '</span>' +
                '<span class="msg-mention-item-body">' +
                '<span class="msg-mention-item-title">' + escHtml(item.title) + '</span>' +
                '<span class="msg-mention-item-sub">' + escHtml(item.subtitle) + '</span>' +
                '</span></button>';
        }).join('');
    picker.style.display = 'block';
    positionMentionPicker();
}

function scheduleMsgMentionSearch(query) {
    clearTimeout(msgMentionSearchTimer);
    msgMentionSearchTimer = setTimeout(async function() {
        const items = await msgSearchMentionEntities(query);
        if (!msgMentionActive || msgMentionActive.query !== query) return;
        renderMsgMentionPicker(items);
    }, 180);
}

function handleMsgMentionInput(field) {
    msgMentionInputEl = field;
    const info = getMentionQueryFromField(field);
    if (!info) {
        closeMsgMentionPicker();
        return;
    }
    msgMentionActive = info;
    msgMentionSelectedIndex = 0;
    if (info.query.length === 0) {
        renderMsgMentionPicker([]);
        return;
    }
    scheduleMsgMentionSearch(info.query);
}

function msgMentionSelectIndex(index) {
    const item = msgMentionResults[index];
    if (!item || !msgMentionActive) return;
    insertMsgMentionToken(item.token);
}

function insertMsgMentionToken(token) {
    const input = msgMentionInputEl || getMsgComposerEls().input;
    if (!input || !msgMentionActive) return;
    if (input.isContentEditable) {
        insertMentionTokenInContentEditable(input, token);
        closeMsgMentionPicker();
        syncMentionChipsInContentEditable(input);
        input.focus();
        if (input.id === 'msgInput' || input.id === 'msgFloatInput') autoResizeMsgInput(input);
        return;
    }
    const before = input.value.slice(0, msgMentionActive.start);
    const after = input.value.slice(msgMentionActive.end);
    const spacer = before && !/\s$/.test(before) ? ' ' : '';
    input.value = before + spacer + token + ' ' + after;
    const cursor = (before + spacer + token + ' ').length;
    input.selectionStart = input.selectionEnd = cursor;
    closeMsgMentionPicker();
    if (input.id === 'msgInput' || input.id === 'msgFloatInput') autoResizeMsgInput(input);
    input.focus();
}

function handleAppMentionKeydown(e) {
    const pickerOpen = isMentionPickerOpen();
    if (pickerOpen && msgMentionResults.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); msgMentionMoveSelection(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); msgMentionMoveSelection(-1); return; }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); msgMentionSelectIndex(msgMentionSelectedIndex); return; }
    }
    if (e.key === 'Escape' && msgMentionActive) {
        e.preventDefault();
        closeMsgMentionPicker();
    }
}

function openAppMentionPicker(el) {
    if (!el) return;
    ensureAppMentionPickerInBody();
    el.focus();
    if (el.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) document.execCommand('insertText', false, '@');
    } else {
        const pos = el.selectionStart ?? el.value.length;
        const before = el.value.slice(0, pos);
        const after = el.value.slice(pos);
        if (!before.endsWith('@')) {
            el.value = before + '@' + after;
            el.selectionStart = el.selectionEnd = pos + 1;
        }
    }
    handleMsgMentionInput(el);
}

function initAppMentionField(el) {
    if (!el || el.dataset.mentionInit === '1') return;
    el.dataset.mentionInit = '1';
    ensureAppMentionPickerInBody();
    const onInput = function() {
        handleMsgMentionInput(el);
        if (el.isContentEditable && typeof syncMentionChipsInContentEditable === 'function') {
            syncMentionChipsInContentEditable(el);
        }
    };
    el.addEventListener('input', onInput);
    if (el.dataset.mentionSkipKeydown !== '1') {
        el.addEventListener('keydown', handleAppMentionKeydown);
    }
    if (el.isContentEditable) {
        el.addEventListener('keyup', onInput);
    }
}

function initAllMentionFields(root) {
    ensureAppMentionPickerInBody();
    (root || document).querySelectorAll('[data-mention-field]').forEach(initAppMentionField);
}

function msgMentionMoveSelection(delta) {
    if (!msgMentionResults.length) return;
    msgMentionSelectedIndex = (msgMentionSelectedIndex + delta + msgMentionResults.length) % msgMentionResults.length;
    renderMsgMentionPicker(msgMentionResults);
}

async function openMsgEntityMention(type, payload) {
    if (!type || payload == null) return;
    try {
        if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    } catch (e) { /* ignore */ }

    const openCrm = function(fn) {
        if (typeof openCrmPage === 'function') openCrmPage();
        setTimeout(fn, 200);
    };

    switch (type) {
        case 'prospect':
            openCrm(function() { if (typeof openCrmProspectFiche === 'function') openCrmProspectFiche(payload); });
            break;
        case 'deal':
            openCrm(function() { if (typeof openCrmDealFiche === 'function') openCrmDealFiche(payload); });
            break;
        case 'structure':
            openCrm(function() { if (typeof openCrmStructureFiche === 'function') openCrmStructureFiche(payload); });
            break;
        case 'project':
            if (typeof openWorkProjectsListPage === 'function') openWorkProjectsListPage();
            setTimeout(function() {
                if (typeof openWorkProjectPage === 'function') openWorkProjectPage(payload);
            }, 200);
            break;
        case 'task': {
            const parts = String(payload).split('~');
            const source = parts[0] || '';
            const projectId = parts[1] || '';
            const taskId = parts[2] || '';
            if (source === 'event') {
                const p = typeof getProjectById === 'function' ? getProjectById(projectId) : null;
                const isSpectacle = p && (!!p.parentId || p.type === 'spectacle');
                if (typeof closeAllPages === 'function') closeAllPages();
                if (isSpectacle && typeof viewSpectacle === 'function') viewSpectacle(projectId);
                else if (typeof viewTournee === 'function') viewTournee(projectId);
                setTimeout(function() {
                    if (typeof openTaskDetailModal === 'function') openTaskDetailModal(projectId, taskId);
                }, 300);
            } else if (typeof openTaskFiche === 'function') {
                openTaskFiche(source, projectId, taskId);
            }
            break;
        }
        case 'note_crm': {
            const parts = String(payload).split('~');
            const dealId = parts[0];
            const noteId = parts[1];
            openCrm(function() {
                if (typeof openCrmDealFiche === 'function') openCrmDealFiche(dealId);
                setTimeout(function() {
                    if (typeof openCrmDealNotesPage === 'function') openCrmDealNotesPage(noteId);
                }, 250);
            });
            break;
        }
        case 'note_activity': {
            const parts = String(payload).split('~');
            const dealId = parts[0];
            const activityId = parts[1];
            const noteId = parts[2];
            openCrm(function() {
                if (typeof openCrmDealFiche === 'function') openCrmDealFiche(dealId);
                setTimeout(function() {
                    if (typeof openCrmDealActivityNoteModal === 'function') openCrmDealActivityNoteModal(activityId, noteId);
                }, 300);
            });
            break;
        }
        case 'note_bureau':
            await msgOpenBureauWorkspaceMention(payload, 'note');
            break;
        case 'doc_bureau':
            await msgOpenBureauWorkspaceMention(payload, 'file');
            break;
        case 'tournee':
            if (typeof openEvenementielHomePage === 'function') openEvenementielHomePage();
            setTimeout(function() { if (typeof viewTournee === 'function') viewTournee(payload); }, 200);
            break;
        case 'spectacle':
            if (typeof openEvenementielHomePage === 'function') openEvenementielHomePage();
            setTimeout(function() { if (typeof viewSpectacle === 'function') viewSpectacle(payload); }, 200);
            break;
        case 'doc_crm': {
            const parts = String(payload).split('~');
            if (typeof openCrmDealDocumentMention === 'function') {
                openCrmDealDocumentMention(parts[0], parts[1]);
            } else {
                openCrm(function() {
                    if (typeof openCrmDealFiche === 'function') openCrmDealFiche(parts[0]);
                    setTimeout(function() {
                        if (typeof openCrmDealDocumentsPage === 'function') openCrmDealDocumentsPage();
                    }, 280);
                });
            }
            break;
        }
        case 'doc_evt': {
            const parts = String(payload).split('~');
            const projectId = parts[0];
            const docId = parts[1];
            const p = typeof getProjectById === 'function' ? getProjectById(projectId) : (window.projects || []).find(function(x) { return String(x.id) === String(projectId); });
            const doc = p && (p.documents || []).find(function(d) { return String(d.id) === String(docId); });
            if (doc && msgOpenDocumentUrl(doc.downloadUrl || doc.url)) break;
            if (typeof closeAllPages === 'function') closeAllPages();
            const isSpectacle = p && (!!p.parentId || p.type === 'spectacle');
            if (isSpectacle && typeof openDocumentsPage === 'function') {
                openDocumentsPage(projectId);
            } else if (typeof viewTournee === 'function') {
                viewTournee(projectId);
                setTimeout(function() {
                    if (typeof openTourneeDocumentsPage === 'function') openTourneeDocumentsPage();
                }, 300);
            }
            break;
        }
        case 'doc_task': {
            const parts = String(payload).split('~');
            const doc = await msgFindTaskDocument(parts[0], parts[1], parts[2], parts[3]);
            if (doc && msgOpenDocumentUrl(doc.downloadUrl || doc.url)) break;
            if (typeof openTaskFiche === 'function') openTaskFiche(parts[0], parts[1], parts[2]);
            break;
        }
        case 'doc_wp': {
            const parts = String(payload).split('~');
            const projectId = parts[0];
            const fileId = parts[1];
            if (typeof openWorkProjectsListPage === 'function') openWorkProjectsListPage();
            setTimeout(async function() {
                if (typeof openWorkProjectPage === 'function') openWorkProjectPage(projectId, { tab: 'documents' });
                setTimeout(function() {
                    if (typeof openWpWorkspaceFile === 'function') openWpWorkspaceFile(fileId);
                    else if (typeof getWorkspaceFileUrl === 'function') msgOpenDocumentUrl(getWorkspaceFileUrl(fileId));
                }, 350);
            }, 200);
            break;
        }
        case 'doc_compta':
            if (typeof openComptabiliteHomePage === 'function') openComptabiliteHomePage();
            setTimeout(function() {
                if (typeof openDepotFactureDetailModal === 'function') openDepotFactureDetailModal(payload);
            }, 200);
            break;
        case 'doc_catalogue': {
            const parts = String(payload).split('~');
            const ficheId = parts[0];
            const docId = parts[1];
            let doc = null;
            if (typeof catalogueData !== 'undefined' && Array.isArray(catalogueData)) {
                const fiche = catalogueData.find(function(f) { return String(f.id) === String(ficheId); });
                doc = fiche && (fiche.documents || []).find(function(d) { return String(d.id) === String(docId); });
            }
            if (doc && msgOpenDocumentUrl(doc.url || doc.downloadUrl)) break;
            if (typeof openEvenementielHomePage === 'function') openEvenementielHomePage();
            setTimeout(function() {
                if (typeof viewCatalogueFiche === 'function') viewCatalogueFiche(ficheId);
            }, 200);
            break;
        }
        case 'catalogue_fiche':
            if (typeof openEvenementielHomePage === 'function') openEvenementielHomePage();
            setTimeout(function() {
                if (typeof loadCatalogueData === 'function') {
                    loadCatalogueData().then(function() {
                        if (typeof viewCatalogueFiche === 'function') viewCatalogueFiche(payload);
                    });
                } else if (typeof viewCatalogueFiche === 'function') {
                    viewCatalogueFiche(payload);
                }
            }, 200);
            break;
        case 'ndf': {
            const isValidator = typeof hasNdfValidationPermission === 'function' && hasNdfValidationPermission();
            const ctx = isValidator ? 'validation' : 'user';
            if (typeof openComptabiliteHomePage === 'function') openComptabiliteHomePage();
            setTimeout(function() {
                if (typeof openNdfDetailModal === 'function') openNdfDetailModal(payload, ctx);
            }, 200);
            break;
        }
        default:
            break;
    }
}
window.openMsgEntityMention = openMsgEntityMention;
window.openMsgMentionPickerManual = openMsgMentionPickerManual;
window.msgMentionSelectIndex = msgMentionSelectIndex;

let msgWsAccessPending = null;

const MSG_WS_TYPE_LABELS = {
    page: 'Note', idea: 'Idée', mindmap: 'Carte mentale', drawing: 'Dessin',
    file: 'Fichier', quicknote: 'Note rapide'
};

async function msgOpenBureauWorkspaceMention(elementId, mentionKind) {
    if (!elementId) return;
    try {
        const res = await apiCall('workspace.php?id=' + encodeURIComponent(elementId), 'GET');
        if (res?.success && res.element) {
            if (res.element.access_role === 'viewer' && typeof openWorkspaceElementConsultation === 'function') {
                openWorkspaceElementConsultation(res.element);
            } else {
                await msgOpenWorkspaceElementFromMention(res.element, mentionKind);
            }
            return;
        }
    } catch (e) {
        if (e.message === 'Accès refusé') {
            await msgShowWorkspaceAccessModal(elementId, mentionKind);
            return;
        }
        if (typeof showToast === 'function') showToast('❌ ' + e.message, 'error');
    }
}

async function msgShowWorkspaceAccessModal(elementId, mentionKind) {
    try {
        const previewRes = await apiCall('workspace.php?action=mention_preview&id=' + encodeURIComponent(elementId), 'GET');
        if (!previewRes?.success || !previewRes.preview) {
            if (typeof showToast === 'function') showToast('❌ Partage non disponible', 'error');
            return;
        }
        msgWsAccessPending = { elementId: elementId, mentionKind: mentionKind, preview: previewRes.preview };
        const modal = document.getElementById('msgWorkspaceAccessModal');
        const titleEl = document.getElementById('msgWsAccessTitle');
        const metaEl = document.getElementById('msgWsAccessMeta');
        const typeEl = document.getElementById('msgWsAccessType');
        if (titleEl) titleEl.textContent = previewRes.preview.title || 'Élément partagé';
        if (typeEl) typeEl.textContent = MSG_WS_TYPE_LABELS[previewRes.preview.type] || previewRes.preview.type || 'Document';
        if (metaEl) {
            const owner = previewRes.preview.created_by_name || 'Un collègue';
            metaEl.textContent = 'Partagé par ' + owner + ' via la messagerie';
        }
        if (modal) modal.classList.add('active');
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ ' + (e.message || 'Impossible d\'accéder à cet élément'), 'error');
    }
}

function msgCloseWorkspaceAccessModal() {
    msgWsAccessPending = null;
    const modal = document.getElementById('msgWorkspaceAccessModal');
    if (modal) modal.classList.remove('active');
}

async function msgGrantWorkspaceAccess(mode) {
    if (!msgWsAccessPending) return;
    const pending = msgWsAccessPending;
    msgCloseWorkspaceAccessModal();
    if (mode === 'view') {
        try {
            const res = await apiCall('workspace.php?action=mention_view&id=' + encodeURIComponent(pending.elementId), 'GET');
            if (res?.success && res.element) {
                if (typeof openWorkspaceElementConsultation === 'function') {
                    openWorkspaceElementConsultation(res.element);
                }
                if (typeof showToast === 'function') showToast('👁️ Ouvert en consultation seule', 'success');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('❌ ' + e.message, 'error');
        }
        return;
    }
    try {
        const res = await apiCall('workspace.php', 'POST', {
            action: 'grant_access',
            element_id: pending.elementId,
            mode: 'collaborate'
        });
        if (res?.success && res.element) {
            await msgOpenWorkspaceElementFromMention(res.element, pending.mentionKind);
            if (typeof showToast === 'function') {
                showToast('✅ Ajouté à votre espace — les modifications seront synchronisées', 'success');
            }
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ ' + e.message, 'error');
    }
}

async function msgOpenWorkspaceElementFromMention(el, mentionKind) {
    const isFile = el.type === 'file' || mentionKind === 'file';

    if (isFile) {
        const url = typeof getWorkspaceFileUrl === 'function' ? getWorkspaceFileUrl(el.id || el) : null;
        if (url) window.open(url, '_blank');
        return;
    }

    if (typeof openMyBureauPage === 'function') {
        await Promise.resolve(openMyBureauPage());
    }
    if (typeof switchBureauTab === 'function') switchBureauTab('workspace');
    if (typeof loadWorkspaceElements === 'function') await loadWorkspaceElements();
    setTimeout(function() {
        if (typeof openWorkspaceElement === 'function') {
            openWorkspaceElement(el.id || el);
        }
    }, 280);
}

window.msgGrantWorkspaceAccess = msgGrantWorkspaceAccess;
window.msgCloseWorkspaceAccessModal = msgCloseWorkspaceAccessModal;

function formatMsgText(text) {
    if (!text) return '';
    const parts = [];
    let last = 0;
    let m;
    const re = new RegExp(MSG_MENTION_TOKEN_RE.source, 'g');
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
        let label = m[3];
        try { label = decodeURIComponent(label); } catch (e) { /* keep */ }
        parts.push({ kind: 'mention', type: m[1], payload: m[2], label: label });
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });

    return parts.map(function(p) {
        if (p.kind === 'mention') {
            const safeType = escHtml(p.type);
            const safePayload = escHtml(p.payload);
            const safeLabel = escHtml(p.label);
            return '<button type="button" class="msg-mention-link" data-mention-type="' + safeType + '" data-mention-payload="' + safePayload + '" onclick="openMsgEntityMention(this.dataset.mentionType, this.dataset.mentionPayload)">' + safeLabel + '</button>';
        }
        let escaped = escHtml(p.value);
        escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        escaped = escaped.replace(/\n/g, '<br>');
        escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
        return escaped;
    }).join('');
}

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '…' : str;
}

function parseMsgMentionToken(token) {
    const m = /^\{\{mn:([^:{}]+):([^:{}]*):([^}]+)\}\}$/.exec(token || '');
    if (!m) return null;
    return { type: m[1], payload: m[2] };
}

async function globalSearchAppendAppEntities(query, pushResult) {
    const items = await msgSearchMentionEntities(query, 30);
    items.forEach(function(item, i) {
        const parsed = parseMsgMentionToken(item.token);
        if (!parsed) return;
        const key = 'gs_' + parsed.type + '_' + parsed.payload + '_' + i;
        const result = {
            icon: item.icon,
            title: item.title,
            subtitle: item.subtitle,
            action: function() { openMsgEntityMention(parsed.type, parsed.payload); }
        };
        if (parsed.type === 'project' && typeof getWorkProjectById === 'function') {
            const p = getWorkProjectById(parsed.payload);
            if (p && typeof getWpProjectImageUrl === 'function') {
                const imgUrl = getWpProjectImageUrl(p);
                if (imgUrl) result.imageUrl = imgUrl;
            }
        }
        pushResult(key, result);
    });
}
window.globalSearchAppendAppEntities = globalSearchAppendAppEntities;

function messagerieGlobalSearchAppend(query, results, pushResult) {
    const q = (query || '').toLowerCase().trim();
    if (q.length < 2 || !Array.isArray(msgConversations)) return;
    const push = typeof pushResult === 'function'
        ? pushResult
        : function(key, item) { results.push(item); };

    msgConversations.forEach(function(c) {
        const name = getMsgConvDisplayName(c).toLowerCase();
        const preview = stripMsgMentions(c.lastMessage || '').toLowerCase();
        if (name.indexOf(q) === -1 && preview.indexOf(q) === -1) return;
        const displayName = getMsgConvDisplayName(c);
        push('msg_conv_' + c.id, {
            icon: c.type === 'group' ? '👥' : '💬',
            title: displayName,
            subtitle: 'Messagerie · ' + truncate(stripMsgMentions(c.lastMessage || ''), 55),
            action: function() {
                if (typeof openMessagingPage === 'function') openMessagingPage();
                setTimeout(function() { openConversation(c.id); }, 200);
            }
        });
    });
}
window.messagerieGlobalSearchAppend = messagerieGlobalSearchAppend;

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / 1048576).toFixed(1) + ' Mo';
}

// Raccourci clavier M pour messagerie
document.addEventListener('keydown', function(e) {
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        const isTyping = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;
        if (!isTyping && !document.querySelector('.modal.active')) {
            e.preventDefault();
            openMessagingPage();
        }
    }
});

// Polling global : accueil, bureau, autres pages (pas la messagerie — gérée par startMsgPolling)
let _lastKnownUnreadTotal = 0;

function startMsgBackgroundSync() {
    stopMsgBackgroundSync();
    refreshMessagingState();
    msgBackgroundSyncInterval = setInterval(() => {
        if (!authToken || !currentUser) return;
        const msgPageActive = document.getElementById('messageriePage')?.classList.contains('active');
        if (!msgPageActive) refreshMessagingState();
    }, MSG_BACKGROUND_SYNC_MS);
}

function stopMsgBackgroundSync() {
    if (msgBackgroundSyncInterval) {
        clearInterval(msgBackgroundSyncInterval);
        msgBackgroundSyncInterval = null;
    }
}

async function checkMsgBadgesGlobal() {
    await refreshMessagingState();
}

function showForegroundMsgNotification(sender, preview, convId) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const msgPageActive = document.getElementById('messageriePage')?.classList.contains('active');
    if (msgPageActive && String(msgCurrentConvId) === String(convId)) return;
    if (document.visibilityState === 'visible' && msgPageActive) return;

    try {
        const notif = new Notification(sender, {
            body: preview.length > 80 ? preview.substring(0, 80) + '…' : preview,
            icon: './icons/icon-192.png',
            tag: 'msg-fg-' + convId,
            renotify: true
        });
        notif.onclick = () => {
            window.focus();
            openMessagingPage();
            setTimeout(() => openConversation(convId), 300);
            notif.close();
        };
        setTimeout(() => notif.close(), 8000);
    } catch(e) { /* Notification API not available in this context */ }
}

// Ancien intervalle 30s remplacé par startMsgBackgroundSync (5s) au login

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && authToken && currentUser) {
        refreshMessagingState();
    }
});

// --- Bulle messagerie flottante ---
const MSG_FLOAT_COLLAPSED_KEY = 'msgFloatBarCollapsed';

function isMsgFloatBarCollapsed() {
    try {
        return localStorage.getItem(MSG_FLOAT_COLLAPSED_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function syncMsgFloatCollapseBadge(total) {
    const count = total !== undefined
        ? total
        : msgConversations.reduce(function(sum, c) { return sum + (c.unreadCount || 0); }, 0);
    const widget = document.getElementById('msgFloatWidget');
    const collapsed = widget && widget.classList.contains('collapsed');
    if (collapsed) {
        setMsgBadgeVisibility(document.getElementById('msgFloatCollapseBadge'), count);
        setMsgBadgeVisibility(document.getElementById('msgFloatBadge'), 0);
    } else {
        setMsgBadgeVisibility(document.getElementById('msgFloatBadge'), count);
        setMsgBadgeVisibility(document.getElementById('msgFloatCollapseBadge'), 0);
    }
}

function applyMsgFloatBarCollapsed(collapsed) {
    const widget = document.getElementById('msgFloatWidget');
    const btn = document.getElementById('msgFloatCollapseBtn');
    if (!widget) return;
    widget.classList.toggle('collapsed', !!collapsed);
    if (collapsed) {
        closeMsgFloatQuickMenu();
        closeMsgFloatWidget(true);
    }
    if (btn) {
        btn.title = collapsed ? 'Afficher messagerie et création rapide' : 'Masquer';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    syncMsgFloatCollapseBadge();
}

function toggleMsgFloatBarCollapse(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const collapsed = !isMsgFloatBarCollapsed();
    try {
        localStorage.setItem(MSG_FLOAT_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (err) { /* ignore */ }
    applyMsgFloatBarCollapsed(collapsed);
}

function closeMsgFloatQuickMenu() {
    const menu = document.getElementById('msgFloatQuickMenu');
    if (menu) menu.style.display = 'none';
}

function closeMsgFloatQuickMenuOnce(ev) {
    const menu = document.getElementById('msgFloatQuickMenu');
    const btn = document.getElementById('msgFloatQuickBtn');
    if (menu && !menu.contains(ev.target) && ev.target !== btn && !btn?.contains(ev.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', closeMsgFloatQuickMenuOnce);
    }
}

function toggleMsgFloatQuickMenu(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const menu = document.getElementById('msgFloatQuickMenu');
    if (!menu) return;
    const willOpen = menu.style.display === 'none' || !menu.style.display;
    menu.style.display = willOpen ? 'block' : 'none';
    if (willOpen) {
        setTimeout(function() { document.addEventListener('click', closeMsgFloatQuickMenuOnce); }, 10);
    } else {
        document.removeEventListener('click', closeMsgFloatQuickMenuOnce);
    }
}

async function msgFloatQuickCreate(type) {
    closeMsgFloatQuickMenu();
    closeMsgFloatWidget(true);
    if (type === 'task') {
        if (typeof openNewPersonalTaskFiche === 'function') {
            await openNewPersonalTaskFiche();
        } else if (typeof openBureauTaskModal === 'function') {
            await openBureauTaskModal('personal');
        } else if (typeof openMyBureauPage === 'function') {
            await openMyBureauPage();
        }
        return;
    }
    if (type === 'note') {
        if (typeof openMyBureauPage === 'function') await openMyBureauPage();
        if (typeof switchBureauTab === 'function') switchBureauTab('workspace');
        if (typeof loadWorkspaceElements === 'function') await loadWorkspaceElements();
        setTimeout(function() {
            if (typeof createWorkspaceElement === 'function') createWorkspaceElement('page');
        }, 220);
    }
}

function syncMsgFloatToggleVisibility() {
    if (!authToken || !currentUser) return;
    const widget = document.getElementById('msgFloatWidget');
    if (widget) widget.style.display = '';
    ['msgFloatToggle', 'msgFloatQuickBtn'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
}

function initMsgFloatWidget() {
    if (!authToken || !currentUser) return;
    const widget = document.getElementById('msgFloatWidget');
    if (widget) widget.style.display = '';
    applyMsgFloatBarCollapsed(isMsgFloatBarCollapsed());
    syncMsgFloatToggleVisibility();
}

function hideMsgFloatWidget() {
    const widget = document.getElementById('msgFloatWidget');
    if (widget) widget.style.display = 'none';
    closeMsgFloatWidget();
}

function toggleMsgFloatWidget(forceOpen) {
    const panel = document.getElementById('msgFloatPanel');
    if (!panel) return;
    const willOpen = forceOpen === true ? true : (forceOpen === false ? false : !panel.classList.contains('open'));
    if (willOpen) {
        panel.classList.add('open');
        loadConversations();
        if (!document.getElementById('messageriePage')?.classList.contains('active')) {
            startMsgPolling();
        }
    } else {
        closeMsgFloatWidget(false);
        if (!document.getElementById('messageriePage')?.classList.contains('active')) {
            stopMsgPolling();
        }
    }
}

function closeMsgFloatWidget(keepState) {
    const panel = document.getElementById('msgFloatPanel');
    if (panel) panel.classList.remove('open');
    if (!keepState) msgFloatBackToList();
}

function msgFloatBackToList() {
    msgCurrentConvId = null;
    msgCurrentMessages = [];
    const listView = document.getElementById('msgFloatListView');
    const chatView = document.getElementById('msgFloatChatView');
    const backBtn = document.getElementById('msgFloatBackBtn');
    const titleEl = document.getElementById('msgFloatHeaderTitle');
    const floatMessages = document.getElementById('msgFloatChatMessages');
    if (listView) listView.style.display = '';
    if (chatView) chatView.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (titleEl) titleEl.textContent = 'Messagerie';
    if (floatMessages) floatMessages.innerHTML = '';
    cancelReply();
    renderConversationList();
}

function openMessagingPageFromFloat() {
    closeMsgFloatWidget(true);
    openMessagingPage();
}

window.toggleMsgFloatBarCollapse = toggleMsgFloatBarCollapse;
window.toggleMsgFloatWidget = toggleMsgFloatWidget;
window.msgFloatBackToList = msgFloatBackToList;
window.openMessagingPageFromFloat = openMessagingPageFromFloat;
window.filterFloatConversations = filterFloatConversations;
window.syncMsgFloatToggleVisibility = syncMsgFloatToggleVisibility;
window.toggleMsgFloatQuickMenu = toggleMsgFloatQuickMenu;
window.msgFloatQuickCreate = msgFloatQuickCreate;
window.openAppMentionPicker = openAppMentionPicker;
window.initAppMentionField = initAppMentionField;
window.initAllMentionFields = initAllMentionFields;
window.formatMsgText = formatMsgText;
window.replaceMentionTokensWithChips = replaceMentionTokensWithChips;
window.extractMentionTokensFromHtml = extractMentionTokensFromHtml;
window.syncMentionChipsInContentEditable = syncMentionChipsInContentEditable;
window.getMentionFieldPlainText = getMentionFieldPlainText;
window.serializeContentEditableWithMentions = serializeContentEditableWithMentions;
window.formatNoteText = formatMsgText;

// Au chargement : déplacer les modales messagerie dans body pour garantir leur visibilité
(function initMsgModals() {
    function moveToBody(id) {
        const el = document.getElementById(id);
        if (el && el.parentNode !== document.body) document.body.appendChild(el);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { moveToBody('newConvModal'); moveToBody('addMembersModal'); });
    } else {
        moveToBody('newConvModal');
        moveToBody('addMembersModal');
    }
})();

// Délégation d'événement : capturer les clics sur le bouton nouvelle conversation
document.addEventListener('click', function(e) {
    const btn = e.target.closest('#msgNewConvBtn');
    if (!btn) return;
    const msgPage = document.getElementById('messageriePage');
    if (msgPage && msgPage.classList.contains('active')) {
        e.preventDefault();
        e.stopPropagation();
        openNewConversationModal();
    }
}, true);

// Attacher aussi au chargement de la messagerie (au cas où le bouton serait recréé)
const _origOpenMessaging = openMessagingPage;
if (typeof openMessagingPage === 'function') {
    openMessagingPage = function() {
        _origOpenMessaging.apply(this, arguments);
        const btn = document.getElementById('msgNewConvBtn');
        if (btn) btn.onclick = openNewConversationModal;
        syncMsgFloatToggleVisibility();
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { initAllMentionFields(); });
} else {
    initAllMentionFields();
}

if (authToken && currentUser) initMsgFloatWidget();

if (typeof showApp === 'function') {
    const _msgShowApp = showApp;
    window.showApp = function() {
        const result = _msgShowApp.apply(this, arguments);
        initMsgFloatWidget();
        return result;
    };
}

if (typeof logout === 'function') {
    const _msgLogout = logout;
    window.logout = function() {
        hideMsgFloatWidget();
        return _msgLogout.apply(this, arguments);
    };
}

