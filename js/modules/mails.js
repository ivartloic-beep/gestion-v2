/* ========== MODULE MAILS — interface type Gmail ========== */

let mailsBoxes = [];
let mailsActiveBoxId = null;
let mailsActiveFolder = 'INBOX';
let mailsMessages = [];
let mailsCurrentUid = null;
let mailsCurrentMessage = null;
let mailsPage = 1;
let mailsUnreadOnly = false;
let mailsComposeAttachments = [];
let mailsRecipientSuggestions = [];
let mailsRecipientSuggestIndex = { to: -1, cc: -1, bcc: -1 };
let mailsSelectedUids = new Set();
let mailsComposeDraftUid = null;
let mailsComposeInitialState = null;
let mailsComposeSkipLeaveCheck = false;
let mailsSending = false;
let mailsUserSettings = {
    signature_html: '',
    signature_enabled: true,
};
const MAILS_COMPOSE_SIG_ATTR = 'data-mail-signature';
const MAILS_COMPOSE_INPUT_CLASS = 'mails-compose-input-zone';
let mailsViewMode = 'read'; // read | compose
let mailsPollingInterval = null;
let mailsBackgroundSyncInterval = null;
let mailsPollingBusy = false;
let mailsLastKnownUnreadTotal = 0;
const MAILS_POLL_INTERVAL_MS = 5000;

const MAILS_FOLDERS = [
    { key: 'INBOX', label: 'Réception', icon: '📥' },
    { key: 'Sent', label: 'Envoyés', icon: '📤' },
    { key: 'Drafts', label: 'Brouillons', icon: '📝' },
    { key: 'Trash', label: 'Corbeille', icon: '🗑️' },
    { key: 'Spam', label: 'Indésirables', icon: '⚠️' },
];

function openMailsPage() {
    if (!currentUserHasMailboxes) {
        alert('Aucune boîte mail configurée pour votre compte.');
        return;
    }
    closeAllPages();
    const homeWelcome = document.getElementById('homeWelcome');
    if (homeWelcome) homeWelcome.style.display = 'none';
    const page = document.getElementById('mailsPage');
    if (page) page.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const nav = document.getElementById('navMailsItem');
    if (nav) nav.classList.add('active');
    const root = document.getElementById('mailsRoot');
    if (root) root.innerHTML = '<div class="mails-page-loading">Chargement…</div>';
    mailsInitPage();
    closeSidebarOnMobile();
}

async function mailsInitPage() {
    mailsCurrentUid = null;
    mailsCurrentMessage = null;
    mailsViewMode = 'read';
    mailsPage = 1;
    try {
        await mailsLoadUserSettings();
        await mailsFetchBoxes(false);
        if (!mailsBoxes.length) {
            mailsUpdatePageHeader();
            mailsRenderBoxTabs();
            mailsUpdateNavBadge();
            mailsRenderEmptyConfig();
            return;
        }
        if (!mailsActiveBoxId || !mailsBoxes.find(b => b.id === mailsActiveBoxId)) {
            mailsActiveBoxId = mailsBoxes[0].id;
        }
        mailsUpdatePageHeader();
        mailsRenderBoxTabs();
        mailsUpdateNavBadge();
        mailsRenderLayout();
        await mailsLoadMessages();
        mailsRenderReadEmpty();
        await mailsFetchUnreadCounts();
        mailsLastKnownUnreadTotal = mailsTotalUnread();
        startMailsPolling();
    } catch (e) {
        console.error('Mails init:', e);
        mailsRenderError(e.message || String(e));
    }
}

function mailsActiveBox() {
    return mailsBoxes.find(b => b.id === mailsActiveBoxId) || null;
}

function mailsNormalizeBoxes(rows) {
    return (rows || []).map(b => Object.assign({}, b, {
        unreadCount: Number(b.unread_count ?? b.unreadCount ?? 0) || 0,
    }));
}

async function mailsFetchBoxes(withUnread) {
    const url = withUnread ? 'mailboxes.php?action=mine&unread=1' : 'mailboxes.php?action=mine';
    const data = await apiCall(url, 'GET');
    const rows = mailsNormalizeBoxes(data?.mailboxes || []);
    if (!withUnread) {
        mailsBoxes = rows;
    } else {
        rows.forEach(r => {
            const box = mailsBoxes.find(b => String(b.id) === String(r.id));
            if (box) box.unreadCount = r.unreadCount;
            else mailsBoxes.push(r);
        });
    }
    return mailsBoxes;
}

async function mailsFetchUnreadCounts() {
    if (!mailsBoxes.length) return;
    try {
        const data = await apiCall('mailboxes.php?action=unread_counts', 'GET');
        (data?.counts || []).forEach(c => {
            const box = mailsBoxes.find(b => String(b.id) === String(c.id));
            if (box) box.unreadCount = Number(c.unread_count) || 0;
        });
        mailsRenderBoxTabs();
        mailsUpdateNavBadge();
        mailsUpdateFolderBadges();
        mailsLastKnownUnreadTotal = mailsTotalUnread();
    } catch (e) {
        console.warn('mailsFetchUnreadCounts:', e);
    }
}

function mailsUpdateFolderBadges() {
    const unread = mailsActiveBox()?.unreadCount || 0;
    document.querySelectorAll('.mails-folder-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        const isInbox = onclick.indexOf("'INBOX'") !== -1;
        let badge = btn.querySelector('.mails-folder-badge');
        if (isInbox && unread > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'mails-folder-badge';
                btn.appendChild(badge);
            }
            badge.textContent = unread > 99 ? '99+' : String(unread);
            badge.style.display = 'inline-flex';
        } else if (badge) {
            badge.style.display = 'none';
        }
    });
}

async function mailsRefreshUnreadCounts() {
    await mailsFetchUnreadCounts();
}

function mailsTotalUnread() {
    return mailsBoxes.reduce((sum, b) => sum + (b.unreadCount || 0), 0);
}

function mailsAdjustUnreadCount(boxId, delta) {
    const box = mailsBoxes.find(b => String(b.id) === String(boxId));
    if (!box) return;
    box.unreadCount = Math.max(0, (box.unreadCount || 0) + delta);
    mailsRenderBoxTabs();
    mailsUpdateNavBadge();
    mailsUpdateFolderBadges();
}

function mailsUpdateNavBadge() {
    const badge = document.getElementById('mailsNavBadge');
    if (!badge) return;
    const total = mailsTotalUnread();
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

function mailsUpdatePageHeader() {
    const subtitle = document.getElementById('mailsPageSubtitle');
    if (!subtitle) return;
    const box = mailsActiveBox();
    subtitle.style.display = '';
    if (mailsBoxes.length > 1) {
        subtitle.textContent = box ? (box.email || box.label || '—') : '—';
        return;
    }
    subtitle.textContent = box ? (box.email || box.label || '—') : '—';
}

function mailsRenderBoxTabs() {
    const row = document.getElementById('mailsBoxTabsRow');
    const container = document.getElementById('mailsBoxTabs');
    if (!row || !container) return;
    if (mailsBoxes.length <= 1) {
        row.style.display = 'none';
        container.innerHTML = '';
        document.querySelector('#mailsPage .module-home-welcome')?.classList.remove('mails-has-box-tabs');
        mailsUpdatePageHeader();
        return;
    }
    document.querySelector('#mailsPage .module-home-welcome')?.classList.add('mails-has-box-tabs');
    row.style.display = '';
    container.innerHTML = mailsBoxes.map(b => {
        const active = b.id === mailsActiveBoxId ? ' active' : '';
        const label = b.label || b.email || 'Boîte';
        const badge = (b.unreadCount || 0) > 0
            ? `<span class="mails-box-tab-badge">${b.unreadCount > 99 ? '99+' : b.unreadCount}</span>`
            : '';
        return `<button type="button" class="mails-box-tab${active}" role="tab" aria-selected="${b.id === mailsActiveBoxId ? 'true' : 'false'}" onclick="mailsSwitchBox(${b.id})" title="${escapeHtml(b.email || label)}">
            <span class="mails-box-tab-label">${escapeHtml(label)}</span>${badge}
        </button>`;
    }).join('');
}

function mailsRenderEmptyConfig() {
    const root = document.getElementById('mailsRoot');
    if (!root) return;
    root.innerHTML = `
        <div class="mails-empty-state">
            <div class="mails-empty-icon">📭</div>
            <h3>Aucune boîte mail</h3>
            <p>Contactez un administrateur pour configurer votre accès aux mails.</p>
        </div>`;
}

function mailsRenderError(msg) {
    const root = document.getElementById('mailsRoot');
    if (!root) return;
    root.innerHTML = `
        <div class="mails-empty-state">
            <div class="mails-empty-icon">⚠️</div>
            <h3>Erreur</h3>
            <p>${escapeHtml(msg)}</p>
        </div>`;
}

function mailsRenderLayout() {
    const root = document.getElementById('mailsRoot');
    if (!root) return;

    const folders = MAILS_FOLDERS.map(f => `
        <button type="button" class="mails-folder-btn ${f.key === mailsActiveFolder ? 'active' : ''}"
            onclick="mailsSwitchFolder('${f.key}')" title="${escapeHtml(f.label)}">
            <span class="mails-folder-icon">${f.icon}</span>
            <span class="mails-folder-label">${f.label}</span>
        </button>
    `).join('');

    root.innerHTML = `
        <div class="mails-app">
            <nav class="mails-nav-col">
                <button type="button" class="mails-compose-primary" onclick="mailsOpenCompose()">
                    <span class="mails-compose-label">✏️ Rédiger</span>
                </button>
                <div class="mails-folders">${folders}</div>
            </nav>
            <div class="mails-list-col">
                <div class="mails-list-toolbar">
                    <div class="mails-list-toolbar-row">
                        <button type="button" class="mails-filter-btn" id="mailsUnreadFilterBtn"
                            onclick="mailsToggleUnreadFilter()" title="Afficher uniquement les non lus"
                            aria-pressed="false">Non lus</button>
                        <div class="mails-search-box">
                            <input type="text" id="mailsSearchInput" placeholder="Rechercher dans les messages…" oninput="mailsFilterList(this.value)">
                        </div>
                    </div>
                    <div class="mails-trash-toolbar" id="mailsTrashToolbar" style="display:none;">
                        <label class="mails-trash-select-all">
                            <input type="checkbox" id="mailsSelectAllTrash" onchange="mailsToggleSelectAllTrash(this.checked)">
                            <span>Tout sélectionner</span>
                        </label>
                        <button type="button" class="mails-trash-delete-btn" id="mailsBulkDeleteBtn"
                            onclick="mailsDeleteSelectedBulk()" disabled>Supprimer</button>
                    </div>
                </div>
                <div class="mails-list" id="mailsList">
                    <div class="mails-list-loading">Chargement…</div>
                </div>
            </div>
            <div class="mails-read-col" id="mailsReadCol">
                <div class="mails-read-empty" id="mailsReadEmpty">Sélectionnez un message à lire</div>
                <div id="mailsReadPanel" style="display:none;"></div>
                <div id="mailsComposePanel" style="display:none;"></div>
            </div>
        </div>`;
    mailsEnsureLayoutResizeListener();
    mailsUpdateFolderBadges();
    mailsUpdateUnreadFilterButton();
    mailsUpdateTrashActions();
}

function mailsIsTrashFolder() {
    return mailsActiveFolder === 'Trash';
}

function mailsIsDraftsFolder() {
    return mailsActiveFolder === 'Drafts';
}

function mailsIsBulkSelectableFolder() {
    return mailsIsTrashFolder() || mailsIsDraftsFolder();
}

function mailsClearSelection() {
    mailsSelectedUids.clear();
}

function mailsGetVisibleMessages() {
    const q = (document.getElementById('mailsSearchInput')?.value || '').toLowerCase().trim();
    let filtered = mailsMessages;
    if (mailsUnreadOnly) {
        filtered = filtered.filter(m => !m.seen);
    }
    if (q) {
        filtered = filtered.filter(m =>
            (m.subject || '').toLowerCase().includes(q) ||
            (m.from || '').toLowerCase().includes(q)
        );
    }
    return filtered;
}

function mailsUpdateTrashActions() {
    const toolbar = document.getElementById('mailsTrashToolbar');
    const btn = document.getElementById('mailsBulkDeleteBtn');
    const selectAll = document.getElementById('mailsSelectAllTrash');
    const unreadBtn = document.getElementById('mailsUnreadFilterBtn');
    const show = mailsIsBulkSelectableFolder();
    if (toolbar) toolbar.style.display = show ? 'flex' : 'none';
    if (unreadBtn) unreadBtn.style.display = show ? 'none' : '';
    const count = mailsSelectedUids.size;
    const deleteLabel = mailsIsDraftsFolder() ? 'Supprimer' : 'Supprimer définitivement';
    if (btn) {
        btn.disabled = count === 0;
        btn.textContent = count > 0 ? `${deleteLabel} (${count})` : deleteLabel;
    }
    if (selectAll && show) {
        const visible = mailsGetVisibleMessages();
        const allSelected = visible.length > 0 && visible.every(m => mailsSelectedUids.has(m.uid));
        selectAll.checked = allSelected;
        selectAll.indeterminate = count > 0 && !allSelected;
    }
}

function mailsOnSelectUid(uid, checked) {
    if (checked) mailsSelectedUids.add(uid);
    else mailsSelectedUids.delete(uid);
    mailsUpdateTrashActions();
    document.querySelectorAll('.mails-item[data-uid="' + uid + '"]').forEach(el => {
        el.classList.toggle('selected', checked);
    });
}

function mailsToggleSelectAllTrash(checked) {
    const visible = mailsGetVisibleMessages();
    if (checked) {
        visible.forEach(m => mailsSelectedUids.add(m.uid));
    } else {
        visible.forEach(m => mailsSelectedUids.delete(m.uid));
    }
    mailsFilterList();
}

async function mailsDeleteSelectedBulk(extraUids, options = {}) {
    let uids = Array.from(mailsSelectedUids);
    if (extraUids && extraUids.length) {
        extraUids.forEach(uid => {
            if (!uids.includes(uid)) uids.push(uid);
        });
    }
    if (!uids.length) return;
    if (!options.skipConfirm) {
        const label = uids.length === 1 ? 'ce message' : uids.length + ' messages';
        const confirmMsg = mailsIsDraftsFolder()
            ? 'Supprimer ' + label + ' ?'
            : 'Supprimer définitivement ' + label + ' ?\n\nCette action est irréversible.';
        if (!confirm(confirmMsg)) return;
    }
    const btn = document.getElementById('mailsBulkDeleteBtn');
    if (btn) btn.disabled = true;
    try {
        if (mailsIsDraftsFolder()) {
            await apiCall('email.php', 'POST', {
                action: 'delete_draft',
                mailbox_id: mailsActiveBoxId,
                uids,
            });
        } else {
            await apiCall('email.php', 'POST', {
                action: 'delete_permanent',
                mailbox_id: mailsActiveBoxId,
                folder: mailsActiveFolder,
                uids,
            });
        }
        const uidSet = new Set(uids);
        const unreadDeleted = mailsActiveFolder === 'INBOX'
            ? mailsMessages.filter(m => uidSet.has(m.uid) && !m.seen).length
            : 0;
        mailsMessages = mailsMessages.filter(m => !uidSet.has(m.uid));
        if (mailsCurrentUid && uidSet.has(mailsCurrentUid)) {
            mailsCurrentUid = null;
            mailsCurrentMessage = null;
            mailsRenderReadEmpty();
        }
        if (mailsViewMode === 'compose' && mailsComposeDraftUid && uidSet.has(mailsComposeDraftUid)) {
            mailsComposeSkipLeaveCheck = true;
            mailsCloseCompose(true);
        }
        uids.forEach(uid => mailsSelectedUids.delete(uid));
        if (unreadDeleted > 0) mailsAdjustUnreadCount(mailsActiveBoxId, -unreadDeleted);
        mailsFilterList();
        const toastMsg = mailsIsDraftsFolder()
            ? 'Brouillon(s) supprimé(s)'
            : 'Message(s) supprimé(s) définitivement';
        if (typeof showToast === 'function') showToast(toastMsg, 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsUpdateTrashActions();
    }
}

async function mailsDeleteSelectedPermanent(extraUids) {
    return mailsDeleteSelectedBulk(extraUids);
}

async function mailsDeleteCurrentPermanent() {
    if (!mailsCurrentUid) return;
    await mailsDeleteSelectedBulk([mailsCurrentUid]);
}

async function mailsDeleteCurrentDraft() {
    if (!mailsComposeDraftUid) return;
    if (!confirm('Supprimer ce brouillon ?')) return;
    mailsComposeSkipLeaveCheck = true;
    await mailsDeleteSelectedBulk([mailsComposeDraftUid], { skipConfirm: true });
}

function mailsEnsureLayoutResizeListener() {
    if (window._mailsLayoutResizeBound) return;
    window._mailsLayoutResizeBound = true;
    window.addEventListener('resize', () => {
        if (document.getElementById('mailsPage')?.classList.contains('active')) {
            mailsSyncReadPanelLayout();
        }
    });
}

async function mailsSwitchBox(boxId) {
    if (!(await mailsLeaveComposeIfNeeded())) return;
    mailsActiveBoxId = boxId;
    mailsUpdatePageHeader();
    mailsRenderBoxTabs();
    mailsCurrentUid = null;
    mailsCurrentMessage = null;
    mailsViewMode = 'read';
    mailsPage = 1;
    mailsClearSelection();
    if (!document.getElementById('mailsList')) {
        mailsRenderLayout();
    }
    await mailsLoadMessages();
    mailsRenderReadEmpty();
    await mailsLoadUserSettings();
    if (mailsViewMode === 'compose') {
        mailsRefreshComposeSignature();
    }
}

async function mailsSwitchFolder(folderKey) {
    if (!(await mailsLeaveComposeIfNeeded())) return;
    mailsActiveFolder = folderKey;
    mailsCurrentUid = null;
    mailsCurrentMessage = null;
    mailsViewMode = 'read';
    mailsPage = 1;
    mailsClearSelection();
    document.querySelectorAll('.mails-folder-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes("'" + folderKey + "'"));
    });
    mailsUpdateTrashActions();
    await mailsLoadMessages();
    mailsRenderReadEmpty();
}

async function mailsLoadMessages() {
    const list = document.getElementById('mailsList');
    if (!list || !mailsActiveBoxId) return;
    list.innerHTML = '<div class="mails-list-loading">Chargement…</div>';
    try {
        const unreadParam = mailsUnreadOnly ? '&unread=1' : '';
        const data = await apiCall(
            `email.php?action=list&mailbox_id=${mailsActiveBoxId}&folder=${encodeURIComponent(mailsActiveFolder)}&page=${mailsPage}&limit=50${unreadParam}`,
            'GET'
        );
        mailsMessages = data?.messages || [];
        mailsFilterList(document.getElementById('mailsSearchInput')?.value || '');
    } catch (e) {
        list.innerHTML = `<div class="mails-list-error">${escapeHtml(e.message || 'Erreur')}</div>`;
    }
}

async function mailsToggleUnreadFilter() {
    mailsUnreadOnly = !mailsUnreadOnly;
    mailsUpdateUnreadFilterButton();
    mailsPage = 1;
    mailsCurrentUid = null;
    mailsCurrentMessage = null;
    mailsRenderReadEmpty();
    await mailsLoadMessages();
}

function mailsUpdateUnreadFilterButton() {
    const btn = document.getElementById('mailsUnreadFilterBtn');
    if (!btn) return;
    btn.classList.toggle('active', mailsUnreadOnly);
    btn.setAttribute('aria-pressed', mailsUnreadOnly ? 'true' : 'false');
}

function mailsFilterList(query) {
    const q = (query !== undefined ? query : (document.getElementById('mailsSearchInput')?.value || '')).toLowerCase().trim();
    let filtered = mailsMessages;
    if (mailsUnreadOnly) {
        filtered = filtered.filter(m => !m.seen);
    }
    if (q) {
        filtered = filtered.filter(m =>
            (m.subject || '').toLowerCase().includes(q) ||
            (m.from || '').toLowerCase().includes(q)
        );
    }
    mailsRenderList(filtered);
    mailsUpdateTrashActions();
}

function mailsRenderList(messages) {
    const list = document.getElementById('mailsList');
    if (!list) return;
    const selectable = mailsIsBulkSelectableFolder();
    if (!messages.length) {
        const emptyMsg = mailsUnreadOnly
            ? 'Aucun message non lu'
            : (document.getElementById('mailsSearchInput')?.value?.trim()
                ? 'Aucun message ne correspond à la recherche'
                : 'Aucun message dans ce dossier');
        list.innerHTML = `<div class="mails-list-empty">${emptyMsg}</div>`;
        return;
    }
    list.innerHTML = messages.map(m => {
        const active = mailsCurrentUid === m.uid ? ' active' : '';
        const unread = m.seen ? '' : ' unread';
        const selected = mailsSelectedUids.has(m.uid) ? ' selected' : '';
        const att = m.has_attachments ? ' 📎' : '';
        const check = selectable ? `
            <label class="mails-item-check" onclick="event.stopPropagation()">
                <input type="checkbox" ${mailsSelectedUids.has(m.uid) ? 'checked' : ''}
                    onchange="mailsOnSelectUid(${m.uid}, this.checked)" aria-label="Sélectionner">
            </label>` : '';
        return `
            <div class="mails-item${active}${unread}${selected}${selectable ? ' mails-item--selectable' : ''}" data-uid="${m.uid}">
                ${check}
                <div class="mails-item-body" onclick="mailsOpenMessage(${m.uid})">
                    <div class="mails-item-top">
                        <span class="mails-item-from">${escapeHtml(mailsShortFrom(m.from))}</span>
                        <span class="mails-item-date">${escapeHtml(mailsFormatDate(m.date))}</span>
                    </div>
                    <div class="mails-item-subject">${escapeHtml(m.subject || '(sans objet)')}${att}</div>
                </div>
            </div>`;
    }).join('');
}

function mailsShortFrom(from) {
    if (!from) return '—';
    const m = from.match(/^([^<]+)</);
    if (m) return m[1].trim().replace(/"/g, '');
    if (from.length > 36) return from.slice(0, 36) + '…';
    return from;
}

function mailsParseEmailAddress(raw) {
    if (!raw) return '';
    const m = raw.match(/<([^>]+)>/);
    return (m ? m[1] : raw).trim();
}

function mailsFormatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function mailsRenderReadEmpty() {
    mailsViewMode = 'read';
    const empty = document.getElementById('mailsReadEmpty');
    const panel = document.getElementById('mailsReadPanel');
    const compose = document.getElementById('mailsComposePanel');
    const col = document.getElementById('mailsReadCol');
    if (empty) empty.style.display = mailsCurrentUid ? 'none' : 'flex';
    if (panel) panel.style.display = 'none';
    if (compose) compose.style.display = 'none';
    if (col) col.classList.remove('mails-read-col--compose');
}

function mailsShowReadPanel() {
    mailsViewMode = 'read';
    const empty = document.getElementById('mailsReadEmpty');
    const panel = document.getElementById('mailsReadPanel');
    const compose = document.getElementById('mailsComposePanel');
    const col = document.getElementById('mailsReadCol');
    if (empty) empty.style.display = 'none';
    if (panel) panel.style.display = 'flex';
    if (compose) compose.style.display = 'none';
    if (col) col.classList.remove('mails-read-col--compose');
    requestAnimationFrame(() => mailsSyncReadPanelLayout());
}

async function mailsOpenMessage(uid) {
    if (!(await mailsLeaveComposeIfNeeded())) return;
    if (mailsActiveFolder === 'Drafts') {
        await mailsOpenDraft(uid);
        return;
    }
    mailsCurrentUid = uid;
    mailsViewMode = 'read';
    const prevMsg = mailsMessages.find(m => m.uid === uid);
    const wasUnread = !!(prevMsg && !prevMsg.seen && mailsActiveFolder === 'INBOX');
    document.querySelectorAll('.mails-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.uid, 10) === uid);
    });
    const panel = document.getElementById('mailsReadPanel');
    if (!panel) return;
    panel.style.display = 'flex';
    panel.innerHTML = '<div class="mails-list-loading" style="padding:2rem;">Chargement…</div>';
    mailsShowReadPanel();
    try {
        const data = await apiCall(
            `email.php?action=read&mailbox_id=${mailsActiveBoxId}&folder=${encodeURIComponent(mailsActiveFolder)}&uid=${uid}`,
            'GET'
        );
        mailsCurrentMessage = data?.message;
        mailsRenderMessage(mailsCurrentMessage);
        const idx = mailsMessages.findIndex(m => m.uid === uid);
        if (idx >= 0) mailsMessages[idx].seen = true;
        if (wasUnread) mailsAdjustUnreadCount(mailsActiveBoxId, -1);
        mailsFilterList(document.getElementById('mailsSearchInput')?.value || '');
    } catch (e) {
        panel.innerHTML = `<div class="mails-list-error">${escapeHtml(e.message || 'Erreur')}</div>`;
    }
}

function mailsSenderInitials(from) {
    const name = mailsShortFrom(from);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name[0] || '?').toUpperCase();
}

function mailsRenderMessage(msg) {
    const panel = document.getElementById('mailsReadPanel');
    if (!panel || !msg) return;
    panel.className = 'mails-read-panel';

    const attachments = (msg.attachments || []).map(att => `
        <button type="button" class="mails-attachment"
            data-part="${escapeHtml(att.part)}"
            data-filename="${escapeHtml(att.filename)}"
            data-mime="${escapeHtml(att.mime || '')}"
            data-size="${att.size || 0}"
            onclick="mailsOpenAttachmentMenu(this)">
            📎 ${escapeHtml(att.filename)}${att.size ? ' (' + mailsFormatSize(att.size) + ')' : ''}
        </button>
    `).join('');

    let bodyHtml = '';
    if (msg.body_html) {
        bodyHtml = `<iframe class="mails-body-frame" id="mailsBodyFrame" title="Contenu du message" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc="${mailsBuildSrcdoc(msg.body_html)}"></iframe>`;
    } else {
        bodyHtml = `<div class="mails-body-text mails-body-text--linked" onclick="mailsBodyTextLinkClick(event)">${mailsLinkifyPlainTextBody(msg.body_text || '')}</div>`;
    }

    const toLine = [msg.to, msg.cc].filter(Boolean).join(' · ');
    const moveButtons = mailsMoveToolbarButtons();

    panel.innerHTML = `
        <div class="mails-read-toolbar">
            <button type="button" class="mails-tool-btn" onclick="mailsReply()" title="Répondre">↩ <span>Répondre</span></button>
            <button type="button" class="mails-tool-btn" onclick="mailsReplyAll()" title="Répondre à tous">↩↩ <span>Répondre à tous</span></button>
            <button type="button" class="mails-tool-btn" onclick="mailsForward()" title="Transférer">↪ <span>Transférer</span></button>
            <button type="button" class="mails-tool-btn" onclick="mailsMarkUnread()" title="Marquer comme non lu">✉ <span>Non lu</span></button>
            ${moveButtons}
        </div>
        <div class="mails-read-header">
            <h1 class="mails-read-subject">${escapeHtml(msg.subject || '(sans objet)')}</h1>
            <div class="mails-read-sender-row">
                <div class="mails-read-avatar">${escapeHtml(mailsSenderInitials(msg.from))}</div>
                <div class="mails-read-sender-info">
                    <div class="mails-read-sender-name">${escapeHtml(mailsShortFrom(msg.from))}</div>
                    <div class="mails-read-sender-to">
                        <span>à ${escapeHtml(toLine || '—')}</span>
                    </div>
                </div>
                <div class="mails-read-date">${escapeHtml(mailsFormatMessageDate(msg.date))}</div>
            </div>
            ${attachments ? `<div class="mails-attachments">${attachments}</div>` : ''}
        </div>
        <div class="mails-read-body">${bodyHtml}</div>`;

    const frame = document.getElementById('mailsBodyFrame');
    if (frame) mailsInitBodyFrame(frame);
    mailsSyncReadPanelLayout();
}

function mailsLinkifyPlainTextBody(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/(mailto:[^\s&]+)/gi, '<a href="$1" class="mails-mailto-link">$1</a>');
}

function mailsBuildSrcdoc(html) {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        html,body{height:100%;margin:0;}
        body{padding:12px 20px 24px;font-family:'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#202124;word-wrap:break-word;overflow:auto;box-sizing:border-box;}
        img{max-width:100%;height:auto;} table{max-width:100%;}
        a{color:#1a73e8;text-decoration:underline;cursor:pointer;}
        a[href^="mailto:"]{color:#1a73e8;}
    </style></head><body>${html}</body></html>`;
    return doc.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function mailsParseMailtoHref(href) {
    if (!href || !/^mailto:/i.test(href)) {
        return { to: '', cc: '', subject: '', body: '' };
    }
    try {
        const url = new URL(href);
        const path = decodeURIComponent((url.pathname || '').replace(/^\/+/, ''));
        const to = path || decodeURIComponent(url.hostname || '');
        return {
            to: to,
            cc: url.searchParams.get('cc') || '',
            subject: url.searchParams.get('subject') || '',
            body: url.searchParams.get('body') || '',
        };
    } catch (e) {
        const raw = href.replace(/^mailto:/i, '');
        const qIdx = raw.indexOf('?');
        const to = decodeURIComponent((qIdx >= 0 ? raw.slice(0, qIdx) : raw).trim());
        return { to, cc: '', subject: '', body: '' };
    }
}

async function mailsOpenMailtoLink(href) {
    const p = mailsParseMailtoHref(href);
    if (!p.to) return;
    await mailsOpenCompose({
        to: p.to,
        cc: p.cc || '',
        subject: p.subject || '',
        body: p.body || '',
    });
}
window.mailsOpenMailtoLink = mailsOpenMailtoLink;

function mailsBodyTextLinkClick(e) {
    const a = e.target && e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
    if (!a) return;
    e.preventDefault();
    mailsOpenMailtoLink(a.getAttribute('href') || '');
}
window.mailsBodyTextLinkClick = mailsBodyTextLinkClick;

function mailsWireBodyFrameLinks(iframe) {
    if (!iframe || iframe.dataset.linksBound === '1') return;
    try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || !doc.body) return;
        iframe.dataset.linksBound = '1';
        doc.addEventListener('click', function(e) {
            const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            const href = (a.getAttribute('href') || '').trim();
            if (!href) return;
            if (/^mailto:/i.test(href)) {
                e.preventDefault();
                e.stopPropagation();
                mailsOpenMailtoLink(href);
                return;
            }
            if (/^https?:\/\//i.test(href)) {
                e.preventDefault();
                e.stopPropagation();
                window.open(href, '_blank', 'noopener,noreferrer');
            }
        }, true);
    } catch (err) {
        console.warn('mailsWireBodyFrameLinks:', err);
    }
}

function mailsInitBodyFrame(iframe) {
    iframe.style.height = '100%';
    iframe.style.minHeight = '0';
    iframe.onload = function() {
        iframe.dataset.linksBound = '';
        mailsWireBodyFrameLinks(iframe);
    };
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        iframe.dataset.linksBound = '';
        mailsWireBodyFrameLinks(iframe);
    }
}

function mailsSyncReadPanelLayout() {
    const col = document.getElementById('mailsReadCol');
    const panel = document.getElementById('mailsReadPanel');
    if (!col || !panel || getComputedStyle(panel).display === 'none') return;
    const body = panel.querySelector('.mails-read-body');
    if (!body) return;
    const toolbar = panel.querySelector('.mails-read-toolbar');
    const header = panel.querySelector('.mails-read-header');
    const chrome = (toolbar?.offsetHeight || 0) + (header?.offsetHeight || 0);
    const available = Math.max(160, col.clientHeight - chrome);
    body.style.height = available + 'px';
    body.style.maxHeight = available + 'px';
    body.style.flex = '0 0 auto';
    const frame = body.querySelector('.mails-body-frame');
    if (frame) mailsInitBodyFrame(frame);
}

function mailsFormatMessageDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString('fr-FR', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch (e) {
        return dateStr;
    }
}

function mailsAttachmentUrl(part) {
    const token = encodeURIComponent(authToken || '');
    return `${API_URL}/email_attachment.php?mailbox_id=${mailsActiveBoxId}&folder=${encodeURIComponent(mailsActiveFolder)}&uid=${mailsCurrentUid}&part=${encodeURIComponent(part)}&token=${token}`;
}

function mailsFormatSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

function mailsReply() {
    if (!mailsCurrentMessage) return;
    const to = mailsParseEmailAddress(mailsCurrentMessage.from);
    const subject = mailsCurrentMessage.subject || '';
    const reSubject = /^re:/i.test(subject) ? subject : 'Re: ' + subject;
    const quote = mailsQuoteBody(mailsCurrentMessage);
    mailsOpenCompose({ to, subject: reSubject, body: quote, in_reply_to: mailsCurrentMessage.message_id || '' });
}

function mailsReplyAll() {
    if (!mailsCurrentMessage) return;
    const myEmail = (mailsActiveBox()?.email || '').toLowerCase();
    const sender = (mailsParseEmailAddress(mailsCurrentMessage.from) || '').toLowerCase();
    const all = mailsParseEmailList([mailsCurrentMessage.to, mailsCurrentMessage.cc].filter(Boolean).join(';'))
        .filter(e => e && e !== myEmail);
    if (sender && all.indexOf(sender) === -1) {
        all.unshift(sender);
    }
    const to = all[0] || '';
    const cc = all.slice(1).join(', ');
    const subject = mailsCurrentMessage.subject || '';
    const reSubject = /^re:/i.test(subject) ? subject : 'Re: ' + subject;
    mailsOpenCompose({
        to,
        cc,
        subject: reSubject,
        body: mailsQuoteBody(mailsCurrentMessage),
        in_reply_to: mailsCurrentMessage.message_id || '',
    });
}

function mailsSplitAddresses(raw) {
    if (!raw) return [];
    return raw.split(',').map(s => mailsParseEmailAddress(s.trim())).filter(Boolean);
}

function mailsQuoteBody(msg) {
    const header = `\n\nLe ${msg.date || ''}, ${msg.from || ''} a écrit :\n`;
    return header + (msg.body_text || '').replace(/^/gm, '> ');
}

function mailsForward() {
    if (!mailsCurrentMessage) return;
    const subject = mailsCurrentMessage.subject || '';
    const fwSubject = /^(fwd:|tr:)/i.test(subject) ? subject : 'Fwd: ' + subject;
    const body = '\n\n---------- Message transféré ----------\n'
        + 'De : ' + (mailsCurrentMessage.from || '') + '\n'
        + 'Date : ' + (mailsCurrentMessage.date || '') + '\n'
        + 'Objet : ' + (mailsCurrentMessage.subject || '') + '\n'
        + 'À : ' + (mailsCurrentMessage.to || '') + '\n\n'
        + (mailsCurrentMessage.body_text || '');
    mailsOpenCompose({ subject: fwSubject, body });
}

async function mailsMarkUnread() {
    if (!mailsCurrentUid || !mailsActiveBoxId) return;
    try {
        await apiCall('email.php', 'POST', {
            action: 'mark_unread',
            mailbox_id: mailsActiveBoxId,
            folder: mailsActiveFolder,
            uid: mailsCurrentUid,
        });
        const idx = mailsMessages.findIndex(m => m.uid === mailsCurrentUid);
        const wasRead = idx >= 0 && mailsMessages[idx].seen;
        if (idx >= 0) mailsMessages[idx].seen = false;
        if (wasRead && mailsActiveFolder === 'INBOX') mailsAdjustUnreadCount(mailsActiveBoxId, 1);
        mailsFilterList(document.getElementById('mailsSearchInput')?.value || '');
        if (typeof showToast === 'function') showToast('Marqué comme non lu', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

function mailsMoveToolbarButtons() {
    const parts = [];
    if (mailsIsTrashFolder()) {
        parts.push('<button type="button" class="mails-tool-btn mails-tool-btn--danger" onclick="mailsDeleteCurrentPermanent()" title="Supprimer définitivement">🗑️ <span>Supprimer définitivement</span></button>');
        return parts.join('');
    }
    if (mailsActiveFolder !== 'Trash') {
        parts.push('<button type="button" class="mails-tool-btn mails-tool-btn--danger" onclick="mailsMoveMessage(\'Trash\')" title="Mettre à la corbeille">🗑️ <span>Corbeille</span></button>');
    }
    if (mailsActiveFolder !== 'Spam') {
        parts.push('<button type="button" class="mails-tool-btn mails-tool-btn--warn" onclick="mailsMoveMessage(\'Spam\')" title="Signaler comme indésirable">⚠️ <span>Indésirable</span></button>');
    }
    return parts.join('');
}

async function mailsMoveMessage(targetFolder) {
    if (!mailsCurrentUid || !mailsActiveBoxId) return;
    const labels = { Trash: 'la corbeille', Spam: 'les indésirables' };
    const label = labels[targetFolder] || targetFolder;
    if (!confirm('Déplacer ce message vers ' + label + ' ?')) return;
    try {
        await apiCall('email.php', 'POST', {
            action: 'move',
            mailbox_id: mailsActiveBoxId,
            folder: mailsActiveFolder,
            uid: mailsCurrentUid,
            target_folder: targetFolder,
        });
        const idx = mailsMessages.findIndex(m => m.uid === mailsCurrentUid);
        const wasUnread = idx >= 0 && !mailsMessages[idx].seen;
        mailsMessages = mailsMessages.filter(m => m.uid !== mailsCurrentUid);
        mailsCurrentUid = null;
        mailsCurrentMessage = null;
        mailsRenderReadEmpty();
        mailsFilterList(document.getElementById('mailsSearchInput')?.value || '');
        if (wasUnread && mailsActiveFolder === 'INBOX') mailsAdjustUnreadCount(mailsActiveBoxId, -1);
        if (typeof showToast === 'function') showToast('Message déplacé vers ' + label, 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsOpenCompose(opts = {}) {
    if (mailsViewMode === 'compose') {
        if (!(await mailsAttemptLeaveCompose())) return;
        mailsCloseCompose(true);
    }
    await mailsLoadUserSettings();
    mailsViewMode = 'compose';
    mailsComposeAttachments = [];
    const empty = document.getElementById('mailsReadEmpty');
    const panel = document.getElementById('mailsReadPanel');
    const compose = document.getElementById('mailsComposePanel');
    const col = document.getElementById('mailsReadCol');
    if (empty) empty.style.display = 'none';
    if (panel) panel.style.display = 'none';
    if (col) col.classList.add('mails-read-col--compose');
    if (!compose) return;

    const title = opts.draft_uid
        ? 'Brouillon'
        : (opts.in_reply_to ? 'Répondre' : (opts.subject && /^fwd:/i.test(opts.subject) ? 'Transférer' : 'Nouveau message'));
    mailsComposeDraftUid = opts.draft_uid || null;
    mailsComposeSkipLeaveCheck = false;

    compose.style.display = 'flex';
    compose.innerHTML = `
        <div class="mails-compose-panel">
            <div class="mails-compose-header">
                <h2>${escapeHtml(title)}</h2>
                <div class="mails-compose-header-actions">
                    ${opts.draft_uid ? '<button type="button" class="mails-tool-btn mails-tool-btn--danger" onclick="mailsDeleteCurrentDraft()">🗑️ Supprimer</button>' : ''}
                    <button type="button" class="mails-tool-btn" onclick="mailsCloseCompose()">✕ Fermer</button>
                </div>
            </div>
            <div class="mails-compose-fields">
                <div class="mails-compose-row">
                    <label>À</label>
                    <div class="mails-compose-autocomplete">
                        <input type="text" id="mailsComposeTo" placeholder="destinataires@exemple.com" value="${escapeHtml(opts.to || '')}" autocomplete="off"
                            oninput="mailsComposeSuggest(event, 'to');mailsUpdateRecipientCount()" onkeydown="mailsComposeSuggestKey(event, 'to')" onfocus="mailsComposeSuggest(event, 'to')" onblur="mailsComposeSuggestBlur('to')">
                        <div class="mails-compose-suggest-list" id="mailsComposeToSuggest" role="listbox" style="display:none;"></div>
                    </div>
                    <div class="mails-compose-toggles">
                        <button type="button" class="mails-compose-toggle" onclick="mailsToggleComposeField('cc')">Cc</button>
                        <button type="button" class="mails-compose-toggle" onclick="mailsToggleComposeField('bcc')">Cci</button>
                    </div>
                </div>
                <div class="mails-compose-row mails-compose-row--hidden" id="mailsComposeCcRow">
                    <label>Cc</label>
                    <div class="mails-compose-autocomplete">
                        <input type="text" id="mailsComposeCc" value="${escapeHtml(opts.cc || '')}" autocomplete="off"
                            oninput="mailsComposeSuggest(event, 'cc');mailsUpdateRecipientCount()" onkeydown="mailsComposeSuggestKey(event, 'cc')" onfocus="mailsComposeSuggest(event, 'cc')" onblur="mailsComposeSuggestBlur('cc')">
                        <div class="mails-compose-suggest-list" id="mailsComposeCcSuggest" role="listbox" style="display:none;"></div>
                    </div>
                </div>
                <div class="mails-compose-row mails-compose-row--hidden" id="mailsComposeBccRow">
                    <label>Cci</label>
                    <div class="mails-compose-autocomplete">
                        <input type="text" id="mailsComposeBcc" value="${escapeHtml(opts.bcc || '')}" autocomplete="off"
                            oninput="mailsComposeSuggest(event, 'bcc');mailsUpdateRecipientCount()" onkeydown="mailsComposeSuggestKey(event, 'bcc')" onfocus="mailsComposeSuggest(event, 'bcc')" onblur="mailsComposeSuggestBlur('bcc')">
                        <div class="mails-compose-suggest-list" id="mailsComposeBccSuggest" role="listbox" style="display:none;"></div>
                    </div>
                </div>
                <div class="mails-compose-row">
                    <label>Objet</label>
                    <input type="text" id="mailsComposeSubject" value="${escapeHtml(opts.subject || '')}">
                </div>
            </div>
            <div class="mails-compose-body-wrap">
                <div id="mailsComposeBody" class="mails-compose-editor" contenteditable="true" data-placeholder="Écrivez votre message…"></div>
            </div>
            <div class="mails-compose-att-list" id="mailsComposeAttList"></div>
            <div class="mails-compose-footer">
                <div class="mails-compose-footer-left">
                    <label class="mails-tool-btn" style="cursor:pointer;">
                        📎 Joindre
                        <input type="file" id="mailsComposeFiles" multiple style="display:none;" onchange="mailsOnComposeFiles(event)">
                    </label>
                </div>
                <div class="mails-compose-footer-actions">
                    <span id="mailsComposeRecipientCount" class="mails-compose-recipient-count" aria-live="polite"></span>
                    <button type="button" class="mails-compose-draft" id="mailsComposeDraftBtn" onclick="mailsSaveDraft()">Enregistrer brouillon</button>
                    <button type="button" class="mails-compose-send" id="mailsComposeSendBtn" onclick="mailsSend()">Envoyer</button>
                </div>
            </div>
            <input type="hidden" id="mailsComposeReplyTo" value="${escapeHtml(opts.in_reply_to || '')}">
        </div>`;

    if (opts.cc) mailsToggleComposeField('cc', true);
    if (opts.bcc) mailsToggleComposeField('bcc', true);
    mailsInitComposeEditor(mailsBuildComposeInitialHtml(opts));
    mailsLoadRecipientSuggestions();
    mailsComposeInitialState = mailsCaptureComposeState();
    mailsUpdateRecipientCount();
}

function mailsGetComposeBodyEl() {
    return document.getElementById('mailsComposeBody');
}

function mailsGetSignatureHtmlForCompose() {
    const html = (mailsUserSettings.signature_html || '').trim();
    if (!html || mailsUserSettings.signature_enabled === false) return '';
    return mailsCleanSignatureHtml(html);
}

function mailsComposeInputZoneHtml() {
    return '<div class="' + MAILS_COMPOSE_INPUT_CLASS + '"><br></div>';
}

function mailsComposeSignatureBlockHtml() {
    const sig = mailsGetSignatureHtmlForCompose();
    if (!sig) return '';
    return '<div class="mails-compose-signature-block" contenteditable="false" ' + MAILS_COMPOSE_SIG_ATTR + '="1">' + sig + '</div>';
}

function mailsWrapPlainTextAsHtml(text) {
    if (!text) return '';
    return '<div class="mails-compose-plain" style="white-space:pre-wrap;">' + escapeHtml(text) + '</div>';
}

function mailsComposeBodyHasSignature(html) {
    return (html || '').indexOf(MAILS_COMPOSE_SIG_ATTR) !== -1;
}

function mailsShouldIncludeSignatureInCompose(opts) {
    if (opts && (opts.skip_signature || opts.draft_uid)) return false;
    return mailsUserSettings.signature_enabled !== false && !!mailsGetSignatureHtmlForCompose();
}

function mailsBuildComposeInitialHtml(opts) {
    opts = opts || {};
    const existing = (opts.body || '').trim();
    const includeSig = mailsShouldIncludeSignatureInCompose(opts);

    if (existing) {
        let html = opts.is_html ? existing : mailsWrapPlainTextAsHtml(existing);
        if (includeSig && !mailsComposeBodyHasSignature(html)) {
            if (opts.in_reply_to && !opts.is_html && existing.includes('\n\nLe ')) {
                const splitIdx = existing.indexOf('\n\nLe ');
                const userPart = existing.slice(0, splitIdx);
                const quotePart = existing.slice(splitIdx);
                html = (userPart.trim() ? mailsWrapPlainTextAsHtml(userPart) : mailsComposeInputZoneHtml())
                    + mailsComposeSignatureBlockHtml()
                    + mailsWrapPlainTextAsHtml(quotePart);
            } else if (opts.in_reply_to || /^fwd:/i.test(opts.subject || '')) {
                html = mailsComposeInputZoneHtml() + mailsComposeSignatureBlockHtml() + html;
            } else {
                html += mailsComposeSignatureBlockHtml();
            }
        }
        return html || mailsComposeInputZoneHtml();
    }

    let html = mailsComposeInputZoneHtml();
    if (includeSig) html += mailsComposeSignatureBlockHtml();
    return html;
}

function mailsGetComposeInputZone(el) {
    el = el || mailsGetComposeBodyEl();
    if (!el) return null;
    return el.querySelector('.' + MAILS_COMPOSE_INPUT_CLASS)
        || el.querySelector(':scope > div:not([' + MAILS_COMPOSE_SIG_ATTR + ']):not(.mails-compose-signature-sep):not(.mails-compose-signature-block):not(.mails-compose-plain)');
}

function mailsFocusComposeStart() {
    const el = mailsGetComposeBodyEl();
    if (!el) return;
    el.scrollTop = 0;

    const zone = mailsGetComposeInputZone(el);
    const range = document.createRange();
    const sel = window.getSelection();

    if (zone) {
        if (!zone.childNodes.length) {
            zone.appendChild(document.createElement('br'));
        }
        const br = zone.querySelector('br');
        if (br) {
            range.setStartBefore(br);
        } else {
            range.setStart(zone, 0);
        }
        range.collapse(true);
    } else {
        range.selectNodeContents(el);
        range.collapse(true);
    }

    el.focus({ preventScroll: true });
    if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
    }
    el.scrollTop = 0;
    if (el.parentElement) el.parentElement.scrollTop = 0;
}

function mailsBindComposeEditorFocus() {
    const el = mailsGetComposeBodyEl();
    if (!el || el.dataset.focusBound === '1') return;
    el.dataset.focusBound = '1';

    el.addEventListener('click', function(e) {
        if (e.target.closest('[data-mail-signature], .mails-compose-signature-block, .mails-compose-signature-sep')) {
            e.preventDefault();
            mailsFocusComposeStart();
        }
    });

    el.addEventListener('focusin', function() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const node = sel.anchorNode;
        if (!node) return;
        const inSig = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
            ?.closest('[data-mail-signature], .mails-compose-signature-block');
        if (inSig) {
            mailsFocusComposeStart();
        }
    });
}

function mailsInitComposeEditor(html) {
    const el = mailsGetComposeBodyEl();
    if (!el) return;
    el.innerHTML = html || mailsComposeInputZoneHtml();
    mailsBindComposeEditorFocus();
    requestAnimationFrame(function() {
        mailsFocusComposeStart();
        requestAnimationFrame(mailsFocusComposeStart);
    });
}

function mailsStripComposeSignatureFromClone(clone) {
    const block = clone.querySelector('[' + MAILS_COMPOSE_SIG_ATTR + ']');
    if (block) {
        const sep = block.previousElementSibling;
        if (sep && sep.classList.contains('mails-compose-signature-sep')) sep.remove();
        block.remove();
    }
    return clone;
}

function mailsGetComposeUserHtml() {
    const el = mailsGetComposeBodyEl();
    if (!el) return '';
    const clone = mailsStripComposeSignatureFromClone(el.cloneNode(true));
    return mailsCleanSignatureHtml(clone.innerHTML.trim());
}

function mailsGetComposeUserText() {
    const el = mailsGetComposeBodyEl();
    if (!el) return '';
    const clone = mailsStripComposeSignatureFromClone(el.cloneNode(true));
    return (clone.innerText || clone.textContent || '').trim();
}

function mailsGetComposeBodyHtml() {
    const el = mailsGetComposeBodyEl();
    if (!el) return '';
    return mailsCleanSignatureHtml(el.innerHTML.trim());
}

function mailsGetComposeBodyText() {
    const el = mailsGetComposeBodyEl();
    if (!el) return '';
    return (el.innerText || el.textContent || '').trim();
}

function mailsRefreshComposeSignature() {
    const el = mailsGetComposeBodyEl();
    if (!el) return;
    const block = el.querySelector('[' + MAILS_COMPOSE_SIG_ATTR + ']');
    const newSig = mailsGetSignatureHtmlForCompose();
    if (!newSig) {
        if (block) {
            const sep = block.previousElementSibling;
            if (sep && sep.classList.contains('mails-compose-signature-sep')) sep.remove();
            block.remove();
        }
        return;
    }
    if (block) {
        block.innerHTML = newSig;
        return;
    }
    const zone = mailsGetComposeInputZone(el);
    if (zone && zone.nextSibling) {
        zone.insertAdjacentHTML('afterend', mailsComposeSignatureBlockHtml());
    } else {
        el.insertAdjacentHTML('beforeend', mailsComposeSignatureBlockHtml());
    }
    mailsFocusComposeStart();
}

function mailsCaptureComposeState() {
    return {
        to: document.getElementById('mailsComposeTo')?.value || '',
        cc: document.getElementById('mailsComposeCc')?.value || '',
        bcc: document.getElementById('mailsComposeBcc')?.value || '',
        subject: document.getElementById('mailsComposeSubject')?.value || '',
        body: mailsGetComposeBodyHtml(),
        bodyText: mailsGetComposeBodyText(),
        attachmentsCount: mailsComposeAttachments.length,
        attachmentsKey: mailsComposeAttachments.map(a => a.filename + ':' + (a.data || '').length).join('|'),
    };
}

function mailsComposeHasContent(state) {
    state = state || mailsCaptureComposeState();
    return !!(state.to.trim() || state.cc.trim() || state.bcc.trim()
        || state.subject.trim() || state.body.trim() || state.attachmentsCount > 0);
}

function mailsComposeIsDirty() {
    if (mailsViewMode !== 'compose' || !mailsComposeInitialState) return false;
    const cur = mailsCaptureComposeState();
    const init = mailsComposeInitialState;
    return cur.to !== init.to
        || cur.cc !== init.cc
        || cur.bcc !== init.bcc
        || cur.subject !== init.subject
        || cur.body !== init.body
        || cur.attachmentsKey !== init.attachmentsKey;
}

function mailsEnsureDraftLeaveModal() {
    if (document.getElementById('mailsDraftLeaveModal')) return;
    const modal = document.createElement('div');
    modal.id = 'mailsDraftLeaveModal';
    modal.className = 'mails-draft-modal';
    modal.innerHTML = `
        <div class="mails-draft-modal-backdrop"></div>
        <div class="mails-draft-modal-panel" role="dialog" aria-modal="true">
            <h3>Message non envoyé</h3>
            <p>Enregistrer ce message comme brouillon avant de quitter ?</p>
            <div class="mails-draft-modal-actions">
                <button type="button" class="mails-draft-modal-btn mails-draft-modal-btn--danger" data-choice="discard">Supprimer</button>
                <button type="button" class="mails-draft-modal-btn" data-choice="cancel">Annuler</button>
                <button type="button" class="mails-draft-modal-btn mails-draft-modal-btn--primary" data-choice="save">Enregistrer brouillon</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function mailsShowDraftLeaveModal() {
    mailsEnsureDraftLeaveModal();
    const modal = document.getElementById('mailsDraftLeaveModal');
    return new Promise(resolve => {
        const done = (choice) => {
            modal.style.display = 'none';
            modal.querySelectorAll('[data-choice]').forEach(btn => {
                btn.onclick = null;
            });
            resolve(choice);
        };
        modal.style.display = 'flex';
        modal.querySelectorAll('[data-choice]').forEach(btn => {
            btn.onclick = () => done(btn.getAttribute('data-choice'));
        });
        const backdrop = modal.querySelector('.mails-draft-modal-backdrop');
        if (backdrop) backdrop.onclick = () => done('cancel');
    });
}

async function mailsAttemptLeaveCompose() {
    if (mailsViewMode !== 'compose' || mailsComposeSkipLeaveCheck) return true;
    if (!mailsComposeIsDirty()) return true;
    const choice = await mailsShowDraftLeaveModal();
    if (choice === 'cancel') return false;
    if (choice === 'save') {
        const ok = await mailsSaveDraft({ silent: true });
        if (!ok) return false;
    } else if (choice === 'discard' && mailsComposeDraftUid) {
        await mailsDeleteDraft(mailsComposeDraftUid, { silent: true });
    }
    mailsComposeSkipLeaveCheck = true;
    return true;
}

async function mailsDeleteDraft(uid, options = {}) {
    const silent = !!(options && options.silent);
    if (!mailsActiveBoxId || !uid) return false;
    try {
        await apiCall('email.php', 'POST', {
            action: 'delete_draft',
            mailbox_id: mailsActiveBoxId,
            uids: [uid],
        });
        if (mailsActiveFolder === 'Drafts') await mailsLoadMessages();
        return true;
    } catch (e) {
        if (!silent) alert('Erreur : ' + (e.message || e));
        return false;
    }
}

async function mailsLeaveComposeIfNeeded() {
    if (mailsViewMode !== 'compose') return true;
    const ok = await mailsAttemptLeaveCompose();
    if (!ok) return false;
    mailsCloseCompose(true);
    return true;
}

async function mailsOpenDraft(uid) {
    mailsCurrentUid = uid;
    document.querySelectorAll('.mails-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.uid, 10) === uid);
    });
    try {
        const data = await apiCall(
            `email.php?action=read&mailbox_id=${mailsActiveBoxId}&folder=${encodeURIComponent(mailsActiveFolder)}&uid=${uid}`,
            'GET'
        );
        const msg = data?.message;
        if (!msg) throw new Error('Brouillon introuvable');
        mailsOpenCompose({
            to: msg.to || '',
            cc: msg.cc || '',
            bcc: msg.bcc || '',
            subject: (msg.subject || '').replace(/^\(sans objet\)$/i, ''),
            body: (msg.body_html && msg.body_html.trim()) ? msg.body_html : (msg.body_text || ''),
            is_html: !!(msg.body_html && msg.body_html.trim()),
            in_reply_to: msg.message_id || '',
            draft_uid: uid,
        });
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsSaveDraft(options = {}) {
    const silent = !!(options && options.silent);
    if (!mailsActiveBoxId || mailsViewMode !== 'compose') return false;
    if (!mailsComposeHasContent()) {
        if (!silent) alert('Rien à enregistrer dans le brouillon');
        return false;
    }
    const btn = document.getElementById('mailsComposeDraftBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try {
        const data = await apiCall('email.php', 'POST', {
            action: 'save_draft',
            mailbox_id: mailsActiveBoxId,
            to: document.getElementById('mailsComposeTo')?.value.trim() || '',
            cc: document.getElementById('mailsComposeCc')?.value.trim() || '',
            bcc: document.getElementById('mailsComposeBcc')?.value.trim() || '',
            subject: document.getElementById('mailsComposeSubject')?.value.trim() || '',
            body: mailsGetComposeUserText(),
            body_html: mailsGetComposeBodyHtml(),
            in_reply_to: document.getElementById('mailsComposeReplyTo')?.value || '',
            attachments: mailsComposeAttachments,
            replace_uid: mailsComposeDraftUid || 0,
        });
        if (data?.draft_uid) mailsComposeDraftUid = data.draft_uid;
        mailsComposeInitialState = mailsCaptureComposeState();
        if (!silent) {
            if (typeof showToast === 'function') showToast('Brouillon enregistré', 'success');
            else alert('Brouillon enregistré');
        }
        if (mailsActiveFolder === 'Drafts') await mailsLoadMessages();
        return true;
    } catch (e) {
        if (!silent) alert('Erreur : ' + (e.message || e));
        return false;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer brouillon'; }
    }
}

function mailsComposeInputId(fieldKey) {
    if (fieldKey === 'cc') return 'mailsComposeCc';
    if (fieldKey === 'bcc') return 'mailsComposeBcc';
    return 'mailsComposeTo';
}

function mailsComposeSuggestListId(fieldKey) {
    return mailsComposeInputId(fieldKey) + 'Suggest';
}

function mailsParseEmailList(raw) {
    const emails = new Set();
    const text = (raw || '').trim();
    if (!text) return [];

    const add = (candidate) => {
        candidate = (candidate || '').trim().replace(/^<|>$/g, '').toLowerCase();
        if (!candidate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return;
        if (candidate.endsWith('@lcom-gestion') || candidate.endsWith('@lcom-gestion.local') || candidate.endsWith('.local')) return;
        emails.add(candidate);
    };

    const bracketRe = /<([^<>\s]+@[^<>\s]+)>/g;
    let m;
    while ((m = bracketRe.exec(text)) !== null) add(m[1]);

    text.split(/[;,]/).forEach(part => {
        part = part.trim();
        if (!part) return;
        const inner = part.match(/<([^>]+)>/);
        add(inner ? inner[1] : part);
    });

    return [...emails];
}

function mailsCountComposeRecipients() {
    const to = document.getElementById('mailsComposeTo')?.value.trim() || '';
    const cc = document.getElementById('mailsComposeCc')?.value.trim() || '';
    const bcc = document.getElementById('mailsComposeBcc')?.value.trim() || '';
    return mailsParseEmailList([to, cc, bcc].filter(Boolean).join(';')).length;
}

function mailsUpdateRecipientCount() {
    const el = document.getElementById('mailsComposeRecipientCount');
    if (!el) return;
    const n = mailsCountComposeRecipients();
    if (!n) {
        el.textContent = '';
        el.className = 'mails-compose-recipient-count';
        return;
    }
    el.textContent = n + ' destinataire' + (n > 1 ? 's' : '') + ' (= ' + n + ' envoi' + (n > 1 ? 's' : '') + ' OVH)';
    el.className = 'mails-compose-recipient-count' + (n > 5 ? ' mails-compose-recipient-count--warn' : '');
}

function mailsComposeParseEmails(raw) {
    return mailsParseEmailList(raw);
}

function mailsComposeCurrentToken(input) {
    const val = input.value || '';
    const idx = Math.max(val.lastIndexOf(','), val.lastIndexOf(';'));
    if (idx < 0) {
        return { prefix: '', query: val.trim() };
    }
    return {
        prefix: val.slice(0, idx + 1) + ' ',
        query: val.slice(idx + 1).trim(),
    };
}

function mailsFormatRecipientSuggestion(item) {
    const email = item.email || '';
    const name = (item.name || '').trim();
    if (name && name.toLowerCase() !== email.toLowerCase()) {
        return name + ' <' + email + '>';
    }
    return email;
}

async function mailsLoadRecipientSuggestions(query) {
    if (!mailsActiveBoxId) return [];
    const q = (query || '').trim();
    try {
        const url = `email.php?action=recipient_suggestions&mailbox_id=${mailsActiveBoxId}&limit=40` +
            (q ? `&q=${encodeURIComponent(q)}` : '');
        const data = await apiCall(url, 'GET');
        mailsRecipientSuggestions = data?.suggestions || [];
        return mailsRecipientSuggestions;
    } catch (e) {
        console.warn('mailsLoadRecipientSuggestions:', e);
        return mailsRecipientSuggestions;
    }
}

let mailsRecipientSuggestTimer = null;

async function mailsComposeSuggest(event, fieldKey) {
    const input = document.getElementById(mailsComposeInputId(fieldKey));
    const listEl = document.getElementById(mailsComposeSuggestListId(fieldKey));
    if (!input || !listEl) return;

    const token = mailsComposeCurrentToken(input);
    const query = token.query;
    const already = mailsComposeParseEmails(input.value);

    clearTimeout(mailsRecipientSuggestTimer);
    mailsRecipientSuggestTimer = setTimeout(async () => {
        await mailsLoadRecipientSuggestions(query);
        const matches = mailsRecipientSuggestions.filter(item => {
            const email = (item.email || '').toLowerCase();
            if (!email || already.includes(email)) return false;
            if (!query) return true;
            const hay = (email + ' ' + (item.name || '')).toLowerCase();
            return hay.includes(query.toLowerCase());
        }).slice(0, 8);

        mailsRecipientSuggestIndex[fieldKey] = -1;
        if (!matches.length) {
            listEl.style.display = 'none';
            listEl.innerHTML = '';
            return;
        }

        listEl.innerHTML = matches.map((item, i) => {
            const label = mailsFormatRecipientSuggestion(item);
            const source = item.source === 'crm' ? 'CRM' : 'Mail';
            return `<button type="button" class="mails-compose-suggest-item" role="option" data-index="${i}"
                onmousedown="event.preventDefault(); mailsComposePickSuggestion('${fieldKey}', ${i})">
                <span class="mails-compose-suggest-label">${escapeHtml(label)}</span>
                <span class="mails-compose-suggest-source">${escapeHtml(source)}</span>
            </button>`;
        }).join('');
        listEl.style.display = 'block';
        listEl._matches = matches;
    }, query ? 120 : 0);
}

function mailsComposeSuggestHide(fieldKey) {
    const listEl = document.getElementById(mailsComposeSuggestListId(fieldKey));
    if (listEl) {
        listEl.style.display = 'none';
        listEl.innerHTML = '';
        listEl._matches = [];
    }
    mailsRecipientSuggestIndex[fieldKey] = -1;
}

function mailsComposeSuggestBlur(fieldKey) {
    setTimeout(() => mailsComposeSuggestHide(fieldKey), 180);
}

function mailsComposePickSuggestion(fieldKey, index) {
    const listEl = document.getElementById(mailsComposeSuggestListId(fieldKey));
    const input = document.getElementById(mailsComposeInputId(fieldKey));
    if (!listEl || !input || !listEl._matches || !listEl._matches[index]) return;

    const item = listEl._matches[index];
    const token = mailsComposeCurrentToken(input);
    const formatted = mailsFormatRecipientSuggestion(item);
    if (token.prefix) {
        input.value = token.prefix + formatted + ', ';
    } else {
        input.value = formatted;
    }
    mailsComposeSuggestHide(fieldKey);
    input.focus();
}

function mailsComposeSuggestKey(event, fieldKey) {
    const listEl = document.getElementById(mailsComposeSuggestListId(fieldKey));
    if (!listEl || listEl.style.display === 'none' || !listEl._matches || !listEl._matches.length) {
        return;
    }
    const max = listEl._matches.length - 1;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        mailsRecipientSuggestIndex[fieldKey] = Math.min(max, (mailsRecipientSuggestIndex[fieldKey] || -1) + 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        mailsRecipientSuggestIndex[fieldKey] = Math.max(0, (mailsRecipientSuggestIndex[fieldKey] || 0) - 1);
    } else if (event.key === 'Enter' && mailsRecipientSuggestIndex[fieldKey] >= 0) {
        event.preventDefault();
        mailsComposePickSuggestion(fieldKey, mailsRecipientSuggestIndex[fieldKey]);
        return;
    } else if (event.key === 'Escape') {
        mailsComposeSuggestHide(fieldKey);
        return;
    } else {
        return;
    }
    listEl.querySelectorAll('.mails-compose-suggest-item').forEach((btn, i) => {
        btn.classList.toggle('is-active', i === mailsRecipientSuggestIndex[fieldKey]);
    });
}

function mailsToggleComposeField(field, forceShow) {
    const row = document.getElementById(field === 'cc' ? 'mailsComposeCcRow' : 'mailsComposeBccRow');
    if (!row) return;
    const show = forceShow === true ? true : row.classList.contains('mails-compose-row--hidden');
    row.classList.toggle('mails-compose-row--hidden', !show);
    if (show) {
        const input = row.querySelector('input');
        if (input) input.focus();
    }
}

function mailsCloseCompose(force) {
    if (!force && mailsViewMode === 'compose') {
        mailsAttemptLeaveCompose().then(ok => {
            if (ok) mailsCloseCompose(true);
        });
        return;
    }
    mailsViewMode = 'read';
    mailsComposeDraftUid = null;
    mailsComposeInitialState = null;
    mailsComposeSkipLeaveCheck = false;
    const compose = document.getElementById('mailsComposePanel');
    if (compose) {
        compose.style.display = 'none';
        compose.innerHTML = '';
    }
    mailsComposeAttachments = [];
    const col = document.getElementById('mailsReadCol');
    if (col) col.classList.remove('mails-read-col--compose');
    if (mailsCurrentUid && mailsCurrentMessage) {
        mailsShowReadPanel();
    } else {
        mailsRenderReadEmpty();
    }
}

async function mailsOnComposeFiles(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            alert('Fichier trop volumineux (max 10 Mo) : ' + file.name);
            continue;
        }
        const data = await mailsFileToBase64(file);
        mailsComposeAttachments.push({
            filename: file.name,
            mime: file.type || 'application/octet-stream',
            data,
        });
    }
    mailsRenderComposeAttList();
}

function mailsRenderComposeAttList() {
    const list = document.getElementById('mailsComposeAttList');
    if (!list) return;
    list.innerHTML = mailsComposeAttachments.map((a, i) =>
        `<span class="mails-compose-att">${escapeHtml(a.filename)} <button type="button" onclick="mailsRemoveComposeAtt(${i})">✕</button></span>`
    ).join('');
}

function mailsRemoveComposeAtt(index) {
    mailsComposeAttachments.splice(index, 1);
    mailsRenderComposeAttList();
}

function mailsFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result || '';
            resolve(String(res).split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function mailsSend(confirmLargeSend = false) {
    if (mailsSending) return;
    mailsSending = true;
    const btn = document.getElementById('mailsComposeSendBtn');
    try {
        const to = document.getElementById('mailsComposeTo')?.value.trim();
        if (!to) {
            alert('Destinataire requis');
            return;
        }
        const cc = document.getElementById('mailsComposeCc')?.value.trim() || '';
        const bcc = document.getElementById('mailsComposeBcc')?.value.trim() || '';
        const recipientList = mailsParseEmailList([to, cc, bcc].filter(Boolean).join(';'));
        const recipientCount = recipientList.length;
        if (recipientCount === 0) {
            alert('Aucune adresse e-mail valide dans À/Cc/Cci.');
            return;
        }
        if (recipientCount > 25 && !confirmLargeSend) {
            const preview = recipientList.slice(0, 8).join(', ') + (recipientList.length > 8 ? '…' : '');
            if (!confirm('Ce message comptera pour ' + recipientCount + ' envoi(s) OVH (limite 200/heure).\n\nDestinataires : ' + preview + '\n\nContinuer ?')) {
                return;
            }
            confirmLargeSend = true;
        } else if (recipientCount > 5 && !confirmLargeSend) {
            if (!confirm('Ce message sera envoyé à ' + recipientCount + ' destinataire(s). OVH compte chacun comme 1 envoi (max 200/heure). Continuer ?')) {
                return;
            }
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
        const data = await apiCall('email.php', 'POST', {
            action: 'send',
            mailbox_id: mailsActiveBoxId,
            to,
            cc,
            bcc,
            subject: document.getElementById('mailsComposeSubject')?.value.trim() || '',
            body: mailsGetComposeUserText(),
            body_html: mailsGetComposeBodyHtml(),
            in_reply_to: document.getElementById('mailsComposeReplyTo')?.value || '',
            attachments: mailsComposeAttachments,
            delete_draft_uid: mailsComposeDraftUid || 0,
            confirm_large_send: confirmLargeSend ? 1 : 0,
        });
        mailsComposeSkipLeaveCheck = true;
        mailsCloseCompose(true);
        const rcptN = data?.recipients || recipientCount;
        const rcptList = Array.isArray(data?.recipients_list) ? data.recipients_list : recipientList;
        const rcptPreview = rcptList.slice(0, 3).join(', ') + (rcptList.length > 3 ? ' (+' + (rcptList.length - 3) + ')' : '');
        let sentMsg = (data?.message || 'Message envoyé') + ' — ' + rcptN + ' destinataire(s) : ' + rcptPreview;
        if (typeof showToast === 'function') showToast(sentMsg, data?.append_warning ? 'warning' : 'success');
        else alert(sentMsg);
        await mailsLoadUserSettings();
        await mailsLoadMessages();
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsSending = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Envoyer'; }
    }
}

let currentUserHasMailboxes = false;

async function refreshMailsNavVisibility() {
    if (!authToken || !currentUser) {
        currentUserHasMailboxes = false;
        mailsBoxes = [];
        mailsUpdateNavBadge();
        mailsLastKnownUnreadTotal = 0;
        updateMailsNavVisibility();
        return;
    }
    try {
        const data = await apiCall('mailboxes.php?action=has', 'GET');
        currentUserHasMailboxes = !!(data && data.has_mailboxes);
        if (currentUserHasMailboxes) {
            try {
                await mailsFetchBoxes(false);
                mailsUpdateNavBadge();
                await mailsFetchUnreadCounts();
            } catch (e) {
                console.warn('refreshMailsNavVisibility: boîtes', e);
            }
        } else {
            mailsBoxes = [];
            mailsUpdateNavBadge();
            mailsLastKnownUnreadTotal = 0;
        }
    } catch (e) {
        currentUserHasMailboxes = false;
        mailsUpdateNavBadge();
        mailsLastKnownUnreadTotal = 0;
    }
    updateMailsNavVisibility();
}

function mailsIsPageActive() {
    return !!document.getElementById('mailsPage')?.classList.contains('active');
}

async function mailsFetchMessagesSilent() {
    if (!mailsActiveBoxId) return null;
    try {
        const unreadParam = mailsUnreadOnly ? '&unread=1' : '';
        const data = await apiCall(
            `email.php?action=list&mailbox_id=${mailsActiveBoxId}&folder=${encodeURIComponent(mailsActiveFolder)}&page=${mailsPage}&limit=50${unreadParam}`,
            'GET'
        );
        return data?.messages || [];
    } catch (e) {
        console.warn('mailsFetchMessagesSilent:', e);
        return null;
    }
}

function mailsMergePolledMessages(newMessages) {
    const openUid = mailsCurrentUid;
    const prevByUid = new Map(mailsMessages.map(m => [m.uid, m]));
    return newMessages.map(m => {
        const prev = prevByUid.get(m.uid);
        if (openUid != null && m.uid === openUid && prev?.seen) {
            return Object.assign({}, m, { seen: true });
        }
        return m;
    });
}

async function mailsPollPage() {
    if (!mailsIsPageActive() || !mailsActiveBoxId || mailsPollingBusy) return;
    if (mailsViewMode === 'compose') {
        await mailsFetchUnreadCounts();
        return;
    }
    mailsPollingBusy = true;
    try {
        const newMessages = await mailsFetchMessagesSilent();
        if (newMessages === null) return;
        const prevUids = new Set(mailsMessages.map(m => m.uid));
        mailsMessages = mailsMergePolledMessages(newMessages);
        mailsFilterList(document.getElementById('mailsSearchInput')?.value || '');
        await mailsFetchUnreadCounts();
        if (mailsCurrentUid && !newMessages.some(m => m.uid === mailsCurrentUid)) {
            mailsCurrentUid = null;
            mailsCurrentMessage = null;
            mailsRenderReadEmpty();
        }
        const hasNew = newMessages.some(m => !prevUids.has(m.uid));
        if (hasNew && mailsActiveFolder === 'INBOX' && typeof showToast === 'function') {
            const added = newMessages.filter(m => !prevUids.has(m.uid) && !m.seen).length;
            if (added > 0) {
                showToast(added === 1 ? '1 nouveau message' : added + ' nouveaux messages', 'info');
            }
        }
    } finally {
        mailsPollingBusy = false;
    }
}

function startMailsPolling() {
    stopMailsPolling();
    if (!mailsIsPageActive()) return;
    mailsPollPage();
    mailsPollingInterval = setInterval(() => {
        mailsPollPage();
    }, MAILS_POLL_INTERVAL_MS);
}

function stopMailsPolling() {
    if (mailsPollingInterval) {
        clearInterval(mailsPollingInterval);
        mailsPollingInterval = null;
    }
}

async function mailsRefreshBackgroundState() {
    if (!authToken || !currentUser || !currentUserHasMailboxes) return;
    if (!mailsBoxes.length) {
        try {
            await mailsFetchBoxes(false);
        } catch (e) {
            console.warn('mailsRefreshBackgroundState: boîtes', e);
            return;
        }
    }
    const prevTotal = mailsLastKnownUnreadTotal;
    await mailsFetchUnreadCounts();
    mailsLastKnownUnreadTotal = mailsTotalUnread();
    if (mailsLastKnownUnreadTotal > prevTotal && prevTotal >= 0 && !mailsIsPageActive()) {
        const added = mailsLastKnownUnreadTotal - prevTotal;
        if (typeof showToast === 'function') {
            showToast(
                added === 1 ? '1 nouveau mail non lu' : added + ' nouveaux mails non lus',
                'info'
            );
        }
    }
}

function startMailsBackgroundSync() {
    stopMailsBackgroundSync();
    mailsRefreshBackgroundState();
    mailsBackgroundSyncInterval = setInterval(() => {
        if (!authToken || !currentUser || !currentUserHasMailboxes) return;
        if (mailsIsPageActive()) return;
        mailsRefreshBackgroundState();
    }, MAILS_POLL_INTERVAL_MS);
}

function stopMailsBackgroundSync() {
    if (mailsBackgroundSyncInterval) {
        clearInterval(mailsBackgroundSyncInterval);
        mailsBackgroundSyncInterval = null;
    }
}

window.startMailsPolling = startMailsPolling;
window.stopMailsPolling = stopMailsPolling;
window.startMailsBackgroundSync = startMailsBackgroundSync;
window.stopMailsBackgroundSync = stopMailsBackgroundSync;

function updateMailsNavVisibility() {
    const nav = document.getElementById('navMailsItem');
    if (nav) nav.style.display = currentUserHasMailboxes ? '' : 'none';
}

// ========== Pièces jointes — actions ==========

let mailsPendingAttachment = null;
let mailsAttPickerState = null;
let mailsAttBusy = false;

function mailsEnsureAttPickerState(type) {
    if (!mailsAttPickerState) {
        mailsAttPickerState = { type: type || 'project', step: 'destination', folderId: null, projectId: null, dealId: null };
    }
    return mailsAttPickerState;
}

function mailsAttModalBackdropClick() {
    if (mailsAttBusy) return;
    mailsCloseAttModal();
}

function mailsEnsureAttModal() {
    if (document.getElementById('mailsAttModal')) return;
    const modal = document.createElement('div');
    modal.id = 'mailsAttModal';
    modal.className = 'mails-att-modal';
    modal.innerHTML = `
        <div class="mails-att-modal-backdrop" onclick="mailsAttModalBackdropClick()"></div>
        <div class="mails-att-modal-panel" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
            <div class="mails-att-modal-header">
                <h3 id="mailsAttModalTitle">Pièce jointe</h3>
                <button type="button" class="mails-att-modal-close" onclick="mailsCloseAttModal()">✕</button>
            </div>
            <p class="mails-att-modal-filename" id="mailsAttModalFilename"></p>
            <div class="mails-att-modal-body" id="mailsAttModalBody"></div>
        </div>`;
    document.body.appendChild(modal);
}

function mailsCloseAttModal(force) {
    if (mailsAttBusy && !force) return;
    const modal = document.getElementById('mailsAttModal');
    if (modal) modal.classList.remove('open');
    mailsAttPickerState = null;
}

function mailsOpenAttachmentMenu(btn) {
    if (btn && btn.dataset) {
        mailsPendingAttachment = {
            part: btn.dataset.part,
            filename: btn.dataset.filename || 'fichier',
            mime: btn.dataset.mime || '',
            size: parseInt(btn.dataset.size, 10) || 0,
        };
    }
    if (!mailsPendingAttachment) return;
    mailsEnsureAttModal();
    mailsAttShowActionMenu();
    document.getElementById('mailsAttModal').classList.add('open');
}

function mailsAttShowActionMenu() {
    document.getElementById('mailsAttModalTitle').textContent = 'Que faire avec ce fichier ?';
    document.getElementById('mailsAttModalFilename').textContent = mailsPendingAttachment.filename;
    document.getElementById('mailsAttModalBody').innerHTML = `
        <div class="mails-att-actions">
            <button type="button" class="mails-att-action-btn" onclick="mailsAttActionView()">👁️ Voir</button>
            <button type="button" class="mails-att-action-btn" onclick="mailsAttActionDownload()">⬇️ Télécharger</button>
            <button type="button" class="mails-att-action-btn" onclick="mailsAttStartPicker('crm')">📁 Ajouter à un dossier CRM</button>
            <button type="button" class="mails-att-action-btn" onclick="mailsAttStartPicker('project')">📂 Ajouter à un projet</button>
            <button type="button" class="mails-att-action-btn" onclick="mailsAttStartPicker('bureau')">🗂️ Ajouter à mon espace perso</button>
            <button type="button" class="mails-att-action-btn" onclick="mailsAttStartCompta()">💰 Envoyer en comptabilité</button>
        </div>`;
}

function mailsAttStartCompta() {
    document.getElementById('mailsAttModalTitle').textContent = 'Envoyer en comptabilité';
    document.getElementById('mailsAttModalBody').innerHTML = `
        <p class="mails-att-compta-hint">Choisissez le type de document à transmettre :</p>
        <div class="mails-att-actions">
            <button type="button" class="mails-att-action-btn" onclick="mailsAttSendAsFacture()">🧾 Facture fournisseur</button>
            <button type="button" class="mails-att-action-btn" onclick="mailsAttSendAsDevis()">📋 Devis fournisseur</button>
            <button type="button" class="mails-att-action-btn" onclick="mailsAttSendAsNdf()">💼 Note de frais</button>
        </div>
        <div class="mails-att-picker-footer">
            <button type="button" class="btn btn-secondary" onclick="mailsAttShowActionMenu()">← Retour</button>
        </div>`;
}

function mailsAttMailCommentSuffix() {
    if (!mailsCurrentMessage) return '';
    const parts = [];
    if (mailsCurrentMessage.subject) parts.push(mailsCurrentMessage.subject);
    if (mailsCurrentMessage.from) parts.push('De : ' + mailsCurrentMessage.from);
    return parts.length ? ' — Mail : ' + parts.join(' · ') : '';
}

async function mailsAttSendAsFacture() {
    try {
        mailsAttBusy = true;
        if (typeof showToast === 'function') showToast('Ouverture du formulaire…', 'info');
        const file = await mailsFetchAttachmentFile();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        mailsCloseAttModal(true);
        if (typeof openDepotFactureModalFromMail !== 'function') {
            alert('Module comptabilité non disponible');
            return;
        }
        openDepotFactureModalFromMail(file, {
            libelle: baseName,
            fournisseur: mailsCurrentMessage?.from ? mailsShortFrom(mailsCurrentMessage.from) : '',
            commentaire: ('Importé depuis mail' + mailsAttMailCommentSuffix()).trim(),
        });
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsAttBusy = false;
    }
}

async function mailsAttSendAsDevis() {
    try {
        mailsAttBusy = true;
        if (typeof showToast === 'function') showToast('Ouverture du formulaire…', 'info');
        const file = await mailsFetchAttachmentFile();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        mailsCloseAttModal(true);
        if (typeof openDepotDevisModalFromMail !== 'function') {
            alert('Module devis comptabilité non disponible');
            return;
        }
        openDepotDevisModalFromMail(file, {
            libelle: baseName,
            fournisseur: mailsCurrentMessage?.from ? mailsShortFrom(mailsCurrentMessage.from) : '',
            commentaire: ('Importé depuis mail' + mailsAttMailCommentSuffix()).trim(),
        });
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsAttBusy = false;
    }
}
if (typeof window !== 'undefined') window.mailsAttSendAsDevis = mailsAttSendAsDevis;

async function mailsAttSendAsNdf() {
    try {
        mailsAttBusy = true;
        if (typeof showToast === 'function') showToast('Ouverture du formulaire…', 'info');
        const file = await mailsFetchAttachmentFile();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        mailsCloseAttModal(true);
        if (typeof openNewNdfModalFromMail !== 'function') {
            alert('Module notes de frais non disponible');
            return;
        }
        await openNewNdfModalFromMail(file, {
            titre: mailsCurrentMessage?.subject ? ('Mail — ' + mailsCurrentMessage.subject) : ('Mail — ' + baseName),
            description: baseName,
            typeAutre: 'Pièce jointe mail',
        });
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsAttBusy = false;
    }
}

async function mailsFetchAttachmentBlob() {
    if (!mailsPendingAttachment) throw new Error('Aucune pièce jointe');
    const url = mailsAttachmentUrl(mailsPendingAttachment.part);
    const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + authToken, 'X-Auth-Token': authToken },
    });
    if (!res.ok) throw new Error('Impossible de récupérer le fichier');
    return await res.blob();
}

async function mailsFetchAttachmentFile() {
    const blob = await mailsFetchAttachmentBlob();
    const att = mailsPendingAttachment;
    return new File([blob], att.filename, { type: att.mime || blob.type || 'application/octet-stream' });
}

async function mailsAttActionView() {
    try {
        if (typeof showToast === 'function') showToast('Ouverture…', 'info');
        const blob = await mailsFetchAttachmentBlob();
        const mime = mailsPendingAttachment.mime || blob.type || '';
        const url = URL.createObjectURL(blob);
        if (/^image\//i.test(mime) || mime === 'application/pdf' || mime === 'text\/plain') {
            window.open(url, '_blank', 'noopener');
        } else {
            alert('Aperçu non disponible pour ce type de fichier. Utilisez Télécharger.');
            URL.revokeObjectURL(url);
            return;
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        mailsCloseAttModal();
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsAttActionDownload() {
    try {
        const blob = await mailsFetchAttachmentBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = mailsPendingAttachment.filename || 'piece-jointe';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        mailsCloseAttModal();
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsAttStartPicker(type) {
    mailsAttPickerState = { type, step: 'destination', folderId: null, projectId: null, dealId: null };
    if (type === 'crm') {
        if (typeof loadCrmData === 'function') await loadCrmData();
        mailsAttRenderCrmPicker();
    } else if (type === 'project') {
        if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
        mailsAttRenderProjectPicker();
    } else if (type === 'bureau') {
        await mailsAttLoadBureauFolders();
        mailsAttRenderBureauPicker();
    }
}

function mailsAttRenderPickerShell(title, searchHtml, listHtml, footerHtml) {
    document.getElementById('mailsAttModalTitle').textContent = title;
    document.getElementById('mailsAttModalBody').innerHTML =
        (searchHtml || '') +
        '<div class="mails-att-picker-list" id="mailsAttPickerList">' + listHtml + '</div>' +
        (footerHtml || '');
}

async function mailsAttLoadBureauFolders() {
    try {
        const res = await apiCall('workspace.php?visibility=personal', 'GET');
        mailsAttPickerState.bureauElements = (res && res.elements) ? res.elements : [];
    } catch (e) {
        mailsAttPickerState.bureauElements = [];
    }
}

function mailsAttRenderCrmPicker() {
    const deals = (typeof getCrmAccessibleDeals === 'function')
        ? getCrmAccessibleDeals()
        : ((typeof crmData !== 'undefined' && crmData.deals) ? crmData.deals : []);
    const sorted = deals.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const list = sorted.length ? sorted.map(d => `
        <button type="button" class="mails-att-picker-item" onclick="mailsAttSelectCrmDeal('${escapeHtml(String(d.id))}')">
            <span class="mails-att-picker-item-title">${escapeHtml(d.title || 'Sans titre')}</span>
            <span class="mails-att-picker-item-meta">${escapeHtml(d.stage || '')}</span>
        </button>`).join('') : '<div class="mails-att-picker-empty">Aucun dossier CRM</div>';

    mailsAttRenderPickerShell(
        'Choisir un dossier CRM',
        '<input type="text" class="mails-att-search" placeholder="Rechercher…" oninput="mailsAttFilterCrmList(this.value)">',
        list,
        `<div class="mails-att-picker-footer">
            <button type="button" class="btn btn-secondary" onclick="mailsAttCreateCrmDeal()">+ Nouveau dossier</button>
            <button type="button" class="btn btn-secondary" onclick="mailsAttShowActionMenu()">← Retour</button>
        </div>`
    );
    mailsAttPickerState.crmDeals = sorted;
}

function mailsAttFilterCrmList(q) {
    const list = document.getElementById('mailsAttPickerList');
    if (!list || !mailsAttPickerState?.crmDeals) return;
    const query = (q || '').toLowerCase().trim();
    const filtered = query
        ? mailsAttPickerState.crmDeals.filter(d => (d.title || '').toLowerCase().includes(query))
        : mailsAttPickerState.crmDeals;
    list.innerHTML = filtered.length ? filtered.map(d => `
        <button type="button" class="mails-att-picker-item" onclick="mailsAttSelectCrmDeal('${escapeHtml(String(d.id))}')">
            <span class="mails-att-picker-item-title">${escapeHtml(d.title || 'Sans titre')}</span>
            <span class="mails-att-picker-item-meta">${escapeHtml(d.stage || '')}</span>
        </button>`).join('') : '<div class="mails-att-picker-empty">Aucun résultat</div>';
}

async function mailsAttCreateCrmDeal() {
    const title = prompt('Nom du nouveau dossier CRM :');
    if (!title || !title.trim()) return;
    try {
        if (typeof loadCrmData === 'function') await loadCrmData();
        if (typeof crmData === 'undefined') throw new Error('CRM non disponible');
        if (!crmData.deals) crmData.deals = [];
        const lines = typeof getActiveCrmActivityLines === 'function' ? getActiveCrmActivityLines() : [];
        const lineId = lines[0] ? lines[0].id : 'line_spectacle';
        const stages = (lines[0] && lines[0].pipelineStages && lines[0].pipelineStages[0]) ? lines[0].pipelineStages[0] : 'Prospect';
        const deal = {
            id: typeof crmNewId === 'function' ? crmNewId('deal') : 'deal_' + Date.now(),
            title: title.trim(),
            status: 'open',
            activityLineId: lineId,
            stage: stages,
            prospectIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        if (typeof ensureDealShape === 'function') ensureDealShape(deal);
        crmData.deals.push(deal);
        if (typeof saveCrmData === 'function') await saveCrmData();
        await mailsAttSelectCrmDeal(deal.id);
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsAttSelectCrmDeal(dealId) {
    try {
        mailsAttBusy = true;
        if (typeof showToast === 'function') showToast('Import en cours…', 'info');
        const file = await mailsFetchAttachmentFile();
        const deal = typeof getCrmDealById === 'function'
            ? getCrmDealById(dealId)
            : (crmData.deals || []).find(d => String(d.id) === String(dealId));
        if (!deal) throw new Error('Dossier introuvable');
        if (typeof uploadFile !== 'function') throw new Error('Upload non disponible');
        const uploaded = await uploadFile(file, 'documents');
        if (typeof ensureDealShape === 'function') ensureDealShape(deal);
        deal.documents.unshift({
            id: typeof crmNewId === 'function' ? crmNewId('doc') : 'doc_' + Date.now(),
            name: file.name.replace(/\.[^/.]+$/, ''),
            category: 'document',
            file_id: uploaded.file_id,
            url: uploaded.url,
            downloadUrl: uploaded.downloadUrl,
            fileName: uploaded.fileName || file.name,
            fileType: uploaded.fileType,
            fileSize: uploaded.fileSize,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentUser ? currentUser.id : null,
        });
        deal.updatedAt = new Date().toISOString();
        if (typeof saveCrmData === 'function') await saveCrmData();
        mailsCloseAttModal(true);
        if (typeof showToast === 'function') showToast('Ajouté au dossier « ' + (deal.title || '') + ' »', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsAttBusy = false;
    }
}

function mailsAttRenderProjectPicker() {
    mailsEnsureAttPickerState('project');
    const projects = (typeof getActiveWorkProjects === 'function')
        ? getActiveWorkProjects()
        : ((typeof workProjectsData !== 'undefined' && workProjectsData.projects)
            ? workProjectsData.projects.filter(p => !p.archived) : []);
    const sorted = projects.slice().sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
    const list = sorted.length ? sorted.map(p => `
        <button type="button" class="mails-att-picker-item" onclick="mailsAttSelectProject('${escapeHtml(String(p.id))}')">
            <span class="mails-att-picker-item-title">${escapeHtml((p.icon || '📁') + ' ' + (p.title || 'Sans titre'))}</span>
        </button>`).join('') : '<div class="mails-att-picker-empty">Aucun projet</div>';

    mailsAttRenderPickerShell(
        'Choisir un projet',
        '<input type="text" class="mails-att-search" placeholder="Rechercher…" oninput="mailsAttFilterProjectList(this.value)">',
        list,
        `<div class="mails-att-picker-footer">
            <button type="button" class="btn btn-secondary" onclick="mailsAttCreateProject()">+ Nouveau projet</button>
            <button type="button" class="btn btn-secondary" onclick="mailsAttStartPicker('project')">↻</button>
        </div>`
    );
    mailsAttPickerState.projects = sorted;
}

function mailsAttFilterProjectList(q) {
    const list = document.getElementById('mailsAttPickerList');
    if (!list || !mailsAttPickerState?.projects) return;
    const query = (q || '').toLowerCase().trim();
    const filtered = query
        ? mailsAttPickerState.projects.filter(p => (p.title || '').toLowerCase().includes(query))
        : mailsAttPickerState.projects;
    list.innerHTML = filtered.length ? filtered.map(p => `
        <button type="button" class="mails-att-picker-item" onclick="mailsAttSelectProject('${escapeHtml(String(p.id))}')">
            <span class="mails-att-picker-item-title">${escapeHtml((p.icon || '📁') + ' ' + (p.title || 'Sans titre'))}</span>
        </button>`).join('') : '<div class="mails-att-picker-empty">Aucun résultat</div>';
}

async function mailsAttCreateProject() {
    const title = prompt('Nom du nouveau projet :');
    if (!title || !title.trim()) return;
    try {
        if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
        const p = {
            id: typeof wpNewId === 'function' ? wpNewId('wp') : 'wp_' + Date.now(),
            title: title.trim(),
            description: '',
            color: '#4a90d9',
            icon: '📁',
            members: currentUser ? [String(currentUser.id)] : [],
            tasks: [],
            activities: [],
            crm: { listIds: [], prospectIds: [], dealIds: [] },
            archived: false,
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.id : null,
            updatedAt: new Date().toISOString(),
        };
        if (typeof ensureWorkProjectShape === 'function') ensureWorkProjectShape(p);
        if (typeof workProjectsData === 'undefined') throw new Error('Projets non disponibles');
        workProjectsData.projects.push(p);
        if (typeof saveWorkProjectsData === 'function') await saveWorkProjectsData();
        await mailsAttSelectProject(p.id);
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsAttSelectProject(projectId) {
    mailsEnsureAttPickerState('project');
    mailsAttPickerState.projectId = projectId;
    mailsAttPickerState.folderId = null;
    try {
        const res = await apiCall('workspace.php?visibility=team&project_id=' + encodeURIComponent(projectId), 'GET');
        mailsAttPickerState.projectElements = (res && res.elements) ? res.elements : [];
    } catch (e) {
        mailsAttPickerState.projectElements = [];
    }
    mailsAttRenderProjectFolderPicker();
}

function mailsAttRenderProjectFolderPicker() {
    if (!mailsAttPickerState?.projectId) {
        mailsAttRenderProjectPicker();
        return;
    }
    const elements = mailsAttPickerState.projectElements || [];
    const folders = elements.filter(el => el.type === 'folder' && !el.folder_id);
    const rootBtn = `<button type="button" class="mails-att-picker-item mails-att-picker-item--root" onclick="mailsAttConfirmProjectUpload(null)">
        <span class="mails-att-picker-item-title">📂 Racine du projet</span>
    </button>`;
    const folderList = folders.map(f => `
        <button type="button" class="mails-att-picker-item" onclick="mailsAttConfirmProjectUpload('${escapeHtml(String(f.id))}')">
            <span class="mails-att-picker-item-title">📁 ${escapeHtml(f.title || 'Dossier')}</span>
        </button>`).join('');

    mailsAttRenderPickerShell(
        'Emplacement dans le projet',
        '',
        rootBtn + (folderList || '<div class="mails-att-picker-empty">Aucun sous-dossier — utilisez la racine</div>'),
        `<div class="mails-att-picker-footer">
            <button type="button" class="btn btn-secondary" onclick="mailsAttCreateProjectFolder()">+ Nouveau dossier</button>
            <button type="button" class="btn btn-secondary" onclick="mailsAttRenderProjectPicker()">← Projets</button>
        </div>`
    );
}

async function mailsAttCreateProjectFolder() {
    const name = prompt('Nom du dossier dans le projet :');
    if (!name || !name.trim() || !mailsAttPickerState.projectId) return;
    try {
        await apiCall('workspace.php', 'POST', {
            id: 'ws_folder_' + Date.now(),
            type: 'folder',
            title: name.trim(),
            visibility: 'team',
            project_id: mailsAttPickerState.projectId,
            folder_id: null,
        });
        await mailsAttSelectProject(mailsAttPickerState.projectId);
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsAttConfirmProjectUpload(folderId) {
    const projectId = mailsAttPickerState?.projectId;
    if (!projectId) {
        alert('Sélection de projet expirée. Choisissez à nouveau le projet.');
        mailsAttRenderProjectPicker();
        return;
    }
    try {
        mailsAttBusy = true;
        if (typeof showToast === 'function') showToast('Import en cours…', 'info');
        const file = await mailsFetchAttachmentFile();
        await mailsUploadToWorkspace(file, {
            projectId: projectId,
            folderId: folderId || null,
            visibility: 'team',
        });
        const p = typeof getWorkProjectById === 'function' ? getWorkProjectById(projectId) : null;
        mailsCloseAttModal(true);
        if (typeof showToast === 'function') showToast('Ajouté au projet « ' + (p?.title || '') + ' »', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsAttBusy = false;
    }
}

function mailsAttRenderBureauPicker() {
    const elements = mailsAttPickerState.bureauElements || [];
    const folders = elements.filter(el => el.type === 'folder' && !el.folder_id);
    const rootBtn = `<button type="button" class="mails-att-picker-item mails-att-picker-item--root" onclick="mailsAttConfirmBureauUpload(null)">
        <span class="mails-att-picker-item-title">🗂️ Racine de mon espace</span>
    </button>`;
    const folderList = folders.map(f => `
        <button type="button" class="mails-att-picker-item" onclick="mailsAttConfirmBureauUpload('${escapeHtml(String(f.id))}')">
            <span class="mails-att-picker-item-title">📁 ${escapeHtml(f.title || 'Dossier')}</span>
        </button>`).join('');

    mailsAttRenderPickerShell(
        'Mon espace personnel',
        '',
        rootBtn + (folderList || '<div class="mails-att-picker-empty">Aucun dossier — utilisez la racine</div>'),
        `<div class="mails-att-picker-footer">
            <button type="button" class="btn btn-secondary" onclick="mailsAttCreateBureauFolder()">+ Nouveau dossier</button>
        </div>`
    );
}

async function mailsAttCreateBureauFolder() {
    const name = prompt('Nom du dossier :');
    if (!name || !name.trim()) return;
    try {
        await apiCall('workspace.php', 'POST', {
            id: 'ws_folder_' + Date.now(),
            type: 'folder',
            title: name.trim(),
            content: JSON.stringify({}),
            visibility: 'personal',
            folder_id: null,
        });
        await mailsAttLoadBureauFolders();
        mailsAttRenderBureauPicker();
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function mailsAttConfirmBureauUpload(folderId) {
    try {
        mailsAttBusy = true;
        if (typeof showToast === 'function') showToast('Import en cours…', 'info');
        const file = await mailsFetchAttachmentFile();
        await mailsUploadToWorkspace(file, { folderId: folderId || null, visibility: 'personal' });
        mailsCloseAttModal(true);
        if (typeof showToast === 'function') showToast('Ajouté à mon espace personnel', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        mailsAttBusy = false;
    }
}

async function mailsUploadToWorkspace(file, opts) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('visibility', opts.visibility || 'personal');
    formData.append('token', authToken);
    if (opts.projectId) formData.append('project_id', opts.projectId);
    if (opts.folderId) formData.append('folder_id', opts.folderId);
    const response = await fetch(API_URL + '/workspace_upload.php', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + authToken, 'X-Auth-Token': authToken },
        body: formData,
    });
    const res = await response.json();
    if (!res.success) throw new Error(res.error || 'Upload échoué');
    return res.element;
}

async function mailsLoadUserSettings() {
    if (!mailsActiveBoxId) return;
    try {
        const data = await apiCall(`mail_settings.php?mailbox_id=${mailsActiveBoxId}`, 'GET');
        if (data?.settings) {
            mailsUserSettings = {
                signature_html: data.settings.signature_html || '',
                signature_enabled: data.settings.signature_enabled !== false,
            };
        }
    } catch (e) {
        console.warn('mailsLoadUserSettings:', e);
    }
}

function mailsActiveBoxLabel() {
    const box = mailsActiveBox();
    if (!box) return 'Boîte';
    return box.label || box.email || 'Boîte';
}

function mailsEnsureSettingsModal() {
    if (document.getElementById('mailsSettingsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'mailsSettingsModal';
    modal.className = 'modal mails-settings-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content mails-settings-content">
            <div class="mails-settings-header">
                <h2>Paramètres mails</h2>
                <button type="button" class="mails-tool-btn" onclick="mailsCloseSettings()" aria-label="Fermer">✕</button>
            </div>
            <section class="mails-settings-section">
                <h3>Signature <span id="mailsSigMailboxLabel" class="mails-sig-mailbox-label"></span></h3>
                <label class="mails-settings-check">
                    <input type="checkbox" id="mailsSigEnabled" checked>
                    <span>Inclure ma signature dans les nouveaux messages</span>
                </label>
                <div class="mails-sig-toolbar">
                    <button type="button" class="mails-sig-tool" onclick="mailsSigCommand('bold')" title="Gras"><b>G</b></button>
                    <button type="button" class="mails-sig-tool" onclick="mailsSigCommand('italic')" title="Italique"><i>I</i></button>
                    <button type="button" class="mails-sig-tool" onclick="mailsSigCommand('underline')" title="Souligné"><u>S</u></button>
                    <button type="button" class="mails-sig-tool" onclick="mailsSigCommand('insertUnorderedList')" title="Liste">• Liste</button>
                    <label class="mails-sig-tool mails-sig-tool--file" title="Insérer une image">
                        🖼 Image
                        <input type="file" id="mailsSigImageInput" accept="image/*" style="display:none;" onchange="mailsInsertSignatureImage(event)">
                    </label>
                </div>
                <div class="mails-sig-resize-bar" id="mailsSigResizeBar" style="display:none;">
                    <span>Taille de l'image sélectionnée</span>
                    <input type="range" id="mailsSigResizeRange" min="60" max="600" value="200"
                        oninput="mailsOnSigResizeRange(this.value)">
                    <button type="button" class="mails-sig-img-delete" onclick="mailsRemoveSigImage()" title="Supprimer cette image">Supprimer l'image</button>
                </div>
                <div id="mailsSigEditor" class="mails-sig-editor" contenteditable="true" data-placeholder="Votre signature (texte, logo…)"></div>
                <p class="mails-settings-hint">Texte et images supportés. Cliquez sur une image pour la redimensionner ou la supprimer. Chaque adresse mail a sa propre signature.</p>
            </section>
            <section class="mails-settings-section">
                <h3>Journal d'envoi (cette application)</h3>
                <p class="mails-settings-hint">OVH compte <strong>chaque adresse</strong> en À/Cc/Cci comme 1 envoi (max 200/heure par boîte). Un message à 1 personne = 1. Vérifiez les champs Cc/Cci, surtout après « Répondre à tous ». Les envois Outlook, téléphone ou webmail OVH ne sont pas listés ici.</p>
                <div id="mailsSendLogStats" class="mails-send-log-stats">Chargement…</div>
                <div id="mailsSendLogList" class="mails-send-log-list"></div>
            </section>
            <div class="mails-settings-actions">
                <button type="button" class="btn btn-secondary" onclick="mailsCloseSettings()">Annuler</button>
                <button type="button" class="btn" id="mailsSettingsSaveBtn" onclick="mailsSaveSettings()">Enregistrer</button>
            </div>
        </div>`;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) mailsCloseSettings();
    });
    document.body.appendChild(modal);
}

function mailsOpenSettings() {
    mailsEnsureSettingsModal();
    const modal = document.getElementById('mailsSettingsModal');
    const editor = document.getElementById('mailsSigEditor');
    const enabled = document.getElementById('mailsSigEnabled');
    const mailboxLabel = document.getElementById('mailsSigMailboxLabel');
    if (mailboxLabel) {
        mailboxLabel.textContent = mailsBoxes.length > 1 ? `— ${mailsActiveBoxLabel()}` : '';
    }
    if (editor) editor.innerHTML = mailsUserSettings.signature_html || '';
    if (enabled) enabled.checked = mailsUserSettings.signature_enabled !== false;
    mailsInitSigEditor();
    mailsNormalizeSigEditorImages();
    mailsSelectSigImage(null);
    mailsLoadSendLogStats();
    if (modal) modal.style.display = 'flex';
}

async function mailsLoadSendLogStats() {
    const statsEl = document.getElementById('mailsSendLogStats');
    const listEl = document.getElementById('mailsSendLogList');
    if (!statsEl || !listEl || !mailsActiveBoxId) return;
    statsEl.textContent = 'Chargement…';
    listEl.innerHTML = '';
    try {
        const data = await apiCall(
            `mailboxes.php?action=my_send_log&mailbox_id=${mailsActiveBoxId}`,
            'GET'
        );
        const hour = data?.stats?.last_hour || {};
        const day = data?.stats?.last_24h || {};
        statsEl.innerHTML = `
            <div><strong>${escapeHtml(data.email || '')}</strong></div>
            <div>Dernière heure : <strong>${hour.sends || 0}</strong> envoi(s), <strong>${hour.recipients || 0}</strong> destinataire(s)</div>
            <div>Dernières 24 h : <strong>${day.sends || 0}</strong> envoi(s), <strong>${day.recipients || 0}</strong> destinataire(s)</div>`;
        const recent = data?.stats?.recent || [];
        if (!recent.length) {
            listEl.innerHTML = '<p class="mails-settings-hint">Aucun envoi enregistré depuis ce module.</p>';
            return;
        }
        listEl.innerHTML = recent.map(row => {
            const ok = row.success == 1;
            const status = ok ? 'OK' : 'Échec';
            const cls = ok ? 'mails-send-log-item--ok' : 'mails-send-log-item--fail';
            let rcptDetail = '';
            try {
                const list = row.recipients_json ? JSON.parse(row.recipients_json) : [];
                if (Array.isArray(list) && list.length) {
                    rcptDetail = ' [' + list.join(', ') + ']';
                }
            } catch (e) { /* ignore */ }
            const smtp = row.smtp_host_used
                ? ` · SMTP ${row.smtp_host_used}:${row.smtp_port_used || ''}/${row.smtp_encryption_used || ''}`
                : '';
            return `<div class="mails-send-log-item ${cls}">
                <span class="mails-send-log-date">${escapeHtml(row.created_at || '')}</span>
                <span class="mails-send-log-status">${status}</span>
                <span class="mails-send-log-detail">${escapeHtml(row.subject || '(sans objet)')} → ${escapeHtml(row.to_preview || '')} (${row.recipient_count || 1} dest.)${escapeHtml(rcptDetail)}${escapeHtml(smtp)}</span>
            </div>`;
        }).join('');
    } catch (e) {
        statsEl.textContent = 'Impossible de charger le journal.';
    }
}

function mailsSigCreateTextLine() {
    const line = document.createElement('div');
    line.className = 'mails-sig-line';
    line.appendChild(document.createElement('br'));
    return line;
}

function mailsEnsureSigEditorSpacing(blockEl) {
    if (!blockEl || !blockEl.parentNode) return { before: null, after: null };
    let before = blockEl.previousElementSibling;
    if (!before || !before.classList.contains('mails-sig-line')) {
        before = mailsSigCreateTextLine();
        blockEl.parentNode.insertBefore(before, blockEl);
    }
    let after = blockEl.nextElementSibling;
    if (!after || !after.classList.contains('mails-sig-line')) {
        after = mailsSigCreateTextLine();
        blockEl.parentNode.insertBefore(after, blockEl.nextSibling);
    }
    return { before, after };
}

function mailsFocusSigLine(line) {
    if (!line) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

let mailsSigSelectedWrap = null;

function mailsInitSigEditor() {
    const editor = document.getElementById('mailsSigEditor');
    if (!editor || editor.dataset.sigInit) return;
    editor.dataset.sigInit = '1';
    editor.addEventListener('click', (e) => {
        if (e.target.classList.contains('mails-sig-img-handle')) return;
        const wrap = e.target.closest('.mails-sig-img-wrap');
        if (wrap && (e.target.tagName === 'IMG' || e.target === wrap)) {
            mailsSelectSigImage(wrap);
            return;
        }
        mailsSelectSigImage(null);
    });
    editor.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && mailsSigSelectedWrap) {
            e.preventDefault();
            mailsRemoveSigImage();
        }
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#mailsSigEditor') && !e.target.closest('#mailsSigResizeBar')) {
            mailsSelectSigImage(null);
        }
    });
}

function mailsRemoveSigImage() {
    if (!mailsSigSelectedWrap) return;
    const editor = document.getElementById('mailsSigEditor');
    const wrap = mailsSigSelectedWrap;
    const after = wrap.nextElementSibling;
    wrap.remove();
    mailsSelectSigImage(null);
    if (editor && !editor.querySelector('.mails-sig-line') && !editor.querySelector('.mails-sig-img-wrap') && !editor.querySelector('img')) {
        editor.appendChild(mailsSigCreateTextLine());
    }
    if (after && after.classList && after.classList.contains('mails-sig-line')) {
        mailsFocusSigLine(after);
    }
}
window.mailsRemoveSigImage = mailsRemoveSigImage;

function mailsWrapSigImage(img) {
    if (!img || img.closest('.mails-sig-img-wrap')) {
        return img?.closest('.mails-sig-img-wrap') || null;
    }
    const wrap = document.createElement('div');
    wrap.className = 'mails-sig-img-wrap';
    wrap.contentEditable = 'false';
    if (!img.style.width && !img.getAttribute('width')) {
        img.style.width = '200px';
    }
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.maxWidth = 'none';
    img.draggable = false;
    const handle = document.createElement('span');
    handle.className = 'mails-sig-img-handle';
    handle.title = 'Redimensionner';
    const parent = img.parentNode;
    if (parent) parent.insertBefore(wrap, img);
    wrap.appendChild(img);
    wrap.appendChild(handle);
    mailsBindSigImageResize(handle, img);
    return wrap;
}

function mailsBindSigImageResize(handle, img) {
    handle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = img.getBoundingClientRect().width;
        const onMove = (ev) => {
            const w = Math.max(60, Math.min(600, Math.round(startW + (ev.clientX - startX))));
            img.style.width = w + 'px';
            img.removeAttribute('width');
            img.removeAttribute('height');
            const range = document.getElementById('mailsSigResizeRange');
            if (range) range.value = String(w);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
}

function mailsNormalizeSigEditorImages() {
    const editor = document.getElementById('mailsSigEditor');
    if (!editor) return;
    editor.querySelectorAll('img').forEach(img => mailsWrapSigImage(img));
    editor.querySelectorAll('.mails-sig-img-wrap').forEach(wrap => mailsEnsureSigEditorSpacing(wrap));
    if (!editor.querySelector('.mails-sig-line') && !editor.querySelector('.mails-sig-img-wrap')) {
        editor.appendChild(mailsSigCreateTextLine());
    }
}

function mailsSelectSigImage(wrap) {
    mailsSigSelectedWrap = wrap || null;
    document.querySelectorAll('#mailsSigEditor .mails-sig-img-wrap').forEach(w => {
        w.classList.toggle('is-selected', w === wrap);
    });
    const bar = document.getElementById('mailsSigResizeBar');
    const range = document.getElementById('mailsSigResizeRange');
    if (!bar || !range) return;
    if (!wrap) {
        bar.style.display = 'none';
        return;
    }
    const img = wrap.querySelector('img');
    if (!img) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    const w = Math.round(img.getBoundingClientRect().width || parseInt(img.style.width, 10) || 200);
    range.value = String(Math.max(60, Math.min(600, w)));
}

function mailsOnSigResizeRange(value) {
    if (!mailsSigSelectedWrap) return;
    const img = mailsSigSelectedWrap.querySelector('img');
    if (!img) return;
    const w = Math.max(60, Math.min(600, parseInt(value, 10) || 200));
    img.style.width = w + 'px';
    img.removeAttribute('width');
    img.removeAttribute('height');
}

function mailsCleanSignatureHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('.mails-sig-img-wrap').forEach(wrap => {
        const img = wrap.querySelector('img');
        if (img) wrap.replaceWith(img.cloneNode(true));
    });
    div.querySelectorAll('.mails-sig-line').forEach(line => {
        const text = (line.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (!text) line.remove();
    });
    return div.innerHTML;
}

function mailsCloseSettings() {
    const modal = document.getElementById('mailsSettingsModal');
    if (modal) modal.style.display = 'none';
}

function mailsSigCommand(cmd) {
    const editor = document.getElementById('mailsSigEditor');
    if (!editor) return;
    editor.focus();
    document.execCommand(cmd, false, null);
}

async function mailsInsertSignatureImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Veuillez choisir une image.');
        return;
    }
    if (file.size > 500 * 1024) {
        alert('Image trop volumineuse (max 500 Ko).');
        return;
    }
    const editor = document.getElementById('mailsSigEditor');
    if (!editor) return;
    const dataUrl = await mailsFileToBase64(file);
    const mime = file.type || 'image/png';
    editor.focus();
    const img = document.createElement('img');
    img.src = 'data:' + mime + ';base64,' + dataUrl;
    img.alt = '';
    img.style.width = '200px';
    img.style.height = 'auto';
    img.style.display = 'block';
    const wrap = mailsWrapSigImage(img);
    if (!wrap) return;
    const before = mailsSigCreateTextLine();
    const after = mailsSigCreateTextLine();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.collapse(false);
        range.insertNode(after);
        range.insertNode(wrap);
        range.insertNode(before);
    } else {
        editor.appendChild(before);
        editor.appendChild(wrap);
        editor.appendChild(after);
    }
    mailsEnsureSigEditorSpacing(wrap);
    mailsSelectSigImage(wrap);
    mailsFocusSigLine(after);
}

async function mailsSaveSettings() {
    const editor = document.getElementById('mailsSigEditor');
    const enabled = document.getElementById('mailsSigEnabled');
    const btn = document.getElementById('mailsSettingsSaveBtn');
    const signatureHtml = mailsCleanSignatureHtml(editor ? editor.innerHTML.trim() : '');
    const signatureEnabled = enabled ? enabled.checked : true;
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try {
        const data = await apiCall('mail_settings.php', 'POST', {
            mailbox_id: mailsActiveBoxId,
            signature_html: signatureHtml,
            signature_enabled: signatureEnabled,
        });
        if (data?.settings) {
            mailsUserSettings = {
                signature_html: data.settings.signature_html || '',
                signature_enabled: data.settings.signature_enabled !== false,
            };
        }
        mailsCloseSettings();
        mailsRefreshComposeSignature();
        if (typeof showToast === 'function') showToast('Paramètres mails enregistrés', 'success');
        else alert('Paramètres enregistrés');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    }
}

function mailsUpdateComposeSignaturePreview() {
    mailsRefreshComposeSignature();
}

(function mailsHookNavigationForCompose() {
    if (window._mailsComposeNavHooked) return;
    window._mailsComposeNavHooked = true;

    const origCloseAllPages = closeAllPages;
    closeAllPages = function() {
        const mailsWasActive = mailsIsPageActive();
        if (mailsWasActive && mailsViewMode === 'compose') {
            mailsAttemptLeaveCompose().then(ok => {
                if (ok) {
                    mailsCloseCompose(true);
                    stopMailsPolling();
                    origCloseAllPages();
                }
            });
            return;
        }
        if (mailsWasActive) stopMailsPolling();
        return origCloseAllPages();
    };
    window.closeAllPages = closeAllPages;

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState !== 'visible' || !authToken || !currentUser || !currentUserHasMailboxes) return;
        if (mailsIsPageActive()) mailsPollPage();
        else mailsRefreshBackgroundState();
    });
})();
