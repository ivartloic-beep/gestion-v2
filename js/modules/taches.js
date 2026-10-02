// ==========================================
// SYSTÈME DE GESTION DES TÂCHES
// ==========================================

const TASK_CATEGORIES = ['Budget', 'Billetterie', 'Visuels', 'Logistique', 'Autre'];

// Fonction helper pour migrer les anciennes tâches (assigneeId -> assignedTo)
function migrateTaskData(task) {
    if (task.assigneeId && !task.assignedTo) {
        task.assignedTo = [task.assigneeId];
        delete task.assigneeId;
    }
    if (!task.assignedTo && task.assignees?.length) {
        task.assignedTo = task.assignees.map(x => (x && (x.id != null ? x.id : x)) != null ? (x.id != null ? x.id : x) : null).filter(x => x != null);
    }
    if (!task.assignedTo) {
        task.assignedTo = [];
    }
    if (!task.createdBy && currentUser) {
        task.createdBy = currentUser.id;
    }
    return task;
}

// Comparaison insensible au type (assignedTo peut contenir "42", currentUser.id peut être 42)
function isAssignedToUser(assignedTo, userId) {
    if (!userId || !assignedTo || !assignedTo.length) return false;
    return assignedTo.some(id => String(id) === String(userId));
}

function isTaskStatusInProgress(status) {
    return status === 'in_progress' || status === 'inprogress';
}

function normalizeAggregatedTaskStatus(task) {
    if (!task) return 'todo';
    if (task.status === 'done' || task.completed) return 'done';
    if (isTaskStatusInProgress(task.status)) return 'in_progress';
    return task.status || 'todo';
}

function isCrmDealTask(task) {
    return !!(task && (task.projectType === 'crm_deal' || String(task.projectId || '').startsWith('crm_')));
}

function isCrmDealTaskVisibleToUser(task, userId) {
    if (!isCrmDealTask(task) || !userId) return false;
    var assignees = getAssignedUserIds(task);
    if (assignees.length > 0) return isAssignedToUser(assignees, userId);
    return task.createdBy != null && String(task.createdBy) === String(userId);
}

/** Tâche créée par moi et assignée uniquement à d'autres (pas à moi). */
function isTaskAssignedByMeToOthers(task) {
    if (!currentUser || !task) return false;
    var uid = String(currentUser.id);
    if (task.createdBy == null || String(task.createdBy) !== uid) return false;
    var assignees = getAssignedUserIds(task);
    if (!assignees.length) return false;
    return !isAssignedToUser(assignees, currentUser.id);
}
window.isTaskAssignedByMeToOthers = isTaskAssignedByMeToOthers;

/** Tâche visible pour l'utilisateur connecté (Bureau, liste globale, accueil). */
function isTaskForCurrentUser(task) {
    if (!currentUser || !task) return false;
    if (isTaskAssignedByMeToOthers(task)) return false;
    var userId = currentUser.id;
    var assignees = getAssignedUserIds(task);
    if (assignees.length > 0) {
        return isAssignedToUser(assignees, userId);
    }
    if (task.source === 'personal' || task.projectId === 'bureau' || task.projectType === 'bureau') {
        if (task.createdBy != null) return String(task.createdBy) === String(userId);
        return true;
    }
    if (task.createdBy != null && String(task.createdBy) === String(userId)) return true;
    return false;
}
window.isTaskForCurrentUser = isTaskForCurrentUser;

function appendCrmDealTasksToList(target, options) {
    if (!target) return;
    options = options || {};
    var includeDone = !!options.includeDone;
    var data = typeof getCrmDataSnapshot === 'function' ? getCrmDataSnapshot() : null;
    if (!data || !Array.isArray(data.deals)) return;
    data.deals.forEach(function(deal) {
        if (!deal) return;
        if (typeof ensureDealShape === 'function') ensureDealShape(deal);
        else if (!Array.isArray(deal.tasks)) deal.tasks = [];
        var dealTitle = deal.title || 'Dossier CRM';
        deal.tasks.forEach(function(task) {
            if (!task) return;
            var isDone = task.status === 'done' || task.completed;
            if (!includeDone && isDone) return;
            var assignedTo = (task.assignedTo || []).map(String);
            var status = normalizeAggregatedTaskStatus(task);
            target.push({
                id: task.id,
                title: task.title || 'Sans titre',
                description: task.description || '',
                projectId: 'crm_' + deal.id,
                projectType: 'crm_deal',
                projectName: dealTitle,
                crmDealId: deal.id,
                category: 'CRM',
                dueDate: task.dueDate || null,
                priority: task.priority || 'normal',
                status: status,
                completed: isDone,
                assignedTo: assignedTo,
                assignees: assignedTo,
                createdBy: task.createdBy || null,
                createdAt: task.createdAt || new Date().toISOString(),
                updatedAt: task.updatedAt || new Date().toISOString()
            });
        });
    });
}
window.appendCrmDealTasksToList = appendCrmDealTasksToList;

// Extraire les IDs des utilisateurs assignés (assignedTo, assignees, assigneeId, assignee)
function getAssignedUserIds(task) {
    let raw = [];
    if (task) {
        if (task.assignedTo != null) raw = task.assignedTo;
        else if (task.assignees != null) raw = task.assignees;
        else if (task.assigneeId != null) raw = task.assigneeId;
        else if (task.assignee != null) raw = task.assignee;
    }
    if (!Array.isArray(raw)) raw = raw ? [raw] : [];
    return raw.map(x => {
        if (x == null) return null;
        const id = (typeof x === 'object' && x !== null && x.id != null) ? x.id : x;
        return id != null ? String(id) : null;
    }).filter(Boolean);
}

function getAllTasks() {
    const allTasks = [];
    projects.forEach(project => {
        if (project.tasks && project.tasks.length > 0) {
            project.tasks.forEach(task => {
                const migratedTask = migrateTaskData({...task});
                allTasks.push({
                    ...migratedTask,
                    projectId: project.id,
                    projectName: project.name,
                    projectType: project.type
                });
            });
        }
    });
    // Ajouter les tâches Mon Bureau (pour compteur et widget)
    const bureauTasks = (typeof myBureau !== 'undefined' && myBureau?.tasks) ? myBureau.tasks : [];
    const userId = currentUser ? String(currentUser.id) : '';
    bureauTasks.forEach(task => {
        if (task.completed) return;
        const assignedTo = task.assignedTo ? [String(task.assignedTo)] : (userId ? [userId] : []);
        if (task.assignedTo && String(task.assignedTo) !== userId) return;
        allTasks.push({
            id: task.id,
            title: task.title || 'Sans titre',
            projectId: 'bureau',
            projectName: 'Mon Bureau',
            assignedTo: assignedTo,
            assignees: assignedTo,
            status: 'todo',
            completed: false
        });
    });
    if (typeof appendCrmDealTasksToList === 'function') {
        appendCrmDealTasksToList(allTasks);
    } else if (typeof getCrmDealTasksForAggregation === 'function') {
        allTasks.push(...getCrmDealTasksForAggregation());
    }
    return allTasks;
}
function getMyTasks() {
    if (!currentUser) return [];
    const allTasks = getAllTasks();
    return allTasks.filter(task => {
        if (typeof isTaskForCurrentUser === 'function') return isTaskForCurrentUser(task);
        const assignedTo = task.assignedTo || task.assignees || [];
        if (isAssignedToUser(assignedTo, currentUser.id)) return true;
        return isCrmDealTaskVisibleToUser(task, currentUser.id);
    });
}

// Obtenir les tâches créées par l'utilisateur connecté et assignées à d'autres
function getTasksAssignedByMe() {
    if (!currentUser) return [];
    const allTasks = getAllTasks();
    return allTasks.filter(task => {
        const assignedTo = task.assignedTo || [];
        const createdByMe = task.createdBy == currentUser.id || String(task.createdBy) === String(currentUser.id);
        return createdByMe &&
               (assignedTo.length === 0 || !isAssignedToUser(assignedTo, currentUser.id) || assignedTo.length > 1);
    });
}

// Obtenir toutes les tâches (pour admin)
function getAllTasksForAdmin() {
    return getAllTasks();
}

// Vérifier si l'utilisateur peut modifier une tâche
function canEditTask(task, projectId = null) {
    if (!currentUser) return false;
    const pid = projectId || task.projectId;
    if (pid && String(pid).startsWith('crm_')) {
        const uid = String(currentUser.id);
        if (currentUser.role === 'admin') return true;
        if (task.createdBy != null && String(task.createdBy) === uid) return true;
        return isAssignedToUser(task.assignedTo || task.assignees || [], currentUser.id);
    }
    if (currentUser.role === 'admin') return true;
    const uid = String(currentUser.id);
    if (task.createdBy != null && String(task.createdBy) === uid) return true;
    const assignedTo = task.assignedTo || task.assignees || [];
    if (isAssignedToUser(assignedTo, currentUser.id)) return true;
    if (pid) {
        const proj = getProjectById(pid);
        if (proj && proj.members && proj.members.some(m => {
            const mid = m && (m.id != null ? m.id : m);
            return mid != null && String(mid) === uid;
        })) return true;
    }
    return false;
}

// Vérifier si l'utilisateur peut changer le statut d'une tâche
function canChangeTaskStatus(task) {
    if (!currentUser) return false;
    if (task.projectId && String(task.projectId).startsWith('crm_')) {
        if (currentUser.role === 'admin') return true;
        return isAssignedToUser(task.assignedTo || task.assignees || [], currentUser.id);
    }
    if (currentUser.role === 'admin') return true;
    const assignedTo = task.assignedTo || [];
    return isAssignedToUser(assignedTo, currentUser.id);
}

function getProjectTasks(projectId) {
    const project = projects.find(p => p.id === projectId);
    return project && project.tasks ? project.tasks : [];
}

function countProjectTasks(projectId) {
    const tasks = getProjectTasks(projectId);
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    return { total, done, todo: total - done };
}

function isTaskOverdue(task) {
    if (!task.dueDate || task.status === 'done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.dueDate);
    return dueDate < today;
}

function isTaskToday(task) {
    if (!task.dueDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return task.dueDate === today;
}

function isTaskThisWeek(task) {
    if (!task.dueDate) return false;
    const today = new Date();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const dueDate = new Date(task.dueDate);
    return dueDate <= endOfWeek && dueDate >= today;
}

let _tagPopupEl = null;
let _tagPopupAnchor = null;
let _tagPopupClickOutside = null;

function closeTagPopups() {
    if (_tagPopupEl && _tagPopupEl.parentNode) _tagPopupEl.parentNode.removeChild(_tagPopupEl);
    _tagPopupEl = null;
    _tagPopupAnchor = null;
    if (_tagPopupClickOutside) {
        document.removeEventListener('click', _tagPopupClickOutside);
        _tagPopupClickOutside = null;
    }
}

function showTaskToast(msg) {
    const existing = document.getElementById('task-toast-el');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'task-toast-el';
    el.className = 'task-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 2500);
}

function refreshCurrentTasksView() {
    const g = document.getElementById('globalTasksPage');
    if (g && g.classList.contains('active')) renderGlobalTasksPage();
    const p = document.getElementById('projectTasksPage');
    if (p && p.classList.contains('active') && currentTasksProject) renderProjectTasks();
    renderHomeTasksWidget();
    refreshPageTasks();
    if (window.currentTechSpectacle) renderTechSectionTasks();
}

function updateTaskField(projectId, taskId, field, value) {
    const project = projects.find(p => p.id == projectId || String(p.id) === String(projectId));
    if (!project || !project.tasks) return;
    const idx = project.tasks.findIndex(t => t.id == taskId || String(t.id) === String(taskId));
    if (idx < 0) return;
    const task = migrateTaskData({...project.tasks[idx]});
    if (!canEditTask(task)) return;
    if (field === 'category') task.category = value;
    else if (field === 'dueDate') task.dueDate = value || null;
    else if (field === 'assignedTo') {
        const prevAssigned = (task.assignedTo || task.assignees || []).map(String);
        task.assignedTo = Array.isArray(value) ? value.map(String) : [];
        const newAssigned = task.assignedTo.filter(id => !prevAssigned.includes(id));
        const projectName = project.name || project.lieu || 'Projet';
        newAssigned.forEach(uid => notifyUserAssigned(uid, 'Nouvelle tâche assignée', `Vous avez été assigné(e) à la tâche « ${task.title || 'Sans titre'} » du projet ${projectName}.`, 'assignment', { type: 'task', projectId: project.id, taskId: task.id }));
    }
    else if (field === 'priority') task.priority = value;
    else if (field === 'status') {
        task.status = value;
        if (value === 'done' && currentUser) {
            task.completedBy = currentUser.id;
            task.completedAt = new Date().toISOString();
        } else if (value !== 'done') {
            task.completedBy = null;
            task.completedAt = null;
        }
    } else if (field === 'title') task.title = (value || '').trim() || task.title;
    project.tasks[idx] = task;
    saveProjectsAsync();
    refreshCurrentTasksView();
    showTaskToast('✓ Tâche mise à jour');
}

function registerTagPopupClickOutside(popupEl, anchor) {
    _tagPopupClickOutside = function(e) {
        if (!popupEl.parentNode) return;
        if (popupEl.contains(e.target) || (anchor && anchor.contains(e.target))) return;
        closeTagPopups();
    };
    setTimeout(() => document.addEventListener('click', _tagPopupClickOutside), 0);
}

function openTagCategoryPopup(anchor, projectId, taskId) {
    closeTagPopups();
    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'tag-popup';
    pop.style.left = rect.left + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    const cats = (typeof TASK_CATEGORIES !== 'undefined' ? TASK_CATEGORIES : ['Budget', 'Billetterie', 'Visuels', 'Logistique', 'Autre']);
    cats.forEach(c => {
        const o = document.createElement('div');
        o.className = 'tag-popup-option';
        o.textContent = c;
        o.onclick = (e) => { e.stopPropagation(); updateTaskField(projectId, taskId, 'category', c); closeTagPopups(); };
        pop.appendChild(o);
    });
    document.body.appendChild(pop);
    _tagPopupEl = pop;
    _tagPopupAnchor = anchor;
    registerTagPopupClickOutside(pop, anchor);
}

function openTagDatePopup(anchor, projectId, taskId, currentDate) {
    closeTagPopups();
    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'tag-popup tag-popup-date';
    pop.style.left = rect.left + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    const inp = document.createElement('input');
    inp.type = 'date';
    inp.value = (currentDate || '').toString().split('T')[0] || '';
    inp.onclick = (e) => e.stopPropagation();
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); btn.click(); } };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-popup-valider';
    btn.textContent = 'Valider';
    btn.onclick = (e) => {
        e.stopPropagation();
        updateTaskField(projectId, taskId, 'dueDate', inp.value || null);
        closeTagPopups();
    };
    pop.appendChild(inp);
    pop.appendChild(btn);
    document.body.appendChild(pop);
    _tagPopupEl = pop;
    _tagPopupAnchor = anchor;
    registerTagPopupClickOutside(pop, anchor);
    setTimeout(() => inp.focus(), 50);
}

async function openTagAssigneesPopup(anchor, projectId, taskId, currentAssignedTo) {
    closeTagPopups();
    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'tag-popup tag-popup-assignees';
    pop.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    pop.style.minWidth = '200px';
    const set = new Set((currentAssignedTo || []).map(String));
    let data;
    try {
        data = await apiCall('users_list.php', 'GET');
    } catch (e) {
        pop.innerHTML = '<div class="tag-popup-option">Erreur chargement</div>';
        document.body.appendChild(pop);
        _tagPopupEl = pop;
        _tagPopupAnchor = anchor;
        registerTagPopupClickOutside(pop, anchor);
        return;
    }
    const users = (data && data.users) ? data.users : [];
    users.forEach(u => {
        const lab = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = u.id;
        cb.checked = set.has(String(u.id));
        const name = `${u.prenom || ''} ${u.nom || u.username}`.trim();
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(name || ('User ' + u.id)));
        lab.onclick = (e) => e.stopPropagation();
        pop.appendChild(lab);
    });
    const btn = document.createElement('button');
    btn.className = 'tag-popup-valider';
    btn.textContent = 'Valider';
    btn.onclick = (e) => {
        e.stopPropagation();
        const checkboxes = pop.querySelectorAll('input[type="checkbox"]:checked');
        const ids = Array.from(checkboxes).map(c => c.value);
        updateTaskField(projectId, taskId, 'assignedTo', ids);
        closeTagPopups();
    };
    pop.appendChild(btn);
    document.body.appendChild(pop);
    _tagPopupEl = pop;
    _tagPopupAnchor = anchor;
    registerTagPopupClickOutside(pop, anchor);
}

function openTagPriorityPopup(anchor, projectId, taskId) {
    closeTagPopups();
    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'tag-popup';
    pop.style.left = rect.left + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    [['high', '🔴 Haute'], ['medium', '🟠 Moyenne'], ['low', '🟢 Basse']].forEach(([val, label]) => {
        const o = document.createElement('div');
        o.className = 'tag-popup-option';
        o.textContent = label;
        o.onclick = (e) => { e.stopPropagation(); updateTaskField(projectId, taskId, 'priority', val); closeTagPopups(); };
        pop.appendChild(o);
    });
    document.body.appendChild(pop);
    _tagPopupEl = pop;
    _tagPopupAnchor = anchor;
    registerTagPopupClickOutside(pop, anchor);
}

function openTagStatusPopup(anchor, projectId, taskId) {
    closeTagPopups();
    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'tag-popup';
    pop.style.left = rect.left + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    [['todo', '⏳ À faire'], ['inprogress', '🔄 En cours'], ['done', '✅ Terminé']].forEach(([val, label]) => {
        const o = document.createElement('div');
        o.className = 'tag-popup-option';
        o.textContent = label;
        o.onclick = (e) => { e.stopPropagation(); updateTaskField(projectId, taskId, 'status', val); closeTagPopups(); };
        pop.appendChild(o);
    });
    document.body.appendChild(pop);
    _tagPopupEl = pop;
    _tagPopupAnchor = anchor;
    registerTagPopupClickOutside(pop, anchor);
}

function onTaskTagClick(e) {
    const t = e.target.closest('.task-tag-editable');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    const item = t.closest('.task-item');
    if (!item) return;
    const projectId = item.getAttribute('data-project-id');
    const taskId = item.getAttribute('data-task-id');
    const field = t.getAttribute('data-field');
    if (!projectId || !taskId || !field) return;
    const task = (() => {
        const proj = projects.find(p => p.id == projectId || String(p.id) === String(projectId));
        if (!proj || !proj.tasks) return null;
        return proj.tasks.find(tk => tk.id == taskId || String(tk.id) === String(taskId));
    })();
    if (!task || !canEditTask(migrateTaskData({...task}))) return;
    if (field === 'category') openTagCategoryPopup(t, projectId, taskId);
    else if (field === 'dueDate') openTagDatePopup(t, projectId, taskId, task.dueDate || '');
    else if (field === 'assignees') openTagAssigneesPopup(t, projectId, taskId, task.assignedTo || []);
    else if (field === 'priority') openTagPriorityPopup(t, projectId, taskId);
    else if (field === 'status') openTagStatusPopup(t, projectId, taskId);
}

function onTaskTitleClick(e) {
    const title = e.target.closest('.task-title-editable');
    if (!title || title.querySelector('input')) return;
    const item = title.closest('.task-item');
    if (!item) return;
    const projectId = item.getAttribute('data-project-id');
    const taskId = item.getAttribute('data-task-id');
    if (!projectId || !taskId) return;
    const proj = projects.find(p => p.id == projectId || String(p.id) === String(projectId));
    if (!proj || !proj.tasks) return;
    const task = proj.tasks.find(tk => tk.id == taskId || String(tk.id) === String(taskId));
    if (!task || !canEditTask(migrateTaskData({...task}))) return;
    const orig = title.textContent;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = orig;
    inp.style.cssText = 'width:100%;font-size:inherit;font-weight:inherit;padding:0.2rem;border:1px solid #ddd;border-radius:4px;';
    title.textContent = '';
    title.appendChild(inp);
    inp.focus();
    inp.select();
    let cancelled = false;
    function cleanup(save) {
        if (inp.parentNode) inp.remove();
        title.textContent = save && !cancelled ? (inp.value.trim() || orig) : orig;
        if (save && !cancelled && inp.value.trim() && inp.value.trim() !== orig) {
            updateTaskField(projectId, taskId, 'title', inp.value.trim());
        }
    }
    inp.onblur = () => cleanup(true);
    inp.onkeydown = (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); cancelled = true; cleanup(false); }
    };
}

document.addEventListener('click', function(e) {
    const inTaskList = e.target.closest('#myTasksContent, #assignedByMeContent, #allTasksContent, #projectTasksContent, #homeTasksList, #homeKanbanView, #homeTasksWidget, #spectacleAllTasksList, #spectaclePage, #bureauUnifiedTasksList, #budgetTasksList, #visuelsTasksList, #billetterieTasksList, .tasks-list-modern, .tasks-group, [id^="techTasks"]');
    if (inTaskList) {
        if (e.target.closest('.task-tag-editable')) { onTaskTagClick(e); return; }
        if (e.target.closest('.task-title-editable')) { onTaskTitleClick(e); return; }
        if (e.target.closest('.task-checkbox, .task-actions, .task-action-btn')) return;
    }
    const bureauItem = e.target.closest('.bureau-task-item[data-task-id]');
    if (bureauItem && !e.target.closest('.bureau-task-checkbox, button')) {
        const pid = bureauItem.getAttribute('data-project-id');
        const tid = bureauItem.getAttribute('data-task-id');
        if (tid) {
            try {
                if (pid && typeof openTaskDetailModal === 'function') {
                    openTaskDetailModal(pid, tid);
                } else if (typeof openBureauTaskDetailModalById === 'function') {
                    openBureauTaskDetailModalById(tid);
                }
            } catch (err) { console.error('bureau task click:', err); }
            return;
        }
    }
    const taskItem = e.target.closest('.task-item[data-task-id], .task-item-compact[data-task-id], .kanban-card[data-task-id]');
    if (taskItem && !e.target.closest('.task-tag-editable, .task-checkbox, .task-actions, .task-action-btn')) {
        const pid = taskItem.getAttribute('data-project-id') || null;
        const tid = taskItem.getAttribute('data-task-id');
        if (tid && typeof openTaskDetailModal === 'function') {
            try { openTaskDetailModal(pid, tid); } catch (err) { console.error('openTaskDetailModal:', err); }
        }
    }
});

document.addEventListener('click', function(e) {
    const tree = e.target.closest('#sidebarNavTree');
    if (!tree) return;
    const toggle = e.target.closest('.nav-tree-toggle');
    if (toggle && toggle.style.visibility !== 'hidden') {
        e.stopPropagation();
        toggleNavTreeItem(toggle);
        return;
    }
    const child = e.target.closest('.nav-tree-child[data-nav-id]');
    if (child) { navToSpectacle(child.getAttribute('data-nav-id')); return; }
    const item = e.target.closest('.nav-tree-item[data-nav-id]');
    if (item) {
        const type = item.getAttribute('data-nav-type');
        const id = item.getAttribute('data-nav-id');
        if (type === 'tournee') navToTournee(id);
        else if (type === 'spectacle') navToSpectacle(id);
    }
});

function formatDueDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
        return "Aujourd'hui";
    } else if (date.toDateString() === tomorrow.toDateString()) {
        return "Demain";
    } else {
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
}

// Fonction pour obtenir les initiales d'un utilisateur
function getUserInitials(user) {
    if (!user) return '?';
    const prenom = user.prenom || '';
    const nom = user.nom || user.username || '';
    if (prenom && nom) {
        return (prenom.charAt(0) + nom.charAt(0)).toUpperCase();
    } else if (prenom) {
        return prenom.substring(0, 2).toUpperCase();
    } else if (nom) {
        return nom.substring(0, 2).toUpperCase();
    } else if (user.username) {
        return user.username.substring(0, 2).toUpperCase();
    }
    return '?';
}

// Affichage assigné : prénom seul, ou "Prénom L." si doublon de prénom
function getAssigneeDisplayName(user) {
    if (!user) return '?';
    const prenom = (user.prenom || '').trim();
    const nom = (user.nom || user.username || '').trim();
    if (!prenom && !nom && !user.username) return '?';
    
    // Toujours afficher: Prénom + initiale du nom (ex: "Loic I.")
    if (prenom && nom) {
        return `${prenom} ${nom.charAt(0).toUpperCase()}.`;
    }
    // Si seulement prénom ou nom
    return prenom || nom || user.username || '?';
}

// Fonction pour générer une couleur à partir d'un ID
function getColorFromId(id) {
    if (!id) return '#636e72';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 50%)`;
}

// Fonction pour générer les badges des assignés
function renderAssigneeBadges(assignedTo) {
    if (!assignedTo || assignedTo.length === 0) {
        return '<span class="task-assignee-badge" style="background: #e9ecef; color: #636e72;">Non assignée</span>';
    }
    
    const badges = assignedTo.map(userId => {
        const user = getUserById(userId);
        if (!user) return null;
        const display = getAssigneeDisplayName(user);
        const color = getColorFromId(userId);
        const fullName = `${user.prenom || ''} ${user.nom || user.username}`.trim();
        return `<span class="task-assignee-badge" style="background: ${color};" title="${(fullName || display).replace(/"/g, '&quot;')}">${(display || '?').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
    }).filter(b => b !== null);
    
    return badges.join('');
}

function renderTaskItem(task, showProject = false, showActions = true) {
    // Migrer les données si nécessaire
    const migratedTask = migrateTaskData({...task});
    
    const priorityClass = `priority-${migratedTask.priority || 'medium'}`;
    const completedClass = migratedTask.status === 'done' ? 'completed' : '';
    const checkboxClass = migratedTask.status === 'done' ? 'checked' : '';
    
    let dueDateClass = '';
    let dueDateText = '';
    if (migratedTask.dueDate) {
        if (isTaskOverdue(migratedTask)) {
            dueDateClass = 'overdue';
            dueDateText = formatDueDate(migratedTask.dueDate);
        } else if (isTaskToday(migratedTask)) {
            dueDateClass = 'today';
            dueDateText = "Aujourd'hui";
        } else {
            dueDateText = formatDueDate(migratedTask.dueDate);
        }
    }

    // Récupérer les badges des assignés
    const assignedTo = migratedTask.assignedTo || [];
    const assigneeBadges = renderAssigneeBadges(assignedTo);

    // Priorité badge
    const priorityBadge = migratedTask.priority === 'high' ? '🔴' : migratedTask.priority === 'medium' ? '🟠' : '🟢';
    const priorityText = migratedTask.priority === 'high' ? 'Haute' : migratedTask.priority === 'medium' ? 'Moyenne' : 'Basse';

    // Actions disponibles
    const canEdit = showActions && canEditTask(migratedTask);
    const canChangeStatus = canChangeTaskStatus(migratedTask);
    const projectId = migratedTask.projectId || currentTasksProject?.id;
    const esc = (s) => (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const textEsc = (s) => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    
    // Classes et onclick pour les tags éditables
    const editableClass = canEdit ? ' task-tag-editable' : '';
    const categoryClick = canEdit ? ` onclick="editTaskTag('${esc(projectId)}', '${esc(migratedTask.id)}', 'category')"` : '';
    const dateClick = canEdit ? ` onclick="editTaskTag('${esc(projectId)}', '${esc(migratedTask.id)}', 'dueDate')"` : '';
    const assignClick = canEdit ? ` onclick="editTaskTag('${esc(projectId)}', '${esc(migratedTask.id)}', 'assignees')"` : '';
    const priorityClick = canEdit ? ` onclick="editTaskTag('${esc(projectId)}', '${esc(migratedTask.id)}', 'priority')"` : '';

    return `
        <div class="task-item ${priorityClass} ${completedClass}" data-task-id="${esc(migratedTask.id)}" data-project-id="${esc(projectId)}">
            ${canChangeStatus ? `
                <div class="task-checkbox ${checkboxClass}" onclick="toggleTaskStatus('${esc(projectId)}', '${esc(migratedTask.id)}')">
                    ${migratedTask.status === 'done' ? '✓' : ''}
                </div>
            ` : `
                <div class="task-checkbox ${checkboxClass}" style="opacity: 0.5; cursor: not-allowed;">
                    ${migratedTask.status === 'done' ? '✓' : ''}
                </div>
            `}
            <div class="task-content" onclick="handleTaskClick(event,'${esc(projectId)}','${esc(migratedTask.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handleTaskClick(event,'${esc(projectId)}','${esc(migratedTask.id)}')}" role="button" tabindex="0" style="cursor:pointer">
                <div class="task-title">${textEsc(migratedTask.title)}</div>
                <div class="task-meta">
                    <span class="task-category${editableClass}"${categoryClick}>📁 ${migratedTask.category || 'Autre'}</span>
                    ${migratedTask.tag ? `<span class="task-tag">${migratedTask.tag}</span>` : ''}
                    <span class="task-meta-item task-due ${dueDateClass}${editableClass}"${dateClick}>📅 ${dueDateText || 'Pas de date'}</span>
                    <span class="task-assignees${editableClass}"${assignClick}>👤 ${assigneeBadges || 'Non assigné'}</span>
                    ${showProject ? `<span class="home-task-project">📁 ${migratedTask.projectName}</span>` : ''}
                    <span class="task-priority-badge${editableClass}"${priorityClick} title="Priorité ${priorityText}">${priorityBadge} ${priorityText}</span>
                </div>
            </div>
            ${showActions ? `
                <div class="task-actions">
                    ${canEdit ? `<button class="task-action-btn" onclick="editTask('${esc(projectId)}', '${esc(migratedTask.id)}')" title="Modifier">✏️</button>` : ''}
                    ${canEdit ? `<button class="task-action-btn" onclick="deleteTask('${esc(projectId)}', '${esc(migratedTask.id)}')" title="Supprimer">🗑️</button>` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

// Fonction pour éditer rapidement un tag de tâche
function editTaskTag(projectId, taskId, field) {
    event.stopPropagation();
    
    // Trouver la tâche
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    let task = null;
    if (project.tasks) {
        task = project.tasks.find(t => t.id === taskId);
    }
    if (!task) return;
    
    // Créer le popup d'édition selon le champ
    let popup = document.getElementById('taskTagEditPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'taskTagEditPopup';
        popup.className = 'task-tag-popup';
        document.body.appendChild(popup);
    }
    
    let content = '';
    
    switch(field) {
        case 'category':
            const categories = ['Production', 'Logistique', 'Technique', 'Communication', 'Billetterie', 'Administratif', 'Budget'];
            content = `
                <div class="popup-header">📁 Catégorie</div>
                <div class="popup-options">
                    ${categories.map(cat => `
                        <div class="popup-option ${task.category === cat ? 'active' : ''}" 
                             onclick="updateTaskTag('${projectId}', '${taskId}', 'category', '${cat}')">
                            ${cat}
                        </div>
                    `).join('')}
                </div>
            `;
            break;
            
        case 'priority':
            content = `
                <div class="popup-header">⚡ Priorité</div>
                <div class="popup-options">
                    <div class="popup-option ${task.priority === 'high' ? 'active' : ''}" 
                         onclick="updateTaskTag('${projectId}', '${taskId}', 'priority', 'high')">
                        🔴 Haute
                    </div>
                    <div class="popup-option ${task.priority === 'medium' ? 'active' : ''}" 
                         onclick="updateTaskTag('${projectId}', '${taskId}', 'priority', 'medium')">
                        🟠 Moyenne
                    </div>
                    <div class="popup-option ${task.priority === 'low' ? 'active' : ''}" 
                         onclick="updateTaskTag('${projectId}', '${taskId}', 'priority', 'low')">
                        🟢 Basse
                    </div>
                </div>
            `;
            break;
            
        case 'dueDate':
            content = `
                <div class="popup-header">📅 Date d'échéance</div>
                <div class="popup-content">
                    <input type="date" id="popupDateInput" value="${task.dueDate || ''}" 
                           onchange="updateTaskTag('${projectId}', '${taskId}', 'dueDate', this.value)">
                    <div class="popup-quick-dates">
                        <button onclick="setQuickDate('${projectId}', '${taskId}', 'today')">Aujourd'hui</button>
                        <button onclick="setQuickDate('${projectId}', '${taskId}', 'tomorrow')">Demain</button>
                        <button onclick="setQuickDate('${projectId}', '${taskId}', 'nextWeek')">Semaine prochaine</button>
                    </div>
                    ${task.dueDate ? `<button class="popup-clear" onclick="updateTaskTag('${projectId}', '${taskId}', 'dueDate', '')">Supprimer la date</button>` : ''}
                </div>
            `;
            break;
            
        case 'assignees':
            const currentAssignees = (task.assignedTo || []).map(String);
            content = `
                <div class="popup-header">👤 Assignés</div>
                <div class="popup-options popup-assignees">
                    ${(allUsers || []).map(user => `
                        <div class="popup-option popup-checkbox ${currentAssignees.includes(String(user.id)) ? 'active' : ''}" 
                             onclick="event.stopPropagation(); toggleTaskAssignee('${projectId}', '${taskId}', '${user.id}')">
                            <span class="popup-checkbox-icon">${currentAssignees.includes(String(user.id)) ? '✓' : ''}</span>
                            ${escapeHtml((user.prenom || '') + ' ' + (user.nom || user.username))}
                        </div>
                    `).join('')}
                </div>
            `;
            break;
    }
    
    popup.innerHTML = `
        <div class="popup-backdrop" onclick="closeTaskTagPopup()"></div>
        <div class="popup-box">
            ${content}
            <button class="popup-close" onclick="closeTaskTagPopup()">✕</button>
        </div>
    `;
    
    popup.classList.add('active');
    
    // Positionner le popup près de l'élément cliqué
    const rect = event.target.getBoundingClientRect();
    const popupBox = popup.querySelector('.popup-box');
    popupBox.style.top = Math.min(rect.bottom + 10, window.innerHeight - 300) + 'px';
    popupBox.style.left = Math.min(rect.left, window.innerWidth - 250) + 'px';
}

function closeTaskTagPopup() {
    const popup = document.getElementById('taskTagEditPopup');
    if (popup) popup.classList.remove('active');
}

function updateTaskTag(projectId, taskId, field, value) {
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task[field] = value;
    task.updatedAt = new Date().toISOString();
    
    saveProjectsAsync();
    closeTaskTagPopup();
    
    // Rafraîchir les affichages
    renderHomeTasksWidget();
    if (document.getElementById('globalTasksPage')?.classList.contains('active')) {
        renderGlobalTasksPage();
    }
}

function toggleTaskAssignee(projectId, taskId, userId) {
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    if (!task.assignedTo) task.assignedTo = [];
    
    // Convertir en string pour comparaison cohérente
    const userIdStr = String(userId);
    const index = task.assignedTo.findIndex(id => String(id) === userIdStr);
    
    if (index === -1) {
        task.assignedTo.push(userIdStr);
        const projectName = project.name || project.lieu || 'Projet';
        notifyUserAssigned(userIdStr, 'Nouvelle tâche assignée', `Vous avez été assigné(e) à la tâche « ${task.title || 'Sans titre'} » du projet ${projectName}.`, 'assignment', { type: 'task', projectId: project.id, taskId: task.id });
    } else {
        task.assignedTo.splice(index, 1);
    }
    
    task.updatedAt = new Date().toISOString();
    
    // Mettre à jour l'affichage du checkbox sans refaire tout le popup
    if (event && event.target) {
        const option = event.target.closest('.popup-option');
        if (option) {
            const isNowAssigned = task.assignedTo.some(id => String(id) === userIdStr);
            option.classList.toggle('active', isNowAssigned);
            const icon = option.querySelector('.popup-checkbox-icon');
            if (icon) icon.textContent = isNowAssigned ? '✓' : '';
        }
    }
    
    saveProjectsAsync();
}

function setQuickDate(projectId, taskId, preset) {
    const today = new Date();
    let date;
    
    switch(preset) {
        case 'today':
            date = today;
            break;
        case 'tomorrow':
            date = new Date(today);
            date.setDate(date.getDate() + 1);
            break;
        case 'nextWeek':
            date = new Date(today);
            date.setDate(date.getDate() + 7);
            break;
    }
    
    const dateStr = date.toISOString().split('T')[0];
    updateTaskTag(projectId, taskId, 'dueDate', dateStr);
}

let homeTasksShowAll = false;
let homeTasksViewMode = 'list'; // 'list' ou 'kanban'
const HOME_TASKS_LIMIT = 5;

function switchHomeTasksView(mode) {
    homeTasksViewMode = mode;
    const listBtn = document.getElementById('homeTasksViewListBtn');
    const kanbanBtn = document.getElementById('homeTasksViewKanbanBtn');
    const kanbanView = document.getElementById('homeKanbanView');
    const listView = document.getElementById('homeTasksList');
    const widget = document.getElementById('homeTasksWidget');
    
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
    if (kanbanBtn) kanbanBtn.classList.toggle('active', mode === 'kanban');
    
    if (kanbanView) {
        if (mode === 'kanban') {
            kanbanView.classList.add('active');
        } else {
            kanbanView.classList.remove('active');
        }
    }
    
    if (listView) {
        if (mode === 'list') {
            listView.classList.remove('hidden');
        } else {
            listView.classList.add('hidden');
        }
    }
    
    // Masquer/afficher le bouton "Voir tout" selon le mode
    if (widget) {
        const voirToutBtn = widget.querySelector('.home-kanban-voir-tout');
        if (voirToutBtn) {
            voirToutBtn.style.display = mode === 'kanban' ? 'block' : 'none';
        }
    }
    
    renderHomeTasksWidget();
}

async function renderHomeTasksWidget() {
    const widget = document.getElementById('homeTasksWidget');
    if (widget) widget.style.display = 'block';
    if (typeof renderHomeTasksList === 'function') {
        await renderHomeTasksList();
        return;
    }
    await renderHomeTasks();
}

function renderHomeListView(filteredTasks, overdue, today, thisWeek) {
    const container = document.getElementById('homeTasksList');
    if (!container) return;
    
    // Afficher les compteurs (plus compacts)
    const countersHtml = `
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
            ${overdue.length > 0 ? `<span style="background: #ff6b6b; color: white; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">🔴 ${overdue.length} en retard</span>` : ''}
            ${today.length > 0 ? `<span style="background: #ff9f43; color: white; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">🟠 ${today.length} aujourd'hui</span>` : ''}
            ${thisWeek.length > 0 ? `<span style="background: #ffd93d; color: #2d3436; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">🟡 ${thisWeek.length} cette semaine</span>` : ''}
        </div>
    `;

    // Trier par priorité et date
    filteredTasks.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (isTaskOverdue(a) && !isTaskOverdue(b)) return -1;
        if (!isTaskOverdue(a) && isTaskOverdue(b)) return 1;
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
    });

    const totalTasks = filteredTasks.length;
    const tasksToShow = homeTasksShowAll ? filteredTasks : filteredTasks.slice(0, HOME_TASKS_LIMIT);
    const hasMore = totalTasks > HOME_TASKS_LIMIT && !homeTasksShowAll;

    let html = countersHtml + '<div class="tasks-list-modern">';
    html += tasksToShow.map(t => renderTaskItem(t, true, true)).join('');
    html += '</div>';

    if (hasMore) {
        html += `<button class="btn-show-more" onclick="toggleHomeTasksShowAll()">
            Voir ${totalTasks - HOME_TASKS_LIMIT} tâche(s) de plus →
        </button>`;
    } else if (homeTasksShowAll && totalTasks > HOME_TASKS_LIMIT) {
        html += `<button class="btn-show-more" onclick="toggleHomeTasksShowAll()">
            Afficher moins
        </button>`;
    }
    
    // Obtenir le nombre total de tâches pour le bouton
    const allMyTasks = getMyTasks().filter(t => t.status !== 'done');
    const totalTasksCount = allMyTasks.length;
    
    // Ajouter un lien vers la page complète avec le nombre total
    html += `<div style="text-align: center; margin-top: 0.75rem;">
        <button class="btn btn-secondary" onclick="openGlobalTasksPage()" style="font-size: 0.75rem; padding: 0.5rem 1rem;">Voir tout → (${totalTasksCount})</button>
    </div>`;

    container.innerHTML = html;
}

function renderHomeKanbanView(filteredTasks) {
    const container = document.getElementById('homeKanbanView');
    if (!container) return;
    
    // Organiser par statut (seulement les tâches non terminées sont affichées dans le widget)
    const { todo, inProgress } = organizeTasksByStatus(filteredTasks);
    
    const textEsc = (s) => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    
    let html = '';
    
    // Colonne À faire
    html += `
        <div class="kanban-column kanban-column-todo" data-status="todo">
            <div class="kanban-column-header">
                <span>⏳ À faire</span>
                <span class="kanban-column-count">${todo.length}</span>
            </div>
            <div class="kanban-cards kanban-drop-zone" id="home-kanban-todo" ondrop="handleKanbanDrop(event, 'todo')" ondragover="handleKanbanDragOver(event)" ondragleave="handleKanbanDragLeave(event)">
                ${todo.map(t => renderKanbanCard(t)).join('')}
            </div>
        </div>
    `;
    
    // Colonne En cours
    html += `
        <div class="kanban-column kanban-column-inprogress" data-status="inprogress">
            <div class="kanban-column-header">
                <span>🔄 En cours</span>
                <span class="kanban-column-count">${inProgress.length}</span>
            </div>
            <div class="kanban-cards kanban-drop-zone" id="home-kanban-inprogress" ondrop="handleKanbanDrop(event, 'inprogress')" ondragover="handleKanbanDragOver(event)" ondragleave="handleKanbanDragLeave(event)">
                ${inProgress.map(t => renderKanbanCard(t)).join('')}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    container.classList.add('active');
    
    // Obtenir le nombre total de tâches pour le bouton
    const allMyTasks = getMyTasks().filter(t => t.status !== 'done');
    const totalTasksCount = allMyTasks.length;
    
    // Ajouter le bouton "Voir tout" après le conteneur Kanban avec le nombre total
    const widget = document.getElementById('homeTasksWidget');
    if (widget) {
        let voirToutBtn = widget.querySelector('.home-kanban-voir-tout');
        if (!voirToutBtn) {
            voirToutBtn = document.createElement('div');
            voirToutBtn.className = 'home-kanban-voir-tout';
            voirToutBtn.style.cssText = 'text-align: center; margin-top: 0.75rem;';
            voirToutBtn.innerHTML = `<button class="btn btn-secondary" onclick="openGlobalTasksPage()" style="font-size: 0.75rem; padding: 0.5rem 1rem;">Voir tout → (${totalTasksCount})</button>`;
            widget.appendChild(voirToutBtn);
        } else {
            // Mettre à jour le nombre si le bouton existe déjà
            voirToutBtn.innerHTML = `<button class="btn btn-secondary" onclick="openGlobalTasksPage()" style="font-size: 0.75rem; padding: 0.5rem 1rem;">Voir tout → (${totalTasksCount})</button>`;
        }
    }
}

function toggleHomeTasksShowAll() {
    homeTasksShowAll = !homeTasksShowAll;
    renderHomeTasksWidget();
}

function filterHomeTasks(filter) {
    homeTasksFilter = filter;
    homeTasksShowAll = false;
    document.querySelectorAll('.home-task-filters .task-filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderHomeTasksWidget();
}

// openGlobalTasksPage redirige vers Mon Bureau > Tâches > Projets (défini plus bas)

function closeGlobalTasksPage() {
    const page = document.getElementById('globalTasksPage');
    if (page) page.classList.remove('active');
    updateFabAppearance();
}

// Fonction pour organiser les tâches par période
function organizeTasksByPeriod(tasks) {
    const overdue = [];
    const today = [];
    const thisWeek = [];
    const later = [];
    
    tasks.forEach(task => {
        if (task.status === 'done') return; // Ignorer les tâches terminées dans cette organisation
        
        if (isTaskOverdue(task)) {
            overdue.push(task);
        } else if (isTaskToday(task)) {
            today.push(task);
        } else if (isTaskThisWeek(task)) {
            thisWeek.push(task);
        } else {
            later.push(task);
        }
    });
    
    return { overdue, today, thisWeek, later };
}

// Fonction pour organiser les tâches par statut
function organizeTasksByStatus(tasks) {
    const todo = tasks.filter(t => normalizeAggregatedTaskStatus(t) === 'todo');
    const inProgress = tasks.filter(t => isTaskStatusInProgress(t.status));
    const done = tasks.filter(t => normalizeAggregatedTaskStatus(t) === 'done');
    
    // Pour les tâches terminées, ne garder que celles des 7 derniers jours
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentDone = done.filter(t => {
        if (!t.completedAt) return false;
        return new Date(t.completedAt) >= sevenDaysAgo;
    });
    
    return { todo, inProgress, done: recentDone };
}

let tasksViewMode = 'list'; // 'list' ou 'kanban'

function switchTasksView(mode) {
    tasksViewMode = mode;
    const listBtn = document.getElementById('tasksViewListBtn');
    const kanbanBtn = document.getElementById('tasksViewKanbanBtn');
    const kanbanView = document.getElementById('kanbanView');
    const listView = document.getElementById('listView');
    
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
    if (kanbanBtn) kanbanBtn.classList.toggle('active', mode === 'kanban');
    
    if (kanbanView) {
        if (mode === 'kanban') {
            kanbanView.classList.add('active');
        } else {
            kanbanView.classList.remove('active');
        }
    }
    
    if (listView) {
        if (mode === 'list') {
            listView.classList.remove('hidden');
        } else {
            listView.classList.add('hidden');
        }
    }
    
    renderGlobalTasksPage();
}

// Fonction pour rendre la page de tâches globale
function renderGlobalTasksPage() {
    if (!currentUser) return;
    const page = document.getElementById('globalTasksPage');
    if (!page || !page.classList.contains('active')) return;

    // UI actuelle (tasksListView / tasksKanbanView dans index.html)
    if (document.getElementById('tasksListView') || document.getElementById('tasksKanbanView')) {
        if (typeof populateTaskFilters === 'function') populateTaskFilters();
        if (typeof renderGlobalTasks === 'function') renderGlobalTasks();
        return;
    }

    // Ancienne UI (fallback)
    const allTasksSection = document.getElementById('allTasksSection');
    if (allTasksSection) {
        if (currentUser.role === 'admin') {
            allTasksSection.style.display = 'block';
            renderAllTasksSection();
        } else {
            allTasksSection.style.display = 'none';
        }
    }
    
    // Rendre les sections principales selon le mode
    if (tasksViewMode === 'kanban') {
        renderKanbanView();
        const myTasksSection = document.getElementById('myTasksSection');
        const assignedByMeSection = document.getElementById('assignedByMeSection');
        if (myTasksSection) myTasksSection.style.display = 'none';
        if (assignedByMeSection) assignedByMeSection.style.display = 'none';
    } else {
        renderMyTasksSection();
        renderAssignedByMeSection();
        const myTasksSection = document.getElementById('myTasksSection');
        const assignedByMeSection = document.getElementById('assignedByMeSection');
        if (myTasksSection) myTasksSection.style.display = 'block';
        if (assignedByMeSection) assignedByMeSection.style.display = 'block';
    }
    
    const filtersEl = document.getElementById('globalTasksFilters');
    if (filtersEl && typeof renderGlobalTasksFilters === 'function') {
        renderGlobalTasksFilters();
    }
}

// Fonction pour rendre la section "Mes tâches"
function renderMyTasksSection() {
    const container = document.getElementById('myTasksContent');
    const myTasks = getMyTasks();
    
    if (myTasks.length === 0) {
        container.innerHTML = `
            <div class="tasks-empty">
                <div class="tasks-empty-icon">✅</div>
                <div>Aucune tâche assignée.</div>
            </div>
        `;
        return;
    }
    
    const { overdue, today, thisWeek, later } = organizeTasksByPeriod(myTasks);
    const done = myTasks.filter(t => t.status === 'done');
    
    let html = '';
    
    if (overdue.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title overdue">🔴 EN RETARD (${overdue.length})</div>
            ${overdue.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    if (today.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title">🟠 AUJOURD'HUI (${today.length})</div>
            ${today.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    if (thisWeek.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title">🟡 CETTE SEMAINE (${thisWeek.length})</div>
            ${thisWeek.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    if (later.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title">🟢 PLUS TARD (${later.length})</div>
            ${later.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    if (done.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title done">✅ TERMINÉES (${done.length})</div>
            ${done.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    container.innerHTML = html || '<div class="tasks-empty"><div class="tasks-empty-icon">✅</div><div>Aucune tâche.</div></div>';
}

function renderKanbanView() {
    const container = document.getElementById('kanbanView');
    const listView = document.getElementById('listView');
    if (!container) return;
    
    // Afficher Kanban, masquer liste
    container.classList.add('active');
    if (listView) listView.classList.add('hidden');
    
    const myTasks = getMyTasks();
    const { todo, inProgress, done } = organizeTasksByStatus(myTasks);
    
    const textEsc = (s) => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    
    let html = '';
    
    // Colonne À faire
    html += `
        <div class="kanban-column kanban-column-todo" data-status="todo">
            <div class="kanban-column-header">
                <span>⏳ À faire</span>
                <span class="kanban-column-count">${todo.length}</span>
            </div>
            <div class="kanban-cards kanban-drop-zone" id="kanban-todo" ondrop="handleKanbanDrop(event, 'todo')" ondragover="handleKanbanDragOver(event)" ondragleave="handleKanbanDragLeave(event)">
                ${todo.map(t => renderKanbanCard(t)).join('')}
            </div>
        </div>
    `;
    
    // Colonne En cours
    html += `
        <div class="kanban-column kanban-column-inprogress" data-status="inprogress">
            <div class="kanban-column-header">
                <span>🔄 En cours</span>
                <span class="kanban-column-count">${inProgress.length}</span>
            </div>
            <div class="kanban-cards kanban-drop-zone" id="kanban-inprogress" ondrop="handleKanbanDrop(event, 'inprogress')" ondragover="handleKanbanDragOver(event)" ondragleave="handleKanbanDragLeave(event)">
                ${inProgress.map(t => renderKanbanCard(t)).join('')}
            </div>
        </div>
    `;
    
    // Colonne Terminé
    html += `
        <div class="kanban-column kanban-column-done" data-status="done">
            <div class="kanban-column-header">
                <span>✅ Terminé</span>
                <span class="kanban-column-count">${done.length}</span>
            </div>
            <div class="kanban-cards kanban-drop-zone" id="kanban-done" ondrop="handleKanbanDrop(event, 'done')" ondragover="handleKanbanDragOver(event)" ondragleave="handleKanbanDragLeave(event)">
                ${done.map(t => renderKanbanCard(t)).join('')}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

function renderKanbanCard(task) {
    const migratedTask = migrateTaskData({...task});
    const project = projects.find(p => p.tasks && p.tasks.some(t => String(t.id) === String(migratedTask.id)));
    if (!project) return '';
    
    const projectId = project.id;
    const taskId = migratedTask.id;
    const priority = migratedTask.priority || 'medium';
    const category = migratedTask.category || '';
    const dueDate = migratedTask.dueDate ? formatDueDate(migratedTask.dueDate) : '';
    const assignedTo = migratedTask.assignedTo || [];
    const canEdit = canEditTask(migratedTask);
    
    const textEsc = (s) => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const esc = (s) => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    
    let badges = '';
    if (category) {
        badges += `<span class="kanban-card-badge category">${textEsc(category)}</span>`;
    }
    if (priority) {
        badges += `<span class="kanban-card-badge priority-${priority}">${priority === 'high' ? '🔴' : priority === 'medium' ? '🟠' : '🟢'} ${priority === 'high' ? 'Haute' : priority === 'medium' ? 'Moyenne' : 'Basse'}</span>`;
    }
    if (dueDate) {
        badges += `<span class="kanban-card-badge" style="background: #e9ecef; color: #495057;">📅 ${textEsc(dueDate)}</span>`;
    }
    
    return `
        <div class="kanban-card priority-${priority}" 
             draggable="true" 
             ondragstart="handleKanbanDragStart(event, '${esc(projectId)}', '${esc(taskId)}')"
             ondragend="handleKanbanDragEnd(event)"
             onclick="event.stopPropagation(); openTaskDetailModal('${esc(projectId)}', '${esc(taskId)}');"
             data-project-id="${esc(projectId)}"
             data-task-id="${esc(taskId)}">
            <div class="kanban-card-title">${textEsc(migratedTask.title || 'Sans titre')}</div>
            ${badges ? `<div class="kanban-card-meta">${badges}</div>` : ''}
        </div>
    `;
}

function handleKanbanDragStart(e, projectId, taskId) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ projectId, taskId }));
    e.currentTarget.classList.add('dragging');
}

function handleKanbanDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.kanban-drop-zone').forEach(zone => {
        zone.classList.remove('drag-over');
    });
}

function handleKanbanDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleKanbanDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleKanbanDrop(e, newStatus) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { projectId, taskId } = data;
        
        const project = projects.find(p => p.id == projectId || String(p.id) === String(projectId));
        if (!project || !project.tasks) return;
        
        const task = project.tasks.find(t => String(t.id) === String(taskId));
        if (!task) return;
        
        const migratedTask = migrateTaskData({...task});
        const currentStatus = migratedTask.status;
        
        if (currentStatus === newStatus) return;
        
        updateTaskField(projectId, taskId, 'status', newStatus);
    } catch (err) {
        console.error('Erreur lors du drop Kanban:', err);
    }
}

// Fonction pour rendre la section "Tâches que j'ai assignées"
function renderAssignedByMeSection() {
    const container = document.getElementById('assignedByMeContent');
    const assignedTasks = getTasksAssignedByMe();
    
    if (assignedTasks.length === 0) {
        container.innerHTML = `
            <div class="tasks-empty">
                <div class="tasks-empty-icon">📤</div>
                <div>Vous n'avez assigné aucune tâche à d'autres personnes.</div>
            </div>
        `;
        return;
    }
    
    const { todo, inProgress, done } = organizeTasksByStatus(assignedTasks);
    
    let html = '';
    
    if (todo.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title">⏳ À FAIRE (${todo.length})</div>
            ${todo.map(t => renderAssignedTaskItem(t)).join('')}
        </div>`;
    }
    
    if (inProgress.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title">🔄 EN COURS (${inProgress.length})</div>
            ${inProgress.map(t => renderAssignedTaskItem(t)).join('')}
        </div>`;
    }
    
    if (done.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title done">✅ TERMINÉES RÉCEMMENT (${done.length})</div>
            ${done.map(t => renderAssignedTaskItem(t)).join('')}
        </div>`;
    }
    
    container.innerHTML = html;
}

// Fonction pour rendre un item de tâche assignée (sans possibilité de changer le statut)
function renderAssignedTaskItem(task) {
    const migratedTask = migrateTaskData({...task});
    const priorityClass = `priority-${migratedTask.priority || 'medium'}`;
    const completedClass = migratedTask.status === 'done' ? 'completed' : '';
    
    let dueDateClass = '';
    let dueDateText = '';
    if (migratedTask.dueDate) {
        if (isTaskOverdue(migratedTask)) {
            dueDateClass = 'overdue';
            dueDateText = formatDueDate(migratedTask.dueDate);
        } else if (isTaskToday(migratedTask)) {
            dueDateClass = 'today';
            dueDateText = "Aujourd'hui";
        } else {
            dueDateText = formatDueDate(migratedTask.dueDate);
        }
    }

    const assignedTo = migratedTask.assignedTo || [];
    const assigneeBadges = renderAssigneeBadges(assignedTo);
    
    // Afficher qui a complété la tâche
    let completedInfo = '';
    if (migratedTask.status === 'done' && migratedTask.completedBy) {
        const completedByUser = getUserById(migratedTask.completedBy);
        const completedByName = completedByUser ? `${completedByUser.prenom || ''} ${completedByUser.nom || completedByUser.username}`.trim() : 'Inconnu';
        const completedDate = migratedTask.completedAt ? new Date(migratedTask.completedAt).toLocaleDateString('fr-FR') : '';
        completedInfo = `<div style="font-size: 0.75rem; color: var(--success); margin-top: 0.3rem;">✅ Terminée par ${completedByName}${completedDate ? ' le ' + completedDate : ''}</div>`;
    }
    
    const statusBadge = migratedTask.status === 'done' ? '✅ Terminée' : 
                       migratedTask.status === 'inprogress' ? '🔄 En cours' : 
                       '⏳ À faire';
    
    const priorityBadge = migratedTask.priority === 'high' ? '🔴' : migratedTask.priority === 'medium' ? '🟠' : '🟢';
    const projectId = migratedTask.projectId || currentTasksProject?.id;
    const canEdit = canEditTask(migratedTask);
    const esc = (s) => (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const textEsc = (s) => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const edCat = canEdit ? ' task-tag-editable" data-field="category' : '';
    const edDate = canEdit ? ' task-tag-editable" data-field="dueDate' : '';
    const edAssign = canEdit ? ' task-tag-editable" data-field="assignees' : '';
    const edPri = canEdit ? ' task-tag-editable" data-field="priority' : '';
    const edStatus = canEdit ? ' task-tag-editable" data-field="status' : '';
    const edTitle = canEdit ? ' task-title-editable' : '';
    
    return `
        <div class="task-item ${priorityClass} ${completedClass}" data-task-id="${esc(migratedTask.id)}" data-project-id="${esc(projectId)}">
            <div class="task-checkbox ${migratedTask.status === 'done' ? 'checked' : ''}" style="opacity: 0.5; cursor: not-allowed;">
                ${migratedTask.status === 'done' ? '✓' : ''}
            </div>
            <div class="task-content" style="cursor:pointer;" onclick="handleTaskClick(event,'${esc(projectId)}','${esc(migratedTask.id)}')">
                <div class="task-title${edTitle}">${textEsc(migratedTask.title)}</div>
                <div class="task-meta">
                    <span class="task-category${edCat}">📁 ${migratedTask.category || 'Autre'}</span>
                    ${dueDateText ? `<span class="task-meta-item task-due ${dueDateClass}${edDate}">📅 ${dueDateText}</span>` : ''}
                    <span class="task-assignees${edAssign}">→ ${assigneeBadges}</span>
                    <span class="task-priority-badge${edPri}" title="Priorité">${priorityBadge}</span>
                    <span class="task-status-badge${edStatus}" style="background: #e9ecef; padding: 0.3rem 0.6rem; border-radius: 15px; font-size: 0.75rem; font-weight: 600;">${statusBadge}</span>
                </div>
                ${completedInfo}
            </div>
            ${canEdit ? `
                <div class="task-actions">
                    <button class="task-action-btn" onclick="editTask('${esc(projectId)}', '${esc(migratedTask.id)}')" title="Modifier">✏️</button>
                    <button class="task-action-btn" onclick="deleteTask('${esc(projectId)}', '${esc(migratedTask.id)}')" title="Supprimer">🗑️</button>
                </div>
            ` : ''}
        </div>
    `;
}

// Fonction pour rendre la section "Toutes les tâches" (Admin)
function renderAllTasksSection() {
    const container = document.getElementById('allTasksContent');
    const allTasks = getAllTasksForAdmin();
    
    if (allTasks.length === 0) {
        container.innerHTML = `
            <div class="tasks-empty">
                <div class="tasks-empty-icon">📋</div>
                <div>Aucune tâche dans le système.</div>
            </div>
        `;
        return;
    }
    
    // Organiser par statut
    const { todo, inProgress, done } = organizeTasksByStatus(allTasks);
    
    let html = '';
    
    if (todo.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title">⏳ À FAIRE (${todo.length})</div>
            ${todo.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    if (inProgress.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title">🔄 EN COURS (${inProgress.length})</div>
            ${inProgress.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    if (done.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-title done">✅ TERMINÉES (${done.length})</div>
            ${done.map(t => renderTaskItem(t, true, true)).join('')}
        </div>`;
    }
    
    container.innerHTML = html;
}

// Fonction pour rendre les filtres globaux
function renderGlobalTasksFilters() {
    const container = document.getElementById('globalTasksFilters');
    if (!container) return;
    container.innerHTML = `
        <div class="tasks-filters">
            <select id="globalTasksStatusFilter" onchange="applyGlobalTasksFilters()" style="padding: 0.5rem; border: 2px solid var(--border); border-radius: 8px; background: white; font-size: 0.9rem; margin-right: 0.5rem;">
                <option value="all">Tous les statuts</option>
                <option value="todo">⏳ À faire</option>
                <option value="inprogress">🔄 En cours</option>
                <option value="done">✅ Terminée</option>
            </select>
            <select id="globalTasksCategoryFilter" onchange="applyGlobalTasksFilters()" style="padding: 0.5rem; border: 2px solid var(--border); border-radius: 8px; background: white; font-size: 0.9rem; margin-right: 0.5rem;">
                <option value="all">Toutes les catégories</option>
                ${TASK_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select id="globalTasksPriorityFilter" onchange="applyGlobalTasksFilters()" style="padding: 0.5rem; border: 2px solid var(--border); border-radius: 8px; background: white; font-size: 0.9rem;">
                <option value="all">Toutes les priorités</option>
                <option value="high">🔴 Haute</option>
                <option value="medium">🟠 Moyenne</option>
                <option value="low">🟢 Basse</option>
            </select>
        </div>
    `;
}

// Fonction pour appliquer les filtres globaux
function applyGlobalTasksFilters() {
    // Pour l'instant, on re-rend simplement les sections
    // On pourra améliorer cela plus tard avec un système de filtrage plus avancé
    renderGlobalTasksPage();
}

function openProjectTasksPage(projectId) {
    currentTasksProject = projects.find(p => p.id === projectId);
    if (!currentTasksProject) return;
    if (!currentTasksProject.tasks) currentTasksProject.tasks = [];
    document.getElementById('projectTasksName').textContent = currentTasksProject.name;
    renderProjectTasks();
    document.getElementById('projectTasksPage').classList.add('active');
}

function closeProjectTasksPage() {
    document.getElementById('projectTasksPage').classList.remove('active');
    if (currentSpectacleDetail) viewSpectacle(currentSpectacleDetail.id);
    currentTasksProject = null;
}

function renderProjectTasks() {
    if (!currentTasksProject) return;
    const container = document.getElementById('projectTasksContent');
    const tasks = currentTasksProject.tasks || [];
    
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    
    document.getElementById('projectTasksProgressFill').style.width = percentage + '%';
    document.getElementById('projectTasksProgressText').textContent = `${percentage}% (${done}/${total})`;
    
    const statusFilter = document.getElementById('projectTasksStatusFilter').value;
    const categoryFilter = document.getElementById('projectTasksCategoryFilter').value;
    const priorityFilter = document.getElementById('projectTasksPriorityFilter').value;
    
    let filteredTasks = [...tasks];
    if (statusFilter !== 'all') filteredTasks = filteredTasks.filter(t => t.status === statusFilter);
    if (categoryFilter !== 'all') filteredTasks = filteredTasks.filter(t => t.category === categoryFilter);
    if (priorityFilter !== 'all') filteredTasks = filteredTasks.filter(t => t.priority === priorityFilter);

    if (filteredTasks.length === 0) {
        container.innerHTML = `<div class="tasks-empty">
            <div class="tasks-empty-icon">📋</div>
            <div>Aucune tâche.</div>
            <div style="font-size: 0.85rem; margin-top: 0.5rem;">Cliquez sur "+ Nouvelle tâche" pour commencer.</div>
        </div>`;
        return;
    }

    const overdue = filteredTasks.filter(t => isTaskOverdue(t));
    const thisWeek = filteredTasks.filter(t => (isTaskThisWeek(t) || isTaskToday(t)) && !isTaskOverdue(t) && t.status !== 'done');
    const todo = filteredTasks.filter(t => t.status !== 'done' && !isTaskOverdue(t) && !isTaskThisWeek(t) && !isTaskToday(t));
    const doneTasks = filteredTasks.filter(t => t.status === 'done');

    let html = '';
    
    if (overdue.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-header"><div class="tasks-group-title overdue">🔴 EN RETARD (${overdue.length})</div></div>
            ${overdue.map(t => renderTaskItem(t)).join('')}
        </div>`;
    }
    
    if (thisWeek.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-header"><div class="tasks-group-title today">📅 CETTE SEMAINE (${thisWeek.length})</div></div>
            ${thisWeek.map(t => renderTaskItem(t)).join('')}
        </div>`;
    }
    
    if (todo.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-header"><div class="tasks-group-title">📋 À FAIRE (${todo.length})</div></div>
            ${todo.map(t => renderTaskItem(t)).join('')}
        </div>`;
    }
    
    if (doneTasks.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-header">
                <div class="tasks-group-title done">✅ TERMINÉES (${doneTasks.length})</div>
                <button class="btn-delete-all" onclick="deleteAllProjectDoneTasks()">🗑️ Tout supprimer</button>
            </div>
            ${doneTasks.map(t => renderTaskItem(t)).join('')}
        </div>`;
    }

    container.innerHTML = html;
}

function deleteAllProjectDoneTasks() {
    if (!currentTasksProject) return;
    if (!confirm('Supprimer toutes les tâches terminées de ce projet ?')) return;
    
    currentTasksProject.tasks = currentTasksProject.tasks.filter(t => t.status !== 'done');
    saveProjectsAsync();
    renderProjectTasks();
    renderHomeTasksWidget();
}

async function openNewTaskModal(category = 'Autre') {
    currentEditingTask = null;
    document.getElementById('taskModalTitle').textContent = 'Nouvelle tâche';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    const projectId = currentTasksProject?.id || '';
    document.getElementById('taskProjectId').value = projectId;
    populateTaskProjectSelect(projectId, false);
    document.getElementById('taskCategory').value = category;
    document.getElementById('taskStatus').value = 'todo';
    document.getElementById('taskPriority').value = 'medium';
    selectPriority('medium');
    const assignToMe = document.getElementById('taskAssignToMe');
    if (assignToMe) assignToMe.checked = false;
    await populateAssigneeMultiSelect([]);
    document.getElementById('taskModal').classList.add('active');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
    currentEditingTask = null;
    // Reset sous-tâches et pièces jointes
    currentSubtasks = [];
    currentAttachments = [];
    renderSubtasks();
    renderAttachments();
}

// ========== GESTION DES SOUS-TÂCHES ==========

function addSubtask() {
    const input = document.getElementById('newSubtaskInput');
    const title = input.value.trim();
    
    if (!title) return;
    
    currentSubtasks.push({
        id: 'subtask_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title: title,
        assignee: null,
        completed: false,
        order: currentSubtasks.length
    });
    
    input.value = '';
    renderSubtasks();
}

function handleSubtaskKeypress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addSubtask();
    }
}

function toggleSubtask(subtaskId) {
    const subtask = currentSubtasks.find(s => s.id === subtaskId);
    if (subtask) {
        subtask.completed = !subtask.completed;
        renderSubtasks();
    }
}

function removeSubtask(subtaskId) {
    currentSubtasks = currentSubtasks.filter(s => s.id !== subtaskId);
    renderSubtasks();
}

function assignSubtask(subtaskId, userId) {
    const subtask = currentSubtasks.find(s => s.id === subtaskId);
    if (subtask) {
        subtask.assignee = userId || null;
    }
}

function renderSubtasks() {
    const container = document.getElementById('subtasksList');
    const countEl = document.getElementById('subtasksCount');
    
    if (!container) return;
    
    if (currentSubtasks.length === 0) {
        container.innerHTML = '<div class="subtasks-empty">Aucune sous-tâche</div>';
        if (countEl) countEl.textContent = '';
        return;
    }
    
    const completed = currentSubtasks.filter(s => s.completed).length;
    if (countEl) countEl.textContent = `(${completed}/${currentSubtasks.length})`;
    
    container.innerHTML = currentSubtasks.map(subtask => {
        const user = subtask.assignee ? (allUsers || []).find(u => u.id === subtask.assignee) : null;
        return `
            <div class="subtask-item ${subtask.completed ? 'completed' : ''}" data-id="${subtask.id}">
                <input type="checkbox" 
                       ${subtask.completed ? 'checked' : ''} 
                       onchange="toggleSubtask('${subtask.id}')">
                <span class="subtask-title">${escapeHtml(subtask.title)}</span>
                <select class="subtask-assignee" onchange="assignSubtask('${subtask.id}', this.value)">
                    <option value="">👤 —</option>
                    ${(allUsers || []).map(u => `
                        <option value="${u.id}" ${subtask.assignee === u.id ? 'selected' : ''}>
                            ${escapeHtml((u.prenom || '') + ' ' + (u.nom?.charAt(0) || ''))}.
                        </option>
                    `).join('')}
                </select>
                <button type="button" class="subtask-remove" onclick="removeSubtask('${subtask.id}')">🗑</button>
            </div>
        `;
    }).join('');
}

function toggleTaskSection(header) {
    const section = header.closest('.task-form-section');
    if (section) {
        section.classList.toggle('collapsed');
    }
}

// ========== GESTION DES SOUS-TÂCHES ==========
let currentSubtasks = [];

// ========== GESTION DES PIÈCES JOINTES ==========
let currentAttachments = [];
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 Go
const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed',
    'video/mp4'
];

function handleAttachmentSelect(event) {
    const files = event.target.files;
    addAttachments(files);
}

function addAttachments(files) {
    for (const file of files) {
        // Vérifier la taille
        if (file.size > MAX_FILE_SIZE) {
            showToast(`Fichier "${file.name}" trop volumineux (max 1 Go)`, 'error');
            continue;
        }
        
        // Vérifier le type (MIME vide possible selon l'OS : accepter .mp4 par extension)
        const isMp4 = /\.mp4$/i.test(file.name) || file.type === 'video/mp4';
        if (ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type) && !isMp4) {
            showToast(`Type de fichier non autorisé: ${file.name}`, 'error');
            continue;
        }
        
        // Ajouter à la liste temporaire
        currentAttachments.push({
            id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            type: file.type,
            size: file.size,
            file: file, // Fichier brut pour upload ultérieur
            isNew: true
        });
    }
    
    renderAttachments();
}

function removeAttachment(attachmentId) {
    currentAttachments = currentAttachments.filter(a => a.id !== attachmentId);
    renderAttachments();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

function getFileIdFromAttachment(att) {
    if (!att) return null;
    if (att.file_id) return att.file_id;
    if (att.fileId) return att.fileId;
    if (att.stored_externally && att.id && typeof extractUploadFileId === 'function') {
        var fromId = extractUploadFileId(att.id);
        if (fromId) return fromId;
    }
    if (typeof extractUploadFileId === 'function') {
        return extractUploadFileId(att.url || att.downloadUrl);
    }
    const raw = att.url || att.downloadUrl || '';
    const m = String(raw).match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

function getTaskAttachmentUrl(att) {
    if (!att) return null;
    const fileId = getFileIdFromAttachment(att);
    if (fileId && typeof getDownloadFileUrl === 'function') {
        return getDownloadFileUrl(fileId);
    }
    if (typeof resolveMediaUrl === 'function') {
        const resolved = resolveMediaUrl(att.url || att.downloadUrl, fileId);
        if (resolved) return resolved;
    }
    return null;
}

async function openTaskAttachmentFromDetail(btn) {
    if (!btn || !btn.dataset) return;
    const fileId = btn.dataset.fileId || '';
    const name = btn.dataset.name || 'Fichier';
    const type = btn.dataset.type || '';
    if (!fileId) {
        alert('Fichier inaccessible');
        return;
    }
    if (typeof openUploadedFile === 'function') {
        await openUploadedFile(fileId, { name: name, type: type });
        return;
    }
    const url = typeof getDownloadFileUrl === 'function' ? getDownloadFileUrl(fileId) : null;
    if (url) window.open(url, '_blank', 'noopener');
    else alert('Fichier inaccessible');
}
window.openTaskAttachmentFromDetail = openTaskAttachmentFromDetail;

function getFileIcon(type) {
    if (!type) return '📎';
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    if (type.startsWith('video/')) return '🎬';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('excel') || type.includes('sheet') || type === 'text/csv') return '📊';
    if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
    if (type.includes('zip') || type.includes('rar')) return '📦';
    return '📎';
}

function renderAttachments() {
    const container = document.getElementById('attachmentsList');
    const countEl = document.getElementById('attachmentsCount');
    
    if (!container) return;
    
    if (currentAttachments.length === 0) {
        container.innerHTML = '';
        if (countEl) countEl.textContent = '';
        return;
    }
    
    if (countEl) countEl.textContent = `(${currentAttachments.length})`;
    
    container.innerHTML = currentAttachments.map(att => {
        // Déterminer si on peut prévisualiser
        const canPreview = att.type && (att.type.startsWith('image/') || att.type === 'application/pdf');
        const fileId = getFileIdFromAttachment(att);
        const previewBtn = canPreview ?
            `<button type="button" class="attachment-btn attachment-open" onclick="previewAttachment('${att.id}')" title="Ouvrir">👁️ Ouvrir</button>` :
            (fileId ? `<button type="button" class="attachment-btn attachment-download" data-file-id="${escapeHtml(fileId)}" data-name="${escapeHtml(att.name || 'Fichier')}" data-type="${escapeHtml(att.type || '')}" onclick="openTaskAttachmentFromDetail(this)" title="Télécharger">⬇️ Télécharger</button>` : '');
        
        return `
            <div class="attachment-item" data-id="${att.id}">
                <span class="attachment-icon">${getFileIcon(att.type)}</span>
                <span class="attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
                <span class="attachment-size">${formatFileSize(att.size)}</span>
                <div class="attachment-actions">
                    ${previewBtn}
                    <button type="button" class="attachment-btn attachment-remove" onclick="removeAttachment('${att.id}')" title="Supprimer">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// Prévisualiser une pièce jointe
function previewAttachment(attachmentId) {
    const att = currentAttachments.find(a => a.id === attachmentId);
    if (!att) return;
    
    // Si c'est un nouveau fichier (pas encore uploadé), créer une URL temporaire
    if (att.file && att.isNew) {
        const blobUrl = URL.createObjectURL(att.file);
        openAttachmentPreview(blobUrl, att.name, att.type);
    } else if (att.base64) {
        const dataUrl = `data:${att.type};base64,${att.base64}`;
        openAttachmentPreview(dataUrl, att.name, att.type);
    } else {
        const fileId = getFileIdFromAttachment(att);
        if (fileId && typeof openUploadedFile === 'function') {
            openUploadedFile(fileId, { name: att.name, type: att.type });
        } else {
            const url = getTaskAttachmentUrl(att);
            if (url) openAttachmentPreview(url, att.name, att.type);
        }
    }
}

// Ouvrir la modale de prévisualisation
function openAttachmentPreview(url, filename, mimeType) {
    // Créer la modale si elle n'existe pas
    let modal = document.getElementById('attachmentPreviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'attachmentPreviewModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content attachment-preview-modal">
                <div class="preview-header">
                    <h3 id="previewFilename"></h3>
                    <div class="preview-actions">
                        <a id="previewDownloadBtn" href="#" target="_blank" class="btn btn-secondary">⬇️ Télécharger</a>
                        <a id="previewOpenNewTab" href="#" target="_blank" class="btn btn-secondary">🔗 Nouvel onglet</a>
                        <button type="button" class="btn" onclick="closeAttachmentPreview()">✕ Fermer</button>
                    </div>
                </div>
                <div id="previewContent" class="preview-content"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const filenameEl = document.getElementById('previewFilename');
    const contentEl = document.getElementById('previewContent');
    const downloadBtn = document.getElementById('previewDownloadBtn');
    const openNewTabBtn = document.getElementById('previewOpenNewTab');
    
    filenameEl.textContent = filename;
    downloadBtn.href = url;
    downloadBtn.download = filename;
    openNewTabBtn.href = url;
    
    // Afficher le contenu selon le type
    if (mimeType && mimeType.startsWith('image/')) {
        contentEl.innerHTML = `<img src="${url}" alt="${escapeHtml(filename)}" class="preview-image">`;
    } else if (mimeType === 'application/pdf') {
        contentEl.innerHTML = `<iframe src="${url}" class="preview-pdf" title="${escapeHtml(filename)}"></iframe>`;
    } else {
        contentEl.innerHTML = `
            <div class="preview-unsupported">
                <div class="preview-unsupported-icon">${getFileIcon(mimeType)}</div>
                <p>Prévisualisation non disponible pour ce type de fichier.</p>
                <a href="${url}" target="_blank" class="btn">⬇️ Télécharger le fichier</a>
            </div>
        `;
    }
    
    modal.classList.add('active');
}

// Fermer la modale de prévisualisation
function closeAttachmentPreview() {
    const modal = document.getElementById('attachmentPreviewModal');
    if (modal) {
        modal.classList.remove('active');
        // Libérer les URLs blob si nécessaire
        const img = modal.querySelector('img');
        const iframe = modal.querySelector('iframe');
        if (img && img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }
        if (iframe && iframe.src.startsWith('blob:')) {
            URL.revokeObjectURL(iframe.src);
        }
    }
}

// Drag & Drop sur la zone
function initAttachmentDropzone() {
    const dropzone = document.getElementById('attachmentDropzone');
    if (!dropzone) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });
    
    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        addAttachments(files);
    }, false);
}



// ========== STRUCTURE DE DONNÉES CENTRALISÉE ==========
let allTasks = []; // Variable globale pour toutes les tâches

// Charger toutes les tâches depuis les projets
function loadAllTasks() {
    allTasks = [];
    
    // Parcourir tous les projets (tournées et spectacles isolés)
    projects.forEach(project => {
        if (project.tasks && Array.isArray(project.tasks)) {
            project.tasks.forEach(task => {
                // Migrer vers la nouvelle structure si nécessaire
                const migratedTask = migrateTaskToNewStructure(task, project.id, project.type || 'spectacle');
                allTasks.push(migratedTask);
            });
        }
        
        // Si c'est une tournée, parcourir aussi ses spectacles
        if (project.type === 'tournee' && project.spectacles) {
            project.spectacles.forEach(spectacle => {
                if (spectacle.tasks && Array.isArray(spectacle.tasks)) {
                    spectacle.tasks.forEach(task => {
                        const migratedTask = migrateTaskToNewStructure(task, spectacle.id, 'spectacle');
                        allTasks.push(migratedTask);
                    });
                }
            });
        }
    });
    
    // Ajouter les tâches de Mon Bureau (tâches personnelles)
    const bureauTasks = (typeof myBureau !== 'undefined' && myBureau?.tasks) ? myBureau.tasks : [];
    const userId = currentUser ? String(currentUser.id) : '';
    bureauTasks.forEach(task => {
        if (task.completed) return; // Exclure les tâches terminées
        const assignedTo = task.assignedTo ? [String(task.assignedTo)] : (userId ? [userId] : []);
        if (task.assignedTo && String(task.assignedTo) !== userId) return; // Tâche assignée à quelqu'un d'autre
        allTasks.push({
            id: task.id,
            title: task.title || 'Sans titre',
            description: task.description || '',
            projectId: 'bureau',
            projectName: 'Mon Bureau',
            projectType: 'bureau',
            category: task.category || '',
            dueDate: task.dueDate || null,
            priority: task.priority || 'medium',
            status: 'todo',
            assignedTo: assignedTo,
            assignees: assignedTo,
            subtasks: [],
            attachments: [],
            createdBy: task.createdBy || null,
            createdAt: task.createdAt || new Date().toISOString(),
            updatedAt: task.updatedAt || new Date().toISOString()
        });
    });
    
    if (typeof appendCrmDealTasksToList === 'function') {
        appendCrmDealTasksToList(allTasks);
    } else if (typeof getCrmDealTasksForAggregation === 'function') {
        getCrmDealTasksForAggregation().forEach(function(task) {
            allTasks.push(task);
        });
    }
    
    // Trier par date de création (plus récentes en premier)
    allTasks.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
    });
    
    return allTasks;
}

// Migrer une tâche vers la nouvelle structure
function migrateTaskToNewStructure(oldTask, projectId, projectType) {
    // Récupérer les assignés (supporter les deux noms) et normaliser en strings
    const assignedTo = (oldTask.assignedTo || oldTask.assignees || (oldTask.assignee ? [oldTask.assignee] : []) || []).map(String);
    
    // Si la tâche a déjà la nouvelle structure, juste normaliser les assignés
    if (oldTask.projectId && oldTask.projectType) {
        return {
            ...oldTask,
            assignedTo: assignedTo,
            assignees: assignedTo
        };
    }
    
    // Migration depuis l'ancienne structure
    const newTask = {
        id: oldTask.id || 'task_' + Date.now(),
        title: oldTask.title || oldTask.nom || 'Sans titre',
        description: oldTask.description || oldTask.notes || '',
        projectId: projectId,
        projectType: projectType,
        category: oldTask.category || oldTask.categorie || '',
        dueDate: oldTask.dueDate || oldTask.echeance || null,
        priority: oldTask.priority || (oldTask.priorite === 'high' ? 'urgent' : oldTask.priorite === 'low' ? 'low' : 'normal'),
        status: oldTask.status || (oldTask.termine ? 'done' : oldTask.enCours ? 'inprogress' : 'todo'),
        assignedTo: assignedTo, // Garder assignedTo comme nom principal
        assignees: assignedTo,  // Aussi copier dans assignees pour compatibilité
        subtasks: oldTask.subtasks || [],
        attachments: oldTask.attachments || [],
        createdBy: oldTask.createdBy || oldTask.creePar || null,
        createdAt: oldTask.createdAt || oldTask.dateCreation || new Date().toISOString(),
        updatedAt: oldTask.updatedAt || oldTask.dateModification || new Date().toISOString()
    };
    
    return newTask;
}

// Sauvegarder une tâche dans la structure centralisée et dans le projet
function saveTaskToProject(task) {
    // S'assurer que assignedTo contient des strings
    if (task.assignedTo) {
        task.assignedTo = task.assignedTo.map(String);
    }
    if (task.assignees) {
        task.assignees = task.assignees.map(String);
    }
    
    // Mettre à jour dans allTasks
    const existingIndex = allTasks.findIndex(t => t.id === task.id);
    if (existingIndex !== -1) {
        allTasks[existingIndex] = task;
    } else {
        allTasks.push(task);
    }
    
    // Sauvegarder aussi dans le projet correspondant (comparaison string)
    const project = projects.find(p => String(p.id) === String(task.projectId));
    if (project) {
        if (!project.tasks) project.tasks = [];
        const projectTaskIndex = project.tasks.findIndex(t => t.id === task.id);
        if (projectTaskIndex !== -1) {
            project.tasks[projectTaskIndex] = task;
        } else {
            project.tasks.push(task);
        }
    }
}

// Supprimer une tâche
function deleteTaskFromProject(taskId) {
    // Retirer de allTasks
    allTasks = allTasks.filter(t => t.id !== taskId);
    
    // Retirer des projets
    projects.forEach(project => {
        if (project.tasks) {
            project.tasks = project.tasks.filter(t => t.id !== taskId);
        }
        if (project.type === 'tournee' && project.spectacles) {
            project.spectacles.forEach(spectacle => {
                if (spectacle.tasks) {
                    spectacle.tasks = spectacle.tasks.filter(t => t.id !== taskId);
                }
            });
        }
    });
}

// ========== DÉTECTION DE CONTEXTE ET OUVERTURE CONTEXTUELLE ==========
let taskContext = {
    projectId: null,
    projectType: null,
    category: null
};

function detectCurrentContext() {
    const context = { projectId: null, projectType: null, category: null };
    
    // Si on est sur une page tournée
    const tourneePage = document.getElementById('tourneePage');
    if (tourneePage && tourneePage.classList.contains('active')) {
        if (typeof currentTournee !== 'undefined' && currentTournee && currentTournee.id) {
            context.projectId = currentTournee.id;
            context.projectType = 'tournee';
            return context;
        }
    }
    
    // Si on est sur une page spectacle
    const spectaclePage = document.getElementById('spectaclePage');
    if (spectaclePage && spectaclePage.classList.contains('active')) {
        if (typeof currentSpectacleDetail !== 'undefined' && currentSpectacleDetail && currentSpectacleDetail.id) {
            context.projectId = currentSpectacleDetail.id;
            context.projectType = 'spectacle';
            return context;
        }
    }
    
    // Si on est sur une page budget
    const budgetPage = document.getElementById('budgetPage');
    if (budgetPage && budgetPage.classList.contains('active')) {
        if (typeof currentBudgetSpectacle !== 'undefined' && currentBudgetSpectacle && currentBudgetSpectacle.id) {
            context.projectId = currentBudgetSpectacle.id;
            context.projectType = 'spectacle';
            context.category = 'Budget';
            return context;
        }
    }
    
    // Si on est sur une page technique
    const techPage = document.getElementById('techPage');
    if (techPage && techPage.classList.contains('active')) {
        if (typeof window.currentTechSpectacle !== 'undefined' && window.currentTechSpectacle && window.currentTechSpectacle.id) {
            context.projectId = window.currentTechSpectacle.id;
            context.projectType = 'spectacle';
            context.category = 'Logistique';
            return context;
        }
    }
    
    // Si on est sur une page billetterie
    const billetteriePage = document.getElementById('billetteriePage');
    if (billetteriePage && billetteriePage.classList.contains('active')) {
        if (typeof currentBilletterieSpectacle !== 'undefined' && currentBilletterieSpectacle && currentBilletterieSpectacle.id) {
            context.projectId = currentBilletterieSpectacle.id;
            context.projectType = 'spectacle';
            context.category = 'Billetterie';
            return context;
        }
    }
    
    // Si on est sur une page communication spectacle
    const communicationPage = document.getElementById('communicationPage');
    if (communicationPage && communicationPage.classList.contains('active')) {
        // Chercher le spectacle associé via le titre ou une variable globale
        if (typeof currentSpectacleDetail !== 'undefined' && currentSpectacleDetail && currentSpectacleDetail.id) {
            context.projectId = currentSpectacleDetail.id;
            context.projectType = 'spectacle';
        }
        context.category = 'Communication';
        return context;
    }
    
    // Si on est sur une page communication tournée
    const communicationTourneePage = document.getElementById('communicationTourneePage');
    if (communicationTourneePage && communicationTourneePage.classList.contains('active')) {
        if (typeof currentTournee !== 'undefined' && currentTournee && currentTournee.id) {
            context.projectId = currentTournee.id;
            context.projectType = 'tournee';
        }
        context.category = 'Communication';
        return context;
    }
    
    // Si on est sur une page visuels
    const visuelsPage = document.getElementById('visuelsPage');
    const tourneeVisuelsPage = document.getElementById('tourneeVisuelsPage');
    if ((visuelsPage && visuelsPage.classList.contains('active')) ||
        (tourneeVisuelsPage && tourneeVisuelsPage.classList.contains('active'))) {
        if (typeof currentTournee !== 'undefined' && currentTournee && currentTournee.id) {
            context.projectId = currentTournee.id;
            context.projectType = 'tournee';
        } else if (typeof currentSpectacleDetail !== 'undefined' && currentSpectacleDetail && currentSpectacleDetail.id) {
            context.projectId = currentSpectacleDetail.id;
            context.projectType = 'spectacle';
        }
        context.category = 'Communication';
        return context;
    }
    
    // Si on est sur une page documents
    const documentsPage = document.getElementById('documentsPage');
    const tourneeDocumentsPage = document.getElementById('tourneeDocumentsPage');
    if ((documentsPage && documentsPage.classList.contains('active')) ||
        (tourneeDocumentsPage && tourneeDocumentsPage.classList.contains('active'))) {
        if (typeof currentTournee !== 'undefined' && currentTournee && currentTournee.id) {
            context.projectId = currentTournee.id;
            context.projectType = 'tournee';
        } else if (typeof currentSpectacleDetail !== 'undefined' && currentSpectacleDetail && currentSpectacleDetail.id) {
            context.projectId = currentSpectacleDetail.id;
            context.projectType = 'spectacle';
        }
        context.category = 'Administratif';
        return context;
    }
    
    return context;
}

function populateProjectSelect() {
    populateTaskProjectSelect('', false);
}

function populateAssigneesSelector(selectedIds = []) {
    const container = document.getElementById('taskAssigneesSelector');
    const badgesContainer = document.getElementById('taskAssigneesBadges');
    if (!container) return;
    
    container.innerHTML = '';
    if (badgesContainer) badgesContainer.innerHTML = '';
    
    if (!allUsers || allUsers.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; text-align: center; color: #636e72;">Aucun utilisateur disponible</div>';
        return;
    }
    const userMap = new Map();
    const nameSeen = new Set();
    for (const u of deduplicateUsersById(allUsers)) {
        const idStr = String(u?.id ?? '');
        if (!idStr || userMap.has(idStr)) continue;
        const nameKey = `${(u?.prenom||'').trim()} ${(u?.nom||u?.username||'').trim()}`.trim().toLowerCase();
        if (nameKey && nameSeen.has(nameKey)) continue;
        nameSeen.add(nameKey);
        userMap.set(idStr, u);
    }
    const uniqueUsers = Array.from(userMap.values());
    uniqueUsers.forEach(user => {
        const idStr = String(user.id);
        const isSelected = selectedIds.includes(idStr);
        const option = document.createElement('div');
        option.className = 'assignee-option';
        option.innerHTML = `
            <input type="checkbox" id="assignee_${user.id}" value="${user.id}" ${isSelected ? 'checked' : ''} onchange="updateAssigneesBadges()">
            <label for="assignee_${user.id}" style="cursor: pointer; flex: 1;">
                ${escapeHtml((user.prenom || '') + ' ' + (user.nom || ''))}
            </label>
        `;
        container.appendChild(option);
    });
    updateAssigneesBadges();
}

function getSelectedAssignees() {
    const checkboxes = document.querySelectorAll('#taskAssigneesSelector input[type="checkbox"]:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);
    return [...new Set(ids.map(String))];
}

function updateAssigneesBadges() {
    const badgesContainer = document.getElementById('taskAssigneesBadges');
    if (!badgesContainer) return;
    
    const selectedIds = getSelectedAssignees();
    badgesContainer.innerHTML = '';
    
    selectedIds.forEach(userId => {
        const user = (allUsers || []).find(u => String(u.id) === String(userId));
        if (user) {
            const badge = document.createElement('span');
            badge.className = 'assignee-badge';
            badge.textContent = (user.prenom || '') + ' ' + (user.nom || '');
            badgesContainer.appendChild(badge);
        }
    });
}

async function openTaskModal(options = {}) {
    console.log('openTaskModal appelé avec options:', options);
    
    // Reset du formulaire
    const form = document.getElementById('taskForm');
    if (form) form.reset();
    
    const taskIdEl = document.getElementById('taskId');
    if (taskIdEl) taskIdEl.value = '';
    
    const statusGroup = document.getElementById('taskStatusGroup');
    if (statusGroup) statusGroup.style.display = 'none';
    
    const modalTitle = document.getElementById('taskModalTitle');
    if (modalTitle) modalTitle.textContent = 'Nouvelle tâche';
    
    // Reset sous-tâches et pièces jointes
    currentSubtasks = [];
    currentAttachments = [];
    renderSubtasks();
    renderAttachments();
    
    // Charger la liste des projets
    populateProjectSelect();

    // Ouvrir la modale tout de suite (avant le chargement async des assignés)
    const modal = document.getElementById('taskModal');
    if (modal) modal.classList.add('active');

    // Charger la liste des utilisateurs (une seule source pour éviter les doublons)
    try {
        await populateAssigneeMultiSelect([]);
    } catch (e) {
        console.error('populateAssigneeMultiSelect:', e);
    }
    
    // Pré-remplissage contextuel (après un petit délai pour s'assurer que le select est rempli)
    setTimeout(() => {
        if (options.projectId) {
            const projectSelect = document.getElementById('taskProjectSelect');
            if (projectSelect) {
                projectSelect.value = options.projectId;
                console.log('Projet pré-rempli:', options.projectId, '- Valeur actuelle:', projectSelect.value);
            }
        }
        if (options.category) {
            const categorySelect = document.getElementById('taskCategory');
            if (categorySelect) {
                categorySelect.value = options.category;
                console.log('Catégorie pré-remplie:', options.category, '- Valeur actuelle:', categorySelect.value);
            }
        }
        if (modal) setTimeout(() => initAttachmentDropzone(), 50);
    }, 50);
}

function openTaskModalFromContext() {
    // Ouvrir la modale de choix du type de tâche
    openTaskTypeSelectionModal();
}

function openTaskTypeSelectionModal() {
    const modalHtml = `
        <div class="modal" id="taskTypeModal" style="display: flex;">
            <div class="modal-content" style="max-width: 450px;">
                <h2>✅ Nouvelle tâche</h2>
                <p style="color: #636e72; margin-bottom: 1.5rem;">Quel type de tâche voulez-vous créer ?</p>
                
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div onclick="selectTaskType('personal')" style="display: flex; align-items: center; gap: 1rem; padding: 1rem 1.2rem; background: #f8f9fa; border-radius: 12px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;" onmouseover="this.style.borderColor='#667eea'; this.style.background='#f0f0ff';" onmouseout="this.style.borderColor='transparent'; this.style.background='#f8f9fa';">
                        <span style="font-size: 2rem;">📋</span>
                        <div>
                            <div style="font-weight: 600; color: #2d3748; font-size: 1rem;">Tâche personnelle</div>
                            <div style="font-size: 0.85rem; color: #718096;">Dans Mon Bureau (hors projet)</div>
                        </div>
                    </div>
                    
                    <div onclick="selectTaskType('project')" style="display: flex; align-items: center; gap: 1rem; padding: 1rem 1.2rem; background: #f8f9fa; border-radius: 12px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;" onmouseover="this.style.borderColor='#667eea'; this.style.background='#f0f0ff';" onmouseout="this.style.borderColor='transparent'; this.style.background='#f8f9fa';">
                        <span style="font-size: 2rem;">🎭</span>
                        <div>
                            <div style="font-weight: 600; color: #2d3748; font-size: 1rem;">Tâche de projet</div>
                            <div style="font-size: 0.85rem; color: #718096;">Liée à un projet ou une tournée</div>
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeTaskTypeModal()">Annuler</button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('taskTypeModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeTaskTypeModal() {
    const modal = document.getElementById('taskTypeModal');
    if (modal) modal.remove();
}

async function selectTaskType(type) {
    closeTaskTypeModal();
    
    if (type === 'personal') {
        openBureauTaskModal('personal');
    } else if (type === 'project') {
        const context = detectCurrentContext();
        console.log('openTaskModalFromContext - Contexte détecté:', context);
        await openTaskModal(context);
    }
}

async function openTaskForEdit(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) {
        showToast('Tâche introuvable', 'error');
        return;
    }
    
    // Ouvrir la modale en mode édition
    await openTaskModal({ projectId: task.projectId, category: task.category });
    
    // Remplir le formulaire
    const taskIdEl = document.getElementById('taskId');
    if (taskIdEl) taskIdEl.value = task.id;
    
    const titleEl = document.getElementById('taskTitle');
    if (titleEl) titleEl.value = task.title;
    
    const descriptionEl = document.getElementById('taskDescription');
    if (descriptionEl) descriptionEl.value = task.description || '';
    
    const projectSelect = document.getElementById('taskProjectSelect');
    if (projectSelect) projectSelect.value = task.projectId;
    
    const categorySelect = document.getElementById('taskCategory');
    if (categorySelect) categorySelect.value = task.category || '';
    
    const dueDateEl = document.getElementById('taskDueDate');
    if (dueDateEl) dueDateEl.value = task.dueDate || '';
    
    const priorityRadios = document.querySelectorAll('input[name="taskPriority"]');
    priorityRadios.forEach(radio => {
        if (radio.value === task.priority) {
            radio.checked = true;
        }
    });
    
    const statusEl = document.getElementById('taskStatus');
    if (statusEl) {
        statusEl.value = task.status || 'todo';
        const statusGroup = document.getElementById('taskStatusGroup');
        if (statusGroup) statusGroup.style.display = 'block';
    }
    
    // Charger les assignés (pré-cocher ceux déjà assignés) - remplace le contenu de openTaskModal
    const assignedIds = getAssignedUserIds(task);
    await populateAssigneeMultiSelect(assignedIds);
    
    // Charger les sous-tâches
    currentSubtasks = task.subtasks || [];
    renderSubtasks();
    
    // Charger les pièces jointes
    currentAttachments = task.attachments || [];
    renderAttachments();
    
    const modalTitle = document.getElementById('taskModalTitle');
    if (modalTitle) modalTitle.textContent = 'Modifier la tâche';
    
    // Initialiser le dropzone
    setTimeout(() => initAttachmentDropzone(), 100);
}

// ========== WIDGET ACCUEIL ==========
if (typeof homeTasksFilter === 'undefined') {
    homeTasksFilter = 'mine';
}

function filterHomeTasks(filter) {
    homeTasksFilter = filter;
    document.querySelectorAll('.home-tasks-widget .task-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderHomeTasks();
}

function isHomeTaskOpen(task) {
    if (!task) return false;
    if (task.completed) return false;
    if (task.status === 'done') return false;
    return true;
}

function isBureauOrCrmHomeTask(task) {
    if (!task) return false;
    if (task.projectId === 'bureau' || task.projectType === 'bureau' || task.projectType === 'personal') return true;
    return task.projectType === 'crm_deal' || (task.projectId && String(task.projectId).startsWith('crm_'));
}

function bureauUnifiedToHomeTask(u) {
    return {
        id: u.id,
        title: u.title || 'Sans titre',
        dueDate: u.dueDate || null,
        projectId: u.source === 'personal' ? 'bureau' : (u.projectId || ('crm_' + u.dossierId)),
        projectName: u.dossierName || (u.source === 'personal' ? 'Personnel' : 'Dossier'),
        projectType: u.source === 'crm_deal' ? 'crm_deal' : 'bureau',
        category: u.source === 'personal' ? '' : 'CRM',
        status: u.status || 'todo',
        completed: !!u.completed,
        priority: 'medium',
        assignedTo: [],
        assignees: [],
        subtasks: [],
        attachments: []
    };
}

function groupHomeTasksByDueDate(tasks) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups = {
        overdue: { label: '🔴 En retard', tasks: [], class: 'overdue' },
        today: { label: '🟠 Aujourd\'hui', tasks: [], class: 'today' },
        week: { label: '🟡 Cette semaine', tasks: [], class: 'week' },
        later: { label: '⚪ Plus tard', tasks: [], class: 'later' },
        nodate: { label: '📭 Sans échéance', tasks: [], class: 'nodate' }
    };
    tasks.forEach(task => {
        if (!task.dueDate) {
            groups.nodate.tasks.push(task);
        } else {
            const due = new Date(task.dueDate);
            due.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) groups.overdue.tasks.push(task);
            else if (diffDays === 0) groups.today.tasks.push(task);
            else if (diffDays <= 7) groups.week.tasks.push(task);
            else groups.later.tasks.push(task);
        }
    });
    const priorityOrder = { urgent: 0, high: 0, normal: 1, medium: 1, low: 2 };
    Object.values(groups).forEach(group => {
        group.tasks.sort((a, b) => {
            if (a.dueDate && b.dueDate) {
                const dateDiff = new Date(a.dueDate) - new Date(b.dueDate);
                if (dateDiff !== 0) return dateDiff;
            }
            return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        });
    });
    return groups;
}

function renderHomeTasksGroupsHtml(groups) {
    let html = '';
    for (const group of Object.values(groups)) {
        if (!group.tasks.length) continue;
        html += `
            <div class="tasks-group ${group.class}">
                <div class="tasks-group-header">
                    <span class="tasks-group-title">${group.label}</span>
                    <span class="tasks-group-count">${group.tasks.length}</span>
                </div>
                <div class="tasks-group-items">
                    ${group.tasks.slice(0, 5).map(task => renderTaskItemCompact(task)).join('')}
                    ${group.tasks.length > 5 ? `<div class="tasks-more">+ ${group.tasks.length - 5} autres</div>` : ''}
                </div>
            </div>
        `;
    }
    if (!html) {
        html = `
            <div class="tasks-empty tasks-up-to-date">
                <span class="tasks-empty-icon">🎉</span>
                <div>Vous êtes à jour !</div>
            </div>
        `;
    }
    return html;
}

async function renderHomeTasks() {
    const container = document.getElementById('homeTasksList');
    if (!container) return;

    try {
        if (typeof loadMyBureauData === 'function') await loadMyBureauData();
        if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();

        let html = '';

        if (typeof collectBureauUnifiedTasks === 'function' && typeof renderBureauUnifiedTasksListHtml === 'function') {
            const unified = collectBureauUnifiedTasks('for_me').filter(function(t) { return !t.completed; });
            if (unified.length) {
                const limit = 12;
                const slice = unified.slice(0, limit);
                html += '<div class="home-bureau-unified-tasks">' +
                    renderBureauUnifiedTasksListHtml(slice, { hideDelete: true, compact: true }) +
                    (unified.length > limit ? '<div class="tasks-more">+ ' + (unified.length - limit) + ' autres dans Mon Bureau</div>' : '') +
                    '</div>';
            }
        }

        const userId = currentUser ? currentUser.id : (typeof getCurrentUserId === 'function' ? getCurrentUserId() : null);
        loadAllTasks();
        let otherTasks = allTasks.filter(function(t) {
            const done = typeof isTaskDone === 'function' ? isTaskDone(t) : (t.status === 'done' || t.completed);
            if (done) return false;
            return !isBureauOrCrmHomeTask(t);
        });

        if (homeTasksFilter === 'mine') {
            otherTasks = otherTasks.filter(function(t) {
                const assignees = t.assignedTo || t.assignees || [];
                if (typeof isAssignedToUser === 'function' && isAssignedToUser(assignees, userId)) return true;
                return typeof isCrmDealTaskVisibleToUser === 'function' && isCrmDealTaskVisibleToUser(t, userId);
            });
        } else if (homeTasksFilter === 'unassigned') {
            otherTasks = otherTasks.filter(function(t) {
                const assignees = t.assignedTo || t.assignees || [];
                return !assignees || assignees.length === 0;
            });
        }

        if (otherTasks.length) {
            html += renderHomeTasksGroupsHtml(groupHomeTasksByDueDate(otherTasks));
        }

        if (!html) {
            html = renderHomeTasksGroupsHtml(groupHomeTasksByDueDate([]));
        }

        container.innerHTML = html;
    } catch (err) {
        console.error('renderHomeTasks:', err);
        container.innerHTML = '<div class="tasks-empty"><div>Impossible de charger les tâches</div></div>';
    }
}

function renderTaskItemCompact(task) {
    const project = getProjectById(task.projectId);
    const projectName = task.projectName || (project ? (project.name || project.nom || 'Projet') : (task.projectId && String(task.projectId).startsWith('crm_') ? 'Dossier CRM' : 'Projet inconnu'));
    const categoryIcon = getCategoryIcon(task.category);
    const priorityClass = `priority-${task.priority || 'medium'}`;
    const completedClass = task.status === 'done' ? 'completed' : '';
    
    // Assignés - supporter les deux noms de propriétés
    const assigneeIds = task.assignedTo || task.assignees || [];
    const assigneesHtml = renderAssigneesBadges(assigneeIds, 3);
    
    // Date d'échéance avec style selon urgence
    let dueDateHtml = '';
    let dueDateClass = '';
    if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (dueDate < today) {
            dueDateClass = 'overdue';
        } else if (dueDate.toDateString() === today.toDateString()) {
            dueDateClass = 'today';
        }
        dueDateHtml = `<span class="task-tag task-due-tag ${dueDateClass}">📅 ${formatTaskDate(task.dueDate)}</span>`;
    }
    
    // Sous-tâches progress
    let subtasksHtml = '';
    if (task.subtasks && task.subtasks.length > 0) {
        const completed = task.subtasks.filter(s => s.completed).length;
        subtasksHtml = `<span class="task-tag task-subtasks-tag">☑️ ${completed}/${task.subtasks.length}</span>`;
    }
    
    // Pièces jointes
    let attachmentsHtml = '';
    if (task.attachments && task.attachments.length > 0) {
        attachmentsHtml = `<span class="task-tag task-attachments-tag">📎 ${task.attachments.length}</span>`;
    }
    
    // Priorité badge
    const priorityBadge = task.priority === 'high' ? '🔴' : task.priority === 'low' ? '🟢' : '🟠';
    
    const esc = (s) => (s == null ? '' : String(s)).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `
        <div class="task-item-compact ${priorityClass} ${completedClass}" data-task-id="${esc(task.id)}" data-project-id="${esc(task.projectId)}" onclick="if(!event.target.closest('.task-checkbox-wrapper'))openTaskDetailModal('${esc(task.projectId)}','${esc(task.id)}')">
            <div class="task-checkbox-wrapper" onclick="event.stopPropagation();">
                <div class="task-checkbox ${task.status === 'done' ? 'checked' : ''}" 
                     onclick="event.stopPropagation();toggleTaskStatusGlobal('${esc(task.projectId)}', '${esc(task.id)}')">
                    ${task.status === 'done' ? '✓' : ''}
                </div>
            </div>
            <div class="task-content">
                <div class="task-title ${task.status === 'done' ? 'completed' : ''}">${escapeHtml(task.title)}</div>
                <div class="task-tags">
                    <span class="task-tag task-project-tag">${categoryIcon} ${escapeHtml(projectName)}</span>
                    ${dueDateHtml}
                    ${assigneeIds.length > 0 ? `<span class="task-tag task-assignees-tag">👤 ${assigneesHtml}</span>` : '<span class="task-tag task-assignees-tag task-unassigned">👤 Non assigné</span>'}
                    <span class="task-tag task-priority-tag">${priorityBadge}</span>
                    ${subtasksHtml}
                    ${attachmentsHtml}
                </div>
            </div>
        </div>
    `;
}

// Toggle status depuis la page globale
function toggleTaskStatusGlobal(projectId, taskId) {
    if (projectId && String(projectId).startsWith('crm_')) {
        if (typeof toggleCrmDealTaskStatusByProject === 'function' && toggleCrmDealTaskStatusByProject(projectId, taskId)) {
            if (typeof refreshCrmDealTasksInTaskViews === 'function') refreshCrmDealTasksInTaskViews();
            else {
                if (typeof loadAllTasks === 'function') loadAllTasks();
                renderGlobalTasks();
                renderHomeTasksWidget();
            }
        }
        return;
    }
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Cycle: todo -> inprogress -> done -> todo
    if (task.status === 'todo') {
        task.status = 'inprogress';
    } else if (task.status === 'inprogress') {
        task.status = 'done';
    } else {
        task.status = 'todo';
    }
    
    task.updatedAt = new Date().toISOString();
    saveProjectsAsync();
    renderGlobalTasks();
    renderHomeTasksWidget();
}

function getCategoryIcon(category) {
    const icons = {
        'CRM': '📂',
        'Production': '🎭',
        'Logistique': '📦',
        'Technique': '🔧',
        'Communication': '📣',
        'Billetterie': '🎟️',
        'Administratif': '📋',
        'Budget': '💰'
    };
    return icons[category] || '📌';
}

function renderAssigneesBadges(assigneeIds, maxShow = 3) {
    if (!assigneeIds || assigneeIds.length === 0) return '';
    
    const badges = assigneeIds.slice(0, maxShow).map(id => {
        const user = allUsers.find(u => String(u.id) === String(id));
        if (!user) return '';
        // Format: Prénom + initiale du nom (ex: "Loic I.")
        const prenom = user.prenom || '';
        const nomInitial = user.nom ? user.nom.charAt(0).toUpperCase() + '.' : '';
        const displayName = prenom + (nomInitial ? ' ' + nomInitial : '');
        const fullName = (user.prenom || '') + ' ' + (user.nom || '');
        return `<span class="task-assignee-badge" title="${escapeHtml(fullName.trim())}">${escapeHtml(displayName.trim())}</span>`;
    }).join('');
    
    const extra = assigneeIds.length > maxShow ? `<span class="task-assignee-badge more">+${assigneeIds.length - maxShow}</span>` : '';
    
    return badges + extra;
}

function formatTaskDate(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);
    
    if (taskDate.getTime() === today.getTime()) {
        return "Aujourd'hui";
    } else if (taskDate.getTime() === tomorrow.getTime()) {
        return 'Demain';
    } else {
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
}

function toggleTaskStatus(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.status = task.status === 'done' ? 'todo' : 'done';
    task.updatedAt = new Date().toISOString();
    
    // Sauvegarder dans le projet aussi
    saveTaskToProject(task);
    
    // Sauvegarder via l'API
    saveProjectsAsync().then(() => {
        renderHomeTasks();
        updateTasksBadge();
    });
}


// ========== PAGE GLOBALE DES TÂCHES ==========
// Redirige vers Mon Bureau > onglet Tâches
function openGlobalTasksPage() {
    openMyBureauTasks();
}

// Ouvrir Mon Bureau directement sur l'onglet Tâches (liste unifiée)
async function openMyBureauTasks() {
    await openMyBureauPage();
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const tachesItem = document.getElementById('navTasksItem');
    if (tachesItem) tachesItem.classList.add('active');
    if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
}

let globalTasksFilter = {
    project: 'all',
    category: 'all',
    assignee: 'me',
    priority: 'all',
    status: 'active',
    search: ''
};

function populateTaskFilters() {
    // Projets
    const projectSelect = document.getElementById('filterProject');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="all">Tous les projets</option>';
        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.nom || 'Projet sans nom';
            projectSelect.appendChild(option);
        });
        if (typeof getActiveWorkProjects === 'function') {
            const wpGroup = document.createElement('optgroup');
            wpGroup.label = 'Espaces de travail';
            getActiveWorkProjects().forEach(wp => {
                const option = document.createElement('option');
                option.value = wp.id;
                option.textContent = '📁 ' + (wp.title || 'Projet');
                wpGroup.appendChild(option);
            });
            if (wpGroup.children.length) projectSelect.appendChild(wpGroup);
        }
        if (typeof getCrmAccessibleDeals === 'function') {
            const crmGroup = document.createElement('optgroup');
            crmGroup.label = 'Dossiers CRM';
            getCrmAccessibleDeals().forEach(deal => {
                const option = document.createElement('option');
                option.value = 'crm_' + deal.id;
                option.textContent = '📂 ' + (deal.title || 'Dossier');
                crmGroup.appendChild(option);
            });
            if (crmGroup.children.length) projectSelect.appendChild(crmGroup);
        }
    }
    
    // Assignés
    const assigneeSelect = document.getElementById('filterAssignee');
    if (assigneeSelect) {
        const isAdmin = currentUser && currentUser.role === 'admin';
        assigneeSelect.innerHTML = (isAdmin ? '<option value="all">Tous les assignés</option>' : '') +
            '<option value="me">Mes tâches</option><option value="unassigned">Non assignées</option>';
        if (allUsers) {
            allUsers.forEach(u => {
                const option = document.createElement('option');
                option.value = u.id;
                option.textContent = (u.prenom || '') + ' ' + (u.nom || '');
                assigneeSelect.appendChild(option);
            });
        }
        assigneeSelect.value = globalTasksFilter.assignee || 'me';
    }
}

function searchTasks() {
    const searchInput = document.getElementById('tasksSearchInput');
    if (searchInput) {
        globalTasksFilter.search = searchInput.value.toLowerCase();
        renderGlobalTasks();
    }
}

function applyTaskFilters() {
    const projectSelect = document.getElementById('filterProject');
    const categorySelect = document.getElementById('filterCategory');
    const assigneeSelect = document.getElementById('filterAssignee');
    const prioritySelect = document.getElementById('filterPriority');
    const statusSelect = document.getElementById('filterStatus');
    
    globalTasksFilter.project = projectSelect ? projectSelect.value : 'all';
    globalTasksFilter.category = categorySelect ? categorySelect.value : 'all';
    globalTasksFilter.assignee = assigneeSelect ? assigneeSelect.value : 'all';
    globalTasksFilter.priority = prioritySelect ? prioritySelect.value : 'all';
    globalTasksFilter.status = statusSelect ? statusSelect.value : 'active';
    
    renderGlobalTasks();
}

function renderGlobalTasks() {
    loadAllTasks();
    let tasks = [...allTasks];
    
    // Filtre recherche
    if (globalTasksFilter.search) {
        tasks = tasks.filter(t => 
            t.title.toLowerCase().includes(globalTasksFilter.search) ||
            (t.description && t.description.toLowerCase().includes(globalTasksFilter.search))
        );
    }
    
    // Filtre projet
    if (globalTasksFilter.project !== 'all') {
        tasks = tasks.filter(t => t.projectId === globalTasksFilter.project);
    }
    
    // Filtre catégorie
    if (globalTasksFilter.category !== 'all') {
        tasks = tasks.filter(t => t.category === globalTasksFilter.category);
    }
    
    // Filtre assigné — par défaut « mes tâches » ; les non-admins ne voient jamais celles des autres
    const currentUserId = getCurrentUserId();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const assigneeFilter = (!isAdmin && globalTasksFilter.assignee === 'all')
        ? 'me'
        : globalTasksFilter.assignee;
    if (assigneeFilter === 'me') {
        tasks = tasks.filter(t => {
            if (typeof isTaskForCurrentUser === 'function') return isTaskForCurrentUser(t);
            if (isAssignedToUser(t.assignees || t.assignedTo || [], currentUserId)) return true;
            return typeof isCrmDealTaskVisibleToUser === 'function' && isCrmDealTaskVisibleToUser(t, currentUserId);
        });
    } else if (assigneeFilter === 'unassigned') {
        tasks = tasks.filter(t => !t.assignees || t.assignees.length === 0);
    } else if (assigneeFilter !== 'all') {
        tasks = tasks.filter(t => isAssignedToUser(t.assignees || t.assignedTo || [], assigneeFilter));
    }
    
    // Filtre priorité
    if (globalTasksFilter.priority !== 'all') {
        tasks = tasks.filter(t => t.priority === globalTasksFilter.priority);
    }
    
    // Filtre statut
    if (globalTasksFilter.status === 'active') {
        tasks = tasks.filter(t => normalizeAggregatedTaskStatus(t) !== 'done');
    } else if (globalTasksFilter.status === 'in_progress') {
        tasks = tasks.filter(t => isTaskStatusInProgress(t.status));
    } else if (globalTasksFilter.status !== 'all') {
        tasks = tasks.filter(t => normalizeAggregatedTaskStatus(t) === globalTasksFilter.status);
    }
    
    // Rendre selon la vue active
    const listView = document.getElementById('tasksListView');
    const kanbanView = document.getElementById('tasksKanbanView');
    
    // Vérifier quelle vue est active (le kanban a la classe 'active' quand visible)
    const isKanbanActive = kanbanView && kanbanView.classList.contains('active');
    
    if (isKanbanActive) {
        renderGlobalTasksKanban(tasks);
    } else {
        // Par défaut, rendre la liste
        renderGlobalTasksList(tasks);
    }
}

function switchTasksView(view) {
    const listView = document.getElementById('tasksListView');
    const kanbanView = document.getElementById('tasksKanbanView');
    const listBtn = document.querySelector('.tasks-view-btn[data-view="list"]');
    const kanbanBtn = document.querySelector('.tasks-view-btn[data-view="kanban"]');
    
    if (view === 'list') {
        if (listView) {
            listView.classList.add('active');
            listView.classList.remove('hidden');
        }
        if (kanbanView) kanbanView.classList.remove('active');
        renderGlobalTasks();
    } else {
        if (listView) {
            listView.classList.remove('active');
            listView.classList.add('hidden');
        }
        if (kanbanView) kanbanView.classList.add('active');
        if (listBtn) listBtn.classList.remove('active');
        if (kanbanBtn) kanbanBtn.classList.add('active');
        renderGlobalTasks();
    }
}

function renderGlobalTasksList(tasks) {
    const container = document.getElementById('tasksListView');
    if (!container) return;
    
    if (tasks.length === 0) {
        container.innerHTML = '<div class="tasks-empty"><div class="tasks-empty-icon">📭</div><div>Aucune tâche trouvée</div></div>';
        return;
    }
    
    container.innerHTML = tasks.map(task => renderTaskItemCompact(task)).join('');
}

function renderGlobalTasksKanban(tasks) {
    const todoContainer = document.getElementById('kanbanTodo');
    const inprogressContainer = document.getElementById('kanbanInprogress');
    const doneContainer = document.getElementById('kanbanDone');
    const todoCount = document.getElementById('kanbanCountTodo');
    const inprogressCount = document.getElementById('kanbanCountInprogress');
    const doneCount = document.getElementById('kanbanCountDone');
    
    const todo = tasks.filter(t => normalizeAggregatedTaskStatus(t) === 'todo');
    const inprogress = tasks.filter(t => isTaskStatusInProgress(t.status));
    const done = tasks.filter(t => normalizeAggregatedTaskStatus(t) === 'done');
    
    if (todoContainer) todoContainer.innerHTML = todo.map(t => renderKanbanCardGlobal(t)).join('');
    if (inprogressContainer) inprogressContainer.innerHTML = inprogress.map(t => renderKanbanCardGlobal(t)).join('');
    if (doneContainer) doneContainer.innerHTML = done.map(t => renderKanbanCardGlobal(t)).join('');
    
    if (todoCount) todoCount.textContent = todo.length;
    if (inprogressCount) inprogressCount.textContent = inprogress.length;
    if (doneCount) doneCount.textContent = done.length;
}

function renderKanbanCardGlobal(task) {
    const project = getProjectById(task.projectId);
    const projectName = task.projectName || (project ? project.nom : (String(task.projectId || '').startsWith('crm_') ? 'Dossier CRM' : 'Projet inconnu'));
    const categoryIcon = getCategoryIcon(task.category);
    const priorityClass = `priority-${task.priority}`;
    
    // Sous-tâches progress
    let progressHtml = '';
    if (task.subtasks && task.subtasks.length > 0) {
        const completed = task.subtasks.filter(s => s.completed).length;
        const percent = Math.round((completed / task.subtasks.length) * 100);
        progressHtml = `
            <div class="kanban-card-progress">
                <div class="kanban-card-progress-fill" style="width: ${percent}%"></div>
            </div>
        `;
    }
    
    return `
        <div class="kanban-card ${priorityClass}" draggable="true" 
             ondragstart="handleKanbanDragStartGlobal(event, '${task.id}')"
             ondragend="handleKanbanDragEndGlobal(event)"
             onclick="openTaskForEdit('${task.id}')"
             data-task-id="${task.id}">
            <div class="kanban-card-title">${escapeHtml(task.title)}</div>
            <div class="kanban-card-meta">
                <span>${categoryIcon} ${escapeHtml(projectName)}</span>
                ${task.dueDate ? `<span>📅 ${formatTaskDate(task.dueDate)}</span>` : ''}
            </div>
            ${progressHtml}
        </div>
    `;
}

function handleKanbanDragStartGlobal(e, taskId) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    e.currentTarget.classList.add('dragging');
}

function handleKanbanDragEndGlobal(e) {
    e.currentTarget.classList.remove('dragging');
}

// ========== BADGE DE NOTIFICATION ==========
function updateTasksBadge() {
    const currentUserId = getCurrentUserId();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    loadAllTasks();
    
    // Compter les tâches en retard assignées à l'utilisateur
    const overdueTasks = allTasks.filter(t => {
        if (t.status === 'done') return false;
        if (!t.assignees || !t.assignees.includes(currentUserId)) return false;
        if (!t.dueDate) return false;
        
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        return due < today;
    });
    
    const badge = document.getElementById('tasksBadge');
    if (badge) {
        if (overdueTasks.length > 0) {
            badge.textContent = overdueTasks.length;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ========== RACCOURCI CLAVIER ==========
document.addEventListener('keydown', function(e) {
    // Touche "T" pour ouvrir rapidement la modale tâche (sauf si on tape dans un input)
    if (e.key === 't' || e.key === 'T') {
        const activeElement = document.activeElement;
        const isTyping = activeElement.tagName === 'INPUT' || 
                         activeElement.tagName === 'TEXTAREA' || 
                         activeElement.isContentEditable;
        
        if (!isTyping && !document.querySelector('.modal.active')) {
            e.preventDefault();
            openTaskModalFromContext();
        }
    }
    
    // Échap pour fermer la modale
    if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal && activeModal.id === 'taskModal') {
            closeTaskModal();
        }
    }
});

// Initialiser le système de tâches au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            initAttachmentDropzone();
            loadAllTasks();
            renderHomeTasks();
            updateTasksBadge();
            initFabWatcher();
        }, 500);
    });
} else {
    // DOM déjà chargé
    setTimeout(() => {
        initAttachmentDropzone();
        loadAllTasks();
        renderHomeTasks();
        updateTasksBadge();
        initFabWatcher();
    }, 500);
}

// ========== FAB INTELLIGENT ==========
let fabMode = 'menu'; // 'menu' ou 'task'
let fabContext = null;

/**
 * Détecte le contexte actuel et détermine le mode du FAB
 */
function detectFabContext() {
    const context = {
        mode: 'menu',
        projectId: null,
        projectType: null,
        projectName: null,
        category: null,
        tooltip: '+ Nouveau'
    };
    
    // Vérifier quelle page est active
    
    // Page Tournée
    const tourneePage = document.getElementById('tourneePage');
    if (tourneePage && tourneePage.classList.contains('active')) {
        if (typeof currentTourneeId !== 'undefined' && currentTourneeId) {
            const tournee = projects.find(t => t.id === currentTourneeId);
            context.mode = 'task';
            context.projectId = currentTourneeId;
            context.projectType = 'tournee';
            context.projectName = tournee?.nom || 'Tournée';
            context.tooltip = `+ Tâche pour ${context.projectName}`;
        }
    }
    // Page Spectacle
    else {
        const spectaclePage = document.getElementById('spectaclePage');
        if (spectaclePage && spectaclePage.classList.contains('active')) {
            if (typeof currentSpectacleId !== 'undefined' && currentSpectacleId) {
                const spectacle = projects.find(s => s.id === currentSpectacleId) || 
                                projects.flatMap(t => t.spectacles || []).find(s => s.id === currentSpectacleId);
                context.mode = 'task';
                context.projectId = currentSpectacleId;
                context.projectType = 'spectacle';
                context.projectName = spectacle?.nom || spectacle?.ville || 'Spectacle';
                context.tooltip = `+ Tâche pour ${context.projectName}`;
            }
        }
        // Page Budget
        else {
            const budgetPage = document.getElementById('budgetPage');
            if (budgetPage && budgetPage.classList.contains('active')) {
                if (typeof currentBudgetSpectacleId !== 'undefined' && currentBudgetSpectacleId) {
                    context.mode = 'task';
                    context.projectId = currentBudgetSpectacleId;
                    context.projectType = 'spectacle';
                    context.category = 'Budget';
                    context.tooltip = '+ Tâche Budget';
                }
            }
            // Page Technique
            else {
                const techPage = document.getElementById('techPage');
                if (techPage && techPage.classList.contains('active')) {
                    if (typeof window.currentTechSpectacle !== 'undefined' && window.currentTechSpectacle && window.currentTechSpectacle.id) {
                        context.mode = 'task';
                        context.projectId = window.currentTechSpectacle.id;
                        context.projectType = 'spectacle';
                        context.category = 'Technique';
                        context.tooltip = '+ Tâche Technique';
                    }
                }
                // Page Billetterie
                else {
                    const billetteriePage = document.getElementById('billetteriePage');
                    if (billetteriePage && billetteriePage.classList.contains('active')) {
                        if (typeof currentBilletterieSpectacleId !== 'undefined' && currentBilletterieSpectacleId) {
                            context.mode = 'task';
                            context.projectId = currentBilletterieSpectacleId;
                            context.projectType = 'spectacle';
                            context.category = 'Billetterie';
                            context.tooltip = '+ Tâche Billetterie';
                        }
                    }
                    // Page Communication Spectacle
                    else {
                        const communicationPage = document.getElementById('communicationPage');
                        if (communicationPage && communicationPage.classList.contains('active')) {
                            if (typeof currentCommunicationSpectacleId !== 'undefined' && currentCommunicationSpectacleId) {
                                context.mode = 'task';
                                context.projectId = currentCommunicationSpectacleId;
                                context.projectType = 'spectacle';
                                context.category = 'Communication';
                                context.tooltip = '+ Tâche Communication';
                            }
                        }
                        // Page Communication Tournée
                        else {
                            const communicationTourneePage = document.getElementById('communicationTourneePage');
                            if (communicationTourneePage && communicationTourneePage.classList.contains('active')) {
                                if (typeof currentCommunicationTourneeId !== 'undefined' && currentCommunicationTourneeId) {
                                    context.mode = 'task';
                                    context.projectId = currentCommunicationTourneeId;
                                    context.projectType = 'tournee';
                                    context.category = 'Communication';
                                    context.tooltip = '+ Tâche Communication';
                                }
                            }
                            // Page Documents
                            else {
                                const documentsPage = document.getElementById('documentsPage');
                                if (documentsPage && documentsPage.classList.contains('active')) {
                                    if (typeof currentDocumentsSpectacleId !== 'undefined' && currentDocumentsSpectacleId) {
                                        context.mode = 'task';
                                        context.projectId = currentDocumentsSpectacleId;
                                        context.projectType = 'spectacle';
                                        context.category = 'Administratif';
                                        context.tooltip = '+ Tâche Documents';
                                    }
                                }
                                // Page Visuels
                                else {
                                    const visuelsPage = document.getElementById('visuelsPage');
                                    const tourneeVisuelsPage = document.getElementById('tourneeVisuelsPage');
                                    if ((visuelsPage && visuelsPage.classList.contains('active')) ||
                                        (tourneeVisuelsPage && tourneeVisuelsPage.classList.contains('active'))) {
                                        context.mode = 'task';
                                        if (typeof currentVisuelsSpectacleId !== 'undefined' && currentVisuelsSpectacleId) {
                                            context.projectId = currentVisuelsSpectacleId;
                                            context.projectType = 'spectacle';
                                        } else if (typeof currentTourneeVisuelsId !== 'undefined' && currentTourneeVisuelsId) {
                                            context.projectId = currentTourneeVisuelsId;
                                            context.projectType = 'tournee';
                                        }
                                        context.category = 'Communication';
                                        context.tooltip = '+ Tâche Visuels';
                                    }
                                    // Page Tâches globale - mode tâche sans contexte
                                    else {
                                        const globalTasksPage = document.getElementById('globalTasksPage');
                                        if (globalTasksPage && globalTasksPage.classList.contains('active')) {
                                            context.mode = 'task';
                                            context.tooltip = '+ Nouvelle tâche';
                                        }
                                        // Accueil ou autre - mode menu
                                        else {
                                            context.mode = 'menu';
                                            context.tooltip = '+ Nouveau';
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    return context;
}

/**
 * Met à jour l'apparence du FAB selon le contexte
 */
function updateFabAppearance() {
    fabContext = detectFabContext();
    fabMode = fabContext.mode;
    
    const fabButton = document.getElementById('fabButton');
    const fabIcon = document.getElementById('fabIcon');
    const fabTooltip = document.getElementById('fabTooltip');
    const fabMenu = document.getElementById('fabMenu');
    
    if (!fabButton || !fabIcon || !fabTooltip || !fabMenu) return;
    
    if (fabMode === 'task') {
        // Mode tâche directe
        fabButton.classList.add('task-mode');
        fabIcon.textContent = '✓';
        fabTooltip.textContent = fabContext.tooltip;
        fabMenu.style.display = 'none';
    } else {
        // Mode menu
        fabButton.classList.remove('task-mode');
        fabIcon.textContent = '+';
        fabTooltip.textContent = fabContext.tooltip;
        fabMenu.style.display = '';
    }
    
    // Fermer le menu si ouvert
    closeFabMenu();
}

/**
 * Gère le clic sur le FAB
 */
function handleFabClick() {
    if (fabMode === 'task') {
        // Ouvrir directement la modale tâche avec le contexte
        openTaskModal({
            projectId: fabContext.projectId,
            category: fabContext.category
        });
    } else {
        // Toggle le menu
        toggleFabMenu();
    }
}

/**
 * Toggle le menu FAB
 */
function toggleFabMenu() {
    const container = document.getElementById('fabContainer');
    if (container) {
        container.classList.toggle('menu-open');
    }
}

/**
 * Ferme le menu FAB
 */
function closeFabMenu() {
    const container = document.getElementById('fabContainer');
    if (container) {
        container.classList.remove('menu-open');
    }
}

/**
 * Initialisation : écouter les changements de page
 */
function initFabWatcher() {
    // Observer les changements de classes sur les pages
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                // Une page a changé d'état, mettre à jour le FAB
                updateFabAppearance();
            }
        });
    });
    
    // Observer toutes les pages
    const pages = document.querySelectorAll('.tournee-page, .tasks-page, #mainContent, #app');
    pages.forEach(page => {
        observer.observe(page, { attributes: true, attributeFilter: ['class'] });
    });
    
    // Observer aussi les pages spécifiques
    const specificPages = [
        'tourneePage', 'spectaclePage', 'budgetPage', 'techPage', 
        'billetteriePage', 'communicationPage', 'communicationTourneePage',
        'documentsPage', 'visuelsPage', 'tourneeVisuelsPage', 'globalTasksPage'
    ];
    specificPages.forEach(pageId => {
        const page = document.getElementById(pageId);
        if (page) {
            observer.observe(page, { attributes: true, attributeFilter: ['class'] });
        }
    });
    
    // État initial
    updateFabAppearance();
}

// Fermer le menu en cliquant ailleurs
document.addEventListener('click', (e) => {
    const fabContainer = document.getElementById('fabContainer');
    if (fabContainer && !fabContainer.contains(e.target)) {
        closeFabMenu();
    }
});

function selectPriority(priority) {
    document.querySelectorAll('.priority-option, .priority-option-modern').forEach(opt => opt.classList.remove('selected'));
    const option = document.querySelector(`.priority-option-modern[data-priority="${priority}"]`) || 
                  document.querySelector(`.priority-option[data-priority="${priority}"]`);
    if (option) option.classList.add('selected');
    document.getElementById('taskPriority').value = priority;
}

async function saveTask(event) {
    event.preventDefault();
    
    const taskId = document.getElementById('taskId').value;
    const isEdit = !!taskId;
    
    // Récupérer les valeurs du formulaire
    const projectSelect = document.getElementById('taskProjectSelect');
    if (!projectSelect || !projectSelect.value) {
        alert('Veuillez sélectionner un projet pour cette tâche.');
        return;
    }
    
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const projectId = projectSelect.value;
    const projectType = selectedOption?.dataset?.type || 'spectacle';
    
    const project = projects.find(p => p.id == projectId || String(p.id) === String(projectId));
    if (!project) {
        alert('Projet introuvable.');
        return;
    }
    
    // Récupérer la priorité depuis les radio buttons
    const priorityRadio = document.querySelector('input[name="taskPriority"]:checked');
    const priority = priorityRadio ? priorityRadio.value : 'normal';
    
    const task = {
        id: taskId || 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim() || '',
        projectId: projectId,
        projectType: projectType,
        category: document.getElementById('taskCategory').value || '',
        dueDate: document.getElementById('taskDueDate').value || null,
        priority: priority,
        status: document.getElementById('taskStatus').value || 'todo',
        assignedTo: getSelectedAssignees().map(String), // Utiliser assignedTo et convertir en strings
        assignees: getSelectedAssignees().map(String), // Copie pour compatibilité
        subtasks: currentSubtasks.map(st => ({
            id: st.id,
            title: st.title,
            assignee: st.assignee || null,
            completed: st.completed || false,
            order: st.order || 0
        })),
        attachments: currentAttachments.filter(a => !a.isNew), // Garder les existantes
        updatedAt: new Date().toISOString()
    };
    
    const existingTask = isEdit ? allTasks.find(t => t.id === taskId) : null;
    if (!isEdit) {
        task.createdBy = getCurrentUserId();
        task.createdAt = new Date().toISOString();
    } else if (existingTask) {
        task.createdBy = existingTask.createdBy;
        task.createdAt = existingTask.createdAt;
        task.attachments = existingTask.attachments || [];
    }
    
    // Notifier les nouveaux assignés (création ou édition)
    const projectName = project.name || project.lieu || 'Projet';
    const prevAssigned = existingTask ? (existingTask.assignedTo || existingTask.assignees || []).map(String) : [];
    const newAssigned = task.assignedTo.filter(id => !prevAssigned.includes(id));
    newAssigned.forEach(uid => notifyUserAssigned(uid, 'Nouvelle tâche assignée', `Vous avez été assigné(e) à la tâche « ${task.title || 'Sans titre'} » du projet ${projectName}.`, 'assignment', { type: 'task', projectId: project.id, taskId: task.id }));
    
    // Upload des nouvelles pièces jointes
    const newAttachments = currentAttachments.filter(a => a.isNew && a.file);
    if (newAttachments.length > 0) {
        try {
            const uploadedAttachments = await uploadTaskAttachments(task.id, newAttachments);
            task.attachments = [...task.attachments, ...uploadedAttachments];
        } catch (error) {
            console.error('Erreur upload pièces jointes:', error);
            showToast('Erreur lors de l\'upload des pièces jointes', 'error');
        }
    }
    
    // Sauvegarder dans la structure centralisée et dans le projet
    saveTaskToProject(task);
    
    // Sauvegarder via l'API existante
    try {
        await saveProjectsAsync();
        showToast(isEdit ? 'Tâche modifiée' : 'Tâche créée', 'success');
        closeTaskModal();
        loadAllTasks(); // Recharger les tâches
        renderHomeTasks();
        updateTasksBadge();
    } catch (error) {
        console.error('Erreur sauvegarde tâche:', error);
        showToast('Erreur lors de la sauvegarde', 'error');
    }
}

async function uploadTaskAttachments(taskId, attachments) {
    const uploaded = [];
    
    for (const att of attachments) {
        if (!att.file) continue;
        
        try {
            if (typeof uploadFile === 'function') {
                const result = await uploadFile(att.file, 'documents');
                uploaded.push({
                    id: result.file_id || att.id,
                    name: att.name,
                    type: att.type,
                    size: att.size,
                    url: result.url || result.downloadUrl,
                    file_id: result.file_id,
                    stored_externally: true,
                    uploadedBy: getCurrentUserId(),
                    uploadedAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Erreur upload pièce jointe:', error);
        }
    }
    
    return uploaded;
}

function getCurrentUserId() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        return user.id || null;
    } catch (e) {
        return null;
    }
}

// Ancienne fonction saveTask (conservée pour compatibilité)
function saveTaskOld(event) {
    event.preventDefault();
    const sel = document.getElementById('taskProjectSelect');
    const projectId = (sel && sel.value) ? sel.value
        : document.getElementById('taskProjectId').value
        || currentTasksProject?.id;
    const project = projects.find(p => p.id == projectId || String(p.id) === String(projectId));
    if (!project) {
        alert('Veuillez sélectionner un projet / spectacle pour cette tâche.');
        return;
    }
    if (!project.tasks) project.tasks = [];

    // Récupérer les assignés sélectionnés
    const assignedTo = getSelectedAssignees();
    
    const taskData = {
        id: document.getElementById('taskId').value || Date.now().toString(),
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim(),
        category: document.getElementById('taskCategory').value,
        dueDate: document.getElementById('taskDueDate').value,
        priority: document.getElementById('taskPriority').value,
        status: document.getElementById('taskStatus').value,
        assignedTo: assignedTo,
        tag: currentEditingTask?.tag || null, // Conserver le tag si existant
        createdAt: currentEditingTask?.createdAt || new Date().toISOString(),
        createdBy: currentEditingTask?.createdBy || (currentUser ? currentUser.id : null),
        completedBy: currentEditingTask?.completedBy || null,
        completedAt: currentEditingTask?.completedAt || null
    };

    if (currentEditingTask) {
        const index = project.tasks.findIndex(t => t.id === currentEditingTask.id);
        if (index !== -1) {
            // Conserver les champs de complétion si la tâche était déjà terminée
            if (currentEditingTask.status === 'done' && taskData.status === 'done') {
                taskData.completedBy = currentEditingTask.completedBy || taskData.completedBy;
                taskData.completedAt = currentEditingTask.completedAt || taskData.completedAt;
            }
            project.tasks[index] = taskData;
        }
    } else {
        project.tasks.push(taskData);
    }

    saveProjectsAsync();
    closeTaskModal();
    if (currentTasksProject) renderProjectTasks();
    renderHomeTasksWidget();
    refreshPageTasks();
    // Rafraîchir les tâches de section si on est sur la page Tech
    if (window.currentTechSpectacle) renderTechSectionTasks();
    // Rafraîchir les tâches du spectacle si on est sur la page spectacle
    if (currentSpectacleDetail && currentSpectacleDetail.id === projectId) {
        renderSpectacleAllTasks(projectId);
    }
    // Rafraîchir les tâches de la tournée si la tâche appartient à un spectacle de la tournée
    if (currentTournee) {
        const project = projects.find(p => p.id === projectId);
        if (project && (project.id === currentTournee.id || project.parentId === currentTournee.id)) {
            renderTourneeAllTasks(currentTournee.id);
        }
    }
}

function handleTaskClick(ev, projectId, taskId) {
    try {
        if (ev && ev.target && ev.target.closest && ev.target.closest('.task-tag-editable')) return;
        if (arguments.length >= 3) {
            openTaskDetailModal(projectId || null, taskId);
            return;
        }
        var el = ev && (ev.currentTarget || ev.target) && (ev.currentTarget || ev.target).closest && (ev.currentTarget || ev.target).closest('.task-item, .task-item-compact');
        if (!el) return;
        var pid = el.getAttribute('data-project-id') || '';
        var tid = el.getAttribute('data-task-id') || '';
        if (tid) openTaskDetailModal(pid || null, tid);
    } catch (err) { console.error('handleTaskClick erreur:', err); }
}
function openTaskDetailModal(projectId, taskId) {
    if (!taskId) return;
    if (projectId && String(projectId).startsWith('crm_')) {
        if (typeof openTaskFiche === 'function') {
            openTaskFiche('crm_deal', projectId, taskId);
            return;
        }
        if (typeof openCrmDealFromTask === 'function' && openCrmDealFromTask(projectId)) return;
    }
    if (projectId === 'bureau') {
        if (typeof openTaskFiche === 'function') {
            openTaskFiche('personal', '', taskId);
            return;
        }
        if (typeof openBureauTaskDetailModalById === 'function') openBureauTaskDetailModalById(taskId);
        return;
    }
    let project = projectId ? getProjectById(projectId) : null;
    let found = project?.tasks?.find(t => String(t.id) === String(taskId));
    if (!found && projects) {
        for (const p of projects) {
            if (p.tasks && (found = p.tasks.find(t => String(t.id) === String(taskId)))) {
                project = p; break;
            }
            if (p.spectacles) for (const s of p.spectacles) {
                if (s.tasks && (found = s.tasks.find(t => String(t.id) === String(taskId)))) {
                    project = s; break;
                }
            }
        }
    }
    if (!project || !found) {
        console.warn('openTaskDetailModal: tâche non trouvée', { projectId, taskId });
        return;
    }
    const effectiveProjectId = project.id || projectId;
    const task = migrateTaskData({...found, projectId: effectiveProjectId, projectName: project.name || project.nom || 'Projet'});
    if (typeof canEditTask === 'function' && canEditTask(task, effectiveProjectId)) {
        editTask(effectiveProjectId, task.id);
    } else {
        renderTaskDetailModal(task, effectiveProjectId, false);
    }
}

function openBureauTaskDetailModal(task) {
    editBureauPersonalTask(task);
}
function openBureauTaskDetailModalById(taskId) {
    if (typeof openTaskFiche === 'function') {
        openTaskFiche('personal', '', taskId);
        return;
    }
    const task = (myBureau.tasks || []).find(t => String(t.id) === String(taskId));
    if (task) openBureauTaskDetailModal(task);
}

function renderTaskDetailModal(task, projectId, isBureau = false) {
    const modal = document.getElementById('taskDetailModal');
    const content = document.getElementById('taskDetailContent');
    const titleEl = document.getElementById('taskDetailTitle');
    const editBtn = document.getElementById('taskDetailEditBtn');
    if (!modal || !content) return;
    if (modal.parentNode !== document.body) document.body.appendChild(modal);
    
    const priorityMap = { high: '🔴 Haute', medium: '🟠 Moyenne', low: '🟢 Basse', urgent: '🔴 Haute', normal: '🟠 Moyenne' };
    const priorityText = priorityMap[task.priority || 'medium'] || '🟠 Moyenne';
    const statusText = { todo: '⏳ À faire', inprogress: '🔄 En cours', done: '✅ Terminé' }[task.status || 'todo'] || '⏳ À faire';
    const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
    const assignees = assignedIds.map(uid => {
        const u = getUserById(uid);
        return u ? `${u.prenom || ''} ${u.nom || u.username}`.trim() : String(uid);
    }).filter(Boolean);
    const assigneesStr = assignees.length ? assignees.join(', ') : 'Non assigné';
    
    let attachmentsHtml = '';
    const attachments = task.attachments || [];
    if (attachments.length > 0) {
        attachmentsHtml = `<div class="task-detail-section"><h4>📎 Pièces jointes (${attachments.length})</h4><div class="attachments-list">` +
            attachments.map(att => {
                const fileId = getFileIdFromAttachment(att);
                const name = escapeHtml(att.name || 'Fichier');
                if (fileId) {
                    return `<div class="attachment-item"><span class="attachment-icon">${getFileIcon ? getFileIcon(att.type) : '📎'}</span><span class="attachment-name"><button type="button" class="attachment-btn attachment-download" data-file-id="${escapeHtml(fileId)}" data-name="${escapeHtml(att.name || 'Fichier')}" data-type="${escapeHtml(att.type || '')}" onclick="openTaskAttachmentFromDetail(this)">⬇️ ${name}</button></span></div>`;
                }
                return `<div class="attachment-item"><span class="attachment-icon">${getFileIcon ? getFileIcon(att.type) : '📎'}</span><span class="attachment-name">${name}</span></div>`;
            }).join('') + '</div></div>';
    } else {
        attachmentsHtml = '<div class="task-detail-section"><h4>📎 Pièces jointes</h4><p style="color:#94a3b8;font-size:0.9rem;">Aucune pièce jointe</p></div>';
    }
    
    let subtasksHtml = '';
    const subtasks = task.subtasks || [];
    if (subtasks.length > 0) {
        subtasksHtml = `<div class="task-detail-section"><h4>☑️ Sous-tâches</h4><ul style="margin:0;padding-left:1.5rem;">` +
            subtasks.map(s => `<li class="${s.completed ? 'completed' : ''}" style="${s.completed ? 'text-decoration:line-through;color:#94a3b8' : ''}">${escapeHtml(s.title || 'Sans titre')}</li>`).join('') + '</ul></div>';
    }
    
    content.innerHTML = `
        <div class="task-detail-section">
            <h3 style="margin:0 0 1rem 0;font-size:1.25rem;">${escapeHtml(task.title || 'Sans titre')}</h3>
            ${!isBureau && task.projectName ? `<p style="color:#64748b;margin-bottom:1rem;">📁 ${escapeHtml(task.projectName)}</p>` : ''}
        </div>
        <div class="task-detail-section" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div><strong>📁 Catégorie</strong><br><span>${escapeHtml(task.category || '-')}</span></div>
            <div><strong>⚡ Priorité</strong><br><span>${priorityText}</span></div>
            <div><strong>📅 Échéance</strong><br><span>${task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : '-'}</span></div>
            <div><strong>📊 Statut</strong><br><span>${statusText}</span></div>
            <div style="grid-column:1/-1"><strong>👤 Assignés</strong><br><span>${escapeHtml(assigneesStr)}</span></div>
        </div>
        ${task.description ? `<div class="task-detail-section"><h4>📝 Description</h4><div class="task-detail-description">${typeof formatMsgText === 'function' ? formatMsgText(task.description) : escapeHtml(task.description).replace(/\n/g, '<br>')}</div></div>` : ''}
        ${subtasksHtml}
        ${attachmentsHtml}
    `;
    
    titleEl.textContent = 'Détail de la tâche';
    editBtn.style.display = (!isBureau && projectId && typeof canEditTask === 'function' && canEditTask(task)) ? 'inline-block' : 'none';
    editBtn.onclick = () => {
        closeTaskDetailModal();
        if (isBureau) openMyBureauPage();
        else if (projectId) editTask(projectId, task.id);
    };
    modal.onclick = (e) => { if (e.target === modal) closeTaskDetailModal(); };
    modal.classList.add('active');
}

function closeTaskDetailModal() {
    const modal = document.getElementById('taskDetailModal');
    if (modal) modal.classList.remove('active');
}

function closeTaskDetailAndEdit() {
    const editBtn = document.getElementById('taskDetailEditBtn');
    if (editBtn && editBtn.onclick) editBtn.onclick();
}

async function editTask(projectId, taskId) {
    if (projectId === 'bureau') {
        if (typeof openBureauTaskDetailModalById === 'function') openBureauTaskDetailModalById(taskId);
        return;
    }
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    const task = migrateTaskData({...project.tasks.find(t => t.id === taskId)});
    if (!task) return;

    // Vérifier les permissions
    if (!canEditTask(task)) {
        alert('Vous n\'avez pas la permission de modifier cette tâche.');
        return;
    }

    currentEditingTask = task;
    currentTasksProject = project; // Important pour la sauvegarde
    document.getElementById('taskModalTitle').textContent = 'Modifier la tâche';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskProjectId').value = projectId;
    populateTaskProjectSelect(projectId, true);
    document.getElementById('taskTitle').value = task.title || '';
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskCategory').value = task.category || 'Autre';
    document.getElementById('taskDueDate').value = task.dueDate || '';
    const priorityMap = { high: 'urgent', medium: 'normal', low: 'low', urgent: 'urgent', normal: 'normal' };
    const formPriority = priorityMap[task.priority] || 'normal';
    document.getElementById('taskPriority').value = formPriority;
    selectPriority(formPriority);
    const priorityRadios = document.querySelectorAll('input[name="taskPriority"]');
    priorityRadios.forEach(r => { r.checked = (r.value === formPriority); });
    const taskStatusEl = document.getElementById('taskStatus');
    if (taskStatusEl) taskStatusEl.value = task.status || 'todo';
    const statusGroup = document.getElementById('taskStatusGroup');
    if (statusGroup) statusGroup.style.display = 'block';
    currentSubtasks = (task.subtasks || []).map((s, i) => ({ ...s, order: i }));
    currentAttachments = (task.attachments || []).map(a => ({ ...a, isNew: false }));
    renderSubtasks();
    renderAttachments();
    setTimeout(() => initAttachmentDropzone && initAttachmentDropzone(), 100);
    
    // Remplir le multi-select des assignés (users_list.php accessible à tous)
    const assignedIds = getAssignedUserIds(task);
    await populateAssigneeMultiSelect(assignedIds);
    
    // Cocher "M'assigner cette tâche" si l'utilisateur est dans la liste
    const assignToMeEl = document.getElementById('taskAssignToMe');
    if (assignToMeEl) {
        assignToMeEl.checked = !!(currentUser && assignedIds.includes(String(currentUser.id)));
    }
    
    updateAssigneeBadges();
    document.getElementById('taskModal').classList.add('active');
}

function deleteTask(projectId, taskId) {
    if (!confirm('Supprimer cette tâche ?')) return;
    if (projectId === 'bureau') {
        if (typeof deleteBureauTask === 'function') {
            deleteBureauTask(taskId);
            renderHomeTasksWidget();
        }
        return;
    }
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    project.tasks = project.tasks.filter(t => t.id !== taskId);
    saveProjectsAsync();
    if (currentTasksProject) renderProjectTasks();
    renderHomeTasksWidget();
    refreshPageTasks();
    // Rafraîchir les tâches de section si on est sur la page Tech
    if (window.currentTechSpectacle) renderTechSectionTasks();
    // Rafraîchir les tâches du spectacle si on est sur la page spectacle
    if (currentSpectacleDetail && currentSpectacleDetail.id === projectId) {
        renderSpectacleAllTasks(projectId);
    }
    // Rafraîchir les tâches de la tournée si la tâche appartient à un spectacle de la tournée
    if (currentTournee) {
        const project = projects.find(p => p.id === projectId);
        if (project && (project.id === currentTournee.id || project.parentId === currentTournee.id)) {
            renderTourneeAllTasks(currentTournee.id);
        }
    }
}

function toggleTaskStatus(projectId, taskId) {
    if (projectId && String(projectId).startsWith('crm_')) {
        if (typeof toggleCrmDealTaskStatusByProject === 'function' && toggleCrmDealTaskStatusByProject(projectId, taskId)) {
            if (typeof refreshCrmDealTasksInTaskViews === 'function') refreshCrmDealTasksInTaskViews();
            else {
                if (typeof loadAllTasks === 'function') loadAllTasks();
                renderHomeTasksWidget();
                if (typeof renderGlobalTasks === 'function') renderGlobalTasks();
            }
        }
        return;
    }
    if (projectId === 'bureau') {
        if (typeof toggleBureauTask === 'function') {
            toggleBureauTask(taskId);
            renderHomeTasksWidget();
        }
        return;
    }
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    const task = migrateTaskData({...project.tasks.find(t => t.id === taskId)});
    if (!task) return;
    
    // Vérifier les permissions
    if (!canChangeTaskStatus(task)) {
        alert('Vous n\'avez pas la permission de changer le statut de cette tâche.');
        return;
    }
    
    const wasDone = task.status === 'done';
    task.status = wasDone ? 'todo' : 'done';
    
    // Enregistrer qui a complété la tâche et quand
    if (task.status === 'done' && currentUser) {
        task.completedBy = currentUser.id;
        task.completedAt = new Date().toISOString();
    } else if (task.status === 'todo') {
        task.completedBy = null;
        task.completedAt = null;
    }
    
    // Mettre à jour la tâche dans le projet
    const index = project.tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
        project.tasks[index] = task;
    }
    
    saveProjectsAsync();
    if (currentTasksProject) renderProjectTasks();
    renderHomeTasksWidget();
    refreshPageTasks();
    // Rafraîchir les tâches de section si on est sur la page Tech
    if (window.currentTechSpectacle) renderTechSectionTasks();
    // Rafraîchir les tâches du spectacle si on est sur la page spectacle
    if (currentSpectacleDetail && currentSpectacleDetail.id === projectId) {
        renderSpectacleAllTasks(projectId);
    }
}

function addTaskFromCard(projectId, category) {
    currentTasksProject = projects.find(p => p.id === projectId);
    if (!currentTasksProject) return;
    if (!currentTasksProject.tasks) currentTasksProject.tasks = [];
    openNewTaskModal(category);
}


function renderTasksCardForSpectacle(spectacleId) {
    const stats = countProjectTasks(spectacleId);
    const percentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
    return `
        <div class="project-card" onclick="openProjectTasksPage('${spectacleId}')" style="cursor: pointer; max-width: 400px;">
            <h3 style="margin-bottom: 1rem;">📋 Tâches</h3>
            <div style="padding: 1rem; background: var(--light); border-radius: 10px;">
                <div class="task-progress" style="margin-bottom: 0.5rem;">
                    <div class="task-progress-bar"><div class="task-progress-fill" style="width: ${percentage}%"></div></div>
                    <span class="task-progress-text">${percentage}%</span>
                </div>
                <div style="text-align: center; color: #636e72;">${stats.todo} à faire / ${stats.total} total</div>
            </div>
            <div style="margin-top: 1rem; text-align: center; color: var(--accent); font-weight: 600;">Cliquez pour gérer →</div>
        </div>
    `;
}

// Variables pour les limites d'affichage des tâches
let spectacleTasksLimit = 10;
let tourneeTasksLimit = 10;

function changeSpectacleTasksLimit() {
    const select = document.getElementById('spectacleTasksLimit');
    spectacleTasksLimit = select.value === 'all' ? Infinity : parseInt(select.value);
    if (currentSpectacleDetail) {
        renderSpectacleAllTasks(currentSpectacleDetail.id);
    }
}

function changeTourneeTasksLimit() {
    const select = document.getElementById('tourneeTasksLimit');
    tourneeTasksLimit = select.value === 'all' ? Infinity : parseInt(select.value);
    if (currentTournee) {
        renderTourneeAllTasks(currentTournee.id);
    }
}

// Afficher toutes les tâches d'un spectacle
function renderSpectacleAllTasks(spectacleId) {
    const container = document.getElementById('spectacleAllTasksList');
    if (!container) return;
    
    const project = getProjectById(spectacleId);
    if (!project) return;
    
    const tasks = project.tasks || [];
    
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="tasks-empty">
                <div class="tasks-empty-icon">📋</div>
                <div>Aucune tâche pour ce spectacle.</div>
                <div style="font-size: 0.85rem; margin-top: 0.5rem;">Cliquez sur "+ Ajouter une tâche" pour commencer.</div>
            </div>
        `;
        return;
    }
    
    // Séparer les tâches terminées et non terminées
    const pending = tasks.filter(t => t.status !== 'done');
    const done = tasks.filter(t => t.status === 'done');
    
    // Grouper les tâches en attente par catégorie
    const tasksByCategory = {};
    pending.forEach(task => {
        const category = task.category || 'Autre';
        if (!tasksByCategory[category]) {
            tasksByCategory[category] = [];
        }
        tasksByCategory[category].push(task);
    });
    
    let html = '';
    let totalDisplayed = 0;
    
    // Afficher les tâches en attente groupées par catégorie
    if (pending.length > 0) {
        Object.keys(tasksByCategory).sort().forEach(category => {
            if (totalDisplayed >= spectacleTasksLimit) return;
            
            const categoryTasks = tasksByCategory[category];
            const remaining = spectacleTasksLimit - totalDisplayed;
            const tasksToShow = remaining < categoryTasks.length ? categoryTasks.slice(0, remaining) : categoryTasks;
            const moreCount = categoryTasks.length - tasksToShow.length;
            
            html += `
                <div class="tasks-group" style="margin-bottom: 1.5rem;">
                    <div class="tasks-group-header">
                        <div class="tasks-group-title">${category} (${categoryTasks.length})${moreCount > 0 ? ` - ${moreCount} masquée(s)` : ''}</div>
                    </div>
                    ${tasksToShow.map(t => renderTaskItem({...t, projectId: spectacleId})).join('')}
                </div>
            `;
            
            totalDisplayed += tasksToShow.length;
        });
    }
    
    // Afficher les tâches terminées (limitées aussi)
    if (done.length > 0 && totalDisplayed < spectacleTasksLimit) {
        const remaining = spectacleTasksLimit - totalDisplayed;
        const doneToShow = remaining < done.length ? done.slice(0, remaining) : done;
        const moreDoneCount = done.length - doneToShow.length;
        
        html += `
            <div class="tasks-group" style="margin-top: 1.5rem;">
                <div class="tasks-group-header">
                    <div class="tasks-group-title done">✅ TERMINÉES (${done.length})${moreDoneCount > 0 ? ` - ${moreDoneCount} masquée(s)` : ''}</div>
                    <button class="btn-delete-all" onclick="deleteAllDoneTasksForSpectacle('${spectacleId}')">
                        🗑️ Tout supprimer
                    </button>
                </div>
                ${doneToShow.map(t => renderTaskItem({...t, projectId: spectacleId})).join('')}
            </div>
        `;
    }
    
    // Message si des tâches sont masquées
    if (tasks.length > spectacleTasksLimit) {
        html += `
            <div style="text-align: center; padding: 1rem; color: #636e72; font-size: 0.9rem; margin-top: 1rem;">
                ${tasks.length - totalDisplayed} tâche(s) masquée(s). Augmentez la limite pour voir toutes les tâches.
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function deleteAllDoneTasksForSpectacle(spectacleId) {
    if (!confirm('Supprimer toutes les tâches terminées de ce spectacle ?')) return;
    
    const project = projects.find(p => p.id === spectacleId);
    if (!project || !project.tasks) return;
    
    project.tasks = project.tasks.filter(t => t.status !== 'done');
    
    saveProjectsAsync();
    renderSpectacleAllTasks(spectacleId);
    renderHomeTasksWidget();
}

function openQuickTaskModalForSpectacle() {
    if (!currentSpectacleDetail) return;
    openQuickTaskModal(null, null, currentSpectacleDetail.id);
}

function openQuickTaskModalForTournee() {
    if (!currentTournee) return;
    openQuickTaskModal(null, null, currentTournee.id);
}

// Afficher toutes les tâches d'une tournée
function renderTourneeAllTasks(tourneeId) {
    const container = document.getElementById('tourneeAllTasksList');
    if (!container) return;
    
    const tournee = projects.find(p => p.id === tourneeId);
    if (!tournee) return;
    
    // Récupérer toutes les tâches de la tournée et de ses spectacles
    const allTasks = [];
    
    // Tâches de la tournée elle-même
    if (tournee.tasks && tournee.tasks.length > 0) {
        tournee.tasks.forEach(task => {
            allTasks.push({...task, projectId: tourneeId, source: 'tournee'});
        });
    }
    
    // Tâches des spectacles de la tournée
    const spectacles = projects.filter(p => p.parentId === tourneeId);
    spectacles.forEach(spectacle => {
        if (spectacle.tasks && spectacle.tasks.length > 0) {
            spectacle.tasks.forEach(task => {
                allTasks.push({...task, projectId: spectacle.id, source: 'spectacle', spectacleName: spectacle.name});
            });
        }
    });
    
    if (allTasks.length === 0) {
        container.innerHTML = `
            <div class="tasks-empty">
                <div class="tasks-empty-icon">📋</div>
                <div>Aucune tâche pour cette tournée.</div>
                <div style="font-size: 0.85rem; margin-top: 0.5rem;">Cliquez sur "+ Ajouter une tâche" pour commencer.</div>
            </div>
        `;
        return;
    }
    
    // Séparer les tâches terminées et non terminées
    const pending = allTasks.filter(t => t.status !== 'done');
    const done = allTasks.filter(t => t.status === 'done');
    
    // Grouper les tâches en attente par catégorie
    const tasksByCategory = {};
    pending.forEach(task => {
        const category = task.category || 'Autre';
        if (!tasksByCategory[category]) {
            tasksByCategory[category] = [];
        }
        tasksByCategory[category].push(task);
    });
    
    let html = '';
    let totalDisplayed = 0;
    
    // Afficher les tâches en attente groupées par catégorie
    if (pending.length > 0) {
        Object.keys(tasksByCategory).sort().forEach(category => {
            if (totalDisplayed >= tourneeTasksLimit) return;
            
            const categoryTasks = tasksByCategory[category];
            const remaining = tourneeTasksLimit - totalDisplayed;
            const tasksToShow = remaining < categoryTasks.length ? categoryTasks.slice(0, remaining) : categoryTasks;
            const moreCount = categoryTasks.length - tasksToShow.length;
            
            html += `
                <div class="tasks-group" style="margin-bottom: 1.5rem;">
                    <div class="tasks-group-header">
                        <div class="tasks-group-title">${category} (${categoryTasks.length})${moreCount > 0 ? ` - ${moreCount} masquée(s)` : ''}</div>
                    </div>
                    ${tasksToShow.map(t => {
                        const taskHtml = renderTaskItem({...t, projectId: t.projectId});
                        // Ajouter le nom du spectacle si la tâche vient d'un spectacle
                        if (t.source === 'spectacle' && t.spectacleName) {
                            return taskHtml.replace('</div>', `<span class="home-task-project">📁 ${t.spectacleName}</span></div>`);
                        }
                        return taskHtml;
                    }).join('')}
                </div>
            `;
            
            totalDisplayed += tasksToShow.length;
        });
    }
    
    // Afficher les tâches terminées (limitées aussi)
    if (done.length > 0 && totalDisplayed < tourneeTasksLimit) {
        const remaining = tourneeTasksLimit - totalDisplayed;
        const doneToShow = remaining < done.length ? done.slice(0, remaining) : done;
        const moreDoneCount = done.length - doneToShow.length;
        
        html += `
            <div class="tasks-group" style="margin-top: 1.5rem;">
                <div class="tasks-group-header">
                    <div class="tasks-group-title done">✅ TERMINÉES (${done.length})${moreDoneCount > 0 ? ` - ${moreDoneCount} masquée(s)` : ''}</div>
                    <button class="btn-delete-all" onclick="deleteAllDoneTasksForTournee('${tourneeId}')">
                        🗑️ Tout supprimer
                    </button>
                </div>
                ${doneToShow.map(t => {
                    const taskHtml = renderTaskItem({...t, projectId: t.projectId});
                    // Ajouter le nom du spectacle si la tâche vient d'un spectacle
                    if (t.source === 'spectacle' && t.spectacleName) {
                        return taskHtml.replace('</div>', `<span class="home-task-project">📁 ${t.spectacleName}</span></div>`);
                    }
                    return taskHtml;
                }).join('')}
            </div>
        `;
    }
    
    // Message si des tâches sont masquées
    if (allTasks.length > tourneeTasksLimit) {
        html += `
            <div style="text-align: center; padding: 1rem; color: #636e72; font-size: 0.9rem; margin-top: 1rem;">
                ${allTasks.length - totalDisplayed} tâche(s) masquée(s). Augmentez la limite pour voir toutes les tâches.
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function deleteAllDoneTasksForTournee(tourneeId) {
    if (!confirm('Supprimer toutes les tâches terminées de cette tournée et de ses spectacles ?')) return;
    
    const tournee = projects.find(p => p.id === tourneeId);
    if (!tournee) return;
    
    // Supprimer les tâches terminées de la tournée
    if (tournee.tasks) {
        tournee.tasks = tournee.tasks.filter(t => t.status !== 'done');
    }
    
    // Supprimer les tâches terminées des spectacles de la tournée
    const spectacles = projects.filter(p => p.parentId === tourneeId);
    spectacles.forEach(spectacle => {
        if (spectacle.tasks) {
            spectacle.tasks = spectacle.tasks.filter(t => t.status !== 'done');
        }
    });
    
    saveProjectsAsync();
    renderTourneeAllTasks(tourneeId);
    renderHomeTasksWidget();
}

// Rendu des tâches par catégorie dans les pages spécifiques
function renderCategoryTasks(projectId, category, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const tasks = (project.tasks || []).filter(t => t.category === category);
    
    if (tasks.length === 0) {
        container.innerHTML = `<div class="tasks-empty">
            <div class="tasks-empty-icon">📋</div>
            <div>Aucune tâche ${category}.</div>
            <div style="font-size: 0.85rem; margin-top: 0.5rem;">Cliquez sur "+ Ajouter une tâche" pour commencer.</div>
        </div>`;
        return;
    }
    
    // Séparer les tâches terminées et non terminées
    const pending = tasks.filter(t => t.status !== 'done');
    const done = tasks.filter(t => t.status === 'done');
    
    let html = '';
    
    if (pending.length > 0) {
        html += `<div class="tasks-group">
            <div class="tasks-group-header">
                <div class="tasks-group-title">📋 À FAIRE (${pending.length})</div>
            </div>
            ${pending.map(t => renderTaskItem({...t, projectId: projectId})).join('')}
        </div>`;
    }
    
    if (done.length > 0) {
        html += `<div class="tasks-group" style="margin-top: 1.5rem;">
            <div class="tasks-group-header">
                <div class="tasks-group-title done">✅ TERMINÉES (${done.length})</div>
                <button class="btn-delete-all" onclick="deleteAllDoneTasks('${projectId}', '${category}')">
                    🗑️ Tout supprimer
                </button>
            </div>
            ${done.map(t => renderTaskItem({...t, projectId: projectId})).join('')}
        </div>`;
    }
    
    container.innerHTML = html;
}

// Supprimer toutes les tâches terminées d'une catégorie
function deleteAllDoneTasks(projectId, category) {
    if (!confirm(`Supprimer toutes les tâches terminées de la catégorie "${category}" ?`)) return;
    
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    
    project.tasks = project.tasks.filter(t => !(t.category === category && t.status === 'done'));
    
    saveProjectsAsync();
    refreshPageTasks();
    renderHomeTasksWidget();
}

// Fonction pour rafraîchir les tâches dans les pages ouvertes
function refreshPageTasks() {
    if (currentBudgetSpectacle) {
        renderCategoryTasks(currentBudgetSpectacle.id, 'Budget', 'budgetTasksList');
    }
    if (currentVisuelsSpectacle) {
        renderCategoryTasks(currentVisuelsSpectacle.id, 'Visuels', 'visuelsTasksList');
    }
    if (currentBilletterieSpectacle) {
        renderCategoryTasks(currentBilletterieSpectacle.id, 'Billetterie', 'billetterieTasksList');
    }
    if (currentSpectacleDetail) {
        renderSpectacleAllTasks(currentSpectacleDetail.id);
    }
    if (currentTournee) {
        renderTourneeAllTasks(currentTournee.id);
    }
}

