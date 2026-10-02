// ========== ESPACES DE TRAVAIL (Projets L&Com) ==========
// Distinct des spectacles/tournées — dossiers partagés A→Z

var workProjectsData = { projects: [], templates: [] };
var wpCurrentId = null;
var wpCurrentTab = 'overview';
var wpWorkspaceElements = [];
var wpCurrentWsFolderId = null;
var wpCurrentDocFolderId = null;
var wpCurrentNoteFolderId = null;

var WP_NOTE_TYPES = ['page', 'idea', 'quicknote', 'mindmap', 'drawing'];

function wpParseFolderContent(el) {
    if (!el || el.content == null || el.content === '') return {};
    try {
        return typeof el.content === 'string' ? JSON.parse(el.content) : (el.content || {});
    } catch (e) {
        return {};
    }
}

function isWpNoteFolder(el) {
    return el && el.type === 'folder' && wpParseFolderContent(el).purpose === 'notes';
}

function isWpDocFolder(el) {
    return el && el.type === 'folder' && !isWpNoteFolder(el);
}

function isWpNoteElement(el) {
    return el && WP_NOTE_TYPES.indexOf(el.type) !== -1;
}
var wpEditingTemplate = null;
var wpEditingProject = null;
var wpFormPendingImage = undefined;

function wpNewId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function hasWorkProjectsAccess() {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' && !currentUser.permission_profile_id) return true;
    return typeof hasPermission === 'function' && hasPermission('espaces_travail');
}

function getWorkProjectById(id) {
    if (id == null || id === '') return null;
    var sid = String(id);
    return (workProjectsData.projects || []).find(function(p) { return String(p.id) === sid; }) || null;
}

function wpProjectTimestamp(p) {
    if (!p) return 0;
    var ts = p.updatedAt || p.createdAt;
    var n = ts ? new Date(ts).getTime() : 0;
    return isNaN(n) ? 0 : n;
}

function mergeWorkProjectsFromServer(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    var localProjects = workProjectsData.projects || [];
    var serverProjects = incoming.projects || [];
    var localById = {};
    localProjects.forEach(function(p) { localById[String(p.id)] = p; });
    var serverIds = {};
    var mergedProjects = serverProjects.map(function(serverP) {
        serverIds[String(serverP.id)] = true;
        var localP = localById[String(serverP.id)];
        if (!localP) return serverP;
        return wpProjectTimestamp(localP) > wpProjectTimestamp(serverP) ? localP : serverP;
    });
    localProjects.forEach(function(localP) {
        if (!serverIds[String(localP.id)]) mergedProjects.push(localP);
    });
    workProjectsData.projects = mergedProjects;
    if (Array.isArray(incoming.templates) && incoming.templates.length) {
        workProjectsData.templates = incoming.templates;
    } else if (!workProjectsData.templates) {
        workProjectsData.templates = [];
    }
}

function getActiveWorkProjects() {
    return (workProjectsData.projects || []).filter(function(p) { return !p.archived; });
}

function getAccessibleWorkProjects() {
    if (typeof hasWorkProjectsAccess !== 'function' || !hasWorkProjectsAccess()) return [];
    if (currentUser && currentUser.role === 'admin' && !currentUser.permission_profile_id) {
        return getActiveWorkProjects();
    }
    var uid = currentUser ? String(currentUser.id) : '';
    return getActiveWorkProjects().filter(function(p) {
        var members = (p.members || []).map(String);
        if (!members.length) return true;
        return uid && members.indexOf(uid) !== -1;
    });
}

function getWpUserName(userId) {
    if (!userId) return '—';
    var u = (typeof allUsers !== 'undefined' ? allUsers : []).find(function(x) { return String(x.id) === String(userId); });
    if (!u) return 'Utilisateur #' + userId;
    return ((u.prenom || '') + ' ' + (u.nom || u.username || '')).trim() || u.username;
}

async function getDefaultWpProjectMemberIds() {
    if (typeof loadUsersForAssignments === 'function') {
        try { await loadUsersForAssignments(); } catch (e) { /* ignore */ }
    }
    var users = typeof allUsers !== 'undefined' ? allUsers : [];
    if (!users.length) return currentUser ? [String(currentUser.id)] : [];
    return users.map(function(u) { return String(u.id); });
}

function populateWpUserSelect(sel, selectedId, emptyLabel) {
    if (!sel) return;
    var html = '<option value="">' + (emptyLabel || '— Non assigné —') + '</option>';
    (typeof allUsers !== 'undefined' ? allUsers : []).forEach(function(u) {
        var s = String(selectedId) === String(u.id) ? ' selected' : '';
        html += '<option value="' + u.id + '"' + s + '>' + escHtml(getWpUserName(u.id)) + '</option>';
    });
    sel.innerHTML = html;
}

// --- Persistance ---
var _wpDataLoadedFromServer = false;
var _wpServerProjectIds = null;
var _wpSaveQueue = Promise.resolve();

async function loadWorkProjectsData(options) {
    options = options || {};
    try {
        var data = await apiCall('work_projects.php', 'GET');
        if (data && data.workProjects) {
            if (_wpDataLoadedFromServer && !options.force && (workProjectsData.projects || []).length) {
                mergeWorkProjectsFromServer(data.workProjects);
            } else {
                workProjectsData = data.workProjects;
                if (!workProjectsData.projects) workProjectsData.projects = [];
                if (!workProjectsData.templates) workProjectsData.templates = [];
            }
            _wpDataLoadedFromServer = true;
            _wpServerProjectIds = (workProjectsData.projects || []).map(function(p) { return String(p.id); }).sort().join(',');
        }
    } catch (e) {
        console.warn('loadWorkProjectsData:', e);
    }
    if (typeof crmData !== 'undefined' && crmData.deals) repairCrmDealWorkProjectRefs();
    if (typeof appSettings !== 'undefined') appSettings.workProjects = workProjectsData;
}

async function saveWorkProjectsData(options) {
    options = options || {};
    if (!_wpDataLoadedFromServer && !options.force) {
        console.warn('saveWorkProjectsData ignoré: projets pas encore chargés depuis le serveur');
        return false;
    }
    var projectCount = (workProjectsData.projects || []).length;
    if (
        !options.allowEmpty &&
        projectCount === 0 &&
        _wpServerProjectIds &&
        _wpServerProjectIds.length > 0
    ) {
        console.error('saveWorkProjectsData bloqué: tentative d\'écraser des projets avec une liste vide');
        await loadWorkProjectsData();
        return false;
    }

    if (typeof appSettings !== 'undefined') appSettings.workProjects = workProjectsData;

    var runSave = async function() {
        try {
            await apiCall('work_projects.php', 'POST', { workProjects: workProjectsData });
            _wpServerProjectIds = (workProjectsData.projects || []).map(function(p) { return String(p.id); }).sort().join(',');
            return true;
        } catch (e) {
            console.error('saveWorkProjectsData:', e);
            alert('Erreur sauvegarde projets: ' + (e.message || e));
            return false;
        }
    };

    _wpSaveQueue = _wpSaveQueue.then(runSave, runSave);
    return _wpSaveQueue;
}

function resetWorkProjectsClientState() {
    workProjectsData = { projects: [], templates: [] };
    _wpDataLoadedFromServer = false;
    _wpServerProjectIds = null;
    _wpSaveQueue = Promise.resolve();
}

function ensureWorkProjectShape(p) {
    if (!p.members) p.members = [];
    if (!p.tasks) p.tasks = [];
    if (!p.activities) p.activities = [];
    if (!p.crm) p.crm = { listIds: [], prospectIds: [], dealIds: [] };
    if (!p.crm.listIds) p.crm.listIds = [];
    if (!p.crm.prospectIds) p.crm.prospectIds = [];
    if (!p.crm.dealIds) p.crm.dealIds = [];
}

function getWpProjectImageUrl(project) {
    if (!project || !project.image) return '';
    if (typeof getFileDisplayUrl === 'function') return getFileDisplayUrl(project.image);
    var img = project.image;
    return img.url || img.downloadUrl || '';
}

function buildWpProjectIconHtml(project, variant) {
    variant = variant || 'card';
    var url = getWpProjectImageUrl(project);
    if (url) {
        var cls = variant === 'header' ? 'wp-page-title-img' : 'wp-card-icon-img';
        var wrapCls = variant === 'header' ? 'wp-page-title-visual wp-page-title-visual--image' : 'wp-card-icon wp-card-icon--image';
        return '<div class="' + wrapCls + '"><img src="' + escHtml(url) + '" alt="" class="' + cls + '"></div>';
    }
    var icon = escHtml((project && project.icon) || '📁');
    if (variant === 'header') {
        return '<span class="wp-page-title-visual wp-page-title-visual--icon">' + icon + '</span>';
    }
    return '<div class="wp-card-icon">' + icon + '</div>';
}

function renderWpFormImagePreview() {
    var preview = document.getElementById('wpFormImagePreview');
    var removeBtn = document.getElementById('wpFormImageRemoveBtn');
    var fileInput = document.getElementById('wpFormImageInput');
    if (!preview) return;
    var imageRef = wpFormPendingImage !== undefined
        ? wpFormPendingImage
        : (wpEditingProject && wpEditingProject.image ? wpEditingProject.image : null);
    if (imageRef) {
        var url = getWpProjectImageUrl({ image: imageRef });
        preview.innerHTML = url
            ? '<img src="' + escHtml(url) + '" alt="" class="wp-form-image-preview-img">'
            : '<span class="wp-form-image-preview-fallback">' + escHtml((wpEditingProject && wpEditingProject.icon) || '📁') + '</span>';
        if (removeBtn) removeBtn.style.display = '';
    } else {
        preview.innerHTML = '<span class="wp-form-image-preview-empty">' + escHtml((wpEditingProject && wpEditingProject.icon) || '📁') + '</span>';
        if (removeBtn) removeBtn.style.display = 'none';
    }
    if (fileInput) fileInput.value = '';
}

async function handleWpProjectImageSelect(e) {
    var file = e && e.target && e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
        alert('Veuillez choisir une image (JPEG, PNG, GIF ou WebP).');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('L\'image ne doit pas dépasser 5 Mo.');
        return;
    }
    if (typeof uploadFile !== 'function') {
        alert('Upload indisponible.');
        return;
    }
    try {
        var uploaded = await uploadFile(file, 'visuels');
        wpFormPendingImage = uploaded;
        renderWpFormImagePreview();
    } catch (err) {
        console.error(err);
        alert('Erreur lors de l\'envoi de l\'image.');
    }
}

function removeWpFormImage() {
    wpFormPendingImage = null;
    renderWpFormImagePreview();
}

function logWpActivity(project, type, text) {
    ensureWorkProjectShape(project);
    var authorName = currentUser ? getWpUserName(currentUser.id) : '—';
    project.activities.unshift({
        id: wpNewId('act'),
        type: type || 'info',
        text: text,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    });
    if (project.activities.length > 200) project.activities.length = 200;
}

// --- Navigation liste ---
function setWorkProjectsNavActive(mode) {
    var dash = document.getElementById('navWorkProjectsDashboard');
    if (dash) dash.classList.toggle('active', mode === 'dashboard' || mode === 'project');
}

function openWorkProjectsListPage() {
    if (!hasWorkProjectsAccess()) { alert("Vous n'avez pas accès aux projets."); return; }
    closeAllPages();
    document.getElementById('homeWelcome').style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    setWorkProjectsNavActive('dashboard');
    document.getElementById('workProjectsListPage').classList.add('active');
    if (typeof renderHomeWelcomeLogo === 'function') {
        renderHomeWelcomeLogo(document.getElementById('workProjectsModuleHeroLogo'), '📁');
    }
    renderWorkProjectsList();
    closeSidebarOnMobile();
}

function closeWorkProjectsListPage() {
    document.getElementById('workProjectsListPage').classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    var home = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (home) home.classList.add('active');
    document.getElementById('homeWelcome').style.display = '';
    if (typeof updateHomeTiles === 'function') updateHomeTiles();
}

function renderWorkProjectsList(filter) {
    var grid = document.getElementById('workProjectsGrid');
    var empty = document.getElementById('workProjectsEmpty');
    if (!grid) return;
    var q = (filter || '').toLowerCase();
    var list = getActiveWorkProjects().filter(function(p) {
        return !q || (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    });
    list.sort(function(a, b) { return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt); });
    var stat = document.getElementById('wpListCount');
    if (stat) stat.textContent = list.length;
    if (!list.length) {
        grid.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = list.map(function(p) {
        var openTasks = (p.tasks || []).filter(function(t) { return !t.completed && t.status !== 'done'; }).length;
        var color = p.color || '#4a90d9';
        return '<div class="wp-card" style="--wp-color:' + escHtml(color) + '" onclick="openWorkProjectPage(\'' + p.id + '\')">' +
            buildWpProjectIconHtml(p, 'card') +
            '<div class="wp-card-body">' +
            '<div class="wp-card-title">' + escHtml(p.title) + '</div>' +
            '<div class="wp-card-desc">' + escHtml(p.description || 'Sans description') + '</div>' +
            '<div class="wp-card-meta"><span>' + openTasks + ' tâche' + (openTasks !== 1 ? 's' : '') + '</span></div></div>' +
            '<div class="wp-card-actions" onclick="event.stopPropagation()">' +
            '<button type="button" title="Modifier" onclick="openWorkProjectModal(\'' + p.id + '\')">✏️</button>' +
            '<button type="button" title="Archiver" onclick="archiveWorkProject(\'' + p.id + '\')">📦</button></div></div>';
    }).join('');
}

function filterWorkProjectsList(v) { renderWorkProjectsList(v); }

// --- CRUD projet ---
function openWorkProjectModal(projectId) {
    var pid = projectId != null && projectId !== '' ? String(projectId) : '';
    wpEditingProject = pid ? getWorkProjectById(pid) : null;
    wpFormPendingImage = undefined;
    document.getElementById('wpModalTitle').textContent = wpEditingProject ? '✏️ Modifier le projet' : '📁 Nouveau projet';
    document.getElementById('wpFormTitle').value = wpEditingProject ? wpEditingProject.title : '';
    document.getElementById('wpFormDescription').value = wpEditingProject ? (wpEditingProject.description || '') : '';
    document.getElementById('wpFormColor').value = wpEditingProject ? (wpEditingProject.color || '#4a90d9') : '#4a90d9';
    document.getElementById('wpFormIcon').value = wpEditingProject ? (wpEditingProject.icon || '📁') : '📁';
    var tplSel = document.getElementById('wpFormTemplate');
    if (tplSel) {
        var templates = (workProjectsData.templates || []).sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
        tplSel.innerHTML = '<option value="">— Vide —</option>' + templates.map(function(t) {
            var sel = wpEditingProject && wpEditingProject.templateId === t.id ? ' selected' : '';
            return '<option value="' + t.id + '"' + sel + '>' + escHtml((t.icon || '') + ' ' + t.name) + '</option>';
        }).join('');
        tplSel.disabled = !!wpEditingProject;
    }
    renderWpFormImagePreview();
    document.getElementById('wpProjectModal').classList.add('active');
}

function closeWorkProjectModal() {
    document.getElementById('wpProjectModal').classList.remove('active');
    wpEditingProject = null;
    wpFormPendingImage = undefined;
}

async function saveWorkProjectForm(e) {
    if (e) e.preventDefault();
    var title = document.getElementById('wpFormTitle').value.trim();
    if (!title) return;
    var payload = {
        title: title,
        description: document.getElementById('wpFormDescription').value.trim(),
        color: document.getElementById('wpFormColor').value || '#4a90d9',
        icon: document.getElementById('wpFormIcon').value.trim() || '📁',
        updatedAt: new Date().toISOString()
    };
    var savedProjectId = null;
    if (wpEditingProject) {
        savedProjectId = wpEditingProject.id;
        var target = getWorkProjectById(savedProjectId) || wpEditingProject;
        Object.assign(target, payload);
        wpEditingProject = target;
        if (wpFormPendingImage !== undefined) {
            if (wpFormPendingImage) target.image = wpFormPendingImage;
            else delete target.image;
        }
        logWpActivity(target, 'edit', 'Projet modifié');
    } else {
        var tplId = document.getElementById('wpFormTemplate').value;
        var tpl = tplId ? (workProjectsData.templates || []).find(function(t) { return t.id === tplId; }) : null;
        var memberIds = await getDefaultWpProjectMemberIds();
        var p = Object.assign({
            id: wpNewId('wp'),
            members: memberIds,
            tasks: [],
            activities: [],
            crm: { listIds: [], prospectIds: [], dealIds: [] },
            archived: false,
            templateId: tplId || null,
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.id : null
        }, payload);
        ensureWorkProjectShape(p);
        if (tpl && tpl.defaultTasks) {
            var tplTasks = typeof applyTemplateDueDates === 'function'
                ? applyTemplateDueDates(tpl.defaultTasks, new Date())
                : tpl.defaultTasks;
            p.tasks = tplTasks.map(function(t, i) {
                return {
                    id: wpNewId('task'),
                    title: t.title,
                    description: t.description || '',
                    assignedTo: currentUser ? [String(currentUser.id)] : [],
                    status: 'todo',
                    completed: false,
                    priority: t.priority || 'normal',
                    dueDate: t.dueDate || null,
                    order: i,
                    createdAt: new Date().toISOString(),
                    createdBy: currentUser ? currentUser.id : null
                };
            });
        }
        if (tpl) {
            p.color = tpl.color || p.color;
            p.icon = tpl.icon || p.icon;
        }
        if (wpFormPendingImage) p.image = wpFormPendingImage;
        logWpActivity(p, 'create', 'Projet créé' + (tpl ? ' depuis le modèle « ' + tpl.name + ' »' : ''));
        workProjectsData.projects.push(p);
        savedProjectId = p.id;
    }
    var ok = await saveWorkProjectsData();
    if (!ok) {
        if (typeof showToast === 'function') showToast('❌ Erreur lors de l\'enregistrement du projet', 'error');
        return;
    }
    closeWorkProjectModal();
    renderWorkProjectsList();
    if (savedProjectId && wpCurrentId && String(wpCurrentId) === String(savedProjectId) &&
        document.getElementById('workProjectPage').classList.contains('active')) {
        renderWorkProjectPage();
    }
}

function archiveWorkProject(id) {
    var p = getWorkProjectById(id);
    if (!p || !confirm('Archiver le projet « ' + p.title + ' » ?')) return;
    p.archived = true;
    p.updatedAt = new Date().toISOString();
    logWpActivity(p, 'archive', 'Projet archivé');
    saveWorkProjectsData();
    renderWorkProjectsList();
}

// --- Fiche projet ---
function openWorkProjectPage(id, options) {
    options = options || {};
    var p = getWorkProjectById(id);
    if (!p) { alert('Projet introuvable.'); return; }
    if (!hasWorkProjectsAccess()) return;
    wpCurrentId = id;
    window.wpCurrentId = id;
    wpCurrentDocFolderId = null;
    wpCurrentNoteFolderId = null;
    if (options.tab) wpCurrentTab = options.tab;
    else if (!document.getElementById('workProjectPage').classList.contains('active')) wpCurrentTab = 'overview';

    if (options.fromNav) {
        closeAllPages();
        document.getElementById('homeWelcome').style.display = 'none';
        document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
        closeSidebarOnMobile();
    }

    document.getElementById('workProjectsListPage').classList.remove('active');
    document.getElementById('workProjectPage').classList.add('active');
    setWorkProjectsNavActive('project');
    renderWorkProjectPage();
}

function closeWorkProjectPage() {
    document.getElementById('workProjectPage').classList.remove('active');
    wpCurrentId = null;
    window.wpCurrentId = null;
    wpCurrentDocFolderId = null;
    wpCurrentNoteFolderId = null;
    wpWorkspaceElements = [];
    document.getElementById('workProjectsListPage').classList.add('active');
    setWorkProjectsNavActive('dashboard');
    renderWorkProjectsList();
}

function switchWpTab(tab) {
    wpCurrentTab = tab;
    renderWorkProjectPage();
}

function renderWorkProjectPage() {
    var p = getWorkProjectById(wpCurrentId);
    if (!p) return;
    ensureWorkProjectShape(p);
    document.getElementById('wpPageTitle').innerHTML =
        buildWpProjectIconHtml(p, 'header') +
        '<span class="wp-page-title-text">' + escHtml(p.title || 'Projet') + '</span>';
    document.getElementById('wpPageSubtitle').textContent = p.description || '';
    document.querySelectorAll('.wp-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === wpCurrentTab);
    });
    var panels = { overview: 'wpPanelOverview', tasks: 'wpPanelTasks', documents: 'wpPanelDocuments', notes: 'wpPanelNotes', commercial: 'wpPanelCommercial' };
    Object.keys(panels).forEach(function(k) {
        var el = document.getElementById(panels[k]);
        if (el) el.style.display = wpCurrentTab === k ? '' : 'none';
    });
    if (wpCurrentTab === 'overview') renderWpOverview(p);
    else if (wpCurrentTab === 'tasks') renderWpTasksPanel(p);
    else if (wpCurrentTab === 'documents') renderWpDocuments(p);
    else if (wpCurrentTab === 'notes') renderWpNotes(p);
    else if (wpCurrentTab === 'commercial') renderWpCommercial(p);
}

function renderWpOverview(p) {
    var openTasks = (p.tasks || []).filter(function(t) { return !t.completed && t.status !== 'done'; });
    var overdue = openTasks.filter(function(t) {
        if (!t.dueDate) return false;
        var d = new Date(t.dueDate); d.setHours(0,0,0,0);
        var today = new Date(); today.setHours(0,0,0,0);
        return d < today;
    });
    var html = '<div class="wp-overview-grid">';
    html += '<div class="wp-overview-stat"><span class="wp-overview-stat-val">' + openTasks.length + '</span><span>Tâches ouvertes</span></div>';
    html += '<div class="wp-overview-stat"><span class="wp-overview-stat-val">' + (p.members || []).length + '</span><span>Membres</span></div>';
    html += '<div class="wp-overview-stat"><span class="wp-overview-stat-val">' + wpGetLinkedDeals(p).length + '</span><span>Dossiers CRM</span></div>';
    if (overdue.length) html += '<div class="wp-overview-stat wp-overview-stat--warn"><span class="wp-overview-stat-val">' + overdue.length + '</span><span>En retard</span></div>';
    html += '</div>';
    if (openTasks.length) {
        html += '<div class="wp-overview-section"><h4>Prochaines tâches</h4><ul class="wp-overview-tasklist">';
        openTasks.slice(0, 5).forEach(function(t) {
            html += '<li onclick="switchWpTab(\'tasks\')">' + escHtml(t.title) + '</li>';
        });
        html += '</ul></div>';
    }
    document.getElementById('wpOverviewContent').innerHTML = html;
    renderWpMembersList(p);
}

function renderWpMembersList(p) {
    var el = document.getElementById('wpMembersList');
    if (!el) return;
    var members = p.members || [];
    if (!members.length) { el.innerHTML = '<span class="wp-muted">Aucun membre</span>'; return; }
    el.innerHTML = members.map(function(uid) {
        return '<span class="wp-member-chip">' + escHtml(getWpUserName(uid)) + '</span>';
    }).join('');
}

async function openWpMembersModal() {
    var p = getWorkProjectById(wpCurrentId);
    if (!p) return;
    await loadUsersForAssignments();
    var current = (p.members || []).map(String);
    var html = '<div class="modal-content" style="max-width:500px;"><h2>👥 Équipe du projet</h2><p style="color:#636e72;font-size:0.9rem;">Tous les membres ont accès complet au contenu du projet.</p><div style="max-height:320px;overflow-y:auto;">';
    (allUsers || []).forEach(function(u) {
        var checked = current.includes(String(u.id)) ? ' checked' : '';
        html += '<label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;"><input type="checkbox" class="wp-member-cb" value="' + u.id + '"' + checked + '> ' + escHtml(getWpUserName(u.id)) + '</label>';
    });
    html += '</div><div class="form-actions" style="margin-top:1rem;"><button type="button" class="btn btn-secondary" onclick="closeWpMembersModal()">Annuler</button><button type="button" class="btn" onclick="saveWpMembers()">Enregistrer</button></div></div>';
    var modal = document.getElementById('wpMembersModal');
    modal.innerHTML = html;
    modal.classList.add('active');
}

function closeWpMembersModal() {
    document.getElementById('wpMembersModal').classList.remove('active');
}

function saveWpMembers() {
    var p = getWorkProjectById(wpCurrentId);
    if (!p) return;
    var checked = Array.from(document.querySelectorAll('.wp-member-cb:checked')).map(function(cb) { return String(cb.value); });
    if (!checked.length && currentUser) checked = [String(currentUser.id)];
    p.members = checked;
    p.updatedAt = new Date().toISOString();
    logWpActivity(p, 'member', 'Équipe mise à jour (' + checked.length + ' membre(s))');
    saveWorkProjectsData();
    closeWpMembersModal();
    renderWpMembersList(p);
}

// --- Tâches (moteur unifié tasks-unified.js) ---
var wpTasksViewMode = 'kanban';
var wpTasksFilterAssignee = '';

async function renderWpTasksPanel(p) {
    if (typeof loadUsersForAssignments === 'function') {
        try { await loadUsersForAssignments(); } catch (e) { /* ignore */ }
    }
    renderWpAssigneeFilter(p);
    renderWpTasks(p);
}

function renderWpAssigneeFilter(p) {
    var sel = document.getElementById('wpTasksAssigneeFilter');
    if (!sel) return;
    var current = wpTasksFilterAssignee || '';
    var memberIds = (p.members || []).map(String);
    (p.tasks || []).forEach(function(t) {
        (t.assignedTo || []).forEach(function(id) {
            var sid = String(id);
            if (memberIds.indexOf(sid) === -1) memberIds.push(sid);
        });
    });
    var html = '<option value="">Toutes les tâches</option>';
    html += '<option value="__mine__"' + (current === '__mine__' ? ' selected' : '') + '>Mes tâches</option>';
    memberIds.forEach(function(uid) {
        html += '<option value="' + escHtml(uid) + '"' + (String(current) === uid ? ' selected' : '') + '>' + escHtml(getWpUserName(uid)) + '</option>';
    });
    sel.innerHTML = html;
}

function wpGetFilteredTasks(p) {
    var tasks = (p.tasks || []).slice();
    var filter = wpTasksFilterAssignee;
    var uid = currentUser ? String(currentUser.id) : '';
    if (filter === '__mine__' && uid) {
        tasks = tasks.filter(function(t) {
            return (t.assignedTo || []).some(function(id) { return String(id) === uid; });
        });
    } else if (filter) {
        tasks = tasks.filter(function(t) {
            return (t.assignedTo || []).some(function(id) { return String(id) === String(filter); });
        });
    }
    tasks.sort(function(a, b) {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return (a.order || 0) - (b.order || 0);
    });
    return tasks;
}

function wpBuildTaskCardHtml(p, t) {
    var assignees = (t.assignedTo || []).map(function(id) { return getWpUserName(id); }).join(', ') || '—';
    var overdue = typeof isTaskOverdue === 'function' && isTaskOverdue(t);
    var done = typeof isTaskDone === 'function' ? isTaskDone(t) : t.completed;
    return '<div class="wp-task-card' + (overdue ? ' wp-task-card--overdue' : '') + '" draggable="true" data-task-id="' + t.id + '" ' +
        'ondragstart="wpTaskDragStart(event,\'' + t.id + '\')" onclick="openTaskFiche(\'work_project\',\'' + p.id + '\',\'' + t.id + '\')">' +
        '<div class="wp-task-card-top">' +
        '<input type="checkbox" class="wp-task-quick-cb" ' + (done ? 'checked' : '') + ' onclick="wpToggleTaskComplete(\'' + p.id + '\',\'' + t.id + '\',event)">' +
        '<span class="wp-task-card-title">' + escHtml(t.title) + '</span></div>' +
        '<div class="wp-task-card-meta">' + escHtml(assignees) +
        (t.dueDate ? ' · ' + wpFormatDate(t.dueDate) + (overdue ? ' ⚠️' : '') : '') +
        ' <button type="button" class="wp-task-dup-btn" title="Dupliquer" onclick="event.stopPropagation();wpDuplicateTask(\'' + p.id + '\',\'' + t.id + '\')">⧉</button></div></div>';
}

function wpTaskStatusLabel(status) {
    if (status === 'done') return { text: 'Terminé', cls: 'done' };
    if (status === 'in_progress') return { text: 'En cours', cls: 'in_progress' };
    return { text: 'À faire', cls: 'todo' };
}

function renderWpTasks(p) {
    var board = document.getElementById('wpTasksBoard');
    if (!board) return;
    var kanbanBtn = document.getElementById('wpTasksViewKanban');
    var listBtn = document.getElementById('wpTasksViewList');
    if (kanbanBtn) kanbanBtn.classList.toggle('active', wpTasksViewMode === 'kanban');
    if (listBtn) listBtn.classList.toggle('active', wpTasksViewMode === 'list');

    var tasks = wpGetFilteredTasks(p);

    if (wpTasksViewMode === 'list') {
        board.className = 'wp-tasks-list';
        if (!tasks.length) {
            board.innerHTML = '<div class="wp-empty">Aucune tâche pour ce filtre.</div>';
            return;
        }
        var rows = tasks.map(function(t) {
            var st = typeof normalizeTaskStatus === 'function' ? normalizeTaskStatus(t.status, t.completed) : t.status;
            var pill = wpTaskStatusLabel(st);
            var assignees = (t.assignedTo || []).map(function(id) { return getWpUserName(id); }).join(', ') || '—';
            var overdue = typeof isTaskOverdue === 'function' && isTaskOverdue(t);
            var done = typeof isTaskDone === 'function' ? isTaskDone(t) : t.completed;
            return '<tr class="wp-task-row' + (overdue ? ' wp-task-row--overdue' : '') + '" onclick="openTaskFiche(\'work_project\',\'' + p.id + '\',\'' + t.id + '\')">' +
                '<td onclick="event.stopPropagation()"><input type="checkbox" ' + (done ? 'checked' : '') + ' onclick="wpToggleTaskComplete(\'' + p.id + '\',\'' + t.id + '\',event)"></td>' +
                '<td><strong>' + escHtml(t.title) + '</strong>' + (overdue ? ' <span title="En retard">⚠️</span>' : '') + '</td>' +
                '<td>' + escHtml(assignees) + '</td>' +
                '<td>' + (t.dueDate ? wpFormatDate(t.dueDate) : '—') + '</td>' +
                '<td><span class="wp-task-status-pill wp-task-status-pill--' + pill.cls + '">' + pill.text + '</span></td>' +
                '<td onclick="event.stopPropagation()"><button type="button" class="wp-task-dup-btn" title="Dupliquer" onclick="wpDuplicateTask(\'' + p.id + '\',\'' + t.id + '\')">⧉</button></td>' +
                '</tr>';
        }).join('');
        board.innerHTML = '<table class="wp-tasks-table"><thead><tr><th></th><th>Titre</th><th>Assignés</th><th>Échéance</th><th>Statut</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
        return;
    }

    board.className = 'wp-kanban-board';
    var cols = [
        { id: 'todo', label: 'À faire' },
        { id: 'in_progress', label: 'En cours' },
        { id: 'done', label: 'Terminé' }
    ];
    board.innerHTML = cols.map(function(col) {
        var colTasks = tasks.filter(function(t) {
            var st = typeof normalizeTaskStatus === 'function' ? normalizeTaskStatus(t.status, t.completed) : t.status;
            if (col.id === 'done') return st === 'done';
            if (col.id === 'in_progress') return st === 'in_progress';
            return st === 'todo';
        });
        var cards = colTasks.map(function(t) { return wpBuildTaskCardHtml(p, t); }).join('');
        return '<div class="wp-kanban-col" data-status="' + col.id + '" ondragover="wpTaskDragOver(event)" ondrop="wpTaskDrop(event,\'' + col.id + '\')">' +
            '<div class="wp-kanban-col-header">' + col.label + ' <span>' + colTasks.length + '</span></div>' +
            '<div class="wp-kanban-col-body">' + cards + '</div></div>';
    }).join('');
}

function wpSetTasksView(mode) {
    wpTasksViewMode = mode === 'list' ? 'list' : 'kanban';
    var p = getWorkProjectById(wpCurrentId);
    if (p) renderWpTasks(p);
}

function wpSetTasksAssigneeFilter(value) {
    wpTasksFilterAssignee = value || '';
    var p = getWorkProjectById(wpCurrentId);
    if (p) renderWpTasks(p);
}

async function openWpTaskModal(taskId) {
    if (!hasWorkProjectsAccess()) {
        alert("Vous n'avez pas accès aux projets.");
        return;
    }
    if (!wpCurrentId) {
        alert('Ouvrez d\'abord un espace de travail.');
        return;
    }
    try {
        if (taskId) {
            if (typeof openTaskFiche === 'function') {
                await openTaskFiche('work_project', wpCurrentId, taskId);
            } else {
                alert('Module tâches non chargé.');
            }
        } else if (typeof openNewWorkProjectTaskFiche === 'function') {
            await openNewWorkProjectTaskFiche(wpCurrentId);
        } else {
            alert('Module tâches non chargé. Rechargez la page.');
        }
    } catch (e) {
        console.error('openWpTaskModal:', e);
        if (typeof showToast === 'function') showToast('Impossible d\'ouvrir la tâche', 'error');
        else alert('Erreur lors de l\'ouverture de la tâche.');
    }
}

var wpDragTaskId = null;
function wpTaskDragStart(ev, taskId) { wpDragTaskId = taskId; if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'; }
function wpTaskDragOver(ev) { ev.preventDefault(); }
function wpTaskDrop(ev, status) {
    ev.preventDefault();
    var p = getWorkProjectById(wpCurrentId);
    if (!p || !wpDragTaskId) return;
    wpMoveTaskStatus(wpCurrentId, wpDragTaskId, status);
    wpDragTaskId = null;
}

// openWpTaskModal défini plus haut (délègue au moteur unifié)
function closeWpTaskModal() { if (typeof closeTaskModal === 'function') closeTaskModal(); }
function saveWpTaskForm() { /* obsolète — modale unifiée */ }
function deleteWpTask() { if (wpCurrentId && window._wpEditingTaskId) deleteTask(wpCurrentId, window._wpEditingTaskId); }

function wpFormatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch (e) { return iso; }
}

// --- Workspace (documents & notes) ---
function wpProjectIdForWorkspace() {
    return wpCurrentId;
}

async function loadWpWorkspaceElements() {
    if (!wpCurrentId) return [];
    try {
        var res = await apiCall('workspace.php?visibility=team&project_id=' + encodeURIComponent(wpCurrentId), 'GET');
        wpWorkspaceElements = (res && res.elements) ? res.elements : [];
    } catch (e) {
        console.error('loadWpWorkspaceElements:', e);
        // Ne pas vider la liste locale : conserve les documents déjà affichés / fraîchement uploadés
        if (typeof showToast === 'function') {
            showToast('Impossible de rafraîchir les documents (réseau).', 'error');
        }
    }
    return wpWorkspaceElements;
}

function openWpWorkspaceFile(elementId) {
    if (!elementId) return;
    var url = typeof getWorkspaceFileUrl === 'function' ? getWorkspaceFileUrl(elementId) : null;
    if (url) window.open(url, '_blank');
}

function downloadWpWorkspaceFile(elementId) {
    if (!elementId) return;
    var url = typeof getWorkspaceFileUrl === 'function' ? getWorkspaceFileUrl(elementId, { download: true }) : null;
    if (!url) return;
    var a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', '');
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function renameWpDocument(fileId) {
    var file = wpWorkspaceElements.find(function(e) { return String(e.id) === String(fileId); });
    if (!file) return;
    var current = file.title || file.file_name || '';
    var newName = prompt('Nouveau nom du document :', current);
    if (!newName || !newName.trim() || newName.trim() === current) return;
    try {
        await apiCall('workspace.php', 'PUT', { id: fileId, title: newName.trim() });
        if (typeof showToast === 'function') showToast('✅ Document renommé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p && wpCurrentTab === 'documents') renderWpDocuments(p);
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function deleteWpNote(noteId) {
    var note = wpWorkspaceElements.find(function(e) { return String(e.id) === String(noteId); });
    if (!note) return;
    var label = note.title || 'cette note';
    if (!confirm('Supprimer la note « ' + label + ' » ?')) return;
    try {
        await apiCall('workspace.php', 'DELETE', { id: noteId });
        if (typeof showToast === 'function') showToast('✅ Note supprimée', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p && wpCurrentTab === 'notes') renderWpNotes(p);
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function deleteWpDocument(fileId) {
    var file = wpWorkspaceElements.find(function(e) { return String(e.id) === String(fileId); });
    if (!file) return;
    var label = file.title || file.file_name || 'ce document';
    if (!confirm('Supprimer le document « ' + label + ' » ?')) return;
    try {
        await apiCall('workspace.php', 'DELETE', { id: fileId });
        if (typeof showToast === 'function') showToast('✅ Document supprimé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p) {
            logWpActivity(p, 'document', 'Fichier supprimé : ' + label);
            p.updatedAt = new Date().toISOString();
            saveWorkProjectsData();
            if (wpCurrentTab === 'documents') renderWpDocuments(p);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

function wpDocFileKind(fileName) {
    var ext = String(fileName || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].indexOf(ext) !== -1) return 'image';
    if (ext === 'pdf') return 'pdf';
    return 'other';
}

function wpDocPdfPreviewSrc(previewUrl) {
    if (!previewUrl) return '';
    var base = String(previewUrl).split('#')[0];
    return base + '#page=1&toolbar=0&navpanes=0&view=Fit';
}

function wpDocPreviewHtml(f, previewUrl) {
    var name = f.file_name || f.title || '';
    var kind = wpDocFileKind(name);
    if (kind === 'image' && previewUrl) {
        return '<div class="wp-doc-preview wp-doc-preview--image" onclick="openWpWorkspaceFile(\'' + escHtml(f.id) + '\')" title="Ouvrir">' +
            '<img src="' + escHtml(previewUrl) + '" alt="" loading="lazy">' +
            '</div>';
    }
    if (kind === 'pdf' && previewUrl) {
        return '<div class="wp-doc-preview wp-doc-preview--pdf" onclick="openWpWorkspaceFile(\'' + escHtml(f.id) + '\')" title="Ouvrir">' +
            '<iframe src="' + escHtml(wpDocPdfPreviewSrc(previewUrl)) + '" title="Aperçu PDF"></iframe>' +
            '</div>';
    }
    var icons = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', txt: '📄', csv: '📊' };
    var ext = name.split('.').pop().toLowerCase();
    return '<div class="wp-doc-preview wp-doc-preview--icon"><span>' + (icons[ext] || '📎') + '</span></div>';
}

function wpDocFolderChildCount(folderId) {
    return wpWorkspaceElements.filter(function(el) {
        return el.folder_id === folderId && el.type === 'file';
    }).length;
}

function navigateToWpDocFolder(folderId) {
    wpCurrentDocFolderId = folderId || null;
    var p = getWorkProjectById(wpCurrentId);
    if (p) renderWpDocuments(p);
}

async function createWpDocumentFolder() {
    if (!wpCurrentId) return;
    var name = prompt('Nom du dossier :');
    if (!name || !name.trim()) return;
    try {
        await apiCall('workspace.php', 'POST', {
            id: wpNewId('wp_doc_folder'),
            type: 'folder',
            title: name.trim(),
            content: JSON.stringify({ purpose: 'documents' }),
            visibility: 'team',
            project_id: wpCurrentId,
            folder_id: wpCurrentDocFolderId || null
        });
        if (typeof showToast === 'function') showToast('✅ Dossier créé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p) {
            logWpActivity(p, 'document', 'Dossier créé : ' + name.trim());
            p.updatedAt = new Date().toISOString();
            saveWorkProjectsData();
            if (wpCurrentTab === 'documents') renderWpDocuments(p);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function renameWpDocumentFolder(folderId) {
    var folder = wpWorkspaceElements.find(function(e) { return String(e.id) === String(folderId) && isWpDocFolder(e); });
    if (!folder) return;
    var newName = prompt('Nouveau nom du dossier :', folder.title || '');
    if (!newName || !newName.trim() || newName.trim() === folder.title) return;
    try {
        await apiCall('workspace.php', 'PUT', { id: folderId, title: newName.trim() });
        if (typeof showToast === 'function') showToast('✅ Dossier renommé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p && wpCurrentTab === 'documents') renderWpDocuments(p);
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function deleteWpDocumentFolderContents(folderId) {
    var children = wpWorkspaceElements.filter(function(el) { return el.folder_id === folderId; });
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.type === 'folder') await deleteWpDocumentFolderContents(child.id);
        await apiCall('workspace.php', 'DELETE', { id: child.id });
    }
}

async function deleteWpDocumentFolder(folderId) {
    var folder = wpWorkspaceElements.find(function(e) { return String(e.id) === String(folderId) && isWpDocFolder(e); });
    if (!folder) return;
    var fileCount = wpWorkspaceElements.filter(function(el) {
        return el.type === 'file' && (el.folder_id === folderId || isWpDocInFolderTree(el.folder_id, folderId));
    }).length;
    var subCount = wpWorkspaceElements.filter(function(el) {
        return el.type === 'folder' && el.folder_id === folderId;
    }).length;
    var msg = 'Supprimer le dossier « ' + (folder.title || 'Sans titre') + ' »';
    if (fileCount || subCount) {
        msg += ' et son contenu (' + fileCount + ' document' + (fileCount !== 1 ? 's' : '') +
            (subCount ? ', ' + subCount + ' sous-dossier' + (subCount !== 1 ? 's' : '') : '') + ')';
    }
    msg += ' ?';
    if (!confirm(msg)) return;
    try {
        await deleteWpDocumentFolderContents(folderId);
        await apiCall('workspace.php', 'DELETE', { id: folderId });
        if (typeof showToast === 'function') showToast('✅ Dossier supprimé', 'success');
        if (wpCurrentDocFolderId === folderId) wpCurrentDocFolderId = null;
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p) {
            logWpActivity(p, 'document', 'Dossier supprimé : ' + (folder.title || ''));
            p.updatedAt = new Date().toISOString();
            saveWorkProjectsData();
            if (wpCurrentTab === 'documents') renderWpDocuments(p);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

function isWpDocInFolderTree(folderId, ancestorId) {
    if (!folderId) return false;
    if (folderId === ancestorId) return true;
    var parent = wpWorkspaceElements.find(function(el) { return el.id === folderId && el.type === 'folder'; });
    if (!parent || !parent.folder_id) return false;
    return isWpDocInFolderTree(parent.folder_id, ancestorId);
}

function handleWpDocDragStart(e, fileId) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ fileId: fileId, source: 'wp_doc' }));
    e.currentTarget.classList.add('wp-doc-dragging');
}

function handleWpDocDragEnd(e) {
    e.currentTarget.classList.remove('wp-doc-dragging');
    document.querySelectorAll('.wp-doc-drop-zone').forEach(function(z) { z.classList.remove('drag-over'); });
}

function handleWpDocFolderDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleWpDocFolderDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function moveWpDocumentToFolder(fileId, folderId) {
    var file = wpWorkspaceElements.find(function(e) { return String(e.id) === String(fileId) && e.type === 'file'; });
    if (!file) return;
    var target = folderId || null;
    if ((file.folder_id || null) === target) return;
    try {
        await apiCall('workspace.php', 'PUT', { id: fileId, folder_id: target });
        if (typeof showToast === 'function') showToast('✅ Document déplacé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p && wpCurrentTab === 'documents') renderWpDocuments(p);
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function uploadWpFilesToFolder(files, folderId) {
    if (!wpCurrentId || !files || !files.length) return;
    var uploaded = 0;
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (typeof showToast === 'function') {
            showToast('Envoi de ' + file.name + '…', 'info');
        }
        var formData = new FormData();
        formData.append('file', file);
        formData.append('visibility', 'team');
        formData.append('project_id', wpCurrentId);
        if (folderId) formData.append('folder_id', folderId);
        formData.append('token', authToken);
        try {
            var response = await fetch(API_URL + '/workspace_upload.php', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + authToken },
                body: formData
            });
            var raw = await response.text();
            var res = null;
            try { res = raw ? JSON.parse(raw) : null; } catch (parseErr) { res = null; }
            if (!response.ok || !res || !res.success) {
                var errMsg = (res && res.error) ? res.error : ('Erreur HTTP ' + response.status);
                if (typeof showToast === 'function') showToast('❌ ' + file.name + ' : ' + errMsg, 'error');
                console.error('uploadWpFilesToFolder failed', file.name, response.status, raw);
                continue;
            }
            uploaded++;
            if (res.element) {
                var el = res.element;
                if (!el.folder_id && folderId) el.folder_id = folderId;
                if (!el.project_id) el.project_id = wpCurrentId;
                if (!el.type) el.type = 'file';
                wpWorkspaceElements = (wpWorkspaceElements || []).filter(function(e) { return String(e.id) !== String(el.id); });
                wpWorkspaceElements.unshift(el);
            }
            var pOk = getWorkProjectById(wpCurrentId);
            if (pOk) logWpActivity(pOk, 'document', 'Fichier ajouté : ' + file.name);
            if (typeof showToast === 'function') showToast('✅ ' + file.name + ' importé', 'success');
        } catch (e) {
            console.error(e);
            if (typeof showToast === 'function') {
                showToast('❌ ' + file.name + ' : ' + (e.message || 'échec réseau'), 'error');
            }
        }
    }
    var p = getWorkProjectById(wpCurrentId);
    if (p) { p.updatedAt = new Date().toISOString(); saveWorkProjectsData(); }
    try {
        await loadWpWorkspaceElements();
    } catch (e) { /* déjà géré */ }
    if (p && wpCurrentTab === 'documents') renderWpDocuments(p);
    return uploaded;
}

async function handleWpDocFolderDrop(e, targetFolderId) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
        await uploadWpFilesToFolder(e.dataTransfer.files, targetFolderId || null);
        return;
    }
    var raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
        var data = JSON.parse(raw);
        if (data.source !== 'wp_doc' || !data.fileId) return;
        if (data.fileId === targetFolderId) return;
        await moveWpDocumentToFolder(data.fileId, targetFolderId || null);
    } catch (err) { console.error(err); }
}

function buildWpDocFolderCardHtml(folder) {
    var count = wpDocFolderChildCount(folder.id);
    var fid = escHtml(folder.id);
    return '<div class="wp-doc-folder-card wp-doc-drop-zone" data-folder-id="' + fid + '"' +
        ' onclick="navigateToWpDocFolder(\'' + fid + '\')"' +
        ' ondragover="handleWpDocFolderDragOver(event)" ondragleave="handleWpDocFolderDragLeave(event)"' +
        ' ondrop="handleWpDocFolderDrop(event, \'' + fid + '\')">' +
        '<div class="wp-doc-folder-icon">📁</div>' +
        '<div class="wp-doc-folder-body">' +
        '<div class="wp-doc-folder-title">' + escHtml(folder.title || 'Sans titre') + '</div>' +
        '<div class="wp-doc-folder-count">' + count + ' document' + (count !== 1 ? 's' : '') + '</div>' +
        '<div class="wp-doc-folder-actions">' +
        '<button type="button" title="Renommer" onclick="event.stopPropagation(); renameWpDocumentFolder(\'' + fid + '\')">✏️</button>' +
        '<button type="button" title="Supprimer" onclick="event.stopPropagation(); deleteWpDocumentFolder(\'' + fid + '\')">🗑️</button>' +
        '</div></div></div>';
}

function buildWpDocFileCardHtml(f) {
    var size = f.file_size ? (f.file_size / 1024).toFixed(0) + ' Ko' : '';
    var previewUrl = f.id && typeof getWorkspaceFileUrl === 'function' ? getWorkspaceFileUrl(f) : null;
    var preview = wpDocPreviewHtml(f, previewUrl);
    var fid = escHtml(f.id);
    return '<div class="wp-doc-card wp-doc-draggable" draggable="true"' +
        ' ondragstart="handleWpDocDragStart(event, \'' + fid + '\')" ondragend="handleWpDocDragEnd(event)">' +
        preview +
        '<div class="wp-doc-body">' +
        '<div class="wp-doc-title">' + escHtml(f.title || f.file_name) + '</div>' +
        '<div class="wp-doc-meta">' + (size ? escHtml(size) : '') + '</div>' +
        '<div class="wp-doc-actions">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="openWpWorkspaceFile(\'' + fid + '\')">Ouvrir</button>' +
        '<button type="button" class="btn btn-sm" onclick="downloadWpWorkspaceFile(\'' + fid + '\')">⬇ Télécharger</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="renameWpDocument(\'' + fid + '\')" title="Renommer">✏️</button>' +
        '<button type="button" class="btn btn-secondary btn-sm wp-doc-delete" onclick="deleteWpDocument(\'' + fid + '\')" title="Supprimer">🗑️</button>' +
        '</div></div></div>';
}

async function renderWpDocuments(p) {
    await loadWpWorkspaceElements();
    var grid = document.getElementById('wpDocumentsGrid');
    var breadcrumb = document.getElementById('wpDocumentsBreadcrumb');
    if (!grid) return;

    var currentFolderId = wpCurrentDocFolderId || null;
    if (currentFolderId && !wpWorkspaceElements.some(function(el) { return el.id === currentFolderId && isWpDocFolder(el); })) {
        wpCurrentDocFolderId = null;
        currentFolderId = null;
    }

    if (breadcrumb) {
        if (currentFolderId) {
            var currentFolder = wpWorkspaceElements.find(function(el) { return el.id === currentFolderId; });
            breadcrumb.style.display = 'flex';
            breadcrumb.innerHTML =
                '<button type="button" class="wp-doc-breadcrumb-link" onclick="navigateToWpDocFolder(null)">Documents</button>' +
                '<span class="wp-doc-breadcrumb-sep">›</span>' +
                '<span class="wp-doc-breadcrumb-current">📁 ' + escHtml((currentFolder && currentFolder.title) || 'Dossier') + '</span>' +
                '<div class="wp-doc-root-drop wp-doc-drop-zone"' +
                ' ondragover="handleWpDocFolderDragOver(event)" ondragleave="handleWpDocFolderDragLeave(event)"' +
                ' ondrop="handleWpDocFolderDrop(event, null)">Glisser ici pour sortir du dossier</div>';
        } else {
            breadcrumb.style.display = 'none';
            breadcrumb.innerHTML = '';
        }
    }

    var folders = wpWorkspaceElements.filter(function(el) {
        return isWpDocFolder(el) && (el.folder_id || null) === currentFolderId;
    });
    var files = wpWorkspaceElements.filter(function(el) {
        return el.type === 'file' && (el.folder_id || null) === currentFolderId;
    });

    if (!folders.length && !files.length) {
        grid.innerHTML = '<div class="wp-empty">' +
            (currentFolderId
                ? 'Ce dossier est vide. Importez un fichier ou glissez un document ici.'
                : 'Aucun document. Importez un fichier ou créez un dossier pour organiser vos fichiers.') +
            '</div>';
        return;
    }

    var html = folders.map(buildWpDocFolderCardHtml).join('') + files.map(buildWpDocFileCardHtml).join('');
    grid.innerHTML = html;
}

function wpNoteFolderChildCount(folderId) {
    return wpWorkspaceElements.filter(function(el) {
        if (el.folder_id !== folderId) return false;
        return isWpNoteFolder(el) || isWpNoteElement(el);
    }).length;
}

function navigateToWpNoteFolder(folderId) {
    wpCurrentNoteFolderId = folderId || null;
    var p = getWorkProjectById(wpCurrentId);
    if (p) renderWpNotes(p);
}

async function createWpNoteFolder() {
    if (!wpCurrentId) return;
    var name = prompt('Nom du dossier :');
    if (!name || !name.trim()) return;
    try {
        await apiCall('workspace.php', 'POST', {
            id: wpNewId('wp_note_folder'),
            type: 'folder',
            title: name.trim(),
            content: JSON.stringify({ purpose: 'notes' }),
            visibility: 'team',
            project_id: wpCurrentId,
            folder_id: wpCurrentNoteFolderId || null
        });
        if (typeof showToast === 'function') showToast('✅ Dossier créé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p) {
            logWpActivity(p, 'note', 'Dossier créé : ' + name.trim());
            p.updatedAt = new Date().toISOString();
            saveWorkProjectsData();
            if (wpCurrentTab === 'notes') renderWpNotes(p);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function renameWpNoteFolder(folderId) {
    var folder = wpWorkspaceElements.find(function(e) { return String(e.id) === String(folderId) && isWpNoteFolder(e); });
    if (!folder) return;
    var newName = prompt('Nouveau nom du dossier :', folder.title || '');
    if (!newName || !newName.trim() || newName.trim() === folder.title) return;
    try {
        await apiCall('workspace.php', 'PUT', { id: folderId, title: newName.trim() });
        if (typeof showToast === 'function') showToast('✅ Dossier renommé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p && wpCurrentTab === 'notes') renderWpNotes(p);
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function deleteWpNoteFolderContents(folderId) {
    var children = wpWorkspaceElements.filter(function(el) { return el.folder_id === folderId; });
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (isWpNoteFolder(child)) await deleteWpNoteFolderContents(child.id);
        await apiCall('workspace.php', 'DELETE', { id: child.id });
    }
}

async function deleteWpNoteFolder(folderId) {
    var folder = wpWorkspaceElements.find(function(e) { return String(e.id) === String(folderId) && isWpNoteFolder(e); });
    if (!folder) return;
    var noteCount = wpWorkspaceElements.filter(function(el) {
        return isWpNoteElement(el) && isWpNoteInFolderTree(el.folder_id, folderId);
    }).length;
    var subCount = wpWorkspaceElements.filter(function(el) {
        return isWpNoteFolder(el) && el.folder_id === folderId;
    }).length;
    var msg = 'Supprimer le dossier « ' + (folder.title || 'Sans titre') + ' »';
    if (noteCount || subCount) {
        msg += ' et son contenu (' + noteCount + ' note' + (noteCount !== 1 ? 's' : '') +
            (subCount ? ', ' + subCount + ' sous-dossier' + (subCount !== 1 ? 's' : '') : '') + ')';
    }
    msg += ' ?';
    if (!confirm(msg)) return;
    try {
        await deleteWpNoteFolderContents(folderId);
        await apiCall('workspace.php', 'DELETE', { id: folderId });
        if (typeof showToast === 'function') showToast('✅ Dossier supprimé', 'success');
        if (wpCurrentNoteFolderId === folderId) wpCurrentNoteFolderId = null;
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p) {
            logWpActivity(p, 'note', 'Dossier supprimé : ' + (folder.title || ''));
            p.updatedAt = new Date().toISOString();
            saveWorkProjectsData();
            if (wpCurrentTab === 'notes') renderWpNotes(p);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

function isWpNoteInFolderTree(folderId, ancestorId) {
    if (!folderId) return false;
    if (folderId === ancestorId) return true;
    var parent = wpWorkspaceElements.find(function(el) { return el.id === folderId && isWpNoteFolder(el); });
    if (!parent || !parent.folder_id) return false;
    return isWpNoteInFolderTree(parent.folder_id, ancestorId);
}

function isWpNoteFolderDescendant(folderId, potentialAncestorId) {
    if (!folderId || !potentialAncestorId) return false;
    if (folderId === potentialAncestorId) return true;
    var parent = wpWorkspaceElements.find(function(el) { return el.id === folderId && isWpNoteFolder(el); });
    if (!parent || !parent.folder_id) return false;
    return isWpNoteFolderDescendant(parent.folder_id, potentialAncestorId);
}

function handleWpNoteDragStart(e, itemId, itemKind) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'wp_note', itemId: itemId, itemKind: itemKind || 'note' }));
    e.currentTarget.classList.add('wp-note-dragging');
}

function handleWpNoteDragEnd(e) {
    e.currentTarget.classList.remove('wp-note-dragging');
    document.querySelectorAll('.wp-note-drop-zone').forEach(function(z) { z.classList.remove('drag-over'); });
}

function handleWpNoteFolderDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleWpNoteFolderDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function moveWpNoteItemToFolder(itemId, itemKind, folderId) {
    var el = wpWorkspaceElements.find(function(e) { return String(e.id) === String(itemId); });
    if (!el) return;
    var target = folderId || null;
    if ((el.folder_id || null) === target) return;
    if (itemKind === 'folder') {
        if (!isWpNoteFolder(el)) return;
        if (target && (target === itemId || isWpNoteFolderDescendant(target, itemId))) {
            if (typeof showToast === 'function') showToast('⚠️ Impossible de déplacer un dossier dans lui-même', 'error');
            return;
        }
    } else if (!isWpNoteElement(el)) {
        return;
    }
    try {
        await apiCall('workspace.php', 'PUT', { id: itemId, folder_id: target });
        if (typeof showToast === 'function') showToast('✅ Déplacé', 'success');
        await loadWpWorkspaceElements();
        var p = getWorkProjectById(wpCurrentId);
        if (p && wpCurrentTab === 'notes') renderWpNotes(p);
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Erreur: ' + e.message, 'error');
    }
}

async function handleWpNoteFolderDrop(e, targetFolderId) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    var raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
        var data = JSON.parse(raw);
        if (data.source !== 'wp_note' || !data.itemId) return;
        if (data.itemKind === 'folder' && data.itemId === targetFolderId) return;
        await moveWpNoteItemToFolder(data.itemId, data.itemKind || 'note', targetFolderId || null);
    } catch (err) { console.error(err); }
}

function buildWpNoteFolderCardHtml(folder) {
    var count = wpNoteFolderChildCount(folder.id);
    var fid = escHtml(folder.id);
    return '<div class="wp-note-folder-card wp-note-drop-zone" data-folder-id="' + fid + '"' +
        ' onclick="navigateToWpNoteFolder(\'' + fid + '\')"' +
        ' draggable="true" ondragstart="handleWpNoteDragStart(event, \'' + fid + '\', \'folder\')" ondragend="handleWpNoteDragEnd(event)"' +
        ' ondragover="handleWpNoteFolderDragOver(event)" ondragleave="handleWpNoteFolderDragLeave(event)"' +
        ' ondrop="handleWpNoteFolderDrop(event, \'' + fid + '\')">' +
        '<div class="wp-note-folder-icon">📁</div>' +
        '<div class="wp-note-folder-body">' +
        '<div class="wp-note-folder-title">' + escHtml(folder.title || 'Sans titre') + '</div>' +
        '<div class="wp-note-folder-count">' + count + ' élément' + (count !== 1 ? 's' : '') + '</div>' +
        '<div class="wp-note-folder-actions">' +
        '<button type="button" title="Renommer" onclick="event.stopPropagation(); renameWpNoteFolder(\'' + fid + '\')">✏️</button>' +
        '<button type="button" title="Supprimer" onclick="event.stopPropagation(); deleteWpNoteFolder(\'' + fid + '\')">🗑️</button>' +
        '</div></div></div>';
}

function buildWpNoteCardHtml(n) {
    var icons = { page: '📝', idea: '💡', quicknote: '📋', mindmap: '🧠', drawing: '🎨' };
    var nid = escHtml(n.id);
    return '<div class="wp-note-card wp-note-draggable" draggable="true"' +
        ' ondragstart="handleWpNoteDragStart(event, \'' + nid + '\', \'note\')" ondragend="handleWpNoteDragEnd(event)"' +
        ' onclick="openWpWorkspaceElement(\'' + nid + '\')">' +
        '<div class="wp-note-card-main"><span>' + (icons[n.type] || '📄') + '</span> ' + escHtml(n.title || 'Sans titre') + '</div>' +
        '<button type="button" class="wp-note-delete" title="Supprimer" onclick="event.stopPropagation(); deleteWpNote(\'' + nid + '\')">🗑️</button>' +
        '</div>';
}

async function renderWpNotes(p) {
    await loadWpWorkspaceElements();
    var grid = document.getElementById('wpNotesGrid');
    var breadcrumb = document.getElementById('wpNotesBreadcrumb');
    if (!grid) return;

    var currentFolderId = wpCurrentNoteFolderId || null;
    if (currentFolderId && !wpWorkspaceElements.some(function(el) { return el.id === currentFolderId && isWpNoteFolder(el); })) {
        wpCurrentNoteFolderId = null;
        currentFolderId = null;
    }

    if (breadcrumb) {
        if (currentFolderId) {
            var currentFolder = wpWorkspaceElements.find(function(el) { return el.id === currentFolderId; });
            breadcrumb.style.display = 'flex';
            breadcrumb.innerHTML =
                '<button type="button" class="wp-doc-breadcrumb-link" onclick="navigateToWpNoteFolder(null)">Notes</button>' +
                '<span class="wp-doc-breadcrumb-sep">›</span>' +
                '<span class="wp-doc-breadcrumb-current">📁 ' + escHtml((currentFolder && currentFolder.title) || 'Dossier') + '</span>' +
                '<div class="wp-doc-root-drop wp-note-drop-zone"' +
                ' ondragover="handleWpNoteFolderDragOver(event)" ondragleave="handleWpNoteFolderDragLeave(event)"' +
                ' ondrop="handleWpNoteFolderDrop(event, null)">Glisser ici pour sortir du dossier</div>';
        } else {
            breadcrumb.style.display = 'none';
            breadcrumb.innerHTML = '';
        }
    }

    var folders = wpWorkspaceElements.filter(function(el) {
        return isWpNoteFolder(el) && (el.folder_id || null) === currentFolderId;
    });
    var notes = wpWorkspaceElements.filter(function(el) {
        return isWpNoteElement(el) && (el.folder_id || null) === currentFolderId;
    });

    if (!folders.length && !notes.length) {
        grid.innerHTML = '<div class="wp-empty wp-note-drop-zone"' +
            ' ondragover="handleWpNoteFolderDragOver(event)" ondragleave="handleWpNoteFolderDragLeave(event)"' +
            ' ondrop="handleWpNoteFolderDrop(event, \'' + escHtml(currentFolderId || '') + '\')">' +
            (currentFolderId
                ? 'Ce dossier est vide. Créez une note ou glissez-en une ici.'
                : 'Aucune note. Créez une page ou un dossier pour organiser vos notes.') +
            '</div>';
        return;
    }

    var html = folders.map(buildWpNoteFolderCardHtml).join('') + notes.map(buildWpNoteCardHtml).join('');
    grid.innerHTML = html;
}

async function createWpWorkspaceElement(type) {
    if (!wpCurrentId) return;
    window.currentWsProjectId = wpCurrentId;
    window.currentWorkspaceVisibility = 'team';
    window.currentWsFolderId = wpCurrentNoteFolderId || null;
    if (typeof createWorkspaceElement === 'function') createWorkspaceElement(type);
}

function openWpWorkspaceElement(id) {
    var el = wpWorkspaceElements.find(function(e) { return String(e.id) === String(id); });
    if (!el) return;
    window.currentWsProjectId = wpCurrentId;
    window.currentWorkspaceVisibility = 'team';
    if (el.type === 'mindmap' && typeof openWorkspaceMindmap === 'function') openWorkspaceMindmap(el);
    else if (el.type === 'drawing' && typeof openWorkspaceDrawing === 'function') openWorkspaceDrawing(el);
    else if (typeof openWorkspaceElement === 'function') openWorkspaceElement(el.id);
}

async function handleWpFileUpload(event) {
    if (!wpCurrentId) return;
    var files = event.target.files;
    if (!files || !files.length) return;
    await uploadWpFilesToFolder(files, wpCurrentDocFolderId || null);
    event.target.value = '';
}

// --- CRM ---
function populateCrmWorkProjectSelect(sel, selectedId) {
    if (!sel) return;
    var html = '<option value="">— Aucun projet —</option>';
    getActiveWorkProjects().slice().sort(function(a, b) {
        return (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
    }).forEach(function(p) {
        var s = String(selectedId) === String(p.id) ? ' selected' : '';
        html += '<option value="' + escHtml(p.id) + '"' + s + '>' + escHtml((p.icon || '📁') + ' ' + (p.title || 'Projet')) + '</option>';
    });
    sel.innerHTML = html;
}

function linkCrmDealToWorkProject(dealId, projectId) {
    if (!dealId || typeof crmData === 'undefined') return;
    var deal = (crmData.deals || []).find(function(d) { return String(d.id) === String(dealId); });
    if (!deal) return;
    ensureDealShape(deal);

    // Retirer le dossier de tous les projets (évite les doublons dealIds / workProjectId)
    (workProjectsData.projects || []).forEach(function(p) {
        ensureWorkProjectShape(p);
        var before = (p.crm.dealIds || []).length;
        p.crm.dealIds = (p.crm.dealIds || []).filter(function(id) { return String(id) !== String(dealId); });
        if (p.crm.dealIds.length !== before) p.updatedAt = new Date().toISOString();
    });

    if (!projectId) {
        deal.workProjectId = null;
        deal.updatedAt = new Date().toISOString();
        if (typeof saveCrmData === 'function') saveCrmData();
        saveWorkProjectsData();
        return;
    }

    var project = getWorkProjectById(projectId);
    if (!project) return;
    ensureWorkProjectShape(project);

    deal.workProjectId = projectId;
    if (!(project.crm.dealIds || []).some(function(id) { return String(id) === String(dealId); })) {
        project.crm.dealIds.push(dealId);
    }
    deal.updatedAt = new Date().toISOString();
    project.updatedAt = new Date().toISOString();
    if (typeof saveCrmData === 'function') saveCrmData();
    saveWorkProjectsData();
}

function unlinkCrmDealFromWorkProject(dealId) {
    linkCrmDealToWorkProject(dealId, null);
}

/** Nettoie les dealIds orphelins (dossier déjà rattaché ailleurs via workProjectId) */
function repairCrmDealWorkProjectRefs() {
    if (typeof crmData === 'undefined' || !crmData.deals) return;
    (crmData.deals || []).forEach(function(deal) {
        ensureDealShape(deal);
        if (!deal.workProjectId) return;
        (workProjectsData.projects || []).forEach(function(p) {
            if (String(p.id) === String(deal.workProjectId)) return;
            ensureWorkProjectShape(p);
            p.crm.dealIds = (p.crm.dealIds || []).filter(function(id) { return String(id) !== String(deal.id); });
        });
    });
}

function renderWpCommercial(p) {
    ensureWorkProjectShape(p);
    var deals = wpGetLinkedDeals(p);
    var html = '<div class="wp-crm-deals-header">';
    html += '<div><h3 style="margin:0 0 0.35rem;">Dossiers CRM</h3>';
    html += '<p class="wp-muted" style="margin:0;">Dossiers commerciaux liés à ce projet.</p></div>';
    html += '<div class="wp-crm-deals-actions">';
    html += '<button type="button" class="btn" onclick="openWpCreateCrmDeal()">+ Nouveau dossier</button>';
    html += '<button type="button" class="btn btn-secondary" onclick="openWpCrmLinkModal(\'deal\')">+ Lier un dossier</button>';
    html += '</div></div>';
    html += '<div id="wpCrmDeals" class="wp-crm-deals-grid">';
    if (!deals.length) {
        html += '<div class="wp-empty">Aucun dossier lié à ce projet.</div>';
    } else {
        html += deals.map(function(d) {
            var stage = d.stage || '—';
            var prospect = typeof getCrmDealProspectsLabel === 'function' ? getCrmDealProspectsLabel(d) : '—';
            var statusCls = d.status === 'won' ? 'wp-crm-deal-card--won' : (d.status === 'lost' ? 'wp-crm-deal-card--lost' : '');
            return '<div class="wp-crm-deal-card ' + statusCls + '" onclick="typeof openCrmDealFiche===\'function\'&&openCrmDealFiche(\'' + d.id + '\')">' +
                '<div class="wp-crm-deal-card-top">' +
                '<span class="wp-crm-deal-card-title">' + escHtml(d.title || 'Dossier') + '</span>' +
                '<button type="button" class="wp-crm-deal-unlink" title="Délier" onclick="event.stopPropagation();unlinkWpCrmDealFromProject(\'' + d.id + '\')">✕</button>' +
                '</div>' +
                '<div class="wp-crm-deal-card-meta">' + escHtml(prospect) + '</div>' +
                '<div class="wp-crm-deal-card-footer">' +
                '<span class="wp-crm-deal-stage">' + escHtml(stage) + '</span>' +
                '</div></div>';
        }).join('');
    }
    html += '</div>';
    html += '<div class="wp-crm-deals-header" style="margin-top:1.75rem;">';
    html += '<div><h3 style="margin:0 0 0.35rem;">Documents commerciaux</h3>';
    html += '<p class="wp-muted" style="margin:0;">Devis et factures liés à ce projet (comptabilité).</p></div></div>';
    html += '<div id="wpComptaDocsLinked">';
    if (typeof getDocsLinkedToWorkProject === 'function' && typeof renderComptaDocsLinkedListHtml === 'function') {
        html += renderComptaDocsLinkedListHtml(getDocsLinkedToWorkProject(p.id));
    } else {
        html += '<p class="wp-muted" style="margin:0.5rem 0 0;">Module documents commerciaux non chargé.</p>';
    }
    html += '</div>';
    document.getElementById('wpCommercialContent').innerHTML = html;
    if (typeof loadComptaData === 'function') {
        loadComptaData().then(function() {
            var box = document.getElementById('wpComptaDocsLinked');
            if (box && typeof getDocsLinkedToWorkProject === 'function' && typeof renderComptaDocsLinkedListHtml === 'function') {
                box.innerHTML = renderComptaDocsLinkedListHtml(getDocsLinkedToWorkProject(p.id));
            }
        }).catch(function() {});
    }
}

function openWpCreateCrmDeal() {
    if (!wpCurrentId) return;
    if (typeof ensureCrmDataLoaded === 'function') {
        ensureCrmDataLoaded().then(function() {
            if (typeof openCrmDealModalInternal === 'function') openCrmDealModalInternal(null, null, { workProjectId: wpCurrentId });
        });
        return;
    }
    if (typeof openCrmDealModalInternal === 'function') openCrmDealModalInternal(null, null, { workProjectId: wpCurrentId });
}

function unlinkWpCrmDealFromProject(dealId) {
    if (!confirm('Délier ce dossier du projet ?')) return;
    unlinkCrmDealFromWorkProject(dealId);
    var p = getWorkProjectById(wpCurrentId);
    if (p) renderWpCommercial(p);
}

function wpGetLinkedProspects(p) {
    var out = [];
    if (typeof crmData === 'undefined' || !crmData.lists) return out;
    var ids = new Set((p.crm.prospectIds || []).map(String));
    var listIds = new Set((p.crm.listIds || []).map(String));
    crmData.lists.forEach(function(list) {
        var fromList = listIds.has(list.id);
        (list.prospects || []).forEach(function(pr) {
            if (fromList || ids.has(String(pr.id))) out.push({ prospect: pr, list: list });
        });
    });
    return out;
}

function wpGetLinkedDeals(p) {
    if (typeof crmData === 'undefined' || !crmData.deals) return [];
    return crmData.deals.filter(function(d) {
        ensureDealShape(d);
        if (d.workProjectId) return String(d.workProjectId) === String(p.id);
        return (p.crm.dealIds || []).some(function(id) { return String(id) === String(d.id); });
    });
}

function openWpCrmLinkModal(kind) {
    if (kind !== 'deal') return;
    var p = getWorkProjectById(wpCurrentId);
    if (!p || typeof crmData === 'undefined') { alert('CRM non disponible.'); return; }
    var linkedIds = new Set(wpGetLinkedDeals(p).map(function(d) { return String(d.id); }));
    var html = '<div class="modal-content" style="max-width:480px;"><h2>Lier un dossier CRM</h2><select id="wpCrmLinkSelect" style="width:100%;padding:0.6rem;margin:1rem 0;">';
    html += '<option value="">— Choisir un dossier —</option>';
    (typeof getCrmAccessibleDeals === 'function' ? getCrmAccessibleDeals() : (crmData.deals || [])).forEach(function(d) {
        if (linkedIds.has(String(d.id))) return;
        var label = (d.title || 'Dossier') + (d.stage ? ' · ' + d.stage : '');
        html += '<option value="' + d.id + '">' + escHtml(label) + '</option>';
    });
    html += '</select><div class="form-actions"><button type="button" class="btn btn-secondary" onclick="closeWpCrmLinkModal()">Annuler</button><button type="button" class="btn" onclick="saveWpCrmLink(\'deal\')">Lier</button></div></div>';
    var modal = document.getElementById('wpCrmLinkModal');
    modal.innerHTML = html;
    modal.classList.add('active');
}

function closeWpCrmLinkModal() { document.getElementById('wpCrmLinkModal').classList.remove('active'); }

function saveWpCrmLink(kind) {
    var p = getWorkProjectById(wpCurrentId);
    var sel = document.getElementById('wpCrmLinkSelect');
    if (!p || !sel || !sel.value) return;
    if (kind === 'deal') {
        linkCrmDealToWorkProject(sel.value, p.id);
    }
    closeWpCrmLinkModal();
    renderWpCommercial(p);
}

function unlinkWpCrm(kind, id) {
    if (kind === 'deal') unlinkCrmDealFromWorkProject(id);
    var p = getWorkProjectById(wpCurrentId);
    if (p && wpCurrentTab === 'commercial') renderWpCommercial(p);
}

// --- Activité ---
function renderWpActivity(p) {
    var el = document.getElementById('wpActivityTimeline');
    if (!el) return;
    var acts = (p.activities || []).slice().sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    if (!acts.length) { el.innerHTML = '<div class="wp-empty">Aucune activité.</div>'; return; }
    el.innerHTML = acts.map(function(a) {
        return '<div class="wp-activity-item"><div class="wp-activity-meta">' + escHtml(a.authorName || '—') + ' · ' + wpFormatDateTime(a.createdAt) + '</div>' +
            '<div>' + escHtml(a.text) + '</div></div>';
    }).join('');
}

function wpFormatDateTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; }
}

// --- Création depuis deal CRM gagné ---
async function createWorkProjectFromCrmDeal(dealId) {
    if (typeof crmData === 'undefined') return;
    var deal = (crmData.deals || []).find(function(d) { return d.id === dealId; });
    if (!deal) return;
    var prospect = null, list = null;
    var prospectIds = typeof getCrmDealProspectIds === 'function' ? getCrmDealProspectIds(deal) : (deal.prospectId ? [deal.prospectId] : []);
    var listIds = [];
    if (typeof findCrmProspect === 'function') {
        prospectIds.forEach(function(pid) {
            var found = findCrmProspect(pid);
            if (found) {
                if (!prospect) { prospect = found.prospect; list = found.list; }
                if (listIds.indexOf(found.list.id) === -1) listIds.push(found.list.id);
            }
        });
        if (!prospect && deal.prospectId) {
            var foundPrimary = findCrmProspect(deal.prospectId);
            if (foundPrimary) { prospect = foundPrimary.prospect; list = foundPrimary.list; }
        }
    }
    var title = deal.title || (prospect ? prospect.organisme : 'Nouveau projet');
    var tpl = (workProjectsData.templates || []).find(function(t) { return t.id === 'tpl_commande'; });
    var baseTasks = tpl && tpl.defaultTasks ? tpl.defaultTasks : [
        { title: 'Lancer le projet', description: '', dueDays: 0 },
        { title: 'Devis', description: '', dueDays: 3 },
        { title: 'Confirmation commande', description: '', dueDays: 7 }
    ];
    var tplTasks = typeof applyTemplateDueDates === 'function'
        ? applyTemplateDueDates(baseTasks, new Date())
        : baseTasks;
    var assigneeId = currentUser ? currentUser.id : null;
    var memberIds = await getDefaultWpProjectMemberIds();
    var p = {
        id: wpNewId('wp'),
        title: title,
        description: prospect ? ('Dossier commercial — ' + prospect.organisme) : '',
        color: '#4a90d9',
        icon: '📁',
        members: memberIds,
        tasks: tplTasks.map(function(t, i) {
            return {
                id: wpNewId('task'),
                title: t.title,
                description: t.description || '',
                status: 'todo',
                completed: false,
                assignedTo: assigneeId ? [String(assigneeId)] : [],
                dueDate: t.dueDate || null,
                priority: t.priority || 'normal',
                order: i,
                createdAt: new Date().toISOString(),
                createdBy: currentUser ? currentUser.id : null
            };
        }),
        activities: [],
        crm: { listIds: listIds.length ? listIds : (list ? [list.id] : []), prospectIds: prospectIds.slice(), dealIds: [deal.id] },
        archived: false,
        createdAt: new Date().toISOString(),
        createdBy: currentUser ? currentUser.id : null,
        updatedAt: new Date().toISOString()
    };
    logWpActivity(p, 'create', 'Projet créé depuis le dossier CRM « ' + deal.title + ' »');
    workProjectsData.projects.push(p);
    if (typeof linkCrmDealToWorkProject === 'function') {
        linkCrmDealToWorkProject(deal.id, p.id);
    } else {
        deal.workProjectId = p.id;
        saveWorkProjectsData();
        if (typeof saveCrmData === 'function') saveCrmData();
    }
    if (typeof showToast === 'function') showToast('Espace projet créé', 'success');
    openWorkProjectPage(p.id);
}

// --- Admin templates ---
function renderAdminWpTemplates() {
    var container = document.getElementById('adminWpTemplatesList');
    if (!container) return;
    var templates = (workProjectsData.templates || []).sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    if (!templates.length) {
        container.innerHTML = '<div class="wp-empty">Aucun modèle. Créez-en un.</div>';
        return;
    }
    container.innerHTML = templates.map(function(t) {
        return '<div class="wp-admin-template-card" style="border-left-color:' + escHtml(t.color || '#4a90d9') + '">' +
            '<div class="wp-admin-template-header"><span class="wp-admin-template-icon">' + escHtml(t.icon || '📁') + '</span>' +
            '<div><strong>' + escHtml(t.name) + '</strong><div class="wp-muted">' + escHtml(t.description || '') + '</div>' +
            '<div class="wp-muted">' + (t.defaultTasks || []).length + ' tâche(s) type</div></div></div>' +
            '<div><button type="button" class="btn btn-secondary btn-sm" onclick="openWpTemplateModal(\'' + t.id + '\')">✏️</button> ' +
            '<button type="button" class="btn btn-secondary btn-sm" onclick="deleteWpTemplate(\'' + t.id + '\')">🗑️</button></div></div>';
    }).join('');
}

function openWpTemplateModal(templateId) {
    wpEditingTemplate = templateId ? (workProjectsData.templates || []).find(function(t) { return t.id === templateId; }) : null;
    document.getElementById('wpTemplateModalTitle').textContent = wpEditingTemplate ? 'Modifier le modèle' : 'Nouveau modèle';
    document.getElementById('wpTplName').value = wpEditingTemplate ? wpEditingTemplate.name : '';
    document.getElementById('wpTplDescription').value = wpEditingTemplate ? (wpEditingTemplate.description || '') : '';
    document.getElementById('wpTplColor').value = wpEditingTemplate ? (wpEditingTemplate.color || '#4a90d9') : '#4a90d9';
    document.getElementById('wpTplIcon').value = wpEditingTemplate ? (wpEditingTemplate.icon || '📁') : '📁';
    var tasks = wpEditingTemplate ? (wpEditingTemplate.defaultTasks || []) : [{ title: '', description: '', dueDays: '' }];
    document.getElementById('wpTplTasks').innerHTML = tasks.map(function(t, i) {
        return '<div class="wp-tpl-task-row"><input type="text" placeholder="Titre tâche" value="' + escHtml(t.title || '') + '" data-idx="' + i + '" class="wp-tpl-task-title">' +
            '<input type="text" placeholder="Description" value="' + escHtml(t.description || '') + '" class="wp-tpl-task-desc">' +
            '<input type="number" min="0" placeholder="J+" title="Échéance en jours après création" value="' + (t.dueDays != null ? t.dueDays : '') + '" class="wp-tpl-task-due">' +
            '<button type="button" onclick="this.parentElement.remove()">✕</button></div>';
    }).join('');
    document.getElementById('wpTemplateModal').classList.add('active');
}

function addWpTemplateTaskRow() {
    var container = document.getElementById('wpTplTasks');
    var div = document.createElement('div');
    div.className = 'wp-tpl-task-row';
    div.innerHTML = '<input type="text" placeholder="Titre tâche" class="wp-tpl-task-title"><input type="text" placeholder="Description" class="wp-tpl-task-desc"><input type="number" min="0" placeholder="J+" title="Échéance en jours" class="wp-tpl-task-due"><button type="button" onclick="this.parentElement.remove()">✕</button>';
    container.appendChild(div);
}

function closeWpTemplateModal() {
    document.getElementById('wpTemplateModal').classList.remove('active');
    wpEditingTemplate = null;
}

function saveWpTemplateForm(e) {
    if (e) e.preventDefault();
    var tasks = [];
    document.querySelectorAll('#wpTplTasks .wp-tpl-task-row').forEach(function(row) {
        var title = row.querySelector('.wp-tpl-task-title').value.trim();
        if (!title) return;
        var dueRaw = row.querySelector('.wp-tpl-task-due') ? row.querySelector('.wp-tpl-task-due').value : '';
        var entry = { title: title, description: (row.querySelector('.wp-tpl-task-desc').value || '').trim() };
        if (dueRaw !== '' && dueRaw != null) entry.dueDays = parseInt(dueRaw, 10);
        tasks.push(entry);
    });
    var payload = {
        name: document.getElementById('wpTplName').value.trim(),
        description: document.getElementById('wpTplDescription').value.trim(),
        color: document.getElementById('wpTplColor').value,
        icon: document.getElementById('wpTplIcon').value.trim() || '📁',
        defaultTasks: tasks,
        order: wpEditingTemplate ? (wpEditingTemplate.order || 0) : (workProjectsData.templates || []).length
    };
    if (!payload.name) return;
    if (wpEditingTemplate) {
        Object.assign(wpEditingTemplate, payload);
    } else {
        payload.id = wpNewId('tpl');
        payload.createdAt = new Date().toISOString();
        if (!workProjectsData.templates) workProjectsData.templates = [];
        workProjectsData.templates.push(payload);
    }
    saveWorkProjectsData();
    closeWpTemplateModal();
    renderAdminWpTemplates();
}

function deleteWpTemplate(id) {
    if (!confirm('Supprimer ce modèle ?')) return;
    workProjectsData.templates = (workProjectsData.templates || []).filter(function(t) { return t.id !== id; });
    saveWorkProjectsData();
    renderAdminWpTemplates();
}

function openAdminWorkProjectsPage() {
    document.getElementById('adminPage').classList.remove('active');
    document.getElementById('adminWorkProjectsPage').classList.add('active');
    renderAdminWpTemplates();
}

// --- Permissions UI ---
function updateWorkProjectsNavVisibility() {
    var visible = hasWorkProjectsAccess();
    var dash = document.getElementById('navWorkProjectsDashboard');
    if (dash) dash.style.display = visible ? '' : 'none';
    var homeTile = document.getElementById('homeTileWorkProjects');
    if (homeTile) homeTile.style.display = visible ? '' : 'none';
}

// --- Recherche globale (hook) ---
function wpGlobalSearch(query, results, pushResult) {
    if (!hasWorkProjectsAccess() || !workProjectsData.projects) return;
    var q = query.toLowerCase();
    var push = typeof pushResult === 'function'
        ? pushResult
        : function(key, item) { results.push(item); };
    getActiveWorkProjects().forEach(function(p) {
        if ((p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) {
            var imgUrl = getWpProjectImageUrl(p);
            push('wp_' + p.id, {
                type: 'projet',
                icon: p.icon || '📁',
                imageUrl: imgUrl || null,
                title: p.title,
                subtitle: 'Projets · Espace de travail',
                action: function() { openWorkProjectPage(p.id); }
            });
        }
        (p.tasks || []).forEach(function(t) {
            if ((t.title || '').toLowerCase().includes(q)) {
                push('wp_task_' + (t.id || t.title) + '_' + p.id, {
                    type: 'tâche',
                    icon: '✅',
                    title: t.title,
                    subtitle: 'Projets · ' + p.title,
                    action: function() {
                        if (typeof openTaskFiche === 'function') openTaskFiche('work_project', p.id, t.id);
                        else { openWorkProjectPage(p.id); switchWpTab('tasks'); }
                    }
                });
            }
        });
    });
}

// --- Hooks ---
(function() {
    var origCloseAll = closeAllPages;
    closeAllPages = function() {
        origCloseAll();
        ['workProjectsListPage', 'workProjectPage', 'evenementielHomePage'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
    };

    if (typeof saveWorkspaceElement === 'function') {
        var origSaveWsEl = saveWorkspaceElement;
        saveWorkspaceElement = async function() {
            await origSaveWsEl.apply(this, arguments);
            if (wpCurrentId && window.currentWsProjectId === wpCurrentId) {
                var p = getWorkProjectById(wpCurrentId);
                if (p) {
                    logWpActivity(p, 'note', 'Contenu enregistré');
                    p.updatedAt = new Date().toISOString();
                    saveWorkProjectsData();
                    if (wpCurrentTab === 'notes') renderWpNotes(p);
                }
            }
        };
    }
})();

if (typeof window !== 'undefined') {
    window.openWpTaskModal = openWpTaskModal;
    window.wpSetTasksView = wpSetTasksView;
    window.wpSetTasksAssigneeFilter = wpSetTasksAssigneeFilter;
    window.getAccessibleWorkProjects = getAccessibleWorkProjects;
    window.openWpWorkspaceFile = openWpWorkspaceFile;
    window.downloadWpWorkspaceFile = downloadWpWorkspaceFile;
    window.renameWpDocument = renameWpDocument;
    window.deleteWpNote = deleteWpNote;
    window.deleteWpDocument = deleteWpDocument;
    window.navigateToWpDocFolder = navigateToWpDocFolder;
    window.createWpDocumentFolder = createWpDocumentFolder;
    window.renameWpDocumentFolder = renameWpDocumentFolder;
    window.deleteWpDocumentFolder = deleteWpDocumentFolder;
    window.handleWpDocDragStart = handleWpDocDragStart;
    window.handleWpDocDragEnd = handleWpDocDragEnd;
    window.handleWpDocFolderDragOver = handleWpDocFolderDragOver;
    window.handleWpDocFolderDragLeave = handleWpDocFolderDragLeave;
    window.handleWpDocFolderDrop = handleWpDocFolderDrop;
    window.navigateToWpNoteFolder = navigateToWpNoteFolder;
    window.createWpNoteFolder = createWpNoteFolder;
    window.renameWpNoteFolder = renameWpNoteFolder;
    window.deleteWpNoteFolder = deleteWpNoteFolder;
    window.handleWpNoteDragStart = handleWpNoteDragStart;
    window.handleWpNoteDragEnd = handleWpNoteDragEnd;
    window.handleWpNoteFolderDragOver = handleWpNoteFolderDragOver;
    window.handleWpNoteFolderDragLeave = handleWpNoteFolderDragLeave;
    window.handleWpNoteFolderDrop = handleWpNoteFolderDrop;
    window.handleWpProjectImageSelect = handleWpProjectImageSelect;
    window.removeWpFormImage = removeWpFormImage;
}
