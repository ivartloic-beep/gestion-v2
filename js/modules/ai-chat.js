// ========== MODULE ASSISTANT IA - Spectacles (style messagerie) ==========

let currentAISpectacleId = null;
let currentAIConversation = null;
let aiConversations = [];
let aiMessages = [];

function openSpectacleAIPage(spectacleId) {
    if (!spectacleId) return;
    currentAISpectacleId = spectacleId;
    currentAIConversation = null;
    aiMessages = [];
    const spectacle = typeof projects !== 'undefined' && projects ? projects.find(p => p.id === spectacleId) : null;
    const name = spectacle ? (spectacle.name || spectacleId) : spectacleId;

    document.getElementById('spectacleAIName').textContent = name;
    document.getElementById('aiConvEmpty').style.display = '';
    document.getElementById('aiChatEmpty').style.display = '';
    document.getElementById('aiChatHeader').style.display = 'none';
    document.getElementById('aiMessagesWrap').style.display = 'none';
    document.getElementById('aiComposer').style.display = 'none';
    document.getElementById('aiSidebar').classList.remove('hidden-mobile');
    document.getElementById('aiChatArea').classList.remove('visible-mobile');
    document.getElementById('spectacleAIPage').classList.add('active');
    if (typeof updateFabAppearance === 'function') updateFabAppearance();

    loadAIConversations();
}

function closeSpectacleAIPage() {
    document.getElementById('spectacleAIPage').classList.remove('active');
    if (currentAISpectacleId && typeof viewSpectacle === 'function') {
        viewSpectacle(currentAISpectacleId);
    }
    currentAISpectacleId = null;
    currentAIConversation = null;
    aiConversations = [];
    aiMessages = [];
    if (typeof updateFabAppearance === 'function') updateFabAppearance();
}

async function loadAIConversations() {
    if (!currentAISpectacleId) return;
    try {
        const res = await apiCall('ai.php', 'POST', {
            action: 'list_conversations',
            entity_type: 'spectacle',
            entity_id: currentAISpectacleId
        });
        aiConversations = (res.success && res.conversations) ? res.conversations : [];
        renderAIConvList();
    } catch (e) {
        console.error('loadAIConversations', e);
        aiConversations = [];
        renderAIConvList();
    }
}

function renderAIConvList() {
    const list = document.getElementById('aiConvList');
    const empty = document.getElementById('aiConvEmpty');
    if (!list) return;
    if (aiConversations.length === 0) {
        list.innerHTML = '';
        if (empty) {
            empty.style.display = '';
            list.appendChild(empty);
        }
        return;
    }
    if (empty) empty.style.display = 'none';
    const currentId = currentAIConversation ? String(currentAIConversation.id) : '';
    list.innerHTML = aiConversations.map(c => {
        const isActive = String(c.id) === currentId;
        const title = (c.title || 'Conversation').substring(0, 40);
        const preview = (c.last_message || '').substring(0, 50);
        const timeStr = c.updated_at ? formatAITime(c.updated_at) : (c.created_at ? formatAITime(c.created_at) : '');
        return `
            <div class="ai-conv-item ${isActive ? 'active' : ''}" onclick="openAIConversation(${c.id})">
                <div class="ai-conv-avatar">🤖</div>
                <div class="ai-conv-info">
                    <div class="ai-conv-top">
                        <div class="ai-conv-name">${escapeHtml(title)}</div>
                        <div class="ai-conv-time">${timeStr}</div>
                    </div>
                    <div class="ai-conv-preview">${escapeHtml(preview) || 'Aucun message'}</div>
                </div>
            </div>
        `;
    }).join('');
}

function formatAITime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diff < 172800000) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

async function createNewAIConversation() {
    if (!currentAISpectacleId) return;
    try {
        const res = await apiCall('ai.php', 'POST', {
            action: 'create_conversation',
            entity_type: 'spectacle',
            entity_id: currentAISpectacleId
        });
        if (res.success && res.conversation) {
            aiConversations.unshift(res.conversation);
            renderAIConvList();
            openAIConversation(res.conversation.id);
        }
    } catch (e) {
        console.error('createNewAIConversation', e);
        if (typeof showToast === 'function') showToast('Impossible de créer la conversation', 'error');
    }
}

async function openAIConversation(convId) {
    const conv = aiConversations.find(c => c.id == convId);
    currentAIConversation = conv ? { id: conv.id, title: conv.title } : { id: convId, title: 'Conversation' };
    renderAIConvList();

    if (window.innerWidth <= 768) {
        document.getElementById('aiSidebar').classList.add('hidden-mobile');
        document.getElementById('aiChatArea').classList.add('visible-mobile');
    }

    document.getElementById('aiChatEmpty').style.display = 'none';
    document.getElementById('aiChatHeader').style.display = 'flex';
    document.getElementById('aiMessagesWrap').style.display = 'flex';
    document.getElementById('aiComposer').style.display = 'flex';
    document.getElementById('aiChatHeaderName').textContent = currentAIConversation.title || 'Conversation';
    document.getElementById('aiChatInput').value = '';

    try {
        const msgRes = await apiCall('ai.php', 'POST', {
            action: 'get_messages',
            conversation_id: convId
        });
        aiMessages = (msgRes.success && msgRes.messages) ? msgRes.messages : [];
        renderAIMessages();
    } catch (e) {
        console.error('openAIConversation', e);
        aiMessages = [];
        renderAIMessages();
    }
}

function aiBackToList() {
    document.getElementById('aiSidebar').classList.remove('hidden-mobile');
    document.getElementById('aiChatArea').classList.remove('visible-mobile');
}

function renderAIMessages() {
    const list = document.getElementById('aiMessagesList');
    if (!list) return;
    if (aiMessages.length === 0) {
        list.innerHTML = '<div class="ai-placeholder">Aucun message. Posez une question sur ce spectacle.</div>';
        list.scrollTop = 0;
        return;
    }
    list.innerHTML = aiMessages.map(m => {
        const time = m.created_at ? new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        const content = (m.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        return '<div class="ai-message ' + (m.role || '') + '"><div>' + content + '</div><div class="ai-message-time">' + time + '</div></div>';
    }).join('');
    list.scrollTop = list.scrollHeight;
}

async function sendAIMessage() {
    const input = document.getElementById('aiChatInput');
    const content = (input && input.value || '').trim();
    if (!content || !currentAIConversation || !currentAISpectacleId) return;

    const btn = document.getElementById('aiSendBtn');
    if (btn) btn.disabled = true;
    input.value = '';

    aiMessages.push({ role: 'user', content: content, created_at: new Date().toISOString() });
    renderAIMessages();

    const list = document.getElementById('aiMessagesList');
    const loadingEl = document.createElement('div');
    loadingEl.className = 'ai-message assistant ai-loading';
    loadingEl.textContent = 'Réflexion en cours';
    list.appendChild(loadingEl);
    list.scrollTop = list.scrollHeight;

    try {
        const res = await apiCall('ai.php', 'POST', {
            action: 'send_message',
            conversation_id: currentAIConversation.id,
            entity_type: 'spectacle',
            entity_id: currentAISpectacleId,
            content: content
        });
        loadingEl.remove();
        if (res.success && res.message) {
            aiMessages.push(res.message);
            renderAIMessages();
            loadAIConversations();
        } else {
            aiMessages.push({ role: 'assistant', content: 'Erreur : ' + (res.error || 'Réponse invalide'), created_at: new Date().toISOString() });
            renderAIMessages();
        }
    } catch (e) {
        loadingEl.remove();
        aiMessages.push({ role: 'assistant', content: 'Erreur : ' + (e.message || 'Connexion impossible'), created_at: new Date().toISOString() });
        renderAIMessages();
    }
    if (btn) btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('aiChatInput');
    if (input) {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAIMessage();
            }
        });
    }
});
