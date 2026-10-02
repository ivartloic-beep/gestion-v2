// ========== DOCUMENTS COMMERCIAUX (devis reçus, émis, signatures, liens) ==========
// Extension additive : ne remplace pas le dépôt / validation des factures existants.

var depotDevisFilePending = null;
var depotDevisActiveTab = 'mes_devis';
var currentDepotDevisDetailId = null;
var comptaValidationDevisTab = 'a_traiter';
var comptaDocsEmisActiveTab = 'devis';
var comptaDocsEmisTypeFilter = 'devis';
var currentComptaDocEmisDetailId = null;
var comptaDocEmisFilePending = null;
var comptaSignatureFilePending = null;

var DEPOT_DEVIS_STATUTS = {
    en_attente: { label: 'À traiter', className: 'depot-facture-statut-attente' },
    accepte: { label: 'Accepté', className: 'depot-facture-statut-payee' },
    refuse: { label: 'Refusé', className: 'depot-facture-statut-refusee' },
    expire: { label: 'Expiré', className: 'depot-facture-statut-refusee' }
};

var DOCS_EMIS_DEVIS_STATUTS = {
    brouillon: { label: 'Brouillon', className: 'depot-facture-statut-attente' },
    envoye: { label: 'Envoyé', className: 'depot-facture-statut-attente' },
    accepte: { label: 'Accepté', className: 'depot-facture-statut-payee' },
    refuse: { label: 'Refusé', className: 'depot-facture-statut-refusee' },
    expire: { label: 'Expiré', className: 'depot-facture-statut-refusee' },
    facture: { label: 'Facturé', className: 'depot-facture-statut-payee' }
};

var DOCS_EMIS_FACTURE_STATUTS = {
    emise: { label: 'Émise', className: 'depot-facture-statut-attente' },
    envoyee: { label: 'Envoyée', className: 'depot-facture-statut-attente' },
    partielle: { label: 'Partielle', className: 'depot-facture-statut-attente' },
    payee: { label: 'Payée', className: 'depot-facture-statut-payee' },
    impayee: { label: 'Impayée', className: 'depot-facture-statut-refusee' }
};

function docsEscapeHtml(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ensureComptaLiens(obj) {
    if (!obj.liens || typeof obj.liens !== 'object') {
        obj.liens = { dealIds: [], workProjectIds: [], projetIds: [] };
    }
    if (!Array.isArray(obj.liens.dealIds)) obj.liens.dealIds = [];
    if (!Array.isArray(obj.liens.workProjectIds)) obj.liens.workProjectIds = [];
    if (!Array.isArray(obj.liens.projetIds)) obj.liens.projetIds = [];
    return obj.liens;
}

function isDepotDevis(justif) {
    return !!(justif && justif.source === 'depot_devis');
}
if (typeof window !== 'undefined') window.isDepotDevis = isDepotDevis;

function getDepotDevisStatut(justif) {
    return (justif && justif.statutValidation) || 'en_attente';
}

function isDepotDevisATraiter(justif) {
    return isDepotDevis(justif) && getDepotDevisStatut(justif) === 'en_attente';
}
if (typeof window !== 'undefined') window.isDepotDevisATraiter = isDepotDevisATraiter;

function getDepotDevisStatutInfo(justif) {
    var key = getDepotDevisStatut(justif);
    return DEPOT_DEVIS_STATUTS[key] || DEPOT_DEVIS_STATUTS.en_attente;
}

function normalizeDepotDevisRecord(justif) {
    if (!justif || !isDepotDevis(justif)) return justif;
    if (!justif.statutValidation) justif.statutValidation = 'en_attente';
    if (!justif.libelle && justif.nomFichier) justif.libelle = justif.nomFichier;
    ensureComptaLiens(justif);
    return justif;
}

function countDepotDevisATraiter() {
    if (typeof comptaJustificatifs === 'undefined' || !Array.isArray(comptaJustificatifs)) return 0;
    return comptaJustificatifs.filter(isDepotDevisATraiter).length;
}
if (typeof window !== 'undefined') window.countDepotDevisATraiter = countDepotDevisATraiter;

function canDepotComptaDocuments() {
    return typeof hasComptaCollectePermission === 'function' && hasComptaCollectePermission();
}

// ----- Signature utilisateur -----

function getCurrentUserSignature() {
    if (typeof comptaSettings === 'undefined' || !comptaSettings || !comptaSettings.signatures) return null;
    var uid = String((typeof currentUser !== 'undefined' && currentUser && currentUser.id) || '');
    return comptaSettings.signatures[uid] || null;
}

function getUserSignatureUrl(sig) {
    if (!sig) return null;
    if (sig.fileUrl) return sig.fileUrl;
    if (sig.file_id && typeof getDownloadFileUrl === 'function') return getDownloadFileUrl(sig.file_id);
    return null;
}

async function openComptaSignatureModal() {
    if (!canValidateDevisPermission()) {
        if (typeof showToast === 'function') showToast('Réservé aux validateurs', 'error');
        return;
    }
    if (typeof loadComptaData === 'function') await loadComptaData();
    comptaSignatureFilePending = null;
    var modal = document.getElementById('comptaSignatureModal');
    if (!modal) return;
    var preview = document.getElementById('comptaSignaturePreview');
    var sig = getCurrentUserSignature();
    var url = getUserSignatureUrl(sig);
    if (preview) {
        preview.innerHTML = url
            ? '<img src="' + docsEscapeHtml(url) + '" alt="Signature" style="max-width:100%;max-height:120px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:0.5rem;">'
            : '<p style="color:#64748b;margin:0;">Aucune signature enregistrée. Déposez une image (PNG/JPG).</p>';
    }
    var input = document.getElementById('comptaSignatureFileInput');
    if (input) input.value = '';
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openComptaSignatureModal = openComptaSignatureModal;

function closeComptaSignatureModal() {
    var modal = document.getElementById('comptaSignatureModal');
    if (modal) modal.classList.remove('active');
    comptaSignatureFilePending = null;
}
if (typeof window !== 'undefined') window.closeComptaSignatureModal = closeComptaSignatureModal;

function handleComptaSignatureFileSelect(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
        if (typeof showToast === 'function') showToast('Choisissez une image', 'error');
        event.target.value = '';
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Image trop volumineuse (max 2 Mo)', 'error');
        event.target.value = '';
        return;
    }
    comptaSignatureFilePending = file;
    var preview = document.getElementById('comptaSignaturePreview');
    if (preview) {
        var url = URL.createObjectURL(file);
        preview.innerHTML = '<img src="' + url + '" alt="Aperçu" style="max-width:100%;max-height:120px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:0.5rem;">';
    }
}
if (typeof window !== 'undefined') window.handleComptaSignatureFileSelect = handleComptaSignatureFileSelect;

async function saveComptaSignature() {
    if (!canValidateDevisPermission()) return;
    if (!comptaSignatureFilePending) {
        if (typeof showToast === 'function') showToast('Sélectionnez une image de signature', 'error');
        return;
    }
    var btn = document.getElementById('comptaSignatureSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try {
        var uploaded = await uploadFile(comptaSignatureFilePending, 'documents');
        if (typeof comptaSettings === 'undefined' || !comptaSettings) window.comptaSettings = { signatures: {} };
        if (!comptaSettings.signatures) comptaSettings.signatures = {};
        var uid = String(currentUser.id);
        comptaSettings.signatures[uid] = {
            file_id: uploaded.file_id,
            fileUrl: uploaded.url || uploaded.downloadUrl,
            nomFichier: comptaSignatureFilePending.name,
            updatedAt: new Date().toISOString(),
            userName: (((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim()) || currentUser.username
        };
        if (typeof saveComptaData === 'function') await saveComptaData();
        closeComptaSignatureModal();
        if (typeof showToast === 'function') showToast('Signature enregistrée', 'success');
    } catch (err) {
        console.warn(err);
        if (typeof showToast === 'function') showToast('Erreur enregistrement signature', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer ma signature'; }
    }
}
if (typeof window !== 'undefined') window.saveComptaSignature = saveComptaSignature;

function canValidateDevisPermission() {
    return typeof canValidateDevis === 'function' ? canValidateDevis() : (typeof hasComptaValidationPermission === 'function' && hasComptaValidationPermission());
}

// ----- Liens helpers -----

function readLiensFromForm(prefix) {
    var dealEl = document.getElementById(prefix + 'DealId');
    var wpEl = document.getElementById(prefix + 'WorkProjectId');
    var projEl = document.getElementById(prefix + 'ProjetId');
    var liens = { dealIds: [], workProjectIds: [], projetIds: [] };
    if (dealEl && dealEl.value) liens.dealIds = [dealEl.value];
    if (wpEl && wpEl.value) liens.workProjectIds = [wpEl.value];
    if (projEl && projEl.value) liens.projetIds = [projEl.value];
    return liens;
}
if (typeof window !== 'undefined') window.readLiensFromForm = readLiensFromForm;

function populateComptaLiensSelects(prefix, liens) {
    liens = liens || { dealIds: [], workProjectIds: [], projetIds: [] };
    var dealEl = document.getElementById(prefix + 'DealId');
    var wpEl = document.getElementById(prefix + 'WorkProjectId');
    var projEl = document.getElementById(prefix + 'ProjetId');
    if (dealEl) {
        var dealOpts = '<option value="">— Aucun —</option>';
        if (typeof crmData !== 'undefined' && crmData && Array.isArray(crmData.deals)) {
            crmData.deals.forEach(function(d) {
                dealOpts += '<option value="' + docsEscapeHtml(d.id) + '">' + docsEscapeHtml(d.title || d.id) + '</option>';
            });
        }
        dealEl.innerHTML = dealOpts;
        dealEl.value = (liens.dealIds && liens.dealIds[0]) || '';
    }
    if (wpEl) {
        var wpOpts = '<option value="">— Aucun —</option>';
        var wps = [];
        if (typeof workProjectsData !== 'undefined' && workProjectsData && Array.isArray(workProjectsData.projects)) {
            wps = workProjectsData.projects;
        } else if (typeof getVisibleWorkProjects === 'function') {
            wps = getVisibleWorkProjects() || [];
        }
        (wps || []).filter(function(p) { return !p.archived; }).forEach(function(p) {
            wpOpts += '<option value="' + docsEscapeHtml(p.id) + '">' + docsEscapeHtml(p.title || p.name || p.id) + '</option>';
        });
        wpEl.innerHTML = wpOpts;
        wpEl.value = (liens.workProjectIds && liens.workProjectIds[0]) || '';
    }
    if (projEl) {
        var pOpts = '<option value="">— Aucun —</option>';
        if (typeof projects !== 'undefined' && Array.isArray(projects)) {
            projects.forEach(function(p) {
                if (p.type === 'tournee') {
                    pOpts += '<option value="' + docsEscapeHtml(p.id) + '">🎭 ' + docsEscapeHtml(p.name) + '</option>';
                    (p.spectacles || []).forEach(function(s) {
                        pOpts += '<option value="' + docsEscapeHtml(s.id) + '"> ↳ ' + docsEscapeHtml(s.name || s.titre || s.id) + '</option>';
                    });
                } else {
                    pOpts += '<option value="' + docsEscapeHtml(p.id) + '">' + docsEscapeHtml(p.name || p.id) + '</option>';
                }
            });
        }
        projEl.innerHTML = pOpts;
        projEl.value = (liens.projetIds && liens.projetIds[0]) || '';
    }
}
if (typeof window !== 'undefined') window.populateComptaLiensSelects = populateComptaLiensSelects;

async function ensureComptaLiensDataLoaded() {
    try {
        if (typeof ensureCrmDataLoaded === 'function') await ensureCrmDataLoaded();
    } catch (e) { /* optional */ }
    try {
        if (typeof loadWorkProjects === 'function') await loadWorkProjects();
    } catch (e) { /* optional */ }
}

function formatLiensLabels(liens) {
    ensureComptaLiens({ liens: liens });
    var parts = [];
    (liens.dealIds || []).forEach(function(id) {
        var d = (typeof crmData !== 'undefined' && crmData.deals) ? crmData.deals.find(function(x) { return String(x.id) === String(id); }) : null;
        parts.push('Dossier : ' + (d ? (d.title || id) : id));
    });
    (liens.workProjectIds || []).forEach(function(id) {
        var p = typeof getWorkProjectById === 'function' ? getWorkProjectById(id) : null;
        parts.push('Projet : ' + (p ? (p.title || p.name || id) : id));
    });
    (liens.projetIds || []).forEach(function(id) {
        var label = id;
        if (typeof projects !== 'undefined') {
            projects.forEach(function(p) {
                if (String(p.id) === String(id)) label = p.name;
                (p.spectacles || []).forEach(function(s) {
                    if (String(s.id) === String(id)) label = (p.name || '') + ' / ' + (s.name || s.titre || id);
                });
            });
        }
        parts.push('Spectacle : ' + label);
    });
    return parts;
}

function getDocsLinkedToDeal(dealId) {
    var out = { recus: [], emis: [] };
    if (!dealId) return out;
    var sid = String(dealId);
    (comptaJustificatifs || []).forEach(function(j) {
        if (!isDepotDevis(j) && !(typeof isDepotFacture === 'function' && isDepotFacture(j))) return;
        ensureComptaLiens(j);
        if ((j.liens.dealIds || []).some(function(id) { return String(id) === sid; })) out.recus.push(j);
    });
    (comptaDocumentsEmis || []).forEach(function(d) {
        ensureComptaLiens(d);
        if ((d.liens.dealIds || []).some(function(id) { return String(id) === sid; })) out.emis.push(d);
    });
    return out;
}
if (typeof window !== 'undefined') window.getDocsLinkedToDeal = getDocsLinkedToDeal;

function getDocsLinkedToWorkProject(wpId) {
    var out = { recus: [], emis: [] };
    if (!wpId) return out;
    var sid = String(wpId);
    (comptaJustificatifs || []).forEach(function(j) {
        if (!isDepotDevis(j) && !(typeof isDepotFacture === 'function' && isDepotFacture(j))) return;
        ensureComptaLiens(j);
        if ((j.liens.workProjectIds || []).some(function(id) { return String(id) === sid; })) out.recus.push(j);
    });
    (comptaDocumentsEmis || []).forEach(function(d) {
        ensureComptaLiens(d);
        if ((d.liens.workProjectIds || []).some(function(id) { return String(id) === sid; })) out.emis.push(d);
    });
    return out;
}
if (typeof window !== 'undefined') window.getDocsLinkedToWorkProject = getDocsLinkedToWorkProject;

function renderComptaDocsLinkedListHtml(bundle) {
    var items = [];
    (bundle.recus || []).forEach(function(j) {
        var kind = isDepotDevis(j) ? 'Devis reçu' : 'Facture reçue';
        var st = isDepotDevis(j) ? getDepotDevisStatutInfo(j).label : (typeof getDepotFactureStatutInfo === 'function' ? getDepotFactureStatutInfo(j).label : '');
        var onclick = isDepotDevis(j) ? 'openDepotDevisDetailModal(\'' + j.id + '\')' : 'openDepotFactureDetailModal(\'' + j.id + '\')';
        items.push({ kind: kind, title: j.libelle || j.fournisseur || j.nomFichier || kind, statut: st, onclick: onclick, montant: j.montantTTC });
    });
    (bundle.emis || []).forEach(function(d) {
        var kind = d.type === 'facture' ? 'Facture émise' : 'Devis émis';
        var stInfo = d.type === 'facture' ? DOCS_EMIS_FACTURE_STATUTS[d.statut] : DOCS_EMIS_DEVIS_STATUTS[d.statut];
        items.push({
            kind: kind,
            title: d.libelle || d.client || d.nomFichier || kind,
            statut: (stInfo && stInfo.label) || d.statut || '',
            onclick: 'openComptaDocEmisDetailModal(\'' + d.id + '\')',
            montant: d.montantTTC
        });
    });
    if (!items.length) return '<p class="wp-muted" style="margin:0.5rem 0 0;">Aucun document commercial lié.</p>';
    return '<div class="compta-linked-docs-list">' + items.map(function(it) {
        var montant = it.montant ? ((typeof formatMontant === 'function' ? formatMontant(it.montant) : it.montant) + ' €') : '';
        return '<div class="compta-linked-doc-row" onclick="' + it.onclick + '" style="cursor:pointer;padding:0.55rem 0;border-bottom:1px solid #e2e8f0;">' +
            '<div style="font-weight:600;">' + docsEscapeHtml(it.title) + '</div>' +
            '<div style="font-size:0.85rem;color:#64748b;">' + docsEscapeHtml(it.kind) +
            (it.statut ? ' · ' + docsEscapeHtml(it.statut) : '') +
            (montant ? ' · ' + docsEscapeHtml(montant) : '') + '</div></div>';
    }).join('') + '</div>';
}
if (typeof window !== 'undefined') window.renderComptaDocsLinkedListHtml = renderComptaDocsLinkedListHtml;

// ----- Dépôt devis reçus -----

async function openDepotDevisPage() {
    if (!canDepotComptaDocuments() && !canValidateDevisPermission()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    var page = document.getElementById('depotDevisPage');
    if (page) page.classList.add('active');
    if (typeof loadComptaData === 'function') await loadComptaData();
    switchDepotDevisTab(depotDevisActiveTab || 'mes_devis');
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
if (typeof window !== 'undefined') window.openDepotDevisPage = openDepotDevisPage;

function closeDepotDevisPage() {
    var page = document.getElementById('depotDevisPage');
    if (page) page.classList.remove('active');
    if (typeof returnToComptabiliteHome === 'function') returnToComptabiliteHome();
}
if (typeof window !== 'undefined') window.closeDepotDevisPage = closeDepotDevisPage;

function switchDepotDevisTab(tab) {
    depotDevisActiveTab = tab === 'toutes' ? 'toutes' : 'mes_devis';
    document.querySelectorAll('#depotDevisTabs .compta-tab').forEach(function(btn) { btn.classList.remove('active'); });
    var activeBtn = depotDevisActiveTab === 'toutes'
        ? document.getElementById('depotDevisTabToutes')
        : document.getElementById('depotDevisTabMes');
    if (activeBtn) activeBtn.classList.add('active');
    renderDepotDevisList();
}
if (typeof window !== 'undefined') window.switchDepotDevisTab = switchDepotDevisTab;

function renderDepotDevisList() {
    var list = document.getElementById('depotDevisList');
    var empty = document.getElementById('depotDevisEmpty');
    var emptyText = document.getElementById('depotDevisEmptyText');
    var emptyHint = document.getElementById('depotDevisEmptyHint');
    if (!list) return;
    var uid = String((currentUser && currentUser.id) || '');
    var showAll = depotDevisActiveTab === 'toutes';
    var items = (comptaJustificatifs || []).filter(isDepotDevis).map(normalizeDepotDevisRecord);
    if (!showAll) items = items.filter(function(j) { return String(j.deposeParUserId || '') === uid; });
    items.sort(function(a, b) { return new Date(b.dateAjout || 0) - new Date(a.dateAjout || 0); });
    if (!items.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        if (emptyText) emptyText.textContent = showAll ? 'Aucun devis déposé' : 'Aucun de vos devis';
        if (emptyHint) emptyHint.textContent = showAll
            ? 'Les devis déposés apparaîtront ici'
            : 'Déposez un devis fournisseur pour validation';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = items.map(function(j) {
        var statutInfo = getDepotDevisStatutInfo(j);
        var title = j.libelle || j.fournisseur || j.nomFichier || 'Devis';
        var dateDepot = j.dateAjout ? new Date(j.dateAjout).toLocaleDateString('fr-FR') : '—';
        var montant = j.montantTTC ? ((typeof formatMontant === 'function' ? formatMontant(j.montantTTC) : j.montantTTC) + ' €') : '';
        var meta = ['Déposé le ' + dateDepot];
        if (showAll) meta.push('Par ' + docsEscapeHtml(typeof getJustificatifDeposantName === 'function' ? getJustificatifDeposantName(j) : ''));
        if (j.fournisseur) meta.push(docsEscapeHtml(j.fournisseur));
        if (j.numeroDevis || j.numeroFacture) meta.push('N° ' + docsEscapeHtml(j.numeroDevis || j.numeroFacture));
        if (montant) meta.push(montant);
        if (j.signature && j.signature.signedAt) meta.push('Signé le ' + new Date(j.signature.signedAt).toLocaleDateString('fr-FR'));
        var hasFile = j.type !== 'manuel' && (j.fileUrl || j.file_id || j.fileBase64);
        var isOwner = String(j.deposeParUserId || '') === uid;
        var canDelete = isOwner && getDepotDevisStatut(j) === 'en_attente';
        return '<div class="depot-justif-card compta-validation-card-clickable" onclick="openDepotDevisDetailModal(\'' + j.id + '\')">' +
            '<div class="depot-justif-card-icon">📋</div>' +
            '<div class="depot-justif-card-body">' +
            '<div class="depot-justif-card-title-row">' +
            '<div class="depot-justif-card-title">' + docsEscapeHtml(title) + '</div>' +
            '<span class="depot-facture-statut ' + statutInfo.className + '">' + statutInfo.label + '</span>' +
            '</div>' +
            '<div class="depot-justif-card-meta">' + meta.join(' · ') + '</div>' +
            '</div>' +
            '<div class="depot-justif-card-actions" onclick="event.stopPropagation()">' +
            (hasFile ? '<button type="button" class="btn btn-secondary" onclick="openJustificatifPreview(\'' + j.id + '\')" title="Aperçu">👁️</button>' : '') +
            (hasFile ? '<button type="button" class="btn btn-secondary" onclick="downloadJustificatifById(\'' + j.id + '\')" title="Télécharger">⬇️</button>' : '') +
            (canDelete ? '<button type="button" class="btn btn-secondary" onclick="deleteDepotDevis(\'' + j.id + '\')" title="Supprimer" style="color:var(--mn-red);">🗑️</button>' : '') +
            '</div></div>';
    }).join('');
}
if (typeof window !== 'undefined') window.renderDepotDevisList = renderDepotDevisList;

async function openDepotDevisModal() {
    if (!canDepotComptaDocuments()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé — droit Comptabilité requis', 'error');
        return;
    }
    depotDevisFilePending = null;
    await ensureComptaLiensDataLoaded();
    var modal = document.getElementById('depotDevisModal');
    if (!modal) return;
    ['depotDevisLibelle', 'depotDevisFournisseur', 'depotDevisNumero', 'depotDevisMontant', 'depotDevisCommentaire'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var dateEl = document.getElementById('depotDevisDate');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    var validEl = document.getElementById('depotDevisDateValidite');
    if (validEl) validEl.value = '';
    var fileInput = document.getElementById('depotDevisFileInput');
    if (fileInput) fileInput.value = '';
    var label = document.getElementById('depotDevisFileLabel');
    if (label) label.innerHTML = 'Glissez votre devis ici ou <strong>cliquez pour parcourir</strong>';
    populateComptaLiensSelects('depotDevis', null);
    var btn = document.getElementById('depotDevisSubmitBtn');
    if (btn) { btn.disabled = false; btn.textContent = '📤 Déposer le devis'; }
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotDevisModal = openDepotDevisModal;

async function openDepotDevisModalFromMail(file, opts) {
    opts = opts || {};
    if (!file) return;
    if (!canDepotComptaDocuments()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé — droit Comptabilité requis', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Fichier trop volumineux (max 10 Mo)', 'error');
        return;
    }
    await ensureComptaLiensDataLoaded();
    depotDevisFilePending = file;
    var modal = document.getElementById('depotDevisModal');
    if (!modal) return;
    var baseName = file.name.replace(/\.[^.]+$/, '');
    var set = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    set('depotDevisLibelle', opts.libelle || baseName);
    set('depotDevisFournisseur', opts.fournisseur || '');
    set('depotDevisNumero', opts.numeroDevis || '');
    set('depotDevisMontant', opts.montantTTC != null ? String(opts.montantTTC) : '');
    set('depotDevisCommentaire', opts.commentaire || '');
    set('depotDevisDate', opts.dateDocument || new Date().toISOString().slice(0, 10));
    set('depotDevisDateValidite', opts.dateValidite || '');
    var fileInput = document.getElementById('depotDevisFileInput');
    if (fileInput) fileInput.value = '';
    var label = document.getElementById('depotDevisFileLabel');
    if (label) label.innerHTML = '<strong>' + docsEscapeHtml(file.name) + '</strong> (' + (file.size / 1024).toFixed(0) + ' Ko)';
    populateComptaLiensSelects('depotDevis', null);
    var btn = document.getElementById('depotDevisSubmitBtn');
    if (btn) { btn.disabled = false; btn.textContent = '📤 Déposer le devis'; }
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotDevisModalFromMail = openDepotDevisModalFromMail;

function closeDepotDevisModal() {
    var modal = document.getElementById('depotDevisModal');
    if (modal) modal.classList.remove('active');
    depotDevisFilePending = null;
}
if (typeof window !== 'undefined') window.closeDepotDevisModal = closeDepotDevisModal;

function handleDepotDevisFileSelect(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Fichier trop volumineux (max 10 Mo)', 'error');
        event.target.value = '';
        return;
    }
    depotDevisFilePending = file;
    var label = document.getElementById('depotDevisFileLabel');
    if (label) label.innerHTML = '<strong>' + docsEscapeHtml(file.name) + '</strong> (' + (file.size / 1024).toFixed(0) + ' Ko)';
    var libelle = document.getElementById('depotDevisLibelle');
    if (libelle && !libelle.value.trim()) libelle.value = file.name.replace(/\.[^.]+$/, '');
}
if (typeof window !== 'undefined') window.handleDepotDevisFileSelect = handleDepotDevisFileSelect;

async function submitDepotDevis() {
    if (!canDepotComptaDocuments()) return;
    if (!depotDevisFilePending) {
        if (typeof showToast === 'function') showToast('Sélectionnez le fichier du devis', 'error');
        return;
    }
    var btn = document.getElementById('depotDevisSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }
    var file = depotDevisFilePending;
    var fileUrl = null;
    var fileId = null;
    try {
        var uploaded = await uploadFile(file, 'documents');
        fileUrl = uploaded.url || uploaded.downloadUrl;
        fileId = uploaded.file_id;
    } catch (err) {
        console.warn(err);
        if (typeof showToast === 'function') showToast('Erreur lors de l\'upload du fichier', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📤 Déposer le devis'; }
        return;
    }
    var montantRaw = document.getElementById('depotDevisMontant') && document.getElementById('depotDevisMontant').value;
    var montantTTC = montantRaw ? parseFloat(montantRaw) : null;
    var justif = (typeof stampJustificatifDeposant === 'function' ? stampJustificatifDeposant : function(j) { return j; })({
        id: 'devis_dep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        source: 'depot_devis',
        libelle: (document.getElementById('depotDevisLibelle') && document.getElementById('depotDevisLibelle').value.trim()) || file.name,
        nomFichier: file.name,
        type: file.type.indexOf('pdf') !== -1 ? 'pdf' : 'image',
        fileType: file.type,
        stored_externally: !!fileUrl,
        file_id: fileId,
        fileUrl: fileUrl,
        fournisseur: (document.getElementById('depotDevisFournisseur') && document.getElementById('depotDevisFournisseur').value.trim()) || null,
        numeroDevis: (document.getElementById('depotDevisNumero') && document.getElementById('depotDevisNumero').value.trim()) || null,
        dateDocument: (document.getElementById('depotDevisDate') && document.getElementById('depotDevisDate').value) || null,
        dateValidite: (document.getElementById('depotDevisDateValidite') && document.getElementById('depotDevisDateValidite').value) || null,
        montantTTC: montantTTC,
        commentaire: (document.getElementById('depotDevisCommentaire') && document.getElementById('depotDevisCommentaire').value.trim()) || null,
        liens: readLiensFromForm('depotDevis'),
        dateAjout: new Date().toISOString(),
        statut: 'en_attente',
        statutValidation: 'en_attente'
    });
    comptaJustificatifs.push(justif);
    await saveComptaData();
    renderDepotDevisList();
    closeDepotDevisModal();
    if (typeof updateComptabiliteHomeTiles === 'function') updateComptabiliteHomeTiles();
    if (typeof showToast === 'function') showToast('Devis déposé avec succès', 'success');
}
if (typeof window !== 'undefined') window.submitDepotDevis = submitDepotDevis;

function deleteDepotDevis(justifId) {
    var justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotDevis(justif)) return;
    var canVal = canValidateDevisPermission();
    var isOwner = String(justif.deposeParUserId || '') === String((currentUser && currentUser.id) || '');
    if (!canVal) {
        if (!isOwner) return;
        if (getDepotDevisStatut(justif) !== 'en_attente') {
            if (typeof showToast === 'function') showToast('Ce devis ne peut plus être supprimé', 'error');
            return;
        }
    }
    var titre = justif.libelle || justif.fournisseur || justif.nomFichier || 'ce devis';
    if (!confirm('Supprimer « ' + titre + ' » ?\n\nCette action est irréversible.')) return;
    if (typeof deleteJustificatif === 'function') deleteJustificatif(justifId, true);
    else {
        comptaJustificatifs = comptaJustificatifs.filter(function(j) { return j.id !== justifId; });
        saveComptaData();
    }
    closeDepotDevisDetailModal();
    renderDepotDevisList();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
}
if (typeof window !== 'undefined') window.deleteDepotDevis = deleteDepotDevis;

function openDepotDevisDetailModal(justifId) {
    var justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotDevis(justif)) return;
    normalizeDepotDevisRecord(justif);
    currentDepotDevisDetailId = justifId;
    var modal = document.getElementById('depotDevisDetailModal');
    if (!modal) return;
    var statutInfo = getDepotDevisStatutInfo(justif);
    var titleEl = document.getElementById('depotDevisDetailTitle');
    var statutEl = document.getElementById('depotDevisDetailStatut');
    var bodyEl = document.getElementById('depotDevisDetailBody');
    var actionsEl = document.getElementById('depotDevisDetailActions');
    if (titleEl) titleEl.textContent = justif.libelle || justif.fournisseur || justif.nomFichier || 'Devis';
    if (statutEl) {
        statutEl.textContent = statutInfo.label;
        statutEl.className = 'depot-facture-statut ' + statutInfo.className;
    }
    var rows = [];
    rows.push({ label: 'Fournisseur', value: justif.fournisseur || '—' });
    rows.push({ label: 'N° devis', value: justif.numeroDevis || justif.numeroFacture || '—' });
    rows.push({ label: 'Date devis', value: justif.dateDocument ? new Date(justif.dateDocument).toLocaleDateString('fr-FR') : '—' });
    rows.push({ label: 'Validité', value: justif.dateValidite ? new Date(justif.dateValidite).toLocaleDateString('fr-FR') : '—' });
    rows.push({ label: 'Montant TTC', value: justif.montantTTC ? ((typeof formatMontant === 'function' ? formatMontant(justif.montantTTC) : justif.montantTTC) + ' €') : '—' });
    rows.push({ label: 'Déposé le', value: justif.dateAjout ? new Date(justif.dateAjout).toLocaleDateString('fr-FR') : '—' });
    rows.push({ label: 'Déposé par', value: typeof getJustificatifDeposantName === 'function' ? getJustificatifDeposantName(justif) : '—' });
    formatLiensLabels(justif.liens).forEach(function(l) { rows.push({ label: 'Lien', value: l }); });
    if (justif.commentaire) rows.push({ label: 'Commentaire', value: justif.commentaire });
    if (justif.signature) {
        rows.push({ label: 'Signé par', value: justif.signature.signedByName || '—' });
        rows.push({ label: 'Signé le', value: justif.signature.signedAt ? new Date(justif.signature.signedAt).toLocaleString('fr-FR') : '—' });
    }
    if (getDepotDevisStatut(justif) === 'refuse' && justif.motifRefus) {
        rows.push({ label: 'Motif refus', value: justif.motifRefus, error: true });
    }
    if (bodyEl) {
        var sigHtml = '';
        if (justif.signature && justif.signature.fileUrl) {
            sigHtml = '<div class="compta-detail-row"><span class="compta-detail-label">Signature</span><span class="compta-detail-value"><img src="' + docsEscapeHtml(justif.signature.fileUrl) + '" alt="Signature" style="max-height:64px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:4px;"></span></div>';
        }
        bodyEl.innerHTML = rows.map(function(r) {
            var cls = r.error ? ' compta-detail-row-error' : '';
            return '<div class="compta-detail-row' + cls + '"><span class="compta-detail-label">' + docsEscapeHtml(r.label) + '</span><span class="compta-detail-value">' + docsEscapeHtml(r.value) + '</span></div>';
        }).join('') + sigHtml;
    }
    var st = getDepotDevisStatut(justif);
    var hasFile = justif.type !== 'manuel' && (justif.fileUrl || justif.file_id || justif.fileBase64);
    var canVal = canValidateDevisPermission();
    var actions = '';
    if (hasFile) {
        actions += '<button type="button" class="btn btn-secondary" onclick="downloadJustificatifById(\'' + justif.id + '\')">⬇️ Télécharger</button>';
        actions += '<button type="button" class="btn btn-secondary" onclick="openJustificatifPreview(\'' + justif.id + '\')">👁️ Aperçu</button>';
    }
    if (justif.signature) {
        actions += '<button type="button" class="btn btn-secondary" onclick="openDepotDevisSignatureAttestation(\'' + justif.id + '\')">📄 Attestation</button>';
    }
    if (canVal) {
        actions += '<button type="button" class="btn btn-secondary" onclick="openDepotDevisEditModal(\'' + justif.id + '\')">✏️ Modifier</button>';
    }
    if (canVal && st === 'en_attente') {
        actions += '<button type="button" class="btn" onclick="setDepotDevisStatut(\'' + justif.id + '\', \'accepte\')">✓ Accepter & signer</button>';
        actions += '<button type="button" class="btn btn-secondary" onclick="setDepotDevisStatut(\'' + justif.id + '\', \'refuse\')">Refuser</button>';
    }
    var isOwner = String(justif.deposeParUserId || '') === String((currentUser && currentUser.id) || '');
    if (canVal || (isOwner && st === 'en_attente')) {
        actions += '<button type="button" class="btn btn-secondary" style="color:var(--mn-red);" onclick="deleteDepotDevis(\'' + justif.id + '\')">🗑️ Supprimer</button>';
    }
    if (actionsEl) actionsEl.innerHTML = actions;
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotDevisDetailModal = openDepotDevisDetailModal;

function closeDepotDevisDetailModal() {
    currentDepotDevisDetailId = null;
    var modal = document.getElementById('depotDevisDetailModal');
    if (modal) modal.classList.remove('active');
}
if (typeof window !== 'undefined') window.closeDepotDevisDetailModal = closeDepotDevisDetailModal;

async function openDepotDevisEditModal(justifId) {
    if (!canValidateDevisPermission()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    var justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotDevis(justif)) return;
    await ensureComptaLiensDataLoaded();
    var modal = document.getElementById('depotDevisEditModal');
    if (!modal) return;
    document.getElementById('depotDevisEditId').value = justifId;
    document.getElementById('depotDevisEditLibelle').value = justif.libelle || justif.nomFichier || '';
    document.getElementById('depotDevisEditFournisseur').value = justif.fournisseur || '';
    document.getElementById('depotDevisEditNumero').value = justif.numeroDevis || justif.numeroFacture || '';
    document.getElementById('depotDevisEditMontant').value = justif.montantTTC != null ? justif.montantTTC : '';
    document.getElementById('depotDevisEditDate').value = (justif.dateDocument || '').toString().slice(0, 10);
    document.getElementById('depotDevisEditDateValidite').value = (justif.dateValidite || '').toString().slice(0, 10);
    document.getElementById('depotDevisEditCommentaire').value = justif.commentaire || '';
    populateComptaLiensSelects('depotDevisEdit', ensureComptaLiens(justif));
    closeDepotDevisDetailModal();
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotDevisEditModal = openDepotDevisEditModal;

function closeDepotDevisEditModal() {
    var modal = document.getElementById('depotDevisEditModal');
    if (modal) modal.classList.remove('active');
}
if (typeof window !== 'undefined') window.closeDepotDevisEditModal = closeDepotDevisEditModal;

async function saveDepotDevisEdit() {
    if (!canValidateDevisPermission()) return;
    var justifId = document.getElementById('depotDevisEditId') && document.getElementById('depotDevisEditId').value;
    var justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotDevis(justif)) return;
    var libelle = document.getElementById('depotDevisEditLibelle') && document.getElementById('depotDevisEditLibelle').value.trim();
    if (!libelle) {
        if (typeof showToast === 'function') showToast('Indiquez un libellé', 'error');
        return;
    }
    justif.libelle = libelle;
    justif.fournisseur = (document.getElementById('depotDevisEditFournisseur') && document.getElementById('depotDevisEditFournisseur').value.trim()) || null;
    justif.numeroDevis = (document.getElementById('depotDevisEditNumero') && document.getElementById('depotDevisEditNumero').value.trim()) || null;
    var montantRaw = document.getElementById('depotDevisEditMontant') && document.getElementById('depotDevisEditMontant').value;
    justif.montantTTC = montantRaw ? parseFloat(montantRaw) : null;
    justif.dateDocument = (document.getElementById('depotDevisEditDate') && document.getElementById('depotDevisEditDate').value) || null;
    justif.dateValidite = (document.getElementById('depotDevisEditDateValidite') && document.getElementById('depotDevisEditDateValidite').value) || null;
    justif.commentaire = (document.getElementById('depotDevisEditCommentaire') && document.getElementById('depotDevisEditCommentaire').value.trim()) || null;
    justif.liens = readLiensFromForm('depotDevisEdit');
    if (typeof saveComptaData === 'function') await saveComptaData();
    closeDepotDevisEditModal();
    renderDepotDevisList();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    if (typeof showToast === 'function') showToast('Devis mis à jour', 'success');
}
if (typeof window !== 'undefined') window.saveDepotDevisEdit = saveDepotDevisEdit;

async function setDepotDevisStatut(justifId, statut) {
    if (!canValidateDevisPermission()) return;
    var justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotDevis(justif)) return;
    if (statut === 'accepte') {
        var sig = getCurrentUserSignature();
        if (!sig || !(sig.file_id || sig.fileUrl)) {
            if (typeof showToast === 'function') showToast('Enregistrez d\'abord votre signature', 'error');
            openComptaSignatureModal();
            return;
        }
        if (!confirm('Accepter ce devis et y appliquer votre signature ?\n\n(Validation interne — l\'original est conservé.)')) return;
        justif.statutValidation = 'accepte';
        justif.signature = {
            file_id: sig.file_id,
            fileUrl: getUserSignatureUrl(sig),
            signedAt: new Date().toISOString(),
            signedByUserId: String(currentUser.id),
            signedByName: (((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim()) || currentUser.username,
            mention: 'Bon pour accord — validation interne'
        };
        justif.dateAcceptation = justif.signature.signedAt;
        delete justif.motifRefus;
        delete justif.dateRefus;
    } else if (statut === 'refuse') {
        var motif = prompt('Motif du refus (optionnel) :', '') || '';
        justif.statutValidation = 'refuse';
        justif.motifRefus = motif.trim() || 'Refusé par la comptabilité';
        justif.dateRefus = new Date().toISOString();
        delete justif.signature;
        delete justif.dateAcceptation;
    } else {
        justif.statutValidation = statut;
    }
    if (typeof saveComptaData === 'function') await saveComptaData();
    renderDepotDevisList();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    if (typeof updateComptabiliteHomeTiles === 'function') updateComptabiliteHomeTiles();
    closeDepotDevisDetailModal();
    if (justif.deposeParUserId && typeof notifyUserAssigned === 'function') {
        var labels = { accepte: 'accepté', refuse: 'refusé' };
        notifyUserAssigned(justif.deposeParUserId, 'Devis ' + (labels[statut] || statut),
            'Votre devis « ' + (justif.libelle || justif.nomFichier || 'Sans titre') + ' » a été marqué comme ' + (labels[statut] || statut) + '.',
            'info');
    }
    if (statut === 'accepte') {
        openDepotDevisSignatureAttestation(justifId);
    }
    var toasts = { accepte: 'Devis accepté et signé', refuse: 'Devis refusé' };
    if (typeof showToast === 'function') showToast(toasts[statut] || 'Devis mis à jour', 'success');
}
if (typeof window !== 'undefined') window.setDepotDevisStatut = setDepotDevisStatut;

function openDepotDevisSignatureAttestation(justifId) {
    var justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !justif.signature) return;
    var sigUrl = justif.signature.fileUrl || (justif.signature.file_id && typeof getDownloadFileUrl === 'function' ? getDownloadFileUrl(justif.signature.file_id) : '');
    var fileLink = '';
    if (justif.file_id && typeof getDownloadFileUrl === 'function') fileLink = getDownloadFileUrl(justif.file_id);
    else if (justif.fileUrl) fileLink = justif.fileUrl;
    var w = window.open('', '_blank', 'noopener');
    if (!w) {
        if (typeof showToast === 'function') showToast('Autorisez les pop-ups pour voir l\'attestation', 'error');
        return;
    }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Attestation — ' + docsEscapeHtml(justif.libelle || 'Devis') + '</title>' +
        '<style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1.5rem;color:#1e293b;}h1{font-size:1.4rem;} .meta{color:#64748b;font-size:0.95rem;} .box{border:1px solid #cbd5e1;border-radius:12px;padding:1.25rem;margin:1.5rem 0;} img{max-height:90px;} .hint{font-size:0.85rem;color:#94a3b8;margin-top:2rem;} @media print{.noprint{display:none;}}</style></head><body>' +
        '<p class="noprint"><button onclick="window.print()">Imprimer / PDF</button></p>' +
        '<h1>Attestation d\'acceptation de devis</h1>' +
        '<p class="meta">Validation interne enregistrée dans le logiciel de gestion.</p>' +
        '<div class="box">' +
        '<p><strong>Document :</strong> ' + docsEscapeHtml(justif.libelle || justif.nomFichier || 'Devis') + '</p>' +
        '<p><strong>Fournisseur :</strong> ' + docsEscapeHtml(justif.fournisseur || '—') + '</p>' +
        '<p><strong>N° :</strong> ' + docsEscapeHtml(justif.numeroDevis || justif.numeroFacture || '—') + '</p>' +
        '<p><strong>Montant TTC :</strong> ' + docsEscapeHtml(justif.montantTTC != null ? (String(justif.montantTTC) + ' €') : '—') + '</p>' +
        '<p><strong>Accepté par :</strong> ' + docsEscapeHtml(justif.signature.signedByName || '—') + '</p>' +
        '<p><strong>Le :</strong> ' + docsEscapeHtml(justif.signature.signedAt ? new Date(justif.signature.signedAt).toLocaleString('fr-FR') : '—') + '</p>' +
        '<p><strong>Mention :</strong> ' + docsEscapeHtml(justif.signature.mention || 'Bon pour accord') + '</p>' +
        (sigUrl ? '<p><strong>Signature :</strong><br><img src="' + docsEscapeHtml(sigUrl) + '" alt="Signature"></p>' : '') +
        (fileLink ? '<p><a href="' + docsEscapeHtml(fileLink) + '">Document original</a></p>' : '') +
        '</div>' +
        '<p class="hint">Cette attestation prouve l\'acceptation interne. Elle ne remplace pas une signature électronique qualifiée.</p>' +
        '</body></html>');
    w.document.close();
}
if (typeof window !== 'undefined') window.openDepotDevisSignatureAttestation = openDepotDevisSignatureAttestation;

// ----- Validation devis -----

async function openComptaValidationDevisPage() {
    if (!canValidateDevisPermission()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    var hub = document.getElementById('comptaValidationPage');
    if (hub) hub.classList.remove('active');
    if (typeof closeComptaValidationSubPages === 'function') closeComptaValidationSubPages();
    var page = document.getElementById('comptaValidationDevisPage');
    if (page) page.classList.add('active');
    try { if (typeof loadComptaData === 'function') await loadComptaData(); } catch (e) { console.warn(e); }
    renderComptaValidationDevisList();
    if (typeof updateComptaValidationBadges === 'function') updateComptaValidationBadges();
}
if (typeof window !== 'undefined') window.openComptaValidationDevisPage = openComptaValidationDevisPage;

function switchComptaValidationDevisTab(tab) {
    comptaValidationDevisTab = tab || 'a_traiter';
    document.querySelectorAll('#comptaValidationDevisTabs .compta-tab').forEach(function(btn) { btn.classList.remove('active'); });
    var map = { a_traiter: 'comptaValidationDevisTabTraiter', accepte: 'comptaValidationDevisTabAccepte', refuse: 'comptaValidationDevisTabRefuse' };
    var el = document.getElementById(map[comptaValidationDevisTab]);
    if (el) el.classList.add('active');
    renderComptaValidationDevisList();
}
if (typeof window !== 'undefined') window.switchComptaValidationDevisTab = switchComptaValidationDevisTab;

function filterComptaValidationDevis() {
    var items = (comptaJustificatifs || []).filter(isDepotDevis).map(normalizeDepotDevisRecord);
    if (comptaValidationDevisTab === 'accepte') return items.filter(function(j) { return getDepotDevisStatut(j) === 'accepte'; });
    if (comptaValidationDevisTab === 'refuse') return items.filter(function(j) { return getDepotDevisStatut(j) === 'refuse' || getDepotDevisStatut(j) === 'expire'; });
    return items.filter(function(j) { return getDepotDevisStatut(j) === 'en_attente'; });
}

function renderComptaValidationDevisList() {
    var list = document.getElementById('comptaValidationDevisList');
    var empty = document.getElementById('comptaValidationDevisEmpty');
    var totalBar = document.getElementById('comptaValidationDevisTotalBar');
    if (!list || !canValidateDevisPermission()) return;
    var items = filterComptaValidationDevis().slice().sort(function(a, b) {
        return new Date(b.dateAjout || 0) - new Date(a.dateAjout || 0);
    });
    var total = items.reduce(function(s, j) { return s + (parseFloat(j.montantTTC) || 0); }, 0);
    if (totalBar) {
        totalBar.innerHTML = items.length
            ? '<strong>' + items.length + '</strong> devis · Total : <strong>' + (typeof formatMontant === 'function' ? formatMontant(total) : total.toFixed(2)) + ' €</strong>'
            : '';
    }
    if (empty) {
        empty.textContent = comptaValidationDevisTab === 'accepte' ? 'Aucun devis accepté'
            : (comptaValidationDevisTab === 'refuse' ? 'Aucun devis refusé' : 'Aucun devis à traiter');
    }
    if (!items.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    var isTraiter = comptaValidationDevisTab === 'a_traiter';
    list.innerHTML = items.map(function(j) {
        var title = j.libelle || j.fournisseur || j.nomFichier || 'Devis';
        var dateDepot = j.dateAjout ? new Date(j.dateAjout).toLocaleDateString('fr-FR') : '—';
        var montant = j.montantTTC ? ((typeof formatMontant === 'function' ? formatMontant(j.montantTTC) : j.montantTTC) + ' €') : '';
        var deposant = typeof getJustificatifDeposantName === 'function' ? getJustificatifDeposantName(j) : '';
        var meta = ['Déposé le ' + dateDepot, 'Par ' + docsEscapeHtml(deposant)];
        if (j.fournisseur) meta.push(docsEscapeHtml(j.fournisseur));
        if (j.numeroDevis || j.numeroFacture) meta.push('N° ' + docsEscapeHtml(j.numeroDevis || j.numeroFacture));
        if (montant) meta.push(montant);
        var hasFile = j.type !== 'manuel' && (j.fileUrl || j.file_id || j.fileBase64);
        var actions = '';
        if (hasFile) {
            actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();downloadJustificatifById(\'' + j.id + '\')" title="Télécharger">⬇️</button>';
            actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();openJustificatifPreview(\'' + j.id + '\')" title="Aperçu">👁️</button>';
        }
        actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();openDepotDevisEditModal(\'' + j.id + '\')" title="Modifier">✏️</button>';
        if (isTraiter) {
            actions += '<button type="button" class="btn" onclick="event.stopPropagation();setDepotDevisStatut(\'' + j.id + '\', \'accepte\')">Accepter</button>';
            actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();setDepotDevisStatut(\'' + j.id + '\', \'refuse\')">Refuser</button>';
        }
        actions += '<button type="button" class="btn btn-secondary" style="color:var(--mn-red);" onclick="event.stopPropagation();deleteDepotDevis(\'' + j.id + '\')" title="Supprimer">🗑️</button>';
        return '<div class="compta-validation-card depot-justif-card compta-validation-card-clickable" onclick="openDepotDevisDetailModal(\'' + j.id + '\')">' +
            '<div class="depot-justif-card-icon">📋</div>' +
            '<div class="compta-validation-card-main depot-justif-card-body">' +
            '<div class="compta-validation-card-title">' + docsEscapeHtml(title) + '</div>' +
            '<div class="compta-validation-card-meta">' + meta.join(' · ') + '</div>' +
            '</div>' +
            '<div class="compta-validation-card-actions depot-justif-card-actions" onclick="event.stopPropagation()">' + actions + '</div></div>';
    }).join('');
}
if (typeof window !== 'undefined') window.renderComptaValidationDevisList = renderComptaValidationDevisList;

// ----- Documents émis -----

async function openComptaDocsEmisPage() {
    if (!canDepotComptaDocuments() && !canValidateDevisPermission()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    var page = document.getElementById('comptaDocsEmisPage');
    if (page) page.classList.add('active');
    if (typeof loadComptaData === 'function') await loadComptaData();
    switchComptaDocsEmisTab(comptaDocsEmisActiveTab || 'devis');
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
if (typeof window !== 'undefined') window.openComptaDocsEmisPage = openComptaDocsEmisPage;

function closeComptaDocsEmisPage() {
    var page = document.getElementById('comptaDocsEmisPage');
    if (page) page.classList.remove('active');
    if (typeof returnToComptabiliteHome === 'function') returnToComptabiliteHome();
}
if (typeof window !== 'undefined') window.closeComptaDocsEmisPage = closeComptaDocsEmisPage;

function switchComptaDocsEmisTab(tab) {
    comptaDocsEmisActiveTab = tab === 'factures' ? 'factures' : 'devis';
    comptaDocsEmisTypeFilter = comptaDocsEmisActiveTab === 'factures' ? 'facture' : 'devis';
    document.querySelectorAll('#comptaDocsEmisTabs .compta-tab').forEach(function(btn) { btn.classList.remove('active'); });
    var activeBtn = comptaDocsEmisActiveTab === 'factures'
        ? document.getElementById('comptaDocsEmisTabFactures')
        : document.getElementById('comptaDocsEmisTabDevis');
    if (activeBtn) activeBtn.classList.add('active');
    renderComptaDocsEmisList();
}
if (typeof window !== 'undefined') window.switchComptaDocsEmisTab = switchComptaDocsEmisTab;

function getDocEmisStatutInfo(doc) {
    if (!doc) return DOCS_EMIS_DEVIS_STATUTS.brouillon;
    if (doc.type === 'facture') return DOCS_EMIS_FACTURE_STATUTS[doc.statut] || DOCS_EMIS_FACTURE_STATUTS.emise;
    return DOCS_EMIS_DEVIS_STATUTS[doc.statut] || DOCS_EMIS_DEVIS_STATUTS.brouillon;
}

function renderComptaDocsEmisList() {
    var list = document.getElementById('comptaDocsEmisList');
    var empty = document.getElementById('comptaDocsEmisEmpty');
    if (!list) return;
    var items = (comptaDocumentsEmis || []).filter(function(d) { return d.type === comptaDocsEmisTypeFilter; });
    items.sort(function(a, b) { return new Date(b.dateAjout || 0) - new Date(a.dateAjout || 0); });
    if (!items.length) {
        list.innerHTML = '';
        if (empty) {
            empty.style.display = 'block';
            empty.textContent = comptaDocsEmisTypeFilter === 'facture' ? 'Aucune facture émise enregistrée' : 'Aucun devis émis enregistré';
        }
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = items.map(function(d) {
        var st = getDocEmisStatutInfo(d);
        var title = d.libelle || d.client || d.nomFichier || (d.type === 'facture' ? 'Facture' : 'Devis');
        var meta = [];
        if (d.client) meta.push(docsEscapeHtml(d.client));
        if (d.numero) meta.push('N° ' + docsEscapeHtml(d.numero));
        if (d.dateDocument) meta.push(new Date(d.dateDocument).toLocaleDateString('fr-FR'));
        if (d.montantTTC != null) meta.push((typeof formatMontant === 'function' ? formatMontant(d.montantTTC) : d.montantTTC) + ' €');
        return '<div class="depot-justif-card compta-validation-card-clickable" onclick="openComptaDocEmisDetailModal(\'' + d.id + '\')">' +
            '<div class="depot-justif-card-icon">' + (d.type === 'facture' ? '📤' : '📝') + '</div>' +
            '<div class="depot-justif-card-body">' +
            '<div class="depot-justif-card-title-row">' +
            '<div class="depot-justif-card-title">' + docsEscapeHtml(title) + '</div>' +
            '<span class="depot-facture-statut ' + st.className + '">' + st.label + '</span>' +
            '</div>' +
            '<div class="depot-justif-card-meta">' + meta.join(' · ') + '</div>' +
            '</div></div>';
    }).join('');
}
if (typeof window !== 'undefined') window.renderComptaDocsEmisList = renderComptaDocsEmisList;

async function openComptaDocEmisModal(preType) {
    if (!canDepotComptaDocuments()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé — droit Comptabilité requis', 'error');
        return;
    }
    await ensureComptaLiensDataLoaded();
    comptaDocEmisFilePending = null;
    var modal = document.getElementById('comptaDocEmisModal');
    if (!modal) return;
    var type = preType || comptaDocsEmisTypeFilter || 'devis';
    document.getElementById('comptaDocEmisType').value = type;
    ['comptaDocEmisLibelle', 'comptaDocEmisClient', 'comptaDocEmisNumero', 'comptaDocEmisMontant', 'comptaDocEmisCommentaire'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('comptaDocEmisDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('comptaDocEmisDateEcheance').value = '';
    refreshComptaDocEmisStatutOptions();
    document.getElementById('comptaDocEmisStatut').value = type === 'facture' ? 'emise' : 'envoye';
    var label = document.getElementById('comptaDocEmisFileLabel');
    if (label) label.innerHTML = 'Glissez le PDF ici ou <strong>cliquez pour parcourir</strong>';
    var fileInput = document.getElementById('comptaDocEmisFileInput');
    if (fileInput) fileInput.value = '';
    populateComptaLiensSelects('comptaDocEmis', null);
    document.getElementById('comptaDocEmisModalTitle').textContent = type === 'facture' ? 'Enregistrer une facture émise' : 'Enregistrer un devis émis';
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openComptaDocEmisModal = openComptaDocEmisModal;

function refreshComptaDocEmisStatutOptions() {
    var type = document.getElementById('comptaDocEmisType') && document.getElementById('comptaDocEmisType').value;
    var sel = document.getElementById('comptaDocEmisStatut');
    if (!sel) return;
    var map = type === 'facture' ? DOCS_EMIS_FACTURE_STATUTS : DOCS_EMIS_DEVIS_STATUTS;
    var cur = sel.value;
    sel.innerHTML = Object.keys(map).map(function(k) {
        return '<option value="' + k + '">' + map[k].label + '</option>';
    }).join('');
    if (map[cur]) sel.value = cur;
}
if (typeof window !== 'undefined') window.refreshComptaDocEmisStatutOptions = refreshComptaDocEmisStatutOptions;

function closeComptaDocEmisModal() {
    var modal = document.getElementById('comptaDocEmisModal');
    if (modal) modal.classList.remove('active');
    comptaDocEmisFilePending = null;
}
if (typeof window !== 'undefined') window.closeComptaDocEmisModal = closeComptaDocEmisModal;

function handleComptaDocEmisFileSelect(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Fichier trop volumineux (max 10 Mo)', 'error');
        event.target.value = '';
        return;
    }
    comptaDocEmisFilePending = file;
    var label = document.getElementById('comptaDocEmisFileLabel');
    if (label) label.innerHTML = '<strong>' + docsEscapeHtml(file.name) + '</strong> (' + (file.size / 1024).toFixed(0) + ' Ko)';
    var libelle = document.getElementById('comptaDocEmisLibelle');
    if (libelle && !libelle.value.trim()) libelle.value = file.name.replace(/\.[^.]+$/, '');
}
if (typeof window !== 'undefined') window.handleComptaDocEmisFileSelect = handleComptaDocEmisFileSelect;

async function submitComptaDocEmis() {
    if (!canDepotComptaDocuments()) return;
    if (!comptaDocEmisFilePending) {
        if (typeof showToast === 'function') showToast('Sélectionnez le fichier', 'error');
        return;
    }
    var btn = document.getElementById('comptaDocEmisSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
    var file = comptaDocEmisFilePending;
    try {
        var uploaded = await uploadFile(file, 'documents');
        var type = document.getElementById('comptaDocEmisType').value || 'devis';
        var montantRaw = document.getElementById('comptaDocEmisMontant').value;
        var doc = {
            id: 'doc_emis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
            sens: 'emis',
            type: type === 'facture' ? 'facture' : 'devis',
            libelle: document.getElementById('comptaDocEmisLibelle').value.trim() || file.name,
            client: document.getElementById('comptaDocEmisClient').value.trim() || null,
            numero: document.getElementById('comptaDocEmisNumero').value.trim() || null,
            dateDocument: document.getElementById('comptaDocEmisDate').value || null,
            dateEcheance: document.getElementById('comptaDocEmisDateEcheance').value || null,
            montantTTC: montantRaw ? parseFloat(montantRaw) : null,
            statut: document.getElementById('comptaDocEmisStatut').value || (type === 'facture' ? 'emise' : 'envoye'),
            commentaire: document.getElementById('comptaDocEmisCommentaire').value.trim() || null,
            nomFichier: file.name,
            fileType: file.type,
            file_id: uploaded.file_id,
            fileUrl: uploaded.url || uploaded.downloadUrl,
            liens: readLiensFromForm('comptaDocEmis'),
            dateAjout: new Date().toISOString(),
            creeParUserId: String(currentUser.id),
            creeParUserName: (((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim()) || currentUser.username
        };
        if (!Array.isArray(comptaDocumentsEmis)) comptaDocumentsEmis = [];
        comptaDocumentsEmis.push(doc);
        await saveComptaData();
        closeComptaDocEmisModal();
        renderComptaDocsEmisList();
        if (typeof showToast === 'function') showToast('Document enregistré', 'success');
    } catch (err) {
        console.warn(err);
        if (typeof showToast === 'function') showToast('Erreur enregistrement', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    }
}
if (typeof window !== 'undefined') window.submitComptaDocEmis = submitComptaDocEmis;

function openComptaDocEmisDetailModal(docId) {
    var doc = (comptaDocumentsEmis || []).find(function(d) { return d.id === docId; });
    if (!doc) return;
    ensureComptaLiens(doc);
    currentComptaDocEmisDetailId = docId;
    var modal = document.getElementById('comptaDocEmisDetailModal');
    if (!modal) return;
    var st = getDocEmisStatutInfo(doc);
    document.getElementById('comptaDocEmisDetailTitle').textContent = doc.libelle || doc.client || 'Document';
    var statutEl = document.getElementById('comptaDocEmisDetailStatut');
    statutEl.textContent = st.label;
    statutEl.className = 'depot-facture-statut ' + st.className;
    var rows = [
        { label: 'Type', value: doc.type === 'facture' ? 'Facture émise' : 'Devis émis' },
        { label: 'Client', value: doc.client || '—' },
        { label: 'N°', value: doc.numero || '—' },
        { label: 'Date', value: doc.dateDocument ? new Date(doc.dateDocument).toLocaleDateString('fr-FR') : '—' },
        { label: 'Échéance', value: doc.dateEcheance ? new Date(doc.dateEcheance).toLocaleDateString('fr-FR') : '—' },
        { label: 'Montant TTC', value: doc.montantTTC != null ? ((typeof formatMontant === 'function' ? formatMontant(doc.montantTTC) : doc.montantTTC) + ' €') : '—' },
        { label: 'Statut', value: st.label },
        { label: 'Créé par', value: doc.creeParUserName || '—' }
    ];
    formatLiensLabels(doc.liens).forEach(function(l) { rows.push({ label: 'Lien', value: l }); });
    if (doc.commentaire) rows.push({ label: 'Commentaire', value: doc.commentaire });
    document.getElementById('comptaDocEmisDetailBody').innerHTML = rows.map(function(r) {
        return '<div class="compta-detail-row"><span class="compta-detail-label">' + docsEscapeHtml(r.label) + '</span><span class="compta-detail-value">' + docsEscapeHtml(r.value) + '</span></div>';
    }).join('');
    var actions = '';
    if (doc.file_id || doc.fileUrl) {
        var url = doc.fileUrl || (typeof getDownloadFileUrl === 'function' ? getDownloadFileUrl(doc.file_id) : '');
        if (url) {
            actions += '<a class="btn btn-secondary" href="' + docsEscapeHtml(url) + '" target="_blank" rel="noopener">⬇️ Télécharger</a>';
        }
    }
    if (canDepotComptaDocuments() || canValidateDevisPermission()) {
        actions += '<button type="button" class="btn btn-secondary" onclick="openComptaDocEmisStatutModal(\'' + doc.id + '\')">Changer statut</button>';
        if (doc.type === 'devis' && doc.statut === 'accepte') {
            actions += '<button type="button" class="btn" onclick="convertDevisEmisToFacture(\'' + doc.id + '\')">→ Créer facture</button>';
        }
        actions += '<button type="button" class="btn btn-secondary" style="color:var(--mn-red);" onclick="deleteComptaDocEmis(\'' + doc.id + '\')">🗑️ Supprimer</button>';
    }
    document.getElementById('comptaDocEmisDetailActions').innerHTML = actions;
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openComptaDocEmisDetailModal = openComptaDocEmisDetailModal;

function closeComptaDocEmisDetailModal() {
    currentComptaDocEmisDetailId = null;
    var modal = document.getElementById('comptaDocEmisDetailModal');
    if (modal) modal.classList.remove('active');
}
if (typeof window !== 'undefined') window.closeComptaDocEmisDetailModal = closeComptaDocEmisDetailModal;

async function openComptaDocEmisStatutModal(docId) {
    var doc = (comptaDocumentsEmis || []).find(function(d) { return d.id === docId; });
    if (!doc) return;
    var map = doc.type === 'facture' ? DOCS_EMIS_FACTURE_STATUTS : DOCS_EMIS_DEVIS_STATUTS;
    var choices = Object.keys(map).map(function(k) { return k + ' = ' + map[k].label; }).join('\n');
    var next = prompt('Nouveau statut :\n' + choices + '\n\nCode :', doc.statut || '');
    if (!next || !map[next]) return;
    doc.statut = next;
    if (typeof saveComptaData === 'function') await saveComptaData();
    closeComptaDocEmisDetailModal();
    renderComptaDocsEmisList();
    if (typeof showToast === 'function') showToast('Statut mis à jour', 'success');
}
if (typeof window !== 'undefined') window.openComptaDocEmisStatutModal = openComptaDocEmisStatutModal;

async function convertDevisEmisToFacture(devisId) {
    var devis = (comptaDocumentsEmis || []).find(function(d) { return d.id === devisId; });
    if (!devis || devis.type !== 'devis') return;
    if (!confirm('Créer une facture émise à partir de ce devis ?')) return;
    var facture = {
        id: 'doc_emis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        sens: 'emis',
        type: 'facture',
        libelle: (devis.libelle || 'Devis') + ' — Facture',
        client: devis.client,
        numero: null,
        dateDocument: new Date().toISOString().slice(0, 10),
        dateEcheance: null,
        montantTTC: devis.montantTTC,
        statut: 'emise',
        commentaire: 'Issue du devis ' + (devis.numero || devis.libelle || devis.id),
        nomFichier: devis.nomFichier,
        fileType: devis.fileType,
        file_id: devis.file_id,
        fileUrl: devis.fileUrl,
        liens: JSON.parse(JSON.stringify(ensureComptaLiens(devis))),
        devisSourceId: devis.id,
        dateAjout: new Date().toISOString(),
        creeParUserId: String(currentUser.id),
        creeParUserName: (((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim()) || currentUser.username
    };
    devis.statut = 'facture';
    comptaDocumentsEmis.push(facture);
    await saveComptaData();
    closeComptaDocEmisDetailModal();
    switchComptaDocsEmisTab('factures');
    if (typeof showToast === 'function') showToast('Facture créée depuis le devis', 'success');
}
if (typeof window !== 'undefined') window.convertDevisEmisToFacture = convertDevisEmisToFacture;

async function deleteComptaDocEmis(docId) {
    if (!confirm('Supprimer ce document du suivi ?')) return;
    comptaDocumentsEmis = (comptaDocumentsEmis || []).filter(function(d) { return d.id !== docId; });
    await saveComptaData();
    closeComptaDocEmisDetailModal();
    renderComptaDocsEmisList();
}
if (typeof window !== 'undefined') window.deleteComptaDocEmis = deleteComptaDocEmis;

// ----- Liens optionnels aussi sur factures reçues (edit) -----

async function enhanceDepotFactureEditWithLiens() {
    /* called when opening edit — optional hook */
}

function applyLiensToDepotFactureIfPresent(justif) {
    var dealEl = document.getElementById('depotFactureEditDealId');
    if (!dealEl) return;
    justif.liens = readLiensFromForm('depotFactureEdit');
}
