// ========== PAGE D'ACCUEIL ÉVÉNEMENTIEL ==========

function evenementielGlobalSearchAppend(query, results, pushResult) {
    if (!Array.isArray(window.projects)) return;
    var q = (query || '').toLowerCase();
    window.projects.forEach(function(p) {
        var hay = [p.name, p.lieu, p.location, p.city, p.description, p.venue].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        var isSpectacle = !!p.parentId || p.type === 'spectacle';
        var icon = isSpectacle ? '🎪' : '🎭';
        var label = isSpectacle ? 'Spectacle' : 'Tournée';
        var lieu = p.lieu || p.location || p.city || '';
        pushResult('evt_' + p.id, {
            type: label.toLowerCase(),
            icon: icon,
            title: p.name || 'Sans nom',
            subtitle: 'Événementiel · ' + label + (lieu ? ' · ' + lieu : ''),
            action: function() {
                if (typeof closeAllPages === 'function') closeAllPages();
                if (isSpectacle && typeof viewSpectacle === 'function') viewSpectacle(p.id);
                else if (typeof viewTournee === 'function') viewTournee(p.id);
                else if (typeof openEvenementielHomePage === 'function') openEvenementielHomePage();
            }
        });
        (p.tasks || []).forEach(function(t) {
            if ((t.title || '').toLowerCase().indexOf(q) === -1) return;
            pushResult('evt_task_' + (t.id || t.title) + '_' + p.id, {
                type: 'tâche',
                icon: '✅',
                title: t.title,
                subtitle: 'Événementiel · ' + label + ' · ' + (p.name || ''),
                action: function() {
                    if (typeof closeAllPages === 'function') closeAllPages();
                    if (isSpectacle && typeof viewSpectacle === 'function') viewSpectacle(p.id);
                    else if (typeof viewTournee === 'function') viewTournee(p.id);
                }
            });
        });
    });
}
if (typeof window !== 'undefined') window.evenementielGlobalSearchAppend = evenementielGlobalSearchAppend;

function updateEvenementielBranding() {
    if (typeof renderHomeWelcomeLogo === 'function') {
        renderHomeWelcomeLogo(document.getElementById('evenementielHomeLogo'), '🎭');
    }
}

function openEvenementielHomePage() {
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    var nav = document.getElementById('navEvenementielItem');
    if (nav) nav.classList.add('active');
    var page = document.getElementById('evenementielHomePage');
    if (page) page.classList.add('active');
    if (typeof loadCatalogueData === 'function') {
        loadCatalogueData().then(function() { updateEvenementielHomeTiles(); });
    } else {
        updateEvenementielHomeTiles();
    }
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
    if (typeof updateFabAppearance === 'function') updateFabAppearance();
}

function closeEvenementielHomePage() {
    var page = document.getElementById('evenementielHomePage');
    if (page) page.classList.remove('active');
    if (typeof navigateTo === 'function') navigateTo('home');
}

function returnToEvenementielHome() {
    if (typeof closeAllPages === 'function') closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    var nav = document.getElementById('navEvenementielItem');
    if (nav) nav.classList.add('active');
    var page = document.getElementById('evenementielHomePage');
    if (page) page.classList.add('active');
    updateEvenementielHomeTiles();
    if (typeof updateFabAppearance === 'function') updateFabAppearance();
}

function updateEvenementielHomeTiles() {
    var tourTile = document.getElementById('evenementielTileTournees');
    if (tourTile && window.hasPermission) {
        var canTournees = window.hasPermission('projets') ||
            window.hasPermission('projets_assignes') ||
            (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
        tourTile.style.display = canTournees ? '' : 'none';
    }
    document.querySelectorAll('#evenementielHomePage .home-tile[data-permission]').forEach(function(tile) {
        var perm = tile.dataset.permission;
        if (window.hasPermission) {
            tile.style.display = window.hasPermission(perm) ? '' : 'none';
        }
    });
    updateEvenementielHomeStats();
    updateEvenementielBranding();
}

function updateEvenementielHomeStats() {
    var el = document.getElementById('evenementielHomeStats');
    if (!el) return;
    var html = '';
    var tourCount = 0;
    if (typeof projects !== 'undefined' && Array.isArray(projects)) {
        var list = projects.filter(function(p) {
            return (p.type === 'tournee' || !p.parentId) && (p.lifecycle || '') !== 'archived';
        });
        if (typeof filterProjectsByMembership === 'function') list = filterProjectsByMembership(list);
        tourCount = list.length;
    }
    var catCount = (typeof catalogueData !== 'undefined' && Array.isArray(catalogueData)) ? catalogueData.length : 0;
    if (document.getElementById('evenementielTileTournees') && document.getElementById('evenementielTileTournees').style.display !== 'none') {
        html += '<div class="home-indicator"><span class="home-indicator-value">' + tourCount + '</span><span class="home-indicator-label">Tournées / spectacles</span></div>';
    }
    if (document.getElementById('evenementielTileCatalogue') && document.getElementById('evenementielTileCatalogue').style.display !== 'none' && catCount) {
        html += '<div class="home-indicator" onclick="openCataloguePage()"><span class="home-indicator-value">' + catCount + '</span><span class="home-indicator-label">Fiches catalogue</span></div>';
    }
    el.innerHTML = html;
    el.style.display = html ? 'flex' : 'none';
}

function updateEvenementielNavVisibility() {
    updateEvenementielHomeTiles();
    var nav = document.getElementById('navEvenementielItem');
    var anyVisible = false;
    document.querySelectorAll('#evenementielHomePage .home-tile').forEach(function(tile) {
        if (tile.style.display !== 'none') anyVisible = true;
    });
    if (nav) nav.style.display = anyVisible ? '' : 'none';
}

function setEvenementielNavActive() {
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    var nav = document.getElementById('navEvenementielItem');
    if (nav) nav.classList.add('active');
}
