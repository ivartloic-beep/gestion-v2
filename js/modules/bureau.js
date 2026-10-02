// ========== MON BUREAU ==========

async function openMyBureauPage() {
    closeAllPages();
    const homeWelcome = document.getElementById('homeWelcome');
    if (homeWelcome) homeWelcome.style.display = 'none';
    document.getElementById('myBureauPage').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const bureauItem = document.querySelector('.nav-item[onclick="openMyBureauPage()"]');
    if (bureauItem) bureauItem.classList.add('active');
    await migrateOldBureauData();
    await loadMyBureauData();
    if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
    window.currentWsProjectId = null;
    window.currentWorkspaceVisibility = BUREAU_WORKSPACE_VISIBILITY;
    populateBureauDossierFilter();
    renderBureauUnifiedTasks();
    loadWorkspaceElements();
    if (typeof renderHomeWelcomeLogo === 'function') {
        renderHomeWelcomeLogo(document.getElementById('bureauModuleHeroLogo'), '📋');
    }
    closeSidebarOnMobile();
}

function closeMyBureauPage() {
    document.getElementById('myBureauPage').classList.remove('active');
    navigateTo('home');
}

function switchBureauTab(tab) {
    document.querySelectorAll('.bureau-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    else {
        const tabBtn = document.querySelector(`.bureau-tab[onclick*="switchBureauTab('${tab}')"]`);
        if (tabBtn) tabBtn.classList.add('active');
    }
    document.querySelectorAll('.bureau-section').forEach(s => s.classList.remove('active'));
    const sectionMap = { tasks: 'bureauTasksSection', workspace: 'bureauWorkspaceSection' };
    const sectionId = sectionMap[tab] || `bureau${tab.charAt(0).toUpperCase() + tab.slice(1)}Section`;
    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');
    if (tab === 'tasks') {
        if (typeof populateBureauDossierFilter === 'function') populateBureauDossierFilter();
        if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
    }
    if (tab === 'workspace') {
        ensureWorkspaceDragDropBound();
        loadWorkspaceElements();
    }
}

// Ouvre la fiche tâche unifiée pour une nouvelle tâche du Bureau
async function openBureauTaskModal(type) {
    if (type !== 'personal') return;
    if (typeof openNewPersonalTaskFiche === 'function') {
        await openNewPersonalTaskFiche();
        return;
    }
    document.getElementById('bureauPersonalTaskId').value = '';
    document.getElementById('bureauPersonalTaskForm').reset();
    document.getElementById('bureauPersonalTaskPriority').value = 'medium';
    document.getElementById('bureauPersonalTaskStatus').value = 'todo';
    document.getElementById('bureauPersonalTaskModalTitle').textContent = '✅ Nouvelle tâche personnelle';
    document.getElementById('bureauPersonalTaskSubmitBtn').textContent = '✓ Créer la tâche';
    const defaultAssignee = currentUser?.id ? String(currentUser.id) : null;
    await populateAssigneeSelect('bureauPersonalTaskAssignee', defaultAssignee);
    document.getElementById('bureauPersonalTaskModal').classList.add('active');
}
async function editBureauPersonalTask(task) {
    document.getElementById('bureauPersonalTaskId').value = task.id || '';
    document.getElementById('bureauPersonalTaskTitle').value = task.title || '';
    document.getElementById('bureauPersonalTaskDescription').value = task.description || '';
    document.getElementById('bureauPersonalTaskPriority').value = task.priority || 'medium';
    document.getElementById('bureauPersonalTaskDueDate').value = task.dueDate ? task.dueDate.split('T')[0] : '';
    document.getElementById('bureauPersonalTaskCategory').value = task.category || '';
    var st = normalizeBureauTaskStatus(task.status, task.completed);
    document.getElementById('bureauPersonalTaskStatus').value = st === 'inprogress' ? 'in_progress' : st;
    document.getElementById('bureauPersonalTaskModalTitle').textContent = '✏️ Modifier la tâche personnelle';
    document.getElementById('bureauPersonalTaskSubmitBtn').textContent = '✓ Enregistrer';
    await populateAssigneeSelect('bureauPersonalTaskAssignee', task.assignedTo ? String(task.assignedTo) : null);
    document.getElementById('bureauPersonalTaskModal').classList.add('active');
}
function closeBureauPersonalTaskModal() {
    document.getElementById('bureauPersonalTaskModal').classList.remove('active');
}
async function saveBureauPersonalTask(e) {
    e.preventDefault();
    const title = document.getElementById('bureauPersonalTaskTitle').value.trim();
    if (!title) return;
    const taskId = document.getElementById('bureauPersonalTaskId').value;
    const assigneeId = document.getElementById('bureauPersonalTaskAssignee').value || null;
    const payload = {
        title,
        description: document.getElementById('bureauPersonalTaskDescription').value.trim() || '',
        category: document.getElementById('bureauPersonalTaskCategory').value || '',
        priority: document.getElementById('bureauPersonalTaskPriority').value || 'medium',
        dueDate: document.getElementById('bureauPersonalTaskDueDate').value || null,
        assignedTo: assigneeId || null,
        status: document.getElementById('bureauPersonalTaskStatus').value || 'todo',
        completed: (document.getElementById('bureauPersonalTaskStatus').value || 'todo') === 'done'
    };
    try {
        if (taskId) {
            await apiCall('personal_tasks.php', 'PUT', { id: taskId, ...payload });
        } else {
            payload.id = 'pt_' + Date.now();
            await apiCall('personal_tasks.php', 'POST', payload);
            if (assigneeId) notifyUserAssigned(assigneeId, 'Tâche personnelle assignée', `Vous avez été assigné(e) à la tâche « ${title} ».`, 'assignment', { type: 'bureau_task' });
        }
        await loadMyBureauData();
        renderBureauUnifiedTasks();
        closeBureauPersonalTaskModal();
    } catch (err) {
        alert('Erreur : ' + (err.message || 'Impossible de sauvegarder la tâche'));
    }
}

async function migrateOldBureauData() {
    const migrated = localStorage.getItem('workspace_migrated_' + (currentUser?.id || 'default'));
    if (migrated) return;
    try {
        const oldData = localStorage.getItem('myBureau_' + (currentUser?.id || 'default'));
        if (oldData) {
            const parsed = JSON.parse(oldData);
            if (parsed.notes?.length) {
                for (const note of parsed.notes) {
                    await apiCall('workspace.php', 'POST', {
                        id: 'ws_mig_' + (note.id || Date.now()),
                        type: 'page',
                        title: note.title || 'Note importée',
                        content: JSON.stringify({ html: note.description || '' }),
                        visibility: 'personal'
                    });
                }
            }
            if (parsed.ideas?.length) {
                for (const idea of parsed.ideas) {
                    await apiCall('workspace.php', 'POST', {
                        id: 'ws_mig_' + (idea.id || Date.now()),
                        type: 'idea',
                        title: idea.title || 'Idée importée',
                        content: JSON.stringify({ html: idea.description || '' }),
                        visibility: 'personal',
                        status: idea.status || 'draft'
                    });
                }
            }
        }
        localStorage.setItem('workspace_migrated_' + (currentUser?.id || 'default'), '1');
        console.log('Migration workspace terminée');
    } catch(e) { console.error('Erreur migration workspace:', e); }
}

// Chargement/Sauvegarde données Bureau (tâches personnelles via API pour assignation)
function mapBureauPersonalTaskRow(t) {
    return {
        id: t.id,
        title: t.title,
        description: t.description || '',
        category: t.category || '',
        priority: t.priority || 'medium',
        dueDate: t.dueDate,
        assignedTo: t.assignedTo ? String(t.assignedTo) : null,
        completed: !!t.completed,
        status: normalizeBureauTaskStatus(t.status, t.completed),
        notes: t.notes || '',
        documents: t.documents || [],
        activities: t.activities || [],
        createdAt: t.createdAt,
        createdBy: t.createdBy
    };
}

function findBureauPersonalTaskById(taskId) {
    var id = String(taskId);
    var task = (myBureau.tasks || []).find(function(t) { return String(t.id) === id; });
    if (task) return task;
    return (myBureau.tasksAssignedByMe || []).find(function(t) { return String(t.id) === id; }) || null;
}
window.findBureauPersonalTaskById = findBureauPersonalTaskById;

async function loadMyBureauData() {
    try {
        const data = localStorage.getItem('myBureau_' + (currentUser?.id || 'default'));
        if (data) {
            const parsed = JSON.parse(data);
            myBureau.notes = parsed.notes || [];
            myBureau.ideas = parsed.ideas || [];
        }
    } catch(e) { console.error('Erreur chargement bureau:', e); }
    try {
        const res = await apiCall('personal_tasks.php', 'GET');
        if (res?.success && Array.isArray(res.tasks)) {
            myBureau.tasks = res.tasks.map(mapBureauPersonalTaskRow);
        } else {
            myBureau.tasks = myBureau.tasks || [];
        }
    } catch(e) {
        myBureau.tasks = myBureau.tasks || [];
    }
    try {
        const resAssigned = await apiCall('personal_tasks.php?scope=assigned_by_me', 'GET');
        if (resAssigned?.success && Array.isArray(resAssigned.tasks)) {
            myBureau.tasksAssignedByMe = resAssigned.tasks.map(mapBureauPersonalTaskRow);
        } else {
            myBureau.tasksAssignedByMe = [];
        }
    } catch(e) {
        myBureau.tasksAssignedByMe = [];
    }
}

function saveMyBureauData() {
    try {
        const toStore = { ...myBureau, tasks: [] };
        localStorage.setItem('myBureau_' + (currentUser?.id || 'default'), JSON.stringify(toStore));
    } catch(e) { console.error('Erreur sauvegarde bureau:', e); }
}

// ========== TÂCHES UNIFIÉES (personnelles + dossiers CRM) ==========

let bureauTasksViewMode = 'list';
let bureauTasksScope = 'for_me';
var _bureauKanbanDragPayload = null;

function getBureauTaskStatusLabelShort(status) {
    var s = normalizeBureauTaskStatus(status, status === 'done');
    if (s === 'done') return 'Terminée';
    if (s === 'in_progress') return 'En cours';
    return 'À faire';
}

function appendTaskStatusChangeActivity(task, fromStatus, toStatus) {
    if (!task) return;
    if (typeof ensureTaskFicheShape === 'function') ensureTaskFicheShape(task);
    else {
        if (!task.activities) task.activities = [];
    }
    var fromL = getBureauTaskStatusLabelShort(fromStatus);
    var toL = getBureauTaskStatusLabelShort(toStatus);
    if (fromL === toL) return;
    var authorName = '';
    if (currentUser) {
        authorName = ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim();
    }
    task.activities.unshift({
        id: 'tact_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: 'status_change',
        text: 'Statut : ' + fromL + ' → ' + toL,
        fromStatus: normalizeBureauTaskStatus(fromStatus, fromStatus === 'done'),
        toStatus: normalizeBureauTaskStatus(toStatus, toStatus === 'done'),
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString(),
        system: true
    });
    if (task.activities.length > 100) task.activities.length = 100;
}
window.appendTaskStatusChangeActivity = appendTaskStatusChangeActivity;

function bureauTaskMatchesSearch(task, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    var hay = [
        task.title,
        task.description,
        task.dossierName,
        task.category
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
}

function filterBureauUnifiedTasks(tasks) {
    const dossierFilter = document.getElementById('bureauUnifiedTaskDossier')?.value || 'all';
    const searchQuery = (document.getElementById('bureauTasksSearchInput')?.value || '').trim();
    const includeDoneInSearch = !!document.getElementById('bureauTasksSearchIncludeDone')?.checked;

    if (dossierFilter === 'personal') {
        tasks = tasks.filter(function(t) { return t.source === 'personal'; });
    } else if (dossierFilter !== 'all') {
        tasks = tasks.filter(function(t) { return t.projectId === dossierFilter; });
    }

    if (searchQuery) {
        tasks = tasks.filter(function(t) { return bureauTaskMatchesSearch(t, searchQuery); });
        if (!includeDoneInSearch) {
            tasks = tasks.filter(function(t) { return isBureauTaskActive(t); });
        }
        return tasks;
    }

    const statusFilter = document.getElementById('bureauUnifiedTaskStatus')?.value || 'active';
    if (statusFilter === 'active') {
        tasks = tasks.filter(function(t) { return isBureauTaskActive(t); });
    } else if (statusFilter === 'in_progress') {
        tasks = tasks.filter(function(t) {
            return normalizeBureauTaskStatus(t.status, t.completed) === 'in_progress';
        });
    } else if (statusFilter === 'done') {
        tasks = tasks.filter(function(t) { return !isBureauTaskActive(t); });
    }

    return tasks;
}

function normalizeBureauTaskStatus(status, completed) {
    if (completed || status === 'done') return 'done';
    if (status === 'in_progress' || status === 'inprogress') return 'in_progress';
    return 'todo';
}
window.normalizeBureauTaskStatus = normalizeBureauTaskStatus;

function isBureauTaskActive(task) {
    return normalizeBureauTaskStatus(task.status, task.completed) !== 'done';
}

function getBureauTaskStatusLabel(status) {
    var s = normalizeBureauTaskStatus(status, status === 'done');
    if (s === 'done') return '✅ Terminée';
    if (s === 'in_progress') return '🔄 En cours';
    return '⏳ À faire';
}

function extractBureauTaskAssigneeIds(task) {
    var raw = [];
    if (task) {
        if (task.assignedTo != null) raw = task.assignedTo;
        else if (task.assignees != null) raw = task.assignees;
        else if (task.assigneeId != null) raw = task.assigneeId;
        else if (task.assignee != null) raw = task.assignee;
    }
    if (!Array.isArray(raw)) raw = raw ? [raw] : [];
    return raw.map(function(x) {
        if (x == null) return null;
        var id = (typeof x === 'object' && x.id != null) ? x.id : x;
        return id != null ? String(id) : null;
    }).filter(Boolean);
}

/** Tâche du Bureau visible uniquement pour l'assigné (ou le créateur si non assignée). */
function isBureauTaskForCurrentUser(task, source) {
    if (!currentUser || !task) return false;
    if (typeof isTaskAssignedByMeToOthers === 'function' && isTaskAssignedByMeToOthers(task)) return false;
    var uid = String(currentUser.id);
    var assignees = extractBureauTaskAssigneeIds(task);
    if (assignees.length) return assignees.indexOf(uid) !== -1;
    if (source === 'personal') {
        if (task.createdBy != null) return String(task.createdBy) === uid;
        return true;
    }
    if (task.createdBy != null) return String(task.createdBy) === uid;
    return false;
}

/** Tâche créée par l'utilisateur courant et assignée à quelqu'un d'autre (suivi). */
function isBureauTaskAssignedByMe(task, source) {
    if (!currentUser || !task) return false;
    var uid = String(currentUser.id);
    if (task.createdBy == null || String(task.createdBy) !== uid) return false;
    var assignees = extractBureauTaskAssigneeIds(task);
    if (!assignees.length) return false;
    if (assignees.length === 1 && assignees[0] === uid) return false;
    return true;
}

function switchBureauTasksScope(scope) {
    bureauTasksScope = scope === 'assigned_by_me' ? 'assigned_by_me' : 'for_me';
    var forMeBtn = document.getElementById('bureauTasksScopeForMeBtn');
    var assignedBtn = document.getElementById('bureauTasksScopeAssignedBtn');
    if (forMeBtn) forMeBtn.classList.toggle('active', bureauTasksScope === 'for_me');
    if (assignedBtn) assignedBtn.classList.toggle('active', bureauTasksScope === 'assigned_by_me');
    var addTop = document.getElementById('bureauTasksAddBtn');
    var addBottom = document.getElementById('bureauTasksAddBtnBottom');
    var showAdd = bureauTasksScope === 'for_me';
    if (addTop) addTop.style.display = showAdd ? '' : 'none';
    if (addBottom) addBottom.style.display = showAdd ? '' : 'none';
    renderBureauUnifiedTasks();
}
window.switchBureauTasksScope = switchBureauTasksScope;

function onBureauTasksSearchInput() {
    renderBureauUnifiedTasks();
}
window.onBureauTasksSearchInput = onBureauTasksSearchInput;

function filterBureauUnifiedTasksByDossier(tasks) {
    const dossierFilter = document.getElementById('bureauUnifiedTaskDossier')?.value || 'all';
    if (dossierFilter === 'personal') {
        return tasks.filter(function(t) { return t.source === 'personal'; });
    }
    if (dossierFilter !== 'all') {
        return tasks.filter(function(t) { return t.projectId === dossierFilter; });
    }
    return tasks;
}

function switchBureauTasksView(mode) {
    bureauTasksViewMode = mode === 'kanban' ? 'kanban' : 'list';
    var listBtn = document.getElementById('bureauTasksViewListBtn');
    var kanbanBtn = document.getElementById('bureauTasksViewKanbanBtn');
    if (listBtn) listBtn.classList.toggle('active', bureauTasksViewMode === 'list');
    if (kanbanBtn) kanbanBtn.classList.toggle('active', bureauTasksViewMode === 'kanban');
    renderBureauUnifiedTasks();
}
window.switchBureauTasksView = switchBureauTasksView;

function collectBureauUnifiedTasks(scopeOverride) {
    const items = [];
    const scope = scopeOverride || bureauTasksScope;
    const assignedByMe = scope === 'assigned_by_me';
    const matchFn = assignedByMe ? isBureauTaskAssignedByMe : isBureauTaskForCurrentUser;
    const personalSource = assignedByMe ? (myBureau?.tasksAssignedByMe || []) : (myBureau?.tasks || []);

    function pushItem(task, meta) {
        var st = normalizeBureauTaskStatus(task.status, task.completed);
        var assignees = extractBureauTaskAssigneeIds(task);
        items.push({
            id: task.id,
            title: task.title || 'Sans titre',
            dueDate: task.dueDate || null,
            dossierName: meta.dossierName,
            dossierId: meta.dossierId,
            source: meta.source,
            projectId: meta.projectId,
            completed: st === 'done',
            status: st,
            sortKey: task.dueDate || '9999-12-31',
            assignedTo: assignees,
            createdBy: task.createdBy,
            completedBy: task.completedBy || null,
            completedAt: task.completedAt || null
        });
    }

    personalSource.forEach(function(t) {
        if (!matchFn(t, 'personal')) return;
        pushItem(t, {
            dossierName: null,
            dossierId: null,
            source: 'personal',
            projectId: 'bureau'
        });
    });

    var deals = [];
    if (typeof getCrmAccessibleDeals === 'function') {
        deals = getCrmAccessibleDeals();
    } else {
        var snap = typeof getCrmDataSnapshot === 'function' ? getCrmDataSnapshot() : (typeof crmData !== 'undefined' ? crmData : null);
        deals = snap && snap.deals ? snap.deals : [];
    }

    deals.forEach(function(deal) {
        if (!deal) return;
        if (typeof ensureDealShape === 'function') ensureDealShape(deal);
        var dealTitle = deal.title || 'Dossier';
        (deal.tasks || []).forEach(function(task) {
            if (!task) return;
            if (!matchFn(task, 'crm_deal')) return;
            pushItem(task, {
                dossierName: dealTitle,
                dossierId: deal.id,
                source: 'crm_deal',
                projectId: 'crm_' + deal.id
            });
        });
    });

    var workProjects = typeof getAccessibleWorkProjects === 'function' ? getAccessibleWorkProjects() : [];
    workProjects.forEach(function(wp) {
        if (!wp) return;
        var wpTitle = wp.title || 'Projet';
        (wp.tasks || []).forEach(function(task) {
            if (!task) return;
            if (!matchFn(task, 'work_project')) return;
            pushItem(task, {
                dossierName: wpTitle,
                dossierId: wp.id,
                source: 'work_project',
                projectId: wp.id
            });
        });
    });

    items.sort(function(a, b) {
        var aDone = a.completed ? 1 : 0;
        var bDone = b.completed ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return String(a.sortKey).localeCompare(String(b.sortKey));
    });

    return items;
}
window.collectBureauUnifiedTasks = collectBureauUnifiedTasks;

function populateBureauDossierFilter() {
    const select = document.getElementById('bureauUnifiedTaskDossier');
    if (!select) return;
    const current = select.value || 'all';
    select.innerHTML = '<option value="all">Tous les dossiers</option><option value="personal">🔒 Personnelles uniquement</option>';
    var deals = typeof getCrmAccessibleDeals === 'function' ? getCrmAccessibleDeals() : [];
    if (deals.length) {
        const group = document.createElement('optgroup');
        group.label = 'Dossiers CRM';
        deals.forEach(function(deal) {
            const option = document.createElement('option');
            option.value = 'crm_' + deal.id;
            option.textContent = '📂 ' + (deal.title || 'Dossier');
            group.appendChild(option);
        });
        select.appendChild(group);
    }
    var workProjects = typeof getAccessibleWorkProjects === 'function' ? getAccessibleWorkProjects() : [];
    if (workProjects.length) {
        const wpGroup = document.createElement('optgroup');
        wpGroup.label = 'Projets';
        workProjects.forEach(function(wp) {
            const option = document.createElement('option');
            option.value = wp.id;
            option.textContent = '📁 ' + (wp.title || 'Projet');
            wpGroup.appendChild(option);
        });
        select.appendChild(wpGroup);
    }
    if ([...select.options].some(function(o) { return o.value === current; })) {
        select.value = current;
    }
}

function bureauUnifiedToggleAttr(task, esc) {
    if (task.source === 'personal') return "toggleBureauUnifiedTask('personal','','" + esc(task.id) + "')";
    if (task.source === 'work_project') return "toggleBureauUnifiedTask('work_project','" + esc(task.projectId) + "','" + esc(task.id) + "')";
    return "toggleBureauUnifiedTask('crm_deal','" + esc(task.projectId) + "','" + esc(task.id) + "')";
}

function bureauUnifiedOpenAttr(task, esc) {
    if (task.source === 'personal') return "openBureauUnifiedTask('personal','','" + esc(task.id) + "')";
    if (task.source === 'work_project') return "openBureauUnifiedTask('work_project','" + esc(task.projectId) + "','" + esc(task.id) + "')";
    return "openBureauUnifiedTask('crm_deal','" + esc(task.projectId) + "','" + esc(task.id) + "')";
}

function bureauUnifiedDossierIcon(source) {
    if (source === 'work_project') return '📁 ';
    if (source === 'crm_deal') return '📂 ';
    return '';
}

function formatBureauUnifiedDueDate(dueDate) {
    if (!dueDate) return '<span class="bureau-unified-task-due">Sans échéance</span>';
    var label = typeof formatTaskDate === 'function'
        ? formatTaskDate(dueDate)
        : new Date(dueDate).toLocaleDateString('fr-FR');
    var due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var overdue = due < today;
    return '<span class="bureau-unified-task-due' + (overdue ? ' overdue' : '') + '">📅 ' + escapeHtml(label) + '</span>';
}

function renderBureauUnifiedTasksListHtml(tasks, options) {
    options = options || {};
    const esc = function(s) {
        return (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    };
    const hideDelete = !!options.hideDelete;
    const readOnly = !!options.readOnly;
    const showAssignees = !!options.showAssignees;
    const rowClass = options.compact ? ' bureau-unified-task-row--compact' : '';

    return tasks.map(function(task) {
        const st = normalizeBureauTaskStatus(task.status, task.completed);
        const isDone = st === 'done';
        const isInProgress = st === 'in_progress';
        const dossierHtml = task.dossierName
            ? '<span class="bureau-unified-task-dossier">' + bureauUnifiedDossierIcon(task.source) + escapeHtml(task.dossierName) + '</span>'
            : '';
        const statusBadge = isInProgress
            ? '<span class="bureau-unified-status-badge status-in-progress">🔄 En cours</span>'
            : (isDone ? '' : '<span class="bureau-unified-status-badge status-todo">⏳ À faire</span>');
        const assigneeHtml = showAssignees && typeof renderAssigneeBadges === 'function'
            ? '<span class="bureau-unified-task-assignees">' + renderAssigneeBadges(task.assignedTo || []) + '</span>'
            : '';
        let completedInfo = '';
        if (showAssignees && isDone && task.completedBy) {
            const completedByUser = typeof getUserById === 'function' ? getUserById(task.completedBy) : null;
            const completedByName = completedByUser
                ? ((completedByUser.prenom || '') + ' ' + (completedByUser.nom || completedByUser.username)).trim()
                : 'Inconnu';
            const completedDate = task.completedAt ? new Date(task.completedAt).toLocaleDateString('fr-FR') : '';
            completedInfo = '<div class="bureau-unified-completed-by">✅ Terminée par ' + escapeHtml(completedByName) +
                (completedDate ? ' le ' + escapeHtml(completedDate) : '') + '</div>';
        }
        const toggleAttr = bureauUnifiedToggleAttr(task, esc);
        const openAttr = bureauUnifiedOpenAttr(task, esc);
        const deleteBtn = (!hideDelete && !readOnly && task.source === 'personal')
            ? '<button type="button" onclick="event.stopPropagation();deleteBureauTask(\'' + esc(task.id) + '\')" style="border:none;background:none;cursor:pointer;font-size:1rem;opacity:0.5;" title="Supprimer">🗑️</button>'
            : '';
        const rowStatusClass = isDone ? ' status-done' : (isInProgress ? ' status-in-progress' : '');
        const checkboxHtml = readOnly
            ? '<div class="bureau-task-checkbox bureau-task-checkbox--readonly" aria-hidden="true">' +
                (isDone ? '✅' : (isInProgress ? '🔄' : '⏳')) + '</div>'
            : '<input type="checkbox" class="bureau-task-checkbox"' + (isDone ? ' checked' : '') +
                ' onchange="event.stopPropagation();' + toggleAttr + '">';
        return '<div class="bureau-task-item bureau-unified-task-row' + rowClass + rowStatusClass + (readOnly ? ' bureau-unified-task-row--readonly' : '') + '">' +
            checkboxHtml +
            '<div class="bureau-task-content" onclick="event.stopPropagation();' + openAttr + '" style="cursor:pointer;flex:1;">' +
            '<div class="bureau-task-title">' + escapeHtml(task.title) + '</div>' +
            '<div class="bureau-task-meta">' + statusBadge + formatBureauUnifiedDueDate(task.dueDate) + dossierHtml + assigneeHtml + '</div>' +
            completedInfo +
            '</div>' + deleteBtn + '</div>';
    }).join('');
}
window.renderBureauUnifiedTasksListHtml = renderBureauUnifiedTasksListHtml;

function renderBureauKanbanCard(task, options) {
    options = options || {};
    const readOnly = !!options.readOnly;
    const showAssignees = !!options.showAssignees;
    const esc = function(s) {
        return (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    };
    const st = normalizeBureauTaskStatus(task.status, task.completed);
    const openAttr = bureauUnifiedOpenAttr(task, esc);
    let dueBadge = '';
    if (task.dueDate) {
        var label = typeof formatTaskDate === 'function'
            ? formatTaskDate(task.dueDate)
            : new Date(task.dueDate).toLocaleDateString('fr-FR');
        dueBadge = '<span class="kanban-card-badge">📅 ' + escapeHtml(label) + '</span>';
    }
    const dossierBadge = task.dossierName
        ? '<span class="kanban-card-badge">' + bureauUnifiedDossierIcon(task.source) + escapeHtml(task.dossierName) + '</span>'
        : '';
    const sourceBadge = task.source === 'personal'
        ? '<span class="kanban-card-badge">🔒 Perso</span>'
        : (task.source === 'work_project' ? '<span class="kanban-card-badge">📁 Projet</span>' : '');
    const assigneeBadge = showAssignees && typeof renderAssigneeBadges === 'function'
        ? '<span class="kanban-card-badge bureau-kanban-assignees">' + renderAssigneeBadges(task.assignedTo || []) + '</span>'
        : '';
    const doneBtn = (!readOnly && st !== 'done')
        ? '<button type="button" class="kanban-card-done-btn" title="Terminer" onclick="event.stopPropagation();markBureauKanbanTaskDone(\'' +
            esc(task.source) + '\',\'' + esc(task.projectId || '') + '\',\'' + esc(task.id) + '\')">✓</button>'
        : '';
    const dragAttrs = readOnly
        ? ''
        : ' draggable="true"' +
            ' data-source="' + esc(task.source) + '"' +
            ' data-project-id="' + esc(task.projectId || '') + '"' +
            ' data-task-id="' + esc(task.id) + '"' +
            ' data-status="' + esc(st) + '"' +
            ' ondragstart="handleBureauKanbanDragStart(event)"' +
            ' ondragend="handleBureauKanbanDragEnd(event)"' +
            ' ondragenter="handleBureauKanbanDragOver(event)"' +
            ' ondragover="handleBureauKanbanDragOver(event)"' +
            ' ondragleave="handleBureauKanbanDragLeave(event)"';

    return '<div class="kanban-card bureau-kanban-card' + (readOnly ? ' bureau-kanban-card--readonly' : '') + '"' + dragAttrs +
        ' onclick="event.stopPropagation();' + openAttr + '">' +
        doneBtn +
        '<div class="kanban-card-title">' + escapeHtml(task.title) + '</div>' +
        '<div class="kanban-card-meta">' + sourceBadge + dossierBadge + dueBadge + assigneeBadge + '</div>' +
        '</div>';
}

function splitBureauKanbanTasks(tasks) {
    const grouped = { todo: [], in_progress: [], done: [] };
    tasks.forEach(function(task) {
        const st = normalizeBureauTaskStatus(task.status, task.completed);
        if (grouped[st]) grouped[st].push(task);
    });

    const statusFilter = document.getElementById('bureauUnifiedTaskStatus')?.value || 'active';
    if (statusFilter === 'active') {
        return {
            todo: grouped.todo,
            in_progress: grouped.in_progress,
            done: grouped.done
        };
    }
    if (statusFilter === 'in_progress') {
        return { todo: [], in_progress: grouped.in_progress, done: grouped.done };
    }
    if (statusFilter === 'done') {
        return { todo: [], in_progress: [], done: grouped.done };
    }
    return grouped;
}

function renderBureauKanbanMainColumn(col, colTasks, options) {
    options = options || {};
    return '<div class="kanban-column ' + col.class + '" data-status="' + col.dropStatus + '">' +
        '<div class="kanban-column-header">' +
        '<span>' + col.label + '</span>' +
        '<span class="kanban-column-count">' + colTasks.length + '</span>' +
        '</div>' +
        '<div class="kanban-cards kanban-drop-zone" data-bureau-kanban-status="' + col.dropStatus + '"' +
        (options.readOnly ? '' :
            ' ondragenter="handleBureauKanbanDragOver(event)"' +
            ' ondrop="handleBureauKanbanDrop(event, \'' + col.dropStatus + '\')"' +
            ' ondragover="handleBureauKanbanDragOver(event)" ondragleave="handleBureauKanbanDragLeave(event)"') +
        '>' +
        colTasks.map(function(t) { return renderBureauKanbanCard(t, options); }).join('') +
        '</div></div>';
}

function renderBureauUnifiedKanban(tasks, container, options) {
    options = options || {};
    if (!container) return;

    const grouped = splitBureauKanbanTasks(tasks);
    const doneCount = grouped.done.length;
    const readOnly = !!options.readOnly;

    const mainCols = [
        { key: 'todo', label: '⏳ À faire', class: 'kanban-column-todo', dropStatus: 'todo' },
        { key: 'in_progress', label: '🔄 En cours', class: 'kanban-column-inprogress', dropStatus: 'inprogress' }
    ];

    container.innerHTML =
        '<div class="bureau-kanban-board' + (readOnly ? ' bureau-kanban-board--readonly' : '') + '">' +
        '<div class="bureau-kanban-main">' +
        mainCols.map(function(col) {
            return renderBureauKanbanMainColumn(col, grouped[col.key] || [], options);
        }).join('') +
        '</div>' +
        '<div class="bureau-kanban-done-rail collapsed">' +
        '<div class="bureau-kanban-done-header" onclick="openBureauDoneTasksPage()" role="button" tabindex="0"' +
        ' title="Voir toutes les tâches terminées (' + doneCount + ')"' +
        ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openBureauDoneTasksPage();}">' +
        '<span class="bureau-kanban-done-toggle-icon" aria-hidden="true">✅</span>' +
        '<span class="bureau-kanban-done-toggle-label">Terminé</span>' +
        '<span class="bureau-kanban-done-toggle-count">' + doneCount + '</span>' +
        '</div>' +
        '<div class="bureau-kanban-done-drop-zone kanban-drop-zone bureau-kanban-drop-zone"' +
        ' data-bureau-kanban-status="done"' +
        (readOnly ? '' :
            ' ondragenter="handleBureauKanbanDragOver(event)"' +
            ' ondragover="handleBureauKanbanDragOver(event)"' +
            ' ondragleave="handleBureauKanbanDragLeave(event)"' +
            ' ondrop="handleBureauKanbanDrop(event, \'done\')"') +
        '>' +
        '<span class="bureau-kanban-done-hint">↓ Glisser ici</span>' +
        '</div></div></div>';
}

async function openBureauDoneTasksPage() {
    if (typeof loadMyBureauData === 'function') await loadMyBureauData();
    if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
    if (typeof closeAllPages === 'function') closeAllPages();
    document.getElementById('homeWelcome').style.display = 'none';
    const page = document.getElementById('bureauDoneTasksPage');
    if (!page) return;
    page.classList.add('active');
    renderBureauDoneTasksPage();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
window.openBureauDoneTasksPage = openBureauDoneTasksPage;

async function closeBureauDoneTasksPage() {
    document.getElementById('bureauDoneTasksPage')?.classList.remove('active');
    if (typeof openMyBureauPage === 'function') await openMyBureauPage();
}
window.closeBureauDoneTasksPage = closeBureauDoneTasksPage;

function renderBureauDoneTasksPage() {
    const list = document.getElementById('bureauDoneTasksList');
    const countEl = document.getElementById('bureauDoneTasksCount');
    if (!list) return;

    const searchQuery = (document.getElementById('bureauDoneTasksSearchInput')?.value || '').trim();
    let tasks = filterBureauUnifiedTasksByDossier(collectBureauUnifiedTasks())
        .filter(function(t) { return !isBureauTaskActive(t); });

    if (searchQuery) {
        tasks = tasks.filter(function(t) { return bureauTaskMatchesSearch(t, searchQuery); });
    }

    tasks.sort(function(a, b) {
        var da = a.dueDate || a.sortKey || '';
        var db = b.dueDate || b.sortKey || '';
        return String(db).localeCompare(String(da));
    });

    if (countEl) countEl.textContent = tasks.length;

    if (!tasks.length) {
        list.innerHTML = '<div class="bureau-empty">Aucune tâche terminée.</div>';
        return;
    }

    list.innerHTML = renderBureauUnifiedTasksListHtml(tasks, { hideDelete: true });
}
window.renderBureauDoneTasksPage = renderBureauDoneTasksPage;

function onBureauDoneTasksSearchInput() {
    renderBureauDoneTasksPage();
}
window.onBureauDoneTasksSearchInput = onBureauDoneTasksSearchInput;

async function markBureauKanbanTaskDone(source, projectId, taskId) {
    await setBureauUnifiedTaskStatus(source, projectId, taskId, 'done');
    if (typeof renderHomeTasksList === 'function') renderHomeTasksList();
}
window.markBureauKanbanTaskDone = markBureauKanbanTaskDone;

function handleBureauKanbanDragStart(e) {
    const card = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    _bureauKanbanDragPayload = {
        source: card.dataset.source,
        projectId: card.dataset.projectId || '',
        taskId: card.dataset.taskId
    };
    try {
        e.dataTransfer.setData('text/plain', JSON.stringify(_bureauKanbanDragPayload));
    } catch (err) { /* Safari */ }
    card.classList.add('dragging');
}

function handleBureauKanbanDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    _bureauKanbanDragPayload = null;
    document.querySelectorAll('#bureauUnifiedTasksKanban .kanban-drop-zone, #bureauUnifiedTasksKanban .bureau-kanban-done-drop-zone').forEach(function(zone) {
        zone.classList.remove('drag-over');
    });
}

async function handleBureauKanbanDrop(e, columnStatus) {
    e.preventDefault();
    e.stopPropagation();
    var zone = e.currentTarget;
    zone.classList.remove('drag-over');
    try {
        var data = _bureauKanbanDragPayload;
        if (!data) {
            data = JSON.parse(e.dataTransfer.getData('text/plain'));
        }
        if (!data || !data.taskId) return;
        var newStatus = columnStatus === 'inprogress' ? 'in_progress' : columnStatus;
        await setBureauUnifiedTaskStatus(data.source, data.projectId, data.taskId, newStatus);
    } catch (err) {
        console.error('handleBureauKanbanDrop:', err);
    } finally {
        _bureauKanbanDragPayload = null;
    }
}

function handleBureauKanbanDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    var zone = e.currentTarget.classList.contains('bureau-kanban-done-rail') || e.currentTarget.classList.contains('bureau-kanban-done-drop-zone')
        ? e.currentTarget
        : e.currentTarget.closest('.kanban-drop-zone, .bureau-kanban-done-drop-zone');
    if (zone) zone.classList.add('drag-over');
}

function handleBureauKanbanDragLeave(e) {
    var zone = e.currentTarget;
    if (zone.contains(e.relatedTarget)) return;
    zone.classList.remove('drag-over');
}

async function setBureauUnifiedTaskStatus(source, projectId, taskId, newStatus) {
    const normalized = normalizeBureauTaskStatus(newStatus, newStatus === 'done');

    if (source === 'personal') {
        const task = findBureauPersonalTaskById(taskId);
        if (!task) return;
        const prev = normalizeBureauTaskStatus(task.status, task.completed);
        if (prev === normalized) return;
        appendTaskStatusChangeActivity(task, prev, normalized);
        await apiCall('personal_tasks.php', 'PUT', {
            id: taskId,
            status: normalized,
            completed: normalized === 'done',
            activities: task.activities || []
        });
        task.status = normalized;
        task.completed = normalized === 'done';
    } else if (source === 'crm_deal') {
        if (typeof findCrmDealTask !== 'function' || typeof saveCrmData !== 'function') return;
        const dealId = projectId && String(projectId).indexOf('crm_') === 0
            ? String(projectId).slice(4) : projectId;
        const found = findCrmDealTask(dealId, taskId);
        if (!found || !found.task) return;
        const prev = normalizeBureauTaskStatus(found.task.status, found.task.completed);
        if (prev === normalized) return;
        appendTaskStatusChangeActivity(found.task, prev, normalized);
        found.task.status = normalized;
        found.task.completed = normalized === 'done';
        found.task.updatedAt = new Date().toISOString();
        found.deal.updatedAt = new Date().toISOString();
        await saveCrmData();
        if (typeof crmV2DealId !== 'undefined' && crmV2DealId === dealId && typeof renderCrmDealTasks === 'function') {
            renderCrmDealTasks(found.deal);
        }
    } else if (source === 'work_project') {
        if (typeof findWorkProjectTask !== 'function') return;
        const found = findWorkProjectTask(projectId, taskId);
        if (!found || !found.task) return;
        const prev = normalizeBureauTaskStatus(found.task.status, found.task.completed);
        if (prev === normalized) return;
        appendTaskStatusChangeActivity(found.task, prev, normalized);
        found.task.status = normalized;
        found.task.completed = normalized === 'done';
        found.task.updatedAt = new Date().toISOString();
        found.project.updatedAt = new Date().toISOString();
        if (typeof saveWorkProjectsData === 'function') await saveWorkProjectsData();
        if (typeof loadAllTasks === 'function') loadAllTasks();
    }

    renderBureauUnifiedTasks();
    if (document.getElementById('bureauDoneTasksPage')?.classList.contains('active')) {
        renderBureauDoneTasksPage();
    }
    if (typeof renderHomeTasksList === 'function') renderHomeTasksList();
    else if (typeof renderHomeTasksWidget === 'function') renderHomeTasksWidget();
}
window.handleBureauKanbanDragStart = handleBureauKanbanDragStart;
window.handleBureauKanbanDragEnd = handleBureauKanbanDragEnd;
window.handleBureauKanbanDragOver = handleBureauKanbanDragOver;
window.handleBureauKanbanDragLeave = handleBureauKanbanDragLeave;
window.handleBureauKanbanDrop = handleBureauKanbanDrop;
window.setBureauUnifiedTaskStatus = setBureauUnifiedTaskStatus;

function renderBureauUnifiedTasks() {
    const list = document.getElementById('bureauUnifiedTasksList');
    const kanban = document.getElementById('bureauUnifiedTasksKanban');
    const isKanban = bureauTasksViewMode === 'kanban';
    const isAssignedScope = bureauTasksScope === 'assigned_by_me';
    const listOptions = {
        readOnly: isAssignedScope,
        showAssignees: isAssignedScope,
        hideDelete: isAssignedScope
    };
    const kanbanOptions = {
        readOnly: isAssignedScope,
        showAssignees: isAssignedScope
    };
    const allTasks = collectBureauUnifiedTasks();
    const dossierFiltered = filterBureauUnifiedTasksByDossier(allTasks);
    const hasSearch = !!(document.getElementById('bureauTasksSearchInput')?.value || '').trim();
    const tasks = filterBureauUnifiedTasks(dossierFiltered);
    const kanbanSource = hasSearch ? tasks : dossierFiltered;

    if (list) {
        list.style.display = isKanban ? 'none' : '';
        list.setAttribute('aria-hidden', isKanban ? 'true' : 'false');
    }
    if (kanban) {
        kanban.style.display = isKanban ? '' : 'none';
        kanban.setAttribute('aria-hidden', isKanban ? 'false' : 'true');
        kanban.classList.toggle('active', isKanban);
    }

    if (isKanban) {
        renderBureauUnifiedKanban(kanbanSource, kanban, kanbanOptions);
        return;
    }

    if (!list) return;

    if (!tasks.length) {
        list.innerHTML = isAssignedScope
            ? '<div class="bureau-empty">Aucune tâche assignée à d\'autres personnes. Assignez une tâche depuis un dossier CRM, un projet ou une tâche personnelle.</div>'
            : '<div class="bureau-empty">Aucune tâche. Créez une tâche personnelle, dans un projet ou un dossier CRM.</div>';
        return;
    }

    list.innerHTML = renderBureauUnifiedTasksListHtml(tasks, listOptions);
}
window.renderBureauUnifiedTasks = renderBureauUnifiedTasks;

async function toggleBureauUnifiedTask(source, projectId, taskId) {
    if (source === 'personal') {
        await toggleBureauTask(taskId);
        return;
    }
    if (source === 'work_project') {
        const found = typeof findWorkProjectTask === 'function' ? findWorkProjectTask(projectId, taskId) : null;
        if (!found || !found.task) return;
        const current = normalizeBureauTaskStatus(found.task.status, found.task.completed);
        const newStatus = current === 'done' ? 'todo' : 'done';
        await setBureauUnifiedTaskStatus(source, projectId, taskId, newStatus);
        return;
    }
    if (source === 'crm_deal' && typeof toggleCrmDealTaskFromBureau === 'function') {
        await toggleCrmDealTaskFromBureau(projectId, taskId);
        renderBureauUnifiedTasks();
        if (typeof renderHomeTasksWidget === 'function') renderHomeTasksWidget();
    }
}

function openBureauUnifiedTask(source, projectId, taskId) {
    if (source === 'work_project' && typeof openTaskFiche === 'function') {
        openTaskFiche('work_project', projectId, taskId);
        return;
    }
    if (typeof openTaskFiche === 'function' && source !== 'work_project') {
        openTaskFiche(source, projectId, taskId);
        return;
    }
    if (source === 'personal') {
        openBureauTaskDetailModalById(taskId);
        return;
    }
    if (source === 'crm_deal' && typeof openCrmDealFromTask === 'function') {
        openCrmDealFromTask(projectId);
    }
}

function renderMyBureauTasks() { renderBureauUnifiedTasks(); }
function renderBureauProjectTasks() { renderBureauUnifiedTasks(); }
function populateBureauProjectFilter() { populateBureauDossierFilter(); }
function setBureauTaskView() { renderBureauUnifiedTasks(); }

function addBureauTask(type) {
    openBureauTaskModal(type);
}

async function toggleBureauTask(id) {
    const task = findBureauPersonalTaskById(id);
    if (!task) return;
    const current = normalizeBureauTaskStatus(task.status, task.completed);
    const newStatus = current === 'done' ? 'todo' : 'done';
    await setBureauUnifiedTaskStatus('personal', 'bureau', id, newStatus);
}

async function deleteBureauTask(id) {
    if (!confirm('Supprimer cette tâche ?')) return;
    try {
        await apiCall('personal_tasks.php', 'DELETE', { id });
        myBureau.tasks = myBureau.tasks.filter(t => t.id !== id);
        renderBureauUnifiedTasks();
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de supprimer'));
    }
}

function toggleProjectTaskFromBureau(projectId, taskId) {
    if (projectId && String(projectId).startsWith('crm_')) {
        if (typeof toggleCrmDealTaskFromBureau === 'function' && toggleCrmDealTaskFromBureau(projectId, taskId)) {
            renderBureauProjectTasks();
            showToast('Tâche mise à jour', 'success');
        }
        return;
    }
    if (typeof isWorkProjectId === 'function' && isWorkProjectId(projectId)) {
        toggleWorkProjectTaskFromBureau(projectId, taskId);
        return;
    }
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.tasks) return;
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    if (task.status === 'done' || task.completed) {
        task.status = 'todo';
        task.completed = false;
    } else {
        task.status = 'done';
        task.completed = true;
        task.completedAt = new Date().toISOString();
    }
    
    saveProjectsAsync();
    renderBureauProjectTasks();
    showToast(task.status === 'done' ? '✅ Tâche terminée' : '↩️ Tâche réouverte', 'success');
}

// ========== ESPACE DE TRAVAIL PERSONNEL (WORKSPACE) ==========
const BUREAU_WORKSPACE_VISIBILITY = 'personal';

function getWorkspaceSaveVisibility() {
    if (window.currentWsProjectId) {
        return window.currentWorkspaceVisibility || 'team';
    }
    if (window.currentWsAccessRole && window.currentWsAccessRole !== 'owner') {
        return window.currentWorkspaceVisibility || 'shared';
    }
    return BUREAU_WORKSPACE_VISIBILITY;
}

function applyWorkspaceElementContext(el) {
    window.currentWsProjectId = el.project_id || null;
    window.currentWorkspaceVisibility = el.project_id
        ? (el.visibility || 'team')
        : (el.visibility || BUREAU_WORKSPACE_VISIBILITY);
}

function canDragWsBureauElement(el) {
    if (!el || el.type === 'folder') return false;
    if (el.is_shared_with_me && el.access_role === 'viewer') return false;
    return true;
}

var _wsBureauDragElementId = null;
var _wsBureauDropHandled = false;

function ensureWorkspaceDragDropBound() {
    if (window._wsBureauDnDBound) return;
    var root = document.getElementById('bureauWorkspaceSection');
    if (!root) return;
    window._wsBureauDnDBound = true;

    root.addEventListener('dragstart', function(e) {
        var card = e.target.closest('[data-ws-element-id]');
        if (!card || card.getAttribute('draggable') !== 'true') return;
        _wsBureauDragElementId = card.getAttribute('data-ws-element-id');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'ws_bureau', elementId: _wsBureauDragElementId }));
        card.classList.add('ws-dragging');
    });

    root.addEventListener('dragend', function(e) {
        var card = e.target.closest('[data-ws-element-id]');
        if (card) card.classList.remove('ws-dragging');
        _wsBureauDragElementId = null;
        root.querySelectorAll('.ws-drop-zone').forEach(function(z) { z.classList.remove('drag-over'); });
    });

    root.addEventListener('dragover', function(e) {
        var zone = e.target.closest('[data-ws-folder-drop]');
        if (!zone) return;
        e.preventDefault();
        e.stopPropagation();
        var types = e.dataTransfer ? Array.from(e.dataTransfer.types) : [];
        e.dataTransfer.dropEffect = types.indexOf('Files') !== -1 ? 'copy' : 'move';
        zone.classList.add('drag-over');
    });

    root.addEventListener('dragleave', function(e) {
        var zone = e.target.closest('[data-ws-folder-drop]');
        if (!zone) return;
        var rel = e.relatedTarget;
        if (rel && zone.contains(rel)) return;
        zone.classList.remove('drag-over');
    });

    root.addEventListener('drop', function(e) {
        var zone = e.target.closest('[data-ws-folder-drop]');
        if (!zone) return;
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
        _wsBureauDropHandled = true;
        setTimeout(function() { _wsBureauDropHandled = false; }, 150);
        var rawTarget = zone.getAttribute('data-ws-folder-drop');
        var folderId = null;
        if (rawTarget === '__root__') folderId = null;
        else if (rawTarget === '__current__') folderId = window.currentWsFolderId || null;
        else if (rawTarget) folderId = rawTarget;
        handleWsFolderDropEvent(e, folderId);
    });
}

async function handleWsFolderDropEvent(e, targetFolderId) {
    var folderId = targetFolderId || null;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        await uploadWsFilesToFolder(e.dataTransfer.files, folderId);
        return;
    }
    var raw = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    if (!raw && _wsBureauDragElementId) {
        raw = JSON.stringify({ source: 'ws_bureau', elementId: _wsBureauDragElementId });
    }
    if (!raw) return;
    try {
        var data = JSON.parse(raw);
        if (data.source !== 'ws_bureau' || !data.elementId) return;
        if (data.elementId === folderId) return;
        await moveWsElementToFolder(data.elementId, folderId);
    } catch (err) {
        console.error('handleWsFolderDropEvent:', err);
    }
}

async function moveWsElementToFolder(elementId, folderId) {
    var el = (window.workspaceElements || []).find(function(e) { return String(e.id) === String(elementId); });
    if (!el || el.type === 'folder') return;
    if (el.is_shared_with_me && el.access_role === 'viewer') return;
    var target = folderId || null;
    if ((el.folder_id || null) === target) return;
    if (target && el.type === 'folder' && String(target) === String(elementId)) return;
    try {
        await apiCall('workspace.php', 'PUT', { id: elementId, folder_id: target });
        showToast('✅ Élément déplacé', 'success');
        await loadWorkspaceElements();
    } catch (e) {
        showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function uploadWsFilesToFolder(files, folderId) {
    if (!files || !files.length) return;
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var formData = new FormData();
        formData.append('file', file);
        formData.append('visibility', BUREAU_WORKSPACE_VISIBILITY);
        if (folderId) formData.append('folder_id', folderId);
        formData.append('token', authToken);
        try {
            var response = await fetch(API_URL + '/workspace_upload.php', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + authToken },
                body: formData
            });
            var res = await response.json();
            if (res.success) showToast('✅ ' + file.name + ' importé', 'success');
            else showToast('❌ Erreur pour ' + file.name, 'error');
        } catch (e) {
            showToast('❌ Erreur upload: ' + e.message, 'error');
        }
    }
    await loadWorkspaceElements();
}

async function loadWorkspaceElements() {
    ensureWorkspaceDragDropBound();
    window.currentWorkspaceVisibility = BUREAU_WORKSPACE_VISIBILITY;
    try {
        const [personalRes, sharedRes] = await Promise.all([
            apiCall('workspace.php?visibility=' + BUREAU_WORKSPACE_VISIBILITY, 'GET'),
            apiCall('workspace.php?visibility=shared', 'GET').catch(function() { return { success: true, elements: [] }; })
        ]);
        const personal = (personalRes?.success && Array.isArray(personalRes.elements)) ? personalRes.elements : [];
        const shared = (sharedRes?.success && Array.isArray(sharedRes.elements))
            ? sharedRes.elements.filter(function(el) {
                return el.is_shared_with_me && el.access_role === 'editor';
            })
            : [];
        window.workspaceElements = personal.concat(shared);
    } catch(e) {
        console.error('Erreur chargement workspace:', e);
        window.workspaceElements = [];
    }
    renderWorkspaceElements();
}
function renderWorkspaceElements() {
    const grid = document.getElementById('workspaceElementsGrid');
    if (!grid) return;
    const search = (document.getElementById('workspaceSearchInput')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('workspaceTypeFilter')?.value || 'all';
    const breadcrumb = document.getElementById('workspaceBreadcrumb');
    const breadcrumbTrail = document.getElementById('workspaceBreadcrumbTrail');
    if (breadcrumb && breadcrumbTrail) {
        if (window.currentWsFolderId) {
            breadcrumb.style.display = 'flex';
            const folder = window.workspaceElements.find(el => el.id === window.currentWsFolderId);
            breadcrumbTrail.innerHTML =
                `<span style="color: var(--mn-text-light);">›</span> <span style="font-weight: 600; color: var(--mn-text);">📁 ${(folder?.title || 'Dossier').replace(/</g,'&lt;')}</span>` +
                `<span class="ws-root-drop ws-drop-zone" data-ws-folder-drop="__root__">Glisser ici pour sortir du dossier</span>`;
        } else {
            breadcrumb.style.display = 'none';
            breadcrumbTrail.innerHTML = '';
        }
    }
    let filtered = window.workspaceElements.filter(el => {
        if (window.currentWsFolderId) {
            if (el.folder_id !== window.currentWsFolderId) return false;
        } else {
            if (el.folder_id) return false;
        }
        if (typeFilter !== 'all' && el.type !== typeFilter && el.type !== 'folder') return false;
        if (search && !(el.title || '').toLowerCase().includes(search)) return false;
        return true;
    });
    const folders = filtered.filter(el => el.type === 'folder');
    const elements = filtered.filter(el => el.type !== 'folder');
    if (folders.length === 0 && elements.length === 0) {
        grid.innerHTML = `<div class="workspace-empty ws-drop-zone" data-ws-folder-drop="__current__"><div class="workspace-empty-icon">${window.currentWsFolderId ? '📁' : '🗂️'}</div><div class="workspace-empty-text">${search || typeFilter !== 'all' ? 'Aucun résultat' : window.currentWsFolderId ? 'Dossier vide' : 'Espace vide'}</div><div class="workspace-empty-hint">${search || typeFilter !== 'all' ? "Essayez d'autres filtres" : 'Cliquez sur "+ Nouveau" ou glissez des fichiers ici'}</div></div>`;
        return;
    }
    const typeIcons = { page: '📝', idea: '💡', mindmap: '🧠', drawing: '🎨', file: '📎', quicknote: '📋' };
    const typeLabels = { page: 'Page', idea: 'Idée', mindmap: 'Carte mentale', drawing: 'Dessin', file: 'Fichier', quicknote: 'Note rapide' };
    const statusLabels = { draft: '💭 Brouillon', exploring: '🔍 En exploration', validated: '✅ Validée', rejected: '❌ Rejetée' };
    let html = '';
    html += folders.map(folder => {
        const childCount = window.workspaceElements.filter(el => el.folder_id === folder.id && el.type !== 'folder').length;
        const fid = String(folder.id).replace(/'/g, "\\'");
        return `<div class="workspace-card workspace-folder ws-drop-zone" data-ws-folder-drop="${fid}" onclick="navigateToWsFolder('${fid}')"><div class="workspace-card-actions"><button onclick="event.stopPropagation(); renameWsFolder('${fid}')" title="Renommer">✏️</button><button onclick="event.stopPropagation(); deleteWorkspaceElement('${fid}')" title="Supprimer">🗑️</button></div><div class="workspace-card-icon">📁</div><div class="workspace-card-title">${(folder.title || 'Sans titre').replace(/</g,'&lt;')}</div><div class="workspace-folder-count"><span>${childCount} élément${childCount !== 1 ? 's' : ''}</span></div><div class="workspace-card-meta">${new Date(folder.updated_at || folder.created_at).toLocaleDateString('fr-FR')}</div></div>`;
    }).join('');
    html += elements.map(el => {
        const isShared = !!el.is_shared_with_me;
        const isViewer = el.access_role === 'viewer';
        const ownerLabel = isShared && el.created_by_name ? ` · ${el.created_by_name}` : '';
        const shareBadge = isShared
            ? `<div class="workspace-card-share-badge">${isViewer ? '👁️ Consultation' : '🔗 Partagé'}${ownerLabel}</div>`
            : '';
        const deleteBtn = isShared
            ? `<button onclick="event.stopPropagation(); unimportWorkspaceElement('${el.id}')" title="Retirer de mon espace">📤</button>`
            : `<button onclick="event.stopPropagation(); deleteWorkspaceElement('${el.id}')" title="Supprimer">🗑️</button>`;
        const canDrag = canDragWsBureauElement(el);
        const eid = String(el.id).replace(/'/g, "\\'");
        const dragAttrs = canDrag
            ? ` draggable="true" data-ws-element-id="${eid}"`
            : '';
        return `
        <div class="workspace-card${isShared ? ' workspace-card--shared' : ''}${canDrag ? ' workspace-card--draggable' : ''}"${dragAttrs} onclick="openWorkspaceElement('${eid}')">
            <div class="workspace-card-actions">${deleteBtn}</div>
            <div class="workspace-card-icon">${typeIcons[el.type] || '📄'}</div>
            <div class="workspace-card-title">${(el.title || 'Sans titre').replace(/</g,'&lt;')}</div>
            ${shareBadge}
            ${el.type === 'idea' && el.status ? `<div class="workspace-card-type">${statusLabels[el.status] || el.status}</div>` : ''}
            ${el.type === 'file' && el.file_name ? `<div class="workspace-card-type">📄 ${(el.file_name || '').replace(/</g,'&lt;')}</div>` : ''}
            <div class="workspace-card-type">${typeLabels[el.type] || el.type}</div>
            <div class="workspace-card-meta">${new Date(el.updated_at || el.created_at).toLocaleDateString('fr-FR')}</div>
        </div>`;
    }).join('');
    if (window.currentWsFolderId) {
        html += '<div class="ws-grid-root-drop ws-drop-zone" data-ws-folder-drop="__root__">Glisser ici pour remettre à la racine</div>';
    } else {
        html += '<div class="ws-grid-root-drop ws-drop-zone" data-ws-folder-drop="__current__">Glisser des fichiers ici pour les importer</div>';
    }
    grid.innerHTML = html;
}
function navigateToWsFolder(folderId) {
    if (_wsBureauDropHandled) return;
    window.currentWsFolderId = folderId || null;
    renderWorkspaceElements();
}
async function createWorkspaceFolder() {
    document.getElementById('workspaceCreateMenu').style.display = 'none';
    const name = prompt('Nom du dossier :');
    if (!name || !name.trim()) return;
    const payload = { id: 'ws_folder_' + Date.now(), type: 'folder', title: name.trim(), content: JSON.stringify({}), visibility: BUREAU_WORKSPACE_VISIBILITY, folder_id: window.currentWsFolderId || null };
    try {
        await apiCall('workspace.php', 'POST', payload);
        showToast('✅ Dossier créé', 'success');
        await loadWorkspaceElements();
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); }
}
async function renameWsFolder(folderId) {
    const folder = window.workspaceElements.find(el => el.id === folderId);
    if (!folder) return;
    const newName = prompt('Nouveau nom :', folder.title);
    if (!newName || !newName.trim() || newName.trim() === folder.title) return;
    try {
        await apiCall('workspace.php', 'PUT', { id: folderId, title: newName.trim() });
        showToast('✅ Dossier renommé', 'success');
        await loadWorkspaceElements();
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); }
}
function openWorkspaceCreateMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('workspaceCreateMenu');
    const rect = e.target.getBoundingClientRect();
    menu.style.top = (rect.bottom + 8) + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
    menu.style.display = 'block';
    const closeMenu = (ev) => {
        if (!menu.contains(ev.target)) { menu.style.display = 'none'; document.removeEventListener('click', closeMenu); }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}
async function createWorkspaceElement(type) {
    document.getElementById('workspaceCreateMenu').style.display = 'none';
    if (type === 'mindmap') { openWorkspaceMindmap(null); return; }
    if (type === 'drawing') { openWorkspaceDrawing(null); return; }
    window.currentWsElementId = null;
    window.currentWsElementType = type;
    window.currentWsIsSharedWithMe = false;
    // currentWsProjectId conservé si défini (espace de travail L&Com)
    document.getElementById('wsEditorTitle').value = '';
    document.getElementById('wsEditorContent').innerHTML = '';
    document.getElementById('wsQuicknoteText').value = '';
    document.getElementById('wsEditorTags').innerHTML = '';
    document.getElementById('wsEditorTagInput').value = '';
    setWsEditorAttachments([]);
    markWorkspaceEditorSaved();
    const typeLabels = { page: '📝 Page', idea: '💡 Idée', quicknote: '📋 Note rapide' };
    document.getElementById('wsEditorTypeBadge').textContent = typeLabels[type] || type;
    if (!window.currentWsProjectId) window.currentWorkspaceVisibility = BUREAU_WORKSPACE_VISIBILITY;
    document.getElementById('wsEditorStatusRow').style.display = type === 'idea' ? '' : 'none';
    document.getElementById('wsEditorRichContent').style.display = type === 'quicknote' ? 'none' : '';
    document.getElementById('wsEditorQuicknoteContent').style.display = type === 'quicknote' ? '' : 'none';
    if (type === 'idea') document.getElementById('wsEditorStatus').value = 'draft';
    document.getElementById('workspaceEditorPage').classList.add('active');
    initWorkspaceMentionFields();
}
async function openWorkspaceElement(idOrElement) {
    const id = (idOrElement && typeof idOrElement === 'object') ? idOrElement.id : idOrElement;
    if (!id) { showToast('❌ Élément introuvable', 'error'); return; }
    try {
        const res = await apiCall(`workspace.php?id=${encodeURIComponent(id)}`, 'GET');
        if (!res?.success || !res.element) { showToast('❌ Élément introuvable', 'error'); return; }
        const el = res.element;
        if (el.access_role === 'viewer' && typeof openWorkspaceElementConsultation === 'function') {
            openWorkspaceElementConsultation(el);
            return;
        }
        window.currentWsEphemeralView = false;
        applyWorkspaceElementContext(el);
        if (el.type === 'mindmap') { openWorkspaceMindmap(el); return; }
        if (el.type === 'drawing') { openWorkspaceDrawing(el); return; }
        if (el.type === 'file') {
            var fileUrl = typeof getWorkspaceFileUrl === 'function' ? getWorkspaceFileUrl(el) : el.file_path;
            if (fileUrl) window.open(fileUrl, '_blank');
            return;
        }
        populateWorkspaceEditorFromElement(el);
        applyWorkspaceEditorReadOnly(!window.currentWsCanEdit);
        document.getElementById('workspaceEditorPage').classList.add('active');
        initWorkspaceMentionFields();
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); }
}

function populateWorkspaceEditorFromElement(el) {
    window.currentWsElementId = el.id;
    window.currentWsElementType = el.type;
    window.currentWsCanEdit = el.can_edit !== false;
    window.currentWsAccessRole = el.access_role || 'owner';
    window.currentWsIsSharedWithMe = !!el.is_shared_with_me;
    syncWsEditorUnimportButton();
    const typeLabels = { page: '📝 Page', idea: '💡 Idée', quicknote: '📋 Note rapide' };
    document.getElementById('wsEditorTypeBadge').textContent = typeLabels[el.type] || el.type;
    document.getElementById('wsEditorTitle').value = el.title || '';
    document.getElementById('wsEditorStatusRow').style.display = el.type === 'idea' ? '' : 'none';
    if (el.type === 'idea') document.getElementById('wsEditorStatus').value = el.status || 'draft';
    const content = el.content ? (typeof el.content === 'string' ? JSON.parse(el.content) : el.content) : {};
    document.getElementById('wsEditorRichContent').style.display = el.type === 'quicknote' ? 'none' : '';
    document.getElementById('wsEditorQuicknoteContent').style.display = el.type === 'quicknote' ? '' : 'none';
    if (el.type === 'quicknote') {
        const rawText = content.text || '';
        document.getElementById('wsQuicknoteText').value = rawText;
        updateWsQuicknotePreview(rawText, !window.currentWsCanEdit);
    } else {
        const html = content.html || '';
        const editor = document.getElementById('wsEditorContent');
        if (editor) {
            editor.innerHTML = typeof replaceMentionTokensWithChips === 'function'
                ? replaceMentionTokensWithChips(html)
                : html;
        }
    }
    setWsEditorAttachments(Array.isArray(content.attachments) ? content.attachments.map(function(a) {
        return { id: a.id, name: a.name, path: a.path, type: a.type, size: a.size };
    }) : []);
    const tagsContainer = document.getElementById('wsEditorTags');
    tagsContainer.innerHTML = '';
    if (el.tags && Array.isArray(el.tags)) {
        el.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'ws-tag';
            span.innerHTML = `${tag} <span class="ws-tag-remove" onclick="event.stopPropagation(); this.parentElement.remove();">×</span>`;
            tagsContainer.appendChild(span);
        });
    }
    markWorkspaceEditorSaved();
}

function openWorkspaceElementConsultation(el) {
    if (!el) return;
    window.currentWsEphemeralView = true;
    applyWorkspaceElementContext(el);
    if (el.type === 'mindmap') { openWorkspaceMindmap(el); return; }
    if (el.type === 'drawing') { openWorkspaceDrawing(el); return; }
    if (el.type === 'file') {
        var fileUrl = typeof getWorkspaceFileUrl === 'function' ? getWorkspaceFileUrl(el) : el.file_path;
        if (fileUrl) window.open(fileUrl, '_blank');
        window.currentWsEphemeralView = false;
        return;
    }
    populateWorkspaceEditorFromElement(el);
    applyWorkspaceEditorReadOnly(true);
    document.getElementById('workspaceEditorPage').classList.add('active');
}
window.openWorkspaceElementConsultation = openWorkspaceElementConsultation;
function initWorkspaceMentionFields() {
    if (typeof initAppMentionField !== 'function') return;
    const editor = document.getElementById('wsEditorContent');
    initAppMentionField(editor);
    initAppMentionField(document.getElementById('wsQuicknoteText'));
    if (editor && !editor.dataset.mentionChipSync) {
        editor.dataset.mentionChipSync = '1';
        editor.addEventListener('input', function() {
            if (typeof syncMentionChipsInContentEditable === 'function') {
                syncMentionChipsInContentEditable(editor);
            }
        });
    }
}
function updateWsQuicknotePreview(text, readOnly) {
    const ta = document.getElementById('wsQuicknoteText');
    const preview = document.getElementById('wsQuicknotePreview');
    const mentionBar = document.querySelector('.ws-quicknote-mention-bar');
    if (!ta || !preview) return;
    if (readOnly) {
        preview.innerHTML = typeof formatMsgText === 'function'
            ? formatMsgText(text || '')
            : (text || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        preview.style.display = '';
        ta.style.display = 'none';
        if (mentionBar) mentionBar.style.display = 'none';
    } else {
        preview.style.display = 'none';
        ta.style.display = '';
        if (mentionBar) mentionBar.style.display = '';
    }
}

function applyWorkspaceEditorReadOnly(readOnly) {
    const titleInput = document.getElementById('wsEditorTitle');
    const content = document.getElementById('wsEditorContent');
    const quicknote = document.getElementById('wsQuicknoteText');
    const statusRow = document.getElementById('wsEditorStatusRow');
    const tagInput = document.getElementById('wsEditorTagInput');
    const saveBtns = document.querySelectorAll('#workspaceEditorPage .btn-save, #workspaceEditorPage .btn-save-top');
    const bannerId = 'wsEditorReadOnlyBanner';
    let banner = document.getElementById(bannerId);
    if (readOnly) {
        if (titleInput) titleInput.readOnly = true;
        if (content) content.contentEditable = 'false';
        if (quicknote) quicknote.readOnly = true;
        if (window.currentWsElementType === 'quicknote') {
            updateWsQuicknotePreview(quicknote ? quicknote.value : '', true);
        }
        if (statusRow) statusRow.style.pointerEvents = 'none';
        if (tagInput) tagInput.disabled = true;
        saveBtns.forEach(function(btn) { btn.style.display = 'none'; });
        syncWsEditorUnimportButton();
        if (!banner) {
            banner = document.createElement('div');
            banner.id = bannerId;
            banner.className = 'ws-editor-readonly-banner';
            const page = document.getElementById('workspaceEditorPage');
            if (page) page.insertBefore(banner, page.firstChild);
        }
        banner.textContent = window.currentWsEphemeralView
            ? '👁️ Consultation seule — document partagé via la messagerie (non enregistré dans Mon Bureau)'
            : '👁️ Consultation seule — importez en mode collaboration pour modifier';
        banner.style.display = '';
    } else {
        if (titleInput) titleInput.readOnly = false;
        if (content) content.contentEditable = 'true';
        if (quicknote) quicknote.readOnly = false;
        if (window.currentWsElementType === 'quicknote') {
            updateWsQuicknotePreview(quicknote ? quicknote.value : '', false);
        }
        if (statusRow) statusRow.style.pointerEvents = '';
        if (tagInput) tagInput.disabled = false;
        saveBtns.forEach(function(btn) { btn.style.display = ''; });
        syncWsEditorUnimportButton();
        if (banner) banner.style.display = 'none';
    }
    renderWsEditorAttachments();
}

function syncWsEditorUnimportButton() {
    const btn = document.getElementById('wsEditorUnimportBtn');
    if (!btn) return;
    const show = window.currentWsIsSharedWithMe && window.currentWsAccessRole === 'editor';
    btn.style.display = show ? '' : 'none';
}

function captureWorkspaceEditorSnapshot() {
    const type = window.currentWsElementType;
    let body = '';
    if (type === 'quicknote') {
        body = document.getElementById('wsQuicknoteText')?.value || '';
    } else {
        const rawHtml = document.getElementById('wsEditorContent')?.innerHTML || '';
        body = typeof extractMentionTokensFromHtml === 'function'
            ? extractMentionTokensFromHtml(rawHtml)
            : rawHtml;
    }
    return JSON.stringify({
        title: document.getElementById('wsEditorTitle')?.value || '',
        body: body,
        attachments: (window.wsEditorAttachmentsList || []).map(function(a) {
            return { id: a.id, name: a.name, path: a.path, type: a.type, size: a.size };
        }),
        tags: Array.from(document.querySelectorAll('#wsEditorTags .ws-tag')).map(function(t) {
            return t.textContent.replace('×', '').trim();
        }),
        status: document.getElementById('wsEditorStatus')?.value || ''
    });
}

function markWorkspaceEditorSaved() {
    window.wsEditorSavedSnapshot = captureWorkspaceEditorSnapshot();
}

function isWorkspaceEditorDirty() {
    if (window.currentWsCanEdit === false) return false;
    if (!window.wsEditorSavedSnapshot) return false;
    return captureWorkspaceEditorSnapshot() !== window.wsEditorSavedSnapshot;
}

async function persistWorkspaceNoteAttachments() {
    if (window.currentWsCanEdit === false) return;
    const titleInput = document.getElementById('wsEditorTitle');
    if (titleInput && !titleInput.value.trim()) {
        titleInput.value = 'Sans titre';
    }
    await saveWorkspaceElement({ silent: true, skipListReload: true, reason: 'attachment' });
}

async function saveWorkspaceElement(options) {
    options = options || {};
    if (window.currentWsCanEdit === false) {
        if (!options.silent) showToast('⚠️ Consultation seule — vous ne pouvez pas modifier cet élément', 'error');
        return;
    }
    const titleInput = document.getElementById('wsEditorTitle');
    let title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
        if ((window.wsEditorAttachmentsList || []).length) {
            title = 'Sans titre';
            if (titleInput) titleInput.value = title;
        } else {
            if (!options.silent) showToast('⚠️ Le titre est requis', 'error');
            return;
        }
    }
    const type = window.currentWsElementType;
    const attachments = (window.wsEditorAttachmentsList || []).map(function(a) {
        return { id: a.id, name: a.name, path: a.path, type: a.type, size: a.size };
    });
    let content = {};
    if (type === 'quicknote') {
        content = { text: document.getElementById('wsQuicknoteText').value, attachments: attachments };
    } else {
        const rawHtml = document.getElementById('wsEditorContent').innerHTML;
        content = {
            html: typeof extractMentionTokensFromHtml === 'function'
                ? extractMentionTokensFromHtml(rawHtml)
                : rawHtml,
            attachments: attachments
        };
    }
    const tagEls = document.querySelectorAll('#wsEditorTags .ws-tag');
    const tags = Array.from(tagEls).map(t => t.textContent.replace('×', '').trim());
    const payload = { type, title, content: JSON.stringify(content), visibility: getWorkspaceSaveVisibility(), tags: JSON.stringify(tags), folder_id: window.currentWsFolderId || null };
    if (window.currentWsProjectId) payload.project_id = window.currentWsProjectId;
    if (type === 'idea') payload.status = document.getElementById('wsEditorStatus').value;
    try {
        if (window.currentWsElementId) {
            payload.id = window.currentWsElementId;
            await apiCall('workspace.php', 'PUT', payload);
        } else {
            payload.id = 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            await apiCall('workspace.php', 'POST', payload);
            window.currentWsElementId = payload.id;
        }
        markWorkspaceEditorSaved();
        (window.wsEditorAttachmentsList || []).forEach(function(a) {
            if (a.blobUrl) { URL.revokeObjectURL(a.blobUrl); delete a.blobUrl; }
        });
        if (options.reason === 'attachment') {
            showToast('💾 Pièce jointe enregistrée', 'success');
        } else if (!options.silent) {
            showToast('✅ Enregistré', 'success');
        }
        if (!options.skipListReload) {
            if (window.currentWsProjectId && typeof refreshProjectNotesUI === 'function') {
                refreshProjectNotesUI(window.currentWsProjectId);
            } else {
                loadWorkspaceElements();
            }
        }
    } catch(e) {
        showToast('❌ Erreur: ' + e.message, 'error');
        throw e;
    }
}
function saveAndCloseWorkspaceElement() {
    saveWorkspaceElement().then(function() { closeWorkspaceEditor(true); }).catch(function() {});
}

async function closeWorkspaceEditor(skipDirtyCheck) {
    if (!skipDirtyCheck && window.currentWsCanEdit !== false && isWorkspaceEditorDirty()) {
        if (confirm('Enregistrer les modifications avant de fermer la note ?')) {
            try {
                await saveWorkspaceElement();
            } catch (e) {
                return;
            }
        }
    }
    actuallyCloseWorkspaceEditor();
}

function actuallyCloseWorkspaceEditor() {
    const wasEphemeral = window.currentWsEphemeralView;
    window.currentWsEphemeralView = false;
    window.currentWsCanEdit = true;
    window.currentWsAccessRole = null;
    applyWorkspaceEditorReadOnly(false);
    document.getElementById('workspaceEditorPage').classList.remove('active');
    if (wasEphemeral) {
        window.currentWsElementId = null;
        window.currentWsElementType = null;
    }
}
function addWorkspaceTag() {
    const input = document.getElementById('wsEditorTagInput');
    const tag = input.value.trim();
    if (!tag) return;
    const container = document.getElementById('wsEditorTags');
    const span = document.createElement('span');
    span.className = 'ws-tag';
    span.innerHTML = `${tag} <span class="ws-tag-remove" onclick="event.stopPropagation(); this.parentElement.remove();">×</span>`;
    container.appendChild(span);
    input.value = '';
}
async function unimportWorkspaceElement(id) {
    const elementId = id || window.currentWsElementId;
    if (!elementId) return;
    const el = window.workspaceElements.find(function(e) { return e.id === elementId; });
    const title = (el && el.title) ? el.title : 'cet élément';
    if (!confirm('Retirer « ' + title + ' » de votre espace ?\n\nL\'élément restera disponible pour les autres personnes qui y ont accès.')) return;
    try {
        await apiCall('workspace.php', 'POST', { action: 'revoke_access', element_id: elementId });
        showToast('✅ Retiré de votre espace', 'success');
        if (window.currentWsElementId === elementId) {
            actuallyCloseWorkspaceEditor();
        }
        await loadWorkspaceElements();
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); }
}
window.unimportWorkspaceElement = unimportWorkspaceElement;

async function deleteWorkspaceElement(id) {
    const el = window.workspaceElements.find(e => e.id === id);
    if (!el) return;
    if (el.type === 'folder') {
        const childCount = window.workspaceElements.filter(e => e.folder_id === id).length;
        const msg = childCount > 0 ? `Supprimer le dossier "${el.title}" et ses ${childCount} élément(s) ?` : `Supprimer le dossier "${el.title}" ?`;
        if (!confirm(msg)) return;
        const children = window.workspaceElements.filter(e => e.folder_id === id);
        for (const child of children) {
            try { await apiCall('workspace.php', 'DELETE', { id: child.id }); } catch(e) {}
        }
    } else {
        if (!confirm('Supprimer cet élément ?')) return;
    }
    try {
        await apiCall('workspace.php', 'DELETE', { id });
        showToast('✅ Supprimé', 'success');
        await loadWorkspaceElements();
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); }
}
async function handleWorkspaceFileUpload(event) {
    document.getElementById('workspaceCreateMenu').style.display = 'none';
    const files = event.target.files;
    if (!files.length) return;
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('visibility', getWorkspaceSaveVisibility());
        formData.append('folder_id', window.currentWsFolderId || '');
        formData.append('token', authToken);
        try {
            const response = await fetch(`${API_URL}/workspace_upload.php`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
            const res = await response.json();
            if (res.success) showToast(`✅ ${file.name} importé`, 'success');
            else showToast(`❌ Erreur pour ${file.name}`, 'error');
        } catch(e) { showToast(`❌ Erreur upload: ${e.message}`, 'error'); }
    }
    event.target.value = '';
    loadWorkspaceElements();
}
function wsInsertLink() { const url = prompt('URL du lien :'); if (url) document.execCommand('createLink', false, url); }

window.wsEditorAttachmentsList = [];

function setWsEditorAttachments(list) {
    window.wsEditorAttachmentsList = (list || []).slice();
    renderWsEditorAttachments();
}

function wsFormatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / 1048576).toFixed(1) + ' Mo';
}

function wsGetFileIcon(nameOrType) {
    const s = String(nameOrType || '').toLowerCase();
    if (s.indexOf('pdf') !== -1) return '📕';
    if (s.indexOf('image') !== -1 || /\.(jpg|jpeg|png|gif|webp)$/.test(s)) return '🖼️';
    if (s.indexOf('word') !== -1 || s.indexOf('doc') !== -1) return '📝';
    if (s.indexOf('sheet') !== -1 || s.indexOf('xls') !== -1 || s.indexOf('csv') !== -1) return '📊';
    if (s.indexOf('text') !== -1 || s.indexOf('txt') !== -1) return '📄';
    return '📎';
}

function getWsAttachmentUrl(att, download) {
    if (!att) return null;
    if (att.blobUrl) return att.blobUrl;
    if (!window.currentWsElementId || !att.id) return null;
    const base = typeof API_URL !== 'undefined' ? API_URL : 'api';
    let url = base + '/workspace_note_attachment.php?element_id=' + encodeURIComponent(window.currentWsElementId) +
        '&attachment_id=' + encodeURIComponent(att.id);
    if (download) url += '&download=1';
    if (typeof authToken !== 'undefined' && authToken) {
        url += '&token=' + encodeURIComponent(authToken);
    }
    return url;
}

function renderWsEditorAttachments() {
    const list = document.getElementById('wsEditorAttachments');
    const addRow = document.getElementById('wsEditorAttachActions');
    if (!list) return;
    const readOnly = window.currentWsCanEdit === false;
    if (addRow) addRow.style.display = readOnly ? 'none' : '';
    const items = window.wsEditorAttachmentsList || [];
    if (!items.length) {
        list.innerHTML = '<span class="empty-msg">Aucun fichier attaché</span>';
        return;
    }
    list.innerHTML = items.map(function(att) {
        const safeId = String(att.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeName = (att.name || 'Fichier').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const size = wsFormatFileSize(att.size);
        const icon = wsGetFileIcon(att.name || att.type);
        const editActions = readOnly ? '' :
            '<button type="button" class="ws-attachment-btn ws-attachment-btn-rename" onclick="renameWsEditorAttachment(\'' + safeId + '\')" title="Renommer">✏️</button>' +
            '<button type="button" class="ws-attachment-btn ws-attachment-btn-remove" onclick="removeWsEditorAttachment(\'' + safeId + '\')" title="Supprimer">🗑️</button>';
        return '<div class="ws-attachment-item">' +
            '<span class="ws-attachment-icon">' + icon + '</span>' +
            '<button type="button" class="ws-attachment-name-btn" onclick="previewWsEditorAttachment(\'' + safeId + '\')" title="Ouvrir / Aperçu">' + safeName + '</button>' +
            '<span class="ws-attachment-size">' + size + '</span>' +
            '<div class="ws-attachment-actions">' +
            '<button type="button" class="ws-attachment-btn ws-attachment-btn-open" onclick="previewWsEditorAttachment(\'' + safeId + '\')" title="Aperçu">👁️</button>' +
            editActions +
            '</div></div>';
    }).join('');
}

async function uploadWsEditorAttachmentFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('attach_only', '1');
    formData.append('token', authToken);
    if (window.currentWsProjectId) formData.append('project_id', window.currentWsProjectId);
    const response = await fetch((typeof API_URL !== 'undefined' ? API_URL : 'api') + '/workspace_upload.php', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + authToken },
        body: formData
    });
    let res;
    try { res = await response.json(); } catch (e) { throw new Error('Réponse serveur invalide'); }
    if (!response.ok || !res.success || !res.attachment) {
        throw new Error(res.error || 'Upload échoué');
    }
    return res.attachment;
}

async function handleWsEditorFileAttach(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    if (window.currentWsCanEdit === false) return;
    let added = 0;
    for (const file of Array.from(files)) {
        try {
            const att = await uploadWsEditorAttachmentFile(file);
            att.blobUrl = URL.createObjectURL(file);
            window.wsEditorAttachmentsList.push(att);
            added++;
        } catch (e) {
            showToast('❌ ' + file.name + ' : ' + e.message, 'error');
        }
    }
    renderWsEditorAttachments();
    event.target.value = '';
    if (added > 0) {
        try {
            await persistWorkspaceNoteAttachments();
        } catch (e) {
            showToast('❌ Erreur enregistrement : ' + e.message, 'error');
        }
    }
}

function previewWsEditorAttachment(attachmentId) {
    const att = (window.wsEditorAttachmentsList || []).find(function(a) { return String(a.id) === String(attachmentId); });
    if (!att) return;
    const url = getWsAttachmentUrl(att);
    if (!url) {
        showToast('⚠️ Enregistrez la note avant d\'ouvrir ce fichier', 'error');
        return;
    }
    openWsAttachmentPreview(url, att.name || 'Fichier', att.type || '');
}

function openWsAttachmentPreview(url, filename, mimeType) {
    const modal = document.getElementById('wsAttachmentPreviewModal');
    if (!modal) return;
    const filenameEl = document.getElementById('wsPreviewFilename');
    const contentEl = document.getElementById('wsPreviewContent');
    const downloadBtn = document.getElementById('wsPreviewDownloadBtn');
    const openNewTabBtn = document.getElementById('wsPreviewOpenNewTab');
    const safeName = (filename || 'Fichier').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (filenameEl) filenameEl.textContent = filename || 'Fichier';
    const dlUrl = url.startsWith('blob:') ? url : (url + (url.indexOf('download=') === -1 ? (url.indexOf('?') === -1 ? '?download=1' : '&download=1') : ''));
    if (downloadBtn) { downloadBtn.href = dlUrl; downloadBtn.download = filename || 'fichier'; }
    if (openNewTabBtn) openNewTabBtn.href = url;
    if (contentEl) {
        if (mimeType && mimeType.indexOf('image/') === 0) {
            contentEl.innerHTML = '<img src="' + url + '" alt="' + safeName + '" class="preview-image">';
        } else if (mimeType === 'application/pdf') {
            contentEl.innerHTML = '<iframe src="' + url + '" class="preview-pdf" title="' + safeName + '"></iframe>';
        } else {
            contentEl.innerHTML = '<div class="preview-unsupported">' +
                '<div class="preview-unsupported-icon">' + wsGetFileIcon(mimeType || filename) + '</div>' +
                '<p>Prévisualisation non disponible pour ce type de fichier.</p>' +
                '<a href="' + dlUrl + '" target="_blank" class="btn">⬇️ Télécharger le fichier</a></div>';
        }
    }
    modal.classList.add('active');
}

function closeWsAttachmentPreview() {
    const modal = document.getElementById('wsAttachmentPreviewModal');
    if (modal) modal.classList.remove('active');
}

function renameWsEditorAttachment(attachmentId) {
    if (window.currentWsCanEdit === false) return;
    const att = (window.wsEditorAttachmentsList || []).find(function(a) { return String(a.id) === String(attachmentId); });
    if (!att) return;
    const newName = prompt('Nouveau nom du fichier :', att.name || '');
    if (!newName || !newName.trim() || newName.trim() === att.name) return;
    att.name = newName.trim();
    renderWsEditorAttachments();
    persistWorkspaceNoteAttachments().catch(function(e) {
        showToast('❌ Erreur enregistrement : ' + e.message, 'error');
    });
}

function removeWsEditorAttachment(attachmentId) {
    if (window.currentWsCanEdit === false) return;
    window.wsEditorAttachmentsList = (window.wsEditorAttachmentsList || []).filter(function(a) {
        return String(a.id) !== String(attachmentId);
    });
    renderWsEditorAttachments();
    persistWorkspaceNoteAttachments().catch(function(e) {
        showToast('❌ Erreur enregistrement : ' + e.message, 'error');
    });
}

window.handleWsEditorFileAttach = handleWsEditorFileAttach;
window.previewWsEditorAttachment = previewWsEditorAttachment;
window.closeWsAttachmentPreview = closeWsAttachmentPreview;
window.renameWsEditorAttachment = renameWsEditorAttachment;
window.removeWsEditorAttachment = removeWsEditorAttachment;

// ========== CARTE MENTALE (MINDMAP) ==========
function openWorkspaceMindmap(element) {
    window.currentWsElementId = element?.id || null;
    window.currentWsElementType = 'mindmap';
    document.getElementById('wsMindmapTitle').value = element?.title || '';
    if (element?.content) {
        const content = typeof element.content === 'string' ? JSON.parse(element.content) : element.content;
        window.mindmapData = content.data || getDefaultMindmapData();
    } else { window.mindmapData = getDefaultMindmapData(); }
    window.mindmapSelectedNode = null;
    window.mindmapZoom = 1;
    window.mindmapPan = { x: 0, y: 0 };
    document.getElementById('workspaceMindmapPage').classList.add('active');
    setTimeout(() => renderMindmap(), 100);
}
function closeWorkspaceMindmap() { document.getElementById('workspaceMindmapPage').classList.remove('active'); }
function getDefaultMindmapData() {
    return { id: 'root', text: 'Idée centrale', children: [
        { id: 'n1', text: 'Branche 1', children: [] },
        { id: 'n2', text: 'Branche 2', children: [] },
        { id: 'n3', text: 'Branche 3', children: [] }
    ]};
}
async function saveWorkspaceMindmap() {
    const title = document.getElementById('wsMindmapTitle').value.trim() || 'Carte mentale sans titre';
    const payload = { type: 'mindmap', title, content: JSON.stringify({ data: window.mindmapData }), visibility: getWorkspaceSaveVisibility(), folder_id: window.currentWsFolderId || null };
    try {
        if (window.currentWsElementId) { payload.id = window.currentWsElementId; await apiCall('workspace.php', 'PUT', payload); }
        else { payload.id = 'ws_mm_' + Date.now(); await apiCall('workspace.php', 'POST', payload); window.currentWsElementId = payload.id; }
        showToast('✅ Carte mentale enregistrée', 'success');
        loadWorkspaceElements();
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); }
}
function renderMindmap() {
    const svg = document.getElementById('mindmapSvg');
    const container = document.getElementById('mindmapContainer');
    if (!svg || !container || !window.mindmapData) return;
    svg.innerHTML = '';
    const width = container.clientWidth;
    const height = container.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const nodeHeight = 40;
    const nodeWidth = 150;
    const hGap = 60;
    const vGap = 15;
    function countLeaves(node) {
        if (!node.children || node.children.length === 0) return 1;
        return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
    }
    function layoutNode(node, x, yStart, yEnd, depth) {
        const cy = (yStart + yEnd) / 2;
        node._x = x; node._y = cy; node._depth = depth;
        if (node.children && node.children.length > 0) {
            const totalLeaves = countLeaves(node);
            const childX = x + nodeWidth + hGap;
            let currentY = yStart;
            node.children.forEach(child => {
                const leaves = countLeaves(child);
                const childYEnd = currentY + (yEnd - yStart) * (leaves / totalLeaves);
                layoutNode(child, childX, currentY, childYEnd, depth + 1);
                currentY = childYEnd;
            });
        }
    }
    const totalLeaves = countLeaves(window.mindmapData);
    const totalHeight = Math.max(totalLeaves * (nodeHeight + vGap), height);
    const startY = (height - totalHeight) / 2;
    layoutNode(window.mindmapData, 40, startY, startY + totalHeight, 0);
    const colors = ['#0073ea', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#579bfc'];
    function drawLinks(node) {
        if (node.children) {
            node.children.forEach(child => {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const x1 = node._x + nodeWidth, y1 = node._y, x2 = child._x, y2 = child._y, mx = (x1 + x2) / 2;
                path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
                path.setAttribute('class', 'mindmap-link');
                path.setAttribute('stroke', colors[Math.min(child._depth, colors.length - 1)]);
                svg.appendChild(path);
                drawLinks(child);
            });
        }
    }
    function drawNodes(node) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'mindmap-node' + (window.mindmapSelectedNode === node.id ? ' selected' : ''));
        g.setAttribute('data-id', node.id);
        g.onclick = (e) => { e.stopPropagation(); selectMindmapNode(node.id); };
        g.ondblclick = (e) => { e.stopPropagation(); mindmapEditNode(); };
        const color = colors[Math.min(node._depth, colors.length - 1)];
        const isRoot = node._depth === 0;
        if (isRoot) {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', node._x); rect.setAttribute('y', node._y - nodeHeight / 2);
            rect.setAttribute('width', nodeWidth); rect.setAttribute('height', nodeHeight);
            rect.setAttribute('rx', nodeHeight / 2); rect.setAttribute('fill', color);
            g.appendChild(rect);
        } else {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', node._x); rect.setAttribute('y', node._y - nodeHeight / 2);
            rect.setAttribute('width', nodeWidth); rect.setAttribute('height', nodeHeight);
            rect.setAttribute('rx', 8); rect.setAttribute('fill', 'white');
            rect.setAttribute('stroke', color); rect.setAttribute('stroke-width', '2');
            g.appendChild(rect);
        }
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node._x + nodeWidth / 2); text.setAttribute('y', node._y + 5);
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', isRoot ? 'white' : '#333');
        text.setAttribute('font-size', isRoot ? '14' : '13'); text.setAttribute('font-weight', isRoot ? '700' : '500');
        text.setAttribute('font-family', 'Figtree, sans-serif');
        text.textContent = node.text.length > 16 ? node.text.substring(0, 16) + '…' : node.text;
        g.appendChild(text);
        svg.appendChild(g);
        if (node.children) node.children.forEach(drawNodes);
    }
    drawLinks(window.mindmapData);
    drawNodes(window.mindmapData);
}
function selectMindmapNode(id) { window.mindmapSelectedNode = id; renderMindmap(); }
function findMindmapNode(node, id) {
    if (node.id === id) return node;
    if (node.children) { for (const child of node.children) { const found = findMindmapNode(child, id); if (found) return found; } }
    return null;
}
function findMindmapParent(node, id) {
    if (node.children) { for (const child of node.children) { if (child.id === id) return node; const found = findMindmapParent(child, id); if (found) return found; } }
    return null;
}
function mindmapAddChild() {
    if (!window.mindmapSelectedNode) { showToast('⚠️ Sélectionnez un nœud', 'error'); return; }
    const node = findMindmapNode(window.mindmapData, window.mindmapSelectedNode);
    if (!node) return;
    const text = prompt('Texte du nœud :');
    if (!text) return;
    if (!node.children) node.children = [];
    node.children.push({ id: 'mn_' + Date.now(), text, children: [] });
    renderMindmap();
}
function mindmapAddSibling() {
    if (!window.mindmapSelectedNode || window.mindmapSelectedNode === window.mindmapData.id) { showToast("⚠️ Impossible d'ajouter un frère à la racine", 'error'); return; }
    const parent = findMindmapParent(window.mindmapData, window.mindmapSelectedNode);
    if (!parent) return;
    const text = prompt('Texte du nœud :');
    if (!text) return;
    parent.children.push({ id: 'mn_' + Date.now(), text, children: [] });
    renderMindmap();
}
function mindmapDeleteNode() {
    if (!window.mindmapSelectedNode || window.mindmapSelectedNode === window.mindmapData.id) { showToast('⚠️ Impossible de supprimer la racine', 'error'); return; }
    if (!confirm('Supprimer ce nœud et ses enfants ?')) return;
    const parent = findMindmapParent(window.mindmapData, window.mindmapSelectedNode);
    if (parent) { parent.children = parent.children.filter(c => c.id !== window.mindmapSelectedNode); window.mindmapSelectedNode = null; renderMindmap(); }
}
function mindmapEditNode() {
    if (!window.mindmapSelectedNode) { showToast('⚠️ Sélectionnez un nœud', 'error'); return; }
    const node = findMindmapNode(window.mindmapData, window.mindmapSelectedNode);
    if (!node) return;
    const text = prompt('Nouveau texte :', node.text);
    if (text !== null) { node.text = text; renderMindmap(); }
}
function mindmapZoomIn() { window.mindmapZoom = Math.min(window.mindmapZoom * 1.2, 3); applyMindmapTransform(); }
function mindmapZoomOut() { window.mindmapZoom = Math.max(window.mindmapZoom / 1.2, 0.3); applyMindmapTransform(); }
function mindmapFitView() { window.mindmapZoom = 1; window.mindmapPan = { x: 0, y: 0 }; applyMindmapTransform(); }
function applyMindmapTransform() {
    const svg = document.getElementById('mindmapSvg');
    if (svg) svg.style.transform = `scale(${window.mindmapZoom}) translate(${window.mindmapPan.x}px, ${window.mindmapPan.y}px)`;
}

// ========== TABLEAU BLANC (DRAWING) ==========
function openWorkspaceDrawing(element) {
    window.currentWsElementId = element?.id || null;
    window.currentWsElementType = 'drawing';
    document.getElementById('wsDrawingTitle').value = element?.title || '';
    document.getElementById('workspaceDrawingPage').classList.add('active');
    setTimeout(() => {
        const canvas = document.getElementById('drawingCanvas');
        const container = document.getElementById('drawingContainer');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        window.drawingCtx = canvas.getContext('2d');
        window.drawingCtx.lineCap = 'round';
        window.drawingCtx.lineJoin = 'round';
        window.drawingHistory = [];
        window.isDrawing = false;
        window.drawingTool = 'pen';
        if (element?.content) {
            const content = typeof element.content === 'string' ? JSON.parse(element.content) : element.content;
            if (content.imageData) {
                const img = new Image();
                img.onload = () => { window.drawingCtx.drawImage(img, 0, 0); };
                img.src = content.imageData;
            }
        } else {
            window.drawingCtx.fillStyle = 'white';
            window.drawingCtx.fillRect(0, 0, canvas.width, canvas.height);
        }
        canvas.onmousedown = startDrawing;
        canvas.onmousemove = draw;
        canvas.onmouseup = stopDrawing;
        canvas.onmouseleave = stopDrawing;
        canvas.ontouchstart = (e) => { e.preventDefault(); startDrawing(getTouchPos(canvas, e)); };
        canvas.ontouchmove = (e) => { e.preventDefault(); draw(getTouchPos(canvas, e)); };
        canvas.ontouchend = (e) => { e.preventDefault(); stopDrawing(e); };
        document.querySelectorAll('.drawing-tool').forEach(b => b.classList.remove('active'));
        document.querySelector(`.drawing-tool[data-tool="${window.drawingTool}"]`)?.classList.add('active');
    }, 150);
}
function closeWorkspaceDrawing() { document.getElementById('workspaceDrawingPage').classList.remove('active'); }
function setDrawingTool(tool) {
    window.drawingTool = tool;
    document.querySelectorAll('.drawing-tool').forEach(b => b.classList.remove('active'));
    document.querySelector(`.drawing-tool[data-tool="${tool}"]`)?.classList.add('active');
}
function getTouchPos(canvas, touchEvent) {
    const rect = canvas.getBoundingClientRect();
    const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
    return { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top, preventDefault: () => {} };
}
let lastX, lastY;
function startDrawing(e) {
    window.isDrawing = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
    window.drawingHistory.push(window.drawingCtx.getImageData(0, 0, window.drawingCtx.canvas.width, window.drawingCtx.canvas.height));
    if (window.drawingHistory.length > 30) window.drawingHistory.shift();
    if (window.drawingTool === 'text') {
        const text = prompt('Texte :');
        if (text) { window.drawingCtx.fillStyle = document.getElementById('drawingColor').value; window.drawingCtx.font = '16px Figtree, sans-serif'; window.drawingCtx.fillText(text, lastX, lastY); }
        window.isDrawing = false;
    }
    if (window.drawingTool === 'postit') {
        const text = prompt('Texte du post-it :');
        if (text) {
            window.drawingCtx.fillStyle = '#fff9c4';
            window.drawingCtx.fillRect(lastX, lastY, 160, 100);
            window.drawingCtx.strokeStyle = '#f9e382';
            window.drawingCtx.lineWidth = 1;
            window.drawingCtx.strokeRect(lastX, lastY, 160, 100);
            window.drawingCtx.fillStyle = '#333';
            window.drawingCtx.font = '13px Figtree, sans-serif';
            const words = text.split(' ');
            let line = '', y = lastY + 22;
            words.forEach(w => {
                const test = line + w + ' ';
                if (window.drawingCtx.measureText(test).width > 145) { window.drawingCtx.fillText(line, lastX + 8, y); line = w + ' '; y += 18; }
                else line = test;
            });
            window.drawingCtx.fillText(line, lastX + 8, y);
        }
        window.isDrawing = false;
    }
}
function draw(e) {
    if (!window.isDrawing || !window.drawingCtx) return;
    const color = document.getElementById('drawingColor').value;
    const width = parseInt(document.getElementById('drawingStrokeWidth').value);
    if (window.drawingTool === 'pen') {
        window.drawingCtx.strokeStyle = color;
        window.drawingCtx.lineWidth = width;
        window.drawingCtx.beginPath();
        window.drawingCtx.moveTo(lastX, lastY);
        window.drawingCtx.lineTo(e.offsetX, e.offsetY);
        window.drawingCtx.stroke();
    } else if (window.drawingTool === 'eraser') {
        window.drawingCtx.strokeStyle = 'white';
        window.drawingCtx.lineWidth = width * 4;
        window.drawingCtx.beginPath();
        window.drawingCtx.moveTo(lastX, lastY);
        window.drawingCtx.lineTo(e.offsetX, e.offsetY);
        window.drawingCtx.stroke();
    }
    lastX = e.offsetX;
    lastY = e.offsetY;
}
function stopDrawing(e) {
    if (!window.isDrawing || !window.drawingCtx) return;
    const color = document.getElementById('drawingColor').value;
    const width = parseInt(document.getElementById('drawingStrokeWidth').value);
    if (window.drawingTool === 'line') {
        window.drawingCtx.strokeStyle = color;
        window.drawingCtx.lineWidth = width;
        window.drawingCtx.beginPath();
        window.drawingCtx.moveTo(lastX, lastY);
        window.drawingCtx.lineTo(e.offsetX, e.offsetY);
        window.drawingCtx.stroke();
    } else if (window.drawingTool === 'rect') {
        window.drawingCtx.strokeStyle = color;
        window.drawingCtx.lineWidth = width;
        window.drawingCtx.strokeRect(lastX, lastY, e.offsetX - lastX, e.offsetY - lastY);
    } else if (window.drawingTool === 'circle') {
        const rx = Math.abs(e.offsetX - lastX) / 2;
        const ry = Math.abs(e.offsetY - lastY) / 2;
        const cx = (lastX + e.offsetX) / 2;
        const cy = (lastY + e.offsetY) / 2;
        window.drawingCtx.strokeStyle = color;
        window.drawingCtx.lineWidth = width;
        window.drawingCtx.beginPath();
        window.drawingCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        window.drawingCtx.stroke();
    }
    window.isDrawing = false;
}
function drawingUndo() { if (window.drawingHistory.length === 0) return; window.drawingCtx.putImageData(window.drawingHistory.pop(), 0, 0); }
function drawingClear() {
    if (!confirm('Effacer tout le dessin ?')) return;
    window.drawingHistory.push(window.drawingCtx.getImageData(0, 0, window.drawingCtx.canvas.width, window.drawingCtx.canvas.height));
    window.drawingCtx.fillStyle = 'white';
    window.drawingCtx.fillRect(0, 0, window.drawingCtx.canvas.width, window.drawingCtx.canvas.height);
}
function drawingExportPng() {
    const canvas = document.getElementById('drawingCanvas');
    const link = document.createElement('a');
    link.download = (document.getElementById('wsDrawingTitle').value || 'dessin') + '.png';
    link.href = canvas.toDataURL();
    link.click();
}
async function saveWorkspaceDrawing() {
    const title = document.getElementById('wsDrawingTitle').value.trim() || 'Dessin sans titre';
    const canvas = document.getElementById('drawingCanvas');
    const imageData = canvas.toDataURL('image/png');
    const payload = { type: 'drawing', title, content: JSON.stringify({ imageData }), visibility: getWorkspaceSaveVisibility(), folder_id: window.currentWsFolderId || null };
    try {
        if (window.currentWsElementId) { payload.id = window.currentWsElementId; await apiCall('workspace.php', 'PUT', payload); }
        else { payload.id = 'ws_dw_' + Date.now(); await apiCall('workspace.php', 'POST', payload); window.currentWsElementId = payload.id; }
        showToast('✅ Dessin enregistré', 'success');
        loadWorkspaceElements();
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); }
}
