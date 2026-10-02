// ========== CRM V2 — Fiche prospect, dossiers, pipeline, relances ==========

var crmV2ProspectId = null;
var crmV2ProspectReturnTo = 'list';
var crmV2EditingActivityId = null;
var crmV2DealId = null;
var crmV2DealReturnTo = 'home';
var crmV2EditingDealActivityId = null;
var crmV2DealActivitiesExpanded = false;
var crmV2DealSectionsExpanded = { documents: false, notes: false, tasks: false, followups: false };
var crmV2EditingDealDocId = null;
var crmV2EditingDealNoteId = null;
var crmV2FocusDealNoteId = null;
var crmV2NotesAutoFocusOnce = false;
var crmV2DealDocsHighlightId = null;
var crmV2ActivityNoteModalActivityId = null;
var crmV2ActivityNoteModalNoteId = null;
var CRM_DEAL_SECTION_PREVIEW = 5;
var CRM_DEAL_ACTIVITIES_PREVIEW = CRM_DEAL_SECTION_PREVIEW;
var crmV2PipelineLineId = null;
var CRM_PIPELINE_ALL = 'all';
var crmV2CurrentDeal = null;
var crmV2DragDealId = null;
var crmV2DealModalContext = null;

var CRM_ACTIVITY_TYPES = {
    note: { label: 'Échange', icon: '📝' },
    call: { label: 'Appel', icon: '📞' },
    email: { label: 'Email', icon: '✉️' },
    meeting: { label: 'RDV', icon: '🤝' },
    followup: { label: 'Relance', icon: '📅' }
};

function resetCrmDealSectionsExpanded() {
    crmV2DealActivitiesExpanded = false;
    crmV2DealSectionsExpanded = { documents: false, notes: false, tasks: false, followups: false };
}

function crmIsDealSectionExpanded(sectionKey, query) {
    if (query) return true;
    if (sectionKey === 'history') return crmV2DealActivitiesExpanded;
    return !!(crmV2DealSectionsExpanded && crmV2DealSectionsExpanded[sectionKey]);
}

function crmGetDealSectionPreview(items, sectionKey, query) {
    var total = items.length;
    if (crmIsDealSectionExpanded(sectionKey, query) || total <= CRM_DEAL_SECTION_PREVIEW) {
        return { items: items, hasMore: false, total: total };
    }
    return { items: items.slice(0, CRM_DEAL_SECTION_PREVIEW), hasMore: true, total: total };
}

function crmDealSectionShowAllHtml(sectionKey, total) {
    return '<div class="crm-activities-show-all-wrap"><button type="button" class="btn btn-secondary crm-activities-show-all-btn" onclick="expandCrmDealSection(\'' + sectionKey + '\')">Voir tout (' + total + ')</button></div>';
}

function expandCrmDealSection(sectionKey) {
    if (sectionKey === 'history') crmV2DealActivitiesExpanded = true;
    else if (crmV2DealSectionsExpanded) crmV2DealSectionsExpanded[sectionKey] = true;
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    if (sectionKey === 'documents') renderCrmDealDocuments(deal);
    else if (sectionKey === 'notes') renderCrmDealNotesFiche(deal);
    else if (sectionKey === 'history') renderCrmDealActivitiesTimeline(deal);
    else if (sectionKey === 'tasks') renderCrmDealTasks(deal);
    else if (sectionKey === 'followups') renderCrmDealFollowUpHistory(deal);
}

// --- Helpers ---
function crmNewId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function bindCrmDealFicheDraftFields() {
    // Les champs relance ne sont pas brouillons : planification explicite via « Planifier ».
}

function clearCrmDealFollowUpForm() {
    var dateEl = document.getElementById('crmDealFicheFollowUpDate');
    var noteEl = document.getElementById('crmDealFicheFollowUpNote');
    var assigneeEl = document.getElementById('crmDealFicheFollowUpAssignee');
    if (dateEl) { dateEl.value = ''; dateEl.dataset.crmDraftDirty = '0'; }
    if (noteEl) { noteEl.value = ''; noteEl.dataset.crmDraftDirty = '0'; }
    if (assigneeEl) {
        populateCrmUserSelect(assigneeEl, currentUser ? currentUser.id : '', true);
        assigneeEl.dataset.crmDraftDirty = '0';
    }
}

function crmDealFicheFieldIsEditing(el) {
    return el && (el.dataset.crmDraftDirty === '1' || document.activeElement === el);
}

function setCrmDealFicheFieldValue(el, value) {
    if (!el) return;
    if (crmDealFicheFieldIsEditing(el)) return;
    el.value = value == null ? '' : value;
    el.dataset.crmDraftDirty = '0';
}

function captureCrmDealFicheDrafts() {
    return null;
}
window.captureCrmDealFicheDrafts = captureCrmDealFicheDrafts;

function applyCrmDealFicheDrafts(drafts) {
    // Plus de brouillons sur la fiche dossier.
}
window.applyCrmDealFicheDrafts = applyCrmDealFicheDrafts;

function clearCrmDealFicheDraftFlag(fieldId) {
    var el = document.getElementById(fieldId);
    if (el) el.dataset.crmDraftDirty = '0';
}

var CRM_DEAL_NOTE_DRAFT_FIELD_IDS = [
    'crmDealNewNoteTitle',
    'crmDealNewNoteText',
    'crmEditDealNoteTitle',
    'crmEditDealNoteText'
];

function bindCrmDealNotesFormFields() {
    var page = document.getElementById('crmDealNotesPage');
    if (!page || page.dataset.notesDraftBound === '1') return;
    page.dataset.notesDraftBound = '1';
    page.addEventListener('input', function(e) {
        var t = e.target;
        if (t && t.id && CRM_DEAL_NOTE_DRAFT_FIELD_IDS.indexOf(t.id) !== -1) {
            t.dataset.crmDraftDirty = '1';
        }
    });
    page.addEventListener('focusin', function(e) {
        var t = e.target;
        if (t && t.id && CRM_DEAL_NOTE_DRAFT_FIELD_IDS.indexOf(t.id) !== -1) {
            t.dataset.crmDraftDirty = '1';
        }
    });
}

function crmDealNotesPageShouldSkipRender() {
    if (crmV2EditingDealNoteId) return true;
    for (var i = 0; i < CRM_DEAL_NOTE_DRAFT_FIELD_IDS.length; i++) {
        var el = document.getElementById(CRM_DEAL_NOTE_DRAFT_FIELD_IDS[i]);
        if (crmDealFicheFieldIsEditing(el)) return true;
    }
    return false;
}
window.crmDealNotesPageShouldSkipRender = crmDealNotesPageShouldSkipRender;

function clearCrmDealNotesDraftFlags() {
    CRM_DEAL_NOTE_DRAFT_FIELD_IDS.forEach(function(id) { clearCrmDealFicheDraftFlag(id); });
}

function crmNormalizeSearchQuery(q) {
    return (q || '').toLowerCase().trim();
}

function crmTextMatchesQuery(parts, query) {
    if (!query) return true;
    var hay = (parts || []).filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(query) !== -1;
}

function getCrmDealNotesSearchQuery() {
    var el = document.getElementById('crmDealNotesSearch');
    return crmNormalizeSearchQuery(el ? el.value : '');
}

function getCrmDealFicheSearchQuery() {
    var el = document.getElementById('crmDealFicheSearch');
    return crmNormalizeSearchQuery(el ? el.value : '');
}

function getCrmDealFollowUpActivityNote(activity) {
    if (!activity) return '';
    var note = (activity.followUpNote || '').trim();
    if (note) return note;
    if (!activity.text) return '';
    var parts = String(activity.text).split(' — ');
    if (parts.length > 1) return parts.slice(1).join(' — ');
    if (parts[0].indexOf('Relance effectuée') === -1) return parts[0];
    return '';
}

function getCrmDealActivitySearchHaystack(deal, activity) {
    if (!activity) return [];
    var meta = CRM_ACTIVITY_TYPES[activity.type] || CRM_ACTIVITY_TYPES.note;
    var parts = [meta.label, activity.text, activity.authorName, getCrmDealFollowUpActivityNote(activity), activity.plannedDate ? crmFormatDate(activity.plannedDate) : ''];
    if (deal && activity.id) {
        getCrmDealNotesByActivityId(deal, activity.id).forEach(function(n) {
            parts.push(n.title, n.text, getCrmDealNoteTitle(deal, n));
        });
    }
    return parts;
}

function crmDealNoteMatchesSearch(deal, note, query) {
    if (!query) return true;
    var parts = [getCrmDealNoteTitle(deal, note), note.text, note.authorName];
    if (isCrmDealHistoryNote(note)) {
        var activity = (deal.activities || []).find(function(a) { return a.id === note.activityId; });
        if (activity) parts = parts.concat(getCrmDealActivitySearchHaystack(deal, activity));
    }
    return crmTextMatchesQuery(parts, query);
}

function crmHighlightDealElement(selector) {
    setTimeout(function() {
        var el = document.querySelector(selector);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('crm-deal-search-highlight');
        setTimeout(function() { el.classList.remove('crm-deal-search-highlight'); }, 2600);
    }, 120);
}

function clearCrmDealFicheSearch() {
    var inp = document.getElementById('crmDealFicheSearch');
    var res = document.getElementById('crmDealFicheSearchResults');
    if (inp) inp.value = '';
    if (res) { res.innerHTML = ''; res.style.display = 'none'; }
}

function clearCrmDealNotesSearch() {
    var inp = document.getElementById('crmDealNotesSearch');
    var meta = document.getElementById('crmDealNotesSearchMeta');
    if (inp) inp.value = '';
    if (meta) meta.textContent = '';
}

function getCrmDealDocumentsSearchQuery() {
    var el = document.getElementById('crmDealDocumentsSearch');
    return crmNormalizeSearchQuery(el ? el.value : '');
}

function clearCrmDealDocumentsSearch() {
    var inp = document.getElementById('crmDealDocumentsSearch');
    var meta = document.getElementById('crmDealDocumentsSearchMeta');
    if (inp) inp.value = '';
    if (meta) meta.textContent = '';
}

function crmDealDocumentMatchesSearch(doc, query) {
    if (!query) return true;
    var cat = CRM_DEAL_DOC_CATEGORIES[doc.category] || CRM_DEAL_DOC_CATEGORIES.document;
    return crmTextMatchesQuery([
        doc.name,
        doc.fileName,
        cat.label,
        doc.uploadedAt ? crmFormatDate(doc.uploadedAt) : ''
    ], query);
}

function filterCrmDealDocumentsPage() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    renderCrmDealDocuments(deal);
}

function filterCrmDealNotesPage() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    renderCrmDealNotesList(deal);
}

function buildCrmDealSearchResults(deal, query) {
    query = crmNormalizeSearchQuery(query);
    if (!query || query.length < 2) return [];
    ensureDealShape(deal);
    var results = [];

    (deal.internalNotes || []).forEach(function(n) {
        if (!crmDealNoteMatchesSearch(deal, n, query)) return;
        var isHistory = isCrmDealHistoryNote(n);
        results.push({
            kind: isHistory ? 'history_note' : 'note',
            id: n.id,
            icon: isHistory ? '🔗' : '📝',
            category: isHistory ? 'Note historique' : 'Note',
            title: getCrmDealNoteTitle(deal, n),
            snippet: (n.text || '').trim().replace(/\s+/g, ' ').slice(0, 90)
        });
    });

    (deal.activities || []).filter(function(a) { return a.type !== 'followup'; }).forEach(function(a) {
        if (!crmTextMatchesQuery(getCrmDealActivitySearchHaystack(deal, a), query)) return;
        var meta = CRM_ACTIVITY_TYPES[a.type] || CRM_ACTIVITY_TYPES.note;
        results.push({
            kind: 'activity',
            id: a.id,
            icon: meta.icon,
            category: 'Historique',
            title: meta.label,
            snippet: (a.text || '').trim().replace(/\s+/g, ' ').slice(0, 90)
        });
    });

    if (deal.followUpDate && crmTextMatchesQuery([
        deal.followUpNote,
        crmFormatDate(deal.followUpDate),
        getCrmUserDisplayName(getCrmFollowUpAssigneeUserId(deal, false))
    ], query)) {
        results.push({
            kind: 'followup_pending',
            id: 'pending',
            icon: '📅',
            category: 'Relance à faire',
            title: 'Relance planifiée · ' + crmFormatDate(deal.followUpDate),
            snippet: (deal.followUpNote || '').trim()
        });
    }

    (deal.activities || []).filter(function(a) { return a.type === 'followup'; }).forEach(function(a) {
        if (!crmTextMatchesQuery(getCrmDealActivitySearchHaystack(deal, a), query)) return;
        results.push({
            kind: 'followup',
            id: a.id,
            icon: '✅',
            category: 'Relance validée',
            title: 'Relance · ' + (a.plannedDate ? crmFormatDate(a.plannedDate) : '—'),
            snippet: getCrmDealFollowUpActivityNote(a)
        });
    });

    (deal.documents || []).forEach(function(doc) {
        var cat = CRM_DEAL_DOC_CATEGORIES[doc.category] || CRM_DEAL_DOC_CATEGORIES.document;
        if (!crmTextMatchesQuery([doc.name, doc.fileName, cat.label], query)) return;
        results.push({
            kind: 'document',
            id: doc.id,
            icon: cat.icon || '📎',
            category: 'Document',
            title: doc.name || doc.fileName || 'Document',
            snippet: cat.label + (doc.fileName && doc.fileName !== doc.name ? ' · ' + doc.fileName : '')
        });
    });

    (deal.tasks || []).forEach(function(task) {
        var assigneeId = (task.assignedTo && task.assignedTo[0]) || null;
        var assigneeName = assigneeId && typeof getCrmUserDisplayName === 'function'
            ? getCrmUserDisplayName(assigneeId) : '';
        if (!crmTextMatchesQuery([task.title, task.description, assigneeName, getCrmDealTaskStatusLabel(task.status)], query)) return;
        results.push({
            kind: 'task',
            id: task.id,
            icon: '✅',
            category: 'Tâche',
            title: task.title || 'Sans titre',
            snippet: [(task.description || '').trim(), assigneeName].filter(Boolean).join(' · ').slice(0, 90)
        });
    });

    return results;
}

function renderCrmDealFicheSearchResults(deal, query) {
    var container = document.getElementById('crmDealFicheSearchResults');
    if (!container) return;
    query = crmNormalizeSearchQuery(query);
    if (!query || query.length < 2) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    var results = buildCrmDealSearchResults(deal, query);
    if (!results.length) {
        container.innerHTML = '<div class="crm-search-empty">Aucun résultat dans ce dossier.</div>';
        container.style.display = 'block';
        return;
    }
    container.innerHTML = results.slice(0, 20).map(function(r) {
        return '<button type="button" class="crm-deal-search-result" onclick="openCrmDealSearchResult(\'' + escHtml(r.kind) + '\',\'' + escHtml(r.id) + '\')">' +
            '<span class="crm-deal-search-result-icon">' + r.icon + '</span>' +
            '<span class="crm-deal-search-result-body">' +
            '<span class="crm-deal-search-result-title">' + escHtml(r.title) + '</span>' +
            '<span class="crm-deal-search-result-meta">' +
            '<span class="crm-deal-search-result-category">' + escHtml(r.category) + '</span>' +
            (r.snippet ? '<span class="crm-deal-search-result-snippet">' + escHtml(r.snippet) + '</span>' : '') +
            '</span>' +
            '</span></button>';
    }).join('');
    container.style.display = 'block';
}

function filterCrmDealFicheSearch() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var query = getCrmDealFicheSearchQuery();
    renderCrmDealFicheSearchResults(deal, query);
    renderCrmDealFollowUpPending(deal, query);
    renderCrmDealFollowUpHistory(deal, query);
    renderCrmDealActivitiesTimeline(deal, query);
    renderCrmDealTasks(deal, query);
    renderCrmDealDocuments(deal, query);
    renderCrmDealNotesFiche(deal, query);
}

function openCrmDealSearchResult(kind, id) {
    var resultsEl = document.getElementById('crmDealFicheSearchResults');
    if (resultsEl) resultsEl.style.display = 'none';
    clearCrmDealFicheSearch();
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;

    if (kind === 'note' || kind === 'history_note') {
        var noteItem = getCrmDealNoteById(deal, id);
        if (noteItem && noteItem.activityId) {
            openCrmDealActivityNoteModal(noteItem.activityId, noteItem.id);
            return;
        }
        openCrmDealNotesFiche(id);
        return;
    }
    if (kind === 'document') {
        crmV2DealDocsHighlightId = id;
        openCrmDealDocumentsFiche();
        return;
    }

    document.getElementById('crmDealNotesPage').classList.remove('active');
    document.getElementById('crmDealDocumentsPage').classList.remove('active');
    document.getElementById('crmDealPage').classList.add('active');
    renderCrmDealFollowUpPending(deal);
    renderCrmDealFollowUpHistory(deal);
    renderCrmDealTasks(deal);
    renderCrmDealDocuments(deal);
    renderCrmDealNotesFiche(deal);

    if (kind === 'activity') {
        crmV2DealActivitiesExpanded = true;
        renderCrmDealActivitiesTimeline(deal);
        crmHighlightDealElement('[data-deal-activity-id="' + id + '"]');
        return;
    }
    if (kind === 'followup_pending') {
        crmHighlightDealElement('#crmDealFollowUpPending .crm-followup-pending-row');
        return;
    }
    if (kind === 'followup') {
        crmHighlightDealElement('[data-deal-followup-id="' + id + '"]');
        return;
    }
    if (kind === 'task') {
        crmHighlightDealElement('[data-deal-task-id="' + id + '"]');
        return;
    }
}

function crmFormatDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return iso; }
}

function crmFormatDateTime(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
}

function crmParseFollowUpDate(dateStr) {
    if (!dateStr) return null;
    var s = String(dateStr).slice(0, 10);
    var parts = s.split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d);
}

function crmIsFollowUpToday(dateStr) {
    var d = crmParseFollowUpDate(dateStr);
    if (!d) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
}

function crmFormatMoney(n) {
    var v = parseFloat(n);
    if (isNaN(v)) return '—';
    return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function getCrmUserDisplayName(userId) {
    if (!userId) return '—';
    var u = (typeof allUsers !== 'undefined' ? allUsers : []).find(function(x) { return String(x.id) === String(userId); });
    if (!u) return 'Utilisateur #' + userId;
    return ((u.prenom || '') + ' ' + (u.nom || u.username || '')).trim() || u.username;
}

/** Seul l'auteur d'une entrée CRM peut la modifier (historique, notes liées, etc.) */
function crmIsCurrentUserAuthor(authorId) {
    if (!currentUser || currentUser.id == null || currentUser.id === '') return false;
    if (authorId == null || authorId === '') return false;
    return String(authorId) === String(currentUser.id);
}

function crmCanEditCrmEntry(entry) {
    return crmIsCurrentUserAuthor(entry && entry.authorId);
}

function getCrmFollowUpAssigneeUserId(entity, isProspect) {
    if (!entity) return null;
    if (entity.followUpAssigneeUserId != null && entity.followUpAssigneeUserId !== '') {
        return String(entity.followUpAssigneeUserId);
    }
    if (isProspect && entity.responsibleUserId) return String(entity.responsibleUserId);
    return null;
}

function crmFollowUpMatchesScope(entity, isProspect, mineOnly) {
    if (!mineOnly) return true;
    var uid = currentUser ? String(currentUser.id) : null;
    if (!uid) return true;
    var assignee = getCrmFollowUpAssigneeUserId(entity, isProspect);
    return assignee === uid;
}

function populateCrmUserSelect(selectEl, selectedId, includeEmpty) {
    if (!selectEl) return;
    var html = includeEmpty !== false ? '<option value="">— Non assigné —</option>' : '';
    (typeof allUsers !== 'undefined' ? allUsers : []).forEach(function(u) {
        var sel = String(selectedId) === String(u.id) ? ' selected' : '';
        html += '<option value="' + u.id + '"' + sel + '>' + escHtml(getCrmUserDisplayName(u.id)) + '</option>';
    });
    selectEl.innerHTML = html;
}

function getCrmProspectListIds(prospect) {
    if (!prospect) return [];
    if (prospect.listIds && prospect.listIds.length) return prospect.listIds.slice();
    return [];
}

function getCrmProspectStorageListId(prospect) {
    var lids = getCrmProspectListIds(prospect);
    if (lids.length) return lids[0];
    for (var i = 0; i < (crmData.lists || []).length; i++) {
        var list = crmData.lists[i];
        if ((list.prospects || []).some(function(p) { return p.id === prospect.id; })) return list.id;
    }
    return null;
}

function prospectBelongsToList(prospect, listId) {
    if (!prospect || !listId) return false;
    var lids = getCrmProspectListIds(prospect);
    if (lids.length) return lids.indexOf(listId) !== -1;
    return !!findCrmProspect(prospect.id || prospect);
}

function getProspectsForList(listId) {
    if (!listId || !crmData || !crmData.lists) return [];
    var out = [];
    var seen = {};
    (crmData.lists || []).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            if (!p || !p.id || seen[p.id]) return;
            var lids = getCrmProspectListIds(p);
            if ((!lids.length && list.id === listId) || lids.indexOf(listId) !== -1) {
                out.push(p);
                seen[p.id] = true;
            }
        });
    });
    return out;
}

function countProspectsForList(list) {
    return getProspectsForList(list && list.id).length;
}

function countAllCrmProspects() {
    var seen = {};
    (crmData.lists || []).filter(hasCrmListAccess).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            if (p && p.id) seen[p.id] = true;
        });
    });
    return Object.keys(seen).length;
}

function getCrmProspectListNames(prospect) {
    return getCrmProspectListIds(prospect).map(function(lid) {
        var l = (crmData.lists || []).find(function(x) { return x.id === lid; });
        return l ? (l.name || 'Liste') : '';
    }).filter(Boolean);
}

function syncProspectListMembership(prospect, newListIds) {
    if (!prospect || !newListIds || !newListIds.length) return false;
    var accessible = newListIds.filter(function(lid) {
        var l = (crmData.lists || []).find(function(x) { return x.id === lid; });
        return l && hasCrmListAccess(l);
    });
    if (!accessible.length) return false;

    var current = findCrmProspect(prospect.id);
    var storageId = current && accessible.indexOf(current.list.id) !== -1
        ? current.list.id
        : accessible[0];
    prospect.listIds = [storageId].concat(accessible.filter(function(id) { return id !== storageId; }));

    (crmData.lists || []).forEach(function(list) {
        list.prospects = (list.prospects || []).filter(function(p) { return p.id !== prospect.id; });
    });
    var storageList = (crmData.lists || []).find(function(l) { return l.id === storageId; });
    if (!storageList) return false;
    if (!storageList.prospects) storageList.prospects = [];
    var idx = storageList.prospects.findIndex(function(p) { return p.id === prospect.id; });
    if (idx >= 0) storageList.prospects[idx] = prospect;
    else storageList.prospects.push(prospect);
    return true;
}

function normalizeCrmProspectMembership() {
    if (!crmData || !crmData.lists) return;
    var byId = {};
    (crmData.lists || []).forEach(function(list) {
        (list.prospects || []).slice().forEach(function(p) {
            if (!p || !p.id) return;
            if (!byId[p.id]) {
                byId[p.id] = { prospect: p, listIds: [], storageListId: list.id };
            } else {
                byId[p.id].listIds.push(list.id);
            }
            if (byId[p.id].listIds.indexOf(list.id) === -1) byId[p.id].listIds.push(list.id);
        });
    });
    Object.keys(byId).forEach(function(pid) {
        var entry = byId[pid];
        var p = entry.prospect;
        var lids = (p.listIds && p.listIds.length) ? p.listIds.slice() : [];
        entry.listIds.forEach(function(lid) {
            if (lids.indexOf(lid) === -1) lids.push(lid);
        });
        if (!lids.length) lids = [entry.storageListId];
        var storageId = lids.indexOf(entry.storageListId) !== -1 ? entry.storageListId : lids[0];
        p.listIds = [storageId].concat(lids.filter(function(id) { return id !== storageId; }));
    });
    (crmData.lists || []).forEach(function(list) {
        list.prospects = (list.prospects || []).filter(function(p) {
            if (!p || !p.id) return false;
            return getCrmProspectStorageListId(p) === list.id;
        });
    });
}

function findCrmProspect(prospectId) {
    if (!prospectId || !crmData || !crmData.lists) return null;
    for (var i = 0; i < crmData.lists.length; i++) {
        var list = crmData.lists[i];
        if (!hasCrmListAccess(list)) continue;
        var p = (list.prospects || []).find(function(x) { return x.id === prospectId; });
        if (p) return { prospect: p, list: list };
    }
    return null;
}

// ========== Structures CRM ==========
var crmV2StructureId = null;
var crmV2StructureReturnTo = 'home';
var crmStructureModalCallback = null;
var crmCurrentEditStructure = null;
var crmStructurePickBound = false;

function ensureCrmStructuresArray() {
    if (!crmData.structures) crmData.structures = [];
}

function crmNewStructureId() {
    return 'struct_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function ensureStructureShape(structure) {
    if (!structure) return;
    if (!structure.createdAt) structure.createdAt = new Date().toISOString();
    if (!structure.updatedAt) structure.updatedAt = structure.createdAt;
    if (structure.siret === undefined) structure.siret = '';
}

function findCrmStructure(structureId) {
    if (!structureId || !crmData) return null;
    ensureCrmStructuresArray();
    return crmData.structures.find(function(s) { return s.id === structureId; }) || null;
}

function normalizeCrmStructureKey(name, cp, ville) {
    return [name, cp, ville].filter(Boolean).join('|').toLowerCase().trim();
}

function getCrmProspectStructure(prospect) {
    if (!prospect) return null;
    if (prospect.structureId) {
        var linked = findCrmStructure(prospect.structureId);
        if (linked) return linked;
    }
    if (prospect.organisme) {
        return {
            id: prospect.structureId || null,
            organisme: prospect.organisme || '',
            typeStructure: prospect.typeStructure || '',
            siret: prospect.siret || '',
            web: prospect.web || '',
            adresse: prospect.adresse || '',
            cp: prospect.cp || '',
            ville: prospect.ville || '',
            region: prospect.region || ''
        };
    }
    return null;
}

function getCrmProspectPersonName(prospect) {
    if (!prospect) return '';
    return [prospect.contactPrenom, prospect.contactNom].filter(Boolean).join(' ').trim();
}

function getCrmProspectFicheTitle(prospect) {
    if (!prospect) return 'Prospect';
    return getCrmProspectPersonName(prospect) || getCrmProspectDisplayName(prospect);
}

/** Libellé court pour recherche / mentions : nom de la personne en priorité */
function getCrmProspectMentionLabel(prospect) {
    if (!prospect) return 'Prospect';
    var person = getCrmProspectPersonName(prospect);
    if (person) return person;
    var structure = getCrmProspectStructure(prospect);
    return (structure && structure.organisme) || prospect.organisme || 'Prospect';
}

function getCrmProspectDisplayName(prospect) {
    if (!prospect) return 'Prospect';
    var person = getCrmProspectPersonName(prospect);
    var structure = getCrmProspectStructure(prospect);
    var org = structure ? (structure.organisme || '') : (prospect.organisme || '');
    if (person && org) return person + ' — ' + org;
    return person || org || 'Prospect';
}

function getCrmStructureDisplayName(structure) {
    return structure ? (structure.organisme || 'Structure') : 'Structure';
}

function getCrmStructureAddress(structure) {
    if (!structure) return '';
    return [structure.adresse, [structure.cp, structure.ville].filter(Boolean).join(' '), structure.region].filter(Boolean).join(', ');
}

function syncProspectLegacyFields(prospect) {
    if (!prospect) return;
    if (prospect.structureId) {
        var structure = findCrmStructure(prospect.structureId);
        if (structure) {
            prospect.organisme = structure.organisme || '';
            prospect.typeStructure = structure.typeStructure || '';
            prospect.siret = structure.siret || '';
            prospect.web = structure.web || '';
            prospect.adresse = structure.adresse || '';
            prospect.cp = structure.cp || '';
            prospect.ville = structure.ville || '';
            prospect.region = structure.region || '';
        }
    }
    prospect.tel = prospect.telFixe || prospect.telMobile || prospect.tel || '';
}

function getAllCrmProspectsUnique() {
    var seen = {};
    var out = [];
    (crmData.lists || []).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            if (p && p.id && !seen[p.id]) {
                seen[p.id] = true;
                out.push(p);
            }
        });
    });
    return out;
}

function getProspectsForStructure(structureId) {
    if (!structureId) return [];
    return getAllCrmProspectsUnique().filter(function(p) {
        return p.structureId === structureId;
    });
}

function getDealsForProspect(prospectId, options) {
    options = options || {};
    return (crmData.deals || []).filter(function(d) {
        if (!crmDealHasProspect(d, prospectId)) return false;
        if (options.status === 'open') return (d.status || 'open') === 'open';
        if (options.status === 'closed') return (d.status || 'open') !== 'open';
        return true;
    }).sort(function(a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
}

function getDealsForStructure(structureId) {
    var ids = getProspectsForStructure(structureId).map(function(p) { return p.id; });
    return (crmData.deals || []).filter(function(d) {
        return getCrmDealProspectIds(d).some(function(pid) { return ids.indexOf(pid) !== -1; });
    }).sort(function(a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
}

function migrateProspectsToStructures() {
    ensureCrmStructuresArray();
    var structureIndex = {};
    crmData.structures.forEach(function(s) {
        structureIndex[normalizeCrmStructureKey(s.organisme, s.cp, s.ville)] = s;
    });
    getAllCrmProspectsUnique().forEach(function(p) {
        ensureProspectShape(p);
        if (p.tel && !p.telFixe && !p.telMobile) p.telFixe = p.tel;
        if (p.structureId && findCrmStructure(p.structureId)) {
            syncProspectLegacyFields(p);
            return;
        }
        var org = (p.organisme || '').trim();
        if (!org) return;
        var key = normalizeCrmStructureKey(org, p.cp, p.ville);
        var structure = structureIndex[key];
        if (!structure) {
            structure = {
                id: crmNewStructureId(),
                organisme: org,
                typeStructure: p.typeStructure || '',
                siret: p.siret || '',
                web: p.web || '',
                adresse: p.adresse || '',
                cp: p.cp || '',
                ville: p.ville || '',
                region: p.region || '',
                createdAt: p.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            crmData.structures.push(structure);
            structureIndex[key] = structure;
        }
        p.structureId = structure.id;
        syncProspectLegacyFields(p);
    });
}

function upsertCrmStructure(data, existingStructureId) {
    ensureCrmStructuresArray();
    var payload = {
        organisme: (data.organisme || '').trim(),
        typeStructure: data.typeStructure || '',
        siret: data.siret || '',
        web: data.web || '',
        adresse: data.adresse || '',
        cp: data.cp || '',
        ville: data.ville || '',
        region: data.region || ''
    };
    if (!payload.organisme) return null;
    if (existingStructureId) {
        var existing = findCrmStructure(existingStructureId);
        if (existing) {
            Object.assign(existing, payload);
            existing.updatedAt = new Date().toISOString();
            return existing.id;
        }
    }
    var key = normalizeCrmStructureKey(payload.organisme, payload.cp, payload.ville);
    var match = crmData.structures.find(function(s) {
        return normalizeCrmStructureKey(s.organisme, s.cp, s.ville) === key;
    });
    if (match) {
        Object.assign(match, payload);
        match.updatedAt = new Date().toISOString();
        return match.id;
    }
    var created = Object.assign({
        id: crmNewStructureId(),
        createdAt: new Date().toISOString()
    }, payload);
    created.updatedAt = created.createdAt;
    crmData.structures.push(created);
    return created.id;
}

function collectCrmStructureFormData(source) {
    var map = {
        modal: { org: 'crmStructModalOrg', type: 'crmStructModalType', siret: 'crmStructModalSiret', web: 'crmStructModalWeb', addr: 'crmStructModalAddr', cp: 'crmStructModalCP', ville: 'crmStructModalVille', region: 'crmStructModalRegion' },
        fiche: { org: 'crmStructFicheOrg', type: 'crmStructFicheType', siret: 'crmStructFicheSiret', web: 'crmStructFicheWeb', addr: 'crmStructFicheAddr', cp: 'crmStructFicheCP', ville: 'crmStructFicheVille', region: 'crmStructFicheRegion' }
    };
    var ids = map[source] || map.modal;
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    return {
        organisme: val(ids.org),
        typeStructure: val(ids.type),
        siret: val(ids.siret),
        web: val(ids.web),
        adresse: val(ids.addr),
        cp: val(ids.cp),
        ville: val(ids.ville),
        region: val(ids.region)
    };
}

function bindCrmStructurePickDocClick() {
    if (crmStructurePickBound) return;
    crmStructurePickBound = true;
    document.addEventListener('click', function(e) {
        document.querySelectorAll('.crm-struct-pick.crm-struct-pick-open').forEach(function(wrap) {
            if (!wrap.contains(e.target)) {
                wrap.classList.remove('crm-struct-pick-open');
                var panel = wrap.querySelector('.crm-struct-pick-panel');
                if (panel) panel.style.display = 'none';
            }
        });
    });
}

function renderCrmStructurePicker(containerId, hiddenInputId, selectedStructureId, options) {
    options = options || {};
    var container = document.getElementById(containerId);
    if (!container) return;
    bindCrmStructurePickDocClick();
    ensureCrmStructuresArray();
    container.dataset.excludeStructureId = options.excludeStructureId || '';
    var hidden = document.getElementById(hiddenInputId);
    if (hidden) hidden.value = selectedStructureId || '';
    container.className = 'crm-struct-pick';
    var selected = selectedStructureId ? findCrmStructure(selectedStructureId) : null;
    var label = selected
        ? getCrmStructureDisplayName(selected)
        : (containerId === 'crmDeleteStructStructurePick' ? 'Choisir une structure…' : 'Aucune structure (saisie manuelle)');
    container.innerHTML =
        '<input type="hidden" id="' + escHtml(hiddenInputId) + '" value="' + escHtml(selectedStructureId || '') + '">' +
        '<button type="button" class="crm-struct-pick-trigger" onclick="toggleCrmStructurePick(\'' + containerId + '\', event)">' +
            '<span class="crm-struct-pick-label">' + escHtml(label) + '</span><span class="crm-struct-pick-chevron">▾</span></button>' +
        '<div class="crm-struct-pick-panel" style="display:none;" onclick="event.stopPropagation()">' +
            '<input type="search" class="crm-struct-pick-search" placeholder="Rechercher une structure…" oninput="filterCrmStructurePick(\'' + containerId + '\')">' +
            '<div class="crm-struct-pick-options"></div>' +
            '<div class="crm-struct-pick-footer">' +
                '<button type="button" class="crm-struct-pick-new" onclick="openCrmStructureModalFromPick(\'' + containerId + '\', \'' + hiddenInputId + '\')">＋ Créer une structure</button>' +
            '</div></div>';
    renderCrmStructurePickOptions(containerId, hiddenInputId, '');
    container.classList.toggle('crm-struct-pick-has-value', !!selected);
    if (containerId === 'crmProspStructurePick' || containerId === 'crmFicheStructurePick') {
        toggleCrmProspectStructureForm(containerId === 'crmFicheStructurePick' ? 'fiche' : 'modal');
    }
}

function renderCrmStructurePickOptions(containerId, hiddenInputId, query) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var optionsEl = container.querySelector('.crm-struct-pick-options');
    if (!optionsEl) return;
    var q = (query || '').trim().toLowerCase();
    var excludeId = container.dataset.excludeStructureId || '';
    var items = (crmData.structures || []).slice().sort(function(a, b) {
        return getCrmStructureDisplayName(a).localeCompare(getCrmStructureDisplayName(b), 'fr', { sensitivity: 'base' });
    });
    if (excludeId) items = items.filter(function(s) { return s.id !== excludeId; });
    if (q) {
        items = items.filter(function(s) {
            var hay = [s.organisme, s.ville, s.cp, s.siret, s.typeStructure].join(' ').toLowerCase();
            return hay.indexOf(q) !== -1;
        });
    }
    var hidden = document.getElementById(hiddenInputId);
    var current = hidden ? hidden.value : '';
    var allowNone = containerId !== 'crmDeleteStructStructurePick';
    var html = '';
    if (allowNone) {
        html += '<button type="button" class="crm-struct-pick-option' + (!current ? ' crm-struct-pick-option--selected' : '') + '" onclick="selectCrmStructurePick(\'' + containerId + '\', \'' + hiddenInputId + '\', \'\')">' +
            '<strong>Aucune structure</strong><small>Saisir les coordonnées sur le prospect</small></button>';
    }
    if (!items.length) {
        html += '<div class="crm-struct-pick-empty">' + ((crmData.structures || []).length ? 'Aucune structure trouvée' : 'Aucune structure — créez-en une') + '</div>';
        optionsEl.innerHTML = html;
        return;
    }
    html += items.slice(0, 80).map(function(s) {
        var sel = current === s.id ? ' crm-struct-pick-option--selected' : '';
        var sub = [s.ville, s.typeStructure].filter(Boolean).join(' · ');
        return '<button type="button" class="crm-struct-pick-option' + sel + '" onclick="selectCrmStructurePick(\'' + containerId + '\', \'' + hiddenInputId + '\', \'' + escHtml(s.id) + '\')">' +
            '<strong>' + escHtml(s.organisme || 'Structure') + '</strong>' +
            (sub ? '<small>' + escHtml(sub) + '</small>' : '') + '</button>';
    }).join('');
    optionsEl.innerHTML = html;
}

function toggleCrmStructurePick(containerId, e) {
    if (e) e.stopPropagation();
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    var panel = wrap.querySelector('.crm-struct-pick-panel');
    var willOpen = !wrap.classList.contains('crm-struct-pick-open');
    document.querySelectorAll('.crm-struct-pick.crm-struct-pick-open').forEach(function(w) {
        w.classList.remove('crm-struct-pick-open');
        var p = w.querySelector('.crm-struct-pick-panel');
        if (p) p.style.display = 'none';
    });
    if (willOpen) {
        wrap.classList.add('crm-struct-pick-open');
        if (panel) panel.style.display = 'block';
        var search = wrap.querySelector('.crm-struct-pick-search');
        if (search) { search.value = ''; filterCrmStructurePick(containerId); setTimeout(function() { search.focus(); }, 0); }
    }
}

function filterCrmStructurePick(containerId) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    var hiddenInputId = wrap.querySelector('input[type="hidden"]')?.id;
    var q = wrap.querySelector('.crm-struct-pick-search')?.value || '';
    if (hiddenInputId) renderCrmStructurePickOptions(containerId, hiddenInputId, q);
}

function selectCrmStructurePick(containerId, hiddenInputId, structureId) {
    var wrap = document.getElementById(containerId);
    var hidden = document.getElementById(hiddenInputId);
    var previousId = hidden ? hidden.value : '';
    if (hidden) hidden.value = structureId || '';
    var structure = structureId ? findCrmStructure(structureId) : null;
    var labelEl = wrap ? wrap.querySelector('.crm-struct-pick-label') : null;
    if (labelEl) {
        labelEl.textContent = structure
            ? getCrmStructureDisplayName(structure)
            : (containerId === 'crmDeleteStructStructurePick' ? 'Choisir une structure…' : 'Aucune structure (saisie manuelle)');
    }
    if (wrap) {
        wrap.classList.remove('crm-struct-pick-open');
        wrap.classList.toggle('crm-struct-pick-has-value', !!structureId);
        var panel = wrap.querySelector('.crm-struct-pick-panel');
        if (panel) panel.style.display = 'none';
    }
    if (!structureId && previousId && (containerId === 'crmProspStructurePick' || containerId === 'crmFicheStructurePick')) {
        var prevStructure = findCrmStructure(previousId);
        if (prevStructure) {
            var mode = containerId === 'crmFicheStructurePick' ? 'fiche' : 'modal';
            fillCrmProspectStandaloneFieldsFromStructure(prevStructure, mode);
        }
    }
    if (containerId === 'crmFicheStructurePick') renderCrmProspectStructureCard(structureId);
    if (containerId === 'crmProspStructurePick') toggleCrmProspectStructureForm('modal');
    if (containerId === 'crmFicheStructurePick') toggleCrmProspectStructureForm('fiche');
}

function openCrmStructureModalFromPick(containerId, hiddenInputId) {
    var wrap = document.getElementById(containerId);
    if (wrap) wrap.classList.remove('crm-struct-pick-open');
    crmStructureModalCallback = function(structureId) {
        renderCrmStructurePicker(containerId, hiddenInputId, structureId);
        var pickWrap = document.getElementById(containerId);
        if (pickWrap) {
            pickWrap.classList.add('crm-struct-pick-open');
            var panel = pickWrap.querySelector('.crm-struct-pick-panel');
            if (panel) panel.style.display = 'block';
        }
        if (containerId === 'crmFicheStructurePick') renderCrmProspectStructureCard(structureId);
        if (containerId === 'crmProspStructurePick') toggleCrmProspectStructureForm('modal');
        if (containerId === 'crmFicheStructurePick') toggleCrmProspectStructureForm('fiche');
    };
    openCrmStructureModal(null);
}

function openCrmStructureModalById(structureId) {
    var structure = findCrmStructure(structureId);
    if (structure) openCrmStructureModal(structure);
}

function openCrmStructureModal(structure) {
    crmCurrentEditStructure = structure || null;
    var d = structure || {};
    document.getElementById('crmStructureModalTitle').textContent = structure ? '✏️ Modifier la structure' : '🏢 Nouvelle structure';
    document.getElementById('crmStructModalOrg').value = d.organisme || '';
    document.getElementById('crmStructModalType').value = d.typeStructure || '';
    document.getElementById('crmStructModalSiret').value = d.siret || '';
    document.getElementById('crmStructModalWeb').value = d.web || '';
    document.getElementById('crmStructModalAddr').value = d.adresse || '';
    document.getElementById('crmStructModalCP').value = d.cp || '';
    document.getElementById('crmStructModalVille').value = d.ville || '';
    document.getElementById('crmStructModalRegion').value = d.region || '';
    document.getElementById('crmStructureModal').classList.add('active');
}

function closeCrmStructureModal() {
    document.getElementById('crmStructureModal').classList.remove('active');
    crmCurrentEditStructure = null;
    crmStructureModalCallback = null;
}

function saveCrmStructureModal(e) {
    if (e) e.preventDefault();
    var data = collectCrmStructureFormData('modal');
    if (!data.organisme) { alert('Le nom de la structure est obligatoire.'); return; }
    var structureId = upsertCrmStructure(data, crmCurrentEditStructure ? crmCurrentEditStructure.id : null);
    if (!structureId) return;
    getAllCrmProspectsUnique().forEach(function(p) {
        if (p.structureId === structureId) syncProspectLegacyFields(p);
    });
    saveCrmData();
    var structCb = crmStructureModalCallback;
    crmStructureModalCallback = null;
    document.getElementById('crmStructureModal').classList.remove('active');
    crmCurrentEditStructure = null;
    if (structCb) structCb(structureId);
    if (crmV2StructureId === structureId) renderCrmStructureFiche();
    if (crmV2ProspectId && document.getElementById('crmProspectPage') && document.getElementById('crmProspectPage').classList.contains('active')) {
        renderCrmProspectFiche();
    }
    if (typeof renderCrmStructuresBrowse === 'function') renderCrmStructuresBrowse();
    if (typeof renderCrmLists === 'function') renderCrmLists();
    if (typeof showToast === 'function') showToast(structCb ? 'Structure créée et sélectionnée' : 'Structure enregistrée', 'success');
}

function getCrmProspectStructureLabel(p) {
    if (!p) return '';
    var structure = getCrmProspectStructure(p);
    if (structure && structure.organisme) return structure.organisme;
    return (p.organisme || '').trim();
}

function crmProspectHeroMetaItem(iconKind, emoji, contentHtml) {
    return '<span class="crm-prospect-hero-meta-item">' +
        '<span class="crm-prospect-hero-meta-icon crm-prospect-hero-meta-icon--' + iconKind + '" aria-hidden="true">' + emoji + '</span>' +
        '<span class="crm-prospect-hero-meta-value">' + contentHtml + '</span></span>';
}

function renderCrmProspectHero(p) {
    if (!p) return;
    var titleEl = document.getElementById('crmFicheTitle');
    var subtitleEl = document.getElementById('crmFicheSubtitle');
    var metaEl = document.getElementById('crmFicheHeroMeta');
    if (titleEl) {
        titleEl.innerHTML = crmProspectHeroMetaItem('name', '👤', '<span class="crm-prospect-hero-title-text">' + escHtml(getCrmProspectFicheTitle(p)) + '</span>');
    }

    if (subtitleEl) {
        var fonction = (p.contactFonction || '').trim();
        var structureName = getCrmProspectStructureLabel(p);
        var structureId = p.structureId && findCrmStructure(p.structureId) ? p.structureId : null;
        var roleItems = [];
        if (fonction) {
            roleItems.push(crmProspectHeroMetaItem('fonction', '💼', escHtml(fonction)));
        }
        if (structureName) {
            var structureHtml = structureId
                ? '<a href="#" onclick="event.preventDefault();openCrmStructureFiche(\'' + escHtml(structureId) + '\')">' + escHtml(structureName) + '</a>'
                : escHtml(structureName);
            roleItems.push(crmProspectHeroMetaItem('structure', '🏢', structureHtml));
        }
        if (roleItems.length) {
            subtitleEl.innerHTML = roleItems.join('');
            subtitleEl.style.display = '';
        } else {
            subtitleEl.innerHTML = '';
            subtitleEl.style.display = 'none';
        }
    }

    if (metaEl) {
        var metaItems = [];
        var email = (p.email || '').trim();
        if (email) {
            metaItems.push(crmProspectHeroMetaItem('email', '✉️', '<a href="mailto:' + escHtml(email) + '">' + escHtml(email) + '</a>'));
        }
        var telFixe = (p.telFixe || p.tel || '').trim();
        if (telFixe) {
            metaItems.push(crmProspectHeroMetaItem('tel', '📞', escHtml(telFixe)));
        }
        var telMobile = (p.telMobile || '').trim();
        if (telMobile) {
            metaItems.push(crmProspectHeroMetaItem('mobile', '📱', escHtml(telMobile)));
        }
        var listNames = getCrmProspectListNames(p);
        if (listNames.length) {
            metaItems.push(crmProspectHeroMetaItem('list', '📋', escHtml(listNames.join(', '))));
        }
        metaEl.innerHTML = metaItems.join('');
        metaEl.style.display = metaItems.length ? '' : 'none';
    }
}

function renderCrmProspectHeroStructure(p) {
    renderCrmProspectHero(p);
}

function editCrmProspectHero() {
    openCrmProspectContactModal();
}

function editCrmProspectHeroStructure() {
    editCrmProspectHero();
}

function populateCrmProspectContactForm(p) {
    if (!p) return;
    var listGroup = document.getElementById('crmFicheListGroup');
    var accessible = (crmData.lists || []).filter(hasCrmListAccess);
    if (listGroup) {
        if (accessible.length) {
            listGroup.style.display = '';
            if (typeof renderCrmListPicker === 'function') {
                renderCrmListPicker('crmFicheListPicker', getCrmProspectListIds(p));
            }
        } else {
            listGroup.style.display = 'none';
        }
    }
    document.getElementById('crmFichePrenom').value = p.contactPrenom || '';
    document.getElementById('crmFicheNom').value = p.contactNom || '';
    document.getElementById('crmFicheFonction').value = p.contactFonction || '';
    document.getElementById('crmFicheTelFixe').value = p.telFixe || p.tel || '';
    document.getElementById('crmFicheTelMobile').value = p.telMobile || '';
    document.getElementById('crmFicheEmail').value = p.email || '';
    if (typeof renderCrmStructurePicker === 'function') {
        renderCrmStructurePicker('crmFicheStructurePick', 'crmFicheStructureId', p.structureId || '');
        fillCrmProspectStandaloneFields(p, 'fiche');
    }
}

function openCrmProspectContactModal() {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    populateCrmProspectContactForm(found.prospect);
    document.getElementById('crmProspectContactModal').classList.add('active');
    setTimeout(function() {
        var focusEl = document.getElementById('crmFichePrenom') || document.getElementById('crmFicheNom');
        if (focusEl) focusEl.focus();
    }, 80);
}

function closeCrmProspectContactModal() {
    document.getElementById('crmProspectContactModal').classList.remove('active');
}

function saveCrmProspectContactModal(e) {
    if (e && e.preventDefault) e.preventDefault();
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    if (typeof collectCrmProspectFormData !== 'function') return;
    var d = collectCrmProspectFormData('fiche', 'contact');
    if (!validateCrmProspectContactData(d)) return;

    var listGroup = document.getElementById('crmFicheListGroup');
    var listIds = null;
    if (listGroup && listGroup.style.display !== 'none' && typeof getCrmListPickerSelectedIds === 'function') {
        listIds = getCrmListPickerSelectedIds('crmFicheListPicker');
        if (!listIds.length) {
            alert('Sélectionnez au moins une liste de rattachement.');
            return;
        }
    }

    Object.assign(found.prospect, d);
    syncProspectLegacyFields(found.prospect);
    if (listIds && typeof syncProspectListMembership === 'function') {
        syncProspectListMembership(found.prospect, listIds);
        var refreshed = findCrmProspect(found.prospect.id);
        if (refreshed) found = refreshed;
    }
    saveCrmData();
    renderCrmProspectHero(found.prospect);
    closeCrmProspectContactModal();

    if (typeof renderCrmProspects === 'function') renderCrmProspects();
    if (typeof renderCrmHomeProspects === 'function') renderCrmHomeProspects();
    if (typeof renderCrmLists === 'function') renderCrmLists();
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
    if (typeof showToast === 'function') showToast('Contact enregistré', 'success');
}

function renderCrmProspectStructureCard(structureId) {
    var card = document.getElementById('crmFicheStructureCard');
    if (card) {
        card.innerHTML = '';
        card.style.display = 'none';
    }
    if (crmV2ProspectId && document.getElementById('crmProspectPage') && document.getElementById('crmProspectPage').classList.contains('active')) {
        var found = findCrmProspect(crmV2ProspectId);
        if (found) renderCrmProspectHeroStructure(found.prospect);
    }
}

function getCrmProspectStandaloneFieldIds(mode) {
    if (mode === 'fiche') {
        return { org: 'crmFicheOrg', type: 'crmFicheType', siret: 'crmFicheSiret', web: 'crmFicheWeb', addr: 'crmFicheAddr', cp: 'crmFicheCP', ville: 'crmFicheVille', region: 'crmFicheRegion', hidden: 'crmFicheStructureId', standalone: 'crmFicheStandaloneFields', card: null };
    }
    return { org: 'crmProspOrg', type: 'crmProspType', siret: 'crmProspSiret', web: 'crmProspWeb', addr: 'crmProspAddr', cp: 'crmProspCP', ville: 'crmProspVille', region: 'crmProspRegion', hidden: 'crmProspStructureId', standalone: 'crmProspStandaloneFields', card: 'crmFicheStructureCard' };
}

function fillCrmProspectStandaloneFields(prospect, mode) {
    var ids = getCrmProspectStandaloneFieldIds(mode);
    function set(id, value) { var el = document.getElementById(id); if (el) el.value = value || ''; }
    set(ids.org, prospect ? prospect.organisme : '');
    set(ids.type, prospect ? prospect.typeStructure : '');
    set(ids.siret, prospect ? prospect.siret : '');
    set(ids.web, prospect ? prospect.web : '');
    set(ids.addr, prospect ? prospect.adresse : '');
    set(ids.cp, prospect ? prospect.cp : '');
    set(ids.ville, prospect ? prospect.ville : '');
    set(ids.region, prospect ? prospect.region : '');
    toggleCrmProspectStructureForm(mode);
}

function fillCrmProspectStandaloneFieldsFromStructure(structure, mode) {
    if (!structure) return;
    var ids = getCrmProspectStandaloneFieldIds(mode);
    function set(id, value) {
        var el = document.getElementById(id);
        if (el && !el.value.trim()) el.value = value || '';
    }
    set(ids.org, structure.organisme);
    set(ids.type, structure.typeStructure);
    set(ids.siret, structure.siret);
    set(ids.web, structure.web);
    set(ids.addr, structure.adresse);
    set(ids.cp, structure.cp);
    set(ids.ville, structure.ville);
    set(ids.region, structure.region);
}

function toggleCrmProspectStructureForm(mode) {
    var ids = getCrmProspectStandaloneFieldIds(mode);
    var hidden = document.getElementById(ids.hidden);
    var structureId = hidden ? hidden.value.trim() : '';
    var standalone = document.getElementById(ids.standalone);
    var card = document.getElementById(ids.card);
    if (standalone) standalone.style.display = structureId ? 'none' : '';
    if (card) card.style.display = 'none';
}

function collectCrmProspectStandaloneFormData(mode) {
    var ids = getCrmProspectStandaloneFieldIds(mode);
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    return {
        organisme: val(ids.org),
        typeStructure: val(ids.type),
        siret: val(ids.siret),
        web: val(ids.web),
        adresse: val(ids.addr),
        cp: val(ids.cp),
        ville: val(ids.ville),
        region: val(ids.region)
    };
}

function validateCrmProspectData(data) {
    if (!data.contactNom && !data.contactPrenom) {
        alert('Indiquez au moins le prénom ou le nom du prospect.');
        return false;
    }
    if (!data.structureId && !(data.organisme || '').trim()) {
        alert('Sélectionnez une structure ou renseignez le nom de l\'organisme.');
        return false;
    }
    return true;
}

function validateCrmProspectContactData(data) {
    if (!data.contactNom && !data.contactPrenom) {
        alert('Indiquez au moins le prénom ou le nom du prospect.');
        return false;
    }
    if (!data.structureId && !(data.organisme || '').trim()) {
        alert('Sélectionnez une structure ou renseignez le nom de l\'organisme.');
        return false;
    }
    return true;
}

function validateCrmProspectPageData(data) {
    return true;
}

var crmDeleteStructureId = null;

function removeCrmStructureById(structureId) {
    crmData.structures = (crmData.structures || []).filter(function(s) { return s.id !== structureId; });
}

function forceDeleteCrmProspect(prospectId) {
    (crmData.deals || []).forEach(function(d) {
        ensureDealShape(d);
        if (d.prospectIds) d.prospectIds = d.prospectIds.filter(function(id) { return id !== prospectId; });
        syncCrmDealProspectFields(d);
    });
    crmData.deals = (crmData.deals || []).filter(function(d) {
        return getCrmDealProspectIds(d).length > 0;
    });
    (crmData.lists || []).forEach(function(list) {
        list.prospects = (list.prospects || []).filter(function(p) { return p.id !== prospectId; });
    });
}

function refreshCrmAfterStructureChange() {
    if (typeof renderCrmLists === 'function') renderCrmLists();
    if (typeof renderCrmStructuresBrowse === 'function') renderCrmStructuresBrowse();
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
    if (typeof renderCrmHomeProspects === 'function') renderCrmHomeProspects();
    if (typeof renderCrmProspects === 'function') renderCrmProspects();
}

function openDeleteCrmStructureModal(structureId) {
    structureId = structureId || crmV2StructureId;
    var structure = findCrmStructure(structureId);
    if (!structure) { alert('Structure introuvable.'); return; }
    crmDeleteStructureId = structureId;
    var prospects = getProspectsForStructure(structureId);
    var intro = document.getElementById('crmDeleteStructIntro');
    var withProspects = document.getElementById('crmDeleteStructWithProspects');
    if (intro) {
        intro.textContent = prospects.length
            ? 'Vous allez supprimer « ' + (structure.organisme || 'Structure') + ' ».'
            : 'Supprimer définitivement « ' + (structure.organisme || 'Structure') + ' » ? Cette action est irréversible.';
    }
    if (withProspects) {
        withProspects.style.display = prospects.length ? '' : 'none';
        if (prospects.length) {
            var deleteAll = withProspects.querySelector('input[value="delete_all"]');
            if (deleteAll) deleteAll.checked = true;
            renderCrmStructurePicker('crmDeleteStructStructurePick', 'crmDeleteStructStructureId', '', { excludeStructureId: structureId });
            toggleCrmDeleteStructMode();
        }
    }
    document.getElementById('crmDeleteStructureModal').classList.add('active');
}

function closeDeleteCrmStructureModal() {
    document.getElementById('crmDeleteStructureModal').classList.remove('active');
    crmDeleteStructureId = null;
}

function toggleCrmDeleteStructMode() {
    var mode = document.querySelector('input[name="crmDeleteStructMode"]:checked');
    var block = document.getElementById('crmDeleteStructReassignBlock');
    if (block) block.style.display = mode && mode.value === 'reassign' ? '' : 'none';
}

function confirmDeleteCrmStructure() {
    var structureId = crmDeleteStructureId;
    var structure = findCrmStructure(structureId);
    if (!structure) { closeDeleteCrmStructureModal(); return; }
    var prospects = getProspectsForStructure(structureId);
    if (!prospects.length) {
        if (!confirm('Confirmer la suppression de cette structure ?')) return;
        removeCrmStructureById(structureId);
    } else {
        var modeEl = document.querySelector('input[name="crmDeleteStructMode"]:checked');
        var mode = modeEl ? modeEl.value : 'delete_all';
        if (mode === 'delete_all') {
            if (!confirm('Supprimer la structure et les ' + prospects.length + ' prospect(s) rattaché(s) ?')) return;
            prospects.slice().forEach(function(p) { forceDeleteCrmProspect(p.id); });
            removeCrmStructureById(structureId);
        } else if (mode === 'reassign') {
            var newStructureId = (document.getElementById('crmDeleteStructStructureId') || {}).value || '';
            if (!newStructureId) { alert('Choisissez la nouvelle structure de rattachement.'); return; }
            if (newStructureId === structureId) { alert('Choisissez une structure différente.'); return; }
            prospects.forEach(function(p) {
                p.structureId = newStructureId;
                syncProspectLegacyFields(p);
            });
            removeCrmStructureById(structureId);
        } else {
            if (!confirm('Détacher les ' + prospects.length + ' prospect(s) et supprimer la structure ?')) return;
            prospects.forEach(function(p) {
                p.structureId = null;
                p.organisme = '';
                p.typeStructure = '';
                p.siret = '';
                p.web = '';
                p.adresse = '';
                p.cp = '';
                p.ville = '';
                p.region = '';
                syncProspectLegacyFields(p);
            });
            removeCrmStructureById(structureId);
        }
    }
    saveCrmData();
    closeDeleteCrmStructureModal();
    if (crmV2StructureId === structureId) {
        crmV2StructureId = null;
        closeCrmStructureFiche();
    }
    refreshCrmAfterStructureChange();
    if (typeof showToast === 'function') showToast('Structure supprimée', 'success');
}

function openCrmStructureFiche(structureId) {
    var structure = findCrmStructure(structureId);
    if (!structure) { alert('Structure introuvable.'); return; }
    crmV2StructureId = structureId;
    if (document.getElementById('crmProspectPage').classList.contains('active')) crmV2StructureReturnTo = 'prospect';
    else if (document.getElementById('crmStructuresBrowsePage').classList.contains('active')) crmV2StructureReturnTo = 'structures_browse';
    else if (document.getElementById('crmProspectsHubPage').classList.contains('active')) crmV2StructureReturnTo = 'prospects_hub';
    else if (document.getElementById('crmPage').classList.contains('active')) crmV2StructureReturnTo = 'home';
    else if (document.getElementById('crmListPage').classList.contains('active')) crmV2StructureReturnTo = 'list';
    else crmV2StructureReturnTo = 'home';
    crmHideBrowsePages();
    document.getElementById('crmProspectPage').classList.remove('active');
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmListPage').classList.remove('active');
    document.getElementById('crmDealPage').classList.remove('active');
    document.getElementById('crmStructurePage').classList.add('active');
    renderCrmStructureFiche();
}

function closeCrmStructureFiche() {
    document.getElementById('crmStructurePage').classList.remove('active');
    crmV2StructureId = null;
    if (crmV2StructureReturnTo === 'prospect' && crmV2ProspectId) {
        document.getElementById('crmProspectPage').classList.add('active');
        renderCrmProspectFiche();
    } else if (crmV2StructureReturnTo === 'list') {
        document.getElementById('crmListPage').classList.add('active');
        if (typeof renderCrmProspects === 'function') renderCrmProspects();
    } else if (crmV2StructureReturnTo === 'structures_browse') {
        openCrmStructuresBrowsePage();
    } else if (crmV2StructureReturnTo === 'prospects_hub') {
        openCrmProspectsHub();
    } else {
        document.getElementById('crmPage').classList.add('active');
        if (typeof renderCrmLists === 'function') renderCrmLists();
    }
}

function renderCrmStructureFiche() {
    var structure = findCrmStructure(crmV2StructureId);
    if (!structure) return;
    ensureStructureShape(structure);
    document.getElementById('crmStructFicheTitle').textContent = getCrmStructureDisplayName(structure);
    document.getElementById('crmStructFicheSubtitle').textContent = getCrmStructureAddress(structure) || '—';
    document.getElementById('crmStructFicheOrg').value = structure.organisme || '';
    document.getElementById('crmStructFicheType').value = structure.typeStructure || '';
    document.getElementById('crmStructFicheSiret').value = structure.siret || '';
    document.getElementById('crmStructFicheWeb').value = structure.web || '';
    document.getElementById('crmStructFicheAddr').value = structure.adresse || '';
    document.getElementById('crmStructFicheCP').value = structure.cp || '';
    document.getElementById('crmStructFicheVille').value = structure.ville || '';
    document.getElementById('crmStructFicheRegion').value = structure.region || '';
    renderCrmStructureProspects(structure.id);
    renderCrmStructureDeals(structure.id);
    renderCrmStructureHistory(structure.id);
}

function getCrmStructureHistoryItems(structureId, prospectFilterId) {
    if (!structureId) return [];
    var prospects = getProspectsForStructure(structureId);
    if (prospectFilterId) {
        prospects = prospects.filter(function(p) { return p.id === prospectFilterId; });
    }
    var items = [];
    prospects.forEach(function(prospect) {
        ensureProspectShape(prospect);
        (prospect.activities || []).forEach(function(activity) {
            if (activity.type === 'followup') return;
            items.push({ prospect: prospect, activity: activity });
        });
    });
    items.sort(function(a, b) {
        return new Date(b.activity.createdAt) - new Date(a.activity.createdAt);
    });
    return items;
}

function renderCrmStructureHistoryProspectFilter(structureId) {
    var sel = document.getElementById('crmStructHistoryProspectFilter');
    if (!sel) return;
    var prospects = getProspectsForStructure(structureId);
    var current = sel.value || '';
    sel.innerHTML = '<option value="">Tous les prospects</option>' +
        prospects.map(function(p) {
            var name = getCrmProspectPersonName(p) || getCrmProspectDisplayName(p) || 'Prospect';
            return '<option value="' + escHtml(p.id) + '">' + escHtml(name) + '</option>';
        }).join('');
    if (current && prospects.some(function(p) { return p.id === current; })) sel.value = current;
}

function renderCrmStructureHistory(structureId) {
    structureId = structureId || crmV2StructureId;
    if (!structureId) return;
    renderCrmStructureHistoryProspectFilter(structureId);
    var filterEl = document.getElementById('crmStructHistoryProspectFilter');
    var prospectFilterId = filterEl ? filterEl.value : '';
    var container = document.getElementById('crmStructFicheActivities');
    if (!container) return;
    var items = getCrmStructureHistoryItems(structureId, prospectFilterId);
    if (!items.length) {
        var msg = prospectFilterId
            ? 'Aucun échange pour ce prospect.'
            : (getProspectsForStructure(structureId).length
                ? 'Aucun échange enregistré sur les prospects de cette structure.'
                : 'Rattachez des prospects pour voir leur historique ici.');
        container.innerHTML = '<div class="crm-fiche-empty">' + msg + '</div>';
        return;
    }
    container.innerHTML = items.map(function(item) {
        var a = item.activity;
        var p = item.prospect;
        var meta = CRM_ACTIVITY_TYPES[a.type] || CRM_ACTIVITY_TYPES.note;
        var prospectName = getCrmProspectPersonName(p) || getCrmProspectDisplayName(p) || 'Prospect';
        return '<div class="crm-activity-item crm-activity-item--struct" data-activity-id="' + escHtml(a.id) + '" data-prospect-id="' + escHtml(p.id) + '">' +
            '<div class="crm-activity-icon">' + meta.icon + '</div>' +
            '<div class="crm-activity-body">' +
            '<div class="crm-activity-meta-row">' +
            '<div class="crm-activity-meta"><strong>' + escHtml(meta.label) + '</strong> · ' + escHtml(a.authorName || '—') + ' · ' + crmFormatDateTime(a.createdAt) + '</div>' +
            '</div>' +
            '<div class="crm-struct-activity-prospect">' +
            '<button type="button" class="crm-struct-activity-prospect-link" onclick="event.stopPropagation();openCrmProspectFiche(\'' + escHtml(p.id) + '\')">👤 ' + escHtml(prospectName) + '</button>' +
            '</div>' +
            '<div class="crm-activity-text">' + (typeof formatMsgText === 'function' ? formatMsgText(a.text || '') : escHtml(a.text || '').replace(/\n/g, '<br>')) + '</div>' +
            '</div></div>';
    }).join('');
}

function filterCrmStructureHistory() {
    renderCrmStructureHistory(crmV2StructureId);
}

function refreshCrmStructureHistoryIfVisible() {
    var page = document.getElementById('crmStructurePage');
    if (page && page.classList.contains('active') && crmV2StructureId) {
        renderCrmStructureHistory(crmV2StructureId);
    }
}

function saveCrmStructureFiche() {
    var structure = findCrmStructure(crmV2StructureId);
    if (!structure) return;
    var data = collectCrmStructureFormData('fiche');
    if (!data.organisme) { alert('Le nom de la structure est obligatoire.'); return; }
    Object.assign(structure, data);
    structure.updatedAt = new Date().toISOString();
    getProspectsForStructure(structure.id).forEach(syncProspectLegacyFields);
    saveCrmData();
    renderCrmStructureFiche();
    if (typeof showToast === 'function') showToast('Structure enregistrée', 'success');
}

function renderCrmStructureProspects(structureId) {
    var container = document.getElementById('crmStructFicheProspects');
    if (!container) return;
    var prospects = getProspectsForStructure(structureId);
    var sid = escHtml(structureId);
    var addBtn = '<button type="button" class="btn btn-secondary btn-sm crm-struct-section-add" onclick="openCrmProspectModalForStructure(\'' + sid + '\')">+ Prospect rattaché</button>';
    if (!prospects.length) {
        container.innerHTML = addBtn + '<div class="crm-fiche-empty">Aucun prospect rattaché à cette structure.</div>';
        return;
    }
    container.innerHTML = addBtn + prospects.map(function(p) {
        var contact = getCrmProspectPersonName(p) || '—';
        return '<div class="crm-fiche-deal-card" onclick="openCrmProspectFiche(\'' + escHtml(p.id) + '\')">' +
            '<div class="crm-fiche-deal-title">' + escHtml(contact) + '</div>' +
            '<div class="crm-fiche-deal-meta">' + escHtml(p.contactFonction || '') +
            (p.email ? ' · ' + escHtml(p.email) : '') + '</div></div>';
    }).join('');
}

function renderCrmStructureDeals(structureId) {
    var container = document.getElementById('crmStructFicheDeals');
    if (!container) return;
    var deals = getDealsForStructure(structureId);
    var sid = escHtml(structureId);
    var addBtn = '<button type="button" class="btn btn-secondary btn-sm crm-struct-section-add" onclick="openCrmDealModalForStructure(\'' + sid + '\')">+ Dossier rattaché</button>';
    if (!deals.length) {
        container.innerHTML = addBtn + '<div class="crm-fiche-empty">Aucun dossier lié à cette structure.</div>';
        return;
    }
    container.innerHTML = addBtn + deals.map(function(d) {
        var statusCls = d.status === 'won' ? 'crm-deal-status-won' : (d.status === 'lost' ? 'crm-deal-status-lost' : '');
        var statusLabel = d.status === 'won' ? 'Gagné' : (d.status === 'lost' ? 'Perdu' : (d.status === 'open' ? 'En cours' : d.status || '—'));
        return '<div class="crm-fiche-deal-card" onclick="openCrmDealFiche(\'' + escHtml(d.id) + '\')">' +
            '<div class="crm-fiche-deal-title">' + escHtml(d.title || 'Sans titre') + '</div>' +
            '<div class="crm-fiche-deal-meta">' + escHtml(d.stage || '—') +
            ' · <span class="crm-deal-status-badge ' + statusCls + '">' + escHtml(statusLabel) + '</span></div></div>';
    }).join('');
}

function openCrmProspectModalForStructure(structureId) {
    if (!structureId) return;
    var accessible = (crmData.lists || []).filter(hasCrmListAccess);
    if (!accessible.length) {
        alert('Créez d\'abord une liste pour classer vos prospects.');
        if (typeof openCrmListsManageModal === 'function') openCrmListsManageModal();
        return;
    }
    if (typeof openCrmProspectModal === 'function') {
        if (typeof crmProspectModalListId !== 'undefined') {
            crmProspectModalListId = accessible.length === 1 ? accessible[0].id : null;
        }
        openCrmProspectModal(null);
    } else if (typeof openCrmProspectModalFromHome === 'function') {
        openCrmProspectModalFromHome();
    }
    if (typeof renderCrmStructurePicker === 'function') {
        renderCrmStructurePicker('crmProspStructurePick', 'crmProspStructureId', structureId);
    }
    if (typeof toggleCrmProspectStructureForm === 'function') toggleCrmProspectStructureForm('modal');
}

function openCrmDealModalForStructure(structureId) {
    if (!structureId) return;
    var prospects = getProspectsForStructure(structureId);
    if (!prospects.length) {
        if (confirm('Cette structure n\'a pas encore de prospect. Créer un prospect rattaché d\'abord ?')) {
            openCrmProspectModalForStructure(structureId);
        }
        return;
    }
    var defaultProspectId = prospects[0].id;
    openCrmDealModalInternal(null, defaultProspectId, { structureId: structureId, fromStructureFiche: true });
    var structProspectIds = prospects.map(function(p) { return p.id; });
    crmDealProspectPickData = crmDealProspectPickData.filter(function(x) {
        return structProspectIds.indexOf(x.prospectId) !== -1;
    });
    var search = document.getElementById('crmDealProspectSearch');
    var hidden = document.getElementById('crmDealProspect');
    if (hidden && defaultProspectId) {
        var found = crmDealProspectPickData.find(function(x) { return x.prospectId === defaultProspectId; });
        if (found) {
            hidden.value = found.prospectId;
            hidden.setAttribute('data-list', found.listId);
            if (search) search.value = found.label;
        }
    }
}

window.findCrmStructure = findCrmStructure;
window.getCrmProspectStructure = getCrmProspectStructure;
window.getCrmProspectDisplayName = getCrmProspectDisplayName;
window.getCrmProspectPersonName = getCrmProspectPersonName;
window.getCrmProspectMentionLabel = getCrmProspectMentionLabel;
window.renderCrmStructurePicker = renderCrmStructurePicker;
window.toggleCrmStructurePick = toggleCrmStructurePick;
window.filterCrmStructurePick = filterCrmStructurePick;
window.selectCrmStructurePick = selectCrmStructurePick;
window.openCrmStructureModalById = openCrmStructureModalById;
window.openCrmStructureModalFromPick = openCrmStructureModalFromPick;
window.openCrmStructureModal = openCrmStructureModal;
window.closeCrmStructureModal = closeCrmStructureModal;
window.saveCrmStructureModal = saveCrmStructureModal;
window.openCrmStructureFiche = openCrmStructureFiche;
window.closeCrmStructureFiche = closeCrmStructureFiche;
window.saveCrmStructureFiche = saveCrmStructureFiche;
window.toggleCrmProspectStructureForm = toggleCrmProspectStructureForm;
window.fillCrmProspectStandaloneFields = fillCrmProspectStandaloneFields;
window.validateCrmProspectData = validateCrmProspectData;
window.openDeleteCrmStructureModal = openDeleteCrmStructureModal;
window.closeDeleteCrmStructureModal = closeDeleteCrmStructureModal;
window.toggleCrmDeleteStructMode = toggleCrmDeleteStructMode;
window.editCrmProspectHero = editCrmProspectHero;
window.editCrmProspectHeroStructure = editCrmProspectHeroStructure;
window.editCrmDealHero = editCrmDealHero;
window.closeCrmDealEditModal = closeCrmDealEditModal;
window.saveCrmDealEditModal = saveCrmDealEditModal;
window.openCrmDealDocumentsPage = openCrmDealDocumentsPage;
window.closeCrmDealDocumentsPage = closeCrmDealDocumentsPage;
window.startRenameCrmDealDocument = startRenameCrmDealDocument;
window.saveRenameCrmDealDocument = saveRenameCrmDealDocument;
window.cancelRenameCrmDealDocument = cancelRenameCrmDealDocument;
window.openCrmDealNotesPage = openCrmDealNotesPage;
window.closeCrmDealNotesPage = closeCrmDealNotesPage;
window.openCrmDealNotesModal = openCrmDealNotesPage;
window.closeCrmDealNotesModal = closeCrmDealNotesPage;
window.addCrmDealNote = addCrmDealNote;
window.deleteCrmDealNote = deleteCrmDealNote;
window.deleteCrmDealActivityNoteModal = deleteCrmDealActivityNoteModal;
window.openCrmDealActivityNote = openCrmDealActivityNoteModal;
window.openCrmDealActivityNoteModal = openCrmDealActivityNoteModal;
window.closeCrmDealActivityNoteModal = closeCrmDealActivityNoteModal;
window.saveCrmDealActivityNoteModal = saveCrmDealActivityNoteModal;
window.filterCrmDealNotesPage = filterCrmDealNotesPage;
window.filterCrmDealDocumentsPage = filterCrmDealDocumentsPage;
window.filterCrmDealFicheSearch = filterCrmDealFicheSearch;
window.openCrmDealSearchResult = openCrmDealSearchResult;
window.startEditCrmDealNote = startEditCrmDealNote;
window.cancelEditCrmDealNote = cancelEditCrmDealNote;
window.saveCrmDealNoteEdit = saveCrmDealNoteEdit;
window.deleteCrmDealFollowUp = deleteCrmDealFollowUp;
window.expandCrmDealActivitiesTimeline = expandCrmDealActivitiesTimeline;
window.expandCrmDealSection = expandCrmDealSection;
window.openCrmDealHistoryModal = openCrmDealHistoryModal;
window.closeCrmDealHistoryModal = closeCrmDealHistoryModal;
window.saveCrmDealHistoryModal = saveCrmDealHistoryModal;
window.openCrmDealDocumentModal = openCrmDealDocumentModal;
window.closeCrmDealDocumentModal = closeCrmDealDocumentModal;
window.openCrmDealNoteModal = openCrmDealNoteModal;
window.closeCrmDealNoteModal = closeCrmDealNoteModal;
window.saveCrmDealNoteModal = saveCrmDealNoteModal;
window.openCrmProspectContactModal = openCrmProspectContactModal;
window.closeCrmProspectContactModal = closeCrmProspectContactModal;
window.saveCrmProspectContactModal = saveCrmProspectContactModal;
window.openCrmProspectNotesModal = openCrmProspectNotesModal;
window.closeCrmProspectNotesModal = closeCrmProspectNotesModal;
window.addCrmProspectNote = addCrmProspectNote;
window.deleteCrmProspectNote = deleteCrmProspectNote;
window.confirmDeleteCrmStructure = confirmDeleteCrmStructure;
window.openCrmProspectModalForStructure = openCrmProspectModalForStructure;
window.openCrmDealModalForStructure = openCrmDealModalForStructure;
window.collectCrmProspectStandaloneFormData = collectCrmProspectStandaloneFormData;
window.upsertCrmStructure = upsertCrmStructure;

function getCrmAccessibleDeals() {
    if (!crmData.deals) return [];
    return crmData.deals.filter(function(d) {
        ensureDealShape(d);
        var ids = getCrmDealProspectIds(d);
        if (!ids.length) {
            var list = crmData.lists.find(function(l) { return l.id === d.listId; });
            return list && hasCrmListAccess(list);
        }
        return ids.some(function(pid) {
            var f = findCrmProspect(pid);
            return f && hasCrmListAccess(f.list);
        });
    });
}

function ensureProspectShape(prospect) {
    if (!prospect.activities) prospect.activities = [];
    if (prospect.responsibleUserId === undefined) prospect.responsibleUserId = null;
    if (prospect.followUpDate === undefined) prospect.followUpDate = null;
    if (prospect.followUpNote === undefined) prospect.followUpNote = '';
    if (prospect.followUpAssigneeUserId === undefined) prospect.followUpAssigneeUserId = null;
    if (!Array.isArray(prospect.listIds)) prospect.listIds = [];
    if (prospect.structureId === undefined) prospect.structureId = null;
    if (prospect.organisme === undefined) prospect.organisme = '';
    if (prospect.typeStructure === undefined) prospect.typeStructure = '';
    if (prospect.siret === undefined) prospect.siret = '';
    if (prospect.web === undefined) prospect.web = '';
    if (prospect.adresse === undefined) prospect.adresse = '';
    if (prospect.cp === undefined) prospect.cp = '';
    if (prospect.ville === undefined) prospect.ville = '';
    if (prospect.region === undefined) prospect.region = '';
    if (prospect.telFixe === undefined) prospect.telFixe = prospect.tel || '';
    if (prospect.telMobile === undefined) prospect.telMobile = '';
    if (!Array.isArray(prospect.internalNotes)) prospect.internalNotes = [];
    if (prospect.notes && String(prospect.notes).trim() && !prospect.internalNotes.length) {
        prospect.internalNotes.push({
            id: crmNewId('pnote'),
            text: String(prospect.notes).trim(),
            authorId: null,
            authorName: 'Import',
            createdAt: prospect.createdAt || new Date().toISOString()
        });
    }
    syncProspectNotesLegacyField(prospect);
}

function syncProspectNotesLegacyField(prospect) {
    if (!prospect) return;
    prospect.notes = (prospect.internalNotes || []).map(function(n) { return (n.text || '').trim(); }).filter(Boolean).join('\n\n');
}

function getProspectNotesSearchText(prospect) {
    if (!prospect) return '';
    ensureProspectShape(prospect);
    return (prospect.internalNotes || []).map(function(n) { return n.text || ''; }).join(' ');
}

function ensureDealShape(deal) {
    if (!deal) return;
    if (!deal.activities) deal.activities = [];
    if (!deal.documents) deal.documents = [];
    if (!deal.tasks) deal.tasks = [];
    (deal.tasks || []).forEach(function(t) {
        if (t && typeof ensureTaskFicheShape === 'function') ensureTaskFicheShape(t);
    });
    if (deal.notes === undefined) deal.notes = '';
    if (!Array.isArray(deal.internalNotes)) deal.internalNotes = [];
    if (deal.notes && String(deal.notes).trim() && !deal.internalNotes.length) {
        deal.internalNotes.push({
            id: crmNewId('dnote'),
            text: String(deal.notes).trim(),
            authorId: null,
            authorName: 'Import',
            createdAt: deal.createdAt || new Date().toISOString()
        });
    }
    syncDealNotesLegacyField(deal);
    if (deal.followUpAssigneeUserId === undefined) deal.followUpAssigneeUserId = null;
    if (!Array.isArray(deal.prospectIds)) {
        deal.prospectIds = deal.prospectId ? [deal.prospectId] : [];
    }
    if (deal.prospectId && deal.prospectIds.indexOf(deal.prospectId) === -1) {
        deal.prospectIds.unshift(deal.prospectId);
    }
    syncCrmDealProspectFields(deal);
    if (deal.workProjectId === undefined) deal.workProjectId = null;
}

function syncDealNotesLegacyField(deal) {
    if (!deal) return;
    deal.notes = (deal.internalNotes || []).map(function(n) { return (n.text || '').trim(); }).filter(Boolean).join('\n\n');
}

function getCrmDealNoteById(deal, noteId) {
    if (!deal || !noteId) return null;
    ensureDealShape(deal);
    return (deal.internalNotes || []).find(function(n) { return n.id === noteId; }) || null;
}

function getCrmDealNoteByActivityId(deal, activityId) {
    if (!deal || !activityId) return null;
    ensureDealShape(deal);
    return (deal.internalNotes || []).find(function(n) { return n.activityId === activityId; }) || null;
}

function buildCrmDealHistoryNoteTitle(activity) {
    if (!activity) return 'Note historique';
    var meta = CRM_ACTIVITY_TYPES[activity.type] || CRM_ACTIVITY_TYPES.note;
    var snippet = (activity.text || '').trim().replace(/\s+/g, ' ');
    if (snippet.length > 60) snippet = snippet.slice(0, 60) + '…';
    return meta.label + (snippet ? ' — ' + snippet : '');
}

function isCrmDealHistoryNote(note) {
    return !!(note && note.activityId);
}

function getCrmDealNoteTitle(deal, note) {
    if (!note) return 'Sans titre';
    if (note.title && String(note.title).trim()) return String(note.title).trim();
    if (note.activityId) {
        var activity = (deal.activities || []).find(function(a) { return a.id === note.activityId; });
        return buildCrmDealHistoryNoteTitle(activity);
    }
    var firstLine = (note.text || '').trim().split('\n')[0];
    if (firstLine) {
        return firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
    }
    return 'Sans titre';
}

function getCrmDealNotePreviewText(note) {
    return (note.text || '').trim();
}

function renderCrmDealNoteActivityContext(deal, note) {
    if (!note || !note.activityId) return '';
    var activity = (deal.activities || []).find(function(a) { return a.id === note.activityId; });
    if (!activity) return '<p class="crm-deal-note-card-context">Élément d\'historique supprimé</p>';
    var meta = CRM_ACTIVITY_TYPES[activity.type] || CRM_ACTIVITY_TYPES.note;
    var summary = (activity.text || '').trim().replace(/\s+/g, ' ');
    if (summary.length > 100) summary = summary.slice(0, 100) + '…';
    return '<p class="crm-deal-note-card-context">' +
        '<span class="crm-deal-note-card-context-label">Historique</span> ' +
        escHtml(meta.icon + ' ' + meta.label) +
        (summary ? ' · <em>' + escHtml(summary) + '</em>' : '') +
        ' · ' + escHtml(crmFormatDateTime(activity.createdAt)) +
        '</p>';
}

function getCrmDealNotesByActivityId(deal, activityId) {
    if (!deal || !activityId) return [];
    ensureDealShape(deal);
    return (deal.internalNotes || []).filter(function(n) { return n.activityId === activityId; }).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function getDefaultCrmDealActivityNoteTitle(deal, activity) {
    var base = buildCrmDealHistoryNoteTitle(activity);
    var count = getCrmDealNotesByActivityId(deal, activity.id).length;
    if (!count) return base;
    return base + ' (' + (count + 1) + ')';
}

function syncCrmDealActivityNoteRefs(deal) {
    if (!deal) return;
    ensureDealShape(deal);
    (deal.activities || []).forEach(function(a) {
        if (!a || !a.noteId) return;
        var note = getCrmDealNoteById(deal, a.noteId);
        if (note && !note.activityId) note.activityId = a.id;
    });
}

function createCrmDealActivityNote(deal, activityId, title, text) {
    if (!deal || !activityId) return null;
    ensureDealShape(deal);
    var activity = (deal.activities || []).find(function(a) { return a.id === activityId; });
    if (!activity) return null;
    var authorName = currentUser ? ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim() : '—';
    var note = {
        id: crmNewId('dnote'),
        title: title || buildCrmDealHistoryNoteTitle(activity),
        text: text || '',
        activityId: activityId,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    };
    if (!activity.noteId) activity.noteId = note.id;
    deal.internalNotes.unshift(note);
    syncDealNotesLegacyField(deal);
    deal.updatedAt = new Date().toISOString();
    return note;
}

function renderCrmDealActivityNoteCreateBtn(activity) {
    return '<button type="button" class="crm-activity-note-create-btn crm-activity-note-create-btn--inline" onclick="openCrmDealActivityNoteModal(\'' + escHtml(activity.id) + '\')">+ Créer une note</button>';
}

function renderCrmDealActivityNotesRow(deal, activity) {
    var notes = getCrmDealNotesByActivityId(deal, activity.id);
    if (!notes.length) return '';
    var linksHtml = notes.map(function(n) {
        var title = getCrmDealNoteTitle(deal, n);
        return '<button type="button" class="crm-activity-note-link" onclick="openCrmDealActivityNoteModal(\'' + escHtml(activity.id) + '\', \'' + escHtml(n.id) + '\')" title="Ouvrir la note">' +
            '📝 ' + escHtml(title) + '</button>';
    }).join('');
    return '<div class="crm-activity-notes-row">' +
        '<div class="crm-activity-note-links">' + linksHtml + '</div>' +
        '</div>';
}

function renderCrmDealActivityNoteModalContext(deal, activity) {
    if (!activity) return '';
    var meta = CRM_ACTIVITY_TYPES[activity.type] || CRM_ACTIVITY_TYPES.note;
    var summary = (activity.text || '').trim().replace(/\s+/g, ' ');
    if (summary.length > 120) summary = summary.slice(0, 120) + '…';
    return meta.icon + ' ' + meta.label + (summary ? ' · ' + summary : '') + ' · ' + crmFormatDateTime(activity.createdAt);
}

function openCrmDealActivityNoteModal(activityId, noteId) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal || !activityId) return;
    ensureDealShape(deal);
    var activity = (deal.activities || []).find(function(a) { return a.id === activityId; });
    if (!activity) return;
    crmV2ActivityNoteModalActivityId = activityId;
    crmV2ActivityNoteModalNoteId = noteId || null;
    var note = noteId ? getCrmDealNoteById(deal, noteId) : null;
    var headingEl = document.getElementById('crmDealActivityNoteModalHeading');
    var contextEl = document.getElementById('crmDealActivityNoteModalContext');
    var titleEl = document.getElementById('crmDealActivityNoteModalTitleInput');
    var textEl = document.getElementById('crmDealActivityNoteModalText');
    if (headingEl) headingEl.textContent = note ? '📝 Note' : '📝 Nouvelle note';
    if (contextEl) contextEl.textContent = 'Liée à : ' + renderCrmDealActivityNoteModalContext(deal, activity);
    if (titleEl) {
        titleEl.value = note
            ? (note.title && String(note.title).trim() ? note.title : getCrmDealNoteTitle(deal, note))
            : getDefaultCrmDealActivityNoteTitle(deal, activity);
    }
    if (textEl) textEl.value = note ? (note.text || '') : '';
    var canEdit = !note || crmCanEditCrmEntry(note);
    var deleteBtn = document.getElementById('crmDealActivityNoteModalDeleteBtn');
    var saveBtn = document.querySelector('#crmDealActivityNoteModal button[onclick="saveCrmDealActivityNoteModal()"]');
    if (titleEl) titleEl.readOnly = !canEdit;
    if (textEl) textEl.readOnly = !canEdit;
    if (deleteBtn) deleteBtn.style.display = (note && canEdit) ? '' : 'none';
    if (saveBtn) saveBtn.style.display = canEdit ? '' : 'none';
    if (headingEl && note && !canEdit) headingEl.textContent = '📝 Note (lecture seule)';
    document.getElementById('crmDealActivityNoteModal').classList.add('active');
    if (typeof initAppMentionField === 'function' && textEl) initAppMentionField(textEl);
    setTimeout(function() {
        if (textEl) {
            textEl.focus();
            textEl.setSelectionRange(textEl.value.length, textEl.value.length);
        }
    }, 80);
}

function closeCrmDealActivityNoteModal() {
    crmV2ActivityNoteModalActivityId = null;
    crmV2ActivityNoteModalNoteId = null;
    var modal = document.getElementById('crmDealActivityNoteModal');
    if (modal) modal.classList.remove('active');
    var titleEl = document.getElementById('crmDealActivityNoteModalTitleInput');
    var textEl = document.getElementById('crmDealActivityNoteModalText');
    if (titleEl) {
        titleEl.value = '';
        titleEl.readOnly = false;
    }
    if (textEl) {
        textEl.value = '';
        textEl.readOnly = false;
    }
    var deleteBtn = document.getElementById('crmDealActivityNoteModalDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    var saveBtn = document.querySelector('#crmDealActivityNoteModal button[onclick="saveCrmDealActivityNoteModal()"]');
    if (saveBtn) saveBtn.style.display = '';
}

function deleteCrmDealActivityNoteModal() {
    if (!crmV2ActivityNoteModalNoteId) return;
    deleteCrmDealNote(crmV2ActivityNoteModalNoteId, { fromActivityModal: true });
}

function saveCrmDealActivityNoteModal() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal || !crmV2ActivityNoteModalActivityId) return;
    var titleEl = document.getElementById('crmDealActivityNoteModalTitleInput');
    var textEl = document.getElementById('crmDealActivityNoteModalText');
    var title = titleEl ? titleEl.value.trim() : '';
    var text = textEl ? textEl.value.trim() : '';
    if (!title) {
        alert('Saisissez un titre.');
        return;
    }
    var activity = (deal.activities || []).find(function(a) { return a.id === crmV2ActivityNoteModalActivityId; });
    if (!activity) return;
    var note = crmV2ActivityNoteModalNoteId ? getCrmDealNoteById(deal, crmV2ActivityNoteModalNoteId) : null;
    if (note && !crmCanEditCrmEntry(note)) {
        if (typeof showToast === 'function') showToast('Seul l\'auteur peut modifier cette note.', 'error');
        return;
    }
    if (note) {
        note.title = title;
        note.text = text;
    } else {
        note = createCrmDealActivityNote(deal, activity.id, title, text);
    }
    if (!note) return;
    syncDealNotesLegacyField(deal);
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    closeCrmDealActivityNoteModal();
    renderCrmDealActivitiesTimeline(deal);
    renderCrmDealNotesFiche(deal);
    var notesPage = document.getElementById('crmDealNotesPage');
    if (notesPage && notesPage.classList.contains('active') && typeof renderCrmDealNotesPage === 'function') {
        renderCrmDealNotesPage();
    }
    if (typeof showToast === 'function') showToast('Note enregistrée', 'success');
}

function updateCrmDealNotesPageSubtitle(deal) {
    var subEl = document.getElementById('crmDealNotesPageSubtitle');
    if (!subEl || !deal) return;
    ensureDealShape(deal);
    var notes = deal.internalNotes || [];
    var generalCount = notes.filter(function(n) { return !isCrmDealHistoryNote(n); }).length;
    var historyCount = notes.filter(function(n) { return isCrmDealHistoryNote(n); }).length;
    subEl.textContent = (deal.title || 'Sans titre') +
        ' · ' + generalCount + ' note' + (generalCount !== 1 ? 's' : '') + ' libre' + (generalCount !== 1 ? 's' : '') +
        ' · ' + historyCount + ' historique' + (historyCount !== 1 ? 's' : '');
}

function renderCrmDealNoteCard(deal, note) {
    if (crmV2EditingDealNoteId === note.id) return renderCrmDealNoteEditForm(deal, note);
    var isHistory = isCrmDealHistoryNote(note);
    var highlightCls = crmV2FocusDealNoteId === note.id ? ' crm-deal-note-card--highlight' : '';
    var historyCls = isHistory ? ' crm-deal-note-card--history' : '';
    var title = getCrmDealNoteTitle(deal, note);
    var body = getCrmDealNotePreviewText(note);
    var bodyHtml = body
        ? (typeof formatMsgText === 'function' ? formatMsgText(body) : escHtml(body).replace(/\n/g, '<br>'))
        : '<span class="crm-prospect-notes-empty">Aucun contenu — cliquez sur ✏️ pour rédiger.</span>';
    var canEdit = isHistory ? crmCanEditCrmEntry(note) : true;
    var actionsHtml = canEdit
        ? '<div class="crm-deal-note-card-actions">' +
            '<button type="button" class="crm-deal-note-card-action" onclick="startEditCrmDealNote(\'' + escHtml(note.id) + '\')" title="Modifier">✏️</button>' +
            '<button type="button" class="crm-deal-note-card-action crm-deal-note-card-action--danger" onclick="deleteCrmDealNote(\'' + escHtml(note.id) + '\')" title="Supprimer">🗑️</button>' +
            '</div>'
        : '';
    return '<article class="crm-deal-note-card' + highlightCls + historyCls + '" data-deal-note-id="' + escHtml(note.id) + '" data-deal-note-section="' + (isHistory ? 'history' : 'general') + '">' +
        '<header class="crm-deal-note-card-head">' +
        '<h4 class="crm-deal-note-card-title">' + escHtml(title) + '</h4>' +
        actionsHtml +
        '</header>' +
        '<div class="crm-deal-note-card-meta">' + escHtml(note.authorName || '—') + ' · ' + escHtml(crmFormatDateTime(note.createdAt)) + '</div>' +
        (isHistory ? renderCrmDealNoteActivityContext(deal, note) : '') +
        '<div class="crm-deal-note-card-body">' +
        bodyHtml +
        '</div></article>';
}

function renderCrmDealNotesSectionList(container, notes, deal, emptyMessage) {
    if (!container) return;
    if (!notes.length) {
        container.innerHTML = '<div class="crm-deal-notes-empty">' + emptyMessage + '</div>';
        return;
    }
    container.innerHTML = notes.map(function(n) { return renderCrmDealNoteCard(deal, n); }).join('');
}

function getCrmDealProspectIds(deal) {
    if (!deal) return [];
    ensureDealShape(deal);
    return (deal.prospectIds || []).slice();
}

function crmDealHasProspect(deal, prospectId) {
    return getCrmDealProspectIds(deal).indexOf(prospectId) !== -1;
}

function syncCrmDealProspectFields(deal) {
    if (!deal) return;
    var ids = deal.prospectIds || [];
    deal.prospectId = ids[0] || null;
    if (deal.prospectId) {
        var found = findCrmProspect(deal.prospectId);
        if (found) deal.listId = found.list.id;
    }
    var listIds = [];
    ids.forEach(function(pid) {
        var f = findCrmProspect(pid);
        if (!f) return;
        getCrmProspectListIds(f.prospect).forEach(function(lid) {
            if (listIds.indexOf(lid) === -1) listIds.push(lid);
        });
        if (!getCrmProspectListIds(f.prospect).length && f.list && listIds.indexOf(f.list.id) === -1) {
            listIds.push(f.list.id);
        }
    });
    deal.listIds = listIds;
}

function getCrmDealProspectsLabel(deal) {
    var ids = getCrmDealProspectIds(deal);
    if (!ids.length) return '—';
    var names = ids.map(function(id) {
        var f = findCrmProspect(id);
        return f ? getCrmProspectDisplayName(f.prospect) : null;
    }).filter(Boolean);
    if (!names.length) return '—';
    if (names.length <= 2) return names.join(', ');
    return names[0] + ' +' + (names.length - 1);
}

function updateCrmDealFicheHeader(deal) {
    renderCrmDealHero(deal);
}

function renderCrmDealHero(deal) {
    if (!deal) return;
    ensureDealShape(deal);
    var titleEl = document.getElementById('crmDealHeroTitle');
    var subtitleEl = document.getElementById('crmDealHeroSubtitle');
    var metaEl = document.getElementById('crmDealHeroMeta');
    if (titleEl) {
        titleEl.innerHTML = crmProspectHeroMetaItem('deal', '📁',
            '<span class="crm-prospect-hero-title-text">' + escHtml(deal.title || 'Sans titre') + '</span>');
    }
    if (subtitleEl) {
        var roleItems = [];
        if ((deal.stage || '').trim()) {
            roleItems.push(crmProspectHeroMetaItem('stage', '📍', escHtml(deal.stage)));
        }
        var line = getCrmActivityLineById(deal.activityLineId);
        if (line) {
            roleItems.push(crmProspectHeroMetaItem('line', '🏷️', escHtml(crmActivityLineLabel(line))));
        }
        if (roleItems.length) {
            subtitleEl.innerHTML = roleItems.join('');
            subtitleEl.style.display = '';
        } else {
            subtitleEl.innerHTML = '';
            subtitleEl.style.display = 'none';
        }
    }
    if (metaEl) {
        var metaItems = [];
        var statusLabel = deal.status === 'won' ? 'Gagné' : (deal.status === 'lost' ? 'Perdu' : 'En cours');
        var statusCls = deal.status === 'won' ? 'crm-deal-status-badge--won' : (deal.status === 'lost' ? 'crm-deal-status-badge--lost' : 'crm-deal-status-badge--open');
        metaItems.push(crmProspectHeroMetaItem('status', '🎯', '<span class="crm-deal-status-badge ' + statusCls + '">' + escHtml(statusLabel) + '</span>'));
        getCrmDealProspectIds(deal).forEach(function(pid) {
            var f = findCrmProspect(pid);
            if (!f) return;
            var name = getCrmProspectDisplayName(f.prospect) || f.prospect.organisme || 'Prospect';
            metaItems.push(crmProspectHeroMetaItem('prospect', '👤',
                '<a href="#" onclick="event.preventDefault();openCrmDealProspectFiche(\'' + escHtml(pid) + '\')">' + escHtml(name) + '</a>'));
        });
        var wp = getWorkProjectForCrmDeal(deal.id);
        if (wp) {
            var wpLabel = (wp.name || wp.title || 'Espace projet').trim();
            metaItems.push(crmProspectHeroMetaItem('project', '🗂️',
                '<a href="#" onclick="event.preventDefault();openCrmDealWorkProject()">' + escHtml(wpLabel) + '</a>'));
        }
        if (deal.amount) {
            metaItems.push(crmProspectHeroMetaItem('amount', '💰', escHtml(crmFormatMoney(deal.amount))));
        }
        var dateStr = deal.updatedAt ? crmFormatDate(deal.updatedAt) : (deal.createdAt ? crmFormatDate(deal.createdAt) : '');
        if (dateStr) {
            metaItems.push(crmProspectHeroMetaItem('date', '📅', 'Mis à jour le ' + escHtml(dateStr)));
        }
        metaEl.innerHTML = metaItems.join('');
        metaEl.style.display = metaItems.length ? '' : 'none';
    }
}

function editCrmDealHero() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    populateCrmDealFicheDealForm(deal);
    renderCrmDealFicheProspects(deal);
    document.getElementById('crmDealEditModal').classList.add('active');
    setTimeout(function() {
        var el = document.getElementById('crmDealFicheTitleInput');
        if (el) { el.focus(); el.select(); }
    }, 80);
}

function closeCrmDealEditModal() {
    document.getElementById('crmDealEditModal').classList.remove('active');
}

function saveCrmDealEditModal(e) {
    if (e) e.preventDefault();
    saveCrmDealFicheInfo();
    closeCrmDealEditModal();
}

function getCrmDealById(dealId) {
    if (dealId == null) return null;
    return (crmData.deals || []).find(function(d) { return String(d.id) === String(dealId); }) || null;
}

function getWorkProjectForCrmDeal(dealId) {
    if (typeof workProjectsData === 'undefined' || !workProjectsData.projects) return null;
    var deal = getCrmDealById(dealId);
    if (deal && deal.workProjectId && typeof getWorkProjectById === 'function') {
        var byId = getWorkProjectById(deal.workProjectId);
        if (byId) return byId;
    }
    return workProjectsData.projects.find(function(p) {
        return p.crm && (p.crm.dealIds || []).some(function(id) { return String(id) === String(dealId); });
    }) || null;
}

// --- Migration données ---
function migrateCrmData() {
    if (!crmData) return;
    if (!Array.isArray(crmData.deals)) crmData.deals = [];
    (crmData.deals || []).forEach(ensureDealShape);
    if (typeof ensureCrmPipelineStages === 'function') ensureCrmPipelineStages();
    normalizeCrmProspectMembership();
    migrateProspectsToStructures();
    (crmData.lists || []).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            ensureProspectShape(p);
            if (p.notes && String(p.notes).trim()) {
                var hasLegacy = p.activities.some(function(a) { return a.legacyNotes; });
                if (!hasLegacy) {
                    p.activities.unshift({
                        id: crmNewId('act'),
                        type: 'note',
                        text: String(p.notes).trim(),
                        authorId: null,
                        authorName: 'Import',
                        createdAt: p.createdAt || new Date().toISOString(),
                        legacyNotes: true
                    });
                }
            }
        });
    });
}

// ========== PRIORITÉ 1 — Fiche prospect ==========

function openCrmProspectFiche(prospectId) {
    var found = findCrmProspect(prospectId);
    if (!found) { alert('Prospect introuvable.'); return; }
    crmV2ProspectId = prospectId;
    crmCurrentListId = found.list.id;
    if (document.getElementById('crmProspectsBrowsePage').classList.contains('active')) {
        crmV2ProspectReturnTo = 'prospects_browse';
    } else if (document.getElementById('crmRelancesBrowsePage').classList.contains('active')) {
        crmV2ProspectReturnTo = 'relances_browse';
    } else if (document.getElementById('crmProspectsHubPage').classList.contains('active')) {
        crmV2ProspectReturnTo = 'prospects_hub';
    } else if (document.getElementById('crmPage').classList.contains('active')) {
        crmV2ProspectReturnTo = 'home';
    } else if (document.getElementById('crmDealPage').classList.contains('active')) {
        crmV2ProspectReturnTo = 'deal';
    } else if (document.getElementById('crmStructurePage').classList.contains('active')) {
        crmV2ProspectReturnTo = 'structure';
    } else {
        crmV2ProspectReturnTo = 'list';
    }
    crmHideBrowsePages();
    document.getElementById('crmListPage').classList.remove('active');
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmDealPage').classList.remove('active');
    document.getElementById('crmStructurePage').classList.remove('active');
    document.getElementById('crmProspectPage').classList.add('active');
    renderCrmProspectFiche();
}

function closeCrmProspectFiche() {
    document.getElementById('crmProspectPage').classList.remove('active');
    crmV2ProspectId = null;
    if (crmV2ProspectReturnTo === 'prospects_browse') {
        openCrmProspectsBrowsePage();
    } else if (crmV2ProspectReturnTo === 'relances_browse') {
        openCrmRelancesBrowsePage();
    } else if (crmV2ProspectReturnTo === 'prospects_hub') {
        openCrmProspectsHub();
    } else if (crmV2ProspectReturnTo === 'home') {
        document.getElementById('crmPage').classList.add('active');
        if (typeof renderCrmLists === 'function') renderCrmLists();
        if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
    } else if (crmV2ProspectReturnTo === 'structure' && crmV2StructureId) {
        document.getElementById('crmStructurePage').classList.add('active');
        renderCrmStructureFiche();
    } else if (crmV2ProspectReturnTo === 'deal' && crmV2DealId) {
        document.getElementById('crmDealPage').classList.add('active');
        renderCrmDealFiche();
    } else {
        document.getElementById('crmListPage').classList.add('active');
        renderCrmProspects();
    }
}

function renderCrmProspectFiche() {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    var p = found.prospect;
    var list = found.list;
    ensureProspectShape(p);

    renderCrmProspectHero(p);

    var backBtn = document.getElementById('crmFicheBackBtn');
    if (backBtn) {
        if (crmV2ProspectReturnTo === 'prospects_browse') backBtn.textContent = '← Retour aux prospects';
        else if (crmV2ProspectReturnTo === 'relances_browse') backBtn.textContent = '← Retour aux relances';
        else if (crmV2ProspectReturnTo === 'prospects_hub') backBtn.textContent = '← Retour';
        else if (crmV2ProspectReturnTo === 'home') backBtn.textContent = '← Retour CRM';
        else if (crmV2ProspectReturnTo === 'deal') backBtn.textContent = '← Retour au dossier';
        else backBtn.textContent = '← Retour à la liste';
    }

    populateCrmProspectFicheForm(found);

    renderCrmProspectDeals(p, list);
    renderCrmProspectFollowUpPending(p);
    renderCrmProspectFollowUpHistory(p);
    renderCrmActivitiesTimeline(p);
    updateCrmProspectShortcutCards(p);
}

function updateCrmProspectShortcutCards(prospect) {
    ensureProspectShape(prospect);
    var notesPreview = document.getElementById('crmFicheNotesPreview');
    if (notesPreview) {
        var notes = prospect.internalNotes || [];
        if (!notes.length) {
            notesPreview.textContent = 'Aucune note';
        } else if (notes.length === 1) {
            var one = (notes[0].text || '').trim().replace(/\s+/g, ' ');
            notesPreview.textContent = one ? (one.slice(0, 120) + (one.length > 120 ? '…' : '')) : '1 note';
        } else {
            var latest = notes.slice().sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
            var preview = latest && latest.text ? latest.text.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
            notesPreview.textContent = notes.length + ' notes' + (preview ? ' · ' + preview + (latest.text.length > 80 ? '…' : '') : '');
        }
    }
}

function openCrmProspectNotesModal() {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    renderCrmProspectNotesList(found.prospect);
    document.getElementById('crmProspectNotesModal').classList.add('active');
    if (typeof initAppMentionField === 'function') {
        initAppMentionField(document.getElementById('crmProspectNewNoteText'));
    }
    setTimeout(function() {
        var el = document.getElementById('crmProspectNewNoteText');
        if (el) el.focus();
    }, 80);
}

function closeCrmProspectNotesModal() {
    document.getElementById('crmProspectNotesModal').classList.remove('active');
    var textEl = document.getElementById('crmProspectNewNoteText');
    if (textEl) textEl.value = '';
    var found = findCrmProspect(crmV2ProspectId);
    if (found) updateCrmProspectShortcutCards(found.prospect);
}

function renderCrmProspectNotesList(prospect) {
    var container = document.getElementById('crmProspectNotesList');
    if (!container || !prospect) return;
    ensureProspectShape(prospect);
    var notes = (prospect.internalNotes || []).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (!notes.length) {
        container.innerHTML = '<div class="crm-prospect-notes-empty">Aucune note pour l\'instant.</div>';
        return;
    }
    container.innerHTML = notes.map(function(n) {
        return '<div class="crm-prospect-note-item">' +
            '<div class="crm-prospect-note-body">' +
            '<div class="crm-prospect-note-meta">' + escHtml(n.authorName || '—') + ' · ' + escHtml(crmFormatDateTime(n.createdAt)) + '</div>' +
            '<div class="crm-prospect-note-text">' + (typeof formatMsgText === 'function' ? formatMsgText(n.text || '') : escHtml(n.text || '').replace(/\n/g, '<br>')) + '</div>' +
            '</div>' +
            '<button type="button" class="crm-prospect-note-delete" onclick="deleteCrmProspectNote(\'' + escHtml(n.id) + '\')" title="Supprimer">🗑️</button>' +
            '</div>';
    }).join('');
}

function addCrmProspectNote() {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    var textEl = document.getElementById('crmProspectNewNoteText');
    var text = textEl ? textEl.value.trim() : '';
    if (!text) {
        alert('Saisissez une note.');
        return;
    }
    ensureProspectShape(found.prospect);
    var authorName = currentUser ? ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim() : '—';
    found.prospect.internalNotes.unshift({
        id: crmNewId('pnote'),
        text: text,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    });
    syncProspectNotesLegacyField(found.prospect);
    saveCrmData();
    if (textEl) textEl.value = '';
    renderCrmProspectNotesList(found.prospect);
    updateCrmProspectShortcutCards(found.prospect);
    if (typeof showToast === 'function') showToast('Note ajoutée', 'success');
}

function deleteCrmProspectNote(noteId) {
    if (!confirm('Supprimer cette note ?')) return;
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    ensureProspectShape(found.prospect);
    var idx = (found.prospect.internalNotes || []).findIndex(function(n) { return n.id === noteId; });
    if (idx === -1) return;
    found.prospect.internalNotes.splice(idx, 1);
    syncProspectNotesLegacyField(found.prospect);
    saveCrmData();
    renderCrmProspectNotesList(found.prospect);
    updateCrmProspectShortcutCards(found.prospect);
    if (typeof showToast === 'function') showToast('Note supprimée', 'success');
}

function populateCrmProspectFicheForm(found) {
    var p = found.prospect;

    document.getElementById('crmFicheFollowUpDate').value = '';
    document.getElementById('crmFicheFollowUpNote').value = '';
    populateCrmUserSelect(document.getElementById('crmFicheFollowUpAssignee'), currentUser ? currentUser.id : '', true);
    renderCrmProspectFollowUpPending(p);
    renderCrmProspectFollowUpHistory(p);
}

function saveCrmProspectFiche() {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    if (typeof collectCrmProspectFormData !== 'function') return;
    var d = collectCrmProspectFormData('fiche', 'page');
    if (!validateCrmProspectPageData(d)) return;

    Object.assign(found.prospect, d);
    saveCrmData();

    if (typeof renderCrmProspects === 'function') renderCrmProspects();
    if (typeof renderCrmHomeProspects === 'function') renderCrmHomeProspects();
    if (typeof renderCrmLists === 'function') renderCrmLists();
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
    if (typeof showToast === 'function') showToast('Prospect enregistré', 'success');
    updateCrmProspectShortcutCards(found.prospect);
}

function deleteCrmProspectFromFiche() {
    if (!crmV2ProspectId) return;
    var id = crmV2ProspectId;
    if (typeof deleteCrmProspect === 'function') deleteCrmProspect(id);
    if (!findCrmProspect(id)) closeCrmProspectFiche();
}

function renderCrmProspectFollowUpPending(prospect) {
    var container = document.getElementById('crmFicheFollowUpPending');
    if (!container || !prospect) return;
    if (!prospect.followUpDate) {
        container.innerHTML = '';
        return;
    }
    var overdue = false;
    var d = crmParseFollowUpDate(prospect.followUpDate);
    if (d) overdue = d < new Date(new Date().toDateString());
    var assignee = getCrmFollowUpAssigneeUserId(prospect, true);
    var assigneeLabel = assignee ? getCrmUserDisplayName(assignee) : '—';
    var note = (prospect.followUpNote || '').trim();
    container.innerHTML =
        '<div class="crm-followup-pending-row' + (overdue ? ' crm-followup-pending-row--overdue' : '') + '">' +
        '<div class="crm-followup-pending-main">' +
        '<strong>À faire</strong> · ' + escHtml(crmFormatDate(prospect.followUpDate)) +
        (note ? ' · ' + escHtml(note) : '') +
        ' · 👤 ' + escHtml(assigneeLabel) +
        (overdue ? ' ⚠️' : '') +
        '</div>' +
        '<div class="crm-followup-pending-actions">' +
        '<button type="button" class="btn btn-secondary" onclick="validateCrmFollowUp(\'prospect\', \'' + escHtml(prospect.id) + '\')">Valider</button>' +
        '</div></div>';
}

function renderCrmProspectFollowUpHistory(prospect) {
    var container = document.getElementById('crmFicheFollowUpHistory');
    if (!container || !prospect) return;
    var items = (prospect.activities || []).filter(function(a) { return a.type === 'followup'; }).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (!items.length) {
        container.innerHTML = '<div class="crm-followup-history-empty">Aucune relance validée.</div>';
        return;
    }
    container.innerHTML = items.map(function(a) {
        var planned = a.plannedDate ? crmFormatDate(a.plannedDate) : '';
        var note = (a.followUpNote || '').trim();
        if (!note && a.text) {
            var parts = String(a.text).split(' — ');
            if (parts.length > 1) note = parts.slice(1).join(' — ');
            else if (parts[0].indexOf('Relance effectuée') === -1) note = parts[0];
        }
        var assigneeLabel = a.assigneeUserId ? getCrmUserDisplayName(a.assigneeUserId) : '—';
        return '<div class="crm-followup-history-row">' +
            '<span class="crm-followup-history-date">' + escHtml(planned || '—') + '</span>' +
            '<span class="crm-followup-history-note">' + escHtml(note || 'Relance') + '</span>' +
            '<span class="crm-followup-history-meta">👤 ' + escHtml(assigneeLabel) + ' · Validée le ' + escHtml(crmFormatDate(a.createdAt)) + '</span>' +
            '<button type="button" class="crm-followup-history-delete" onclick="deleteCrmProspectFollowUp(\'' + escHtml(a.id) + '\')" title="Supprimer">🗑️</button>' +
            '</div>';
    }).join('');
}

function renderCrmActivitiesTimeline(prospect) {
    var container = document.getElementById('crmFicheActivities');
    if (!container) return;
    var acts = (prospect.activities || []).filter(function(a) { return a.type !== 'followup'; }).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (!acts.length) {
        container.innerHTML = '<div class="crm-fiche-empty">Aucun échange enregistré.</div>';
        return;
    }
    container.innerHTML = acts.map(function(a) {
        if (crmV2EditingActivityId === a.id) {
            return renderCrmActivityEditForm(a);
        }
        var meta = CRM_ACTIVITY_TYPES[a.type] || CRM_ACTIVITY_TYPES.note;
        var canEdit = crmCanEditCrmEntry(a);
        var actionsHtml = canEdit
            ? '<div class="crm-activity-actions">' +
                '<button type="button" class="crm-activity-action" onclick="startEditCrmActivity(\'' + escHtml(a.id) + '\')" title="Modifier">✏️</button>' +
                '<button type="button" class="crm-activity-action crm-activity-action--danger" onclick="deleteCrmActivity(\'' + escHtml(a.id) + '\')" title="Supprimer">🗑️</button>' +
                '</div>'
            : '';
        return '<div class="crm-activity-item" data-activity-id="' + escHtml(a.id) + '">' +
            '<div class="crm-activity-icon">' + meta.icon + '</div>' +
            '<div class="crm-activity-body">' +
            '<div class="crm-activity-meta-row">' +
            '<div class="crm-activity-meta"><strong>' + escHtml(meta.label) + '</strong> · ' + escHtml(a.authorName || '—') + ' · ' + crmFormatDateTime(a.createdAt) + '</div>' +
            actionsHtml +
            '</div>' +
            '<div class="crm-activity-text">' + (typeof formatMsgText === 'function' ? formatMsgText(a.text || '') : escHtml(a.text || '').replace(/\n/g, '<br>')) + '</div>' +
            '</div></div>';
    }).join('');
}

function renderCrmActivityEditForm(activity) {
    var typeOptions = Object.keys(CRM_ACTIVITY_TYPES).map(function(key) {
        var t = CRM_ACTIVITY_TYPES[key];
        var sel = activity.type === key ? ' selected' : '';
        return '<option value="' + key + '"' + sel + '>' + t.icon + ' ' + escHtml(t.label) + '</option>';
    }).join('');
    return '<div class="crm-activity-item crm-activity-item--edit" data-activity-id="' + escHtml(activity.id) + '">' +
        '<div class="crm-activity-body" style="width:100%;">' +
        '<div class="crm-activity-meta" style="margin-bottom:0.5rem;">Modification · ' + escHtml(activity.authorName || '—') + ' · ' + crmFormatDateTime(activity.createdAt) + '</div>' +
        '<select id="crmEditActivityType" class="crm-fiche-select" style="margin-bottom:0.5rem;">' + typeOptions + '</select>' +
        '<textarea id="crmEditActivityText" class="crm-fiche-textarea" rows="3" style="margin:0 0 0.65rem;">' + escHtml(activity.text || '') + '</textarea>' +
        '<div class="crm-activity-edit-actions">' +
        '<button type="button" class="btn btn-secondary" onclick="cancelEditCrmActivity()">Annuler</button>' +
        '<button type="button" class="btn" onclick="saveCrmActivityEdit(\'' + escHtml(activity.id) + '\')">Enregistrer</button>' +
        '</div></div></div>';
}

function findCrmActivity(prospect, activityId) {
    if (!prospect || !activityId) return null;
    return (prospect.activities || []).find(function(a) { return a.id === activityId; }) || null;
}

function startEditCrmActivity(activityId) {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    var activity = findCrmActivity(found.prospect, activityId);
    if (!activity || !crmCanEditCrmEntry(activity)) return;
    crmV2EditingActivityId = activityId;
    renderCrmActivitiesTimeline(found.prospect);
}

function cancelEditCrmActivity() {
    crmV2EditingActivityId = null;
    var found = findCrmProspect(crmV2ProspectId);
    if (found) renderCrmActivitiesTimeline(found.prospect);
}

function saveCrmActivityEdit(activityId) {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    var activity = findCrmActivity(found.prospect, activityId);
    if (!activity || !crmCanEditCrmEntry(activity)) return;
    var text = document.getElementById('crmEditActivityText').value.trim();
    if (!text) { alert('Le contenu ne peut pas être vide.'); return; }
    activity.type = document.getElementById('crmEditActivityType').value || 'note';
    activity.text = text;
    activity.updatedAt = new Date().toISOString();
    crmV2EditingActivityId = null;
    saveCrmData();
    renderCrmActivitiesTimeline(found.prospect);
    refreshCrmStructureHistoryIfVisible();
    if (typeof showToast === 'function') showToast('Activité modifiée', 'success');
}

function deleteCrmProspectFollowUp(activityId) {
    if (!confirm('Supprimer cette relance ?')) return;
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    ensureProspectShape(found.prospect);
    var idx = (found.prospect.activities || []).findIndex(function(a) { return a.id === activityId && a.type === 'followup'; });
    if (idx === -1) return;
    found.prospect.activities.splice(idx, 1);
    saveCrmData();
    renderCrmProspectFollowUpHistory(found.prospect);
    if (typeof showToast === 'function') showToast('Relance supprimée', 'success');
}

function deleteCrmActivity(activityId) {
    if (!confirm('Supprimer cette activité ?')) return;
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    ensureProspectShape(found.prospect);
    var activity = findCrmActivity(found.prospect, activityId);
    if (!activity || !crmCanEditCrmEntry(activity)) return;
    var idx = (found.prospect.activities || []).findIndex(function(a) { return a.id === activityId; });
    if (idx === -1) return;
    found.prospect.activities.splice(idx, 1);
    if (crmV2EditingActivityId === activityId) crmV2EditingActivityId = null;
    saveCrmData();
    renderCrmActivitiesTimeline(found.prospect);
    refreshCrmStructureHistoryIfVisible();
    if (typeof showToast === 'function') showToast('Activité supprimée', 'success');
}

function addCrmActivityFromFiche() {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    var type = document.getElementById('crmFicheActivityType').value || 'note';
    var text = document.getElementById('crmFicheActivityText').value.trim();
    if (!text) { alert('Saisissez un contenu.'); return; }
    createCrmProspectActivity(found.prospect, type, text);
    document.getElementById('crmFicheActivityText').value = '';
    saveCrmData();
    renderCrmActivitiesTimeline(found.prospect);
    refreshCrmStructureHistoryIfVisible();
}

function createCrmProspectActivity(prospect, type, text) {
    if (!prospect || !text) return false;
    ensureProspectShape(prospect);
    var authorName = currentUser ? ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim() : '—';
    prospect.activities.unshift({
        id: crmNewId('act'),
        type: type || 'note',
        text: text,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    });
    return true;
}

function openCrmBulkHistoryModal() {
    var ids = typeof getCrmSelectedProspectIds === 'function' ? getCrmSelectedProspectIds() : [];
    if (!ids.length) { alert('Sélectionnez au moins un prospect.'); return; }
    var countEl = document.getElementById('crmBulkHistoryCount');
    if (countEl) countEl.textContent = String(ids.length);
    var typeEl = document.getElementById('crmBulkHistoryType');
    var textEl = document.getElementById('crmBulkHistoryText');
    if (typeEl) typeEl.value = 'email';
    if (textEl) textEl.value = '';
    document.getElementById('crmBulkHistoryModal').classList.add('active');
    setTimeout(function() { if (textEl) textEl.focus(); }, 50);
}

function closeCrmBulkHistoryModal() {
    document.getElementById('crmBulkHistoryModal').classList.remove('active');
}

function executeCrmBulkHistory() {
    var ids = typeof getCrmSelectedProspectIds === 'function' ? getCrmSelectedProspectIds() : [];
    if (!ids.length) { alert('Aucun prospect sélectionné.'); return; }
    var type = (document.getElementById('crmBulkHistoryType') || {}).value || 'note';
    var text = (document.getElementById('crmBulkHistoryText') || {}).value.trim();
    if (!text) { alert('Saisissez un contenu.'); return; }
    var ok = 0;
    ids.forEach(function(id) {
        var found = findCrmProspect(id);
        if (!found) return;
        if (createCrmProspectActivity(found.prospect, type, text)) ok++;
    });
    if (!ok) { alert('Aucun prospect trouvé.'); return; }
    saveCrmData();
    closeCrmBulkHistoryModal();
    if (typeof clearCrmListSelection === 'function') clearCrmListSelection();
    if (typeof renderCrmProspects === 'function') renderCrmProspects();
    refreshCrmStructureHistoryIfVisible();
    if (typeof showToast === 'function') {
        showToast('Historique ajouté à ' + ok + ' prospect' + (ok > 1 ? 's' : ''), 'success');
    }
}

function saveCrmFicheFollowUp() {
    var found = findCrmProspect(crmV2ProspectId);
    if (!found) return;
    var date = document.getElementById('crmFicheFollowUpDate').value;
    if (!date) {
        alert('Indiquez une date de relance.');
        return;
    }
    found.prospect.followUpDate = date;
    found.prospect.followUpNote = document.getElementById('crmFicheFollowUpNote').value.trim();
    var fuAssignee = document.getElementById('crmFicheFollowUpAssignee');
    found.prospect.followUpAssigneeUserId = fuAssignee && fuAssignee.value ? fuAssignee.value : null;
    saveCrmData();
    document.getElementById('crmFicheFollowUpDate').value = '';
    document.getElementById('crmFicheFollowUpNote').value = '';
    populateCrmUserSelect(document.getElementById('crmFicheFollowUpAssignee'), currentUser ? currentUser.id : '', true);
    renderCrmProspectFollowUpPending(found.prospect);
    if (typeof showToast === 'function') showToast('Relance planifiée', 'success');
    renderCrmRelancesWidget();
}

// ========== Navigation pages CRM ==========

var CRM_BROWSE_PAGE_IDS = [
    'crmProspectsHubPage', 'crmProspectsBrowsePage', 'crmListsBrowsePage',
    'crmStructuresBrowsePage', 'crmDealsBrowsePage', 'crmRelancesBrowsePage'
];

function crmHideBrowsePages() {
    CRM_BROWSE_PAGE_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
}

function openCrmProspectsHub() {
    document.getElementById('crmPage').classList.remove('active');
    crmHideBrowsePages();
    document.getElementById('crmProspectsHubPage').classList.add('active');
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

function closeCrmProspectsHub() {
    document.getElementById('crmProspectsHubPage').classList.remove('active');
    document.getElementById('crmPage').classList.add('active');
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

function openCrmProspectsBrowsePage() {
    crmHideBrowsePages();
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmProspectsHubPage').classList.remove('active');
    document.getElementById('crmProspectsBrowsePage').classList.add('active');
    if (typeof populateCrmHomeListFilter === 'function') populateCrmHomeListFilter();
    if (typeof renderCrmHomeProspects === 'function') renderCrmHomeProspects();
}

function closeCrmProspectsBrowsePage() {
    document.getElementById('crmProspectsBrowsePage').classList.remove('active');
    document.getElementById('crmProspectsHubPage').classList.add('active');
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

function openCrmListsBrowsePage() {
    crmHideBrowsePages();
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmProspectsHubPage').classList.remove('active');
    document.getElementById('crmListsBrowsePage').classList.add('active');
    if (typeof renderCrmListsBrowse === 'function') renderCrmListsBrowse();
}

function closeCrmListsBrowsePage() {
    document.getElementById('crmListsBrowsePage').classList.remove('active');
    document.getElementById('crmProspectsHubPage').classList.add('active');
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

function openCrmStructuresBrowsePage() {
    crmHideBrowsePages();
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmProspectsHubPage').classList.remove('active');
    document.getElementById('crmStructuresBrowsePage').classList.add('active');
    renderCrmStructuresBrowse();
}

function closeCrmStructuresBrowsePage() {
    document.getElementById('crmStructuresBrowsePage').classList.remove('active');
    document.getElementById('crmProspectsHubPage').classList.add('active');
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

function renderCrmStructuresBrowse() {
    var container = document.getElementById('crmStructuresBrowseList');
    if (!container) return;
    var searchEl = document.getElementById('crmStructuresBrowseSearch');
    var search = (searchEl ? searchEl.value : '').toLowerCase().trim();
    var structures = (crmData.structures || []).slice();
    structures.sort(function(a, b) {
        return getCrmStructureDisplayName(a).localeCompare(getCrmStructureDisplayName(b), 'fr');
    });
    if (search) {
        structures = structures.filter(function(s) {
            ensureStructureShape(s);
            var hay = [s.organisme, s.typeStructure, s.ville, s.cp, s.siret, s.region, s.adresse].join(' ').toLowerCase();
            return hay.indexOf(search) !== -1;
        });
    }
    var empty = document.getElementById('crmStructuresBrowseEmpty');
    if (!structures.length) {
        container.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = structures.map(function(s) {
        var prospects = getProspectsForStructure(s.id).length;
        var addr = getCrmStructureAddress(s);
        return '<div class="crm-list-card crm-structure-browse-card" onclick="openCrmStructureFiche(\'' + escHtml(s.id) + '\')">' +
            '<div class="crm-list-card-actions">' +
            '<button onclick="event.stopPropagation(); openCrmStructureModalById(\'' + escHtml(s.id) + '\')" title="Modifier">✏️</button>' +
            '<button onclick="event.stopPropagation(); openDeleteCrmStructureModal(\'' + escHtml(s.id) + '\')" title="Supprimer">🗑️</button>' +
            '</div>' +
            '<div class="crm-list-card-name">' + escHtml(getCrmStructureDisplayName(s)) + '</div>' +
            '<div class="crm-list-card-desc">' + escHtml(s.typeStructure || 'Structure') + (addr ? ' · ' + escHtml(addr) : '') + '</div>' +
            '<div class="crm-list-card-meta"><span>' + escHtml(s.ville || '—') + '</span>' +
            '<span class="crm-list-card-count">' + prospects + ' prospect' + (prospects !== 1 ? 's' : '') + '</span></div></div>';
    }).join('');
}

function filterCrmStructuresBrowse() {
    renderCrmStructuresBrowse();
}

function openCrmDealsBrowsePage() {
    crmHideBrowsePages();
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmDealsBrowsePage').classList.add('active');
    renderCrmDealsBrowse();
}

function closeCrmDealsBrowsePage() {
    document.getElementById('crmDealsBrowsePage').classList.remove('active');
    document.getElementById('crmPage').classList.add('active');
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

function openCrmRelancesBrowsePage() {
    crmHideBrowsePages();
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmRelancesBrowsePage').classList.add('active');
    renderCrmRelancesBrowse();
}

function closeCrmRelancesBrowsePage() {
    document.getElementById('crmRelancesBrowsePage').classList.remove('active');
    document.getElementById('crmPage').classList.add('active');
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

window.crmHideBrowsePages = crmHideBrowsePages;
window.openCrmProspectsHub = openCrmProspectsHub;
window.closeCrmProspectsHub = closeCrmProspectsHub;
window.openCrmProspectsBrowsePage = openCrmProspectsBrowsePage;
window.closeCrmProspectsBrowsePage = closeCrmProspectsBrowsePage;
window.openCrmListsBrowsePage = openCrmListsBrowsePage;
window.closeCrmListsBrowsePage = closeCrmListsBrowsePage;
window.openCrmStructuresBrowsePage = openCrmStructuresBrowsePage;
window.closeCrmStructuresBrowsePage = closeCrmStructuresBrowsePage;
window.renderCrmStructuresBrowse = renderCrmStructuresBrowse;
window.filterCrmStructuresBrowse = filterCrmStructuresBrowse;
window.openCrmDealsBrowsePage = openCrmDealsBrowsePage;
window.closeCrmDealsBrowsePage = closeCrmDealsBrowsePage;
window.openCrmRelancesBrowsePage = openCrmRelancesBrowsePage;
window.closeCrmRelancesBrowsePage = closeCrmRelancesBrowsePage;

// ========== Accueil CRM — Dossiers ==========

function getCrmHomeRecentDeals(limit) {
    var deals = (typeof getCrmAccessibleDeals === 'function' ? getCrmAccessibleDeals() : (crmData.deals || [])).slice();
    deals.sort(function(a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
    return deals.slice(0, limit || 6);
}

function buildCrmDealCardHtml(d) {
    ensureDealShape(d);
    var line = getCrmActivityLineById(d.activityLineId);
    var statusCls = d.status === 'won' ? 'crm-deal-status-badge--won' : (d.status === 'lost' ? 'crm-deal-status-badge--lost' : 'crm-deal-status-badge--open');
    var statusLabel = d.status === 'won' ? 'Gagné' : (d.status === 'lost' ? 'Perdu' : 'Ouvert');
    var dateStr = d.updatedAt ? crmFormatDate(d.updatedAt) : (d.createdAt ? crmFormatDate(d.createdAt) : '');
    return '<div class="crm-home-deal-card" onclick="openCrmDealFiche(\'' + escHtml(d.id) + '\')">' +
        '<div class="crm-home-deal-title">' + escHtml(d.title || 'Sans titre') + '</div>' +
        '<div class="crm-home-deal-meta">' + escHtml(getCrmDealProspectsLabel(d)) + '</div>' +
        '<div class="crm-home-deal-footer">' +
        '<span class="crm-home-deal-stage">' + escHtml(d.stage || '—') + '</span>' +
        '<span class="crm-deal-status-badge ' + statusCls + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="crm-home-deal-footer" style="margin-top:0.35rem;">' +
        '<span>' + escHtml(dateStr) + (line ? ' · ' + escHtml(crmActivityLineLabel(line)) : '') + '</span>' +
        '</div></div>';
}

function renderCrmHomeDeals() {
    var container = document.getElementById('crmHomeDealsList');
    var empty = document.getElementById('crmHomeDealsEmpty');
    if (!container) return;
    var deals = getCrmHomeRecentDeals(6);
    if (!deals.length) {
        container.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = deals.map(buildCrmDealCardHtml).join('');
}

function buildCrmQuickSearchMatches(q) {
    var matches = [];
    getAllCrmProspectsUnique().forEach(function(p) {
        if (!findCrmProspect(p.id)) return;
        ensureProspectShape(p);
        var structure = getCrmProspectStructure(p);
        var hay = [
            getCrmProspectDisplayName(p),
            getCrmProspectPersonName(p),
            p.email, p.telFixe, p.telMobile, p.tel, p.notes,
            structure ? structure.organisme : p.organisme,
            structure ? structure.ville : p.ville,
            structure ? structure.cp : p.cp
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        var personName = getCrmProspectPersonName(p);
        var title = personName || (structure ? structure.organisme : p.organisme) || 'Prospect';
        var subtitleParts = [];
        if (personName && structure && structure.organisme) subtitleParts.push(structure.organisme);
        else if (!personName && structure && structure.organisme) { /* déjà dans title */ }
        var listNames = getCrmProspectListNames(p);
        if (listNames.length) subtitleParts.push(listNames.join(' · '));
        matches.push({
            kind: 'prospect',
            sort: title,
            html: '<div class="crm-search-item" onclick="openCrmProspectFiche(\'' + escHtml(p.id) + '\');crmClearGlobalSearch();">' +
                '<span class="crm-home-quick-search-kind crm-home-quick-search-kind--prospect">Prospect</span>' +
                escHtml(title) +
                (subtitleParts.length ? ' <small>' + escHtml(subtitleParts.join(' — ')) + '</small>' : '') +
                '</div>'
        });
    });
    (crmData.structures || []).forEach(function(s) {
        ensureStructureShape(s);
        var hay = [s.organisme, s.typeStructure, s.ville, s.cp, s.siret, s.region, s.adresse].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        var addr = getCrmStructureAddress(s);
        matches.push({
            kind: 'structure',
            sort: getCrmStructureDisplayName(s),
            html: '<div class="crm-search-item" onclick="openCrmStructureFiche(\'' + escHtml(s.id) + '\');crmClearGlobalSearch();">' +
                '<span class="crm-home-quick-search-kind crm-home-quick-search-kind--structure">Structure</span>' +
                escHtml(getCrmStructureDisplayName(s)) +
                (addr ? ' <small>' + escHtml(addr) + '</small>' : '') +
                '</div>'
        });
    });
    (crmData.deals || []).forEach(function(d) {
        var found = typeof findCrmProspect === 'function' ? findCrmProspect(d.prospectId) : null;
        var org = found && found.prospect ? getCrmProspectDisplayName(found.prospect) : '';
        var hay = [d.title, d.notes, d.description, org].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        matches.push({
            kind: 'deal',
            sort: d.title || 'Dossier',
            html: '<div class="crm-search-item" onclick="openCrmDealFiche(\'' + escHtml(d.id) + '\');crmClearGlobalSearch();">' +
                '<span class="crm-home-quick-search-kind crm-home-quick-search-kind--deal">Dossier</span>' +
                escHtml(d.title || 'Dossier') +
                (org ? ' <small>' + escHtml(org) + '</small>' : '') +
                '</div>'
        });
    });
    matches.sort(function(a, b) { return a.sort.localeCompare(b.sort, 'fr'); });
    return matches;
}

function filterCrmHomeQuickSearch() {
    var input = document.getElementById('crmHomeQuickSearch');
    var results = document.getElementById('crmHomeQuickSearchResults');
    if (!input || !results) return;
    var q = input.value.toLowerCase().trim();
    if (q.length < 2) {
        results.innerHTML = '';
        results.style.display = 'none';
        return;
    }
    var matches = buildCrmQuickSearchMatches(q);
    if (!matches.length) {
        results.innerHTML = '<div class="crm-search-empty">Aucun résultat — créez un prospect ou une structure avec les boutons ci-dessus.</div>';
        results.style.display = 'block';
        return;
    }
    results.innerHTML = matches.slice(0, 12).map(function(m) { return m.html; }).join('');
    results.style.display = 'block';
}

function clearCrmHomeQuickSearch() {
    crmClearGlobalSearch();
}

function getCrmHomeUpcomingRelances(limit) {
    return getCrmFollowUps({ mineOnly: true }).slice(0, limit || 6);
}

function buildCrmRelanceCardHtml(item, options) {
    options = options || {};
    var cls = item.overdue ? ' crm-relance-overdue' : '';
    var click;
    if (options.fromAppHome) {
        click = item.kind === 'deal'
            ? "openCrmRelancesBrowsePageFromAppHome('deal','" + item.id + "')"
            : "openCrmRelancesBrowsePageFromAppHome('prospect','" + item.id + "')";
    } else {
        click = item.kind === 'deal'
            ? 'openCrmDealFiche(\'' + item.id + '\')'
            : 'openCrmProspectFiche(\'' + item.id + '\')';
    }
    var kindLabel = item.kind === 'deal' ? 'Dossier' : 'Prospect';
    var assigneeLabel = getCrmUserDisplayName(item.assigneeUserId);
    return '<div class="crm-relance-item' + cls + '">' +
        '<div class="crm-relance-item-main" onclick="' + click + '">' +
        '<div class="crm-relance-date">' + crmFormatDate(item.date) + (item.overdue ? ' ⚠️' : '') +
        ' · <span class="crm-relance-kind">' + escHtml(kindLabel) + '</span></div>' +
        '<div class="crm-relance-title">' + escHtml(item.title) + '</div>' +
        '<div class="crm-relance-sub">' + escHtml(item.subtitle) + '</div>' +
        '<div class="crm-relance-assignee">👤 ' + escHtml(assigneeLabel) + '</div></div>' +
        '<button type="button" class="btn btn-secondary crm-relance-validate-btn" onclick="event.stopPropagation();validateCrmFollowUp(\'' +
        escHtml(item.kind) + '\',\'' + escHtml(item.id) + '\')" title="Marquer comme faite">✓ Faite</button></div>';
}

function renderCrmHomeRelances() {
    var container = document.getElementById('crmHomeRelancesList');
    var empty = document.getElementById('crmHomeRelancesEmpty');
    if (!container) return;
    var items = getCrmHomeUpcomingRelances(6);
    if (!items.length) {
        container.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = items.map(function(item) { return buildCrmRelanceCardHtml(item); }).join('');
}

function openCrmRelancesBrowsePageFromAppHome(kind, id) {
    if (typeof openCrmPage === 'function') openCrmPage();
    setTimeout(function() {
        if (kind === 'deal' && id && typeof openCrmDealFiche === 'function') {
            openCrmDealFiche(id);
        } else if (kind === 'prospect' && id && typeof openCrmProspectFiche === 'function') {
            openCrmProspectFiche(id);
        } else if (typeof openCrmRelancesBrowsePage === 'function') {
            openCrmRelancesBrowsePage();
        }
    }, 150);
}

async function renderHomeRelancesWidget() {
    var widget = document.getElementById('homeRelancesWidget');
    var container = document.getElementById('homeRelancesList');
    if (!container) return;
    if (typeof hasCrmAccess === 'function' && !hasCrmAccess()) {
        if (widget) widget.style.display = 'none';
        return;
    }
    if (widget) widget.style.display = '';
    if (typeof ensureCrmDataLoaded === 'function') {
        try { await ensureCrmDataLoaded(); } catch (e) { /* silencieux */ }
    }
    var items = getCrmHomeUpcomingRelances(5);
    if (!items.length) {
        container.innerHTML = '<div class="home-widget-empty"><span class="home-widget-empty-icon">📅</span><p>Aucune relance assignée à vous</p></div>';
        return;
    }
    container.innerHTML = items.map(function(item) {
        return buildCrmRelanceCardHtml(item, { fromAppHome: true });
    }).join('');
}

window.renderCrmHomeRelances = renderCrmHomeRelances;
window.renderHomeRelancesWidget = renderHomeRelancesWidget;
window.openCrmRelancesBrowsePageFromAppHome = openCrmRelancesBrowsePageFromAppHome;
window.filterCrmHomeQuickSearch = filterCrmHomeQuickSearch;
window.clearCrmHomeQuickSearch = clearCrmHomeQuickSearch;

function getCrmDealsBrowseFiltered() {
    var deals = (typeof getCrmAccessibleDeals === 'function' ? getCrmAccessibleDeals() : (crmData.deals || [])).slice();
    var searchEl = document.getElementById('crmDealsBrowseSearch');
    var search = (searchEl ? searchEl.value : '').toLowerCase().trim();
    deals.sort(function(a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
    if (search) {
        deals = deals.filter(function(d) {
            ensureDealShape(d);
            var prospectsLabel = getCrmDealProspectsLabel(d);
            var line = getCrmActivityLineById(d.activityLineId);
            var hay = [
                d.title, d.stage, d.followUpNote, prospectsLabel,
                line ? crmActivityLineLabel(line) : ''
            ].join(' ').toLowerCase();
            return hay.indexOf(search) !== -1;
        });
    }
    return deals;
}

function renderCrmDealsBrowse() {
    var container = document.getElementById('crmDealsBrowseList');
    var empty = document.getElementById('crmDealsBrowseEmpty');
    if (container) {
        var searchEl = document.getElementById('crmDealsBrowseSearch');
        var hasSearch = !!(searchEl && searchEl.value.trim());
        var deals = getCrmDealsBrowseFiltered();
        if (!deals.length) {
            container.innerHTML = '';
            if (empty) {
                empty.style.display = '';
                var emptyText = document.getElementById('crmDealsBrowseEmptyText');
                if (emptyText) emptyText.textContent = hasSearch ? 'Aucun dossier ne correspond à votre recherche' : 'Aucun dossier';
            }
        } else {
            if (empty) empty.style.display = 'none';
            container.innerHTML = deals.map(buildCrmDealCardHtml).join('');
        }
    }
    renderCrmHomeDeals();
}

function filterCrmDealsBrowse() {
    renderCrmDealsBrowse();
}

window.renderCrmDealsBrowse = renderCrmDealsBrowse;
window.filterCrmDealsBrowse = filterCrmDealsBrowse;

// ========== PRIORITÉ 2 — Dossiers & Pipeline ==========

function renderCrmProspectDeals(prospect, list) {
    var container = document.getElementById('crmFicheDeals');
    var createBtn = document.getElementById('crmFicheDealsCreateBtn');
    if (createBtn && prospect) {
        createBtn.onclick = function() { openCrmDealModal(null, prospect.id); };
    }
    if (!container) return;
    var deals = getDealsForProspect(prospect.id).slice().sort(function(a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
    if (!deals.length) {
        container.innerHTML = '<div class="crm-prospect-deals-empty">Aucun dossier rattaché à ce prospect.</div>';
        return;
    }
    container.innerHTML = deals.map(function(d) {
        ensureDealShape(d);
        var line = getCrmActivityLineById(d.activityLineId);
        var statusCls = d.status === 'won' ? 'crm-deal-status-badge--won' : (d.status === 'lost' ? 'crm-deal-status-badge--lost' : 'crm-deal-status-badge--open');
        var statusLabel = d.status === 'won' ? 'Gagné' : (d.status === 'lost' ? 'Perdu' : 'En cours');
        var dateStr = d.updatedAt ? crmFormatDate(d.updatedAt) : (d.createdAt ? crmFormatDate(d.createdAt) : '');
        var metaParts = [];
        if (dateStr) metaParts.push('Mis à jour le ' + dateStr);
        if (line) metaParts.push(crmActivityLineLabel(line));
        if (d.amount) metaParts.push(crmFormatMoney(d.amount));
        var rowCls = d.status === 'won' ? 'crm-prospect-deal-row--won' : (d.status === 'lost' ? 'crm-prospect-deal-row--lost' : 'crm-prospect-deal-row--open');
        return '<div class="crm-prospect-deal-row ' + rowCls + '" onclick="openCrmDealFiche(\'' + escHtml(d.id) + '\')">' +
            '<span class="crm-prospect-deal-icon" aria-hidden="true">📁</span>' +
            '<span class="crm-prospect-deal-title">' + escHtml(d.title || 'Sans titre') + '</span>' +
            '<span class="crm-prospect-deal-stage">' + escHtml(d.stage || '—') + '</span>' +
            '<span class="crm-deal-status-badge ' + statusCls + '">' + escHtml(statusLabel) + '</span>' +
            (metaParts.length ? '<span class="crm-prospect-deal-meta">' + escHtml(metaParts.join(' · ')) + '</span>' : '') +
            '</div>';
    }).join('');
}

// ========== Fiche dossier (hub commercial) ==========

var CRM_DEAL_DOC_CATEGORIES = {
    devis: { label: 'Devis', icon: '📄' },
    contrat: { label: 'Contrat', icon: '📝' },
    document: { label: 'Document', icon: '📎' },
    autre: { label: 'Autre', icon: '📁' }
};

function openCrmDealFiche(dealId) {
    var deal = getCrmDealById(dealId);
    if (!deal) { alert('Dossier introuvable.'); return; }
    if (document.getElementById('crmProspectPage').classList.contains('active')) {
        crmV2DealReturnTo = 'prospect';
    } else if (document.getElementById('crmDealsBrowsePage').classList.contains('active')) {
        crmV2DealReturnTo = 'deals_browse';
    } else if (document.getElementById('crmRelancesBrowsePage').classList.contains('active')) {
        crmV2DealReturnTo = 'relances_browse';
    } else if (document.getElementById('crmPage').classList.contains('active')) {
        crmV2DealReturnTo = 'home';
    } else if (document.getElementById('workProjectPage') && document.getElementById('workProjectPage').classList.contains('active')) {
        crmV2DealReturnTo = 'work_project';
    } else {
        crmV2DealReturnTo = 'home';
    }
    crmV2DealId = dealId;
    crmV2EditingDealActivityId = null;
    resetCrmDealSectionsExpanded();
    clearCrmDealFollowUpForm();
    clearCrmDealFicheSearch();
    crmHideBrowsePages();
    document.getElementById('crmProspectPage').classList.remove('active');
    document.getElementById('crmPage').classList.remove('active');
    document.getElementById('crmListPage').classList.remove('active');
    document.getElementById('crmStructurePage').classList.remove('active');
    document.getElementById('crmDealDocumentsPage').classList.remove('active');
    document.getElementById('crmDealNotesPage').classList.remove('active');
    document.getElementById('crmDealPage').classList.add('active');
    renderCrmDealFiche();
}

function closeCrmDealFiche() {
    closeCrmDealHistoryModal();
    closeCrmDealDocumentModal();
    closeCrmDealNoteModal();
    document.getElementById('crmDealPage').classList.remove('active');
    crmV2DealId = null;
    crmV2EditingDealActivityId = null;
    if (crmV2DealReturnTo === 'task_fiche' && typeof reopenTaskFicheFromDeal === 'function' && reopenTaskFicheFromDeal()) {
        return;
    }
    if (crmV2DealReturnTo === 'work_project') {
        document.getElementById('workProjectPage').classList.add('active');
        wpCurrentTab = 'commercial';
        if (typeof renderWorkProjectPage === 'function') renderWorkProjectPage();
        return;
    }
    if (crmV2DealReturnTo === 'prospect' && crmV2ProspectId) {
        document.getElementById('crmProspectPage').classList.add('active');
        renderCrmProspectFiche();
    } else if (crmV2DealReturnTo === 'deals_browse') {
        openCrmDealsBrowsePage();
    } else if (crmV2DealReturnTo === 'relances_browse') {
        openCrmRelancesBrowsePage();
    } else if (crmV2DealReturnTo === 'home') {
        document.getElementById('crmPage').classList.add('active');
        if (typeof renderCrmLists === 'function') renderCrmLists();
        if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
    } else {
        document.getElementById('crmPage').classList.add('active');
        if (typeof renderCrmLists === 'function') renderCrmLists();
        if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
    }
}

function renderCrmDealFiche() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    ensureDealShape(deal);

    bindCrmDealFicheDraftFields();
    renderCrmDealHero(deal);

    var backBtn = document.getElementById('crmDealBackBtn');
    if (backBtn) {
        if (crmV2DealReturnTo === 'prospect') backBtn.textContent = '← Retour au prospect';
        else if (crmV2DealReturnTo === 'deals_browse') backBtn.textContent = '← Retour aux dossiers';
        else if (crmV2DealReturnTo === 'relances_browse') backBtn.textContent = '← Retour aux relances';
        else if (crmV2DealReturnTo === 'home') backBtn.textContent = '← Retour CRM';
        else if (crmV2DealReturnTo === 'work_project') backBtn.textContent = '← Retour au projet';
        else backBtn.textContent = '← Retour CRM';
    }

    var wp = getWorkProjectForCrmDeal(deal.id);
    var wpBtn = document.getElementById('crmDealFicheWpBtn');
    var createWpBtn = document.getElementById('crmDealFicheCreateWpBtn');
    if (wpBtn) wpBtn.style.display = wp ? '' : 'none';
    if (createWpBtn) {
        var canCreateWp = !wp && (deal.status === 'won' || (deal.stage && /gagn|won|sign/i.test(deal.stage)));
        createWpBtn.style.display = canCreateWp && typeof createWorkProjectFromCrmDeal === 'function' ? '' : 'none';
    }

    renderCrmDealFollowUpPending(deal);
    renderCrmDealFollowUpHistory(deal);
    renderCrmDealTasks(deal);
    renderCrmDealActivitiesTimeline(deal);
    renderCrmDealDocuments(deal);
    renderCrmDealComptaDocs(deal);
    renderCrmDealNotesFiche(deal);

    var ficheQuery = getCrmDealFicheSearchQuery();
    if (ficheQuery.length >= 2) filterCrmDealFicheSearch();
}

function renderCrmDealComptaDocs(deal) {
    var el = document.getElementById('crmDealComptaDocsList');
    if (!el || !deal) return;
    var render = function() {
        if (typeof getDocsLinkedToDeal !== 'function' || typeof renderComptaDocsLinkedListHtml !== 'function') {
            el.innerHTML = '<p class="wp-muted" style="margin:0;">Module documents commerciaux non chargé.</p>';
            return;
        }
        el.innerHTML = renderComptaDocsLinkedListHtml(getDocsLinkedToDeal(deal.id));
    };
    if (typeof loadComptaData === 'function' && (!window.comptaJustificatifs || !window.comptaJustificatifs.length)) {
        loadComptaData().then(render).catch(render);
    } else {
        render();
    }
}

function renderCrmDealFicheProspects(deal) {
    var container = document.getElementById('crmDealFicheProspects');
    var select = document.getElementById('crmDealAddProspectSelect');
    if (!container) return;
    var ids = getCrmDealProspectIds(deal);
    if (!ids.length) {
        container.innerHTML = '<div class="crm-deal-hero-prospect-empty">Aucun prospect lié — ajoutez-en un ci-dessus.</div>';
    } else {
        container.innerHTML = ids.map(function(pid) {
            var f = findCrmProspect(pid);
            if (!f) return '';
            var contact = [f.prospect.contactPrenom, f.prospect.contactNom].filter(Boolean).join(' ');
            var canRemove = ids.length > 1;
            return '<div class="crm-deal-hero-prospect-chip">' +
                '<button type="button" class="crm-deal-hero-prospect-main" onclick="openCrmDealProspectFiche(\'' + escHtml(pid) + '\')">' +
                '<span class="crm-deal-hero-prospect-name">' + escHtml(f.prospect.organisme) + '</span>' +
                '<span class="crm-deal-hero-prospect-meta">' +
                escHtml([contact, f.list.name].filter(Boolean).join(' · ') || 'Voir la fiche') +
                '</span></button>' +
                (canRemove ? '<button type="button" class="crm-deal-hero-prospect-remove" onclick="removeCrmDealProspect(\'' + escHtml(pid) + '\')" title="Retirer du dossier">×</button>' : '') +
                '</div>';
        }).join('');
    }
    if (select) {
        var linked = {};
        ids.forEach(function(id) { linked[id] = true; });
        var html = '<option value="">— Choisir un prospect —</option>';
        (crmData.lists || []).filter(hasCrmListAccess).forEach(function(list) {
            (list.prospects || []).forEach(function(p) {
                if (linked[p.id]) return;
                html += '<option value="' + p.id + '">' + escHtml(p.organisme) + ' (' + escHtml(list.name) + ')</option>';
            });
        });
        select.innerHTML = html;
    }
}

function openCrmDealProspectFiche(prospectId) {
    crmV2ProspectReturnTo = 'deal';
    openCrmProspectFiche(prospectId);
}

function addCrmDealProspect() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var sel = document.getElementById('crmDealAddProspectSelect');
    if (!sel || !sel.value) { alert('Choisissez un prospect à ajouter.'); return; }
    ensureDealShape(deal);
    if (deal.prospectIds.indexOf(sel.value) === -1) {
        deal.prospectIds.push(sel.value);
        syncCrmDealProspectFields(deal);
        deal.updatedAt = new Date().toISOString();
        saveCrmData();
    }
    renderCrmDealFicheProspects(deal);
    renderCrmDealHero(deal);
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof showToast === 'function') showToast('Prospect ajouté au dossier', 'success');
}

function removeCrmDealProspect(prospectId) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    ensureDealShape(deal);
    if (deal.prospectIds.length <= 1) {
        alert('Un dossier doit conserver au moins un prospect.');
        return;
    }
    var found = findCrmProspect(prospectId);
    var name = found ? found.prospect.organisme : 'ce prospect';
    if (!confirm('Retirer « ' + name + ' » de ce dossier ?')) return;
    deal.prospectIds = deal.prospectIds.filter(function(id) { return id !== prospectId; });
    syncCrmDealProspectFields(deal);
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    renderCrmDealFicheProspects(deal);
    renderCrmDealHero(deal);
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof showToast === 'function') showToast('Prospect retiré du dossier', 'success');
}

function crmApplyDealStageStatus(deal) {
    var sl = (deal.stage || '').toLowerCase();
    var lostStages = ['perdu', 'lost', 'refus'];
    var wonStages = ['gagné', 'gagne', 'won', 'signé', 'signe', 'contrat'];
    if (lostStages.some(function(s) { return sl.indexOf(s) !== -1; })) deal.status = 'lost';
    else if (wonStages.some(function(s) { return sl.indexOf(s) !== -1; })) deal.status = 'won';
    else deal.status = 'open';
}

function populateCrmDealFicheDealForm(deal) {
    var titleInput = document.getElementById('crmDealFicheTitleInput');
    if (titleInput && document.activeElement !== titleInput) {
        titleInput.value = deal.title || '';
    }
    var lineSel = document.getElementById('crmDealFicheActivityLine');
    lineSel.innerHTML = getActiveCrmActivityLines().map(function(line) {
        var sel = line.id === deal.activityLineId ? ' selected' : '';
        return '<option value="' + line.id + '"' + sel + '>' + escHtml(crmActivityLineLabel(line)) + '</option>';
    }).join('');
    var stageSel = document.getElementById('crmDealFicheStage');
    stageSel.innerHTML = getCrmPipelineStages().map(function(s) {
        var sel = s === deal.stage ? ' selected' : '';
        return '<option value="' + escHtml(s) + '"' + sel + '>' + escHtml(s) + '</option>';
    }).join('');
    if (typeof populateCrmWorkProjectSelect === 'function') {
        var linkedWp = typeof getWorkProjectForCrmDeal === 'function' ? getWorkProjectForCrmDeal(deal.id) : null;
        populateCrmWorkProjectSelect(document.getElementById('crmDealFicheWorkProject'), deal.workProjectId || (linkedWp && linkedWp.id) || '');
    }
    var statusLabel = deal.status === 'won' ? 'Gagné' : (deal.status === 'lost' ? 'Perdu' : 'En cours');
    var statusCls = deal.status === 'won' ? 'crm-deal-status-badge--won' : (deal.status === 'lost' ? 'crm-deal-status-badge--lost' : 'crm-deal-status-badge--open');
    var statusEl = document.getElementById('crmDealFicheStatus');
    if (statusEl) {
        statusEl.innerHTML = 'Statut : <span class="crm-deal-status-badge ' + statusCls + '">' + statusLabel + '</span>' +
            (deal.createdAt ? ' · Créé le ' + escHtml(crmFormatDate(deal.createdAt)) : '');
    }
}

function saveCrmDealFicheInfo() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var title = document.getElementById('crmDealFicheTitleInput').value.trim();
    if (!title) { alert('Le titre du dossier est obligatoire.'); return; }
    deal.title = title;
    deal.activityLineId = document.getElementById('crmDealFicheActivityLine').value;
    deal.stage = document.getElementById('crmDealFicheStage').value;
    crmApplyDealStageStatus(deal);
    var wpSel = document.getElementById('crmDealFicheWorkProject');
    var newWpId = wpSel ? (wpSel.value || null) : null;
    var linkedWp = typeof getWorkProjectForCrmDeal === 'function' ? getWorkProjectForCrmDeal(deal.id) : null;
    var prevWpId = linkedWp ? linkedWp.id : (deal.workProjectId || null);
    if (String(newWpId || '') !== String(prevWpId || '') && typeof linkCrmDealToWorkProject === 'function') {
        linkCrmDealToWorkProject(deal.id, newWpId);
    }
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    renderCrmDealHero(deal);
    populateCrmDealFicheDealForm(deal);
    var wp = getWorkProjectForCrmDeal(deal.id);
    var wpBtn = document.getElementById('crmDealFicheWpBtn');
    var createWpBtn = document.getElementById('crmDealFicheCreateWpBtn');
    if (wpBtn) wpBtn.style.display = wp ? '' : 'none';
    if (createWpBtn) {
        var canCreateWp = !wp && (deal.status === 'won' || (deal.stage && /gagn|won|sign/i.test(deal.stage)));
        createWpBtn.style.display = canCreateWp && typeof createWorkProjectFromCrmDeal === 'function' ? '' : 'none';
    }
    if (typeof showToast === 'function') showToast('Dossier enregistré', 'success');
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof wpCurrentId !== 'undefined' && document.getElementById('workProjectPage') && document.getElementById('workProjectPage').classList.contains('active')) {
        var activeWp = typeof getWorkProjectById === 'function' ? getWorkProjectById(wpCurrentId) : null;
        if (activeWp && wpCurrentTab === 'commercial' && typeof renderWpCommercial === 'function') renderWpCommercial(activeWp);
    }
}

function deleteCrmDealFromFiche() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    crmV2CurrentDeal = deal;
    deleteCrmDeal();
}

function openCrmDealWorkProject() {
    var wp = getWorkProjectForCrmDeal(crmV2DealId);
    if (wp && typeof openWorkProjectPage === 'function') openWorkProjectPage(wp.id);
}

function createCrmDealWorkProject() {
    if (!crmV2DealId || typeof createWorkProjectFromCrmDeal !== 'function') return;
    createWorkProjectFromCrmDeal(crmV2DealId);
}

function saveCrmDealFicheFollowUp() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var date = document.getElementById('crmDealFicheFollowUpDate').value;
    if (!date) {
        alert('Indiquez une date de relance.');
        return;
    }
    deal.followUpDate = date;
    deal.followUpNote = document.getElementById('crmDealFicheFollowUpNote').value.trim();
    var dealFuAssignee = document.getElementById('crmDealFicheFollowUpAssignee');
    deal.followUpAssigneeUserId = dealFuAssignee && dealFuAssignee.value ? dealFuAssignee.value : null;
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    clearCrmDealFollowUpForm();
    renderCrmDealFollowUpPending(deal);
    if (typeof showToast === 'function') showToast('Relance planifiée', 'success');
    if (typeof renderCrmRelancesWidget === 'function') renderCrmRelancesWidget();
}

function renderCrmDealFollowUpPending(deal, query) {
    var container = document.getElementById('crmDealFollowUpPending');
    if (!container || !deal) return;
    query = crmNormalizeSearchQuery(query || getCrmDealFicheSearchQuery());
    if (!deal.followUpDate) {
        container.innerHTML = '';
        return;
    }
    var assignee = getCrmFollowUpAssigneeUserId(deal, false);
    var assigneeLabel = assignee ? getCrmUserDisplayName(assignee) : '—';
    var note = (deal.followUpNote || '').trim();
    if (query && !crmTextMatchesQuery([note, crmFormatDate(deal.followUpDate), assigneeLabel, 'relance'], query)) {
        container.innerHTML = '<div class="crm-followup-history-empty">Aucune relance planifiée ne correspond à votre recherche.</div>';
        return;
    }
    var overdue = false;
    var d = crmParseFollowUpDate(deal.followUpDate);
    if (d) overdue = d < new Date(new Date().toDateString());
    container.innerHTML =
        '<div class="crm-followup-pending-row' + (overdue ? ' crm-followup-pending-row--overdue' : '') + '" data-deal-followup-id="pending">' +
        '<div class="crm-followup-pending-main">' +
        '<strong>À faire</strong> · ' + escHtml(crmFormatDate(deal.followUpDate)) +
        (note ? ' · ' + escHtml(note) : '') +
        ' · 👤 ' + escHtml(assigneeLabel) +
        (overdue ? ' ⚠️' : '') +
        '</div>' +
        '<div class="crm-followup-pending-actions">' +
        '<button type="button" class="btn btn-secondary" onclick="validateCrmFollowUp(\'deal\', \'' + escHtml(deal.id) + '\')">Valider</button>' +
        '</div></div>';
}

function renderCrmDealFollowUpHistory(deal, query) {
    var container = document.getElementById('crmDealFollowUpHistory');
    if (!container || !deal) return;
    query = crmNormalizeSearchQuery(query || getCrmDealFicheSearchQuery());
    var items = (deal.activities || []).filter(function(a) { return a.type === 'followup'; }).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (query) {
        items = items.filter(function(a) { return crmTextMatchesQuery(getCrmDealActivitySearchHaystack(deal, a), query); });
    }
    if (!items.length) {
        container.innerHTML = '<div class="crm-followup-history-empty">' +
            (query ? 'Aucune relance validée ne correspond à votre recherche.' : 'Aucune relance validée.') +
            '</div>';
        return;
    }
    var preview = crmGetDealSectionPreview(items, 'followups', query);
    container.innerHTML = preview.items.map(function(a) {
        var planned = a.plannedDate ? crmFormatDate(a.plannedDate) : '';
        var note = getCrmDealFollowUpActivityNote(a);
        var assigneeLabel = a.assigneeUserId ? getCrmUserDisplayName(a.assigneeUserId) : '—';
        return '<div class="crm-followup-history-row" data-deal-followup-id="' + escHtml(a.id) + '">' +
            '<span class="crm-followup-history-date">' + escHtml(planned || '—') + '</span>' +
            '<span class="crm-followup-history-note">' + escHtml(note || 'Relance') + '</span>' +
            '<span class="crm-followup-history-meta">👤 ' + escHtml(assigneeLabel) + ' · Validée le ' + escHtml(crmFormatDate(a.createdAt)) + '</span>' +
            '<button type="button" class="crm-followup-history-delete" onclick="deleteCrmDealFollowUp(\'' + escHtml(a.id) + '\')" title="Supprimer">🗑️</button>' +
            '</div>';
    }).join('') +
    (preview.hasMore ? crmDealSectionShowAllHtml('followups', preview.total) : '');
}

function deleteCrmDealFollowUp(activityId) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal || !activityId) return;
    if (!confirm('Supprimer cette relance de l\'historique ?')) return;
    deal.activities = (deal.activities || []).filter(function(a) { return a.id !== activityId; });
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    renderCrmDealFollowUpHistory(deal);
    if (typeof showToast === 'function') showToast('Relance supprimée', 'success');
}

function updateCrmDealDocumentsPreview(deal) {
    var preview = document.getElementById('crmDealDocumentsPreview');
    if (!preview || !deal) return;
    var docs = deal.documents || [];
    if (!docs.length) {
        preview.textContent = 'Aucun document';
        return;
    }
    if (docs.length === 1) {
        var label = (docs[0].name || docs[0].fileName || 'Document').trim();
        preview.textContent = label.length > 80 ? label.slice(0, 80) + '…' : label;
        return;
    }
    preview.textContent = docs.length + ' documents';
}

function crmScrollToDealSection(selector) {
    setTimeout(function() {
        var el = document.querySelector(selector);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
}

function openCrmDealDocumentsFiche() {
    if (!crmV2DealId) return;
    document.getElementById('crmDealDocumentsPage').classList.remove('active');
    document.getElementById('crmDealNotesPage').classList.remove('active');
    document.getElementById('crmDealPage').classList.add('active');
    crmV2EditingDealDocId = null;
    var deal = getCrmDealById(crmV2DealId);
    if (deal) renderCrmDealDocuments(deal);
    crmScrollToDealSection('.crm-deal-documents-section');
}

function openCrmDealDocumentsPage() {
    openCrmDealDocumentsFiche();
}

function closeCrmDealDocumentsPage() {
    crmV2EditingDealDocId = null;
    clearCrmDealDocumentsSearch();
}

function renderCrmDealDocumentsPage() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    ensureDealShape(deal);
    var titleEl = document.getElementById('crmDealDocumentsPageTitle');
    var subEl = document.getElementById('crmDealDocumentsPageSubtitle');
    if (titleEl) titleEl.textContent = '📎 Documents';
    if (subEl) subEl.textContent = (deal.title || 'Sans titre') + ' · ' + (deal.documents || []).length + ' fichier' + ((deal.documents || []).length !== 1 ? 's' : '');
    renderCrmDealDocuments(deal);
}

function openCrmDealDocumentsModal() {
    openCrmDealDocumentsPage();
}

function openCrmDealDocumentMention(dealId, docId) {
    if (!dealId || !docId) return;
    if (typeof openCrmPage === 'function') openCrmPage();
    setTimeout(function() {
        if (typeof openCrmDealFiche === 'function') openCrmDealFiche(dealId);
        setTimeout(function() {
            crmV2DealDocsHighlightId = docId;
            openCrmDealDocumentsFiche();
        }, 280);
    }, 180);
}
window.openCrmDealDocumentMention = openCrmDealDocumentMention;

function closeCrmDealDocumentsModal() {
    closeCrmDealDocumentsPage();
}

function updateCrmDealNotesPreview(deal) {
    if (!deal) return;
    ensureDealShape(deal);
    var preview = document.getElementById('crmDealNotesPreview');
    if (!preview) return;
    var notes = deal.internalNotes || [];
    if (!notes.length) {
        preview.textContent = 'Aucune note';
    } else if (notes.length === 1) {
        var title = getCrmDealNoteTitle(deal, notes[0]);
        preview.textContent = title || '1 note';
    } else {
        var latest = notes.slice().sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
        preview.textContent = notes.length + ' notes · ' + getCrmDealNoteTitle(deal, latest);
    }
}

function openCrmDealNotesFiche(noteId, options) {
    if (!crmV2DealId) return;
    options = options || {};
    document.getElementById('crmDealNotesPage').classList.remove('active');
    document.getElementById('crmDealDocumentsPage').classList.remove('active');
    document.getElementById('crmDealPage').classList.add('active');
    crmV2FocusDealNoteId = noteId || null;
    if (options.edit && noteId) {
        crmV2EditingDealNoteId = noteId;
        crmV2NotesAutoFocusOnce = true;
    } else if (!noteId) {
        crmV2EditingDealNoteId = null;
    } else {
        crmV2EditingDealNoteId = null;
    }
    var deal = getCrmDealById(crmV2DealId);
    if (deal) renderCrmDealNotesFiche(deal);
    crmScrollToDealSection('.crm-deal-notes-section');
}

function openCrmDealNotesPage(noteId, options) {
    openCrmDealNotesFiche(noteId, options);
}

function closeCrmDealNotesPage() {
    var textEl = document.getElementById('crmDealNewNoteText');
    var titleEl = document.getElementById('crmDealNewNoteTitle');
    if (textEl) textEl.value = '';
    if (titleEl) titleEl.value = '';
    clearCrmDealNotesDraftFlags();
    clearCrmDealNotesSearch();
    crmV2EditingDealNoteId = null;
    crmV2FocusDealNoteId = null;
    crmV2NotesAutoFocusOnce = false;
}

function renderCrmDealNotesPage() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    ensureDealShape(deal);
    var titleEl = document.getElementById('crmDealNotesPageTitle');
    if (titleEl) titleEl.textContent = '📝 Notes';
    updateCrmDealNotesPageSubtitle(deal);
    renderCrmDealNotesList(deal);
}

function openCrmDealNotesModal() {
    openCrmDealNotesPage();
}

function closeCrmDealNotesModal() {
    closeCrmDealNotesPage();
}

function renderCrmDealNotesFiche(deal, query) {
    var container = document.getElementById('crmDealFicheNotesList');
    if (!container || !deal) return;
    ensureDealShape(deal);
    syncCrmDealActivityNoteRefs(deal);
    query = crmNormalizeSearchQuery(query || getCrmDealFicheSearchQuery());
    var notes = (deal.internalNotes || []).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var generalNotes = notes.filter(function(n) { return !isCrmDealHistoryNote(n); });
    if (query) {
        generalNotes = generalNotes.filter(function(n) { return crmDealNoteMatchesSearch(deal, n, query); });
    }
    var preview = crmGetDealSectionPreview(generalNotes, 'notes', query);
    if (crmV2EditingDealNoteId || crmV2FocusDealNoteId) {
        var focusId = crmV2EditingDealNoteId || crmV2FocusDealNoteId;
        var focusIdx = generalNotes.findIndex(function(n) { return n.id === focusId; });
        if (focusIdx >= CRM_DEAL_SECTION_PREVIEW) crmV2DealSectionsExpanded.notes = true;
        preview = crmGetDealSectionPreview(generalNotes, 'notes', query);
    }
    if (!preview.items.length) {
        container.innerHTML = '<div class="crm-deal-notes-empty">' +
            (query ? 'Aucune note ne correspond à votre recherche.' : 'Aucune note. Cliquez sur « Ajouter une note » pour en créer une.') +
            '</div>';
        focusCrmDealNoteInList();
        return;
    }
    container.innerHTML = preview.items.map(function(n) { return renderCrmDealNoteCard(deal, n); }).join('') +
        (preview.hasMore ? crmDealSectionShowAllHtml('notes', preview.total) : '');
    focusCrmDealNoteInList();
}

function renderCrmDealNotesList(deal) {
    if (!deal) return;
    renderCrmDealNotesFiche(deal, getCrmDealNotesSearchQuery());
    if (!document.getElementById('crmDealNotesPage') || !document.getElementById('crmDealNotesPage').classList.contains('active')) return;
    ensureDealShape(deal);
    syncCrmDealActivityNoteRefs(deal);
    var query = getCrmDealNotesSearchQuery();
    var notes = (deal.internalNotes || []).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var generalNotes = notes.filter(function(n) { return !isCrmDealHistoryNote(n); });
    var historyNotes = notes.filter(function(n) { return isCrmDealHistoryNote(n); });
    if (query) {
        generalNotes = generalNotes.filter(function(n) { return crmDealNoteMatchesSearch(deal, n, query); });
        historyNotes = historyNotes.filter(function(n) { return crmDealNoteMatchesSearch(deal, n, query); });
    }
    var metaEl = document.getElementById('crmDealNotesSearchMeta');
    if (metaEl) {
        if (query) {
            var total = generalNotes.length + historyNotes.length;
            metaEl.textContent = total + ' résultat' + (total !== 1 ? 's' : '') + ' pour « ' + query + ' »';
        } else {
            metaEl.textContent = '';
        }
    }
    renderCrmDealNotesSectionList(
        document.getElementById('crmDealGeneralNotesList'),
        generalNotes,
        deal,
        query ? 'Aucune note libre ne correspond à votre recherche.' : 'Aucune note libre. Ajoutez un titre et un contenu ci-dessus.'
    );
    renderCrmDealNotesSectionList(
        document.getElementById('crmDealHistoryNotesList'),
        historyNotes,
        deal,
        query ? 'Aucune note historique ne correspond à votre recherche.' : 'Aucune note liée à l\'historique. Depuis la fiche dossier, ouvrez un élément de l\'historique et cliquez sur « Note détaillée ».'
    );
    focusCrmDealNoteInList();
}

function renderCrmDealNoteEditForm(deal, note) {
    var isHistory = isCrmDealHistoryNote(note);
    var titleVal = note.title && String(note.title).trim() ? note.title : getCrmDealNoteTitle(deal, note);
    return '<article class="crm-deal-note-card crm-deal-note-card--edit' + (isHistory ? ' crm-deal-note-card--history' : '') + '" data-deal-note-id="' + escHtml(note.id) + '" data-deal-note-section="' + (isHistory ? 'history' : 'general') + '">' +
        (isHistory ? renderCrmDealNoteActivityContext(deal, note) : '') +
        '<label class="crm-deal-note-edit-label">Titre</label>' +
        '<input type="text" id="crmEditDealNoteTitle" class="crm-fiche-input" maxlength="120" value="' + escHtml(titleVal) + '" placeholder="Titre de la note">' +
        '<label class="crm-deal-note-edit-label">Contenu</label>' +
        '<textarea id="crmEditDealNoteText" class="crm-fiche-textarea" data-mention-field rows="5" placeholder="Détails de la note… (@ pour mentionner)">' + escHtml(note.text || '') + '</textarea>' +
        '<div class="crm-activity-edit-actions">' +
        '<button type="button" class="btn btn-secondary" onclick="cancelEditCrmDealNote()">Annuler</button>' +
        '<button type="button" class="btn" onclick="saveCrmDealNoteEdit(\'' + escHtml(note.id) + '\')">Enregistrer</button>' +
        '</div></article>';
}

function focusCrmDealNoteInList() {
    if (!crmV2FocusDealNoteId && !crmV2EditingDealNoteId) return;
    var targetId = crmV2EditingDealNoteId || crmV2FocusDealNoteId;
    var shouldFocusField = crmV2NotesAutoFocusOnce;
    if (shouldFocusField) crmV2NotesAutoFocusOnce = false;
    setTimeout(function() {
        var el = document.querySelector('[data-deal-note-id="' + targetId + '"]');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (crmV2FocusDealNoteId && !crmV2EditingDealNoteId) {
                el.classList.add('crm-deal-note-card--pulse');
                setTimeout(function() { el.classList.remove('crm-deal-note-card--pulse'); }, 2200);
            }
        }
        if (!shouldFocusField) return;
        if (crmV2EditingDealNoteId) {
            var titleInput = document.getElementById('crmEditDealNoteTitle');
            var ta = document.getElementById('crmEditDealNoteText');
            if (typeof initAppMentionField === 'function' && ta) initAppMentionField(ta);
            if (titleInput) titleInput.focus();
            else if (ta) {
                ta.focus();
                ta.setSelectionRange(ta.value.length, ta.value.length);
            }
            return;
        }
        if (!crmV2FocusDealNoteId) {
            var newTitle = document.getElementById('crmDealNewNoteTitle');
            if (newTitle) newTitle.focus();
        }
    }, 80);
}

function openCrmDealActivityNote(activityId) {
    openCrmDealActivityNoteModal(activityId);
}

function startEditCrmDealNote(noteId) {
    var deal = getCrmDealById(crmV2DealId);
    var note = deal ? getCrmDealNoteById(deal, noteId) : null;
    if (note && isCrmDealHistoryNote(note) && !crmCanEditCrmEntry(note)) return;
    crmV2EditingDealNoteId = noteId;
    crmV2FocusDealNoteId = noteId;
    crmV2NotesAutoFocusOnce = true;
    var deal = getCrmDealById(crmV2DealId);
    if (deal) renderCrmDealNotesFiche(deal);
}

function cancelEditCrmDealNote() {
    crmV2EditingDealNoteId = null;
    crmV2NotesAutoFocusOnce = false;
    clearCrmDealNotesDraftFlags();
    var deal = getCrmDealById(crmV2DealId);
    if (deal) renderCrmDealNotesFiche(deal);
}

function saveCrmDealNoteEdit(noteId) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal || !noteId) return;
    var note = getCrmDealNoteById(deal, noteId);
    if (!note) return;
    if (isCrmDealHistoryNote(note) && !crmCanEditCrmEntry(note)) return;
    var titleEl = document.getElementById('crmEditDealNoteTitle');
    var textEl = document.getElementById('crmEditDealNoteText');
    var title = titleEl ? titleEl.value.trim() : '';
    var text = textEl ? textEl.value.trim() : '';
    if (!title) {
        alert('Saisissez un titre.');
        return;
    }
    note.title = title;
    note.text = text;
    syncDealNotesLegacyField(deal);
    deal.updatedAt = new Date().toISOString();
    crmV2EditingDealNoteId = null;
    crmV2FocusDealNoteId = noteId;
    crmV2NotesAutoFocusOnce = false;
    clearCrmDealNotesDraftFlags();
    saveCrmData();
    renderCrmDealNotesFiche(deal);
    renderCrmDealNotesList(deal);
    updateCrmDealNotesPageSubtitle(deal);
    if (typeof showToast === 'function') showToast('Note enregistrée', 'success');
}

function addCrmDealNoteFromFields(titleEl, textEl, options) {
    options = options || {};
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return false;
    var title = titleEl ? titleEl.value.trim() : '';
    var text = textEl ? textEl.value.trim() : '';
    if (!title) {
        alert('Saisissez un titre.');
        return false;
    }
    if (!text) {
        alert('Saisissez un contenu.');
        return false;
    }
    ensureDealShape(deal);
    var authorName = currentUser ? ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim() : '—';
    deal.internalNotes.unshift({
        id: crmNewId('dnote'),
        title: title,
        text: text,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    });
    syncDealNotesLegacyField(deal);
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    if (titleEl) titleEl.value = '';
    if (textEl) textEl.value = '';
    clearCrmDealNotesDraftFlags();
    renderCrmDealNotesFiche(deal);
    renderCrmDealNotesList(deal);
    updateCrmDealNotesPageSubtitle(deal);
    if (options.closeModal && typeof closeCrmDealNoteModal === 'function') closeCrmDealNoteModal();
    if (typeof showToast === 'function') showToast('Note ajoutée', 'success');
    return true;
}

function addCrmDealNote() {
    addCrmDealNoteFromFields(
        document.getElementById('crmDealNoteModalTitle') || document.getElementById('crmDealNewNoteTitle'),
        document.getElementById('crmDealNoteModalText') || document.getElementById('crmDealNewNoteText'),
        { closeModal: true }
    );
}

function openCrmDealNoteModal() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var titleEl = document.getElementById('crmDealNoteModalTitle');
    var textEl = document.getElementById('crmDealNoteModalText');
    if (titleEl) titleEl.value = '';
    if (textEl) textEl.value = '';
    document.getElementById('crmDealNoteModal').classList.add('active');
    setTimeout(function() { if (titleEl) titleEl.focus(); }, 50);
}

function closeCrmDealNoteModal() {
    var modal = document.getElementById('crmDealNoteModal');
    if (modal) modal.classList.remove('active');
}

function saveCrmDealNoteModal() {
    addCrmDealNoteFromFields(
        document.getElementById('crmDealNoteModalTitle'),
        document.getElementById('crmDealNoteModalText'),
        { closeModal: true }
    );
}

function openCrmDealDocumentModal() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var catEl = document.getElementById('crmDealDocumentModalCategory');
    if (catEl) catEl.value = 'document';
    document.getElementById('crmDealDocumentModal').classList.add('active');
}

function closeCrmDealDocumentModal() {
    var modal = document.getElementById('crmDealDocumentModal');
    if (modal) modal.classList.remove('active');
    var input = document.getElementById('crmDealDocumentModalInput');
    if (input) input.value = '';
}

function deleteCrmDealNote(noteId, options) {
    options = options || {};
    if (!confirm('Supprimer cette note ?')) return;
    var deal = getCrmDealById(crmV2DealId);
    if (!deal || !noteId) return;
    ensureDealShape(deal);
    var idx = (deal.internalNotes || []).findIndex(function(n) { return n.id === noteId; });
    if (idx === -1) return;
    var note = deal.internalNotes[idx];
    if (isCrmDealHistoryNote(note) && !crmCanEditCrmEntry(note)) return;
    var activityId = note.activityId;
    deal.internalNotes.splice(idx, 1);
    if (activityId) {
        var activity = (deal.activities || []).find(function(a) { return a.id === activityId; });
        if (activity) {
            var remaining = getCrmDealNotesByActivityId(deal, activityId);
            if (remaining.length) activity.noteId = remaining[0].id;
            else delete activity.noteId;
        }
    }
    syncDealNotesLegacyField(deal);
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    renderCrmDealNotesFiche(deal);
    renderCrmDealNotesList(deal);
    renderCrmDealActivitiesTimeline(deal);
    updateCrmDealNotesPageSubtitle(deal);
    if (crmV2EditingDealNoteId === noteId) crmV2EditingDealNoteId = null;
    if (options.fromActivityModal || crmV2ActivityNoteModalNoteId === noteId) closeCrmDealActivityNoteModal();
    if (typeof showToast === 'function') showToast('Note supprimée', 'success');
}

function findCrmDealTask(dealId, taskId) {
    var deal = getCrmDealById(dealId);
    if (!deal) return null;
    ensureDealShape(deal);
    var task = (deal.tasks || []).find(function(t) { return String(t.id) === String(taskId); });
    return task ? { deal: deal, task: task } : null;
}

function getCrmDealTaskStatusLabel(status) {
    if (status === 'done') return 'Terminée';
    if (status === 'in_progress' || status === 'inprogress') return 'En cours';
    return 'À faire';
}

function renderCrmDealTasks(deal, query) {
    var container = document.getElementById('crmDealFicheTasks');
    if (!container) return;
    ensureDealShape(deal);
    query = crmNormalizeSearchQuery(query || getCrmDealFicheSearchQuery());
    var tasks = (deal.tasks || []).slice().sort(function(a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
    if (query) {
        tasks = tasks.filter(function(task) {
            var assigneeId = (task.assignedTo && task.assignedTo[0]) || null;
            var assigneeName = assigneeId && typeof getCrmUserDisplayName === 'function'
                ? getCrmUserDisplayName(assigneeId) : '';
            return crmTextMatchesQuery([task.title, task.description, assigneeName, getCrmDealTaskStatusLabel(task.status)], query);
        });
    }
    if (!tasks.length) {
        container.innerHTML = '<div class="crm-fiche-empty">' +
            (query ? 'Aucune tâche ne correspond à votre recherche.' : 'Aucune tâche. Ajoutez une action à assigner ci-dessous.') +
            '</div>';
        return;
    }
    var preview = crmGetDealSectionPreview(tasks, 'tasks', query);
    container.innerHTML = preview.items.map(function(task) {
        var isDone = task.status === 'done' || task.completed;
        var assigneeId = (task.assignedTo && task.assignedTo[0]) || null;
        var assigneeName = assigneeId && typeof getCrmUserDisplayName === 'function'
            ? getCrmUserDisplayName(assigneeId) : (assigneeId ? 'Utilisateur' : 'Non assigné');
        var dueStr = task.dueDate ? crmFormatDate(task.dueDate) : 'Sans échéance';
        return '<div class="crm-deal-task-item' + (isDone ? ' crm-deal-task-item--done' : '') + '" data-deal-task-id="' + escHtml(task.id) + '" style="cursor:pointer;" onclick="openTaskFiche(\'crm_deal\',\'crm_' + escHtml(deal.id) + '\',\'' + escHtml(task.id) + '\')">' +
            '<div class="crm-deal-task-check' + (isDone ? ' crm-deal-task-check--done' : '') + '" onclick="event.stopPropagation();toggleCrmDealTaskStatus(\'' + escHtml(task.id) + '\')" title="Changer le statut">' + (isDone ? '✓' : '') + '</div>' +
            '<div class="crm-deal-task-body">' +
            '<div class="crm-deal-task-title' + (isDone ? ' crm-deal-task-title--done' : '') + '">' + escHtml(task.title || 'Sans titre') + '</div>' +
            (task.description ? '<div class="crm-deal-task-meta">' + (typeof formatMsgText === 'function' ? formatMsgText(task.description) : escHtml(task.description)) + '</div>' : '') +
            '<div class="crm-deal-task-meta">👤 ' + escHtml(assigneeName) + ' · 📅 ' + escHtml(dueStr) + ' · ' + escHtml(getCrmDealTaskStatusLabel(task.status)) + '</div>' +
            '</div>' +
            '<div class="crm-deal-task-actions">' +
            '<button type="button" class="crm-activity-action crm-activity-action--danger" onclick="event.stopPropagation();deleteCrmDealTask(\'' + escHtml(task.id) + '\')" title="Supprimer">🗑️</button>' +
            '</div></div>';
    }).join('') +
    (preview.hasMore ? crmDealSectionShowAllHtml('tasks', preview.total) : '');
}

async function addCrmDealTask() {
    if (typeof openNewCrmDealTaskFiche === 'function') {
        openNewCrmDealTaskFiche(crmV2DealId);
    }
}

async function toggleCrmDealTaskStatus(taskId) {
    var found = findCrmDealTask(crmV2DealId, taskId);
    if (!found) return false;
    var task = found.task;
    if (task.status === 'todo') task.status = 'in_progress';
    else if (task.status === 'in_progress' || task.status === 'inprogress') task.status = 'done';
    else task.status = 'todo';
    task.completed = task.status === 'done';
    task.updatedAt = new Date().toISOString();
    found.deal.updatedAt = new Date().toISOString();
    await saveCrmData();
    renderCrmDealTasks(found.deal);
    return true;
}

async function deleteCrmDealTask(taskId) {
    if (!confirm('Supprimer cette tâche ?')) return;
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    ensureDealShape(deal);
    deal.tasks = (deal.tasks || []).filter(function(t) { return t.id !== taskId; });
    deal.updatedAt = new Date().toISOString();
    await saveCrmData();
    renderCrmDealTasks(deal);
    if (typeof showToast === 'function') showToast('Tâche supprimée', 'success');
}

function getCrmDealTasksForAggregation(options) {
    var out = [];
    if (typeof appendCrmDealTasksToList === 'function') {
        appendCrmDealTasksToList(out, options || {});
        return out;
    }
    options = options || {};
    var includeDone = !!options.includeDone;
    if (typeof crmData === 'undefined' || !crmData.deals) return out;
    (crmData.deals || []).forEach(function(deal) {
        ensureDealShape(deal);
        var dealTitle = deal.title || 'Dossier CRM';
        (deal.tasks || []).forEach(function(task) {
            if (!task) return;
            var isDone = task.status === 'done' || task.completed;
            if (!includeDone && isDone) return;
            var assignedTo = (task.assignedTo || []).map(String);
            var status = task.status === 'in_progress' ? 'inprogress' : (task.status || 'todo');
            out.push({
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
    return out;
}

function openCrmDealFromTask(projectId) {
    if (!projectId || String(projectId).indexOf('crm_') !== 0) return false;
    var dealId = String(projectId).slice(4);
    if (!dealId || typeof openCrmDealFiche !== 'function') return false;
    if (typeof openCrmPage === 'function') openCrmPage();
    openCrmDealFiche(dealId);
    return true;
}

async function toggleCrmDealTaskStatusByProject(projectId, taskId) {
    if (!projectId || String(projectId).indexOf('crm_') !== 0) return false;
    var dealId = String(projectId).slice(4);
    var found = findCrmDealTask(dealId, taskId);
    if (!found) return false;
    var task = found.task;
    if (task.status === 'todo') task.status = 'in_progress';
    else if (task.status === 'in_progress' || task.status === 'inprogress') task.status = 'done';
    else task.status = 'todo';
    task.completed = task.status === 'done';
    task.updatedAt = new Date().toISOString();
    found.deal.updatedAt = new Date().toISOString();
    await saveCrmData();
    if (crmV2DealId === dealId) renderCrmDealTasks(found.deal);
    return true;
}

async function toggleCrmDealTaskFromBureau(projectId, taskId) {
    if (!projectId || String(projectId).indexOf('crm_') !== 0) return false;
    var dealId = String(projectId).slice(4);
    var found = findCrmDealTask(dealId, taskId);
    if (!found) return false;
    var task = found.task;
    var wasDone = task.status === 'done' || task.completed;
    if (wasDone) {
        task.status = 'todo';
        task.completed = false;
    } else {
        task.status = 'done';
        task.completed = true;
    }
    task.updatedAt = new Date().toISOString();
    found.deal.updatedAt = new Date().toISOString();
    await saveCrmData();
    if (crmV2DealId === dealId) renderCrmDealTasks(found.deal);
    return true;
}

function refreshCrmDealTasksInTaskViews() {
    if (typeof loadAllTasks === 'function') loadAllTasks();
    if (typeof renderHomeTasksWidget === 'function') renderHomeTasksWidget();
    if (typeof renderBureauUnifiedTasks === 'function') renderBureauUnifiedTasks();
    else if (typeof renderBureauProjectTasks === 'function') renderBureauProjectTasks();
    var globalPage = document.getElementById('globalTasksPage');
    if (globalPage && globalPage.classList.contains('active') && typeof renderGlobalTasksPage === 'function') {
        renderGlobalTasksPage();
    }
    if (typeof updateTasksBadge === 'function') updateTasksBadge();
}

function buildCrmDealDocumentsHtml(deal, query, options) {
    options = options || {};
    query = crmNormalizeSearchQuery(query || (options.useFicheSearch ? getCrmDealFicheSearchQuery() : getCrmDealDocumentsSearchQuery()));
    var docs = (deal.documents || []).slice().sort(function(a, b) {
        return new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0);
    });
    if (query) {
        docs = docs.filter(function(doc) { return crmDealDocumentMatchesSearch(doc, query); });
    }
    if (!docs.length) {
        return '<div class="crm-fiche-empty">' +
            (query ? 'Aucun document ne correspond à votre recherche.' : 'Aucun document. Cliquez sur « Ajouter un document » pour en ajouter un.') +
            '</div>';
    }
    var preview = options.limitPreview
        ? crmGetDealSectionPreview(docs, 'documents', query)
        : { items: docs, hasMore: false, total: docs.length };
    if (options.limitPreview && crmV2EditingDealDocId) {
        var editIdx = docs.findIndex(function(d) { return d.id === crmV2EditingDealDocId; });
        if (editIdx >= CRM_DEAL_SECTION_PREVIEW) crmV2DealSectionsExpanded.documents = true;
        preview = crmGetDealSectionPreview(docs, 'documents', query);
    }
    if (options.limitPreview && crmV2DealDocsHighlightId) {
        var hlIdx = docs.findIndex(function(d) { return d.id === crmV2DealDocsHighlightId; });
        if (hlIdx >= CRM_DEAL_SECTION_PREVIEW) crmV2DealSectionsExpanded.documents = true;
        preview = crmGetDealSectionPreview(docs, 'documents', query);
    }
    return '<div class="crm-deal-doc-list">' + preview.items.map(function(doc) {
        var cat = CRM_DEAL_DOC_CATEGORIES[doc.category] || CRM_DEAL_DOC_CATEGORIES.document;
        var size = doc.fileSize ? (doc.fileSize / 1024).toFixed(0) + ' Ko' : '';
        var link = '';
        if (typeof resolveMediaUrl === 'function') {
            link = resolveMediaUrl(doc.downloadUrl || doc.url, doc.file_id);
        } else if (doc.file_id && typeof getDownloadFileUrl === 'function') {
            link = getDownloadFileUrl(doc.file_id);
        } else {
            link = doc.downloadUrl || doc.url || '';
        }
        var dateStr = doc.uploadedAt ? crmFormatDate(doc.uploadedAt) : '';
        var isEditing = crmV2EditingDealDocId === doc.id;
        var highlightCls = crmV2DealDocsHighlightId === doc.id ? ' crm-deal-doc-item--highlight' : '';
        var titleBlock = isEditing
            ? '<div class="crm-deal-doc-rename">' +
                '<input type="text" id="crmDealDocRenameInput" class="crm-fiche-input crm-deal-doc-rename-input" maxlength="150" value="' + escHtml(doc.name || doc.fileName || '') + '">' +
                '<div class="crm-deal-doc-rename-actions">' +
                '<button type="button" class="btn btn-secondary" onclick="cancelRenameCrmDealDocument()">Annuler</button>' +
                '<button type="button" class="btn" onclick="saveRenameCrmDealDocument(\'' + escHtml(doc.id) + '\')">Enregistrer</button>' +
                '</div></div>'
            : '<div class="crm-deal-doc-title">' + escHtml(doc.name || doc.fileName) + '</div>';
        return '<div class="crm-deal-doc-item' + (isEditing ? ' crm-deal-doc-item--edit' : '') + highlightCls + '" data-deal-doc-id="' + escHtml(doc.id) + '">' +
            '<span class="crm-deal-doc-icon">' + cat.icon + '</span>' +
            '<div class="crm-deal-doc-info">' +
            titleBlock +
            '<div class="crm-deal-doc-meta">' + escHtml(cat.label) +
            (doc.fileName && doc.fileName !== doc.name ? ' · ' + escHtml(doc.fileName) : '') +
            (size ? ' · ' + size : '') +
            (dateStr ? ' · ' + escHtml(dateStr) : '') +
            '</div></div>' +
            '<div class="crm-deal-doc-actions">' +
            (link ? '<a href="' + escHtml(link) + '" target="_blank" rel="noopener" class="btn btn-secondary crm-deal-doc-open-btn">Ouvrir</a>' : '') +
            (!isEditing ? '<button type="button" class="crm-activity-action" onclick="startRenameCrmDealDocument(\'' + escHtml(doc.id) + '\')" title="Renommer">✏️</button>' : '') +
            (!isEditing ? '<button type="button" class="crm-activity-action crm-activity-action--danger" onclick="deleteCrmDealDocument(\'' + escHtml(doc.id) + '\')" title="Supprimer">🗑️</button>' : '') +
            '</div></div>';
    }).join('') + '</div>' +
    (preview.hasMore ? crmDealSectionShowAllHtml('documents', preview.total) : '');
}

function renderCrmDealDocuments(deal, query) {
    if (!deal) return;
    var ficheEl = document.getElementById('crmDealFicheDocumentsList');
    var pageEl = document.getElementById('crmDealDocumentsList');
    var ficheQuery = crmNormalizeSearchQuery(query || getCrmDealFicheSearchQuery());
    var pageQuery = getCrmDealDocumentsSearchQuery();
    if (ficheEl) {
        ficheEl.innerHTML = buildCrmDealDocumentsHtml(deal, ficheQuery, { useFicheSearch: true, limitPreview: true });
    }
    if (pageEl) {
        var docs = (deal.documents || []).slice();
        if (pageQuery) {
            docs = docs.filter(function(doc) { return crmDealDocumentMatchesSearch(doc, pageQuery); });
        }
        var metaEl = document.getElementById('crmDealDocumentsSearchMeta');
        if (metaEl) {
            metaEl.textContent = pageQuery
                ? docs.length + ' résultat' + (docs.length !== 1 ? 's' : '') + ' pour « ' + pageQuery + ' »'
                : '';
        }
        pageEl.innerHTML = buildCrmDealDocumentsHtml(deal, pageQuery, { useFicheSearch: false });
    }
    if (crmV2EditingDealDocId) {
        setTimeout(function() {
            var input = document.getElementById('crmDealDocRenameInput');
            if (input) { input.focus(); input.select(); }
        }, 50);
    } else if (crmV2DealDocsHighlightId) {
        var highlightId = crmV2DealDocsHighlightId;
        crmV2DealDocsHighlightId = null;
        crmHighlightDealElement('[data-deal-doc-id="' + highlightId + '"]');
    }
}

function startRenameCrmDealDocument(docId) {
    crmV2EditingDealDocId = docId;
    var deal = getCrmDealById(crmV2DealId);
    if (deal) renderCrmDealDocuments(deal);
}

function saveRenameCrmDealDocument(docId) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var input = document.getElementById('crmDealDocRenameInput');
    var name = input ? input.value.trim() : '';
    if (!name) { alert('Indiquez un nom pour le document.'); return; }
    var doc = (deal.documents || []).find(function(d) { return d.id === docId; });
    if (!doc) return;
    doc.name = name;
    deal.updatedAt = new Date().toISOString();
    crmV2EditingDealDocId = null;
    saveCrmData();
    renderCrmDealDocuments(deal);
    if (typeof showToast === 'function') showToast('Document renommé', 'success');
}

function cancelRenameCrmDealDocument() {
    crmV2EditingDealDocId = null;
    var deal = getCrmDealById(crmV2DealId);
    if (deal) renderCrmDealDocuments(deal);
}

async function handleCrmDealFileUpload(event) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal || !event.target.files || !event.target.files.length) return;
    var file = event.target.files[0];
    var modalCat = document.getElementById('crmDealDocumentModalCategory');
    var pageCat = document.getElementById('crmDealDocCategory');
    var modalOpen = document.getElementById('crmDealDocumentModal') && document.getElementById('crmDealDocumentModal').classList.contains('active');
    var category = (modalOpen && modalCat ? modalCat.value : null) || (pageCat ? pageCat.value : null) || 'document';
    if (typeof uploadFile !== 'function') {
        alert('Upload non disponible.');
        event.target.value = '';
        return;
    }
    try {
        if (typeof showToast === 'function') showToast('Envoi en cours…', 'info');
        var uploaded = await uploadFile(file, 'documents');
        ensureDealShape(deal);
        deal.documents.unshift({
            id: crmNewId('doc'),
            name: file.name.replace(/\.[^/.]+$/, ''),
            category: category,
            file_id: uploaded.file_id,
            url: uploaded.url,
            downloadUrl: uploaded.downloadUrl,
            fileName: uploaded.fileName || file.name,
            fileType: uploaded.fileType,
            fileSize: uploaded.fileSize,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentUser ? currentUser.id : null
        });
        deal.updatedAt = new Date().toISOString();
        saveCrmData();
        closeCrmDealDocumentModal();
        renderCrmDealDocuments(deal);
        if (typeof showToast === 'function') showToast('Document ajouté', 'success');
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('Erreur upload : ' + e.message, 'error');
        else alert('Erreur upload : ' + e.message);
    }
    event.target.value = '';
}

function deleteCrmDealDocument(docId) {
    if (!confirm('Supprimer ce document du dossier ?')) return;
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    deal.documents = (deal.documents || []).filter(function(d) { return d.id !== docId; });
    deal.updatedAt = new Date().toISOString();
    if (crmV2EditingDealDocId === docId) crmV2EditingDealDocId = null;
    saveCrmData();
    renderCrmDealDocuments(deal);
    if (typeof showToast === 'function') showToast('Document supprimé', 'success');
}

function renderCrmDealActivitiesTimeline(deal, query) {
    var container = document.getElementById('crmDealFicheActivities');
    if (!container) return;
    query = crmNormalizeSearchQuery(query || getCrmDealFicheSearchQuery());
    var acts = (deal.activities || []).filter(function(a) { return a.type !== 'followup'; }).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (query) {
        acts = acts.filter(function(a) { return crmTextMatchesQuery(getCrmDealActivitySearchHaystack(deal, a), query); });
        if (!acts.length) {
            container.innerHTML = '<div class="crm-fiche-empty">Aucune activité ne correspond à votre recherche.</div>';
            return;
        }
        crmV2DealActivitiesExpanded = true;
    }
    if (!acts.length) {
        container.innerHTML = '<div class="crm-fiche-empty">Aucune activité sur ce dossier. Cliquez sur « Ajouter à l\'historique » pour en créer une.</div>';
        return;
    }
    var visibleActs = crmV2DealActivitiesExpanded ? acts : acts.slice(0, CRM_DEAL_ACTIVITIES_PREVIEW);
    var hasMore = !query && !crmV2DealActivitiesExpanded && acts.length > CRM_DEAL_ACTIVITIES_PREVIEW;
    container.innerHTML = visibleActs.map(function(a) {
        if (crmV2EditingDealActivityId === a.id) return renderCrmDealActivityEditForm(a);
        var meta = CRM_ACTIVITY_TYPES[a.type] || CRM_ACTIVITY_TYPES.note;
        var canEdit = crmCanEditCrmEntry(a);
        var actionsHtml = canEdit
            ? '<div class="crm-activity-actions">' +
                '<button type="button" class="crm-activity-action" onclick="startEditCrmDealActivity(\'' + escHtml(a.id) + '\')" title="Modifier">✏️</button>' +
                '<button type="button" class="crm-activity-action crm-activity-action--danger" onclick="deleteCrmDealActivity(\'' + escHtml(a.id) + '\')" title="Supprimer">🗑️</button>' +
                '</div>'
            : '';
        return '<div class="crm-activity-item" data-deal-activity-id="' + escHtml(a.id) + '">' +
            '<div class="crm-activity-icon">' + meta.icon + '</div>' +
            '<div class="crm-activity-body">' +
            '<div class="crm-activity-meta-row">' +
            '<div class="crm-activity-meta"><strong>' + escHtml(meta.label) + '</strong> · ' + escHtml(a.authorName || '—') + ' · ' + crmFormatDateTime(a.createdAt) + renderCrmDealActivityNoteCreateBtn(a) + '</div>' +
            actionsHtml +
            '</div>' +
            '<div class="crm-activity-text">' + (typeof formatMsgText === 'function' ? formatMsgText(a.text || '') : escHtml(a.text || '').replace(/\n/g, '<br>')) + '</div>' +
            renderCrmDealActivityNotesRow(deal, a) +
            '</div></div>';
    }).join('') +
    (hasMore ? '<div class="crm-activities-show-all-wrap"><button type="button" class="btn btn-secondary crm-activities-show-all-btn" onclick="expandCrmDealSection(\'history\')">Voir tout (' + acts.length + ')</button></div>' : '');
}

function expandCrmDealActivitiesTimeline() {
    expandCrmDealSection('history');
}

function renderCrmDealActivityEditForm(activity) {
    var typeOptions = Object.keys(CRM_ACTIVITY_TYPES).map(function(key) {
        var t = CRM_ACTIVITY_TYPES[key];
        var sel = activity.type === key ? ' selected' : '';
        return '<option value="' + key + '"' + sel + '>' + t.icon + ' ' + escHtml(t.label) + '</option>';
    }).join('');
    return '<div class="crm-activity-item crm-activity-item--edit">' +
        '<div class="crm-activity-body" style="width:100%;">' +
        '<select id="crmEditDealActivityType" class="crm-fiche-select" style="margin-bottom:0.5rem;">' + typeOptions + '</select>' +
        '<textarea id="crmEditDealActivityText" class="crm-fiche-textarea" rows="3" style="margin:0 0 0.65rem;">' + escHtml(activity.text || '') + '</textarea>' +
        '<div class="crm-activity-edit-actions">' +
        '<button type="button" class="btn btn-secondary" onclick="cancelEditCrmDealActivity()">Annuler</button>' +
        '<button type="button" class="btn" onclick="saveCrmDealActivityEdit(\'' + escHtml(activity.id) + '\')">Enregistrer</button>' +
        '</div></div></div>';
}

function openCrmDealHistoryModal() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var typeEl = document.getElementById('crmDealHistoryModalType');
    var textEl = document.getElementById('crmDealHistoryModalText');
    if (typeEl) typeEl.value = 'note';
    if (textEl) textEl.value = '';
    document.getElementById('crmDealHistoryModal').classList.add('active');
    setTimeout(function() { if (textEl) textEl.focus(); }, 50);
}

function closeCrmDealHistoryModal() {
    var modal = document.getElementById('crmDealHistoryModal');
    if (modal) modal.classList.remove('active');
}

function saveCrmDealHistoryModal() {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var textEl = document.getElementById('crmDealHistoryModalText');
    var typeEl = document.getElementById('crmDealHistoryModalType');
    var text = (textEl ? textEl.value : '').trim();
    if (!text) { alert('Saisissez un contenu.'); return; }
    ensureDealShape(deal);
    var authorName = currentUser ? ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim() : '—';
    deal.activities.unshift({
        id: crmNewId('act'),
        type: (typeEl ? typeEl.value : null) || 'note',
        text: text,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    });
    deal.updatedAt = new Date().toISOString();
    closeCrmDealHistoryModal();
    saveCrmData();
    renderCrmDealActivitiesTimeline(deal);
    if (typeof showToast === 'function') showToast('Entrée ajoutée à l\'historique', 'success');
}

function startEditCrmDealActivity(activityId) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var activity = (deal.activities || []).find(function(a) { return a.id === activityId; });
    if (!activity || !crmCanEditCrmEntry(activity)) return;
    crmV2EditingDealActivityId = activityId;
    var acts = (deal.activities || []).filter(function(a) { return a.type !== 'followup'; }).slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var idx = acts.findIndex(function(a) { return a.id === activityId; });
    if (idx >= CRM_DEAL_ACTIVITIES_PREVIEW) crmV2DealActivitiesExpanded = true;
    renderCrmDealActivitiesTimeline(deal);
}

function cancelEditCrmDealActivity() {
    crmV2EditingDealActivityId = null;
    var deal = getCrmDealById(crmV2DealId);
    if (deal) renderCrmDealActivitiesTimeline(deal);
}

function saveCrmDealActivityEdit(activityId) {
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var activity = (deal.activities || []).find(function(a) { return a.id === activityId; });
    if (!activity || !crmCanEditCrmEntry(activity)) return;
    var text = document.getElementById('crmEditDealActivityText').value.trim();
    if (!text) { alert('Le contenu ne peut pas être vide.'); return; }
    activity.type = document.getElementById('crmEditDealActivityType').value || 'note';
    activity.text = text;
    activity.updatedAt = new Date().toISOString();
    deal.updatedAt = new Date().toISOString();
    crmV2EditingDealActivityId = null;
    saveCrmData();
    renderCrmDealActivitiesTimeline(deal);
    if (typeof showToast === 'function') showToast('Activité modifiée', 'success');
}

function deleteCrmDealActivity(activityId) {
    if (!confirm('Supprimer cette activité ?')) return;
    var deal = getCrmDealById(crmV2DealId);
    if (!deal) return;
    var activity = (deal.activities || []).find(function(a) { return a.id === activityId; });
    if (!activity || !crmCanEditCrmEntry(activity)) return;
    if (activity) {
        (deal.internalNotes || []).forEach(function(n) {
            if (n && n.activityId === activityId) n.activityId = null;
        });
    }
    deal.activities = (deal.activities || []).filter(function(a) { return a.id !== activityId; });
    if (crmV2EditingDealActivityId === activityId) crmV2EditingDealActivityId = null;
    deal.updatedAt = new Date().toISOString();
    saveCrmData();
    renderCrmDealActivitiesTimeline(deal);
    if (typeof showToast === 'function') showToast('Activité supprimée', 'success');
}

function getCrmPipelineStagesForView() {
    return getCrmPipelineStages();
}

function getCrmPipelineDealsForView() {
    var open = getCrmAccessibleDeals().filter(function(d) { return d.status === 'open'; });
    if (crmV2PipelineLineId === CRM_PIPELINE_ALL) return open;
    return open.filter(function(d) { return d.activityLineId === crmV2PipelineLineId; });
}

function renderCrmKanbanCard(d, showLineBadge) {
    var org = getCrmDealProspectsLabel(d);
    var lineBadge = '';
    if (showLineBadge) {
        var dealLine = getCrmActivityLineById(d.activityLineId);
        if (dealLine) {
            lineBadge = '<span class="crm-kanban-line-badge" style="background:' + escHtml(dealLine.color || '#4a90d9') + '22;color:' + escHtml(dealLine.color || '#4a90d9') + ';">' +
                escHtml(crmActivityLineLabel(dealLine)) + '</span>';
        }
    }
    return '<div class="crm-kanban-card" draggable="true" data-deal-id="' + escHtml(d.id) + '" ' +
        'ondragstart="crmKanbanDragStart(event,\'' + d.id + '\')" onclick="openCrmDealFiche(\'' + d.id + '\')">' +
        (lineBadge ? '<div class="crm-kanban-card-badges">' + lineBadge + '</div>' : '') +
        '<div class="crm-kanban-card-title">' + escHtml(d.title) + '</div>' +
        '<div class="crm-kanban-card-org">' + escHtml(org) + '</div></div>';
}

function renderCrmKanban() {
    var board = document.getElementById('crmKanbanBoard');
    if (!board) return;
    var isAll = crmV2PipelineLineId === CRM_PIPELINE_ALL;
    if (!isAll && !getCrmActivityLineById(crmV2PipelineLineId)) {
        board.innerHTML = '<div class="crm-fiche-empty">Configurez une ligne d\'activité dans Paramètres → CRM.</div>';
        return;
    }
    var stages = getCrmPipelineStagesForView();
    var deals = getCrmPipelineDealsForView();
    var totalEl = document.getElementById('crmPipelineTotal');
    if (totalEl) {
        var scope = isAll ? 'toutes activités' : crmActivityLineLabel(getCrmActivityLineById(crmV2PipelineLineId));
        totalEl.textContent = deals.length + ' dossier' + (deals.length !== 1 ? 's' : '') + ' en cours — ' + scope;
    }

    board.innerHTML = stages.map(function(stage) {
        var colDeals = deals.filter(function(d) { return d.stage === stage; });
        var cards = colDeals.map(function(d) { return renderCrmKanbanCard(d, isAll); }).join('');
        return '<div class="crm-kanban-col" data-stage="' + escHtml(stage) + '" ondragover="crmKanbanDragOver(event)" ondrop="crmKanbanDrop(event,\'' + escHtml(stage).replace(/'/g, "\\'") + '\')">' +
            '<div class="crm-kanban-col-header"><span>' + escHtml(stage) + '</span><span class="crm-kanban-col-count">' + colDeals.length + '</span></div>' +
            '<div class="crm-kanban-col-body">' + cards + '</div></div>';
    }).join('');
}

function crmKanbanDragStart(ev, dealId) {
    crmV2DragDealId = dealId;
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}
function crmKanbanDragOver(ev) {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
}
function crmKanbanDrop(ev, stage) {
    ev.preventDefault();
    if (!crmV2DragDealId) return;
    var deal = (crmData.deals || []).find(function(d) { return d.id === crmV2DragDealId; });
    if (deal) {
        deal.stage = stage;
        deal.updatedAt = new Date().toISOString();
        var lostStages = ['perdu', 'lost', 'perdue'];
        var wonStages = ['gagné', 'gagne', 'contrat signé', 'clôturé', 'cloture', 'livré', 'livre'];
        var sl = stage.toLowerCase();
        if (lostStages.some(function(s) { return sl.indexOf(s) !== -1; })) deal.status = 'lost';
        else if (wonStages.some(function(s) { return sl.indexOf(s) !== -1; })) deal.status = 'won';
        saveCrmData();
        renderCrmKanban();
    }
    crmV2DragDealId = null;
}

function openCrmDealModal(dealId, prospectId) {
    if (dealId) {
        openCrmDealFiche(dealId);
        return;
    }
    openCrmDealModalInternal(null, prospectId);
}

var crmDealProspectPickData = [];
var crmDealProspectPickBound = false;

function buildCrmDealProspectPickData() {
    var out = [];
    var seen = {};
    (crmData.lists || []).filter(hasCrmListAccess).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            if (!p || !p.id || seen[p.id]) return;
            seen[p.id] = true;
            var listNames = getCrmProspectListNames(p);
            var listLabel = listNames.length ? listNames.join(', ') : (list.name || '');
            var contact = [p.contactPrenom, p.contactNom].filter(Boolean).join(' ');
            var structure = getCrmProspectStructure(p);
            var orgName = structure ? (structure.organisme || '') : (p.organisme || '');
            var label = getCrmProspectDisplayName(p) + (listLabel ? ' (' + listLabel + ')' : '');
            var sub = [contact, structure ? structure.ville : p.ville, structure ? structure.cp : p.cp].filter(Boolean).join(' · ');
            var searchBlob = [orgName, contact, structure ? structure.ville : p.ville, p.email, p.telFixe, p.telMobile, p.tel, listLabel].filter(Boolean).join(' ').toLowerCase();
            out.push({
                prospectId: p.id,
                listId: getCrmProspectStorageListId(p) || list.id,
                organisme: orgName || 'Sans nom',
                listName: listLabel,
                label: label,
                sub: sub,
                searchBlob: searchBlob
            });
        });
    });
    out.sort(function(a, b) { return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }); });
    return out;
}

function bindCrmDealProspectPickDocClick() {
    if (crmDealProspectPickBound) return;
    crmDealProspectPickBound = true;
    document.addEventListener('click', function(e) {
        var wrap = document.getElementById('crmDealProspectPickWrap');
        if (wrap && !wrap.contains(e.target)) {
            var r = document.getElementById('crmDealProspectResults');
            if (r) r.style.display = 'none';
        }
    });
}

function initCrmDealProspectPick(selectedProspectId, disabled) {
    bindCrmDealProspectPickDocClick();
    crmDealProspectPickData = buildCrmDealProspectPickData();
    var hidden = document.getElementById('crmDealProspect');
    var search = document.getElementById('crmDealProspectSearch');
    var results = document.getElementById('crmDealProspectResults');
    if (!hidden || !search) return;
    hidden.value = selectedProspectId || '';
    hidden.removeAttribute('data-list');
    if (selectedProspectId) {
        var found = crmDealProspectPickData.find(function(x) { return x.prospectId === selectedProspectId; });
        if (found) {
            hidden.setAttribute('data-list', found.listId);
            search.value = found.label;
        } else if (typeof findCrmProspect === 'function') {
            var fp = findCrmProspect(selectedProspectId);
            if (fp) {
                hidden.setAttribute('data-list', fp.list.id);
                search.value = (fp.prospect.organisme || '') + ' (' + (fp.list.name || '') + ')';
            }
        }
    } else {
        search.value = '';
    }
    search.disabled = !!disabled;
    if (results) results.style.display = 'none';
}

function openCrmDealProspectPickResults() {
    filterCrmDealProspectPick();
}

function filterCrmDealProspectPick() {
    var search = document.getElementById('crmDealProspectSearch');
    var hidden = document.getElementById('crmDealProspect');
    if (!search || search.disabled) return;
    var q = search.value.trim().toLowerCase();
    if (hidden && hidden.value) {
        var cur = crmDealProspectPickData.find(function(x) { return x.prospectId === hidden.value; });
        if (cur && search.value === cur.label) hidden.value = '';
    }
    renderCrmDealProspectPickResults(q);
}

function renderCrmDealProspectPickCreateFooter() {
    return '<div class="crm-pick-create-wrap"><button type="button" class="crm-deal-pick-create" onclick="openCrmProspectModalFromDealPick()">＋ Créer un prospect</button></div>';
}

function openCrmProspectModalFromDealPick() {
    var accessible = (crmData.lists || []).filter(hasCrmListAccess);
    if (!accessible.length) {
        alert('Créez d\'abord une liste pour classer vos prospects.');
        if (typeof openCrmListsManageModal === 'function') openCrmListsManageModal();
        return;
    }
    if (typeof crmProspectModalListId !== 'undefined') {
        crmProspectModalListId = accessible.length === 1 ? accessible[0].id : null;
    }
    window.crmProspectModalPickContext = { returnTo: 'deal_modal' };
    var searchEl = document.getElementById('crmDealProspectSearch');
    var searchQuery = searchEl ? searchEl.value.trim() : '';
    if (typeof openCrmProspectModal === 'function') openCrmProspectModal(null);
    if (searchQuery) {
        var orgEl = document.getElementById('crmProspOrg');
        if (orgEl && !orgEl.value) orgEl.value = searchQuery;
        if (typeof toggleCrmProspectStructureForm === 'function') toggleCrmProspectStructureForm('modal');
    }
    if (crmV2DealModalContext && crmV2DealModalContext.structureId && typeof renderCrmStructurePicker === 'function') {
        renderCrmStructurePicker('crmProspStructurePick', 'crmProspStructureId', crmV2DealModalContext.structureId);
        if (typeof toggleCrmProspectStructureForm === 'function') toggleCrmProspectStructureForm('modal');
    }
    var results = document.getElementById('crmDealProspectResults');
    if (results) results.style.display = 'none';
}

function renderCrmDealProspectPickResults(query) {
    var results = document.getElementById('crmDealProspectResults');
    if (!results) return;
    var search = document.getElementById('crmDealProspectSearch');
    var createFooter = search && !search.disabled ? renderCrmDealProspectPickCreateFooter() : '';
    var items = crmDealProspectPickData;
    if (query) {
        items = items.filter(function(x) {
            return x.searchBlob.indexOf(query) !== -1 || x.label.toLowerCase().indexOf(query) !== -1;
        });
    }
    var total = items.length;
    items = items.slice(0, 60);
    if (!total) {
        results.innerHTML = '<div class="crm-search-empty">' + (crmDealProspectPickData.length ? 'Aucun prospect trouvé' : 'Aucun prospect') + '</div>' + createFooter;
        results.style.display = 'block';
        return;
    }
    results.innerHTML = items.map(function(x) {
        return '<div class="crm-search-item" role="option" data-prospect="' + escHtml(x.prospectId) + '" data-list="' + escHtml(x.listId) + '">' +
            '<strong>' + escHtml(x.organisme) + '</strong> <small>' + escHtml(x.listName) + '</small>' +
            (x.sub ? '<div class="crm-pick-sub">' + escHtml(x.sub) + '</div>' : '') +
            '</div>';
    }).join('') + (total > 60 ? '<div class="crm-search-empty">+' + (total - 60) + ' autres — affinez la recherche</div>' : '') + createFooter;
    results.style.display = 'block';
    results.querySelectorAll('.crm-search-item').forEach(function(el) {
        el.onclick = function() { selectCrmDealProspectPick(el.getAttribute('data-prospect'), el.getAttribute('data-list')); };
    });
}

function selectCrmDealProspectPick(prospectId, listId) {
    var hidden = document.getElementById('crmDealProspect');
    var search = document.getElementById('crmDealProspectSearch');
    var results = document.getElementById('crmDealProspectResults');
    if (!hidden || !search) return;
    var item = crmDealProspectPickData.find(function(x) { return x.prospectId === prospectId; });
    hidden.value = prospectId;
    hidden.setAttribute('data-list', listId || (item && item.listId) || '');
    search.value = item ? item.label : search.value;
    if (results) results.style.display = 'none';
}

window.filterCrmDealProspectPick = filterCrmDealProspectPick;
window.openCrmDealProspectPickResults = openCrmDealProspectPickResults;
window.selectCrmDealProspectPick = selectCrmDealProspectPick;
window.openCrmProspectModalFromDealPick = openCrmProspectModalFromDealPick;

function openCrmDealModalInternal(dealId, prospectId, options) {
    crmV2DealModalContext = options || null;
    crmV2CurrentDeal = null;
    var deal = dealId ? getCrmDealById(dealId) : null;
    var found = prospectId ? findCrmProspect(prospectId) : (deal ? findCrmProspect(deal.prospectId) : null);
    if (deal) crmV2CurrentDeal = deal;

    document.getElementById('crmDealModalTitle').textContent = deal ? '✏️ Modifier le dossier' : '📁 Nouveau dossier';
    document.getElementById('crmDealTitle').value = deal ? deal.title : '';

    var initProspectId = prospectId || null;
    if (!initProspectId && deal) {
        if (typeof getCrmDealProspectIds === 'function') {
            var dealProspectIds = getCrmDealProspectIds(deal);
            if (dealProspectIds.length) initProspectId = dealProspectIds[0];
        } else if (deal.prospectId) {
            initProspectId = deal.prospectId;
        }
    }
    initCrmDealProspectPick(initProspectId, !!deal);

    var lineSel = document.getElementById('crmDealActivityLine');
    var lines = getActiveCrmActivityLines();
    lineSel.innerHTML = lines.map(function(line) {
        var sel = (deal && deal.activityLineId === line.id) || (!deal && found && found.list.activityLineId === line.id) || (!deal && crmV2PipelineLineId !== CRM_PIPELINE_ALL && line.id === crmV2PipelineLineId) ? ' selected' : '';
        return '<option value="' + line.id + '"' + sel + '>' + escHtml(crmActivityLineLabel(line)) + '</option>';
    }).join('');

    crmPopulateDealStages(deal ? deal.stage : null);
    if (typeof populateCrmWorkProjectSelect === 'function') {
        var wpSel = document.getElementById('crmDealWorkProject');
        var wpPreselect = deal ? deal.workProjectId : (options && options.workProjectId) || null;
        populateCrmWorkProjectSelect(wpSel, wpPreselect);
        if (wpSel && options && options.workProjectId && !deal) {
            wpSel.value = options.workProjectId;
            wpSel.disabled = true;
        } else if (wpSel) wpSel.disabled = false;
    }

    document.getElementById('crmDealDeleteBtn').style.display = deal ? '' : 'none';
    var wpBtn = document.getElementById('crmDealCreateWpBtn');
    if (wpBtn) {
        var showWp = deal && (deal.status === 'won' || (deal.stage && /gagn|won|sign/i.test(deal.stage)));
        wpBtn.style.display = showWp && typeof createWorkProjectFromCrmDeal === 'function' ? '' : 'none';
        if (showWp) wpBtn.onclick = function() { createWorkProjectFromCrmDeal(deal.id); closeCrmDealModal(); };
    }
    document.getElementById('crmDealModal').classList.add('active');
}

function crmPopulateDealStages(selectedStage) {
    var stages = getCrmPipelineStages();
    var stageSel = document.getElementById('crmDealStage');
    stageSel.innerHTML = stages.map(function(s) {
        var sel = selectedStage === s ? ' selected' : (!selectedStage && s === stages[0] ? ' selected' : '');
        return '<option value="' + escHtml(s) + '"' + sel + '>' + escHtml(s) + '</option>';
    }).join('');
}

function closeCrmDealModal() {
    document.getElementById('crmDealModal').classList.remove('active');
    crmV2CurrentDeal = null;
    crmV2DealModalContext = null;
    var wpSel = document.getElementById('crmDealWorkProject');
    if (wpSel) wpSel.disabled = false;
}

function saveCrmDeal(e) {
    if (e) e.preventDefault();
    var title = document.getElementById('crmDealTitle').value.trim();
    if (!title) return;
    var prospectHidden = document.getElementById('crmDealProspect');
    var prospectId = prospectHidden ? prospectHidden.value : '';
    if (!prospectId) { alert('Sélectionnez un prospect.'); return; }
    var listId = prospectHidden ? prospectHidden.getAttribute('data-list') : null;
    if (!listId && typeof findCrmProspect === 'function') {
        var fp = findCrmProspect(prospectId);
        if (fp) listId = fp.list.id;
    }
    var payload = {
        title: title,
        prospectIds: [prospectId],
        listId: listId,
        activityLineId: document.getElementById('crmDealActivityLine').value,
        stage: document.getElementById('crmDealStage').value,
        updatedAt: new Date().toISOString()
    };
    if (crmV2CurrentDeal) {
        payload.followUpDate = crmV2CurrentDeal.followUpDate || null;
        payload.followUpNote = crmV2CurrentDeal.followUpNote || '';
        payload.followUpAssigneeUserId = crmV2CurrentDeal.followUpAssigneeUserId || null;
    }
    if (!crmData.deals) crmData.deals = [];
    var savedDealId = null;
    var isNewDeal = !crmV2CurrentDeal;
    if (crmV2CurrentDeal) {
        payload.status = crmV2CurrentDeal.status || 'open';
        Object.assign(crmV2CurrentDeal, payload);
        ensureDealShape(crmV2CurrentDeal);
        savedDealId = crmV2CurrentDeal.id;
    } else {
        payload.id = crmNewId('deal');
        payload.status = 'open';
        payload.createdAt = new Date().toISOString();
        ensureDealShape(payload);
        crmData.deals.push(payload);
        savedDealId = payload.id;
    }
    saveCrmData();
    var wpSel = document.getElementById('crmDealWorkProject');
    var wpId = wpSel && !wpSel.disabled ? (wpSel.value || null) : (crmV2DealModalContext && crmV2DealModalContext.workProjectId) || null;
    if (typeof linkCrmDealToWorkProject === 'function') {
        linkCrmDealToWorkProject(savedDealId, wpId);
    }
    var fromStructureFiche = crmV2DealModalContext && crmV2DealModalContext.fromStructureFiche;
    closeCrmDealModal();
    if (document.getElementById('crmDealPage').classList.contains('active') && savedDealId) {
        renderCrmDealFiche();
    } else if (savedDealId && isNewDeal && !fromStructureFiche) {
        openCrmDealFiche(savedDealId);
    }
    if (document.getElementById('crmProspectPage').classList.contains('active')) renderCrmProspectFiche();
    renderCrmRelancesWidget();
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof renderCrmLists === 'function') renderCrmLists();
    if (fromStructureFiche || (document.getElementById('crmStructurePage') && document.getElementById('crmStructurePage').classList.contains('active') && crmV2StructureId)) {
        renderCrmStructureFiche();
    }
    if (typeof wpCurrentId !== 'undefined' && wpCurrentId && document.getElementById('workProjectPage') && document.getElementById('workProjectPage').classList.contains('active')) {
        var wp = typeof getWorkProjectById === 'function' ? getWorkProjectById(wpCurrentId) : null;
        if (wp && wpCurrentTab === 'commercial' && typeof renderWpCommercial === 'function') renderWpCommercial(wp);
    }
}

function deleteCrmDeal() {
    if (!crmV2CurrentDeal || !confirm('Supprimer ce dossier ?')) return;
    var deletedId = crmV2CurrentDeal.id;
    if (typeof unlinkCrmDealFromWorkProject === 'function') unlinkCrmDealFromWorkProject(deletedId);
    crmData.deals = (crmData.deals || []).filter(function(d) { return d.id !== deletedId; });
    saveCrmData();
    closeCrmDealModal();
    if (crmV2DealId === deletedId) {
        crmV2DealId = null;
        closeCrmDealFiche();
    }
    if (document.getElementById('crmProspectPage').classList.contains('active')) renderCrmProspectFiche();
    renderCrmRelancesWidget();
    if (typeof renderCrmDealsBrowse === 'function') renderCrmDealsBrowse();
    if (typeof renderCrmLists === 'function') renderCrmLists();
}

function getCrmFollowUps(options) {
    options = options || {};
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var items = [];

    (crmData.lists || []).filter(hasCrmListAccess).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            ensureProspectShape(p);
            if (!p.followUpDate) return;
            if (!crmFollowUpMatchesScope(p, true, options.mineOnly)) return;
            var d = crmParseFollowUpDate(p.followUpDate);
            if (!d) return;
            var assigneeId = getCrmFollowUpAssigneeUserId(p, true);
            items.push({
                kind: 'prospect',
                id: p.id,
                listId: list.id,
                title: p.organisme,
                subtitle: p.followUpNote || 'Relance prospect',
                date: p.followUpDate,
                dateSort: d.getTime(),
                overdue: d < today,
                assigneeUserId: assigneeId
            });
        });
    });
    (crmData.deals || []).forEach(function(deal) {
        if (deal.status !== 'open' || !deal.followUpDate) return;
        var list = crmData.lists.find(function(l) { return l.id === deal.listId; });
        if (list && !hasCrmListAccess(list)) return;
        if (!crmFollowUpMatchesScope(deal, false, options.mineOnly)) return;
        var d = crmParseFollowUpDate(deal.followUpDate);
        if (!d) return;
        var prospectLabel = getCrmDealProspectsLabel(deal);
        var assigneeId = getCrmFollowUpAssigneeUserId(deal, false);
        items.push({
            kind: 'deal',
            id: deal.id,
            title: deal.title,
            subtitle: (prospectLabel !== '—' ? prospectLabel + ' — ' : '') + (deal.followUpNote || 'Relance dossier'),
            date: deal.followUpDate,
            dateSort: d.getTime(),
            overdue: d < today,
            assigneeUserId: assigneeId
        });
    });
    items.sort(function(a, b) {
        if (a.dateSort !== b.dateSort) return a.dateSort - b.dateSort;
        return (a.title || '').localeCompare(b.title || '', 'fr');
    });
    return items;
}

function crmAppendFollowUpDoneActivity(entity, isDeal, plannedDate, note) {
    if (!entity) return;
    if (isDeal) ensureDealShape(entity);
    else ensureProspectShape(entity);
    var assigneeId = getCrmFollowUpAssigneeUserId(entity, !isDeal);
    var authorName = currentUser ? ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim() : '—';
    var text = 'Relance effectuée (prévue le ' + crmFormatDate(plannedDate) + ')';
    if (note && String(note).trim()) text += ' — ' + String(note).trim();
    if (!entity.activities) entity.activities = [];
    entity.activities.unshift({
        id: crmNewId('act'),
        type: 'followup',
        text: text,
        plannedDate: plannedDate,
        followUpNote: note || '',
        assigneeUserId: assigneeId || null,
        authorId: currentUser ? currentUser.id : null,
        authorName: authorName,
        createdAt: new Date().toISOString()
    });
}

function validateCrmFollowUp(kind, id) {
    if (!kind || !id) return;
    var plannedDate = null;
    var note = '';
    if (kind === 'deal') {
        var deal = getCrmDealById(id);
        if (!deal || !deal.followUpDate) return;
        plannedDate = deal.followUpDate;
        note = deal.followUpNote || '';
        crmAppendFollowUpDoneActivity(deal, true, plannedDate, note);
        deal.followUpDate = null;
        deal.followUpNote = '';
        deal.followUpAssigneeUserId = null;
        deal.updatedAt = new Date().toISOString();
    } else if (kind === 'prospect') {
        var found = findCrmProspect(id);
        if (!found || !found.prospect.followUpDate) return;
        plannedDate = found.prospect.followUpDate;
        note = found.prospect.followUpNote || '';
        crmAppendFollowUpDoneActivity(found.prospect, false, plannedDate, note);
        found.prospect.followUpDate = null;
        found.prospect.followUpNote = '';
        found.prospect.followUpAssigneeUserId = null;
    } else {
        return;
    }
    saveCrmData();
    if (kind === 'deal' && crmV2DealId === id) {
        var openDeal = getCrmDealById(id);
        if (openDeal) {
            clearCrmDealFollowUpForm();
            renderCrmDealFollowUpPending(openDeal);
            renderCrmDealFollowUpHistory(openDeal);
        }
    } else if (kind === 'prospect' && crmV2ProspectId === id) {
        var fp = findCrmProspect(id);
        if (fp) {
            document.getElementById('crmFicheFollowUpDate').value = '';
            document.getElementById('crmFicheFollowUpNote').value = '';
            var prospectFuAssigneeEl = document.getElementById('crmFicheFollowUpAssignee');
            if (prospectFuAssigneeEl) populateCrmUserSelect(prospectFuAssigneeEl, currentUser ? currentUser.id : '', true);
            renderCrmProspectFollowUpPending(fp.prospect);
            renderCrmProspectFollowUpHistory(fp.prospect);
        }
    }
    renderCrmRelancesWidget();
    if (typeof showToast === 'function') showToast('Relance validée', 'success');
}

function populateCrmFollowUpDealSelect() {
    var sel = document.getElementById('crmFollowUpDealId');
    if (!sel) return;
    var deals = (typeof getCrmAccessibleDeals === 'function' ? getCrmAccessibleDeals() : (crmData.deals || []))
        .filter(function(d) { return d.status === 'open'; })
        .slice()
        .sort(function(a, b) { return (a.title || '').localeCompare(b.title || '', 'fr'); });
    sel.innerHTML = '<option value="">— Choisir un dossier —</option>' + deals.map(function(d) {
        var label = (d.title || 'Sans titre') + (d.stage ? ' · ' + d.stage : '');
        var prospectLabel = getCrmDealProspectsLabel(d);
        if (prospectLabel !== '—') label += ' · ' + prospectLabel;
        return '<option value="' + escHtml(d.id) + '">' + escHtml(label) + '</option>';
    }).join('');
}

function populateCrmFollowUpProspectSelect() {
    var sel = document.getElementById('crmFollowUpProspectId');
    if (!sel) return;
    var prospects = getAllCrmProspectsUnique().filter(function(p) {
        var f = findCrmProspect(p.id);
        return f && hasCrmListAccess(f.list);
    }).sort(function(a, b) {
        return getCrmProspectDisplayName(a).localeCompare(getCrmProspectDisplayName(b), 'fr');
    });
    sel.innerHTML = '<option value="">— Choisir un prospect —</option>' + prospects.map(function(p) {
        var label = getCrmProspectDisplayName(p);
        var listNames = getCrmProspectListNames(p);
        if (listNames.length) label += ' (' + listNames.join(', ') + ')';
        return '<option value="' + escHtml(p.id) + '">' + escHtml(label) + '</option>';
    }).join('');
}

function toggleCrmFollowUpTargetPick() {
    var kind = document.getElementById('crmFollowUpKind');
    var dealGroup = document.getElementById('crmFollowUpDealGroup');
    var prospectGroup = document.getElementById('crmFollowUpProspectGroup');
    var dealSel = document.getElementById('crmFollowUpDealId');
    var prospectSel = document.getElementById('crmFollowUpProspectId');
    if (!kind) return;
    var isDeal = kind.value === 'deal';
    if (dealGroup) dealGroup.style.display = isDeal ? '' : 'none';
    if (prospectGroup) prospectGroup.style.display = isDeal ? 'none' : '';
    if (dealSel) dealSel.required = isDeal;
    if (prospectSel) prospectSel.required = !isDeal;
}

function openCrmFollowUpModal() {
    populateCrmFollowUpDealSelect();
    populateCrmFollowUpProspectSelect();
    var kindSel = document.getElementById('crmFollowUpKind');
    if (kindSel) kindSel.value = 'deal';
    toggleCrmFollowUpTargetPick();
    document.getElementById('crmFollowUpModalDate').value = '';
    document.getElementById('crmFollowUpModalNote').value = '';
    document.getElementById('crmFollowUpDealId').value = '';
    document.getElementById('crmFollowUpProspectId').value = '';
    populateCrmUserSelect(document.getElementById('crmFollowUpAssignee'), currentUser ? currentUser.id : '', true);
    document.getElementById('crmFollowUpModal').classList.add('active');
}

function closeCrmFollowUpModal() {
    document.getElementById('crmFollowUpModal').classList.remove('active');
}

function saveCrmFollowUpModal(e) {
    if (e) e.preventDefault();
    var kind = document.getElementById('crmFollowUpKind').value;
    var date = document.getElementById('crmFollowUpModalDate').value;
    var note = document.getElementById('crmFollowUpModalNote').value.trim();
    if (!date) { alert('Indiquez une date de relance.'); return; }
    var assigneeEl = document.getElementById('crmFollowUpAssignee');
    var assigneeId = assigneeEl && assigneeEl.value ? assigneeEl.value : null;
    if (kind === 'deal') {
        var dealId = document.getElementById('crmFollowUpDealId').value;
        if (!dealId) { alert('Sélectionnez un dossier.'); return; }
        var deal = getCrmDealById(dealId);
        if (!deal) { alert('Dossier introuvable.'); return; }
        deal.followUpDate = date;
        deal.followUpNote = note;
        deal.followUpAssigneeUserId = assigneeId;
        deal.updatedAt = new Date().toISOString();
        if (crmV2DealId === dealId) {
            clearCrmDealFollowUpForm();
            renderCrmDealFollowUpPending(deal);
        }
    } else {
        var prospectId = document.getElementById('crmFollowUpProspectId').value;
        if (!prospectId) { alert('Sélectionnez un prospect.'); return; }
        var found = findCrmProspect(prospectId);
        if (!found) { alert('Prospect introuvable.'); return; }
        found.prospect.followUpDate = date;
        found.prospect.followUpNote = note;
        found.prospect.followUpAssigneeUserId = assigneeId;
        if (crmV2ProspectId === prospectId) {
            document.getElementById('crmFicheFollowUpDate').value = date;
            document.getElementById('crmFicheFollowUpNote').value = note;
            var prospectFuAssignee = document.getElementById('crmFicheFollowUpAssignee');
            if (prospectFuAssignee) populateCrmUserSelect(prospectFuAssignee, assigneeId || '', true);
        }
    }
    saveCrmData();
    closeCrmFollowUpModal();
    renderCrmRelancesWidget();
    if (typeof showToast === 'function') showToast('Relance planifiée', 'success');
}

function getCrmRelancesBrowseScope() {
    var active = document.querySelector('.crm-relances-scope-tab.active');
    return active ? active.getAttribute('data-scope') : 'mine';
}

function setCrmRelancesBrowseScope(scope) {
    document.querySelectorAll('.crm-relances-scope-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-scope') === scope);
    });
    renderCrmRelancesBrowse();
}

function renderCrmRelancesBrowse() {
    var container = document.getElementById('crmRelancesBrowseList');
    if (!container) return;
    var scope = getCrmRelancesBrowseScope();
    var searchEl = document.getElementById('crmRelancesBrowseSearch');
    var search = (searchEl ? searchEl.value : '').toLowerCase().trim();
    var items = getCrmFollowUps({ mineOnly: scope === 'mine' });
    if (search) {
        items = items.filter(function(item) {
            var hay = [item.title, item.subtitle, item.date, getCrmUserDisplayName(item.assigneeUserId)].join(' ').toLowerCase();
            return hay.indexOf(search) !== -1;
        });
    }
    var empty = document.getElementById('crmRelancesBrowseEmpty');
    if (!items.length) {
        container.innerHTML = '';
        if (empty) {
            empty.style.display = '';
            var emptyText = empty.querySelector('div:nth-child(2)');
            if (emptyText) {
                emptyText.textContent = scope === 'mine' ? 'Aucune relance assignée à vous' : 'Aucune relance planifiée';
            }
        }
        return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = items.map(buildCrmRelanceCardHtml).join('');
}

function filterCrmRelancesBrowse() {
    renderCrmRelancesBrowse();
}

function renderCrmRelancesWidget() {
    if (typeof updateCrmHomeStats === 'function') updateCrmHomeStats();
    renderCrmRelancesBrowse();
    renderCrmHomeRelances();
    if (typeof renderHomeRelancesWidget === 'function') renderHomeRelancesWidget();
}

window.renderCrmRelancesBrowse = renderCrmRelancesBrowse;
window.filterCrmRelancesBrowse = filterCrmRelancesBrowse;
window.setCrmRelancesBrowseScope = setCrmRelancesBrowseScope;
window.openCrmFollowUpModal = openCrmFollowUpModal;
window.closeCrmFollowUpModal = closeCrmFollowUpModal;
window.saveCrmFollowUpModal = saveCrmFollowUpModal;
window.toggleCrmFollowUpTargetPick = toggleCrmFollowUpTargetPick;
window.validateCrmFollowUp = validateCrmFollowUp;
window.deleteCrmProspectFollowUp = deleteCrmProspectFollowUp;
window.addCrmActivityFromFiche = addCrmActivityFromFiche;
window.filterCrmStructureHistory = filterCrmStructureHistory;
window.openCrmBulkHistoryModal = openCrmBulkHistoryModal;
window.closeCrmBulkHistoryModal = closeCrmBulkHistoryModal;
window.executeCrmBulkHistory = executeCrmBulkHistory;
window.startEditCrmActivity = startEditCrmActivity;
window.cancelEditCrmActivity = cancelEditCrmActivity;
window.saveCrmActivityEdit = saveCrmActivityEdit;
window.deleteCrmActivity = deleteCrmActivity;

function crmGlobalSearchAppend(query, results, pushResult) {
    var q = (query || '').toLowerCase().trim();
    if (q.length < 2) return;
    var push = typeof pushResult === 'function'
        ? pushResult
        : function(key, item) { results.push(item); };

    (crmData.lists || []).filter(hasCrmListAccess).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            ensureProspectShape(p);
            var structure = getCrmProspectStructure(p);
            var hay = [
                getCrmProspectPersonName(p),
                getCrmProspectDisplayName(p),
                p.organisme, p.contactNom, p.contactPrenom, p.email, p.ville, p.notes, p.telephone,
                structure ? structure.organisme : ''
            ].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return;
            var name = getCrmProspectMentionLabel(p);
            var orgName = structure ? (structure.organisme || '') : (p.organisme || '');
            push('crm_p_' + p.id, {
                type: 'prospect',
                icon: '👤',
                title: name,
                subtitle: orgName ? ('CRM · Prospect · ' + orgName) : ('CRM · Prospect · ' + (list.name || 'Liste')),
                action: function() {
                    if (typeof openCrmPage === 'function') openCrmPage();
                    setTimeout(function() { openCrmProspectFiche(p.id); }, 150);
                }
            });
        });
    });

    (crmData.structures || []).forEach(function(s) {
        var hay = [s.organisme, s.ville, s.typeStructure, s.email, s.siret, s.adresse].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        push('crm_s_' + s.id, {
            type: 'structure',
            icon: '🏛️',
            title: s.organisme || 'Structure',
            subtitle: 'CRM · Structure' + (s.ville ? ' · ' + s.ville : ''),
            action: function() {
                if (typeof openCrmPage === 'function') openCrmPage();
                setTimeout(function() { openCrmStructureFiche(s.id); }, 150);
            }
        });
    });

    (crmData.deals || []).forEach(function(d) {
        var hay = [d.title, d.notes, d.description].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        var found = typeof findCrmProspect === 'function' ? findCrmProspect(d.prospectId) : null;
        var org = found && found.prospect ? found.prospect.organisme : '';
        push('crm_d_' + d.id, {
            type: 'dossier',
            icon: '📁',
            title: d.title || 'Dossier',
            subtitle: 'CRM · Dossier' + (org ? ' · ' + org : ''),
            action: function() {
                if (typeof openCrmPage === 'function') openCrmPage();
                setTimeout(function() { openCrmDealModal(d.id); }, 150);
            }
        });
    });
}
if (typeof window !== 'undefined') window.crmGlobalSearchAppend = crmGlobalSearchAppend;

function crmGlobalSearch(query) {
    query = (query || '').toLowerCase().trim();
    var results = document.getElementById('crmGlobalSearchResults');
    if (!results) return;
    if (!query || query.length < 2) { results.innerHTML = ''; results.style.display = 'none'; return; }
    var matches = buildCrmQuickSearchMatches(query);
    if (!matches.length) {
        results.innerHTML = '<div class="crm-search-empty">Aucun résultat</div>';
        results.style.display = 'block';
        return;
    }
    results.innerHTML = matches.slice(0, 15).map(function(m) { return m.html; }).join('');
    results.style.display = 'block';
}

function crmClearGlobalSearch() {
    var inp = document.getElementById('crmGlobalSearch');
    var results = document.getElementById('crmGlobalSearchResults');
    if (inp) inp.value = '';
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }
}
window.crmGlobalSearch = crmGlobalSearch;
window.crmClearGlobalSearch = crmClearGlobalSearch;

// --- Hooks intégration ---
(function() {
    var origLoad = loadCrmData;
    loadCrmData = async function() {
        await origLoad();
        migrateCrmData();
        renderCrmRelancesWidget();
        if (typeof refreshCrmDealTasksInTaskViews === 'function') refreshCrmDealTasksInTaskViews();
    };

    var origOpenCrm = openCrmPage;
    openCrmPage = function() {
        origOpenCrm();
        renderCrmRelancesWidget();
    };

    var origCloseAll = closeAllPages;
    closeAllPages = function() {
        origCloseAll();
        CRM_BROWSE_PAGE_IDS.concat(['crmProspectPage', 'crmStructurePage']).forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
    };

    // Remplacer édition tableau → fiche
    window.editCrmProspect = function(prospectId) {
        openCrmProspectFiche(prospectId);
    };

    var origDeleteProspect = deleteCrmProspect;
    deleteCrmProspect = function(prospectId) {
        (crmData.deals || []).forEach(function(d) {
            ensureDealShape(d);
            if (d.prospectIds) d.prospectIds = d.prospectIds.filter(function(id) { return id !== prospectId; });
            syncCrmDealProspectFields(d);
        });
        crmData.deals = (crmData.deals || []).filter(function(d) {
            return getCrmDealProspectIds(d).length > 0;
        });
        origDeleteProspect(prospectId);
    };

    var origDeleteList = deleteCrmList;
    deleteCrmList = function(id) {
        (crmData.deals || []).forEach(function(d) {
            ensureDealShape(d);
            if (d.listIds && d.listIds.indexOf(id) !== -1 || d.listId === id) {
                d.prospectIds = (d.prospectIds || []).filter(function(pid) {
                    var f = findCrmProspect(pid);
                    if (!f) return false;
                    var lids = getCrmProspectListIds(f.prospect);
                    if (lids.length) return lids.indexOf(id) === -1;
                    return f.list.id !== id;
                });
                syncCrmDealProspectFields(d);
            }
        });
        crmData.deals = (crmData.deals || []).filter(function(d) {
            return getCrmDealProspectIds(d).length > 0;
        });
        origDeleteList(id);
    };

    var origSaveProspect = saveCrmProspect;
    saveCrmProspect = function(e) {
        origSaveProspect(e);
        if (typeof renderCrmHomeProspects === 'function') renderCrmHomeProspects();
        if (crmV2ProspectId && document.getElementById('crmProspectPage').classList.contains('active')) {
            renderCrmProspectFiche();
        }
        if (document.getElementById('crmStructurePage') && document.getElementById('crmStructurePage').classList.contains('active') && crmV2StructureId) {
            renderCrmStructureFiche();
        }
    };
})();
