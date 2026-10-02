// ========== FONCTIONS PAGE D'ACCUEIL ==========

const HOME_WIDGET_ITEMS_LIMIT = 5;

function renderHomeWelcomeLogo(el, fallbackEmoji) {
    if (!el) return;
    const logoUrl = (typeof resolveMediaUrl === 'function')
        ? resolveMediaUrl(
            (typeof appSettings !== 'undefined' && appSettings.logo) || localStorage.getItem('appLogo'),
            (typeof appSettings !== 'undefined' && appSettings.logoFileId) || null
        )
        : ((typeof appSettings !== 'undefined' && appSettings.logo) || localStorage.getItem('appLogo'));
    if (logoUrl) {
        el.innerHTML = `<img src="${logoUrl}" alt="Logo">`;
    } else {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2.2rem;">' + (fallbackEmoji || '🎭') + '</div>';
    }
}
window.renderHomeWelcomeLogo = renderHomeWelcomeLogo;

function getActiveHomeBureauTasksNorm() {
    return typeof normalizeBureauTaskStatus === 'function'
        ? normalizeBureauTaskStatus
        : function(s, c) { return c || s === 'done' ? 'done' : 'todo'; };
}

function getActiveHomeBureauTasks() {
    const norm = getActiveHomeBureauTasksNorm();
    if (typeof collectBureauUnifiedTasks === 'function') {
        return collectBureauUnifiedTasks('for_me').filter(function(t) {
            return norm(t.status, t.completed) !== 'done';
        });
    }
    if (typeof getMyTasks === 'function' && currentUser) {
        return getMyTasks().filter(function(t) {
            return !t.completed && !String(t.status || '').includes('done');
        });
    }
    return [];
}

function setHomeTasksCount(count) {
    const tasksCountEl = document.getElementById('homeIndicatorTasksCount');
    if (tasksCountEl) tasksCountEl.textContent = count;
}
window.setHomeTasksCount = setHomeTasksCount;

async function ensureHomeTasksSourcesLoaded() {
    if (typeof loadMyBureauData === 'function') await loadMyBureauData();
    if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
}
window.ensureHomeTasksSourcesLoaded = ensureHomeTasksSourcesLoaded;

/** Recharge les sources tâches depuis le serveur et rafraîchit accueil + bureau si besoin. */
async function syncUserTasksFromServer() {
    if (!isAuthenticated || !authToken) return false;
    let changed = false;

    try {
        const res = await apiCall('personal_tasks.php', 'GET');
        if (res?.success && Array.isArray(res.tasks)) {
            const newTasks = res.tasks.map(function(t) {
                return {
                    id: t.id,
                    title: t.title,
                    description: t.description || '',
                    category: t.category || '',
                    priority: t.priority || 'medium',
                    dueDate: t.dueDate,
                    assignedTo: t.assignedTo ? String(t.assignedTo) : null,
                    completed: !!t.completed,
                    status: t.status,
                    createdAt: t.createdAt,
                    createdBy: t.createdBy
                };
            });
            const prev = JSON.stringify((typeof myBureau !== 'undefined' && myBureau.tasks) ? myBureau.tasks : []);
            if (JSON.stringify(newTasks) !== prev) {
                if (typeof myBureau !== 'undefined') myBureau.tasks = newTasks;
                changed = true;
            }
        }
    } catch (e) { /* silencieux */ }

    if (typeof loadWorkProjectsData === 'function' && typeof workProjectsData !== 'undefined') {
        const prevWp = JSON.stringify(workProjectsData);
        await loadWorkProjectsData();
        if (JSON.stringify(workProjectsData) !== prevWp) changed = true;
    }

    if (typeof loadCrmData === 'function') {
        const prevCrm = typeof crmData !== 'undefined' ? JSON.stringify(crmData) : '';
        await loadCrmData().catch(function() {});
        const nextCrm = typeof crmData !== 'undefined' ? JSON.stringify(crmData) : '';
        if (prevCrm !== nextCrm) changed = true;
    }

    if (changed) {
        const active = getActiveHomeBureauTasks();
        setHomeTasksCount(active.length);
        if (typeof renderHomeTasksList === 'function') {
            await renderHomeTasksList({ skipReload: true, knownTasks: active });
        }
        if (document.getElementById('myBureauPage')?.classList.contains('active') && typeof renderBureauUnifiedTasks === 'function') {
            renderBureauUnifiedTasks();
        }
        if (typeof renderHomeRelancesWidget === 'function') renderHomeRelancesWidget();
        if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
        if (typeof updateTasksBadge === 'function') updateTasksBadge();
    }
    return changed;
}
window.syncUserTasksFromServer = syncUserTasksFromServer;

async function refreshUserTasksViews() {
    await ensureHomeTasksSourcesLoaded();
    const active = getActiveHomeBureauTasks();
    setHomeTasksCount(active.length);
    if (typeof renderHomeTasksList === 'function') await renderHomeTasksList({ skipReload: true, knownTasks: active });
    if (document.getElementById('myBureauPage')?.classList.contains('active') && typeof renderBureauUnifiedTasks === 'function') {
        renderBureauUnifiedTasks();
    }
    if (typeof updateTasksBadge === 'function') updateTasksBadge();
}
window.refreshUserTasksViews = refreshUserTasksViews;

function updateHomeTiles() {
    renderHomeWelcomeLogo(document.getElementById('homeWelcomeLogo'), '🎭');
    const titleEl = document.getElementById('homeWelcomeTitle');
    if (titleEl && currentUser) {
        const prenom = currentUser.prenom || currentUser.username || '';
        titleEl.textContent = `Bonjour ${prenom} !`;
    }

    if (typeof updateMsgBadges === 'function') updateMsgBadges();

    document.querySelectorAll('.home-tile[data-permission]').forEach(tile => {
        const perm = tile.dataset.permission;
        if (window.hasPermission) {
            tile.style.display = window.hasPermission(perm) ? '' : 'none';
        }
    });

    if (typeof updateEvenementielNavVisibility === 'function') updateEvenementielNavVisibility();
    if (typeof updateComptabiliteNavVisibility === 'function') updateComptabiliteNavVisibility();
    if (typeof updateCrmVisibility === 'function') updateCrmVisibility();
    if (typeof updateWorkProjectsNavVisibility === 'function') updateWorkProjectsNavVisibility();

    renderHomeTasksList();
    renderHomeMessagesWidget();
    if (typeof renderHomeRelancesWidget === 'function') renderHomeRelancesWidget();
}

async function renderHomeTasksList(options) {
    options = options || {};
    const widget = document.getElementById('homeTasksWidget');
    const container = document.getElementById('homeTasksList');
    if (!container) return;

    if (widget) {
        widget.style.display = (window.hasPermission && window.hasPermission('bureau')) ? 'block' : 'none';
    }

    try {
        if (!options.skipReload) await ensureHomeTasksSourcesLoaded();

        const unified = options.knownTasks || getActiveHomeBureauTasks();
        setHomeTasksCount(unified.length);

        if (typeof renderBureauUnifiedTasksListHtml === 'function') {
            if (unified.length) {
                const limit = HOME_WIDGET_ITEMS_LIMIT;
                const slice = unified.slice(0, limit);
                container.innerHTML =
                    '<div class="home-bureau-unified-tasks">' +
                    renderBureauUnifiedTasksListHtml(slice, { hideDelete: true, compact: true }) +
                    (unified.length > limit
                        ? '<div class="home-widget-more">+ ' + (unified.length - limit) + ' autres dans Mon Bureau</div>'
                        : '') +
                    '</div>';
                return;
            }
        }

        container.innerHTML =
            '<div class="tasks-empty tasks-up-to-date">' +
            '<span class="tasks-empty-icon">🎉</span>' +
            '<div>Vous êtes à jour !</div>' +
            '</div>';
    } catch (err) {
        console.error('renderHomeTasksList:', err);
        container.innerHTML = '<div class="tasks-empty"><div>Impossible d\'afficher les tâches</div></div>';
    }
}
window.renderHomeTasksList = renderHomeTasksList;

function renderHomeMessagesWidget() {
    const container = document.getElementById('homeMessagesList');
    const widget = document.getElementById('homeMessagesWidget');
    if (!container || !widget) return;
    if (typeof msgConversations === 'undefined') {
        container.innerHTML = '<div class="home-widget-empty"><span class="home-widget-empty-icon">💬</span><p>Chargement...</p></div>';
        return;
    }
    const unread = [...msgConversations]
        .filter(function(c) { return (c.unreadCount || 0) > 0; })
        .sort(function(a, b) {
            const dateA = new Date(a.lastMessageAt || 0).getTime();
            const dateB = new Date(b.lastMessageAt || 0).getTime();
            return dateB - dateA;
        })
        .slice(0, HOME_WIDGET_ITEMS_LIMIT);
    if (unread.length === 0) {
        container.innerHTML = '<div class="home-widget-empty"><span class="home-widget-empty-icon">✓</span><p>Aucun message non lu</p></div>';
        return;
    }
    container.innerHTML = unread.map(c => {
        const name = typeof getMsgConvDisplayName === 'function' ? getMsgConvDisplayName(c) : (c.name || 'Conversation');
        const timeStr = c.lastMessageAt && typeof formatMsgTime === 'function' ? formatMsgTime(c.lastMessageAt) : '';
        const preview = c.lastMessageSender && c.lastMessageSender !== name
            ? (typeof getShortName === 'function' ? getShortName(c.lastMessageSender) : c.lastMessageSender) + ': ' + (c.lastMessage || '')
            : (c.lastMessage || 'Aucun message');
        const previewShort = (preview || '').substring(0, 50) + ((preview || '').length > 50 ? '...' : '');
        const unreadCount = c.unreadCount || 0;
        const unread = unreadCount > 0;
        const cid = String(c.id || '').replace(/'/g, "\\'");
        return `<div class="home-message-item${unread ? ' unread' : ''}" onclick="openMessagingPage(); setTimeout(function(){if(typeof openConversation==='function')openConversation('${cid}');}, 400)">
            <div class="home-message-top">
                <span class="home-message-name-wrap">
                    ${unread ? '<span class="home-message-unread-dot" aria-hidden="true"></span>' : ''}
                    <span class="home-message-name">${escapeHtml(name)}</span>
                </span>
                <span class="home-message-meta">
                    ${timeStr ? `<span class="home-message-time">${timeStr}</span>` : ''}
                    ${unread ? `<span class="home-message-badge" title="${unreadCount} non lu${unreadCount > 1 ? 's' : ''}">${unreadCount}</span>` : ''}
                </span>
            </div>
            <span class="home-message-preview">${escapeHtml(previewShort)}</span>
        </div>`;
    }).join('');
}

function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
