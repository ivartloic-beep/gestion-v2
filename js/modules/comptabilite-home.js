// ========== PAGE D'ACCUEIL COMPTABILITÉ ==========

function updateComptabiliteBranding() {
    if (typeof renderHomeWelcomeLogo === 'function') {
        renderHomeWelcomeLogo(document.getElementById('comptaHomeLogo'), '💰');
    }
}

async function openComptabiliteHomePage() {
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    setComptabiliteNavActive();
    var page = document.getElementById('comptaHomePage');
    if (page) page.classList.add('active');
    try {
        if (typeof loadNotesFrais === 'function') await loadNotesFrais();
        if (typeof loadComptaData === 'function') await loadComptaData();
    } catch (e) {
        console.warn('openComptabiliteHomePage: chargement données', e);
    }
    updateComptabiliteHomeTiles();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
    if (typeof updateFabAppearance === 'function') updateFabAppearance();
}
if (typeof window !== 'undefined') window.openComptabiliteHomePage = openComptabiliteHomePage;

function closeComptabiliteHomePage() {
    var page = document.getElementById('comptaHomePage');
    if (page) page.classList.remove('active');
    if (typeof navigateTo === 'function') navigateTo('home');
}

function returnToComptabiliteHome() {
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    setComptabiliteNavActive();
    var page = document.getElementById('comptaHomePage');
    if (page) page.classList.add('active');
    updateComptabiliteHomeTiles();
    if (typeof updateFabAppearance === 'function') updateFabAppearance();
}
if (typeof window !== 'undefined') window.returnToComptabiliteHome = returnToComptabiliteHome;

function setComptabiliteNavActive() {
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    var nav = document.getElementById('navComptaItem');
    if (nav) nav.classList.add('active');
}

function updateComptabiliteHomeTiles() {
    updateComptabiliteHomeStats();
    updateComptabiliteBranding();
    updateComptabiliteNavVisibility();
    updateComptaValidationTileVisibility();
}

function updateComptabiliteHomeStats() {
    var el = document.getElementById('comptaHomeStats');
    if (!el) return;
    var html = '';
    var uid = String((typeof currentUser !== 'undefined' && currentUser && currentUser.id) || '');
    var notesAttente = 0;
    var facturesAttente = 0;
    var validationNdfValider = 0;
    var validationNdfPayer = 0;
    var validationFacturesTraiter = 0;
    if (typeof notesfrais !== 'undefined' && Array.isArray(notesfrais)) {
        notesAttente = notesfrais.filter(function(n) {
            return String(n.userId || '') === uid && n.statut === 'soumise';
        }).length;
        if (typeof canValidateNotesFrais === 'function' && canValidateNotesFrais()) {
            validationNdfValider = notesfrais.filter(function(n) { return n.statut === 'soumise'; }).length;
            validationNdfPayer = notesfrais.filter(function(n) { return n.statut === 'approuvee'; }).length;
        }
    }
    var devisAttente = 0;
    var validationDevisTraiter = 0;
    if (typeof comptaJustificatifs !== 'undefined' && Array.isArray(comptaJustificatifs) && typeof isDepotFacture === 'function') {
        facturesAttente = comptaJustificatifs.filter(function(j) {
            if (!isDepotFacture(j)) return false;
            if (String(j.deposeParUserId || '') !== uid) return false;
            var st = typeof getDepotFactureStatutPaiement === 'function' ? getDepotFactureStatutPaiement(j) : (j.statutPaiement || 'en_attente');
            return st === 'en_attente' || st === 'a_payer';
        }).length;
        if (typeof canValidateFactures === 'function' && canValidateFactures()) {
            validationFacturesTraiter = typeof countDepotFacturesATraiter === 'function'
                ? countDepotFacturesATraiter()
                : comptaJustificatifs.filter(function(j) {
                    return isDepotFacture(j) && (typeof isDepotFactureATraiter === 'function' ? isDepotFactureATraiter(j) : false);
                }).length;
        }
    }
    if (typeof comptaJustificatifs !== 'undefined' && Array.isArray(comptaJustificatifs) && typeof isDepotDevis === 'function') {
        devisAttente = comptaJustificatifs.filter(function(j) {
            return isDepotDevis(j) && String(j.deposeParUserId || '') === uid && (j.statutValidation || 'en_attente') === 'en_attente';
        }).length;
        if (typeof canValidateDevis === 'function' && canValidateDevis()) {
            validationDevisTraiter = typeof countDepotDevisATraiter === 'function' ? countDepotDevisATraiter() : 0;
        }
    }
    if (notesAttente > 0) {
        html += '<div class="home-indicator" onclick="openNotesFraisPage()"><span class="home-indicator-value">' + notesAttente + '</span><span class="home-indicator-label">Notes en validation</span></div>';
    }
    if (facturesAttente > 0) {
        html += '<div class="home-indicator" onclick="openDepotJustificatifsPage()"><span class="home-indicator-value">' + facturesAttente + '</span><span class="home-indicator-label">Factures en cours</span></div>';
    }
    if (devisAttente > 0) {
        html += '<div class="home-indicator" onclick="openDepotDevisPage()"><span class="home-indicator-value">' + devisAttente + '</span><span class="home-indicator-label">Devis en cours</span></div>';
    }
    if (validationNdfValider > 0) {
        html += '<div class="home-indicator" onclick="openComptaValidationPage()"><span class="home-indicator-value">' + validationNdfValider + '</span><span class="home-indicator-label">Notes à valider</span></div>';
    }
    if (validationNdfPayer > 0) {
        html += '<div class="home-indicator" onclick="openComptaValidationPage()"><span class="home-indicator-value">' + validationNdfPayer + '</span><span class="home-indicator-label">Notes à payer</span></div>';
    }
    if (validationFacturesTraiter > 0) {
        html += '<div class="home-indicator" onclick="openComptaValidationPage()"><span class="home-indicator-value">' + validationFacturesTraiter + '</span><span class="home-indicator-label">Factures à traiter</span></div>';
    }
    if (validationDevisTraiter > 0) {
        html += '<div class="home-indicator" onclick="openComptaValidationPage()"><span class="home-indicator-value">' + validationDevisTraiter + '</span><span class="home-indicator-label">Devis à traiter</span></div>';
    }
    el.innerHTML = html;
    el.style.display = html ? 'flex' : 'none';
    updateComptaDepotTilesVisibility();
}

function updateComptabiliteNavVisibility() {
    var nav = document.getElementById('navComptaItem');
    if (nav) nav.style.display = '';
}

function updateComptaDepotTilesVisibility() {
    var canDepot = typeof hasComptaCollectePermission === 'function' && hasComptaCollectePermission();
    var canVal = typeof hasComptaValidationSectionAccess === 'function' && hasComptaValidationSectionAccess();
    ['comptaTileFactures', 'comptaTileDevis', 'comptaTileDocsEmis'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = (canDepot || canVal) ? '' : 'none';
    });
}

function updateComptaValidationTileVisibility() {
    var tile = document.getElementById('comptaTileValidation');
    var badge = document.getElementById('comptaTileValidationBadge');
    if (!tile) return;
    var hasAccess = typeof hasComptaValidationSectionAccess === 'function' && hasComptaValidationSectionAccess();
    tile.style.display = hasAccess ? '' : 'none';
    updateComptaDepotTilesVisibility();
    if (!hasAccess || !badge) return;
    var total = 0;
    if (typeof canValidateNotesFrais === 'function' && canValidateNotesFrais() && typeof notesfrais !== 'undefined') {
        total += notesfrais.filter(function(n) { return n.statut === 'soumise' || n.statut === 'approuvee'; }).length;
    }
    if (typeof canValidateFactures === 'function' && canValidateFactures() && typeof comptaJustificatifs !== 'undefined' && typeof isDepotFacture === 'function') {
        total += typeof countDepotFacturesATraiter === 'function'
            ? countDepotFacturesATraiter()
            : comptaJustificatifs.filter(function(j) {
                return isDepotFacture(j) && (typeof isDepotFactureATraiter === 'function' ? isDepotFactureATraiter(j) : false);
            }).length;
    }
    if (typeof canValidateDevis === 'function' && canValidateDevis() && typeof countDepotDevisATraiter === 'function') {
        total += countDepotDevisATraiter();
    }
    if (total > 0) {
        badge.textContent = String(total);
        badge.style.display = '';
    } else {
        badge.textContent = '';
        badge.style.display = 'none';
    }
}
