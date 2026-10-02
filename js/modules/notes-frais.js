// ========== MODULE NOTES DE FRAIS ==========

const NDF_TVA_OPTIONS = [20, 10, 5.5, 0];
const NDF_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
const NDF_FRAIS_TYPES = [
    { id: 'transport', label: 'Transport' },
    { id: 'carburant', label: 'Carburant' },
    { id: 'hebergement', label: 'Hébergement' },
    { id: 'nourriture', label: 'Nourriture' },
    { id: 'fourniture', label: 'Fourniture' },
    { id: 'autre', label: 'Autre' },
    { id: 'kilometrique', label: 'Kilométriques' }
];

let currentEditingNdfId = null;
let ndfLigneCounter = 0;

function getNdfCurrentUserId() {
    return currentUser?.id != null ? String(currentUser.id) : '';
}

function ndfNoteBelongsToUser(note, userId) {
    if (!note || !userId) return false;
    return String(note.userId != null ? note.userId : '') === String(userId);
}

function isNdfEditable(statut) {
    return ['brouillon', 'soumise', 'rejetee'].indexOf(statut) >= 0;
}

function isNdfDeletable(statut) {
    return isNdfEditable(statut);
}

function getNdfNotesForCurrentUser() {
    var uid = getNdfCurrentUserId();
    return notesfrais.filter(function(n) { return ndfNoteBelongsToUser(n, uid); });
}

function getNdfKmRate() {
    var v = parseFloat((typeof appSettings !== 'undefined' && appSettings.ndfKmRate) || 0.57);
    return isNaN(v) || v <= 0 ? 0.57 : v;
}

function getNdfAssociationLabel(note) {
    if (!note) return '—';
    if (note.associationType === 'texte_libre') return note.associationTexte || '—';
    if (note.associationType === 'crm_deal') {
        if (typeof crmData !== 'undefined' && crmData.deals) {
            var deal = crmData.deals.find(function(d) { return String(d.id) === String(note.associationId); });
            if (deal) return deal.title || 'Dossier CRM';
        }
        return note.associationLabel || 'Dossier CRM';
    }
    if (note.associationType === 'work_project') {
        if (typeof getWorkProjectById === 'function') {
            var p = getWorkProjectById(note.associationId);
            if (p) return p.title || 'Projet';
        }
        return note.associationLabel || 'Projet';
    }
    if (note.projetId && typeof projects !== 'undefined' && projects) {
        var proj = projects.find(function(p) { return p.id === note.projetId; });
        if (proj) return proj.name || proj.lieu || proj.id;
    }
    return '—';
}

function openNotesFrais() { openNotesFraisPage(); }

function openNotesFraisPage() {
    closeAllPages();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
    document.querySelectorAll('.nav-item').forEach(function(item) { item.classList.remove('active'); });
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    var page = document.getElementById('notesFraisPage');
    if (page) page.classList.add('active');
    loadNotesFrais();
}

function closeNotesFrais() {
    var page = document.getElementById('notesFraisPage');
    if (page) page.classList.remove('active');
    if (typeof returnToComptabiliteHome === 'function') returnToComptabiliteHome();
    else if (typeof navigateTo === 'function') navigateTo('home');
}

async function loadNotesFrais() {
    var localNotes = [];
    try {
        var raw = localStorage.getItem('notesfrais');
        localNotes = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(localNotes)) localNotes = [];
    } catch (e) {
        localNotes = [];
    }
    try {
        var data = await apiCall('notes_frais.php', 'GET');
        if (data && data.success && Array.isArray(data.notes)) {
            if (data.notes.length === 0 && localNotes.length > 0) {
                var uid = getNdfCurrentUserId();
                notesfrais = localNotes.map(function(n) {
                    if (!n.userId && uid) n.userId = Number(uid);
                    return n;
                });
                try {
                    await apiCall('notes_frais.php', 'POST', { notes: getNdfNotesForCurrentUser() });
                    showToast('Notes locales synchronisées sur le serveur', 'success');
                } catch (e) {
                    console.warn('loadNotesFrais: migration locale impossible', e);
                }
            } else {
                notesfrais = data.notes.map(function(n) {
                    if (n.userId == null && n.user_id != null) n.userId = Number(n.user_id);
                    return n;
                });
            }
            try { localStorage.setItem('notesfrais', JSON.stringify(notesfrais)); } catch (e) {}
            renderNotesFrais();
            return;
        }
    } catch (e) {
        console.warn('loadNotesFrais: serveur indisponible, fallback localStorage', e);
    }
    notesfrais = localNotes;
    renderNotesFrais();
}

async function saveNotesFrais() {
    try {
        localStorage.setItem('notesfrais', JSON.stringify(notesfrais));
        await apiCall('notes_frais.php', 'POST', { notes: getNdfNotesForCurrentUser() });
    } catch (e) {
        console.warn('saveNotesFrais: erreur serveur', e);
        showToast('Sauvegarde locale uniquement', 'warning');
    }
}

function hasNdfValidationPermission() {
    return userPermissions && userPermissions.notes_de_frais_validation && userPermissions.notes_de_frais_validation.can_view;
}

function filterNotesFrais() {
    renderNotesFrais();
}

function renderNotesFrais() {
    var list = document.getElementById('ndfCardsList');
    var empty = document.getElementById('ndfEmptyState');
    if (!list) return;
    var statutFilter = document.getElementById('ndfStatutFilter')?.value || 'all';
    var periodeVal = document.getElementById('ndfPeriodeFilter')?.value || '';
    var uid = getNdfCurrentUserId();
    var items = notesfrais.filter(function(n) {
        if (!ndfNoteBelongsToUser(n, uid)) return false;
        if (statutFilter !== 'all' && n.statut !== statutFilter) return false;
        if (periodeVal) {
            var parts = periodeVal.split('-');
            var d = n.dateDebut || n.createdAt || '';
            if (!d) return false;
            var nd = new Date(d);
            if (nd.getFullYear() !== parseInt(parts[0], 10) || (nd.getMonth() + 1) !== parseInt(parts[1], 10)) return false;
        }
        return true;
    });
    if (items.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = items.map(function(n) {
        var total = (n.lignes || []).reduce(function(s, l) { return s + (parseFloat(l.montantTTC) || 0); }, 0);
        var totalFmt = typeof formatMontant === 'function' ? formatMontant(total) : total.toFixed(2);
        var statutLabel = typeof getNdfStatutLabel === 'function' ? getNdfStatutLabel(n.statut) : n.statut;
        var assocLabel = getNdfAssociationLabel(n);
        var rejetInfo = (n.statut === 'rejetee' && (n.rejetMessage || n.rejetMotif))
            ? '<div class="ndf-card-meta" style="color: var(--mn-red);">Motif : ' + escapeHtml(n.rejetMessage || n.rejetMotif) + '</div>' : '';
        var actions = '';
        if (isNdfEditable(n.statut)) {
            actions += '<button class="btn btn-secondary" onclick="openEditNdfModal(\'' + n.id + '\')">Modifier</button> ';
        }
        if (n.statut === 'brouillon' || n.statut === 'rejetee') {
            actions += '<button class="btn" onclick="submitNdf(\'' + n.id + '\')">' + (n.statut === 'rejetee' ? 'Soumettre à nouveau' : 'Soumettre') + '</button> ';
        }
        if (isNdfDeletable(n.statut)) {
            actions += '<button class="btn btn-secondary" style="color: var(--mn-red); border-color: var(--mn-red);" onclick="deleteNdf(\'' + n.id + '\')">Supprimer</button>';
        }
        return '<div class="ndf-card compta-validation-card-clickable" data-id="' + n.id + '" onclick="openNdfDetailModal(\'' + n.id + '\', \'user\')">' +
            '<div class="ndf-card-header"><strong>' + escapeHtml(n.titre || 'Sans titre') + '</strong>' +
            '<span class="ndf-card-statut ndf-statut-' + n.statut + '">' + statutLabel + '</span></div>' +
            '<div class="ndf-card-meta">' + (typeof formatDate === 'function' ? formatDate(n.dateDebut) : (n.dateDebut || '')) +
            ' → ' + (typeof formatDate === 'function' ? formatDate(n.dateFin) : (n.dateFin || '')) +
            ' · ' + escapeHtml(assocLabel) + '</div>' +
            rejetInfo +
            '<div class="ndf-card-total">Total : ' + totalFmt + ' €</div>' +
            '<div class="ndf-card-actions" onclick="event.stopPropagation()">' + actions + '</div></div>';
    }).join('');
}

function renderNdfValidationList() {
    var list = document.getElementById('ndfValidationList');
    var empty = document.getElementById('ndfValidationEmpty');
    if (!list || !hasNdfValidationPermission()) return;
    var soumises = notesfrais.filter(function(n) { return n.statut === 'soumise'; });
    if (soumises.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = soumises.map(function(n) {
        var total = (n.lignes || []).reduce(function(s, l) { return s + (parseFloat(l.montantTTC) || 0); }, 0);
        var totalFmt = typeof formatMontant === 'function' ? formatMontant(total) : total.toFixed(2);
        return '<div class="ndf-card" data-id="' + n.id + '">' +
            '<div class="ndf-card-header"><strong>' + escapeHtml(n.titre || 'Sans titre') + '</strong></div>' +
            '<div class="ndf-card-meta">Par ' + escapeHtml(n.utilisateurNom || '') + ' · ' + escapeHtml(getNdfAssociationLabel(n)) + '</div>' +
            '<div class="ndf-card-total">' + totalFmt + ' €</div>' +
            '<div class="ndf-card-actions">' +
            '<button class="btn" onclick="approuveNdf(\'' + n.id + '\')">Approuver</button>' +
            '<button class="btn btn-secondary" onclick="openRejetNdfModal(\'' + n.id + '\')">Rejeter</button>' +
            '</div></div>';
    }).join('');
}

async function prepareNdfModalData() {
    if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
    populateNdfAssociationSelects();
}

async function openNewNdfModal() {
    currentEditingNdfId = null;
    document.getElementById('newNdfModalTitle').textContent = 'Nouvelle note de frais';
    document.getElementById('ndfTitre').value = '';
    document.getElementById('ndfAssociationType').value = '';
    document.getElementById('ndfAssociationDeal').value = '';
    document.getElementById('ndfAssociationProject').value = '';
    document.getElementById('ndfAssociationText').value = '';
    var today = new Date().toISOString().slice(0, 10);
    document.getElementById('ndfDateDebut').value = today;
    document.getElementById('ndfDateFin').value = today;
    var container = document.getElementById('ndfLignesContainer');
    container.innerHTML = '';
    addNdfLigne();
    recalcNdfTotal();
    onNdfAssociationTypeChange();
    updateNdfModalActions(null);
    await prepareNdfModalData();
    document.getElementById('newNdfModal').classList.add('active');
}

async function openNewNdfModalFromMail(file, opts) {
    opts = opts || {};
    if (!file) return;
    if (file.size > NDF_MAX_FILE_SIZE) {
        showToast('Fichier trop volumineux (max 10 Mo)', 'error');
        return;
    }
    currentEditingNdfId = null;
    document.getElementById('newNdfModalTitle').textContent = 'Nouvelle note de frais';
    var baseName = file.name.replace(/\.[^.]+$/, '');
    document.getElementById('ndfTitre').value = opts.titre || ('Mail — ' + baseName);
    document.getElementById('ndfAssociationType').value = '';
    document.getElementById('ndfAssociationDeal').value = '';
    document.getElementById('ndfAssociationProject').value = '';
    document.getElementById('ndfAssociationText').value = '';
    var today = new Date().toISOString().slice(0, 10);
    document.getElementById('ndfDateDebut').value = opts.dateDebut || today;
    document.getElementById('ndfDateFin').value = opts.dateFin || today;
    var container = document.getElementById('ndfLignesContainer');
    container.innerHTML = '';
    addNdfLigne({
        type: 'autre',
        description: opts.description || baseName,
        typeAutre: opts.typeAutre || 'Import mail',
    });
    recalcNdfTotal();
    onNdfAssociationTypeChange();
    updateNdfModalActions(null);
    await prepareNdfModalData();
    document.getElementById('newNdfModal').classList.add('active');
    var row = document.querySelector('#ndfLignesContainer .ndf-ligne-row');
    if (row) {
        var nameEl = row.querySelector('.ndf-justif-name');
        if (nameEl) nameEl.textContent = 'Envoi du justificatif…';
        await setNdfLigneJustificatifFile(row, file);
    }
}
if (typeof window !== 'undefined') window.openNewNdfModalFromMail = openNewNdfModalFromMail;

async function openEditNdfModal(id) {
    var note = notesfrais.find(function(n) { return n.id === id; });
    if (!note) return;
    if (!isNdfEditable(note.statut)) {
        showToast('Cette note ne peut plus être modifiée', 'error');
        return;
    }
    currentEditingNdfId = id;
    document.getElementById('newNdfModalTitle').textContent = 'Modifier la note de frais';
    document.getElementById('ndfTitre').value = note.titre || '';
    document.getElementById('ndfDateDebut').value = (note.dateDebut || '').toString().slice(0, 10);
    document.getElementById('ndfDateFin').value = (note.dateFin || '').toString().slice(0, 10);
    var container = document.getElementById('ndfLignesContainer');
    container.innerHTML = '';
    (note.lignes || []).forEach(function(l) { addNdfLigne(l); });
    if ((note.lignes || []).length === 0) addNdfLigne();
    recalcNdfTotal();
    await prepareNdfModalData();
    if (note.associationType) {
        document.getElementById('ndfAssociationType').value = note.associationType;
    } else if (note.projetId) {
        document.getElementById('ndfAssociationType').value = '';
    }
    onNdfAssociationTypeChange();
    if (note.associationType === 'crm_deal') document.getElementById('ndfAssociationDeal').value = note.associationId || '';
    if (note.associationType === 'work_project') document.getElementById('ndfAssociationProject').value = note.associationId || '';
    if (note.associationType === 'texte_libre') document.getElementById('ndfAssociationText').value = note.associationTexte || '';
    updateNdfModalActions(note.statut);
    document.getElementById('newNdfModal').classList.add('active');
}

function updateNdfModalActions(statut) {
    var draftBtn = document.getElementById('ndfSaveDraftBtn');
    var submitBtn = document.getElementById('ndfSubmitBtn');
    if (!draftBtn || !submitBtn) return;
    if (!statut || statut === 'brouillon') {
        draftBtn.textContent = 'Sauvegarder brouillon';
        submitBtn.style.display = '';
        submitBtn.textContent = 'Soumettre pour validation';
    } else if (statut === 'soumise') {
        draftBtn.textContent = 'Enregistrer les modifications';
        submitBtn.style.display = 'none';
    } else if (statut === 'rejetee') {
        draftBtn.textContent = 'Sauvegarder brouillon';
        submitBtn.style.display = '';
        submitBtn.textContent = 'Soumettre à nouveau';
    }
}

function closeNewNdfModal() {
    document.getElementById('newNdfModal').classList.remove('active');
    currentEditingNdfId = null;
}

function onNdfAssociationTypeChange() {
    var type = document.getElementById('ndfAssociationType')?.value || '';
    var dealG = document.getElementById('ndfAssociationDealGroup');
    var projG = document.getElementById('ndfAssociationProjectGroup');
    var textG = document.getElementById('ndfAssociationTextGroup');
    if (dealG) dealG.style.display = type === 'crm_deal' ? '' : 'none';
    if (projG) projG.style.display = type === 'work_project' ? '' : 'none';
    if (textG) textG.style.display = type === 'texte_libre' ? '' : 'none';
}

function populateNdfAssociationSelects() {
    var dealSel = document.getElementById('ndfAssociationDeal');
    var projSel = document.getElementById('ndfAssociationProject');
    if (dealSel) {
        var html = '<option value="">— Choisir un dossier —</option>';
        var deals = typeof getCrmAccessibleDeals === 'function' ? getCrmAccessibleDeals() : ((typeof crmData !== 'undefined' && crmData.deals) ? crmData.deals : []);
        deals.slice().sort(function(a, b) { return (a.title || '').localeCompare(b.title || '', 'fr'); }).forEach(function(d) {
            html += '<option value="' + d.id + '">' + escapeHtml((d.title || 'Dossier') + (d.stage ? ' · ' + d.stage : '')) + '</option>';
        });
        dealSel.innerHTML = html;
    }
    if (projSel) {
        var phtml = '<option value="">— Choisir un projet —</option>';
        var list = typeof getActiveWorkProjects === 'function' ? getActiveWorkProjects() : [];
        list.slice().sort(function(a, b) { return (a.title || '').localeCompare(b.title || '', 'fr'); }).forEach(function(p) {
            phtml += '<option value="' + p.id + '">' + escapeHtml((p.icon || '📁') + ' ' + (p.title || 'Projet')) + '</option>';
        });
        projSel.innerHTML = phtml;
    }
}

function getNdfFraisTypeLabel(typeId) {
    var t = NDF_FRAIS_TYPES.find(function(x) { return x.id === typeId; });
    return t ? t.label : typeId;
}

function addNdfLigne(data) {
    ndfLigneCounter++;
    var ligneId = 'ndfl_' + Date.now() + '_' + ndfLigneCounter;
    var container = document.getElementById('ndfLignesContainer');
    if (!container) return;
    var type = (data && data.type) || (data && data.categorie) || 'transport';
    if (['autres_depenses', 'restauration', 'deplacement'].indexOf(type) >= 0) type = 'autre';
    var typeOptions = NDF_FRAIS_TYPES.map(function(t) {
        return '<option value="' + t.id + '"' + (type === t.id ? ' selected' : '') + '>' + t.label + '</option>';
    }).join('');
    var tvaOptions = NDF_TVA_OPTIONS.map(function(t) {
        var sel = (data && data.tauxTVA == t) || (!data && t === 20) ? ' selected' : '';
        return '<option value="' + t + '"' + sel + '>' + t + '%</option>';
    }).join('');
    var kmRate = getNdfKmRate();
    var row = document.createElement('div');
    row.className = 'ndf-ligne-row';
    row.dataset.ligneId = ligneId;
    row.innerHTML =
        '<div class="ndf-ligne-fields">' +
            '<select class="ndf-ligne-type" onchange="onNdfLigneTypeChange(this)">' + typeOptions + '</select>' +
            '<input type="text" class="ndf-ligne-desc" placeholder="Description" value="' + (data ? escapeHtml(data.description || '') : '') + '">' +
            '<input type="text" class="ndf-ligne-autre-detail" placeholder="Précisez le type de dépense" value="' + (data ? escapeHtml(data.typeAutre || '') : '') + '" style="display:none;">' +
            '<div class="ndf-ligne-standard-fields">' +
                '<input type="number" class="ndf-ligne-ttc" step="0.01" min="0" placeholder="Montant TTC" value="' + (data && data.type !== 'kilometrique' && data.montantTTC != null ? data.montantTTC : '') + '" oninput="recalcNdfTotal()">' +
                '<select class="ndf-ligne-tva" onchange="recalcNdfTotal()">' + tvaOptions + '</select>' +
                '<span class="ndf-ligne-tva-calc">TVA : 0,00 €</span>' +
            '</div>' +
            '<div class="ndf-ligne-km-fields" style="display:none;">' +
                '<input type="number" class="ndf-ligne-km" step="0.1" min="0" placeholder="Km parcourus" value="' + (data && data.kilometres != null ? data.kilometres : '') + '" oninput="recalcNdfTotal()">' +
                '<span class="ndf-ligne-km-montant">0,00 €</span>' +
                '<small class="ndf-ligne-km-hint">Tarif : ' + (typeof formatMontant === 'function' ? formatMontant(kmRate) : kmRate.toFixed(2)) + ' €/km</small>' +
            '</div>' +
            '<div class="ndf-justif-upload">' +
                '<input type="file" id="ndfJustif_' + ligneId + '" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style="display:none" onchange="handleNdfJustifUpload(this, \'' + ligneId + '\')">' +
                '<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'ndfJustif_' + ligneId + '\').click()">📎 Joindre</button>' +
                '<span class="ndf-justif-name"></span>' +
            '</div>' +
            '<button type="button" class="btn btn-secondary ndf-ligne-remove" onclick="removeNdfLigne(this)" title="Supprimer">✕</button>' +
        '</div>';
    container.appendChild(row);
    var typeSel = row.querySelector('.ndf-ligne-type');
    if (typeSel) onNdfLigneTypeChange(typeSel);
    if (data && data.justificatif && type !== 'kilometrique') {
        var j = data.justificatif;
        if (j.file_id && j.url) {
            row.dataset.justifFileId = j.file_id;
            row.dataset.justifUrl = j.url;
        } else if (j.base64) {
            row.dataset.justifBase64 = j.base64;
        }
        row.dataset.justifName = j.nom || 'Fichier';
        var nameEl = row.querySelector('.ndf-justif-name');
        if (nameEl) nameEl.textContent = j.nom || 'Fichier';
    }
    recalcNdfTotal();
}

function clearNdfLigneJustificatif(row) {
    if (!row) return;
    delete row.dataset.justifFileId;
    delete row.dataset.justifUrl;
    delete row.dataset.justifBase64;
    delete row.dataset.justifName;
    var nameEl = row.querySelector('.ndf-justif-name');
    if (nameEl) nameEl.textContent = '';
    var fileInput = row.querySelector('.ndf-justif-upload input[type="file"]');
    if (fileInput) fileInput.value = '';
}

function onNdfLigneTypeChange(selectOrRow) {
    var row = selectOrRow.classList && selectOrRow.classList.contains('ndf-ligne-row') ? selectOrRow : selectOrRow.closest('.ndf-ligne-row');
    if (!row) return;
    var type = row.querySelector('.ndf-ligne-type')?.value || 'transport';
    var isKm = type === 'kilometrique';
    var isAutre = type === 'autre';
    var std = row.querySelector('.ndf-ligne-standard-fields');
    var km = row.querySelector('.ndf-ligne-km-fields');
    var autre = row.querySelector('.ndf-ligne-autre-detail');
    var justif = row.querySelector('.ndf-justif-upload');
    if (std) std.style.display = isKm ? 'none' : '';
    if (km) km.style.display = isKm ? '' : 'none';
    if (autre) autre.style.display = isAutre ? '' : 'none';
    if (justif) justif.style.display = isKm ? 'none' : '';
    if (isKm) clearNdfLigneJustificatif(row);
    recalcNdfTotal();
}

function removeNdfLigne(btn) {
    var row = btn.closest('.ndf-ligne-row');
    if (row) row.remove();
    recalcNdfTotal();
}

function recalcNdfLigneRow(row) {
    var type = row.querySelector('.ndf-ligne-type')?.value || 'transport';
    var tvaSpan = row.querySelector('.ndf-ligne-tva-calc');
    var kmMontantSpan = row.querySelector('.ndf-ligne-km-montant');
    if (type === 'kilometrique') {
        var km = parseFloat(row.querySelector('.ndf-ligne-km')?.value) || 0;
        var ttc = Math.round(km * getNdfKmRate() * 100) / 100;
        if (kmMontantSpan) kmMontantSpan.textContent = (typeof formatMontant === 'function' ? formatMontant(ttc) : ttc.toFixed(2)) + ' €';
        return ttc;
    }
    var ttc = parseFloat(row.querySelector('.ndf-ligne-ttc')?.value) || 0;
    var taux = parseFloat(row.querySelector('.ndf-ligne-tva')?.value) || 20;
    var tva = ttc - (ttc / (1 + taux / 100));
    if (tvaSpan) tvaSpan.textContent = 'TVA : ' + (typeof formatMontant === 'function' ? formatMontant(tva) : tva.toFixed(2)) + ' €';
    return ttc;
}

function recalcNdfTotal() {
    var total = 0;
    document.querySelectorAll('.ndf-ligne-row').forEach(function(row) {
        total += recalcNdfLigneRow(row);
    });
    var el = document.getElementById('ndfTotalTTC');
    if (el) el.textContent = (typeof formatMontant === 'function' ? formatMontant(total) : total.toFixed(2)) + ' €';
}

async function setNdfLigneJustificatifFile(row, file) {
    if (!row || !file) return false;
    if (file.size > NDF_MAX_FILE_SIZE) {
        showToast('Fichier trop volumineux (max 10 Mo)', 'error');
        return false;
    }
    if ((row.querySelector('.ndf-ligne-type')?.value || '') === 'kilometrique') return false;
    var nameEl = row.querySelector('.ndf-justif-name');
    try {
        var uploaded = await uploadFile(file, 'documents');
        row.dataset.justifFileId = uploaded.file_id;
        row.dataset.justifUrl = uploaded.url || uploaded.downloadUrl;
        row.dataset.justifName = file.name;
        delete row.dataset.justifBase64;
        if (nameEl) nameEl.textContent = file.name;
        return true;
    } catch (err) {
        console.error('Erreur upload justificatif:', err);
        showToast('Erreur lors de l\'upload. Vérifiez votre connexion.', 'error');
        if (nameEl) nameEl.textContent = '';
        return false;
    }
}

async function handleNdfJustifUpload(input, ligneId) {
    var file = input.files && input.files[0];
    if (!file) return;
    var row = document.querySelector('.ndf-ligne-row[data-ligne-id="' + ligneId + '"]');
    if (!row) return;
    await setNdfLigneJustificatifFile(row, file);
}

function getNdfAssociationFormData(allowIncomplete) {
    var type = document.getElementById('ndfAssociationType')?.value || '';
    var data = { associationType: type || null, associationId: null, associationTexte: null, associationLabel: null, projetId: null };
    if (type === 'crm_deal') {
        data.associationId = document.getElementById('ndfAssociationDeal')?.value || '';
        var dealOpt = document.getElementById('ndfAssociationDeal')?.selectedOptions[0];
        data.associationLabel = dealOpt ? dealOpt.textContent : '';
        if (!data.associationId && !allowIncomplete) { showToast('Choisissez un dossier CRM', 'error'); return null; }
    } else if (type === 'work_project') {
        data.associationId = document.getElementById('ndfAssociationProject')?.value || '';
        var projOpt = document.getElementById('ndfAssociationProject')?.selectedOptions[0];
        data.associationLabel = projOpt ? projOpt.textContent : '';
        if (!data.associationId && !allowIncomplete) { showToast('Choisissez un projet', 'error'); return null; }
    } else if (type === 'texte_libre') {
        data.associationTexte = document.getElementById('ndfAssociationText')?.value?.trim() || '';
        if (!data.associationTexte && !allowIncomplete) { showToast('Indiquez un libellé pour le rattachement', 'error'); return null; }
    }
    return data;
}

function getNdfFormData(options) {
    options = options || {};
    var allowIncomplete = !!options.allowIncomplete;
    var titre = document.getElementById('ndfTitre')?.value?.trim() || '';
    var dateDebut = document.getElementById('ndfDateDebut')?.value || '';
    var dateFin = document.getElementById('ndfDateFin')?.value || '';
    var assoc = getNdfAssociationFormData(allowIncomplete);
    if (assoc === null) return null;
    var lignes = [];
    var valid = true;
    document.querySelectorAll('.ndf-ligne-row').forEach(function(row) {
        var type = row.querySelector('.ndf-ligne-type')?.value || 'transport';
        var desc = row.querySelector('.ndf-ligne-desc')?.value?.trim() || '';
        if (!desc && !allowIncomplete) { valid = false; return; }
        var typeAutre = row.querySelector('.ndf-ligne-autre-detail')?.value?.trim() || '';
        if (type === 'autre' && !typeAutre && !allowIncomplete) { valid = false; return; }
        var ttc, ht, tva, tauxTVA, kilometres = null;
        if (type === 'kilometrique') {
            kilometres = parseFloat(row.querySelector('.ndf-ligne-km')?.value) || 0;
            if (kilometres <= 0 && !allowIncomplete) { valid = false; return; }
            ttc = Math.round(kilometres * getNdfKmRate() * 100) / 100;
            tauxTVA = 0;
            ht = ttc;
            tva = 0;
        } else {
            ttc = parseFloat(row.querySelector('.ndf-ligne-ttc')?.value) || 0;
            if (ttc <= 0 && !allowIncomplete) { valid = false; return; }
            tauxTVA = parseFloat(row.querySelector('.ndf-ligne-tva')?.value) || 20;
            ht = ttc / (1 + tauxTVA / 100);
            tva = ttc - ht;
        }
        var justificatif = null;
        if (type !== 'kilometrique') {
            var justifFileId = row.dataset.justifFileId || '';
            var justifUrl = row.dataset.justifUrl || '';
            var justifBase64 = row.dataset.justifBase64 || '';
            var justifName = row.dataset.justifName || '';
            if (justifFileId && justifUrl) {
                justificatif = { file_id: justifFileId, url: justifUrl, nom: justifName, stored_externally: true };
            } else if (justifBase64) {
                justificatif = { base64: justifBase64, nom: justifName };
            }
        }
        lignes.push({
            id: row.dataset.ligneId,
            type: type,
            categorie: type,
            description: desc,
            typeAutre: typeAutre || null,
            kilometres: kilometres,
            montantTTC: ttc,
            montantHT: ht,
            montantTVA: tva,
            tauxTVA: tauxTVA,
            justificatif: justificatif
        });
    });
    if (!valid && !allowIncomplete) {
        showToast('Complétez toutes les lignes de frais (description, montant ou km)', 'error');
        return null;
    }
    if (!lignes.length && !allowIncomplete) {
        showToast('Ajoutez au moins une ligne de frais', 'error');
        return null;
    }
    return Object.assign({ titre: titre, dateDebut: dateDebut, dateFin: dateFin, lignes: lignes }, assoc);
}

function buildNdfNote(form, statut) {
    var id = currentEditingNdfId || 'ndf_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var existing = notesfrais.find(function(n) { return n.id === id; });
    var userName = (currentUser && (currentUser.prenom || currentUser.nom || currentUser.username))
        ? [currentUser.prenom, currentUser.nom].filter(Boolean).join(' ') || currentUser.username : 'Utilisateur';
    return {
        id: id,
        titre: form.titre,
        associationType: form.associationType,
        associationId: form.associationId,
        associationTexte: form.associationTexte,
        associationLabel: form.associationLabel,
        projetId: null,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
        userId: currentUser?.id != null ? Number(currentUser.id) : null,
        utilisateurNom: userName,
        statut: statut,
        lignes: form.lignes,
        createdAt: existing?.createdAt || new Date().toISOString()
    };
}

function saveNdfDraft() {
    var form = getNdfFormData({ allowIncomplete: true });
    if (!form) return;
    var existing = currentEditingNdfId ? notesfrais.find(function(n) { return n.id === currentEditingNdfId; }) : null;
    var statut = (existing && existing.statut === 'soumise') ? 'soumise' : 'brouillon';
    var note = buildNdfNote(form, statut);
    var idx = notesfrais.findIndex(function(n) { return n.id === note.id; });
    if (idx >= 0) notesfrais[idx] = note; else notesfrais.push(note);
    saveNotesFrais();
    closeNewNdfModal();
    renderNotesFrais();
    showToast(statut === 'soumise' ? 'Modifications enregistrées' : 'Brouillon enregistré', 'success');
}

function submitNdfFromModal() {
    var form = getNdfFormData();
    if (!form) return;
    if (!form.titre) { showToast('Indiquez un titre', 'error'); return; }
    var note = buildNdfNote(form, 'soumise');
    delete note.rejetMotif;
    delete note.rejetMessage;
    var idx = notesfrais.findIndex(function(n) { return n.id === note.id; });
    if (idx >= 0) notesfrais[idx] = note; else notesfrais.push(note);
    saveNotesFrais();
    closeNewNdfModal();
    renderNotesFrais();
    notifyNdfAdmins(note);
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    if (typeof updateComptabiliteHomeTiles === 'function') updateComptabiliteHomeTiles();
    showToast('Note soumise pour validation', 'success');
}

function submitNdf(id) {
    var note = notesfrais.find(function(n) { return n.id === id; });
    if (!note || (note.statut !== 'brouillon' && note.statut !== 'rejetee')) return;
    note.statut = 'soumise';
    delete note.rejetMotif;
    delete note.rejetMessage;
    saveNotesFrais();
    renderNotesFrais();
    notifyNdfAdmins(note);
    showToast('Note soumise pour validation', 'success');
}

function deleteNdf(id) {
    var note = notesfrais.find(function(n) { return n.id === id; });
    if (!note) return;
    var isValidator = hasNdfValidationPermission();
    if (!isValidator && !ndfNoteBelongsToUser(note, getNdfCurrentUserId())) return;
    if (!isValidator && !isNdfDeletable(note.statut)) {
        showToast('Cette note ne peut plus être supprimée', 'error');
        return;
    }
    var titre = note.titre || 'Sans titre';
    if (!confirm('Supprimer la note « ' + titre + ' » ?\n\nCette action est irréversible.')) return;
    notesfrais = notesfrais.filter(function(n) { return n.id !== id; });
    if (currentEditingNdfId === id) closeNewNdfModal();
    if (currentNdfDetailId === id) closeNdfDetailModal();
    saveNotesFrais();
    renderNotesFrais();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    showToast('Note supprimée', 'success');
}
if (typeof window !== 'undefined') window.deleteNdf = deleteNdf;

function notifyNdfAdmins(note) {
    if (typeof loadUsersForAssignments !== 'function') return;
    var title = 'Note de frais à valider';
    var message = (note.utilisateurNom || 'Un utilisateur') + ' a soumis la note « ' + (note.titre || 'Sans titre') + ' ».';
    if (typeof notifyUserAssigned === 'function') {
        (window.allUsers || []).filter(function(u) { return u.permissions && u.permissions.notes_de_frais_validation; }).forEach(function(u) {
            if (String(u.id) !== String(currentUser?.id)) notifyUserAssigned(u.id, title, message, 'info', { type: 'notes_frais' });
        });
    }
}

function approuveNdf(id) {
    if (!hasNdfValidationPermission()) return;
    var note = notesfrais.find(function(n) { return n.id === id; });
    if (!note || note.statut !== 'soumise') return;
    if (typeof comptaTransactions === 'undefined' || typeof comptaJustificatifs === 'undefined') {
        showToast('Module comptabilité non chargé', 'error');
        return;
    }
    var date = note.dateDebut || new Date().toISOString().slice(0, 10);
    (note.lignes || []).forEach(function(ligne) {
        var transId = 'tx_ndf_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        var justifId = ligne.type === 'kilometrique' ? null : ('j_ndf_' + Date.now() + '_' + Math.random().toString(36).slice(2));
        var ttc = parseFloat(ligne.montantTTC) || 0;
        var ht = parseFloat(ligne.montantHT) || (ttc / (1 + (parseFloat(ligne.tauxTVA) || 20) / 100));
        var tva = ttc - ht;
        var libelle = ligne.description || 'Note de frais';
        if (ligne.type === 'autre' && ligne.typeAutre) libelle += ' (' + ligne.typeAutre + ')';
        if (ligne.type === 'kilometrique' && ligne.kilometres) libelle += ' (' + ligne.kilometres + ' km)';
        comptaTransactions.push({
            id: transId,
            date: date,
            libelle: libelle,
            montantTTC: ttc,
            montantHT: ht,
            montantTVA: tva,
            tauxTVA: ligne.tauxTVA || 20,
            type: 'debit',
            categorie: ligne.type || ligne.categorie || 'autre',
            projetId: note.associationType === 'work_project' ? (note.associationId || '') : '',
            statut: 'rapproche',
            source: 'note_frais',
            ndfId: note.id,
            justificatifId: justifId
        });
        if (justifId) {
        var justif = ligne.justificatif;
        comptaJustificatifs.push({
            id: justifId,
            nom: libelle,
            date: date,
            fournisseur: note.utilisateurNom || '',
            montantTTC: ttc,
            montantHT: ht,
            montantTVA: tva,
            tauxTVA: ligne.tauxTVA || 20,
            statut: 'rapproche',
            transactionId: transId,
            file_id: (justif && justif.file_id) ? justif.file_id : null,
            fileUrl: (justif && justif.url) ? justif.url : null,
            fileBase64: (justif && justif.base64) ? justif.base64 : null,
            fileName: (justif && justif.nom) ? justif.nom : null,
            source: 'note_frais'
        });
        }
    });
    if (typeof saveComptaData === 'function') saveComptaData();
    note.statut = 'approuvee';
    saveNotesFrais();
    renderNotesFrais();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    if (typeof updateComptabiliteHomeTiles === 'function') updateComptabiliteHomeTiles();
    if (typeof closeNdfDetailModal === 'function') closeNdfDetailModal();
    showToast('Note approuvée et intégrée en comptabilité', 'success');
}

function openRejetNdfModal(id) {
    document.getElementById('rejetNdfId').value = id;
    document.getElementById('rejetNdfMotif').value = 'autre';
    document.getElementById('rejetNdfMessage').value = '';
    document.getElementById('rejetNdfModal').classList.add('active');
}

function closeRejetNdfModal() {
    document.getElementById('rejetNdfModal').classList.remove('active');
}

function confirmRejetNdf() {
    var id = document.getElementById('rejetNdfId').value;
    var motif = document.getElementById('rejetNdfMotif').value;
    var message = document.getElementById('rejetNdfMessage').value.trim();
    rejeterNdf(id, motif, message);
    closeRejetNdfModal();
}

function rejeterNdf(id, motif, message) {
    if (!hasNdfValidationPermission()) return;
    var note = notesfrais.find(function(n) { return n.id === id; });
    if (!note || note.statut !== 'soumise') return;
    note.statut = 'rejetee';
    note.rejetMotif = motif;
    note.rejetMessage = message;
    saveNotesFrais();
    renderNotesFrais();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    if (typeof updateComptabiliteHomeTiles === 'function') updateComptabiliteHomeTiles();
    if (typeof closeNdfDetailModal === 'function') closeNdfDetailModal();
    if (note.userId && typeof notifyUserAssigned === 'function') {
        notifyUserAssigned(note.userId, 'Note de frais rejetée', 'Votre note « ' + (note.titre || 'Sans titre') + ' » a été rejetée.' + (message ? ' ' + message : ''), 'info');
    }
    showToast('Note rejetée', 'success');
}

function marquerRembourse(id) {
    if (!hasNdfValidationPermission()) return;
    var note = notesfrais.find(function(n) { return n.id === id; });
    if (!note || note.statut !== 'approuvee') return;
    note.statut = 'remboursee';
    saveNotesFrais();
    renderNotesFrais();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    if (typeof updateComptabiliteHomeTiles === 'function') updateComptabiliteHomeTiles();
    if (typeof closeNdfDetailModal === 'function') closeNdfDetailModal();
    showToast('Note marquée comme remboursée', 'success');
}

function loadNdfAdminSettings() {
    var input = document.getElementById('adminNdfKmRate');
    if (input) input.value = getNdfKmRate();
}

function saveNdfAdminSettings() {
    var input = document.getElementById('adminNdfKmRate');
    var v = parseFloat(input?.value);
    if (isNaN(v) || v <= 0) {
        showToast('Indiquez un tarif kilométrique valide', 'error');
        return;
    }
    if (typeof appSettings === 'undefined') window.appSettings = {};
    appSettings.ndfKmRate = v;
    if (typeof saveSettings === 'function') saveSettings();
    showToast('Paramètres notes de frais enregistrés', 'success');
}

function ndfBase64ToBlob(base64, mimeType) {
    var raw = base64;
    if (String(raw).indexOf('base64,') >= 0) raw = raw.split('base64,')[1];
    var byteChars = atob(raw);
    var byteArrays = [];
    for (var i = 0; i < byteChars.length; i += 512) {
        var slice = byteChars.slice(i, i + 512);
        var byteNumbers = new Array(slice.length);
        for (var j = 0; j < slice.length; j++) byteNumbers[j] = slice.charCodeAt(j);
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType || 'application/octet-stream' });
}

function ndfEnsureJsPDF(callback) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : (window.jsPDF || null);
    if (JsPDF) { callback(JsPDF); return; }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = function() {
        var J = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : window.jsPDF;
        if (J) callback(J);
        else showToast('Génération PDF indisponible', 'error');
    };
    script.onerror = function() { showToast('Impossible de charger la bibliothèque PDF', 'error'); };
    document.head.appendChild(script);
}

function ndfEnsurePdfLib(callback) {
    if (window.PDFLib) { callback(window.PDFLib); return; }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = function() {
        if (window.PDFLib) callback(window.PDFLib);
        else showToast('Fusion PDF indisponible', 'error');
    };
    script.onerror = function() { showToast('Impossible de charger la bibliothèque de fusion PDF', 'error'); };
    document.head.appendChild(script);
}

function ndfBlobIsPdf(blob) {
    return blob && ((blob.type || '').indexOf('pdf') >= 0 || /\.pdf$/i.test(blob.name || ''));
}

function ndfBlobIsImage(blob) {
    return blob && (blob.type || '').indexOf('image/') === 0;
}

async function ndfAppendJustificatifToMergedPdf(mergedPdf, PDFLib, file, label) {
    if (!file || !file.blob) return;
    var blob = file.blob;
    if (ndfBlobIsPdf(blob)) {
        var src = await PDFLib.PDFDocument.load(await blob.arrayBuffer());
        var indices = src.getPageIndices();
        var copied = await mergedPdf.copyPages(src, indices);
        copied.forEach(function(p) { mergedPdf.addPage(p); });
        return;
    }
    if (!ndfBlobIsImage(blob)) {
        var page = mergedPdf.addPage();
        var size = page.getSize();
        page.drawText((label || 'Justificatif') + ' — format non integre au PDF', { x: 28, y: size.height - 40, size: 11 });
        return;
    }
    var bytes = await blob.arrayBuffer();
    var img;
    if ((blob.type || '').indexOf('png') >= 0) img = await mergedPdf.embedPng(bytes);
    else img = await mergedPdf.embedJpg(bytes);
    if (!img) return;
    var page = mergedPdf.addPage();
    var size = page.getSize();
    var margin = 28;
    var title = (label || file.name || 'Justificatif').substring(0, 80);
    page.drawText(title, { x: margin, y: size.height - margin, size: 10 });
    var dims = img.scale(1);
    var maxW = size.width - margin * 2;
    var maxH = size.height - margin * 2 - 16;
    var scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
    var w = dims.width * scale;
    var h = dims.height * scale;
    page.drawImage(img, {
        x: (size.width - w) / 2,
        y: (size.height - h) / 2 - 8,
        width: w,
        height: h
    });
}

async function buildNdfMergedPdfBlob(note, JsPDF, PDFLib) {
    var doc = buildNdfPdfDocument(note, JsPDF);
    var attachments = [];
    for (var i = 0; i < (note.lignes || []).length; i++) {
        var ligne = note.lignes[i];
        if (ligne.type === 'kilometrique' || !ligne.justificatif) continue;
        var file = await ndfFetchJustificatifFile(ligne.justificatif, i);
        if (file) {
            var typeLabel = getNdfFraisTypeLabel(ligne.type || ligne.categorie || '');
            file.label = 'Justificatif ' + (attachments.length + 1) + ' — ' + typeLabel + (ligne.description ? ' : ' + ligne.description : '');
            attachments.push(file);
        }
    }
    if (!attachments.length) return doc.output('blob');

    var merged = await PDFLib.PDFDocument.create();
    var notePdf = await PDFLib.PDFDocument.load(doc.output('arraybuffer'));
    var notePages = await merged.copyPages(notePdf, notePdf.getPageIndices());
    notePages.forEach(function(p) { merged.addPage(p); });
    for (var j = 0; j < attachments.length; j++) {
        await ndfAppendJustificatifToMergedPdf(merged, PDFLib, attachments[j], attachments[j].label);
    }
    var out = await merged.save();
    return new Blob([out], { type: 'application/pdf' });
}

function ndfTriggerDownload(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

function ndfGetJustificatifFileUrl(justif) {
    if (!justif) return '';
    var fileUrl = justif.url || justif.fileUrl || '';
    if (fileUrl && fileUrl.indexOf('http') === 0) return fileUrl;
    if (justif.file_id) {
        if (typeof getDownloadFileUrl === 'function') return getDownloadFileUrl(justif.file_id);
        var base = (typeof API_URL !== 'undefined' ? API_URL : 'api');
        var url = base + '/download.php?id=' + justif.file_id;
        if (typeof authToken !== 'undefined' && authToken) url += '&token=' + encodeURIComponent(authToken);
        return url;
    }
    return fileUrl;
}

async function ndfFetchJustificatifFile(justif, index) {
    if (!justif) return null;
    var name = justif.nom || justif.fileName || ('justificatif_' + (index + 1));
    if (justif.file_id || justif.url || justif.fileUrl) {
        var url = ndfGetJustificatifFileUrl(justif);
        if (url) {
            var headers = {};
            if (typeof authToken !== 'undefined' && authToken) {
                headers.Authorization = 'Bearer ' + authToken;
                headers['X-Auth-Token'] = authToken;
            }
            var res = await fetch(url, { headers: headers });
            if (res.ok) {
                var blob = await res.blob();
                if (!/\./.test(name)) {
                    var ext = (blob.type || '').indexOf('pdf') >= 0 ? '.pdf' : ((blob.type || '').indexOf('png') >= 0 ? '.png' : '.jpg');
                    name += ext;
                }
                return { blob: blob, name: name };
            }
        }
    }
    if (justif.base64) {
        return { blob: ndfBase64ToBlob(justif.base64, justif.mimeType || 'application/octet-stream'), name: name };
    }
    return null;
}

function buildNdfPdfDocument(note, JsPDF) {
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    var margin = 14;
    var y = 18;
    var lineH = 6;
    var pageW = doc.internal.pageSize.getWidth();
    var fmt = typeof formatMontant === 'function' ? formatMontant : function(v) { return Number(v || 0).toFixed(2); };
    var fmtDate = typeof formatDate === 'function' ? formatDate : function(d) { return d || ''; };

    doc.setFontSize(16);
    doc.text('Note de frais', margin, y);
    y += lineH + 2;
    doc.setFontSize(10);
    doc.text('Titre : ' + (note.titre || 'Sans titre'), margin, y); y += lineH;
    doc.text('Collaborateur : ' + (note.utilisateurNom || ''), margin, y); y += lineH;
    doc.text('Période : ' + fmtDate(note.dateDebut) + ' → ' + fmtDate(note.dateFin), margin, y); y += lineH;
    doc.text('Rattachement : ' + getNdfAssociationLabel(note), margin, y); y += lineH;
    doc.text('Statut : ' + (note.statut || ''), margin, y); y += lineH + 4;

    doc.setFontSize(11);
    doc.text('Lignes de frais', margin, y); y += lineH;
    doc.setFontSize(9);

    (note.lignes || []).forEach(function(l, idx) {
        if (y > 270) { doc.addPage(); y = 18; }
        var typeLabel = getNdfFraisTypeLabel(l.type || l.categorie || '');
        if (l.type === 'autre' && l.typeAutre) typeLabel += ' (' + l.typeAutre + ')';
        var ttc = parseFloat(l.montantTTC) || 0;
        var line1 = (idx + 1) + '. [' + typeLabel + '] ' + (l.description || '');
        var lines = doc.splitTextToSize(line1, pageW - margin * 2);
        lines.forEach(function(ln) { doc.text(ln, margin, y); y += 5; });
        var detail = 'Montant TTC : ' + fmt(ttc) + ' €';
        if (l.type === 'kilometrique' && l.kilometres) {
            detail += ' · ' + l.kilometres + ' km × ' + fmt(getNdfKmRate()) + ' €/km';
        } else if (l.tauxTVA != null) {
            detail += ' · TVA ' + l.tauxTVA + '%';
        }
        doc.text(detail, margin + 2, y); y += lineH;
    });

    var total = (note.lignes || []).reduce(function(s, l) { return s + (parseFloat(l.montantTTC) || 0); }, 0);
    y += 2;
    doc.setFontSize(11);
    doc.text('Total TTC : ' + fmt(total) + ' €', margin, y);
    return doc;
}

async function downloadNdfPackage(noteId) {
    var note = notesfrais.find(function(n) { return n.id === noteId; });
    if (!note) {
        showToast('Note introuvable', 'error');
        return;
    }
    showToast('Préparation du téléchargement…', 'info');
    ndfEnsureJsPDF(function(JsPDF) {
        ndfEnsurePdfLib(async function(PDFLib) {
            try {
                var safeName = (note.titre || 'note-frais').replace(/[^\w\-àâäéèêëïîôùûüç\s]/gi, '').trim().replace(/\s+/g, '-') || 'note-frais';
                var pdfBlob = await buildNdfMergedPdfBlob(note, JsPDF, PDFLib);
                ndfTriggerDownload(pdfBlob, safeName + '.pdf');
                showToast('Note téléchargée (PDF unique)', 'success');
            } catch (e) {
                console.error('downloadNdfPackage:', e);
                showToast('Erreur lors du téléchargement', 'error');
            }
        });
    });
}
if (typeof window !== 'undefined') window.downloadNdfPackage = downloadNdfPackage;

var currentNdfDetailId = null;
var currentNdfDetailContext = 'user';
var ndfDetailBlobUrls = [];

function ndfRevokeDetailBlobUrls() {
    ndfDetailBlobUrls.forEach(function(u) {
        try { URL.revokeObjectURL(u); } catch (e) {}
    });
    ndfDetailBlobUrls = [];
}

async function renderNdfDetailJustificatifsPreview(note, context) {
    var wrap = document.getElementById('ndfDetailJustificatifsWrap');
    var container = document.getElementById('ndfDetailJustificatifs');
    var modalContent = document.querySelector('#ndfDetailModal .ndf-detail-modal');
    ndfRevokeDetailBlobUrls();
    if (!wrap || !container) return;
    if (context !== 'validation') {
        wrap.style.display = 'none';
        container.innerHTML = '';
        if (modalContent) modalContent.style.maxWidth = '720px';
        return;
    }
    if (modalContent) modalContent.style.maxWidth = '960px';
    var lignesAvecJustif = (note.lignes || []).map(function(l, i) {
        return { ligne: l, index: i };
    }).filter(function(x) {
        return x.ligne.type !== 'kilometrique' && x.ligne.justificatif;
    });
    if (!lignesAvecJustif.length) {
        wrap.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    wrap.style.display = '';
    container.innerHTML = '<div class="ndf-detail-justif-loading">Chargement des pièces jointes…</div>';
    var blocks = [];
    for (var j = 0; j < lignesAvecJustif.length; j++) {
        var item = lignesAvecJustif[j];
        var typeLabel = getNdfFraisTypeLabel(item.ligne.type || item.ligne.categorie || '');
        var title = (j + 1) + '. ' + typeLabel + (item.ligne.description ? ' — ' + item.ligne.description : '');
        var file = await ndfFetchJustificatifFile(item.ligne.justificatif, item.index);
        if (!file) {
            blocks.push('<div class="ndf-detail-justif-item"><div class="ndf-detail-justif-title">' + escapeHtml(title) + '</div><p class="ndf-detail-justif-error">Fichier introuvable</p></div>');
            continue;
        }
        var url = URL.createObjectURL(file.blob);
        ndfDetailBlobUrls.push(url);
        var preview = '';
        if (ndfBlobIsPdf(file.blob)) {
            preview = '<iframe class="ndf-detail-justif-iframe" src="' + url + '" title="' + escapeHtml(file.name || 'PDF') + '"></iframe>';
        } else if (ndfBlobIsImage(file.blob)) {
            preview = '<img class="ndf-detail-justif-img" src="' + url + '" alt="' + escapeHtml(file.name || 'Image') + '">';
        } else {
            preview = '<a class="btn btn-secondary" href="' + url + '" download="' + escapeHtml(file.name || 'justificatif') + '">⬇️ Télécharger ' + escapeHtml(file.name || 'fichier') + '</a>';
        }
        blocks.push('<div class="ndf-detail-justif-item"><div class="ndf-detail-justif-title">' + escapeHtml(title) + '</div>' + preview + '</div>');
    }
    container.innerHTML = blocks.join('');
}

function getNdfStatutLabel(statut) {
    return { brouillon: 'Brouillon', soumise: 'En attente de validation', approuvee: 'À payer', rejetee: 'Rejetée', remboursee: 'Remboursée' }[statut] || statut;
}

function openNdfDetailModal(id, context) {
    var note = notesfrais.find(function(n) { return n.id === id; });
    if (!note) return;
    currentNdfDetailId = id;
    currentNdfDetailContext = context || 'user';
    var modal = document.getElementById('ndfDetailModal');
    if (!modal) return;
    var total = (note.lignes || []).reduce(function(s, l) { return s + (parseFloat(l.montantTTC) || 0); }, 0);
    var totalFmt = typeof formatMontant === 'function' ? formatMontant(total) : total.toFixed(2);
    var fmtDate = typeof formatDate === 'function' ? formatDate : function(d) { return d || '—'; };

    document.getElementById('ndfDetailTitle').textContent = note.titre || 'Sans titre';
    var statutEl = document.getElementById('ndfDetailStatut');
    statutEl.textContent = getNdfStatutLabel(note.statut);
    statutEl.className = 'ndf-card-statut ndf-statut-' + (note.statut || '');

    document.getElementById('ndfDetailMeta').innerHTML =
        '<div class="compta-detail-row"><span class="compta-detail-label">Collaborateur</span><span class="compta-detail-value">' + escapeHtml(note.utilisateurNom || '—') + '</span></div>' +
        '<div class="compta-detail-row"><span class="compta-detail-label">Période</span><span class="compta-detail-value">' + escapeHtml(fmtDate(note.dateDebut) + ' → ' + fmtDate(note.dateFin)) + '</span></div>' +
        '<div class="compta-detail-row"><span class="compta-detail-label">Rattachement</span><span class="compta-detail-value">' + escapeHtml(getNdfAssociationLabel(note)) + '</span></div>';

    var lignesHtml = (note.lignes || []).map(function(l, idx) {
        var typeLabel = getNdfFraisTypeLabel(l.type || l.categorie || '');
        if (l.type === 'autre' && l.typeAutre) typeLabel += ' (' + l.typeAutre + ')';
        var ttc = parseFloat(l.montantTTC) || 0;
        var detail = typeof formatMontant === 'function' ? formatMontant(ttc) + ' €' : ttc.toFixed(2) + ' €';
        if (l.type === 'kilometrique' && l.kilometres) {
            detail += ' · ' + l.kilometres + ' km';
        } else if (l.tauxTVA != null) {
            detail += ' · TVA ' + l.tauxTVA + '%';
        }
        var hasJustif = l.type !== 'kilometrique' && l.justificatif;
        return '<div class="compta-detail-ligne">' +
            '<div class="compta-detail-ligne-head"><span class="compta-detail-ligne-num">' + (idx + 1) + '.</span> ' +
            '<strong>' + escapeHtml(typeLabel) + '</strong></div>' +
            '<div class="compta-detail-ligne-desc">' + escapeHtml(l.description || '—') + '</div>' +
            '<div class="compta-detail-ligne-montant">' + detail + (hasJustif ? ' · 📎 Pièce jointe' : '') + '</div></div>';
    }).join('');
    document.getElementById('ndfDetailLignes').innerHTML = lignesHtml || '<p class="compta-validation-empty">Aucune ligne</p>';
    document.getElementById('ndfDetailTotal').textContent = 'Total TTC : ' + totalFmt + ' €';

    var rejetEl = document.getElementById('ndfDetailRejet');
    if (note.statut === 'rejetee' && (note.rejetMessage || note.rejetMotif)) {
        rejetEl.style.display = 'block';
        rejetEl.innerHTML = '<strong>Motif du rejet :</strong> ' + escapeHtml(note.rejetMessage || note.rejetMotif);
    } else {
        rejetEl.style.display = 'none';
        rejetEl.innerHTML = '';
    }

    var actions = '';
    var isCompta = currentNdfDetailContext === 'validation' && typeof hasNdfValidationPermission === 'function' && hasNdfValidationPermission();
    actions += '<button type="button" class="btn btn-secondary" onclick="downloadNdfPackage(\'' + note.id + '\')">⬇️ Télécharger</button>';
    if (isCompta) {
        if (note.statut === 'soumise') {
            actions += '<button type="button" class="btn" onclick="approuveNdf(\'' + note.id + '\');closeNdfDetailModal();">Approuver</button>';
            actions += '<button type="button" class="btn btn-secondary" onclick="closeNdfDetailModal();openRejetNdfModal(\'' + note.id + '\')">Rejeter</button>';
        } else if (note.statut === 'approuvee') {
            actions += '<button type="button" class="btn" onclick="marquerRembourse(\'' + note.id + '\');closeNdfDetailModal();">Marquer remboursée</button>';
        }
    } else if (isNdfEditable(note.statut)) {
        actions += '<button type="button" class="btn btn-secondary" onclick="closeNdfDetailModal();openEditNdfModal(\'' + note.id + '\')">Modifier</button>';
        if (note.statut === 'brouillon' || note.statut === 'rejetee') {
            actions += '<button type="button" class="btn" onclick="closeNdfDetailModal();submitNdf(\'' + note.id + '\')">' + (note.statut === 'rejetee' ? 'Soumettre à nouveau' : 'Soumettre') + '</button>';
        }
    }
    if (isCompta || (isNdfDeletable(note.statut) && ndfNoteBelongsToUser(note, getNdfCurrentUserId()))) {
        actions += '<button type="button" class="btn btn-secondary" style="color:var(--mn-red);" onclick="deleteNdf(\'' + note.id + '\')">🗑️ Supprimer</button>';
    }
    document.getElementById('ndfDetailActions').innerHTML = actions;
    modal.classList.add('active');
    renderNdfDetailJustificatifsPreview(note, currentNdfDetailContext);
}
if (typeof window !== 'undefined') window.openNdfDetailModal = openNdfDetailModal;

function closeNdfDetailModal() {
    currentNdfDetailId = null;
    ndfRevokeDetailBlobUrls();
    var wrap = document.getElementById('ndfDetailJustificatifsWrap');
    var container = document.getElementById('ndfDetailJustificatifs');
    if (wrap) wrap.style.display = 'none';
    if (container) container.innerHTML = '';
    var modal = document.getElementById('ndfDetailModal');
    if (modal) modal.classList.remove('active');
}
if (typeof window !== 'undefined') window.closeNdfDetailModal = closeNdfDetailModal;

function ndfGlobalSearchAppend(query, results, pushResult) {
    if (typeof notesfrais === 'undefined' || !Array.isArray(notesfrais)) return;
    var q = (query || '').toLowerCase();
    var uid = getNdfCurrentUserId();
    var isValidator = hasNdfValidationPermission();
    var push = typeof pushResult === 'function'
        ? pushResult
        : function(key, item) { results.push(item); };

    notesfrais.forEach(function(n) {
        if (!isValidator && !ndfNoteBelongsToUser(n, uid)) return;
        var hay = [n.titre, n.utilisateurNom, n.associationLabel, n.associationTexte].join(' ');
        (n.lignes || []).forEach(function(l) {
            hay += ' ' + (l.description || '') + ' ' + (l.type || '') + ' ' + (l.typeAutre || '');
        });
        if (hay.toLowerCase().indexOf(q) === -1) return;
        var statutLabel = typeof getNdfStatutLabel === 'function' ? getNdfStatutLabel(n.statut) : (n.statut || '');
        push('ndf_' + n.id, {
            type: 'note de frais',
            icon: '💳',
            title: n.titre || 'Note de frais',
            subtitle: 'Comptabilité · Note de frais · ' + statutLabel,
            action: function() {
                var ctx = isValidator ? 'validation' : 'user';
                if (typeof openComptabiliteHomePage === 'function') openComptabiliteHomePage();
                setTimeout(function() { openNdfDetailModal(n.id, ctx); }, 200);
            }
        });
    });
}
if (typeof window !== 'undefined') window.ndfGlobalSearchAppend = ndfGlobalSearchAppend;
