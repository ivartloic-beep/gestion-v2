// ========== VALIDATION COMPTABILITÉ ==========

var comptaValidationNdfTab = 'a_valider';
var comptaValidationFactureTab = 'a_traiter';
var comptaValidationFactureEcheance = 'toutes';
var comptaValidationFacturePayees = 'toutes';
var comptaValidationPayeesPeriodeDebut = '';
var comptaValidationPayeesPeriodeFin = '';

function hasComptaValidationPermission() {
    return typeof hasNdfValidationPermission === 'function' && hasNdfValidationPermission();
}
if (typeof window !== 'undefined') window.hasComptaValidationPermission = hasComptaValidationPermission;

function hasComptaValidationSectionAccess() {
    return hasComptaValidationPermission();
}

function closeComptaValidationSubPages() {
    ['comptaValidationNdfPage', 'comptaValidationFacturesPage', 'comptaValidationDevisPage'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
}

async function openComptaValidationPage() {
    if (!hasComptaValidationSectionAccess()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    try {
        if (typeof loadNotesFrais === 'function') await loadNotesFrais();
        if (typeof loadComptaData === 'function') await loadComptaData();
    } catch (e) {
        console.warn('openComptaValidationPage: chargement données', e);
    }
    closeComptaValidationSubPages();
    var page = document.getElementById('comptaValidationPage');
    if (page) page.classList.add('active');
    renderComptaValidationHub();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
    if (typeof updateFabAppearance === 'function') updateFabAppearance();
}
if (typeof window !== 'undefined') window.openComptaValidationPage = openComptaValidationPage;

function returnToComptaValidationHub() {
    var hub = document.getElementById('comptaValidationPage');
    if (hub) hub.classList.add('active');
    closeComptaValidationSubPages();
    renderComptaValidationHub();
}
if (typeof window !== 'undefined') window.returnToComptaValidationHub = returnToComptaValidationHub;

function closeComptaValidationPage() {
    var page = document.getElementById('comptaValidationPage');
    if (page) page.classList.remove('active');
    closeComptaValidationSubPages();
    if (typeof returnToComptabiliteHome === 'function') returnToComptabiliteHome();
}
if (typeof window !== 'undefined') window.closeComptaValidationPage = closeComptaValidationPage;

async function openComptaValidationNdfPage() {
    if (!canValidateNotesFrais()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    var hub = document.getElementById('comptaValidationPage');
    if (hub) hub.classList.remove('active');
    closeComptaValidationSubPages();
    var page = document.getElementById('comptaValidationNdfPage');
    if (page) page.classList.add('active');
    try {
        if (typeof loadNotesFrais === 'function') await loadNotesFrais();
    } catch (e) { console.warn(e); }
    renderComptaValidationNdfList();
    updateComptaValidationBadges();
}
if (typeof window !== 'undefined') window.openComptaValidationNdfPage = openComptaValidationNdfPage;

async function openComptaValidationFacturesPage() {
    if (!canValidateFactures()) {
        if (typeof showToast === 'function') showToast('Accès non autorisé', 'error');
        return;
    }
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    if (typeof setComptabiliteNavActive === 'function') setComptabiliteNavActive();
    var hub = document.getElementById('comptaValidationPage');
    if (hub) hub.classList.remove('active');
    closeComptaValidationSubPages();
    var page = document.getElementById('comptaValidationFacturesPage');
    if (page) page.classList.add('active');
    try {
        if (typeof loadComptaData === 'function') await loadComptaData();
    } catch (e) { console.warn(e); }
    renderComptaValidationFacturesList();
    updateComptaValidationBadges();
}
if (typeof window !== 'undefined') window.openComptaValidationFacturesPage = openComptaValidationFacturesPage;

function canValidateNotesFrais() {
    return hasComptaValidationPermission();
}

function canValidateFactures() {
    return hasComptaValidationPermission();
}

function canValidateDevis() {
    return hasComptaValidationPermission();
}
if (typeof window !== 'undefined') window.canValidateDevis = canValidateDevis;

function formatComptaValidationMontant(value) {
    var n = parseFloat(value) || 0;
    return (typeof formatMontant === 'function' ? formatMontant(n) : n.toFixed(2)) + ' €';
}

function sumMontantTTC(items) {
    return items.reduce(function(s, j) { return s + (parseFloat(j.montantTTC) || 0); }, 0);
}

function sumNdfMontant(notes) {
    return notes.reduce(function(s, n) {
        return s + (n.lignes || []).reduce(function(ls, l) { return ls + (parseFloat(l.montantTTC) || 0); }, 0);
    }, 0);
}

function parseDateOnly(value) {
    if (!value) return null;
    var d = new Date(value);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function getWeekBounds(refDate) {
    var d = refDate ? new Date(refDate) : new Date();
    d.setHours(0, 0, 0, 0);
    var day = d.getDay();
    var diffToMonday = day === 0 ? -6 : 1 - day;
    var monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
}

function getMonthEnd(refDate) {
    var d = refDate ? new Date(refDate) : new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getFactureEcheanceBucket(justif) {
    var echeance = parseDateOnly(justif && justif.dateEcheance);
    if (!echeance) return 'sans_echeance';
    var week = getWeekBounds(new Date());
    var monthEnd = getMonthEnd(new Date());
    if (echeance <= week.end) return 'cette_semaine';
    if (echeance <= monthEnd) return 'ce_mois';
    return 'plus_tard';
}

function getFacturesATraiterList() {
    if (typeof comptaJustificatifs === 'undefined' || !Array.isArray(comptaJustificatifs) || typeof isDepotFacture !== 'function') return [];
    return comptaJustificatifs.filter(function(j) {
        return isDepotFacture(j) && typeof isDepotFactureATraiter === 'function' && isDepotFactureATraiter(j);
    });
}

function getFacturesATraiterByEcheance() {
    var all = getFacturesATraiterList();
    var buckets = { toutes: all.slice(), cette_semaine: [], ce_mois: [], plus_tard: [], sans_echeance: [] };
    all.forEach(function(j) {
        var b = getFactureEcheanceBucket(j);
        if (buckets[b]) buckets[b].push(j);
    });
    return buckets;
}

function getFactureDatePaiement(justif) {
    if (!justif) return null;
    return parseDateOnly(justif.datePaiement || justif.dateAjout);
}

function getFacturesPayeesList() {
    if (typeof comptaJustificatifs === 'undefined' || !Array.isArray(comptaJustificatifs) || typeof isDepotFacture !== 'function') return [];
    return comptaJustificatifs.filter(function(j) {
        return isDepotFacture(j) && getDepotFactureStatutPaiement(j) === 'payee';
    });
}

function getMonthStart(refDate) {
    var d = refDate ? new Date(refDate) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getYearStart(refDate) {
    var d = refDate ? new Date(refDate) : new Date();
    return new Date(d.getFullYear(), 0, 1);
}

function getYearEnd(refDate) {
    var d = refDate ? new Date(refDate) : new Date();
    return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function filterFacturesPayeesByPeriod(items, filterKey, periodeDebut, periodeFin) {
    var now = new Date();
    if (filterKey === 'toutes') return items.slice();
    if (filterKey === 'ce_mois') {
        var mStart = getMonthStart(now);
        var mEnd = getMonthEnd(now);
        return items.filter(function(j) {
            var d = getFactureDatePaiement(j);
            return d && d >= mStart && d <= mEnd;
        });
    }
    if (filterKey === 'cette_annee') {
        var yStart = getYearStart(now);
        var yEnd = getYearEnd(now);
        return items.filter(function(j) {
            var d = getFactureDatePaiement(j);
            return d && d >= yStart && d <= yEnd;
        });
    }
    if (filterKey === 'periode') {
        var debut = parseDateOnly(periodeDebut);
        var fin = parseDateOnly(periodeFin);
        if (fin) fin.setHours(23, 59, 59, 999);
        if (!debut && !fin) return items.slice();
        return items.filter(function(j) {
            var d = getFactureDatePaiement(j);
            if (!d) return false;
            if (debut && d < debut) return false;
            if (fin && d > fin) return false;
            return true;
        });
    }
    return items.slice();
}

function getFacturesPayeesByPeriod() {
    var all = getFacturesPayeesList();
    return {
        toutes: filterFacturesPayeesByPeriod(all, 'toutes'),
        ce_mois: filterFacturesPayeesByPeriod(all, 'ce_mois'),
        cette_annee: filterFacturesPayeesByPeriod(all, 'cette_annee'),
        periode: filterFacturesPayeesByPeriod(all, 'periode', comptaValidationPayeesPeriodeDebut, comptaValidationPayeesPeriodeFin)
    };
}

function initComptaValidationPayeesPeriodeDefaults() {
    if (comptaValidationPayeesPeriodeDebut && comptaValidationPayeesPeriodeFin) return;
    var now = new Date();
    var debut = getMonthStart(now);
    comptaValidationPayeesPeriodeDebut = debut.toISOString().slice(0, 10);
    comptaValidationPayeesPeriodeFin = now.toISOString().slice(0, 10);
    var elDebut = document.getElementById('comptaValidationPayeesDateDebut');
    var elFin = document.getElementById('comptaValidationPayeesDateFin');
    if (elDebut && !elDebut.value) elDebut.value = comptaValidationPayeesPeriodeDebut;
    if (elFin && !elFin.value) elFin.value = comptaValidationPayeesPeriodeFin;
}

function updatePayeesTabLabels() {
    var buckets = getFacturesPayeesByPeriod();
    var defs = [
        { id: 'comptaValidationPayeesToutes', key: 'toutes', label: 'Toutes' },
        { id: 'comptaValidationPayeesCeMois', key: 'ce_mois', label: 'Ce mois-ci' },
        { id: 'comptaValidationPayeesCetteAnnee', key: 'cette_annee', label: 'Cette année' },
        { id: 'comptaValidationPayeesPeriode', key: 'periode', label: 'Période' }
    ];
    defs.forEach(function(def) {
        var btn = document.getElementById(def.id);
        if (!btn) return;
        var items = buckets[def.key] || [];
        var total = sumMontantTTC(items);
        var count = items.length;
        var meta = count > 0 ? ' <span class="compta-echeance-tab-meta">(' + count + ' · ' + formatComptaValidationMontant(total) + ')</span>' : '';
        btn.innerHTML = def.label + meta;
        if (comptaValidationFacturePayees === def.key) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function switchComptaValidationFacturePayees(filter) {
    var allowed = ['toutes', 'ce_mois', 'cette_annee', 'periode'];
    comptaValidationFacturePayees = allowed.indexOf(filter) >= 0 ? filter : 'toutes';
    if (comptaValidationFacturePayees === 'periode') initComptaValidationPayeesPeriodeDefaults();
    var picker = document.getElementById('comptaValidationPayeesPeriodePicker');
    if (picker) picker.style.display = comptaValidationFacturePayees === 'periode' ? '' : 'none';
    updatePayeesTabLabels();
    renderComptaValidationFacturesList();
}
if (typeof window !== 'undefined') window.switchComptaValidationFacturePayees = switchComptaValidationFacturePayees;

function applyComptaValidationPayeesPeriode() {
    var elDebut = document.getElementById('comptaValidationPayeesDateDebut');
    var elFin = document.getElementById('comptaValidationPayeesDateFin');
    comptaValidationPayeesPeriodeDebut = elDebut ? elDebut.value : '';
    comptaValidationPayeesPeriodeFin = elFin ? elFin.value : '';
    comptaValidationFacturePayees = 'periode';
    updatePayeesTabLabels();
    renderComptaValidationFacturesList();
}
if (typeof window !== 'undefined') window.applyComptaValidationPayeesPeriode = applyComptaValidationPayeesPeriode;

function updateComptaValidationFacturesSubTabsVisibility() {
    var echeanceTabs = document.getElementById('comptaValidationFacturesEcheanceTabs');
    var payeesTabs = document.getElementById('comptaValidationFacturesPayeesTabs');
    var periodePicker = document.getElementById('comptaValidationPayeesPeriodePicker');
    if (echeanceTabs) echeanceTabs.style.display = comptaValidationFactureTab === 'a_traiter' ? '' : 'none';
    if (payeesTabs) payeesTabs.style.display = comptaValidationFactureTab === 'payee' ? '' : 'none';
    if (periodePicker) {
        periodePicker.style.display = (comptaValidationFactureTab === 'payee' && comptaValidationFacturePayees === 'periode') ? '' : 'none';
    }
}

function updateFactureEcheanceTabLabels() {
    var buckets = getFacturesATraiterByEcheance();
    var defs = [
        { id: 'comptaValidationEcheanceToutes', key: 'toutes', label: 'Toutes' },
        { id: 'comptaValidationEcheanceSemaine', key: 'cette_semaine', label: 'À payer cette semaine' },
        { id: 'comptaValidationEcheanceMois', key: 'ce_mois', label: 'À payer ce mois-ci' },
        { id: 'comptaValidationEcheancePlusTard', key: 'plus_tard', label: 'À payer plus tard' }
    ];
    defs.forEach(function(def) {
        var btn = document.getElementById(def.id);
        if (!btn) return;
        var items = buckets[def.key] || [];
        var total = sumMontantTTC(items);
        var count = items.length;
        var meta = count > 0 ? ' <span class="compta-echeance-tab-meta">(' + count + ' · ' + formatComptaValidationMontant(total) + ')</span>' : '';
        btn.innerHTML = def.label + meta;
        if (comptaValidationFactureEcheance === def.key) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function switchComptaValidationNdfTab(tab) {
    comptaValidationNdfTab = tab === 'a_payer' ? 'a_payer' : 'a_valider';
    document.querySelectorAll('#comptaValidationNdfTabs .compta-tab').forEach(function(btn) {
        btn.classList.remove('active');
    });
    var active = comptaValidationNdfTab === 'a_payer'
        ? document.getElementById('comptaValidationNdfTabPayer')
        : document.getElementById('comptaValidationNdfTabValider');
    if (active) active.classList.add('active');
    renderComptaValidationNdfList();
}
if (typeof window !== 'undefined') window.switchComptaValidationNdfTab = switchComptaValidationNdfTab;

function switchComptaValidationFactureTab(tab) {
    if (tab === 'payee' || tab === 'refusee') {
        comptaValidationFactureTab = tab;
    } else {
        comptaValidationFactureTab = 'a_traiter';
    }
    document.querySelectorAll('#comptaValidationFacturesTabs .compta-tab').forEach(function(btn) {
        btn.classList.remove('active');
    });
    var activeId = {
        a_traiter: 'comptaValidationFacturesTabTraiter',
        payee: 'comptaValidationFacturesTabPayee',
        refusee: 'comptaValidationFacturesTabRefusee'
    }[comptaValidationFactureTab];
    var active = document.getElementById(activeId);
    if (active) active.classList.add('active');
    var echeanceTabs = document.getElementById('comptaValidationFacturesEcheanceTabs');
    var payeesTabs = document.getElementById('comptaValidationFacturesPayeesTabs');
    if (echeanceTabs) echeanceTabs.style.display = comptaValidationFactureTab === 'a_traiter' ? '' : 'none';
    if (payeesTabs) payeesTabs.style.display = comptaValidationFactureTab === 'payee' ? '' : 'none';
    if (comptaValidationFactureTab === 'a_traiter') updateFactureEcheanceTabLabels();
    if (comptaValidationFactureTab === 'payee') {
        if (comptaValidationFacturePayees === 'periode') initComptaValidationPayeesPeriodeDefaults();
        updatePayeesTabLabels();
    } else {
        var periodePicker = document.getElementById('comptaValidationPayeesPeriodePicker');
        if (periodePicker) periodePicker.style.display = 'none';
    }
    updateComptaValidationFacturesSubTabsVisibility();
    renderComptaValidationFacturesList();
}
if (typeof window !== 'undefined') window.switchComptaValidationFactureTab = switchComptaValidationFactureTab;

function switchComptaValidationFactureEcheance(filter) {
    var allowed = ['toutes', 'cette_semaine', 'ce_mois', 'plus_tard'];
    comptaValidationFactureEcheance = allowed.indexOf(filter) >= 0 ? filter : 'toutes';
    updateFactureEcheanceTabLabels();
    renderComptaValidationFacturesList();
}
if (typeof window !== 'undefined') window.switchComptaValidationFactureEcheance = switchComptaValidationFactureEcheance;

function countDepotFacturesATraiter() {
    return getFacturesATraiterList().length;
}
if (typeof window !== 'undefined') window.countDepotFacturesATraiter = countDepotFacturesATraiter;

function updateComptaValidationBadges() {
    var ndfValider = 0;
    var ndfPayer = 0;
    if (typeof notesfrais !== 'undefined' && Array.isArray(notesfrais)) {
        ndfValider = notesfrais.filter(function(n) { return n.statut === 'soumise'; }).length;
        ndfPayer = notesfrais.filter(function(n) { return n.statut === 'approuvee'; }).length;
    }
    setComptaTabBadge('comptaValidationNdfBadgeValider', ndfValider);
    setComptaTabBadge('comptaValidationNdfBadgePayer', ndfPayer);
    setComptaTabBadge('comptaValidationFacturesBadgeTraiter', countDepotFacturesATraiter());
    setComptaTabBadge('comptaValidationDevisBadgeTraiter', typeof countDepotDevisATraiter === 'function' ? countDepotDevisATraiter() : 0);
}

function setComptaTabBadge(id, count) {
    var el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
        el.textContent = String(count);
        el.style.display = '';
    } else {
        el.textContent = '';
        el.style.display = 'none';
    }
}

function renderComptaValidationHub() {
    if (typeof renderHomeWelcomeLogo === 'function') {
        renderHomeWelcomeLogo(document.getElementById('comptaValidationHubLogo'), '✅');
    }
    var tileNdf = document.getElementById('comptaValidationTileNdf');
    var tileFact = document.getElementById('comptaValidationTileFactures');
    var tileDevis = document.getElementById('comptaValidationTileDevis');
    if (tileNdf) tileNdf.style.display = canValidateNotesFrais() ? '' : 'none';
    if (tileFact) tileFact.style.display = canValidateFactures() ? '' : 'none';
    if (tileDevis) tileDevis.style.display = (typeof canValidateDevis === 'function' && canValidateDevis()) ? '' : 'none';

    var ndfCount = 0;
    var ndfTotal = 0;
    if (canValidateNotesFrais() && typeof notesfrais !== 'undefined') {
        var ndfItems = notesfrais.filter(function(n) { return n.statut === 'soumise' || n.statut === 'approuvee'; });
        ndfCount = ndfItems.length;
        ndfTotal = sumNdfMontant(ndfItems);
    }
    var ndfBadge = document.getElementById('comptaValidationTileNdfBadge');
    var ndfDesc = document.getElementById('comptaValidationTileNdfDesc');
    if (ndfBadge) {
        if (ndfCount > 0) { ndfBadge.textContent = String(ndfCount); ndfBadge.style.display = ''; }
        else { ndfBadge.style.display = 'none'; }
    }
    if (ndfDesc) ndfDesc.textContent = ndfCount > 0 ? formatComptaValidationMontant(ndfTotal) + ' en attente' : 'À valider et à payer';

    var factItems = getFacturesATraiterList();
    var factCount = factItems.length;
    var factTotal = sumMontantTTC(factItems);
    var factBadge = document.getElementById('comptaValidationTileFacturesBadge');
    var factDesc = document.getElementById('comptaValidationTileFacturesDesc');
    if (factBadge) {
        if (factCount > 0) { factBadge.textContent = String(factCount); factBadge.style.display = ''; }
        else { factBadge.style.display = 'none'; }
    }
    if (factDesc) factDesc.textContent = factCount > 0 ? formatComptaValidationMontant(factTotal) + ' à traiter' : 'À traiter, payées, refusées';

    var devisCount = (typeof countDepotDevisATraiter === 'function') ? countDepotDevisATraiter() : 0;
    var devisBadge = document.getElementById('comptaValidationTileDevisBadge');
    var devisDesc = document.getElementById('comptaValidationTileDevisDesc');
    if (devisBadge) {
        if (devisCount > 0) { devisBadge.textContent = String(devisCount); devisBadge.style.display = ''; }
        else { devisBadge.style.display = 'none'; }
    }
    if (devisDesc) devisDesc.textContent = devisCount > 0 ? (devisCount + ' à traiter') : 'À traiter, acceptés, refusés';

    updateComptaValidationBadges();
    if (typeof updateComptaValidationTileVisibility === 'function') updateComptaValidationTileVisibility();
}

function renderComptaValidationSection() {
    renderComptaValidationHub();
    if (document.getElementById('comptaValidationNdfPage') && document.getElementById('comptaValidationNdfPage').classList.contains('active')) {
        renderComptaValidationNdfList();
    }
    if (document.getElementById('comptaValidationFacturesPage') && document.getElementById('comptaValidationFacturesPage').classList.contains('active')) {
        if (comptaValidationFactureTab === 'a_traiter') updateFactureEcheanceTabLabels();
        if (comptaValidationFactureTab === 'payee') updatePayeesTabLabels();
        updateComptaValidationFacturesSubTabsVisibility();
        renderComptaValidationFacturesList();
    }
    if (document.getElementById('comptaValidationDevisPage') && document.getElementById('comptaValidationDevisPage').classList.contains('active')) {
        if (typeof renderComptaValidationDevisList === 'function') renderComptaValidationDevisList();
    }
    updateComptaValidationBadges();
    if (typeof updateComptaValidationTileVisibility === 'function') updateComptaValidationTileVisibility();
}

function getComptaValidationNdfEmptyMessage() {
    return comptaValidationNdfTab === 'a_payer'
        ? 'Aucune note de frais en attente de remboursement'
        : 'Aucune note de frais en attente de validation';
}

function renderComptaValidationNdfList() {
    var list = document.getElementById('comptaValidationNdfList');
    var empty = document.getElementById('comptaValidationNdfEmpty');
    var totalBar = document.getElementById('comptaValidationNdfTotalBar');
    if (!list || !canValidateNotesFrais()) return;
    var statutFilter = comptaValidationNdfTab === 'a_payer' ? 'approuvee' : 'soumise';
    var items = (typeof notesfrais !== 'undefined' && Array.isArray(notesfrais))
        ? notesfrais.filter(function(n) { return n.statut === statutFilter; })
        : [];
    items.sort(function(a, b) {
        return new Date(b.dateFin || b.dateDebut || b.createdAt || 0) - new Date(a.dateFin || a.dateDebut || a.createdAt || 0);
    });
    var total = sumNdfMontant(items);
    if (totalBar) {
        totalBar.innerHTML = items.length
            ? '<strong>' + items.length + '</strong> note' + (items.length > 1 ? 's' : '') + ' · Total : <strong>' + formatComptaValidationMontant(total) + '</strong>'
            : '';
    }
    if (empty) empty.textContent = getComptaValidationNdfEmptyMessage();
    if (!items.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = items.map(function(n) {
        var noteTotal = (n.lignes || []).reduce(function(s, l) { return s + (parseFloat(l.montantTTC) || 0); }, 0);
        var totalFmt = typeof formatMontant === 'function' ? formatMontant(noteTotal) : noteTotal.toFixed(2);
        var assoc = typeof getNdfAssociationLabel === 'function' ? getNdfAssociationLabel(n) : '';
        var dates = (typeof formatDate === 'function' ? formatDate(n.dateDebut) : (n.dateDebut || '')) +
            ' → ' + (typeof formatDate === 'function' ? formatDate(n.dateFin) : (n.dateFin || ''));
        var actions = '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();downloadNdfPackage(\'' + n.id + '\')" title="Télécharger PDF + pièces jointes">⬇️</button>';
        if (statutFilter === 'soumise') {
            actions += '<button type="button" class="btn" onclick="event.stopPropagation();approuveNdf(\'' + n.id + '\')">Approuver</button>';
            actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();openRejetNdfModal(\'' + n.id + '\')">Rejeter</button>';
        } else {
            actions += '<button type="button" class="btn" onclick="event.stopPropagation();marquerRembourse(\'' + n.id + '\')">Remboursée</button>';
        }
        actions += '<button type="button" class="btn btn-secondary" style="color:var(--mn-red);" onclick="event.stopPropagation();deleteNdf(\'' + n.id + '\')" title="Supprimer">🗑️</button>';
        return '<div class="compta-validation-card ndf-card compta-validation-card-clickable" data-id="' + n.id + '" onclick="openNdfDetailModal(\'' + n.id + '\', \'validation\')">' +
            '<div class="compta-validation-card-main">' +
            '<div class="compta-validation-card-title">' + escapeHtml(n.titre || 'Sans titre') + '</div>' +
            '<div class="compta-validation-card-meta">Par ' + escapeHtml(n.utilisateurNom || '') +
            ' · ' + escapeHtml(dates) + ' · ' + escapeHtml(assoc) + '</div>' +
            '<div class="compta-validation-card-total">' + totalFmt + ' €</div>' +
            '</div>' +
            '<div class="compta-validation-card-actions" onclick="event.stopPropagation()">' + actions + '</div></div>';
    }).join('');
    updateComptaValidationBadges();
}

function getComptaValidationFactureEmptyMessage() {
    if (comptaValidationFactureTab === 'payee') {
        var payLabels = {
            toutes: 'Aucune facture payée',
            ce_mois: 'Aucune facture payée ce mois-ci',
            cette_annee: 'Aucune facture payée cette année',
            periode: 'Aucune facture payée sur cette période'
        };
        return payLabels[comptaValidationFacturePayees] || payLabels.toutes;
    }
    if (comptaValidationFactureTab === 'refusee') return 'Aucune facture refusée';
    var labels = {
        toutes: 'Aucune facture à traiter',
        cette_semaine: 'Aucune facture à payer cette semaine',
        ce_mois: 'Aucune facture à payer ce mois-ci',
        plus_tard: 'Aucune facture à payer plus tard'
    };
    return labels[comptaValidationFactureEcheance] || labels.toutes;
}

function filterComptaValidationFactures() {
    if (typeof comptaJustificatifs === 'undefined' || !Array.isArray(comptaJustificatifs) || typeof isDepotFacture !== 'function') return [];
    if (comptaValidationFactureTab === 'payee') {
        var buckets = getFacturesPayeesByPeriod();
        if (comptaValidationFacturePayees === 'toutes') return buckets.toutes;
        return buckets[comptaValidationFacturePayees] || buckets.toutes;
    }
    if (comptaValidationFactureTab === 'refusee') {
        return comptaJustificatifs.filter(function(j) { return isDepotFacture(j) && getDepotFactureStatutPaiement(j) === 'refusee'; });
    }
    var buckets = getFacturesATraiterByEcheance();
    if (comptaValidationFactureEcheance === 'toutes') {
        return buckets.toutes;
    }
    return buckets[comptaValidationFactureEcheance] || [];
}

function sortComptaValidationFactures(items) {
    return items.slice().sort(function(a, b) {
        if (comptaValidationFactureTab === 'payee') {
            return new Date(b.datePaiement || b.dateAjout || 0) - new Date(a.datePaiement || a.dateAjout || 0);
        }
        if (comptaValidationFactureTab === 'refusee') {
            return new Date(b.dateRefus || b.dateAjout || 0) - new Date(a.dateRefus || a.dateAjout || 0);
        }
        var da = a.dateEcheance ? new Date(a.dateEcheance) : new Date(a.dateAjout || 0);
        var db = b.dateEcheance ? new Date(b.dateEcheance) : new Date(b.dateAjout || 0);
        return da - db;
    });
}

function renderComptaValidationFacturesList() {
    var list = document.getElementById('comptaValidationFacturesList');
    var empty = document.getElementById('comptaValidationFacturesEmpty');
    var totalBar = document.getElementById('comptaValidationFacturesTotalBar');
    var echeanceTabs = document.getElementById('comptaValidationFacturesEcheanceTabs');
    var payeesTabs = document.getElementById('comptaValidationFacturesPayeesTabs');
    if (!list || !canValidateFactures()) return;
    updateComptaValidationFacturesSubTabsVisibility();
    if (comptaValidationFactureTab === 'a_traiter') updateFactureEcheanceTabLabels();
    if (comptaValidationFactureTab === 'payee') updatePayeesTabLabels();

    var items = sortComptaValidationFactures(filterComptaValidationFactures());
    var total = sumMontantTTC(items);
    if (totalBar) {
        totalBar.innerHTML = items.length
            ? '<strong>' + items.length + '</strong> facture' + (items.length > 1 ? 's' : '') + ' · Total : <strong>' + formatComptaValidationMontant(total) + '</strong>'
            : '';
    }
    if (empty) empty.textContent = getComptaValidationFactureEmptyMessage();
    if (!items.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        updateComptaValidationBadges();
        return;
    }
    if (empty) empty.style.display = 'none';
    var isTraiter = comptaValidationFactureTab === 'a_traiter';
    list.innerHTML = items.map(function(j) {
        var title = j.libelle || j.fournisseur || j.nomFichier || 'Facture';
        var dateDepot = j.dateAjout ? new Date(j.dateAjout).toLocaleDateString('fr-FR') : '—';
        var montant = j.montantTTC ? formatComptaValidationMontant(j.montantTTC) : '';
        var deposant = typeof getJustificatifDeposantName === 'function' ? getJustificatifDeposantName(j) : '';
        var meta = ['Déposée le ' + dateDepot, 'Par ' + escapeHtml(deposant)];
        if (j.fournisseur) meta.push(escapeHtml(j.fournisseur));
        if (j.numeroFacture) meta.push('N° ' + escapeHtml(j.numeroFacture));
        if (montant) meta.push(montant);
        if (comptaValidationFactureTab === 'payee' && j.datePaiement) {
            meta.push('Payée le ' + new Date(j.datePaiement).toLocaleDateString('fr-FR'));
        }
        if (comptaValidationFactureTab === 'refusee' && (j.motifRefus || j.motifPaiement)) {
            meta.push('<span style="color:var(--mn-red);">' + escapeHtml(j.motifRefus || j.motifPaiement) + '</span>');
        }
        if (isTraiter) {
            var echeanceHtml = typeof formatDepotFactureEcheanceLine === 'function' ? formatDepotFactureEcheanceLine(j) : '';
            if (echeanceHtml) meta.push(echeanceHtml);
            else if (!j.dateEcheance) meta.push('Sans date d\'échéance');
        }
        var hasFile = j.type !== 'manuel' && (j.fileUrl || j.file_id || j.fileBase64);
        var actions = '';
        if (hasFile) {
            actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();downloadJustificatifById(\'' + j.id + '\')" title="Télécharger">⬇️</button>';
            actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();openJustificatifPreview(\'' + j.id + '\')" title="Aperçu">👁️</button>';
        }
        actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();openDepotFactureEditModal(\'' + j.id + '\')" title="Modifier">✏️</button>';
        if (isTraiter) {
            actions += '<button type="button" class="btn" onclick="event.stopPropagation();setDepotFactureStatutPaiement(\'' + j.id + '\', \'payee\')">Payée</button>';
            actions += '<button type="button" class="btn btn-secondary" onclick="event.stopPropagation();setDepotFactureStatutPaiement(\'' + j.id + '\', \'refusee\')">Refuser</button>';
        }
        actions += '<button type="button" class="btn btn-secondary" style="color:var(--mn-red);" onclick="event.stopPropagation();deleteDepotFacture(\'' + j.id + '\')" title="Supprimer">🗑️</button>';
        return '<div class="compta-validation-card depot-justif-card compta-validation-card-clickable" onclick="openDepotFactureDetailModal(\'' + j.id + '\')">' +
            '<div class="depot-justif-card-icon">🧾</div>' +
            '<div class="compta-validation-card-main depot-justif-card-body">' +
            '<div class="compta-validation-card-title">' + escapeHtml(title) + '</div>' +
            '<div class="compta-validation-card-meta">' + meta.join(' · ') + '</div>' +
            '</div>' +
            '<div class="compta-validation-card-actions depot-justif-card-actions" onclick="event.stopPropagation()">' + actions + '</div></div>';
    }).join('');
    updateComptaValidationBadges();
}

async function setDepotFactureStatutPaiement(justifId, statut) {
    if (!canValidateFactures()) return;
    var justif = (typeof comptaJustificatifs !== 'undefined' ? comptaJustificatifs : []).find(function(j) { return j.id === justifId; });
    if (!justif || !isDepotFacture(justif)) return;
    var motif = '';
    if (statut === 'refusee') {
        motif = prompt('Motif du refus (optionnel) :', '') || '';
    } else if (statut === 'payee') {
        if (!confirm('Marquer cette facture comme payée ?')) return;
    }
    justif.statutPaiement = statut;
    if (statut === 'refusee') {
        justif.motifRefus = motif.trim() || 'Refusée par la comptabilité';
        justif.dateRefus = new Date().toISOString();
        delete justif.datePaiement;
    } else if (statut === 'payee') {
        justif.datePaiement = new Date().toISOString();
        delete justif.motifRefus;
        delete justif.dateRefus;
    } else {
        delete justif.motifRefus;
        delete justif.datePaiement;
        delete justif.dateRefus;
    }
    if (typeof saveComptaData === 'function') await saveComptaData();
    if (typeof renderDepotJustificatifsList === 'function') renderDepotJustificatifsList();
    renderComptaValidationSection();
    if (typeof updateComptabiliteHomeTiles === 'function') updateComptabiliteHomeTiles();
    if (typeof closeDepotFactureDetailModal === 'function') closeDepotFactureDetailModal();
    if (justif.deposeParUserId && typeof notifyUserAssigned === 'function') {
        var labels = { payee: 'payée', refusee: 'refusée' };
        var label = labels[statut] || statut;
        notifyUserAssigned(justif.deposeParUserId, 'Facture ' + label,
            'Votre facture « ' + (justif.libelle || justif.nomFichier || 'Sans titre') + ' » a été marquée comme ' + label + '.',
            'info');
    }
    var toasts = { payee: 'Facture marquée comme payée', refusee: 'Facture refusée' };
    if (typeof showToast === 'function') showToast(toasts[statut] || 'Facture mise à jour', 'success');
}

if (typeof window !== 'undefined') window.setDepotFactureStatutPaiement = setDepotFactureStatutPaiement;
