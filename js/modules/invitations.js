// ============================================
// MODULE GESTION DES INVITATIONS
// ============================================

let currentSpectacleInvitations = null;
let currentInvitations = [];
let _invApiLoading = false;

function _invEscapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================
// API — Invitations (BDD)
// ============================

async function loadInvitationsFromApi(opts = {}) {
    if (!currentSpectacleInvitations?.id) return;
    if (typeof apiCall !== 'function') {
        console.error('apiCall() introuvable — impossible de charger les invitations depuis l’API');
        return;
    }
    const spectacleId = String(currentSpectacleInvitations.id);
    const q = (opts.q ?? '').toString().trim();

    _invApiLoading = true;
    try {
        const endpoint = q
            ? `invitations.php?spectacle_id=${encodeURIComponent(spectacleId)}&q=${encodeURIComponent(q)}`
            : `invitations.php?spectacle_id=${encodeURIComponent(spectacleId)}`;
        const data = await apiCall(endpoint, 'GET');
        currentInvitations = Array.isArray(data.invitations) ? data.invitations : [];
    } catch (e) {
        console.error('Erreur chargement invitations API:', e);
        alert(`Erreur chargement invitations: ${String(e.message || e)}`);
        currentInvitations = [];
    } finally {
        _invApiLoading = false;
    }

    // Refresh list only (if page is still visible)
    try {
        const listEl = document.getElementById('invitationsList');
        if (listEl) listEl.innerHTML = renderInvitationsList(currentInvitations);
        // Update the counter if present
        const counter = document.getElementById('invitationCountValue');
        if (counter) counter.textContent = String(currentInvitations.length);
    } catch (_) {}
}

// Fonction de test pour forcer l'affichage
function testInvitationsPage() {
    const page = document.getElementById('invitationsPage');
    if (!page) {
        console.error('Page non trouvée');
        return;
    }
    
    // Forcer un style très visible
    page.style.cssText = `
        display: block !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: red !important;
        z-index: 999999 !important;
        border: 5px solid blue !important;
    `;
    
    page.innerHTML = '<div style="padding: 50px; color: white; font-size: 30px;">PAGE INVITATIONS - TEST VISUEL</div>';
    
    console.log('Test appliqué - la page devrait être visible avec fond rouge');
}

// Fonction de test pour créer et afficher l'élément
function createAndTestInvitationsPage() {
    console.log('Test de création dynamique de la page invitations');
    
    // Supprimer l'ancien élément s'il existe
    const oldPage = document.getElementById('invitationsPage');
    if (oldPage) {
        oldPage.remove();
        console.log('Ancien élément supprimé');
    }
    
    // Créer un nouvel élément
    const newPage = document.createElement('div');
    newPage.id = 'invitationsPage';
    newPage.className = 'tournee-page active';
    newPage.style.cssText = `
        display: block !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: red !important;
        z-index: 999999 !important;
        border: 5px solid blue !important;
    `;
    
    newPage.innerHTML = '<div style="padding: 50px; color: white; font-size: 30px;">PAGE INVITATIONS - CRÉÉE DYNAMIQUEMENT</div>';
    
    // Ajouter au body
    document.body.appendChild(newPage);
    
    console.log('Nouvel élément créé et ajouté au body');
    console.log('Élément dans le DOM:', document.getElementById('invitationsPage'));
    console.log('Élément est dans le body:', document.body.contains(document.getElementById('invitationsPage')));
}

// Exporter la fonction de test
if (typeof window !== 'undefined') {
    window.createAndTestInvitationsPage = createAndTestInvitationsPage;
}

// Ouvre la page de gestion des invitations pour un spectacle
function openInvitationsPage(spectacleId) {
    const page = document.getElementById('invitationsPage');
    if (!page) {
        console.error("L'élément #invitationsPage n'existe pas dans le DOM.");
        return;
    }
    
    const spectacle = window.projects.find(p => p.id === spectacleId);
    if (!spectacle) {
        console.log('Spectacle non trouvé:', spectacleId);
        return;
    }
    
    currentSpectacleInvitations = spectacle;

    if (typeof syncBilletterieSpectacleFromProject === 'function') {
        syncBilletterieSpectacleFromProject(spectacle);
    }
    
    // Les invitations sont désormais chargées depuis l'API (BDD)
    currentInvitations = [];
    
    // Masquer toutes les pages et afficher la page invitations
    closeAllPages();
    
    if (page) {
        // Réinitialiser complètement les styles et activer la page.
        // Le layout (position/left/z-index) est géré par le CSS pour ne pas masquer la sidebar.
        page.removeAttribute('style');
        page.className = 'tournee-page';
        page.classList.add('active');
        
        renderInvitationsPage();
        loadInvitationsFromApi();
    }
}

// Affiche le contenu de la page invitations
function renderInvitationsPage() {
    console.log('renderInvitationsPage appelé');
    if (!currentSpectacleInvitations) {
        console.log('currentSpectacleInvitations est null dans renderInvitationsPage');
        return;
    }
    
    console.log('currentSpectacleInvitations dans renderInvitationsPage:', currentSpectacleInvitations);
    const page = document.getElementById('invitationsPage');
    if (!page) {
        console.log('Page invitations non trouvée dans renderInvitationsPage');
        return;
    }
    
    console.log('Génération du HTML pour la page invitations');
    const totalInvitations = currentInvitations.length;
    
    page.innerHTML = `
        <div class="container">
            <div class="page-header">
                <button class="btn btn-secondary" onclick="closeInvitationsPage()" style="margin-bottom: 1rem;">← Retour au spectacle</button>
                <h2>🎫 Invitations - ${currentSpectacleInvitations.name || 'Spectacle'}</h2>
                <p style="color: #636e72; margin-top: 0.5rem;">Gérez les invitations pour ce spectacle</p>
                <p style="color: #94a3b8; font-size: 0.82rem; margin-top: 0.35rem;">Export CSV : fichier pour import dans Billetweb (liste d’invités / codes).</p>
            </div>
            
            <div style="margin-top: 2rem;">
                <!-- Actions principales -->
                <div style="display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap;">
                    <button class="btn" onclick="openCreateInvitationsModal()" style="background: linear-gradient(90deg, #667eea, #764ba2);">
                        ➕ Créer des invitations
                    </button>
                    <button class="btn btn-secondary" onclick="exportAllInvitationsPDF()">
                        📄 Exporter toutes les invitations (PDF)
                    </button>
                    <button class="btn btn-secondary" onclick="exportInvitationsCsvBilletweb()" title="UTF-8, séparateur ; — colonnes compatibles import liste d’invités Billetweb">
                        📥 Export CSV (Billetweb)
                    </button>
                    <button class="btn btn-secondary" onclick="openInvitationTicketTemplateModal()">
                        🎟️ Personnaliser le billet (impression / PDF)
                    </button>
                </div>
                
                <!-- Statistiques -->
                <div style="background: white; padding: 1.5rem; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); margin-bottom: 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h3 style="margin: 0; color: var(--primary);" id="invitationCountValue">${totalInvitations}</h3>
                            <p style="margin: 0; color: #636e72; font-size: 0.9rem;">invitations créées</p>
                        </div>
                        <div style="display: flex; gap: 1rem;">
                            <input type="text" id="searchInvitations" placeholder="Rechercher (nom, prénom, email, note...)" 
                                   style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 8px; min-width: 250px;"
                                   onkeyup="filterInvitations()">
                            <select id="sortInvitations" onchange="filterInvitations()" 
                                    style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 8px;">
                                <option value="date-desc">Plus récentes</option>
                                <option value="date-asc">Plus anciennes</option>
                                <option value="name-asc">Nom A-Z</option>
                                <option value="name-desc">Nom Z-A</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Liste des invitations -->
                <div id="invitationsList" class="invitations-list">
                    ${renderInvitationsList(currentInvitations)}
                </div>
            </div>
        </div>
    `;
}

// Affiche la liste des invitations
function renderInvitationsList(invitations) {
    if (invitations.length === 0) {
        return `
            <div style="text-align: center; padding: 3rem; background: white; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🎫</div>
                <h3 style="color: var(--primary); margin-bottom: 0.5rem;">Aucune invitation</h3>
                <p style="color: #636e72;">Commencez par créer des invitations pour ce spectacle</p>
                <button class="btn" onclick="openCreateInvitationsModal()" style="margin-top: 1rem;">➕ Créer des invitations</button>
            </div>
        `;
    }
    
    return invitations.map((invitation, index) => `
        <div class="invitation-card" data-index="${index}">
            <div class="invitation-header">
                <div class="invitation-number">Invitation #${index + 1}</div>
                <div class="invitation-actions">
                    <button class="btn btn-sm btn-secondary" onclick="deleteInvitation(${index})">🗑️</button>
                    <button class="btn btn-sm" onclick="generateSingleInvitationPDF(${index})">📄 PDF</button>
                </div>
            </div>
            <div class="invitation-content">
                <div class="invitation-info">
                    ${invitation.code ? `<div><strong>Code:</strong> <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">${invitation.code}</span></div>` : ''}
                    ${invitation.nom ? `<div><strong>Nom:</strong> ${invitation.nom}</div>` : ''}
                    ${invitation.prenom ? `<div><strong>Prénom:</strong> ${invitation.prenom}</div>` : ''}
                    ${invitation.email ? `<div><strong>Email:</strong> ${invitation.email}</div>` : ''}
                    ${invitation.commentaire ? `<div><strong>Note:</strong> ${invitation.commentaire}</div>` : ''}
                    ${!invitation.nom && !invitation.prenom && !invitation.email && !invitation.commentaire ? '<div style="color: #999; font-style: italic;">Aucune information renseignée</div>' : ''}
                </div>
                <div class="invitation-date">
                    Créée le ${new Date(invitation.created_at || invitation.createdAt || Date.now()).toLocaleDateString('fr-FR')}
                </div>
            </div>
        </div>
    `).join('');
}

// Filtre les invitations
function filterInvitations() {
    const searchTerm = document.getElementById('searchInvitations').value.toLowerCase();
    const sortBy = document.getElementById('sortInvitations').value;
    
    let filtered = [...currentInvitations];
    
    // Filtrage côté serveur (nom/prénom/code), avec fallback client si besoin
    if (searchTerm) {
        // debounce rudimentaire
        if (filterInvitations._t) clearTimeout(filterInvitations._t);
        filterInvitations._t = setTimeout(() => loadInvitationsFromApi({ q: searchTerm }), 200);
    }
    
    // Tri
    switch(sortBy) {
        case 'date-desc':
            filtered.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
            break;
        case 'date-asc':
            filtered.sort((a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0));
            break;
        case 'name-asc':
            filtered.sort((a, b) => `${a.nom || ''} ${a.prenom || ''}`.localeCompare(`${b.nom || ''} ${b.prenom || ''}`));
            break;
        case 'name-desc':
            filtered.sort((a, b) => `${b.nom || ''} ${b.prenom || ''}`.localeCompare(`${a.nom || ''} ${a.prenom || ''}`));
            break;
    }
    
    const listEl = document.getElementById('invitationsList');
    if (listEl) {
        listEl.innerHTML = renderInvitationsList(filtered);
    }
}

// Ouvre la modale de création d'invitations
function openCreateInvitationsModal() {
    const modal = document.getElementById('createInvitationsModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        renderCreateInvitationsModal();
    }
}

// Affiche le contenu de la modale de création
function renderCreateInvitationsModal() {
    const modal = document.getElementById('createInvitationsModal');
    if (!modal) return;
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h2>🎫 Créer des invitations</h2>
                <button class="btn btn-secondary" onclick="closeCreateInvitationsModal()">✕</button>
            </div>
            
            <div class="modal-body">
                <!-- Étape 1: Choix du nombre -->
                <div id="createStep1" class="create-step">
                    <h3>Combien d'invitations souhaitez-vous créer ?</h3>
                    <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin: 1rem 0;">
                        <label for="invitationCountSelect" style="min-width: 170px; font-weight: 600;">Nombre :</label>
                        <select id="invitationCountSelect" style="min-width: 220px; padding: 0.55rem; border: 1px solid #ddd; border-radius: 8px;">
                            ${[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,25,30].map(n => `<option value="${n}">${n}</option>`).join('')}
                            <option value="custom">Personnalisé…</option>
                        </select>
                        <input type="number" id="customCount" min="1" max="999" placeholder="1–999"
                               style="display:none; width: 120px; padding: 0.55rem; border: 1px solid #ddd; border-radius: 8px;">
                        <button class="btn" onclick="confirmInvitationCount()">Continuer</button>
                    </div>
                </div>
                
                <!-- Étape 2: Formulaire -->
                <div id="createStep2" class="create-step" style="display: none;">
                    <h3>Informations des invitations</h3>
                    <div style="margin-bottom: 1rem;">
                        <p style="color: #636e72;">Tous les champs sont optionnels. Les notes sont pour un usage interne.</p>
                    </div>
                    <div id="invitationsFormContainer"></div>
                    
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button class="btn" onclick="createInvitations()">✅ Créer les invitations</button>
                        <button class="btn btn-secondary" onclick="showCreateStep1()">← Précédent</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Afficher/masquer le champ personnalisé selon la sélection
    const select = modal.querySelector('#invitationCountSelect');
    const custom = modal.querySelector('#customCount');
    if (select && custom) {
        const toggleCustom = () => {
            const isCustom = select.value === 'custom';
            custom.style.display = isCustom ? '' : 'none';
            if (isCustom) custom.focus();
        };
        select.addEventListener('change', toggleCustom);
        toggleCustom();
        custom.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmInvitationCount();
        });
    }
}

// Sélectionne le nombre d'invitations
function selectInvitationCount(count) {
    window.selectedInvitationCount = count;
    showCreateStep2();
}

// Sélectionne un nombre personnalisé
function selectCustomInvitationCount() {
    const customCount = parseInt(document.getElementById('customCount').value);
    if (customCount && customCount > 0 && customCount <= 999) {
        window.selectedInvitationCount = customCount;
        showCreateStep2();
    } else {
        alert('Veuillez entrer un nombre valide entre 1 et 999');
    }
}

// Confirme le nombre via le menu déroulant (et optionnellement le champ personnalisé)
function confirmInvitationCount() {
    const select = document.getElementById('invitationCountSelect');
    if (!select) return;
    if (select.value === 'custom') {
        selectCustomInvitationCount();
        return;
    }
    const count = parseInt(select.value, 10);
    if (count && count > 0 && count <= 999) {
        window.selectedInvitationCount = count;
        showCreateStep2();
    } else {
        alert('Veuillez sélectionner un nombre valide');
    }
}

function _invSyncLabelHtml(fieldKey) {
    return `
        <label style="display:flex;align-items:flex-start;gap:0.4rem;margin-top:0.35rem;font-size:0.8rem;font-weight:500;color:#64748b;cursor:pointer;line-height:1.3;">
            <input type="checkbox" id="inv_sync_${fieldKey}" style="margin-top:2px;flex-shrink:0;">
            <span>Identique pour les invitations suivantes</span>
        </label>`;
}

function _invPropagateFieldToFollowing(fieldKey, count) {
    if (count < 2) return;
    const cb = document.getElementById(`inv_sync_${fieldKey}`);
    if (!cb || !cb.checked) return;
    const el1 = document.getElementById(`${fieldKey}_1`);
    if (!el1) return;
    const val = el1.value;
    for (let i = 2; i <= count; i++) {
        const el = document.getElementById(`${fieldKey}_${i}`);
        if (el) el.value = val;
    }
}

function setupInvitationFirstRowSync(count) {
    if (count < 2) return;
    const fields = ['nom', 'prenom', 'email', 'note'];
    fields.forEach((key) => {
        const el1 = document.getElementById(`${key}_1`);
        const cb = document.getElementById(`inv_sync_${key}`);
        if (el1) {
            el1.addEventListener('input', () => _invPropagateFieldToFollowing(key, count));
        }
        if (cb) {
            cb.addEventListener('change', () => {
                if (cb.checked) _invPropagateFieldToFollowing(key, count);
            });
        }
    });
}

// Affiche l'étape 2 du formulaire
function showCreateStep2() {
    document.getElementById('createStep1').style.display = 'none';
    document.getElementById('createStep2').style.display = 'block';
    
    const container = document.getElementById('invitationsFormContainer');
    const count = window.selectedInvitationCount || 1;
    
    let formHTML = '<div style="max-height: 400px; overflow-y: auto;">';
    for (let i = 1; i <= count; i++) {
        const withSync = i === 1 && count > 1;
        formHTML += `
            <div class="invitation-form-item" style="border: 1px solid #e2e8f0; padding: 1rem; margin-bottom: 1rem; border-radius: 8px;">
                <h4 style="margin: 0 0 1rem 0; color: var(--primary);">Invitation #${i}</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <label>Nom:</label>
                        <input type="text" id="nom_${i}" style="width: 100%;" autocomplete="family-name">
                        ${withSync ? _invSyncLabelHtml('nom') : ''}
                    </div>
                    <div>
                        <label>Prénom:</label>
                        <input type="text" id="prenom_${i}" style="width: 100%;" autocomplete="given-name">
                        ${withSync ? _invSyncLabelHtml('prenom') : ''}
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label>Email:</label>
                        <input type="email" id="email_${i}" style="width: 100%;" autocomplete="email">
                        ${withSync ? _invSyncLabelHtml('email') : ''}
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label>Note (usage interne):</label>
                        <textarea id="note_${i}" style="width: 100%; min-height: 60px;" placeholder="Note interne pour retrouver cette invitation..."></textarea>
                        ${withSync ? _invSyncLabelHtml('note') : ''}
                    </div>
                </div>
            </div>
        `;
    }
    formHTML += '</div>';
    
    container.innerHTML = formHTML;
    setupInvitationFirstRowSync(count);
}

// Affiche l'étape 1
function showCreateStep1() {
    document.getElementById('createStep1').style.display = 'block';
    document.getElementById('createStep2').style.display = 'none';
}

// Crée les invitations
function createInvitations() {
    const count = window.selectedInvitationCount || 1;
    const newInvitations = [];
    
    for (let i = 1; i <= count; i++) {
        const invitation = {
            nom: (document.getElementById(`nom_${i}`)?.value || '').trim(),
            prenom: (document.getElementById(`prenom_${i}`)?.value || '').trim(),
            email: (document.getElementById(`email_${i}`)?.value || '').trim(),
            commentaire: (document.getElementById(`note_${i}`)?.value || '').trim()
        };
        // L’API ignore déjà les lignes vides, mais on filtre aussi côté front
        if (invitation.nom || invitation.prenom || invitation.email || invitation.commentaire) {
            newInvitations.push(invitation);
        }
    }

    if (!currentSpectacleInvitations?.id) {
        alert('Spectacle non défini.');
        return;
    }
    if (newInvitations.length === 0) {
        alert('Aucune invitation à créer.');
        return;
    }
    if (typeof apiCall !== 'function') {
        alert('API non disponible (apiCall introuvable).');
        return;
    }

    (async () => {
        try {
            const payload = {
                spectacle_id: String(currentSpectacleInvitations.id),
                invitations: newInvitations
            };
            const data = await apiCall('invitations.php', 'POST', payload);
            const created = Array.isArray(data?.created) ? data.created : [];
            closeCreateInvitationsModal();
            await loadInvitationsFromApi();
            if (created.length === 0) {
                alert('Aucune invitation créée. Le serveur exige un nom et un prénom pour chaque ligne.');
            } else {
                openInvitationsPostCreateModal(created);
            }
        } catch (e) {
            console.error('Erreur création invitations API:', e);
            alert(`Erreur création invitations: ${String(e.message || e)}`);
        }
    })();
}

// Supprime une invitation
function deleteInvitation(index) {
    const inv = currentInvitations[index];
    if (!inv) return;
    if (!confirm(`Supprimer l’invitation ${inv.code ? inv.code + ' ' : ''}?`)) return;
    if (typeof apiCall !== 'function') {
        alert('API non disponible (apiCall introuvable).');
        return;
    }
    (async () => {
        try {
            await apiCall(`invitations.php?id=${encodeURIComponent(String(inv.id))}`, 'DELETE', {});
            await loadInvitationsFromApi();
        } catch (e) {
            console.error('Erreur suppression invitation API:', e);
            alert(`Erreur suppression: ${String(e.message || e)}`);
        }
    })();
}

// Ferme la page invitations
function closeInvitationsPage() {
    console.log('closeInvitationsPage() appelé');
    const page = document.getElementById('invitationsPage');
    if (page) {
        console.log('Suppression de la classe active de la page invitations');
        page.classList.remove('active');
        console.log('Classes après suppression:', page.className);
    }
    if (typeof clearBilletterieSpectacleContext === 'function') {
        clearBilletterieSpectacleContext();
    }

    // Retour à la page du spectacle
    if (currentSpectacleInvitations) {
        // Le module spectacles expose `viewSpectacle(id)` (pas `openSpectacleDetail`).
        if (typeof viewSpectacle === 'function') {
            viewSpectacle(currentSpectacleInvitations.id);
        } else {
            console.error('viewSpectacle() introuvable: impossible de revenir au spectacle');
        }
    }
}

// Ferme la modale de création
function closeCreateInvitationsModal() {
    const modal = document.getElementById('createInvitationsModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

function openInvitationsPostCreateModal(created) {
    const modal = document.getElementById('invitationsPostCreateModal');
    if (!modal) return;
    window._invPostCreateInvitations = created;
    const rows = created.map((inv) => {
        const code = _invEscapeHtml(inv.code || '');
        const nom = _invEscapeHtml(inv.nom || '');
        const prenom = _invEscapeHtml(inv.prenom || '');
        const email = _invEscapeHtml(inv.email || '');
        return `<tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,monospace;">${code}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${prenom} ${nom}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${email}</td>
        </tr>`;
    }).join('');
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 640px;">
            <div class="modal-header">
                <h2>🎫 Invitations créées</h2>
                <button type="button" class="btn btn-secondary" onclick="closeInvitationsPostCreateModal()">✕</button>
            </div>
            <div class="modal-body">
                <p style="color:#636e72;margin-bottom:1rem;">
                    ${created.length} invitation(s) créée(s). Imprimez ou enregistrez au format PDF (via la boîte d’impression du navigateur).
                </p>
                <div style="max-height: 260px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <table style="width:100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead>
                            <tr style="background:#f8fafc;">
                                <th style="text-align:left;padding:8px;">Code</th>
                                <th style="text-align:left;padding:8px;">Invité</th>
                                <th style="text-align:left;padding:8px;">Email</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:1.5rem;align-items:center;">
                    <button type="button" class="btn" onclick="invPostCreateDownloadAllPdf()">📄 Tout en un seul PDF</button>
                    <button type="button" class="btn btn-secondary" onclick="invPostCreateDownloadEachPdf()">📄 Un PDF par invitation</button>
                    <button type="button" class="btn btn-secondary" onclick="closeInvitationsPostCreateModal()">Terminer</button>
                </div>
            </div>
        </div>
    `;
    modal.classList.add('active');
    modal.style.display = 'flex';
}

function closeInvitationsPostCreateModal() {
    const modal = document.getElementById('invitationsPostCreateModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.innerHTML = '';
    }
    window._invPostCreateInvitations = null;
}

function invPostCreateDownloadAllPdf() {
    const list = window._invPostCreateInvitations;
    if (!list || !list.length) return;
    openPrintableInvitationTickets(list);
}

async function invPostCreateDownloadEachPdf() {
    const list = window._invPostCreateInvitations;
    if (!list || !list.length) return;
    if (typeof showToast === 'function') {
        showToast('Ouverture successive des fenêtres d’impression — enregistrez chaque PDF.', 'info');
    }
    for (let i = 0; i < list.length; i++) {
        await openPrintableInvitationTickets([list[i]]);
        if (i < list.length - 1) await new Promise((r) => setTimeout(r, 950));
    }
}

// ----- Export CSV import Billetweb (API : invitations_export_csv.php) -----
function _invDateIsoFromSpectacle(sp) {
    if (!sp || !sp.date) return new Date().toISOString().slice(0, 10);
    const raw = String(sp.date).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
        return d.toISOString().slice(0, 10);
    } catch (e) {
        return new Date().toISOString().slice(0, 10);
    }
}

/**
 * Télécharge le CSV des invitations (UTF-8 BOM, séparateur ;) pour import liste d’invités Billetweb.
 * @param {string} spectacleId
 * @param {{ name?: string, spectacle?: object }} opts
 */
async function downloadInvitationsCsvBilletweb(spectacleId, opts) {
    const sid = String(spectacleId || '').trim();
    if (!sid) {
        alert('Spectacle invalide.');
        return;
    }
    if (typeof authToken === 'undefined' || !authToken) {
        alert('Connexion requise pour exporter.');
        return;
    }
    const apiBase = typeof API_URL !== 'undefined' && API_URL ? API_URL : 'api';
    const tarif = (window.appSettings && window.appSettings.invitationTicketDefaults && window.appSettings.invitationTicketDefaults.badgeText)
        ? String(window.appSettings.invitationTicketDefaults.badgeText).trim()
        : 'INVITATION';
    const sp = opts && opts.spectacle;
    const dateStr = sp ? _invDateIsoFromSpectacle(sp) : new Date().toISOString().slice(0, 10);
    const q = `invitations_export_csv.php?spectacle_id=${encodeURIComponent(sid)}&tarif=${encodeURIComponent(tarif)}&date=${encodeURIComponent(dateStr)}&token=${encodeURIComponent(authToken)}`;
    const url = `${apiBase}/${q}`;

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: 'Bearer ' + authToken,
                'X-Auth-Token': authToken
            }
        });
        if (!res.ok) {
            const t = await res.text();
            let msg = t;
            try {
                const j = JSON.parse(t);
                if (j.error) msg = j.error;
            } catch (e) { /* ignore */ }
            throw new Error(msg || 'Erreur ' + res.status);
        }
        const blob = await res.blob();
        const rawName = (opts && opts.name) ? String(opts.name) : sid;
        const slug = rawName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u00C0-\u024F_-]/g, '').slice(0, 48) || 'spectacle';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `invitations-billetweb-${slug}.csv`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        if (typeof showToast === 'function') showToast('CSV Billetweb téléchargé', 'success');
    } catch (e) {
        console.error('downloadInvitationsCsvBilletweb:', e);
        alert(`Export CSV impossible : ${String(e.message || e)}`);
    }
}

function exportInvitationsCsvBilletweb() {
    if (!currentSpectacleInvitations || !currentSpectacleInvitations.id) {
        alert('Aucun spectacle sélectionné.');
        return;
    }
    downloadInvitationsCsvBilletweb(String(currentSpectacleInvitations.id), {
        name: currentSpectacleInvitations.name,
        spectacle: currentSpectacleInvitations
    });
}

// Exporte toutes les invitations en PDF
function exportAllInvitationsPDF() {
    if (currentInvitations.length === 0) {
        alert('Aucune invitation à exporter');
        return;
    }
    
    const choice = confirm('Voulez-vous ouvrir un document imprimable (A4) avec toutes les invitations ?\n\nOK = Toutes dans un seul document\nANNULER = Une seule invitation (la 1ère)');
    if (choice) {
        openPrintableInvitationTickets(currentInvitations);
    } else {
        openPrintableInvitationTickets([currentInvitations[0]]);
    }
}

// Génère un PDF unique avec toutes les invitations
async function generateSinglePDFWithAllInvitations() {
    // TODO: Implémenter la génération PDF avec Puppeteer
    alert('Génération PDF unique en cours de développement...');
}

// Génère plusieurs PDFs (un par invitation)
async function generateMultiplePDFsForInvitations() {
    // TODO: Implémenter la génération PDF avec Puppeteer
    alert('Génération PDFs multiples en cours de développement...');
}

// Génère le PDF d'une seule invitation
async function generateSingleInvitationPDF(index) {
    const invitation = currentInvitations[index];
    if (!invitation) return;
    openPrintableInvitationTickets([invitation]);
}

// ============================
// Export “billet” (style Billetterie)
// ============================

let _invQriousLoading = null;
function _invEnsureQRious() {
    if (window.QRious) return Promise.resolve(window.QRious);
    if (_invQriousLoading) return _invQriousLoading;
    _invQriousLoading = new Promise(function(resolve, reject) {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = function() { resolve(window.QRious); };
        s.onerror = function() { reject(new Error('QR lib load failed')); };
        document.head.appendChild(s);
    });
    return _invQriousLoading;
}

function _invGetTicketTemplateForSpectacle() {
    const s = currentSpectacleInvitations || {};
    const tpl = s.invitationTicketTemplate || {};
    const d = (window.appSettings && window.appSettings.invitationTicketDefaults) ? window.appSettings.invitationTicketDefaults : {};
    const mergeInput = {
        invitationLayoutUseGlobal: tpl.invitationLayoutUseGlobal,
        layoutMode: tpl.layoutMode === 'custom' ? 'custom' : 'classic',
        customBackground: tpl.customBackground,
        customBackgroundScale: tpl.customBackgroundScale,
        customZones: tpl.customZones
    };
    const eff = (typeof window.invitationTicketMergeEffectiveTemplate === 'function')
        ? window.invitationTicketMergeEffectiveTemplate(mergeInput)
        : mergeInput;
    return {
        logo: tpl.logo || '',
        badgeText: tpl.badgeText || d.badgeText || 'INVITATION',
        labelValidFor: tpl.labelValidFor || d.labelValidFor || 'Invitation valable pour :',
        headerColor1: tpl.headerColor1 || d.headerColor1 || '#1e3c72',
        headerColor2: tpl.headerColor2 || d.headerColor2 || '#2a5298',
        goldColor: tpl.goldColor || d.goldColor || '#d7b14a',
        footerText: (tpl.footerText ?? d.footerText ?? ''),
        showPoster: (tpl.showPoster ?? d.showPoster) !== false,
        showQr: (tpl.showQr ?? d.showQr) !== false,
        posterFit: tpl.posterFit || d.posterFit || 'contain',
        partnerIds: Array.isArray(tpl.partnerIds) ? tpl.partnerIds : [],
        layoutMode: eff.layoutMode === 'custom' ? 'custom' : 'classic',
        customBackground: eff.customBackground || '',
        customBackgroundScale: (function () {
            var x = Number(eff.customBackgroundScale);
            return isFinite(x) && x > 0 ? x : 1;
        })(),
        customZones: Array.isArray(eff.customZones) ? eff.customZones : []
    };
}

function _invGetPosterForSpectacle() {
    try {
        const s = currentSpectacleInvitations;
        const vis = (typeof getVisuelReference === 'function') ? getVisuelReference(s) : null;
        return vis ? (vis.base64 || vis.url || '') : '';
    } catch (e) {
        return '';
    }
}

function _invGetLieuTextForTicket() {
    try {
        const s = currentSpectacleInvitations || {};
        const lid = s?.lieuId || s?.tech?.lieuId;
        const lieu = (typeof getLieuById === 'function' && lid) ? getLieuById(lid) : null;
        if (lieu) {
            const parts = [];
            if (lieu.nom) parts.push(lieu.nom);
            if (lieu.ville) parts.push(lieu.ville);
            if (parts.length) return parts.join(' — ');
        }
    } catch(e) {}
    const s = currentSpectacleInvitations || {};
    const loc = (s.lieu || s.location || '').toString().trim();
    const city = (s.city || '').toString().trim();
    if (loc && city) return loc + ' — ' + city;
    if (loc) return loc;
    return city || '';
}

function _invFormatDateForTicket() {
    const s = currentSpectacleInvitations || {};
    if (typeof formatDate === 'function') return formatDate(s.date);
    return s.date || '';
}

async function openPrintableInvitationTickets(invitations) {
    if (!invitations || invitations.length === 0) return;

    const tpl = _invGetTicketTemplateForSpectacle();
    const posterFit = (tpl.posterFit === 'cover') ? 'cover' : 'contain';
    const s = currentSpectacleInvitations || {};
    const affiche = _invGetPosterForSpectacle();
    const dateTxt = _invFormatDateForTicket();
    const lieuTxt = _invGetLieuTextForTicket();
    const eventName = s.name || s.nom || 'Spectacle';

    // Partners library (logos)
    const partnersLib = (window.appSettings && Array.isArray(window.appSettings.partners)) ? window.appSettings.partners : [];
    const partnerLogos = (tpl.partnerIds || []).map(id => partnersLib.find(p => String(p.id) === String(id))).filter(p => p && p.logo);
    const partnersInnerHtml = partnerLogos.length
        ? partnerLogos.map(p => `<img src="${_invEscapeHtml(p.logo)}" alt="" style="max-height:52px;max-width:150px;object-fit:contain;">`).join('')
        : '';

    let QRiousCtor = null;
    try { QRiousCtor = await _invEnsureQRious(); } catch(e) { QRiousCtor = null; }

    const useCustomLayout = tpl.layoutMode === 'custom'
        && Array.isArray(tpl.customZones)
        && tpl.customZones.length > 0
        && typeof window.invitationTicketRenderCustomTicketInnerHtml === 'function';

    if (useCustomLayout) {
        const dateLine = dateTxt
            ? (dateTxt + (s.time ? ' à ' + String(s.time) : ''))
            : (s.time ? String(s.time) : '');
        const logoFinal = tpl.logo || (window.appSettings?.invitationTicketDefaults?.mainLogo) || (window.appSettings && window.appSettings.logo) || localStorage.getItem('appLogo') || '';

        const pagesHtmlCustom = (await Promise.all(invitations.map(async (inv, idx) => {
            const prenom = (inv.prenom || '').toString().trim();
            const nom = (inv.nom || '').toString().trim();
            const code = (inv.code || '').toString().trim();
            const fullName = (prenom + ' ' + nom).trim() || 'Invité';

            let qrDataUrl = '';
            if (tpl.showQr && QRiousCtor && code) {
                try {
                    const qr = new window.QRious({ value: code, size: 240, level: 'M' });
                    qrDataUrl = qr.toDataURL('image/png');
                } catch (e) {
                    qrDataUrl = '';
                }
            }

            const footerHtml = _invEscapeHtml(String(tpl.footerText || '')).replace(/\n/g, '<br>');
            const ctx = {
                eventName,
                guestFullName: fullName,
                lieuTxt,
                dateLine,
                badgeText: tpl.badgeText || 'INVITATION',
                labelValid: tpl.labelValidFor || 'Invitation valable pour :',
                footerHtml,
                affiche: (tpl.showPoster && affiche) ? affiche : '',
                qrDataUrl,
                code,
                partnersInnerHtml,
                logoFinal
            };

            const inner = window.invitationTicketRenderCustomTicketInnerHtml(tpl, ctx);
            return `<div class="ticket ticket-custom ${idx < invitations.length - 1 ? 'page-break' : ''}">${inner}</div>`;
        }))).join('\n');

        const htmlCustom = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Invitations</title>
  <style>
    @page { size: A4; margin: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    ${typeof window.invitationTicketCustomTicketPrintCss === 'function' ? window.invitationTicketCustomTicketPrintCss() : ''}
  </style>
</head>
<body>
  ${pagesHtmlCustom}
  <script>window.onload = function(){ setTimeout(function(){ try{ window.print(); }catch(e){} }, 250); };</script>
</body>
</html>`;

        const w = window.open('', '_blank');
        if (!w) { alert('Popup bloquée. Autorisez les popups pour exporter.'); return; }
        w.document.open();
        w.document.write(htmlCustom);
        w.document.close();
        return;
    }

    const pagesHtml = (await Promise.all(invitations.map(async (inv, idx) => {
        const prenom = (inv.prenom || '').toString().trim();
        const nom = (inv.nom || '').toString().trim();
        const code = (inv.code || '').toString().trim();
        const fullName = (prenom + ' ' + nom).trim() || 'Invité';

        let qrDataUrl = '';
        if (tpl.showQr && QRiousCtor && code) {
            try {
                const qr = new window.QRious({ value: code, size: 240, level: 'M' });
                qrDataUrl = qr.toDataURL('image/png');
            } catch(e) {
                qrDataUrl = '';
            }
        }

        const footerHtml = _invEscapeHtml(String(tpl.footerText || '')).replace(/\n/g, '<br>');
        const showPoster = !!tpl.showPoster && !!affiche;
        const showQr = !!tpl.showQr;
        const partnersHtml = partnerLogos.length ? `<div class="partners">${partnerLogos.map(p => `<img src="${_invEscapeHtml(p.logo)}" alt="">`).join('')}</div>` : '';
        const logoFinal = tpl.logo || (window.appSettings?.invitationTicketDefaults?.mainLogo) || (window.appSettings && window.appSettings.logo) || localStorage.getItem('appLogo') || '';

        return `
<div class="ticket ${idx < invitations.length - 1 ? 'page-break' : ''}">
  <div class="topbar">
    <div>
      <div class="topbar-title">${_invEscapeHtml(eventName)}</div>
      <div class="topbar-sub">${_invEscapeHtml(lieuTxt)}</div>
    </div>
    <div class="topbar-right">
      ${partnersHtml}
      ${logoFinal ? `<img src="${_invEscapeHtml(logoFinal)}" alt="">` : ''}
    </div>
  </div>
  <div class="goldbar">${_invEscapeHtml(tpl.badgeText || 'INVITATION')}</div>
  <div class="main">
    ${showPoster ? `<div class="poster"><img src="${_invEscapeHtml(affiche)}" alt=""></div>` : ''}
    <div class="right">
      <div class="validfor">${_invEscapeHtml(tpl.labelValidFor || 'Invitation valable pour :')}</div>
      <div class="guest">${_invEscapeHtml(fullName)}</div>
      <div class="eventname">${_invEscapeHtml(eventName)}</div>
      <div class="line">${_invEscapeHtml(lieuTxt)}</div>
      ${dateTxt ? `<div class="line">Date : ${_invEscapeHtml(dateTxt)} ${s.time ? 'à ' + _invEscapeHtml(s.time) : ''}</div>` : ''}
      <div class="right-bottom">
        <div class="notes">${footerHtml}</div>
        ${showQr ? `<div class="qr">
            ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR">` : `<div class="qr-ph">QR</div>`}
            <div class="code">${_invEscapeHtml(code)}</div>
        </div>` : ''}
      </div>
    </div>
  </div>
</div>`;
    }))).join('\n');

    const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Invitations</title>
  <style>
    @page { size: A4; margin: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .ticket{
      width:190mm; height:277mm; margin:0 auto 10mm;
      background:#fff; border-radius:10px; overflow:hidden;
      box-shadow:0 0 10px rgba(0,0,0,0.1);
      display:flex; flex-direction:column;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    }
    .topbar{
      background: linear-gradient(90deg, ${tpl.headerColor1}, ${tpl.headerColor2});
      color:#fff;
      padding:10mm;
      display:flex; align-items:center; justify-content:space-between; gap:10mm;
    }
    .topbar-title{ font-weight:800; letter-spacing:1px; font-size:22px; text-transform:uppercase; }
    .topbar-sub{ margin-top:4px; font-size:12px; color:rgba(255,255,255,0.9); }
    .topbar-right{ display:flex; align-items:center; gap:8px; }
    .topbar-right img{ height:36px; max-width:120px; object-fit:contain; }
    .partners{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .partners img{ height:48px; max-width:140px; object-fit:contain; background:rgba(255,255,255,0.9); padding:3px 8px; border-radius:6px; }
    .goldbar{
      background:${tpl.goldColor};
      color:#fff;
      text-align:center;
      padding:6px 10mm;
      font-weight:800;
      letter-spacing:2px;
      text-transform:uppercase;
    }
    .main{ display:flex; flex:1; min-height:0; }
    .poster{ width:40%; background:transparent; }
    .poster img{ width:100%; height:100%; object-fit:${posterFit}; object-position:center; display:block; background-color:transparent; }
    .right{ width:${tpl.showPoster && affiche ? '60%' : '100%'}; padding:10mm; display:flex; flex-direction:column; gap:6px; }
    .validfor{ font-size:13px; color:#334155; }
    .guest{ font-size:22px; font-weight:800; margin-bottom:2px; }
    .eventname{ font-size:16px; font-weight:700; margin-top:4px; }
    .line{ font-size:13px; color:#0f172a; }
    .right-bottom{ margin-top:auto; display:flex; gap:10mm; align-items:stretch; }
    .notes{
      flex:1;
      font-size:12px; line-height:1.35;
      color:#334155;
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:8px;
      padding:8px;
      white-space:normal;
    }
    .qr{ width:62mm; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; }
    .qr img{ width:52mm; height:52mm; object-fit:contain; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:6px; }
    .qr-ph{ width:52mm; height:52mm; border:1px dashed #94a3b8; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#64748b; }
    .code{ font-weight:800; font-size:12px; letter-spacing:0.5px; }
    .page-break{ page-break-after: always; }
    @media print { body { background: #fff; margin: 0; padding: 0; } .ticket{ box-shadow:none; margin: 0 auto; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
  ${pagesHtml}
  <script>window.onload = function(){ setTimeout(function(){ try{ window.print(); }catch(e){} }, 250); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Popup bloquée. Autorisez les popups pour exporter.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

// Exporter les fonctions globalement
if (typeof window !== 'undefined') {
    window.openInvitationsPage = openInvitationsPage;
    window.openCreateInvitationsModal = openCreateInvitationsModal;
    window.closeCreateInvitationsModal = closeCreateInvitationsModal;
    window.closeInvitationsPage = closeInvitationsPage;
    window.selectInvitationCount = selectInvitationCount;
    window.selectCustomInvitationCount = selectCustomInvitationCount;
    window.confirmInvitationCount = confirmInvitationCount;
    window.showCreateStep2 = showCreateStep2;
    window.showCreateStep1 = showCreateStep1;
    window.createInvitations = createInvitations;
    window.closeInvitationsPostCreateModal = closeInvitationsPostCreateModal;
    window.invPostCreateDownloadAllPdf = invPostCreateDownloadAllPdf;
    window.invPostCreateDownloadEachPdf = invPostCreateDownloadEachPdf;
    window.deleteInvitation = deleteInvitation;
    window.exportAllInvitationsPDF = exportAllInvitationsPDF;
    window.generateSingleInvitationPDF = generateSingleInvitationPDF;
    window.downloadInvitationsCsvBilletweb = downloadInvitationsCsvBilletweb;
    window.exportInvitationsCsvBilletweb = exportInvitationsCsvBilletweb;
}
