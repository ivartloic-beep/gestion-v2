// ========== MODULE COMPTABILITÉ - FONCTIONS ==========

// Configuration n8n - VOTRE CONFIGURATION
const N8N_CONFIG = {
    // URL de votre webhook n8n pour l'OCR des justificatifs
    webhookOCR: 'https://vps-bffa8415.vps.ovh.net/webhook/compta-ocr',
    // URL du webhook pour l'import de relevé (optionnel)
    webhookReleve: 'https://vps-bffa8415.vps.ovh.net/webhook/compta-releve',
    // Clé API pour sécuriser les appels
    apiKey: 'ComptaL&Co'
};

// Variables globales comptabilité
let comptaTransactions = [];
let comptaJustificatifs = [];
let comptaRegles = [];
let comptaComptes = [{ id: 'principal', nom: 'Compte principal' }];
let comptaFactures = [];
let comptaCategories = [
    { id: 'billetterie', nom: '🎟️ Billetterie', type: 'recette', tauxTVA: 5.5 },
    { id: 'cachets', nom: '🎤 Cachets artistes', type: 'depense', tauxTVA: 20 },
    { id: 'location_salle', nom: '🏛️ Location salle', type: 'depense', tauxTVA: 20 },
    { id: 'location_materiel', nom: '🔊 Location matériel', type: 'depense', tauxTVA: 20 },
    { id: 'transport', nom: '🚐 Transport', type: 'depense', tauxTVA: 10 },
    { id: 'hebergement', nom: '🏨 Hébergement', type: 'depense', tauxTVA: 10 },
    { id: 'restauration', nom: '🍽️ Restauration', type: 'depense', tauxTVA: 10 },
    { id: 'fournitures', nom: '📦 Fournitures', type: 'depense', tauxTVA: 20 },
    { id: 'communication', nom: '📢 Communication', type: 'depense', tauxTVA: 20 },
    { id: 'assurances', nom: '🛡️ Assurances', type: 'depense', tauxTVA: 0 },
    { id: 'honoraires', nom: '📋 Honoraires', type: 'depense', tauxTVA: 20 },
    { id: 'subventions', nom: '🏛️ Subventions', type: 'recette', tauxTVA: 0 },
    { id: 'autres_recettes', nom: '💰 Autres recettes', type: 'recette', tauxTVA: 20 },
    { id: 'autres_depenses', nom: '📤 Autres dépenses', type: 'depense', tauxTVA: 20 }
];
let comptaCurrentSort = { field: 'date', direction: 'desc' };
let comptaFilePending = null;
let comptaJustifFilesPending = [];
let currentEditingTransaction = null;
let ocrValidationQueue = [];
let currentOcrValidation = null;
let depotFactureFilePending = null;
let depotFactureActiveTab = 'mes_factures';
let comptaDocumentsEmis = [];
let comptaSettings = { signatures: {} };

const DEPOT_FACTURE_STATUTS = {
    en_attente: { label: 'À traiter', className: 'depot-facture-statut-attente' },
    a_payer: { label: 'À traiter', className: 'depot-facture-statut-attente' },
    payee: { label: 'Payée', className: 'depot-facture-statut-payee' },
    refusee: { label: 'Refusée', className: 'depot-facture-statut-refusee' }
};

function hasComptaCollectePermission() {
    return typeof hasPermission === 'function' && hasPermission('comptabilite');
}

function stampJustificatifDeposant(justif) {
    if (!justif || !currentUser) return justif;
    justif.deposeParUserId = String(currentUser.id);
    justif.deposeParUserName = ((currentUser.prenom || '') + ' ' + (currentUser.nom || currentUser.username || '')).trim() || currentUser.username || 'Utilisateur';
    return justif;
}

function getJustificatifDeposantName(justif) {
    return justif.deposeParUserName || '—';
}

function isDepotFacture(justif) {
    if (!justif) return false;
    if (justif.source === 'depot_facture') return true;
    if (justif.source === 'depot_devis') return false;
    if (justif.source === 'note_frais') return false;
    if (justif.transactionId) return false;
    return !!justif.deposeParUserId;
}

function getDepotFactureStatutPaiement(justif) {
    return justif.statutPaiement || 'en_attente';
}

function isDepotFactureATraiter(justif) {
    if (!justif) return false;
    var st = getDepotFactureStatutPaiement(justif);
    return st === 'en_attente' || st === 'a_payer';
}
if (typeof window !== 'undefined') window.isDepotFactureATraiter = isDepotFactureATraiter;

function getDepotFactureStatutInfo(justif) {
    var key = getDepotFactureStatutPaiement(justif);
    return DEPOT_FACTURE_STATUTS[key] || DEPOT_FACTURE_STATUTS.en_attente;
}

function formatDepotFactureEcheanceLine(justif) {
    if (!justif || !justif.dateEcheance) return '';
    var label = typeof formatDate === 'function' ? formatDate(justif.dateEcheance) : justif.dateEcheance;
    var overdue = isDepotFactureEcheanceOverdue(justif);
    if (overdue) return '<span class="depot-facture-echeance depot-facture-echeance-overdue">Échéance ' + escapeHtml(label) + '</span>';
    return 'Échéance ' + escapeHtml(label);
}

function isDepotFactureEcheanceOverdue(justif) {
    if (!justif || !justif.dateEcheance) return false;
    var st = getDepotFactureStatutPaiement(justif);
    if (st === 'payee' || st === 'refusee') return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var echeance = new Date(justif.dateEcheance);
    echeance.setHours(0, 0, 0, 0);
    return echeance < today;
}

function normalizeDepotFactureRecord(justif) {
    if (!justif || !isDepotFacture(justif)) return justif;
    if (!justif.source) justif.source = 'depot_facture';
    if (!justif.statutPaiement) justif.statutPaiement = 'en_attente';
    if (!justif.libelle && justif.nomFichier) justif.libelle = justif.nomFichier;
    return justif;
}

// Ancienne page suivi comptable — redirige vers l'accueil Comptabilité
function openComptabilite() {
    if (typeof openComptabiliteHomePage === 'function') openComptabiliteHomePage();
    else openDepotJustificatifsPage();
}

async function openDepotJustificatifsPage() {
    closeAllPages();
    const home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    const page = document.getElementById('depotJustificatifsPage');
    if (page) page.classList.add('active');
    await loadComptaData();
    switchDepotFactureTab(depotFactureActiveTab || 'mes_factures');
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
}
if (typeof window !== 'undefined') window.openDepotJustificatifsPage = openDepotJustificatifsPage;

function closeDepotJustificatifsPage() {
    const page = document.getElementById('depotJustificatifsPage');
    if (page) page.classList.remove('active');
    if (typeof returnToComptabiliteHome === 'function') returnToComptabiliteHome();
    else if (typeof navigateTo === 'function') navigateTo('home');
}

function switchDepotFactureTab(tab) {
    depotFactureActiveTab = tab === 'toutes' ? 'toutes' : 'mes_factures';
    document.querySelectorAll('#depotFactureTabs .compta-tab').forEach(function(btn) {
        btn.classList.remove('active');
    });
    const activeBtn = depotFactureActiveTab === 'toutes'
        ? document.getElementById('depotFactureTabToutes')
        : document.getElementById('depotFactureTabMes');
    if (activeBtn) activeBtn.classList.add('active');
    renderDepotJustificatifsList();
}

function renderDepotJustificatifsList() {
    const list = document.getElementById('depotJustifsList');
    const empty = document.getElementById('depotJustifsEmpty');
    const emptyText = document.getElementById('depotJustifsEmptyText');
    const emptyHint = document.getElementById('depotJustifsEmptyHint');
    if (!list) return;

    const uid = String(currentUser?.id || '');
    const showAll = depotFactureActiveTab === 'toutes';
    let items = (comptaJustificatifs || [])
        .filter(isDepotFacture)
        .map(normalizeDepotFactureRecord);

    if (!showAll) {
        items = items.filter(function(j) { return String(j.deposeParUserId || '') === uid; });
    }

    items.sort(function(a, b) {
        return new Date(b.dateAjout || 0) - new Date(a.dateAjout || 0);
    });

    if (!items.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        if (emptyText) emptyText.textContent = showAll ? 'Aucune facture déposée' : 'Aucune de vos factures';
        if (emptyHint) emptyHint.textContent = showAll
            ? 'Les factures déposées par les utilisateurs apparaîtront ici'
            : 'Déposez une facture fournisseur pour la transmettre à la comptabilité';
        return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = items.map(function(j) {
        const statutInfo = getDepotFactureStatutInfo(j);
        const title = j.libelle || j.fournisseur || j.nomFichier || 'Facture';
        const dateDepot = j.dateAjout ? new Date(j.dateAjout).toLocaleDateString('fr-FR') : '—';
        const dateFacture = j.dateDocument ? new Date(j.dateDocument).toLocaleDateString('fr-FR') : null;
        const montant = j.montantTTC ? formatMontant(j.montantTTC) + ' €' : '';
        const metaParts = ['Déposée le ' + dateDepot];
        if (showAll) metaParts.push('Par ' + escapeHtml(getJustificatifDeposantName(j)));
        if (j.fournisseur) metaParts.push(escapeHtml(j.fournisseur));
        if (j.numeroFacture) metaParts.push('N° ' + escapeHtml(j.numeroFacture));
        if (dateFacture) metaParts.push('Facture du ' + dateFacture);
        if (j.dateEcheance) {
            var echeanceLine = formatDepotFactureEcheanceLine(j);
            if (echeanceLine) metaParts.push(echeanceLine);
        }
        if (montant) metaParts.push(montant);
        const motifRefus = (getDepotFactureStatutPaiement(j) === 'refusee' && (j.motifRefus || j.motifPaiement))
            ? '<div class="depot-justif-card-meta" style="color:var(--mn-red);margin-top:0.25rem;">' + escapeHtml(j.motifRefus || j.motifPaiement) + '</div>' : '';
        const hasFile = j.type !== 'manuel' && (j.fileUrl || j.file_id || j.fileBase64);
        const isOwner = String(j.deposeParUserId || '') === uid;
        const canDelete = isOwner && getDepotFactureStatutPaiement(j) === 'en_attente';
        return '<div class="depot-justif-card compta-validation-card-clickable" onclick="openDepotFactureDetailModal(\'' + j.id + '\')">' +
            '<div class="depot-justif-card-icon">🧾</div>' +
            '<div class="depot-justif-card-body">' +
            '<div class="depot-justif-card-title-row">' +
            '<div class="depot-justif-card-title">' + escapeHtml(title) + '</div>' +
            '<span class="depot-facture-statut ' + statutInfo.className + '">' + statutInfo.label + '</span>' +
            '</div>' +
            '<div class="depot-justif-card-meta">' + metaParts.join(' · ') + '</div>' +
            motifRefus +
            '</div>' +
            '<div class="depot-justif-card-actions" onclick="event.stopPropagation()">' +
            (hasFile ? '<button type="button" class="btn btn-secondary" onclick="openJustificatifPreview(\'' + j.id + '\')" title="Aperçu">👁️</button>' : '') +
            (hasFile ? '<button type="button" class="btn btn-secondary" onclick="downloadJustificatifById(\'' + j.id + '\')" title="Télécharger">⬇️</button>' : '') +
            (canDelete ? '<button type="button" class="btn btn-secondary" onclick="deleteDepotFacture(\'' + j.id + '\')" title="Supprimer" style="color:var(--mn-red);">🗑️</button>' : '') +
            '</div></div>';
    }).join('');
}

async function openDepotFactureModal() {
    if (!hasComptaCollectePermission()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé — droit Comptabilité requis', 'error');
        return;
    }
    depotFactureFilePending = null;
    const modal = document.getElementById('depotFactureModal');
    if (!modal) return;
    ['depotFactureLibelle', 'depotFactureFournisseur', 'depotFactureNumero', 'depotFactureMontant', 'depotFactureCommentaire'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const dateEl = document.getElementById('depotFactureDate');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    const echeanceEl = document.getElementById('depotFactureDateEcheance');
    if (echeanceEl) echeanceEl.value = '';
    const fileInput = document.getElementById('depotFactureFileInput');
    if (fileInput) fileInput.value = '';
    const label = document.getElementById('depotFactureFileLabel');
    if (label) label.innerHTML = 'Glissez votre facture ici ou <strong>cliquez pour parcourir</strong>';
    if (typeof ensureComptaLiensDataLoaded === 'function') await ensureComptaLiensDataLoaded();
    if (typeof populateComptaLiensSelects === 'function') populateComptaLiensSelects('depotFacture', null);
    const btn = document.getElementById('depotFactureSubmitBtn');
    if (btn) { btn.disabled = false; btn.textContent = '📤 Déposer la facture'; }
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotFactureModal = openDepotFactureModal;

async function openDepotFactureModalFromMail(file, opts) {
    opts = opts || {};
    if (!file) return;
    if (!hasComptaCollectePermission()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé — droit Comptabilité requis', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Fichier trop volumineux (max 10 Mo)', 'error');
        else alert('Fichier trop volumineux (max 10 Mo)');
        return;
    }
    depotFactureFilePending = file;
    const modal = document.getElementById('depotFactureModal');
    if (!modal) return;
    if (typeof ensureComptaLiensDataLoaded === 'function') await ensureComptaLiensDataLoaded();
    if (typeof populateComptaLiensSelects === 'function') populateComptaLiensSelects('depotFacture', null);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const libelleEl = document.getElementById('depotFactureLibelle');
    if (libelleEl) libelleEl.value = opts.libelle || baseName;
    const fournisseurEl = document.getElementById('depotFactureFournisseur');
    if (fournisseurEl) fournisseurEl.value = opts.fournisseur || '';
    const numeroEl = document.getElementById('depotFactureNumero');
    if (numeroEl) numeroEl.value = opts.numeroFacture || '';
    const montantEl = document.getElementById('depotFactureMontant');
    if (montantEl) montantEl.value = opts.montantTTC != null ? String(opts.montantTTC) : '';
    const commentaireEl = document.getElementById('depotFactureCommentaire');
    if (commentaireEl) commentaireEl.value = opts.commentaire || '';
    const dateEl = document.getElementById('depotFactureDate');
    if (dateEl) dateEl.value = opts.dateDocument || new Date().toISOString().slice(0, 10);
    const echeanceEl = document.getElementById('depotFactureDateEcheance');
    if (echeanceEl) echeanceEl.value = opts.dateEcheance || '';
    const fileInput = document.getElementById('depotFactureFileInput');
    if (fileInput) fileInput.value = '';
    const label = document.getElementById('depotFactureFileLabel');
    if (label) label.innerHTML = '<strong>' + escapeHtml(file.name) + '</strong> (' + (file.size / 1024).toFixed(0) + ' Ko)';
    const btn = document.getElementById('depotFactureSubmitBtn');
    if (btn) { btn.disabled = false; btn.textContent = '📤 Déposer la facture'; }
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotFactureModalFromMail = openDepotFactureModalFromMail;

function closeDepotFactureModal() {
    const modal = document.getElementById('depotFactureModal');
    if (modal) modal.classList.remove('active');
    depotFactureFilePending = null;
}

function handleDepotFactureFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Fichier trop volumineux (max 10 Mo)', 'error');
        else alert('Fichier trop volumineux (max 10 Mo)');
        event.target.value = '';
        return;
    }
    depotFactureFilePending = file;
    const label = document.getElementById('depotFactureFileLabel');
    if (label) label.innerHTML = '<strong>' + escapeHtml(file.name) + '</strong> (' + (file.size / 1024).toFixed(0) + ' Ko)';
    const libelle = document.getElementById('depotFactureLibelle');
    if (libelle && !libelle.value.trim()) libelle.value = file.name.replace(/\.[^.]+$/, '');
}

async function submitDepotFacture() {
    if (!hasComptaCollectePermission()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé — droit Comptabilité requis', 'error');
        return;
    }
    if (!depotFactureFilePending) {
        if (typeof showToast === 'function') showToast('Sélectionnez le fichier de la facture', 'error');
        else alert('Sélectionnez le fichier de la facture');
        return;
    }
    const btn = document.getElementById('depotFactureSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }
    const file = depotFactureFilePending;
    let fileUrl = null;
    let fileId = null;
    try {
        const uploaded = await uploadFile(file, 'documents');
        fileUrl = uploaded.url || uploaded.downloadUrl;
        fileId = uploaded.file_id;
    } catch (err) {
        console.warn('Upload facture échoué:', err);
        if (typeof showToast === 'function') showToast('Erreur lors de l\'upload du fichier', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📤 Déposer la facture'; }
        return;
    }
    const montantRaw = document.getElementById('depotFactureMontant')?.value;
    const montantTTC = montantRaw ? parseFloat(montantRaw) : null;
    const justif = stampJustificatifDeposant({
        id: 'fact_dep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        source: 'depot_facture',
        libelle: document.getElementById('depotFactureLibelle')?.value?.trim() || file.name,
        nomFichier: file.name,
        type: file.type.includes('pdf') ? 'pdf' : 'image',
        fileType: file.type,
        stored_externally: !!fileUrl,
        file_id: fileId,
        fileUrl: fileUrl,
        fournisseur: document.getElementById('depotFactureFournisseur')?.value?.trim() || null,
        numeroFacture: document.getElementById('depotFactureNumero')?.value?.trim() || null,
        dateDocument: document.getElementById('depotFactureDate')?.value || null,
        dateEcheance: document.getElementById('depotFactureDateEcheance')?.value || null,
        montantTTC: montantTTC,
        commentaire: document.getElementById('depotFactureCommentaire')?.value?.trim() || null,
        liens: (typeof readLiensFromForm === 'function') ? readLiensFromForm('depotFacture') : { dealIds: [], workProjectIds: [], projetIds: [] },
        dateAjout: new Date().toISOString(),
        statut: 'en_attente',
        statutPaiement: 'en_attente'
    });
    comptaJustificatifs.push(justif);
    await saveComptaData();
    renderDepotJustificatifsList();
    closeDepotFactureModal();
    if (typeof showToast === 'function') showToast('Facture déposée avec succès', 'success');
    else alert('Facture déposée avec succès');
}

function deleteDepotFacture(justifId) {
    const justif = comptaJustificatifs.find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotFacture(justif)) return;
    const canCompta = typeof canValidateFactures === 'function' && canValidateFactures();
    const isOwner = String(justif.deposeParUserId || '') === String(currentUser?.id || '');
    if (!canCompta) {
        if (!isOwner) return;
        if (getDepotFactureStatutPaiement(justif) !== 'en_attente') {
            if (typeof showToast === 'function') showToast('Cette facture ne peut plus être supprimée', 'error');
            return;
        }
    }
    const titre = justif.libelle || justif.fournisseur || justif.nomFichier || 'cette facture';
    if (!confirm('Supprimer « ' + titre + ' » ?\n\nCette action est irréversible.')) return;
    deleteJustificatif(justifId, true);
    closeDepotFactureDetailModal();
    renderDepotJustificatifsList();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
}
if (typeof window !== 'undefined') window.deleteDepotFacture = deleteDepotFacture;

let currentDepotFactureDetailId = null;

function openDepotFactureDetailModal(justifId) {
    const justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotFacture(justif)) return;
    currentDepotFactureDetailId = justifId;
    const modal = document.getElementById('depotFactureDetailModal');
    if (!modal) return;
    const statutInfo = getDepotFactureStatutInfo(justif);
    const titleEl = document.getElementById('depotFactureDetailTitle');
    const statutEl = document.getElementById('depotFactureDetailStatut');
    const bodyEl = document.getElementById('depotFactureDetailBody');
    const actionsEl = document.getElementById('depotFactureDetailActions');
    if (titleEl) titleEl.textContent = justif.libelle || justif.fournisseur || justif.nomFichier || 'Facture';
    if (statutEl) {
        statutEl.textContent = statutInfo.label;
        statutEl.className = 'depot-facture-statut ' + statutInfo.className;
    }
    const rows = [];
    rows.push({ label: 'Fournisseur', value: justif.fournisseur || '—' });
    rows.push({ label: 'N° facture', value: justif.numeroFacture || '—' });
    rows.push({ label: 'Date facture', value: justif.dateDocument ? new Date(justif.dateDocument).toLocaleDateString('fr-FR') : '—' });
    rows.push({ label: 'Date d\'échéance', value: justif.dateEcheance ? new Date(justif.dateEcheance).toLocaleDateString('fr-FR') : '—', overdue: isDepotFactureEcheanceOverdue(justif) });
    rows.push({ label: 'Montant TTC', value: justif.montantTTC ? formatMontant(justif.montantTTC) + ' €' : '—' });
    rows.push({ label: 'Déposée le', value: justif.dateAjout ? new Date(justif.dateAjout).toLocaleDateString('fr-FR') : '—' });
    rows.push({ label: 'Déposée par', value: getJustificatifDeposantName(justif) });
    if (justif.commentaire) rows.push({ label: 'Commentaire', value: justif.commentaire });
    if (getDepotFactureStatutPaiement(justif) === 'payee' && justif.datePaiement) {
        rows.push({ label: 'Payée le', value: new Date(justif.datePaiement).toLocaleDateString('fr-FR') });
    }
    if (getDepotFactureStatutPaiement(justif) === 'refusee' && (justif.motifRefus || justif.motifPaiement)) {
        rows.push({ label: 'Motif refus', value: justif.motifRefus || justif.motifPaiement, error: true });
    }
    if (bodyEl) {
        bodyEl.innerHTML = rows.map(function(r) {
            var cls = r.error ? ' compta-detail-row-error' : (r.overdue ? ' compta-detail-row-overdue' : '');
            return '<div class="compta-detail-row' + cls + '"><span class="compta-detail-label">' + escapeHtml(r.label) + '</span><span class="compta-detail-value">' + escapeHtml(r.value) + '</span></div>';
        }).join('');
    }
    const st = getDepotFactureStatutPaiement(justif);
    const hasFile = justif.type !== 'manuel' && (justif.fileUrl || justif.file_id || justif.fileBase64);
    const canCompta = typeof canValidateFactures === 'function' && canValidateFactures();
    let actions = '';
    if (hasFile) {
        actions += '<button type="button" class="btn btn-secondary" onclick="downloadJustificatifById(\'' + justif.id + '\')">⬇️ Télécharger</button>';
        actions += '<button type="button" class="btn btn-secondary" onclick="openJustificatifPreview(\'' + justif.id + '\')">👁️ Aperçu</button>';
    }
    if (canCompta) {
        actions += '<button type="button" class="btn btn-secondary" onclick="openDepotFactureEditModal(\'' + justif.id + '\')">✏️ Modifier</button>';
    }
    if (canCompta && isDepotFactureATraiter(justif)) {
        actions += '<button type="button" class="btn" onclick="setDepotFactureStatutPaiement(\'' + justif.id + '\', \'payee\')">Marquer payée</button>';
        actions += '<button type="button" class="btn btn-secondary" onclick="setDepotFactureStatutPaiement(\'' + justif.id + '\', \'refusee\')">Refuser</button>';
    }
    const isOwner = String(justif.deposeParUserId || '') === String(currentUser?.id || '');
    if (canCompta || (isOwner && st === 'en_attente')) {
        actions += '<button type="button" class="btn btn-secondary" style="color:var(--mn-red);" onclick="deleteDepotFacture(\'' + justif.id + '\')">🗑️ Supprimer</button>';
    }
    if (actionsEl) actionsEl.innerHTML = actions;
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotFactureDetailModal = openDepotFactureDetailModal;

function closeDepotFactureDetailModal() {
    currentDepotFactureDetailId = null;
    const modal = document.getElementById('depotFactureDetailModal');
    if (modal) modal.classList.remove('active');
}
if (typeof window !== 'undefined') window.closeDepotFactureDetailModal = closeDepotFactureDetailModal;

function openDepotFactureEditModal(justifId) {
    if (typeof canValidateFactures === 'function' && !canValidateFactures()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    const justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotFacture(justif)) return;
    const modal = document.getElementById('depotFactureEditModal');
    if (!modal) return;
    document.getElementById('depotFactureEditId').value = justifId;
    document.getElementById('depotFactureEditLibelle').value = justif.libelle || justif.nomFichier || '';
    document.getElementById('depotFactureEditFournisseur').value = justif.fournisseur || '';
    document.getElementById('depotFactureEditNumero').value = justif.numeroFacture || '';
    document.getElementById('depotFactureEditMontant').value = justif.montantTTC != null ? justif.montantTTC : '';
    document.getElementById('depotFactureEditDate').value = (justif.dateDocument || '').toString().slice(0, 10);
    document.getElementById('depotFactureEditDateEcheance').value = (justif.dateEcheance || '').toString().slice(0, 10);
    document.getElementById('depotFactureEditCommentaire').value = justif.commentaire || '';
    const paiementGroup = document.getElementById('depotFactureEditDatePaiementGroup');
    const paiementInput = document.getElementById('depotFactureEditDatePaiement');
    const isPayee = getDepotFactureStatutPaiement(justif) === 'payee';
    if (paiementGroup) paiementGroup.style.display = isPayee ? '' : 'none';
    if (paiementInput) {
        paiementInput.value = isPayee && justif.datePaiement
            ? new Date(justif.datePaiement).toISOString().slice(0, 10)
            : '';
    }
    closeDepotFactureDetailModal();
    modal.classList.add('active');
}
if (typeof window !== 'undefined') window.openDepotFactureEditModal = openDepotFactureEditModal;

function closeDepotFactureEditModal() {
    const modal = document.getElementById('depotFactureEditModal');
    if (modal) modal.classList.remove('active');
}
if (typeof window !== 'undefined') window.closeDepotFactureEditModal = closeDepotFactureEditModal;

async function saveDepotFactureEdit() {
    if (typeof canValidateFactures === 'function' && !canValidateFactures()) return;
    const justifId = document.getElementById('depotFactureEditId')?.value;
    const justif = (comptaJustificatifs || []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotFacture(justif)) return;
    const libelle = document.getElementById('depotFactureEditLibelle')?.value?.trim();
    if (!libelle) {
        if (typeof showToast === 'function') showToast('Indiquez un libellé', 'error');
        return;
    }
    justif.libelle = libelle;
    justif.fournisseur = document.getElementById('depotFactureEditFournisseur')?.value?.trim() || null;
    justif.numeroFacture = document.getElementById('depotFactureEditNumero')?.value?.trim() || null;
    const montantRaw = document.getElementById('depotFactureEditMontant')?.value;
    justif.montantTTC = montantRaw ? parseFloat(montantRaw) : null;
    justif.dateDocument = document.getElementById('depotFactureEditDate')?.value || null;
    justif.dateEcheance = document.getElementById('depotFactureEditDateEcheance')?.value || null;
    justif.commentaire = document.getElementById('depotFactureEditCommentaire')?.value?.trim() || null;
    if (getDepotFactureStatutPaiement(justif) === 'payee') {
        const datePaiement = document.getElementById('depotFactureEditDatePaiement')?.value;
        if (datePaiement) {
            justif.datePaiement = new Date(datePaiement + 'T12:00:00').toISOString();
        }
    }
    if (typeof saveComptaData === 'function') await saveComptaData();
    closeDepotFactureEditModal();
    if (typeof renderDepotJustificatifsList === 'function') renderDepotJustificatifsList();
    if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    if (typeof showToast === 'function') showToast('Facture mise à jour', 'success');
}
if (typeof window !== 'undefined') window.saveDepotFactureEdit = saveDepotFactureEdit;

if (typeof window !== 'undefined') window.formatDepotFactureEcheanceLine = formatDepotFactureEcheanceLine;

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function closeComptabilite() {
    document.getElementById('comptaPage').classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const homeNavItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (homeNavItem) homeNavItem.classList.add('active');
}

function populateComptaCategoriesFilter() {
    const select = document.getElementById('comptaCategorieFilter');
    if (!select) return;
    let html = '<option value="all">Toutes les catégories</option>';
    comptaCategories.forEach(cat => {
        html += `<option value="${cat.id}">${cat.nom}</option>`;
    });
    select.innerHTML = html;
}

function populateComptaProjetsList() {
    const select = document.getElementById('transDetailProjet');
    if (!select) return;
    let html = '<option value="">— Aucun —</option>';
    if (typeof projects !== 'undefined' && projects) {
        projects.forEach(p => {
            if (p.type === 'tournee') {
                html += `<option value="${p.id}">🎭 ${p.name}</option>`;
                if (p.spectacles) {
                    p.spectacles.forEach(s => {
                        html += `<option value="${s.id}">  └ ${s.lieu || s.name}</option>`;
                    });
                }
            } else {
                html += `<option value="${p.id}">🎪 ${p.lieu || p.name}</option>`;
            }
        });
    }
    select.innerHTML = html;
}

async function loadComptaData() {
    const periode = document.getElementById('comptaPeriode').value;
    
    try {
        // Charger depuis le serveur
        const data = await apiCall('compta.php', 'GET');
        if (data && data.success) {
            let allTransactions = data.transactions || [];
            comptaJustificatifs = data.justificatifs || [];
            comptaRegles = data.regles || [];
            comptaComptes = (data.comptes && data.comptes.length) ? data.comptes : [{ id: 'principal', nom: 'Compte principal' }];
            comptaFactures = data.factures || [];
            comptaDocumentsEmis = Array.isArray(data.documents_emis) ? data.documents_emis : [];
            comptaSettings = (data.settings && typeof data.settings === 'object') ? data.settings : { signatures: {} };
            if (!comptaSettings.signatures) comptaSettings.signatures = {};
            
            // Migration auto : si le localStorage contient des données absentes du serveur
            await migrateComptaFromLocalStorage();
            
            // Recharger après migration éventuelle
            const fresh = await apiCall('compta.php', 'GET');
            if (fresh && fresh.success) {
                allTransactions = fresh.transactions || [];
                comptaJustificatifs = fresh.justificatifs || [];
                if (fresh.regles) comptaRegles = fresh.regles;
                if (fresh.comptes && fresh.comptes.length) comptaComptes = fresh.comptes;
                if (fresh.factures) comptaFactures = fresh.factures;
                if (Array.isArray(fresh.documents_emis)) comptaDocumentsEmis = fresh.documents_emis;
                if (fresh.settings && typeof fresh.settings === 'object') {
                    comptaSettings = fresh.settings;
                    if (!comptaSettings.signatures) comptaSettings.signatures = {};
                }
            }
            
            if (periode) {
                const [year, month] = periode.split('-');
                comptaTransactions = allTransactions.filter(t => {
                    const tDate = new Date(t.date);
                    return tDate.getFullYear() === parseInt(year) && (tDate.getMonth() + 1) === parseInt(month);
                });
            } else {
                comptaTransactions = allTransactions;
            }
            
            renderComptaTransactions();
            renderComptaJustificatifs();
            updateComptaStats();
            updateComptaTVARecap();
            populateComptaCompteFilter();
            renderComptaRegles();
            renderComptaFactures();
            return;
        }
    } catch (error) {
        console.warn('Erreur chargement compta depuis serveur, fallback localStorage:', error);
    }
    
    // Fallback localStorage
    const storedAll = localStorage.getItem('comptaTransactionsAll');
    let allTransactions = storedAll ? JSON.parse(storedAll) : [];
    const storedJustifs = localStorage.getItem('comptaJustificatifs');
    comptaJustificatifs = storedJustifs ? JSON.parse(storedJustifs) : [];
    try {
        const r = localStorage.getItem('comptaRegles'); if (r) comptaRegles = JSON.parse(r);
        const c = localStorage.getItem('comptaComptes'); if (c) comptaComptes = JSON.parse(c);
        const f = localStorage.getItem('comptaFactures'); if (f) comptaFactures = JSON.parse(f);
    } catch (e) {}
    
    if (periode) {
        const [year, month] = periode.split('-');
        comptaTransactions = allTransactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate.getFullYear() === parseInt(year) && (tDate.getMonth() + 1) === parseInt(month);
        });
    } else {
        comptaTransactions = allTransactions;
    }
    
    renderComptaTransactions();
    renderComptaJustificatifs();
    updateComptaStats();
    updateComptaTVARecap();
    populateComptaCompteFilter();
    renderComptaRegles();
    renderComptaFactures();
}

async function saveComptaData() {
    const storedAll = localStorage.getItem('comptaTransactionsAll');
    let allTransactions = storedAll ? JSON.parse(storedAll) : [];
    const periode = document.getElementById('comptaPeriode').value;
    
    if (periode) {
        const [year, month] = periode.split('-');
        allTransactions = allTransactions.filter(t => {
            const tDate = new Date(t.date);
            return !(tDate.getFullYear() === parseInt(year) && (tDate.getMonth() + 1) === parseInt(month));
        });
        allTransactions = [...allTransactions, ...comptaTransactions];
    } else {
        allTransactions = comptaTransactions;
    }
    
    // Sauvegarder en localStorage (cache local) - sans fichiers base64
    const justificatifsClean = comptaJustificatifs.map(j => {
        const { fileBase64, ...rest } = j;
        return rest;
    });
    localStorage.setItem('comptaTransactionsAll', JSON.stringify(allTransactions));
    localStorage.setItem('comptaJustificatifs', JSON.stringify(justificatifsClean));
    localStorage.setItem('comptaRegles', JSON.stringify(comptaRegles));
    localStorage.setItem('comptaComptes', JSON.stringify(comptaComptes));
    localStorage.setItem('comptaFactures', JSON.stringify(comptaFactures));
    try {
        localStorage.setItem('comptaDocumentsEmis', JSON.stringify(comptaDocumentsEmis || []));
        localStorage.setItem('comptaSettings', JSON.stringify(comptaSettings || { signatures: {} }));
    } catch (e) { /* ignore quota */ }
    
    // Sauvegarder sur le serveur (métadonnées uniquement, fichiers déjà sur disque via uploadFile)
    let serverSaveOk = false;
    try {
        await apiCall('compta.php', 'POST', {
            action: 'save_all',
            transactions: allTransactions,
            justificatifs: justificatifsClean,
            regles: comptaRegles,
            comptes: comptaComptes,
            factures: comptaFactures,
            documents_emis: comptaDocumentsEmis || [],
            settings: comptaSettings || { signatures: {} }
        });
        serverSaveOk = true;
    } catch (error) {
        console.error('Erreur sauvegarde compta serveur:', error);
        showToast('⚠️ Sauvegarde serveur échouée — données sauvées localement', 'error');
    }
    
    if (serverSaveOk) {
        console.log('Compta sauvegardée sur le serveur avec succès');
    }
}

// Migration automatique du localStorage vers le serveur
let comptaMigrationDone = false;
async function migrateComptaFromLocalStorage() {
    if (comptaMigrationDone) return;
    comptaMigrationDone = true;
    
    const storedTx = localStorage.getItem('comptaTransactionsAll');
    const storedJustifs = localStorage.getItem('comptaJustificatifs');
    const storedRegles = localStorage.getItem('comptaRegles');
    const storedComptes = localStorage.getItem('comptaComptes');
    const storedFactures = localStorage.getItem('comptaFactures');
    
    const localTx = storedTx ? JSON.parse(storedTx) : [];
    const localJustifs = storedJustifs ? JSON.parse(storedJustifs) : [];
    let localRegles = [], localComptes = [], localFactures = [];
    try { if (storedRegles) localRegles = JSON.parse(storedRegles); } catch (e) {}
    try { if (storedComptes) localComptes = JSON.parse(storedComptes); } catch (e) {}
    try { if (storedFactures) localFactures = JSON.parse(storedFactures); } catch (e) {}
    
    if (localTx.length === 0 && localJustifs.length === 0 && localRegles.length === 0
        && localComptes.length === 0 && localFactures.length === 0) return;
    
    try {
        const cleanJustifs = localJustifs.map(j => {
            const { fileBase64, ...rest } = j;
            return rest;
        });
        
        const result = await apiCall('compta.php', 'POST', {
            action: 'migrate_from_local',
            transactions: localTx,
            justificatifs: cleanJustifs,
            regles: localRegles,
            comptes: localComptes,
            factures: localFactures
        });
        if (result && result.success) {
            console.log('Migration compta localStorage → serveur OK:', result.counts);
        }
    } catch (error) {
        console.warn('Migration compta échouée (sera retentée):', error);
        comptaMigrationDone = false;
    }
}

function switchComptaTab(tab) {
    document.querySelectorAll('.compta-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target && event.target.closest) {
        const btn = event.target.closest('.compta-tab');
        if (btn) btn.classList.add('active');
    }
    document.getElementById('comptaTransactionsView').style.display = tab === 'transactions' ? 'block' : 'none';
    document.getElementById('comptaJustificatifsView').style.display = tab === 'justificatifs' ? 'block' : 'none';
    document.getElementById('comptaTVAView').style.display = tab === 'tva' ? 'block' : 'none';
    const reglesView = document.getElementById('comptaReglesView');
    if (reglesView) reglesView.style.display = tab === 'regles' ? 'block' : 'none';
    const facturesView = document.getElementById('comptaFacturesView');
    if (facturesView) facturesView.style.display = tab === 'factures' ? 'block' : 'none';
    if (tab === 'tva') updateComptaTVARecap();
    if (tab === 'regles') renderComptaRegles();
    if (tab === 'factures') renderComptaFactures();
}

function populateComptaCompteFilter() {
    const sel = document.getElementById('comptaCompteFilter');
    if (!sel) return;
    let html = '<option value="all">Tous les comptes</option>';
    (comptaComptes || []).forEach(c => { html += `<option value="${c.id}">${c.nom}</option>`; });
    sel.innerHTML = html;
}

function renderComptaTransactions() {
    const tbody = document.getElementById('comptaTransactionsBody');
    const emptyState = document.getElementById('comptaEmptyState');
    if (!tbody) return;
    
    let filtered = filterComptaTransactions();
    filtered = sortComptaTransactions(filtered);
    
    document.getElementById('comptaTransCount').textContent = filtered.length;
    
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    const grouped = {};
    filtered.forEach(t => {
        const dateKey = t.date;
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(t);
    });
    
    let html = '';
    const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    dates.forEach(date => {
        const formattedDate = new Date(date).toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        
        html += `<tr class="compta-date-group"><td colspan="9">📅 ${formattedDate}</td></tr>`;
        
        grouped[date].forEach(t => {
            const isCredit = t.type === 'credit';
            const justif = t.justificatifId ? comptaJustificatifs.find(j => j.id === t.justificatifId) : null;
            const cat = comptaCategories.find(c => c.id === t.categorie);
            
            html += `
                <tr onclick="openTransactionDetail('${t.id}')" class="${t.statut}">
                    <td>${new Date(t.date).toLocaleDateString('fr-FR')}</td>
                    <td class="compta-libelle">
                        <span class="compta-libelle-text">${isCredit ? '🟢' : '🔴'} ${t.libelle}</span>
                        ${cat ? `<span class="compta-libelle-cat"><span class="compta-category-badge">${cat.nom}</span></span>` : ''}
                    </td>
                    <td class="compta-amount ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : ''}${formatMontant(t.montantTTC)} €</td>
                    <td class="compta-amount-ht">${formatMontant(t.montantHT)} €</td>
                    <td class="compta-amount-tva">${formatMontant(t.montantTVA)} €</td>
                    <td><span class="compta-taux">${t.tauxTVA}%</span></td>
                    <td>
                        <span class="compta-justif-icon ${justif ? 'has-justif' : 'no-justif'}" 
                              onclick="event.stopPropagation(); ${justif ? `openJustificatifPreview('${justif.id}')` : `uploadJustificatifForTransaction('${t.id}')`}">
                            ${justif ? '📎' : '➕'}
                        </span>
                    </td>
                    <td><span class="compta-status ${t.statut}">${t.statut === 'rapproche' ? '✓ Rapproché' : t.statut === 'en_attente' ? '⏳ En attente' : '⚠️ Non rapproché'}</span></td>
                    <td>
                        <div class="compta-quick-actions">
                            <button class="compta-quick-action" onclick="event.stopPropagation(); deleteTransaction('${t.id}')">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    });
    
    tbody.innerHTML = html;
}

function filterComptaTransactions() {
    const search = document.getElementById('comptaSearchInput')?.value?.toLowerCase() || '';
    const typeFilter = document.getElementById('comptaTypeFilter')?.value || 'all';
    const statutFilter = document.getElementById('comptaStatutFilter')?.value || 'all';
    const catFilter = document.getElementById('comptaCategorieFilter')?.value || 'all';
    const compteFilter = document.getElementById('comptaCompteFilter')?.value || 'all';
    
    let source = [...comptaTransactions];
    if (search) {
        const storedAll = localStorage.getItem('comptaTransactionsAll');
        if (storedAll) {
            try { source = JSON.parse(storedAll); } catch (e) {}
        }
    }
    
    let filtered = source;
    if (typeFilter !== 'all') filtered = filtered.filter(t => t.type === typeFilter);
    if (statutFilter !== 'all') filtered = filtered.filter(t => t.statut === statutFilter);
    if (catFilter !== 'all') filtered = filtered.filter(t => t.categorie === catFilter);
    if (compteFilter !== 'all') filtered = filtered.filter(t => (t.compteId || 'principal') === compteFilter);
    if (search) {
        filtered = filtered.filter(t =>
            (t.libelle && t.libelle.toLowerCase().includes(search)) ||
            (t.note && t.note.toLowerCase().includes(search))
        );
    }
    return filtered;
}

function filterComptaData() {
    const search = document.getElementById('comptaSearchInput')?.value?.trim() || '';
    const bandeau = document.getElementById('comptaSearchBandeau');
    if (bandeau) bandeau.style.display = search ? 'block' : 'none';
    renderComptaTransactions();
    updateComptaStats();
}

function sortComptaTransactions(transactions) {
    return transactions.sort((a, b) => {
        let valA, valB;
        switch (comptaCurrentSort.field) {
            case 'date':
                valA = new Date(a.date);
                valB = new Date(b.date);
                break;
            case 'libelle':
                valA = a.libelle.toLowerCase();
                valB = b.libelle.toLowerCase();
                break;
            case 'ttc':
                valA = Math.abs(a.montantTTC);
                valB = Math.abs(b.montantTTC);
                break;
            default:
                valA = a[comptaCurrentSort.field];
                valB = b[comptaCurrentSort.field];
        }
        
        if (valA < valB) return comptaCurrentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return comptaCurrentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function sortComptaBy(field) {
    if (comptaCurrentSort.field === field) {
        comptaCurrentSort.direction = comptaCurrentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        comptaCurrentSort.field = field;
        comptaCurrentSort.direction = 'desc';
    }
    renderComptaTransactions();
}

function updateComptaStats() {
    const filtered = filterComptaTransactions();
    
    let totalCredits = 0, totalDebits = 0;
    let tvaCollectee = 0, tvaDeductible = 0;
    
    filtered.forEach(t => {
        if (t.type === 'credit') {
            totalCredits += Math.abs(t.montantTTC);
            tvaCollectee += Math.abs(t.montantTVA || 0);
        } else {
            totalDebits += Math.abs(t.montantTTC);
            tvaDeductible += Math.abs(t.montantTVA || 0);
        }
    });
    
    const solde = totalCredits - totalDebits;
    
    document.getElementById('comptaSolde').textContent = formatMontant(solde) + ' €';
    document.getElementById('comptaSolde').style.color = solde >= 0 ? '#28a745' : '#dc3545';
    document.getElementById('comptaTotalCredits').textContent = '+' + formatMontant(totalCredits) + ' €';
    document.getElementById('comptaTotalDebits').textContent = '-' + formatMontant(totalDebits) + ' €';
    document.getElementById('comptaTVACollectee').textContent = formatMontant(tvaCollectee) + ' €';
    document.getElementById('comptaTVADeductible').textContent = formatMontant(tvaDeductible) + ' €';
}

function formatMontant(val) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
}

// Justificatifs
// Helper : construire l'URL d'accès à un fichier justificatif
function getJustifFileUrl(justif) {
    if (!justif) return '';
    // Si URL absolue, l'utiliser directement
    if (justif.fileUrl && justif.fileUrl.startsWith('http')) return justif.fileUrl;
    // Construire depuis file_id (prioritaire, même mécanisme que le reste de l'app)
    if (justif.file_id) {
        if (typeof getDownloadFileUrl === 'function') return getDownloadFileUrl(justif.file_id);
        const base = (typeof API_URL !== 'undefined' ? API_URL : 'api');
        let url = `${base}/download.php?id=${justif.file_id}`;
        if (typeof authToken !== 'undefined' && authToken) {
            url += `&token=${encodeURIComponent(authToken)}`;
        }
        return url;
    }
    // Fallback : utiliser fileUrl tel quel
    if (justif.fileUrl) return justif.fileUrl;
    return '';
}

function renderComptaJustificatifs() {
    const container = document.getElementById('comptaJustifsList');
    const emptyState = document.getElementById('comptaJustifEmptyState');
    if (!container) return;
    
    const enAttente = comptaJustificatifs.filter(j => j.statut === 'en_attente');
    document.getElementById('comptaJustifCount').textContent = enAttente.length;
    
    if (enAttente.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // En-tête de la liste
    let html = `
        <div class="compta-justifs-list-header">
            <span></span>
            <span>Document</span>
            <span>Fournisseur</span>
            <span>Montant TTC</span>
            <span class="compta-justif-row-tva">TVA</span>
            <span class="compta-justif-row-date">Statut</span>
            <span></span>
        </div>
    `;
    
    enAttente.forEach(j => {
        const icon = j.type === 'pdf' ? '📄' : (j.type === 'manuel' ? '✍️' : '🖼️');
        
        // Miniature
        let thumbHtml = `<div class="compta-justif-row-icon">${icon}</div>`;
        if (j.fileUrl && j.fileType && !j.fileType.includes('pdf')) {
            const thumbSrc = getJustifFileUrl(j);
            thumbHtml = `<img class="compta-justif-row-thumb" src="${thumbSrc}" alt="" onerror="this.outerHTML='<div class=\\'compta-justif-row-icon\\'>${icon}</div>'">`;
        } else if (j.fileBase64 && j.fileType && !j.fileType.includes('pdf')) {
            thumbHtml = `<img class="compta-justif-row-thumb" src="data:${j.fileType};base64,${j.fileBase64}" alt="" onerror="this.outerHTML='<div class=\\'compta-justif-row-icon\\'>${icon}</div>'">`;
        }
        
        // Nom + sous-titre
        const name = j.fournisseur || j.nomFichier;
        const sub = j.dateDocument 
            ? new Date(j.dateDocument).toLocaleDateString('fr-FR') 
            : 'Ajouté le ' + new Date(j.dateAjout).toLocaleDateString('fr-FR');
        
        // Montant TTC
        const montantHtml = j.montantTTC 
            ? `<span class="compta-justif-row-amount">${formatMontant(j.montantTTC)} €</span>` 
            : '<span style="color:#94a3b8;">—</span>';
        
        // TVA (multi-lignes ou simple)
        let tvaHtml = '';
        if (j.lignesTVA && j.lignesTVA.length > 0) {
            tvaHtml = '<div class="compta-justif-row-tva-lines">';
            j.lignesTVA.forEach(l => {
                tvaHtml += `<div class="compta-justif-row-tva-line"><span class="compta-justif-row-tva-tag">${l.taux}%</span> ${formatMontant(l.montantTVA || 0)} €</div>`;
            });
            tvaHtml += '</div>';
        } else if (j.tauxTVA !== undefined && j.tauxTVA !== null) {
            tvaHtml = `<span class="compta-justif-row-tva-tag">${j.tauxTVA}%</span>`;
            if (j.montantTVA) tvaHtml += ` <span style="font-size:0.82rem;">${formatMontant(j.montantTVA)} €</span>`;
        } else {
            tvaHtml = '<span style="color:#94a3b8;">—</span>';
        }
        
        // Badge OCR
        let ocrBadge = '';
        if (j.ocrStatus === 'processing') {
            ocrBadge = `<span class="ocr-processing-badge" style="font-size:0.7rem;padding:0.15rem 0.5rem;"><span class="ocr-spinner"></span>IA...</span>`;
        } else if (j.ocrStatus === 'pending') {
            ocrBadge = `<span class="ocr-pending-badge" style="font-size:0.7rem;padding:0.15rem 0.5rem;">⏳ En attente</span>`;
        } else if (j.ocrStatus === 'failed') {
            ocrBadge = `<span class="ocr-failed-badge" style="font-size:0.7rem;padding:0.15rem 0.5rem;">⚠️ Échoué</span>`;
        } else if (j.ocrStatus === 'pending_review') {
            ocrBadge = `<span class="ocr-pending-badge" style="font-size:0.7rem;padding:0.15rem 0.5rem;">👁️ À vérifier</span>`;
        } else if (j.ocrStatus === 'completed' || j.ocrStatus === 'validated') {
            ocrBadge = `<span class="ocr-completed-badge" style="font-size:0.7rem;padding:0.15rem 0.5rem;">✅ Extrait</span>`;
        } else {
            ocrBadge = `<span class="compta-status en-attente" style="font-size:0.7rem;padding:0.15rem 0.5rem;">⏳ Non rapproché</span>`;
        }
        
        html += `
            <div class="compta-justif-row" onclick="openJustificatifPreview('${j.id}')">
                ${thumbHtml}
                <div>
                    <div class="compta-justif-row-name">${name}</div>
                    <div class="compta-justif-row-sub">${sub}</div>
                </div>
                <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${j.fournisseur || '<span style="color:#94a3b8;">—</span>'}</div>
                <div>${montantHtml}</div>
                <div class="compta-justif-row-tva">${tvaHtml}</div>
                <div class="compta-justif-row-date">${ocrBadge}</div>
                <div class="compta-justif-row-actions">
                    ${(j.type !== 'manuel' && (j.fileUrl || j.file_id)) ? `<button onclick="event.stopPropagation(); reanalyzeJustificatif('${j.id}')" title="Réanalyser (IA)" class="compta-reanalyze-btn">🔄</button>` : ''}
                    <button onclick="event.stopPropagation(); editJustificatif('${j.id}')" title="Modifier">✏️</button>
                    <button onclick="event.stopPropagation(); deleteJustificatif('${j.id}')" title="Supprimer">🗑️</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    renderDepotJustificatifsList();
}
function updateComptaTVARecap() {
    const periode = document.getElementById('comptaPeriode').value;
    const labelEl = document.getElementById('comptaTVAPeriodeLabel');
    if (labelEl && periode) {
        const [year, month] = periode.split('-');
        const date = new Date(year, month - 1);
        labelEl.textContent = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    
    const taux = [20, 10, 5.5, 2.1, 0];
    const collecteeByTaux = {};
    const deductibleByTaux = {};
    
    taux.forEach(t => {
        collecteeByTaux[t] = { ht: 0, tva: 0 };
        deductibleByTaux[t] = { ht: 0, tva: 0 };
    });
    
    comptaTransactions.forEach(t => {
        // Vérifier si le justificatif lié a des lignes multi-TVA
        let lignesTVA = null;
        if (t.justificatifId) {
            const justif = comptaJustificatifs.find(j => j.id === t.justificatifId);
            if (justif && justif.lignesTVA && justif.lignesTVA.length > 1) {
                lignesTVA = justif.lignesTVA;
            }
        }
        
        if (lignesTVA) {
            // Multi-TVA : ventiler par taux depuis les lignes du justificatif
            lignesTVA.forEach(l => {
                const tauxKey = l.taux != null ? l.taux : 20;
                if (!collecteeByTaux[tauxKey]) collecteeByTaux[tauxKey] = { ht: 0, tva: 0 };
                if (!deductibleByTaux[tauxKey]) deductibleByTaux[tauxKey] = { ht: 0, tva: 0 };
                if (t.type === 'credit') {
                    collecteeByTaux[tauxKey].ht += Math.abs(l.montantHT || 0);
                    collecteeByTaux[tauxKey].tva += Math.abs(l.montantTVA || 0);
                } else {
                    deductibleByTaux[tauxKey].ht += Math.abs(l.montantHT || 0);
                    deductibleByTaux[tauxKey].tva += Math.abs(l.montantTVA || 0);
                }
            });
        } else {
            const tauxKey = t.tauxTVA || 20;
            if (t.type === 'credit') {
                collecteeByTaux[tauxKey].ht += Math.abs(t.montantHT || 0);
                collecteeByTaux[tauxKey].tva += Math.abs(t.montantTVA || 0);
            } else {
                deductibleByTaux[tauxKey].ht += Math.abs(t.montantHT || 0);
                deductibleByTaux[tauxKey].tva += Math.abs(t.montantTVA || 0);
            }
        }
    });
    
    let collecteeHtml = '';
    let totalCollectee = 0;
    taux.forEach(t => {
        if (collecteeByTaux[t].tva > 0) {
            collecteeHtml += `
                <div class="compta-tva-row">
                    <span class="compta-tva-taux">${t}%</span>
                    <span>Base HT : ${formatMontant(collecteeByTaux[t].ht)} €</span>
                    <span><strong>${formatMontant(collecteeByTaux[t].tva)} €</strong></span>
                </div>
            `;
            totalCollectee += collecteeByTaux[t].tva;
        }
    });
    collecteeHtml += `<div class="compta-tva-row total"><span></span><span>TOTAL</span><span>${formatMontant(totalCollectee)} €</span></div>`;
    document.getElementById('comptaTVACollecteeRows').innerHTML = collecteeHtml || '<div class="compta-tva-row"><span colspan="3">Aucune TVA collectée</span></div>';
    
    let deductibleHtml = '';
    let totalDeductible = 0;
    taux.forEach(t => {
        if (deductibleByTaux[t].tva > 0) {
            deductibleHtml += `
                <div class="compta-tva-row">
                    <span class="compta-tva-taux">${t}%</span>
                    <span>Base HT : ${formatMontant(deductibleByTaux[t].ht)} €</span>
                    <span><strong>${formatMontant(deductibleByTaux[t].tva)} €</strong></span>
                </div>
            `;
            totalDeductible += deductibleByTaux[t].tva;
        }
    });
    deductibleHtml += `<div class="compta-tva-row total"><span></span><span>TOTAL</span><span>${formatMontant(totalDeductible)} €</span></div>`;
    document.getElementById('comptaTVADeductibleRows').innerHTML = deductibleHtml || '<div class="compta-tva-row"><span colspan="3">Aucune TVA déductible</span></div>';
    
    const tvaResult = totalCollectee - totalDeductible;
    const resultEl = document.getElementById('comptaTVAResult');
    resultEl.textContent = (tvaResult >= 0 ? '' : '-') + formatMontant(Math.abs(tvaResult)) + ' €';
    resultEl.style.color = tvaResult >= 0 ? '#fff' : '#ffcccc';
}

// Modales Import Relevé
function openImportReleveModal() {
    const compteSel = document.getElementById('releveCompte');
    if (compteSel && comptaComptes && comptaComptes.length) {
        compteSel.innerHTML = comptaComptes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
    }
    document.getElementById('importReleveModal').style.display = 'flex';
    document.getElementById('relevePreview').style.display = 'none';
    document.getElementById('importReleveBtn').disabled = true;
    comptaFilePending = null;
}

function closeImportReleveModal() {
    document.getElementById('importReleveModal').style.display = 'none';
}

function handleReleveFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    comptaFilePending = file;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        parseRelevePreview(content, file.name);
    };
    reader.readAsText(file);
}

function parseRelevePreview(content, filename) {
    const format = document.getElementById('releveFormat').value;
    let transactions = [];
    
    try {
        if (format === 'csv_fr' || format === 'auto') {
            transactions = parseCSVReleve(content, ';');
        } else if (format === 'csv_en') {
            transactions = parseCSVReleve(content, ',');
        }
        
        if (transactions.length > 0) {
            let previewHtml = '<table style="width: 100%; font-size: 0.85rem;"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>';
            transactions.slice(0, 5).forEach(t => {
                previewHtml += `<tr><td>${t.date}</td><td>${t.libelle.substring(0, 30)}...</td><td>${formatMontant(t.montantTTC)} €</td></tr>`;
            });
            if (transactions.length > 5) {
                previewHtml += `<tr><td colspan="3" style="text-align: center; color: #636e72;">... et ${transactions.length - 5} autres lignes</td></tr>`;
            }
            previewHtml += '</tbody></table>';
            
            document.getElementById('relevePreviewContent').innerHTML = previewHtml;
            document.getElementById('relevePreviewCount').textContent = transactions.length;
            document.getElementById('relevePreview').style.display = 'block';
            document.getElementById('importReleveBtn').disabled = false;
        }
    } catch (err) {
        console.error('Erreur parsing relevé:', err);
        alert('Erreur lors de la lecture du fichier. Vérifiez le format.');
    }
}

function parseCSVReleve(content, separator) {
    const lines = content.split('\n').filter(l => l.trim());
    const transactions = [];
    
    // Détecter les en-têtes (première ligne)
    const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());
    
    // Trouver les colonnes
    let dateCol = headers.findIndex(h => h.includes('date'));
    let libelleCol = headers.findIndex(h => h.includes('libelle') || h.includes('libellé') || h.includes('description'));
    let debitCol = headers.findIndex(h => h.includes('debit') || h.includes('débit'));
    let creditCol = headers.findIndex(h => h.includes('credit') || h.includes('crédit'));
    let montantCol = headers.findIndex(h => h.includes('montant'));
    
    // Valeurs par défaut si colonnes non trouvées
    if (dateCol === -1) dateCol = 0;
    if (libelleCol === -1) libelleCol = 1;
    if (montantCol === -1 && debitCol === -1) montantCol = 2;
    
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(separator).map(c => c.trim().replace(/"/g, ''));
        if (cols.length < 2) continue;
        
        let montant = 0;
        let type = 'debit';
        
        if (debitCol !== -1 && creditCol !== -1) {
            const debit = parseFloat(cols[debitCol]?.replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
            const credit = parseFloat(cols[creditCol]?.replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
            if (credit > 0) {
                montant = credit;
                type = 'credit';
            } else {
                montant = -Math.abs(debit);
                type = 'debit';
            }
        } else if (montantCol !== -1) {
            montant = parseFloat(cols[montantCol]?.replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
            type = montant >= 0 ? 'credit' : 'debit';
        }
        
        // Parser la date
        let dateStr = cols[dateCol] || '';
        let parsedDate;
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                parsedDate = new Date(parts[2], parts[1] - 1, parts[0]);
            }
        } else {
            parsedDate = new Date(dateStr);
        }
        
        if (isNaN(parsedDate)) continue;
        
        const tauxTVA = 20;
        const montantTTC = Math.abs(montant);
        const montantHT = montantTTC / (1 + tauxTVA / 100);
        const montantTVA = montantTTC - montantHT;
        
        const trans = {
            id: 'trans_' + Date.now() + '_' + i,
            date: parsedDate.toISOString().split('T')[0],
            libelle: cols[libelleCol] || 'Sans libellé',
            montantTTC: type === 'debit' ? -montantTTC : montantTTC,
            montantHT: type === 'debit' ? -montantHT : montantHT,
            montantTVA: type === 'debit' ? -montantTVA : montantTVA,
            tauxTVA: tauxTVA,
            type: type,
            statut: 'non_rapproche',
            categorie: null,
            justificatifId: null,
            note: '',
            compteId: document.getElementById('releveCompte')?.value || 'principal'
        };
        if (typeof appliquerRegles === 'function') appliquerRegles(trans);
        transactions.push(trans);
    }
    
    return transactions;
}

function importReleve() {
    if (!comptaFilePending) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const format = document.getElementById('releveFormat').value;
        let transactions = [];
        
        if (format === 'csv_fr' || format === 'auto') {
            transactions = parseCSVReleve(content, ';');
        } else if (format === 'csv_en') {
            transactions = parseCSVReleve(content, ',');
        }
        
        // Ajouter les transactions
        comptaTransactions = [...comptaTransactions, ...transactions];
        
        // Tenter le rapprochement automatique
        autoMatchJustificatifs();
        
        saveComptaData();
        renderComptaTransactions();
        updateComptaStats();
        closeImportReleveModal();
        
        alert(`${transactions.length} transactions importées avec succès !`);
    };
    reader.readAsText(comptaFilePending);
}

// Auto-matching justificatifs
function autoMatchJustificatifs() {
    const enAttente = comptaJustificatifs.filter(j => j.statut === 'en_attente');
    
    comptaTransactions.forEach(trans => {
        if (trans.statut === 'rapproche' || trans.justificatifId) return;
        
        // Chercher un justificatif correspondant
        const match = enAttente.find(j => {
            if (j.statut !== 'en_attente') return false;
            
            // Correspondance par montant (avec tolérance de 0.01€)
            const montantMatch = Math.abs(Math.abs(j.montantTTC) - Math.abs(trans.montantTTC)) < 0.02;
            
            // Correspondance par date (même jour ou jour suivant)
            let dateMatch = false;
            if (j.dateDocument && trans.date) {
                const jDate = new Date(j.dateDocument);
                const tDate = new Date(trans.date);
                const diffDays = Math.abs((tDate - jDate) / (1000 * 60 * 60 * 24));
                dateMatch = diffDays <= 3;
            }
            
            return montantMatch && dateMatch;
        });
        
        if (match) {
            trans.justificatifId = match.id;
            trans.statut = 'rapproche';
            trans.montantHT = match.montantHT || trans.montantHT;
            trans.montantTVA = match.montantTVA || trans.montantTVA;
            trans.tauxTVA = match.tauxTVA || trans.tauxTVA;
            match.statut = 'rapproche';
        }
    });
}

// Ouvrir le dépôt de justificatif depuis le menu
async function openDepotJustificatif() {
    if (typeof openComptabiliteHomePage === 'function') await openComptabiliteHomePage();
    else await openDepotJustificatifsPage();
}
if (typeof window !== 'undefined') window.openDepotJustificatif = openDepotJustificatif;

// Upload justificatif
function openUploadJustificatifModal() {
    document.getElementById('uploadJustificatifModal').style.display = 'flex';
    var contentEl = document.getElementById('uploadJustifContent');
    if (contentEl) contentEl.style.display = '';
    comptaJustifFilesPending = [];
    document.getElementById('justifFilesPreview').style.display = 'none';
    document.getElementById('justifManualFields').style.display = 'none';
    document.getElementById('justifManualEntry').checked = false;
    const fileInput = document.getElementById('justifFileInput');
    if (fileInput) fileInput.value = '';
    const uploadBtn = document.getElementById('uploadJustifBtn');
    if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '📤 Envoyer';
    }
}

function closeUploadJustificatifModal() {
    document.getElementById('uploadJustificatifModal').style.display = 'none';
}

function handleJustifFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    comptaJustifFilesPending = Array.from(files);
    
    let html = '';
    comptaJustifFilesPending.forEach((f, i) => {
        const icon = f.type.includes('pdf') ? '📄' : '🖼️';
        html += `<div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #f8f9fa; border-radius: 8px; margin-bottom: 0.5rem;">
            <span>${icon}</span>
            <span style="flex: 1;">${f.name}</span>
            <span style="color: #636e72; font-size: 0.85rem;">${(f.size / 1024).toFixed(1)} Ko</span>
            <button type="button" onclick="removeJustifFile(${i})" style="border: none; background: none; cursor: pointer;">❌</button>
        </div>`;
    });
    
    document.getElementById('justifFilesList').innerHTML = html;
    document.getElementById('justifFilesPreview').style.display = 'block';
}

function removeJustifFile(index) {
    comptaJustifFilesPending.splice(index, 1);
    if (comptaJustifFilesPending.length === 0) {
        document.getElementById('justifFilesPreview').style.display = 'none';
    } else {
        handleJustifFileSelect({ target: { files: comptaJustifFilesPending } });
    }
}

function toggleJustifManualEntry() {
    const checked = document.getElementById('justifManualEntry').checked;
    document.getElementById('justifManualFields').style.display = checked ? 'block' : 'none';
    if (checked) {
        initJustifTvaLines();
    }
}

// ===== MULTI-TVA : Saisie manuelle justificatif =====
let justifTvaLinesData = [];

function initJustifTvaLines() {
    justifTvaLinesData = [{ montantHT: '', taux: 20, montantTVA: '', montantTTC: '' }];
    renderJustifTvaLines();
}

function addJustifTvaLine() {
    justifTvaLinesData.push({ montantHT: '', taux: 20, montantTVA: '', montantTTC: '' });
    renderJustifTvaLines();
}

function removeJustifTvaLine(index) {
    if (justifTvaLinesData.length <= 1) return;
    justifTvaLinesData.splice(index, 1);
    renderJustifTvaLines();
}

function updateJustifTvaLine(index, field, value) {
    const line = justifTvaLinesData[index];
    if (!line) return;
    
    if (field === 'montantHT') {
        line.montantHT = parseFloat(value) || 0;
        line.montantTVA = +(line.montantHT * line.taux / 100).toFixed(2);
        line.montantTTC = +(line.montantHT + line.montantTVA).toFixed(2);
    } else if (field === 'taux') {
        line.taux = parseFloat(value) || 0;
        line.montantTVA = +(line.montantHT * line.taux / 100).toFixed(2);
        line.montantTTC = +(line.montantHT + line.montantTVA).toFixed(2);
    } else if (field === 'montantTTC') {
        line.montantTTC = parseFloat(value) || 0;
        line.montantHT = +(line.montantTTC / (1 + line.taux / 100)).toFixed(2);
        line.montantTVA = +(line.montantTTC - line.montantHT).toFixed(2);
    }
    renderJustifTvaLines();
}

function renderJustifTvaLines() {
    const container = document.getElementById('justifTvaLines');
    if (!container) return;
    let html = '';
    justifTvaLinesData.forEach((l, i) => {
        html += `<div class="multi-tva-line">
            <input type="number" step="0.01" value="${l.montantHT || ''}" placeholder="0.00" oninput="updateJustifTvaLine(${i},'montantHT',this.value)">
            <select onchange="updateJustifTvaLine(${i},'taux',this.value)">
                <option value="20" ${l.taux==20?'selected':''}>20%</option>
                <option value="10" ${l.taux==10?'selected':''}>10%</option>
                <option value="5.5" ${l.taux==5.5?'selected':''}>5,5%</option>
                <option value="2.1" ${l.taux==2.1?'selected':''}>2,1%</option>
                <option value="0" ${l.taux==0?'selected':''}>0%</option>
            </select>
            <input type="number" step="0.01" value="${l.montantTVA || ''}" readonly style="background:#f8fafc;color:#64748b;">
            <input type="number" step="0.01" value="${l.montantTTC || ''}" placeholder="0.00" oninput="updateJustifTvaLine(${i},'montantTTC',this.value)">
            <button class="multi-tva-remove" onclick="removeJustifTvaLine(${i})" ${justifTvaLinesData.length<=1?'style="visibility:hidden;"':''}>✕</button>
        </div>`;
    });
    container.innerHTML = html;
    
    // Totaux
    const totalTTC = justifTvaLinesData.reduce((s, l) => s + (l.montantTTC || 0), 0);
    const totalHT = justifTvaLinesData.reduce((s, l) => s + (l.montantHT || 0), 0);
    const totalTVA = justifTvaLinesData.reduce((s, l) => s + (l.montantTVA || 0), 0);
    document.getElementById('justifTotalTTC').textContent = formatMontant(totalTTC) + ' €';
    
    // Mettre à jour les champs cachés de compatibilité
    document.getElementById('justifMontantTTC').value = totalTTC.toFixed(2);
    document.getElementById('justifMontantHT').value = totalHT.toFixed(2);
    document.getElementById('justifMontantTVA').value = totalTVA.toFixed(2);
    document.getElementById('justifTauxTVA').value = justifTvaLinesData.length === 1 ? justifTvaLinesData[0].taux : 20;
}

function getJustifTvaLinesForSave() {
    return justifTvaLinesData.filter(l => l.montantHT > 0 || l.montantTTC > 0).map(l => ({
        montantHT: l.montantHT || 0,
        taux: l.taux,
        montantTVA: l.montantTVA || 0,
        montantTTC: l.montantTTC || 0
    }));
}

// Ancienne fonction pour compatibilité (désormais ne fait plus rien directement)
function calculateJustifFromTTC() {
    // Les calculs sont maintenant gérés par le multi-TVA
}

async function uploadJustificatifs() {
    const manualEntry = document.getElementById('justifManualEntry').checked;
    const uploadBtn = document.getElementById('uploadJustifBtn');
    const setUploadLoading = (text) => {
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<span class="btn-upload-spinner"></span> ' + text;
        }
    };
    
    if (manualEntry) {
        setUploadLoading('Enregistrement...');
        // Saisie manuelle - pas besoin d'OCR
        const lignesTVA = getJustifTvaLinesForSave();
        const totalTTC = lignesTVA.reduce((s, l) => s + l.montantTTC, 0);
        const totalHT = lignesTVA.reduce((s, l) => s + l.montantHT, 0);
        const totalTVA = lignesTVA.reduce((s, l) => s + l.montantTVA, 0);
        
        const justif = {
            id: 'justif_' + Date.now(),
            nomFichier: 'Saisie manuelle',
            type: 'manuel',
            montantTTC: totalTTC,
            montantHT: totalHT,
            montantTVA: totalTVA,
            tauxTVA: lignesTVA.length === 1 ? lignesTVA[0].taux : null,
            lignesTVA: lignesTVA.length > 1 ? lignesTVA : (lignesTVA.length === 1 ? lignesTVA : []),
            dateDocument: document.getElementById('justifDate').value || null,
            fournisseur: document.getElementById('justifFournisseur').value || null,
            numeroFacture: document.getElementById('justifNumero').value || null,
            dateAjout: new Date().toISOString(),
            statut: 'en_attente'
        };
        
        comptaJustificatifs.push(stampJustificatifDeposant(justif));
        await saveComptaData();
        renderComptaJustificatifs();
        renderDepotJustificatifsList();
        if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '📤 Envoyer'; }
        closeUploadJustificatifModal();
        alert('Justificatif ajouté avec succès !');
        
    } else if (comptaJustifFilesPending.length > 0) {
        // Fichiers à envoyer à n8n pour OCR
        sendFilesToN8nOCR(comptaJustifFilesPending);
    } else {
        alert('Veuillez sélectionner au moins un fichier ou cocher la saisie manuelle.');
    }
}

// Envoyer les fichiers au webhook n8n pour OCR
async function sendFilesToN8nOCR(files) {
    const uploadBtn = document.getElementById('uploadJustifBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="btn-upload-spinner"></span> Analyse en cours...';
    
    try {
        for (const file of files) {
            const justifId = 'justif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Upload fichier sur le serveur (disque) au lieu de base64
            let fileUrl = null;
            let fileId = null;
            let base64ForOCR = null;
            try {
                const uploaded = await uploadFile(file, 'budget');
                fileUrl = uploaded.url;
                fileId = uploaded.file_id;
                console.log('Justificatif uploadé sur serveur:', file.name, fileId);
            } catch (uploadErr) {
                console.warn('Upload serveur échoué, fallback base64:', uploadErr);
            }
            
            // Garder base64 en mémoire pour OCR n8n (pas sauvé en BDD)
            base64ForOCR = await fileToBase64(file);
            
            const justif = {
                id: justifId,
                nomFichier: file.name,
                type: file.type.includes('pdf') ? 'pdf' : 'image',
                fileType: file.type,
                // Stockage serveur
                stored_externally: !!fileUrl,
                file_id: fileId,
                fileUrl: fileUrl,
                // PAS de fileBase64 stocké en BDD
                montantTTC: null,
                montantHT: null,
                montantTVA: null,
                tauxTVA: 20,
                dateDocument: null,
                fournisseur: null,
                numeroFacture: null,
                dateAjout: new Date().toISOString(),
                statut: 'en_attente',
                ocrStatus: 'processing'
            };
            
            comptaJustificatifs.push(stampJustificatifDeposant(justif));
            
            // Envoyer au webhook n8n pour OCR (base64 temporaire, pas sauvé)
            try {
                const payload = {
                    justificatifId: justifId,
                    fileName: file.name,
                    fileType: file.type,
                    fileBase64: base64ForOCR,
                    callbackUrl: window.location.origin + window.location.pathname,
                    apiKey: N8N_CONFIG.apiKey
                };
                
                const response = await fetch(N8N_CONFIG.webhookOCR, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': N8N_CONFIG.apiKey
                    },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) {
                    console.warn('Webhook n8n non disponible, mode hors-ligne');
                    justif.ocrStatus = 'pending';
                } else {
                    const result = await response.json();
                    if (result.success && result.data) {
                        queueOcrValidation(justifId, justif.nomFichier, justif.fileType, '', result.data);
                    }
                }
            } catch (n8nErr) {
                console.warn('Webhook n8n non disponible:', n8nErr);
                justif.ocrStatus = 'pending';
            }
        }
        
        saveComptaData();
        renderComptaJustificatifs();
        closeUploadJustificatifModal();
        
    } catch (error) {
        console.error('Erreur envoi justificatifs:', error);
        
        // Mode dégradé : sauvegarder quand même sans OCR
        for (const file of files) {
            let fileUrl = null, fileId = null;
            try {
                const uploaded = await uploadFile(file, 'budget');
                fileUrl = uploaded.url;
                fileId = uploaded.file_id;
            } catch (e) { /* fallback sans upload */ }
            
            comptaJustificatifs.push(stampJustificatifDeposant({
                id: 'justif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                nomFichier: file.name,
                type: file.type.includes('pdf') ? 'pdf' : 'image',
                fileType: file.type,
                stored_externally: !!fileUrl,
                file_id: fileId,
                fileUrl: fileUrl,
                montantTTC: null, montantHT: null, montantTVA: null, tauxTVA: 20,
                dateDocument: null, fournisseur: null, numeroFacture: null,
                dateAjout: new Date().toISOString(),
                statut: 'en_attente',
                ocrStatus: 'failed'
            }));
        }
        
        saveComptaData();
        renderComptaJustificatifs();
        closeUploadJustificatifModal();
        alert('Justificatif(s) ajouté(s). L\'analyse OCR n\'est pas disponible actuellement.');
        
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '📤 Envoyer';
    }
}

// Convertir un fichier en base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// === VÉRIFICATION MANUELLE DES DONNÉES OCR (n8n) ===
// ===== MULTI-TVA : Validation OCR =====
let ocrValTvaLinesData = [];

function addOcrValTvaLine() {
    ocrValTvaLinesData.push({ montantHT: '', taux: 20, montantTVA: '', montantTTC: '' });
    renderOcrValTvaLines();
}

function removeOcrValTvaLine(index) {
    if (ocrValTvaLinesData.length <= 1) return;
    ocrValTvaLinesData.splice(index, 1);
    renderOcrValTvaLines();
}

function updateOcrValTvaLine(index, field, value) {
    const line = ocrValTvaLinesData[index];
    if (!line) return;
    
    if (field === 'montantHT') {
        line.montantHT = parseFloat(value) || 0;
        line.montantTVA = +(line.montantHT * line.taux / 100).toFixed(2);
        line.montantTTC = +(line.montantHT + line.montantTVA).toFixed(2);
    } else if (field === 'taux') {
        line.taux = parseFloat(value) || 0;
        line.montantTVA = +(line.montantHT * line.taux / 100).toFixed(2);
        line.montantTTC = +(line.montantHT + line.montantTVA).toFixed(2);
    } else if (field === 'montantTTC') {
        line.montantTTC = parseFloat(value) || 0;
        line.montantHT = +(line.montantTTC / (1 + line.taux / 100)).toFixed(2);
        line.montantTVA = +(line.montantTTC - line.montantHT).toFixed(2);
    }
    renderOcrValTvaLines();
}

function renderOcrValTvaLines() {
    const container = document.getElementById('ocrValTvaLines');
    if (!container) return;
    let html = '';
    ocrValTvaLinesData.forEach((l, i) => {
        html += `<div class="multi-tva-line">
            <input type="number" step="0.01" value="${l.montantHT || ''}" placeholder="0.00" oninput="updateOcrValTvaLine(${i},'montantHT',this.value)">
            <select onchange="updateOcrValTvaLine(${i},'taux',this.value)">
                <option value="20" ${l.taux==20?'selected':''}>20%</option>
                <option value="10" ${l.taux==10?'selected':''}>10%</option>
                <option value="5.5" ${l.taux==5.5?'selected':''}>5,5%</option>
                <option value="2.1" ${l.taux==2.1?'selected':''}>2,1%</option>
                <option value="0" ${l.taux==0?'selected':''}>0%</option>
            </select>
            <input type="number" step="0.01" value="${l.montantTVA || ''}" readonly style="background:#f8fafc;color:#64748b;">
            <input type="number" step="0.01" value="${l.montantTTC || ''}" placeholder="0.00" oninput="updateOcrValTvaLine(${i},'montantTTC',this.value)">
            <button class="multi-tva-remove" onclick="removeOcrValTvaLine(${i})" ${ocrValTvaLinesData.length<=1?'style="visibility:hidden;"':''}>✕</button>
        </div>`;
    });
    container.innerHTML = html;
    
    const totalTTC = ocrValTvaLinesData.reduce((s, l) => s + (l.montantTTC || 0), 0);
    const totalHT = ocrValTvaLinesData.reduce((s, l) => s + (l.montantHT || 0), 0);
    const totalTVA = ocrValTvaLinesData.reduce((s, l) => s + (l.montantTVA || 0), 0);
    document.getElementById('ocrValTotalTTC').textContent = formatMontant(totalTTC) + ' €';
    
    // Champs cachés compatibilité
    document.getElementById('ocrValMontantTTC').value = totalTTC.toFixed(2);
    document.getElementById('ocrValMontantHT').value = totalHT.toFixed(2);
    document.getElementById('ocrValMontantTVA').value = totalTVA.toFixed(2);
    document.getElementById('ocrValTauxTVA').value = ocrValTvaLinesData.length === 1 ? ocrValTvaLinesData[0].taux : 20;
}

function openOcrValidationModal(data) {
    if (!data) return;
    currentOcrValidation = data;
    
    const modal = document.getElementById('ocrValidationModal');
    const title = document.getElementById('ocrValidationTitle');
    const fileName = document.getElementById('ocrValidationFileName');
    const fileType = document.getElementById('ocrValidationFileType');
    const preview = document.getElementById('ocrValidationPreview');
    const previewRow = document.getElementById('ocrValidationPreviewRow');
    
    if (data.isEdit) {
        title.textContent = '✏️ Modifier le justificatif';
        previewRow.style.display = 'none';
    } else {
        title.textContent = '🔍 Vérifier les données extraites';
        previewRow.style.display = 'grid';
        fileName.textContent = data.fileName || 'Document';
        fileType.textContent = data.fileType || 'Fichier';
        if (data.fileBase64 && data.fileType && !data.fileType.toLowerCase().includes('pdf')) {
            const mime = data.fileType || 'image/jpeg';
            preview.innerHTML = `<img src="data:${mime};base64,${data.fileBase64}" style="max-width:100%;max-height:150px;object-fit:contain;" alt="Aperçu">`;
        } else {
            preview.innerHTML = `<span style="color: #94a3b8; font-size: 2.5rem;">${(data.fileType || '').toLowerCase().includes('pdf') ? '📕' : '📄'}</span>`;
        }
    }
    
    const d = data.ocrData || {};
    document.getElementById('ocrValDate').value = d.date || d.dateDocument || '';
    document.getElementById('ocrValFournisseur').value = d.fournisseur || '';
    document.getElementById('ocrValNumero').value = d.numeroFacture || d.numero || '';
    
    // Initialiser les lignes TVA depuis les données OCR
    if (d.lignesTVA && d.lignesTVA.length > 0) {
        // Données multi-TVA déjà structurées (depuis n8n ou édition)
        ocrValTvaLinesData = d.lignesTVA.map(l => ({
            montantHT: l.montantHT || 0,
            taux: l.taux ?? 20,
            montantTVA: l.montantTVA || 0,
            montantTTC: l.montantTTC || (l.montantHT + (l.montantTVA || 0))
        }));
    } else if (d.montantTTC || d.montantHT) {
        // Données simples (un seul taux) - convertir en ligne unique
        const taux = d.tauxTVA ?? 20;
        const ttc = d.montantTTC || 0;
        const ht = d.montantHT || (ttc / (1 + taux / 100));
        const tva = d.montantTVA || (ttc - ht);
        ocrValTvaLinesData = [{
            montantHT: +ht.toFixed(2),
            taux: taux,
            montantTVA: +tva.toFixed(2),
            montantTTC: +(ht + tva).toFixed(2)
        }];
    } else {
        ocrValTvaLinesData = [{ montantHT: '', taux: 20, montantTVA: '', montantTTC: '' }];
    }
    renderOcrValTvaLines();
    
    modal.style.display = 'flex';
}

function closeOcrValidationModal() {
    document.getElementById('ocrValidationModal').style.display = 'none';
    currentOcrValidation = null;
    processOcrValidationQueue();
}

function recalcOcrValidationFromTTC() {
    // Compatibilité - désormais géré par les lignes multi-TVA
}

function confirmOcrValidation() {
    if (!currentOcrValidation) return;
    
    const lignesTVA = ocrValTvaLinesData.filter(l => l.montantHT > 0 || l.montantTTC > 0).map(l => ({
        montantHT: l.montantHT || 0,
        taux: l.taux,
        montantTVA: l.montantTVA || 0,
        montantTTC: l.montantTTC || 0
    }));
    
    const totalTTC = lignesTVA.reduce((s, l) => s + l.montantTTC, 0);
    const totalHT = lignesTVA.reduce((s, l) => s + l.montantHT, 0);
    const totalTVA = lignesTVA.reduce((s, l) => s + l.montantTVA, 0);
    
    const ocrData = {
        montantTTC: totalTTC || null,
        montantHT: totalHT || null,
        montantTVA: totalTVA || null,
        tauxTVA: lignesTVA.length === 1 ? lignesTVA[0].taux : null,
        lignesTVA: lignesTVA.length > 0 ? lignesTVA : null,
        date: document.getElementById('ocrValDate').value || null,
        fournisseur: document.getElementById('ocrValFournisseur').value.trim() || null,
        numeroFacture: document.getElementById('ocrValNumero').value.trim() || null
    };
    
    if (!ocrData.montantTTC && !ocrData.montantHT) {
        alert('Veuillez renseigner au moins un montant HT ou TTC.');
        return;
    }
    
    updateJustificatifFromOCR(currentOcrValidation.justifId, ocrData);
    closeOcrValidationModal();
}

function rejectOcrValidation() {
    if (!currentOcrValidation) {
        closeOcrValidationModal();
        return;
    }
    const justif = comptaJustificatifs.find(j => j.id === currentOcrValidation.justifId);
    if (justif) {
        justif.ocrStatus = 'pending_review';
        justif.ocrRejected = true;
        saveComptaData();
        renderComptaJustificatifs();
    }
    closeOcrValidationModal();
}

function processOcrValidationQueue() {
    if (ocrValidationQueue.length === 0 || currentOcrValidation) return;
    const next = ocrValidationQueue.shift();
    openOcrValidationModal(next);
}

function queueOcrValidation(justifId, fileName, fileType, fileBase64, ocrData) {
    ocrValidationQueue.push({
        justifId,
        fileName,
        fileType,
        fileBase64,
        ocrData: {
            montantTTC: ocrData.montantTTC,
            montantHT: ocrData.montantHT,
            montantTVA: ocrData.montantTVA,
            tauxTVA: ocrData.tauxTVA ?? 20,
            lignesTVA: ocrData.lignesTVA || null,
            date: ocrData.date || ocrData.dateDocument,
            fournisseur: ocrData.fournisseur,
            numeroFacture: ocrData.numeroFacture || ocrData.numero
        }
    });
    processOcrValidationQueue();
}

// Mettre à jour un justificatif avec les données OCR (appelé par n8n ou en callback)
function updateJustificatifFromOCR(justifId, ocrData) {
    const justif = comptaJustificatifs.find(j => j.id === justifId);
    if (!justif) {
        console.warn('Justificatif non trouvé:', justifId);
        return;
    }
    
    // Mettre à jour avec les données extraites
    if (ocrData.montantTTC) justif.montantTTC = parseFloat(ocrData.montantTTC);
    if (ocrData.montantHT) justif.montantHT = parseFloat(ocrData.montantHT);
    if (ocrData.montantTVA) justif.montantTVA = parseFloat(ocrData.montantTVA);
    if (ocrData.tauxTVA) justif.tauxTVA = parseFloat(ocrData.tauxTVA);
    if (ocrData.date) justif.dateDocument = ocrData.date;
    if (ocrData.fournisseur) justif.fournisseur = ocrData.fournisseur;
    if (ocrData.numeroFacture) justif.numeroFacture = ocrData.numeroFacture;
    else if (ocrData.numero) justif.numeroFacture = ocrData.numero;
    
    // Multi-TVA : sauvegarder les lignes TVA
    if (ocrData.lignesTVA && ocrData.lignesTVA.length > 0) {
        justif.lignesTVA = ocrData.lignesTVA;
        // Si multi-taux, tauxTVA principal = null
        if (ocrData.lignesTVA.length > 1) {
            justif.tauxTVA = null;
        } else {
            justif.tauxTVA = ocrData.lignesTVA[0].taux;
        }
    }
    
    justif.ocrStatus = 'completed';
    justif.ocrConfidence = ocrData.confidence || null;
    justif.ocrRawData = ocrData.rawData || null;
    
    // Recalculer HT/TVA si seulement TTC fourni (et pas de lignesTVA)
    if (justif.montantTTC && !justif.montantHT && (!justif.lignesTVA || justif.lignesTVA.length === 0)) {
        const taux = justif.tauxTVA || 20;
        justif.montantHT = justif.montantTTC / (1 + taux / 100);
        justif.montantTVA = justif.montantTTC - justif.montantHT;
    }
    
    saveComptaData();
    renderComptaJustificatifs();
    
    // Tenter le rapprochement automatique
    autoMatchJustificatifs();
    renderComptaTransactions();
    
    console.log('Justificatif mis à jour avec OCR:', justif);
}

// Fonction globale pour recevoir les callbacks de n8n (via postMessage ou URL)
window.receiveOCRCallback = function(data) {
    if (data.justificatifId && data.ocrData) {
        const justif = comptaJustificatifs.find(j => j.id === data.justificatifId);
        queueOcrValidation(data.justificatifId, justif?.nomFichier || 'Document', justif?.fileType || '', justif?.fileBase64 || '', data.ocrData);
    }
};

// Écouter les messages postMessage (pour les callbacks iframe/popup)
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'ocr_result') {
        const justif = comptaJustificatifs.find(j => j.id === event.data.justificatifId);
        queueOcrValidation(event.data.justificatifId, justif?.nomFichier || 'Document', justif?.fileType || '', justif?.fileBase64 || '', event.data.ocrData);
    }
});

// Vérifier les paramètres URL pour les callbacks (si n8n redirige vers l'app)
async function checkURLCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const ocrCallback = urlParams.get('ocr_callback');
    if (ocrCallback) {
        try {
            // Charger les données compta d'abord (justificatifs)
            const periodeEl = document.getElementById('comptaPeriode');
            if (periodeEl) await loadComptaData();
            else {
                const stored = localStorage.getItem('comptaJustificatifs');
                if (stored) comptaJustificatifs = JSON.parse(stored);
            }
            const data = JSON.parse(decodeURIComponent(ocrCallback));
            const justif = comptaJustificatifs.find(j => j.id === data.justificatifId);
            queueOcrValidation(data.justificatifId, justif?.nomFichier || 'Document', justif?.fileType || '', justif?.fileBase64 || '', data.ocrData);
            // Nettoyer l'URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error('Erreur parsing callback OCR:', e);
        }
    }
}

// Appeler au chargement
document.addEventListener('DOMContentLoaded', checkURLCallback);

function uploadJustificatifForTransaction(transactionId) {
    currentEditingTransaction = transactionId;
    openUploadJustificatifModal();
}

// Détail transaction
function openTransactionDetail(transId) {
    const trans = comptaTransactions.find(t => t.id === transId);
    if (!trans) return;
    
    currentEditingTransaction = trans;
    
    document.getElementById('transactionDetailId').value = trans.id;
    document.getElementById('transDetailDate').textContent = new Date(trans.date).toLocaleDateString('fr-FR');
    document.getElementById('transDetailLibelle').textContent = trans.libelle;
    document.getElementById('transDetailRef').textContent = trans.reference || '-';
    
    const isCredit = trans.type === 'credit';
    document.getElementById('transDetailTTC').textContent = (isCredit ? '+' : '') + formatMontant(trans.montantTTC) + ' €';
    document.getElementById('transDetailTTC').style.color = isCredit ? '#28a745' : '#dc3545';
    document.getElementById('transDetailHT').textContent = formatMontant(trans.montantHT) + ' €';
    document.getElementById('transDetailTVA').textContent = formatMontant(trans.montantTVA) + ' €';
    document.getElementById('transDetailTaux').textContent = trans.tauxTVA + '%';
    
    document.getElementById('transDetailTauxEdit').value = trans.tauxTVA;
    document.getElementById('transDetailHTEdit').value = Math.abs(trans.montantHT).toFixed(2);
    document.getElementById('transDetailTVAEdit').value = Math.abs(trans.montantTVA).toFixed(2);
    
    document.getElementById('transDetailCategorie').value = trans.categorie || '';
    document.getElementById('transDetailProjet').value = trans.projetId || '';
    document.getElementById('transDetailNote').value = trans.note || '';
    
    // Justificatif lié
    const justifStatus = document.getElementById('transDetailJustifStatus');
    const justifLinked = document.getElementById('transDetailJustifLinked');
    const justifActions = document.getElementById('transDetailJustifActions');
    
    if (trans.justificatifId) {
        const justif = comptaJustificatifs.find(j => j.id === trans.justificatifId);
        if (justif) {
            justifStatus.innerHTML = '<span class="compta-linked-badge">✓ Rapproché</span>';
            justifLinked.style.display = 'block';
            justifLinked.innerHTML = `
                <div class="compta-justif-preview">
                    <div class="compta-justif-preview-header">
                        <span class="compta-justif-preview-name">${justif.type === 'pdf' ? '📄' : '🖼️'} ${justif.nomFichier}</span>
                        <div class="compta-justif-preview-actions">
                            <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="unlinkJustificatif('${trans.id}')">🔗 Délier</button>
                        </div>
                    </div>
                </div>
            `;
            justifActions.style.display = 'none';
        }
    } else {
        justifStatus.innerHTML = '<span class="compta-status non-rapproche">⚠️ Non rapproché</span>';
        justifLinked.style.display = 'none';
        justifActions.style.display = 'block';
    }
    
    document.getElementById('transDetailModifyTVA').checked = false;
    document.getElementById('transDetailTVAEdit').style.display = 'none';
    
    document.getElementById('transactionDetailModal').style.display = 'flex';
}

function closeTransactionDetailModal() {
    document.getElementById('transactionDetailModal').style.display = 'none';
    currentEditingTransaction = null;
}

function toggleTransactionTVAEdit() {
    const checked = document.getElementById('transDetailModifyTVA').checked;
    document.getElementById('transDetailTVAEdit').style.display = checked ? 'block' : 'none';
}

function recalculateTransactionTVA() {
    if (!currentEditingTransaction) return;
    const taux = parseFloat(document.getElementById('transDetailTauxEdit').value) || 20;
    const ttc = Math.abs(currentEditingTransaction.montantTTC);
    const ht = ttc / (1 + taux / 100);
    const tva = ttc - ht;
    
    document.getElementById('transDetailHTEdit').value = ht.toFixed(2);
    document.getElementById('transDetailTVAEdit').value = tva.toFixed(2);
}

function saveTransactionDetail() {
    const transId = document.getElementById('transactionDetailId').value;
    const trans = comptaTransactions.find(t => t.id === transId);
    if (!trans) return;
    
    trans.categorie = document.getElementById('transDetailCategorie').value || null;
    trans.projetId = document.getElementById('transDetailProjet').value || null;
    trans.note = document.getElementById('transDetailNote').value || '';
    
    if (document.getElementById('transDetailModifyTVA').checked) {
        const taux = parseFloat(document.getElementById('transDetailTauxEdit').value) || 20;
        const ht = parseFloat(document.getElementById('transDetailHTEdit').value) || 0;
        const tva = parseFloat(document.getElementById('transDetailTVAEdit').value) || 0;
        
        const sign = trans.type === 'debit' ? -1 : 1;
        trans.tauxTVA = taux;
        trans.montantHT = sign * ht;
        trans.montantTVA = sign * tva;
        trans.tvaModifiee = true;
    }
    
    saveComptaData();
    renderComptaTransactions();
    updateComptaStats();
    closeTransactionDetailModal();
}

function deleteTransaction(transId) {
    if (!confirm('Supprimer cette transaction ?')) return;
    
    const index = comptaTransactions.findIndex(t => t.id === transId);
    if (index !== -1) {
        comptaTransactions.splice(index, 1);
        saveComptaData();
        renderComptaTransactions();
        updateComptaStats();
    }
}

function unlinkJustificatif(transId) {
    const trans = comptaTransactions.find(t => t.id === transId);
    if (!trans) return;
    
    if (trans.justificatifId) {
        const justif = comptaJustificatifs.find(j => j.id === trans.justificatifId);
        if (justif) {
            justif.statut = 'en_attente';
        }
    }
    
    trans.justificatifId = null;
    trans.statut = 'non_rapproche';
    
    saveComptaData();
    openTransactionDetail(transId);
    renderComptaJustificatifs();
}

// Lier justificatif
function openLinkJustificatifModal() {
    if (!currentEditingTransaction) return;
    
    document.getElementById('linkJustifTransactionId').value = currentEditingTransaction.id;
    
    const enAttente = comptaJustificatifs.filter(j => j.statut === 'en_attente');
    let html = '';
    
    if (enAttente.length === 0) {
        html = '<div class="compta-empty"><p>Aucun justificatif disponible</p></div>';
    } else {
        enAttente.forEach(j => {
            html += `
                <div class="compta-justif-card" onclick="linkJustificatifToTransaction('${j.id}')" style="margin-bottom: 0.5rem;">
                    <div class="compta-justif-card-header">
                        <div class="compta-justif-card-icon">${j.type === 'pdf' ? '📄' : '🖼️'}</div>
                        <div class="compta-justif-card-info">
                            <div class="compta-justif-card-name">${j.nomFichier}</div>
                            <div class="compta-justif-card-details">
                                ${j.montantTTC ? `<span class="compta-justif-card-amount">${formatMontant(j.montantTTC)} €</span>` : ''}
                                ${j.fournisseur ? `<span>🏢 ${j.fournisseur}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    document.getElementById('linkJustifList').innerHTML = html;
    document.getElementById('linkJustificatifModal').style.display = 'flex';
}

function closeLinkJustificatifModal() {
    document.getElementById('linkJustificatifModal').style.display = 'none';
}

function linkJustificatifToTransaction(justifId) {
    const transId = document.getElementById('linkJustifTransactionId').value;
    const trans = comptaTransactions.find(t => t.id === transId);
    const justif = comptaJustificatifs.find(j => j.id === justifId);
    
    if (!trans || !justif) return;
    
    trans.justificatifId = justifId;
    trans.statut = 'rapproche';
    justif.statut = 'rapproche';
    
    // Récupérer les infos TVA du justificatif si disponibles
    if (justif.montantHT) trans.montantHT = trans.type === 'debit' ? -Math.abs(justif.montantHT) : Math.abs(justif.montantHT);
    if (justif.montantTVA) trans.montantTVA = trans.type === 'debit' ? -Math.abs(justif.montantTVA) : Math.abs(justif.montantTVA);
    if (justif.tauxTVA) trans.tauxTVA = justif.tauxTVA;
    
    saveComptaData();
    closeLinkJustificatifModal();
    closeTransactionDetailModal();
    renderComptaTransactions();
    renderComptaJustificatifs();
    updateComptaStats();
}

function filterLinkJustificatifs() {
    // À implémenter si besoin
}

// Prévisualisation justificatif
let currentPreviewJustifId = null;

async function openJustificatifPreview(justifId) {
    const justif = comptaJustificatifs.find(j => j.id === justifId);
    if (!justif) return;
    
    currentPreviewJustifId = justifId;
    document.getElementById('justifPreviewTitle').textContent = justif.nomFichier;
    
    // Masquer/afficher le bouton réanalyser selon le type
    const reanalyzeBtn = document.getElementById('justifPreviewReanalyzeBtn');
    if (reanalyzeBtn) {
        reanalyzeBtn.style.display = (justif.type !== 'manuel' && (justif.fileUrl || justif.file_id || justif.fileBase64)) ? 'block' : 'none';
    }
    
    // Afficher le loading
    const previewContent = document.getElementById('justifPreviewContent');
    previewContent.innerHTML = '<div style="text-align: center; padding: 2rem;"><div style="font-size: 2rem; animation: spin 1s linear infinite;">⏳</div><p style="color: #636e72; margin-top: 0.5rem;">Chargement de l\'aperçu...</p></div>';
    
    // Remplir les données extraites
    let tvaDetail = '';
    if (justif.lignesTVA && justif.lignesTVA.length > 1) {
        tvaDetail = justif.lignesTVA.map(l => 
            `<div style="display:flex;justify-content:space-between;padding:0.2rem 0;"><span><span class="compta-justif-row-tva-tag">${l.taux}%</span></span><span>HT ${formatMontant(l.montantHT)} € → TVA ${formatMontant(l.montantTVA)} €</span></div>`
        ).join('');
        tvaDetail = `<div style="margin-top:0.25rem;padding:0.5rem;background:#f8fafc;border-radius:6px;font-size:0.85rem;">${tvaDetail}</div>`;
    } else if (justif.tauxTVA !== null && justif.tauxTVA !== undefined) {
        tvaDetail = `${justif.montantTVA ? formatMontant(justif.montantTVA) + ' € (' + justif.tauxTVA + '%)' : 'Non détecté'}`;
    } else {
        tvaDetail = 'Non détecté';
    }
    
    let dataHtml = `
        <div style="display: grid; gap: 0.5rem;">
            <div><strong>Montant TTC:</strong> ${justif.montantTTC ? formatMontant(justif.montantTTC) + ' €' : 'Non détecté'}</div>
            <div><strong>Montant HT:</strong> ${justif.montantHT ? formatMontant(justif.montantHT) + ' €' : 'Non détecté'}</div>
            <div><strong>TVA:</strong> ${tvaDetail}</div>
            <div><strong>Date:</strong> ${justif.dateDocument ? new Date(justif.dateDocument).toLocaleDateString('fr-FR') : 'Non détectée'}</div>
            <div><strong>Fournisseur:</strong> ${justif.fournisseur || 'Non détecté'}</div>
            <div><strong>N° facture:</strong> ${justif.numeroFacture || 'Non détecté'}</div>
        </div>
    `;
    document.getElementById('justifPreviewData').innerHTML = dataHtml;
    
    // Ouvrir le modal tout de suite
    document.getElementById('justificatifPreviewModal').style.display = 'flex';
    
    // Charger le fichier
    try {
        let fileType = justif.fileType || (justif.type === 'pdf' ? 'application/pdf' : 'image/jpeg');
        
        // Priorité 1 : URL fichier sur le serveur (nouveau système)
        if (justif.fileUrl && justif.stored_externally) {
            const fileSrc = getJustifFileUrl(justif);
            if (justif.type === 'image' || fileType.startsWith('image/')) {
                previewContent.innerHTML = `
                    <img src="${fileSrc}" 
                         style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; cursor: zoom-in;" 
                         onclick="openFullscreenPreview(this.src)"
                         alt="${justif.nomFichier}">
                `;
            } else if (justif.type === 'pdf' || fileType === 'application/pdf') {
                previewContent.innerHTML = `
                    <iframe src="${fileSrc}" 
                            style="width: 100%; height: 100%; border: none; border-radius: 8px;" 
                            title="${justif.nomFichier}">
                    </iframe>
                `;
            } else {
                previewContent.innerHTML = `<div style="text-align: center; color: #636e72;"><span style="font-size: 4rem;">📎</span><p>Type de fichier : ${fileType}</p><a href="${fileSrc}" target="_blank" class="btn btn-secondary" style="margin-top: 1rem;">📥 Télécharger</a></div>`;
            }
        } else {
            // Priorité 2 : base64 en mémoire ou depuis compta.php (ancien système)
            let fileBase64 = justif.fileBase64;
            if (!fileBase64 || fileBase64.length < 100) {
                const data = await apiCall('compta.php?justificatif_file=' + encodeURIComponent(justifId), 'GET');
                if (data.success && data.fileBase64) {
                    fileBase64 = data.fileBase64;
                    fileType = data.fileType || fileType;
                }
            }
            
            if (fileBase64 && fileBase64.length > 100) {
                if (justif.type === 'image' || fileType.startsWith('image/')) {
                    previewContent.innerHTML = `
                        <img src="data:${fileType};base64,${fileBase64}" 
                             style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; cursor: zoom-in;" 
                             onclick="openFullscreenPreview(this.src)"
                             alt="${justif.nomFichier}">
                    `;
                } else if (justif.type === 'pdf' || fileType === 'application/pdf') {
                    const pdfBlob = base64ToBlob(fileBase64, 'application/pdf');
                    const pdfUrl = URL.createObjectURL(pdfBlob);
                    previewContent.innerHTML = `
                        <iframe src="${pdfUrl}" 
                                style="width: 100%; height: 100%; border: none; border-radius: 8px;" 
                                title="${justif.nomFichier}">
                        </iframe>
                    `;
                } else {
                    previewContent.innerHTML = `<div style="text-align: center; color: #636e72;"><span style="font-size: 4rem;">📎</span><p>Type de fichier : ${fileType}</p><button class="btn btn-secondary" onclick="downloadCurrentJustificatif()" style="margin-top: 1rem;">📥 Télécharger pour voir</button></div>`;
                }
            } else {
                const icon = justif.type === 'pdf' ? '📄' : justif.type === 'image' ? '🖼️' : '📝';
                const label = justif.type === 'manual' ? 'Saisie manuelle' : 'Fichier non disponible sur le serveur';
                previewContent.innerHTML = `<div style="text-align: center; color: #636e72;"><span style="font-size: 4rem;">${icon}</span><p>${label}</p></div>`;
            }
        }
    } catch (error) {
        console.error('Erreur chargement aperçu justificatif:', error);
        previewContent.innerHTML = '<div style="text-align: center; color: #636e72;"><span style="font-size: 4rem;">⚠️</span><p>Erreur de chargement</p></div>';
    }
}

// Convertir base64 en Blob
function base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const byteArrays = [];
    for (let i = 0; i < byteChars.length; i += 512) {
        const slice = byteChars.slice(i, i + 512);
        const byteNumbers = new Array(slice.length);
        for (let j = 0; j < slice.length; j++) {
            byteNumbers[j] = slice.charCodeAt(j);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
}

// Aperçu plein écran pour les images
function openFullscreenPreview(src) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10001;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    overlay.onclick = () => overlay.remove();
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:95%;max-height:95%;object-fit:contain;border-radius:8px;';
    overlay.appendChild(img);
    // Bouton fermer
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);color:white;border:none;font-size:1.5rem;width:40px;height:40px;border-radius:50%;cursor:pointer;';
    closeBtn.onclick = (e) => { e.stopPropagation(); overlay.remove(); };
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

// Télécharger un justificatif par id
async function downloadJustificatifById(justifId) {
    const prev = currentPreviewJustifId;
    currentPreviewJustifId = justifId;
    await downloadCurrentJustificatif();
    currentPreviewJustifId = prev;
}

// Télécharger le justificatif actuel
async function downloadCurrentJustificatif() {
    if (!currentPreviewJustifId) return;
    const justif = comptaJustificatifs.find(j => j.id === currentPreviewJustifId);
    if (!justif) return;
    
    try {
        // Priorité 1 : URL serveur (nouveau système)
        if (justif.fileUrl && justif.stored_externally) {
            const fileSrc = getJustifFileUrl(justif);
            const a = document.createElement('a');
            a.href = fileSrc;
            a.download = justif.nomFichier || 'justificatif';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        }
        
        // Priorité 2 : base64 (ancien système / fallback)
        let fileBase64 = justif.fileBase64;
        let fileType = justif.fileType || (justif.type === 'pdf' ? 'application/pdf' : 'image/jpeg');
        
        if (!fileBase64 || fileBase64.length < 100) {
            const data = await apiCall('compta.php?justificatif_file=' + encodeURIComponent(currentPreviewJustifId), 'GET');
            if (data.success && data.fileBase64) {
                fileBase64 = data.fileBase64;
                fileType = data.fileType || fileType;
            }
        }
        
        if (fileBase64) {
            const blob = base64ToBlob(fileBase64, fileType);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = justif.nomFichier || 'justificatif';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            showToast('Fichier non disponible', 'error');
        }
    } catch (error) {
        console.error('Erreur téléchargement justificatif:', error);
        showToast('Erreur lors du téléchargement', 'error');
    }
}

function closeJustificatifPreviewModal() {
    document.getElementById('justificatifPreviewModal').style.display = 'none';
}

function deleteJustificatif(justifId, skipConfirm) {
    if (!skipConfirm && !confirm('Supprimer ce justificatif ?')) return;
    
    const index = comptaJustificatifs.findIndex(j => j.id === justifId);
    if (index !== -1) {
        // Délier des transactions
        comptaTransactions.forEach(t => {
            if (t.justificatifId === justifId) {
                t.justificatifId = null;
                t.statut = 'non_rapproche';
            }
        });
        
        comptaJustificatifs.splice(index, 1);
        saveComptaData();
        renderComptaJustificatifs();
        renderComptaTransactions();
        renderDepotJustificatifsList();
        closeJustificatifPreviewModal();
        if (typeof renderComptaValidationSection === 'function') renderComptaValidationSection();
    }
}

// Réanalyser un justificatif existant via n8n (OCR)
async function reanalyzeJustificatif(justifId) {
    const justif = comptaJustificatifs.find(j => j.id === justifId);
    if (!justif) return;
    
    // Vérifier qu'on a un fichier à analyser
    if (!justif.fileUrl && !justif.file_id && !justif.fileBase64) {
        alert('Impossible : ce justificatif n\'a pas de fichier associé (saisie manuelle).');
        return;
    }
    
    // Trouver le bouton et le passer en loading
    const btn = document.querySelector(`.compta-justif-row-actions .compta-reanalyze-btn[onclick*="${justifId}"]`);
    if (btn) {
        btn.classList.add('loading');
        btn.textContent = '';
    }
    
    // Marquer comme en cours d'analyse
    justif.ocrStatus = 'processing';
    saveComptaData();
    renderComptaJustificatifs();
    
    try {
        // Récupérer le fichier en base64 pour l'envoi à n8n
        let base64ForOCR = null;
        
        if (justif.fileUrl || justif.file_id) {
            // Fichier stocké sur le serveur → le télécharger et convertir en base64
            const fileSrc = getJustifFileUrl(justif);
            if (fileSrc) {
                try {
                    const resp = await fetch(fileSrc);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        base64ForOCR = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result.split(',')[1]);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }
                } catch (fetchErr) {
                    console.warn('Impossible de récupérer le fichier depuis le serveur:', fetchErr);
                }
            }
        }
        
        // Fallback : base64 stocké en mémoire (ancien justificatif)
        if (!base64ForOCR && justif.fileBase64) {
            base64ForOCR = justif.fileBase64;
        }
        
        if (!base64ForOCR) {
            throw new Error('Impossible de récupérer le contenu du fichier pour l\'analyse.');
        }
        
        // Envoyer au webhook n8n
        const payload = {
            justificatifId: justifId,
            fileName: justif.nomFichier,
            fileType: justif.fileType || (justif.type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
            fileBase64: base64ForOCR,
            reanalyze: true,
            callbackUrl: window.location.origin + window.location.pathname,
            apiKey: N8N_CONFIG.apiKey
        };
        
        const response = await fetch(N8N_CONFIG.webhookOCR, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': N8N_CONFIG.apiKey
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error('Le webhook n8n a répondu avec une erreur : ' + response.status);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            // Ouvrir la modale de validation avec les nouvelles données
            queueOcrValidation(justifId, justif.nomFichier, justif.fileType || '', '', result.data);
            justif.ocrStatus = 'pending_review';
        } else {
            justif.ocrStatus = 'failed';
            alert('L\'analyse n\'a pas retourné de données exploitables.');
        }
        
    } catch (error) {
        console.error('Erreur réanalyse justificatif:', error);
        justif.ocrStatus = 'failed';
        alert('Erreur lors de la réanalyse : ' + error.message);
    }
    
    saveComptaData();
    renderComptaJustificatifs();
}

// Éditer un justificatif existant
function editJustificatif(justifId) {
    const justif = comptaJustificatifs.find(j => j.id === justifId);
    if (!justif) return;
    
    // Réutiliser la modale de validation OCR pour l'édition
    currentOcrValidation = {
        justifId: justif.id,
        fileName: justif.nomFichier,
        fileType: justif.fileType || 'image/jpeg',
        fileBase64: justif.fileBase64 || '',
        ocrData: {
            montantTTC: justif.montantTTC,
            montantHT: justif.montantHT,
            montantTVA: justif.montantTVA,
            tauxTVA: justif.tauxTVA,
            lignesTVA: justif.lignesTVA || null,
            date: justif.dateDocument,
            fournisseur: justif.fournisseur,
            numero: justif.numeroFacture,
            description: justif.description,
            categorie: justif.categorie
        },
        isEdit: true
    };
    
    openOcrValidationModal(currentOcrValidation);
    
    // Changer le titre de la modale
    const modal = document.getElementById('ocrValidationModal');
    if (modal) {
        const h2 = modal.querySelector('h2');
        if (h2) h2.textContent = '✏️ Modifier le justificatif';
    }
}

// Obtenir le label d'une catégorie
function getCategorieLabel(cat) {
    const labels = {
        'fournitures': '📦 Fournitures',
        'services': '🔧 Services',
        'transport': '🚐 Transport',
        'restauration': '🍽️ Restauration',
        'hebergement': '🏨 Héberg.',
        'communication': '📢 Com.',
        'location_materiel': '🔊 Loc. mat.',
        'location_salle': '🏛️ Loc. salle',
        'honoraires': '📋 Honoraires',
        'assurances': '🛡️ Assur.',
        'autres_depenses': '📤 Autres'
    };
    return labels[cat] || cat;
}

// Export
function exportComptaData() {
    const filtered = filterComptaTransactions();
    
    let csv = 'Date;Libellé;Type;Montant TTC;Montant HT;TVA;Taux TVA;Détail TVA;Catégorie;Statut;Note\n';
    
    filtered.forEach(t => {
        const cat = comptaCategories.find(c => c.id === t.categorie);
        // Détail multi-TVA si disponible via justificatif lié
        let detailTVA = '';
        if (t.justificatifId) {
            const justif = comptaJustificatifs.find(j => j.id === t.justificatifId);
            if (justif && justif.lignesTVA && justif.lignesTVA.length > 1) {
                detailTVA = justif.lignesTVA.map(l => `${l.taux}%: HT ${l.montantHT} / TVA ${l.montantTVA}`).join(' | ');
            }
        }
        csv += `${t.date};${t.libelle};${t.type};${t.montantTTC};${t.montantHT};${t.montantTVA};${t.tauxTVA}%;${detailTVA};${cat ? cat.nom : ''};${t.statut};${t.note || ''}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `compta_export_${document.getElementById('comptaPeriode').value}.csv`;
    link.click();
}

function exportTVARecap() {
    const periode = document.getElementById('comptaPeriode').value;
    alert('Export TVA pour ' + periode + ' - Fonctionnalité à connecter avec votre logiciel comptable');
}

// ========== RAPPROCHEMENT AUTO ==========
let rapprochementAutoMatches = [];

function autoRapprochement() {
    const justifs = comptaJustificatifs.filter(j => j.statut === 'non_rapproche');
    const trans = comptaTransactions.filter(t => !t.justificatifId && t.statut !== 'rapproche');
    rapprochementAutoMatches = [];
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const epsilon = 0.10;
    justifs.forEach(j => {
        const jTtc = Math.abs(parseFloat(j.montantTTC) || 0);
        const jDate = new Date(j.date || 0).getTime();
        trans.forEach(t => {
            const tTtc = Math.abs(parseFloat(t.montantTTC) || 0);
            const tDate = new Date(t.date || 0).getTime();
            if (Math.abs(jTtc - tTtc) > epsilon) return;
            if (Math.abs(jDate - tDate) > sevenDays) return;
            let score = 'Faible';
            if (Math.abs(jTtc - tTtc) < 0.01 && Math.abs(jDate - tDate) < 2 * 24 * 60 * 60 * 1000) score = 'Élevé';
            else if (Math.abs(jTtc - tTtc) < 0.05) score = 'Moyen';
            const libMatch = (j.nom && t.libelle && (j.nom + ' ' + (j.fournisseur || '')).toLowerCase().includes(t.libelle.toLowerCase().substring(0, 15))) || (t.libelle && j.fournisseur && t.libelle.toLowerCase().includes((j.fournisseur || '').toLowerCase().substring(0, 10)));
            if (libMatch && score === 'Faible') score = 'Moyen';
            rapprochementAutoMatches.push({ justif: j, transaction: t, score, selected: score === 'Élevé' });
        });
    });
    const listEl = document.getElementById('rapprochementAutoList');
    if (!listEl) return;
    if (rapprochementAutoMatches.length === 0) {
        listEl.innerHTML = '<p style="color: var(--mn-text-secondary);">Aucune correspondance trouvée.</p>';
    } else {
        listEl.innerHTML = rapprochementAutoMatches.map((m, i) => `
            <div class="compta-match-item">
                <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                    <input type="checkbox" ${m.selected ? 'checked' : ''} onchange="rapprochementAutoMatches[${i}].selected = this.checked">
                    <div>
                        <div><strong>${(m.justif.nom || m.justif.fournisseur || 'Justificatif').toString().substring(0, 50)}</strong> — ${formatMontant(m.justif.montantTTC)} €</div>
                        <div style="font-size: 0.85rem; color: var(--mn-text-secondary);">↔ ${(m.transaction.libelle || '').substring(0, 40)} — ${formatMontant(m.transaction.montantTTC)} € · ${m.transaction.date}</div>
                        <span class="compta-match-score compta-match-${m.score.toLowerCase().replace('é', 'e')}">${m.score}</span>
                    </div>
                </label>
            </div>
        `).join('');
    }
    document.getElementById('rapprochementAutoModal').classList.add('active');
}

function closeRapprochementAutoModal() {
    document.getElementById('rapprochementAutoModal').classList.remove('active');
}

function confirmerRapprochementAuto() {
    const selected = rapprochementAutoMatches.filter(m => m.selected);
    selected.forEach(m => {
        const t = comptaTransactions.find(x => x.id === m.transaction.id);
        const j = comptaJustificatifs.find(x => x.id === m.justif.id);
        if (t) t.justificatifId = m.justif.id; t.statut = 'rapproche';
        if (j) j.statut = 'rapproche'; j.transactionId = m.transaction.id;
    });
    saveComptaData();
    closeRapprochementAutoModal();
    renderComptaTransactions();
    renderComptaJustificatifs();
    if (typeof showToast === 'function') showToast('Rapprochements enregistrés', 'success');
}

// ========== RÈGLES DE CATÉGORISATION ==========
function appliquerRegles(transaction) {
    if (!comptaRegles || !transaction || !transaction.libelle) return;
    const lib = (transaction.libelle || '').toLowerCase();
    for (const r of comptaRegles) {
        const motif = (r.motifContient || '').toLowerCase();
        if (motif && lib.includes(motif)) {
            transaction.categorie = r.categorie || transaction.categorie;
            if (r.compte) transaction.compteId = r.compte;
            break;
        }
    }
}

function renderComptaRegles() {
    const tbody = document.getElementById('comptaReglesBody');
    if (!tbody) return;
    if (!comptaRegles || comptaRegles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color: var(--mn-text-secondary);">Aucune règle. Cliquez sur "Ajouter une règle".</td></tr>';
        return;
    }
    tbody.innerHTML = comptaRegles.map(r => {
        const cat = comptaCategories.find(c => c.id === r.categorie);
        const compte = (comptaComptes || []).find(c => c.id === r.compte);
        return `<tr class="compta-regle-row">
            <td>${(r.motifContient || '').substring(0, 40)}</td>
            <td>${cat ? cat.nom : r.categorie || '—'}</td>
            <td>${compte ? compte.nom : r.compte || '—'}</td>
            <td><button type="button" class="btn btn-secondary" onclick="deleteRegle('${r.id}')">Supprimer</button></td>
        </tr>`;
    }).join('');
}

function openRegleModal(editId) {
    document.getElementById('regleModalTitle').textContent = editId ? 'Modifier la règle' : 'Ajouter une règle';
    document.getElementById('regleEditId').value = editId || '';
    const r = editId ? comptaRegles.find(x => x.id === editId) : null;
    document.getElementById('regleMotifContient').value = r ? (r.motifContient || '') : '';
    const catSel = document.getElementById('regleCategorie');
    catSel.innerHTML = (comptaCategories || []).map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
    catSel.value = r ? (r.categorie || '') : '';
    const compteSel = document.getElementById('regleCompte');
    compteSel.innerHTML = '<option value="">—</option>' + (comptaComptes || []).map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
    compteSel.value = r ? (r.compte || '') : '';
    document.getElementById('regleModal').classList.add('active');
}

function closeRegleModal() {
    document.getElementById('regleModal').classList.remove('active');
}

function saveRegle() {
    const id = document.getElementById('regleEditId').value;
    const motifContient = document.getElementById('regleMotifContient').value.trim();
    const categorie = document.getElementById('regleCategorie').value;
    const compte = document.getElementById('regleCompte').value || undefined;
    if (!motifContient) { if (typeof showToast === 'function') showToast('Indiquez un motif', 'error'); return; }
    const payload = { id: id || 'regle_' + Date.now(), motifContient, categorie, compte };
    const idx = comptaRegles.findIndex(r => r.id === payload.id);
    if (idx >= 0) comptaRegles[idx] = payload; else comptaRegles.push(payload);
    saveComptaData();
    closeRegleModal();
    renderComptaRegles();
    if (typeof showToast === 'function') showToast('Règle enregistrée', 'success');
}

function deleteRegle(id) {
    comptaRegles = comptaRegles.filter(r => r.id !== id);
    saveComptaData();
    renderComptaRegles();
}

// ========== FACTURES ==========
function renderComptaFactures() {
    const container = document.getElementById('comptaFacturesList');
    if (!container) return;
    const typeF = document.getElementById('comptaFactureTypeFilter')?.value || 'all';
    const statutF = document.getElementById('comptaFactureStatutFilter')?.value || 'all';
    const periodeF = document.getElementById('comptaFacturePeriode')?.value || '';
    let list = comptaFactures || [];
    if (typeF !== 'all') list = list.filter(f => f.type === typeF);
    if (statutF !== 'all') list = list.filter(f => f.statut === statutF);
    if (periodeF) {
        const [y, m] = periodeF.split('-');
        list = list.filter(f => {
            const d = (f.date || '').toString().slice(0, 7);
            return d === y + '-' + m;
        });
    }
    if (list.length === 0) {
        container.innerHTML = '<div class="compta-empty">Aucune facture</div>';
        return;
    }
    container.innerHTML = list.map(f => {
        const retard = f.statut !== 'payee' && f.dateEcheance && new Date(f.dateEcheance) < new Date();
        return `<div class="compta-facture-row ${retard ? 'facture-retard' : ''}">
            <div><strong>${(f.numero || '').substring(0, 30)}</strong> ${f.type === 'emise' ? '📤' : '📥'} ${(f.client || f.fournisseur || '').substring(0, 25)}</div>
            <div>${f.date} · ${formatMontant(f.montantTTC)} € · <span class="compta-status ${f.statut}">${f.statut}</span></div>
            ${retard ? '<div class="facture-retard-label">⚠️ Échéance dépassée</div>' : ''}
            <button type="button" class="btn btn-secondary" onclick="openFactureModal('${f.id}')">Modifier</button>
        </div>`;
    }).join('');
}

function openFactureModal(editId) {
    document.getElementById('factureModalTitle').textContent = editId ? 'Modifier la facture' : 'Nouvelle facture';
    document.getElementById('factureEditId').value = editId || '';
    const f = editId ? comptaFactures.find(x => x.id === editId) : null;
    document.getElementById('factureType').value = f ? (f.type || 'recue') : 'recue';
    document.getElementById('factureNumero').value = f ? (f.numero || '') : '';
    document.getElementById('factureDate').value = f && f.date ? f.date.toString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    document.getElementById('factureDateEcheance').value = f && f.dateEcheance ? f.dateEcheance.toString().slice(0, 10) : '';
    document.getElementById('factureClient').value = f ? (f.client || f.fournisseur || '') : '';
    document.getElementById('factureMontantTTC').value = f ? (f.montantTTC != null ? f.montantTTC : '') : '';
    document.getElementById('factureMontantHT').value = f ? (f.montantHT != null ? f.montantHT : '') : '';
    document.getElementById('factureMontantTVA').value = f ? (f.montantTVA != null ? f.montantTVA : '') : '';
    document.getElementById('factureStatut').value = f ? (f.statut || 'en_attente') : 'en_attente';
    const projSel = document.getElementById('factureProjet');
    projSel.innerHTML = '<option value="">— Aucun —</option>' + (typeof projects !== 'undefined' && projects ? projects.map(p => `<option value="${p.id}">${p.name || p.lieu || p.id}</option>`).join('') : '');
    projSel.value = f ? (f.projetId || '') : '';
    document.getElementById('factureModal').classList.add('active');
}

function closeFactureModal() {
    document.getElementById('factureModal').classList.remove('active');
}

function saveFacture() {
    const id = document.getElementById('factureEditId').value;
    const type = document.getElementById('factureType').value;
    const numero = document.getElementById('factureNumero').value.trim();
    const date = document.getElementById('factureDate').value;
    const dateEcheance = document.getElementById('factureDateEcheance').value;
    const client = document.getElementById('factureClient').value.trim();
    const montantTTC = parseFloat(document.getElementById('factureMontantTTC').value) || 0;
    const montantHT = parseFloat(document.getElementById('factureMontantHT').value) || 0;
    const montantTVA = parseFloat(document.getElementById('factureMontantTVA').value) || 0;
    const statut = document.getElementById('factureStatut').value;
    const projetId = document.getElementById('factureProjet').value || '';
    const payload = { id: id || 'fac_' + Date.now(), type, numero, date, dateEcheance, client, fournisseur: client, montantTTC, montantHT, montantTVA, statut, projetId };
    const idx = comptaFactures.findIndex(x => x.id === payload.id);
    if (idx >= 0) comptaFactures[idx] = payload; else comptaFactures.push(payload);
    saveComptaData();
    closeFactureModal();
    renderComptaFactures();
    if (typeof showToast === 'function') showToast('Facture enregistrée', 'success');
}

// Initialisation des dropzones
document.addEventListener('DOMContentLoaded', function() {
    // Dropzone relevé
    const releveDropzone = document.getElementById('releveDropzone');
    if (releveDropzone) {
        releveDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            releveDropzone.classList.add('dragover');
        });
        releveDropzone.addEventListener('dragleave', () => {
            releveDropzone.classList.remove('dragover');
        });
        releveDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            releveDropzone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                document.getElementById('releveFileInput').files = files;
                handleReleveFileSelect({ target: { files: files } });
            }
        });
    }
    
    // Dropzone justificatifs
    const justifDropzone = document.getElementById('justifDropzone');
    if (justifDropzone) {
        justifDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            justifDropzone.classList.add('dragover');
        });
        justifDropzone.addEventListener('dragleave', () => {
            justifDropzone.classList.remove('dragover');
        });
        justifDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            justifDropzone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleJustifFileSelect({ target: { files: files } });
            }
        });
    }
});

function comptaGlobalSearchAppend(query, results, pushResult) {
    if (typeof comptaJustificatifs === 'undefined' || !Array.isArray(comptaJustificatifs)) return;
    var q = (query || '').toLowerCase();
    var uid = String((typeof currentUser !== 'undefined' && currentUser && currentUser.id) || '');
    var canValidate = typeof canValidateFactures === 'function' && canValidateFactures();
    var push = typeof pushResult === 'function'
        ? pushResult
        : function(key, item) { results.push(item); };

    comptaJustificatifs.forEach(function(j) {
        if (typeof isDepotFacture === 'function' && !isDepotFacture(j)) return;
        if (!canValidate && String(j.deposeParUserId || '') !== uid) return;
        var hay = [j.libelle, j.fournisseur, j.numeroFacture, j.nomFichier, j.commentaire].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        var title = j.libelle || j.fournisseur || j.nomFichier || 'Facture';
        push('facture_' + j.id, {
            type: 'facture',
            icon: '🧾',
            title: title,
            subtitle: 'Comptabilité · Facture' + (j.fournisseur && title !== j.fournisseur ? ' · ' + j.fournisseur : ''),
            action: function() {
                if (typeof openComptabiliteHomePage === 'function') openComptabiliteHomePage();
                setTimeout(function() { openDepotFactureDetailModal(j.id); }, 200);
            }
        });
    });
}
if (typeof window !== 'undefined') window.comptaGlobalSearchAppend = comptaGlobalSearchAppend;

