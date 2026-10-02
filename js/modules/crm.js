// ========== MODULE CRM ==========
let crmData = { lists: [], categories: [], activityLines: [], globalAccessUsers: [], deals: [], structures: [] };

function getCrmDataSnapshot() {
    if (crmData && Array.isArray(crmData.deals)) return crmData;
    if (typeof appSettings !== 'undefined' && appSettings && appSettings.crm) return appSettings.crm;
    return crmData;
}
window.getCrmDataSnapshot = getCrmDataSnapshot;
let crmDataLoaded = false;

function mergeCrmDealTasksFromLocal(localDeals, incomingDeals) {
    if (!Array.isArray(localDeals) || !Array.isArray(incomingDeals)) return;
    localDeals.forEach(function(prevDeal) {
        if (!prevDeal || prevDeal.id == null) return;
        var serverDeal = incomingDeals.find(function(d) { return String(d.id) === String(prevDeal.id); });
        if (!serverDeal) return;
        if (typeof ensureDealShape === 'function') {
            ensureDealShape(prevDeal);
            ensureDealShape(serverDeal);
        }
        var prevTasks = prevDeal.tasks || [];
        if (!prevTasks.length) return;
        var serverTasks = serverDeal.tasks || [];
        var prevTs = prevDeal.updatedAt ? new Date(prevDeal.updatedAt).getTime() : 0;
        var serverTs = serverDeal.updatedAt ? new Date(serverDeal.updatedAt).getTime() : 0;
        if (!serverTasks.length || prevTasks.length > serverTasks.length || prevTs >= serverTs) {
            serverDeal.tasks = JSON.parse(JSON.stringify(prevTasks));
            if (prevTs >= serverTs) serverDeal.updatedAt = prevDeal.updatedAt;
        } else if (prevTasks.length && serverTasks.length) {
            var mergedTasks = JSON.parse(JSON.stringify(serverTasks));
            prevTasks.forEach(function(prevTask) {
                if (!prevTask || prevTask.id == null) return;
                var inServer = mergedTasks.find(function(t) { return String(t.id) === String(prevTask.id); });
                if (!inServer) mergedTasks.unshift(JSON.parse(JSON.stringify(prevTask)));
            });
            if (mergedTasks.length > serverTasks.length) {
                serverDeal.tasks = mergedTasks;
                serverDeal.updatedAt = prevDeal.updatedAt;
            }
        }
    });
}

async function ensureCrmDataLoaded(force) {
    if (force || !crmDataLoaded) await loadCrmData();
}
window.ensureCrmDataLoaded = ensureCrmDataLoaded;
let crmCurrentListId = null;
let crmCurrentEditProspect = null;
let crmCurrentEditList = null;
let crmCurrentEditCategory = null;
let crmCurrentEditActivityLine = null;
let crmProspectSortField = 'organisme';
let crmProspectSortAsc = true;
let crmTempListAccessUsers = [];
const CRM_AUTO_ROLES = ['Producteur', 'Chargé de production'];
let crmHomeProspectSortField = 'organisme';
let crmHomeProspectSortAsc = true;
let crmProspectModalListId = null;
window.crmProspectModalPickContext = null;

// --- Permissions CRM ---
function hasCrmAccess() {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (CRM_AUTO_ROLES.includes(currentUser.role_professionnel)) return true;
    // Vérifier permission profil
    if (typeof window.hasPermission === 'function' && window.hasPermission('crm')) return true;
    if (crmData.globalAccessUsers && crmData.globalAccessUsers.includes(String(currentUser.id))) return true;
    return crmData.lists.some(l => l.accessUsers && l.accessUsers.includes(String(currentUser.id)));
}
function hasCrmListAccess(list) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (CRM_AUTO_ROLES.includes(currentUser.role_professionnel)) return true;
    if (typeof window.hasPermission === 'function' && window.hasPermission('crm')) return true;
    if (crmData.globalAccessUsers && crmData.globalAccessUsers.includes(String(currentUser.id))) return true;
    if (list.accessUsers && list.accessUsers.includes(String(currentUser.id))) return true;
    return false;
}
function canManageCrmAccess() {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (CRM_AUTO_ROLES.includes(currentUser.role_professionnel)) return true;
    return false;
}
function updateCrmVisibility() {
    const canAccess = hasCrmAccess();
    const navItem = document.getElementById('navCrmItem');
    if (navItem) navItem.style.display = canAccess ? '' : 'none';
    const homeTile = document.getElementById('homeTileCrm');
    if (homeTile) homeTile.style.display = canAccess ? '' : 'none';
    const homeRelancesWidget = document.getElementById('homeRelancesWidget');
    if (homeRelancesWidget) homeRelancesWidget.style.display = canAccess ? '' : 'none';
    const accessBtn = document.getElementById('crmAccessBtn');
    if (accessBtn) accessBtn.style.display = canManageCrmAccess() ? '' : 'none';
}

// --- Chargement / Sauvegarde ---
async function loadCrmData() {
    var previousDeals = (crmData && crmData.deals)
        ? JSON.parse(JSON.stringify(crmData.deals))
        : [];
    var dealFicheDrafts = typeof captureCrmDealFicheDrafts === 'function'
        ? captureCrmDealFicheDrafts()
        : null;
    try {
        const data = await apiCall('crm.php', 'GET');
        if (data && data.success && data.crm && typeof data.crm === 'object') {
            if (previousDeals.length && Array.isArray(data.crm.deals)) {
                mergeCrmDealTasksFromLocal(previousDeals, data.crm.deals);
            }
            crmData = data.crm;
            appSettings.crm = crmData;
        }
    } catch (e) {
        console.error('CRM: erreur chargement', e);
        if (appSettings && appSettings.crm) crmData = appSettings.crm;
    }
    if (!crmData.lists) crmData.lists = [];
    if (!crmData.categories) crmData.categories = [];
    if (!crmData.activityLines) crmData.activityLines = [];
    if (!crmData.globalAccessUsers) crmData.globalAccessUsers = [];
    if (!crmData.deals) crmData.deals = [];
    ensureCrmActivityLines();
    ensureCrmPipelineStages();
    (crmData.deals || []).forEach(function(d) {
        if (typeof ensureDealShape === 'function') ensureDealShape(d);
    });
    if (dealFicheDrafts && typeof applyCrmDealFicheDrafts === 'function') {
        applyCrmDealFicheDrafts(dealFicheDrafts);
    }
    appSettings.crm = crmData;
    crmDataLoaded = true;
    updateCrmVisibility();
    // Re-render si la page CRM est visible
    var crmPage = document.getElementById('crmPage');
    if (crmPage && crmPage.classList.contains('active')) {
        renderCrmLists();
    }
    var crmListPageEl = document.getElementById('crmListPage');
    if (crmListPageEl && crmListPageEl.classList.contains('active')) {
        renderCrmProspects();
    }
    var crmDealPageEl = document.getElementById('crmDealPage');
    if (crmDealPageEl && crmDealPageEl.classList.contains('active') && typeof renderCrmDealFiche === 'function') {
        renderCrmDealFiche();
    }
    var crmDealDocsPageEl = document.getElementById('crmDealDocumentsPage');
    if (crmDealDocsPageEl && crmDealDocsPageEl.classList.contains('active') && typeof renderCrmDealDocumentsPage === 'function') {
        renderCrmDealDocumentsPage();
    }
    var crmDealNotesPageEl = document.getElementById('crmDealNotesPage');
    if (crmDealNotesPageEl && crmDealNotesPageEl.classList.contains('active') && typeof renderCrmDealNotesPage === 'function') {
        if (typeof crmDealNotesPageShouldSkipRender === 'function' && crmDealNotesPageShouldSkipRender()) {
            if (typeof updateCrmDealNotesPageSubtitle === 'function') {
                var dealForNotes = typeof getCrmDealById === 'function' && typeof crmV2DealId !== 'undefined' && crmV2DealId
                    ? getCrmDealById(crmV2DealId)
                    : null;
                if (dealForNotes) updateCrmDealNotesPageSubtitle(dealForNotes);
            }
        } else {
            renderCrmDealNotesPage();
        }
    }
    if (typeof refreshCrmDealTasksInTaskViews === 'function') refreshCrmDealTasksInTaskViews();
}
async function saveCrmData() {
    isSaving = true;
    lastSaveTimestamp = Date.now();
    appSettings.crm = crmData;
    try {
        await apiCall('crm.php', 'POST', { crm: crmData });
        console.log('CRM: données sauvegardées avec succès');
    } catch (e) {
        console.error('CRM: erreur sauvegarde', e);
        alert('Erreur lors de la sauvegarde CRM. Vérifiez votre connexion.');
    } finally {
        isSaving = false;
        if (typeof refreshCrmDealTasksInTaskViews === 'function') refreshCrmDealTasksInTaskViews();
    }
}

// --- Lignes d'activité (paramétrables) ---
function getDefaultCrmActivityLines() {
    return [
        { id: 'line_spectacle', name: 'Spectacle', description: 'Productions, tournées et dates', color: '#4a90d9', emoji: '🎭', order: 0, active: true, pipelineStages: ['Prospect', 'Contacté', 'Devis envoyé', 'Négociation', 'Contrat signé', 'Perdu'] },
        { id: 'line_communication', name: 'Communication', description: 'Campagnes, contenus et image', color: '#805ad5', emoji: '📣', order: 1, active: true, pipelineStages: ['Lead', 'Brief', 'Proposition', 'Devis', 'En cours', 'Livré', 'Perdu'] },
        { id: 'line_produits', name: 'Produits & services', description: 'Merch, prestations et ventes', color: '#38a169', emoji: '🛒', order: 2, active: true, pipelineStages: ['Demande', 'Devis', 'Commande', 'Livraison', 'Clôturé', 'Perdu'] }
    ];
}
function ensureCrmActivityLines() {
    if (!Array.isArray(crmData.activityLines)) crmData.activityLines = [];
    if (crmData.activityLines.length === 0) {
        crmData.activityLines = getDefaultCrmActivityLines();
    }
    crmData.activityLines.forEach(function(line, i) {
        if (line.order === undefined || line.order === null) line.order = i;
        if (line.active === undefined) line.active = true;
        if (!line.color) line.color = '#4a90d9';
        if (!line.emoji) line.emoji = '📋';
        if (!Array.isArray(line.pipelineStages)) line.pipelineStages = [];
    });
    crmData.activityLines.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
}
function getActiveCrmActivityLines() {
    ensureCrmActivityLines();
    return (crmData.activityLines || []).filter(function(l) { return l.active !== false; });
}
function getCrmActivityLineById(id) {
    if (!id) return null;
    ensureCrmActivityLines();
    return (crmData.activityLines || []).find(function(l) { return l.id === id; }) || null;
}
function crmActivityLineLabel(line) {
    if (!line) return '';
    return (line.emoji ? line.emoji + ' ' : '') + (line.name || '');
}

// --- Étapes pipeline globales (kanban + dossiers) ---
function getDefaultCrmGlobalPipelineStages() {
    return ['Prospect', 'Contacté', 'Devis envoyé', 'Négociation', 'Contrat signé', 'Perdu'];
}

function ensureCrmPipelineStages() {
    if (!Array.isArray(crmData.pipelineStages)) crmData.pipelineStages = [];
    if (crmData.pipelineStages.length) return;
    var seen = {};
    var stages = [];
    (crmData.activityLines || []).forEach(function(line) {
        (line.pipelineStages || []).forEach(function(s) {
            if (s && !seen[s]) { seen[s] = true; stages.push(s); }
        });
    });
    crmData.pipelineStages = stages.length ? stages : getDefaultCrmGlobalPipelineStages();
}

function getCrmPipelineStages() {
    ensureCrmPipelineStages();
    var stages = (crmData.pipelineStages || []).slice();
    var seen = {};
    stages.forEach(function(s) { seen[s] = true; });
    (crmData.deals || []).filter(function(d) { return d.status === 'open' && d.stage; }).forEach(function(d) {
        if (!seen[d.stage]) { seen[d.stage] = true; stages.push(d.stage); }
    });
    return stages;
}

function renderCrmPipelineStagesEditor(containerId, stages) {
    var container = document.getElementById(containerId);
    if (!container) return;
    stages = stages || [];
    container.innerHTML = stages.map(function(stage, i) {
        return '<div class="crm-activity-pipeline-row">' +
            '<input type="text" value="' + escHtml(stage) + '" maxlength="80" placeholder="Étape du pipeline">' +
            '<button type="button" onclick="removeCrmPipelineStageRow(\'' + containerId + '\',' + i + ')">✕</button></div>';
    }).join('');
    if (!stages.length) {
        container.innerHTML = '<p class="crm-modal-hint" style="margin:0 0 0.5rem;">Aucune étape. Ajoutez les colonnes de votre pipeline.</p>';
    }
}

function addCrmPipelineStageRow(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var row = document.createElement('div');
    row.className = 'crm-activity-pipeline-row';
    row.innerHTML = '<input type="text" maxlength="80" placeholder="Ex : Contacté">' +
        '<button type="button" onclick="this.parentElement.remove()">✕</button>';
    container.appendChild(row);
    row.querySelector('input').focus();
}

function removeCrmPipelineStageRow(containerId, index) {
    var stages = getCrmPipelineStagesFromForm(containerId);
    stages.splice(index, 1);
    renderCrmPipelineStagesEditor(containerId, stages);
}

function getCrmPipelineStagesFromForm(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input')).map(function(inp) { return inp.value.trim(); }).filter(Boolean);
}

function saveCrmGlobalPipelineStages() {
    var next = getCrmPipelineStagesFromForm('crmAdminGlobalPipeline');
    if (!next.length) {
        alert('Ajoutez au moins une étape de pipeline.');
        return;
    }
    crmData.pipelineStages = next;
    saveCrmData();
    renderCrmAdminGlobalPipeline();
    if (typeof renderCrmKanban === 'function' && document.getElementById('crmPipelinePage') && document.getElementById('crmPipelinePage').classList.contains('active')) {
        renderCrmKanban();
    }
}

function renderCrmAdminGlobalPipeline() {
    ensureCrmPipelineStages();
    renderCrmPipelineStagesEditor('crmAdminGlobalPipeline', crmData.pipelineStages || []);
}

function openCrmPipelineStagesModal() {
    if (!canManageCrmAccess()) {
        alert('Réservé aux administrateurs et responsables CRM.');
        return;
    }
    ensureCrmPipelineStages();
    renderCrmPipelineStagesEditor('crmPipelineStagesEditor', crmData.pipelineStages || []);
    document.getElementById('crmPipelineStagesModal').classList.add('active');
}

function closeCrmPipelineStagesModal() {
    document.getElementById('crmPipelineStagesModal').classList.remove('active');
}

function saveCrmPipelineStagesFromModal() {
    var next = getCrmPipelineStagesFromForm('crmPipelineStagesEditor');
    if (!next.length) {
        alert('Ajoutez au moins une étape.');
        return;
    }
    crmData.pipelineStages = next;
    saveCrmData();
    closeCrmPipelineStagesModal();
    if (typeof renderCrmKanban === 'function') renderCrmKanban();
}

// --- Navigation ---
var crmListPageReturnTo = 'home';

function openCrmPage() {
    if (!hasCrmAccess()) { alert("Vous n'avez pas accès au CRM."); return; }
    closeAllPages();
    if (typeof crmHideBrowsePages === 'function') crmHideBrowsePages();
    document.getElementById('homeWelcome').style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const navItem = document.querySelector('.nav-item[onclick="openCrmPage()"]');
    if (navItem) navItem.classList.add('active');
    document.getElementById('crmPage').classList.add('active');
    if (typeof renderHomeWelcomeLogo === 'function') {
        renderHomeWelcomeLogo(document.getElementById('crmHomeHeroLogo'), '🏢');
    }
    renderCrmLists();
    closeSidebarOnMobile();
}
function closeCrmPage() {
    document.getElementById('crmPage').classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const homeItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (homeItem) homeItem.classList.add('active');
    document.getElementById('homeWelcome').style.display = '';
    updateHomeTiles();
}
function openCrmListPage(listId) {
    const list = crmData.lists.find(l => l.id === listId);
    if (!list) return;
    if (!hasCrmListAccess(list)) { alert("Vous n'avez pas accès à cette liste."); return; }
    if (typeof closeCrmListsManageModal === 'function') closeCrmListsManageModal();
    crmCurrentListId = listId;
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmListPage').classList.add('active');
    document.getElementById('crmListTitle').textContent = list.name;
    document.getElementById('crmListDesc').textContent = list.description || '';
    buildCrmFilterSelects();
    renderCrmProspects();
}
function openCrmListPage(listId) {
    const list = crmData.lists.find(l => l.id === listId);
    if (!list) return;
    if (!hasCrmListAccess(list)) { alert("Vous n'avez pas accès à cette liste."); return; }
    if (typeof closeCrmListsManageModal === 'function') closeCrmListsManageModal();
    if (typeof crmHideBrowsePages === 'function') crmHideBrowsePages();
    crmCurrentListId = listId;
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmProspectsHubPage').classList.remove('active');
    document.getElementById('crmListPage').classList.add('active');
    document.getElementById('crmListTitle').textContent = list.name;
    document.getElementById('crmListDesc').textContent = list.description || '';
    buildCrmFilterSelects();
    renderCrmProspects();
}
function openCrmListPageFromBrowse(listId) {
    crmListPageReturnTo = 'lists_browse';
    openCrmListPage(listId);
}
function closeCrmListPage() {
    closeCrmListTagEditor();
    if (typeof closeCrmBulkHistoryModal === 'function') closeCrmBulkHistoryModal();
    clearCrmListSelection();
    document.getElementById('crmListPage').classList.remove('active');
    crmCurrentListId = null;
    if (crmListPageReturnTo === 'lists_browse') {
        if (typeof openCrmListsBrowsePage === 'function') openCrmListsBrowsePage();
        else document.getElementById('crmProspectsHubPage').classList.add('active');
    } else {
        document.getElementById('crmPage').classList.add('active');
        renderCrmLists();
    }
    crmListPageReturnTo = 'home';
}

function updateCrmHomeStats() {
    const accessible = crmData.lists.filter(l => hasCrmListAccess(l));
    let totalP = typeof countAllCrmProspects === 'function' ? countAllCrmProspects() : 0;
    if (!totalP) accessible.forEach(l => totalP += (l.prospects || []).length);
    var elP = document.getElementById('crmStatProspects');
    if (elP) elP.textContent = totalP;
    var hubP = document.getElementById('crmHubStatProspects');
    if (hubP) hubP.textContent = totalP;
    var hubL = document.getElementById('crmHubStatLists');
    if (hubL) hubL.textContent = accessible.length;
    var hubS = document.getElementById('crmHubStatStructures');
    if (hubS) hubS.textContent = (crmData.structures || []).length;
    var openDeals = (typeof getCrmAccessibleDeals === 'function' ? getCrmAccessibleDeals() : (crmData.deals || [])).filter(function(d) {
        return d.status === 'open';
    });
    var statDeals = document.getElementById('crmStatDeals');
    if (statDeals) statDeals.textContent = openDeals.length;
    var relances = typeof getCrmFollowUps === 'function' ? getCrmFollowUps({ mineOnly: true }) : [];
    var relancesToday = relances.filter(function(r) {
        return typeof crmIsFollowUpToday === 'function' && crmIsFollowUpToday(r.date);
    }).length;
    var statRel = document.getElementById('crmStatRelances');
    if (statRel) statRel.textContent = relancesToday;
    var statRelTotal = document.getElementById('crmStatRelancesTotal');
    if (statRelTotal) {
        var total = relances.length;
        statRelTotal.textContent = total + ' au total';
    }
}

function paintCrmListsGrid(gridId, emptyId, filter, openFromBrowse) {
    const grid = document.getElementById(gridId);
    const empty = emptyId ? document.getElementById(emptyId) : null;
    if (!grid) return;
    const search = (filter || '').toLowerCase();
    const accessible = crmData.lists.filter(l => hasCrmListAccess(l));
    const filtered = accessible.filter(l => !search || l.name.toLowerCase().includes(search) || (l.description || '').toLowerCase().includes(search));
    const openFn = openFromBrowse ? 'openCrmListPageFromBrowse' : 'openCrmListPage';
    if (filtered.length === 0) { grid.innerHTML = ''; if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = filtered.map(l => {
        const count = typeof countProspectsForList === 'function' ? countProspectsForList(l) : (l.prospects || []).length;
        const date = l.createdAt ? new Date(l.createdAt).toLocaleDateString('fr-FR') : '';
        return `<div class="crm-list-card" onclick="${openFn}('${l.id}')">
            <div class="crm-list-card-actions">
                <button onclick="event.stopPropagation(); editCrmList('${l.id}')" title="Modifier">✏️</button>
                <button onclick="event.stopPropagation(); deleteCrmList('${l.id}')" title="Supprimer">🗑️</button>
            </div>
            <div class="crm-list-card-name">${escHtml(l.name)}</div>
            <div class="crm-list-card-desc">${escHtml(l.description || 'Aucune description')}</div>
            <div class="crm-list-card-meta"><span>${date}</span><span class="crm-list-card-count">${count} prospect${count !== 1 ? 's' : ''}</span></div>
        </div>`;
    }).join('');
}

// --- Rendu listes ---
function renderCrmLists(filter) {
    updateCrmHomeStats();
    populateCrmHomeListFilter();
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
    else if (typeof renderCrmRelancesBrowse === 'function') renderCrmRelancesBrowse();
    if (typeof renderCrmStructuresBrowse === 'function') renderCrmStructuresBrowse();
    var modalSearch = document.getElementById('crmSearchInput');
    paintCrmListsGrid('crmListsGrid', 'crmEmptyState', filter !== undefined ? filter : (modalSearch ? modalSearch.value : ''), false);
    var browseSearch = document.getElementById('crmListsBrowseSearch');
    paintCrmListsGrid('crmListsBrowseGrid', 'crmListsBrowseEmpty', browseSearch ? browseSearch.value : '', true);
}
function filterCrmLists(v) { renderCrmLists(v); }
function filterCrmListsBrowse() { renderCrmLists(); }
function renderCrmListsBrowse() { renderCrmLists(); }

function openCrmListsManageModal() {
    renderCrmLists(document.getElementById('crmSearchInput') ? document.getElementById('crmSearchInput').value : '');
    document.getElementById('crmListsManageModal').classList.add('active');
}
function closeCrmListsManageModal() {
    document.getElementById('crmListsManageModal').classList.remove('active');
    populateCrmHomeListFilter();
    renderCrmHomeProspects();
}

// --- Accueil CRM : tous les prospects ---
function getAllAccessibleProspects() {
    var byId = {};
    (crmData.lists || []).filter(hasCrmListAccess).forEach(function(list) {
        var prospects = typeof getProspectsForList === 'function'
            ? getProspectsForList(list.id)
            : (list.prospects || []);
        prospects.forEach(function(p) {
            if (!byId[p.id]) {
                byId[p.id] = { prospect: p, listIds: [], listNames: [] };
            }
            if (byId[p.id].listIds.indexOf(list.id) === -1) {
                byId[p.id].listIds.push(list.id);
                byId[p.id].listNames.push(list.name || 'Liste');
            }
        });
    });
    return Object.keys(byId).map(function(id) {
        var x = byId[id];
        return {
            prospect: x.prospect,
            listId: x.listIds[0] || '',
            listName: x.listNames.join(', '),
            listIds: x.listIds,
            listNames: x.listNames
        };
    });
}

function populateCrmHomeListFilter() {
    var sel = document.getElementById('crmHomeListFilter');
    if (!sel) return;
    var current = sel.value || 'all';
    var accessible = (crmData.lists || []).filter(hasCrmListAccess);
    sel.innerHTML = '<option value="all">Toutes les listes</option>' +
        accessible.map(function(l) {
            return '<option value="' + escHtml(l.id) + '">' + escHtml(l.name || 'Liste') + '</option>';
        }).join('');
    if (current !== 'all' && accessible.some(function(l) { return l.id === current; })) sel.value = current;
}

function getCrmHomeFilteredProspects() {
    var items = getAllAccessibleProspects();
    var searchEl = document.getElementById('crmHomeProspectSearch');
    var search = (searchEl ? searchEl.value : '').toLowerCase().trim();
    var listFilter = document.getElementById('crmHomeListFilter');
    var listId = listFilter ? listFilter.value : 'all';
    if (listId && listId !== 'all') {
        items = items.filter(function(x) {
            return (x.listIds || []).indexOf(listId) !== -1 || x.listId === listId;
        });
    }
    if (search) {
        items = items.filter(function(x) {
            var p = x.prospect;
            var structure = typeof getCrmProspectStructure === 'function' ? getCrmProspectStructure(p) : null;
            var hay = [p.organisme, structure ? structure.organisme : '', p.contactNom, p.contactPrenom, structure ? structure.ville : p.ville, p.email, p.tel, p.telFixe, p.telMobile, p.notes, x.listName].join(' ').toLowerCase();
            return hay.indexOf(search) !== -1;
        });
    }
    items.sort(function(a, b) {
        var p = a.prospect, q = b.prospect;
        var va = '', vb = '';
        if (crmHomeProspectSortField === 'organisme') { va = p.organisme || ''; vb = q.organisme || ''; }
        else if (crmHomeProspectSortField === 'contact') { va = (p.contactNom || '') + (p.contactPrenom || ''); vb = (q.contactNom || '') + (q.contactPrenom || ''); }
        else if (crmHomeProspectSortField === 'ville') { va = p.ville || ''; vb = q.ville || ''; }
        var cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base' });
        return crmHomeProspectSortAsc ? cmp : -cmp;
    });
    return items;
}

function renderCrmHomeProspects() {
    var body = document.getElementById('crmHomeProspectsBody');
    var empty = document.getElementById('crmHomeProspectsEmpty');
    var emptyText = document.getElementById('crmHomeProspectsEmptyText');
    if (!body) return;
    var items = getCrmHomeFilteredProspects();
    var total = getAllAccessibleProspects().length;
    if (!items.length) {
        body.innerHTML = '';
        if (empty) {
            empty.style.display = '';
            if (emptyText) {
                emptyText.textContent = total === 0
                    ? 'Aucun prospect — ajoutez-en un ou importez un fichier.'
                    : 'Aucun résultat pour cette recherche.';
            }
        }
        return;
    }
    if (empty) empty.style.display = 'none';
    body.innerHTML = items.map(function(x) {
        var p = x.prospect;
        var tags = Object.entries(p.tags || {}).map(function(kv) {
            if (!kv[1]) return '';
            return '<span class="crm-prospect-tag">' + escHtml(kv[1]) + '</span>';
        }).filter(Boolean).join('');
        var contact = [p.contactPrenom, p.contactNom].filter(Boolean).join(' ');
        var fonction = p.contactFonction ? '<br><span class="crm-prospect-fonction">' + escHtml(p.contactFonction) + '</span>' : '';
        var listPills = (x.listNames && x.listNames.length ? x.listNames : [x.listName]).map(function(name) {
            return '<span class="crm-home-list-pill">' + escHtml(name) + '</span>';
        }).join('');
        var structure = typeof getCrmProspectStructure === 'function' ? getCrmProspectStructure(p) : null;
        var structureName = structure ? (structure.organisme || '—') : (p.organisme || '—');
        var personName = typeof getCrmProspectPersonName === 'function' ? getCrmProspectPersonName(p) : contact;
        var phone = p.telFixe || p.telMobile || p.tel || '';
        var city = structure ? (structure.ville || '') : (p.ville || '');
        return '<tr onclick="openCrmProspectFiche(\'' + escHtml(p.id) + '\')">' +
            '<td><span class="crm-prospect-org">' + escHtml(structureName) + '</span></td>' +
            '<td>' + (personName ? escHtml(personName) : '—') + fonction + '</td>' +
            '<td class="crm-col-hide-mobile">' + escHtml(city || '—') + '</td>' +
            '<td class="crm-col-hide-mobile">' + (phone ? '<a href="tel:' + escHtml(phone) + '" onclick="event.stopPropagation()">' + escHtml(phone) + '</a>' : '—') + '</td>' +
            '<td class="crm-col-hide-mobile">' + (p.email ? '<a href="mailto:' + escHtml(p.email) + '" onclick="event.stopPropagation()">' + escHtml(p.email) + '</a>' : '—') + '</td>' +
            '<td><div class="crm-home-list-pills">' + (listPills || '—') + '</div></td>' +
            '<td><div class="crm-prospect-tags">' + (tags || '—') + '</div></td>' +
            '<td onclick="event.stopPropagation()"><button type="button" class="crm-row-action-btn" onclick="crmEditProspectFromHome(\'' + escHtml(p.id) + '\')" title="Modifier">✏️</button></td>' +
            '</tr>';
    }).join('');
}

function filterCrmHomeProspects() { renderCrmHomeProspects(); }
function sortCrmHomeProspects(field) {
    if (crmHomeProspectSortField === field) crmHomeProspectSortAsc = !crmHomeProspectSortAsc;
    else { crmHomeProspectSortField = field; crmHomeProspectSortAsc = true; }
    renderCrmHomeProspects();
}

function renderCrmListPicker(containerId, selectedIds) {
    var container = document.getElementById(containerId);
    if (!container) return;
    bindCrmListMultiSelectDocClick();
    var accessible = (crmData.lists || []).filter(hasCrmListAccess);
    var selected = {};
    (selectedIds || []).forEach(function(id) { selected[String(id)] = true; });
    container.className = 'crm-ms-wrap';
    container.innerHTML =
        '<button type="button" class="crm-ms-trigger" onclick="toggleCrmListMultiSelect(\'' + containerId + '\', event)">' +
            '<span class="crm-ms-label">Choisir des listes…</span>' +
            '<span class="crm-ms-chevron" aria-hidden="true">▾</span>' +
        '</button>' +
        '<div class="crm-ms-panel" style="display:none;" onclick="event.stopPropagation()">' +
            '<input type="search" class="crm-ms-search" placeholder="Rechercher une liste…" autocomplete="off" oninput="filterCrmListMultiSelect(\'' + containerId + '\')">' +
            '<div class="crm-ms-options">' +
                (accessible.length
                    ? accessible.map(function(l) {
                        var checked = selected[String(l.id)] ? ' checked' : '';
                        var desc = l.description ? ' <small>' + escHtml(l.description) + '</small>' : '';
                        return '<label class="crm-ms-option" data-name="' + escHtml((l.name || '').toLowerCase()) + '">' +
                            '<input type="checkbox" value="' + escHtml(l.id) + '"' + checked + ' onchange="updateCrmListMultiSelectLabel(\'' + containerId + '\')">' +
                            '<span class="crm-ms-option-text">' + escHtml(l.name || 'Liste') + desc + '</span></label>';
                    }).join('')
                    : '<div class="crm-ms-empty">Aucune liste disponible</div>') +
            '</div>' +
            '<div class="crm-ms-footer">' +
                '<button type="button" class="crm-ms-new" onclick="openCrmNewListFromPicker(\'' + containerId + '\')">＋ Créer une nouvelle liste</button>' +
            '</div>' +
        '</div>';
    updateCrmListMultiSelectLabel(containerId);
}

function getCrmListPickerSelectedIds(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return [];
    return Array.prototype.map.call(
        container.querySelectorAll('.crm-ms-options input[type="checkbox"]:checked'),
        function(cb) { return cb.value; }
    );
}

var crmListMultiSelectBound = false;

function bindCrmListMultiSelectDocClick() {
    if (crmListMultiSelectBound) return;
    crmListMultiSelectBound = true;
    document.addEventListener('click', function(e) {
        document.querySelectorAll('.crm-ms-wrap.crm-ms-open').forEach(function(wrap) {
            if (!wrap.contains(e.target)) {
                wrap.classList.remove('crm-ms-open');
                var panel = wrap.querySelector('.crm-ms-panel');
                if (panel) panel.style.display = 'none';
            }
        });
    });
}

function toggleCrmListMultiSelect(containerId, e) {
    if (e) e.stopPropagation();
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    var panel = wrap.querySelector('.crm-ms-panel');
    var willOpen = !wrap.classList.contains('crm-ms-open');
    document.querySelectorAll('.crm-ms-wrap.crm-ms-open').forEach(function(w) {
        w.classList.remove('crm-ms-open');
        var p = w.querySelector('.crm-ms-panel');
        if (p) p.style.display = 'none';
    });
    if (willOpen) {
        wrap.classList.add('crm-ms-open');
        if (panel) panel.style.display = 'block';
        var search = wrap.querySelector('.crm-ms-search');
        if (search) {
            search.value = '';
            filterCrmListMultiSelect(containerId);
            setTimeout(function() { search.focus(); }, 0);
        }
    }
}

function filterCrmListMultiSelect(containerId) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    var q = (wrap.querySelector('.crm-ms-search')?.value || '').trim().toLowerCase();
    wrap.querySelectorAll('.crm-ms-option').forEach(function(opt) {
        var name = opt.getAttribute('data-name') || '';
        opt.style.display = !q || name.indexOf(q) !== -1 ? '' : 'none';
    });
}

function updateCrmListMultiSelectLabel(containerId) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    var label = wrap.querySelector('.crm-ms-label');
    if (!label) return;
    var ids = getCrmListPickerSelectedIds(containerId);
    var accessible = (crmData.lists || []).filter(hasCrmListAccess);
    var names = ids.map(function(id) {
        var l = accessible.find(function(x) { return x.id === id; });
        return l ? (l.name || 'Liste') : '';
    }).filter(Boolean);
    if (!names.length) label.textContent = 'Choisir des listes…';
    else if (names.length === 1) label.textContent = names[0];
    else if (names.length === 2) label.textContent = names.join(', ');
    else label.textContent = names.slice(0, 2).join(', ') + ' (+' + (names.length - 2) + ')';
    wrap.classList.toggle('crm-ms-has-value', names.length > 0);
}

function openCrmNewListFromPicker(containerId) {
    var wrap = document.getElementById(containerId);
    if (wrap) wrap.classList.remove('crm-ms-open');
    crmListCreateCallback = function(newListId) {
        var prev = getCrmListPickerSelectedIds(containerId);
        if (prev.indexOf(newListId) === -1) prev.push(newListId);
        renderCrmListPicker(containerId, prev);
        var pickWrap = document.getElementById(containerId);
        if (pickWrap) {
            pickWrap.classList.add('crm-ms-open');
            var panel = pickWrap.querySelector('.crm-ms-panel');
            if (panel) panel.style.display = 'block';
        }
    };
    openCrmListModal();
}

window.renderCrmListPicker = renderCrmListPicker;
window.getCrmListPickerSelectedIds = getCrmListPickerSelectedIds;
window.openCrmNewListFromPicker = openCrmNewListFromPicker;
window.toggleCrmListMultiSelect = toggleCrmListMultiSelect;
window.filterCrmListMultiSelect = filterCrmListMultiSelect;
window.updateCrmListMultiSelectLabel = updateCrmListMultiSelectLabel;

var crmListCreateCallback = null;

function openCrmProspectModalFromHome(prospect) {
    var accessible = (crmData.lists || []).filter(hasCrmListAccess);
    if (!accessible.length) {
        alert('Créez d\'abord une liste pour classer vos prospects.');
        openCrmListsManageModal();
        return;
    }
    var found = prospect && typeof findCrmProspect === 'function' ? findCrmProspect(prospect.id || prospect) : null;
    var p = found ? found.prospect : (typeof prospect === 'object' ? prospect : null);
    crmProspectModalListId = found ? found.list.id : (accessible.length === 1 ? accessible[0].id : null);
    openCrmProspectModal(p || null);
}

function crmEditProspectFromHome(prospectId) {
    var found = typeof findCrmProspect === 'function' ? findCrmProspect(prospectId) : null;
    if (found) openCrmProspectModalFromHome(found.prospect);
}

// --- CRUD Listes ---
function openCrmListModal(list) {
    crmCurrentEditList = list || null;
    document.getElementById('crmListModalTitle').textContent = list ? '✏️ Modifier la liste' : '📋 Nouvelle liste';
    document.getElementById('crmListName').value = list ? list.name : '';
    document.getElementById('crmListDescription').value = list ? (list.description || '') : '';
    document.getElementById('crmListModal').classList.add('active');
}
function closeCrmListModal() {
    document.getElementById('crmListModal').classList.remove('active');
    crmCurrentEditList = null;
    if (crmListCreateCallback) crmListCreateCallback = null;
}
function saveCrmList(e) {
    e.preventDefault();
    const name = document.getElementById('crmListName').value.trim();
    const desc = document.getElementById('crmListDescription').value.trim();
    if (!name) return;
    var createdListId = null;
    if (crmCurrentEditList) {
        const list = crmData.lists.find(l => l.id === crmCurrentEditList.id);
        if (list) {
            list.name = name;
            list.description = desc;
        }
    } else {
        createdListId = 'crm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        crmData.lists.push({
            id: createdListId,
            name, description: desc, prospects: [], accessUsers: [],
            createdAt: new Date().toISOString()
        });
    }
    saveCrmData();
    var createCb = crmListCreateCallback;
    crmListCreateCallback = null;
    closeCrmListModal();
    if (createCb && createdListId) {
        createCb(createdListId);
        if (typeof showToast === 'function') showToast('Liste créée et sélectionnée', 'success');
    }
    renderCrmLists();
    populateCrmHomeListFilter();
    renderCrmHomeProspects();
}
function editCrmList(id) { const l = crmData.lists.find(x => x.id === id); if (l) openCrmListModal(l); }
function deleteCrmList(id) {
    const l = crmData.lists.find(x => x.id === id);
    if (!l || !confirm('Supprimer la liste "' + l.name + '" ?\nLes prospects présents uniquement dans cette liste seront supprimés.')) return;
    var prospectsInList = typeof getProspectsForList === 'function' ? getProspectsForList(id) : (l.prospects || []);
    prospectsInList.forEach(function(p) {
        var lids = typeof getCrmProspectListIds === 'function'
            ? getCrmProspectListIds(p).filter(function(lid) { return lid !== id; })
            : [];
        if (!lids.length) {
            (crmData.lists || []).forEach(function(list) {
                list.prospects = (list.prospects || []).filter(function(pr) { return pr.id !== p.id; });
            });
        } else if (typeof syncProspectListMembership === 'function') {
            syncProspectListMembership(p, lids);
        }
    });
    crmData.lists = crmData.lists.filter(x => x.id !== id);
    saveCrmData(); renderCrmLists();
    populateCrmHomeListFilter();
    renderCrmHomeProspects();
}

// --- Filtres dynamiques ---
function ensureProspectListTags(prospect) {
    if (!prospect.listTags || typeof prospect.listTags !== 'object' || Array.isArray(prospect.listTags)) {
        prospect.listTags = {};
    }
}

function getCrmProspectListTags(prospect, listId) {
    if (!prospect || !listId) return [];
    ensureProspectListTags(prospect);
    var tags = prospect.listTags[listId];
    if (!Array.isArray(tags)) return [];
    return tags.map(function(t) { return String(t || '').trim(); }).filter(Boolean);
}

function setCrmProspectListTags(prospect, listId, tags) {
    if (!prospect || !listId) return;
    ensureProspectListTags(prospect);
    var clean = [];
    var seen = {};
    (tags || []).forEach(function(t) {
        var v = String(t || '').trim();
        if (v && !seen[v]) { seen[v] = true; clean.push(v); }
    });
    if (clean.length) prospect.listTags[listId] = clean;
    else delete prospect.listTags[listId];
}

function getCrmListKnownTags(listId) {
    if (!listId) return [];
    var prospects = typeof getProspectsForList === 'function'
        ? getProspectsForList(listId)
        : ((crmData.lists || []).find(function(l) { return l.id === listId; }) || {}).prospects || [];
    var seen = {};
    var out = [];
    prospects.forEach(function(p) {
        getCrmProspectListTags(p, listId).forEach(function(t) {
            if (!seen[t]) { seen[t] = true; out.push(t); }
        });
    });
    return out.sort(function(a, b) { return a.localeCompare(b, 'fr', { sensitivity: 'base' }); });
}

var crmListTagEditProspectId = null;

function renderCrmListTagDatalist(listId) {
    var dl = document.getElementById('crmListTagPopoverDatalist');
    if (!dl) return;
    dl.innerHTML = getCrmListKnownTags(listId).map(function(t) {
        return '<option value="' + escHtml(t) + '"></option>';
    }).join('');
}

function renderCrmListTagPopoverContent() {
    var listId = crmCurrentListId;
    var prospectId = crmListTagEditProspectId;
    var container = document.getElementById('crmListTagPopoverCurrent');
    if (!container || !listId || !prospectId) return;
    var found = typeof findCrmProspect === 'function' ? findCrmProspect(prospectId) : null;
    if (!found) return;
    var tags = getCrmProspectListTags(found.prospect, listId);
    container.innerHTML = tags.map(function(t) {
        return '<span class="crm-list-tag-chip">' + escHtml(t) +
            '<button type="button" onclick="removeCrmProspectListTag(\'' + escHtml(prospectId) + '\',\'' + escHtml(t).replace(/'/g, "\\'") + '\')" title="Retirer">×</button></span>';
    }).join('');
    renderCrmListTagDatalist(listId);
}

function openCrmListTagEditor(prospectId, evt) {
    if (evt) { evt.stopPropagation(); evt.preventDefault(); }
    if (!crmCurrentListId) return;
    crmListTagEditProspectId = prospectId;
    var pop = document.getElementById('crmListTagPopover');
    var input = document.getElementById('crmListTagPopoverInput');
    if (!pop) return;
    renderCrmListTagPopoverContent();
    pop.style.display = 'block';
    if (input) { input.value = ''; }
    var btn = evt && evt.currentTarget ? evt.currentTarget : null;
    if (btn) {
        var rect = btn.getBoundingClientRect();
        var top = rect.bottom + 6;
        var left = Math.min(rect.left, window.innerWidth - 340);
        if (top + 180 > window.innerHeight) top = Math.max(8, rect.top - 180);
        pop.style.top = Math.round(top) + 'px';
        pop.style.left = Math.round(Math.max(8, left)) + 'px';
    }
    if (input) setTimeout(function() { input.focus(); }, 50);
}

function closeCrmListTagEditor() {
    crmListTagEditProspectId = null;
    var pop = document.getElementById('crmListTagPopover');
    if (pop) pop.style.display = 'none';
    var input = document.getElementById('crmListTagPopoverInput');
    if (input) input.value = '';
}

function addCrmListTagFromEditor() {
    var listId = crmCurrentListId;
    var prospectId = crmListTagEditProspectId;
    var input = document.getElementById('crmListTagPopoverInput');
    if (!listId || !prospectId || !input) return;
    var tag = input.value.trim();
    if (!tag) return;
    var found = typeof findCrmProspect === 'function' ? findCrmProspect(prospectId) : null;
    if (!found) return;
    var tags = getCrmProspectListTags(found.prospect, listId);
    if (tags.indexOf(tag) === -1) tags.push(tag);
    setCrmProspectListTags(found.prospect, listId, tags);
    saveCrmData();
    input.value = '';
    renderCrmListTagPopoverContent();
    buildCrmFilterSelects();
    renderCrmProspects();
}

function removeCrmProspectListTag(prospectId, tag) {
    var listId = crmCurrentListId;
    if (!listId) return;
    var found = typeof findCrmProspect === 'function' ? findCrmProspect(prospectId) : null;
    if (!found) return;
    var tags = getCrmProspectListTags(found.prospect, listId).filter(function(t) { return t !== tag; });
    setCrmProspectListTags(found.prospect, listId, tags);
    saveCrmData();
    renderCrmListTagPopoverContent();
    buildCrmFilterSelects();
    renderCrmProspects();
}

function renderCrmProspectListTagsEditor(prospect, listId, tagsOverride) {
    var section = document.getElementById('crmProspListTagsSection');
    var editor = document.getElementById('crmProspListTagsEditor');
    var nameEl = document.getElementById('crmProspListTagsListName');
    if (!section || !editor) return;
    if (!listId) { section.style.display = 'none'; return; }
    var list = (crmData.lists || []).find(function(l) { return l.id === listId; });
    section.style.display = '';
    if (nameEl) nameEl.textContent = list ? ('(' + (list.name || 'liste') + ')') : '';
    var tags = Array.isArray(tagsOverride)
        ? tagsOverride.slice()
        : (prospect ? getCrmProspectListTags(prospect, listId) : []);
    editor._modalTags = tags.slice();
    editor.dataset.listId = listId;
    var known = getCrmListKnownTags(listId);
    var chips = tags.map(function(t, i) {
        return '<span class="crm-list-tag-chip" data-tag-idx="' + i + '">' + escHtml(t) +
            '<button type="button" onclick="crmModalRemoveListTag(' + i + ')" title="Retirer">×</button></span>';
    }).join('');
    var options = known.map(function(t) {
        return '<option value="' + escHtml(t) + '"></option>';
    }).join('');
    editor.innerHTML = chips +
        '<input type="text" id="crmProspListTagInput" list="crmProspListTagDatalist" placeholder="Ajouter un tag…" maxlength="80" autocomplete="off" onkeydown="if(event.key===\'Enter\'){event.preventDefault();crmModalAddListTag();}">' +
        '<datalist id="crmProspListTagDatalist">' + options + '</datalist>' +
        '<button type="button" class="btn btn-secondary" onclick="crmModalAddListTag()" style="font-size:0.82rem;padding:0.35rem 0.75rem;">+ Tag</button>';
}

function crmModalAddListTag() {
    var editor = document.getElementById('crmProspListTagsEditor');
    var input = document.getElementById('crmProspListTagInput');
    if (!editor || !input || !editor.dataset.listId) return;
    var tag = input.value.trim();
    if (!tag) return;
    if (!editor._modalTags) editor._modalTags = [];
    if (editor._modalTags.indexOf(tag) === -1) editor._modalTags.push(tag);
    input.value = '';
    renderCrmProspectListTagsEditor(crmCurrentEditProspect, editor.dataset.listId, editor._modalTags);
}

function crmModalRemoveListTag(index) {
    var editor = document.getElementById('crmProspListTagsEditor');
    if (!editor || !editor._modalTags || !editor.dataset.listId) return;
    editor._modalTags.splice(index, 1);
    renderCrmProspectListTagsEditor(crmCurrentEditProspect, editor.dataset.listId, editor._modalTags);
}

function collectCrmModalListTags() {
    var editor = document.getElementById('crmProspListTagsEditor');
    if (!editor || !editor.dataset.listId) return null;
    return { listId: editor.dataset.listId, tags: (editor._modalTags || []).slice() };
}

function buildCrmFilterSelects() {
    const bar = document.getElementById('crmFiltersBar');
    const search = document.getElementById('crmProspectSearch');
    if (!bar || !search) return;
    var prevTag = document.getElementById('crmListTagFilter');
    var prevVal = prevTag ? prevTag.value : '';
    bar.innerHTML = '';
    bar.appendChild(search);
    if (!crmCurrentListId) return;
    var tags = getCrmListKnownTags(crmCurrentListId);
    const sel = document.createElement('select');
    sel.id = 'crmListTagFilter';
    sel.innerHTML = '<option value="">Tous les tags</option>' +
        tags.map(function(t) { return '<option value="' + escHtml(t) + '">' + escHtml(t) + '</option>'; }).join('');
    if (prevVal && tags.indexOf(prevVal) !== -1) sel.value = prevVal;
    sel.onchange = function() { filterCrmProspects(); };
    bar.appendChild(sel);
}

// --- Rendu prospects ---
function getCurrentCrmList() { return crmData.lists.find(l => l.id === crmCurrentListId); }
function getFilteredProspects() {
    const list = getCurrentCrmList();
    if (!list) return [];
    let prospects = typeof getProspectsForList === 'function'
        ? getProspectsForList(list.id)
        : [...(list.prospects || [])];
    const search = (document.getElementById('crmProspectSearch') ? document.getElementById('crmProspectSearch').value : '').toLowerCase();
    if (search) {
        prospects = prospects.filter(p =>
            (p.organisme||'').toLowerCase().includes(search) || (p.contactNom||'').toLowerCase().includes(search) ||
            (p.contactPrenom||'').toLowerCase().includes(search) || (p.ville||'').toLowerCase().includes(search) ||
            (p.email||'').toLowerCase().includes(search) || (p.notes||'').toLowerCase().includes(search)
        );
    }
    document.querySelectorAll('#crmFiltersBar select').forEach(sel => {
        const catId = sel.dataset.catId;
        const val = sel.value;
        if (catId && val) prospects = prospects.filter(p => (p.tags || {})[catId] === val);
    });
    var tagFilterEl = document.getElementById('crmListTagFilter');
    if (tagFilterEl && tagFilterEl.value && crmCurrentListId) {
        var tagVal = tagFilterEl.value;
        prospects = prospects.filter(function(p) {
            return getCrmProspectListTags(p, crmCurrentListId).indexOf(tagVal) !== -1;
        });
    }
    prospects.sort((a, b) => {
        let va = '', vb = '';
        if (crmProspectSortField === 'organisme') { va = a.organisme || ''; vb = b.organisme || ''; }
        else if (crmProspectSortField === 'contact') { va = (a.contactNom||'')+(a.contactPrenom||''); vb = (b.contactNom||'')+(b.contactPrenom||''); }
        else if (crmProspectSortField === 'ville') { va = a.ville || ''; vb = b.ville || ''; }
        const cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base' });
        return crmProspectSortAsc ? cmp : -cmp;
    });
    return prospects;
}
function renderCrmProspects() {
    const body = document.getElementById('crmProspectsBody');
    const empty = document.getElementById('crmProspectsEmpty');
    const prospects = getFilteredProspects();
    var selectedSet = {};
    getCrmSelectedProspectIds().forEach(function(id) { selectedSet[id] = true; });
    if (prospects.length === 0) { body.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    body.innerHTML = prospects.map(p => {
        var listTags = crmCurrentListId ? getCrmProspectListTags(p, crmCurrentListId) : [];
        const tags = listTags.map(function(t) {
            return '<span class="crm-prospect-tag">' + escHtml(t) + '</span>';
        }).join('');
        const contact = [p.contactPrenom, p.contactNom].filter(Boolean).join(' ');
        const fonction = p.contactFonction ? '<br><span style="font-size:0.75rem;color:#a0aec0;">' + escHtml(p.contactFonction) + '</span>' : '';
        const structure = typeof getCrmProspectStructure === 'function' ? getCrmProspectStructure(p) : null;
        const structureName = structure ? (structure.organisme || '—') : (p.organisme || '—');
        const personName = typeof getCrmProspectPersonName === 'function' ? getCrmProspectPersonName(p) : contact;
        const phone = p.telFixe || p.telMobile || p.tel || '';
        const city = structure ? (structure.ville || '') : (p.ville || '');
        return '<tr onclick="editCrmProspect(\'' + p.id + '\')">' +
            '<td onclick="event.stopPropagation()"><input type="checkbox" class="crm-select-cb crm-prospect-cb" data-id="' + p.id + '"' + (selectedSet[p.id] ? ' checked' : '') + ' onchange="updateCrmListSelectionUI()"></td>' +
            '<td><span class="crm-prospect-org">' + escHtml(structureName) + '</span></td>' +
            '<td>' + (personName ? escHtml(personName) : '—') + fonction + '</td>' +
            '<td class="crm-col-hide-mobile">' + escHtml(city || '—') + '</td>' +
            '<td class="crm-col-hide-mobile">' + (phone ? '<a href="tel:'+phone+'" onclick="event.stopPropagation()" style="color:#2d9cdb;">'+escHtml(phone)+'</a>' : '—') + '</td>' +
            '<td class="crm-col-hide-mobile">' + (p.email ? '<a href="mailto:'+p.email+'" onclick="event.stopPropagation()" style="color:#2d9cdb;">'+escHtml(p.email)+'</a>' : '—') + '</td>' +
            '<td onclick="event.stopPropagation()"><div class="crm-prospect-tags-cell"><div class="crm-prospect-tags">' + (tags || '<span style="color:#a0aec0;font-size:0.8rem;">—</span>') + '</div>' +
            '<button type="button" class="crm-list-tag-btn" onclick="openCrmListTagEditor(\'' + escHtml(p.id) + '\', event)" title="Gérer les tags">🏷️</button></div></td>' +
            '<td onclick="event.stopPropagation()"><button class="crm-contact-remove" onclick="deleteCrmProspect(\'' + p.id + '\')" title="Supprimer">🗑️</button></td>' +
            '</tr>';
    }).join('');
    updateCrmListSelectionUI();
}
function getCrmSelectedProspectIds() {
    var ids = [];
    document.querySelectorAll('.crm-prospect-cb:checked').forEach(function(cb) {
        if (cb.dataset.id) ids.push(cb.dataset.id);
    });
    return ids;
}
function updateCrmListSelectionUI() {
    var bar = document.getElementById('crmListSelectionBar');
    if (!bar) return;
    var ids = getCrmSelectedProspectIds();
    var countEl = document.getElementById('crmListSelectionCount');
    if (ids.length > 0) {
        bar.style.display = 'flex';
        if (countEl) {
            countEl.textContent = ids.length + ' prospect' + (ids.length > 1 ? 's' : '') + ' sélectionné' + (ids.length > 1 ? 's' : '');
        }
    } else {
        bar.style.display = 'none';
    }
}
function clearCrmListSelection() {
    document.querySelectorAll('.crm-prospect-cb').forEach(function(c) { c.checked = false; });
    document.querySelectorAll('.crm-prospects-table thead .crm-select-cb').forEach(function(c) { c.checked = false; });
    updateCrmListSelectionUI();
}
window.getCrmSelectedProspectIds = getCrmSelectedProspectIds;
window.updateCrmListSelectionUI = updateCrmListSelectionUI;
window.clearCrmListSelection = clearCrmListSelection;
function filterCrmProspects() { renderCrmProspects(); }
function sortCrmProspects(field) {
    if (crmProspectSortField === field) crmProspectSortAsc = !crmProspectSortAsc;
    else { crmProspectSortField = field; crmProspectSortAsc = true; }
    renderCrmProspects();
}
function crmToggleSelectAll(cb) {
    document.querySelectorAll('.crm-prospect-cb').forEach(function(c) { c.checked = cb.checked; });
    updateCrmListSelectionUI();
}

// --- CRUD Prospects ---
function openCrmProspectModal(prospect) {
    crmCurrentEditProspect = prospect || null;
    document.getElementById('crmProspectModalTitle').textContent = prospect ? '✏️ Modifier le prospect' : '👤 Nouveau prospect';
    var listGroup = document.getElementById('crmProspListGroup');
    var preselect = [];
    if (listGroup) {
        var accessible = (crmData.lists || []).filter(hasCrmListAccess);
        listGroup.style.display = accessible.length ? '' : 'none';
        if (crmCurrentListId) preselect.push(crmCurrentListId);
        if (prospect && typeof getCrmProspectListIds === 'function') {
            preselect = getCrmProspectListIds(prospect);
        } else if (crmProspectModalListId) {
            preselect = [crmProspectModalListId];
        } else if (accessible.length === 1) {
            preselect = [accessible[0].id];
        }
        renderCrmListPicker('crmProspListPicker', preselect);
    }
    if (typeof renderCrmStructurePicker === 'function') {
        renderCrmStructurePicker('crmProspStructurePick', 'crmProspStructureId', prospect ? (prospect.structureId || '') : '');
    }
    if (typeof fillCrmProspectStandaloneFields === 'function') {
        fillCrmProspectStandaloneFields(prospect || null, 'modal');
    } else if (typeof toggleCrmProspectStructureForm === 'function') {
        toggleCrmProspectStructureForm('modal');
    }
    document.getElementById('crmProspPrenom').value = prospect ? (prospect.contactPrenom || '') : '';
    document.getElementById('crmProspNom').value = prospect ? (prospect.contactNom || '') : '';
    document.getElementById('crmProspFonction').value = prospect ? (prospect.contactFonction || '') : '';
    var telFixeEl = document.getElementById('crmProspTelFixe');
    var telMobileEl = document.getElementById('crmProspTelMobile');
    if (telFixeEl) telFixeEl.value = prospect ? (prospect.telFixe || prospect.tel || '') : '';
    if (telMobileEl) telMobileEl.value = prospect ? (prospect.telMobile || '') : '';
    document.getElementById('crmProspEmail').value = prospect ? (prospect.email || '') : '';
    document.getElementById('crmProspNotes').value = prospect ? (prospect.notes||'') : '';
    var tagListId = crmCurrentListId || (preselect.length === 1 ? preselect[0] : null);
    if (typeof renderCrmProspectListTagsEditor === 'function') {
        renderCrmProspectListTagsEditor(prospect || null, tagListId);
    }
    document.getElementById('crmProspectModal').classList.add('active');
}
function closeCrmProspectModal() {
    document.getElementById('crmProspectModal').classList.remove('active');
    crmCurrentEditProspect = null;
    crmProspectModalListId = null;
    window.crmProspectModalPickContext = null;
}

function buildCrmProspectTags(prospect, containerId) {
    var container = document.getElementById(containerId || 'crmProspectTagsContainer');
    if (!container) return;
    container.innerHTML = '';
    (crmData.categories || []).forEach(function(cat) {
        var current = prospect ? ((prospect.tags || {})[cat.id] || '') : '';
        var html = '<div style="margin-bottom:0.75rem;"><label style="font-size:0.85rem;color:#4a5568;font-weight:600;display:block;margin-bottom:0.4rem;">' + escHtml(cat.name) + '</label><div class="crm-tags-select" data-cat-id="' + cat.id + '">';
        (cat.options || []).forEach(function(opt) {
            var sel = current === opt ? ' selected' : '';
            html += '<span class="crm-tag-option' + sel + '" onclick="toggleCrmTag(this,\'' + cat.id + '\')">' + escHtml(opt) + '</span>';
        });
        html += '</div></div>';
        container.innerHTML += html;
    });
}
function toggleCrmTag(el, catId) {
    var wasSelected = el.classList.contains('selected');
    el.parentElement.querySelectorAll('.crm-tag-option').forEach(function(t) { t.classList.remove('selected'); });
    if (!wasSelected) el.classList.add('selected');
}
function collectCrmProspectFormData(source, scope) {
    var isFiche = source === 'fiche';
    var id = function(name) { return isFiche ? ('crmFiche' + name) : ('crmProsp' + name); };
    var structureHiddenId = isFiche ? 'crmFicheStructureId' : 'crmProspStructureId';
    var structureEl = document.getElementById(structureHiddenId);
    var structureId = structureEl ? structureEl.value.trim() : '';
    var standalone = (typeof collectCrmProspectStandaloneFormData === 'function')
        ? collectCrmProspectStandaloneFormData(isFiche ? 'fiche' : 'modal')
        : {};
    var telFixeEl = document.getElementById(id('TelFixe'));
    var telMobileEl = document.getElementById(id('TelMobile'));
    var telLegacyEl = document.getElementById(id('Tel'));
    if (isFiche && scope === 'contact') {
        return {
            contactPrenom: document.getElementById(id('Prenom')).value.trim(),
            contactNom: document.getElementById(id('Nom')).value.trim(),
            contactFonction: document.getElementById(id('Fonction')).value.trim(),
            telFixe: telFixeEl ? telFixeEl.value.trim() : (telLegacyEl ? telLegacyEl.value.trim() : ''),
            telMobile: telMobileEl ? telMobileEl.value.trim() : '',
            email: document.getElementById(id('Email')).value.trim(),
            structureId: structureId || null,
            organisme: structureId ? '' : (standalone.organisme || ''),
            typeStructure: structureId ? '' : (standalone.typeStructure || ''),
            siret: structureId ? '' : (standalone.siret || ''),
            web: structureId ? '' : (standalone.web || ''),
            adresse: structureId ? '' : (standalone.adresse || ''),
            cp: structureId ? '' : (standalone.cp || ''),
            ville: structureId ? '' : (standalone.ville || ''),
            region: structureId ? '' : (standalone.region || '')
        };
    }
    if (isFiche && scope === 'page') {
        return {};
    }
    var data = {
        structureId: structureId || null,
        contactPrenom: document.getElementById(id('Prenom')).value.trim(),
        contactNom: document.getElementById(id('Nom')).value.trim(),
        contactFonction: document.getElementById(id('Fonction')).value.trim(),
        telFixe: telFixeEl ? telFixeEl.value.trim() : (telLegacyEl ? telLegacyEl.value.trim() : ''),
        telMobile: telMobileEl ? telMobileEl.value.trim() : '',
        email: document.getElementById(id('Email')).value.trim(),
        notes: !isFiche && document.getElementById('crmProspNotes') ? document.getElementById('crmProspNotes').value.trim() : '',
        tags: {},
        organisme: structureId ? '' : (standalone.organisme || ''),
        typeStructure: structureId ? '' : (standalone.typeStructure || ''),
        siret: structureId ? '' : (standalone.siret || ''),
        web: structureId ? '' : (standalone.web || ''),
        adresse: structureId ? '' : (standalone.adresse || ''),
        cp: structureId ? '' : (standalone.cp || ''),
        ville: structureId ? '' : (standalone.ville || ''),
        region: structureId ? '' : (standalone.region || '')
    };
    return data;
}
function saveCrmProspect(e) {
    e.preventDefault();
    var listIds = getCrmListPickerSelectedIds('crmProspListPicker');
    if (!listIds.length && crmCurrentListId) listIds = [crmCurrentListId];
    if (!listIds.length) {
        alert('Sélectionnez au moins une liste de rattachement.');
        return;
    }
    var d = collectCrmProspectFormData('modal');
    if (typeof validateCrmProspectData === 'function') {
        if (!validateCrmProspectData(d)) return;
    } else if (!d.contactNom && !d.contactPrenom) {
        alert('Indiquez au moins le prénom ou le nom du prospect.');
        return;
    }
    if (crmCurrentEditProspect) {
        var found = typeof findCrmProspect === 'function' ? findCrmProspect(crmCurrentEditProspect.id) : null;
        if (!found) return;
        Object.assign(found.prospect, d);
        if (typeof syncProspectLegacyFields === 'function') syncProspectLegacyFields(found.prospect);
        if (typeof syncProspectListMembership === 'function') {
            syncProspectListMembership(found.prospect, listIds);
        }
    } else {
        d.id = 'prosp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        d.createdAt = new Date().toISOString();
        d.activities = [];
        d.responsibleUserId = currentUser ? currentUser.id : null;
        d.followUpDate = null;
        d.followUpNote = '';
        d.listIds = listIds.slice();
        if (typeof syncProspectLegacyFields === 'function') syncProspectLegacyFields(d);
        if (typeof syncProspectListMembership === 'function') {
            syncProspectListMembership(d, listIds);
        } else {
            var list = crmData.lists.find(function(l) { return l.id === listIds[0]; });
            if (!list) return;
            if (!list.prospects) list.prospects = [];
            list.prospects.push(d);
        }
    }
    if (crmCurrentEditProspect) {
        var refreshed = typeof findCrmProspect === 'function' ? findCrmProspect(crmCurrentEditProspect.id) : null;
        if (refreshed && typeof ensureProspectShape === 'function') ensureProspectShape(refreshed.prospect);
    } else if (typeof ensureProspectShape === 'function') {
        ensureProspectShape(d);
    }
    var savedProspectId = crmCurrentEditProspect ? crmCurrentEditProspect.id : d.id;
    var savedListIds = listIds.slice();
    var modalTags = collectCrmModalListTags();
    if (modalTags && modalTags.listId) {
        var tagProspect = null;
        if (crmCurrentEditProspect) {
            var fp = typeof findCrmProspect === 'function' ? findCrmProspect(savedProspectId) : null;
            tagProspect = fp ? fp.prospect : null;
        } else {
            tagProspect = d;
        }
        if (tagProspect) setCrmProspectListTags(tagProspect, modalTags.listId, modalTags.tags);
    }
    var pickCtx = window.crmProspectModalPickContext;
    saveCrmData();
    closeCrmProspectModal();
    buildCrmFilterSelects();
    renderCrmProspects();
    renderCrmHomeProspects();
    renderCrmLists();
    if (pickCtx && pickCtx.returnTo === 'deal_modal' && savedProspectId && typeof initCrmDealProspectPick === 'function') {
        var dealModal = document.getElementById('crmDealModal');
        if (dealModal && dealModal.classList.contains('active')) {
            initCrmDealProspectPick(savedProspectId, false);
            var hidden = document.getElementById('crmDealProspect');
            if (hidden && savedListIds.length) hidden.setAttribute('data-list', savedListIds[0]);
            var results = document.getElementById('crmDealProspectResults');
            if (results) results.style.display = 'none';
            if (typeof showToast === 'function') showToast('Prospect créé et sélectionné', 'success');
        }
    }
}
function editCrmProspect(prospectId) {
    if (typeof openCrmProspectFiche === 'function') {
        openCrmProspectFiche(prospectId);
        return;
    }
    var found = typeof findCrmProspect === 'function' ? findCrmProspect(prospectId) : null;
    if (found) openCrmProspectModal(found.prospect);
}
function deleteCrmProspect(prospectId) {
    if (!confirm('Supprimer ce prospect ?')) return;
    (crmData.lists || []).forEach(function(list) {
        list.prospects = (list.prospects || []).filter(function(p) { return p.id !== prospectId; });
    });
    saveCrmData();
    renderCrmProspects();
    renderCrmHomeProspects();
    renderCrmLists();
}

// --- Accès CRM global ---
function getCrmUserInitials(u) { return ((u.prenom||'').charAt(0) + (u.nom||u.username||'').charAt(0)).toUpperCase() || '?'; }
function openCrmAccessModal() {
    crmTempListAccessUsers = [...(crmData.globalAccessUsers || [])];
    var autoHtml = '';
    var selHtml = '<option value="">— Sélectionner —</option>';
    (allUsers || []).forEach(function(u) {
        var isAuto = CRM_AUTO_ROLES.includes(u.role_professionnel);
        var isAdmin = u.role === 'admin';
        var initials = getCrmUserInitials(u);
        var displayName = (u.prenom||'') + ' ' + (u.nom||u.username||'');
        if (isAuto || isAdmin) {
            autoHtml += '<div class="crm-access-user-row"><div class="crm-access-user-avatar">' + initials + '</div><div class="crm-access-user-info"><div class="crm-access-user-name">' + escHtml(displayName) + '</div><div class="crm-access-user-role">' + escHtml(u.role_professionnel || u.role || '') + '</div></div><span class="crm-access-lock">🔒 Auto</span></div>';
        } else if (!crmTempListAccessUsers.includes(String(u.id))) {
            selHtml += '<option value="' + u.id + '">' + escHtml(displayName) + '</option>';
        }
    });
    document.getElementById('crmAccessAutoUsers').innerHTML = autoHtml || '<div style="color:#a0aec0;font-size:0.85rem;padding:0.5rem;">Aucun utilisateur avec ce rôle</div>';
    document.getElementById('crmAccessAddSelect').innerHTML = selHtml;
    renderCrmManualAccessUsers();
    document.getElementById('crmAccessModal').classList.add('active');
}
function renderCrmManualAccessUsers() {
    var html = '';
    crmTempListAccessUsers.forEach(function(uid) {
        var u = (allUsers || []).find(function(x) { return String(x.id) === String(uid); });
        if (!u) return;
        var initials = getCrmUserInitials(u);
        var displayName = (u.prenom||'') + ' ' + (u.nom||u.username||'');
        html += '<div class="crm-access-user-row"><div class="crm-access-user-avatar">' + initials + '</div><div class="crm-access-user-info"><div class="crm-access-user-name">' + escHtml(displayName) + '</div><div class="crm-access-user-role">' + escHtml(u.role_professionnel || '') + '</div></div><button class="crm-access-remove" onclick="removeCrmGlobalAccess(\'' + uid + '\')">✕</button></div>';
    });
    document.getElementById('crmAccessManualUsers').innerHTML = html || '<div style="color:#a0aec0;font-size:0.85rem;padding:0.5rem;">Aucun accès manuel ajouté</div>';
}
function addCrmGlobalAccess() {
    var sel = document.getElementById('crmAccessAddSelect');
    var uid = sel.value;
    if (!uid || crmTempListAccessUsers.includes(uid)) return;
    crmTempListAccessUsers.push(uid);
    sel.querySelector('option[value="' + uid + '"]').remove();
    renderCrmManualAccessUsers();
}
function removeCrmGlobalAccess(uid) {
    crmTempListAccessUsers = crmTempListAccessUsers.filter(function(x) { return x !== uid; });
    renderCrmManualAccessUsers();
    // Re-add to select
    var u = (allUsers || []).find(function(x) { return String(x.id) === String(uid); });
    if (u) {
        var sel = document.getElementById('crmAccessAddSelect');
        var opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = (u.prenom||'') + ' ' + (u.nom||u.username||'');
        sel.appendChild(opt);
    }
}
function closeCrmAccessModal() { document.getElementById('crmAccessModal').classList.remove('active'); }
function saveCrmAccess() {
    crmData.globalAccessUsers = [...crmTempListAccessUsers];
    saveCrmData();
    updateCrmVisibility();
    closeCrmAccessModal();
}

// --- Accès Liste spécifique ---
function openCrmListAccessModal() {
    var list = getCurrentCrmList();
    if (!list) return;
    crmTempListAccessUsers = [...(list.accessUsers || [])];
    // Globaux (hérités)
    var globalHtml = '';
    (allUsers || []).forEach(function(u) {
        var isAuto = CRM_AUTO_ROLES.includes(u.role_professionnel);
        var isAdmin = u.role === 'admin';
        var isGlobal = (crmData.globalAccessUsers || []).includes(String(u.id));
        if (isAuto || isAdmin || isGlobal) {
            var initials = getCrmUserInitials(u);
            var displayName = (u.prenom||'') + ' ' + (u.nom||u.username||'');
            var reason = isAuto ? u.role_professionnel : isAdmin ? 'Admin' : 'Accès CRM global';
            globalHtml += '<div class="crm-access-user-row"><div class="crm-access-user-avatar">' + initials + '</div><div class="crm-access-user-info"><div class="crm-access-user-name">' + escHtml(displayName) + '</div><div class="crm-access-user-role">' + escHtml(reason) + '</div></div><span class="crm-access-lock">🔒 Hérité</span></div>';
        }
    });
    document.getElementById('crmListAccessGlobal').innerHTML = globalHtml || '<div style="color:#a0aec0;font-size:0.85rem;padding:0.5rem;">Aucun</div>';
    // Select
    var selHtml = '<option value="">— Sélectionner —</option>';
    (allUsers || []).forEach(function(u) {
        if (CRM_AUTO_ROLES.includes(u.role_professionnel) || u.role === 'admin') return;
        if ((crmData.globalAccessUsers || []).includes(String(u.id))) return;
        if (crmTempListAccessUsers.includes(String(u.id))) return;
        selHtml += '<option value="' + u.id + '">' + escHtml((u.prenom||'') + ' ' + (u.nom||u.username||'')) + '</option>';
    });
    document.getElementById('crmListAccessAddSelect').innerHTML = selHtml;
    renderCrmListSpecificUsers();
    document.getElementById('crmListAccessModal').classList.add('active');
}
function renderCrmListSpecificUsers() {
    var html = '';
    crmTempListAccessUsers.forEach(function(uid) {
        var u = (allUsers || []).find(function(x) { return String(x.id) === String(uid); });
        if (!u) return;
        html += '<div class="crm-access-user-row"><div class="crm-access-user-avatar">' + getCrmUserInitials(u) + '</div><div class="crm-access-user-info"><div class="crm-access-user-name">' + escHtml((u.prenom||'') + ' ' + (u.nom||u.username||'')) + '</div></div><button class="crm-access-remove" onclick="removeCrmListAccess(\'' + uid + '\')">✕</button></div>';
    });
    document.getElementById('crmListAccessSpecific').innerHTML = html || '<div style="color:#a0aec0;font-size:0.85rem;padding:0.5rem;">Aucun accès spécifique</div>';
}
function addCrmListAccess() {
    var sel = document.getElementById('crmListAccessAddSelect');
    var uid = sel.value;
    if (!uid || crmTempListAccessUsers.includes(uid)) return;
    crmTempListAccessUsers.push(uid);
    var opt = sel.querySelector('option[value="' + uid + '"]');
    if (opt) opt.remove();
    renderCrmListSpecificUsers();
}
function removeCrmListAccess(uid) {
    crmTempListAccessUsers = crmTempListAccessUsers.filter(function(x) { return x !== uid; });
    renderCrmListSpecificUsers();
}
function closeCrmListAccessModal() { document.getElementById('crmListAccessModal').classList.remove('active'); }
function saveCrmListAccess() {
    var list = getCurrentCrmList();
    if (!list) return;
    list.accessUsers = [...crmTempListAccessUsers];
    saveCrmData();
    closeCrmListAccessModal();
}

// --- Export ---
function openCrmExportModal() {
    var items = document.getElementById('crmExportListItems');
    var accessible = crmData.lists.filter(function(l) { return hasCrmListAccess(l); });
    items.innerHTML = accessible.map(function(l) {
        return '<label class="crm-export-list-item"><input type="checkbox" value="' + l.id + '" checked> <span>' + escHtml(l.name) + ' (' + (l.prospects||[]).length + ')</span></label>';
    }).join('');
    document.getElementById('crmExportModal').classList.add('active');
}
function closeCrmExportModal() { document.getElementById('crmExportModal').classList.remove('active'); }
function exportCurrentCrmList() {
    var list = getCurrentCrmList();
    if (!list) return;
    var filtered = getFilteredProspects();
    downloadCrmCsv([list], { prospectsByListId: (function() { var o = {}; o[list.id] = filtered; return o; })() });
}
function executeCrmExport() {
    var checked = [];
    document.querySelectorAll('#crmExportListItems input[type="checkbox"]:checked').forEach(function(cb) { checked.push(cb.value); });
    if (checked.length === 0) { alert('Sélectionnez au moins une liste.'); return; }
    var lists = crmData.lists.filter(function(l) { return checked.includes(l.id); });
    downloadCrmCsv(lists);
    closeCrmExportModal();
}
function downloadCrmCsv(lists, options) {
    options = options || {};
    var headers = ['Liste','Organisme','Type','Adresse','CP','Ville','Région','Contact Prénom','Contact Nom','Fonction','Téléphone','Email','Site web','Notes','Catégories','Tags'];
    var rows = [headers.join(';')];
    lists.forEach(function(l) {
        var prospects = (options.prospectsByListId && options.prospectsByListId[l.id])
            ? options.prospectsByListId[l.id]
            : (l.prospects || []);
        prospects.forEach(function(p) {
            var cats = Object.entries(p.tags || {}).map(function(kv) { return kv[1]; }).filter(Boolean).join(', ');
            var listTags = getCrmProspectListTags(p, l.id).join(', ');
            rows.push([
                csvEsc(l.name), csvEsc(p.organisme), csvEsc(p.typeStructure), csvEsc(p.adresse),
                csvEsc(p.cp), csvEsc(p.ville), csvEsc(p.region), csvEsc(p.contactPrenom),
                csvEsc(p.contactNom), csvEsc(p.contactFonction), csvEsc(p.tel), csvEsc(p.email),
                csvEsc(p.web), csvEsc(p.notes), csvEsc(cats), csvEsc(listTags)
            ].join(';'));
        });
    });
    var bom = '\uFEFF';
    var blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'crm_export_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}
function csvEsc(val) {
    if (!val) return '';
    val = String(val);
    if (val.includes(';') || val.includes('"') || val.includes('\n')) return '"' + val.replace(/"/g, '""') + '"';
    return val;
}

// --- Admin CRM : Lignes d'activité ---
function renderCrmAdminActivityLines() {
    var container = document.getElementById('crmAdminActivityLinesList');
    if (!container) return;
    ensureCrmActivityLines();
    var lines = crmData.activityLines || [];
    if (!lines.length) {
        container.innerHTML = '<div style="background:white;border-radius:14px;padding:2rem;text-align:center;color:#a0aec0;">Aucune ligne d\'activité. Ajoutez votre premier métier (spectacle, communication, etc.).</div>';
        return;
    }
    container.innerHTML = lines.map(function(line, index) {
        var status = line.active !== false ? '<span class="crm-activity-status crm-activity-status--active">Active</span>' : '<span class="crm-activity-status crm-activity-status--inactive">Inactive</span>';
        var canUp = index > 0 ? '<button type="button" class="btn btn-secondary" onclick="moveCrmActivityLine(\'' + line.id + '\',-1)" title="Monter" style="font-size:0.75rem;padding:0.25rem 0.45rem;">↑</button>' : '';
        var canDown = index < lines.length - 1 ? '<button type="button" class="btn btn-secondary" onclick="moveCrmActivityLine(\'' + line.id + '\',1)" title="Descendre" style="font-size:0.75rem;padding:0.25rem 0.45rem;">↓</button>' : '';
        return '<div class="crm-admin-activity-card" style="border-left-color:' + escHtml(line.color || '#4a90d9') + ';">' +
            '<div class="crm-admin-cat-header">' +
            '<div style="display:flex;align-items:center;gap:0.65rem;min-width:0;">' +
            '<span class="crm-activity-emoji">' + escHtml(line.emoji || '📋') + '</span>' +
            '<div><h4 style="margin:0;">' + escHtml(line.name) + '</h4>' +
            '<p style="margin:0.2rem 0 0;font-size:0.82rem;color:#718096;">' + escHtml(line.description || '') + '</p></div></div>' +
            '<div style="display:flex;align-items:center;gap:0.35rem;flex-shrink:0;">' + status + canUp + canDown +
            '<button type="button" class="btn btn-secondary" onclick="editCrmAdminActivityLine(\'' + line.id + '\')" style="font-size:0.8rem;padding:0.3rem 0.6rem;">✏️</button>' +
            '<button type="button" class="btn btn-secondary" onclick="deleteCrmAdminActivityLine(\'' + line.id + '\')" style="font-size:0.8rem;padding:0.3rem 0.6rem;color:#e53e3e;">🗑️</button></div></div>' +
            '</div>';
    }).join('');
}
function openCrmAdminActivityLineModal(line) {
    crmCurrentEditActivityLine = line || null;
    document.getElementById('crmAdminActivityLineModalTitle').textContent = line ? '✏️ Modifier la ligne d\'activité' : '📊 Nouvelle ligne d\'activité';
    document.getElementById('crmAdminActivityLineName').value = line ? line.name : '';
    document.getElementById('crmAdminActivityLineDescription').value = line ? (line.description || '') : '';
    document.getElementById('crmAdminActivityLineEmoji').value = line ? (line.emoji || '📋') : '📋';
    document.getElementById('crmAdminActivityLineColor').value = line ? (line.color || '#4a90d9') : '#4a90d9';
    document.getElementById('crmAdminActivityLineActive').checked = line ? line.active !== false : true;
    document.getElementById('crmAdminActivityLineModal').classList.add('active');
}
function closeCrmAdminActivityLineModal() {
    document.getElementById('crmAdminActivityLineModal').classList.remove('active');
    crmCurrentEditActivityLine = null;
}
function saveCrmAdminActivityLine(e) {
    e.preventDefault();
    var name = document.getElementById('crmAdminActivityLineName').value.trim();
    if (!name) return;
    var payload = {
        name: name,
        description: document.getElementById('crmAdminActivityLineDescription').value.trim(),
        emoji: document.getElementById('crmAdminActivityLineEmoji').value.trim() || '📋',
        color: document.getElementById('crmAdminActivityLineColor').value || '#4a90d9',
        active: document.getElementById('crmAdminActivityLineActive').checked
    };
    if (crmCurrentEditActivityLine) {
        var line = crmData.activityLines.find(function(l) { return l.id === crmCurrentEditActivityLine.id; });
        if (line) Object.assign(line, payload);
    } else {
        var maxOrder = crmData.activityLines.reduce(function(m, l) { return Math.max(m, l.order || 0); }, -1);
        crmData.activityLines.push({
            id: 'line_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            order: maxOrder + 1,
            pipelineStages: getCrmPipelineStages().slice(),
            name: payload.name,
            description: payload.description,
            emoji: payload.emoji,
            color: payload.color,
            active: payload.active
        });
    }
    ensureCrmActivityLines();
    saveCrmData();
    closeCrmAdminActivityLineModal();
    renderCrmAdminActivityLines();
}
function editCrmAdminActivityLine(lineId) {
    var line = getCrmActivityLineById(lineId);
    if (line) openCrmAdminActivityLineModal(line);
}
function deleteCrmAdminActivityLine(lineId) {
    var line = getCrmActivityLineById(lineId);
    if (!line || !confirm('Supprimer la ligne « ' + line.name + ' » ? Les listes liées ne seront plus rattachées à cette ligne.')) return;
    crmData.activityLines = crmData.activityLines.filter(function(l) { return l.id !== lineId; });
    (crmData.lists || []).forEach(function(list) {
        if (list.activityLineId === lineId) list.activityLineId = null;
    });
    ensureCrmActivityLines();
    saveCrmData();
    renderCrmAdminActivityLines();
}
function moveCrmActivityLine(lineId, direction) {
    ensureCrmActivityLines();
    var lines = crmData.activityLines;
    var index = lines.findIndex(function(l) { return l.id === lineId; });
    if (index < 0) return;
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= lines.length) return;
    var tmp = lines[index].order;
    lines[index].order = lines[newIndex].order;
    lines[newIndex].order = tmp;
    lines.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    saveCrmData();
    renderCrmAdminActivityLines();
}

// --- Admin CRM : Catégories ---
function renderCrmAdminCategories() {
    var container = document.getElementById('crmAdminCategoriesList');
    if (!container) return;
    if (!crmData.categories || crmData.categories.length === 0) {
        container.innerHTML = '<div style="background:white;border-radius:14px;padding:2rem;text-align:center;color:#a0aec0;">Aucune catégorie configurée. Cliquez sur "+ Nouvelle catégorie" pour commencer.</div>';
        return;
    }
    container.innerHTML = crmData.categories.map(function(cat) {
        var optionsHtml = (cat.options || []).map(function(opt, i) {
            return '<span class="crm-admin-cat-option">' + escHtml(opt) + '<button onclick="removeCrmAdminOption(\'' + cat.id + '\',' + i + ')">✕</button></span>';
        }).join('');
        return '<div class="crm-admin-cat-card">' +
            '<div class="crm-admin-cat-header"><h4>' + escHtml(cat.name) + '</h4><div><button class="btn btn-secondary" onclick="editCrmAdminCategory(\'' + cat.id + '\')" style="font-size:0.8rem;padding:0.3rem 0.6rem;margin-right:0.3rem;">✏️</button><button class="btn btn-secondary" onclick="deleteCrmAdminCategory(\'' + cat.id + '\')" style="font-size:0.8rem;padding:0.3rem 0.6rem;color:#e53e3e;">🗑️</button></div></div>' +
            '<div class="crm-admin-cat-options">' + (optionsHtml || '<span style="color:#a0aec0;font-size:0.85rem;">Aucune option</span>') + '</div>' +
            '<div class="crm-admin-add-option"><input type="text" placeholder="Ajouter une option..." id="crmAdminOptInput_' + cat.id + '" maxlength="80" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addCrmAdminOption(\'' + cat.id + '\');}"><button class="btn" onclick="addCrmAdminOption(\'' + cat.id + '\')" style="font-size:0.8rem;padding:0.4rem 0.8rem;">+</button></div>' +
            '</div>';
    }).join('');
}
function openCrmAdminCategoryModal(cat) {
    crmCurrentEditCategory = cat || null;
    document.getElementById('crmAdminCatModalTitle').textContent = cat ? '✏️ Modifier la catégorie' : '🏷️ Nouvelle catégorie';
    document.getElementById('crmAdminCatName').value = cat ? cat.name : '';
    document.getElementById('crmAdminCategoryModal').classList.add('active');
}
function closeCrmAdminCategoryModal() { document.getElementById('crmAdminCategoryModal').classList.remove('active'); crmCurrentEditCategory = null; }
function saveCrmAdminCategory(e) {
    e.preventDefault();
    var name = document.getElementById('crmAdminCatName').value.trim();
    if (!name) return;
    if (crmCurrentEditCategory) {
        var cat = crmData.categories.find(function(c) { return c.id === crmCurrentEditCategory.id; });
        if (cat) cat.name = name;
    } else {
        crmData.categories.push({
            id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
            name: name, options: []
        });
    }
    saveCrmData(); closeCrmAdminCategoryModal(); renderCrmAdminCategories();
}
function editCrmAdminCategory(catId) {
    var cat = crmData.categories.find(function(c) { return c.id === catId; });
    if (cat) openCrmAdminCategoryModal(cat);
}
function deleteCrmAdminCategory(catId) {
    if (!confirm('Supprimer cette catégorie ? Les tags déjà appliqués aux prospects seront conservés mais ne seront plus filtrables.')) return;
    crmData.categories = crmData.categories.filter(function(c) { return c.id !== catId; });
    saveCrmData(); renderCrmAdminCategories();
}
function addCrmAdminOption(catId) {
    var input = document.getElementById('crmAdminOptInput_' + catId);
    var val = input.value.trim();
    if (!val) return;
    var cat = crmData.categories.find(function(c) { return c.id === catId; });
    if (!cat) return;
    if (!cat.options) cat.options = [];
    if (cat.options.includes(val)) { alert('Cette option existe déjà.'); return; }
    cat.options.push(val);
    input.value = '';
    saveCrmData(); renderCrmAdminCategories();
}
function removeCrmAdminOption(catId, index) {
    var cat = crmData.categories.find(function(c) { return c.id === catId; });
    if (!cat || !cat.options) return;
    cat.options.splice(index, 1);
    saveCrmData(); renderCrmAdminCategories();
}

// --- Import CSV intelligent ---
var crmImportRawRows = [];
var crmImportHeaders = [];
var crmImportSeparator = ';';
var crmImportMapping = {};

var CRM_IMPORT_FIELDS = [
    { key: '', label: '— Ignorer —' },
    { key: 'organisme', label: 'Organisme / Nom structure' },
    { key: 'typeStructure', label: 'Type de structure' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'cp', label: 'Code postal' },
    { key: 'ville', label: 'Ville' },
    { key: 'region', label: 'Région' },
    { key: 'contactPrenom', label: 'Contact — Prénom' },
    { key: 'contactNom', label: 'Contact — Nom' },
    { key: 'contactFonction', label: 'Contact — Fonction' },
    { key: 'tel', label: 'Téléphone' },
    { key: 'email', label: 'Email' },
    { key: 'web', label: 'Site web' },
    { key: 'notes', label: 'Notes' },
    { key: 'listTags', label: '🏷️ Tags (liste)' }
];

function parseImportListTags(val) {
    if (!val || !String(val).trim()) return [];
    return String(val).split(/[,;|]/).map(function(t) { return t.trim(); }).filter(Boolean);
}

function openCrmImportModal() {
    crmImportRawRows = [];
    crmImportHeaders = [];
    crmImportMapping = {};
    document.getElementById('crmImportFileInput').value = '';
    document.getElementById('crmImportFileInfo').style.display = 'none';
    document.getElementById('crmImportPreviewMini').style.display = 'none';
    document.getElementById('crmImportNextBtn1').disabled = true;
    var bulkTagsEl = document.getElementById('crmImportBulkListTags');
    if (bulkTagsEl) bulkTagsEl.value = '';
    crmImportGoStep(1);
    document.getElementById('crmImportModal').classList.add('active');
    // Drag & drop
    var dropzone = document.getElementById('crmImportDropzone');
    dropzone.ondragover = function(e) { e.preventDefault(); dropzone.classList.add('dragover'); };
    dropzone.ondragleave = function() { dropzone.classList.remove('dragover'); };
    dropzone.ondrop = function(e) { e.preventDefault(); dropzone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleCrmImportFile(e.dataTransfer.files[0]); };
}
function closeCrmImportModal() { document.getElementById('crmImportModal').classList.remove('active'); }

function crmImportGoStep(step) {
    for (var i = 1; i <= 4; i++) {
        var el = document.getElementById('crmImportStep' + i);
        var dot = document.getElementById('crmImportStepDot' + i);
        if (el) el.classList.toggle('active', i === step);
        if (dot) { dot.classList.toggle('active', i === step); dot.classList.toggle('done', i < step); }
    }
    if (step === 2) buildCrmImportMapping();
    if (step === 3) buildCrmImportDestination();
}

function detectSeparator(text) {
    var firstLines = text.split('\n').slice(0, 5).join('\n');
    var counts = { ';': 0, ',': 0, '\t': 0 };
    for (var i = 0; i < firstLines.length; i++) {
        if (counts[firstLines[i]] !== undefined) counts[firstLines[i]]++;
    }
    if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';';
    if (counts[','] >= counts['\t']) return ',';
    return '\t';
}

function parseCsvLine(line, sep) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
            else if (ch === '"') inQuotes = false;
            else current += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === sep) { result.push(current.trim()); current = ''; }
            else current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

function handleCrmImportFile(file) {
    if (!file) return;
    var ext = (file.name || '').split('.').pop().toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
        // --- Excel via SheetJS ---
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data = new Uint8Array(e.target.result);
                var workbook = XLSX.read(data, { type: 'array' });
                // Prendre la première feuille
                var sheetName = workbook.SheetNames[0];
                var sheet = workbook.Sheets[sheetName];
                var json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (!json || json.length < 2) { alert('Le fichier Excel doit contenir au moins un en-tête et une ligne de données.'); return; }
                crmImportHeaders = json[0].map(function(h) { return String(h || '').trim(); });
                crmImportRawRows = [];
                for (var i = 1; i < json.length; i++) {
                    var row = json[i].map(function(c) { return String(c || '').trim(); });
                    if (row.some(function(c) { return c !== ''; })) crmImportRawRows.push(row);
                }
                // Info feuilles
                var sheetInfo = workbook.SheetNames.length > 1 ? ' (feuille: ' + sheetName + ')' : '';
                crmImportShowFileResult(file.name, sheetInfo, 'xlsx');
            } catch (err) {
                console.error('Erreur lecture Excel:', err);
                alert('Impossible de lire le fichier Excel. Vérifiez qu\'il n\'est pas protégé ou corrompu.');
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        // --- CSV / TXT ---
        var reader = new FileReader();
        reader.onload = function(e) {
            var text = e.target.result;
            crmImportSeparator = detectSeparator(text);
            var lines = text.split(/\r?\n/).filter(function(l) { return l.trim() !== ''; });
            if (lines.length < 2) { alert('Le fichier doit contenir au moins un en-tête et une ligne de données.'); return; }
            crmImportHeaders = parseCsvLine(lines[0], crmImportSeparator);
            crmImportRawRows = [];
            for (var i = 1; i < lines.length; i++) {
                var cols = parseCsvLine(lines[i], crmImportSeparator);
                if (cols.length > 0 && cols.some(function(c) { return c !== ''; })) crmImportRawRows.push(cols);
            }
            var sepLabel = crmImportSeparator === '\t' ? 'tab' : crmImportSeparator;
            crmImportShowFileResult(file.name, ' (sep: ' + sepLabel + ')', 'csv');
        };
        reader.readAsText(file, 'UTF-8');
    }
}

function crmImportShowFileResult(fileName, extra, type) {
    document.getElementById('crmImportDropzone').style.display = 'none';
    document.getElementById('crmImportFileInfo').style.display = 'flex';
    document.getElementById('crmImportFileName').textContent = fileName;
    document.getElementById('crmImportFileRows').textContent = crmImportRawRows.length + ' lignes, ' + crmImportHeaders.length + ' colonnes' + (extra || '');
    document.getElementById('crmImportNextBtn1').disabled = false;
    // Mini aperçu
    var previewDiv = document.getElementById('crmImportPreviewMini');
    var previewRows = crmImportRawRows.slice(0, 4);
    var html = '<table class="crm-import-preview-table"><thead><tr>' + crmImportHeaders.map(function(h) { return '<th>' + escHtml(h) + '</th>'; }).join('') + '</tr></thead><tbody>';
    previewRows.forEach(function(row) { html += '<tr>' + crmImportHeaders.map(function(h, idx) { return '<td>' + escHtml(row[idx] || '') + '</td>'; }).join('') + '</tr>'; });
    html += '</tbody></table>';
    if (crmImportRawRows.length > 4) html += '<div style="text-align:center;color:#a0aec0;font-size:0.78rem;padding:0.4rem;">... et ' + (crmImportRawRows.length - 4) + ' autres lignes</div>';
    previewDiv.innerHTML = html;
    previewDiv.style.display = 'block';
}

function clearCrmImportFile() {
    crmImportRawRows = [];
    crmImportHeaders = [];
    document.getElementById('crmImportFileInput').value = '';
    document.getElementById('crmImportDropzone').style.display = '';
    document.getElementById('crmImportFileInfo').style.display = 'none';
    document.getElementById('crmImportPreviewMini').style.display = 'none';
    document.getElementById('crmImportNextBtn1').disabled = true;
}

function guessFieldForHeader(header, colIdx) {
    var h = (header || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\-\.]/g, ' ').trim();

    // Organisme / Nom structure
    if (/organis|societe|structure|entreprise|raison.?soc|etablissement|salle|theatre|mairie|collectivite|asso|festival|lieu|diffuseur|programmateur|client/.test(h)) return 'organisme';
    if (/^nom$/ .test(h) && crmImportHeaders.length > 8) return 'organisme'; // "Nom" seul si beaucoup de colonnes → probablement organisme

    // Type de structure
    if (/type.?(struct|organ|lieu|salle|etab)|categorie.?struct|nature/.test(h)) return 'typeStructure';

    // Adresse
    if (/adresse|rue|voie|address|addr|numero.?rue|ligne.?1/.test(h)) return 'adresse';

    // Code postal
    if (/code.?post|cp|zip|postal|code postal/.test(h)) return 'cp';

    // Ville
    if (/^ville$|^city$|^commune$|localite|municipalite/.test(h)) return 'ville';

    // Région / Département
    if (/^region$|^dept$|^departement$|province|territory/.test(h)) return 'region';

    // Prénom contact
    if (/prenom|first.?name|firstname|prenom.?contact/.test(h)) return 'contactPrenom';

    // Nom contact (quand il y a aussi un champ prénom)
    if (/nom.?contact|nom.?famille|last.?name|lastname|surname|nom.?ref/.test(h)) return 'contactNom';
    // "Nom" seul si peu de colonnes ou si un champ "Prénom" existe aussi
    if (/^nom$/.test(h)) {
        var hasPrenom = crmImportHeaders.some(function(hh) { return /prenom/i.test(hh); });
        if (hasPrenom) return 'contactNom';
    }

    // Fonction / Poste
    if (/fonction|poste|titre|title|job|qualite|role|responsab|interlocuteur/.test(h)) return 'contactFonction';

    // Téléphone
    if (/tel|phone|mobile|portable|fixe|fax|numero.?tel|gsm|cellulaire/.test(h)) return 'tel';

    // Email
    if (/mail|email|courriel|e-mail|mel|adresse.?mail|adresse.?elec/.test(h)) return 'email';

    // Site web
    if (/site|web|url|http|www|lien|homepage/.test(h)) return 'web';

    // Tags de liste (libres)
    if (/^tags?$|^etiquettes?$|libelle.?tag/.test(h)) return 'listTags';

    // Notes
    if (/note|comment|remarque|observation|info|detail|description|complement|divers|memo/.test(h)) return 'notes';

    // Tentative par analyse des données (premières valeurs)
    if (colIdx !== undefined && crmImportRawRows.length > 0) {
        var samples = crmImportRawRows.slice(0, 10).map(function(r) { return r[colIdx] || ''; }).filter(Boolean);
        if (samples.length > 0) {
            var allEmail = samples.every(function(s) { return /@/.test(s); });
            if (allEmail) return 'email';
            var allPhone = samples.every(function(s) { return /^[\+\d\s\.\-\(\)]{6,}$/.test(s.replace(/\s/g, '')); });
            if (allPhone) return 'tel';
            var allCP = samples.every(function(s) { return /^\d{4,5}$/.test(s.trim()); });
            if (allCP) return 'cp';
            var allUrl = samples.every(function(s) { return /^https?:\/\/|^www\./i.test(s.trim()); });
            if (allUrl) return 'web';
        }
    }

    // Tenter de matcher une catégorie admin par le nom
    var catMatch = (crmData.categories || []).find(function(cat) {
        var catNorm = cat.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return h === catNorm || h.includes(catNorm) || catNorm.includes(h);
    });
    if (catMatch) return 'cat_' + catMatch.id;

    return '';
}

function buildCrmImportMapping() {
    var container = document.getElementById('crmImportMappingRows');
    // Ajouter les catégories comme champs possibles
    var allFields = CRM_IMPORT_FIELDS.slice();
    (crmData.categories || []).forEach(function(cat) {
        allFields.push({ key: 'cat_' + cat.id, label: '🏷️ ' + cat.name });
    });
    container.innerHTML = crmImportHeaders.map(function(h, idx) {
        var guess = guessFieldForHeader(h, idx);
        var preview = crmImportRawRows.length > 0 ? (crmImportRawRows[0][idx] || '') : '';
        var optionsHtml = allFields.map(function(f) {
            return '<option value="' + f.key + '"' + (f.key === guess ? ' selected' : '') + '>' + escHtml(f.label) + '</option>';
        }).join('');
        return '<div class="crm-import-mapping-row">' +
            '<div class="crm-import-mapping-col">' + escHtml(h) + '</div>' +
            '<div class="crm-import-mapping-preview" title="' + escHtml(preview) + '">' + escHtml(preview || '—') + '</div>' +
            '<div class="crm-import-mapping-select"><select data-col="' + idx + '">' + optionsHtml + '</select></div>' +
            '</div>';
    }).join('');
}

function buildCrmImportDestination() {
    // Remplir le select des listes existantes
    var sel = document.getElementById('crmImportExistingSelect');
    var accessible = crmData.lists.filter(function(l) { return hasCrmListAccess(l); });
    sel.innerHTML = accessible.map(function(l) {
        return '<option value="' + l.id + '">' + escHtml(l.name) + ' (' + (typeof countProspectsForList === 'function' ? countProspectsForList(l) : (l.prospects || []).length) + ' prospects)</option>';
    }).join('');
    if (accessible.length === 0) sel.innerHTML = '<option value="">Aucune liste disponible</option>';
    toggleCrmImportDest();
    // Catégories en masse
    var catContainer = document.getElementById('crmImportCategoriesContainer');
    if (!crmData.categories || crmData.categories.length === 0) {
        catContainer.innerHTML = '<div style="color: #a0aec0; font-size: 0.85rem;">Aucune catégorie configurée. Allez dans Admin → CRM pour en créer.</div>';
        return;
    }
    catContainer.innerHTML = crmData.categories.map(function(cat) {
        var optHtml = '<option value="">— Aucun —</option>' + (cat.options || []).map(function(o) {
            return '<option value="' + escHtml(o) + '">' + escHtml(o) + '</option>';
        }).join('');
        return '<div style="margin-bottom: 0.75rem;"><label style="font-size: 0.85rem; color: #4a5568; font-weight: 600; display: block; margin-bottom: 0.3rem;">' + escHtml(cat.name) + '</label><select class="crm-import-cat-select" data-cat-id="' + cat.id + '" style="width:100%;padding:0.5rem;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;">' + optHtml + '</select></div>';
    }).join('');
}

function toggleCrmImportDest() {
    var isNew = document.querySelector('input[name="crmImportDest"]:checked').value === 'new';
    document.getElementById('crmImportNewListFields').style.display = isNew ? '' : 'none';
    document.getElementById('crmImportExistingListField').style.display = isNew ? 'none' : '';
    // Styling radio labels
    document.getElementById('crmImportDestNew').style.borderColor = isNew ? '#2d9cdb' : '#e2e8f0';
    document.getElementById('crmImportDestNew').style.background = isNew ? '#ebf8ff' : '';
    document.getElementById('crmImportDestExisting').style.borderColor = !isNew ? '#2d9cdb' : '#e2e8f0';
    document.getElementById('crmImportDestExisting').style.background = !isNew ? '#ebf8ff' : '';
}

function executeCrmImport() {
    // 1. Lire le mapping
    var mapping = {};
    document.querySelectorAll('#crmImportMappingRows select').forEach(function(sel) {
        var colIdx = parseInt(sel.dataset.col);
        var fieldKey = sel.value;
        if (fieldKey) mapping[colIdx] = fieldKey;
    });

    // Vérifier qu'au moins organisme est mappé
    var hasOrg = Object.values(mapping).some(function(v) { return v === 'organisme'; });
    if (!hasOrg) { alert('Veuillez mapper au moins une colonne sur "Organisme / Nom structure".'); return; }

    // 2. Destination
    var isNew = document.querySelector('input[name="crmImportDest"]:checked').value === 'new';
    var targetList;
    if (isNew) {
        var name = document.getElementById('crmImportNewListName').value.trim();
        if (!name) { alert('Veuillez saisir un nom pour la nouvelle liste.'); return; }
        targetList = {
            id: 'crm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: name,
            description: document.getElementById('crmImportNewListDesc').value.trim(),
            prospects: [],
            accessUsers: [],
            createdAt: new Date().toISOString()
        };
        crmData.lists.push(targetList);
    } else {
        var selId = document.getElementById('crmImportExistingSelect').value;
        targetList = crmData.lists.find(function(l) { return l.id === selId; });
        if (!targetList) { alert('Veuillez sélectionner une liste.'); return; }
    }

    // 3. Catégories en masse
    var bulkTags = {};
    document.querySelectorAll('.crm-import-cat-select').forEach(function(sel) {
        var catId = sel.dataset.catId;
        var val = sel.value;
        if (val) bulkTags[catId] = val;
    });
    var bulkListTags = parseImportListTags((document.getElementById('crmImportBulkListTags') || {}).value || '');

    // 4. Gestion doublons
    var dupMode = document.getElementById('crmImportDuplicates').value;
    if (!targetList.prospects) targetList.prospects = [];
    var existingOrgs = {};
    targetList.prospects.forEach(function(p, idx) {
        var key = (p.organisme || '').toLowerCase().trim();
        if (key) existingOrgs[key] = idx;
    });

    // 5. Importer
    var imported = 0, skipped = 0, replaced = 0;
    crmImportRawRows.forEach(function(row) {
        var prospect = { tags: {} };
        var importListTags = [];
        Object.keys(mapping).forEach(function(colIdx) {
            var field = mapping[colIdx];
            var val = row[parseInt(colIdx)] || '';
            if (field === 'listTags') {
                parseImportListTags(val).forEach(function(t) {
                    if (importListTags.indexOf(t) === -1) importListTags.push(t);
                });
            } else if (field.startsWith('cat_')) {
                var catId = field.replace('cat_', '');
                prospect.tags[catId] = val;
            } else {
                prospect[field] = val;
            }
        });
        if (!prospect.organisme || !prospect.organisme.trim()) { skipped++; return; }
        prospect.organisme = prospect.organisme.trim();

        // Appliquer catégories en masse (sauf si déjà défini par mapping)
        Object.keys(bulkTags).forEach(function(catId) {
            if (!prospect.tags[catId]) prospect.tags[catId] = bulkTags[catId];
        });

        var finalListTags = importListTags.slice();
        bulkListTags.forEach(function(t) {
            if (finalListTags.indexOf(t) === -1) finalListTags.push(t);
        });

        // Doublons
        var orgKey = prospect.organisme.toLowerCase().trim();
        if (existingOrgs[orgKey] !== undefined) {
            if (dupMode === 'skip') { skipped++; return; }
            if (dupMode === 'replace') {
                var existIdx = existingOrgs[orgKey];
                var existing = targetList.prospects[existIdx];
                prospect.id = existing.id;
                prospect.createdAt = existing.createdAt;
                if (finalListTags.length) {
                    var merged = getCrmProspectListTags(existing, targetList.id);
                    finalListTags.forEach(function(t) {
                        if (merged.indexOf(t) === -1) merged.push(t);
                    });
                    setCrmProspectListTags(prospect, targetList.id, merged);
                } else if (existing.listTags) {
                    prospect.listTags = JSON.parse(JSON.stringify(existing.listTags));
                }
                targetList.prospects[existIdx] = prospect;
                replaced++;
                return;
            }
        }

        if (finalListTags.length) {
            setCrmProspectListTags(prospect, targetList.id, finalListTags);
        }

        // Ajouter
        prospect.id = 'prosp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_' + imported;
        prospect.createdAt = new Date().toISOString();
        targetList.prospects.push(prospect);
        existingOrgs[orgKey] = targetList.prospects.length - 1;
        imported++;
    });

    // 6. Sauvegarder
    saveCrmData();

    // 7. Afficher résultat
    var resultHtml = '<div class="crm-import-summary"><h4>✅ Import terminé !</h4>' +
        '<div class="crm-import-summary-stat"><span>Liste :</span><strong>' + escHtml(targetList.name) + '</strong></div>' +
        '<div class="crm-import-summary-stat"><span>Prospects importés :</span><strong>' + imported + '</strong></div>';
    if (replaced > 0) resultHtml += '<div class="crm-import-summary-stat"><span>Prospects remplacés :</span><strong>' + replaced + '</strong></div>';
    if (skipped > 0) resultHtml += '<div class="crm-import-summary-stat"><span>Ignorés (doublons/vides) :</span><strong>' + skipped + '</strong></div>';
    resultHtml += '<div class="crm-import-summary-stat"><span>Total dans la liste :</span><strong>' + targetList.prospects.length + '</strong></div>';
    resultHtml += '</div>';
    document.getElementById('crmImportResult').innerHTML = resultHtml;
    crmImportGoStep(4);
}

// --- Intégration dans closeAllPages ---
(function() {
    var origCloseAllPages = closeAllPages;
    closeAllPages = function() {
        origCloseAllPages();
        var pages = ['crmPage', 'crmListPage', 'crmProspectPage', 'crmDealPage', 'adminCrmPage'];
        pages.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
    };
})();

// --- Intégration dans openAdminSubPage ---
(function() {
    var origOpenAdminSubPage = openAdminSubPage;
    openAdminSubPage = function(page) {
        if (page === 'crm') {
            document.getElementById('adminPage').classList.remove('active');
            document.getElementById('adminCrmPage').classList.add('active');
            renderCrmAdminGlobalPipeline();
            renderCrmAdminActivityLines();
            renderCrmAdminCategories();
            return;
        }
        origOpenAdminSubPage(page);
    };
})();

(function() {
    document.addEventListener('mousedown', function(e) {
        var pop = document.getElementById('crmListTagPopover');
        if (!pop || pop.style.display === 'none') return;
        if (pop.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.crm-list-tag-btn')) return;
        closeCrmListTagEditor();
    });
})();

