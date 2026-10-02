// ========== FICHES TÂCHES (personnelles + dossiers CRM) ==========

var taskFicheSource = null;
var taskFicheProjectId = null;
var taskFicheTaskId = null;
var taskFicheReturnTo = null;
var crmV2DealReturnTaskFiche = null;
var taskFicheIsCreateMode = false;
var taskFicheDraftTask = null;
var taskFicheDraftDeal = null;
var taskFicheDraftWp = null;

var TASK_FICHE_ACTIVITY_TYPES = {
    note: { label: 'Note', icon: '📝' },
    call: { label: 'Appel', icon: '📞' },
    email: { label: 'Email', icon: '✉️' },
    meeting: { label: 'Réunion', icon: '🤝' },
    status_change: { label: 'Changement de statut', icon: '🔄' }
};

function ensureTaskFicheShape(task) {
    if (!task) return;
    if (task.notes === undefined) task.notes = '';
    if (!task.documents) task.documents = [];
    if (!task.activities) task.activities = [];
}

function taskFicheEsc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function taskFicheFormatDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return iso; }
}

function taskFicheFormatDateTime(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
}

function taskFicheNewId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function detectTaskFicheReturnContext() {
    if (document.getElementById('crmDealPage') && document.getElementById('crmDealPage').classList.contains('active') && typeof crmV2DealId !== 'undefined' && crmV2DealId) {
        return { type: 'crm_deal', dealId: crmV2DealId };
    }
    var wpPage = document.getElementById('workProjectPage');
    if (wpPage && wpPage.classList.contains('active') && typeof wpCurrentId !== 'undefined' && wpCurrentId) {
        return { type: 'work_project', projectId: wpCurrentId };
    }
    if (document.getElementById('myBureauPage') && document.getElementById('myBureauPage').classList.contains('active')) {
        return { type: 'bureau' };
    }
    var home = document.getElementById('homeWelcome');
    if (home && home.style.display !== 'none') {
        return { type: 'home' };
    }
    return { type: 'bureau' };
}

function getTaskFicheContext() {
    if (taskFicheIsCreateMode && taskFicheDraftTask) {
        ensureTaskFicheShape(taskFicheDraftTask);
        if (taskFicheSource === 'personal') {
            return {
                source: 'personal',
                task: taskFicheDraftTask,
                deal: null,
                dealId: null,
                dealTitle: null,
                projectId: 'bureau',
                projectTitle: 'Mon Bureau',
                isCreate: true
            };
        }
        if (taskFicheSource === 'work_project') {
            var wp = typeof getWorkProjectById === 'function'
                ? getWorkProjectById(taskFicheProjectId)
                : taskFicheDraftWp;
            if (!wp) return null;
            if (typeof ensureWorkProjectShape === 'function') ensureWorkProjectShape(wp);
            return {
                source: 'work_project',
                task: taskFicheDraftTask,
                wp: wp,
                projectId: wp.id,
                projectTitle: wp.title || 'Projet',
                deal: null,
                dealId: null,
                dealTitle: null,
                isCreate: true
            };
        }
        var dealId = taskFicheProjectId && String(taskFicheProjectId).indexOf('crm_') === 0
            ? String(taskFicheProjectId).slice(4)
            : (taskFicheDraftDeal ? taskFicheDraftDeal.id : null);
        var liveDeal = typeof getCrmDealById === 'function' ? getCrmDealById(dealId) : taskFicheDraftDeal;
        if (!liveDeal) return null;
        return {
            source: 'crm_deal',
            task: taskFicheDraftTask,
            deal: liveDeal,
            dealId: liveDeal.id,
            dealTitle: liveDeal.title || 'Dossier',
            projectId: 'crm_' + liveDeal.id,
            isCreate: true
        };
    }
    if (!taskFicheTaskId) return null;
    if (taskFicheSource === 'personal') {
        var task = null;
        if (typeof findBureauPersonalTaskById === 'function') {
            task = findBureauPersonalTaskById(taskFicheTaskId);
        } else if (typeof myBureau !== 'undefined' && myBureau.tasks) {
            task = myBureau.tasks.find(function(t) { return String(t.id) === String(taskFicheTaskId); });
        }
        if (!task) return null;
        ensureTaskFicheShape(task);
        return { source: 'personal', task: task, deal: null, dealId: null, dealTitle: null };
    }
    if (taskFicheSource === 'work_project' && taskFicheProjectId) {
        if (typeof findWorkProjectTask === 'function') {
            var wpFound = findWorkProjectTask(taskFicheProjectId, taskFicheTaskId);
            if (!wpFound) return null;
            ensureTaskFicheShape(wpFound.task);
            return {
                source: 'work_project',
                task: wpFound.task,
                wp: wpFound.project,
                projectId: wpFound.project.id,
                projectTitle: wpFound.project.title || 'Projet',
                deal: null,
                dealId: null,
                dealTitle: null
            };
        }
    }
    if (taskFicheSource === 'crm_deal' && taskFicheProjectId) {
        var dealId = String(taskFicheProjectId).indexOf('crm_') === 0 ? String(taskFicheProjectId).slice(4) : taskFicheProjectId;
        if (typeof findCrmDealTask === 'function') {
            var found = findCrmDealTask(dealId, taskFicheTaskId);
            if (!found) return null;
            ensureTaskFicheShape(found.task);
            return {
                source: 'crm_deal',
                task: found.task,
                deal: found.deal,
                dealId: dealId,
                dealTitle: found.deal.title || 'Dossier',
                projectId: 'crm_' + dealId
            };
        }
    }
    return null;
}

async function openNewCrmDealTaskFiche(dealId) {
    if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    var id = dealId || (typeof crmV2DealId !== 'undefined' ? crmV2DealId : null);
    if (!id || typeof getCrmDealById !== 'function') return;
    var deal = getCrmDealById(id);
    if (!deal) return;
    if (typeof ensureDealShape === 'function') ensureDealShape(deal);

    taskFicheReturnTo = { type: 'crm_deal', dealId: deal.id };
    taskFicheSource = 'crm_deal';
    taskFicheProjectId = 'crm_' + deal.id;
    taskFicheIsCreateMode = true;
    taskFicheTaskId = taskFicheNewId('crmtask');
    taskFicheDraftDeal = deal;
    taskFicheDraftTask = {
        id: taskFicheTaskId,
        title: '',
        description: '',
        dueDate: null,
        assignedTo: currentUser && currentUser.id ? [String(currentUser.id)] : [],
        status: 'todo',
        completed: false,
        notes: '',
        documents: [],
        activities: [],
        crmDealId: deal.id,
        createdBy: currentUser ? currentUser.id : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    var page = document.getElementById('taskFichePage');
    if (!page) return;
    page.classList.add('active');
    renderTaskFiche();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
window.openNewCrmDealTaskFiche = openNewCrmDealTaskFiche;

async function openNewPersonalTaskFiche() {
    taskFicheReturnTo = detectTaskFicheReturnContext();
    taskFicheSource = 'personal';
    taskFicheProjectId = '';
    taskFicheIsCreateMode = true;
    taskFicheTaskId = taskFicheNewId('pt');
    taskFicheDraftTask = {
        id: taskFicheTaskId,
        title: '',
        description: '',
        dueDate: null,
        assignedTo: currentUser && currentUser.id ? [String(currentUser.id)] : [],
        status: 'todo',
        completed: false,
        category: '',
        priority: 'medium',
        notes: '',
        documents: [],
        activities: [],
        createdBy: currentUser ? currentUser.id : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    var page = document.getElementById('taskFichePage');
    if (!page) return;
    page.classList.add('active');
    renderTaskFiche();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
window.openNewPersonalTaskFiche = openNewPersonalTaskFiche;

async function openNewWorkProjectTaskFiche(projectId) {
    var id = projectId || (typeof wpCurrentId !== 'undefined' ? wpCurrentId : null);
    if (!id) return;
    if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
    if (typeof hasWorkProjectsAccess === 'function' && !hasWorkProjectsAccess()) {
        alert("Vous n'avez pas accès aux projets.");
        return;
    }
    var wp = typeof getWorkProjectById === 'function' ? getWorkProjectById(id) : null;
    if (!wp) {
        alert('Projet introuvable. Rechargez la page et réessayez.');
        return;
    }
    if (typeof ensureWorkProjectShape === 'function') ensureWorkProjectShape(wp);

    taskFicheReturnTo = { type: 'work_project', projectId: wp.id };
    taskFicheSource = 'work_project';
    taskFicheProjectId = wp.id;
    taskFicheIsCreateMode = true;
    taskFicheTaskId = taskFicheNewId('task');
    taskFicheDraftWp = wp;
    taskFicheDraftTask = {
        id: taskFicheTaskId,
        title: '',
        description: '',
        dueDate: null,
        assignedTo: currentUser && currentUser.id ? [String(currentUser.id)] : [],
        status: 'todo',
        completed: false,
        notes: '',
        documents: [],
        activities: [],
        projectId: wp.id,
        projectType: 'work_project',
        createdBy: currentUser ? currentUser.id : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    var page = document.getElementById('taskFichePage');
    if (!page) return;
    page.classList.add('active');
    renderTaskFiche();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
window.openNewWorkProjectTaskFiche = openNewWorkProjectTaskFiche;

function cancelTaskFicheCreate() {
    if (taskFicheIsCreateMode && taskFicheDraftTask) {
        var hasContent = taskFicheDraftTask.title || taskFicheDraftTask.description ||
            (taskFicheDraftTask.notes && taskFicheDraftTask.notes.trim()) ||
            (taskFicheDraftTask.documents && taskFicheDraftTask.documents.length) ||
            (taskFicheDraftTask.activities && taskFicheDraftTask.activities.length);
        if (hasContent && !confirm('Annuler la création de cette tâche ?')) return;
    }
    taskFicheIsCreateMode = false;
    taskFicheDraftTask = null;
    taskFicheDraftDeal = null;
    closeTaskFiche();
}
window.cancelTaskFicheCreate = cancelTaskFicheCreate;

function clearTaskFicheCreateState() {
    taskFicheIsCreateMode = false;
    taskFicheDraftTask = null;
    taskFicheDraftDeal = null;
    taskFicheDraftWp = null;
}

async function openTaskFiche(source, projectId, taskId) {
    if (!taskId) return;
    clearTaskFicheCreateState();
    taskFicheReturnTo = detectTaskFicheReturnContext();
    taskFicheSource = source;
    taskFicheProjectId = projectId || '';
    taskFicheTaskId = taskId;

    if (source === 'crm_deal' && typeof ensureCrmDataLoaded === 'function') {
        await ensureCrmDataLoaded();
    }
    if (source === 'work_project' && typeof loadWorkProjectsData === 'function') {
        await loadWorkProjectsData();
    }
    if (source === 'personal' && typeof loadMyBureauData === 'function') {
        await loadMyBureauData();
    }

    var page = document.getElementById('taskFichePage');
    if (!page) return;
    page.classList.add('active');
    renderTaskFiche();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
window.openTaskFiche = openTaskFiche;

function closeTaskFiche() {
    var page = document.getElementById('taskFichePage');
    if (page) page.classList.remove('active');

    var ret = taskFicheReturnTo;
    taskFicheSource = null;
    taskFicheProjectId = null;
    taskFicheTaskId = null;
    taskFicheReturnTo = null;
    clearTaskFicheCreateState();

    if (!ret || ret.type === 'bureau') {
        if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
    } else if (ret.type === 'crm_deal' && ret.dealId && typeof openCrmDealFiche === 'function') {
        openCrmDealFiche(ret.dealId);
    } else if (ret.type === 'work_project' && ret.projectId && typeof openWorkProjectPage === 'function') {
        openWorkProjectPage(ret.projectId, { tab: 'tasks' });
    } else if (ret.type === 'home') {
        if (typeof navigateTo === 'function') navigateTo('home');
        else if (typeof renderHomeTasks === 'function') renderHomeTasks();
    }
}
window.closeTaskFiche = closeTaskFiche;

function openDossierFromTaskFiche() {
    var ctx = getTaskFicheContext();
    if (!ctx || ctx.source !== 'crm_deal' || !ctx.dealId) return;
    crmV2DealReturnTaskFiche = {
        source: taskFicheSource,
        projectId: taskFicheProjectId,
        taskId: taskFicheTaskId,
        returnTo: taskFicheReturnTo
    };
    document.getElementById('taskFichePage').classList.remove('active');
    if (typeof openCrmDealFiche === 'function') {
        crmV2DealReturnTo = 'task_fiche';
        openCrmDealFiche(ctx.dealId);
    }
}
window.openDossierFromTaskFiche = openDossierFromTaskFiche;

function openProjectFromTaskFiche() {
    var ctx = getTaskFicheContext();
    if (!ctx || ctx.source !== 'work_project' || !ctx.projectId) return;
    document.getElementById('taskFichePage').classList.remove('active');
    if (typeof openWorkProjectPage === 'function') {
        openWorkProjectPage(ctx.projectId, { tab: 'tasks' });
    }
}
window.openProjectFromTaskFiche = openProjectFromTaskFiche;

function reopenTaskFicheFromDeal() {
    if (!crmV2DealReturnTaskFiche) return false;
    var saved = crmV2DealReturnTaskFiche;
    crmV2DealReturnTaskFiche = null;
    taskFicheReturnTo = saved.returnTo || detectTaskFicheReturnContext();
    openTaskFiche(saved.source, saved.projectId, saved.taskId);
    return true;
}

function getTaskFicheStatusLabel(status) {
    if (status === 'done') return 'Terminée';
    if (status === 'in_progress' || status === 'inprogress') return 'En cours';
    return 'À faire';
}

function setTaskFicheDescriptionValue(text) {
    var el = document.getElementById('taskFicheDescription');
    if (!el) return;
    if (el.isContentEditable && typeof replaceMentionTokensWithChips === 'function') {
        el.innerHTML = replaceMentionTokensWithChips(text || '');
    } else if ('value' in el) {
        el.value = text || '';
    }
    if (typeof initAppMentionField === 'function') initAppMentionField(el);
}

function getTaskFicheDescriptionValue() {
    var el = document.getElementById('taskFicheDescription');
    if (!el) return '';
    if (typeof getMentionFieldPlainText === 'function') return getMentionFieldPlainText(el).trim();
    return (el.value || el.textContent || '').trim();
}

function renderTaskFiche() {
    var ctx = getTaskFicheContext();
    if (!ctx) {
        var list = document.getElementById('taskFicheDocuments');
        if (list) list.innerHTML = '<div class="crm-fiche-empty">Tâche introuvable.</div>';
        return;
    }

    var task = ctx.task;
    var titleEl = document.getElementById('taskFicheTitle');
    var subtitleEl = document.getElementById('taskFicheSubtitle');
    var backBtn = document.getElementById('taskFicheBackBtn');
    var dossierBtn = document.getElementById('taskFicheDossierBtn');
    var toggleBtn = document.getElementById('taskFicheToggleDoneBtn');

    if (titleEl) titleEl.textContent = ctx.isCreate ? 'Nouvelle tâche' : (task.title || 'Sans titre');
    if (subtitleEl) {
        var parts = [];
        parts.push('📅 ' + (task.dueDate ? taskFicheFormatDate(task.dueDate) : 'Sans échéance'));
        parts.push(getTaskFicheStatusLabel(task.status || (task.completed ? 'done' : 'todo')));
        if (ctx.dealTitle) parts.push('📂 ' + ctx.dealTitle);
        else if (ctx.projectTitle) parts.push('📁 ' + ctx.projectTitle);
        subtitleEl.textContent = parts.join(' · ');
    }
    if (backBtn) {
        if (taskFicheReturnTo && taskFicheReturnTo.type === 'crm_deal') backBtn.textContent = '← Retour au dossier';
        else if (taskFicheReturnTo && taskFicheReturnTo.type === 'work_project') backBtn.textContent = '← Retour au projet';
        else if (taskFicheReturnTo && taskFicheReturnTo.type === 'home') backBtn.textContent = '← Retour accueil';
        else backBtn.textContent = '← Retour aux tâches';
    }
    if (dossierBtn) {
        if (ctx.source === 'crm_deal') {
            dossierBtn.style.display = '';
            dossierBtn.textContent = '📂 ' + (ctx.dealTitle || 'Voir le dossier');
            dossierBtn.onclick = openDossierFromTaskFiche;
        } else if (ctx.source === 'work_project') {
            dossierBtn.style.display = '';
            dossierBtn.textContent = '📁 ' + (ctx.projectTitle || 'Voir le projet');
            dossierBtn.onclick = openProjectFromTaskFiche;
        } else {
            dossierBtn.style.display = 'none';
        }
    }
    if (toggleBtn) {
        toggleBtn.style.display = ctx.isCreate ? 'none' : '';
        if (!ctx.isCreate) {
            var isDone = task.status === 'done' || task.completed;
            toggleBtn.textContent = isDone ? '↩️ Rouvrir la tâche' : '✅ Marquer terminée';
        }
    }

    var saveBtn = document.getElementById('taskFicheSaveBtn');
    if (saveBtn) saveBtn.textContent = ctx.isCreate ? '✓ Créer la tâche' : 'Enregistrer';

    var deleteBtn = document.getElementById('taskFicheDeleteBtn');
    if (deleteBtn) {
        if (ctx.isCreate) {
            deleteBtn.textContent = 'Annuler';
            deleteBtn.style.color = '';
            deleteBtn.onclick = cancelTaskFicheCreate;
        } else {
            deleteBtn.textContent = 'Supprimer';
            deleteBtn.style.color = '#e53e3e';
            deleteBtn.onclick = deleteTaskFiche;
        }
    }

    document.getElementById('taskFicheTitleInput').value = task.title || '';
    setTaskFicheDescriptionValue(task.description || '');
    document.getElementById('taskFicheDueDate').value = task.dueDate ? String(task.dueDate).slice(0, 10) : '';
    var statusVal = task.status === 'inprogress' ? 'in_progress' : (task.status || (task.completed ? 'done' : 'todo'));
    document.getElementById('taskFicheStatus').value = statusVal;
    document.getElementById('taskFicheNotes').value = task.notes || '';

    var assigneeGroup = document.getElementById('taskFicheAssigneeGroup');
    var assigneeEl = document.getElementById('taskFicheAssignee');
    if (assigneeGroup && assigneeEl) {
        assigneeGroup.style.display = '';
        var assigneeId = (task.assignedTo && task.assignedTo[0]) || task.assignedTo || '';
        if (typeof populateCrmUserSelect === 'function') {
            populateCrmUserSelect(assigneeEl, assigneeId ? String(assigneeId) : '', true);
        } else if (typeof populateAssigneeSelect === 'function') {
            populateAssigneeSelect('taskFicheAssignee', assigneeId ? String(assigneeId) : null);
        }
    }

    renderTaskFicheDocuments(task);
    renderTaskFicheActivities(task);
}

function taskFicheGetDocFileId(doc) {
    if (!doc) return null;
    if (doc.file_id) return doc.file_id;
    if (typeof extractUploadFileId === 'function') {
        return extractUploadFileId(doc.downloadUrl || doc.url);
    }
    var raw = doc.downloadUrl || doc.url || '';
    var m = String(raw).match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

function openTaskFicheDocument(docId) {
    var ctx = getTaskFicheContext();
    if (!ctx) return;
    var doc = (ctx.task.documents || []).find(function(d) { return String(d.id) === String(docId); });
    if (!doc) return;
    var fileId = taskFicheGetDocFileId(doc);
    if (!fileId) {
        alert('Fichier inaccessible');
        return;
    }
    if (typeof openUploadedFile === 'function') {
        openUploadedFile(fileId, {
            name: doc.fileName || doc.name || 'Fichier',
            type: doc.fileType || doc.mimeType || ''
        });
        return;
    }
    var url = typeof getDownloadFileUrl === 'function' ? getDownloadFileUrl(fileId) : (doc.downloadUrl || doc.url);
    if (url) window.open(url, '_blank', 'noopener');
}
window.openTaskFicheDocument = openTaskFicheDocument;

function renderTaskFicheDocuments(task) {
    var container = document.getElementById('taskFicheDocuments');
    if (!container) return;
    ensureTaskFicheShape(task);
    var docs = task.documents || [];
    if (!docs.length) {
        container.innerHTML = '<div class="crm-fiche-empty">Aucun fichier. Ajoutez un document ci-dessous.</div>';
        return;
    }
    container.innerHTML = '<div class="crm-deal-doc-list">' + docs.map(function(doc) {
        var fileId = taskFicheGetDocFileId(doc);
        return '<div class="crm-deal-doc-item">' +
            '<span class="crm-deal-doc-icon">📎</span>' +
            '<div class="crm-deal-doc-info">' +
            '<div class="crm-deal-doc-title">' + taskFicheEsc(doc.name || doc.fileName || 'Fichier') + '</div>' +
            '<div class="crm-deal-doc-meta">' + (doc.fileSize ? (doc.fileSize / 1024).toFixed(0) + ' Ko' : '') + '</div></div>' +
            '<div class="crm-deal-doc-actions">' +
            (fileId ? '<button type="button" class="btn btn-secondary" style="font-size:0.78rem;padding:0.25rem 0.5rem;" onclick="openTaskFicheDocument(\'' + taskFicheEsc(doc.id) + '\')">Ouvrir</button>' : '') +
            '<button type="button" class="crm-activity-action crm-activity-action--danger" onclick="deleteTaskFicheDocument(\'' + taskFicheEsc(doc.id) + '\')" title="Supprimer">🗑️</button>' +
            '</div></div>';
    }).join('') + '</div>';
}

function renderTaskFicheActivities(task) {
    var container = document.getElementById('taskFicheActivities');
    if (!container) return;
    ensureTaskFicheShape(task);
    var acts = (task.activities || []).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (!acts.length) {
        container.innerHTML = '<div class="crm-fiche-empty">Aucune activité. Ajoutez une note, un appel ou un email ci-dessus.</div>';
        return;
    }
    container.innerHTML = acts.map(function(a) {
        var meta = TASK_FICHE_ACTIVITY_TYPES[a.type] || TASK_FICHE_ACTIVITY_TYPES.note;
        var author = a.authorName || (a.authorId && typeof getCrmUserDisplayName === 'function' ? getCrmUserDisplayName(a.authorId) : '—');
        var deleteBtn = a.system || a.type === 'status_change' ? '' :
            '<button type="button" class="crm-activity-action crm-activity-action--danger" onclick="deleteTaskFicheActivity(\'' + taskFicheEsc(a.id) + '\')" title="Supprimer">🗑️</button>';
        return '<div class="crm-activity-item' + (a.type === 'status_change' ? ' crm-activity-item--status' : '') + '">' +
            '<div class="crm-activity-icon">' + meta.icon + '</div>' +
            '<div class="crm-activity-body">' +
            '<div class="crm-activity-meta-row">' +
            '<div class="crm-activity-meta"><strong>' + taskFicheEsc(meta.label) + '</strong> · ' + taskFicheEsc(author) + ' · ' + taskFicheFormatDateTime(a.createdAt) + '</div>' +
            '<div class="crm-activity-actions">' +
            deleteBtn +
            '</div></div>' +
            '<div class="crm-activity-text">' + taskFicheEsc(a.text || '').replace(/\n/g, '<br>') + '</div>' +
            '</div></div>';
    }).join('');
}

async function persistTaskFichePersonal(task, extra) {
    var payload = Object.assign({ id: task.id }, extra || {});
    await apiCall('personal_tasks.php', 'PUT', payload);
}

async function persistTaskFicheWorkProject(ctx) {
    var wp = typeof getWorkProjectById === 'function'
        ? getWorkProjectById(ctx.projectId || (ctx.wp && ctx.wp.id))
        : ctx.wp;
    if (!wp) throw new Error('Projet introuvable');
    if (typeof ensureWorkProjectShape === 'function') ensureWorkProjectShape(wp);
    ensureTaskFicheShape(ctx.task);
    ctx.task.projectId = wp.id;
    ctx.task.projectType = 'work_project';
    var idx = (wp.tasks || []).findIndex(function(t) { return String(t.id) === String(ctx.task.id); });
    if (idx >= 0) Object.assign(wp.tasks[idx], ctx.task);
    else (wp.tasks || (wp.tasks = [])).unshift(ctx.task);
    ctx.wp = wp;
    wp.updatedAt = new Date().toISOString();
    ctx.task.updatedAt = new Date().toISOString();
    if (typeof saveTaskToWorkProjectStorage === 'function') saveTaskToWorkProjectStorage(ctx.task);
    if (typeof saveWorkProjectsData === 'function') await saveWorkProjectsData();
    if (typeof loadAllTasks === 'function') loadAllTasks();
    if (typeof renderHomeTasksList === 'function') renderHomeTasksList();
    else if (typeof renderHomeTasksWidget === 'function') renderHomeTasksWidget();
    if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
    if (typeof updateTasksBadge === 'function') updateTasksBadge();
    if (typeof wpCurrentId !== 'undefined' && wpCurrentId === wp.id && typeof renderWorkProjectPage === 'function') {
        renderWorkProjectPage();
    }
}

async function refreshTaskFicheViews(ctx) {
    if (ctx && ctx.source === 'work_project') {
        if (typeof loadAllTasks === 'function') loadAllTasks();
        if (typeof renderHomeTasksList === 'function') renderHomeTasksList();
        else if (typeof renderHomeTasksWidget === 'function') renderHomeTasksWidget();
        if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
        if (typeof wpCurrentId !== 'undefined' && ctx.projectId === wpCurrentId && typeof renderWorkProjectPage === 'function') {
            renderWorkProjectPage();
        }
        return;
    }
    if (typeof refreshCrmDealTasksInTaskViews === 'function') refreshCrmDealTasksInTaskViews();
}

async function persistTaskFicheForContext(ctx, personalExtra) {
    if (ctx.source === 'personal') {
        await persistTaskFichePersonal(ctx.task, personalExtra || {});
        if (typeof loadMyBureauData === 'function') await loadMyBureauData();
    } else if (ctx.source === 'work_project') {
        await persistTaskFicheWorkProject(ctx);
    } else {
        await persistTaskFicheCrm(ctx);
    }
}

async function persistTaskFicheCrm(ctx) {
    if (ctx.dealId || (ctx.deal && ctx.deal.id)) {
        var liveDeal = typeof getCrmDealById === 'function'
            ? getCrmDealById(ctx.dealId || ctx.deal.id)
            : ctx.deal;
        if (liveDeal) {
            ctx.deal = liveDeal;
            if (typeof ensureDealShape === 'function') ensureDealShape(liveDeal);
            var taskInDeal = (liveDeal.tasks || []).find(function(t) {
                return String(t.id) === String(ctx.task.id);
            });
            if (taskInDeal && taskInDeal !== ctx.task) {
                Object.assign(taskInDeal, ctx.task);
                ctx.task = taskInDeal;
            }
        }
    }
    ctx.deal.updatedAt = new Date().toISOString();
    ctx.task.updatedAt = new Date().toISOString();
    if (typeof saveCrmData === 'function') await saveCrmData();
    if (typeof refreshCrmDealTasksInTaskViews === 'function') refreshCrmDealTasksInTaskViews();
    if (typeof renderCrmDealTasks === 'function' && ctx.deal) {
        renderCrmDealTasks(ctx.deal);
    }
}

async function finalizeTaskFicheWorkProjectCreate(ctx) {
    var task = ctx.task;
    var wp = typeof getWorkProjectById === 'function' ? getWorkProjectById(ctx.projectId) : ctx.wp;
    if (!wp) {
        alert('Projet introuvable. Rechargez la page et réessayez.');
        return;
    }
    if (typeof ensureWorkProjectShape === 'function') ensureWorkProjectShape(wp);
    ensureTaskFicheShape(task);
    task.projectId = wp.id;
    task.projectType = 'work_project';
    if (!(wp.tasks || []).some(function(t) { return String(t.id) === String(task.id); })) {
        if (!wp.tasks) wp.tasks = [];
        wp.tasks.unshift(task);
    } else {
        var existingWp = wp.tasks.find(function(t) { return String(t.id) === String(task.id); });
        if (existingWp) Object.assign(existingWp, task);
    }
    wp.updatedAt = new Date().toISOString();
    ctx.wp = wp;
    ctx.projectId = wp.id;
    taskFicheProjectId = wp.id;
    clearTaskFicheCreateState();
    if (task.assignedTo && task.assignedTo.length && typeof notifyNewTaskAssignees === 'function') {
        notifyNewTaskAssignees(task, [], wp.title || 'Projet');
    } else if (task.assignedTo && task.assignedTo.length && typeof notifyUserAssigned === 'function') {
        task.assignedTo.forEach(function(uid) {
            notifyUserAssigned(uid, 'Nouvelle tâche assignée',
                '« ' + task.title + ' » — projet « ' + (wp.title || 'Sans titre') + ' ».',
                'assignment', { type: 'task', projectId: wp.id, taskId: task.id });
        });
    }
    await persistTaskFicheWorkProject(ctx);
}

async function finalizeTaskFicheCreate(ctx) {
    var task = ctx.task;
    var dealId = ctx.dealId || (ctx.deal && ctx.deal.id);
    var deal = typeof getCrmDealById === 'function' ? getCrmDealById(dealId) : ctx.deal;
    if (!deal) {
        alert('Dossier introuvable. Rechargez la page et réessayez.');
        return;
    }
    if (typeof ensureDealShape === 'function') ensureDealShape(deal);
    ensureTaskFicheShape(task);
    if (!(deal.tasks || []).some(function(t) { return String(t.id) === String(task.id); })) {
        deal.tasks.unshift(task);
    } else {
        var existing = deal.tasks.find(function(t) { return String(t.id) === String(task.id); });
        if (existing) Object.assign(existing, task);
    }
    deal.updatedAt = new Date().toISOString();
    ctx.deal = deal;
    ctx.dealId = deal.id;
    taskFicheProjectId = 'crm_' + deal.id;
    clearTaskFicheCreateState();
    if (task.assignedTo && task.assignedTo.length && typeof notifyUserAssigned === 'function') {
        task.assignedTo.forEach(function(uid) {
            notifyUserAssigned(uid, 'Nouvelle tâche CRM',
                '« ' + task.title + ' » — dossier « ' + (deal.title || 'Sans titre') + ' ».',
                'assignment', { type: 'crm_task', crmDealId: deal.id, taskId: task.id });
        });
    }
    await persistTaskFicheCrm(ctx);
}

async function finalizeTaskFichePersonalCreate(ctx) {
    var task = ctx.task;
    ensureTaskFicheShape(task);
    var assigneeId = task.assignedTo && task.assignedTo.length
        ? (Array.isArray(task.assignedTo) ? task.assignedTo[0] : task.assignedTo)
        : null;
    var payload = {
        id: task.id,
        title: task.title,
        description: task.description || '',
        category: task.category || '',
        priority: task.priority || 'medium',
        dueDate: task.dueDate || null,
        assignedTo: assigneeId || null,
        status: task.status || 'todo',
        completed: !!task.completed
    };
    await apiCall('personal_tasks.php', 'POST', payload);
    if (task.notes || (task.documents && task.documents.length) || (task.activities && task.activities.length)) {
        await apiCall('personal_tasks.php', 'PUT', {
            id: task.id,
            notes: task.notes || '',
            documents: task.documents || [],
            activities: task.activities || []
        });
    }
    if (assigneeId && typeof notifyUserAssigned === 'function') {
        notifyUserAssigned(assigneeId, 'Tâche assignée',
            'Vous avez été assigné(e) à la tâche « ' + task.title + ' ».',
            'assignment', { type: 'bureau_task' });
    }
    clearTaskFicheCreateState();
    taskFicheTaskId = task.id;
    if (typeof loadMyBureauData === 'function') await loadMyBureauData();
    if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
    if (typeof renderHomeTasksList === 'function') renderHomeTasksList();
}

async function saveTaskFicheInfo() {
    var ctx = getTaskFicheContext();
    if (!ctx) return;
    var task = ctx.task;
    var title = document.getElementById('taskFicheTitleInput').value.trim();
    if (!title) { alert('Le titre est obligatoire.'); return; }

    task.title = title;
    task.description = getTaskFicheDescriptionValue();
    task.dueDate = document.getElementById('taskFicheDueDate').value || null;
    var prevStatus = task.status === 'inprogress' ? 'in_progress' : (task.status || (task.completed ? 'done' : 'todo'));
    var status = document.getElementById('taskFicheStatus').value || 'todo';
    if (!ctx.isCreate && typeof appendTaskStatusChangeActivity === 'function' && prevStatus !== status) {
        appendTaskStatusChangeActivity(task, prevStatus, status);
    }
    task.status = status;
    task.completed = status === 'done';
    task.notes = document.getElementById('taskFicheNotes').value.trim();

    var assigneeEl = document.getElementById('taskFicheAssignee');
    if (assigneeEl && assigneeEl.value) {
        task.assignedTo = [assigneeEl.value];
    } else if (ctx.source === 'personal') {
        task.assignedTo = null;
    }

    try {
        if (ctx.isCreate) {
            if (ctx.source === 'work_project') await finalizeTaskFicheWorkProjectCreate(ctx);
            else if (ctx.source === 'personal') await finalizeTaskFichePersonalCreate(ctx);
            else await finalizeTaskFicheCreate(ctx);
            renderTaskFiche();
            if (typeof showToast === 'function') showToast('Tâche créée', 'success');
            return;
        }
        if (ctx.source === 'personal') {
            await persistTaskFichePersonal(task, {
                title: task.title,
                description: task.description,
                dueDate: task.dueDate,
                completed: task.completed,
                status: task.status,
                assignedTo: task.assignedTo ? (Array.isArray(task.assignedTo) ? task.assignedTo[0] : task.assignedTo) : null,
                activities: task.activities || []
            });
            if (typeof loadMyBureauData === 'function') await loadMyBureauData();
        } else if (ctx.source === 'work_project') {
            await persistTaskFicheWorkProject(ctx);
        } else {
            await persistTaskFicheCrm(ctx);
        }
        renderTaskFiche();
        if (typeof showToast === 'function') showToast('Tâche enregistrée', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de sauvegarder'));
    }
}
window.saveTaskFicheInfo = saveTaskFicheInfo;

async function saveTaskFicheNotes() {
    var ctx = getTaskFicheContext();
    if (!ctx) return;
    ctx.task.notes = document.getElementById('taskFicheNotes').value.trim();
    if (ctx.isCreate) {
        if (typeof showToast === 'function') showToast('Notes enregistrées (créez la tâche pour valider)', 'info');
        return;
    }
    try {
        await persistTaskFicheForContext(ctx, { notes: ctx.task.notes });
        if (typeof showToast === 'function') showToast('Notes enregistrées', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de sauvegarder'));
    }
}
window.saveTaskFicheNotes = saveTaskFicheNotes;

async function toggleTaskFicheStatus() {
    var ctx = getTaskFicheContext();
    if (!ctx) return;
    var task = ctx.task;
    var isDone = task.status === 'done' || task.completed;
    var prevStatus = task.status === 'inprogress' ? 'in_progress' : (task.status || (task.completed ? 'done' : 'todo'));
    if (isDone) {
        task.status = 'todo';
        task.completed = false;
    } else {
        task.status = 'done';
        task.completed = true;
    }
    if (!ctx.isCreate && typeof appendTaskStatusChangeActivity === 'function') {
        appendTaskStatusChangeActivity(task, prevStatus, task.status);
    }
    try {
        if (ctx.source === 'personal') {
            await persistTaskFichePersonal(task, {
                completed: task.completed,
                status: task.status,
                activities: task.activities || []
            });
        } else {
            await persistTaskFicheForContext(ctx, {
                completed: task.completed,
                status: task.status,
                activities: task.activities
            });
        }
        renderTaskFiche();
        if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
        if (typeof showToast === 'function') showToast(task.completed ? 'Tâche terminée' : 'Tâche rouverte', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de mettre à jour'));
    }
}
window.toggleTaskFicheStatus = toggleTaskFicheStatus;

async function handleTaskFicheFileUpload(event) {
    var ctx = getTaskFicheContext();
    if (!ctx || !event.target.files || !event.target.files.length) return;
    var file = event.target.files[0];
    if (typeof uploadFile !== 'function') {
        alert('Upload non disponible.');
        event.target.value = '';
        return;
    }
    try {
        if (typeof showToast === 'function') showToast('Envoi en cours…', 'info');
        var uploaded = await uploadFile(file, 'documents');
        ensureTaskFicheShape(ctx.task);
        ctx.task.documents.unshift({
            id: taskFicheNewId('tdoc'),
            name: file.name.replace(/\.[^/.]+$/, ''),
            file_id: uploaded.file_id,
            url: uploaded.url,
            downloadUrl: uploaded.downloadUrl,
            fileName: uploaded.fileName || file.name,
            fileType: uploaded.fileType,
            fileSize: uploaded.fileSize,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentUser ? currentUser.id : null
        });
        if (ctx.isCreate) {
            renderTaskFicheDocuments(ctx.task);
            if (typeof showToast === 'function') showToast('Fichier ajouté (créez la tâche pour valider)', 'info');
            event.target.value = '';
            return;
        }
        await persistTaskFicheForContext(ctx, { documents: ctx.task.documents });
        renderTaskFicheDocuments(ctx.task);
        if (typeof showToast === 'function') showToast('Fichier ajouté', 'success');
    } catch (e) {
        console.error(e);
        alert('Erreur upload : ' + (e.message || e));
    }
    event.target.value = '';
}
window.handleTaskFicheFileUpload = handleTaskFicheFileUpload;

async function deleteTaskFicheDocument(docId) {
    if (!confirm('Supprimer ce fichier ?')) return;
    var ctx = getTaskFicheContext();
    if (!ctx) return;
    ctx.task.documents = (ctx.task.documents || []).filter(function(d) { return d.id !== docId; });
    try {
        await persistTaskFicheForContext(ctx, { documents: ctx.task.documents });
        renderTaskFicheDocuments(ctx.task);
        if (typeof showToast === 'function') showToast('Fichier supprimé', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de supprimer'));
    }
}
window.deleteTaskFicheDocument = deleteTaskFicheDocument;

async function addTaskFicheActivity() {
    var ctx = getTaskFicheContext();
    if (!ctx) return;
    var textEl = document.getElementById('taskFicheActivityText');
    var typeEl = document.getElementById('taskFicheActivityType');
    var text = textEl ? textEl.value.trim() : '';
    if (!text) { alert('Saisissez un texte pour l\'activité.'); return; }
    ensureTaskFicheShape(ctx.task);
    var authorName = '';
    if (currentUser) {
        authorName = ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim();
    }
    ctx.task.activities.unshift({
        id: taskFicheNewId('tact'),
        type: typeEl ? typeEl.value : 'note',
        text: text,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    });
    if (ctx.isCreate) {
        if (textEl) textEl.value = '';
        renderTaskFicheActivities(ctx.task);
        if (typeof showToast === 'function') showToast('Activité ajoutée (créez la tâche pour valider)', 'info');
        return;
    }
    try {
        await persistTaskFicheForContext(ctx, { activities: ctx.task.activities });
        if (textEl) textEl.value = '';
        renderTaskFicheActivities(ctx.task);
        if (typeof showToast === 'function') showToast('Activité ajoutée', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible d\'ajouter'));
    }
}
window.addTaskFicheActivity = addTaskFicheActivity;

async function deleteTaskFicheActivity(actId) {
    if (!confirm('Supprimer cette activité ?')) return;
    var ctx = getTaskFicheContext();
    if (!ctx) return;
    ctx.task.activities = (ctx.task.activities || []).filter(function(a) { return a.id !== actId; });
    try {
        await persistTaskFicheForContext(ctx, { activities: ctx.task.activities });
        renderTaskFicheActivities(ctx.task);
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de supprimer'));
    }
}
window.deleteTaskFicheActivity = deleteTaskFicheActivity;

async function deleteTaskFiche() {
    var ctx = getTaskFicheContext();
    if (ctx && ctx.isCreate) {
        cancelTaskFicheCreate();
        return;
    }
    if (!confirm('Supprimer définitivement cette tâche ?')) return;
    if (!ctx) return;
    try {
        if (ctx.source === 'personal') {
            await apiCall('personal_tasks.php', 'DELETE', { id: ctx.task.id });
            if (typeof loadMyBureauData === 'function') await loadMyBureauData();
        } else if (ctx.source === 'work_project') {
            if (typeof deleteTaskFromWorkProject === 'function') deleteTaskFromWorkProject(ctx.projectId, ctx.task.id);
            if (typeof saveWorkProjectsData === 'function') await saveWorkProjectsData();
            if (typeof loadAllTasks === 'function') loadAllTasks();
        } else {
            ctx.deal.tasks = (ctx.deal.tasks || []).filter(function(t) { return t.id !== ctx.task.id; });
            await persistTaskFicheCrm(ctx);
        }
        closeTaskFiche();
        if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
        if (typeof showToast === 'function') showToast('Tâche supprimée', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de supprimer'));
    }
}
window.deleteTaskFiche = deleteTaskFiche;

(function() {
    var origCloseAll = closeAllPages;
    closeAllPages = function() {
        origCloseAll();
        var page = document.getElementById('taskFichePage');
        if (page) page.classList.remove('active');
        taskFicheSource = null;
        taskFicheTaskId = null;
        clearTaskFicheCreateState();
    };
})();
