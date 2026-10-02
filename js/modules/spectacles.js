// ============================================
// PAGE TECHNIQUE & LOGISTIQUE
// ============================================
try {
    if (typeof window.currentTechSpectacle === 'undefined') {
        window.currentTechSpectacle = null;
    }
} catch (e) {
    console.error('Erreur lors de la déclaration de currentTechSpectacle:', e);
}
if (!window.currentEditingVoyage) {
    window.currentEditingVoyage = null;
}
if (!window.currentEditingHebergement) {
    window.currentEditingHebergement = null;
}
if (!window.currentEditingPlanningItem) {
    window.currentEditingPlanningItem = null;
}

function renderTechCardForSpectacle(spectacle) {
    if (!spectacle) return '';
    
    // Initialiser les données tech si pas présentes
    if (!spectacle.tech) spectacle.tech = {};
    
    const dt = getDirecteurTechniqueFromEquipe(spectacle);
    const lieu = spectacle.tech.lieuId ? getLieuById(spectacle.tech.lieuId) : null;
    const nbPrestataires = spectacle.tech.prestataires ? spectacle.tech.prestataires.length : 0;
    const nbVoyages = spectacle.tech.voyages ? spectacle.tech.voyages.length : 0;
    const nbHebergements = spectacle.tech.hebergements ? spectacle.tech.hebergements.length : 0;
    
    const totalItems = nbPrestataires + nbVoyages + nbHebergements;
    return `
        <div class="project-card" onclick="openTechPage('${spectacle.id}')" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1rem; font-weight: 600; color: var(--primary);">📦 Technique & Logistique</span>
                <span style="background: var(--light); color: var(--primary); font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; font-size: 0.85rem;">${totalItems}</span>
            </div>
            <span style="color: var(--accent); font-size: 1.1rem;">→</span>
        </div>
    `;
}

async function openTechPage(spectacleId) {
    // Vérifier la permission avant d'ouvrir
    if (window.hasPermission && !window.hasPermission('technique')) {
        alert('Vous n\'avez pas la permission d\'accéder à cette section.');
        return;
    }
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle) return;
    
    window.currentTechSpectacle = spectacle;
    
    // Initialiser les données tech si pas présentes (ou partiellement)
    // IMPORTANT : si tech est un tableau [] au lieu d'un objet {}, le convertir
    if (!spectacle.tech || Array.isArray(spectacle.tech)) spectacle.tech = {};
    if (!spectacle.tech.lieuId) spectacle.tech.lieuId = null;
    if (!Array.isArray(spectacle.tech.prestataires)) spectacle.tech.prestataires = [];
    if (!Array.isArray(spectacle.tech.voyages)) spectacle.tech.voyages = [];
    if (!Array.isArray(spectacle.tech.hebergements)) spectacle.tech.hebergements = [];
    if (!Array.isArray(spectacle.tech.planning)) spectacle.tech.planning = [];
    // Notes par section
    if (!spectacle.tech.notes || Array.isArray(spectacle.tech.notes)) spectacle.tech.notes = {
        general: '',
        lieu: '',
        prestataires: '',
        voyages: '',
        hebergements: '',
        planning: ''
    };
    
    document.getElementById('techSpectacleName').textContent = spectacle.name;
    
    // Remplir le select des DT (charger les utilisateurs si nécessaire)
    await populateDTSelect();
    
    // Afficher les données
    renderTechLieu();
    renderTechPrestataires();
    renderTechVoyages();
    renderTechHebergements();
    renderTechPlanning();
    renderTechNotes();
    renderTechSectionTasks();
    renderCategoryTasks(spectacleId, 'Logistique', 'techTasksList');
    
    document.getElementById('techPage').classList.add('active');
    document.getElementById('techPage').classList.add('page-enter');
    setTimeout(() => { const tp = document.getElementById('techPage'); if (tp) tp.classList.remove('page-enter'); }, 700);
    updateFabAppearance();
}

function closeTechPage() {
    // Rafraîchir la page spectacle en-dessous (le lieu a pu changer)
    const spectacleId = window.currentTechSpectacle?.id;
    if (spectacleId && typeof window.currentSpectacleDetail !== 'undefined' && window.currentSpectacleDetail?.id === spectacleId) {
        // Re-rendre la page spectacle avec les données à jour après fermeture
        setTimeout(() => {
            if (typeof viewSpectacle === 'function') viewSpectacle(spectacleId);
        }, 50);
    }
    // Rafraîchir aussi la page tournée si elle est ouverte en-dessous
    if (spectacleId && typeof currentTournee !== 'undefined' && currentTournee?.id) {
        setTimeout(() => {
            if (typeof viewTournee === 'function' && document.getElementById('tourneePage')?.classList.contains('active')) {
                viewTournee(currentTournee.id);
            }
        }, 60);
    }
    document.getElementById('techPage').classList.remove('active');
    window.currentTechSpectacle = null;
    updateFabAppearance();
}

// --- NOTES ---
function renderTechNotes() {
    if (!window.currentTechSpectacle || !window.currentTechSpectacle.tech.notes) return;
    
    const notes = window.currentTechSpectacle.tech.notes;
    document.getElementById('techNotesLieu').value = notes.lieu || '';
    document.getElementById('techNotesPrestataires').value = notes.prestataires || '';
    document.getElementById('techNotesVoyages').value = notes.voyages || '';
    document.getElementById('techNotesHebergements').value = notes.hebergements || '';
    document.getElementById('techNotesPlanning').value = notes.planning || '';
}

function saveTechNote(section, value) {
    if (!window.currentTechSpectacle) return;
    if (!window.currentTechSpectacle.tech.notes) {
        window.currentTechSpectacle.tech.notes = {};
    }
    window.currentTechSpectacle.tech.notes[section] = value;
    saveProjectsAsync();
}

// --- QUICK TASK (ajout rapide de tâche depuis les sections) ---
function openQuickTaskModal(category, tag, spectacleId = null) {
    // Déterminer le spectacle à utiliser
    let targetSpectacle = null;
    if (spectacleId) {
        targetSpectacle = projects.find(p => p.id === spectacleId);
    } else if (window.currentTechSpectacle) {
        targetSpectacle = window.currentTechSpectacle;
    } else if (window.currentSpectacleDetail) {
        targetSpectacle = window.currentSpectacleDetail;
    }
    
    if (!targetSpectacle) {
        alert('Erreur : aucun spectacle sélectionné');
        return;
    }
    
    // Sauvegarder temporairement le spectacle cible
    window._tempTaskSpectacle = targetSpectacle;
    
    document.getElementById('quickTaskForm').reset();
    if (category) {
        document.getElementById('quickTaskCategory').value = category;
        document.getElementById('quickTaskCategoryDisplay').textContent = category;
    }
    if (tag) {
        document.getElementById('quickTaskTag').value = tag;
        document.getElementById('quickTaskTagDisplay').textContent = tag;
        document.getElementById('quickTaskModalTitle').textContent = `✅ Nouvelle tâche - ${tag}`;
    } else {
        document.getElementById('quickTaskModalTitle').textContent = '✅ Nouvelle tâche';
    }
    
    // Pré-remplir l'échéance avec la date du spectacle si disponible
    if (targetSpectacle.date) {
        document.getElementById('quickTaskDueDate').value = targetSpectacle.date;
    }
    
    // Remplir le select des assignés avec l'équipe interne
    populateAssigneeSelect('quickTaskAssignee');
    
    document.getElementById('quickTaskModal').classList.add('active');
}

function closeQuickTaskModal() {
    document.getElementById('quickTaskModal').classList.remove('active');
    window._tempTaskSpectacle = null;
}

function populateTaskProjectSelect(selectedId = '', disabled = false) {
    const sel = document.getElementById('taskProjectSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Sélectionner —</option>';
    const list = typeof filterProjectsByMembership === 'function' ? filterProjectsByMembership(projects || []) : (projects || []);
    if (!list.length) {
        sel.disabled = !!disabled;
        return;
    }
    const added = new Set();
    const tournees = list.filter(p => p.type === 'tournee' || (!p.type && p.spectacles && p.spectacles.length));
    tournees.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = '🎭 ' + (t.name || t.nom || 'Tournée');
        opt.dataset.type = 'tournee';
        if (selectedId && String(t.id) === String(selectedId)) opt.selected = true;
        sel.appendChild(opt);
        added.add(String(t.id));
        const spectacles = t.spectacles || list.filter(p => String(p.parentId) === String(t.id));
        spectacles.forEach(s => {
            const subOpt = document.createElement('option');
            subOpt.value = s.id;
            subOpt.textContent = '  └─ 📍 ' + (s.name || s.nom || s.lieu || 'Spectacle');
            subOpt.dataset.type = 'spectacle';
            if (selectedId && String(s.id) === String(selectedId)) subOpt.selected = true;
            sel.appendChild(subOpt);
            added.add(String(s.id));
        });
    });
    list.forEach(p => {
        if (added.has(String(p.id))) return;
        const name = p.name || p.nom || p.lieu || 'Projet';
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = (p.type === 'spectacle' ? '📍 ' : '') + name;
        opt.dataset.type = p.type || 'spectacle';
        if (selectedId && String(p.id) === String(selectedId)) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.disabled = !!disabled;
    const grp = document.getElementById('taskProjectSelectGroup');
    if (grp) grp.style.display = disabled ? 'none' : 'block';
}

if (!window._populateAssigneesCallId) {
    window._populateAssigneesCallId = 0;
}
// Fonction pour remplir le multi-select des assignés (users_list.php accessible à tous)
async function populateAssigneeMultiSelect(selectedIds = []) {
    const container = document.getElementById('taskAssigneesSelector');
    const badgesContainer = document.getElementById('taskAssigneesBadges');
    if (!container) return;
    const myCallId = ++window._populateAssigneesCallId;
    container.innerHTML = '';
    if (badgesContainer) badgesContainer.innerHTML = '';
    let users = [];
    try {
        let data = await apiCall('users_list.php', 'GET');
        if (data?.users?.length) { users = deduplicateUsersById(data.users); allUsers = users; }
    } catch (e) { /* fallback */ }
    if (!users.length && currentUser && currentUser.role === 'admin') {
        try {
            const data = await apiCall('users.php', 'GET');
            if (data?.users?.length) { users = deduplicateUsersById(data.users); allUsers = users; }
        } catch (e) { /* 403 si non-admin */ }
    }
    if (myCallId !== window._populateAssigneesCallId) return;
    if (!users.length) {
        container.innerHTML = '<div style="padding: 1rem; text-align: center; color: #636e72;">Aucun utilisateur disponible</div>';
        return;
    }
    const userMap = new Map();
    const nameSeen = new Set();
    for (const user of users) {
        const uid = user?.id;
        if (uid == null) continue;
        const idStr = String(uid);
        if (userMap.has(idStr)) continue;
        const nameKey = `${(user?.prenom||'').trim()} ${(user?.nom||user?.username||'').trim()}`.trim().toLowerCase();
        if (nameKey && nameSeen.has(nameKey)) continue;
        nameSeen.add(nameKey);
        userMap.set(idStr, user);
    }
    if (myCallId !== window._populateAssigneesCallId) return;
    const uniqueUsers = Array.from(userMap.values());
    allUsers = uniqueUsers;
    container.innerHTML = '';
    if (badgesContainer) badgesContainer.innerHTML = '';
    uniqueUsers.forEach(user => {
        const idStr = String(user.id);
        const isSelected = selectedIds.includes(idStr);
        const roleProf = user.role_professionnel || '';
        const roleDisplay = roleProf ? ` (${roleProf})` : '';
        const displayName = `${user.prenom || ''} ${user.nom || user.username}`.trim();
        const initials = getUserInitials(user);
        const color = getColorFromId(user.id);
        const option = document.createElement('div');
        option.className = 'assignee-option';
        option.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; cursor: pointer;';
        option.innerHTML = `
            <input type="checkbox" id="assignee_${user.id}" value="${user.id}" ${isSelected ? 'checked' : ''} onchange="updateAssigneesBadges()" style="width: 18px; height: 18px; cursor: pointer;">
            <span class="task-assignee-badge" style="background: ${color}; min-width: 32px; text-align: center;">${initials}</span>
            <label for="assignee_${user.id}" style="cursor: pointer; flex: 1;">${(displayName || user.username || '').replace(/</g,'&lt;')}${roleDisplay}</label>
        `;
        container.appendChild(option);
    });
    updateAssigneesBadges();
}

// Alias pour compatibilité
function updateAssigneeBadges() {
    updateAssigneesBadges();
}

// Fonction pour obtenir les IDs des assignés sélectionnés
function getSelectedAssignees() {
    const checkboxes = document.querySelectorAll('#taskAssigneesSelector input[type="checkbox"]:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);
    return [...new Set(ids.map(String))];
}

// Fonction pour cocher/décocher "M'assigner cette tâche"
function toggleAssignToMe() {
    const checkbox = document.getElementById('taskAssignToMe');
    if (!checkbox || !currentUser) return;
    
    const myCheckbox = document.querySelector(`#taskAssigneesSelector input[type="checkbox"][value="${currentUser.id}"]`);
    if (myCheckbox) {
        myCheckbox.checked = checkbox.checked;
        updateAssigneeBadges();
    }
}

// Fonction legacy pour compatibilité (utilisée dans quickTask, tâches personnelles...)
// Utilise users_list.php (accessible à tous) en priorité, sinon users.php (admin)
async function populateAssigneeSelect(selectId, selectedId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Non assigné --</option>';
    
    const addUsers = (users) => {
        if (!users || !users.length) return;
        users.forEach(user => {
            const selected = selectedId && String(selectedId) === String(user.id) ? 'selected' : '';
            const roleProf = user.role_professionnel || '';
            const roleDisplay = roleProf ? ` (${roleProf})` : '';
            const name = `${user.prenom || ''} ${user.nom || user.username}`.trim();
            select.innerHTML += `<option value="${user.id}" ${selected}>${name || user.username || user.id}${roleDisplay}</option>`;
        });
    };
    
    try {
        const data = await apiCall('users_list.php', 'GET');
        if (data?.users?.length) {
            addUsers(data.users);
            if (typeof allUsers !== 'undefined') allUsers = data.users;
        }
    } catch (e) { /* users_list peut être indisponible */ }
}

// Rendre les tâches dans chaque section de la page Tech
function renderTechSectionTasks() {
    if (!window.currentTechSpectacle) return;
    
    const sections = ['Lieu', 'Prestataires', 'Voyages', 'Hebergements', 'Planning'];
    
    sections.forEach(tag => {
        const containerId = `techTasks${tag}`;
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Filtrer les tâches par tag
        const tasks = (window.currentTechSpectacle.tasks || []).filter(t => t.tag === tag && t.status !== 'done');
        
        if (tasks.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.1); padding: 0.75rem; border-radius: 10px; margin-top: 0.5rem;">
                <div style="color: rgba(255,255,255,0.8); font-size: 0.8rem; margin-bottom: 0.5rem; font-weight: 600;">
                    ✅ Tâches (${tasks.length})
                </div>
                ${tasks.map(t => renderTaskItem({...t, projectId: window.currentTechSpectacle.id})).join('')}
            </div>
        `;
    });
}

function saveQuickTask(event) {
    event.preventDefault();
    
    // Déterminer le spectacle à utiliser
    let targetSpectacle = window._tempTaskSpectacle || window.currentTechSpectacle || window.currentSpectacleDetail;
    if (!targetSpectacle) return;
    
    const title = document.getElementById('quickTaskTitle').value.trim();
    if (!title) return;
    
    const category = document.getElementById('quickTaskCategory').value;
    const tag = document.getElementById('quickTaskTag').value;
    
    // Initialiser le tableau de tâches si nécessaire
    if (!targetSpectacle.tasks) {
        targetSpectacle.tasks = [];
    }
    
    // Créer la tâche
    const assigneeId = document.getElementById('quickTaskAssignee').value;
    const assignedTo = assigneeId ? [assigneeId] : [];
    
    const newTask = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: title,
        description: document.getElementById('quickTaskDescription').value.trim(),
        category: category,
        tag: tag, // Pour savoir de quelle section elle vient (Lieu, Voyages, etc.)
        priority: document.getElementById('quickTaskPriority').value,
        status: 'todo',
        dueDate: document.getElementById('quickTaskDueDate').value || null,
        assignedTo: assignedTo,
        createdAt: new Date().toISOString(),
        createdBy: currentUser ? currentUser.id : null
    };
    
    targetSpectacle.tasks.push(newTask);
    
    // Mettre à jour dans projects
    const projectIndex = projects.findIndex(p => p.id === targetSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = targetSpectacle;
    }
    
    saveProjectsAsync();
    closeQuickTaskModal();
    
    // Nettoyer la variable temporaire
    window._tempTaskSpectacle = null;
    
    // Rafraîchir l'affichage des tâches
    if (window.currentTechSpectacle) {
        renderTechSectionTasks();
        renderCategoryTasks(window.currentTechSpectacle.id, 'Logistique', 'techTasksList');
    }
    if (window.currentSpectacleDetail) {
        renderSpectacleAllTasks(window.currentSpectacleDetail.id);
    }
    renderHomeTasksWidget();
}

async function populateDTSelect() {
    // Afficher le DT en lecture seule (déterminé depuis l'équipe du spectacle)
    renderTechDirecteurDisplay();
}

function renderTechDirecteurDisplay() {
    const container = document.getElementById('techDirecteurDisplay');
    if (!container || !window.currentTechSpectacle) return;
    
    const dt = getDirecteurTechniqueFromEquipe(window.currentTechSpectacle);
    if (dt) {
        const name = `${dt.prenom || ''} ${dt.nom || dt.username}`.trim();
        const initial = name.charAt(0).toUpperCase();
        container.innerHTML = `
            <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0;">${initial}</div>
            <div>
                <div style="font-weight: 600; font-size: 1rem;">${name}</div>
                <div style="font-size: 0.8rem; color: #6c5ce7;">Directeur technique</div>
            </div>`;
    } else {
        container.innerHTML = '<span style="color: #a0aec0; font-style: italic;">Aucun membre avec le rôle "Directeur technique" dans l\'équipe</span>';
    }
}

function saveTechDirecteur() {
    // Fonction conservée pour rétro-compatibilité mais plus utilisée
    // Le DT est maintenant déterminé automatiquement depuis l'équipe
}

// --- LIEU ---
function renderTechLieu() {
    const container = document.getElementById('techLieuContent');
    if (!window.currentTechSpectacle || !window.currentTechSpectacle.tech.lieuId) {
        container.innerHTML = '<div class="admin-empty">Aucun lieu sélectionné. Choisissez ou créez un lieu ci-dessus.</div>';
        return;
    }
    
    const lieu = getLieuById(window.currentTechSpectacle.tech.lieuId);
    if (!lieu) {
        container.innerHTML = '<div class="admin-empty">Lieu non trouvé.</div>';
        return;
    }
    
    let contactsHtml = '';
    if (lieu.contacts && lieu.contacts.length > 0) {
        contactsHtml = `
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                <strong>Contacts :</strong>
                <div style="display: grid; gap: 0.5rem; margin-top: 0.5rem;">
                    ${lieu.contacts.map(c => `
                        <div style="display: flex; gap: 1rem; font-size: 0.9rem;">
                            <span style="color: #636e72; min-width: 120px;">${c.role}</span>
                            <span>${c.nom}</span>
                            ${c.telephone ? `<span>📞 ${c.telephone}</span>` : ''}
                            ${c.email ? `<span>📧 ${c.email}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
                <h4 style="font-family: 'Playfair Display', serif; font-size: 1.3rem; margin-bottom: 0.5rem;">📍 ${lieu.nom}</h4>
                <div style="color: #636e72;">
                    ${lieu.adresse ? `<div>📫 ${lieu.adresse}, ${lieu.codePostal || ''} ${lieu.ville}</div>` : `<div>📫 ${lieu.ville}</div>`}
                    <div style="margin-top: 0.5rem;">
                        ${lieu.type ? `<span style="background: var(--light); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85rem;">🎭 ${lieu.type}</span>` : ''}
                        ${lieu.capacite ? `<span style="background: var(--light); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85rem; margin-left: 0.5rem;">👥 ${lieu.capacite} places</span>` : ''}
                    </div>
                </div>
                ${contactsHtml}
                ${lieu.notes ? `<div style="margin-top: 1rem; padding: 0.8rem; background: #fffbeb; border-radius: 8px; font-size: 0.9rem;"><strong>Notes :</strong> ${lieu.notes}</div>` : ''}
            </div>
            <button class="btn btn-secondary" onclick="removeLieuFromSpectacle()" style="white-space: nowrap;">✕ Retirer</button>
        </div>
        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary" onclick="addTaskFromCard(window.currentTechSpectacle.id, 'Logistique')">+ Créer une tâche</button>
        </div>
    `;
}

function openSelectLieuModal() {
    const container = document.getElementById('selectLieuList');
    
    if (!appSettings.lieux || appSettings.lieux.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun lieu dans la base. Créez d\'abord un lieu dans l\'administration ou cliquez sur "Créer un lieu".</div>';
    } else {
        container.innerHTML = appSettings.lieux.map(lieu => `
            <div class="admin-list-item" style="cursor: pointer;" onclick="selectLieuForSpectacle('${lieu.id}')">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-name">📍 ${lieu.nom}</div>
                    <div class="admin-list-item-detail">${lieu.ville}${lieu.type ? ' • ' + lieu.type : ''}${lieu.capacite ? ' • ' + lieu.capacite + ' places' : ''}</div>
                </div>
            </div>
        `).join('');
    }
    
    document.getElementById('selectLieuModal').classList.add('active');
}

function closeSelectLieuModal() {
    document.getElementById('selectLieuModal').classList.remove('active');
}

function selectLieuForSpectacle(lieuId) {
    if (!window.currentTechSpectacle) return;
    window.currentTechSpectacle.tech.lieuId = lieuId;
    
    // Synchroniser avec le lieuId principal du spectacle
    window.currentTechSpectacle.lieuId = lieuId;
    const lieu = getLieuById(lieuId);
    if (lieu) {
        window.currentTechSpectacle.city = lieu.ville || '';
        window.currentTechSpectacle.location = lieu.nom || '';
        // Mettre à jour le nom si spectacle de tournée
        if (window.currentTechSpectacle.parentId) {
            const tournee = projects.find(p => p.id === window.currentTechSpectacle.parentId);
            if (tournee) {
                window.currentTechSpectacle.name = `${tournee.name} - ${lieu.ville}`;
            }
        }
        
        // Créer automatiquement une ligne budget pour le lieu
        if (!window.currentTechSpectacle.budget) window.currentTechSpectacle.budget = [];
        const existingLine = window.currentTechSpectacle.budget.find(b => b.techItemType === 'lieu' && b.techItemId === lieu.id);
        if (!existingLine) {
            window.currentTechSpectacle.budget.push({
                id: 'budget_lieu_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                designation: '[LIEU] ' + lieu.nom + (lieu.ville ? ' — ' + lieu.ville : ''),
                category: 'Location salle',
                montantType: 'fixe',
                montantFixe: 0,
                montantInputType: 'HT',
                tvaRate: 20,
                isEstimatif: true,
                isReel: false,
                techItemId: lieu.id,
                techItemType: 'lieu'
            });
        }
    }
    window.currentTechSpectacle.updatedAt = new Date().toISOString();
    
    saveProjectsAsync();
    closeSelectLieuModal();
    renderTechLieu();
}

function removeLieuFromSpectacle() {
    if (!window.currentTechSpectacle) return;
    if (!confirm('Retirer ce lieu du spectacle ?')) return;
    
    // Supprimer la ligne budget liée au lieu
    const lieuId = window.currentTechSpectacle.tech.lieuId;
    if (lieuId && window.currentTechSpectacle.budget) {
        const bIdx = window.currentTechSpectacle.budget.findIndex(b => b.techItemType === 'lieu' && b.techItemId === lieuId);
        if (bIdx !== -1) window.currentTechSpectacle.budget.splice(bIdx, 1);
    }
    
    window.currentTechSpectacle.tech.lieuId = null;
    
    // Synchroniser avec le lieuId principal du spectacle
    window.currentTechSpectacle.lieuId = null;
    window.currentTechSpectacle.city = '';
    window.currentTechSpectacle.location = '';
    window.currentTechSpectacle.updatedAt = new Date().toISOString();
    
    saveProjectsAsync();
    renderTechLieu();
}

function openLieuModalForSpectacle() {
    openLieuModal();
    // Après la sauvegarde, on pourra sélectionner le lieu
}

// --- PRESTATAIRES ---
function renderTechPrestataires() {
    const container = document.getElementById('techPrestatairesContent');
    if (!window.currentTechSpectacle || !window.currentTechSpectacle.tech.prestataires || window.currentTechSpectacle.tech.prestataires.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun prestataire assigné.</div>';
        return;
    }
    
    container.innerHTML = window.currentTechSpectacle.tech.prestataires.map((p, index) => {
        const presta = getPrestataireById(p.prestataireId);
        if (!presta) return '';
        
        const statusColor = p.statut === 'Confirmé' ? '#00b894' : (p.statut === 'Annulé' ? '#d63031' : '#fdcb6e');
        const montant = parseFloat(p.devis) || 0;
        const inputType = p.montantInputType || 'HT';
        const tva = p.tvaRate || 0;
        const coutStatut = p.coutStatut === 'reel' ? 'Réel' : 'Estimatif';
        const coutStatutColor = p.coutStatut === 'reel' ? '#00b894' : '#fdcb6e';
        const linkedBudget = p.budgetLineId ? true : false;
        
        return `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-name">🏢 ${presta.nom} ${presta.type ? `<span style="font-weight: normal; color: #636e72;">(${presta.type})</span>` : ''}</div>
                    <div class="admin-list-item-detail">
                        ${montant ? `💰 ${montant.toLocaleString('fr-FR', {minimumFractionDigits: 2})} € ${inputType}${tva ? ' (TVA ' + tva + '%)' : ''}` : '<span style="color:#b2bec3;">Pas de montant</span>'}
                        ${montant ? ` • <span style="color: ${coutStatutColor}; font-weight: 500;">${coutStatut}</span>` : ''}
                        <span style="background: ${statusColor}20; color: ${statusColor}; padding: 0.1rem 0.5rem; border-radius: 10px; font-size: 0.8rem; margin-left: 0.5rem;">${p.statut || 'En attente'}</span>
                        ${linkedBudget ? '<span style="background: #dfe6e920; color: #0984e3; padding: 0.1rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.3rem;" title="Lié au budget">📊 Budget</span>' : ''}
                    </div>
                    ${renderTechFileButtons('prestataire', index, p)}
                </div>
                <div class="admin-list-item-actions">
                    <button class="btn-edit-small" onclick="editPrestataireSpectacle(${index})">✏️</button>
                    <button class="btn-delete-small" onclick="removePrestataireFromSpectacle(${index})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function openAddPrestataireToSpectacle(editIndex = null) {
    window.currentEditingPrestataireSpectacle = editIndex;
    const select = document.getElementById('selectPrestataireFromDB');
    select.innerHTML = '<option value="">-- Choisir un prestataire --</option>';
    
    appSettings.prestataires.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nom}${p.type ? ' (' + p.type + ')' : ''}</option>`;
    });
    
    select.onchange = function() {
        document.getElementById('prestataireSpectacleDetails').style.display = this.value ? 'block' : 'none';
    };
    
    // Reset
    document.getElementById('prestataireDevis').value = '';
    document.getElementById('prestataireMontantType').value = 'HT';
    document.getElementById('prestataireTvaRate').value = '20';
    document.getElementById('prestataireCoutStatut').value = 'estimatif';
    document.getElementById('prestataireBudgetCategory').value = 'Technique';
    document.getElementById('prestataireStatut').value = 'En attente';
    document.getElementById('prestataireNotesSpectacle').value = '';
    document.getElementById('prestataireSpectacleDetails').style.display = 'none';
    document.getElementById('prestataireSelectSection').style.display = '';
    document.getElementById('prestataireSpectacleModalTitle').textContent = 'Ajouter un prestataire';
    document.getElementById('prestataireSpectacleSubmitBtn').textContent = 'Ajouter';
    
    if (editIndex !== null) {
        const p = window.currentTechSpectacle.tech.prestataires[editIndex];
        select.value = p.prestataireId;
        document.getElementById('prestataireSelectSection').style.display = 'none';
        document.getElementById('prestataireSpectacleDetails').style.display = 'block';
        document.getElementById('prestataireDevis').value = p.devis || '';
        document.getElementById('prestataireMontantType').value = p.montantInputType || 'HT';
        document.getElementById('prestataireTvaRate').value = p.tvaRate ?? 20;
        document.getElementById('prestataireCoutStatut').value = p.coutStatut || 'estimatif';
        document.getElementById('prestataireBudgetCategory').value = p.budgetCategory || 'Technique';
        document.getElementById('prestataireStatut').value = p.statut || 'En attente';
        document.getElementById('prestataireNotesSpectacle').value = p.notes || '';
        document.getElementById('prestataireSpectacleModalTitle').textContent = 'Modifier le prestataire';
        document.getElementById('prestataireSpectacleSubmitBtn').textContent = 'Enregistrer';
    }
    
    document.getElementById('addPrestataireSpectacleModal').classList.add('active');
}
if (!window.currentEditingPrestataireSpectacle) {
    window.currentEditingPrestataireSpectacle = null;
}

function closeAddPrestataireSpectacleModal() {
    document.getElementById('addPrestataireSpectacleModal').classList.remove('active');
    window.currentEditingPrestataireSpectacle = null;
}

function addPrestataireToSpectacle() {
    const prestataireId = document.getElementById('selectPrestataireFromDB').value;
    if (!window.currentTechSpectacle) return;
    
    // En mode ajout, vérifier qu'un prestataire est sélectionné
    if (window.currentEditingPrestataireSpectacle === null && !prestataireId) return;
    
    // En mode ajout, vérifier le doublon
    if (window.currentEditingPrestataireSpectacle === null && window.currentTechSpectacle.tech.prestataires.find(p => p.prestataireId === prestataireId)) {
        alert('Ce prestataire est déjà assigné à ce spectacle.');
        return;
    }

    const presta = getPrestataireById(prestataireId || window.currentTechSpectacle.tech.prestataires[window.currentEditingPrestataireSpectacle]?.prestataireId);
    
    const prestaData = {
        prestataireId: prestataireId || window.currentTechSpectacle.tech.prestataires[window.currentEditingPrestataireSpectacle]?.prestataireId,
        devis: document.getElementById('prestataireDevis').value || null,
        montantInputType: document.getElementById('prestataireMontantType').value || 'HT',
        tvaRate: parseFloat(document.getElementById('prestataireTvaRate').value) || 20,
        coutStatut: document.getElementById('prestataireCoutStatut').value || 'estimatif',
        budgetCategory: document.getElementById('prestataireBudgetCategory').value || 'Technique',
        statut: document.getElementById('prestataireStatut').value,
        notes: document.getElementById('prestataireNotesSpectacle').value.trim()
    };
    
    // Conserver le budgetLineId et les fichiers si édition
    if (window.currentEditingPrestataireSpectacle !== null) {
        const existing = window.currentTechSpectacle.tech.prestataires[window.currentEditingPrestataireSpectacle];
        prestaData.budgetLineId = existing.budgetLineId || null;
        if (existing.devis) prestaData.devis = existing.devis;
        if (existing.facture) prestaData.facture = existing.facture;
    }

    if (window.currentEditingPrestataireSpectacle !== null) {
        window.currentTechSpectacle.tech.prestataires[window.currentEditingPrestataireSpectacle] = prestaData;
    } else {
        window.currentTechSpectacle.tech.prestataires.push(prestaData);
    }
    
    // Synchroniser avec le budget
    const montant = parseFloat(prestaData.devis) || 0;
    if (montant > 0) {
        // Convertir TTC→HT si besoin pour le budget
        const tva = prestaData.tvaRate || 0;
        const coutHT = prestaData.montantInputType === 'TTC' ? montant / (1 + tva / 100) : montant;
        const budgetItem = {
            ...prestaData,
            id: prestaData.prestataireId + '_' + (window.currentEditingPrestataireSpectacle ?? (window.currentTechSpectacle.tech.prestataires.length - 1)),
            cout: coutHT,
            nom: presta ? presta.nom : 'Prestataire'
        };
        syncTechItemWithBudget(window.currentTechSpectacle, budgetItem, prestaData.budgetCategory, 'PRESTA', 'prestataire');
        // Reporter le budgetLineId
        const idx = window.currentEditingPrestataireSpectacle !== null ? window.currentEditingPrestataireSpectacle : window.currentTechSpectacle.tech.prestataires.length - 1;
        window.currentTechSpectacle.tech.prestataires[idx].budgetLineId = budgetItem.budgetLineId;
    } else {
        // Pas de montant : supprimer la ligne budget si elle existait
        if (prestaData.budgetLineId && window.currentTechSpectacle.budget) {
            const bIdx = window.currentTechSpectacle.budget.findIndex(b => b.id === prestaData.budgetLineId);
            if (bIdx !== -1) window.currentTechSpectacle.budget.splice(bIdx, 1);
            const idx = window.currentEditingPrestataireSpectacle !== null ? window.currentEditingPrestataireSpectacle : window.currentTechSpectacle.tech.prestataires.length - 1;
            window.currentTechSpectacle.tech.prestataires[idx].budgetLineId = null;
        }
    }
    
    saveProjectsAsync();
    closeAddPrestataireSpectacleModal();
    renderTechPrestataires();
}

function editPrestataireSpectacle(index) {
    openAddPrestataireToSpectacle(index);
}

function removePrestataireFromSpectacle(index) {
    if (!window.currentTechSpectacle) return;
    if (!confirm('Retirer ce prestataire du spectacle ?')) return;
    
    const p = window.currentTechSpectacle.tech.prestataires[index];
    
    // Supprimer la ligne budget liée
    if (p && p.budgetLineId && window.currentTechSpectacle.budget) {
        const budgetIndex = window.currentTechSpectacle.budget.findIndex(b => b.id === p.budgetLineId);
        if (budgetIndex !== -1) {
            window.currentTechSpectacle.budget.splice(budgetIndex, 1);
        }
    }
    
    window.currentTechSpectacle.tech.prestataires.splice(index, 1);
    saveProjectsAsync();
    renderTechPrestataires();
}

// --- VOYAGES ---
function renderTechVoyages() {
    const container = document.getElementById('techVoyagesContent');
    if (!window.currentTechSpectacle || !window.currentTechSpectacle.tech.voyages || window.currentTechSpectacle.tech.voyages.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun voyage enregistré.</div>';
        return;
    }
    
    // Grouper par date
    const voyagesByDate = {};
    window.currentTechSpectacle.tech.voyages.forEach((v, index) => {
        const date = v.date || 'Non daté';
        if (!voyagesByDate[date]) voyagesByDate[date] = [];
        voyagesByDate[date].push({...v, index});
    });
    
    const typeIcons = { 'Avion': '✈️', 'Train': '🚄', 'Voiture': '🚗', 'Bus': '🚌' };
    
    let html = '';
    Object.keys(voyagesByDate).sort().forEach(date => {
        const dateStr = date !== 'Non daté' ? new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Non daté';
        html += `<div style="margin-bottom: 1rem;">
            <div style="font-weight: 600; color: var(--primary); margin-bottom: 0.5rem; text-transform: capitalize;">📅 ${dateStr}</div>`;
        
        voyagesByDate[date].forEach(v => {
            const coutStatutLabel = v.coutStatut === 'reel' ? 'Réel' : 'Estimatif';
            const coutStatutColor = v.coutStatut === 'reel' ? '#00b894' : '#fdcb6e';
            html += `
                <div class="admin-list-item" style="margin-left: 1rem;">
                    <div class="admin-list-item-info">
                        <div class="admin-list-item-name">${typeIcons[v.type] || '🚀'} ${v.depart || '?'} → ${v.arrivee || '?'}</div>
                        <div class="admin-list-item-detail">
                            ${v.heure ? '🕐 ' + v.heure : ''}
                            ${v.numero ? ' • N° ' + v.numero : ''}
                            ${v.cout ? ' • 💰 ' + parseFloat(v.cout).toLocaleString('fr-FR', {minimumFractionDigits: 2}) + ' € HT' + (v.tvaRate ? ' (TVA ' + v.tvaRate + '%)' : '') : ''}
                            ${v.cout ? ' • <span style="color: ' + coutStatutColor + '; font-weight: 500;">' + coutStatutLabel + '</span>' : ''}
                            ${v.voyageurs ? ' • 👥 ' + v.voyageurs : ''}
                            ${v.budgetLineId ? '<span style="background: #dfe6e920; color: #0984e3; padding: 0.1rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.3rem;" title="Lié au budget">📊 Budget</span>' : ''}
                        </div>
                        ${renderTechFileButtons('voyage', v.index, v)}
                    </div>
                    <div class="admin-list-item-actions">
                        <button class="btn-edit-small" onclick="editVoyage(${v.index})">✏️</button>
                        <button class="btn-delete-small" onclick="deleteVoyage(${v.index})">🗑️</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    });
    
    container.innerHTML = html;
}

function openAddVoyageModal() {
    currentEditingVoyage = null;
    document.getElementById('voyageModalTitle').textContent = 'Nouveau voyage';
    document.getElementById('voyageForm').reset();
    document.getElementById('voyageId').value = '';
    
    // Pré-remplir la date avec celle du spectacle
    if (window.currentTechSpectacle && window.currentTechSpectacle.date) {
        document.getElementById('voyageDate').value = window.currentTechSpectacle.date;
    }
    
    document.getElementById('voyageModal').classList.add('active');
}

function closeVoyageModal() {
    document.getElementById('voyageModal').classList.remove('active');
    currentEditingVoyage = null;
}

function editVoyage(index) {
    const voyage = window.currentTechSpectacle.tech.voyages[index];
    if (!voyage) return;
    
    currentEditingVoyage = index;
    document.getElementById('voyageModalTitle').textContent = 'Modifier le voyage';
    document.getElementById('voyageId').value = voyage.id || '';
    document.getElementById('voyageType').value = voyage.type || 'Avion';
    document.getElementById('voyageDepart').value = voyage.depart || '';
    document.getElementById('voyageArrivee').value = voyage.arrivee || '';
    document.getElementById('voyageDate').value = voyage.date || '';
    document.getElementById('voyageHeure').value = voyage.heure || '';
    document.getElementById('voyageNumero').value = voyage.numero || '';
    document.getElementById('voyageCout').value = voyage.cout || '';
    document.getElementById('voyageVoyageurs').value = voyage.voyageurs || '';
    document.getElementById('voyageNotes').value = voyage.notes || '';
    document.getElementById('voyageCoutStatut').value = voyage.coutStatut || 'estimatif';
    document.getElementById('voyageTvaRate').value = voyage.tvaRate || 20;
    
    document.getElementById('voyageModal').classList.add('active');
}

function saveVoyage(event) {
    event.preventDefault();
    if (!window.currentTechSpectacle) return;
    
    const voyageData = {
        id: document.getElementById('voyageId').value || Date.now().toString(),
        type: document.getElementById('voyageType').value,
        depart: document.getElementById('voyageDepart').value.trim(),
        arrivee: document.getElementById('voyageArrivee').value.trim(),
        date: document.getElementById('voyageDate').value,
        heure: document.getElementById('voyageHeure').value,
        numero: document.getElementById('voyageNumero').value.trim(),
        cout: document.getElementById('voyageCout').value || null,
        voyageurs: document.getElementById('voyageVoyageurs').value.trim(),
        notes: document.getElementById('voyageNotes').value.trim(),
        coutStatut: document.getElementById('voyageCoutStatut').value || 'estimatif',
        tvaRate: parseFloat(document.getElementById('voyageTvaRate').value) || 20
    };
    
    // Conserver le budgetLineId et les fichiers si édition
    if (currentEditingVoyage !== null && window.currentTechSpectacle.tech.voyages[currentEditingVoyage]) {
        const existing = window.currentTechSpectacle.tech.voyages[currentEditingVoyage];
        voyageData.budgetLineId = existing.budgetLineId || null;
        if (existing.devis) voyageData.devis = existing.devis;
        if (existing.facture) voyageData.facture = existing.facture;
    }
    
    if (currentEditingVoyage !== null) {
        window.currentTechSpectacle.tech.voyages[currentEditingVoyage] = voyageData;
    } else {
        window.currentTechSpectacle.tech.voyages.push(voyageData);
    }
    
    // Synchroniser avec le budget
    syncTechItemWithBudget(window.currentTechSpectacle, voyageData, 'Voyage', 'TRANSPORT', 'voyage');
    
    saveProjectsAsync();
    closeVoyageModal();
    renderTechVoyages();
}

function deleteVoyage(index) {
    if (!window.currentTechSpectacle) return;
    if (!confirm('Supprimer ce voyage ?')) return;
    
    const voyage = window.currentTechSpectacle.tech.voyages[index];
    
    // Supprimer la ligne budget liée
    if (voyage && voyage.budgetLineId && window.currentTechSpectacle.budget) {
        const budgetIndex = window.currentTechSpectacle.budget.findIndex(b => b.id === voyage.budgetLineId);
        if (budgetIndex !== -1) {
            window.currentTechSpectacle.budget.splice(budgetIndex, 1);
        }
    }
    
    window.currentTechSpectacle.tech.voyages.splice(index, 1);
    saveProjectsAsync();
    renderTechVoyages();
}

// --- HEBERGEMENTS ---
function renderTechHebergements() {
    const container = document.getElementById('techHebergementsContent');
    if (!window.currentTechSpectacle || !window.currentTechSpectacle.tech.hebergements || window.currentTechSpectacle.tech.hebergements.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun hébergement enregistré.</div>';
        return;
    }
    
    container.innerHTML = window.currentTechSpectacle.tech.hebergements.map((h, index) => {
        const dates = [];
        if (h.dateArrivee) dates.push('Arrivée: ' + new Date(h.dateArrivee).toLocaleDateString('fr-FR'));
        if (h.dateDepart) dates.push('Départ: ' + new Date(h.dateDepart).toLocaleDateString('fr-FR'));
        const coutStatutLabel = h.coutStatut === 'reel' ? 'Réel' : 'Estimatif';
        const coutStatutColor = h.coutStatut === 'reel' ? '#00b894' : '#fdcb6e';
        
        return `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-name">🏨 ${h.nom}</div>
                    <div class="admin-list-item-detail">
                        ${h.adresse ? '📍 ' + h.adresse + ' • ' : ''}
                        ${h.nbChambres ? h.nbChambres + ' chambre(s) • ' : ''}
                        ${h.total ? '💰 ' + parseFloat(h.total).toLocaleString('fr-FR', {minimumFractionDigits: 2}) + ' € HT' + (h.tvaRate ? ' (TVA ' + h.tvaRate + '%)' : '') + ' • <span style="color: ' + coutStatutColor + '; font-weight: 500;">' + coutStatutLabel + '</span>' : ''}
                        ${h.budgetLineId ? '<span style="background: #dfe6e920; color: #0984e3; padding: 0.1rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.3rem;" title="Lié au budget">📊 Budget</span>' : ''}
                    </div>
                    ${dates.length > 0 ? `<div class="admin-list-item-detail">📅 ${dates.join(' → ')}</div>` : ''}
                    ${renderTechFileButtons('hebergement', index, h)}
                </div>
                <div class="admin-list-item-actions">
                    <button class="btn-edit-small" onclick="editHebergement(${index})">✏️</button>
                    <button class="btn-delete-small" onclick="deleteHebergement(${index})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function openAddHebergementModal() {
    currentEditingHebergement = null;
    document.getElementById('hebergementModalTitle').textContent = 'Nouvel hébergement';
    document.getElementById('hebergementForm').reset();
    document.getElementById('hebergementId').value = '';
    
    // Pré-remplir les dates avec celle du spectacle
    if (window.currentTechSpectacle && window.currentTechSpectacle.date) {
        const spectacleDate = new Date(window.currentTechSpectacle.date);
        const veille = new Date(spectacleDate);
        veille.setDate(veille.getDate() - 1);
        document.getElementById('hebergementDateArrivee').value = veille.toISOString().split('T')[0];
        document.getElementById('hebergementDateDepart').value = window.currentTechSpectacle.date;
    }
    
    document.getElementById('hebergementModal').classList.add('active');
}

function closeHebergementModal() {
    document.getElementById('hebergementModal').classList.remove('active');
    currentEditingHebergement = null;
}

function editHebergement(index) {
    const h = window.currentTechSpectacle.tech.hebergements[index];
    if (!h) return;
    
    currentEditingHebergement = index;
    document.getElementById('hebergementModalTitle').textContent = 'Modifier l\'hébergement';
    document.getElementById('hebergementId').value = h.id || '';
    document.getElementById('hebergementNom').value = h.nom || '';
    document.getElementById('hebergementAdresse').value = h.adresse || '';
    document.getElementById('hebergementDateArrivee').value = h.dateArrivee || '';
    document.getElementById('hebergementDateDepart').value = h.dateDepart || '';
    document.getElementById('hebergementNbChambres').value = h.nbChambres || '';
    document.getElementById('hebergementPrixNuit').value = h.prixNuit || '';
    document.getElementById('hebergementTotal').value = h.total || '';
    document.getElementById('hebergementContact').value = h.contact || '';
    document.getElementById('hebergementReservation').value = h.reservation || '';
    document.getElementById('hebergementNotes').value = h.notes || '';
    document.getElementById('hebergementCoutStatut').value = h.coutStatut || 'estimatif';
    document.getElementById('hebergementTvaRate').value = h.tvaRate || 20;
    
    document.getElementById('hebergementModal').classList.add('active');
}

function saveHebergement(event) {
    event.preventDefault();
    if (!window.currentTechSpectacle) return;
    
    const nom = document.getElementById('hebergementNom').value.trim();
    if (!nom) return;
    
    const hebergementData = {
        id: document.getElementById('hebergementId').value || Date.now().toString(),
        nom: nom,
        adresse: document.getElementById('hebergementAdresse').value.trim(),
        dateArrivee: document.getElementById('hebergementDateArrivee').value,
        dateDepart: document.getElementById('hebergementDateDepart').value,
        nbChambres: parseInt(document.getElementById('hebergementNbChambres').value) || null,
        prixNuit: parseFloat(document.getElementById('hebergementPrixNuit').value) || null,
        total: parseFloat(document.getElementById('hebergementTotal').value) || null,
        contact: document.getElementById('hebergementContact').value.trim(),
        reservation: document.getElementById('hebergementReservation').value.trim(),
        notes: document.getElementById('hebergementNotes').value.trim(),
        coutStatut: document.getElementById('hebergementCoutStatut').value || 'estimatif',
        tvaRate: parseFloat(document.getElementById('hebergementTvaRate').value) || 20
    };
    
    // Conserver le budgetLineId et les fichiers si édition
    if (currentEditingHebergement !== null && window.currentTechSpectacle.tech.hebergements[currentEditingHebergement]) {
        const existing = window.currentTechSpectacle.tech.hebergements[currentEditingHebergement];
        hebergementData.budgetLineId = existing.budgetLineId || null;
        if (existing.devis) hebergementData.devis = existing.devis;
        if (existing.facture) hebergementData.facture = existing.facture;
    }
    
    if (currentEditingHebergement !== null) {
        window.currentTechSpectacle.tech.hebergements[currentEditingHebergement] = hebergementData;
    } else {
        window.currentTechSpectacle.tech.hebergements.push(hebergementData);
    }
    
    // Synchroniser avec le budget
    syncTechItemWithBudget(window.currentTechSpectacle, hebergementData, 'Hôtel', 'HÉBERGEMENT', 'hebergement');
    
    saveProjectsAsync();
    closeHebergementModal();
    renderTechHebergements();
}

function deleteHebergement(index) {
    if (!window.currentTechSpectacle) return;
    if (!confirm('Supprimer cet hébergement ?')) return;
    
    const hebergement = window.currentTechSpectacle.tech.hebergements[index];
    
    // Supprimer la ligne budget liée
    if (hebergement && hebergement.budgetLineId && window.currentTechSpectacle.budget) {
        const budgetIndex = window.currentTechSpectacle.budget.findIndex(b => b.id === hebergement.budgetLineId);
        if (budgetIndex !== -1) {
            window.currentTechSpectacle.budget.splice(budgetIndex, 1);
        }
    }
    
    window.currentTechSpectacle.tech.hebergements.splice(index, 1);
    saveProjectsAsync();
    renderTechHebergements();
}

// --- PLANNING ---
function renderTechPlanning() {
    const container = document.getElementById('techPlanningContent');
    if (!window.currentTechSpectacle || !window.currentTechSpectacle.tech.planning || window.currentTechSpectacle.tech.planning.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun élément de planning.</div>';
        return;
    }
    
    // Trier par heure de début
    const sorted = [...window.currentTechSpectacle.tech.planning].sort((a, b) => {
        if (!a.heureDebut) return 1;
        if (!b.heureDebut) return -1;
        return a.heureDebut.localeCompare(b.heureDebut);
    });
    
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${sorted.map((item, index) => {
                const realIndex = window.currentTechSpectacle.tech.planning.findIndex(p => p.id === item.id);
                return `
                    <div class="admin-list-item" style="border-left: 4px solid var(--accent);">
                        <div class="admin-list-item-info">
                            <div class="admin-list-item-name">
                                ${item.heureDebut ? `<span style="background: var(--primary); color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem; margin-right: 0.5rem;">${item.heureDebut}${item.heureFin ? ' - ' + item.heureFin : ''}</span>` : ''}
                                ${item.activite}
                            </div>
                            <div class="admin-list-item-detail">
                                ${item.lieu ? '📍 ' + item.lieu : ''}
                                ${item.notes ? ' • ' + item.notes : ''}
                            </div>
                        </div>
                        <div class="admin-list-item-actions">
                            <button class="btn-edit-small" onclick="editPlanningItem(${realIndex})">✏️</button>
                            <button class="btn-delete-small" onclick="deletePlanningItem(${realIndex})">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function openAddPlanningItemModal() {
    currentEditingPlanningItem = null;
    document.getElementById('planningItemModalTitle').textContent = 'Nouvel élément';
    document.getElementById('planningItemForm').reset();
    document.getElementById('planningItemId').value = '';
    document.getElementById('planningItemModal').classList.add('active');
}

function closePlanningItemModal() {
    document.getElementById('planningItemModal').classList.remove('active');
    currentEditingPlanningItem = null;
}

function editPlanningItem(index) {
    const item = window.currentTechSpectacle.tech.planning[index];
    if (!item) return;
    
    currentEditingPlanningItem = index;
    document.getElementById('planningItemModalTitle').textContent = 'Modifier l\'élément';
    document.getElementById('planningItemId').value = item.id || '';
    document.getElementById('planningItemHeureDebut').value = item.heureDebut || '';
    document.getElementById('planningItemHeureFin').value = item.heureFin || '';
    document.getElementById('planningItemActivite').value = item.activite || '';
    document.getElementById('planningItemLieu').value = item.lieu || '';
    document.getElementById('planningItemNotes').value = item.notes || '';
    
    document.getElementById('planningItemModal').classList.add('active');
}

function savePlanningItem(event) {
    event.preventDefault();
    if (!window.currentTechSpectacle) return;
    
    const activite = document.getElementById('planningItemActivite').value.trim();
    if (!activite) return;
    
    const itemData = {
        id: document.getElementById('planningItemId').value || Date.now().toString(),
        heureDebut: document.getElementById('planningItemHeureDebut').value,
        heureFin: document.getElementById('planningItemHeureFin').value,
        activite: activite,
        lieu: document.getElementById('planningItemLieu').value.trim(),
        notes: document.getElementById('planningItemNotes').value.trim()
    };
    
    if (currentEditingPlanningItem !== null) {
        window.currentTechSpectacle.tech.planning[currentEditingPlanningItem] = itemData;
    } else {
        window.currentTechSpectacle.tech.planning.push(itemData);
    }
    
    saveProjectsAsync();
    closePlanningItemModal();
    renderTechPlanning();
}

function deletePlanningItem(index) {
    if (!window.currentTechSpectacle) return;
    if (!confirm('Supprimer cet élément ?')) return;
    window.currentTechSpectacle.tech.planning.splice(index, 1);
    saveProjectsAsync();
    renderTechPlanning();
}

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
}

/* ========== ANCIEN CODE GOOGLE DRIVE (COMMENTÉ - PLUS UTILISÉ) ==========
function handleGoogleAuth() {
    // Vérifier que tokenClient est initialisé
    if (!tokenClient) {
        console.error('tokenClient n\'est pas encore initialisé. Veuillez attendre le chargement des scripts Google.');
        alert('Les scripts Google ne sont pas encore chargés. Veuillez patienter quelques instants et réessayer.');
        return;
    }

    // Vérifier que gapi est chargé
    if (!gapi || !gapi.client) {
        console.error('gapi n\'est pas encore chargé.');
        alert('Les scripts Google ne sont pas encore chargés. Veuillez patienter quelques instants et réessayer.');
        return;
    }

    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        accessToken = gapi.client.getToken().access_token;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        
        // Afficher le menu latéral après connexion
        document.getElementById('sidebar').classList.add('logged-in');
        document.getElementById('mainContent').classList.add('logged-in');
        
        // CES APPELS SONT DÉSACTIVÉS - Utiliser le nouveau système de connexion
        // await loadSettings();
        // await loadProjects();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}
*/

/** Mis à true par sanitizeProjects si des dossiers orphelins ont été réparés (pour sauvegarde auto). */
let _sanitizeFolderRepairDirty = false;

// Nettoyer les données corrompues : convertir les tableaux [] en objets {} pour les champs qui doivent être des objets
function sanitizeProjects(projectsList) {
    _sanitizeFolderRepairDirty = false;
    return projectsList.map(p => {
        // Corriger tech : doit être un objet {}, pas un tableau []
        if (Array.isArray(p.tech)) {
            console.warn('[Sanitize] Projet', p.id, p.name, ': tech était un tableau [], converti en {}');
            p.tech = {};
        }
        if (p.tech && typeof p.tech === 'object' && !Array.isArray(p.tech)) {
            // Corriger les sous-objets de tech
            if (Array.isArray(p.tech.notes)) p.tech.notes = {};
        }
        
        // Synchroniser le lieu entre spectacle.lieuId et spectacle.tech.lieuId
        if (p.type !== 'tournee') {
            if (!p.tech || Array.isArray(p.tech)) p.tech = {};
            if (p.lieuId && !p.tech.lieuId) {
                // Le lieu existe sur le spectacle mais pas dans tech → copier vers tech
                p.tech.lieuId = p.lieuId;
            } else if (p.tech.lieuId && !p.lieuId) {
                // Le lieu existe dans tech mais pas sur le spectacle → copier vers spectacle
                p.lieuId = p.tech.lieuId;
            }
        }
        
        // Corriger budget : chaque entrée doit être un objet
        if (p.budget && Array.isArray(p.budget)) {
            p.budget = p.budget.map(b => {
                if (Array.isArray(b)) return {};
                return b;
            });
        }
        // billetterie est un tableau de catégories de billets — ne pas le convertir en objet
        // Mais s'assurer que c'est bien un tableau
        if (p.billetterie && !Array.isArray(p.billetterie)) {
            // Si c'est un objet vide {} → reconvertir en tableau []
            if (typeof p.billetterie === 'object' && Object.keys(p.billetterie).length === 0) {
                p.billetterie = [];
            }
        }
        if (ensureFoldersAndFolderIds(p)) {
            _sanitizeFolderRepairDirty = true;
        }
        return p;
    });
}

async function loadProjects() {
    // Vérifier que l'authentification a été vérifiée ET réussie
    if (!authChecked) {
        console.error('loadProjects: ERREUR - Authentification pas encore vérifiée !');
        return;
    }
    
    if (!isAuthenticated) {
        console.log('loadProjects: Utilisateur non authentifié, chargement annulé');
        return;
    }
    
    // Double vérification des variables
    if (!authToken || !currentUser) {
        console.error('loadProjects: ERREUR - Variables d\'authentification manquantes malgré isAuthenticated=true !', { authToken: !!authToken, currentUser: !!currentUser });
        return;
    }
    
    console.log('loadProjects: Début du chargement des projets');
    
    try {
        const data = await apiCall('projects.php', 'GET');
        if (data.projects && Array.isArray(data.projects)) {
            projects = sanitizeProjects(data.projects);
            lastProjectsHash = quickHash(projects);
            if (_sanitizeFolderRepairDirty && typeof saveProjectsAsync === 'function') {
                saveProjectsAsync();
            }
        } else {
            projects = [];
            lastProjectsHash = '';
        }
        
        renderProjects();
        renderHomeTasksWidget();
        
        // Migration automatique vers le catalogue (une seule fois)
        if (typeof migrateToCatalogue === 'function') {
            setTimeout(() => migrateToCatalogue(), 500);
        }
    } catch (error) {
        console.error('Erreur:', error);
        projects = [];
        lastProjectsHash = '';
        renderProjects();
        renderHomeTasksWidget();
    }
}

if (!window.refreshIntervalId) {
    window.refreshIntervalId = null;
}
if (!window.REFRESH_INTERVAL_ACTIVE) {
    window.REFRESH_INTERVAL_ACTIVE = 8000;
}
if (!window.REFRESH_INTERVAL_HIDDEN) {
    window.REFRESH_INTERVAL_HIDDEN = 30000;
}

function getProjectById(id) {
    if (!id || !projects || !projects.length) return null;
    const flat = projects.find(p => String(p.id) === String(id));
    if (flat) return { ...flat, type: flat.type || (flat.spectacles ? 'tournee' : 'spectacle') };
    for (const t of projects) {
        if (t.spectacles && Array.isArray(t.spectacles)) {
            const s = t.spectacles.find(s => String(s.id) === String(id));
            if (s) return { ...s, type: 'spectacle', tourneeName: t.nom };
        }
    }
    return null;
}

// Hash rapide pour comparer les données sans tout parser
function quickHash(obj) {
    if (obj === null || obj === undefined) return '0';
    try {
        const str = JSON.stringify(obj);
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            h = ((h << 5) - h) + c;
            h = h & h;
        }
        return String(h);
    } catch (e) { return '0'; }
}

function getActivePage() {
    // Prioriser les pages de détail (qui sont au-dessus des pages liste)
    // Ordre de priorité : pages les plus profondes d'abord
    const priorityPages = ['techPage', 'budgetPage', 'billetteriePage', 'spectaclePage', 'tourneePage', 'globalTasksPage', 'projectTasksPage', 'projectsListPage'];
    for (const pid of priorityPages) {
        const el = document.getElementById(pid);
        if (el && el.classList.contains('active')) return pid;
    }
    // Pages bureau
    const bureau = document.querySelector('.bureau-page.active');
    if (bureau) return bureau.id || 'myBureauPage';
    // Pages admin/users
    const usersPage = document.getElementById('usersPage');
    if (usersPage && usersPage.classList.contains('active')) return 'usersPage';
    return '';
}

function refreshActiveView() {
    // Délègue à refreshCurrentView qui gère le snapshot et le rafraîchissement intelligent
    refreshCurrentView();
}

function refreshCurrentView(fromSync) {
    // Si appelé par le sync automatique : ne pas rafraîchir si l'utilisateur est en train de saisir
    if (fromSync) {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
            return;
        }
        // Désactiver les animations pendant le refresh sync
        document.body.classList.add('sync-refresh');
    }
    
    try {
    // Rafraîchir uniquement la page active
    const pageId = getActivePage();
    
    if (pageId === 'spectaclePage' && typeof window.currentSpectacleDetail !== 'undefined' && window.currentSpectacleDetail?.id) {
        const fresh = getProjectById(window.currentSpectacleDetail.id);
        if (fresh) { window.currentSpectacleDetail = fresh; if (typeof viewSpectacle === 'function') viewSpectacle(window.currentSpectacleDetail.id); }
        return;
    }
    if (pageId === 'tourneePage' && typeof currentTournee !== 'undefined' && currentTournee?.id) {
        const fresh = getProjectById(currentTournee.id);
        if (fresh) { currentTournee = fresh; if (typeof viewTournee === 'function') viewTournee(currentTournee.id); }
        return;
    }
    if (pageId === 'budgetPage' && typeof currentBudgetSpectacle !== 'undefined' && currentBudgetSpectacle?.id) {
        const fresh = getProjectById(currentBudgetSpectacle.id);
        if (fresh) { currentBudgetSpectacle = fresh; if (typeof renderBudgetSections === 'function') { renderBudgetSections(); renderApportsSection(); updateBudgetTotals(); renderCategoryTasks(currentBudgetSpectacle.id, 'Budget', 'budgetTasksList'); } }
        return;
    }
    if (pageId === 'techPage' && typeof window.currentTechSpectacle !== 'undefined' && window.currentTechSpectacle?.id) {
        const fresh = getProjectById(window.currentTechSpectacle.id);
        if (fresh) { window.currentTechSpectacle = fresh; if (typeof openTechPage === 'function') openTechPage(window.currentTechSpectacle.id); }
        return;
    }
    if (pageId === 'billetteriePage' && typeof currentBilletterieSpectacle !== 'undefined' && currentBilletterieSpectacle?.id) {
        const fresh = getProjectById(currentBilletterieSpectacle.id);
        if (fresh) { currentBilletterieSpectacle = fresh; if (typeof renderBilletterie === 'function') { renderBilletterie(); renderCategoryTasks(currentBilletterieSpectacle.id, 'Billetterie', 'billetterieTasksList'); } }
        return;
    }
    if (pageId === 'globalTasksPage' && typeof renderGlobalTasksPage === 'function') {
        renderGlobalTasksPage();
        return;
    }
    if (pageId === 'projectTasksPage' && typeof currentTasksProject !== 'undefined' && currentTasksProject?.id) {
        const fresh = getProjectById(currentTasksProject.id);
        if (fresh) { currentTasksProject = fresh; if (typeof renderProjectTasks === 'function') renderProjectTasks(); }
        return;
    }
    if (pageId === 'projectsListPage') {
        if (typeof renderProjectsListPage === 'function') renderProjectsListPage();
        if (typeof renderSidebarTree === 'function') renderSidebarTree();
        return;
    }
    if (pageId === 'usersPage') {
        if (typeof loadUsersList === 'function') loadUsersList();
        return;
    }
    if (document.querySelector('.bureau-page.active')) {
        if (typeof loadMyBureauData === 'function') loadMyBureauData();
        return;
    }
    
    // Page d'accueil
    renderProjects();
    renderHomeTasksWidget();
    if (typeof updateHomeTiles === 'function') updateHomeTiles();
    } finally {
        // Réactiver les animations après le paint complet
        if (fromSync) {
            setTimeout(() => { document.body.classList.remove('sync-refresh'); }, 50);
        }
    }
}

async function refreshFromServer() {
    if (!isAuthenticated || !authToken) return;
    try {
        const [projectsRes, notifRes, personalTasksRes] = await Promise.all([
            apiCall('projects.php', 'GET'),
            apiCall('notifications.php', 'GET'),
            apiCall('personal_tasks.php', 'GET').catch(() => ({ tasks: [] }))
        ]);
        const newProjects = projectsRes?.projects && Array.isArray(projectsRes.projects) ? sanitizeProjects(projectsRes.projects) : [];
        const projectsChanged = JSON.stringify(newProjects) !== JSON.stringify(projects);
        if (projectsChanged) {
            projects = newProjects;
            refreshCurrentView();
        }
        if (notifRes?.success && Array.isArray(notifRes.notifications)) {
            const newNotifs = notifRes.notifications.map(n => ({
                id: 'api_' + n.id,
                title: n.title || '',
                message: n.message || '',
                type: n.type || 'info',
                read: !!(n.read ?? n.read_flag),
                createdAt: n.created_at || n.createdAt
            }));
            if (JSON.stringify(newNotifs) !== JSON.stringify(notifications)) {
                notifications = newNotifs;
                renderNotificationsDropdown();
            }
        }
        if (personalTasksRes?.success && Array.isArray(personalTasksRes.tasks)) {
            const newTasks = personalTasksRes.tasks.map(t => ({
                id: t.id, title: t.title, description: t.description || '', category: t.category || '',
                priority: t.priority || 'medium', dueDate: t.dueDate, assignedTo: t.assignedTo ? String(t.assignedTo) : null,
                completed: !!t.completed, status: t.status, createdAt: t.createdAt, createdBy: t.createdBy
            }));
            if (JSON.stringify(newTasks) !== JSON.stringify(myBureau.tasks || [])) {
                myBureau.tasks = newTasks;
                if (typeof refreshUserTasksViews === 'function') refreshUserTasksViews();
                else if (document.getElementById('myBureauPage')?.classList.contains('active')) renderMyBureauTasks();
            }
        }
    } catch (e) { /* ignorer erreurs silencieuses du polling */ }
}

async function syncFromServer() {
    if (!isAuthenticated || !authToken || isSyncing) return;
    // Ne JAMAIS sync pendant une sauvegarde ou juste après
    if (isSaving) {
        console.log('[Sync] Sauvegarde en cours, sync reporté');
        return;
    }
    if (Date.now() - lastSaveTimestamp < 5000) {
        console.log('[Sync] Sauvegarde récente, sync reporté');
        return;
    }
    isSyncing = true;
    try {
        const now = Date.now();
        
        // 1. Sync projets
        const projectsRes = await apiCall('projects.php', 'GET').catch((e) => { 
            console.warn('[Sync] Erreur projects.php:', e.message); 
            return null; 
        });
        // Re-vérifier après l'await (une sauvegarde a pu démarrer entre-temps)
        if (isSaving || Date.now() - lastSaveTimestamp < 5000) {
            console.log('[Sync] Sauvegarde détectée pendant le sync, abandon');
            return;
        }
        const newProjects = projectsRes?.projects && Array.isArray(projectsRes.projects) ? sanitizeProjects(projectsRes.projects) : null;
        if (newProjects) {
            const newHash = quickHash(newProjects);
            if (newHash !== lastProjectsHash) {
                projects = newProjects;
                lastProjectsHash = newHash;
                refreshCurrentView(true);
            }
        }
        
        // 2. Sync utilisateurs (toutes les 5s) — réservé aux admins (users.php retourne 403 pour les non-admins)
        if (now - lastUsersSyncTime >= 5000) {
            lastUsersSyncTime = now;
            let userData = null;
            if (currentUser && currentUser.role === 'admin') {
                userData = await apiCall('users.php', 'GET').catch(() => null);
            }
            if (userData?.users && Array.isArray(userData.users)) {
                const newHash = quickHash(userData.users);
                if (newHash !== lastUsersHash) {
                    console.log('[Sync] Utilisateurs/permissions mis à jour');
                    lastUsersHash = newHash;
                    const me = userData.users.find(u => String(u.id) === String(currentUser?.id));
                    if (me && me.permissions) {
                        currentUser.permissions = me.permissions;
                        if (typeof applyPermissions === 'function') applyPermissions();
                    }
                    if (typeof loadUsersForAssignments === 'function') loadUsersForAssignments();
                    if (getActivePage() === 'usersPage' && typeof loadUsersList === 'function') loadUsersList();
                }
            }
        }
        
        // 3. Sync settings (toutes les 5s)
        if (now - lastSettingsSyncTime >= 5000) {
            lastSettingsSyncTime = now;
            const settingsRes = await apiCall('settings.php', 'GET').catch(() => null);
            const settingsData = settingsRes?.settings || settingsRes;
            if (settingsData && typeof settingsData === 'object') {
                const newHash = quickHash(settingsData);
                if (newHash !== lastSettingsHash) {
                    lastSettingsHash = newHash;
                    Object.assign(appSettings, settingsData);
                }
            }
            // Stores dédiés (hors settings) — multi-onglets
            if (typeof loadCatalogueData === 'function') await loadCatalogueData().catch(() => {});
            if (typeof loadCrmData === 'function') await loadCrmData().catch(() => {});
        }
        
        // 4. Sync notifications
        if (typeof loadNotifications === 'function') {
            loadNotifications().then(() => {
                if (typeof renderNotificationsDropdown === 'function') renderNotificationsDropdown();
            }).catch(() => {});
        }

        // 5. Sync tâches utilisateur (bureau, projets, CRM) — mise à jour compteur + widgets
        if (typeof syncUserTasksFromServer === 'function') {
            await syncUserTasksFromServer();
        }
    } catch (e) { 
        console.warn('[Sync] Erreur:', e.message); 
    } finally {
        isSyncing = false;
    }
}

function startSync() {
    stopSync();
    syncInterval = setInterval(syncFromServer, 5000);
    console.log('[Sync] ✅ Synchronisation temps réel activée (toutes les 5s)');
}

function stopSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

document.addEventListener('visibilitychange', function() {
    if (!isAuthenticated) return;
    if (document.hidden) {
        stopSync();
    } else {
        // Sync immédiat au retour sur l'onglet (sauf si sauvegarde en cours)
        if (!isSaving) syncFromServer();
        startSync();
    }
});

// (Ancien système startAutoRefresh retiré — remplacé par startSync/syncFromServer)

/* ========== ANCIEN CODE GOOGLE DRIVE (COMMENTÉ) ==========
async function loadProjects() {
    try {
        const response = await gapi.client.drive.files.list({
            q: "name='gestion-spectacles-v2.json'",
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (response.result.files && response.result.files.length > 0) {
            const fileId = response.result.files[0].id;
            const fileContent = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            projects = JSON.parse(fileContent.body);
        } else {
            projects = [];
        }
        
        renderProjects();
        renderHomeTasksWidget();
    } catch (error) {
        console.error('Erreur:', error);
        projects = [];
        renderProjects();
        renderHomeTasksWidget();
    }
}
*/

async function saveProjects() {
    isSaving = true;
    lastSaveTimestamp = Date.now();
    const indicator = document.getElementById('saveIndicator');
    const indicatorText = document.getElementById('saveIndicatorText');
    const spinner = indicator.querySelector('.save-spinner');
    
    // Afficher l'indicateur
    indicator.classList.remove('success', 'error');
    indicator.classList.add('show');
    spinner.style.display = 'block';
    indicatorText.textContent = 'Sauvegarde en cours...';
    
    try {
        // Préparer les projets avec leurs IDs et optimiser (retirer base64 des fichiers externes)
        const projectsToSave = projects.map(p => {
            const project = {
                ...p,
                id: p.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
            };
            project.visuelsFolders = Array.isArray(project.visuelsFolders) ? project.visuelsFolders : [];
            project.documentsFolders = Array.isArray(project.documentsFolders) ? project.documentsFolders : [];

            // Optimiser : retirer base64 des fichiers stockés externe pour réduire la taille
            if (project.visuels) {
                project.visuels = project.visuels.map(v => {
                    if (v.stored_externally || v.file_id) {
                        // Fichier externe : ne garder que les métadonnées, pas le base64
                        const { base64, ...rest } = v;
                        return rest;
                    }
                    return v; // Fichier base64 : garder tout
                });
            }
            
            if (project.documents) {
                project.documents = project.documents.map(d => {
                    if (d.stored_externally || d.file_id) {
                        // Fichier externe : ne garder que les métadonnées, pas le base64
                        const { base64, ...rest } = d;
                        return rest;
                    }
                    return d; // Fichier base64 : garder tout
                });
            }
            
            // Optimiser les fichiers de budget
            if (project.budget) {
                project.budget = project.budget.map(line => {
                    const optimizedLine = { ...line };
                    if (line.devis && (line.devis.stored_externally || line.devis.file_id)) {
                        const { base64, ...rest } = line.devis;
                        optimizedLine.devis = rest;
                    }
                    if (line.facture && (line.facture.stored_externally || line.facture.file_id)) {
                        const { base64, ...rest } = line.facture;
                        optimizedLine.facture = rest;
                    }
                    return optimizedLine;
                });
            }
            
            return project;
        });
        
        // Analyser la taille des données avant optimisation
        let totalBase64Size = 0;
        let totalFiles = 0;
        let externalFiles = 0;
        let base64Files = 0;
        
        projects.forEach(p => {
            if (p.visuels) {
                p.visuels.forEach(v => {
                    totalFiles++;
                    if (v.stored_externally || v.file_id) {
                        externalFiles++;
                    } else if (v.base64) {
                        base64Files++;
                        totalBase64Size += (v.base64.length * 3) / 4; // Approximation base64
                    }
                });
            }
            if (p.documents) {
                p.documents.forEach(d => {
                    totalFiles++;
                    if (d.stored_externally || d.file_id) {
                        externalFiles++;
                    } else if (d.base64) {
                        base64Files++;
                        totalBase64Size += (d.base64.length * 3) / 4;
                    }
                });
            }
            if (p.budget) {
                p.budget.forEach(line => {
                    if (line.devis) {
                        totalFiles++;
                        if (line.devis.stored_externally || line.devis.file_id) {
                            externalFiles++;
                        } else if (line.devis.base64) {
                            base64Files++;
                            totalBase64Size += (line.devis.base64.length * 3) / 4;
                        }
                    }
                    if (line.facture) {
                        totalFiles++;
                        if (line.facture.stored_externally || line.facture.file_id) {
                            externalFiles++;
                        } else if (line.facture.base64) {
                            base64Files++;
                            totalBase64Size += (line.facture.base64.length * 3) / 4;
                        }
                    }
                });
            }
        });
        
        console.log('saveProjects: Analyse des fichiers:', {
            totalFiles,
            externalFiles,
            base64Files,
            totalBase64SizeMB: (totalBase64Size / (1024 * 1024)).toFixed(2)
        });
        
        // Calculer la taille approximative des données
        const jsonString = JSON.stringify({ projects: projectsToSave });
        const sizeMB = (new Blob([jsonString]).size) / (1024 * 1024);
        const sizeBytes = new Blob([jsonString]).size;
        console.log('saveProjects: Taille des données à sauvegarder:', sizeMB.toFixed(2), 'MB', `(${sizeBytes.toLocaleString()} bytes)`);
        
        // Limites de taille (augmentées car on optimise maintenant)
        // Note: La limite PHP post_max_size doit être configurée en conséquence côté serveur
        // Recommandation : post_max_size >= 20MB et upload_max_filesize >= 20MB dans php.ini
        const MAX_SIZE_MB = 15; // Limite augmentée (nécessite post_max_size >= 18MB côté serveur)
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
        
        if (sizeBytes > MAX_SIZE_BYTES) {
            // Calculer combien de fichiers base64 il faudrait déplacer
            const excessMB = sizeMB - MAX_SIZE_MB;
            const excessBytes = sizeBytes - MAX_SIZE_BYTES;
            const avgBase64FileSize = base64Files > 0 ? totalBase64Size / base64Files : 0;
            const filesToMove = avgBase64FileSize > 0 ? Math.ceil(excessBytes / avgBase64FileSize) : 0;
            
            let errorMsg = `Les données sont trop volumineuses (${sizeMB.toFixed(2)} MB). La limite est de ${MAX_SIZE_MB} MB.\n\n`;
            errorMsg += `📊 Analyse :\n`;
            errorMsg += `   • ${base64Files} fichiers en base64 (${(totalBase64Size / (1024 * 1024)).toFixed(2)} MB)\n`;
            errorMsg += `   • ${externalFiles} fichiers déjà sur le serveur\n`;
            errorMsg += `   • Excès : ${excessMB.toFixed(2)} MB\n\n`;
            
            if (base64Files > 0) {
                const filesToDelete = Math.max(1, Math.ceil(filesToMove * 1.2)); // Marge de sécurité
                errorMsg += `💡 Solutions :\n`;
                errorMsg += `   1. Lancez la migration base64 → serveur dans Administration > Stockage\n`;
                errorMsg += `   2. Contactez l'administrateur pour augmenter la limite serveur (post_max_size)\n`;
                errorMsg += `   3. Tous les nouveaux fichiers sont automatiquement stockés sur le serveur\n`;
            } else {
                errorMsg += `💡 Solution : Contactez l'administrateur pour augmenter la limite serveur (post_max_size dans php.ini).`;
            }
            
            console.error('saveProjects: Données trop volumineuses', {
                sizeMB: sizeMB.toFixed(2),
                maxMB: MAX_SIZE_MB,
                base64Files,
                externalFiles,
                totalBase64SizeMB: (totalBase64Size / (1024 * 1024)).toFixed(2),
                excessMB: excessMB.toFixed(2)
            });
            
            throw new Error(errorMsg);
        }
        
        if (sizeMB > 10) {
            console.warn('saveProjects: Données très volumineuses (>10MB), la sauvegarde peut prendre du temps');
        } else if (sizeMB > 5) {
            console.warn('saveProjects: Données volumineuses (>5MB), la sauvegarde peut prendre du temps');
        }
        
        const response = await apiCall('projects.php', 'POST', { projects: projectsToSave });
        console.log('saveProjects: Sauvegarde réussie', response);
        
        lastProjectsHash = quickHash(projects);
        
        // Succès
        spinner.style.display = 'none';
        indicator.classList.add('success');
        indicatorText.textContent = '✓ Sauvegardé';
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
        spinner.style.display = 'none';
        indicator.classList.add('error');
        indicatorText.textContent = '✗ Erreur de sauvegarde';
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 3000);
    } finally {
        isSaving = false;
        lastSaveTimestamp = Date.now();
    }
}

// Version non-bloquante de saveProjects
function saveProjectsAsync() {
    saveProjects(); // Lance la sauvegarde sans attendre
}

// Fonction pour uploader un fichier (tout va sur le serveur, plus de base64)
async function uploadFile(file, type = 'documents') {
    try {
        if (!authToken) {
            throw new Error('Token d\'authentification manquant. Veuillez vous reconnecter.');
        }
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('token', authToken);
        
        const response = await fetch(`${API_URL}/upload.php`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'X-Auth-Token': authToken
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erreur upload serveur: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.file_id) {
            throw new Error(data.error || 'Réponse invalide du serveur');
        }
        
        return {
            name: file.name,
            file_id: data.file_id,
            url: `${API_URL}/${data.url}`,
            downloadUrl: `${API_URL}/${data.url}`,
            stored_externally: true,
            fileName: data.original_name || file.name,
            fileType: data.mime_type || file.type || 'application/octet-stream',
            fileSize: data.size || file.size
        };
    } catch (error) {
        console.error('Erreur upload serveur:', error);
        throw error;
    }
}

// Fonction pour obtenir l'URL d'affichage d'un fichier (rétro-compatible)
function getFileDisplayUrl(file) {
    if (!file) return '';
    
    // Vérifier qu'une valeur n'est pas un simple nom de fichier (corruption de données)
    const isValidUrl = (val) => {
        if (!val || typeof val !== 'string') return false;
        return val.startsWith('data:') || val.startsWith('http') || val.startsWith('/') ||
               val.includes('download.php') || val.includes('api/');
    };

    const rawUrl = file.url || file.downloadUrl || '';
    if (rawUrl && typeof rawUrl === 'string' && rawUrl.includes('download.php')) {
        if (typeof resolveMediaUrl === 'function') {
            const resolved = resolveMediaUrl(rawUrl, file.file_id);
            if (resolved) return resolved;
        }
    }
    
    // Si c'est un fichier stocké externe
    if (file.stored_externally || file.file_id) {
        if (typeof resolveMediaUrl === 'function') {
            const resolved = resolveMediaUrl(file.url || file.downloadUrl, file.file_id);
            if (resolved) return resolved;
        }
        if (file.file_id && typeof getDownloadFileUrl === 'function') {
            return getDownloadFileUrl(file.file_id);
        }
        const url = file.url || file.downloadUrl || `${typeof API_URL !== 'undefined' ? API_URL : 'api'}/download.php?id=${file.file_id}`;
        return isValidUrl(url) ? url : '';
    }
    
    // Sinon, utiliser base64 (rétro-compatibilité)
    let data = file.base64 || file.url || file.downloadUrl || '';
    if (!data) return '';
    // Si ce n'est pas une URL valide (ex: nom de fichier stocké par erreur), ignorer
    if (!isValidUrl(data) && !/^[A-Za-z0-9+/=]+$/.test(data)) return '';
    // Pour base64 brut, ajouter le préfixe data: requis pour l'affichage img
    if (!data.startsWith('data:')) {
        const mime = file.fileType || file.type || 'image/jpeg';
        data = `data:${mime};base64,${data}`;
    }
    return data;
}

// Fonction pour télécharger un fichier (gère base64 et fichiers externes)
async function downloadFile(file, index) {
    try {
        // Si fichier stocké externe, rediriger vers l'URL de téléchargement
        if (file.stored_externally || file.file_id) {
            const url = (file.file_id && typeof getDownloadFileUrl === 'function')
                ? getDownloadFileUrl(file.file_id)
                : (file.url || file.downloadUrl || `${API_URL}/download.php?id=${file.file_id}`);
            window.open(url, '_blank');
            return;
        }
        
        // Sinon, utiliser la logique base64 existante
        const base64 = file.base64 || file.downloadUrl || file.url;
        if (!base64) {
            showErrorModal('Erreur', 'Impossible de télécharger ce fichier : données manquantes.');
            return;
        }

        // Extraire le type MIME et les données base64
        let mimeType = file.type || file.fileType || 'application/octet-stream';
        let base64Data = base64;

        // Si c'est un data URL (data:application/...;base64,...)
        if (base64.startsWith('data:')) {
            const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                mimeType = matches[1];
                base64Data = matches[2];
            } else {
                const dataMatch = base64.match(/^data:([^,]+),(.+)$/);
                if (dataMatch) {
                    mimeType = dataMatch[1];
                    base64Data = dataMatch[2];
                }
            }
        }

        // Convertir base64 en blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        // Créer un lien de téléchargement temporaire
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.fileName || file.name || file.titre || `fichier_${index + 1}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Libérer l'URL après un court délai
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
        console.error('Erreur lors du téléchargement:', error);
        showErrorModal('Erreur', `Impossible de télécharger le fichier: ${error.message}`);
    }
}

/** Récupère le contenu binaire d'un fichier (visuel/document) pour l'ajouter au ZIP. */
async function getFileContentForZip(file) {
    if (!file) return null;
    try {
        if (file.base64) {
            let b64 = file.base64;
            if (b64.startsWith('data:')) {
                const m = b64.match(/^data:[^;]+;base64,(.+)$/);
                b64 = m ? m[1] : b64;
            }
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr.buffer;
        }
        const url = (file.file_id && typeof getDownloadFileUrl === 'function')
            ? getDownloadFileUrl(file.file_id)
            : (file.url || file.downloadUrl || (typeof API_URL !== 'undefined' && file.file_id ? `${API_URL}/download.php?id=${file.file_id}` : null));
        if (url) {
            const fetchHeaders = {};
            if (typeof authToken !== 'undefined' && authToken) {
                fetchHeaders['Authorization'] = 'Bearer ' + authToken;
                fetchHeaders['X-Auth-Token'] = authToken;
            }
            const res = await fetch(url, { credentials: 'include', headers: fetchHeaders });
            if (res.ok) return await res.arrayBuffer();
        }
    } catch (e) { console.warn('getFileContentForZip:', file.fileName || file.name, e); }
    return null;
}

/** Génère un fichier Excel (donnees.xlsx) pour consultation facile. */
function buildBackupXlsx(project, isTournee) {
    if (!project || typeof XLSX === 'undefined') return null;
    const wb = XLSX.utils.book_new();
    const getFolderName = (data, itemType, folderId) => {
        const arr = itemType === 'visuel' ? (data.visuelsFolders || []) : (data.documentsFolders || []);
        const f = arr.find(x => x.id === folderId);
        return f ? (f.name || 'Dossier') : '';
    };
    const lieuDisplay = (p) => {
        if (p?.lieuId && typeof appSettings !== 'undefined' && appSettings?.lieux) {
            const lieu = appSettings.lieux.find(l => l.id === p.lieuId);
            if (lieu) return lieu.ville ? `${lieu.nom} - ${lieu.ville}` : lieu.nom;
        }
        if (p?.tech?.lieuId && typeof getLieuById === 'function') {
            const lieu = getLieuById(p.tech.lieuId);
            if (lieu) return lieu.ville ? `${lieu.nom} - ${lieu.ville}` : lieu.nom;
        }
        return p?.location ? (p.city ? `${p.location} - ${p.city}` : p.location) : '';
    };

    const resumeData = [
        ['Champ', 'Valeur'],
        ['Nom', project.name || ''],
        ['Type', isTournee ? 'Tournée' : 'Spectacle'],
        ['Date', project.date || ''],
        ['Heure', project.time || ''],
        ['Lieu', lieuDisplay(project)],
        ['Mode exploitation', project.modeExploitation || ''],
        ['Capacité', project.capacite || ''],
        ['Équipe', (project.members || []).length + (project.membersManual || []).length]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumeData), 'Résumé');

    if (project.budget && project.budget.length) {
        const budgetRows = project.budget.map(b => ({
            Désignation: b.designation || '',
            Catégorie: b.category || '',
            Type: b.montantType || '',
            Montant: b.montantFixe ?? b.percentBilletterie ?? '',
            TVA: b.tvaRate ?? '',
            Estimatif: b.isEstimatif ? 'Oui' : 'Non',
            Réel: b.isReel ? 'Oui' : 'Non'
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetRows), 'Budget');
    }

    if (project.communications && project.communications.length) {
        const commRows = project.communications.map(c => ({
            Type: c.type || '',
            Date: c.date || '',
            Réseau: c.reseau || '',
            Contenu: (c.contenu || '').substring(0, 200)
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(commRows), 'Communication');
    }

    if (project.guichet) {
        const g = project.guichet;
        const billetterie = [
            ['Tarifs', 'Prix', 'Stock'],
            ...(g.tarifs || []).map(t => [t.libelle || t.nom || '', t.prix || '', t.stock || t.quantite || t.nombreDisponible || '']),
            ['', '', ''],
            ['Ventes guichet', g.ventesReelles ?? '', ''],
            ['Capacité', project.capacite || '', '']
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(billetterie), 'Billetterie');
    }

    if (project.releves && project.releves.length > 0) {
        const reseaux = project.reseaux || [];
        const headerRow = ['Date', 'Heure'];
        reseaux.forEach(r => { headerRow.push(r + ' (billets)', r + ' (CA €)'); });
        headerRow.push('Total billets', 'Total CA (€)');
        const relevesTries = [...project.releves].sort((a, b) => {
            const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
            const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
            return dtA - dtB;
        });
        const relevesData = [headerRow];
        relevesTries.forEach(r => {
            const row = [r.date || '', r.heure || ''];
            let totalBillets = 0;
            let totalCA = 0;
            reseaux.forEach(res => {
                const b = parseInt(r[res]) || 0;
                const ca = parseFloat(r[res + '_ca']) || 0;
                row.push(b, ca);
                totalBillets += b;
                totalCA += ca;
            });
            row.push(totalBillets, totalCA);
            relevesData.push(row);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(relevesData), 'Relevés');
    }

    const visuels = project.visuels || [];
    if (visuels.length) {
        const visRows = visuels.map(v => ({
            Titre: v.titre || '',
            Fichier: v.fileName || '',
            Dossier: getFolderName(project, 'visuel', v.folderId)
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visRows), 'Visuels');
    }

    const docs = project.documents || [];
    if (docs.length) {
        const docRows = docs.map(d => ({
            Nom: d.name || d.titre || '',
            Type: d.type || '',
            Dossier: getFolderName(project, 'document', d.folderId)
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docRows), 'Documents');
    }

    if (project.tech && (project.tech.prestataires?.length || project.tech.voyages?.length || project.tech.hebergements?.length)) {
        const techRows = [];
        if (project.tech.lieuId && typeof getLieuById === 'function') {
            const lieu = getLieuById(project.tech.lieuId);
            if (lieu) techRows.push({ Section: 'Lieu', Détail: lieu.ville ? `${lieu.nom} - ${lieu.ville}` : lieu.nom });
        }
        (project.tech.prestataires || []).forEach(p => {
            const presta = typeof getPrestataireById === 'function' ? getPrestataireById(p.prestataireId) : null;
            techRows.push({ Section: 'Prestataire', Détail: presta ? presta.nom : p.prestataireId, Devis: p.devis, Statut: p.statut });
        });
        (project.tech.voyages || []).forEach(v => techRows.push({ Section: 'Voyage', Détail: v.destination || '', Devis: v.devis, Statut: v.statut }));
        (project.tech.hebergements || []).forEach(h => techRows.push({ Section: 'Hébergement', Détail: h.nom || '', Devis: h.devis, Statut: h.statut }));
        if (techRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(techRows), 'Technique');
    }

    if (project.fraisFixesTournee && project.fraisFixesTournee.length) {
        const ffRows = project.fraisFixesTournee.map(f => ({ Libellé: f.libelle || '', Montant: f.montant || '' }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ffRows), 'Frais fixes');
    }

    if (isTournee) {
        const spectacles = projects.filter(p => p.parentId === project.id);
        if (spectacles.length && typeof getTotalBillets === 'function' && typeof getTotalCA === 'function') {
            const specRows = spectacles.map(s => ({
                Nom: s.name || '',
                Date: s.date || '',
                Heure: s.time || '',
                Lieu: lieuDisplay(s),
                Billets: getTotalBillets(s),
                'CA (€)': getTotalCA(s)
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(specRows), 'Spectacles');
        }
    }

    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/** Télécharge une sauvegarde ZIP complète d'un spectacle ou d'une tournée. */
async function downloadProjectBackup(project, isTournee) {
    if (!project || typeof JSZip === 'undefined') {
        if (typeof showErrorModal === 'function') showErrorModal('Erreur', 'Impossible de créer la sauvegarde. Vérifiez que JSZip est chargé.');
        return;
    }
    const slug = (project.name || 'sauvegarde').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u00C0-\u024F-]/g, '');
    const date = new Date().toISOString().slice(0, 10);
    const zip = new JSZip();

    try {
        if (typeof showToast === 'function') showToast('Préparation de la sauvegarde...', 'info');
        const btn = document.querySelector('[onclick*="downloadProjectBackup"]');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Génération...'; }

        const projectData = isTournee
            ? { tournee: project, spectacles: projects.filter(p => p.parentId === project.id) }
            : project;
        zip.file('donnees.json', JSON.stringify(projectData, null, 2));

        if (typeof XLSX !== 'undefined') {
            try {
                const xlsxBuffer = buildBackupXlsx(project, isTournee);
                if (xlsxBuffer) zip.file('donnees.xlsx', xlsxBuffer);
            } catch (e) { console.warn('buildBackupXlsx:', e); }
        }

        if (project.budget && project.budget.length) zip.file('budget.json', JSON.stringify(project.budget, null, 2));
        if (project.communications && project.communications.length) zip.file('communication.json', JSON.stringify(project.communications, null, 2));
        if (project.guichet) zip.file('billetterie.json', JSON.stringify(project.guichet, null, 2));
        if (project.tech && Object.keys(project.tech).length) zip.file('technique.json', JSON.stringify(project.tech, null, 2));
        if (project.fraisFixesTournee && project.fraisFixesTournee.length) zip.file('frais-fixes-tournee.json', JSON.stringify(project.fraisFixesTournee, null, 2));

        const getFolderName = (data, itemType, folderId) => {
            const arr = itemType === 'visuel' ? (data.visuelsFolders || []) : (data.documentsFolders || []);
            const f = arr.find(x => x.id === folderId);
            return f ? (f.name || 'Dossier').replace(/[/\\?*:|"<>]/g, '_') : 'Dossier';
        };

        const addFilesToZip = async (items, folders, itemType, basePath) => {
            if (!items || !items.length) return;
            for (const item of items) {
                const fileName = item.fileName || item.name || item.titre || `fichier_${item.id || Date.now()}`;
                const ext = (fileName.match(/\.([^.]+)$/) || ['', 'bin'])[1];
                const safeName = fileName.replace(/[/\\?*:|"<>]/g, '_');
                let path = basePath;
                if (item.folderId && folders) {
                    const folderName = getFolderName(project, itemType, item.folderId);
                    path = `${basePath}/${folderName}`;
                }
                const content = await getFileContentForZip(item);
                if (content) zip.file(`${path}/${safeName}`, content);
            }
        };

        const visuels = project.visuels || [];
        const visFolders = getFoldersForType(project, 'visuel');
        await addFilesToZip(visuels, visFolders, 'visuel', 'visuels');

        const docs = project.documents || [];
        const docFolders = getFoldersForType(project, 'document');
        await addFilesToZip(docs, docFolders, 'document', 'documents');

        if (project.files && project.files.length) {
            for (const f of project.files) {
                const content = await getFileContentForZip(f);
                if (content) zip.file(`fichiers/${f.name || 'fichier'}`, content);
            }
        }

        if (isTournee) {
            const spectacles = projects.filter(p => p.parentId === project.id);
            for (const s of spectacles) {
                const sSlug = (s.name || s.id || 'spectacle').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u00C0-\u024F-]/g, '');
                zip.file(`spectacles/${sSlug}/donnees.json`, JSON.stringify(s, null, 2));
                if (s.budget && s.budget.length) zip.file(`spectacles/${sSlug}/budget.json`, JSON.stringify(s.budget, null, 2));
                if (s.communications && s.communications.length) zip.file(`spectacles/${sSlug}/communication.json`, JSON.stringify(s.communications, null, 2));
                if (s.guichet) zip.file(`spectacles/${sSlug}/billetterie.json`, JSON.stringify(s.guichet, null, 2));
                if (s.tech && Object.keys(s.tech).length) zip.file(`spectacles/${sSlug}/technique.json`, JSON.stringify(s.tech, null, 2));
                await addFilesToZip(s.visuels || [], getFoldersForType(s, 'visuel'), 'visuel', `spectacles/${sSlug}/visuels`);
                await addFilesToZip(s.documents || [], getFoldersForType(s, 'document'), 'document', `spectacles/${sSlug}/documents`);
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sauvegarde-${slug}-${date}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);

        if (typeof showToast === 'function') showToast('Sauvegarde téléchargée avec succès', 'success');
    } catch (err) {
        console.error('downloadProjectBackup:', err);
        if (typeof showErrorModal === 'function') showErrorModal('Erreur sauvegarde', err.message || 'Impossible de créer le fichier ZIP.');
    } finally {
        document.querySelectorAll('[onclick*="downloadProjectBackup"]').forEach(btn => {
            btn.disabled = false;
            btn.textContent = '📦 Télécharger une sauvegarde';
        });
    }
}

// Fonction pour formater la date en format court (ex: "16 juin 2026")
function formatDateCourte(dateStr) {
    if (!dateStr || dateStr === 'Date non définie') return 'Date non définie';
    try {
        const date = new Date(dateStr);
        const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        return `${date.getDate()} ${mois[date.getMonth()]} ${date.getFullYear()}`;
    } catch (e) {
        return dateStr;
    }
}

// Fonction pour extraire la ville du lieu complet
function extractVille(location) {
    if (!location || location === 'Lieu non défini') return 'Lieu non défini';
    // Si le lieu contient une virgule, prendre la partie après la virgule (généralement la ville)
    const parts = location.split(',');
    return parts.length > 1 ? parts[parts.length - 1].trim() : location;
}

function renderProjects() {
    const grid = document.getElementById('projectsGrid');
    if (grid) grid.innerHTML = '';

    // Créer les cartes d'accueil
    grid.innerHTML = `
        <div class="project-card" onclick="openProjectsListPage()" style="cursor: pointer; max-width: 280px; padding: 1.5rem;">
            <h3 style="margin: 0; font-family: 'Playfair Display', serif; color: var(--primary); font-size: 1.1rem; text-align: center;">TOURNÉES ET SPECTACLES</h3>
        </div>
        <div class="project-card" onclick="openPrevisionnelsListPage()" style="cursor: pointer; max-width: 280px; padding: 1.5rem;">
            <h3 style="margin: 0; font-family: 'Playfair Display', serif; color: var(--primary); font-size: 1.1rem; text-align: center;">PRÉVISIONNELS</h3>
        </div>
    `;
    
    renderSidebarTree();
    
    if (document.getElementById('projectsListPage')?.classList.contains('active')) {
        renderProjectsListPage();
    }
}

// Ouvrir la page liste des projets
function openProjectsListPage() {
    closeAllPages();
    var home = document.getElementById('homeWelcome');
    if (home) home.style.display = 'none';
    renderProjectsListPage();
    document.getElementById('projectsListPage').classList.add('active');
    document.getElementById('projectsListPage').classList.add('page-enter');
    setTimeout(() => { const pl = document.getElementById('projectsListPage'); if (pl) pl.classList.remove('page-enter'); }, 700);
    
    if (typeof setEvenementielNavActive === 'function') setEvenementielNavActive();
    
    closeSidebarOnMobile();
    updateFabAppearance();
}

// Fermer la page liste des projets
function closeProjectsListPage() {
    document.getElementById('projectsListPage').classList.remove('active');
    if (typeof returnToEvenementielHome === 'function') returnToEvenementielHome();
    else updateFabAppearance();
}

// Rendre la page liste des projets
function renderProjectsListPage() {
    const container = document.getElementById('projectsListGrid');
    if (!container) return;
    
    container.innerHTML = '';

    let allProjects = projects.filter(p => p.type === 'tournee' || !p.parentId);
    allProjects = filterProjectsByMembership(allProjects);
    const archived = allProjects.filter(p => (p.lifecycle || '') === 'archived');
    allProjects = allProjects.filter(p => (p.lifecycle || '') !== 'archived');
    
    if (allProjects.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--mn-text-secondary); padding: 3rem;"><h2>Aucun projet pour le moment</h2><p>Cliquez sur le bouton + pour créer votre premier spectacle</p></div>';
        return;
    }
    
    const confirmed = allProjects.filter(p => (p.status || 'confirmed') === 'confirmed');
    const study = allProjects.filter(p => p.status === 'study');
    
    if (confirmed.length > 0 || study.length === 0) {
        const sectionHeader = document.createElement('div');
        sectionHeader.style.cssText = 'grid-column: 1/-1; margin-bottom: 0.5rem; margin-top: 1rem;';
        sectionHeader.innerHTML = '<h3 style="color: var(--mn-text); font-family: Playfair Display, serif; font-size: 1.3rem; display: flex; align-items: center; gap: 0.5rem;">✅ Confirmés <span style="font-size: 0.85rem; font-weight: 400; opacity: 0.7;">(' + confirmed.length + ')</span></h3>';
        container.appendChild(sectionHeader);
        if (confirmed.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'grid-column: 1/-1; text-align: center; color: var(--mn-text-light); padding: 1.5rem;';
            empty.textContent = 'Aucun projet confirmé';
            container.appendChild(empty);
        }
        confirmed.forEach(project => {
            const card = createProjectCard(project);
            if (card) container.appendChild(card);
        });
    }
    
    if (study.length > 0) {
        const sectionHeader = document.createElement('div');
        sectionHeader.style.cssText = 'grid-column: 1/-1; margin-bottom: 0.5rem; margin-top: 2rem;';
        sectionHeader.innerHTML = '<h3 style="color: var(--mn-text); font-family: Playfair Display, serif; font-size: 1.3rem; display: flex; align-items: center; gap: 0.5rem;">📋 En étude <span style="font-size: 0.85rem; font-weight: 400; opacity: 0.7;">(' + study.length + ')</span></h3>';
        container.appendChild(sectionHeader);
        study.forEach(project => {
            const card = createProjectCard(project);
            if (card) {
                card.style.opacity = '0.85';
                card.style.borderLeft = '4px solid var(--mn-yellow)';
                container.appendChild(card);
            }
        });
    }

    if (archived.length > 0) {
        const sectionHeader = document.createElement('div');
        sectionHeader.style.cssText = 'grid-column: 1/-1; margin-bottom: 0.5rem; margin-top: 2rem;';
        sectionHeader.innerHTML = '<h3 style="color: var(--mn-text); font-family: Playfair Display, serif; font-size: 1.3rem; display: flex; align-items: center; gap: 0.5rem;">🗃️ Archives <span style="font-size: 0.85rem; font-weight: 400; opacity: 0.7;">(' + archived.length + ')</span></h3>';
        container.appendChild(sectionHeader);

        const list = document.createElement('div');
        list.className = 'archives-list';
        list.style.gridColumn = '1 / -1';
        archived
            .slice()
            .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''))
            .forEach(project => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'archive-row';
                const typeLabel = project.type === 'tournee' ? 'Tournée' : 'Spectacle';
                const dateTxt = project.date || 'Date non définie';
                const archivedTxt = project.archivedAt ? formatDateCourte(project.archivedAt.slice(0, 10)) : '—';
                row.innerHTML = `
                    <span class="archive-col archive-col-name">${project.name || 'Sans nom'}</span>
                    <span class="archive-col">${typeLabel}</span>
                    <span class="archive-col">${dateTxt}</span>
                    <span class="archive-col">Archivé le ${archivedTxt}</span>
                    <span class="archive-col archive-col-action">Consulter →</span>
                `;
                row.onclick = () => {
                    if (project.type === 'tournee') viewTournee(project.id);
                    else viewSpectacle(project.id);
                };
                list.appendChild(row);
            });
        container.appendChild(list);
    }
}

function renderSidebarTree() {
    const container = document.getElementById('sidebarNavTree');
    if (!container) return;
    const esc = s => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const allVisible = filterProjectsByMembership(projects);
    const tournees = allVisible.filter(p => p.type === 'tournee');
    const isoles = allVisible.filter(p => !p.parentId && p.type !== 'tournee');
    let html = '';
    tournees.forEach(t => {
        const spectacles = projects.filter(p => p.parentId === t.id);
        const id = String(t.id);
        const name = esc(t.name || 'Sans nom');
        const hasChildren = spectacles.length > 0;
        html += '<div class="nav-tree-group" data-nav-id="' + esc(id) + '">';
        html += '<div class="nav-tree-item" data-nav-type="tournee" data-nav-id="' + esc(id) + '">';
        if (hasChildren) {
            html += '<span class="nav-tree-toggle" title="Déplier/Replier">▶</span>';
        } else {
            html += '<span class="nav-tree-toggle" style="visibility:hidden;">▶</span>';
        }
        html += '<span>' + name + '</span></div>';
        if (hasChildren) {
            html += '<div class="nav-tree-children">';
            spectacles.forEach(s => {
                const sid = String(s.id);
                const sname = esc(s.name || 'Sans nom');
                html += '<div class="nav-tree-child" data-nav-type="spectacle" data-nav-id="' + esc(sid) + '">' + sname + '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
    });
    isoles.forEach(p => {
        const id = String(p.id);
        const name = esc(p.name || 'Sans nom');
        html += '<div class="nav-tree-item nav-tree-item-isole" data-nav-type="spectacle" data-nav-id="' + esc(id) + '">';
        html += '<span class="nav-tree-toggle" style="visibility:hidden;">▶</span><span>' + name + '</span></div>';
    });
    container.innerHTML = html || '<div class="nav-tree-empty" style="padding:0.5rem 0.75rem;font-size:0.85rem;opacity:0.6;">Aucun projet</div>';
}

function toggleNavAccordionTournees() {
    const acc = document.getElementById('navAccordionTournees');
    if (!acc) return;
    acc.classList.toggle('collapsed');
}

function toggleNavAccordionAdmin() {
    const acc = document.getElementById('navAccordionAdmin');
    if (!acc) return;
    acc.classList.toggle('collapsed');
}

// Ouvrir une sous-page admin depuis le menu
function openAdminSubPageFromMenu(page) {
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Vous n\'avez pas accès à la section Administration.');
        return;
    }
    
    // Fermer toutes les pages
    closeAllPages();
    
    openAdminSubPage(page);
    closeSidebarOnMobile();
}

// Ouvrir la page utilisateurs depuis le menu
function openUsersPageFromMenu() {
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Vous n\'avez pas accès à cette section.');
        return;
    }
    openUsersPage();
    closeSidebarOnMobile();
}

// Mettre à jour la visibilité des items admin dans le menu selon le rôle
function updateAdminMenuVisibility() {
    const isAdmin = currentUser && currentUser.role === 'admin';
    const profilsItem = document.getElementById('navAdminProfils');
    const usersItem = document.getElementById('navAdminUsers');
    
    if (profilsItem) profilsItem.style.display = isAdmin ? 'block' : 'none';
    if (usersItem) usersItem.style.display = isAdmin ? 'block' : 'none';
}

function toggleNavTreeItem(toggleEl) {
    const group = toggleEl.closest('.nav-tree-group');
    if (!group) return;
    group.classList.toggle('expanded');
    toggleEl.textContent = group.classList.contains('expanded') ? '▼' : '▶';
}

function navToTournee(id) {
    const gp = document.getElementById('globalTasksPage');
    const pp = document.getElementById('projectTasksPage');
    if (gp) gp.classList.remove('active');
    if (pp) pp.classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const homeItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (homeItem) homeItem.classList.add('active');
    closeSidebarOnMobile();
    viewTournee(id);
}

function navToSpectacle(id) {
    const gp = document.getElementById('globalTasksPage');
    const pp = document.getElementById('projectTasksPage');
    if (gp) gp.classList.remove('active');
    if (pp) pp.classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const homeItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (homeItem) homeItem.classList.add('active');
    closeSidebarOnMobile();
    viewSpectacle(id);
}

function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';
    
    // Récupérer le visuel de référence
    const visuelRef = getVisuelReference(project);
    const visuelHtml = visuelRef ? `<img src="${getFileDisplayUrl(visuelRef)}" class="visuel-thumbnail" style="position: absolute; top: 15px; right: 15px; width: 50px; height: 50px; border-radius: 8px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">` : '';
    
    if (project.type === 'tournee') {
        const spectacles = projects.filter(p => p.parentId === project.id);
        // Calculer les vraies stats de billetterie
        let totalSold = 0;
        let totalCapacity = 0;
        let totalEvolution = 0;
        let hasEvolution = false;
        spectacles.forEach(s => {
            totalSold += getTotalBillets(s);
            totalCapacity += s.capacite || 0;
            if (!isSpectacleDatePast(s)) {
                const evo = getEvolutionBillets(s);
                if (evo !== null) { totalEvolution += evo; hasEvolution = true; }
            }
        });
        const percentage = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

        const statusBadgeTournee = project.status === 'study' ? '<span style="display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 600; background: var(--mn-yellow-light); color: #b7791f; margin-left: 0.5rem;">📋 En étude</span>' : '';
        card.innerHTML = `
            ${visuelHtml}
            <span class="badge badge-tournee">TOURNÉE</span>${statusBadgeTournee}
            <h3>${project.name}</h3>
            <div class="project-info">
                <div class="project-info-item">🎪 ${spectacles.length} date(s)</div>
            </div>
            ${window.hasPermission && window.hasPermission('billetterie') ? `
                <div class="mini-progress-text">${totalSold} / ${totalCapacity} ${hasEvolution ? evolutionBadgeHtml(totalEvolution, true) : ''}</div>
                <div class="mini-progress-bar">
                    <div class="mini-progress-fill" style="width: ${Math.min(percentage, 100)}%"></div>
                </div>
            ` : ''}
        `;
        
        card.onclick = () => viewTournee(project.id);
    } else if (!project.parentId) {
        // Calculer les vraies stats de billetterie
        const totalBillets = getTotalBillets(project);
        const capacite = project.capacite || 0;
        const ticketsPercentage = capacite > 0 
            ? Math.round((totalBillets / capacite) * 100) 
            : 0;
        const evolution = getEvolutionBillets(project);
        const evolutionHtmlStandalone = !isSpectacleDatePast(project) ? evolutionBadgeHtml(evolution, true) : '';
        
        // Formater la date en format court
        const dateCourte = formatDateCourte(project.date);
        // Extraire la ville du lieu
        const ville = extractVille(project.location);
        const statusBadgeSpectacle = project.status === 'study' ? '<span style="display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 600; background: var(--mn-yellow-light); color: #b7791f; margin-left: 0.5rem;">📋 En étude</span>' : '';

        card.innerHTML = `
            ${visuelHtml}
            <span class="badge">SPECTACLE</span>${statusBadgeSpectacle}
            <h3>${project.name}</h3>
            <div class="project-info">
                <div class="project-info-item">📅 ${dateCourte}</div>
                <div class="project-info-item">📍 ${ville}</div>
            </div>
            ${window.hasPermission && window.hasPermission('billetterie') ? `
                <div class="mini-progress-text">${totalBillets} / ${capacite} ${evolutionHtmlStandalone}</div>
                <div class="mini-progress-bar">
                    <div class="mini-progress-fill" style="width: ${Math.min(ticketsPercentage, 100)}%"></div>
                </div>
            ` : ''}
        `;
        
        card.onclick = () => viewSpectacle(project.id);
    } else {
        return null;
    }

    return card;
}

async function toggleTypeFields() {
    const type = document.getElementById('projectType').value;
    const parentId = document.getElementById('parentTourneeId').value;
    const nameLabel = document.getElementById('nameLabel');
    const nameInput = document.getElementById('projectName');
    const nameGroup = document.getElementById('nameGroup');
    const spectacleFields = document.getElementById('spectacleFields');
    const lieuSelect = document.getElementById('projectLieuId');
    
    if (type === 'tournee') {
        nameLabel.textContent = 'Nom de la tournée *';
        nameGroup.style.display = 'block';
        nameInput.required = true;
        spectacleFields.style.display = 'none';
        if (lieuSelect) lieuSelect.required = false;
        if (typeof showCatalogueSelector === 'function') await showCatalogueSelector(true);
    } else if (parentId) {
        nameGroup.style.display = 'none';
        nameInput.required = false;
        spectacleFields.style.display = 'block';
        if (lieuSelect) lieuSelect.required = true;
        if (typeof showCatalogueSelector === 'function') await showCatalogueSelector(true);
    } else {
        nameGroup.style.display = 'block';
        nameLabel.textContent = 'Nom du spectacle *';
        nameInput.required = true;
        spectacleFields.style.display = 'block';
        if (lieuSelect) lieuSelect.required = true;
        if (typeof showCatalogueSelector === 'function') await showCatalogueSelector(true);
    }
}

// ========== MODE D'EXPLOITATION - Fonctions ==========

function toggleModeExploitationFields() {
    const mode = document.getElementById('projectModeExploitation').value;
    const fieldsDiv = document.getElementById('modeExploitationFields');
    const prixLabel = document.getElementById('modeExploitationPrixLabel');
    const clientLabel = document.getElementById('modeExploitationClientLabel');
    
    if (mode === 'vendu') {
        fieldsDiv.style.display = 'block';
        prixLabel.textContent = 'Prix de vente (€ HT)';
        clientLabel.textContent = 'Client / Organisateur';
        populateClientSelect('projectClientId');
    } else if (mode === 'coproduction') {
        fieldsDiv.style.display = 'block';
        prixLabel.textContent = 'Part de coproduction (€ HT)';
        clientLabel.textContent = 'Coproducteur';
        populateClientSelect('projectClientId');
    } else {
        fieldsDiv.style.display = 'none';
    }
}

function populateClientSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Sélectionner un client --</option>';
    
    // Récupérer clients depuis appSettings.clients + CRM prospects
    const allClients = getAllClientsForSelect();
    allClients.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.label;
        select.appendChild(option);
    });
    
    if (currentVal) select.value = currentVal;
}

function getAllClientsForSelect() {
    const result = [];
    
    // 1. Clients dédiés (appSettings.clients)
    (appSettings.clients || []).forEach(c => {
        result.push({
            id: 'client_' + c.id,
            label: c.nom + (c.contact ? ' (' + c.contact + ')' : ''),
            source: 'clients',
            data: c
        });
    });
    
    // 2. Prospects CRM (toutes les listes)
    if (appSettings.crm && appSettings.crm.lists) {
        appSettings.crm.lists.forEach(list => {
            (list.prospects || []).forEach(p => {
                // Éviter les doublons (même organisme)
                if (!result.find(r => r.label === p.organisme)) {
                    result.push({
                        id: 'crm_' + p.id,
                        label: p.organisme + (p.contactPrenom || p.contactNom ? ' (' + (p.contactPrenom || '') + ' ' + (p.contactNom || '') + ')' : ''),
                        source: 'crm',
                        data: p
                    });
                }
            });
        });
    }
    
    // Trier par label
    result.sort((a, b) => a.label.localeCompare(b.label));
    return result;
}

function getClientById(clientId) {
    if (!clientId) return null;
    
    if (clientId.startsWith('client_')) {
        const id = clientId.replace('client_', '');
        return (appSettings.clients || []).find(c => c.id === id);
    }
    
    if (clientId.startsWith('crm_')) {
        const id = clientId.replace('crm_', '');
        if (appSettings.crm && appSettings.crm.lists) {
            for (const list of appSettings.crm.lists) {
                const prospect = (list.prospects || []).find(p => p.id === id);
                if (prospect) return prospect;
            }
        }
    }
    
    return null;
}

function getClientDisplayName(clientId) {
    if (!clientId) return 'Non défini';
    const client = getClientById(clientId);
    if (!client) return 'Client inconnu';
    return client.organisme || client.nom || 'Client';
}

// Quick Client Modal
function openQuickClientModal() {
    document.getElementById('quickClientForm').reset();
    document.getElementById('quickClientModal').classList.add('active');
}

function closeQuickClientModal() {
    document.getElementById('quickClientModal').classList.remove('active');
}

function openQuickClientModalFromEditVente() {
    window._quickClientReturnToEditVente = true;
    openQuickClientModal();
}

async function saveQuickClient(e) {
    e.preventDefault();
    const nom = document.getElementById('quickClientNom').value.trim();
    if (!nom) return;
    
    if (!appSettings.clients) appSettings.clients = [];
    
    const newClient = {
        id: 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        nom: nom,
        contact: document.getElementById('quickClientContact').value.trim(),
        telephone: document.getElementById('quickClientTelephone').value.trim(),
        email: document.getElementById('quickClientEmail').value.trim(),
        adresse: document.getElementById('quickClientAdresse').value.trim(),
        notes: document.getElementById('quickClientNotes').value.trim(),
        createdAt: new Date().toISOString()
    };
    
    appSettings.clients.push(newClient);
    
    // Sauvegarder
    try {
        if (typeof saveSettings === 'function') await saveSettings();
    } catch(err) {
        console.error('Erreur sauvegarde client:', err);
    }
    
    closeQuickClientModal();
    
    // Rafraîchir les sélecteurs de clients
    const newVal = 'client_' + newClient.id;
    
    if (window._quickClientReturnToEditVente) {
        populateClientSelect('editVenteClientId');
        document.getElementById('editVenteClientId').value = newVal;
        window._quickClientReturnToEditVente = false;
    } else {
        populateClientSelect('projectClientId');
        document.getElementById('projectClientId').value = newVal;
    }
}

// Edit Vente/Coproduction Modal (from detail page)
function openEditVenteModal(spectacleId) {
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle) return;
    
    const mode = spectacle.modeExploitation || 'organise';
    document.getElementById('editVenteModeExploitation').value = mode;
    
    // Titre adapté
    const titleEl = document.getElementById('editVenteModalTitle');
    if (mode === 'vendu') {
        titleEl.textContent = '💼 Modifier - Vente';
    } else if (mode === 'coproduction') {
        titleEl.textContent = '🤝 Modifier - Coproduction';
    } else {
        titleEl.textContent = '🧾 Mode d\'exploitation';
    }
    
    populateClientSelect('editVenteClientId');
    
    if (spectacle.vente) {
        document.getElementById('editVenteClientId').value = spectacle.vente.clientId || '';
        document.getElementById('editVentePrixVente').value = spectacle.vente.prixVente || '';
        document.getElementById('editVentePriseEnChargeVoyages').value = spectacle.vente.priseEnCharge?.voyages || 'nous';
        document.getElementById('editVentePriseEnChargeHebergement').value = spectacle.vente.priseEnCharge?.hebergement || 'nous';
        document.getElementById('editVentePriseEnChargeTechnique').value = spectacle.vente.priseEnCharge?.technique || 'nous';
    } else {
        document.getElementById('editVentePrixVente').value = '';
        document.getElementById('editVentePriseEnChargeVoyages').value = 'nous';
        document.getElementById('editVentePriseEnChargeHebergement').value = 'nous';
        document.getElementById('editVentePriseEnChargeTechnique').value = 'nous';
    }
    
    toggleEditVenteFields();
    
    window._editVenteSpectacleId = spectacleId;
    document.getElementById('editVenteModal').classList.add('active');
}

function closeEditVenteModal() {
    document.getElementById('editVenteModal').classList.remove('active');
    window._editVenteSpectacleId = null;
}

function toggleEditVenteFields() {
    const mode = document.getElementById('editVenteModeExploitation').value;
    const fieldsDiv = document.getElementById('editVenteExtraFields');
    const prixLabel = document.getElementById('editVentePrixLabel');
    const clientLabel = document.getElementById('editVenteClientLabel');
    
    if (mode === 'vendu') {
        fieldsDiv.style.display = 'block';
        prixLabel.textContent = 'Prix de vente (€ HT)';
        clientLabel.textContent = 'Client / Organisateur';
    } else if (mode === 'coproduction') {
        fieldsDiv.style.display = 'block';
        prixLabel.textContent = 'Part de coproduction (€ HT)';
        clientLabel.textContent = 'Coproducteur';
    } else {
        fieldsDiv.style.display = 'none';
    }
}

async function saveEditVente(e) {
    e.preventDefault();
    const spectacleId = window._editVenteSpectacleId;
    if (!spectacleId) return;
    
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle) return;
    
    const mode = document.getElementById('editVenteModeExploitation').value;
    spectacle.modeExploitation = mode;
    
    if (mode === 'vendu' || mode === 'coproduction') {
        spectacle.vente = {
            clientId: document.getElementById('editVenteClientId').value || null,
            prixVente: parseFloat(document.getElementById('editVentePrixVente').value) || 0,
            priseEnCharge: {
                voyages: document.getElementById('editVentePriseEnChargeVoyages').value || 'nous',
                hebergement: document.getElementById('editVentePriseEnChargeHebergement').value || 'nous',
                technique: document.getElementById('editVentePriseEnChargeTechnique').value || 'nous'
            }
        };
    } else {
        spectacle.vente = null;
    }
    
    spectacle.updatedAt = new Date().toISOString();
    saveProjectsAsync();
    closeEditVenteModal();
    
    // Rafraîchir la page de détail
    if (window.currentSpectacleDetail && window.currentSpectacleDetail.id === spectacleId) {
        viewSpectacle(spectacleId);
    }
}

function getModeExploitationLabel(mode) {
    switch (mode) {
        case 'vendu': return 'Vendu';
        case 'coproduction': return 'Coproduction';
        case 'organise':
        default: return 'Organisé';
    }
}

function getModeExploitationBadge(mode) {
    switch (mode) {
        case 'vendu': return '<span style="display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: #ebf8ff; color: #2b6cb0;">💼 Vendu</span>';
        case 'coproduction': return '<span style="display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: #e9d8fd; color: #6b46c1;">🤝 Coproduction</span>';
        case 'organise':
        default: return '<span style="display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: #c6f6d5; color: #276749;">🎭 Organisé</span>';
    }
}

function renderSpectacleContactsCard(spectacle) {
    const card = document.getElementById('spectacleDetailContactsCard');
    if (!card) return;
    const contacts = gatherSpectacleContacts(spectacle);
    card.innerHTML = `
        <div class="project-card" onclick="openSpectacleContactsPage('${spectacle.id}')" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1rem; font-weight: 600; color: var(--primary);">📇 Contacts</span>
                <span style="background: var(--light); color: var(--primary); font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; font-size: 0.85rem;">${contacts.length}</span>
            </div>
            <span style="color: var(--accent); font-size: 1.1rem;">→</span>
        </div>
    `;
}

function gatherSpectacleContacts(spectacle) {
    const contacts = [];
    
    // 1. Client / Organisateur / Coproducteur
    if (spectacle.vente && spectacle.vente.clientId) {
        const client = getClientById(spectacle.vente.clientId);
        const mode = spectacle.modeExploitation || 'organise';
        const role = mode === 'vendu' ? 'Organisateur / Client' : mode === 'coproduction' ? 'Coproducteur' : 'Client';
        if (client) {
            contacts.push({
                name: client.organisme || client.nom || 'Client',
                role: role,
                icon: '🏢',
                contact: client.contact || client.contactPrenom && client.contactNom ? ((client.contactPrenom || '') + ' ' + (client.contactNom || '')).trim() : '',
                tel: client.telephone || client.tel || '',
                email: client.email || '',
                adresse: client.adresse || '',
                notes: client.notes || ''
            });
        }
    }
    
    // 2. Lieu / Salle avec contacts
    const lieuId = spectacle.lieuId || (spectacle.tech && spectacle.tech.lieuId);
    if (lieuId) {
        const lieu = getLieuById(lieuId);
        if (lieu) {
            contacts.push({
                name: lieu.nom || spectacle.location || 'Lieu',
                role: 'Salle / Lieu',
                icon: '📍',
                contact: '',
                tel: '',
                email: '',
                adresse: [lieu.adresse, lieu.codePostal, lieu.ville].filter(Boolean).join(', '),
                notes: lieu.notes || '',
                capacite: lieu.capacite
            });
            // Contacts du lieu
            if (lieu.contacts && Array.isArray(lieu.contacts)) {
                lieu.contacts.forEach(c => {
                    if (c.nom || c.email || c.telephone) {
                        contacts.push({
                            name: c.nom || 'Contact lieu',
                            role: (c.fonction || 'Contact') + ' — ' + (lieu.nom || 'Lieu'),
                            icon: '📍',
                            contact: '',
                            tel: c.telephone || '',
                            email: c.email || '',
                            adresse: '',
                            notes: ''
                        });
                    }
                });
            }
        }
    } else if (spectacle.location) {
        contacts.push({ name: spectacle.location, role: 'Salle / Lieu', icon: '📍', contact: '', tel: '', email: '', adresse: '', notes: '' });
    }
    
    // 3. Membres de l'équipe
    const userListForContacts = window._cachedUsersForAssignments || allUsers || [];
    const memberIds = (spectacle.members || []).map(String);
    if (spectacle.parentId) {
        const tournee = projects.find(p => p.id === spectacle.parentId);
        if (tournee && tournee.members) {
            tournee.members.forEach(m => {
                const mid = String(typeof m === 'object' && m && m.id != null ? m.id : m);
                if (!memberIds.includes(mid)) memberIds.push(mid);
            });
        }
    }
    memberIds.forEach(mid => {
        const user = userListForContacts.find(u => String(u.id) === mid);
        if (user) {
            contacts.push({
                name: user.name || user.username || '',
                role: user.role_professionnel || user.role || 'Membre équipe',
                icon: '👤',
                contact: '',
                tel: user.phone || user.telephone || '',
                email: user.email || '',
                adresse: '',
                notes: ''
            });
        }
    });
    
    // 4. Prestataires depuis la fiche technique
    if (spectacle.tech && spectacle.tech.prestataires && Array.isArray(spectacle.tech.prestataires)) {
        spectacle.tech.prestataires.forEach(p => {
            const presta = getPrestataireById(p.prestataireId);
            if (presta) {
                contacts.push({
                    name: presta.nom || 'Prestataire',
                    role: 'Prestataire' + (presta.type ? ' — ' + presta.type : ''),
                    icon: '🔧',
                    contact: presta.contact || '',
                    tel: presta.telephone || '',
                    email: presta.email || '',
                    adresse: '',
                    notes: presta.notes || ''
                });
            }
        });
    }
    
    // 5. Contacts CRM liés manuellement
    if (spectacle.contactsCrm && Array.isArray(spectacle.contactsCrm)) {
        spectacle.contactsCrm.forEach(c => {
            contacts.push({
                name: c.name || c.nom || '',
                role: c.role || 'Contact',
                icon: '📇',
                contact: '',
                tel: c.tel || c.telephone || '',
                email: c.email || '',
                adresse: c.adresse || '',
                notes: c.notes || ''
            });
        });
    }
    
    return contacts;
}

function openSpectacleContactsPage(spectacleId) {
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle) return;
    
    document.getElementById('spectacleContactsTitle').textContent = '📇 Contacts — ' + (spectacle.name || 'Spectacle');
    document.getElementById('spectacleContactsSubtitle').textContent = [spectacle.location, spectacle.date ? new Date(spectacle.date).toLocaleDateString('fr-FR') : ''].filter(Boolean).join(' • ');
    
    const contacts = gatherSpectacleContacts(spectacle);
    const container = document.getElementById('spectacleContactsList');
    
    if (contacts.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--mn-text-light);"><div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📇</div><div>Aucun contact lié à ce spectacle</div></div>';
    } else {
        // Regrouper par type d'icône
        const groups = {};
        contacts.forEach(c => {
            const key = c.icon === '🏢' ? 'Clients / Organisateurs' :
                        c.icon === '📍' ? 'Lieu / Salle' :
                        c.icon === '👤' ? 'Équipe' :
                        c.icon === '🔧' ? 'Prestataires' : 'Autres';
            if (!groups[key]) groups[key] = [];
            groups[key].push(c);
        });
        
        const esc = (s) => typeof escHtml === 'function' ? escHtml(s || '') : (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        container.innerHTML = Object.entries(groups).map(([groupName, groupContacts]) => `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1rem; font-weight: 700; color: var(--mn-text); margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--mn-border);">
                    ${groupContacts[0]?.icon || '📇'} ${groupName} <span style="font-weight: 400; font-size: 0.85rem; color: var(--mn-text-light);">(${groupContacts.length})</span>
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">
                    ${groupContacts.map(c => `
                        <div style="background: white; border: 1px solid var(--mn-border); border-radius: var(--mn-radius-lg); padding: 1rem; transition: box-shadow 0.15s;" onmouseover="this.style.boxShadow='var(--mn-shadow)'" onmouseout="this.style.boxShadow='none'">
                            <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                                <span style="font-size: 1.5rem; flex-shrink: 0;">${c.icon}</span>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 700; font-size: 1rem; color: var(--mn-text); margin-bottom: 0.15rem;">${esc(c.name)}</div>
                                    <div style="font-size: 0.82rem; color: var(--mn-text-secondary); margin-bottom: 0.5rem;">${esc(c.role)}</div>
                                    ${c.contact ? '<div style="font-size: 0.85rem; color: var(--mn-text); margin-bottom: 0.3rem;">👤 ' + esc(c.contact) + '</div>' : ''}
                                    ${c.tel ? '<div style="margin-bottom: 0.3rem;"><a href="tel:' + esc(c.tel) + '" style="color: var(--mn-dark-blue); font-size: 0.88rem; text-decoration: none; font-weight: 500;">📞 ' + esc(c.tel) + '</a></div>' : ''}
                                    ${c.email ? '<div style="margin-bottom: 0.3rem;"><a href="mailto:' + esc(c.email) + '" style="color: var(--mn-dark-blue); font-size: 0.88rem; text-decoration: none; font-weight: 500;">✉️ ' + esc(c.email) + '</a></div>' : ''}
                                    ${c.adresse ? '<div style="font-size: 0.82rem; color: var(--mn-text-secondary); margin-bottom: 0.2rem;">📮 ' + esc(c.adresse) + '</div>' : ''}
                                    ${c.capacite ? '<div style="font-size: 0.82rem; color: var(--mn-text-secondary);">💺 Capacité : ' + c.capacite + '</div>' : ''}
                                    ${c.notes ? '<div style="font-size: 0.8rem; color: var(--mn-text-light); margin-top: 0.35rem; font-style: italic; border-top: 1px solid var(--mn-border-light); padding-top: 0.35rem;">' + esc(c.notes) + '</div>' : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
    
    document.getElementById('spectacleContactsPage').classList.add('active');
}

function closeSpectacleContactsPage() {
    document.getElementById('spectacleContactsPage').classList.remove('active');
    if (window.currentSpectacleDetail) viewSpectacle(window.currentSpectacleDetail.id);
}

async function openNewProjectModal(type = 'spectacle') {
    currentProject = null;
    currentFiles = [];
    
    const isTournee = (type === 'tournee');
    document.getElementById('modalTitle').textContent = isTournee ? 'Nouvelle Tournée' : 'Nouveau Spectacle';
    document.getElementById('projectForm').reset();
    document.getElementById('projectId').value = '';
    document.getElementById('parentTourneeId').value = '';
    document.getElementById('projectType').value = type;
    document.getElementById('projectType').disabled = false;
    document.getElementById('nameGroup').style.display = 'block';
    document.getElementById('typeGroup').style.display = 'block';
    
    const modeSelect = document.getElementById('projectModeExploitation');
    if (modeSelect) modeSelect.value = 'organise';
    const modeFields = document.getElementById('modeExploitationFields');
    if (modeFields) modeFields.style.display = 'none';
    
    const searchInput = document.getElementById('projectLieuSearch');
    if (searchInput) searchInput.value = '';
    populateLieuxSelect();
    document.getElementById('lieuPreview').style.display = 'none';
    
    // Catalogue selector
    if (typeof populateCatalogueSelect === 'function') await populateCatalogueSelect();
    const catalogueSelect = document.getElementById('projectCatalogueId');
    if (catalogueSelect) catalogueSelect.value = '';
    
    await toggleTypeFields();
    document.getElementById('projectModal').classList.add('active');
}

async function editProject(id) {
    currentProject = projects.find(p => p.id === id);
    if (!currentProject) return;

    currentFiles = currentProject.files || [];
    document.getElementById('modalTitle').textContent = currentProject.type === 'tournee' ? 'Modifier la Tournée' : 'Modifier le Spectacle';
    document.getElementById('projectId').value = currentProject.id;
    document.getElementById('parentTourneeId').value = currentProject.parentId || '';
    document.getElementById('projectType').value = currentProject.type || 'spectacle';
    document.getElementById('projectType').disabled = true; // Ne pas changer le type en édition
    
    // Champs communs
    if (currentProject.type === 'tournee' || !currentProject.parentId) {
        document.getElementById('projectName').value = currentProject.name;
    }
    
    if (currentProject.type !== 'tournee') {
        document.getElementById('projectDate').value = currentProject.date || '';
        document.getElementById('projectTime').value = currentProject.time || '';
        
        // Effacer le champ de recherche et charger les lieux
        const searchInput = document.getElementById('projectLieuSearch');
        if (searchInput) searchInput.value = '';
        populateLieuxSelect();
        if (currentProject.lieuId) {
            document.getElementById('projectLieuId').value = currentProject.lieuId;
            updateLieuPreview();
        } else {
            // Rétro-compatibilité : essayer de trouver le lieu par nom/ville
            const lieu = appSettings.lieux?.find(l => 
                l.ville === currentProject.city || 
                l.ville === currentProject.location ||
                l.nom === currentProject.location
            );
            if (lieu) {
                document.getElementById('projectLieuId').value = lieu.id;
                updateLieuPreview();
            }
        }
        
        // Mode d'exploitation
        const modeSelect = document.getElementById('projectModeExploitation');
        if (modeSelect) {
            modeSelect.value = currentProject.modeExploitation || 'organise';
            toggleModeExploitationFields();
            
            if (currentProject.vente) {
                document.getElementById('projectClientId').value = currentProject.vente.clientId || '';
                document.getElementById('projectPrixVente').value = currentProject.vente.prixVente || '';
                document.getElementById('projectPriseEnChargeVoyages').value = currentProject.vente.priseEnCharge?.voyages || 'nous';
                document.getElementById('projectPriseEnChargeHebergement').value = currentProject.vente.priseEnCharge?.hebergement || 'nous';
                const techEl = document.getElementById('projectPriseEnChargeTechnique');
                if (techEl) techEl.value = currentProject.vente.priseEnCharge?.technique || 'nous';
            }
        }
        const statusEl = document.getElementById('projectStatus');
        if (statusEl) statusEl.value = currentProject.status || 'confirmed';
    }

    document.getElementById('typeGroup').style.display = 'none';
    
    // Catalogue selector : toggleTypeFields d'abord (affiche et remplit le select), puis préremplir la valeur
    await toggleTypeFields();
    const catSelect = document.getElementById('projectCatalogueId');
    if (catSelect && currentProject.catalogueId) {
        catSelect.value = currentProject.catalogueId;
    }
    
    document.getElementById('projectModal').classList.add('active');
}

function closeModal() {
    document.getElementById('projectModal').classList.remove('active');
    currentProject = null;
    currentFiles = [];
}

// Remplir le sélecteur de lieux
function populateLieuxSelect(filter = '') {
    const select = document.getElementById('projectLieuId');
    if (!select) return;
    
    select.innerHTML = '';
    
    const lieux = appSettings.lieux || [];
    const filterLower = filter.toLowerCase().trim();
    
    // Trier et filtrer par ville puis par nom
    const lieuxTries = [...lieux]
        .filter(lieu => {
            if (!filterLower) return true;
            const nom = (lieu.nom || '').toLowerCase();
            const ville = (lieu.ville || '').toLowerCase();
            return nom.includes(filterLower) || ville.includes(filterLower);
        })
        .sort((a, b) => {
            const villeCompare = (a.ville || '').localeCompare(b.ville || '');
            if (villeCompare !== 0) return villeCompare;
            return (a.nom || '').localeCompare(b.nom || '');
        });
    
    if (lieuxTries.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = filterLower ? 'Aucun lieu trouvé' : '-- Aucun lieu disponible --';
        option.disabled = true;
        select.appendChild(option);
        return;
    }
    
    lieuxTries.forEach(lieu => {
        const option = document.createElement('option');
        option.value = lieu.id;
        option.textContent = `${lieu.nom} - ${lieu.ville}`;
        select.appendChild(option);
    });
    
    // Si filtré et un seul résultat, le sélectionner automatiquement
    if (filterLower && lieuxTries.length === 1) {
        select.value = lieuxTries[0].id;
        updateLieuPreview();
    }
}

// Filtrer les options du sélecteur de lieu (formulaire projet)
function filterProjectLieuOptions() {
    const filter = document.getElementById('projectLieuSearch')?.value || '';
    populateLieuxSelect(filter);
}

// Mettre à jour la prévisualisation du lieu sélectionné
function updateLieuPreview() {
    const select = document.getElementById('projectLieuId');
    const preview = document.getElementById('lieuPreview');
    const previewNom = document.getElementById('lieuPreviewNom');
    const previewAdresse = document.getElementById('lieuPreviewAdresse');
    
    if (!select || !preview) return;
    
    const lieuId = select.value;
    if (!lieuId) {
        preview.style.display = 'none';
        return;
    }
    
    const lieu = appSettings.lieux?.find(l => l.id === lieuId);
    if (lieu) {
        previewNom.textContent = `📍 ${lieu.nom}`;
        let adresse = lieu.ville || '';
        if (lieu.adresse) adresse = lieu.adresse + ', ' + adresse;
        if (lieu.capacite) adresse += ` (${lieu.capacite} places)`;
        previewAdresse.textContent = adresse;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

// Ouvrir la modale de création de lieu depuis le formulaire projet
let returnToProjectModal = false;
function openLieuModalFromProject() {
    returnToProjectModal = true;
    // Stocker les valeurs actuelles du formulaire
    window.tempProjectData = {
        type: document.getElementById('projectType').value,
        name: document.getElementById('projectName').value,
        date: document.getElementById('projectDate').value,
        time: document.getElementById('projectTime').value,
        parentId: document.getElementById('parentTourneeId').value
    };
    document.getElementById('projectModal').classList.remove('active');
    openLieuModal();
}

// Récupérer la ville d'un spectacle (depuis le lieu ou les anciens champs)
function getSpectacleVille(spectacle) {
    if (spectacle.lieuId) {
        const lieu = appSettings.lieux?.find(l => l.id === spectacle.lieuId);
        return lieu?.ville || '';
    }
    return spectacle.city || spectacle.location || '';
}

// Récupérer le nom du lieu d'un spectacle
function getSpectacleLieu(spectacle) {
    if (spectacle.lieuId) {
        const lieu = appSettings.lieux?.find(l => l.id === spectacle.lieuId);
        return lieu?.nom || '';
    }
    return spectacle.location || '';
}

// Récupérer l'affichage complet du lieu (nom + ville)
function getSpectacleLieuComplet(spectacle) {
    if (spectacle.lieuId) {
        const lieu = appSettings.lieux?.find(l => l.id === spectacle.lieuId);
        if (lieu) return `${lieu.nom}, ${lieu.ville}`;
    }
    const ville = spectacle.city || spectacle.location || '';
    const lieuNom = spectacle.location || '';
    if (lieuNom && ville && lieuNom !== ville) return `${lieuNom}, ${ville}`;
    return ville || lieuNom;
}

// Récupérer l'affichage lieu au format "NOM DU LIEU - VILLE"
function getSpectacleLieuDisplay(spectacle) {
    if (spectacle?.lieuId && appSettings?.lieux) {
        const lieu = appSettings.lieux.find(l => l.id === spectacle.lieuId);
        if (lieu) return lieu.ville ? `${lieu.nom} - ${lieu.ville}` : lieu.nom;
    }
    if (spectacle?.location) {
        return spectacle.city ? `${spectacle.location} - ${spectacle.city}` : spectacle.location;
    }
    return 'Non défini';
}

// Fonction pour afficher une modale d'erreur premium
function showErrorModal(title, message, details = null) {
    const modal = document.getElementById('errorModal');
    const titleEl = document.getElementById('errorModalTitle');
    const messageEl = document.getElementById('errorModalMessage');
    const detailsEl = document.getElementById('errorModalDetails');
    
    if (!modal) {
        // Fallback si la modale n'existe pas encore
        alert(title + ': ' + message);
        return;
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    if (details) {
        detailsEl.textContent = details;
        detailsEl.style.display = 'block';
    } else {
        detailsEl.style.display = 'none';
    }
    
    modal.classList.add('active');
}

function closeErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Gestion globale des erreurs non capturées (extensions de navigateur, etc.)
window.addEventListener('error', function(event) {
    // Ignorer les erreurs d'extensions de navigateur
    if (event.message && (
        event.message.includes('Receiving end does not exist') ||
        event.message.includes('Extension context invalidated') ||
        event.message.includes('chrome-extension://') ||
        event.message.includes('moz-extension://')
    )) {
        event.preventDefault();
        return false;
    }
    
    // Ignorer les erreurs d'icônes manquantes (non critiques)
    if (event.message && event.message.includes('icon')) {
        console.warn('Icône manquante (non critique):', event.message);
        event.preventDefault();
        return false;
    }
    
    return true;
}, true);

// Gestion des promesses rejetées non capturées
window.addEventListener('unhandledrejection', function(event) {
    // Ignorer les erreurs d'extensions de navigateur
    const reason = event.reason?.message || event.reason?.toString() || '';
    if (reason.includes('Receiving end does not exist') ||
        reason.includes('Extension context invalidated') ||
        reason.includes('chrome-extension://') ||
        reason.includes('moz-extension://')) {
        event.preventDefault();
        return;
    }
});

// Fermer la modale en cliquant sur le fond
document.addEventListener('DOMContentLoaded', function() {
    const errorModal = document.getElementById('errorModal');
    if (errorModal) {
        errorModal.addEventListener('click', function(e) {
            if (e.target === errorModal) {
                closeErrorModal();
            }
        });
    }
    
    // Attacher l'événement change à l'input visuel au chargement (fallback)
    const visuelInput = document.getElementById('visuelInput');
    if (visuelInput) {
        visuelInput.addEventListener('change', uploadVisuels);
        console.log('DOMContentLoaded: Événement change attaché à visuelInput (fallback)');
    }
});

function addBudgetLine(data = null) {
    const container = document.getElementById('budgetLines');
    const lineDiv = document.createElement('div');
    lineDiv.className = 'budget-line';
    
    lineDiv.innerHTML = `
        <input type="text" placeholder="Intitulé" value="${data ? data.intitule : ''}" class="budget-intitule">
        <input type="number" placeholder="Prévisionnel (€)" step="0.01" value="${data ? data.previsionnel : ''}" class="budget-prev">
        <input type="number" placeholder="Réel (€)" step="0.01" value="${data ? data.reel : ''}" class="budget-real">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(lineDiv);
}

const projectFormEl = document.getElementById('projectForm');
if (projectFormEl) {
    projectFormEl.addEventListener('submit', async function(e) {
    e.preventDefault();
    console.log('=== FORMULAIRE SOUMIS ===');

    try {
        let type = document.getElementById('projectType')?.value;
        const parentId = document.getElementById('parentTourneeId')?.value || null;
        if (!type && parentId) type = 'spectacle';
        
        // Validation manuelle
        const catalogueGroup = document.getElementById('catalogueSelectGroup');
        const catalogueVisible = catalogueGroup && catalogueGroup.style.display !== 'none';
        const selectedCatalogueId = document.getElementById('projectCatalogueId')?.value?.trim() || '';
        if (catalogueVisible && !selectedCatalogueId) {
            alert('Veuillez sélectionner un spectacle dans le catalogue. Créez-le d\'abord dans Catalogue Spectacles si nécessaire.');
            return;
        }
        if (type === 'tournee') {
            const name = document.getElementById('projectName').value.trim();
            if (!name) {
                alert('Le nom de la tournée est requis');
                return;
            }
        } else if (!parentId) {
            // Spectacle isolé
            const name = document.getElementById('projectName').value.trim();
            if (!name) {
                alert('Le nom du spectacle est requis');
                return;
            }
        }
        
        if (type !== 'tournee') {
            const lieuId = document.getElementById('projectLieuId').value;
            if (!lieuId) {
                alert('Le lieu est requis');
                return;
            }
        }
        
        const projectData = {
            id: document.getElementById('projectId').value || ('spectacle_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)),
            type: type || 'spectacle',
            parentId: parentId,
            files: currentFiles
        };
        projectData.status = document.getElementById('projectStatus')?.value || 'confirmed';
        
        if (selectedCatalogueId) {
            projectData.catalogueId = selectedCatalogueId;
        }

        if (type === 'tournee') {
            // Tournée : juste le nom
            console.log('Création tournée');
            projectData.name = document.getElementById('projectName').value;
            // Initialiser les structures de la tournée
            projectData.visuels = [];
            projectData.documents = [];
            projectData.communications = [];
            projectData.tasks = [];
            projectData.members = [];
            projectData.membersManual = [];
        } else {
            console.log('Création spectacle');
            // Spectacle
            const lieuId = document.getElementById('projectLieuId').value;
            const lieu = appSettings.lieux?.find(l => l.id === lieuId);
            const ville = lieu?.ville || '';
            
            if (parentId) {
                console.log('Spectacle de tournée');
                const tournee = projects.find(p => p.id === parentId);
                console.log('Tournée trouvée:', tournee);
                console.log('Ville:', ville);
                projectData.name = tournee ? `${tournee.name} - ${ville}` : ville;
                // catalogueId vient du formulaire (sélection obligatoire)
            } else {
                // Spectacle isolé : nom saisi
                console.log('Spectacle isolé');
                projectData.name = document.getElementById('projectName').value;
            }
            
            projectData.lieuId = lieuId;
            projectData.city = ville; // Pour rétro-compatibilité
            projectData.location = lieu?.nom || ''; // Pour rétro-compatibilité
            projectData.date = document.getElementById('projectDate').value;
            projectData.time = document.getElementById('projectTime').value;
            
            // Mode d'exploitation
            const modeExpl = document.getElementById('projectModeExploitation')?.value || 'organise';
            projectData.modeExploitation = modeExpl;
            
            if (modeExpl === 'vendu' || modeExpl === 'coproduction') {
                projectData.vente = {
                    clientId: document.getElementById('projectClientId')?.value || null,
                    prixVente: parseFloat(document.getElementById('projectPrixVente')?.value) || 0,
                    priseEnCharge: {
                        voyages: document.getElementById('projectPriseEnChargeVoyages')?.value || 'nous',
                        hebergement: document.getElementById('projectPriseEnChargeHebergement')?.value || 'nous',
                        technique: document.getElementById('projectPriseEnChargeTechnique')?.value || 'nous'
                    }
                };
            } else {
                projectData.vente = null;
            }
        }

        console.log('Données projet complètes:', projectData);

        if (currentProject) {
            console.log('Modification projet existant');
            const index = projects.findIndex(p => p.id === currentProject.id);
            
            // Préserver les données existantes et ne mettre à jour que les champs du formulaire
            const existingProject = projects[index];
            
            existingProject.status = document.getElementById('projectStatus')?.value || 'confirmed';
            if (projectData.type === 'tournee') {
                // Tournée : mettre à jour le nom et le catalogue
                existingProject.name = projectData.name;
                if (selectedCatalogueId) {
                    existingProject.catalogueId = selectedCatalogueId;
                    if (typeof applyCatalogueToNewProject === 'function') {
                        applyCatalogueToNewProject(existingProject, selectedCatalogueId);
                    }
                    // Propager le catalogue à toutes les dates de la tournée
                    const spectacles = projects.filter(p => p.parentId === existingProject.id);
                    spectacles.forEach(s => {
                        s.catalogueId = selectedCatalogueId;
                        if (typeof applyCatalogueToNewProject === 'function') {
                            applyCatalogueToNewProject(s, selectedCatalogueId);
                        }
                        s.updatedAt = new Date().toISOString();
                    });
                }
            } else {
                // Spectacle : mettre à jour les champs modifiables
                existingProject.lieuId = projectData.lieuId;
                existingProject.city = projectData.city;
                existingProject.location = projectData.location;
                existingProject.date = projectData.date;
                existingProject.time = projectData.time;
                
                // Mode d'exploitation
                existingProject.modeExploitation = projectData.modeExploitation || 'organise';
                if (projectData.vente) {
                    existingProject.vente = projectData.vente;
                } else if (existingProject.modeExploitation === 'organise') {
                    existingProject.vente = null;
                }
                
                // Synchroniser le lieu vers la page technique
                if (!existingProject.tech || Array.isArray(existingProject.tech)) existingProject.tech = {};
                existingProject.tech.lieuId = projectData.lieuId;
                
                // Changement de catalogue : si différent et spectacle dans tournée → sort de la tournée
                const oldCatId = existingProject.catalogueId;
                const tournee = existingProject.parentId ? projects.find(p => p.id === existingProject.parentId) : null;
                const tourneeCatId = tournee ? tournee.catalogueId : null;
                if (selectedCatalogueId && selectedCatalogueId !== oldCatId) {
                    existingProject.catalogueId = selectedCatalogueId;
                    if (typeof applyCatalogueToNewProject === 'function') {
                        applyCatalogueToNewProject(existingProject, selectedCatalogueId);
                    }
                    // Sortir de la tournée si le nouveau catalogue est différent de celui de la tournée
                    if (existingProject.parentId && selectedCatalogueId !== tourneeCatId) {
                        existingProject.parentId = null;
                        const fiche = typeof catalogueData !== 'undefined' && catalogueData.find(f => f.id === selectedCatalogueId);
                        const ville = projectData.city || existingProject.city || '';
                        existingProject.name = fiche ? (fiche.name + (ville ? ` - ${ville}` : '')) : document.getElementById('projectName').value;
                    }
                }
                
                // Mettre à jour le nom si pas de changement catalogue
                if (!selectedCatalogueId || selectedCatalogueId === oldCatId) {
                    if (existingProject.parentId) {
                        const tournee = projects.find(p => p.id === existingProject.parentId);
                        existingProject.name = tournee ? `${tournee.name} - ${projectData.city}` : projectData.city;
                    } else {
                        existingProject.name = document.getElementById('projectName').value;
                    }
                }
            }
            
            existingProject.updatedAt = new Date().toISOString();
        } else {
            console.log('Ajout nouveau projet');
            
            if (projectData.type !== 'tournee') {
                projectData.budget = [];
                projectData.billetterie = [];
                projectData.capacite = 0;
                projectData.visuels = [];
                projectData.documents = [];
                projectData.communications = [];
                projectData.tasks = [];
                projectData.members = [];
                projectData.membersManual = [];
                projectData.tech = {
                    lieuId: projectData.lieuId || null,
                    prestataires: [],
                    voyages: [],
                    hebergements: [],
                    planning: [],
                    notes: { general: '', lieu: '', prestataires: '', voyages: '', hebergements: '', planning: '' }
                };
                projectData.technique = {
                    lieu: null,
                    prestataires: [],
                    voyages: [],
                    hebergements: [],
                    planning: []
                };
                projectData.createdAt = new Date().toISOString();
                projectData.updatedAt = new Date().toISOString();
                
                if (!projectData.parentId) {
                    await autoAssignMembersToNewSpectacle(projectData);
                }
            } else {
                projectData.createdAt = new Date().toISOString();
                projectData.updatedAt = new Date().toISOString();
                await autoAssignMembersToNewSpectacle(projectData);
            }
            
            // Appliquer les données du catalogue (sélection obligatoire)
            if (projectData.catalogueId && typeof applyCatalogueToNewProject === 'function') {
                applyCatalogueToNewProject(projectData, projectData.catalogueId);
            }
            
            projects.push(projectData);
            
            // Si c'est un spectacle ajouté à une tournée, lui ajouter les actions com' nationales
            if (projectData.type === 'spectacle' && projectData.parentId) {
                addTourneeCommunicationsToNewSpectacle(projectData.id);
            }
        }

        saveProjectsAsync();
        refreshCurrentView();
        closeModal();
        console.log('Après closeModal');
        
        if (projectData.parentId) {
            console.log('Ouverture tournée:', projectData.parentId);
            viewTournee(projectData.parentId);
        }
        
        console.log('=== FIN SOUMISSION ===');
    } catch (error) {
        console.error('=== ERREUR FORMULAIRE ===', error);
        alert('Erreur lors de l\'enregistrement: ' + error.message);
    }
});
}

function deleteProject(id) {
    const project = projects.find(p => p.id === id);
    if (!project) {
        console.error('deleteProject: Projet non trouvé avec id:', id);
        return;
    }
    
    console.log('deleteProject: Suppression du projet', { id, name: project.name, type: project.type });
    console.log('deleteProject: Nombre de projets AVANT suppression:', projects.length);
    
    if (project.type === 'tournee') {
        const hasSpectacles = projects.some(p => p.parentId === id);
        if (hasSpectacles && !confirm('Cette tournée contient des dates. Supprimer la tournée ET toutes ses dates ?')) {
            return;
        }
        projects = projects.filter(p => p.id !== id && p.parentId !== id);
    } else {
        if (!confirm('Supprimer ce spectacle ?')) return;
        projects = projects.filter(p => p.id !== id);
    }
    
    console.log('deleteProject: Nombre de projets APRÈS suppression:', projects.length);
    console.log('deleteProject: Appel de saveProjectsAsync...');
    
    saveProjectsAsync();
    
    if (currentTournee && project.parentId === currentTournee.id) {
        renderSpectaclesList();
        
        // Mettre à jour les stats
        const spectacles = projects.filter(p => p.parentId === currentTournee.id);
        const totalSold = spectacles.reduce((sum, s) => sum + (s.ticketsSold || 0), 0);
        const totalCapacity = spectacles.reduce((sum, s) => sum + (s.ticketsCapacity || 0), 0);

        document.getElementById('tourneeStats').innerHTML = `
            <div class="tournee-stat">
                <div class="tournee-stat-label">Nombre de dates</div>
                <div class="tournee-stat-value">${spectacles.length}</div>
            </div>
            <div class="tournee-stat">
                <div class="tournee-stat-label">Billetterie totale</div>
                <div class="tournee-stat-value">${totalSold} / ${totalCapacity}</div>
            </div>
        `;
    } else {
        refreshCurrentView();
    }
}

// ========== PRÉVISIONNELS ==========
let previsionnels = [];
let currentPrevisionnel = null;
let previsionnelTarifs = [];
let previsionnelBudgetLines = [];
let previsionnelsLoaded = false;
let previsionnelsSaveTimer = null;
let previsionnelsMigrationDone = false;

async function migratePrevisionnelsFromLocalStorage() {
    if (previsionnelsMigrationDone) return false;
    previsionnelsMigrationDone = true;
    const saved = localStorage.getItem('previsionnels');
    if (!saved) return false;
    let local = [];
    try { local = JSON.parse(saved); } catch (e) { return false; }
    if (!Array.isArray(local) || local.length === 0) return false;
    try {
        const result = await apiCall('previsionnels.php', 'POST', {
            action: 'migrate_from_local',
            previsionnels: local
        });
        if (result && result.success) {
            console.log('Migration prévisionnels localStorage → serveur OK:', result);
            return (result.added || 0) > 0;
        }
    } catch (e) {
        console.warn('Migration prévisionnels échouée:', e);
        previsionnelsMigrationDone = false;
    }
    return false;
}

async function loadPrevisionnels(force) {
    if (previsionnelsLoaded && !force) return;
    try {
        const data = await apiCall('previsionnels.php', 'GET');
        if (data && data.success) {
            previsionnels = Array.isArray(data.previsionnels) ? data.previsionnels : [];
            const migrated = await migratePrevisionnelsFromLocalStorage();
            if (migrated) {
                const fresh = await apiCall('previsionnels.php', 'GET');
                if (fresh && fresh.success && Array.isArray(fresh.previsionnels)) {
                    previsionnels = fresh.previsionnels;
                }
            }
            try { localStorage.setItem('previsionnels', JSON.stringify(previsionnels)); } catch (e) {}
            previsionnelsLoaded = true;
            return;
        }
    } catch (e) {
        console.warn('Chargement prévisionnels serveur échoué, fallback localStorage:', e);
    }
    const saved = localStorage.getItem('previsionnels');
    if (saved) {
        try { previsionnels = JSON.parse(saved); } catch (err) { previsionnels = []; }
    }
    previsionnelsLoaded = true;
}

async function flushPrevisionnelsSave() {
    clearTimeout(previsionnelsSaveTimer);
    try { localStorage.setItem('previsionnels', JSON.stringify(previsionnels)); } catch (e) {}
    await apiCall('previsionnels.php', 'POST', { previsionnels });
}

function savePrevisionnels() {
    try { localStorage.setItem('previsionnels', JSON.stringify(previsionnels)); } catch (e) {}
    clearTimeout(previsionnelsSaveTimer);
    previsionnelsSaveTimer = setTimeout(function() {
        flushPrevisionnelsSave().catch(function(e) {
            console.error('Erreur sauvegarde prévisionnels serveur:', e);
            if (typeof showToast === 'function') showToast('⚠️ Sauvegarde prévisionnels échouée — cache local conservé', 'error');
        });
    }, 400);
}

async function savePrevisionnelsNow() {
    try {
        await flushPrevisionnelsSave();
    } catch (e) {
        console.error('Erreur sauvegarde prévisionnels serveur:', e);
        if (typeof showToast === 'function') showToast('⚠️ Sauvegarde prévisionnels échouée', 'error');
    }
}

// Ouvrir la page liste des prévisionnels
async function openPrevisionnelsListPage() {
    await loadPrevisionnels(true);
    renderPrevisionnelsListPage();
    document.getElementById('previsionnelsListPage').classList.add('active');
    updateFabAppearance();
}

// Ouvrir la page liste des prévisionnels
async function openPrevisionnelsPage() {
    closeAllPages();
    await loadPrevisionnels(true);
    document.getElementById('previsionnelsListPage').classList.add('active');
    renderPrevisionnelsListPage();
    
    // Mettre à jour le menu actif
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const previsionnelsItem = document.getElementById('navPrevisionnelsItem');
    if (previsionnelsItem) previsionnelsItem.classList.add('active');
    
    closeSidebarOnMobile();
    updateFabAppearance();
}

// Fermer la page liste des prévisionnels
function closePrevisionnelsListPage() {
    document.getElementById('previsionnelsListPage').classList.remove('active');
    // Réinitialiser le menu actif
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const homeNavItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (homeNavItem) homeNavItem.classList.add('active');
    updateFabAppearance();
}

// Rendre la liste des prévisionnels
function renderPrevisionnelsListPage() {
    const container = document.getElementById('previsionnelsListGrid');
    if (!container) return;
    
    if (previsionnels.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <div style="background: white; padding: 2rem; border-radius: 15px;">
                    <h3>Aucun prévisionnel</h3>
                    <p style="color: #636e72;">Créez votre premier prévisionnel pour simuler la rentabilité d'un spectacle</p>
                    <button class="btn" onclick="openNewPrevisionnelModal()" style="margin-top: 1rem;">+ Créer un prévisionnel</button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = previsionnels.map(p => {
        const result = calculatePrevisionnelResult(p);
        const statusIcon = result.estRentable ? '✅' : '⚠️';
        
        return `
            <div class="project-card" onclick="viewPrevisionnel('${p.id}')" style="cursor: pointer;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <span class="badge" style="background: var(--primary); color: white; font-size: 0.7rem;">PRÉVISIONNEL</span>
                        <h3 style="margin: 0.5rem 0;">${p.name || 'Sans nom'}</h3>
                    </div>
                    <span style="font-size: 1.5rem;">${statusIcon}</span>
                </div>
                ${p.lieu ? `<div style="color: #636e72; margin-bottom: 0.5rem;">📍 ${p.lieu}</div>` : ''}
                ${p.date ? `<div style="color: #636e72; margin-bottom: 0.5rem;">📅 ${p.date}</div>` : ''}
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                    <div style="text-align: center;">
                        <div style="font-size: 0.75rem; color: #636e72;">Seuil rentabilité</div>
                        <div style="font-weight: 700; color: var(--primary);">${result.seuilBillets} billets</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.75rem; color: #636e72;">Bénéfice max</div>
                        <div style="font-weight: 700; color: ${result.beneficeMax >= 0 ? 'var(--success)' : 'var(--accent)'};">${result.beneficeMax >= 0 ? '+' : ''}${result.beneficeMax.toFixed(0)} €</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Calculer les résultats d'un prévisionnel
function calculatePrevisionnelResult(p) {
    // Calculer la capacité totale et le CA max (100% remplissage) depuis les tarifs
    let capaciteTotale = 0;
    let caMax = 0;
    
    if (p.tarifs && p.tarifs.length > 0) {
        p.tarifs.forEach(t => {
            const nbBillets = t.quantite || 0;
            const prix = t.prix || 0;
            capaciteTotale += nbBillets;
            caMax += nbBillets * prix;
        });
    }
    
    // Séparer les coûts fixes et les coûts en % du CA
    let coutsFixes = 0;
    let tauxCoutsVariables = 0; // somme des pourcentages
    
    if (p.budget && p.budget.length > 0) {
        p.budget.forEach(line => {
            if (line.type === 'percent') {
                tauxCoutsVariables += (line.montant || 0) / 100;
            } else {
                coutsFixes += (line.montant || 0);
            }
        });
    }
    
    // Coûts totaux si 100% remplissage
    const coutsMax = coutsFixes + (caMax * tauxCoutsVariables);
    
    // Bénéfice si 100% remplissage
    const beneficeMax = caMax - coutsMax;
    
    // Prix moyen du billet
    const prixMoyen = capaciteTotale > 0 ? caMax / capaciteTotale : 0;
    
    // Calcul du seuil de rentabilité (résolution de l'équation)
    // CA_seuil = prixMoyen * nbBillets_seuil
    // Coûts_seuil = coutsFixes + (CA_seuil * tauxCoutsVariables)
    // Rentable quand CA_seuil = Coûts_seuil
    // prixMoyen * n = coutsFixes + (prixMoyen * n * tauxCoutsVariables)
    // prixMoyen * n * (1 - tauxCoutsVariables) = coutsFixes
    // n = coutsFixes / (prixMoyen * (1 - tauxCoutsVariables))
    
    let seuilBillets = 0;
    const margeNette = 1 - tauxCoutsVariables; // ce qui reste après les % du CA
    
    if (prixMoyen > 0 && margeNette > 0) {
        seuilBillets = Math.ceil(coutsFixes / (prixMoyen * margeNette));
    } else if (prixMoyen > 0 && margeNette <= 0) {
        // Si les coûts variables >= 100% du CA, jamais rentable
        seuilBillets = Infinity;
    }
    
    // Taux de remplissage requis pour être rentable
    const tauxRequis = capaciteTotale > 0 && seuilBillets !== Infinity ? Math.round((seuilBillets / capaciteTotale) * 100) : (seuilBillets === Infinity ? Infinity : 0);
    
    // CA au seuil de rentabilité
    const caSeuil = seuilBillets !== Infinity ? prixMoyen * seuilBillets : 0;
    
    // Coûts au seuil de rentabilité
    const coutsSeuil = coutsFixes + (caSeuil * tauxCoutsVariables);
    
    return {
        capaciteTotale: capaciteTotale,
        caMax: caMax,
        coutsFixes: coutsFixes,
        tauxCoutsVariables: tauxCoutsVariables * 100, // en %
        couts: coutsMax,
        beneficeMax: beneficeMax,
        prixMoyen: prixMoyen,
        seuilBillets: seuilBillets === Infinity ? '∞' : seuilBillets,
        seuilBilletsNum: seuilBillets,
        tauxRequis: tauxRequis === Infinity ? '∞' : tauxRequis,
        caSeuil: caSeuil,
        coutsSeuil: coutsSeuil,
        estRentable: seuilBillets !== Infinity && seuilBillets <= capaciteTotale
    };
}

// Ouvrir le modal nouveau prévisionnel
function openNewPrevisionnelModal() {
    document.getElementById('previsionnelModalTitle').textContent = 'Nouveau prévisionnel';
    document.getElementById('previsionnelForm').reset();
    document.getElementById('previsionnelModal').classList.add('active');
}

// Fermer le modal prévisionnel
function closePrevisionnelModal() {
    document.getElementById('previsionnelModal').classList.remove('active');
}

// Mettre à jour l'affichage du taux
function updateTauxDisplay() {
    const taux = document.getElementById('previsionnelTauxInput').value;
    document.getElementById('previsionnelTauxDisplay').textContent = taux + '%';
    updatePrevisionnelSummary();
}

// Rendre le formulaire des tarifs
function renderPrevisionnelTarifsForm() {
    const container = document.getElementById('previsionnelTarifsContainer');
    container.innerHTML = previsionnelTarifs.map((t, i) => `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;">
            <input type="text" value="${t.nom || ''}" placeholder="Nom du tarif" onchange="previsionnelTarifs[${i}].nom = this.value">
            <input type="number" value="${t.prix || 0}" placeholder="Prix €" min="0" step="0.01" onchange="previsionnelTarifs[${i}].prix = parseFloat(this.value) || 0; updatePrevisionnelSummary()">
            <input type="number" value="${t.repartition || 0}" placeholder="% répartition" min="0" max="100" onchange="previsionnelTarifs[${i}].repartition = parseFloat(this.value) || 0; updatePrevisionnelSummary()">
            <button type="button" onclick="removePrevisionnelTarif(${i})" style="background: var(--accent); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer;">×</button>
        </div>
    `).join('');
}

// Ajouter un tarif
function addPrevisionnelTarif() {
    previsionnelTarifs.push({ nom: '', prix: 0, repartition: 0 });
    renderPrevisionnelTarifsForm();
}

// Supprimer un tarif
function removePrevisionnelTarif(index) {
    previsionnelTarifs.splice(index, 1);
    renderPrevisionnelTarifsForm();
    updatePrevisionnelSummary();
}

// Rendre le formulaire du budget
function renderPrevisionnelBudgetForm() {
    const container = document.getElementById('previsionnelBudgetContainer');
    container.innerHTML = previsionnelBudgetLines.map((line, i) => `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;">
            <input type="text" value="${line.nom || ''}" placeholder="Description" onchange="previsionnelBudgetLines[${i}].nom = this.value">
            <input type="number" value="${line.montant || 0}" placeholder="Montant" min="0" step="0.01" onchange="previsionnelBudgetLines[${i}].montant = parseFloat(this.value) || 0; updatePrevisionnelSummary()">
            <select onchange="previsionnelBudgetLines[${i}].type = this.value; updatePrevisionnelSummary()">
                <option value="fixe" ${line.type !== 'percent' ? 'selected' : ''}>€ Fixe</option>
                <option value="percent" ${line.type === 'percent' ? 'selected' : ''}>% du CA</option>
            </select>
            <button type="button" onclick="removePrevisionnelBudgetLine(${i})" style="background: var(--accent); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer;">×</button>
        </div>
    `).join('');
}

// Ajouter une ligne de budget
function addPrevisionnelBudgetLine() {
    previsionnelBudgetLines.push({ nom: '', montant: 0, type: 'fixe' });
    renderPrevisionnelBudgetForm();
}

// Supprimer une ligne de budget
function removePrevisionnelBudgetLine(index) {
    previsionnelBudgetLines.splice(index, 1);
    renderPrevisionnelBudgetForm();
    updatePrevisionnelSummary();
}

// Mettre à jour le résumé en temps réel
function updatePrevisionnelSummary() {
    const capacite = parseInt(document.getElementById('previsionnelCapaciteInput')?.value) || 0;
    const taux = parseInt(document.getElementById('previsionnelTauxInput')?.value) || 0;
    
    const tempPrev = {
        capacite: capacite,
        tauxRemplissage: taux,
        tarifs: previsionnelTarifs,
        budget: previsionnelBudgetLines
    };
    
    const result = calculatePrevisionnelResult(tempPrev);
    
    document.getElementById('previsionnelSummaryCA').textContent = result.ca.toFixed(0) + ' €';
    document.getElementById('previsionnelSummaryCouts').textContent = result.couts.toFixed(0) + ' €';
    
    const netEl = document.getElementById('previsionnelSummaryNet');
    netEl.textContent = (result.net >= 0 ? '+' : '') + result.net.toFixed(0) + ' €';
    netEl.style.color = result.net >= 0 ? 'var(--success)' : 'var(--accent)';
}

// Sauvegarder un prévisionnel (création uniquement)
function savePrevisionnel(event) {
    event.preventDefault();
    
    const id = 'prev_' + Date.now();
    const previsionnel = {
        id: id,
        name: document.getElementById('previsionnelName').value.trim(),
        lieu: document.getElementById('previsionnelLieu').value.trim(),
        date: document.getElementById('previsionnelDate').value,
        tarifs: [],
        budget: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    previsionnels.push(previsionnel);
    savePrevisionnelsNow();
    closePrevisionnelModal();
    
    // Ouvrir directement le prévisionnel créé
    viewPrevisionnel(id);
    
    showToast('Prévisionnel créé', 'success');
}

// Voir un prévisionnel
async function viewPrevisionnel(id) {
    await loadPrevisionnels(true);
    currentPrevisionnel = previsionnels.find(p => p.id === id);
    if (!currentPrevisionnel) return;
    
    renderPrevisionnelPage();
    document.getElementById('previsionnelPage').classList.add('active');
}

// Rendre la page détail du prévisionnel (avec édition inline)
function renderPrevisionnelPage() {
    if (!currentPrevisionnel) return;
    
    const p = currentPrevisionnel;
    const result = calculatePrevisionnelResult(p);
    
    // Titre et infos générales (éditables)
    document.getElementById('previsionnelTitleInput').value = p.name || '';
    document.getElementById('previsionnelLieuInput').value = p.lieu || '';
    document.getElementById('previsionnelDateInput').value = p.date || '';
    
    // Badge statut
    const statusBadge = document.getElementById('previsionnelStatusBadge');
    if (result.estRentable) {
        statusBadge.innerHTML = `<span class="badge" style="background: var(--success); color: white;">✅ Projet viable</span>`;
    } else {
        statusBadge.innerHTML = `<span class="badge" style="background: var(--accent); color: white;">⚠️ Non rentable à 100%</span>`;
    }
    
    // Résumé
    document.getElementById('previsionnelSummary').innerHTML = `
        <div class="detail-stat-box">
            <div class="detail-stat-label">Seuil de rentabilité</div>
            <div class="detail-stat-value" style="color: var(--primary);">${result.seuilBillets} billets</div>
            <div style="font-size: 0.75rem; color: #636e72;">(${result.tauxRequis}% de remplissage)</div>
        </div>
        <div class="detail-stat-box">
            <div class="detail-stat-label">CA si 100% rempli</div>
            <div class="detail-stat-value" style="color: var(--success);">${result.caMax.toFixed(2)} €</div>
        </div>
        <div class="detail-stat-box">
            <div class="detail-stat-label">Coûts totaux</div>
            <div class="detail-stat-value" style="color: var(--accent);">${result.couts.toFixed(2)} €</div>
        </div>
        <div class="detail-stat-box ${result.beneficeMax >= 0 ? 'ca-highlight' : ''}" style="${result.beneficeMax < 0 ? 'background: var(--accent); color: white;' : ''}">
            <div class="detail-stat-label" style="${result.beneficeMax < 0 ? 'color: white;' : ''}">Bénéfice si 100%</div>
            <div class="detail-stat-value">${result.beneficeMax >= 0 ? '+' : ''}${result.beneficeMax.toFixed(2)} €</div>
        </div>
    `;
    
    // Liste des tarifs (éditable)
    renderPrevisionnelTarifsInline();
    
    // Total tarifs
    document.getElementById('previsionnelTarifsTotal').innerHTML = `
        <div style="display: flex; justify-content: space-between; font-weight: 700;">
            <span>Total : ${result.capaciteTotale} billets</span>
            <span style="color: var(--success);">CA max : ${result.caMax.toFixed(2)} €</span>
        </div>
        <div style="font-size: 0.85rem; color: #636e72; margin-top: 0.25rem;">
            Prix moyen : ${result.prixMoyen.toFixed(2)} €
        </div>
    `;
    
    // Budget (éditable)
    renderPrevisionnelBudgetInline();
    
    document.getElementById('previsionnelBudgetTotal').innerHTML = `
        Total des coûts : <span style="color: var(--accent);">${result.couts.toFixed(2)} €</span>
    `;
    
    // Analyse
    const analyseHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
            <div style="text-align: center; padding: 1rem; background: var(--light); border-radius: 10px;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎯</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${result.seuilBillets}</div>
                <div style="color: #636e72;">Billets minimum</div>
                <div style="font-size: 0.85rem; color: #636e72;">pour être rentable</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--light); border-radius: 10px;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">📊</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${result.tauxRequis}%</div>
                <div style="color: #636e72;">Taux de remplissage</div>
                <div style="font-size: 0.85rem; color: #636e72;">requis</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: ${result.beneficeMax >= 0 ? 'rgba(0, 184, 148, 0.15)' : 'rgba(231, 76, 60, 0.15)'}; border-radius: 10px;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">${result.beneficeMax >= 0 ? '💰' : '⚠️'}</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${result.beneficeMax >= 0 ? 'var(--success)' : 'var(--accent)'};">${result.beneficeMax >= 0 ? '+' : ''}${result.beneficeMax.toFixed(0)} €</div>
                <div style="color: #636e72;">Bénéfice max</div>
                <div style="font-size: 0.85rem; color: #636e72;">si salle complète</div>
            </div>
        </div>
        
        <div style="margin-top: 1.5rem; padding: 1rem; background: ${result.estRentable ? 'rgba(0, 184, 148, 0.1)' : 'rgba(231, 76, 60, 0.1)'}; border-radius: 10px; border-left: 4px solid ${result.estRentable ? 'var(--success)' : 'var(--accent)'};">
            ${result.estRentable ? `
                <strong>✅ Ce projet est viable !</strong>
                <p style="margin: 0.5rem 0 0 0; color: #636e72;">
                    Vous devez vendre au minimum <strong>${result.seuilBillets} billets</strong> (${result.tauxRequis}% de remplissage) pour couvrir vos coûts.
                    Si vous remplissez à 100%, vous dégagerez un bénéfice de <strong>${result.beneficeMax.toFixed(2)} €</strong>.
                </p>
            ` : `
                <strong>⚠️ Attention : Ce projet n'est pas rentable même à 100%</strong>
                <p style="margin: 0.5rem 0 0 0; color: #636e72;">
                    Même en vendant tous les billets (${result.capaciteTotale}), vous perdriez <strong>${Math.abs(result.beneficeMax).toFixed(2)} €</strong>.
                    Vous devez soit augmenter les prix, soit réduire les coûts de <strong>${Math.abs(result.beneficeMax).toFixed(2)} €</strong>.
                </p>
            `}
        </div>
    `;
    document.getElementById('previsionnelAnalyse').innerHTML = analyseHtml;
}

// Rendre les tarifs en mode inline
function renderPrevisionnelTarifsInline() {
    if (!currentPrevisionnel) return;
    const tarifs = currentPrevisionnel.tarifs || [];
    
    const container = document.getElementById('previsionnelTarifsList');
    if (tarifs.length === 0) {
        container.innerHTML = '<p style="color: #636e72; text-align: center;">Aucun tarif défini - Ajoutez vos tarifs et quantités de billets</p>';
        return;
    }
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; font-weight: 600; color: #636e72; font-size: 0.85rem;">
            <div>Nom du tarif</div>
            <div>Nb billets</div>
            <div>Prix unitaire</div>
            <div>Sous-total</div>
            <div></div>
        </div>
        ${tarifs.map((t, i) => {
            const sousTotal = (t.quantite || 0) * (t.prix || 0);
            return `
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;">
                    <input type="text" value="${t.nom || ''}" placeholder="Ex: Plein tarif" 
                           style="padding: 0.5rem; border: 1px solid var(--border); border-radius: 5px;"
                           onchange="updatePrevisionnelTarif(${i}, 'nom', this.value)">
                    <input type="number" value="${t.quantite || 0}" placeholder="0" min="0"
                           style="padding: 0.5rem; border: 1px solid var(--border); border-radius: 5px;"
                           onchange="updatePrevisionnelTarif(${i}, 'quantite', parseInt(this.value) || 0)">
                    <input type="number" value="${t.prix || 0}" placeholder="0" min="0" step="0.01"
                           style="padding: 0.5rem; border: 1px solid var(--border); border-radius: 5px;"
                           onchange="updatePrevisionnelTarif(${i}, 'prix', parseFloat(this.value) || 0)">
                    <div style="font-weight: 600; color: var(--success);">${sousTotal.toFixed(2)} €</div>
                    <button type="button" onclick="removePrevisionnelTarifInline(${i})" 
                            style="background: var(--accent); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 1rem;">×</button>
                </div>
            `;
        }).join('')}
    `;
}

// Rendre le budget en mode inline
function renderPrevisionnelBudgetInline() {
    if (!currentPrevisionnel) return;
    const budget = currentPrevisionnel.budget || [];
    const result = calculatePrevisionnelResult(currentPrevisionnel);
    
    const container = document.getElementById('previsionnelBudgetList');
    if (budget.length === 0) {
        container.innerHTML = '<p style="color: #636e72; text-align: center;">Aucun coût défini - Ajoutez vos dépenses prévisionnelles</p>';
        return;
    }
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; font-weight: 600; color: #636e72; font-size: 0.85rem;">
            <div>Description</div>
            <div>Montant</div>
            <div>Type</div>
            <div>Estimé</div>
            <div></div>
        </div>
        ${budget.map((line, i) => {
            const montantEstime = line.type === 'percent' ? (result.caMax * (line.montant || 0) / 100) : (line.montant || 0);
            return `
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;">
                    <input type="text" value="${line.nom || ''}" placeholder="Description" 
                           style="padding: 0.5rem; border: 1px solid var(--border); border-radius: 5px;"
                           onchange="updatePrevisionnelBudgetLine(${i}, 'nom', this.value)">
                    <input type="number" value="${line.montant || 0}" placeholder="0" min="0" step="0.01"
                           style="padding: 0.5rem; border: 1px solid var(--border); border-radius: 5px;"
                           onchange="updatePrevisionnelBudgetLine(${i}, 'montant', parseFloat(this.value) || 0)">
                    <select style="padding: 0.5rem; border: 1px solid var(--border); border-radius: 5px;"
                            onchange="updatePrevisionnelBudgetLine(${i}, 'type', this.value)">
                        <option value="fixe" ${line.type !== 'percent' ? 'selected' : ''}>€ Fixe</option>
                        <option value="percent" ${line.type === 'percent' ? 'selected' : ''}>% du CA</option>
                    </select>
                    <div style="font-weight: 600; color: var(--accent);">${montantEstime.toFixed(2)} €</div>
                    <button type="button" onclick="removePrevisionnelBudgetLineInline(${i})" 
                            style="background: var(--accent); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 1rem;">×</button>
                </div>
            `;
        }).join('')}
    `;
}

// Mettre à jour un champ du prévisionnel
function updatePrevisionnelField(field, value) {
    if (!currentPrevisionnel) return;
    currentPrevisionnel[field] = value;
    currentPrevisionnel.updatedAt = new Date().toISOString();
    savePrevisionnels();
    renderPrevisionnelPage();
}

// Mettre à jour un tarif
function updatePrevisionnelTarif(index, field, value) {
    if (!currentPrevisionnel || !currentPrevisionnel.tarifs) return;
    if (!currentPrevisionnel.tarifs[index]) return;
    currentPrevisionnel.tarifs[index][field] = value;
    currentPrevisionnel.updatedAt = new Date().toISOString();
    savePrevisionnels();
    renderPrevisionnelPage();
}

// Ajouter un tarif (inline)
function addPrevisionnelTarifInline() {
    if (!currentPrevisionnel) return;
    if (!currentPrevisionnel.tarifs) currentPrevisionnel.tarifs = [];
    currentPrevisionnel.tarifs.push({ nom: '', prix: 0, repartition: 0 });
    currentPrevisionnel.updatedAt = new Date().toISOString();
    savePrevisionnels();
    renderPrevisionnelPage();
}

// Supprimer un tarif (inline)
function removePrevisionnelTarifInline(index) {
    if (!currentPrevisionnel || !currentPrevisionnel.tarifs) return;
    currentPrevisionnel.tarifs.splice(index, 1);
    currentPrevisionnel.updatedAt = new Date().toISOString();
    savePrevisionnels();
    renderPrevisionnelPage();
}

// Mettre à jour une ligne de budget
function updatePrevisionnelBudgetLine(index, field, value) {
    if (!currentPrevisionnel || !currentPrevisionnel.budget) return;
    if (!currentPrevisionnel.budget[index]) return;
    currentPrevisionnel.budget[index][field] = value;
    currentPrevisionnel.updatedAt = new Date().toISOString();
    savePrevisionnels();
    renderPrevisionnelPage();
}

// Ajouter une ligne de budget (inline)
function addPrevisionnelBudgetLineInline() {
    if (!currentPrevisionnel) return;
    if (!currentPrevisionnel.budget) currentPrevisionnel.budget = [];
    currentPrevisionnel.budget.push({ nom: '', montant: 0, type: 'fixe' });
    currentPrevisionnel.updatedAt = new Date().toISOString();
    savePrevisionnels();
    renderPrevisionnelPage();
}

// Supprimer une ligne de budget (inline)
function removePrevisionnelBudgetLineInline(index) {
    if (!currentPrevisionnel || !currentPrevisionnel.budget) return;
    currentPrevisionnel.budget.splice(index, 1);
    currentPrevisionnel.updatedAt = new Date().toISOString();
    savePrevisionnels();
    renderPrevisionnelPage();
}

// Fermer la page prévisionnel
function closePrevisionnelPage() {
    document.getElementById('previsionnelPage').classList.remove('active');
    currentPrevisionnel = null;
    renderPrevisionnelsListPage();
}

// Dupliquer un prévisionnel
function duplicatePrevisionnel() {
    if (!currentPrevisionnel) return;
    
    const newPrev = {
        ...currentPrevisionnel,
        id: 'prev_' + Date.now(),
        name: currentPrevisionnel.name + ' (copie)',
        tarifs: [...(currentPrevisionnel.tarifs || [])],
        budget: [...(currentPrevisionnel.budget || [])],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    previsionnels.push(newPrev);
    savePrevisionnelsNow();
    
    showToast('Prévisionnel dupliqué', 'success');
    viewPrevisionnel(newPrev.id);
}

// Supprimer un prévisionnel
async function deletePrevisionnel() {
    if (!currentPrevisionnel) return;
    
    if (!confirm('Supprimer ce prévisionnel ?')) return;
    
    previsionnels = previsionnels.filter(p => p.id !== currentPrevisionnel.id);
    await savePrevisionnelsNow();
    
    document.getElementById('previsionnelPage').classList.remove('active');
    currentPrevisionnel = null;
    renderPrevisionnelsListPage();
    
    showToast('Prévisionnel supprimé', 'success');
}

// Convertir un prévisionnel en spectacle
function convertPrevisionnelToSpectacle() {
    if (!currentPrevisionnel) return;
    
    const result = calculatePrevisionnelResult(currentPrevisionnel);
    
    if (!confirm(`Créer un spectacle à partir de ce prévisionnel ?\n\nCapacité totale : ${result.capaciteTotale} places\nLes tarifs et le budget seront copiés.`)) return;
    
    const p = currentPrevisionnel;
    
    // Créer le spectacle
    const spectacleId = 'spectacle_' + Date.now();
    const spectacle = {
        id: spectacleId,
        type: 'spectacle',
        name: p.name || 'Nouveau spectacle',
        location: p.lieu || '',
        date: p.date || '',
        time: '',
        capacite: result.capaciteTotale,
        // Convertir les tarifs en billetterie
        billetterie: (p.tarifs || []).map(t => ({
            id: 'tarif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            nom: t.nom,
            prix: t.prix,
            quantiteMax: t.quantite || 0,
            quantite: 0
        })),
        // Convertir le budget
        budget: (p.budget || []).map(line => ({
            id: 'budget_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            description: line.nom,
            montantType: line.type === 'percent' ? 'percent' : 'fixe',
            montantFixe: line.type !== 'percent' ? line.montant : 0,
            percentBilletterie: line.type === 'percent' ? line.montant : 0,
            tvaRate: 0,
            montantReel: 0,
            statut: 'estimatif',
            categorie: 'Autre'
        })),
        visuels: [],
        documents: [],
        communications: [],
        tasks: [],
        technique: { lieu: null, prestataires: [], voyages: [], hebergements: [], planning: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fromPrevisionnel: p.id
    };
    
    projects.push(spectacle);
    saveProjectsAsync();
    
    // Fermer la page prévisionnel
    document.getElementById('previsionnelPage').classList.remove('active');
    currentPrevisionnel = null;
    
    // Ouvrir le spectacle créé
    viewSpectacle(spectacleId);
    
    showToast('Spectacle créé à partir du prévisionnel !', 'success');
}

// ========== IMPORT VENTES ==========
let importSelectedFiles = []; // Array de fichiers
let importAnalysisResults = null;
let importTargetSpectacleId = null; // Si import depuis une page spectacle spécifique

// Détermine automatiquement quelles plateformes sont configurées
function getConfiguredPlatforms() {
    const platforms = [];
    
    // BilletWeb
    const bwCreds = getBilletwebCredentials();
    if (bwCreds.user && bwCreds.key) {
        platforms.push({ id: 'billetweb', name: 'BilletWeb', icon: '🎫', color: '#e94560' });
    }
    
    // Ticketmaster / Trium (nécessite URL API VPS)
    const tmCreds = getTicketmasterCredentials();
    if (tmCreds.user2 && tmCreds.pass2 && tmCreds.apiUrl) {
        platforms.push({ id: 'ticketmaster', name: 'Ticketmaster', icon: '🎪', color: '#0066cc' });
    }
    
    // France Billet (saisie manuelle uniquement)
    const fbCreds = getFrancebilletCredentials();
    if (fbCreds.structure && fbCreds.user && fbCreds.pass) {
        platforms.push({ id: 'francebillet', name: 'France Billet (manuel)', icon: '🎫', color: '#e67e22' });
    }
    
    return platforms;
}

// Ouvrir le modal d'import
function openImportVentesModal(spectacleId = null) {
    if (typeof window.hasPermission === 'function' && !window.hasPermission('import_ventes')) {
        showToast("Vous n'avez pas accès à l'import des ventes.", 'error');
        return;
    }
    if (spectacleId) {
        const sp = projects.find(p => p.id === spectacleId);
        if (sp && typeof isSpectacleDatePast === 'function' && isSpectacleDatePast(sp)) {
            showToast('L\'import des ventes n\'est pas disponible pour les spectacles passés.', 'error');
            return;
        }
    }
    importTargetSpectacleId = spectacleId;
    resetImport();
    
    // Afficher l'indicateur de mode
    const indicator = document.getElementById('importModeIndicator');
    if (spectacleId) {
        const spectacle = projects.find(p => p.id === spectacleId);
        indicator.style.display = 'block';
        document.getElementById('importTargetName').textContent = ` - Les ventes seront importées pour "${spectacle?.name || 'ce spectacle'}"`;
    } else {
        indicator.style.display = 'none';
    }
    
    // Afficher le résumé des plateformes configurées
    updateImportApiSummary();
    
    document.getElementById('importVentesModal').classList.add('active');
}

// Mettre à jour le résumé des API configurées
function updateImportApiSummary() {
    const container = document.getElementById('importApiSummaryContent');
    const platforms = getConfiguredPlatforms();
    
    if (platforms.length === 0) {
        container.innerHTML = `
            <div style="color: #e94560; font-size: 0.9rem;">
                ⚠️ Aucune plateforme configurée. <a href="#" onclick="openAdminPage(); closeImportVentesModal(); return false;" style="color: var(--mn-dark-blue);">Configurer dans Administration →  Intégrations</a>
            </div>
        `;
    } else {
        container.innerHTML =         platforms.map(p => `
            <span style="display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.7rem; background: ${p.color}15; border: 1px solid ${p.color}40; border-radius: 20px; font-size: 0.85rem; color: ${p.color};">
                ${p.icon} ${p.name}
            </span>
        `).join('');
    }
}

// Fermer le modal
function closeImportVentesModal() {
    document.getElementById('importVentesModal').classList.remove('active');
    resetImport();
}

// Réinitialiser l'import
function resetImport() {
    importSelectedFiles = [];
    importAnalysisResults = null;
    
    // Reset UI
    document.getElementById('importFilesList').style.display = 'none';
    document.getElementById('importFilesListContent').innerHTML = '';
    document.getElementById('importFileInput').value = '';
    
    // Show step 1, hide others
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importStep3').style.display = 'none';
    
    // Reset manual import
    manualImportCardCounter = 0;
    document.getElementById('manualImportLines').innerHTML = '';
    document.getElementById('manualImportDate').value = new Date().toISOString().split('T')[0];
    
    const missingBlock = document.getElementById('importMissingDataBlock');
    if (missingBlock) missingBlock.style.display = 'none';
    
    // Reset tabs to auto
    if (document.getElementById('importTabAuto')) {
        switchImportTab('auto');
    }
}

// ============================================
// SAISIE MANUELLE DES VENTES
// ============================================

let manualImportCardCounter = 0;

function switchImportTab(tab) {
    const autoTab = document.getElementById('importTabAuto');
    const manualTab = document.getElementById('importTabManual');
    const autoContent = document.getElementById('importAutoContent');
    const manualContent = document.getElementById('importManualContent');
    
    if (tab === 'auto') {
        autoTab.classList.add('active');
        manualTab.classList.remove('active');
        autoContent.style.display = 'block';
        manualContent.style.display = 'none';
    } else {
        autoTab.classList.remove('active');
        manualTab.classList.add('active');
        autoContent.style.display = 'none';
        manualContent.style.display = 'block';
        
        const dateInput = document.getElementById('manualImportDate');
        if (!dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        
        const linesContainer = document.getElementById('manualImportLines');
        if (linesContainer.children.length === 0) {
            addManualImportCard(importTargetSpectacleId || null);
        }
    }
}

function getAvailableSources() {
    const knownSources = ['billetweb', 'ticketmaster', 'francebillet', 'fnac', 'digitick', 'seetickets', 'eventbrite'];
    const adminReseaux = (appSettings.reseauxBilletterie || []).map(r => r.toLowerCase().replace(/\s+/g, ''));
    const allSources = [...new Set([...knownSources, ...adminReseaux, ...(appSettings.reseauxBilletterie || [])])];
    return allSources;
}

function addManualImportCard(preselectedId) {
    manualImportCardCounter++;
    var cardId = manualImportCardCounter;
    var container = document.getElementById('manualImportLines');

    var spectacleOptions = projects
        .filter(function(p) {
            if (p.type === 'tournee') return false;
            if (typeof isSpectacleDatePast === 'function' && isSpectacleDatePast(p)) return false;
            return true;
        })
        .map(function(p) {
            var label = (p.name || '');
            if (p.location) label += ' - ' + p.location;
            if (p.date) label += ' (' + p.date + ')';
            return '<option value="' + p.id + '">' + label.replace(/"/g, '&quot;') + '</option>';
        })
        .join('');

    var html = '<div class="manual-import-line" id="manualCard_' + cardId + '">' +
        '<div class="manual-line-header">' +
            '<strong style="font-size: 0.9rem; color: var(--mn-text-secondary);">🎭 Spectacle</strong>' +
            '<button type="button" class="manual-line-remove" onclick="removeManualImportCard(' + cardId + ')" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="form-group" style="margin-bottom: 0.75rem;">' +
            '<select id="manualCardSpectacle_' + cardId + '" onchange="onManualCardSpectacleChange(' + cardId + ')" ' +
                'style="width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--mn-border); border-radius: var(--mn-radius); font-size: 0.9rem; font-family: var(--mn-font);">' +
                '<option value="">-- Sélectionner un spectacle --</option>' +
                spectacleOptions +
            '</select>' +
        '</div>' +
        '<div id="manualCardNetworks_' + cardId + '">' +
            '<div style="text-align: center; padding: 0.75rem; color: #a0aec0; font-size: 0.85rem;">Sélectionnez un spectacle pour afficher les réseaux</div>' +
        '</div>' +
    '</div>';

    container.insertAdjacentHTML('beforeend', html);

    var specId = preselectedId || '';
    if (specId) {
        document.getElementById('manualCardSpectacle_' + cardId).value = specId;
        onManualCardSpectacleChange(cardId);
    }
}

function onManualCardSpectacleChange(cardId) {
    var spectacleId = document.getElementById('manualCardSpectacle_' + cardId).value;
    var networksContainer = document.getElementById('manualCardNetworks_' + cardId);

    if (!spectacleId) {
        networksContainer.innerHTML = '<div style="text-align: center; padding: 0.75rem; color: #a0aec0; font-size: 0.85rem;">Sélectionnez un spectacle pour afficher les réseaux</div>';
        return;
    }

    var spectacle = projects.find(function(p) { return p.id === spectacleId; });
    if (!spectacle) return;

    var reseaux = (spectacle.reseaux && spectacle.reseaux.length > 0)
        ? spectacle.reseaux
        : (appSettings.reseauxBilletterie || []).map(function(r) { return r.toLowerCase(); });

    if (reseaux.length === 0) reseaux = ['billetweb'];

    var lastReleve = null;
    if (spectacle.releves && spectacle.releves.length > 0) {
        lastReleve = spectacle.releves[spectacle.releves.length - 1];
    }

    var html = '<div class="manual-card-networks" style="border: 1px solid var(--mn-border, #edf2f7); border-radius: var(--mn-radius, 8px); overflow: hidden;">';
    html += '<div style="display: grid; grid-template-columns: 2fr 1.5fr 1.5fr; background: var(--mn-bg, #f7fafc); padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--mn-border, #edf2f7); font-size: 0.75rem; font-weight: 600; color: var(--mn-text-secondary, #718096); text-transform: uppercase; letter-spacing: 0.3px;">';
    html += '<div>Réseau</div><div style="text-align: right;">Billets</div><div style="text-align: right;">CA (€ TTC)</div>';
    html += '</div>';

    reseaux.forEach(function(reseau, i) {
        var billets = lastReleve ? (parseInt(lastReleve[reseau]) || 0) : 0;
        var ca = lastReleve ? (parseFloat(lastReleve[reseau + '_ca']) || 0) : 0;
        var displayName = reseau.charAt(0).toUpperCase() + reseau.slice(1);
        var bgColor = i % 2 === 0 ? 'white' : 'var(--mn-bg, #fafbfd)';

        html += '<div class="manual-card-network-row" style="display: grid; grid-template-columns: 2fr 1.5fr 1.5fr; gap: 0.5rem; padding: 0.55rem 0.75rem; border-bottom: 1px solid #f0f4f8; background: ' + bgColor + '; align-items: center;">';
        html += '<div style="font-weight: 600; font-size: 0.88rem; color: var(--mn-text, #2d3748);">' + displayName + '</div>';
        html += '<input type="number" class="manual-card-input" data-card="' + cardId + '" data-source="' + reseau + '" data-field="billets" value="' + billets + '" min="0" placeholder="0" style="width: 100%; padding: 0.45rem 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: 6px; font-size: 0.9rem; text-align: right; font-weight: 600; box-sizing: border-box;">';
        html += '<input type="number" class="manual-card-input" data-card="' + cardId + '" data-source="' + reseau + '" data-field="ca" value="' + ca + '" min="0" step="0.01" placeholder="0.00" style="width: 100%; padding: 0.45rem 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: 6px; font-size: 0.9rem; text-align: right; font-weight: 600; box-sizing: border-box;">';
        html += '</div>';
    });

    html += '</div>';
    html += '<button type="button" onclick="addManualCardCustomNetwork(' + cardId + ')" style="margin-top: 0.5rem; padding: 0.35rem 0.75rem; background: transparent; border: 1px dashed var(--mn-border, #e2e8f0); border-radius: 6px; color: var(--mn-text-secondary, #718096); font-size: 0.82rem; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.borderColor=\'var(--mn-primary, #6161ff)\';this.style.color=\'var(--mn-primary, #6161ff)\'" onmouseout="this.style.borderColor=\'var(--mn-border, #e2e8f0)\';this.style.color=\'var(--mn-text-secondary, #718096)\'">+ Ajouter un réseau</button>';

    networksContainer.innerHTML = html;
}

function addManualCardCustomNetwork(cardId) {
    var table = document.querySelector('#manualCardNetworks_' + cardId + ' .manual-card-networks');
    if (!table) return;

    var rowHtml = '<div class="manual-card-network-row" style="display: grid; grid-template-columns: 2fr 1.5fr 1.5fr; gap: 0.5rem; padding: 0.55rem 0.75rem; border-bottom: 1px solid #f0f4f8; align-items: center; background: #fffbf0;">';
    rowHtml += '<input type="text" class="manual-card-custom-source" data-card="' + cardId + '" placeholder="Nom du réseau..." style="padding: 0.45rem 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: 6px; font-size: 0.88rem; width: 100%; box-sizing: border-box;">';
    rowHtml += '<input type="number" class="manual-card-input" data-card="' + cardId + '" data-source="__custom__" data-field="billets" value="0" min="0" style="width: 100%; padding: 0.45rem 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: 6px; font-size: 0.9rem; text-align: right; font-weight: 600; box-sizing: border-box;">';
    rowHtml += '<input type="number" class="manual-card-input" data-card="' + cardId + '" data-source="__custom__" data-field="ca" value="0" min="0" step="0.01" style="width: 100%; padding: 0.45rem 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: 6px; font-size: 0.9rem; text-align: right; font-weight: 600; box-sizing: border-box;">';
    rowHtml += '</div>';

    table.insertAdjacentHTML('beforeend', rowHtml);
}

function removeManualImportCard(cardId) {
    var card = document.getElementById('manualCard_' + cardId);
    if (card) card.remove();

    var container = document.getElementById('manualImportLines');
    if (container.children.length === 0) {
        addManualImportCard();
    }
}

function submitManualImport() {
    var container = document.getElementById('manualImportLines');
    var cards = container.querySelectorAll('[id^="manualCard_"]');
    var dateReleve = document.getElementById('manualImportDate').value || new Date().toISOString().split('T')[0];

    if (cards.length === 0) {
        showToast('Ajoutez au moins un spectacle.', 'error');
        return;
    }

    var entries = [];
    var hasError = false;

    cards.forEach(function(card) {
        var cardId = card.id.replace('manualCard_', '');
        var spectacleSelect = document.getElementById('manualCardSpectacle_' + cardId);
        if (!spectacleSelect) return;
        var spectacleId = spectacleSelect.value;

        if (!spectacleId) {
            hasError = true;
            showToast('Veuillez sélectionner un spectacle pour chaque carte.', 'error');
            return;
        }

        var spManual = projects.find(function(p) { return p.id === spectacleId; });
        if (spManual && typeof isSpectacleDatePast === 'function' && isSpectacleDatePast(spManual)) {
            hasError = true;
            showToast('L\'import des ventes n\'est pas disponible pour les spectacles passés.', 'error');
            return;
        }

        var networkData = {};
        var inputs = card.querySelectorAll('.manual-card-input');
        inputs.forEach(function(input) {
            var source = input.dataset.source;
            var field = input.dataset.field;

            if (source === '__custom__') {
                var row = input.closest('.manual-card-network-row');
                var nameInput = row ? row.querySelector('.manual-card-custom-source') : null;
                if (nameInput && nameInput.value.trim()) {
                    source = nameInput.value.trim().toLowerCase().replace(/\s+/g, '');
                } else {
                    return;
                }
            }

            if (!networkData[source]) networkData[source] = { billets: 0, ca: 0 };
            if (field === 'billets') networkData[source].billets = parseInt(input.value) || 0;
            if (field === 'ca') networkData[source].ca = parseFloat(input.value) || 0;
        });

        var hasData = false;
        Object.keys(networkData).forEach(function(source) {
            var d = networkData[source];
            if (d.billets > 0 || d.ca > 0) hasData = true;
            entries.push({ spectacleId: spectacleId, source: source, billets: d.billets, ca: d.ca });
        });

        if (!hasData) {
            hasError = true;
            showToast('Veuillez saisir au moins une valeur de billets ou CA.', 'error');
        }
    });

    if (hasError || entries.length === 0) return;

    var grouped = {};
    entries.forEach(function(entry) {
        var key = entry.spectacleId + '|' + entry.source;
        if (!grouped[key]) {
            grouped[key] = { spectacleId: entry.spectacleId, source: entry.source, totalBillets: 0, totalCA: 0 };
        }
        grouped[key].totalBillets += entry.billets;
        grouped[key].totalCA += entry.ca;
    });

    var today = dateReleve;
    var updatedCount = 0;

    var bySpectacle = {};
    Object.values(grouped).forEach(function(g) {
        if (!bySpectacle[g.spectacleId]) bySpectacle[g.spectacleId] = {};
        bySpectacle[g.spectacleId][g.source] = { totalBillets: g.totalBillets, totalCA: g.totalCA };
    });

    for (const [spectacleId, sources] of Object.entries(bySpectacle)) {
        const spectacle = projects.find(p => p.id === spectacleId);
        if (!spectacle) continue;

        if (!spectacle.reseaux) spectacle.reseaux = [];
        if (!spectacle.releves) spectacle.releves = [];

        const sourceNames = Object.keys(sources);

        sourceNames.forEach(source => {
            if (!spectacle.reseaux.includes(source)) {
                spectacle.reseaux.push(source);
                if (!appSettings.reseauxBilletterie) appSettings.reseauxBilletterie = [];
                const exists = appSettings.reseauxBilletterie.some(r => r.toLowerCase() === source.toLowerCase());
                if (!exists) {
                    appSettings.reseauxBilletterie.push(source.charAt(0).toUpperCase() + source.slice(1));
                }
                spectacle.releves.forEach(r => {
                    if (r[source] === undefined) r[source] = 0;
                    if (r[source + '_ca'] === undefined) r[source + '_ca'] = 0;
                });
            }
        });

        let releveToday = spectacle.releves.find(r => r.date === today);

        if (releveToday) {
            sourceNames.forEach(source => {
                releveToday[source] = sources[source].totalBillets;
                releveToday[source + '_ca'] = sources[source].totalCA;
            });
        } else {
            const now = new Date();
            const heure = now.toTimeString().slice(0, 5);
            const newReleve = { date: today, heure: heure };
            if (spectacle.releves.length > 0) {
                const lastReleve = spectacle.releves[spectacle.releves.length - 1];
                spectacle.reseaux.forEach(reseau => {
                    newReleve[reseau] = lastReleve[reseau] || 0;
                    newReleve[reseau + '_ca'] = lastReleve[reseau + '_ca'] || 0;
                });
            }
            sourceNames.forEach(source => {
                newReleve[source] = sources[source].totalBillets;
                newReleve[source + '_ca'] = sources[source].totalCA;
            });
            spectacle.releves.push(newReleve);
        }

        spectacle.updatedAt = new Date().toISOString();
        updatedCount++;
    }

    saveProjectsAsync();
    if (typeof saveSettingsAsync === 'function') saveSettingsAsync();

    closeImportVentesModal();
    showToast('Saisie manuelle terminée : ' + updatedCount + ' spectacle(s) mis à jour', 'success');

    renderProjects();
    refreshBilletterieIfOpen();
}

// Gérer la sélection de plusieurs fichiers
function handleImportFilesSelect(event) {
    const files = Array.from(event.target.files);
    files.forEach(file => {
        // Éviter les doublons
        if (!importSelectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            importSelectedFiles.push(file);
        }
    });
    updateImportFilesList();
}

// Mettre à jour l'affichage de la liste des fichiers
function updateImportFilesList() {
    const container = document.getElementById('importFilesListContent');
    const listDiv = document.getElementById('importFilesList');
    
    if (importSelectedFiles.length === 0) {
        listDiv.style.display = 'none';
        updateImportActionsVisibility();
        return;
    }
    
    listDiv.style.display = 'block';
    container.innerHTML = importSelectedFiles.map((file, idx) => {
        const icon = getFileIcon(file.name);
        return `
            <div class="import-file-item">
                <span class="file-icon">${icon}</span>
                <span class="file-name">${file.name}</span>
                <span style="color: #636e72; font-size: 0.8rem; margin-right: 0.5rem;">${formatFileSize(file.size)}</span>
                <button type="button" class="file-remove" onclick="removeImportFile(${idx})">×</button>
            </div>
        `;
    }).join('');
    
    updateImportActionsVisibility();
}

// Obtenir l'icône selon le type de fichier
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️';
    if (['xlsx', 'xls'].includes(ext)) return '📊';
    if (ext === 'csv') return '📄';
    if (ext === 'pdf') return '📕';
    return '📁';
}

// Formater la taille du fichier
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

// Supprimer un fichier de la liste
function removeImportFile(index) {
    importSelectedFiles.splice(index, 1);
    updateImportFilesList();
}

// Mettre à jour la visibilité du bouton d'action (toujours visible maintenant)
function updateImportActionsVisibility() {
    // Le bouton est toujours visible car on lance toutes les API configurées automatiquement
}

// Configurer le drag & drop
document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('importDropZone');
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
            });
        });
        
        dropZone.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => {
                if (!importSelectedFiles.find(f => f.name === file.name && f.size === file.size)) {
                    importSelectedFiles.push(file);
                }
            });
            updateImportFilesList();
        });
    }
});

// Lancer l'analyse IA
async function startImportAnalysis() {
    const hasFiles = importSelectedFiles.length > 0;
    const platforms = getConfiguredPlatforms();
    const hasApi = platforms.length > 0;
    
    if (!hasFiles && !hasApi) {
        showToast('Ajoutez au moins un fichier ou configurez une plateforme dans Administration → Intégrations.', 'error');
        return;
    }
    
    if (!authToken) {
        showToast('Session expirée. Veuillez vous reconnecter.', 'error');
        return;
    }
    
    // Passer à l'étape 2 (loading)
    document.getElementById('importStep1').style.display = 'none';
    document.getElementById('importStep2').style.display = 'block';
    
    try {
        // Préparer les données à envoyer
        const formData = new FormData();
        
        // Ajouter tous les fichiers
        importSelectedFiles.forEach((file, idx) => {
            formData.append(`file_${idx}`, file);
        });
        formData.append('fileCount', importSelectedFiles.length);
        
        // Ajouter automatiquement TOUTES les plateformes configurées
        
        // BilletWeb
        const bwCreds = getBilletwebCredentials();
        if (bwCreds.user && bwCreds.key) {
            formData.append('billetweb', 'true');
            formData.append('billetwebApiKey', bwCreds.key);
            formData.append('billetwebOrgId', bwCreds.user);
        }
        
        // Ticketmaster / Trium (via API VPS)
        const tmCreds = getTicketmasterCredentials();
        if (tmCreds.user2 && tmCreds.pass2 && tmCreds.apiUrl) {
            formData.append('ticketmaster', 'true');
            formData.append('triumApiUrl', tmCreds.apiUrl);
            formData.append('triumUser1', tmCreds.user1);
            formData.append('triumPass1', tmCreds.pass1);
            formData.append('triumUser2', tmCreds.user2);
            formData.append('triumPass2', tmCreds.pass2);
        }
        
        // France Billet : non envoyé (saisie manuelle uniquement)
        
        // Ajouter le token d'authentification
        formData.append('token', authToken);
        
        // Ajouter la liste des spectacles existants pour le matching
        const spectaclesList = projects
            .filter(p => p.type !== 'tournee')
            .map(s => ({
                id: s.id,
                name: s.name,
                date: s.date,
                location: s.location,
                tarifs: (s.billetterie || []).map(t => ({ nom: t.nom, prix: t.prix }))
            }));
        formData.append('spectacles', JSON.stringify(spectaclesList));
        
        // Si on importe pour un spectacle spécifique
        if (importTargetSpectacleId) {
            formData.append('targetSpectacleId', importTargetSpectacleId);
        }
        
        // Progress indicator
        let sources = [];
        if (importSelectedFiles.length > 0) sources.push(`${importSelectedFiles.length} fichier(s)`);
        platforms.forEach(p => sources.push(p.name));
        document.getElementById('importProgress').textContent = `Analyse de ${sources.join(' + ')}...`;
        
        const apiUrl = (typeof API_URL !== 'undefined' ? API_URL : 'api');
        const response = await fetch(`${apiUrl}/import-ventes.php`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + authToken, 'X-Auth-Token': authToken },
            body: formData
        });
        
        if (!response.ok) {
            const errText = await response.text();
            let errMsg = 'Erreur lors de l\'analyse';
            try {
                const errJson = JSON.parse(errText);
                if (errJson.error) errMsg = errJson.error;
            } catch (e) {}
            throw new Error(errMsg);
        }
        
        const results = await response.json();
        importAnalysisResults = results;
        
        // Post-traitement: matching local tolérant pour les spectacles non reconnus
        if (importAnalysisResults && importAnalysisResults.spectacles) {
            importAnalysisResults.spectacles = enhanceMatchingLocally(importAnalysisResults.spectacles);
        }
        
        // Afficher les résultats
        displayImportResults(importAnalysisResults);
        
        // Afficher l'erreur Trium si présente
        if (importAnalysisResults && importAnalysisResults.triumError) {
            showToast('⚠️ ' + importAnalysisResults.triumError, 'error');
        }
        
    } catch (error) {
        console.error('Erreur import:', error);
        showToast('Erreur lors de l\'analyse: ' + error.message, 'error');
        resetImport();
    }
}

// ============================================
// Matching local tolérant (filet de sécurité)
// ============================================

// Normalise une chaîne pour la comparaison : minuscules, sans accents, sans ponctuation, sans mots vides
function normalizeForMatching(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprimer accents
        .replace(/[''`]/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')  // supprimer ponctuation
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(w => !['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'a', 'au', 'aux', 'en', 'l', 'd'].includes(w))
        .join(' ');
}

// Extrait les mots-clés significatifs d'un nom de spectacle
function extractKeywords(str) {
    if (!str) return [];
    const normalized = normalizeForMatching(str);
    // Filtrer aussi les noms de villes courants et les mots très courts
    return normalized.split(' ').filter(w => w.length > 1);
}

// Calcule la distance de Levenshtein entre deux chaînes
function levenshteinDistance(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b[i-1] === a[j-1]
                ? matrix[i-1][j-1]
                : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

// Score de similarité entre deux chaînes normalisées (0 à 1)
function stringSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const na = normalizeForMatching(a);
    const nb = normalizeForMatching(b);
    if (na === nb) return 1;
    
    // Vérifier si l'un contient l'autre
    if (na.includes(nb) || nb.includes(na)) return 0.9;
    
    // Score par mots-clés communs
    const kwA = extractKeywords(a);
    const kwB = extractKeywords(b);
    if (kwA.length === 0 || kwB.length === 0) return 0;
    
    let matchedWords = 0;
    kwA.forEach(wa => {
        const best = kwB.reduce((best, wb) => {
            // Match exact
            if (wa === wb) return Math.max(best, 1);
            // Un contient l'autre
            if (wa.includes(wb) || wb.includes(wa)) return Math.max(best, 0.85);
            // Levenshtein pour les petites fautes
            const maxLen = Math.max(wa.length, wb.length);
            if (maxLen <= 2) return best;
            const dist = levenshteinDistance(wa, wb);
            const sim = 1 - (dist / maxLen);
            return sim >= 0.7 ? Math.max(best, sim) : best;
        }, 0);
        matchedWords += best;
    });
    
    return matchedWords / Math.max(kwA.length, kwB.length);
}

// Compare les dates avec tolérance (même mois, ou écart de quelques jours)
function dateSimilarity(dateA, dateB) {
    if (!dateA || !dateB) return 0.5; // pas de date = neutre
    try {
        const a = new Date(dateA);
        const b = new Date(dateB);
        const diffDays = Math.abs((a - b) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 1;
        if (diffDays <= 3) return 0.9;
        if (diffDays <= 7) return 0.7;
        if (diffDays <= 30) return 0.4;
        return 0;
    } catch { return 0; }
}

// Score global de matching entre un spectacle importé et un projet existant
function matchScore(imported, project) {
    const nameSim = stringSimilarity(imported.name, project.name);
    const dateSim = dateSimilarity(imported.date, project.date);
    
    // Bonus si la localisation correspond
    let locationBonus = 0;
    if (imported.location && project.location) {
        locationBonus = stringSimilarity(imported.location, project.location) * 0.15;
    }
    
    // Bonus si le nom du spectacle contient le lieu du projet ou inversement
    let crossBonus = 0;
    if (imported.name && project.location) {
        const nameNorm = normalizeForMatching(imported.name);
        const locNorm = normalizeForMatching(project.location);
        if (nameNorm.includes(locNorm) || locNorm.includes(nameNorm)) crossBonus = 0.05;
    }
    
    // Le nom pèse 65%, la date 20%, la localisation et bonus croisé complètent
    const score = (nameSim * 0.65) + (dateSim * 0.20) + locationBonus + crossBonus;
    
    console.log(`[Match] "${imported.name}" vs "${project.name}" → name:${nameSim.toFixed(2)} date:${dateSim.toFixed(2)} loc:${locationBonus.toFixed(2)} cross:${crossBonus.toFixed(2)} = ${score.toFixed(2)}`);
    
    return score;
}

// Améliore le matching des spectacles non reconnus par n8n
function enhanceMatchingLocally(spectacles) {
    const existingProjects = projects.filter(p => p.type !== 'tournee');
    if (existingProjects.length === 0) return spectacles;
    
    console.log('=== MATCHING LOCAL TOLÉRANT ===');
    
    return spectacles.map(spectacle => {
        // Si déjà matché par n8n, on vérifie juste que l'ID est valide
        if (spectacle.matchedId) {
            const exists = existingProjects.find(p => p.id === spectacle.matchedId);
            if (exists) {
                console.log(`✓ "${spectacle.name}" déjà matché à "${exists.name}" par n8n`);
                return spectacle;
            }
            console.log(`⚠ "${spectacle.name}" avait matchedId=${spectacle.matchedId} mais projet introuvable, on retente...`);
        }
        
        // Calculer les scores pour chaque projet existant
        const scored = existingProjects.map(p => ({
            project: p,
            score: matchScore(spectacle, p)
        })).sort((a, b) => b.score - a.score);
        
        const best = scored[0];
        const secondBest = scored[1];
        
        // Seuil de matching: score >= 0.55 ET écart significatif avec le 2ème
        const MATCH_THRESHOLD = 0.55;
        const MIN_GAP = 0.08; // écart minimum avec le 2ème pour éviter les ambiguïtés
        
        if (best && best.score >= MATCH_THRESHOLD) {
            const gap = secondBest ? (best.score - secondBest.score) : 1;
            if (gap >= MIN_GAP || best.score >= 0.8) {
                console.log(`✓ MATCH LOCAL: "${spectacle.name}" → "${best.project.name}" (score: ${best.score.toFixed(2)}, gap: ${gap.toFixed(2)})`);
                spectacle.matchedId = best.project.id;
            } else {
                console.log(`⚠ AMBIGU: "${spectacle.name}" → "${best.project.name}" (${best.score.toFixed(2)}) vs "${secondBest.project.name}" (${secondBest.score.toFixed(2)}) - écart trop faible`);
            }
        } else {
            console.log(`✗ PAS DE MATCH: "${spectacle.name}" (meilleur: "${best?.project.name}" = ${best?.score.toFixed(2)})`);
        }
        
        return spectacle;
    });
}

// Afficher les résultats de l'analyse
function displayImportResults(results) {
    console.log('=== displayImportResults appelé ===');
    console.log('Type de results:', typeof results);
    console.log('results:', results);
    console.log('results.spectacles:', results?.spectacles);
    console.log('Nb spectacles:', results?.spectacles?.length);
    
    // Si results est un tableau, prendre le premier élément ou fusionner
    if (Array.isArray(results)) {
        console.log('Results est un tableau, fusion...');
        const merged = { spectacles: [], confidence: 0 };
        results.forEach(r => {
            if (r.spectacles) merged.spectacles.push(...r.spectacles);
            if (r.confidence) merged.confidence = Math.max(merged.confidence, r.confidence);
        });
        results = merged;
        console.log('Après fusion:', results);
    }
    
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importStep3').style.display = 'block';
    
    // Afficher le niveau de confiance
    const confidence = results.confidence || 85;
    const confidenceBadge = document.getElementById('importConfidence');
    confidenceBadge.textContent = `Confiance: ${confidence}%`;
    confidenceBadge.style.background = confidence >= 80 ? 'var(--success)' : confidence >= 60 ? '#ffc107' : 'var(--accent)';
    
    // Grouper les spectacles par matchedId (ou par nom+date si pas de matchedId)
    const groupedSpectacles = {};
    (results.spectacles || []).forEach((spectacle, idx) => {
        const key = spectacle.matchedId || `${spectacle.name}_${spectacle.date}`;
        if (!groupedSpectacles[key]) {
            groupedSpectacles[key] = {
                matchedId: spectacle.matchedId,
                name: spectacle.name,
                date: spectacle.date,
                location: spectacle.location,
                sources: [],
                originalIndices: []
            };
        }
        groupedSpectacles[key].sources.push({
            source: spectacle.source || 'inconnu',
            totalBillets: spectacle.totalBillets || (spectacle.tarifs ? spectacle.tarifs.reduce((s, t) => s + (t.quantite || 0), 0) : 0),
            totalCA: spectacle.totalCA || (spectacle.tarifs ? spectacle.tarifs.reduce((s, t) => s + ((t.quantite || 0) * (t.prix || 0)), 0) : 0),
            tarifs: spectacle.tarifs
        });
        groupedSpectacles[key].originalIndices.push(idx);
    });
    
    // Stocker les groupes pour référence
    window.importGroupedSpectacles = groupedSpectacles;
    
    // Générer le HTML des résultats groupés
    const container = document.getElementById('importResultsList');
    let html = '';
    
    Object.entries(groupedSpectacles).forEach(([key, group], groupIdx) => {
        const isMatched = group.matchedId !== null && group.matchedId !== undefined;
        const matchedProject = isMatched ? projects.find(p => p.id === group.matchedId) : null;
        
        // Calculer les totaux combinés
        const totalBilletsCombined = group.sources.reduce((s, src) => s + src.totalBillets, 0);
        const totalCACombined = group.sources.reduce((s, src) => s + src.totalCA, 0);
        
        // Couleurs pour les sources
        const sourceColors = {
            billetweb: '#e94560',
            ticketmaster: '#0066cc',
            francebillet: '#e67e22',
            fnac: '#ffc107',
            digitick: '#00b894',
            default: '#636e72'
        };
        
        html += `
            <div class="import-match-card ${isMatched ? 'matched' : 'unmatched'}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <strong style="font-size: 1.1rem;">${group.name || 'Spectacle inconnu'}</strong>
                        ${group.date ? `<div style="color: #636e72; font-size: 0.9rem;">📅 ${group.date}</div>` : ''}
                        ${group.location ? `<div style="color: #636e72; font-size: 0.9rem;">📍 ${group.location}</div>` : ''}
                    </div>
                    <div>
                        ${isMatched ? `
                            <span class="badge" style="background: var(--success); color: white;">✓ Lié à: ${matchedProject?.name || 'Spectacle'}${matchedProject?.location ? ' (' + matchedProject.location + ')' : ''}</span>
                        ` : `
                            <select onchange="updateGroupedImportMatch('${key}', this.value)" style="padding: 0.3rem; border-radius: 5px; border: 1px solid var(--border);">
                                <option value="">-- Sélectionner un spectacle --</option>
                                <option value="__NEW__">+ Créer un nouveau spectacle</option>
                                ${projects.filter(p => p.type !== 'tournee').map(p => `
                                    <option value="${p.id}">${p.name}${p.location ? ' - ' + p.location : ''}${p.date ? ' (' + p.date + ')' : ''}</option>
                                `).join('')}
                            </select>
                        `}
                    </div>
                </div>
                
                <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--primary);">Ventes détectées par source:</div>
                
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${group.sources.map((src, srcIdx) => {
                        const color = sourceColors[src.source] || sourceColors.default;
                        return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--light); border-radius: 8px; border-left: 4px solid ${color};">
                                <div style="display: flex; align-items: center; gap: 1rem;">
                                    <span style="font-weight: 600; color: ${color}; text-transform: uppercase; font-size: 0.85rem; min-width: 100px;">${src.source}</span>
                                    <div style="display: flex; gap: 1.5rem;">
                                        <div>
                                            <div style="font-size: 0.75rem; color: #636e72;">Billets</div>
                                            <input type="number" class="import-tarif-input" value="${src.totalBillets}" 
                                                   onchange="updateGroupedSourceTotal('${key}', ${srcIdx}, 'totalBillets', this.value)" min="0" 
                                                   style="font-size: 1.1rem; font-weight: 600; width: 80px;">
                                        </div>
                                        <div>
                                            <div style="font-size: 0.75rem; color: #636e72;">CA</div>
                                            <div style="display: flex; align-items: center; gap: 0.2rem;">
                                                <input type="number" class="import-tarif-input" value="${src.totalCA.toFixed(2)}" 
                                                       onchange="updateGroupedSourceTotal('${key}', ${srcIdx}, 'totalCA', this.value)" min="0" step="0.01"
                                                       style="font-size: 1.1rem; font-weight: 600; color: var(--success); width: 100px;">
                                                <span style="color: var(--success);">€</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 2px solid var(--border); display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem;">
                    <span>Total combiné: ${totalBilletsCombined} billets</span>
                    <span style="color: var(--success);">${totalCACombined.toFixed(2)} €</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html || '<p style="text-align: center; color: #636e72;">Aucune donnée détectée dans le document.</p>';
    
    // Bloc "Données manquantes" : sources configurées sur les spectacles mais non importées
    const missingBlock = document.getElementById('importMissingDataBlock');
    if (missingBlock) {
        const missingData = computeMissingSourcesForImport(groupedSpectacles);
        if (missingData.hasMissing) {
            missingBlock.style.display = 'block';
            missingBlock.dataset.missingJson = JSON.stringify(missingData.entries);
            const sourcesList = [...new Set(missingData.entries.flatMap(e => e.missingSources))].join(', ');
            missingBlock.querySelector('.importMissingDataSources').textContent = sourcesList || 'France Billet, Fnac, etc.';
        } else {
            missingBlock.style.display = 'none';
        }
    }
}

// Calcule les sources manquantes par spectacle (réseaux configurés mais non importés)
function computeMissingSourcesForImport(groupedSpectacles) {
    const entries = [];
    const knownAutoSources = ['billetweb', 'ticketmaster', 'fichier'];
    
    Object.entries(groupedSpectacles || {}).forEach(([key, group]) => {
        const spectacle = group.matchedId ? projects.find(p => p.id === group.matchedId) : null;
        const reseaux = spectacle?.reseaux?.length ? spectacle.reseaux.map(r => r.toLowerCase().replace(/\s+/g, '')) : (appSettings.reseauxBilletterie || []).map(r => r.toLowerCase().replace(/\s+/g, ''));
        if (reseaux.length === 0) reseaux.push('billetweb');
        
        const importedSources = (group.sources || []).map(s => (s.source || '').toLowerCase());
        const missingSources = reseaux.filter(r => !importedSources.includes(r) && !knownAutoSources.includes(r));
        
        if (missingSources.length > 0) {
            entries.push({
                groupKey: key,
                name: group.name,
                date: group.date,
                location: group.location,
                matchedId: group.matchedId,
                missingSources
            });
        }
    });
    
    return { hasMissing: entries.length > 0, entries };
}

function openMissingDataManualModal() {
    const block = document.getElementById('importMissingDataBlock');
    if (!block || !block.dataset.missingJson) return;
    const entries = JSON.parse(block.dataset.missingJson);
    const modal = document.getElementById('importMissingDataModal');
    if (!modal) return;
    
    const content = document.getElementById('importMissingDataModalContent');
    content.innerHTML = entries.map((e, i) => {
        const sourcesHtml = e.missingSources.map(src => {
            const srcName = src.charAt(0).toUpperCase() + src.slice(1);
            return `
                <div style="display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-weight: 600; color: var(--primary);">${srcName}</span>
                    <input type="number" data-group="${e.groupKey}" data-source="${src}" data-field="billets" value="0" min="0" placeholder="Billets" style="padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border);">
                    <input type="number" data-group="${e.groupKey}" data-source="${src}" data-field="ca" value="0" min="0" step="0.01" placeholder="CA €" style="padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border);">
                </div>
            `;
        }).join('');
        return `
            <div class="import-missing-spectacle-item" style="padding: 1rem; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 1rem; background: var(--light);">
                <div style="font-weight: 700; margin-bottom: 0.75rem;">${e.name || 'Spectacle'}${e.date ? ' • ' + e.date : ''}</div>
                ${sourcesHtml}
            </div>
        `;
    }).join('');
    
    modal.classList.add('active');
}

function closeMissingDataModal() {
    document.getElementById('importMissingDataModal')?.classList.remove('active');
}

function saveMissingDataAndClose() {
    const modal = document.getElementById('importMissingDataModal');
    if (!modal || !importAnalysisResults?.spectacles) return;
    
    const inputs = modal.querySelectorAll('input[data-group][data-source][data-field]');
    const groupUpdates = {};
    
    inputs.forEach(inp => {
        const groupKey = inp.dataset.group;
        const source = inp.dataset.source;
        const field = inp.dataset.field;
        const value = parseFloat(inp.value) || 0;
        if (!groupUpdates[groupKey]) groupUpdates[groupKey] = {};
        if (!groupUpdates[groupKey][source]) groupUpdates[groupKey][source] = { totalBillets: 0, totalCA: 0 };
        groupUpdates[groupKey][source][field === 'billets' ? 'totalBillets' : 'totalCA'] = value;
    });
    
    Object.entries(groupUpdates).forEach(([groupKey, sources]) => {
        const group = window.importGroupedSpectacles?.[groupKey];
        if (!group) return;
        const baseSpectacle = importAnalysisResults.spectacles[group.originalIndices?.[0]];
        const base = baseSpectacle ? { name: baseSpectacle.name, date: baseSpectacle.date, location: baseSpectacle.location, matchedId: baseSpectacle.matchedId } : { name: group.name, date: group.date, location: group.location, matchedId: group.matchedId };
        
        Object.entries(sources).forEach(([source, data]) => {
            if (data.totalBillets > 0 || data.totalCA > 0) {
                importAnalysisResults.spectacles.push({
                    ...base,
                    source,
                    totalBillets: data.totalBillets,
                    totalCA: data.totalCA,
                    tarifs: null
                });
            }
        });
    });
    
    closeMissingDataModal();
    displayImportResults(importAnalysisResults);
}

// Mettre à jour le matching d'un spectacle
function updateImportMatch(spectacleIdx, value) {
    if (!importAnalysisResults || !importAnalysisResults.spectacles) return;
    importAnalysisResults.spectacles[spectacleIdx].matchedId = value === '' ? null : value;
}

// Mettre à jour un tarif
function updateImportTarif(spectacleIdx, tarifIdx, field, value) {
    if (!importAnalysisResults || !importAnalysisResults.spectacles) return;
    const tarif = importAnalysisResults.spectacles[spectacleIdx]?.tarifs?.[tarifIdx];
    if (tarif) {
        tarif[field] = parseFloat(value) || 0;
        // Rafraîchir l'affichage
        displayImportResults(importAnalysisResults);
    }
}

// Mettre à jour totalBillets ou totalCA directement (format simplifié)
function updateImportTotal(spectacleIdx, field, value) {
    if (!importAnalysisResults || !importAnalysisResults.spectacles) return;
    const spectacle = importAnalysisResults.spectacles[spectacleIdx];
    if (spectacle) {
        spectacle[field] = parseFloat(value) || 0;
    }
}

// Mettre à jour le match pour un groupe de spectacles
function updateGroupedImportMatch(groupKey, value) {
    if (!importAnalysisResults || !importAnalysisResults.spectacles || !window.importGroupedSpectacles) return;
    const group = window.importGroupedSpectacles[groupKey];
    if (group) {
        // Mettre à jour tous les spectacles du groupe
        group.originalIndices.forEach(idx => {
            importAnalysisResults.spectacles[idx].matchedId = value === '' ? null : value;
        });
        group.matchedId = value === '' ? null : value;
        // Rafraîchir l'affichage
        displayImportResults(importAnalysisResults);
    }
}

// Mettre à jour les totaux d'une source dans un groupe
function updateGroupedSourceTotal(groupKey, sourceIdx, field, value) {
    if (!importAnalysisResults || !importAnalysisResults.spectacles || !window.importGroupedSpectacles) return;
    const group = window.importGroupedSpectacles[groupKey];
    if (group && group.sources[sourceIdx]) {
        const newValue = parseFloat(value) || 0;
        group.sources[sourceIdx][field] = newValue;
        
        // Mettre à jour le spectacle original correspondant
        const originalIdx = group.originalIndices[sourceIdx];
        if (importAnalysisResults.spectacles[originalIdx]) {
            importAnalysisResults.spectacles[originalIdx][field] = newValue;
        }
    }
}

// Valider et enregistrer l'import
async function validateImport() {
    if (!importAnalysisResults || !importAnalysisResults.spectacles) {
        showToast('Aucune donnée à importer', 'error');
        return;
    }
    
    // Utiliser window.importGroupedSpectacles comme source de vérité (reflète l'UI et les modifications utilisateur)
    const groups = window.importGroupedSpectacles || {};
    const groupsToProcess = Object.values(groups).filter(g => g.matchedId);
    const unmatchedGroups = Object.values(groups).filter(g => !g.matchedId);
    
    // Avertir si des spectacles ne sont pas liés
    if (unmatchedGroups.length > 0) {
        const names = unmatchedGroups.map(g => g.name || 'Inconnu').join(', ');
        if (!confirm(`${unmatchedGroups.length} spectacle(s) non lié(s) seront ignorés : ${names}\n\nVoulez-vous continuer quand même ?`)) {
            return;
        }
    }
    
    let updatedCount = 0;
    let createdCount = 0;
    const today = new Date().toISOString().split('T')[0];
    
    // Traiter chaque groupe (source de vérité = UI)
    for (const group of groupsToProcess) {
        const matchedId = group.matchedId;
        
        // Fusionner les sources du groupe (plusieurs spectacles peuvent contribuer à la même source)
        const sourcesMap = {};
        (group.sources || []).forEach(src => {
            const sourceName = src.source || 'billetweb';
            if (!sourcesMap[sourceName]) {
                sourcesMap[sourceName] = { totalBillets: 0, totalCA: 0 };
            }
            sourcesMap[sourceName].totalBillets += src.totalBillets || 0;
            sourcesMap[sourceName].totalCA += src.totalCA || 0;
        });
        
        const groupedData = {
            matchedId: matchedId,
            name: group.name,
            date: group.date,
            location: group.location,
            sources: sourcesMap
        };
        
        if (matchedId === '__NEW__') {
            // Créer un nouveau spectacle
            const newId = 'spectacle_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const sources = Object.keys(groupedData.sources);
            
            // Calculer totaux combinés
            let totalBillets = 0;
            let totalCA = 0;
            Object.values(groupedData.sources).forEach(s => {
                totalBillets += s.totalBillets;
                totalCA += s.totalCA;
            });
            
            const prixMoyen = totalBillets > 0 ? Math.round((totalCA / totalBillets) * 100) / 100 : 0;
            
            // Créer le relevé avec toutes les sources
            const now = new Date();
            const heure = now.toTimeString().slice(0, 5);
            const newReleve = { date: today, heure: heure };
            sources.forEach(source => {
                newReleve[source] = groupedData.sources[source].totalBillets;
                newReleve[source + '_ca'] = groupedData.sources[source].totalCA;
            });
            
            const newSpectacle = {
                id: newId,
                type: 'spectacle',
                name: groupedData.name || 'Nouveau spectacle',
                date: groupedData.date || '',
                location: groupedData.location || '',
                capacite: totalBillets,
                billetterie: [{
                    id: 'tarif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    nom: 'Import',
                    prix: prixMoyen,
                    quantite: totalBillets
                }],
                reseaux: sources,
                releves: [newReleve],
                budget: [],
                visuels: [],
                documents: [],
                communications: [],
                tasks: [],
                members: [],
                membersManual: [],
                technique: { lieu: null, prestataires: [], voyages: [], hebergements: [], planning: [] },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            // Auto-assigner les Producteurs et Chargés de production
            await autoAssignMembersToNewSpectacle(newSpectacle);
            projects.push(newSpectacle);
            createdCount++;
        } else {
            // Mettre à jour un spectacle existant
            const spectacle = projects.find(p => p.id === matchedId);
            if (spectacle) {
                // Initialiser les tableaux si nécessaire
                if (!spectacle.reseaux) spectacle.reseaux = [];
                if (!spectacle.releves) spectacle.releves = [];
                
                const sources = Object.keys(groupedData.sources);
                
                // Ajouter les sources aux réseaux si pas présentes
                sources.forEach(source => {
                    if (!spectacle.reseaux.includes(source)) {
                        spectacle.reseaux.push(source);
                        // Initialiser les anciens relevés avec cette source à 0
                        spectacle.releves.forEach(r => {
                            if (r[source] === undefined) r[source] = 0;
                            if (r[source + '_ca'] === undefined) r[source + '_ca'] = 0;
                        });
                    }
                });
                
                // Créer ou mettre à jour le relevé du jour
                let releveToday = spectacle.releves.find(r => r.date === today);
                
                if (releveToday) {
                    // Mettre à jour le relevé existant avec toutes les sources
                    sources.forEach(source => {
                        releveToday[source] = groupedData.sources[source].totalBillets;
                        releveToday[source + '_ca'] = groupedData.sources[source].totalCA;
                    });
                } else {
                    // Créer un nouveau relevé
                    const now = new Date();
                    const heure = now.toTimeString().slice(0, 5);
                    const newReleve = { date: today, heure: heure };
                    
                    // Copier les valeurs des autres réseaux du dernier relevé
                    if (spectacle.releves.length > 0) {
                        const lastReleve = spectacle.releves[spectacle.releves.length - 1];
                        spectacle.reseaux.forEach(reseau => {
                            newReleve[reseau] = lastReleve[reseau] || 0;
                            newReleve[reseau + '_ca'] = lastReleve[reseau + '_ca'] || 0;
                        });
                    }
                    
                    // Mettre les nouvelles valeurs des sources importées
                    sources.forEach(source => {
                        newReleve[source] = groupedData.sources[source].totalBillets;
                        newReleve[source + '_ca'] = groupedData.sources[source].totalCA;
                    });
                    
                    spectacle.releves.push(newReleve);
                }
                
                spectacle.updatedAt = new Date().toISOString();
                updatedCount++;
            }
        }
    }
    
    // Sauvegarder
    saveProjectsAsync();
    
    // Fermer et notifier
    closeImportVentesModal();
    showToast(`Import terminé : ${updatedCount} spectacle(s) mis à jour, ${createdCount} créé(s)`, 'success');
    
    // Rafraîchir l'affichage
    renderProjects();
    refreshBilletterieIfOpen();
}

// PAGE TOURNÉE
function viewTournee(id) {
    currentTournee = projects.find(p => p.id === id);
    if (!currentTournee) return;
    const isTourneeArchived = (currentTournee.lifecycle || '') === 'archived';

    const tourneeTitleEl = document.getElementById('tourneeTitle');
    if (tourneeTitleEl) {
        const safeName = (currentTournee.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        tourneeTitleEl.innerHTML = safeName + (isTourneeArchived
            ? ' <span class="badge" style="margin-left:0.5rem;background:#e2e8f0;color:#334155;">🗃️ Tournée archivée</span>'
            : '');
    }
    
    const spectacles = projects.filter(p => p.parentId === id);
    // Calculer les vraies stats de billetterie
    let totalSold = 0;
    let totalCapacity = 0;
    let totalCA = 0;
    let totalEvolution = 0;
    let hasEvolution = false;
    spectacles.forEach(s => {
        totalSold += getTotalBillets(s);
        totalCapacity += s.capacite || 0;
        totalCA += getTotalCA(s);
        if (!isSpectacleDatePast(s)) {
            const evo = getEvolutionBillets(s);
            if (evo !== null) { totalEvolution += evo; hasEvolution = true; }
        }
    });
    const percentage = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

    // Construire les stats en grille
    let statsHtml = `
        <div class="detail-stat-box">
            <div class="detail-stat-label">Nombre de dates</div>
            <div class="detail-stat-value">${spectacles.length}</div>
        </div>
    `;
    
    if (window.hasPermission && window.hasPermission('billetterie')) {
        statsHtml += `
            <div class="detail-stat-box">
                <div class="detail-stat-label">Billetterie totale</div>
                <div class="detail-stat-value">${totalSold} / ${totalCapacity} ${hasEvolution ? evolutionBadgeHtml(totalEvolution, false) : ''}</div>
            </div>
            <div class="detail-stat-box">
                <div class="detail-stat-label">Taux de remplissage</div>
                <div class="detail-stat-value">${percentage}%</div>
            </div>
            <div class="detail-stat-box ca-highlight">
                <div class="detail-stat-label">Chiffre d'affaires</div>
                <div class="detail-stat-value">${totalCA.toFixed(2)} €</div>
            </div>
        `;
    }

    document.getElementById('tourneeStats').innerHTML = `
        <div class="detail-header-stats">
            ${statsHtml}
        </div>
    `;

    if (currentTournee.files && currentTournee.files.length > 0) {
        document.getElementById('tourneeFiles').innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Fichiers de la tournée :</div>
            ${currentTournee.files.map(f => `<a href="${f.url}" target="_blank" style="color: var(--accent); margin-right: 1rem;">📎 ${f.name}</a>`).join('')}
        `;
    } else {
        document.getElementById('tourneeFiles').innerHTML = '';
    }

    // Notes : accessibles via Accès rapides (page dédiée)

    // Initialiser les visuels de la tournée s'ils n'existent pas
    if (!currentTournee.visuels) {
        currentTournee.visuels = [];
    }

    // Initialiser les documents de la tournée s'ils n'existent pas
    if (!currentTournee.documents) {
        currentTournee.documents = [];
    }

    // Initialiser les communications de la tournée s'ils n'existent pas
    if (!currentTournee.communications) {
        currentTournee.communications = [];
    }

    // Créer les cartes Visuels, Documents et Communication (seulement si permissions)
    const visuelsCount = currentTournee.visuels?.length || 0;
    const documentsCount = currentTournee.documents?.length || 0;
    const communicationsCount = currentTournee.communications?.length || 0;
    
    if (window.hasPermission && window.hasPermission('visuels')) {
        document.getElementById('tourneeVisuelsCard').innerHTML = `
            <div class="project-card" onclick="openTourneeVisuelsPage()" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1rem; font-weight: 600; color: var(--primary);">🖼️ Visuels</span>
                    <span style="background: var(--light); color: var(--primary); font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; font-size: 0.85rem;">${visuelsCount}</span>
                </div>
                <span style="color: var(--accent); font-size: 1.1rem;">→</span>
            </div>
        `;
    } else {
        document.getElementById('tourneeVisuelsCard').innerHTML = '';
    }
    
    document.getElementById('tourneeDocumentsCard').innerHTML = `
        <div class="project-card" onclick="openTourneeDocumentsPage()" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1rem; font-weight: 600; color: var(--primary);">📄 Documents</span>
                <span style="background: var(--light); color: var(--primary); font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; font-size: 0.85rem;">${documentsCount}</span>
            </div>
            <span style="color: var(--accent); font-size: 1.1rem;">→</span>
        </div>
    `;

    // Carte Communication nationale (seulement si permission)
    if (window.hasPermission && window.hasPermission('communication')) {
        document.getElementById('tourneeCommunicationCard').innerHTML = `
            <div class="project-card" onclick="openCommunicationTourneePage()" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1rem; font-weight: 600; color: var(--primary);">📣 Communication nationale</span>
                    <span style="background: var(--light); color: var(--primary); font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; font-size: 0.85rem;">${communicationsCount}</span>
                </div>
                <span style="color: var(--accent); font-size: 1.1rem;">→</span>
            </div>
        `;
    } else {
        document.getElementById('tourneeCommunicationCard').innerHTML = '';
    }

    // Carte Équipe de la tournée
    if (!currentTournee.members) currentTournee.members = [];
    if (!currentTournee.membersManual) currentTournee.membersManual = [];
    renderMembresCard(currentTournee, 'tourneeMembresCard');

    // Carte Frais fixes de la tournée (seulement si permission budget)
    if (window.hasPermission && window.hasPermission('budget')) {
        const fraisFixes = currentTournee.fraisFixesTournee || [];
        const totalFrais = fraisFixes.reduce((sum, f) => sum + (parseFloat(f.montant) || 0), 0);
        document.getElementById('tourneeFraisFixesCard').innerHTML = `
            <div class="project-card" onclick="openTourneeFraisFixesModal()" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1rem; font-weight: 600; color: var(--primary);">📌 Frais fixes tournée</span>
                    <span style="background: var(--light); color: var(--primary); font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; font-size: 0.85rem;">${fraisFixes.length}</span>
                </div>
                <span style="color: var(--accent); font-size: 1.1rem;">→</span>
            </div>
        `;
    } else {
        document.getElementById('tourneeFraisFixesCard').innerHTML = '';
    }

    // Bouton statut (Confirmé / En étude)
    const tourneeActionsDiv = document.getElementById('tourneeDetailActions');
    if (tourneeActionsDiv) {
        let archiveBtn = tourneeActionsDiv.querySelector('[data-tournee-archive-toggle]');
        if (!archiveBtn) {
            archiveBtn = document.createElement('button');
            archiveBtn.className = 'btn btn-secondary';
            archiveBtn.setAttribute('data-tournee-archive-toggle', '1');
            tourneeActionsDiv.insertBefore(archiveBtn, tourneeActionsDiv.firstChild);
        }
        archiveBtn.textContent = isTourneeArchived ? '↩️ Désarchiver la tournée' : '🗃️ Archiver la tournée';
        archiveBtn.onclick = function() {
            if (isTourneeArchived) unarchiveTournee();
            else archiveTournee();
        };

        const existingStatusBtn = tourneeActionsDiv.querySelector('[data-status-toggle]');
        if (isTourneeArchived) {
            if (existingStatusBtn) existingStatusBtn.remove();
        } else {
            if (existingStatusBtn) existingStatusBtn.remove();
            const statusBtn = document.createElement('button');
            statusBtn.setAttribute('data-status-toggle', '1');
            statusBtn.className = (currentTournee.status || 'confirmed') === 'study' ? 'btn' : 'btn btn-secondary';
            if ((currentTournee.status || 'confirmed') === 'study') statusBtn.style.background = 'var(--mn-green)';
            statusBtn.onclick = function() { toggleProjectStatus(currentTournee.id); };
            statusBtn.textContent = (currentTournee.status || 'confirmed') === 'study' ? '✅ Passer en Confirmé' : '📋 Passer en Étude';
            tourneeActionsDiv.insertBefore(statusBtn, tourneeActionsDiv.firstChild);
        }
    }

    // Accès rapides (sidebar)
    const quickAccessEl = document.getElementById('tourneeDetailQuickAccess');
    if (quickAccessEl) {
        const visuelsCount = currentTournee.visuels?.length || 0;
        const documentsCount = currentTournee.documents?.length || 0;
        const communicationsCount = currentTournee.communications?.length || 0;
        const membresCount = (currentTournee.members?.length || 0) + (currentTournee.membersManual?.length || 0);
        const fraisFixesCount = (currentTournee.fraisFixesTournee || []).length;
        const notesCountInitial = _projectNotesCountCache.get(currentTournee.id)?.count ?? 0;

        const items = [];
        if (window.hasPermission && window.hasPermission('visuels')) {
            items.push(`<a class="quick-access-item" onclick="openTourneeVisuelsPage(); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">🖼️ Visuels</span><span class="quick-access-item-count">${visuelsCount}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }
        items.push(`<a class="quick-access-item" onclick="openTourneeDocumentsPage(); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">📄 Documents</span><span class="quick-access-item-count">${documentsCount}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);
        items.push(`<a class="quick-access-item" onclick="openProjectNotesPage('tournee'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">📝 Notes</span><span class="quick-access-item-count" id="qaTourneeNotesCount">${notesCountInitial}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);
        if (window.hasPermission && window.hasPermission('communication')) {
            items.push(`<a class="quick-access-item" onclick="openCommunicationTourneePage(); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">📣 Communication nationale</span><span class="quick-access-item-count">${communicationsCount}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }
        items.push(`<a class="quick-access-item" onclick="openMembresModal('${currentTournee.id}'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">👥 Équipe</span><span class="quick-access-item-count">${membresCount}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);
        if (window.hasPermission && window.hasPermission('budget')) {
            items.push(`<a class="quick-access-item" onclick="openTourneeFraisFixesModal(); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">📌 Frais fixes tournée</span><span class="quick-access-item-count">${fraisFixesCount}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }
        quickAccessEl.innerHTML = items.length ? items.join('') : '<div style="color: var(--mn-text-secondary); font-size: 0.9rem;">Aucun accès rapide</div>';

        // Charger le compteur notes en arrière-plan
        loadProjectNotesCount(currentTournee.id)
            .then(count => updateQuickAccessNotesCount('tournee', currentTournee.id, count))
            .catch(() => {});
    }
    
    const editTourneeBtn = document.querySelector('#tourneeDetailActions button[onclick="editTourneeFromDetail()"]');
    if (editTourneeBtn) editTourneeBtn.style.display = isTourneeArchived ? 'none' : 'inline-block';
    const deleteTourneeBtn = document.querySelector('#tourneeDetailActions button[onclick="deleteTournee()"]');
    if (deleteTourneeBtn) deleteTourneeBtn.style.display = isTourneeArchived ? 'none' : 'inline-block';

    renderSpectaclesList();
    document.getElementById('tourneePage').classList.add('active');
    document.getElementById('tourneePage').classList.add('page-enter');
    setTimeout(() => { const tp = document.getElementById('tourneePage'); if (tp) tp.classList.remove('page-enter'); }, 700);
    updateFabAppearance();
    
    // Réappliquer les permissions après le rendu
    applyPermissions();
}

function renderSpectaclesList() {
    const container = document.getElementById('spectaclesList');
    let spectacles = projects.filter(p => p.parentId === currentTournee.id);
    
    // Filtrer les spectacles visibles pour les non-admin
    const isAdmin = currentUser?.role === 'admin';
    if (!isAdmin && window.hasPermission && window.hasPermission('projets_assignes')) {
        const userId = currentUser?.id ? String(currentUser.id) : null;
        if (userId) {
            const toStr = (x) => (typeof x === 'object' && x && x.id != null) ? String(x.id) : String(x);
            // Si membre de la tournée → voit tout
            const tourneeMembers = (currentTournee.members || []).map(m => toStr(m));
            const isTourneeMember = tourneeMembers.includes(userId);
            if (!isTourneeMember) {
                // Sinon → ne voit que les spectacles où il est membre direct
                spectacles = spectacles.filter(s => {
                    if (s.members && s.members.some(m => toStr(m) === userId)) return true;
                    const assignedToOrAssignees = (t) => (t.assignedTo || t.assignees || []).some(id => toStr(id) === userId);
                    if (s.tasks && s.tasks.some(assignedToOrAssignees)) return true;
                    const dtUser = getDirecteurTechniqueFromEquipe(s);
                    if (dtUser && String(dtUser.id) === userId) return true;
                    return false;
                });
            }
        }
    }

    if (spectacles.length === 0) {
        container.innerHTML = '<div style="background: white; padding: 3rem; text-align: center; border-radius: 15px;"><h3>Aucune date</h3><p>Ajoutez votre première date à cette tournée</p></div>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isPastDate = (s) => {
        if (!s || !s.date) return false;
        const d = new Date(s.date);
        if (Number.isNaN(d.getTime())) return false;
        d.setHours(0, 0, 0, 0);
        return d < today;
    };
    const sortByDate = (a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
    };

    const archived = spectacles.filter(s => (s.lifecycle || '') === 'archived').sort(sortByDate);
    const active = spectacles.filter(s => (s.lifecycle || '') !== 'archived');
    const upcoming = active.filter(s => !isPastDate(s)).sort(sortByDate);
    const past = active.filter(s => isPastDate(s)).sort(sortByDate);
    const ordered = upcoming.concat(past);

    // Sur la page tournée, ne pas permettre de changer le spectacle au clic sur le nom
    const nameClickAttr = '';
    
    const cardsHtml = ordered.map(s => {
        // Utiliser les vraies fonctions de calcul
        const totalBillets = getTotalBillets(s);
        const capacite = s.capacite || 0;
        const totalCA = getTotalCA(s);
        const percentage = capacite > 0 ? Math.round((totalBillets / capacite) * 100) : 0;
        const evolution = getEvolutionBillets(s);
        const evolutionHtmlRow = !isPastDate(s) ? evolutionBadgeHtml(evolution, true) : '';
        
        // Récupérer le lieu au format NOM - VILLE
        const lieuNom = getSpectacleLieuDisplay(s);
        
        // Compter les tâches en cours
        const tasksCount = s.tasks ? s.tasks.filter(t => t.status !== 'done').length : 0;
        
        // Visuel de référence
        const visuelRef = getVisuelReference(s);
        const visuelHtml = visuelRef ? 
            `<img src="${getFileDisplayUrl(visuelRef)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; margin-right: 1rem;">` : 
            `<div style="width: 60px; height: 60px; background: var(--light); border-radius: 8px; margin-right: 1rem; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 1.5rem;">🎭</div>`;
        
        const pastClass = isPastDate(s) ? ' spectacle-item--past' : '';
        const pastBadge = isPastDate(s) ? '<span class="badge badge-past">Passé</span>' : '';
        return `
            <div class="spectacle-item${pastClass}" onclick='viewSpectacle("${s.id}")' style="cursor: pointer;">
                <div style="display: flex; align-items: flex-start;">
                    ${visuelHtml}
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 0.5rem 0;" ${nameClickAttr}>${s.name || 'Date de tournée'} ${pastBadge} ${s.modeExploitation && s.modeExploitation !== 'organise' ? getModeExploitationBadge(s.modeExploitation) : ''}</h4>
                        <div class="spectacle-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem;">
                            <div>📅 ${s.date || 'Non défini'}</div>
                            <div>🕐 ${s.time || 'Non défini'}</div>
                            <div>📍 ${lieuNom}</div>
                            ${window.hasPermission && window.hasPermission('billetterie') ? `
                                <div>🎟️ ${totalBillets} / ${capacite} (${percentage}%) ${evolutionHtmlRow}</div>
                                <div>💰 ${totalCA.toFixed(2)} €</div>
                            ` : ''}
                            ${tasksCount > 0 ? `<div>📋 ${tasksCount} tâche(s) en cours</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    let archivesHtml = '';
    if (archived.length > 0) {
        archivesHtml += `
            <div class="tournee-archive-block">
                <h3 class="tournee-archive-title">🗃️ Archives de la tournée <span style="font-size:0.85rem;font-weight:400;opacity:0.75;">(${archived.length})</span></h3>
                <div class="archives-list">
                    ${archived.map(s => {
                        const archivedTxt = s.archivedAt ? formatDateCourte(String(s.archivedAt).slice(0, 10)) : '—';
                        return `
                            <button type="button" class="archive-row" onclick='viewSpectacle("${s.id}")'>
                                <span class="archive-col archive-col-name">${s.name || 'Date de tournée'}</span>
                                <span class="archive-col">Date: ${s.date || 'Non définie'}</span>
                                <span class="archive-col">Lieu: ${getSpectacleLieuDisplay(s)}</span>
                                <span class="archive-col">Archivé le ${archivedTxt}</span>
                                <span class="archive-col archive-col-action">Consulter →</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = cardsHtml + archivesHtml;
}

async function addSpectacleToTournee() {
    console.log('addSpectacleToTournee appelé, currentTournee:', currentTournee);
    if (!currentTournee) {
        alert('Erreur: tournée non définie');
        return;
    }
    
    currentProject = null;
    currentFiles = [];
    document.getElementById('modalTitle').textContent = `Ajouter une date à "${currentTournee.name}"`;
    document.getElementById('projectForm').reset();
    document.getElementById('projectId').value = '';
    document.getElementById('parentTourneeId').value = currentTournee.id;
    document.getElementById('projectType').value = 'spectacle';
    document.getElementById('projectType').disabled = true;
    document.getElementById('typeGroup').style.display = 'none';
    document.getElementById('nameGroup').style.display = 'none';
    document.getElementById('spectacleFields').style.display = 'block';
    if (typeof showCatalogueSelector === 'function') await showCatalogueSelector(true);
    const catSelect = document.getElementById('projectCatalogueId');
    if (catSelect && currentTournee.catalogueId) catSelect.value = currentTournee.catalogueId;
    
    // Reset mode d'exploitation
    const modeSelect = document.getElementById('projectModeExploitation');
    if (modeSelect) modeSelect.value = 'organise';
    const modeFields = document.getElementById('modeExploitationFields');
    if (modeFields) modeFields.style.display = 'none';
    
    populateLieuxSelect('');
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('projectDate');
    const timeEl = document.getElementById('projectTime');
    if (dateEl && !dateEl.value) dateEl.value = today;
    if (timeEl && !timeEl.value) timeEl.value = '20:00';
    const lieuSelect = document.getElementById('projectLieuId');
    if (lieuSelect && lieuSelect.options.length > 0 && !lieuSelect.value) {
        const firstOpt = lieuSelect.options[0];
        if (firstOpt.value) { lieuSelect.value = firstOpt.value; updateLieuPreview(); }
    }
    document.getElementById('projectModal').classList.add('active');
}

function closeTourneePage() {
    document.getElementById('tourneePage').classList.remove('active');
    currentTournee = null;
    renderProjectsListPage();
    document.getElementById('projectsListPage').classList.add('active');
    document.getElementById('projectsListPage').classList.add('page-enter');
    setTimeout(() => { const pl = document.getElementById('projectsListPage'); if (pl) pl.classList.remove('page-enter'); }, 700);
    updateFabAppearance();
}

async function toggleProjectStatus(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    project.status = (project.status || 'confirmed') === 'confirmed' ? 'study' : 'confirmed';
    project.updatedAt = new Date().toISOString();
    await saveProjectsAsync();
    showToast('✅ Statut modifié : ' + (project.status === 'confirmed' ? 'Confirmé' : 'En étude'), 'success');
    if (project.type === 'tournee') viewTournee(project.id);
    else viewSpectacle(project.id);
}

function editTourneeFromDetail() {
    if (currentTournee) {
        editProject(currentTournee.id);
    }
}

// ========== FRAIS FIXES TOURNÉE ==========
function openTourneeFraisFixesModal() {
    if (!currentTournee) return;
    if (!currentTournee.fraisFixesTournee) currentTournee.fraisFixesTournee = [];
    renderTourneeFraisFixesList();
    document.getElementById('tourneeFraisFixesModal').classList.add('active');
}
function closeTourneeFraisFixesModal() {
    document.getElementById('tourneeFraisFixesModal').classList.remove('active');
}
function renderTourneeFraisFixesList() {
    const container = document.getElementById('tourneeFraisFixesList');
    const frais = currentTournee.fraisFixesTournee || [];
    if (frais.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 1.5rem; color: var(--mn-text-light);">Aucun frais fixe défini</div>';
        return;
    }
    container.innerHTML = frais.map((f, i) => `
        <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; padding: 0.75rem; background: var(--mn-bg); border-radius: var(--mn-radius); border: 1px solid var(--mn-border);">
            <input type="text" value="${typeof escHtml !== 'undefined' ? escHtml(f.label || '') : (f.label || '').replace(/"/g, '&quot;')}" placeholder="Libellé" onchange="currentTournee.fraisFixesTournee[${i}].label = this.value" style="flex: 2; padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: 6px; font-size: 0.88rem;">
            <select onchange="currentTournee.fraisFixesTournee[${i}].category = this.value" style="flex: 1; padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: 6px; font-size: 0.85rem;">
                ${(typeof BUDGET_CATEGORIES !== 'undefined' ? BUDGET_CATEGORIES : ['Cachet', 'Voyage', 'Hôtel', 'Repas', 'Location salle', 'Technique', 'Sécurité', 'Communication', 'L&Co', 'Autre']).map(cat => `<option value="${cat}" ${f.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
            <input type="number" value="${f.montant || 0}" placeholder="Montant HT" step="0.01" onchange="currentTournee.fraisFixesTournee[${i}].montant = parseFloat(this.value) || 0" style="flex: 1; padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: 6px; font-size: 0.88rem;">
            <select onchange="currentTournee.fraisFixesTournee[${i}].tvaRate = parseFloat(this.value)" style="width: 80px; padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: 6px; font-size: 0.85rem;">
                <option value="0" ${(f.tvaRate || 0) === 0 ? 'selected' : ''}>0% TVA</option>
                <option value="5.5" ${f.tvaRate === 5.5 ? 'selected' : ''}>5.5%</option>
                <option value="10" ${f.tvaRate === 10 ? 'selected' : ''}>10%</option>
                <option value="20" ${f.tvaRate === 20 ? 'selected' : ''}>20%</option>
            </select>
            <button onclick="currentTournee.fraisFixesTournee.splice(${i}, 1); renderTourneeFraisFixesList();" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; color: var(--mn-red);" title="Supprimer">🗑️</button>
        </div>
    `).join('');
}
function addTourneeFraiFixe() {
    if (!currentTournee.fraisFixesTournee) currentTournee.fraisFixesTournee = [];
    currentTournee.fraisFixesTournee.push({
        id: 'ff_' + Date.now(),
        label: '',
        category: 'Autre',
        montant: 0,
        tvaRate: 0
    });
    renderTourneeFraisFixesList();
}
async function saveTourneeFraisFixesAndPropagate() {
    currentTournee.updatedAt = new Date().toISOString();
    const spectacles = projects.filter(p => p.parentId === currentTournee.id);
    const fraisFixesSource = currentTournee.fraisFixesTournee || [];
    spectacles.forEach(spectacle => {
        if (!spectacle.budget) spectacle.budget = [];
        spectacle.budget = spectacle.budget.filter(line => !line.fromTournee);
        fraisFixesSource.forEach(ff => {
            spectacle.budget.push({
                id: 'bff_' + ff.id + '_' + spectacle.id,
                designation: ff.label,
                label: ff.label,
                category: ff.category,
                montantType: 'fixe',
                montantFixe: ff.montant,
                tvaRate: ff.tvaRate || 0,
                isReel: false,
                fromTournee: true,
                tourneeFraisId: ff.id
            });
        });
        spectacle.updatedAt = new Date().toISOString();
    });
    await saveProjectsAsync();
    closeTourneeFraisFixesModal();
    viewTournee(currentTournee.id);
    showToast('✅ Frais fixes propagés dans ' + spectacles.length + ' spectacle(s)', 'success');
}

function editTournee() {
    if (!currentTournee) return;
    closeTourneePage();
    editProject(currentTournee.id);
}

function deleteTournee() {
    if (!currentTournee) return;
    
    const spectacles = projects.filter(p => p.parentId === currentTournee.id);
    if (spectacles.length > 0) {
        if (!confirm(`Cette tournée contient ${spectacles.length} date(s). Supprimer la tournée ET toutes ses dates ?`)) {
            return;
        }
    } else {
        if (!confirm('Supprimer cette tournée ?')) {
            return;
        }
    }
    
    console.log('deleteTournee: Suppression de la tournée', currentTournee.name, 'id:', currentTournee.id);
    console.log('deleteTournee: Nombre de projets AVANT:', projects.length);
    
    projects = projects.filter(p => p.id !== currentTournee.id && p.parentId !== currentTournee.id);
    
    console.log('deleteTournee: Nombre de projets APRÈS:', projects.length);
    console.log('deleteTournee: Appel saveProjectsAsync...');
    
    saveProjectsAsync();
    refreshCurrentView();
    closeTourneePage();
}

function archiveTournee() {
    if (!currentTournee) return;
    const children = projects.filter(p => p.parentId === currentTournee.id);
    if (!confirm(`Archiver cette tournée et ses ${children.length} date(s) ?`)) return;

    const now = new Date().toISOString();
    currentTournee.lifecycle = 'archived';
    currentTournee.archivedAt = now;
    currentTournee.updatedAt = now;
    children.forEach(s => {
        s.lifecycle = 'archived';
        s.archivedAt = s.archivedAt || now;
        s.updatedAt = now;
    });

    saveProjectsAsync();
    showToast('🗃️ Tournée archivée avec ses spectacles', 'success');
    viewTournee(currentTournee.id);
}

function unarchiveTournee() {
    if (!currentTournee) return;
    const children = projects.filter(p => p.parentId === currentTournee.id);
    if (!confirm(`Désarchiver cette tournée et ses ${children.length} date(s) ?`)) return;

    const now = new Date().toISOString();
    currentTournee.lifecycle = 'active';
    delete currentTournee.archivedAt;
    currentTournee.updatedAt = now;
    children.forEach(s => {
        s.lifecycle = 'active';
        delete s.archivedAt;
        s.updatedAt = now;
    });

    saveProjectsAsync();
    showToast('✅ Tournée désarchivée', 'success');
    viewTournee(currentTournee.id);
}

// PAGE SPECTACLE
if (!window.currentSpectacleDetail) {
    window.currentSpectacleDetail = null;
}

async function viewSpectacle(id) {
    window.currentSpectacleDetail = projects.find(p => p.id === id);
    if (!window.currentSpectacleDetail) return;
    const isArchived = (window.currentSpectacleDetail.lifecycle || '') === 'archived';

    // Visuel de référence
    const visuelRef = getVisuelReference(window.currentSpectacleDetail);
    const visuelHtml = visuelRef ? `<img src="${getFileDisplayUrl(visuelRef)}" class="visuel-thumbnail" style="margin-right: 1rem;">` : '';

    const canChangeCatalogue = (!isArchived) && (!window.hasPermission || window.hasPermission('catalogue') || window.hasPermission('catalogue', 'edit'));
    const titleClickable = canChangeCatalogue ? `onclick="openChangeSpectacleCatalogueModal('${id}')" style="cursor: pointer; text-decoration: underline; text-underline-offset: 3px;" title="Cliquer pour changer le spectacle lié au catalogue"` : '';
    document.getElementById('spectacleDetailTitle').innerHTML = `
        <div class="header-with-visuel">
            ${visuelHtml}
            <span ${titleClickable}>${window.currentSpectacleDetail.name}</span>
        </div>
    `;
    
    // Calculer les vraies stats billetterie
    const totalBillets = getTotalBillets(window.currentSpectacleDetail);
    const capacite = window.currentSpectacleDetail.capacite || 0;
    const totalCA = getTotalCA(window.currentSpectacleDetail);
    const percentage = capacite > 0 ? Math.round((totalBillets / capacite) * 100) : 0;
    const evolution = getEvolutionBillets(window.currentSpectacleDetail);
    const evolutionHtmlDetail = !isSpectacleDatePast(window.currentSpectacleDetail) ? evolutionBadgeHtml(evolution, false) : '';

    // Badge
    if (window.currentSpectacleDetail.parentId) {
        const parentTournee = projects.find(p => p.id === window.currentSpectacleDetail.parentId);
        document.getElementById('spectacleDetailBadge').innerHTML = `<span class="badge badge-tournee" style="display: inline-block; margin-bottom: 1rem;">Date de tournée : ${parentTournee ? parentTournee.name : ''}</span> ${getModeExploitationBadge(window.currentSpectacleDetail.modeExploitation || 'organise')} ${isArchived ? '<span class="badge" style="display: inline-block; margin-left: 0.4rem; background:#e2e8f0;color:#334155;">🗃️ Archivé</span>' : ''}`;
    } else {
        document.getElementById('spectacleDetailBadge').innerHTML = `<span class="badge" style="display: inline-block; margin-bottom: 1rem;">SPECTACLE ISOLÉ</span> ${getModeExploitationBadge(window.currentSpectacleDetail.modeExploitation || 'organise')} ${isArchived ? '<span class="badge" style="display: inline-block; margin-left: 0.4rem; background:#e2e8f0;color:#334155;">🗃️ Archivé</span>' : ''}`;
    }

    // Meta : date, heure, lieu dans le module titre (date et heure éditables) - format lieu: NOM - VILLE
    const metaEl = document.getElementById('spectacleDetailMeta');
    if (metaEl) {
        const lieuDisplay = getSpectacleLieuDisplay(window.currentSpectacleDetail);
        metaEl.innerHTML = isArchived ? `
            <span class="spectacle-meta-item">📅 ${window.currentSpectacleDetail.date || 'Non défini'}</span>
            <span class="spectacle-meta-sep">·</span>
            <span class="spectacle-meta-item">🕐 ${window.currentSpectacleDetail.time || 'Non défini'}</span>
            <span class="spectacle-meta-sep">·</span>
            <span class="spectacle-meta-item spectacle-meta-lieu">📍 ${lieuDisplay}</span>
        ` : `
            <span class="spectacle-meta-item">📅 <span class="editable" onclick="editInline(this, '${id}', 'date', 'date')" title="Cliquer pour modifier">${window.currentSpectacleDetail.date || 'Non défini'}</span></span>
            <span class="spectacle-meta-sep">·</span>
            <span class="spectacle-meta-item">🕐 <span class="editable" onclick="editInline(this, '${id}', 'time', 'time')" title="Cliquer pour modifier">${window.currentSpectacleDetail.time || 'Non défini'}</span></span>
            <span class="spectacle-meta-sep">·</span>
            <span class="spectacle-meta-item spectacle-meta-lieu" onclick="openLieuInfoModal('${id}')" style="cursor: pointer; text-decoration: underline; text-underline-offset: 2px;">📍 ${lieuDisplay}</span>
        `;
    }

    // Affichage catalogue (texte seul, le changement se fait en cliquant sur le nom)
    const catalogueRow = document.getElementById('spectacleDetailCatalogueRow');
    if (catalogueRow) {
        if (typeof loadCatalogueData === 'function') await loadCatalogueData();
        const catId = window.currentSpectacleDetail.catalogueId || '';
        const fiche = (typeof catalogueData !== 'undefined' && catalogueData) ? catalogueData.find(f => f.id === catId) : null;
        catalogueRow.innerHTML = fiche ? `
            <span style="font-size: 0.9rem; color: var(--mn-text-light);">Spectacle catalogue : ${(fiche.name || '') + (fiche.genre ? ' (' + fiche.genre + ')' : '')}</span>
        ` : `
            <span style="font-size: 0.9rem; color: var(--mn-text-light);">Spectacle catalogue : Non lié</span>
        `;
    }

    // Calculer le seuil de rentabilité (si permission budget)
    let seuilRentabiliteHtml = '';
    let billetsNecessaires = null;
    if (window.hasPermission && window.hasPermission('budget') && window.currentSpectacleDetail.budget) {
        const res = getBilletsNecessairesSeuil(window.currentSpectacleDetail);
        billetsNecessaires = res.billets;
    }
    
    // Construire les stats en grille (date, heure, lieu sont dans le module titre)
    let statsHtml = '';
    
    if (window.hasPermission && window.hasPermission('billetterie')) {
        statsHtml += `
            <div class="detail-stat-box">
                <div class="detail-stat-label">Billets vendus</div>
                <div class="detail-stat-value">${totalBillets} / ${capacite} ${evolutionHtmlDetail}</div>
            </div>
            <div class="detail-stat-box">
                <div class="detail-stat-label">Taux de remplissage</div>
                <div class="detail-stat-value">${percentage}%</div>
            </div>
            <div class="detail-stat-box ca-highlight">
                <div class="detail-stat-label">Chiffre d'affaires</div>
                <div class="detail-stat-value">${totalCA.toFixed(2)} €</div>
            </div>
        `;
        
        if (billetsNecessaires !== null) {
            const estRentable = totalBillets >= billetsNecessaires;
            statsHtml += `
                <div class="detail-stat-box">
                    <div class="detail-stat-label">Seuil de rentabilité</div>
                    <div class="detail-stat-value" style="font-size: 1.2rem;">
                        ${billetsNecessaires} billets
                        <div style="font-size: 0.75rem; margin-top: 0.25rem; color: ${estRentable ? 'var(--success)' : 'var(--accent)'}; font-weight: 600;">
                            ${estRentable ? '✓ Rentable' : `✗ Pas rentable<div style="font-size: 0.7rem; margin-top: 0.2rem; color: #636e72; font-weight: 500;">encore ${billetsNecessaires - totalBillets} billets à vendre</div>`}
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    const statsCard = document.getElementById('spectacleDetailStats');
    if (statsCard) {
        statsCard.innerHTML = statsHtml ? `
            <div class="detail-header-stats">
                ${statsHtml}
            </div>
        ` : '';
        statsCard.style.display = statsHtml ? '' : 'none';
    }

    // Graphique et dernier relevé (si permission billetterie et spectacle non vendu)
    const modeExplBill = window.currentSpectacleDetail.modeExploitation || 'organise';
    if (window.hasPermission && window.hasPermission('billetterie') && modeExplBill !== 'vendu') {
        renderSpectacleDetailChart(window.currentSpectacleDetail);
        renderSpectacleDetailLastReleve(window.currentSpectacleDetail);
    } else {
        const chartWrapper = document.getElementById('spectacleDetailChartWrapper');
        const lastReleveEl = document.getElementById('spectacleDetailLastReleve');
        if (chartWrapper) chartWrapper.style.display = 'none';
        if (lastReleveEl) { lastReleveEl.innerHTML = ''; lastReleveEl.style.display = 'none'; }
    }

    // Fichiers
    if (window.currentSpectacleDetail.files && window.currentSpectacleDetail.files.length > 0) {
        document.getElementById('spectacleDetailFiles').innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Fichiers :</div>
            ${window.currentSpectacleDetail.files.map(f => `<a href="${f.url}" target="_blank" style="color: var(--accent); margin-right: 1rem;">📎 ${f.name}</a>`).join('')}
        `;
    } else {
        document.getElementById('spectacleDetailFiles').innerHTML = '';
    }

    // Notes : accessibles via Accès rapides (page dédiée)

    // Initialiser les documents s'ils n'existent pas
    if (!window.currentSpectacleDetail.documents) {
        window.currentSpectacleDetail.documents = [];
    }

    // Liste d'accès rapides (remplace les 9 cartes)
    const quickAccessEl = document.getElementById('spectacleDetailQuickAccess');
    if (quickAccessEl) {
        const modeExpl = window.currentSpectacleDetail.modeExploitation || 'organise';
        const budgetReel = (window.hasPermission && window.hasPermission('budget') && window.currentSpectacleDetail.budget) ?
            window.currentSpectacleDetail.budget.reduce((sum, line) => {
                const montantHT = line.montantType === 'percent' ? 
                    (getTotalCA(window.currentSpectacleDetail) * ((line.percentBilletterie || 0) / 100)) : 
                    (parseFloat(line.montantFixe) || 0);
                const tvaRate = line.tvaRate || 0;
                const montantTTC = montantHT * (1 + tvaRate / 100);
                return sum + (line.isReel ? montantTTC : 0);
            }, 0) || 0 : 0;

        const members = window.currentSpectacleDetail.members || [];
        let membresCount = members.length;
        if (window.currentSpectacleDetail.parentId) {
            const tournee = projects.find(p => p.id === window.currentSpectacleDetail.parentId);
            if (tournee && tournee.members) {
                const inherited = tournee.members.filter(m => !members.includes(String(m)));
                membresCount += inherited.length;
            }
        }

        const visuelsCount = window.currentSpectacleDetail.visuels?.length || 0;
        const documentsCount = window.currentSpectacleDetail.documents?.length || 0;
        const contacts = gatherSpectacleContacts(window.currentSpectacleDetail);
        const tech = window.currentSpectacleDetail.tech || {};
        const techCount = (tech.prestataires?.length || 0) + (tech.voyages?.length || 0) + (tech.hebergements?.length || 0);
        const communicationsCount = window.currentSpectacleDetail.communications?.length || 0;
        const notesCountInitial = _projectNotesCountCache.get(id)?.count ?? 0;

        const items = [];

        // Équipe
        items.push(`<a class="quick-access-item" onclick="openMembresModal('${id}'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">👥 Équipe</span><span class="quick-access-item-count">${membresCount}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);

        // Vente / Coproduction (si mode vendu ou coproduction)
        if (modeExpl === 'vendu' || modeExpl === 'coproduction') {
            const vente = window.currentSpectacleDetail.vente || {};
            const prixVente = vente.prixVente ? (parseFloat(vente.prixVente).toFixed(2) + ' €') : '—';
            const cardTitle = modeExpl === 'vendu' ? '💼 Vente' : '🤝 Coproduction';
            items.push(`<a class="quick-access-item" onclick="openEditVenteModal('${id}'); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">${cardTitle}</span><span class="quick-access-item-count">${prixVente}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }

        // Coûts
        if (window.hasPermission && window.hasPermission('budget')) {
            items.push(`<a class="quick-access-item" onclick="openBudgetPage('${id}'); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">💰 Coûts</span><span class="quick-access-item-count">${budgetReel.toFixed(2)} €</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }

        // Visuels
        if (window.hasPermission && window.hasPermission('visuels')) {
            items.push(`<a class="quick-access-item" onclick="openVisuelsPage('${id}'); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">🖼️ Visuels</span><span class="quick-access-item-count">${visuelsCount}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }

        // Documents
        items.push(`<a class="quick-access-item" onclick="openDocumentsPage('${id}'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">📄 Documents</span><span class="quick-access-item-count">${documentsCount}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);

        // Notes
        items.push(`<a class="quick-access-item" onclick="openProjectNotesPage('spectacle'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">📝 Notes</span><span class="quick-access-item-count" id="qaSpectacleNotesCount">${notesCountInitial}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);

        // Billetterie
        if (window.hasPermission && window.hasPermission('billetterie') && modeExpl !== 'vendu') {
            const billetsText = getBilletsDisplayText(window.currentSpectacleDetail);
            items.push(`<a class="quick-access-item" onclick="openBilletteriePage('${id}'); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">🎟️ Billetterie</span><span class="quick-access-item-count">${billetsText}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }

        // Technique & Logistique
        if (window.hasPermission && window.hasPermission('technique')) {
            items.push(`<a class="quick-access-item" onclick="openTechPage('${id}'); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">⚙️ Technique & Logistique</span><span class="quick-access-item-count">${techCount}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }

        // Communication
        if (window.hasPermission && window.hasPermission('communication')) {
            items.push(`<a class="quick-access-item" onclick="openCommunicationPage('${id}'); return false;" href="#">
                <span class="quick-access-item-left"><span class="quick-access-item-label">📣 Communication</span><span class="quick-access-item-count">${communicationsCount}</span></span>
                <span class="quick-access-item-arrow">→</span>
            </a>`);
        }

        // Assistant IA
        items.push(`<a class="quick-access-item" onclick="openSpectacleAIPage('${id}'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">🤖 Assistant IA</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);

        // Invitations
        const invitationsCount = window.currentSpectacleDetail.invitations?.length || 0;
        items.push(`<a class="quick-access-item" onclick="openInvitationsPage('${id}'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">🎫 Invitations</span><span class="quick-access-item-count">${invitationsCount}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);

        // Contacts
        items.push(`<a class="quick-access-item" onclick="openSpectacleContactsPage('${id}'); return false;" href="#">
            <span class="quick-access-item-left"><span class="quick-access-item-label">📇 Contacts</span><span class="quick-access-item-count">${contacts.length}</span></span>
            <span class="quick-access-item-arrow">→</span>
        </a>`);

        quickAccessEl.innerHTML = items.join('');

        // Charger le compteur notes en arrière-plan
        loadProjectNotesCount(id)
            .then(count => updateQuickAccessNotesCount('spectacle', id, count))
            .catch(() => {});
    }

    // Bouton statut (Confirmé / En étude)
    const spectacleActionsDiv = document.querySelector('#spectaclePage .detail-header-actions');
    if (spectacleActionsDiv) {
        let archiveBtn = spectacleActionsDiv.querySelector('[data-archive-toggle]');
        if (!archiveBtn) {
            archiveBtn = document.createElement('button');
            archiveBtn.className = 'btn btn-secondary';
            archiveBtn.setAttribute('data-archive-toggle', '1');
            spectacleActionsDiv.insertBefore(archiveBtn, spectacleActionsDiv.firstChild);
        }
        archiveBtn.textContent = isArchived ? '↩️ Désarchiver' : '🗃️ Archiver';
        archiveBtn.onclick = function() {
            if (isArchived) unarchiveSpectacleFromDetail();
            else archiveSpectacleFromDetail();
        };

        const existingStatusBtn = spectacleActionsDiv.querySelector('[data-status-toggle]');
        if (isArchived) {
            if (existingStatusBtn) existingStatusBtn.remove();
        } else {
            if (existingStatusBtn) existingStatusBtn.remove();
            const statusBtn = document.createElement('button');
            statusBtn.setAttribute('data-status-toggle', '1');
            statusBtn.className = (window.currentSpectacleDetail.status || 'confirmed') === 'study' ? 'btn' : 'btn btn-secondary';
            if ((window.currentSpectacleDetail.status || 'confirmed') === 'study') statusBtn.style.background = 'var(--mn-green)';
            statusBtn.onclick = function() { toggleProjectStatus(window.currentSpectacleDetail.id); };
            statusBtn.textContent = (window.currentSpectacleDetail.status || 'confirmed') === 'study' ? '✅ Passer en Confirmé' : '📋 Passer en Étude';
            spectacleActionsDiv.insertBefore(statusBtn, spectacleActionsDiv.firstChild);
        }
    }

    // Afficher le bouton "Convertir en tournée" seulement pour les spectacles isolés
    const convertBtn = document.getElementById('convertToTourneeBtn');
    if (convertBtn) {
        convertBtn.style.display = (!isArchived && !window.currentSpectacleDetail.parentId) ? 'inline-block' : 'none';
    }
    const deleteBtn = document.querySelector('#spectacleDetailActions button[onclick="deleteSpectacleFromDetail()"]');
    if (deleteBtn) {
        deleteBtn.style.display = isArchived ? 'none' : 'inline-block';
    }
    const editBtn = document.querySelector('#spectacleDetailActions button[onclick="editSpectacleFromDetail()"]');
    if (editBtn) {
        editBtn.style.display = isArchived ? 'none' : 'inline-block';
    }

    document.getElementById('spectaclePage').classList.add('active');
    document.getElementById('spectaclePage').classList.add('page-enter');
    setTimeout(() => { const sp = document.getElementById('spectaclePage'); if (sp) sp.classList.remove('page-enter'); }, 700);
    updateFabAppearance();
    
    // Réappliquer les permissions après le rendu
    applyPermissions();
}

// ========== NOTES PUBLIQUES (SPECTACLE / TOURNÉE) ==========
let _currentNotesScope = null; // 'spectacle' | 'tournee'
const _projectNotesCountCache = new Map(); // projectId -> { count, ts }

function getCurrentNotesProjectId(scope) {
    if (scope === 'tournee') return currentTournee?.id || null;
    return window.currentSpectacleDetail?.id || null;
}

async function loadProjectNotes(projectId) {
    if (!projectId) return [];
    const res = await apiCall(`workspace.php?visibility=team&project_id=${encodeURIComponent(projectId)}&type=page`, 'GET');
    if (res?.success && Array.isArray(res.elements)) return res.elements;
    return [];
}

async function loadProjectNotesCount(projectId) {
    if (!projectId) return 0;
    const cached = _projectNotesCountCache.get(projectId);
    const now = Date.now();
    if (cached && (now - cached.ts) < 15000) return cached.count; // 15s cache
    const notes = await loadProjectNotes(projectId);
    const count = Array.isArray(notes) ? notes.length : 0;
    _projectNotesCountCache.set(projectId, { count, ts: now });
    return count;
}

// ========== PAGE NOTES (SPECTACLE / TOURNÉE) ==========
let currentProjectNotesScope = null; // 'spectacle' | 'tournee'
let currentProjectNotesProjectId = null;

// Compat legacy handler used by some cached quick-access markup versions.
function openProjectNotesFromQuickAccess(scope) {
    openProjectNotesPage(scope);
}

function openProjectNotesPage(scope) {
    const projectId = getCurrentNotesProjectId(scope);
    if (!projectId) return;
    currentProjectNotesScope = scope;
    currentProjectNotesProjectId = projectId;

    closeAllPages();
    const page = document.getElementById('projectNotesPage');
    if (page) page.classList.add('active');

    const titleEl = document.getElementById('projectNotesTitle');
    if (titleEl) {
        const name = scope === 'tournee' ? (currentTournee?.name || '') : (window.currentSpectacleDetail?.name || '');
        titleEl.textContent = name || '—';
    }

    renderProjectNotesPage();
    updateFabAppearance();
}

function closeProjectNotesPage() {
    const page = document.getElementById('projectNotesPage');
    if (page) page.classList.remove('active');
    const scope = currentProjectNotesScope;
    currentProjectNotesScope = null;
    currentProjectNotesProjectId = null;
    updateFabAppearance();
    if (scope === 'tournee' && currentTournee?.id) viewTournee(currentTournee.id);
    else if (scope === 'spectacle' && window.currentSpectacleDetail?.id) viewSpectacle(window.currentSpectacleDetail.id);
}

async function renderProjectNotesPage() {
    const projectId = currentProjectNotesProjectId;
    const listEl = document.getElementById('projectNotesList');
    const countEl = document.getElementById('projectNotesCount');
    if (!listEl || !projectId) return;

    listEl.innerHTML = `<div style="text-align:center; padding: 2.5rem; color:#64748b;">Chargement…</div>`;
    try {
        const notes = await loadProjectNotes(projectId);
        const count = notes.length || 0;
        if (countEl) countEl.textContent = String(count);
        _projectNotesCountCache.set(projectId, { count, ts: Date.now() });
        updateQuickAccessNotesCount(currentProjectNotesScope || 'spectacle', projectId, count);

        if (!notes.length) {
            listEl.innerHTML = `<div style="text-align:center; padding: 3rem; color: #636e72;">Aucune note. Cliquez sur “Nouvelle note” pour commencer.</div>`;
            return;
        }

        const esc = (s) => (s == null ? '' : String(s))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        listEl.innerHTML = notes.map(n => {
            const title = n.title || 'Sans titre';
            const when = n.updated_at || n.created_at || null;
            const dateStr = when ? new Date(when).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
            const author = n.created_by_name ? ` • ${n.created_by_name}` : '';
            return `
                <div onclick="openProjectNote('${currentProjectNotesScope}', '${String(n.id).replace(/'/g, "\\'")}')" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.85rem 0.9rem;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;margin-bottom:0.6rem;">
                    <div>
                        <div style="font-weight:700;color:#0f172a;">${esc(title)}</div>
                        <div style="font-size:0.85rem;color:#64748b;margin-top:0.2rem;">${dateStr}${esc(author)}</div>
                    </div>
                    <div style="color:#2563eb;font-weight:800;">→</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        listEl.innerHTML = `<div style="text-align:center; padding: 2.5rem; color:#b91c1c;">Erreur : ${String(e.message || e)}</div>`;
    }
}

function createProjectNoteFromNotesPage() {
    const scope = currentProjectNotesScope || 'spectacle';
    createProjectNote(scope);
}

function updateQuickAccessNotesCount(scope, projectId, count) {
    const elId = scope === 'tournee' ? 'qaTourneeNotesCount' : 'qaSpectacleNotesCount';
    const el = document.getElementById(elId);
    if (el) el.textContent = String(count ?? 0);
}

function renderProjectNotesList(scope, notes) {
    const listId = scope === 'tournee' ? 'tourneeNotesList' : 'spectacleNotesList';
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    if (!notes || notes.length === 0) {
        listEl.innerHTML = `<div class="project-notes-empty">Aucune note pour le moment.</div>`;
        return;
    }

    const esc = (s) => (s == null ? '' : String(s))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    listEl.innerHTML = notes.map(n => {
        const title = n.title || 'Sans titre';
        const when = n.updated_at || n.created_at || null;
        const dateStr = when ? new Date(when).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        const author = n.created_by_name ? ` • ${n.created_by_name}` : '';
        return `
            <div class="project-note-item" onclick="openProjectNote('${scope}', '${String(n.id).replace(/'/g, "\\'")}')">
                <div>
                    <div class="project-note-item-title">${esc(title)}</div>
                    <div class="project-note-item-meta">${dateStr}${esc(author)}</div>
                </div>
                <div style="color: rgba(255,255,255,0.9); font-weight: 700;">→</div>
            </div>
        `;
    }).join('');
}

// (Ancien rendu "inline" supprimé : les notes sont dans une page dédiée)

function createProjectNote(scope) {
    const projectId = getCurrentNotesProjectId(scope);
    if (!projectId) return;
    _currentNotesScope = scope;

    // Ouvrir l'éditeur Workspace en mode "public" (équipe) et lié au projet
    currentWorkspaceVisibility = 'team';
    currentWsFolderId = null;
    currentWsElementId = null;
    currentWsElementType = 'page';
    currentWsProjectId = projectId;

    const typeLabels = { page: '📝 Note', idea: '💡 Idée', quicknote: '📋 Note rapide' };
    document.getElementById('wsEditorTypeBadge').textContent = typeLabels['page'] || 'page';
    const visBadge = document.getElementById('wsEditorVisibilityBadge');
    if (visBadge) visBadge.textContent = '👥 Public';
    document.getElementById('wsEditorTitle').value = '';
    document.getElementById('wsEditorContent').innerHTML = '';
    document.getElementById('wsQuicknoteText').value = '';
    document.getElementById('wsEditorTags').innerHTML = '';
    document.getElementById('wsEditorTagInput').value = '';
    document.getElementById('wsEditorAttachments').innerHTML = '<span class="empty-msg">Aucun fichier attaché</span>';
    document.getElementById('wsEditorStatusRow').style.display = 'none';
    document.getElementById('wsEditorRichContent').style.display = '';
    document.getElementById('wsEditorQuicknoteContent').style.display = 'none';
    const accessSection = document.getElementById('wsEditorAccessSection');
    if (accessSection) accessSection.style.display = 'none';

    document.getElementById('workspaceEditorPage').classList.add('active');
}

function openProjectNote(scope, noteId) {
    const projectId = getCurrentNotesProjectId(scope);
    if (!projectId) return;
    _currentNotesScope = scope;
    currentWorkspaceVisibility = 'team';
    currentWsProjectId = projectId;
    openWorkspaceElement(noteId);
}

// Appelé depuis l'éditeur Workspace après sauvegarde
window.refreshProjectNotesUI = async function(projectId) {
    if (document.getElementById('projectNotesPage')?.classList.contains('active') && currentProjectNotesProjectId === projectId) {
        await renderProjectNotesPage();
        return;
    }
    try {
        const count = await loadProjectNotesCount(projectId);
        const scope = (currentTournee && currentTournee.id === projectId) ? 'tournee' : 'spectacle';
        updateQuickAccessNotesCount(scope, projectId, count);
    } catch (e) {}
};

// ========== AJOUT "NOTES" DANS ACCÈS RAPIDES ==========
// Spectacle: injecte un item Notes après Documents
// Tournée: injecte un item Notes après Documents

function closeSpectaclePage() {
    document.getElementById('spectaclePage').classList.remove('active');
    const wasInTournee = window.currentSpectacleDetail && window.currentSpectacleDetail.parentId && currentTournee;
    window.currentSpectacleDetail = null;
    
    // Si on vient d'une tournée, on reste sur la page tournée
    // Sinon on revient à la liste des projets
    if (!wasInTournee) {
        renderProjectsListPage();
        document.getElementById('projectsListPage').classList.add('active');
        document.getElementById('projectsListPage').classList.add('page-enter');
        setTimeout(() => { const pl = document.getElementById('projectsListPage'); if (pl) pl.classList.remove('page-enter'); }, 700);
    }
    updateFabAppearance();
}

function editSpectacleFromDetail() {
    if (!window.currentSpectacleDetail) return;
    closeSpectaclePage();
    editProject(window.currentSpectacleDetail.id);
}

function deleteSpectacleFromDetail() {
    if (!window.currentSpectacleDetail) return;
    
    if (confirm('Supprimer ce spectacle ?')) {
        const parentId = window.currentSpectacleDetail.parentId;
        const tourneeToUpdate = currentTournee;
        
        console.log('deleteSpectacleFromDetail: Suppression du spectacle', window.currentSpectacleDetail.name, 'id:', window.currentSpectacleDetail.id);
        console.log('deleteSpectacleFromDetail: Nombre de projets AVANT:', projects.length);
        
        projects = projects.filter(p => p.id !== window.currentSpectacleDetail.id);
        
        console.log('deleteSpectacleFromDetail: Nombre de projets APRÈS:', projects.length);
        console.log('deleteSpectacleFromDetail: Appel saveProjectsAsync...');
        
    saveProjectsAsync();
    
    document.getElementById('spectaclePage').classList.remove('active');
    window.currentSpectacleDetail = null;
    
    if (parentId && tourneeToUpdate) {
        viewTournee(parentId);
    } else {
        refreshCurrentView();
    }
    }
}

function archiveSpectacleFromDetail() {
    if (!window.currentSpectacleDetail) return;
    if (!confirm('Archiver ce spectacle ? Il restera consultable dans la section Archives.')) return;
    window.currentSpectacleDetail.lifecycle = 'archived';
    window.currentSpectacleDetail.archivedAt = new Date().toISOString();
    window.currentSpectacleDetail.updatedAt = new Date().toISOString();
    saveProjectsAsync();
    showToast('🗃️ Spectacle archivé', 'success');
    viewSpectacle(window.currentSpectacleDetail.id);
}

function unarchiveSpectacleFromDetail() {
    if (!window.currentSpectacleDetail) return;
    if (!confirm('Désarchiver ce spectacle ?')) return;
    window.currentSpectacleDetail.lifecycle = 'active';
    delete window.currentSpectacleDetail.archivedAt;
    window.currentSpectacleDetail.updatedAt = new Date().toISOString();
    saveProjectsAsync();
    showToast('✅ Spectacle désarchivé', 'success');
    viewSpectacle(window.currentSpectacleDetail.id);
}

let _changeSpectacleCatalogueSpectacleId = null;

async function openChangeSpectacleCatalogueModal(spectacleId) {
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle) return;
    _changeSpectacleCatalogueSpectacleId = spectacleId;
    const modal = document.getElementById('changeSpectacleCatalogueModal');
    const select = document.getElementById('changeSpectacleCatalogueSelect');
    const warningEl = document.getElementById('changeSpectacleCatalogueWarning');
    if (!modal || !select) return;
    if (typeof loadCatalogueData === 'function') await loadCatalogueData();
    const options = (typeof catalogueData !== 'undefined' && Array.isArray(catalogueData)) ? catalogueData : [];
    select.innerHTML = '<option value="">-- Sélectionner --</option>';
    options.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = (f.name || '') + (f.genre ? ' (' + f.genre + ')' : '');
        select.appendChild(opt);
    });
    select.value = spectacle.catalogueId || '';
    const inTournee = !!spectacle.parentId;
    const tournee = inTournee ? projects.find(p => p.id === spectacle.parentId) : null;
    warningEl.textContent = inTournee && tournee ? 
        'Si vous choisissez un spectacle différent de celui de la tournée, cette date sera retirée de la tournée et deviendra un spectacle isolé.' : 
        'Sélectionnez le nouveau spectacle du catalogue. Les visuels et documents seront mis à jour.';
    modal.classList.add('active');
}

function closeChangeSpectacleCatalogueModal() {
    _changeSpectacleCatalogueSpectacleId = null;
    document.getElementById('changeSpectacleCatalogueModal')?.classList.remove('active');
}

function confirmChangeSpectacleCatalogue() {
    const spectacleId = _changeSpectacleCatalogueSpectacleId;
    if (!spectacleId) return;
    const select = document.getElementById('changeSpectacleCatalogueSelect');
    const newCatalogueId = select?.value?.trim();
    if (!newCatalogueId) {
        alert('Veuillez sélectionner un spectacle du catalogue.');
        return;
    }
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle) return;
    const oldCatalogueId = spectacle.catalogueId || '';
    if (newCatalogueId === oldCatalogueId) {
        closeChangeSpectacleCatalogueModal();
        return;
    }
    const fiche = typeof catalogueData !== 'undefined' && catalogueData?.find(f => f.id === newCatalogueId);
    if (!fiche) return;
    const inTournee = !!spectacle.parentId;
    const tournee = inTournee ? projects.find(p => p.id === spectacle.parentId) : null;
    const willLeaveTournee = inTournee && tournee && newCatalogueId !== tournee.catalogueId;
    if (!confirm('Voulez-vous vraiment changer le spectacle lié au catalogue ?')) return;
    if (willLeaveTournee && !confirm('Ce spectacle sera retiré de la tournée et deviendra un spectacle isolé. Confirmer le changement ?')) return;
    closeChangeSpectacleCatalogueModal();
    changeSpectacleCatalogue(spectacleId, newCatalogueId);
}

// Changer le spectacle (catalogue) lié
function changeSpectacleCatalogue(spectacleId, newCatalogueId) {
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle || !newCatalogueId) return;
    const oldCatalogueId = spectacle.catalogueId;
    if (oldCatalogueId === newCatalogueId) return;
    const fiche = typeof catalogueData !== 'undefined' && catalogueData.find(f => f.id === newCatalogueId);
    if (!fiche) return;
    const wasInTournee = !!spectacle.parentId;
    const tournee = wasInTournee ? projects.find(p => p.id === spectacle.parentId) : null;
    const tourneeCatId = tournee ? tournee.catalogueId : null;
    spectacle.catalogueId = newCatalogueId;
    if (typeof applyCatalogueToNewProject === 'function') {
        applyCatalogueToNewProject(spectacle, newCatalogueId);
    }
    if (wasInTournee && newCatalogueId !== tourneeCatId) {
        spectacle.parentId = null;
        const ville = spectacle.city || spectacle.location || '';
        spectacle.name = fiche.name + (ville ? ` - ${ville}` : '');
    }
    spectacle.updatedAt = new Date().toISOString();
    saveProjectsAsync();
    if (window.currentSpectacleDetail?.id === spectacleId) {
        window.currentSpectacleDetail = spectacle;
        viewSpectacle(spectacleId);
    } else if (currentTournee) {
        viewTournee(currentTournee.id);
    } else {
        refreshCurrentView();
    }
    if (wasInTournee && newCatalogueId !== tourneeCatId) {
        showToast('Spectacle retiré de la tournée et devenu spectacle isolé', 'info');
    }
}

// Convertir un spectacle isolé en tournée
function convertSpectacleToTournee() {
    if (!window.currentSpectacleDetail) return;
    if (window.currentSpectacleDetail.parentId) {
        alert('Ce spectacle fait déjà partie d\'une tournée.');
        return;
    }
    
    const spectacleName = window.currentSpectacleDetail.name || 'Sans nom';
    const newTourneeName = prompt('Nom de la nouvelle tournée :', `Tournée ${spectacleName}`);
    
    if (!newTourneeName || !newTourneeName.trim()) return;
    
    // Créer la nouvelle tournée
    const tourneeId = 'tournee_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const newTournee = {
        id: tourneeId,
        name: newTourneeName.trim(),
        type: 'tournee',
        // Copier les visuels et documents de la tournée (optionnel)
        visuels: [],
        documents: [],
        communications: [],
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // Ajouter la tournée à la liste des projets
    projects.push(newTournee);
    
    // Modifier le spectacle pour qu'il devienne une date de cette tournée
    window.currentSpectacleDetail.parentId = tourneeId;
    window.currentSpectacleDetail.type = 'spectacle';
    window.currentSpectacleDetail.updatedAt = new Date().toISOString();
    
    // Sauvegarder
    saveProjectsAsync();
    
    // Fermer la page spectacle et ouvrir la tournée
    document.getElementById('spectaclePage').classList.remove('active');
    window.currentSpectacleDetail = null;
    
    // Ouvrir la nouvelle tournée
    viewTournee(tourneeId);
    
    showToast(`Spectacle converti en tournée "${newTourneeName.trim()}"`, 'success');
}

// ÉDITION INLINE
function editInline(element, projectId, field, inputType) {
    const currentValue = element.textContent;
    
    // Créer l'input approprié
    let input;
    if (inputType === 'date') {
        input = document.createElement('input');
        input.type = 'date';
        input.value = currentValue !== 'Non défini' ? currentValue : '';
    } else if (inputType === 'time') {
        input = document.createElement('input');
        input.type = 'time';
        input.value = currentValue !== 'Non défini' ? currentValue : '';
    } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
    }
    
    input.className = 'editable-input';
    
    // Remplacer le span par l'input
    element.replaceWith(input);
    input.focus();
    
    // Fonction de sauvegarde
    const save = () => {
        const newValue = input.value.trim();
        
        // Trouver et mettre à jour le projet
        const project = projects.find(p => p.id === projectId);
        if (project) {
            project[field] = newValue;
            
            // Si on modifie la location d'un spectacle de tournée, mettre à jour le nom
            if (field === 'location' && project.parentId) {
                const tournee = projects.find(p => p.id === project.parentId);
                project.name = tournee ? `${tournee.name} - ${newValue}` : newValue;
            }
            
            saveProjectsAsync();
        }
        
        // Rafraîchir l'affichage
        viewSpectacle(projectId);
    };
    
    // Sauvegarder sur blur ou Entrée
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            save();
        } else if (e.key === 'Escape') {
            viewSpectacle(projectId); // Annuler
        }
    });
}

// PAGE BUDGET
let currentBudgetSpectacle = null;

function openBudgetPage(spectacleId) {
    // Vérifier la permission avant d'ouvrir
    if (window.hasPermission && !window.hasPermission('budget')) {
        alert('Vous n\'avez pas la permission d\'accéder à cette section.');
        return;
    }
    
    currentBudgetSpectacle = projects.find(p => p.id === spectacleId);
    if (!currentBudgetSpectacle) return;

    // Initialiser le budget s'il n'existe pas
    if (!currentBudgetSpectacle.budget) {
        currentBudgetSpectacle.budget = [];
    }
    
    // Initialiser les apports financiers s'ils n'existent pas
    if (!currentBudgetSpectacle.apportsFinanciers) {
        currentBudgetSpectacle.apportsFinanciers = [];
    }

    document.getElementById('budgetSpectacleName').textContent = currentBudgetSpectacle.name;

    var locEl = document.getElementById('budgetSpectacleLocation');
    if (locEl) {
        var lid = currentBudgetSpectacle.lieuId || (currentBudgetSpectacle.tech && currentBudgetSpectacle.tech.lieuId);
        var lieu = (typeof getLieuById === 'function' && lid) ? getLieuById(lid) : null;
        if (lieu && (lieu.nom || lieu.ville)) {
            var locParts = [];
            if (lieu.nom) locParts.push(lieu.nom);
            if (lieu.ville) locParts.push(lieu.ville);
            locEl.textContent = '📍 ' + locParts.join(' · ');
            locEl.hidden = false;
        } else {
            locEl.textContent = '';
            locEl.hidden = true;
        }
    }

    var recapPdfBtn = document.getElementById('budgetRecapPdfBtn');
    if (recapPdfBtn) {
        recapPdfBtn.onclick = function (ev) {
            if (ev) ev.preventDefault();
            if (typeof window.openBudgetPdfChoiceModal === 'function') {
                window.openBudgetPdfChoiceModal();
            }
        };
    }
    
    renderBudgetSections();
    renderApportsSection();
    updateBudgetTotals();
    renderCategoryTasks(spectacleId, 'Budget', 'budgetTasksList');
    
    document.getElementById('budgetPage').classList.add('active');
    document.getElementById('budgetPage').classList.add('page-enter');
    setTimeout(() => { const bp = document.getElementById('budgetPage'); if (bp) bp.classList.remove('page-enter'); }, 700);
    updateFabAppearance();
}

function closeBudgetPage() {
    document.getElementById('budgetPage').classList.remove('active');
    if (currentBudgetSpectacle) {
        viewSpectacle(currentBudgetSpectacle.id);
    }
    currentBudgetSpectacle = null;
    updateFabAppearance();
}

// ========== DOSSIERS (visuels & documents - indépendants) ==========
/** id → nom depuis la fiche catalogue liée (si présente dans appSettings.catalogue). */
function _catalogueFolderNameMapForProject(catalogueId, itemType) {
    if (!catalogueId || !window.appSettings || !Array.isArray(window.appSettings.catalogue)) return null;
    const fiche = window.appSettings.catalogue.find(f => f.id === catalogueId);
    if (!fiche) return null;
    const key = itemType === 'visuel' ? 'visuelsFolders' : 'documentsFolders';
    const folders = fiche[key];
    if (!Array.isArray(folders) || folders.length === 0) return null;
    const map = {};
    folders.forEach(fo => {
        if (fo && fo.id) {
            map[fo.id] = (fo.name && String(fo.name).trim()) ? fo.name : 'Dossier sans titre';
        }
    });
    return map;
}

/**
 * Recrée les entrées manquantes dans visuelsFolders / documentsFolders pour chaque folderId
 * encore référencé. Utilise le nom depuis la fiche catalogue (catalogueId) si disponible.
 * @returns {boolean} true si au moins une entrée a été ajoutée
 */
function _repairMissingFolderRefs(data, itemType) {
    const items = itemType === 'visuel' ? (data.visuels || []) : (data.documents || []);
    const foldersArr = itemType === 'visuel' ? data.visuelsFolders : data.documentsFolders;
    if (!Array.isArray(foldersArr)) return false;
    const nameMap = _catalogueFolderNameMapForProject(data.catalogueId, itemType);
    const existingIds = new Set(foldersArr.map(f => f && f.id).filter(Boolean));
    let added = 0;
    items.forEach(item => {
        const fid = item && item.folderId;
        if (fid == null || fid === '') return;
        if (existingIds.has(fid)) return;
        const label = (nameMap && nameMap[fid]) ? nameMap[fid] : 'Dossier sans titre';
        foldersArr.push({ id: fid, name: label });
        existingIds.add(fid);
        added++;
    });
    if (added > 0) {
        console.warn('[Dossiers] ' + added + ' entrée(s) restaurée(s) pour les ' + itemType + 's (folderId orphelin).');
    }
    return added > 0;
}

function ensureFoldersAndFolderIds(data) {
    if (!data) return false;
    if (!data.visuelsFolders) data.visuelsFolders = [];
    if (!data.documentsFolders) data.documentsFolders = [];
    if (data.folders && !data.visuelsFolders.length && !data.documentsFolders.length) {
        const visuelIds = new Set((data.visuels || []).map(v => v.folderId).filter(Boolean));
        const docIds = new Set((data.documents || []).map(d => d.folderId).filter(Boolean));
        data.folders.forEach(f => {
            if (visuelIds.has(f.id)) data.visuelsFolders.push({ ...f });
            if (docIds.has(f.id)) data.documentsFolders.push({ ...f });
        });
        delete data.folders;
    }
    if (data.documents) {
        data.documents.forEach(d => { if (d.folderId === undefined) d.folderId = null; });
    }
    if (data.visuels) {
        data.visuels.forEach(v => { if (v.folderId === undefined) v.folderId = null; });
    }
    return _repairMissingFolderRefs(data, 'visuel') || _repairMissingFolderRefs(data, 'document');
}

function createFolder(data, name, itemType) {
    if (!data) return;
    ensureFoldersAndFolderIds(data);
    const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const arr = itemType === 'visuel' ? data.visuelsFolders : data.documentsFolders;
    arr.push({ id, name: name || 'Nouveau dossier' });
    return id;
}

function deleteFolder(data, folderId, itemType) {
    if (!data || !folderId) return;
    const items = itemType === 'visuel' ? (data.visuels || []) : (data.documents || []);
    items.forEach(item => { if (item.folderId === folderId) item.folderId = null; });
    const arr = itemType === 'visuel' ? data.visuelsFolders : data.documentsFolders;
    const idx = (arr || []).findIndex(f => f.id === folderId);
    if (idx !== -1) arr.splice(idx, 1);
}

function renameFolder(data, folderId, newName, itemType) {
    const arr = itemType === 'visuel' ? (data.visuelsFolders || []) : (data.documentsFolders || []);
    const f = arr.find(x => x.id === folderId);
    if (f) f.name = newName || f.name;
}

function getFoldersForType(data, itemType) {
    return itemType === 'visuel' ? (data.visuelsFolders || []) : (data.documentsFolders || []);
}

function isFolderExpanded(folderId, context, itemType) {
    const key = `${context}_${itemType}_${folderId}`;
    return window._expandedFolderIds && window._expandedFolderIds.has(key);
}

function toggleFolderExpanded(folderId, context, itemType) {
    if (!window._expandedFolderIds) window._expandedFolderIds = new Set();
    const key = `${context}_${itemType}_${folderId}`;
    if (window._expandedFolderIds.has(key)) {
        window._expandedFolderIds.delete(key);
    } else {
        window._expandedFolderIds.add(key);
    }
    if (context === 'spectacle') {
        if (itemType === 'visuel') renderVisuelsGallery();
        else renderDocuments();
    } else if (context === 'tournee') {
        if (itemType === 'visuel') renderTourneeVisuelsGallery();
        else renderTourneeDocuments();
    } else if (context === 'catalogue') {
        if (itemType === 'visuel') renderCatalogueVisuels();
        else renderCatalogueDocuments();
    }
}

// Drag & drop pour déplacer fichiers dans dossiers
let _folderDragContext = null; // { source: 'spectacle'|'tournee', type: 'document'|'visuel' }

function handleFileDragStart(e, itemId, type, source) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ itemId, type, source }));
    e.currentTarget.classList.add('file-dragging');
    _folderDragContext = { source, type };
}

function handleFileDragEnd(e) {
    e.currentTarget.classList.remove('file-dragging');
    document.querySelectorAll('.folder-drop-zone, .root-drop-zone').forEach(z => z.classList.remove('drag-over'));
    _folderDragContext = null;
}

function handleFolderDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleFolderDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

/** Traite les fichiers déposés depuis le PC (Explorateur Windows) dans une zone de drop. */
async function processDroppedFilesFromPC(files, targetFolderId, source, itemType) {
    if (!files || files.length === 0) return;
    const DANGEROUS_EXT = /\.(exe|bat|cmd|com|msi|scr|vbs|js|jar|ps1|sh|bash)$/i;
    const filtered = itemType === 'visuel'
        ? Array.from(files).filter(f => f.type && f.type.startsWith('image/'))
        : Array.from(files).filter(f => !DANGEROUS_EXT.test(f.name || ''));
    if (filtered.length === 0) return;
    let dataSource = null;
    if (source === 'spectacle') {
        dataSource = itemType === 'document' ? currentDocumentsSpectacle : currentVisuelsSpectacle;
    } else if (source === 'tournee') {
        dataSource = currentTournee;
    }
    if (!dataSource) return;
    const items = itemType === 'document' ? (dataSource.documents || (dataSource.documents = [])) : (dataSource.visuels || (dataSource.visuels = []));
    for (const file of filtered) {
        try {
            const uploadedFile = await uploadFile(file, itemType === 'document' ? 'documents' : 'visuels');
            if (itemType === 'document') {
                const doc = {
                    id: uploadedFile.stored_externally ? uploadedFile.file_id : 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    name: uploadedFile.name,
                    titre: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                    type: uploadedFile.fileType,
                    fileName: uploadedFile.fileName,
                    fileSize: uploadedFile.fileSize,
                    stored_externally: uploadedFile.stored_externally || false,
                    folderId: targetFolderId,
                    file_id: uploadedFile.file_id,
                    url: uploadedFile.url,
                    downloadUrl: uploadedFile.downloadUrl
                };
                items.push(doc);
            } else {
                const vis = {
                    id: uploadedFile.stored_externally ? uploadedFile.file_id : 'visuel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    titre: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                    fileName: uploadedFile.fileName,
                    fileType: uploadedFile.fileType,
                    fileSize: uploadedFile.fileSize,
                    stored_externally: uploadedFile.stored_externally || false,
                    folderId: targetFolderId,
                    file_id: uploadedFile.file_id,
                    url: uploadedFile.url,
                    downloadUrl: uploadedFile.downloadUrl
                };
                items.push(vis);
            }
        } catch (err) {
            console.error('processDroppedFilesFromPC:', err);
            if (typeof showErrorModal === 'function') showErrorModal('Erreur upload', `Impossible d'uploader "${file.name}".`);
        }
    }
    const projectIndex = projects.findIndex(p => p.id === dataSource.id);
    if (projectIndex !== -1) projects[projectIndex] = dataSource;
    saveProjectsAsync();
    if (itemType === 'document') {
        if (source === 'tournee') renderTourneeDocuments(); else renderDocuments();
        if (source === 'spectacle') updateDocumentsCount();
    } else {
        if (source === 'tournee') renderTourneeVisuelsGallery(); else renderVisuelsGallery();
        if (source === 'spectacle') updateVisuelsCount(); else if (source === 'tournee') updateTourneeVisuelsCount();
    }
    if (dataSource.catalogueId && typeof syncProjectToCatalogue === 'function') syncProjectToCatalogue(dataSource);
}

function handleFolderDrop(e, targetFolderId, source, itemType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    try {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processDroppedFilesFromPC(e.dataTransfer.files, targetFolderId, source, itemType);
            return;
        }
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw || raw.trim() === '') return;
        const data = JSON.parse(raw);
        const { itemId, type } = data;
        if (type !== itemType) return;
        let dataSource = null;
        if (source === 'spectacle') {
            dataSource = type === 'document' ? currentDocumentsSpectacle : currentVisuelsSpectacle;
        } else if (source === 'tournee') {
            dataSource = currentTournee;
        }
        if (!dataSource) return;
        const items = type === 'document' ? dataSource.documents : dataSource.visuels;
        const item = items.find(x => (x.id || '') === String(itemId));
        if (item) {
            item.folderId = targetFolderId;
            if (type === 'document') {
                const projectIndex = projects.findIndex(p => p.id === dataSource.id);
                if (projectIndex !== -1) projects[projectIndex] = dataSource;
                saveProjectsAsync();
                renderDocuments();
            } else {
                const projectIndex = projects.findIndex(p => p.id === dataSource.id);
                if (projectIndex !== -1) projects[projectIndex] = dataSource;
                saveProjectsAsync();
                renderVisuelsGallery();
            }
        }
    } catch (err) { console.error('handleFolderDrop:', err); }
}

function handleTourneeFolderDrop(e, targetFolderId, itemType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    try {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processDroppedFilesFromPC(e.dataTransfer.files, targetFolderId, 'tournee', itemType);
            return;
        }
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw || raw.trim() === '') return;
        const data = JSON.parse(raw);
        const { itemId, type, source } = data;
        if (source !== 'tournee' || type !== itemType) return;
        if (!currentTournee) return;
        const items = type === 'document' ? currentTournee.documents : currentTournee.visuels;
        const item = items.find(x => (x.id || '') === String(itemId));
        if (item) {
            item.folderId = targetFolderId;
            const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
            if (projectIndex !== -1) projects[projectIndex] = currentTournee;
            saveProjectsAsync();
            if (type === 'document') renderTourneeDocuments(); else renderTourneeVisuelsGallery();
        }
    } catch (err) { console.error('handleTourneeFolderDrop:', err); }
}

// PAGE VISUELS
let currentVisuelsSpectacle = null;

function openVisuelsPage(spectacleId) {
    // Vérifier la permission avant d'ouvrir
    if (window.hasPermission && !window.hasPermission('visuels')) {
        alert('Vous n\'avez pas la permission d\'accéder à cette section.');
        return;
    }
    currentVisuelsSpectacle = projects.find(p => p.id === spectacleId);
    if (!currentVisuelsSpectacle) return;
    ensureFoldersAndFolderIds(currentVisuelsSpectacle);

    document.getElementById('visuelsSpectacleName').textContent = currentVisuelsSpectacle.name;
    
    // Attacher l'événement onchange à l'input file
    const visuelInput = document.getElementById('visuelInput');
    if (visuelInput) {
        // Retirer les anciens listeners pour éviter les doublons
        visuelInput.removeEventListener('change', uploadVisuels);
        // Ajouter le nouveau listener
        visuelInput.addEventListener('change', uploadVisuels);
        console.log('openVisuelsPage: Événement change attaché à visuelInput');
    }
    
    renderVisuelsGallery();
    updateVisuelsCount();
    renderCategoryTasks(spectacleId, 'Visuels', 'visuelsTasksList');
    
    document.getElementById('visuelsPage').classList.add('active');
}

function closeVisuelsPage() {
    document.getElementById('visuelsPage').classList.remove('active');
    if (currentVisuelsSpectacle) {
        viewSpectacle(currentVisuelsSpectacle.id);
    }
    currentVisuelsSpectacle = null;
}

// PAGE DOCUMENTS SPECTACLE
let currentDocumentsSpectacle = null;
let currentCommunicationSpectacle = null;
let currentEditingCommunicationAction = null;

function openDocumentsPage(spectacleId) {
    currentDocumentsSpectacle = projects.find(p => p.id === spectacleId);
    if (!currentDocumentsSpectacle) return;

    // Initialiser les documents s'ils n'existent pas
    if (!currentDocumentsSpectacle.documents) {
        currentDocumentsSpectacle.documents = [];
    }
    ensureFoldersAndFolderIds(currentDocumentsSpectacle);

    document.getElementById('documentsSpectacleName').textContent = currentDocumentsSpectacle.name;
    
    // Attacher l'événement onchange à l'input file (important pour que l'upload fonctionne)
    const documentInput = document.getElementById('documentInput');
    if (documentInput) {
        // Retirer les anciens listeners pour éviter les doublons
        documentInput.removeEventListener('change', uploadDocuments);
        // Ajouter le nouveau listener
        documentInput.addEventListener('change', uploadDocuments);
        console.log('openDocumentsPage: Événement change attaché à documentInput');
    } else {
        console.error('openDocumentsPage: documentInput introuvable');
    }
    
    renderDocuments();
    updateDocumentsCount();
    document.getElementById('documentsPage').classList.add('active');
    updateFabAppearance();
}

function closeDocumentsPage() {
    document.getElementById('documentsPage').classList.remove('active');
    if (currentDocumentsSpectacle) {
        viewSpectacle(currentDocumentsSpectacle.id);
    }
    currentDocumentsSpectacle = null;
    updateFabAppearance();
}

// Fonction pour visualiser un document (gère base64 et fichiers externes)
function viewDocument(doc, index) {
    console.log('viewDocument appelée:', { doc, index });
    
    try {
        // Utiliser getFileDisplayUrl() pour obtenir l'URL (gère base64 et fichiers externes)
        let documentUrl = getFileDisplayUrl(doc);
        
        if (!documentUrl) {
            console.error('viewDocument: Pas d\'URL disponible');
            showErrorModal('Erreur', 'Impossible de visualiser ce document : données manquantes.');
            return;
        }
        
        console.log('viewDocument: URL obtenue:', documentUrl.substring(0, 50) + '...');
        
        // Si c'est un fichier externe, ouvrir directement
        if (doc.stored_externally || doc.file_id) {
            window.open(documentUrl, '_blank');
            return;
        }
        
        // Sinon, c'est du base64, utiliser la modale
        // Si ce n'est pas un data URL complet, le convertir
        if (!documentUrl.startsWith('data:')) {
            const mimeType = doc.type || doc.fileType || 'application/pdf';
            documentUrl = `data:${mimeType};base64,${documentUrl}`;
        }

        console.log('viewDocument: URL créée, type:', documentUrl.substring(0, 30));

        // Créer une modale pour afficher le document
        const modal = document.createElement('div');
        modal.id = 'documentViewerModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 2rem;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
            z-index: 10001;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
        closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        
        const iframe = document.createElement('iframe');
        iframe.src = documentUrl;
        iframe.style.cssText = `
            width: 95%;
            height: 95%;
            border: none;
            border-radius: 10px;
            background: white;
        `;
        
        const title = document.createElement('div');
        title.textContent = doc.titre || doc.name || 'Document';
        title.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            color: white;
            font-size: 1.2rem;
            font-weight: 600;
            z-index: 10001;
        `;
        
        const closeModal = () => {
            document.body.removeChild(modal);
        };
        
        closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        
        // Fermer avec Échap
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        
        modal.appendChild(title);
        modal.appendChild(closeBtn);
        modal.appendChild(iframe);
        document.body.appendChild(modal);
        
        console.log('viewDocument: Modale créée et affichée');
    } catch (error) {
        console.error('Erreur lors de la visualisation:', error);
        showErrorModal('Erreur', `Impossible de visualiser le document: ${error.message}`, error.stack);
    }
}


function docExplorerRowHtml(doc, index, safeId) {
    const fileName = doc.fileName || doc.name || '';
    const ext = fileName.split('.').pop().toLowerCase();
    const icon = ['pdf'].includes(ext) ? '📄' : ['doc','docx'].includes(ext) ? '📝' : ['xls','xlsx'].includes(ext) ? '📊' : '📎';
    const displayTitle = (doc.titre || doc.name || 'Document sans titre').replace(/</g,'&lt;');
    return `<div class="explorer-row file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'document', 'spectacle')" ondragend="handleFileDragEnd(event)">
        <span class="file-icon">${icon}</span>
        <span class="item-name" onclick="viewDocument(currentDocumentsSpectacle.documents[${index}], ${index})" title="${displayTitle}">${displayTitle}</span>
        <span class="item-actions" onclick="event.stopPropagation();">
            <button class="btn btn-secondary btn-sm" onclick="renameDocument(${index})" title="Renommer">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="viewDocument(currentDocumentsSpectacle.documents[${index}], ${index})" title="Voir">👁️</button>
            <button class="btn btn-secondary btn-sm" onclick="downloadFile(currentDocumentsSpectacle.documents[${index}], ${index})" title="Télécharger">⬇️</button>
            <button class="btn btn-sm" onclick="deleteDocument(${index})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
        </span>
    </div>`;
}

function renderDocuments() {
    const container = document.getElementById('documentsList');
    const data = currentDocumentsSpectacle;
    if (!data) return;
    const docs = data.documents || [];
    const folders = getFoldersForType(data, 'document');
    const rootDocs = docs.filter(d => !d.folderId);
    const hasContent = docs.length > 0 || folders.length > 0;

    if (!hasContent) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #636e72;">
                Aucun document. Cliquez sur "Ajouter des documents" pour commencer.
            </div>
        `;
        return;
    }

    let html = '<div class="file-explorer">';
    folders.forEach(f => {
        const inFolder = docs.filter(d => d.folderId === f.id);
        const expanded = isFolderExpanded(f.id, 'spectacle', 'document');
        const toggleIcon = expanded ? '▼' : '▶';
        html += `<div class="folder-card folder-drop-zone" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleFolderDrop(event, '${f.id}', 'spectacle', 'document')" data-folder-id="${f.id}">
            <div class="explorer-row folder-row" onclick="toggleFolderExpanded('${f.id}', 'spectacle', 'document')">
                <span class="expand-icon">${toggleIcon}</span>
                <span class="file-icon">📁</span>
                <span class="item-name">${(f.name || '').replace(/</g,'&lt;')}</span>
                <span style="color:#999;font-size:0.85rem;">(${inFolder.length})</span>
                <span class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary btn-sm" onclick="renameSpectacleDocumentsFolder('${f.id}')" title="Renommer">✏️</button>
                    <button class="btn btn-sm" onclick="deleteSpectacleDocumentsFolder('${f.id}')" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                </span>
            </div>
            <div class="explorer-folder-content folder-content" style="display:${expanded ? 'block' : 'none'};">`;
        inFolder.forEach(doc => {
            const idx = docs.findIndex(d => d.id === doc.id);
            const safeId = (doc.id || '').replace(/'/g, "\\'");
            html += docExplorerRowHtml(doc, idx, safeId);
        });
        html += '</div></div>';
    });
    rootDocs.forEach(doc => {
        const idx = docs.findIndex(d => d.id === doc.id);
        const safeId = (doc.id || '').replace(/'/g, "\\'");
        html += docExplorerRowHtml(doc, idx, safeId);
    });
    html += '</div>';
    html += '<div class="root-drop-zone explorer-drop" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleFolderDrop(event, null, \'spectacle\', \'document\')">Glissez les documents ici (racine)</div>';
    container.innerHTML = html;
}

function renameDocument(index) {
    if (!currentDocumentsSpectacle || !currentDocumentsSpectacle.documents[index]) return;
    
    const doc = currentDocumentsSpectacle.documents[index];
    const currentTitle = doc.titre || doc.name || 'Document sans titre';
    const newTitle = prompt('Renommer le document :', currentTitle);
    
    if (newTitle !== null && newTitle.trim() !== '') {
        doc.titre = newTitle.trim();
        
        const projectIndex = projects.findIndex(p => p.id === currentDocumentsSpectacle.id);
        if (projectIndex !== -1) {
            projects[projectIndex] = currentDocumentsSpectacle;
        }
        
        saveProjectsAsync();
        renderDocuments();
    }
}

async function uploadDocuments() {
    console.log('=== uploadDocuments appelée ===');
    
    const input = document.getElementById('documentInput');
    if (!input) {
        console.error('uploadDocuments: Input introuvable');
        showErrorModal('Erreur', 'Élément d\'upload introuvable.');
        return;
    }
    
    const files = Array.from(input.files);
    console.log('uploadDocuments: Fichiers sélectionnés:', files.length, files.map(f => f.name));
    
    if (files.length === 0) {
        console.warn('uploadDocuments: Aucun fichier sélectionné (utilisateur a peut-être annulé)');
        return;
    }

    if (!currentDocumentsSpectacle) {
        console.error('uploadDocuments: currentDocumentsSpectacle non défini');
        showErrorModal('Erreur', 'Spectacle non défini. Veuillez réessayer.');
        return;
    }
    
    console.log('uploadDocuments: Spectacle:', currentDocumentsSpectacle.name, currentDocumentsSpectacle.id);

    if (!currentDocumentsSpectacle.documents) {
        currentDocumentsSpectacle.documents = [];
    }
    
    // Afficher un indicateur de chargement
    const button = input.nextElementSibling;
    if (button) {
        button.setAttribute('data-original-text', button.textContent);
        button.disabled = true;
        button.textContent = '⏳ Upload en cours...';
    }

    for (let file of files) {
        try {
            // Utiliser la fonction uploadFile() qui gère automatiquement base64 (< 500KB) ou serveur (>= 500KB)
            const uploadedFile = await uploadFile(file, 'documents');
            
            // Créer l'objet document avec les données retournées
            const documentData = {
                id: uploadedFile.stored_externally ? 
                    uploadedFile.file_id : 
                    'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: uploadedFile.name,
                titre: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                type: uploadedFile.fileType,
                fileName: uploadedFile.fileName,
                fileSize: uploadedFile.fileSize,
                stored_externally: uploadedFile.stored_externally || false,
                folderId: null
            };
            
            // Ajouter base64 ou file_id/url selon le mode de stockage
            documentData.file_id = uploadedFile.file_id;
            documentData.url = uploadedFile.url;
            documentData.downloadUrl = uploadedFile.downloadUrl;

            currentDocumentsSpectacle.documents.push(documentData);
            console.log('uploadDocuments: Fichier ajouté avec succès:', file.name);
        } catch (error) {
            console.error('Erreur upload document:', error);
            const errorMessage = error.message || error.toString();
            let userMessage = `Impossible d'uploader le fichier "${file.name}".`;
            
            if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
                userMessage += ' Problème de connexion réseau.';
            } else {
                userMessage += ' Erreur lors de la conversion du fichier.';
            }
            
            showErrorModal('Erreur lors de l\'upload', userMessage, errorMessage);
            // Ne pas arrêter la boucle, continuer avec les autres fichiers
        }
    }

    // Mettre à jour dans projects
    const projectIndex = projects.findIndex(p => p.id === currentDocumentsSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentDocumentsSpectacle;
        console.log('uploadDocuments: Projet mis à jour dans le tableau projects, index:', projectIndex);
        console.log('uploadDocuments: Nombre de documents dans le projet:', projects[projectIndex].documents?.length || 0);
    } else {
        console.error('uploadDocuments: Projet non trouvé dans le tableau projects!', currentDocumentsSpectacle.id);
        showErrorModal('Erreur', 'Projet non trouvé. Les documents ne seront pas sauvegardés.');
        return;
    }

    // Sauvegarder de manière synchrone pour s'assurer que ça fonctionne
    try {
        console.log('uploadDocuments: Début de la sauvegarde...');
        await saveProjects();
        console.log('uploadDocuments: Sauvegarde réussie');
    } catch (error) {
        console.error('uploadDocuments: Erreur lors de la sauvegarde:', error);
        const errorMessage = error.message || error.toString();
        
        // Si l'erreur concerne la taille, donner des conseils
        if (errorMessage.includes('trop volumineuses')) {
            showErrorModal(
                'Données trop volumineuses',
                'Les documents ont été uploadés sur le serveur, mais la sauvegarde du projet a échoué car les données sont trop volumineuses. Supprimez des fichiers volumineux ou contactez l\'administrateur.',
                errorMessage
            );
        } else {
            showErrorModal(
                'Erreur de sauvegarde',
                'Les documents ont été ajoutés localement mais la sauvegarde a échoué. Veuillez réessayer.',
                errorMessage
            );
        }
    }
    
    renderDocuments();
    updateDocumentsCount();
    
    // Synchroniser vers le catalogue si lié
    if (currentDocumentsSpectacle.catalogueId && typeof syncProjectToCatalogue === 'function') {
        syncProjectToCatalogue(currentDocumentsSpectacle);
    }
    
    console.log('uploadDocuments: Upload terminé, documents mis à jour. Nombre de documents:', currentDocumentsSpectacle.documents?.length || 0);
    
    input.value = '';
    
    if (button) {
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text') || '📤 Ajouter des documents';
        button.textContent = originalText;
    }
    
    console.log('uploadDocuments: === FIN ===');
}

function deleteDocument(index) {
    if (!currentDocumentsSpectacle || !confirm('Supprimer ce document ?')) return;

    currentDocumentsSpectacle.documents.splice(index, 1);
    
    const projectIndex = projects.findIndex(p => p.id === currentDocumentsSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentDocumentsSpectacle;
    }
    
    saveProjectsAsync();
    renderDocuments();
    updateDocumentsCount();
}

function updateDocumentsCount() {
    const count = currentDocumentsSpectacle?.documents?.length || 0;
    document.getElementById('documentsCount').textContent = count;
}

function createSpectacleVisuelsFolder() {
    if (!currentVisuelsSpectacle) return;
    const name = prompt('Nom du dossier :', 'Nouveau dossier');
    if (!name || !name.trim()) return;
    createFolder(currentVisuelsSpectacle, name.trim(), 'visuel');
    const projectIndex = projects.findIndex(p => p.id === currentVisuelsSpectacle.id);
    if (projectIndex !== -1) projects[projectIndex] = currentVisuelsSpectacle;
    saveProjectsAsync();
    renderVisuelsGallery();
}

function createSpectacleDocumentsFolder() {
    if (!currentDocumentsSpectacle) return;
    const name = prompt('Nom du dossier :', 'Nouveau dossier');
    if (!name || !name.trim()) return;
    createFolder(currentDocumentsSpectacle, name.trim(), 'document');
    const projectIndex = projects.findIndex(p => p.id === currentDocumentsSpectacle.id);
    if (projectIndex !== -1) projects[projectIndex] = currentDocumentsSpectacle;
    saveProjectsAsync();
    renderDocuments();
}

function renderVisuelsGallery() {
    const gallery = document.getElementById('visuelsGallery');
    const data = currentVisuelsSpectacle;
    if (!data) return;
    const visuels = data.visuels || [];
    const folders = getFoldersForType(data, 'visuel');
    const rootVisuels = visuels.filter(v => !v.folderId);
    const hasContent = visuels.length > 0 || folders.length > 0;

    if (!hasContent) {
        gallery.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: white; border-radius: 15px; color: #636e72;">
                Aucun visuel. Cliquez sur "Ajouter des visuels" pour commencer.
            </div>
        `;
        return;
    }

    let html = '<div class="file-explorer">';
    folders.forEach(f => {
        const inFolder = visuels.filter(v => v.folderId === f.id);
        const expanded = isFolderExpanded(f.id, 'spectacle', 'visuel');
        const toggleIcon = expanded ? '▼' : '▶';
        html += `<div class="folder-card folder-drop-zone" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleFolderDrop(event, '${f.id}', 'spectacle', 'visuel')" data-folder-id="${f.id}">
            <div class="explorer-row folder-row" onclick="toggleFolderExpanded('${f.id}', 'spectacle', 'visuel')">
                <span class="expand-icon">${toggleIcon}</span>
                <span class="file-icon">📁</span>
                <span class="item-name">${(f.name || '').replace(/</g,'&lt;')}</span>
                <span style="color:#999;font-size:0.85rem;">(${inFolder.length})</span>
                <span class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary btn-sm" onclick="renameSpectacleVisuelsFolder('${f.id}')" title="Renommer">✏️</button>
                    <button class="btn btn-sm" onclick="deleteSpectacleVisuelsFolder('${f.id}')" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                </span>
            </div>
            <div class="explorer-folder-content folder-content" style="display:${expanded ? 'block' : 'none'};">`;
        inFolder.forEach(visuel => {
            const idx = visuels.findIndex(v => v.id === visuel.id);
            const safeId = (visuel.id || '').replace(/'/g, "\\'");
            const thumbUrl = getFileDisplayUrl(visuel);
            html += `<div class="explorer-row file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'visuel', 'spectacle')" ondragend="handleFileDragEnd(event)">
                <span class="file-icon" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:4px;background:#f0f0f0;">${thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='🖼️'">` : '🖼️'}</span>
                <span class="item-name" onclick="viewVisuelFullscreen('${safeId}')" title="${(visuel.titre||'Sans titre').replace(/"/g,'&quot;')}">${(visuel.titre||'Sans titre').replace(/</g,'&lt;')}</span>
                <span class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary btn-sm" onclick="downloadFile(currentVisuelsSpectacle.visuels[${idx}], ${idx})" title="Télécharger">⬇️</button>
                    <button class="btn btn-sm" onclick="deleteVisuel(${idx})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                </span>
            </div>`;
        });
        html += '</div></div>';
    });
    rootVisuels.forEach(visuel => {
        const idx = visuels.findIndex(v => v.id === visuel.id);
        const safeId = (visuel.id || '').replace(/'/g, "\\'");
        const thumbUrl = getFileDisplayUrl(visuel);
        html += `<div class="explorer-row file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'visuel', 'spectacle')" ondragend="handleFileDragEnd(event)">
            <span class="file-icon" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:4px;background:#f0f0f0;">${thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='🖼️'">` : '🖼️'}</span>
            <span class="item-name" onclick="viewVisuelFullscreen('${safeId}')" title="${(visuel.titre||'Sans titre').replace(/"/g,'&quot;')}">${(visuel.titre||'Sans titre').replace(/</g,'&lt;')}</span>
            <span class="item-actions" onclick="event.stopPropagation();">
                <button class="btn btn-secondary btn-sm" onclick="downloadFile(currentVisuelsSpectacle.visuels[${idx}], ${idx})" title="Télécharger">⬇️</button>
                <button class="btn btn-sm" onclick="deleteVisuel(${idx})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
            </span>
        </div>`;
    });
    html += '</div>';
    html += '<div class="root-drop-zone explorer-drop" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleFolderDrop(event, null, \'spectacle\', \'visuel\')">Glissez les visuels ici (racine)</div>';
    gallery.innerHTML = '<div style="grid-column:1/-1;">' + html + '</div>';
}

function renameSpectacleVisuelsFolder(folderId) {
    if (!currentVisuelsSpectacle) return;
    const f = (currentVisuelsSpectacle.visuelsFolders || []).find(x => x.id === folderId);
    if (!f) return;
    const name = prompt('Nom du dossier :', f.name);
    if (name !== null && name.trim()) {
        renameFolder(currentVisuelsSpectacle, folderId, name.trim(), 'visuel');
        const projectIndex = projects.findIndex(p => p.id === currentVisuelsSpectacle.id);
        if (projectIndex !== -1) projects[projectIndex] = currentVisuelsSpectacle;
        saveProjectsAsync();
        renderVisuelsGallery();
    }
}

function deleteSpectacleVisuelsFolder(folderId) {
    if (!currentVisuelsSpectacle || !confirm('Supprimer ce dossier ? Les visuels seront déplacés à la racine.')) return;
    deleteFolder(currentVisuelsSpectacle, folderId, 'visuel');
    const projectIndex = projects.findIndex(p => p.id === currentVisuelsSpectacle.id);
    if (projectIndex !== -1) projects[projectIndex] = currentVisuelsSpectacle;
    saveProjectsAsync();
    renderVisuelsGallery();
}

function renameSpectacleDocumentsFolder(folderId) {
    if (!currentDocumentsSpectacle) return;
    const f = (currentDocumentsSpectacle.documentsFolders || []).find(x => x.id === folderId);
    if (!f) return;
    const name = prompt('Nom du dossier :', f.name);
    if (name !== null && name.trim()) {
        renameFolder(currentDocumentsSpectacle, folderId, name.trim(), 'document');
        const projectIndex = projects.findIndex(p => p.id === currentDocumentsSpectacle.id);
        if (projectIndex !== -1) projects[projectIndex] = currentDocumentsSpectacle;
        saveProjectsAsync();
        renderDocuments();
    }
}

function deleteSpectacleDocumentsFolder(folderId) {
    if (!currentDocumentsSpectacle || !confirm('Supprimer ce dossier ? Les documents seront déplacés à la racine.')) return;
    deleteFolder(currentDocumentsSpectacle, folderId, 'document');
    const projectIndex = projects.findIndex(p => p.id === currentDocumentsSpectacle.id);
    if (projectIndex !== -1) projects[projectIndex] = currentDocumentsSpectacle;
    saveProjectsAsync();
    renderDocuments();
}



function setVisuelReference(index, isReference) {
    if (!currentVisuelsSpectacle || !currentVisuelsSpectacle.visuels) return;
    
    // Désactiver tous les autres visuels de référence
    currentVisuelsSpectacle.visuels.forEach((v, i) => {
        v.isReference = (i === index && isReference);
    });
    
    const projectIndex = projects.findIndex(p => p.id === currentVisuelsSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentVisuelsSpectacle;
    }
    
    saveProjectsAsync();
    renderVisuelsGallery();
}

// ========== COMMUNICATION ==========
function openCommunicationPage(spectacleId) {
    // Vérifier la permission avant d'ouvrir
    if (window.hasPermission && !window.hasPermission('communication')) {
        alert('Vous n\'avez pas la permission d\'accéder à cette section.');
        return;
    }
    
    currentCommunicationSpectacle = projects.find(p => p.id === spectacleId);
    if (!currentCommunicationSpectacle) return;

    // Initialiser les communications s'ils n'existent pas
    if (!currentCommunicationSpectacle.communications) {
        currentCommunicationSpectacle.communications = [];
    }

    document.getElementById('communicationSpectacleName').textContent = currentCommunicationSpectacle.name;
    
    renderCommunications();
    updateCommunicationsCount();
    
    // S'assurer que le bouton "Ajouter une action" ouvre bien la modale (liaison programmatique en secours)
    const btnAdd = document.getElementById('btnAddCommunicationAction');
    if (btnAdd) {
        btnAdd.onclick = function() { openCommunicationModal(); };
    }
    
    document.getElementById('communicationPage').classList.add('active');
    updateFabAppearance();
}

function closeCommunicationPage() {
    document.getElementById('communicationPage').classList.remove('active');
    if (currentCommunicationSpectacle) {
        viewSpectacle(currentCommunicationSpectacle.id);
    }
    currentCommunicationSpectacle = null;
    updateFabAppearance();
}

function renderCommunications() {
    const container = document.getElementById('communicationsList');
    
    if (!currentCommunicationSpectacle || !currentCommunicationSpectacle.communications || currentCommunicationSpectacle.communications.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #636e72;">
                Aucune action de communication. Cliquez sur "Ajouter une action" pour commencer.
            </div>
        `;
        return;
    }

    const canEdit = window.hasPermission && window.hasPermission('communication', 'edit');
    const canViewBudget = window.hasPermission && window.hasPermission('budget', 'view');

    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: var(--light); border-bottom: 2px solid var(--border);">
                    <th style="padding: 1rem; text-align: left; font-weight: 600;">Action</th>
                    <th style="padding: 1rem; text-align: left; font-weight: 600;">Prestataire</th>
                    <th style="padding: 1rem; text-align: left; font-weight: 600;">Date(s)</th>
                    ${canViewBudget ? '<th style="padding: 1rem; text-align: right; font-weight: 600;">Prix</th>' : ''}
                    <th style="padding: 1rem; text-align: center; font-weight: 600;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${currentCommunicationSpectacle.communications.map((action, index) => {
                    const prestataire = action.prestataire_id ? (appSettings.prestataires || []).find(p => p.id === action.prestataire_id) : null;
                    const dateDebut = action.dateDebut ? new Date(action.dateDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
                    const dateFin = action.dateFin ? new Date(action.dateFin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
                    const dates = dateFin ? `${dateDebut} → ${dateFin}` : dateDebut;
                    const prix = action.prix ? action.prix.toFixed(2) + ' €' : '-';
                    const isInherited = action.fromTournee === true;
                    
                    return `
                        <tr style="border-bottom: 1px solid var(--border); ${isInherited ? 'background: #f8f9fa; opacity: 0.8;' : ''}">
                            <td style="padding: 1rem;">
                                ${isInherited ? '<span style="background: #636e72; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-right: 0.5rem;">[Hérité]</span>' : ''}
                                ${action.nom}
                            </td>
                            <td style="padding: 1rem;">
                                ${prestataire ? `
                                    <span style="cursor: pointer;" onclick="showPrestataireInfoFromId('${action.prestataire_id}')">
                                        ${prestataire.nom} 📇
                                    </span>
                                ` : '-'}
                            </td>
                            <td style="padding: 1rem;">${dates}</td>
                            ${canViewBudget ? `<td style="padding: 1rem; text-align: right;">${prix}</td>` : ''}
                            <td style="padding: 1rem; text-align: center;">
                                ${isInherited ? `
                                    <button class="btn btn-secondary" onclick="detachCommunicationAction(${index})" title="Détacher l'action">🔗</button>
                                ` : `
                                    ${canEdit ? `
                                        <button class="btn btn-secondary" onclick="editCommunicationAction(${index})" style="padding: 0.4rem 0.8rem;">✏️</button>
                                        <button class="btn" onclick="deleteCommunicationAction(${index})" style="padding: 0.4rem 0.8rem;">🗑️</button>
                                    ` : ''}
                                `}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function updateCommunicationsCount() {
    const count = currentCommunicationSpectacle?.communications?.length || 0;
    document.getElementById('communicationsCount').textContent = count;
}

function openCommunicationModal(actionIndex = null) {
    // Vérifier au moins "view" pour ouvrir la modale ; "edit" sera vérifié à l'enregistrement
    if (window.hasPermission && !window.hasPermission('communication')) {
        alert('Vous n\'avez pas accès à la section Communication.');
        return;
    }

    if (!currentCommunicationSpectacle) {
        if (typeof alert === 'function') {
            alert('Spectacle non défini. Fermez et rouvrez la page Communication.');
        }
        return;
    }

    currentEditingCommunicationAction = actionIndex;
    currentEditingCommunicationTourneeAction = null; // S'assurer qu'on n'est pas en mode tournée
    const modal = document.getElementById('communicationModal');
    const form = document.getElementById('communicationForm');
    
    if (!modal || !form) {
        console.error('openCommunicationModal: modal ou formulaire introuvable');
        return;
    }
    
    // Changer le handler du formulaire
    form.onsubmit = function(e) { e.preventDefault(); saveCommunicationAction(e); };
    
    // Remplir le select des prestataires
    const prestataireSelect = document.getElementById('communicationPrestataire');
    if (prestataireSelect) {
        prestataireSelect.innerHTML = '<option value="">-- Aucun prestataire --</option>';
        (appSettings.prestataires || []).forEach(prest => {
            prestataireSelect.innerHTML += `<option value="${prest.id}">${prest.nom}</option>`;
        });
    }

    if (actionIndex !== null && currentCommunicationSpectacle.communications && currentCommunicationSpectacle.communications[actionIndex]) {
        // Mode édition
        const action = currentCommunicationSpectacle.communications[actionIndex];
        document.getElementById('communicationModalTitle').textContent = 'Modifier l\'action de communication';
        document.getElementById('communicationActionId').value = action.id;
        document.getElementById('communicationNom').value = action.nom || '';
        document.getElementById('communicationPrestataire').value = action.prestataire_id || '';
        document.getElementById('communicationDateDebut').value = action.dateDebut || '';
        document.getElementById('communicationDateFin').value = action.dateFin || '';
        document.getElementById('communicationPrix').value = action.prix || '';
        document.getElementById('communicationPrixType').value = action.prixType || 'HT';
        document.getElementById('communicationTvaRate').value = action.tvaRate || 20;
        document.getElementById('communicationNotes').value = action.notes || '';
    } else {
        // Mode création
        document.getElementById('communicationModalTitle').textContent = 'Nouvelle action de communication';
        form.reset();
        document.getElementById('communicationActionId').value = '';
        document.getElementById('communicationTvaRate').value = 20;
        document.getElementById('communicationPrixType').value = 'HT';
    }

    // Afficher/masquer le bouton "Voir infos" prestataire
    updatePrestataireInfoButton();
    if (prestataireSelect) {
        prestataireSelect.removeEventListener('change', updatePrestataireInfoButton);
        prestataireSelect.addEventListener('change', updatePrestataireInfoButton);
    }

    // Déplacer la modale à la fin du body pour éviter les problèmes de contexte d'empilement
    document.body.appendChild(modal);
    modal.style.zIndex = '99999';
    modal.classList.add('active');
}

function updatePrestataireInfoButton() {
    const prestataireId = document.getElementById('communicationPrestataire').value;
    const btn = document.getElementById('communicationPrestataireInfoBtn');
    btn.style.display = prestataireId ? 'block' : 'none';
}

function showPrestataireInfo() {
    const prestataireId = document.getElementById('communicationPrestataire').value;
    if (prestataireId) {
        showPrestataireInfoFromId(prestataireId);
    }
}

function showPrestataireInfoFromId(prestataireId) {
    const prestataire = (appSettings.prestataires || []).find(p => p.id === prestataireId);
    if (!prestataire) return;

    const modal = document.getElementById('lieuInfoModal');
    if (!modal) return;
    
    document.getElementById('lieuInfoModalTitle').textContent = `Informations : ${prestataire.nom}`;
    document.getElementById('lieuInfoContent').innerHTML = `
        <div style="display: grid; gap: 1rem;">
            <div><strong>Nom :</strong> ${prestataire.nom}</div>
            ${prestataire.type ? `<div><strong>Type :</strong> ${prestataire.type}</div>` : ''}
            ${prestataire.contact ? `<div><strong>Contact :</strong> ${prestataire.contact}</div>` : ''}
            ${prestataire.telephone ? `<div><strong>Téléphone :</strong> ${prestataire.telephone}</div>` : ''}
            ${prestataire.email ? `<div><strong>Email :</strong> ${prestataire.email}</div>` : ''}
            ${prestataire.notes ? `<div><strong>Notes :</strong> ${prestataire.notes}</div>` : ''}
        </div>
    `;
    
    // Déplacer la modale à la fin du body pour éviter les problèmes de contexte d'empilement
    document.body.appendChild(modal);
    modal.style.zIndex = '99999';
    modal.classList.add('active');
}

function closeCommunicationModal() {
    const modal = document.getElementById('communicationModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.zIndex = '';
    }
    currentEditingCommunicationAction = null;
    currentEditingCommunicationTourneeAction = null;
    // Nettoyer le tooltip si présent
    const tooltip = document.querySelector('[style*="position: absolute"][style*="background: rgba(0,0,0,0.9)"]');
    if (tooltip && tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
    }
}

function saveCommunicationAction(event) {
    event.preventDefault();

    if (window.hasPermission && !window.hasPermission('communication', 'edit')) {
        alert('Vous n\'avez pas la permission de modifier les actions de communication.');
        return;
    }

    const nom = document.getElementById('communicationNom').value.trim();
    if (!nom) {
        alert('Le nom de l\'action est obligatoire.');
        return;
    }

    const dateDebut = document.getElementById('communicationDateDebut').value;
    if (!dateDebut) {
        alert('La date de début est obligatoire.');
        return;
    }

    const prix = parseFloat(document.getElementById('communicationPrix').value) || null;
    const prixType = document.getElementById('communicationPrixType').value;
    const tvaRate = parseFloat(document.getElementById('communicationTvaRate').value) || 0;
    const dateFin = document.getElementById('communicationDateFin').value || null;

    const actionData = {
        id: document.getElementById('communicationActionId').value || 'com_' + Date.now(),
        nom: nom,
        prestataire_id: document.getElementById('communicationPrestataire').value || null,
        dateDebut: dateDebut,
        dateFin: dateFin,
        prix: prix,
        prixType: prixType,
        tvaRate: tvaRate,
        notes: document.getElementById('communicationNotes').value.trim() || null,
        budgetLineId: null,
        fromTournee: false,
        tourneeActionId: null
    };

    // Si on est en mode édition, garder certaines propriétés
    if (currentEditingCommunicationAction !== null) {
        const existingAction = currentCommunicationSpectacle.communications[currentEditingCommunicationAction];
        actionData.budgetLineId = existingAction.budgetLineId;
        actionData.fromTournee = existingAction.fromTournee;
        actionData.tourneeActionId = existingAction.tourneeActionId;
    }

    // Synchroniser avec le budget si un prix est défini
    if (prix !== null) {
        syncCommunicationWithBudget(actionData, currentEditingCommunicationAction !== null);
    } else if (actionData.budgetLineId) {
        // Si on supprime le prix, supprimer la ligne budget
        removeCommunicationBudgetLine(actionData.budgetLineId);
        actionData.budgetLineId = null;
    }

    if (currentEditingCommunicationAction !== null) {
        // Mode édition
        currentCommunicationSpectacle.communications[currentEditingCommunicationAction] = actionData;
    } else {
        // Mode création
        currentCommunicationSpectacle.communications.push(actionData);
    }

    // Mettre à jour dans projects
    const projectIndex = projects.findIndex(p => p.id === currentCommunicationSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentCommunicationSpectacle;
    }

    saveProjectsAsync();
    renderCommunications();
    updateCommunicationsCount();
    closeCommunicationModal();
}

function syncCommunicationWithBudget(action, isEdit = false) {
    if (!currentCommunicationSpectacle.budget) {
        currentCommunicationSpectacle.budget = [];
    }

    const prestataire = action.prestataire_id ? (appSettings.prestataires || []).find(p => p.id === action.prestataire_id) : null;
    const prestataireNom = prestataire ? prestataire.nom : '';

    // Calculer le prix HT
    let prixHT = action.prix;
    if (action.prixType === 'TTC' && action.tvaRate > 0) {
        prixHT = action.prix / (1 + action.tvaRate / 100);
    }

    if (action.budgetLineId) {
        // Mettre à jour la ligne budget existante
        const budgetIndex = currentCommunicationSpectacle.budget.findIndex(line => line.id === action.budgetLineId);
        if (budgetIndex !== -1) {
            const budgetLine = currentCommunicationSpectacle.budget[budgetIndex];
            budgetLine.designation = '[COM] ' + action.nom;
            budgetLine.fournisseur = prestataireNom;
            budgetLine.montantFixe = prixHT;
            budgetLine.tvaRate = action.tvaRate;
        }
    } else {
        // Créer une nouvelle ligne budget
        const budgetLine = {
            id: 'budget_' + Date.now(),
            designation: '[COM] ' + action.nom,
            fournisseur: prestataireNom,
            category: 'Communication',
            montantType: 'fixed',
            montantFixe: prixHT,
            tvaRate: action.tvaRate,
            communicationId: action.id
        };
        currentCommunicationSpectacle.budget.push(budgetLine);
        action.budgetLineId = budgetLine.id;
    }
}

function removeCommunicationBudgetLine(budgetLineId) {
    if (!currentCommunicationSpectacle.budget) return;
    const index = currentCommunicationSpectacle.budget.findIndex(line => line.id === budgetLineId);
    if (index !== -1) {
        currentCommunicationSpectacle.budget.splice(index, 1);
    }
}

function editCommunicationAction(index) {
    openCommunicationModal(index);
}

function deleteCommunicationAction(index) {
    if (window.hasPermission && !window.hasPermission('communication', 'edit')) {
        alert('Vous n\'avez pas la permission de modifier les actions de communication.');
        return;
    }

    if (!confirm('Supprimer cette action de communication ?')) return;

    const action = currentCommunicationSpectacle.communications[index];
    
    // Supprimer la ligne budget associée si elle existe
    if (action.budgetLineId) {
        removeCommunicationBudgetLine(action.budgetLineId);
    }

    currentCommunicationSpectacle.communications.splice(index, 1);

    // Mettre à jour dans projects
    const projectIndex = projects.findIndex(p => p.id === currentCommunicationSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentCommunicationSpectacle;
    }

    saveProjectsAsync();
    renderCommunications();
    updateCommunicationsCount();
}

function detachCommunicationAction(index) {
    if (!confirm('Détacher cette action de la tournée ? Elle deviendra indépendante et modifiable.')) return;

    const action = currentCommunicationSpectacle.communications[index];
    action.fromTournee = false;
    action.tourneeActionId = null;

    // Mettre à jour dans projects
    const projectIndex = projects.findIndex(p => p.id === currentCommunicationSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentCommunicationSpectacle;
    }

    saveProjectsAsync();
    renderCommunications();
}

// ========== COMMUNICATION TOURNÉE ==========
let currentCommunicationTournee = null;
let currentEditingCommunicationTourneeAction = null;

function openCommunicationTourneePage() {
    // Vérifier la permission avant d'ouvrir
    if (window.hasPermission && !window.hasPermission('communication')) {
        alert('Vous n\'avez pas la permission d\'accéder à cette section.');
        return;
    }
    
    if (!currentTournee) return;
    currentCommunicationTournee = currentTournee;

    // Initialiser les communications s'ils n'existent pas
    if (!currentCommunicationTournee.communications) {
        currentCommunicationTournee.communications = [];
    }

    document.getElementById('communicationTourneeName').textContent = currentCommunicationTournee.name;
    
    renderCommunicationsTournee();
    updateCommunicationsTourneeCount();
    document.getElementById('communicationTourneePage').classList.add('active');
}

function closeCommunicationTourneePage() {
    document.getElementById('communicationTourneePage').classList.remove('active');
    if (currentCommunicationTournee) {
        viewTournee(currentCommunicationTournee.id);
    }
    currentCommunicationTournee = null;
}

function renderCommunicationsTournee() {
    const container = document.getElementById('communicationsTourneeList');
    
    if (!currentCommunicationTournee || !currentCommunicationTournee.communications || currentCommunicationTournee.communications.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #636e72;">
                Aucune action de communication nationale. Cliquez sur "Ajouter une action" pour commencer.
            </div>
        `;
        return;
    }

    const canEdit = window.hasPermission && window.hasPermission('communication', 'edit');
    const canViewBudget = window.hasPermission && window.hasPermission('budget', 'view');

    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: var(--light); border-bottom: 2px solid var(--border);">
                    <th style="padding: 1rem; text-align: left; font-weight: 600;">Action</th>
                    <th style="padding: 1rem; text-align: left; font-weight: 600;">Prestataire</th>
                    <th style="padding: 1rem; text-align: left; font-weight: 600;">Date(s)</th>
                    ${canViewBudget ? '<th style="padding: 1rem; text-align: right; font-weight: 600;">Prix total</th>' : ''}
                    <th style="padding: 1rem; text-align: center; font-weight: 600;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${currentCommunicationTournee.communications.map((action, index) => {
                    const prestataire = action.prestataire_id ? (appSettings.prestataires || []).find(p => p.id === action.prestataire_id) : null;
                    const dateDebut = action.dateDebut ? new Date(action.dateDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
                    const dateFin = action.dateFin ? new Date(action.dateFin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
                    const dates = dateFin ? `${dateDebut} → ${dateFin}` : dateDebut;
                    const prix = action.prix ? action.prix.toFixed(2) + ' €' : '-';
                    
                    return `
                        <tr style="border-bottom: 1px solid var(--border);">
                            <td style="padding: 1rem;">${action.nom}</td>
                            <td style="padding: 1rem;">
                                ${prestataire ? `
                                    <span style="cursor: pointer;" onclick="showPrestataireInfoFromId('${action.prestataire_id}')">
                                        ${prestataire.nom} 📇
                                    </span>
                                ` : '-'}
                            </td>
                            <td style="padding: 1rem;">${dates}</td>
                            ${canViewBudget ? `<td style="padding: 1rem; text-align: right;">${prix}</td>` : ''}
                            <td style="padding: 1rem; text-align: center;">
                                ${canEdit ? `
                                    <button class="btn btn-secondary" onclick="editCommunicationTourneeAction(${index})" style="padding: 0.4rem 0.8rem;">✏️</button>
                                    <button class="btn" onclick="deleteCommunicationTourneeAction(${index})" style="padding: 0.4rem 0.8rem;">🗑️</button>
                                ` : ''}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function updateCommunicationsTourneeCount() {
    const count = currentCommunicationTournee?.communications?.length || 0;
    document.getElementById('communicationsTourneeCount').textContent = count;
}

function openCommunicationTourneeModal(actionIndex = null) {
    if (window.hasPermission && !window.hasPermission('communication', 'edit')) {
        alert('Vous n\'avez pas la permission de modifier les actions de communication.');
        return;
    }

    currentEditingCommunicationTourneeAction = actionIndex;
    currentEditingCommunicationAction = null; // S'assurer qu'on n'est pas en mode spectacle
    const modal = document.getElementById('communicationModal');
    const form = document.getElementById('communicationForm');
    
    // Changer le handler du formulaire
    form.onsubmit = saveCommunicationTourneeAction;
    
    // Remplir le select des prestataires
    const prestataireSelect = document.getElementById('communicationPrestataire');
    prestataireSelect.innerHTML = '<option value="">-- Aucun prestataire --</option>';
    (appSettings.prestataires || []).forEach(prest => {
        prestataireSelect.innerHTML += `<option value="${prest.id}">${prest.nom}</option>`;
    });

    if (actionIndex !== null && currentCommunicationTournee.communications[actionIndex]) {
        // Mode édition
        const action = currentCommunicationTournee.communications[actionIndex];
        document.getElementById('communicationModalTitle').textContent = 'Modifier l\'action de communication nationale';
        document.getElementById('communicationActionId').value = action.id;
        document.getElementById('communicationNom').value = action.nom || '';
        document.getElementById('communicationPrestataire').value = action.prestataire_id || '';
        document.getElementById('communicationDateDebut').value = action.dateDebut || '';
        document.getElementById('communicationDateFin').value = action.dateFin || '';
        document.getElementById('communicationPrix').value = action.prix || '';
        document.getElementById('communicationPrixType').value = action.prixType || 'HT';
        document.getElementById('communicationTvaRate').value = action.tvaRate || 20;
        document.getElementById('communicationNotes').value = action.notes || '';
    } else {
        // Mode création
        document.getElementById('communicationModalTitle').textContent = 'Nouvelle action de communication nationale';
        form.reset();
        document.getElementById('communicationActionId').value = '';
        document.getElementById('communicationTvaRate').value = 20;
        document.getElementById('communicationPrixType').value = 'HT';
    }

    // Afficher/masquer le bouton "Voir infos" prestataire
    updatePrestataireInfoButton();
    prestataireSelect.addEventListener('change', updatePrestataireInfoButton);

    // Déplacer la modale à la fin du body pour éviter les problèmes de contexte d'empilement
    document.body.appendChild(modal);
    modal.style.zIndex = '99999';
    modal.classList.add('active');
}

function saveCommunicationTourneeAction(event) {
    event.preventDefault();

    if (window.hasPermission && !window.hasPermission('communication', 'edit')) {
        alert('Vous n\'avez pas la permission de modifier les actions de communication.');
        return;
    }

    const nom = document.getElementById('communicationNom').value.trim();
    if (!nom) {
        alert('Le nom de l\'action est obligatoire.');
        return;
    }

    const dateDebut = document.getElementById('communicationDateDebut').value;
    if (!dateDebut) {
        alert('La date de début est obligatoire.');
        return;
    }

    const prix = parseFloat(document.getElementById('communicationPrix').value) || null;
    const prixType = document.getElementById('communicationPrixType').value;
    const tvaRate = parseFloat(document.getElementById('communicationTvaRate').value) || 0;
    const dateFin = document.getElementById('communicationDateFin').value || null;

    const actionData = {
        id: document.getElementById('communicationActionId').value || 'com_tournee_' + Date.now(),
        nom: nom,
        prestataire_id: document.getElementById('communicationPrestataire').value || null,
        dateDebut: dateDebut,
        dateFin: dateFin,
        prix: prix,
        prixType: prixType,
        tvaRate: tvaRate,
        notes: document.getElementById('communicationNotes').value.trim() || null
    };

    if (currentEditingCommunicationTourneeAction !== null) {
        // Mode édition - mettre à jour et propager aux spectacles
        const oldAction = currentCommunicationTournee.communications[currentEditingCommunicationTourneeAction];
        currentCommunicationTournee.communications[currentEditingCommunicationTourneeAction] = actionData;
        propagateCommunicationToSpectacles(oldAction.id, actionData);
    } else {
        // Mode création - ajouter et propager aux spectacles
        currentCommunicationTournee.communications.push(actionData);
        propagateCommunicationToSpectacles(null, actionData);
    }

    // Mettre à jour dans projects
    const tourneeIndex = projects.findIndex(p => p.id === currentCommunicationTournee.id);
    if (tourneeIndex !== -1) {
        projects[tourneeIndex] = currentCommunicationTournee;
    }

    saveProjectsAsync();
    renderCommunicationsTournee();
    updateCommunicationsTourneeCount();
    closeCommunicationModal();
}

function propagateCommunicationToSpectacles(oldActionId, actionData) {
    const spectacles = projects.filter(p => p.parentId === currentCommunicationTournee.id);
    const nombreSpectacles = spectacles.length;
    
    if (nombreSpectacles === 0) return;

    const prixParSpectacle = actionData.prix ? (actionData.prix / nombreSpectacles).toFixed(2) : null;

    spectacles.forEach(spectacle => {
        if (!spectacle.communications) {
            spectacle.communications = [];
        }

        if (oldActionId) {
            // Mode édition - mettre à jour les actions existantes
            const existingIndex = spectacle.communications.findIndex(a => a.tourneeActionId === oldActionId && a.fromTournee);
            if (existingIndex !== -1) {
                const existingAction = spectacle.communications[existingIndex];
                spectacle.communications[existingIndex] = {
                    ...actionData,
                    id: existingAction.id,
                    fromTournee: true,
                    tourneeActionId: actionData.id,
                    prix: prixParSpectacle ? parseFloat(prixParSpectacle) : null,
                    budgetLineId: existingAction.budgetLineId
                };
                // Mettre à jour la ligne budget si elle existe
                if (existingAction.budgetLineId && prixParSpectacle) {
                    updateCommunicationBudgetLine(spectacle, existingAction.budgetLineId, actionData, parseFloat(prixParSpectacle));
                }
            }
        } else {
            // Mode création - ajouter une nouvelle action
            const newAction = {
                ...actionData,
                id: 'com_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                fromTournee: true,
                tourneeActionId: actionData.id,
                prix: prixParSpectacle ? parseFloat(prixParSpectacle) : null,
                budgetLineId: null
            };
            spectacle.communications.push(newAction);
            // Créer la ligne budget si un prix est défini
            if (prixParSpectacle) {
                syncCommunicationWithBudgetForSpectacle(spectacle, newAction);
            }
        }
    });
}

function syncCommunicationWithBudgetForSpectacle(spectacle, action) {
    if (!spectacle.budget) {
        spectacle.budget = [];
    }

    const prestataire = action.prestataire_id ? (appSettings.prestataires || []).find(p => p.id === action.prestataire_id) : null;
    const prestataireNom = prestataire ? prestataire.nom : '';

    // Calculer le prix HT
    let prixHT = action.prix;
    if (action.prixType === 'TTC' && action.tvaRate > 0) {
        prixHT = action.prix / (1 + action.tvaRate / 100);
    }

    const budgetLine = {
        id: 'budget_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        designation: '[COM] ' + action.nom,
        fournisseur: prestataireNom,
        category: 'Communication',
        montantType: 'fixed',
        montantFixe: prixHT,
        tvaRate: action.tvaRate,
        communicationId: action.id
    };
    spectacle.budget.push(budgetLine);
    action.budgetLineId = budgetLine.id;
}

function updateCommunicationBudgetLine(spectacle, budgetLineId, actionData, prix) {
    if (!spectacle.budget) return;
    const budgetIndex = spectacle.budget.findIndex(line => line.id === budgetLineId);
    if (budgetIndex !== -1) {
        const prestataire = actionData.prestataire_id ? (appSettings.prestataires || []).find(p => p.id === actionData.prestataire_id) : null;
        const prestataireNom = prestataire ? prestataire.nom : '';
        let prixHT = prix;
        if (actionData.prixType === 'TTC' && actionData.tvaRate > 0) {
            prixHT = prix / (1 + actionData.tvaRate / 100);
        }
        spectacle.budget[budgetIndex].designation = '[COM] ' + actionData.nom;
        spectacle.budget[budgetIndex].fournisseur = prestataireNom;
        spectacle.budget[budgetIndex].montantFixe = prixHT;
        spectacle.budget[budgetIndex].tvaRate = actionData.tvaRate;
    }
}

// --- SYNCHRONISATION TECHNIQUE & LOGISTIQUE AVEC BUDGET ---
function syncTechItemWithBudget(spectacle, item, category, designationPrefix, itemType) {
    if (!spectacle.budget) spectacle.budget = [];
    
    const cout = parseFloat(item.cout || item.total || 0);
    
    // Si pas de coût, supprimer la ligne budget si elle existe
    if (!cout || cout <= 0) {
        if (item.budgetLineId) {
            const index = spectacle.budget.findIndex(b => b.id === item.budgetLineId);
            if (index !== -1) {
                spectacle.budget.splice(index, 1);
            }
            item.budgetLineId = null;
        }
        return;
    }
    
    // Construire la désignation
    let designation = `[${designationPrefix}] `;
    if (itemType === 'voyage') {
        designation += `${item.type || 'Voyage'} ${item.depart || ''} → ${item.arrivee || ''}`;
    } else if (itemType === 'hebergement') {
        designation += item.nom || 'Hébergement';
    } else {
        designation += item.nom || item.designation || itemType;
    }
    designation = designation.trim();
    
    const tvaRate = parseFloat(item.tvaRate) || 20;
    const isEstimatif = item.coutStatut !== 'reel';
    const isReel = item.coutStatut === 'reel';
    
    if (item.budgetLineId) {
        // Mettre à jour la ligne existante
        const budgetLine = spectacle.budget.find(b => b.id === item.budgetLineId);
        if (budgetLine) {
            budgetLine.designation = designation;
            budgetLine.montantFixe = cout;
            budgetLine.tvaRate = tvaRate;
            budgetLine.isEstimatif = isEstimatif;
            budgetLine.isReel = isReel;
            budgetLine.category = category;
            if (item.montantInputType) budgetLine.montantInputType = item.montantInputType;
            // Synchroniser les fichiers devis/facture
            if (item.devis) budgetLine.devis = item.devis; 
            else delete budgetLine.devis;
            if (item.facture) budgetLine.facture = item.facture;
            else delete budgetLine.facture;
        }
    } else {
        // Créer une nouvelle ligne budget
        const newLine = {
            id: 'budget_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            designation: designation,
            category: category,
            montantType: 'fixe',
            montantFixe: cout,
            montantInputType: item.montantInputType || 'HT',
            tvaRate: tvaRate,
            isEstimatif: isEstimatif,
            isReel: isReel,
            techItemId: item.id,
            techItemType: itemType
        };
        // Copier les fichiers devis/facture si présents
        if (item.devis) newLine.devis = item.devis;
        if (item.facture) newLine.facture = item.facture;
        spectacle.budget.push(newLine);
        item.budgetLineId = newLine.id;
    }
}

// --- FICHIERS DEVIS/FACTURE SUR LIGNES TECH ---
function getTechItem(techType, index) {
    if (!window.currentTechSpectacle) return null;
    if (techType === 'prestataire') return window.currentTechSpectacle.tech.prestataires?.[index];
    if (techType === 'voyage') return window.currentTechSpectacle.tech.voyages?.[index];
    if (techType === 'hebergement') return window.currentTechSpectacle.tech.hebergements?.[index];
    return null;
}

function rerenderTechSection(techType) {
    if (techType === 'prestataire') renderTechPrestataires();
    else if (techType === 'voyage') renderTechVoyages();
    else if (techType === 'hebergement') renderTechHebergements();
}

async function uploadTechFile(techType, index, fileType, file) {
    const item = getTechItem(techType, index);
    if (!file || !item) return;

    try {
        const uploadedFile = await uploadFile(file, 'budget');

        const fileData = {
            name: uploadedFile.name,
            fileName: uploadedFile.fileName,
            fileType: uploadedFile.fileType,
            fileSize: uploadedFile.fileSize,
            stored_externally: uploadedFile.stored_externally || false
        };

        fileData.id = uploadedFile.file_id;
        fileData.file_id = uploadedFile.file_id;
        fileData.url = uploadedFile.url;
        fileData.downloadUrl = uploadedFile.downloadUrl;

        // Stocker sur l'item tech
        item[fileType] = fileData;

        // Synchroniser vers la ligne budget liée
        if (item.budgetLineId && window.currentTechSpectacle.budget) {
            const budgetLine = window.currentTechSpectacle.budget.find(b => b.id === item.budgetLineId);
            if (budgetLine) budgetLine[fileType] = fileData;
        }

        saveProjectsAsync();
        rerenderTechSection(techType);
    } catch (error) {
        console.error('Erreur upload fichier tech:', error);
        showErrorModal('Erreur upload', `Impossible d'uploader "${file.name}".`, error.message || '');
    }
}

function deleteTechFile(techType, index, fileType) {
    const item = getTechItem(techType, index);
    if (!item) return;

    delete item[fileType];

    // Synchroniser vers la ligne budget liée
    if (item.budgetLineId && window.currentTechSpectacle.budget) {
        const budgetLine = window.currentTechSpectacle.budget.find(b => b.id === item.budgetLineId);
        if (budgetLine) delete budgetLine[fileType];
    }

    saveProjectsAsync();
    rerenderTechSection(techType);
}

function renderTechFileButtons(techType, index, item) {
    if (!item.budgetLineId) return ''; // Pas lié au budget, pas de fichiers

    const inputIdDevis = `techDevis_${techType}_${index}`;
    const inputIdFacture = `techFacture_${techType}_${index}`;

    let html = '<div style="display: flex; gap: 0.5rem; margin-top: 0.4rem; align-items: center; flex-wrap: wrap;">';

    // Devis
    if (item.devis) {
        html += `<a href="${getFileDisplayUrl(item.devis)}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.25rem; background: #dfe6e920; color: #0984e3; padding: 0.15rem 0.5rem; border-radius: 8px; font-size: 0.75rem; text-decoration: none; border: 1px solid #0984e330;" title="${item.devis.name || 'Devis'}">
            📄 Devis
            <span onclick="event.preventDefault(); event.stopPropagation(); deleteTechFile('${techType}', ${index}, 'devis')" style="cursor: pointer; color: #d63031; margin-left: 0.2rem; font-weight: 700;" title="Supprimer le devis">×</span>
        </a>`;
    } else {
        html += `<input type="file" id="${inputIdDevis}" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.mp4,video/mp4" style="display: none;" onchange="uploadTechFile('${techType}', ${index}, 'devis', this.files[0])">
        <button onclick="document.getElementById('${inputIdDevis}').click()" style="display: inline-flex; align-items: center; gap: 0.25rem; background: white; color: #636e72; padding: 0.15rem 0.5rem; border-radius: 8px; font-size: 0.75rem; border: 1px dashed #b2bec3; cursor: pointer;" title="Joindre un devis">📄 + Devis</button>`;
    }

    // Facture
    if (item.facture) {
        html += `<a href="${getFileDisplayUrl(item.facture)}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.25rem; background: #00b89410; color: #00b894; padding: 0.15rem 0.5rem; border-radius: 8px; font-size: 0.75rem; text-decoration: none; border: 1px solid #00b89430;" title="${item.facture.name || 'Facture'}">
            🧾 Facture
            <span onclick="event.preventDefault(); event.stopPropagation(); deleteTechFile('${techType}', ${index}, 'facture')" style="cursor: pointer; color: #d63031; margin-left: 0.2rem; font-weight: 700;" title="Supprimer la facture">×</span>
        </a>`;
    } else {
        html += `<input type="file" id="${inputIdFacture}" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.mp4,video/mp4" style="display: none;" onchange="uploadTechFile('${techType}', ${index}, 'facture', this.files[0])">
        <button onclick="document.getElementById('${inputIdFacture}').click()" style="display: inline-flex; align-items: center; gap: 0.25rem; background: white; color: #636e72; padding: 0.15rem 0.5rem; border-radius: 8px; font-size: 0.75rem; border: 1px dashed #b2bec3; cursor: pointer;" title="Joindre une facture">🧾 + Facture</button>`;
    }

    html += '</div>';
    return html;
}

function editCommunicationTourneeAction(index) {
    openCommunicationTourneeModal(index);
}

function deleteCommunicationTourneeAction(index) {
    if (window.hasPermission && !window.hasPermission('communication', 'edit')) {
        alert('Vous n\'avez pas la permission de modifier les actions de communication.');
        return;
    }

    if (!confirm('Supprimer cette action de communication nationale ? Elle sera également supprimée de tous les spectacles de la tournée.')) return;

    const action = currentCommunicationTournee.communications[index];
    
    // Supprimer toutes les copies dans les spectacles
    const spectacles = projects.filter(p => p.parentId === currentCommunicationTournee.id);
    spectacles.forEach(spectacle => {
        if (spectacle.communications) {
            const actionIndex = spectacle.communications.findIndex(a => a.tourneeActionId === action.id && a.fromTournee);
            if (actionIndex !== -1) {
                const actionToDelete = spectacle.communications[actionIndex];
                // Supprimer la ligne budget si elle existe
                if (actionToDelete.budgetLineId) {
                    removeCommunicationBudgetLineForSpectacle(spectacle, actionToDelete.budgetLineId);
                }
                spectacle.communications.splice(actionIndex, 1);
            }
        }
    });

    currentCommunicationTournee.communications.splice(index, 1);

    // Mettre à jour dans projects
    const tourneeIndex = projects.findIndex(p => p.id === currentCommunicationTournee.id);
    if (tourneeIndex !== -1) {
        projects[tourneeIndex] = currentCommunicationTournee;
    }

    saveProjectsAsync();
    renderCommunicationsTournee();
    updateCommunicationsTourneeCount();
}

function removeCommunicationBudgetLineForSpectacle(spectacle, budgetLineId) {
    if (!spectacle.budget) return;
    const index = spectacle.budget.findIndex(line => line.id === budgetLineId);
    if (index !== -1) {
        spectacle.budget.splice(index, 1);
    }
}

// Quand on ajoute un nouveau spectacle à la tournée, lui ajouter toutes les actions com' nationales
function addTourneeCommunicationsToNewSpectacle(spectacleId) {
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle || !spectacle.parentId) return;

    const tournee = projects.find(p => p.id === spectacle.parentId);
    if (!tournee || !tournee.communications) return;

    if (!spectacle.communications) {
        spectacle.communications = [];
    }

    const spectacles = projects.filter(p => p.parentId === spectacle.parentId);
    const nombreSpectacles = spectacles.length;
    
    tournee.communications.forEach(tourneeAction => {
        // Vérifier si l'action n'existe pas déjà
        const exists = spectacle.communications.some(a => a.tourneeActionId === tourneeAction.id && a.fromTournee);
        if (!exists) {
            const prixParSpectacle = tourneeAction.prix ? (tourneeAction.prix / nombreSpectacles).toFixed(2) : null;
            const newAction = {
                ...tourneeAction,
                id: 'com_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                fromTournee: true,
                tourneeActionId: tourneeAction.id,
                prix: prixParSpectacle ? parseFloat(prixParSpectacle) : null,
                budgetLineId: null
            };
            spectacle.communications.push(newAction);
            // Créer la ligne budget si un prix est défini
            if (prixParSpectacle) {
                syncCommunicationWithBudgetForSpectacle(spectacle, newAction);
            }
        }
    });
}

function updateVisuelsCount() {
    const count = currentVisuelsSpectacle?.visuels?.length || 0;
    document.getElementById('visuelsCount').textContent = count;
}

async function uploadVisuels() {
    console.log('=== uploadVisuels appelée ===');
    
    const input = document.getElementById('visuelInput');
    if (!input) {
        console.error('uploadVisuels: Input introuvable');
        showErrorModal('Erreur', 'Élément d\'upload introuvable.');
        return;
    }
    
    const files = Array.from(input.files);
    console.log('uploadVisuels: Fichiers sélectionnés:', files.length, files.map(f => f.name));
    
    if (files.length === 0) {
        console.warn('uploadVisuels: Aucun fichier sélectionné (utilisateur a peut-être annulé)');
        // Ne pas afficher d'erreur si l'utilisateur a simplement annulé la sélection
        return;
    }

    if (!currentVisuelsSpectacle) {
        console.error('uploadVisuels: currentVisuelsSpectacle non défini');
        showErrorModal('Erreur', 'Spectacle non défini. Veuillez réessayer.');
        return;
    }
    
    console.log('uploadVisuels: Spectacle:', currentVisuelsSpectacle.name, currentVisuelsSpectacle.id);

    if (!currentVisuelsSpectacle.visuels) {
        currentVisuelsSpectacle.visuels = [];
    }
    
    // Afficher un indicateur de chargement
    const button = input.nextElementSibling;
    if (button) {
        button.setAttribute('data-original-text', button.textContent);
        button.disabled = true;
        button.textContent = '⏳ Upload en cours...';
    }

    for (let file of files) {
        try {
            // Utiliser la fonction uploadFile() qui gère automatiquement base64 (< 500KB) ou serveur (>= 500KB)
            const uploadedFile = await uploadFile(file, 'visuels');
            
            // Créer l'objet visuel avec les données retournées
            const visuelData = {
                id: uploadedFile.stored_externally ? 
                    uploadedFile.file_id : 
                    'visuel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                titre: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                fileName: uploadedFile.fileName,
                fileType: uploadedFile.fileType,
                fileSize: uploadedFile.fileSize,
                stored_externally: uploadedFile.stored_externally || false,
                folderId: null
            };
            
            // Ajouter base64 ou file_id/url selon le mode de stockage
            visuelData.file_id = uploadedFile.file_id;
            visuelData.url = uploadedFile.url;
            visuelData.downloadUrl = uploadedFile.downloadUrl;

            currentVisuelsSpectacle.visuels.push(visuelData);
            console.log('uploadVisuels: Fichier ajouté avec succès:', file.name);
        } catch (error) {
            console.error('Erreur upload visuel:', error);
            const errorMessage = error.message || error.toString();
            let userMessage = `Impossible d'uploader le fichier "${file.name}".`;
            
            if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
                userMessage += ' Problème de connexion réseau.';
            } else {
                userMessage += ' Erreur lors de la conversion du fichier.';
            }
            
            showErrorModal('Erreur lors de l\'upload', userMessage, errorMessage);
            // Ne pas arrêter la boucle, continuer avec les autres fichiers
        }
    }

    // Mettre à jour dans projects
    const projectIndex = projects.findIndex(p => p.id === currentVisuelsSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentVisuelsSpectacle;
    }

    saveProjectsAsync();
    renderVisuelsGallery();
    updateVisuelsCount();
    
    // Synchroniser vers le catalogue si lié
    if (currentVisuelsSpectacle.catalogueId && typeof syncProjectToCatalogue === 'function') {
        syncProjectToCatalogue(currentVisuelsSpectacle);
    }
    
    console.log('uploadVisuels: Upload terminé, visuels mis à jour');
    
    input.value = '';
    
    if (button) {
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text') || '📤 Ajouter des visuels';
        button.textContent = originalText;
    }
    
    console.log('uploadVisuels: === FIN ===');
}

function updateVisuelTitre(index, newTitre) {
    if (!currentVisuelsSpectacle || !currentVisuelsSpectacle.visuels) return;
    
    currentVisuelsSpectacle.visuels[index].titre = newTitre;
    
    const projectIndex = projects.findIndex(p => p.id === currentVisuelsSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentVisuelsSpectacle;
    }
    
    saveProjectsAsync();
}

function deleteVisuel(index) {
    if (!currentVisuelsSpectacle || !confirm('Supprimer ce visuel ?')) return;

    currentVisuelsSpectacle.visuels.splice(index, 1);
    
    const projectIndex = projects.findIndex(p => p.id === currentVisuelsSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentVisuelsSpectacle;
    }
    
    saveProjectsAsync();
    renderVisuelsGallery();
    updateVisuelsCount();
}

function viewVisuelFullscreen(fileId) {
    // Trouver le visuel dans les visuels du spectacle ou de la tournée
    let visuel = null;
    
    if (currentVisuelsSpectacle && currentVisuelsSpectacle.visuels) {
        visuel = currentVisuelsSpectacle.visuels.find(v => v.id === fileId);
    }
    
    if (!visuel && currentTournee && currentTournee.visuels) {
        visuel = currentTournee.visuels.find(v => v.id === fileId);
    }
    
    if (!visuel) {
        showErrorModal('Erreur', 'Visuel introuvable.');
        return;
    }
    
    // Utiliser getFileDisplayUrl() pour obtenir l'URL (gère base64 et fichiers externes)
    const imageUrl = getFileDisplayUrl(visuel);
    
    if (!imageUrl) {
        showErrorModal('Erreur', 'Impossible d\'afficher ce visuel : données manquantes.');
        return;
    }
    
    // Créer une modale pour afficher l'image en plein écran
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = visuel.titre || 'Visuel';
    img.style.cssText = `
        max-width: 95%;
        max-height: 95%;
        object-fit: contain;
        border-radius: 10px;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        font-size: 2rem;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.3s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    
    const closeModal = () => {
        document.body.removeChild(modal);
    };
    
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    
    // Fermer avec Échap
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    modal.appendChild(img);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
}

// GESTION DES VISUELS DE TOURNÉE
function renderTourneeVisuelsGallery() {
    const gallery = document.getElementById('tourneeVisuelsGallery');
    const data = currentTournee;
    if (!data) return;
    const visuels = data.visuels || [];
    const folders = getFoldersForType(data, 'visuel');
    const rootVisuels = visuels.filter(v => !v.folderId);
    const hasContent = visuels.length > 0 || folders.length > 0;

    if (!hasContent) {
        gallery.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #636e72;">
                Aucun visuel. Cliquez sur "Ajouter des visuels" pour commencer.
            </div>
        `;
        return;
    }

    let html = '<div class="file-explorer">';
    folders.forEach(f => {
        const inFolder = visuels.filter(v => v.folderId === f.id);
        const expanded = isFolderExpanded(f.id, 'tournee', 'visuel');
        const toggleIcon = expanded ? '▼' : '▶';
        html += `<div class="folder-card folder-drop-zone" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleTourneeFolderDrop(event, '${f.id}', 'visuel')" data-folder-id="${f.id}">
            <div class="explorer-row folder-row" onclick="toggleFolderExpanded('${f.id}', 'tournee', 'visuel')">
                <span class="expand-icon">${toggleIcon}</span>
                <span class="file-icon">📁</span>
                <span class="item-name">${(f.name || '').replace(/</g,'&lt;')}</span>
                <span style="color:#999;font-size:0.85rem;">(${inFolder.length})</span>
                <span class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary btn-sm" onclick="renameTourneeVisuelsFolder('${f.id}')" title="Renommer">✏️</button>
                    <button class="btn btn-sm" onclick="deleteTourneeVisuelsFolder('${f.id}')" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                </span>
            </div>
            <div class="explorer-folder-content folder-content" style="display:${expanded ? 'block' : 'none'};">`;
        inFolder.forEach(visuel => {
            const idx = visuels.findIndex(v => v.id === visuel.id);
            const safeId = (visuel.id || '').replace(/'/g, "\\'");
            const thumbUrl = getFileDisplayUrl(visuel);
            html += `<div class="explorer-row file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'visuel', 'tournee')" ondragend="handleFileDragEnd(event)">
                <span class="file-icon" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:4px;background:#f0f0f0;">${thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='🖼️'">` : '🖼️'}</span>
                <span class="item-name" onclick="viewVisuelFullscreen('${safeId}')" title="${(visuel.titre||'Sans titre').replace(/"/g,'&quot;')}">${(visuel.titre||'Sans titre').replace(/</g,'&lt;')}</span>
                <span class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary btn-sm" onclick="downloadFile(currentTournee.visuels[${idx}], ${idx})" title="Télécharger">⬇️</button>
                    <button class="btn btn-sm" onclick="deleteTourneeVisuel(${idx})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                </span>
            </div>`;
        });
        html += '</div></div>';
    });
    rootVisuels.forEach(visuel => {
        const idx = visuels.findIndex(v => v.id === visuel.id);
        const safeId = (visuel.id || '').replace(/'/g, "\\'");
        const thumbUrl = getFileDisplayUrl(visuel);
        html += `<div class="explorer-row file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'visuel', 'tournee')" ondragend="handleFileDragEnd(event)">
            <span class="file-icon" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:4px;background:#f0f0f0;">${thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='🖼️'">` : '🖼️'}</span>
            <span class="item-name" onclick="viewVisuelFullscreen('${safeId}')" title="${(visuel.titre||'Sans titre').replace(/"/g,'&quot;')}">${(visuel.titre||'Sans titre').replace(/</g,'&lt;')}</span>
            <span class="item-actions" onclick="event.stopPropagation();">
                <button class="btn btn-secondary btn-sm" onclick="downloadFile(currentTournee.visuels[${idx}], ${idx})" title="Télécharger">⬇️</button>
                <button class="btn btn-sm" onclick="deleteTourneeVisuel(${idx})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
            </span>
        </div>`;
    });
    html += '</div>';
    html += '<div class="root-drop-zone explorer-drop" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleTourneeFolderDrop(event, null, \'visuel\')">Glissez les visuels ici (racine)</div>';
    gallery.innerHTML = '<div style="grid-column:1/-1;">' + html + '</div>';
}

function renameTourneeVisuelsFolder(folderId) {
    if (!currentTournee) return;
    const f = (currentTournee.visuelsFolders || []).find(x => x.id === folderId);
    if (!f) return;
    const name = prompt('Nom du dossier :', f.name);
    if (name !== null && name.trim()) {
        renameFolder(currentTournee, folderId, name.trim(), 'visuel');
        const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
        if (projectIndex !== -1) projects[projectIndex] = currentTournee;
        saveProjectsAsync();
        renderTourneeVisuelsGallery();
    }
}

function deleteTourneeVisuelsFolder(folderId) {
    if (!currentTournee || !confirm('Supprimer ce dossier ? Les visuels seront déplacés à la racine.')) return;
    deleteFolder(currentTournee, folderId, 'visuel');
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) projects[projectIndex] = currentTournee;
    saveProjectsAsync();
    renderTourneeVisuelsGallery();
}

async function uploadTourneeVisuels() {
    console.log('=== uploadTourneeVisuels appelée ===');
    
    const input = document.getElementById('tourneeVisuelInput');
    if (!input) {
        console.error('uploadTourneeVisuels: Input introuvable');
        showErrorModal('Erreur', 'Élément d\'upload introuvable.');
        return;
    }
    
    const files = Array.from(input.files);
    console.log('uploadTourneeVisuels: Fichiers sélectionnés:', files.length, files.map(f => f.name));
    
    if (files.length === 0) {
        console.warn('uploadTourneeVisuels: Aucun fichier sélectionné (utilisateur a peut-être annulé)');
        return;
    }

    if (!currentTournee) {
        console.error('uploadTourneeVisuels: currentTournee non défini');
        showErrorModal('Erreur', 'Tournée non définie. Veuillez réessayer.');
        return;
    }

    console.log('uploadTourneeVisuels: Tournée:', currentTournee.name, currentTournee.id);

    if (!currentTournee.visuels) {
        currentTournee.visuels = [];
    }
    
    // Afficher un indicateur de chargement
    const button = input.nextElementSibling;
    if (button) {
        button.setAttribute('data-original-text', button.textContent);
        button.disabled = true;
        button.textContent = '⏳ Upload en cours...';
    }

    for (let file of files) {
        try {
            // Utiliser la fonction uploadFile() qui gère automatiquement base64 (< 500KB) ou serveur (>= 500KB)
            const uploadedFile = await uploadFile(file, 'visuels');
            
            // Créer l'objet visuel avec les données retournées
            const visuelData = {
                id: uploadedFile.stored_externally ? 
                    uploadedFile.file_id : 
                    'visuel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                titre: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                fileName: uploadedFile.fileName,
                fileType: uploadedFile.fileType,
                fileSize: uploadedFile.fileSize,
                stored_externally: uploadedFile.stored_externally || false,
                folderId: null
            };
            
            // Ajouter base64 ou file_id/url selon le mode de stockage
            visuelData.file_id = uploadedFile.file_id;
            visuelData.url = uploadedFile.url;
            visuelData.downloadUrl = uploadedFile.downloadUrl;

            currentTournee.visuels.push(visuelData);
            console.log('uploadTourneeVisuels: Fichier ajouté avec succès:', file.name);
        } catch (error) {
            console.error('Erreur upload visuel tournée:', error);
            const errorMessage = error.message || error.toString();
            let userMessage = `Impossible d'uploader le fichier "${file.name}".`;
            
            if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
                userMessage += ' Problème de connexion réseau.';
            } else {
                userMessage += ' Erreur lors de la conversion du fichier.';
            }
            
            showErrorModal('Erreur lors de l\'upload', userMessage, errorMessage);
            // Ne pas arrêter la boucle, continuer avec les autres fichiers
        }
    }

    // Mettre à jour dans projects
    const tourneeIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (tourneeIndex !== -1) {
        projects[tourneeIndex] = currentTournee;
    }

    saveProjectsAsync();
    renderTourneeVisuelsGallery();
    updateTourneeVisuelsCount();
    
    if (currentTournee.catalogueId && typeof syncProjectToCatalogue === 'function') {
        syncProjectToCatalogue(currentTournee);
    }
    
    console.log('uploadTourneeVisuels: Upload terminé, visuels mis à jour');
    
    input.value = '';
    
    if (button) {
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text') || '📤 Ajouter des visuels';
        button.textContent = originalText;
    }
    
    console.log('uploadTourneeVisuels: === FIN ===');
}

// GESTION DES DOCUMENTS DE TOURNÉE
function tourneeDocExplorerRowHtml(doc, index, safeId) {
    const fileName = doc.fileName || doc.name || '';
    const ext = fileName.split('.').pop().toLowerCase();
    const icon = ['pdf'].includes(ext) ? '📄' : ['doc','docx'].includes(ext) ? '📝' : ['xls','xlsx'].includes(ext) ? '📊' : '📎';
    const displayTitle = (doc.titre || doc.name || 'Document sans titre').replace(/</g,'&lt;');
    return `<div class="explorer-row file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'document', 'tournee')" ondragend="handleFileDragEnd(event)">
        <span class="file-icon">${icon}</span>
        <span class="item-name" onclick="viewDocument(currentTournee.documents[${index}], ${index})" title="${displayTitle}">${displayTitle}</span>
        <span class="item-actions" onclick="event.stopPropagation();">
            <button class="btn btn-secondary btn-sm" onclick="renameTourneeDocument(${index})" title="Renommer">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="viewDocument(currentTournee.documents[${index}], ${index})" title="Voir">👁️</button>
            <button class="btn btn-secondary btn-sm" onclick="downloadFile(currentTournee.documents[${index}], ${index})" title="Télécharger">⬇️</button>
            <button class="btn btn-sm" onclick="deleteTourneeDocument(${index})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
        </span>
    </div>`;
}

function renderTourneeDocuments() {
    const container = document.getElementById('tourneeDocumentsList');
    const data = currentTournee;
    if (!data) return;
    const docs = data.documents || [];
    const folders = getFoldersForType(data, 'document');
    const rootDocs = docs.filter(d => !d.folderId);
    const hasContent = docs.length > 0 || folders.length > 0;

    if (!hasContent) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #636e72;">
                Aucun document. Cliquez sur "Ajouter des documents" pour commencer.
            </div>
        `;
        return;
    }

    let html = '<div class="file-explorer">';
    folders.forEach(f => {
        const inFolder = docs.filter(d => d.folderId === f.id);
        const expanded = isFolderExpanded(f.id, 'tournee', 'document');
        const toggleIcon = expanded ? '▼' : '▶';
        html += `<div class="folder-card folder-drop-zone" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleTourneeFolderDrop(event, '${f.id}', 'document')" data-folder-id="${f.id}">
            <div class="explorer-row folder-row" onclick="toggleFolderExpanded('${f.id}', 'tournee', 'document')">
                <span class="expand-icon">${toggleIcon}</span>
                <span class="file-icon">📁</span>
                <span class="item-name">${(f.name || '').replace(/</g,'&lt;')}</span>
                <span style="color:#999;font-size:0.85rem;">(${inFolder.length})</span>
                <span class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary btn-sm" onclick="renameTourneeDocumentsFolder('${f.id}')" title="Renommer">✏️</button>
                    <button class="btn btn-sm" onclick="deleteTourneeDocumentsFolder('${f.id}')" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                </span>
            </div>
            <div class="explorer-folder-content folder-content" style="display:${expanded ? 'block' : 'none'};">`;
        inFolder.forEach(doc => {
            const idx = docs.findIndex(d => d.id === doc.id);
            const safeId = (doc.id || '').replace(/'/g, "\\'");
            html += tourneeDocExplorerRowHtml(doc, idx, safeId);
        });
        html += '</div></div>';
    });
    rootDocs.forEach(doc => {
        const idx = docs.findIndex(d => d.id === doc.id);
        const safeId = (doc.id || '').replace(/'/g, "\\'");
        html += tourneeDocExplorerRowHtml(doc, idx, safeId);
    });
    html += '</div>';
    html += '<div class="root-drop-zone explorer-drop" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleTourneeFolderDrop(event, null, \'document\')">Glissez les documents ici (racine)</div>';
    container.innerHTML = html;
}

function renameTourneeDocumentsFolder(folderId) {
    if (!currentTournee) return;
    const f = (currentTournee.documentsFolders || []).find(x => x.id === folderId);
    if (!f) return;
    const name = prompt('Nom du dossier :', f.name);
    if (name !== null && name.trim()) {
        renameFolder(currentTournee, folderId, name.trim(), 'document');
        const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
        if (projectIndex !== -1) projects[projectIndex] = currentTournee;
        saveProjectsAsync();
        renderTourneeDocuments();
    }
}

function deleteTourneeDocumentsFolder(folderId) {
    if (!currentTournee || !confirm('Supprimer ce dossier ? Les documents seront déplacés à la racine.')) return;
    deleteFolder(currentTournee, folderId, 'document');
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) projects[projectIndex] = currentTournee;
    saveProjectsAsync();
    renderTourneeDocuments();
}

function renameTourneeDocument(index) {
    if (!currentTournee || !currentTournee.documents[index]) return;
    
    const doc = currentTournee.documents[index];
    const currentTitle = doc.titre || doc.name || 'Document sans titre';
    const newTitle = prompt('Renommer le document :', currentTitle);
    
    if (newTitle !== null && newTitle.trim() !== '') {
        doc.titre = newTitle.trim();
        
        const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
        if (projectIndex !== -1) {
            projects[projectIndex] = currentTournee;
        }
        
        saveProjectsAsync();
        renderTourneeDocuments();
    }
}

function updateTourneeVisuelTitre(index, newTitre) {
    if (!currentTournee || !currentTournee.visuels) return;
    
    currentTournee.visuels[index].titre = newTitre;
    
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentTournee;
    }
    
    saveProjectsAsync();
}

function setTourneeVisuelReference(index, isReference) {
    if (!currentTournee || !currentTournee.visuels) return;
    
    // Désactiver tous les autres visuels de référence
    currentTournee.visuels.forEach((v, i) => {
        v.isReference = (i === index && isReference);
    });
    
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentTournee;
    }
    
    saveProjectsAsync();
    renderTourneeVisuelsGallery();
    updateTourneeVisuelsCount();
}

function deleteTourneeVisuel(index) {
    if (!currentTournee || !confirm('Supprimer ce visuel ?')) return;

    currentTournee.visuels.splice(index, 1);
    
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentTournee;
    }
    
    saveProjectsAsync();
    renderTourneeVisuelsGallery();
    updateTourneeVisuelsCount();
}

function createTourneeVisuelsFolder() {
    if (!currentTournee) return;
    const name = prompt('Nom du dossier :', 'Nouveau dossier');
    if (!name || !name.trim()) return;
    createFolder(currentTournee, name.trim(), 'visuel');
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) projects[projectIndex] = currentTournee;
    saveProjectsAsync();
    renderTourneeVisuelsGallery();
}

function createTourneeDocumentsFolder() {
    if (!currentTournee) return;
    const name = prompt('Nom du dossier :', 'Nouveau dossier');
    if (!name || !name.trim()) return;
    createFolder(currentTournee, name.trim(), 'document');
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) projects[projectIndex] = currentTournee;
    saveProjectsAsync();
    renderTourneeDocuments();
}

function openTourneeVisuelsPage() {
    // Vérifier la permission avant d'ouvrir
    if (window.hasPermission && !window.hasPermission('visuels')) {
        alert('Vous n\'avez pas la permission d\'accéder à cette section.');
        return;
    }
    
    if (!currentTournee) return;
    ensureFoldersAndFolderIds(currentTournee);
    
    document.getElementById('tourneeVisuelsTitle').textContent = currentTournee.name;
    renderTourneeVisuelsGallery();
    updateTourneeVisuelsCount();
    document.getElementById('tourneeVisuelsPage').classList.add('active');
}

function closeTourneeVisuelsPage() {
    document.getElementById('tourneeVisuelsPage').classList.remove('active');
    if (currentTournee) {
        viewTournee(currentTournee.id);
    }
}

function updateTourneeVisuelsCount() {
    const count = currentTournee?.visuels?.length || 0;
    document.getElementById('tourneeVisuelsCount').textContent = count;
}

// renderTourneeDocuments est définie plus haut (avec miniature et renommage)

async function uploadTourneeDocuments() {
    console.log('=== uploadTourneeDocuments appelée ===');
    
    const input = document.getElementById('tourneeDocumentInput');
    if (!input) {
        console.error('uploadTourneeDocuments: Input introuvable');
        showErrorModal('Erreur', 'Élément d\'upload introuvable.');
        return;
    }
    
    const files = Array.from(input.files);
    console.log('uploadTourneeDocuments: Fichiers sélectionnés:', files.length, files.map(f => f.name));
    
    if (files.length === 0) {
        console.warn('uploadTourneeDocuments: Aucun fichier sélectionné (utilisateur a peut-être annulé)');
        return;
    }

    if (!currentTournee) {
        console.error('uploadTourneeDocuments: currentTournee non défini');
        showErrorModal('Erreur', 'Tournée non définie. Veuillez réessayer.');
        return;
    }
    
    console.log('uploadTourneeDocuments: Tournée:', currentTournee.name, currentTournee.id);

    if (!currentTournee.documents) {
        currentTournee.documents = [];
    }
    
    // Afficher un indicateur de chargement
    const button = input.nextElementSibling;
    if (button) {
        button.setAttribute('data-original-text', button.textContent);
        button.disabled = true;
        button.textContent = '⏳ Upload en cours...';
    }

    for (let file of files) {
        try {
            // Utiliser la fonction uploadFile() qui gère automatiquement base64 (< 500KB) ou serveur (>= 500KB)
            const uploadedFile = await uploadFile(file, 'documents');
            
            // Créer l'objet document avec les données retournées
            const documentData = {
                id: uploadedFile.stored_externally ? 
                    uploadedFile.file_id : 
                    'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: uploadedFile.name,
                titre: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                type: uploadedFile.fileType,
                fileName: uploadedFile.fileName,
                fileSize: uploadedFile.fileSize,
                stored_externally: uploadedFile.stored_externally || false,
                folderId: null
            };
            
            // Ajouter base64 ou file_id/url selon le mode de stockage
            documentData.file_id = uploadedFile.file_id;
            documentData.url = uploadedFile.url;
            documentData.downloadUrl = uploadedFile.downloadUrl;

            currentTournee.documents.push(documentData);
            console.log('uploadTourneeDocuments: Fichier ajouté avec succès:', file.name);
        } catch (error) {
            console.error('Erreur upload document tournée:', error);
            const errorMessage = error.message || error.toString();
            let userMessage = `Impossible d'uploader le fichier "${file.name}".`;
            
            if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
                userMessage += ' Problème de connexion réseau.';
            } else {
                userMessage += ' Erreur lors de la conversion du fichier.';
            }
            
            showErrorModal('Erreur lors de l\'upload', userMessage, errorMessage);
            // Ne pas arrêter la boucle, continuer avec les autres fichiers
        }
    }

    // Mettre à jour dans projects
    const tourneeIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (tourneeIndex !== -1) {
        projects[tourneeIndex] = currentTournee;
        console.log('uploadTourneeDocuments: Tournée mise à jour dans le tableau projects, index:', tourneeIndex);
        console.log('uploadTourneeDocuments: Nombre de documents dans la tournée:', projects[tourneeIndex].documents?.length || 0);
    } else {
        console.error('uploadTourneeDocuments: Tournée non trouvée dans le tableau projects!', currentTournee.id);
        showErrorModal('Erreur', 'Tournée non trouvée. Les documents ne seront pas sauvegardés.');
        return;
    }

    // Sauvegarder de manière synchrone pour s'assurer que ça fonctionne
    try {
        console.log('uploadTourneeDocuments: Début de la sauvegarde...');
        await saveProjects();
        console.log('uploadTourneeDocuments: Sauvegarde réussie');
    } catch (error) {
        console.error('uploadTourneeDocuments: Erreur lors de la sauvegarde:', error);
        const errorMessage = error.message || error.toString();
        
        // Si l'erreur concerne la taille, donner des conseils
        if (errorMessage.includes('trop volumineuses')) {
            showErrorModal(
                'Données trop volumineuses',
                'Les documents ont été uploadés sur le serveur, mais la sauvegarde de la tournée a échoué car les données sont trop volumineuses. Supprimez des fichiers volumineux ou contactez l\'administrateur.',
                errorMessage
            );
        } else {
            showErrorModal(
                'Erreur de sauvegarde',
                'Les documents ont été ajoutés localement mais la sauvegarde a échoué. Veuillez réessayer.',
                errorMessage
            );
        }
    }
    
    renderTourneeDocuments();
    updateTourneeDocumentsCount();
    
    if (currentTournee.catalogueId && typeof syncProjectToCatalogue === 'function') {
        syncProjectToCatalogue(currentTournee);
    }
    
    console.log('uploadTourneeDocuments: Upload terminé, documents mis à jour');
    
    input.value = '';
    
    if (button) {
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text') || '📤 Ajouter des documents';
        button.textContent = originalText;
    }
    
    console.log('uploadTourneeDocuments: === FIN ===');
}

function deleteTourneeDocument(index) {
    if (!currentTournee || !confirm('Supprimer ce document ?')) return;

    currentTournee.documents.splice(index, 1);
    
    const projectIndex = projects.findIndex(p => p.id === currentTournee.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentTournee;
    }
    
    saveProjectsAsync();
    renderTourneeDocuments();
    updateTourneeDocumentsCount();
}

function openTourneeDocumentsPage() {
    if (!currentTournee) return;
    ensureFoldersAndFolderIds(currentTournee);
    
    document.getElementById('tourneeDocumentsTitle').textContent = currentTournee.name;
    
    // Attacher l'événement onchange à l'input file (important pour que l'upload fonctionne)
    const tourneeDocumentInput = document.getElementById('tourneeDocumentInput');
    if (tourneeDocumentInput) {
        // Retirer les anciens listeners pour éviter les doublons
        tourneeDocumentInput.removeEventListener('change', uploadTourneeDocuments);
        // Ajouter le nouveau listener
        tourneeDocumentInput.addEventListener('change', uploadTourneeDocuments);
        console.log('openTourneeDocumentsPage: Événement change attaché à tourneeDocumentInput');
    } else {
        console.error('openTourneeDocumentsPage: tourneeDocumentInput introuvable');
    }
    
    renderTourneeDocuments();
    updateTourneeDocumentsCount();
    document.getElementById('tourneeDocumentsPage').classList.add('active');
}

function closeTourneeDocumentsPage() {
    document.getElementById('tourneeDocumentsPage').classList.remove('active');
    if (currentTournee) {
        viewTournee(currentTournee.id);
    }
}

function updateTourneeDocumentsCount() {
    const count = currentTournee?.documents?.length || 0;
    document.getElementById('tourneeDocumentsCount').textContent = count;
}

// GESTION DES DOCUMENTS DE LIEU
function renderLieuDocuments() {
    const container = document.getElementById('lieuDocumentsList');
    if (!container) return;
    
    const lieu = currentEditingLieu !== null ? appSettings.lieux[currentEditingLieu] : null;
    
    if (!lieu || !lieu.documents || lieu.documents.length === 0) {
        container.innerHTML = '<div style="color: #636e72; padding: 1rem; text-align: center;">Aucun document</div>';
        return;
    }

    container.innerHTML = lieu.documents.map((doc, index) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: var(--light); border-radius: 8px; margin-bottom: 0.5rem;">
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.9rem;">${doc.titre || doc.name || 'Document sans titre'}</div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary" onclick="downloadFile(${JSON.stringify(doc)}, ${index})" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">⬇️</button>
                <button class="btn" onclick="deleteLieuDocument(${index})" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function uploadLieuDocuments() {
    console.log('=== uploadLieuDocuments appelée ===');
    
    const input = document.getElementById('lieuDocumentInput');
    if (!input) {
        console.error('uploadLieuDocuments: Input introuvable');
        showErrorModal('Erreur', 'Élément d\'upload introuvable.');
        return;
    }
    
    const files = Array.from(input.files);
    console.log('uploadLieuDocuments: Fichiers sélectionnés:', files.length, files.map(f => f.name));
    
    if (files.length === 0) {
        console.warn('uploadLieuDocuments: Aucun fichier sélectionné (utilisateur a peut-être annulé)');
        return;
    }

    if (currentEditingLieu === null) {
        showErrorModal('Erreur', 'Veuillez d\'abord remplir les informations du lieu.');
        return;
    }

    const lieu = appSettings.lieux[currentEditingLieu];
    if (!lieu.documents) {
        lieu.documents = [];
    }

    // Afficher un indicateur de chargement
    const button = input.nextElementSibling;
    if (button) {
        button.setAttribute('data-original-text', button.textContent);
        button.disabled = true;
        button.textContent = '⏳ Upload en cours...';
    }

    for (let file of files) {
        try {
            // Utiliser la fonction uploadFile() qui gère automatiquement base64 (< 500KB) ou serveur (>= 500KB)
            const uploadedFile = await uploadFile(file, 'documents');
            
            // Créer l'objet document avec les données retournées
            const documentData = {
                id: uploadedFile.stored_externally ? 
                    uploadedFile.file_id : 
                    'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: uploadedFile.name,
                titre: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                type: uploadedFile.fileType,
                fileName: uploadedFile.fileName,
                fileSize: uploadedFile.fileSize,
                stored_externally: uploadedFile.stored_externally || false
            };
            
            // Ajouter base64 ou file_id/url selon le mode de stockage
            documentData.file_id = uploadedFile.file_id;
            documentData.url = uploadedFile.url;
            documentData.downloadUrl = uploadedFile.downloadUrl;

            lieu.documents.push(documentData);
            console.log('uploadLieuDocuments: Fichier ajouté avec succès:', file.name);
        } catch (error) {
            console.error('Erreur upload document lieu:', error);
            const errorMessage = error.message || error.toString();
            let userMessage = `Impossible d'uploader le fichier "${file.name}".`;
            
            if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
                userMessage += ' Problème de connexion réseau.';
            } else {
                userMessage += ' Erreur lors de la conversion du fichier.';
            }
            
            showErrorModal('Erreur lors de l\'upload', userMessage, errorMessage);
            // Ne pas arrêter la boucle, continuer avec les autres fichiers
        }
    }
    
    appSettings.lieux[currentEditingLieu] = lieu;
    saveSettings();
    renderLieuDocuments();
    
    // Réinitialiser l'input
    input.value = '';
    
    // Restaurer le bouton
    if (button) {
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text') || '📤 Ajouter des documents';
        button.textContent = originalText;
    }
    
    console.log('uploadLieuDocuments: === FIN ===');

    appSettings.lieux[currentEditingLieu] = lieu;
    saveSettings();
    renderLieuDocuments();
    
    input.value = ''; // Réinitialiser l'input
}

function deleteLieuDocument(index) {
    if (currentEditingLieu === null || !confirm('Supprimer ce document ?')) return;

    const lieu = appSettings.lieux[currentEditingLieu];
    if (lieu.documents) {
        lieu.documents.splice(index, 1);
        appSettings.lieux[currentEditingLieu] = lieu;
        saveSettings();
        renderLieuDocuments();
    }
}

// MODAL INFORMATIONS LIEU
function openLieuInfoModal(spectacleId) {
    const spectacle = projects.find(p => p.id === spectacleId);
    if (!spectacle || !spectacle.location) {
        alert('Aucun lieu défini pour ce spectacle');
        return;
    }

    // Chercher le lieu dans la base de données
    // D'abord par ID si le spectacle stocke l'ID du lieu
    let lieu = null;
    if (spectacle.lieuId && appSettings.lieux) {
        lieu = appSettings.lieux.find(l => l.id === spectacle.lieuId);
    }
    
    // Sinon chercher par nom (correspondance exacte ou partielle)
    if (!lieu && appSettings.lieux) {
        const locationLower = spectacle.location.toLowerCase();
        lieu = appSettings.lieux.find(l => {
            const nomLower = (l.nom || '').toLowerCase();
            return nomLower === locationLower || 
                   locationLower.includes(nomLower) || 
                   nomLower.includes(locationLower);
        });
    }

    if (!lieu) {
        alert('Lieu "' + spectacle.location + '" non trouvé dans la base de données. Vous pouvez le créer depuis la section Administration > Base de données Lieux.');
        return;
    }

    document.getElementById('lieuInfoModalTitle').textContent = `📍 ${lieu.nom}`;
    
    let contactsHtml = '';
    if (lieu.contacts && lieu.contacts.length > 0) {
        contactsHtml = `
            <div style="margin-top: 1.5rem;">
                <h4 style="margin-bottom: 1rem;">📞 Contacts</h4>
                ${lieu.contacts.map(c => `
                    <div style="padding: 0.75rem; background: var(--light); border-radius: 8px; margin-bottom: 0.5rem;">
                        <div style="font-weight: 600;">${c.nom}${c.role ? ' - ' + c.role : ''}</div>
                        ${c.telephone ? `<div style="font-size: 0.9rem; color: #636e72;">📞 ${c.telephone}</div>` : ''}
                        ${c.email ? `<div style="font-size: 0.9rem; color: #636e72;">✉️ ${c.email}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    let documentsHtml = '';
    if (lieu.documents && lieu.documents.length > 0) {
        documentsHtml = `
            <div style="margin-top: 1.5rem;">
                <h4 style="margin-bottom: 1rem;">📄 Documents</h4>
                ${lieu.documents.map((doc, docIndex) => `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: var(--light); border-radius: 8px; margin-bottom: 0.5rem;">
                        <div>
                            <div style="font-weight: 600;">${doc.titre || doc.name || 'Document sans titre'}</div>
                        </div>
                        <button class="btn btn-secondary" onclick="downloadFile(${JSON.stringify(doc)}, ${docIndex})" style="padding: 0.5rem 1rem;">⬇️ Télécharger</button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    document.getElementById('lieuInfoContent').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
                <div style="font-weight: 600; color: #636e72; font-size: 0.9rem; margin-bottom: 0.25rem;">Adresse</div>
                <div>${lieu.adresse || 'Non renseigné'}</div>
            </div>
            <div>
                <div style="font-weight: 600; color: #636e72; font-size: 0.9rem; margin-bottom: 0.25rem;">Ville</div>
                <div>${lieu.ville || 'Non renseigné'}</div>
            </div>
            <div>
                <div style="font-weight: 600; color: #636e72; font-size: 0.9rem; margin-bottom: 0.25rem;">Code postal</div>
                <div>${lieu.codePostal || 'Non renseigné'}</div>
            </div>
            <div>
                <div style="font-weight: 600; color: #636e72; font-size: 0.9rem; margin-bottom: 0.25rem;">Pays</div>
                <div>${lieu.pays || 'Non renseigné'}</div>
            </div>
            <div>
                <div style="font-weight: 600; color: #636e72; font-size: 0.9rem; margin-bottom: 0.25rem;">Capacité</div>
                <div>${lieu.capacite ? lieu.capacite.toLocaleString() + ' places' : 'Non renseigné'}</div>
            </div>
            <div>
                <div style="font-weight: 600; color: #636e72; font-size: 0.9rem; margin-bottom: 0.25rem;">Type</div>
                <div>${lieu.type || 'Non renseigné'}</div>
            </div>
        </div>
        ${lieu.notes ? `
            <div style="margin-top: 1.5rem;">
                <h4 style="margin-bottom: 1rem;">📝 Notes</h4>
                <div style="padding: 1rem; background: var(--light); border-radius: 8px; white-space: pre-wrap;">${lieu.notes}</div>
            </div>
        ` : ''}
        ${contactsHtml}
        ${documentsHtml}
    `;

    // Stocker l'ID du lieu et du spectacle pour le bouton Changer
    window.currentLieuInfoId = lieu.id;
    window.currentLieuInfoSpectacleId = spectacle.id;
    
    // Afficher le bouton Changer de lieu
    const changeBtn = document.getElementById('changeLieuBtn');
    if (changeBtn) {
        changeBtn.style.display = 'inline-block';
    }

    document.getElementById('lieuInfoModal').classList.add('active');
}

// Ouvrir la modale pour changer de lieu
function openChangeLieuModal() {
    document.getElementById('changeLieuSearch').value = '';
    populateChangeLieuSelect();
    document.getElementById('changeLieuPreview').style.display = 'none';
    document.getElementById('changeLieuModal').classList.add('active');
    document.getElementById('changeLieuSearch').focus();
}

// Remplir le sélecteur de lieux
function populateChangeLieuSelect(filter = '') {
    const select = document.getElementById('changeLieuSelect');
    select.innerHTML = '';
    
    const lieux = appSettings.lieux || [];
    const filterLower = filter.toLowerCase().trim();
    
    const lieuxTries = [...lieux]
        .filter(lieu => {
            if (!filterLower) return true;
            const nom = (lieu.nom || '').toLowerCase();
            const ville = (lieu.ville || '').toLowerCase();
            return nom.includes(filterLower) || ville.includes(filterLower);
        })
        .sort((a, b) => {
            const villeCompare = (a.ville || '').localeCompare(b.ville || '');
            if (villeCompare !== 0) return villeCompare;
            return (a.nom || '').localeCompare(b.nom || '');
        });
    
    if (lieuxTries.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Aucun lieu trouvé';
        option.disabled = true;
        select.appendChild(option);
        return;
    }
    
    lieuxTries.forEach(lieu => {
        const option = document.createElement('option');
        option.value = lieu.id;
        option.textContent = `${lieu.nom} - ${lieu.ville}`;
        if (lieu.id === window.currentLieuInfoId) {
            option.style.fontWeight = 'bold';
            option.textContent += ' (actuel)';
        }
        select.appendChild(option);
    });
    
    // Sélectionner le premier élément si filtré
    if (filterLower && lieuxTries.length > 0) {
        select.value = lieuxTries[0].id;
        updateChangeLieuPreview();
    }
}

// Filtrer les options du sélecteur
function filterChangeLieuOptions() {
    const filter = document.getElementById('changeLieuSearch').value;
    populateChangeLieuSelect(filter);
}

function updateChangeLieuPreview() {
    const lieuId = document.getElementById('changeLieuSelect').value;
    const preview = document.getElementById('changeLieuPreview');
    
    if (!lieuId) {
        preview.style.display = 'none';
        return;
    }
    
    const lieu = appSettings.lieux?.find(l => l.id === lieuId);
    if (lieu) {
        document.getElementById('changeLieuPreviewNom').textContent = `📍 ${lieu.nom}`;
        let adresse = lieu.ville || '';
        if (lieu.adresse) adresse = lieu.adresse + ', ' + adresse;
        if (lieu.capacite) adresse += ` (${lieu.capacite} places)`;
        document.getElementById('changeLieuPreviewAdresse').textContent = adresse;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

function closeChangeLieuModal() {
    document.getElementById('changeLieuModal').classList.remove('active');
}

function confirmChangeLieu() {
    const newLieuId = document.getElementById('changeLieuSelect').value;
    if (!newLieuId) {
        alert('Veuillez sélectionner un lieu');
        return;
    }
    
    const spectacle = projects.find(p => p.id === window.currentLieuInfoSpectacleId);
    if (!spectacle) {
        alert('Spectacle non trouvé');
        return;
    }
    
    const newLieu = appSettings.lieux?.find(l => l.id === newLieuId);
    if (!newLieu) {
        alert('Lieu non trouvé');
        return;
    }
    
    // Mettre à jour le spectacle
    spectacle.lieuId = newLieuId;
    spectacle.city = newLieu.ville;
    spectacle.location = newLieu.nom;
    
    // Synchroniser vers la page technique
    if (!spectacle.tech || Array.isArray(spectacle.tech)) spectacle.tech = {};
    spectacle.tech.lieuId = newLieuId;
    
    // Mettre à jour le nom si c'est un spectacle de tournée
    if (spectacle.parentId) {
        const tournee = projects.find(p => p.id === spectacle.parentId);
        if (tournee) {
            spectacle.name = `${tournee.name} - ${newLieu.ville}`;
        }
    }
    
    spectacle.updatedAt = new Date().toISOString();
    
    // Sauvegarder
    saveProjectsAsync();
    
    // Fermer les modales
    closeChangeLieuModal();
    closeLieuInfoModal();
    
    // Rafraîchir l'affichage
    if (window.currentTechSpectacle && window.currentTechSpectacle.id === spectacle.id) {
        renderTechLieu();
    }
    if (window.currentSpectacleDetail && window.currentSpectacleDetail.id === spectacle.id) {
        viewSpectacleDetail(spectacle.id);
    }
    if (currentTournee) {
        renderSpectaclesList();
    }
    
    showToast('Lieu modifié avec succès', 'success');
}

function closeLieuInfoModal() {
    const modal = document.getElementById('lieuInfoModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.zIndex = '';
    }
}

// PAGE BILLETTERIE
let currentBilletterieSpectacle = null;
let billetterieChart = null;

/** Aligne le contexte billetterie sur un projet (ex. accès Invitations sans ouvrir la page Billetterie). */
function syncBilletterieSpectacleFromProject(projectOrId) {
    if (!projectOrId) return false;
    const p = typeof projectOrId === 'object' && projectOrId !== null && projectOrId.id
        ? projectOrId
        : projects.find(pr => pr.id === projectOrId);
    if (!p) return false;
    currentBilletterieSpectacle = p;
    if (!currentBilletterieSpectacle.reseaux) currentBilletterieSpectacle.reseaux = [];
    if (!currentBilletterieSpectacle.releves) currentBilletterieSpectacle.releves = [];
    if (!currentBilletterieSpectacle.billetCategories) currentBilletterieSpectacle.billetCategories = [];
    return true;
}

function clearBilletterieSpectacleContext() {
    currentBilletterieSpectacle = null;
}

async function openBilletteriePage(spectacleId) {
    // Vérifier la permission avant d'ouvrir
    if (window.hasPermission && !window.hasPermission('billetterie')) {
        alert('Vous n\'avez pas la permission d\'accéder à cette section.');
        return;
    }
    currentBilletterieSpectacle = projects.find(p => p.id === spectacleId);
    if (!currentBilletterieSpectacle) return;

    if (!currentBilletterieSpectacle.reseaux) {
        currentBilletterieSpectacle.reseaux = [];
    }
    syncReseauxFromReleves(currentBilletterieSpectacle);
    if (!currentBilletterieSpectacle.releves) {
        currentBilletterieSpectacle.releves = [];
    }
    if (!currentBilletterieSpectacle.billetCategories) {
        currentBilletterieSpectacle.billetCategories = [];
    }

    document.getElementById('billetterieSpectacleName').textContent = currentBilletterieSpectacle.name;
    
    // Afficher le visuel de référence si disponible
    const visuelRef = getVisuelReference(currentBilletterieSpectacle);
    const visuelImg = document.getElementById('billetterieVisuelRef');
    if (visuelRef) {
        visuelImg.src = visuelRef.base64 || visuelRef.url;
        visuelImg.style.display = 'block';
    } else {
        visuelImg.style.display = 'none';
    }
    
    await renderBilletterie();
    renderCategoryTasks(spectacleId, 'Billetterie', 'billetterieTasksList');
    document.getElementById('billetteriePage').classList.add('active');
    document.getElementById('billetteriePage').classList.add('page-enter');
    setTimeout(() => { const blp = document.getElementById('billetteriePage'); if (blp) blp.classList.remove('page-enter'); }, 700);
    updateFabAppearance();
}

function closeBilletteriePage() {
    document.getElementById('billetteriePage').classList.remove('active');
    if (billetterieChart) {
        billetterieChart.destroy();
        billetterieChart = null;
    }
    if (currentBilletterieSpectacle) {
        viewSpectacle(currentBilletterieSpectacle.id);
    }
    currentBilletterieSpectacle = null;
    updateFabAppearance();
}

/** Après un import de ventes : resynchronise currentBilletterieSpectacle avec projects et rafraîchit l’affichage si la page billetterie est ouverte. */
function refreshBilletterieIfOpen() {
    var billetteriePage = document.getElementById('billetteriePage');
    if (!billetteriePage || !billetteriePage.classList.contains('active')) return;
    if (!currentBilletterieSpectacle || !currentBilletterieSpectacle.id) return;
    var fresh = projects.find(function (p) { return p.id === currentBilletterieSpectacle.id; });
    if (!fresh) return;
    currentBilletterieSpectacle = fresh;
    if (typeof renderBilletterie === 'function') renderBilletterie();
}

/** Génère un PDF : état des ventes à ce jour uniquement, sans aucune donnée financière. */
function printBilletterieEtatVentes() {
    if (!currentBilletterieSpectacle) return;
    function doPdf() {
        var JsPDF = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : (window.jsPDF || null);
        if (!JsPDF) {
            alert('Génération PDF indisponible. Chargez la bibliothèque jsPDF.');
            return;
        }
        var s = currentBilletterieSpectacle;
        var total = getTotalBillets(s);
        var capacite = s.capacite || 0;
        var taux = capacite > 0 ? Math.round((total / capacite) * 100) : 0;
        var dateDoc = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        var nomSpectacle = (s.name || s.nom || 'Spectacle').replace(/[<>]/g, '');

        var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        var margin = 20;
        var y = margin;
        var lineH = 8;

        doc.setFontSize(16);
        doc.text('État des ventes à ce jour', margin, y);
        y += lineH + 6;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Spectacle : ' + nomSpectacle, margin, y);
        y += lineH;
        doc.text('Date : ' + dateDoc, margin, y);
        y += lineH + 6;

        doc.setFontSize(11);
        doc.text('Total billets vendus', margin, y);
        doc.text(String(total), margin + 120, y);
        y += lineH;
        doc.text('Capacité', margin, y);
        doc.text(String(capacite), margin + 120, y);
        y += lineH;
        doc.text('Taux de remplissage', margin, y);
        doc.text(String(taux) + ' %', margin + 120, y);
        y += lineH + 8;

        var reseaux = s.reseaux || [];
        var lastReleve = (s.releves && s.releves.length > 0) ? s.releves[s.releves.length - 1] : null;
        if (reseaux.length > 0) {
            doc.setFontSize(11);
            doc.text('Détail par réseau de vente', margin, y);
            y += lineH + 2;
            doc.setFontSize(10);
            reseaux.forEach(function (reseau) {
                var billets = lastReleve ? (parseInt(lastReleve[reseau], 10) || 0) : 0;
                doc.text(reseau, margin, y);
                doc.text(String(billets), margin + 120, y);
                y += lineH;
            });
        }

        var filename = 'etat-ventes-' + (nomSpectacle.replace(/\s+/g, '-').substring(0, 30)) + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
        doc.save(filename);
    }
    if (window.jspdf && window.jspdf.jsPDF) {
        doPdf();
        return;
    }
    if (window.jsPDF) {
        doPdf();
        return;
    }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = function () { doPdf(); };
    script.onerror = function () { alert('Impossible de charger la bibliothèque PDF.'); };
    document.head.appendChild(script);
}
if (typeof window !== 'undefined') window.printBilletterieEtatVentes = printBilletterieEtatVentes;

/** Charge le logo (URL ou data URL) en PNG data URL pour jsPDF. */
function _loadLogoDataUrlForPdf(url) {
    return new Promise(function (resolve) {
        if (!url) {
            resolve(null);
            return;
        }
        if (String(url).indexOf('data:') === 0) {
            resolve(url);
            return;
        }
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            try {
                var c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                var ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = function () {
            resolve(null);
        };
        img.src = url;
    });
}

function _ensureJsPDF(callback) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : (window.jsPDF || null);
    if (JsPDF) {
        callback(JsPDF);
        return;
    }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = function () {
        var J = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : window.jsPDF;
        if (J) callback(J);
        else alert('Génération PDF indisponible.');
    };
    script.onerror = function () {
        alert('Impossible de charger la bibliothèque PDF.');
    };
    document.head.appendChild(script);
}

function _budgetPdfTxt(id) {
    var el = document.getElementById(id);
    return el ? String(el.textContent || '').trim() : '—';
}

function _budgetPdfAddImageDataUrl(doc, dataUrl, x, y, w, h) {
    if (!dataUrl) return;
    var fmt = 'PNG';
    if (dataUrl.indexOf('image/jpeg') !== -1 || dataUrl.indexOf('image/jpg') !== -1) fmt = 'JPEG';
    else if (dataUrl.indexOf('image/png') !== -1) fmt = 'PNG';
    try {
        doc.addImage(dataUrl, fmt, x, y, w, h);
    } catch (e) {
        try {
            doc.addImage(dataUrl, 'PNG', x, y, w, h);
        } catch (e2) {
            /* ignore */
        }
    }
}

/** Formate la date du spectacle pour le PDF (champ date type YYYY-MM-DD). */
function _formatSpectacleDateForPdf(s) {
    if (!s || !s.date) return '';
    try {
        var raw = String(s.date).trim();
        var d = new Date(raw.indexOf('T') === -1 ? raw + 'T12:00:00' : raw);
        if (isNaN(d.getTime())) return raw;
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
        return s.date || '';
    }
}

/** Texte CA max pour PDF : montant + (détail places × prix par catégorie billetterie). */
function _formatCamaxPdfValue(s) {
    if (!s) return '—';
    var caMax = getCAMaximum(s);
    var main = caMax.toFixed(2) + ' €';
    var cats = s.billetCategories || [];
    var parts = [];
    cats.forEach(function (cat) {
        var n = parseInt(cat.nombreDisponible, 10) || 0;
        var p = parseFloat(cat.prix) || 0;
        if (n <= 0) return;
        var nom = (cat.nom || cat.libelle || '').trim();
        var piece = n + ' pl. × ' + p.toFixed(2) + ' €';
        if (nom) piece = nom + ' : ' + piece;
        parts.push(piece);
    });
    if (parts.length === 0) return main;
    return main + ' (' + parts.join(' · ') + ')';
}

function openBudgetPdfChoiceModal() {
    if (!currentBudgetSpectacle) return;
    var m = document.getElementById('budgetPdfChoiceModal');
    if (m) m.classList.add('active');
}

function closeBudgetPdfChoiceModal() {
    var m = document.getElementById('budgetPdfChoiceModal');
    if (m) m.classList.remove('active');
}

/**
 * PDF récapitulatif Coûts : modes complet / partiel, logo proportions conservées,
 * lignes en bandes + séparateurs, détail HT/TTC par poste.
 */
function runBudgetRecapPdf(mode) {
    closeBudgetPdfChoiceModal();
    if (!currentBudgetSpectacle) return;
    if (mode !== 'complet' && mode !== 'partiel') mode = 'complet';

    var s = currentBudgetSpectacle;
    var nomSpectacle = (s.name || s.nom || 'Spectacle').replace(/[<>]/g, '');
    var dateSpectacleStr = _formatSpectacleDateForPdf(s);
    var nomAvecDate = nomSpectacle + (dateSpectacleStr ? '  —  ' + dateSpectacleStr : '');
    var dateDoc = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    var logoSetting = typeof appSettings !== 'undefined' && appSettings && appSettings.logo ? appSettings.logo : '';
    var appName = typeof appSettings !== 'undefined' && appSettings && appSettings.appName ? appSettings.appName : '';
    var complet = mode === 'complet';

    function buildPdfBody(doc, logoDataUrl, logoDims) {
        var margin = 15;
        var lineH = 5.2;
        var y = 12;
        var pageW = 210;
        var accentR = 45;
        var accentG = 125;
        var accentB = 180;
        var valueColX = pageW - margin;
        var rowIndex = 0;

        doc.setFillColor(240, 244, 248);
        doc.rect(0, 0, pageW, 38, 'F');
        doc.setDrawColor(accentR, accentG, accentB);
        doc.setLineWidth(0.6);
        doc.line(margin, 37, pageW - margin, 37);

        var maxLogoW = 42;
        var maxLogoH = 20;
        var logoY = 9;
        if (logoDataUrl && logoDims && logoDims.w > 0 && logoDims.h > 0) {
            var scale = Math.min(maxLogoW / logoDims.w, maxLogoH / logoDims.h);
            var dw = logoDims.w * scale;
            var dh = logoDims.h * scale;
            logoY = 9 + (maxLogoH - dh) / 2;
            _budgetPdfAddImageDataUrl(doc, logoDataUrl, margin, logoY, dw, dh);
        } else if (logoDataUrl) {
            _budgetPdfAddImageDataUrl(doc, logoDataUrl, margin, 9, maxLogoW, maxLogoH);
        }

        var textLeft = logoDataUrl ? 62 : margin;
        doc.setTextColor(33, 45, 60);
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text('Récapitulatif des coûts (' + (complet ? 'Complet' : 'Partiel') + ')', textLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        var titleLines = doc.splitTextToSize(nomAvecDate, pageW - textLeft - margin);
        var lineGap = 4.2;
        doc.text(titleLines, textLeft, y + 6);
        doc.setFontSize(9);
        doc.setTextColor(90, 100, 110);
        var dateY = y + 6 + titleLines.length * lineGap + 2;
        doc.text('Document généré le ' + dateDoc, textLeft, dateY);
        doc.setTextColor(0, 0, 0);

        y = Math.max(42, dateY + 8);

        function ensureSpace(extra) {
            if (y + extra > 283) {
                doc.addPage();
                y = margin + lineH;
                rowIndex = 0;
            }
        }

        function sectionTitle(title) {
            ensureSpace(18);
            y += 4;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(accentR, accentG, accentB);
            doc.text(title, margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            y += lineH + 4;
            rowIndex = 0;
        }

        function row(label, value) {
            ensureSpace(lineH + 3);
            var rowTop = y - lineH + 1.2;
            if (rowIndex % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margin - 0.5, rowTop - 0.5, pageW - 2 * margin + 1, lineH + 2.2, 'F');
            }
            doc.setFontSize(10);
            doc.setTextColor(40, 40, 40);
            var lab = label || '';
            if (lab.length > 75) lab = lab.substring(0, 72) + '…';
            doc.text(lab, margin + 1, y);
            doc.setFont('helvetica', 'normal');
            doc.text(value, valueColX - 1, y, { align: 'right' });
            doc.setDrawColor(228, 232, 238);
            doc.setLineWidth(0.12);
            doc.line(margin, y + 1.2, valueColX, y + 1.2);
            y += lineH + 1.5;
            rowIndex++;
        }

        function rowCamMax(label, valueText) {
            var valueMaxW = 72;
            var innerLineH = 4.1;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            var valueLines = doc.splitTextToSize(valueText, valueMaxW);
            var blockH = valueLines.length * innerLineH + 3;
            ensureSpace(blockH + 6);
            var rowTop = y - 3;
            if (rowIndex % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margin - 0.5, rowTop - 0.5, pageW - 2 * margin + 1, blockH + 2.5, 'F');
            }
            doc.setTextColor(40, 40, 40);
            var lab = label || '';
            if (lab.length > 75) lab = lab.substring(0, 72) + '…';
            doc.text(lab, margin + 1, y);
            for (var vi = 0; vi < valueLines.length; vi++) {
                doc.text(valueLines[vi], valueColX - 1, y + vi * innerLineH, { align: 'right' });
            }
            doc.setDrawColor(228, 232, 238);
            doc.setLineWidth(0.12);
            var bottomY = y + (valueLines.length - 1) * innerLineH + 1.2;
            doc.line(margin, bottomY + 1, valueColX, bottomY + 1);
            y = bottomY + innerLineH + 2;
            rowIndex++;
        }

        if (complet) {
            sectionTitle('Totaux');
            row('Coûts estimatifs (TTC)', _budgetPdfTxt('budgetEstimeTotal'));
            row('Coûts engagés (TTC)', _budgetPdfTxt('budgetReelTotal'));

            sectionTitle('TVA');
            row('TVA sur les ventes', _budgetPdfTxt('budgetTVAPayee'));
            row('TVA sur les achats', _budgetPdfTxt('budgetTVAVendue'));
            row('Delta TVA', _budgetPdfTxt('budgetDeltaTVA'));

            sectionTitle('Résultat à l\'instant T');
            row('CA à ce jour', _budgetPdfTxt('budgetCAActuel'));
            row('Apports financiers', _budgetPdfTxt('budgetApportsActuel'));
            row('Résultat', _budgetPdfTxt('budgetResultatInstantT'));
        } else {
            sectionTitle('Totaux');
            row('Coûts estimatifs (TTC)', _budgetPdfTxt('budgetEstimeTotal'));
        }

        sectionTitle('Seuil de rentabilité');
        row('Prix moyen du ticket', _budgetPdfTxt('budgetPrixMoyenTicket'));
        row('Coûts estimatifs', _budgetPdfTxt('budgetSeuilCoûts'));
        var depRow = document.getElementById('budgetSeuilDepensesPercentRow');
        if (depRow && depRow.style.display !== 'none') {
            row('+ Dépenses au % du CA', _budgetPdfTxt('budgetSeuilDepensesPercent'));
        }
        row('= Total coût', _budgetPdfTxt('budgetSeuilTotalCout'));
        row('Billets nécessaires', _budgetPdfTxt('budgetBilletsNecessaires'));

        sectionTitle('Projection à 100 % de remplissage');
        rowCamMax('CA maximum', _formatCamaxPdfValue(s));
        row('Apports financiers', _budgetPdfTxt('budgetApportsProjection'));
        row('Dépenses projetées', _budgetPdfTxt('budgetDepensesProjetees'));
        row('Marge projetée', _budgetPdfTxt('budgetMargeProjetee'));

        var byCatTTC = {};
        (s.budget || []).forEach(function (line) {
            var cat = line.category || 'Autre';
            var montantHT = calculateBudgetMontant(line);
            var tvaRate = line.tvaRate || 0;
            var ttc = montantHT * (1 + tvaRate / 100);
            if (byCatTTC[cat] === undefined) byCatTTC[cat] = 0;
            byCatTTC[cat] += ttc;
        });

        function budgetLinesForCategory(cat) {
            return (s.budget || []).filter(function (line) {
                return (line.category || 'Autre') === cat;
            });
        }

        function formatBudgetLineDetailValue(line) {
            if (line.montantType === 'percent') {
                var p = parseFloat(line.percentBilletterie) || 0;
                var sPct = (Math.round(p * 100) / 100);
                return (sPct % 1 === 0 ? String(sPct) : sPct.toFixed(2)) + ' %';
            }
            var mh = calculateBudgetMontant(line);
            var tvaR = line.tvaRate || 0;
            return (mh * (1 + tvaR / 100)).toFixed(2) + ' €';
        }

        function rowDetailSubline(designation, valueStr) {
            ensureSpace(lineH + 2);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 108, 118);
            var lab = '    ' + (designation || '').replace(/[<>]/g, '');
            if (lab.length > 92) lab = lab.substring(0, 89) + '…';
            doc.text(lab, margin + 1, y);
            doc.text(valueStr, valueColX - 1, y, { align: 'right' });
            y += lineH + 0.5;
            doc.setFontSize(10);
            doc.setTextColor(40, 40, 40);
        }

        function emitCategoryDetailBlock(cat) {
            if (byCatTTC[cat] === undefined) return;
            row(cat, byCatTTC[cat].toFixed(2) + ' €');
            budgetLinesForCategory(cat).forEach(function (line) {
                rowDetailSubline(line.designation || 'Sans nom', formatBudgetLineDetailValue(line));
            });
            y += 2;
        }

        var hasBudgetLines = s.budget && s.budget.length > 0;
        if (hasBudgetLines) {
            sectionTitle('Détail par poste (TTC)');
            BUDGET_CATEGORIES.forEach(function (cat) {
                emitCategoryDetailBlock(cat);
            });
            Object.keys(byCatTTC).forEach(function (cat) {
                if (BUDGET_CATEGORIES.indexOf(cat) !== -1) return;
                emitCategoryDetailBlock(cat);
            });
        }

        if (complet) {
            var apports = s.apportsFinanciers || [];
            if (apports.length > 0) {
                sectionTitle('Apports financiers');
                apports.forEach(function (a) {
                    var montantHT = parseFloat(a.montantFixe) || 0;
                    var tvaRate = a.tvaRate || 0;
                    var mit = a.montantInputType || 'HT';
                    var montantTTC = mit === 'TTC' ? montantHT : montantHT * (1 + tvaRate / 100);
                    var lab = (a.designation || 'Apport').replace(/[<>]/g, '');
                    row(lab + ' (TTC)', montantTTC.toFixed(2) + ' €');
                });
                row('Total apports TTC', _budgetPdfTxt('apportsTotal'));
            }
        }

        y += 4;
        ensureSpace(10);
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        var foot = appName ? appName + ' · ' : '';
        foot += 'Récapitulatif coûts (' + (complet ? 'complet' : 'partiel') + ') — ' + nomSpectacle;
        doc.text(foot, pageW / 2, 292, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        var slug = complet ? 'complet' : 'partiel';
        var filename = 'recap-couts-' + slug + '-' + nomSpectacle.replace(/\s+/g, '-').substring(0, 36) + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
        doc.save(filename);
    }

    function startWithLogoDims(logoDataUrl) {
        if (logoDataUrl) {
            var im = new Image();
            im.onload = function () {
                _ensureJsPDF(function (JsPDF) {
                    var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    buildPdfBody(doc, logoDataUrl, { w: im.naturalWidth, h: im.naturalHeight });
                });
            };
            im.onerror = function () {
                _ensureJsPDF(function (JsPDF) {
                    var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    buildPdfBody(doc, logoDataUrl, null);
                });
            };
            im.src = logoDataUrl;
        } else {
            _ensureJsPDF(function (JsPDF) {
                var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                buildPdfBody(doc, null, null);
            });
        }
    }

    if (logoSetting && String(logoSetting).indexOf('data:') !== 0) {
        _loadLogoDataUrlForPdf(logoSetting).then(function (dataUrl) {
            startWithLogoDims(dataUrl);
        });
    } else {
        startWithLogoDims(logoSetting || null);
    }
}

window.openBudgetPdfChoiceModal = openBudgetPdfChoiceModal;
window.closeBudgetPdfChoiceModal = closeBudgetPdfChoiceModal;
window.runBudgetRecapPdf = runBudgetRecapPdf;
window.printBudgetRecapPDF = openBudgetPdfChoiceModal;

async function renderBilletterie() {
    if (currentBilletterieSpectacle) syncReseauxFromReleves(currentBilletterieSpectacle);
    await invRefreshList();
    if (currentBilletterieSpectacle) {
        currentBilletterieSpectacle._invPlacesReservees = (_invCache || []).length;
    }
    updateBilletterieStats();
    renderBilletCategoriesDisplay();
    renderReseauxCheckboxes();
    renderRelevesDisplay();
    renderReleves();
    renderBilletterieChart();
    loadGuichetData();
}

// ============================
// INVITATIONS (Billetterie)
// ============================
let _invCache = [];

function invGetSpectacleId() {
    return currentBilletterieSpectacle && currentBilletterieSpectacle.id ? String(currentBilletterieSpectacle.id) : '';
}

async function invRefreshList() {
    const sid = invGetSpectacleId();
    if (!sid || typeof apiCall !== 'function') return;
    const body = document.getElementById('invListBody');
    const q = (document.getElementById('invSearchInput')?.value || '').trim();
    try {
        const data = await apiCall(`invitations.php?spectacle_id=${encodeURIComponent(sid)}&q=${encodeURIComponent(q)}`, 'GET');
        _invCache = Array.isArray(data.invitations) ? data.invitations : [];
        if (body) invRenderList();
        invUpdateQuotaInfo();
        invUpdateBilletterieInvitationsCard();
        const blp = document.getElementById('billetteriePage');
        if (blp && blp.classList.contains('active') && currentBilletterieSpectacle && typeof updateBilletterieStats === 'function') {
            currentBilletterieSpectacle._invPlacesReservees = (_invCache || []).length;
            updateBilletterieStats();
        }
    } catch (e) {
        if (body) {
            body.innerHTML = `<tr><td colspan="10" style="padding:1.5rem; text-align:center; color:#e53e3e;">Erreur chargement invitations : ${String(e.message || e).replace(/</g,'&lt;')}</td></tr>`;
        }
        _invCache = [];
        invUpdateBilletterieInvitationsCard();
    }
}

function invRenderList() {
    const body = document.getElementById('invListBody');
    if (!body) return;
    if (!_invCache || _invCache.length === 0) {
        body.innerHTML = `<tr><td colspan="10" style="padding:1.5rem; text-align:center; color:#64748b;">Aucune invitation.</td></tr>`;
        return;
    }
    body.innerHTML = _invCache.map(row => {
        const id = row.id;
        const code = String(row.code || '');
        const nom = String(row.nom || '');
        const prenom = String(row.prenom || '');
        const com = String(row.commentaire || '');
        const created = row.created_at ? new Date(row.created_at).toLocaleString('fr-FR') : '';
        return `
            <tr style="border-bottom:1px solid #edf2f7;">
                <td style="padding:0.55rem;"><input type="checkbox" class="invRowSelect" data-id="${id}"></td>
                <td style="padding:0.55rem; font-weight:800; color:#1e3c72;">${code.replace(/</g,'&lt;')}</td>
                <td style="padding:0.55rem;">${nom.replace(/</g,'&lt;')}</td>
                <td style="padding:0.55rem;">${prenom.replace(/</g,'&lt;')}</td>
                <td style="padding:0.55rem; color:#475569; font-size:0.9rem;">${com.replace(/</g,'&lt;')}</td>
                <td style="padding:0.55rem; color:#64748b; font-size:0.9rem;">${created}</td>
                <td style="padding:0.55rem; text-align:right;">
                    <button type="button" class="btn btn-secondary" style="padding:0.45rem 0.6rem;" onclick="invEditPrompt(${id})">Modifier</button>
                    <button type="button" class="btn btn-secondary" style="padding:0.45rem 0.6rem;" onclick="invDelete(${id})">Supprimer</button>
                    <button type="button" class="btn" style="padding:0.45rem 0.6rem;" onclick="invDownloadPdf(${id})">PDF</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function invCreateSingle() {
    const sid = invGetSpectacleId();
    if (!sid) return;
    const prenom = (document.getElementById('invCreatePrenom')?.value || '').trim();
    const nom = (document.getElementById('invCreateNom')?.value || '').trim();
    const email = (document.getElementById('invCreateEmail')?.value || '').trim();
    const commentaire = (document.getElementById('invCreateComment')?.value || '').trim();
    if (!prenom || !nom) {
        alert('Nom et prénom sont obligatoires.');
        return;
    }
    if (!invCheckQuotaBeforeCreate(1)) return;
    try {
        await apiCall('invitations.php', 'POST', { spectacle_id: sid, prenom, nom, email, commentaire });
        document.getElementById('invCreatePrenom').value = '';
        document.getElementById('invCreateNom').value = '';
        document.getElementById('invCreateEmail').value = '';
        document.getElementById('invCreateComment').value = '';
        showToast('Invitation créée', 'success');
        invRefreshList();
    } catch (e) {
        showToast(String(e.message || e), 'error');
    }
}

function invFillAutoLines() {
    const count = parseInt(document.getElementById('invAutoCount')?.value, 10) || 0;
    const auto = !!document.getElementById('invAutoNames')?.checked;
    if (count <= 0) return;
    const lines = [];
    for (let i = 1; i <= count; i++) {
        if (auto) lines.push(`INVITÉ ${i};INVITÉ ${i};;`);
        else lines.push(`;;`);
    }
    const ta = document.getElementById('invBatchTextarea');
    if (ta) ta.value = lines.join('\n');
}

function invParseBatchTextarea() {
    const ta = document.getElementById('invBatchTextarea');
    const txt = ta ? String(ta.value || '') : '';
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    lines.forEach(line => {
        const parts = line.split(';');
        const prenom = (parts[0] || '').trim();
        const nom = (parts[1] || '').trim();
        const email = (parts[2] || '').trim();
        const commentaire = (parts[3] || '').trim();
        if (prenom && nom) items.push({ prenom, nom, email, commentaire });
    });
    return items;
}

async function invCreateBatch() {
    const sid = invGetSpectacleId();
    if (!sid) return;
    const list = invParseBatchTextarea();
    if (list.length === 0) {
        alert('Aucune ligne valide. Format attendu: prenom;nom;email;commentaire');
        return;
    }
    if (!invCheckQuotaBeforeCreate(list.length)) return;
    try {
        await apiCall('invitations.php', 'POST', { spectacle_id: sid, invitations: list });
        document.getElementById('invBatchTextarea').value = '';
        showToast(`Invitations créées: ${list.length}`, 'success');
        invRefreshList();
    } catch (e) {
        showToast(String(e.message || e), 'error');
    }
}

function invToggleSelectAll(checked) {
    document.querySelectorAll('#invListBody .invRowSelect').forEach(cb => { cb.checked = !!checked; });
}

function invGetSelectedIds() {
    const ids = [];
    document.querySelectorAll('#invListBody .invRowSelect:checked').forEach(cb => {
        const id = parseInt(cb.getAttribute('data-id'), 10);
        if (id) ids.push(id);
    });
    return ids;
}

async function invDelete(id) {
    if (!confirm('Supprimer cette invitation ?')) return;
    try {
        await apiCall(`invitations.php?id=${encodeURIComponent(String(id))}`, 'DELETE');
        showToast('Invitation supprimée', 'success');
        invRefreshList();
    } catch (e) {
        showToast(String(e.message || e), 'error');
    }
}

async function invEditPrompt(id) {
    const row = (_invCache || []).find(r => String(r.id) === String(id));
    if (!row) return;
    const nom = prompt('Nom', row.nom || '');
    if (nom === null) return;
    const prenom = prompt('Prénom', row.prenom || '');
    if (prenom === null) return;
    const email = prompt('Email (optionnel)', row.email || '');
    if (email === null) return;
    const commentaire = prompt('Commentaire interne (optionnel)', row.commentaire || '');
    if (commentaire === null) return;
    try {
        await apiCall('invitations.php', 'PUT', { id, nom, prenom, email, commentaire });
        showToast('Invitation modifiée', 'success');
        invRefreshList();
    } catch (e) {
        showToast(String(e.message || e), 'error');
    }
}

function invGetDefaultTarifLabel() {
    // simple default for now; can be made configurable in admin settings
    return (appSettings && appSettings.invitationTicketDefaults && appSettings.invitationTicketDefaults.badgeText) ? appSettings.invitationTicketDefaults.badgeText : 'INVITATION';
}

function invGetSpectacleDateISO() {
    const s = currentBilletterieSpectacle;
    if (!s || !s.date) return '';
    const raw = String(s.date).trim();
    // accept YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
    } catch (e) {
        return '';
    }
}

function invExportCsvBilletweb() {
    const sid = invGetSpectacleId();
    if (!sid) return;
    if (typeof downloadInvitationsCsvBilletweb === 'function') {
        downloadInvitationsCsvBilletweb(sid, {
            name: currentBilletterieSpectacle && currentBilletterieSpectacle.name,
            spectacle: currentBilletterieSpectacle || undefined
        });
        return;
    }
    const tarif = encodeURIComponent(invGetDefaultTarifLabel());
    const date = encodeURIComponent(invGetSpectacleDateISO() || '');
    const token = (typeof authToken !== 'undefined' && authToken) ? encodeURIComponent(authToken) : '';
    const url = `${API_URL}/invitations_export_csv.php?spectacle_id=${encodeURIComponent(sid)}&tarif=${tarif}&date=${date}&token=${token}`;
    window.open(url, '_blank');
}

// Quota (optional): currentBilletterieSpectacle.invitationQuota (number), and optionally block when reached
function invGetQuota() {
    const q = currentBilletterieSpectacle ? parseInt(currentBilletterieSpectacle.invitationQuota, 10) : 0;
    return isNaN(q) ? 0 : q;
}

/** Nombre d’invitations créées (cache API billetterie courante) */
function invGetUsedCount() {
    return (_invCache || []).length;
}

/** Places encore vendables en billetterie : capacité salle moins invitations émises */
function invGetCapacitePourVente(capacite, invUsed) {
    const c = Math.max(0, parseInt(capacite, 10) || 0);
    const u = Math.max(0, parseInt(invUsed, 10) || 0);
    return Math.max(0, c - u);
}

function invUpdateBilletterieInvitationsCard() {
    const el = document.getElementById('billetterieInvitationsSummary');
    if (!el) return;
    const used = invGetUsedCount();
    const quota = invGetQuota();
    el.textContent = quota > 0 ? `${used} / ${quota}` : `${used} / —`;
}

function openInvitationsPageFromBilletterie() {
    if (!currentBilletterieSpectacle || !currentBilletterieSpectacle.id) return;
    if (typeof openInvitationsPage === 'function') {
        openInvitationsPage(currentBilletterieSpectacle.id);
    }
}

function invUpdateQuotaInfo() {
    const el = document.getElementById('invQuotaInfo');
    if (!el) return;
    const quota = invGetQuota();
    const qInput = document.getElementById('invQuotaInput');
    if (qInput) qInput.value = quota ? String(quota) : '';
    if (!quota) {
        el.style.display = 'none';
        return;
    }
    const used = (_invCache || []).length;
    const remaining = Math.max(0, quota - used);
    el.style.display = '';
    el.textContent = `Quota invitations : ${used} / ${quota} utilisées — reste ${remaining}.`;
}

function invSaveQuota() {
    if (!currentBilletterieSpectacle) return;
    const raw = document.getElementById('invQuotaInput')?.value;
    const q = parseInt(raw, 10) || 0;
    currentBilletterieSpectacle.invitationQuota = q > 0 ? q : 0;
    saveBilletterieData();
    invUpdateQuotaInfo();
    invUpdateBilletterieInvitationsCard();
    if (typeof updateBilletterieStats === 'function') updateBilletterieStats();
    showToast('Quota enregistré', 'success');
}

function invCheckQuotaBeforeCreate(n) {
    const quota = invGetQuota();
    if (!quota) return true;
    const used = (_invCache || []).length;
    if (used + n > quota) {
        alert(`Quota atteint. Utilisées: ${used}/${quota}. Vous tentez d'en créer ${n}.`);
        return false;
    }
    return true;
}

function _invHexToRgb(hex) {
    const h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) {
        const r = parseInt(h[0] + h[0], 16);
        const g = parseInt(h[1] + h[1], 16);
        const b = parseInt(h[2] + h[2], 16);
        return [r, g, b];
    }
    if (h.length === 6) {
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return [r, g, b];
    }
    return [30, 60, 114];
}

async function _invBuildQrDataUrl(code) {
    if (!code) return '';
    try {
        await ensureQRious();
        const qr = new window.QRious({ value: String(code), size: 260, level: 'M' });
        return qr.toDataURL('image/png');
    } catch (e) {
        return '';
    }
}

async function _invGetTicketTemplateForPdf() {
    // Use spectacle override, else admin defaults, else fallbacks
    const tpl = ensureInvitationTicketTemplateOnSpectacle();
    const partnersLib = _invTplGetPartnersLibrary();
    const partnerLogos = (tpl.partnerIds || []).map(id => partnersLib.find(p => String(p.id) === String(id))).filter(p => p && p.logo);
    const logoFinal = tpl.logo
        || (appSettings?.invitationTicketDefaults?.mainLogo)
        || (appSettings && appSettings.logo)
        || localStorage.getItem('appLogo')
        || '';
    const vis = (typeof getVisuelReference === 'function') ? getVisuelReference(currentBilletterieSpectacle) : null;
    const affiche = vis ? (vis.base64 || vis.url || '') : '';
    return { tpl, logoFinal, partnerLogos, affiche };
}

async function _invRenderTicketPdf(doc, invRow, opts = {}) {
    const s = currentBilletterieSpectacle;
    const eventName = (s?.name || s?.nom || 'Spectacle');
    const dateTxt = _formatSpectacleDateForPdf(s);
    const lieuTxt = _getSpectacleLieuTextForTicket(s);

    const { tpl, logoFinal, partnerLogos, affiche } = await _invGetTicketTemplateForPdf();

    const headerC1 = opts.headerColor1 || tpl.headerColor1 || '#1e3c72';
    const headerC2 = opts.headerColor2 || tpl.headerColor2 || '#2a5298';
    const goldC = opts.goldColor || tpl.goldColor || '#d7b14a';
    const badgeText = opts.badgeText || tpl.badgeText || 'INVITATION';
    const labelValidFor = opts.labelValidFor || tpl.labelValidFor || 'Invitation valable pour :';
    const showPoster = (opts.showPoster ?? tpl.showPoster) !== false && !!affiche;
    const showQr = (opts.showQr ?? tpl.showQr) !== false;

    const prenom = String(invRow.prenom || '').trim();
    const nom = String(invRow.nom || '').trim();
    const code = String(invRow.code || '').trim();
    const footerText = String((opts.footerText ?? tpl.footerText) || '').trim();

    const pageW = 210, pageH = 297;
    const margin = 10;
    const innerW = pageW - margin * 2;
    const innerH = pageH - margin * 2;
    const x0 = margin, y0 = margin;

    // base
    doc.setFillColor(255, 255, 255);
    doc.rect(x0, y0, innerW, innerH, 'F');

    // Header (solid fill; gradient not supported in jsPDF)
    const [r1, g1, b1] = _invHexToRgb(headerC1);
    doc.setFillColor(r1, g1, b1);
    doc.rect(x0, y0, innerW, 26, 'F');

    // Title + subtitle
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(String(eventName).toUpperCase().slice(0, 42), x0 + 8, y0 + 12);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const sub = [dateTxt, lieuTxt].filter(Boolean).join(' • ');
    doc.text(sub.slice(0, 70), x0 + 8, y0 + 18);

    // Logos (right)
    const logoData = await _loadLogoDataUrlForPdf(logoFinal);
    if (logoData) {
        _budgetPdfAddImageDataUrl(doc, logoData, x0 + innerW - 40, y0 + 6, 32, 14);
    }
    // Partner logos (header bandeau)
    let px = x0 + innerW - 40 - 4;
    const partnerImgW = 36;
    const partnerImgH = 14;
    const partnerSlot = partnerImgW + 4;
    for (let i = 0; i < Math.min(4, partnerLogos.length); i++) {
        const p = partnerLogos[i];
        const pData = await _loadLogoDataUrlForPdf(p.logo);
        if (!pData) continue;
        px -= partnerSlot;
        _budgetPdfAddImageDataUrl(doc, pData, px, y0 + 5, partnerImgW, partnerImgH);
        px -= 2;
    }

    // Gold bar
    const [gr, gg, gb] = _invHexToRgb(goldC);
    doc.setFillColor(gr, gg, gb);
    doc.rect(x0, y0 + 26, innerW, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text(String(badgeText).toUpperCase().slice(0, 24), x0 + innerW / 2, y0 + 33, { align: 'center' });

    // Body layout
    const bodyY = y0 + 36;
    const bodyH = innerH - 36 - 14; // reserve bottom bar
    const leftW = showPoster ? Math.round(innerW * 0.40) : 0;
    const rightW = innerW - leftW;

    // Poster
    if (showPoster) {
        const posterData = await _loadLogoDataUrlForPdf(affiche);
        if (posterData) {
            _budgetPdfAddImageDataUrl(doc, posterData, x0, bodyY, leftW, bodyH);
        } else {
            doc.setFillColor(17, 17, 17);
            doc.rect(x0, bodyY, leftW, bodyH, 'F');
        }
    }

    const rx = x0 + leftW;
    const pad = 8;
    let y = bodyY + 12;
    doc.setTextColor(30, 41, 59);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(String(labelValidFor).slice(0, 40), rx + pad, y);
    y += 8;

    doc.setFont(undefined, 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text((prenom + ' ' + nom).trim().slice(0, 28), rx + pad, y);
    y += 10;

    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text(String(eventName).slice(0, 40), rx + pad, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10.5);
    if (lieuTxt) { doc.text(String(lieuTxt).slice(0, 60), rx + pad, y); y += 6; }
    if (dateTxt) { doc.text('Date : ' + String(dateTxt).slice(0, 50), rx + pad, y); y += 6; }

    // Bottom block: notes + QR
    const bottomBlockH = 60;
    const bbY = bodyY + bodyH - bottomBlockH;
    const notesW = rightW - 48;

    // Notes box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(rx + pad, bbY + 6, notesW - pad * 2, bottomBlockH - 12, 'FD');
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9.5);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(footerText || '', notesW - pad * 3);
    doc.text(lines.slice(0, 10), rx + pad + 4, bbY + 14);

    if (showQr) {
        // perforation line
        doc.setDrawColor(203, 213, 225);
        if (doc.setLineDashPattern) doc.setLineDashPattern([2, 2], 0);
        doc.line(rx + notesW, bbY + 8, rx + notesW, bbY + bottomBlockH - 8);
        if (doc.setLineDashPattern) doc.setLineDashPattern([], 0);

        const qr = await _invBuildQrDataUrl(code);
        if (qr) {
            _budgetPdfAddImageDataUrl(doc, qr, rx + notesW + 6, bbY + 14, 34, 34);
        }
        doc.setTextColor(15, 23, 42);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(10);
        doc.text(code.slice(0, 24), rx + notesW + 23, bbY + 54, { align: 'center' });
    }

    // Bottom bar
    const [br, bg2, bb2] = _invHexToRgb(headerC2);
    doc.setFillColor(br, bg2, bb2);
    doc.rect(x0, y0 + innerH - 14, innerW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(`${String(badgeText).toUpperCase()} | ${code}`.slice(0, 60), x0 + 8, y0 + innerH - 5);
}

function _invSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function invDownloadPdf(id) {
    const row = (_invCache || []).find(r => String(r.id) === String(id));
    if (!row) return;
    _ensureJsPDF(async function (JsPDF) {
        try {
            const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            await _invRenderTicketPdf(doc, row, {});
            const fn = `${String(row.code || 'invitation').replace(/[^\w-]+/g,'-')}.pdf`;
            doc.save(fn);
        } catch (e) {
            alert('Erreur génération PDF: ' + (e.message || e));
        }
    });
}

async function invExportPdfSelected(mode) {
    const ids = invGetSelectedIds();
    if (ids.length === 0) {
        alert('Sélectionnez au moins une invitation.');
        return;
    }
    const rows = ids.map(id => (_invCache || []).find(r => String(r.id) === String(id))).filter(Boolean);
    if (rows.length === 0) return;

    if (mode === 'merged') {
        _ensureJsPDF(async function (JsPDF) {
            try {
                const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                for (let i = 0; i < rows.length; i++) {
                    if (i > 0) doc.addPage('a4', 'portrait');
                    await _invRenderTicketPdf(doc, rows[i], {});
                }
                const slug = (currentBilletterieSpectacle?.name || 'spectacle').replace(/[^\w-]+/g, '-').slice(0, 40);
                doc.save(`invitations-${slug}.pdf`);
            } catch (e) {
                alert('Erreur génération PDF: ' + (e.message || e));
            }
        });
        return;
    }

    // mode === 'single' => separate PDFs, no zip
    _ensureJsPDF(async function (JsPDF) {
        try {
            for (let i = 0; i < rows.length; i++) {
                const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                await _invRenderTicketPdf(doc, rows[i], {});
                const fn = `${String(rows[i].code || ('invitation-' + (i + 1))).replace(/[^\w-]+/g,'-')}.pdf`;
                doc.save(fn);
                // reduce browser download throttling
                await _invSleep(600);
            }
            showToast(`PDF téléchargés: ${rows.length}`, 'success');
        } catch (e) {
            alert('Erreur génération PDF: ' + (e.message || e));
        }
    });
}

if (typeof window !== 'undefined') {
    window.openInvitationsPageFromBilletterie = openInvitationsPageFromBilletterie;
    window.invRefreshList = invRefreshList;
    window.invCreateSingle = invCreateSingle;
    window.invCreateBatch = invCreateBatch;
    window.invFillAutoLines = invFillAutoLines;
    window.invToggleSelectAll = invToggleSelectAll;
    window.invDelete = invDelete;
    window.invEditPrompt = invEditPrompt;
    window.invDownloadPdf = invDownloadPdf;
    window.invExportCsvBilletweb = invExportCsvBilletweb;
    window.invExportPdfSelected = invExportPdfSelected;
    window.invSaveQuota = invSaveQuota;
}

// GESTION DES CATÉGORIES DE BILLETS (affichage résumé + modale)
function renderBilletCategoriesDisplay() {
    const zone = document.getElementById('billetCategoriesDisplayZone');
    if (!zone) return;

    if (!currentBilletterieSpectacle.billetCategories) {
        currentBilletterieSpectacle.billetCategories = [];
    }
    const categories = currentBilletterieSpectacle.billetCategories;

    if (categories.length === 0) {
        zone.innerHTML = '<p style="color: #a0aec0; font-size: 0.88rem; text-align: center; padding: 0.5rem 0;">Aucune catégorie définie. Cliquez sur le bouton ci-dessous pour commencer.</p>';
        return;
    }

    let caMaxTotal = 0;
    let html = '<div style="font-size: 0.82rem; margin-bottom: 0.5rem;">';
    categories.forEach(function(cat) {
        const caMaxCat = (cat.nombreDisponible || 0) * (cat.prix || 0);
        caMaxTotal += caMaxCat;
        html += '<div style="display: flex; justify-content: space-between; padding: 0.3rem 0; color: var(--mn-text, #2d3748);">';
        html += '<span>' + (cat.nom || 'Sans nom') + ' — <strong>' + (cat.nombreDisponible || 0) + '</strong> x ' + (cat.prix || 0).toFixed(2) + ' €</span>';
        html += '<span style="font-weight: 600; color: #00b894;">' + caMaxCat.toFixed(2) + ' €</span>';
        html += '</div>';
    });
    html += '</div>';
    html += '<div style="display: flex; gap: 1rem; padding: 0.6rem 0.75rem; background: var(--mn-bg, #f7fafc); border-radius: var(--mn-radius, 8px); font-size: 0.85rem; align-items: center;">';
    html += '<div style="margin-left: auto;"><span style="color: var(--mn-text-secondary);">CA Maximum :</span> <strong style="color: #00b894; font-size: 1rem;">' + caMaxTotal.toFixed(2) + ' €</strong></div>';
    html += '</div>';
    zone.innerHTML = html;
}

function openBilletCategoriesModal() {
    if (!currentBilletterieSpectacle.billetCategories) {
        currentBilletterieSpectacle.billetCategories = [];
    }
    if (currentBilletterieSpectacle.billetCategories.length === 0) {
        currentBilletterieSpectacle.billetCategories.push({ id: Date.now().toString(), nom: '', nombreDisponible: 0, prix: 0 });
    }
    renderBilletCategoriesModalLines();
    document.getElementById('billetCategoriesModal').classList.add('active');
}

function closeBilletCategoriesModal() {
    document.getElementById('billetCategoriesModal').classList.remove('active');
}

function renderBilletCategoriesModalLines() {
    const container = document.getElementById('billetCategoriesModalLines');
    const categories = currentBilletterieSpectacle.billetCategories || [];
    let caMaxTotal = 0;

    container.innerHTML = categories.map(function(cat, i) {
        const caMaxCat = (cat.nombreDisponible || 0) * (cat.prix || 0);
        caMaxTotal += caMaxCat;
        return '<div class="billet-cat-modal-line" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 0.5rem; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #edf2f7;">' +
            '<input type="text" value="' + (cat.nom || '').replace(/"/g, '&quot;') + '" placeholder="Ex: Orchestre" data-index="' + i + '" data-field="nom" style="padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: var(--mn-radius); font-size: 0.88rem;">' +
            '<input type="number" value="' + (cat.nombreDisponible || 0) + '" min="0" data-index="' + i + '" data-field="nombreDisponible" style="padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: var(--mn-radius); font-size: 0.88rem; text-align: right;">' +
            '<input type="number" value="' + (cat.prix || 0) + '" step="0.01" min="0" data-index="' + i + '" data-field="prix" style="padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: var(--mn-radius); font-size: 0.88rem; text-align: right; color: var(--success);">' +
            '<div class="billet-cat-ca" style="text-align: right; font-weight: 600; color: #00b894; font-size: 0.88rem;">' + caMaxCat.toFixed(2) + ' €</div>' +
            '<button onclick="removeBilletCategorieInModal(' + i + ')" style="background: none; border: none; color: #e53e3e; cursor: pointer; font-size: 1.1rem; padding: 0.3rem;">&#10005;</button>' +
            '</div>';
    }).join('');

    container.querySelectorAll('input').forEach(function(inp) {
        inp.addEventListener('input', recalcBilletCategoriesModalCA);
    });

    document.getElementById('billetCategoriesModalCAMax').textContent = caMaxTotal.toFixed(2) + ' €';
}

function recalcBilletCategoriesModalCA() {
    const lines = document.querySelectorAll('#billetCategoriesModalLines .billet-cat-modal-line');
    let caMaxTotal = 0;
    lines.forEach(function(line, i) {
        const inputs = line.querySelectorAll('input');
        const nom = (inputs[0] && inputs[0].value) || '';
        const nb = parseFloat(inputs[1] && inputs[1].value) || 0;
        const prix = parseFloat(inputs[2] && inputs[2].value) || 0;
        const ca = nb * prix;
        caMaxTotal += ca;
        const caEl = line.querySelector('.billet-cat-ca');
        if (caEl) caEl.textContent = ca.toFixed(2) + ' €';
    });
    const totalEl = document.getElementById('billetCategoriesModalCAMax');
    if (totalEl) totalEl.textContent = caMaxTotal.toFixed(2) + ' €';
}

function addBilletCategorieInModal() {
    if (!currentBilletterieSpectacle.billetCategories) currentBilletterieSpectacle.billetCategories = [];
    currentBilletterieSpectacle.billetCategories.push({ id: Date.now().toString(), nom: '', nombreDisponible: 0, prix: 0 });
    renderBilletCategoriesModalLines();
}

function removeBilletCategorieInModal(index) {
    currentBilletterieSpectacle.billetCategories.splice(index, 1);
    if (currentBilletterieSpectacle.billetCategories.length === 0) {
        currentBilletterieSpectacle.billetCategories.push({ id: Date.now().toString(), nom: '', nombreDisponible: 0, prix: 0 });
    }
    renderBilletCategoriesModalLines();
}

function saveBilletCategoriesModal() {
    const lines = document.querySelectorAll('#billetCategoriesModalLines .billet-cat-modal-line');
    lines.forEach(function(line, i) {
        const inputs = line.querySelectorAll('input');
        if (currentBilletterieSpectacle.billetCategories[i]) {
            currentBilletterieSpectacle.billetCategories[i].nom = (inputs[0] && inputs[0].value.trim()) || '';
            currentBilletterieSpectacle.billetCategories[i].nombreDisponible = parseFloat(inputs[1] && inputs[1].value) || 0;
            currentBilletterieSpectacle.billetCategories[i].prix = parseFloat(inputs[2] && inputs[2].value) || 0;
        }
    });
    saveBilletterieData();
    renderBilletCategoriesDisplay();
    closeBilletCategoriesModal();
}

function addBilletCategorie() {
    if (!currentBilletterieSpectacle.billetCategories) {
        currentBilletterieSpectacle.billetCategories = [];
    }
    
    currentBilletterieSpectacle.billetCategories.push({
        id: Date.now().toString(),
        nom: '',
        nombreDisponible: 0,
        prix: 0
    });
    
    saveBilletterieData();
    renderBilletterie();
}

function updateBilletCategorie(index, field, value) {
    if (!currentBilletterieSpectacle.billetCategories || !currentBilletterieSpectacle.billetCategories[index]) return;
    
    if (field === 'nombreDisponible' || field === 'prix') {
        currentBilletterieSpectacle.billetCategories[index][field] = parseFloat(value) || 0;
    } else {
        currentBilletterieSpectacle.billetCategories[index][field] = value;
    }
    
    saveBilletterieData();
    renderBilletterie();
}

function deleteBilletCategorie(index) {
    if (!confirm('Supprimer cette catégorie ?')) return;
    currentBilletterieSpectacle.billetCategories.splice(index, 1);
    saveBilletterieData();
    renderBilletterie();
}

function getCAMaximum(spectacle) {
    if (!spectacle.billetCategories || spectacle.billetCategories.length === 0) {
        return 0;
    }
    
    let caMax = 0;
    spectacle.billetCategories.forEach(cat => {
        const nombreDisponible = cat.nombreDisponible || 0;
        const prix = cat.prix || 0;
        caMax += nombreDisponible * prix;
    });
    
    return caMax;
}

// Extrait les noms de réseaux présents dans les relevés (détection automatique)
function getReseauxFromReleves(spectacle) {
    const found = new Set();
    const categories = spectacle.billetCategories || [];
    const catIds = new Set((categories || []).map(c => String(c.id || '')));
    
    (spectacle.releves || []).forEach(releve => {
        Object.keys(releve).forEach(key => {
            if (key === 'date' || key === 'heure') return;
            const base = key.endsWith('_ca') ? key.slice(0, -3) : key;
            if (!base) return;
            
            if (base.includes('_')) {
                const lastUnderscore = base.lastIndexOf('_');
                const suffix = base.slice(lastUnderscore + 1);
                if (catIds.has(suffix)) {
                    found.add(base.slice(0, lastUnderscore));
                } else {
                    found.add(base);
                }
            } else {
                found.add(base);
            }
        });
    });
    
    return [...found].filter(Boolean);
}

function normalizeReseauName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, '');
}

function uniqReseauxPreserveFirstCase(reseaux) {
    const seen = new Set();
    const result = [];
    (reseaux || []).forEach(r => {
        const raw = String(r || '').trim();
        const key = normalizeReseauName(raw);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(raw);
    });
    return result;
}

// Fusionne les réseaux détectés dans les relevés avec spectacle.reseaux et reseauxBilletterie
function syncReseauxFromReleves(spectacle) {
    if (!spectacle) return;
    const detectes = getReseauxFromReleves(spectacle);
    const actuels = spectacle.reseaux || [];
    const tous = uniqReseauxPreserveFirstCase([...actuels, ...detectes]);
    spectacle.reseaux = tous;
    let added = false;
    detectes.forEach(r => {
        if (!appSettings.reseauxBilletterie) appSettings.reseauxBilletterie = [];
        const exists = appSettings.reseauxBilletterie.some(x => normalizeReseauName(x) === normalizeReseauName(r));
        if (!exists && r) {
            appSettings.reseauxBilletterie.push(r.charAt(0).toUpperCase() + r.slice(1));
            added = true;
        }
    });
    if (added && typeof saveSettings === 'function') saveSettings();
}

// Nombre de billets vendus pour un réseau donné (dernier relevé par date)
function getBilletsParReseau(spectacle, reseau) {
    if (!spectacle || !spectacle.releves || spectacle.releves.length === 0) return 0;
    const relevesSorted = [...spectacle.releves].sort((a, b) => {
        const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
        const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
        return dtB - dtA;
    });
    const lastReleve = relevesSorted[0];
    const categories = spectacle.billetCategories || [];
    if (categories.length === 0) {
        return parseInt(lastReleve[reseau]) || 0;
    }
    let total = 0;
    categories.forEach(cat => {
        const key = reseau + '_' + cat.id;
        total += parseInt(lastReleve[key]) || 0;
    });
    return total;
}

// Retourne les alertes quand un quota réseau est proche ou dépassé
function getAlertesQuotas(spectacle) {
    const alertes = [];
    const quotas = spectacle.reseauxQuotas || {};
    const reseaux = spectacle.reseaux || [];
    reseaux.forEach(reseau => {
        const config = quotas[reseau];
        if (!config || !config.quota) return;
        const vendus = getBilletsParReseau(spectacle, reseau);
        const quota = config.quota;
        const pct = quota > 0 ? Math.round((vendus / quota) * 100) : 0;
        const seuil = config.seuilAlerte !== undefined ? config.seuilAlerte : 80;
        if (pct >= seuil) {
            let statut = pct >= 100 ? 'Quota atteint' : 'Quota presque rempli';
            alertes.push({ reseau, vendus, quota, pct, statut });
        }
    });
    return alertes;
}

// Rendre les réseaux avec cases à cocher et champs quota
function renderReseauxCheckboxes() {
    const container = document.getElementById('reseauxCheckboxList');
    const reseauxDetectes = getReseauxFromReleves(currentBilletterieSpectacle);
    const reseauxAdmin = appSettings.reseauxBilletterie || [];
    const reseauxDisponibles = uniqReseauxPreserveFirstCase([...reseauxAdmin, ...reseauxDetectes]);
    const reseauxActifs = currentBilletterieSpectacle.reseaux || [];
    const reseauxActifsKeys = new Set(reseauxActifs.map(normalizeReseauName));
    if (!currentBilletterieSpectacle.reseauxQuotas) currentBilletterieSpectacle.reseauxQuotas = {};
    
    container.innerHTML = reseauxDisponibles.map(reseau => {
        const isChecked = reseauxActifsKeys.has(normalizeReseauName(reseau));
        const q = currentBilletterieSpectacle.reseauxQuotas[reseau] || {};
        const quotaVal = q.quota || '';
        const seuilVal = q.seuilAlerte !== undefined ? q.seuilAlerte : 80;
        const safeReseau = (reseau + '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: ${isChecked ? 'rgba(233, 69, 96, 0.1)' : 'var(--light)'}; border-radius: 8px; border: 2px solid ${isChecked ? 'var(--accent)' : 'transparent'};">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleReseau('${safeReseau}', this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
                    <span style="font-weight: 500;">${reseau}</span>
                </label>
                ${isChecked ? `
                <span style="font-size: 0.8rem; color: #636e72;">Quota:</span>
                <input type="number" min="0" placeholder="—" value="${quotaVal}" onchange="updateReseauQuota('${safeReseau}', 'quota', this.value)" style="width: 70px; padding: 0.35rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">
                <span style="font-size: 0.8rem; color: #636e72;">Alerte à</span>
                <input type="number" min="1" max="100" value="${seuilVal}" onchange="updateReseauQuota('${safeReseau}', 'seuilAlerte', this.value)" style="width: 55px; padding: 0.35rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">%
                ` : ''}
            </div>
        `;
    }).join('');
}

function updateReseauQuota(reseau, field, value) {
    if (!currentBilletterieSpectacle.reseauxQuotas) currentBilletterieSpectacle.reseauxQuotas = {};
    if (!currentBilletterieSpectacle.reseauxQuotas[reseau]) currentBilletterieSpectacle.reseauxQuotas[reseau] = {};
    if (field === 'quota') {
        const n = parseInt(value, 10);
        currentBilletterieSpectacle.reseauxQuotas[reseau].quota = isNaN(n) || n <= 0 ? undefined : n;
    } else if (field === 'seuilAlerte') {
        const n = parseInt(value, 10);
        currentBilletterieSpectacle.reseauxQuotas[reseau].seuilAlerte = isNaN(n) ? 80 : Math.min(100, Math.max(1, n));
    }
    saveBilletterieData();
    updateBilletterieStats();
}

function toggleReseau(reseau, isActive) {
    const targetKey = normalizeReseauName(reseau);
    const current = currentBilletterieSpectacle.reseaux || [];
    const existingVariant = current.find(r => normalizeReseauName(r) === targetKey);
    const canonicalReseau = existingVariant || reseau;

    if (isActive) {
        if (!existingVariant) {
            currentBilletterieSpectacle.reseaux.push(canonicalReseau);
        }
        currentBilletterieSpectacle.reseaux = uniqReseauxPreserveFirstCase(currentBilletterieSpectacle.reseaux);
    } else {
        const variants = current.filter(r => normalizeReseauName(r) === targetKey);
        currentBilletterieSpectacle.reseaux = current.filter(r => normalizeReseauName(r) !== targetKey);
        // Supprimer les données de ce réseau dans les relevés
        currentBilletterieSpectacle.releves.forEach(releve => {
            variants.forEach(v => {
                delete releve[v];
                delete releve[v + '_ca'];
            });
            delete releve[canonicalReseau];
            delete releve[canonicalReseau + '_ca'];
        });
        // Supprimer le quota du réseau
        if (currentBilletterieSpectacle.reseauxQuotas) {
            Object.keys(currentBilletterieSpectacle.reseauxQuotas).forEach(qKey => {
                if (normalizeReseauName(qKey) === targetKey) {
                    delete currentBilletterieSpectacle.reseauxQuotas[qKey];
                }
            });
        }
    }
    saveBilletterieData();
    renderBilletterie();
}

function addReseauToSpectacle() {
    const input = document.getElementById('newReseauSpectacle');
    const name = input.value.trim();
    if (name) {
        const nameKey = normalizeReseauName(name);
        // Ajouter aux paramètres globaux si pas déjà présent
        const existsInAdmin = (appSettings.reseauxBilletterie || []).some(r => normalizeReseauName(r) === nameKey);
        if (!existsInAdmin) {
            appSettings.reseauxBilletterie.push(name);
            saveSettings();
        }
        // Activer pour ce spectacle
        const existsInSpectacle = (currentBilletterieSpectacle.reseaux || []).some(r => normalizeReseauName(r) === nameKey);
        if (!existsInSpectacle) {
            currentBilletterieSpectacle.reseaux.push(name);
            saveBilletterieData();
        }
        currentBilletterieSpectacle.reseaux = uniqReseauxPreserveFirstCase(currentBilletterieSpectacle.reseaux);
        renderBilletterie();
        input.value = '';
    }
}

function updateBilletterieTVARate(value) {
    if (!currentBilletterieSpectacle) return;
    currentBilletterieSpectacle.tvaRateBilletterie = parseFloat(value) || 20;
    saveBilletterieData();
    updateBilletterieStats();
}

function updateBilletterieStats() {
    const total = getTotalBillets(currentBilletterieSpectacle);
    const totalCA = getTotalCA(currentBilletterieSpectacle); // CA TTC actuel
    const capacite = currentBilletterieSpectacle.capacite || 0;
    const invUsed = invGetUsedCount();
    const capacitePourVente = invGetCapacitePourVente(capacite, invUsed);
    const taux = capacitePourVente > 0 ? Math.round((total / capacitePourVente) * 100) : 0;

    // Taux de TVA pour la billetterie (par défaut 20%)
    const tvaRateBilletterie = currentBilletterieSpectacle.tvaRateBilletterie || 20;
    
    // Calculer CA HT et TTC
    // Le CA actuel (totalCA) est en TTC, donc on calcule le HT
    const caHT = tvaRateBilletterie > 0 ? totalCA / (1 + tvaRateBilletterie / 100) : totalCA;
    const caTTC = totalCA; // Le CA est déjà en TTC
    
    // Calcul du CA Maximum (100% de vente)
    const caMax = getCAMaximum(currentBilletterieSpectacle);
    
    // Calcul du prix moyen (utiliser la fonction getPrixMoyenTicket pour cohérence)
    const prixMoyen = getPrixMoyenTicket(currentBilletterieSpectacle);

    // Calculer le nombre de places à vendre pour être rentable
    let placesAVendreText = '';
    if (window.hasPermission && window.hasPermission('budget') && currentBilletterieSpectacle.budget) {
        const { billets: billetsNecessaires } = getBilletsNecessairesSeuil(currentBilletterieSpectacle);
        if (billetsNecessaires !== null && billetsNecessaires > total) {
            placesAVendreText = billetsNecessaires - total;
        }
    }

    const billetterieTotalVendusElement = document.getElementById('billetterieTotalVendus');
    const placesRestantesVente = capacitePourVente > 0 ? Math.max(0, capacitePourVente - total) : null;
    let vendusHtml = String(total);
    const subLines = [];
    if (placesRestantesVente !== null && capacite > 0) {
        if (invUsed > 0) {
            subLines.push(`<div style="font-size: 0.7rem; color: #636e72; margin-top: 0.2rem;">${placesRestantesVente} place(s) à vendre (hors ${invUsed} invitation${invUsed > 1 ? 's' : ''})</div>`);
        } else {
            subLines.push(`<div style="font-size: 0.7rem; color: #636e72; margin-top: 0.2rem;">${placesRestantesVente} place(s) à vendre</div>`);
        }
    }
    if (placesAVendreText) {
        subLines.push(`<div style="font-size: 0.7rem; color: #636e72; margin-top: 0.2rem;">Seuil rentabilité : encore ${placesAVendreText} billets</div>`);
    }
    if (subLines.length) {
        billetterieTotalVendusElement.innerHTML = vendusHtml + subLines.join('');
    } else {
        billetterieTotalVendusElement.textContent = total;
    }
    // Mettre à jour le taux de TVA dans le select
    const tvaRateSelect = document.getElementById('billetterieTVARate');
    if (tvaRateSelect) {
        tvaRateSelect.value = tvaRateBilletterie;
    }
    
    document.getElementById('billetterieCapacite').textContent = capacite || 'Définir';
    const capHint = document.getElementById('billetterieCapaciteVenteHint');
    if (capHint) {
        if (capacite > 0) {
            capHint.textContent = invUsed > 0
                ? `Places vendables (capacité − invitations) : ${capacitePourVente}`
                : `Places vendables : ${capacitePourVente}`;
        } else {
            capHint.textContent = '';
        }
    }
    document.getElementById('billetterieTaux').textContent = taux + '%';
    document.getElementById('billetteriePrixMoyen').textContent = prixMoyen > 0 ? prixMoyen.toFixed(2) + ' €' : '-';
    document.getElementById('billetterieCATTC').textContent = caTTC.toFixed(2) + ' €';
    document.getElementById('billetterieCAHT').textContent = caHT.toFixed(2) + ' €';
    document.getElementById('billetterieCAMax').textContent = caMax.toFixed(2) + ' €';
    
    // Alertes quotas réseaux
    const alertesQuotas = getAlertesQuotas(currentBilletterieSpectacle);
    const zoneAlertes = document.getElementById('billetterieQuotasAlertesZone');
    const listAlertes = document.getElementById('billetterieQuotasAlertesList');
    if (zoneAlertes && listAlertes) {
        if (alertesQuotas.length > 0) {
            zoneAlertes.style.display = 'block';
            listAlertes.innerHTML = alertesQuotas.map(a => 
                '<div style="font-size: 0.9rem; padding: 0.25rem 0;">• <strong>' + a.reseau + '</strong> : ' + a.vendus + '/' + a.quota + ' (' + a.pct + '%) — ' + a.statut + '</div>'
            ).join('');
        } else {
            zoneAlertes.style.display = 'none';
        }
    }
    
    // Calcul du taux moyen sur 15 jours et projection
    const projection = calculateProjection(currentBilletterieSpectacle);
    
    document.getElementById('tauxMoyenJour').textContent = projection.tauxMoyen.toFixed(1) + ' billets/jour';
    
    if (projection.joursRestants !== null && projection.joursRestants > 0) {
        document.getElementById('projectionBillets').textContent = projection.billetsProjection;
        document.getElementById('joursRestants').textContent = projection.joursRestants + ' jours';
        
        const container = document.getElementById('statutProjectionContainer');
        if (projection.billetsProjection >= capacitePourVente && capacitePourVente > 0) {
            document.getElementById('statutProjection').innerHTML = '<span style="font-weight: 700;">🎉 COMPLET</span>';
            container.style.background = 'linear-gradient(135deg, #00b894 0%, #00a884 100%)';
        } else if (capacitePourVente > 0) {
            const tauxProjection = Math.round((projection.billetsProjection / capacitePourVente) * 100);
            document.getElementById('statutProjection').textContent = tauxProjection + '%';
            container.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        } else {
            document.getElementById('statutProjection').textContent = '-';
            container.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
    } else if (projection.joursRestants === 0) {
        document.getElementById('projectionBillets').textContent = total;
        document.getElementById('joursRestants').textContent = "Aujourd'hui !";
        document.getElementById('statutProjection').textContent = taux + '%';
    } else {
        document.getElementById('projectionBillets').textContent = '-';
        document.getElementById('joursRestants').textContent = 'Date non définie';
        document.getElementById('statutProjection').textContent = '-';
    }
}

function calculateProjection(spectacle) {
    const result = {
        tauxMoyen: 0,
        billetsProjection: 0,
        joursRestants: null
    };
    
    const today = new Date();
    
    // Calculer les jours restants même sans relevés
    if (spectacle.date) {
        const dateSpectacle = new Date(spectacle.date + 'T23:59:59');
        const joursRestants = Math.ceil((dateSpectacle - today) / (1000 * 60 * 60 * 24));
        result.joursRestants = Math.max(0, joursRestants);
    }
    
    const releves = spectacle.releves || [];
    const reseaux = spectacle.reseaux || [];
    
    if (releves.length < 2) {
        // Même sans assez de relevés, on a les jours restants
        if (releves.length === 1) {
            // Avec un seul relevé, la projection = billets actuels (with guichet correction)
            let totalActuel = 0;
            reseaux.forEach(res => {
                totalActuel += parseInt(releves[0][res]) || 0;
            });
            totalActuel = Math.max(0, totalActuel - getGuichetCorrection(spectacle));
            result.billetsProjection = totalActuel;
        }
        return result;
    }
    
    // Trier les relevés par date et heure
    const relevesTries = [...releves].sort((a, b) => {
        const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
        const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
        return dtA - dtB;
    });
    
    // Calculer le total pour chaque relevé (with guichet correction)
    const guichetCorr = getGuichetCorrection(spectacle);
    const relevesAvecTotal = relevesTries.map(r => {
        let total = 0;
        reseaux.forEach(res => {
            total += parseInt(r[res]) || 0;
        });
        return { date: new Date(r.date), total: Math.max(0, total - guichetCorr) };
    });
    
    // Prendre les relevés des 15 derniers jours
    const quinzeJoursAgo = new Date(today);
    quinzeJoursAgo.setDate(quinzeJoursAgo.getDate() - 15);
    
    let relevesFiltered = relevesAvecTotal.filter(r => r.date >= quinzeJoursAgo);
    
    // Si pas assez de relevés dans les 15 derniers jours, prendre les 2 derniers
    if (relevesFiltered.length < 2) {
        relevesFiltered = relevesAvecTotal.slice(-2);
    }
    
    if (relevesFiltered.length < 2) {
        return result;
    }
    
    // Calculer la différence entre le premier et le dernier relevé de la période
    const premierReleve = relevesFiltered[0];
    const dernierReleve = relevesFiltered[relevesFiltered.length - 1];
    
    const billetsVendus = dernierReleve.total - premierReleve.total;
    const joursEcoules = Math.max(1, Math.round((dernierReleve.date - premierReleve.date) / (1000 * 60 * 60 * 24)));
    
    result.tauxMoyen = billetsVendus / joursEcoules;
    
    // Calculer la projection si on a les jours restants
    if (result.joursRestants !== null && result.joursRestants > 0) {
        const totalActuel = dernierReleve.total;
        result.billetsProjection = Math.round(totalActuel + (result.tauxMoyen * result.joursRestants));
    } else if (result.joursRestants === 0) {
        result.billetsProjection = dernierReleve.total;
    }
    
    return result;
}

function editCapacite() {
    const currentValue = currentBilletterieSpectacle.capacite || 0;
    const newValue = prompt('Capacité de la salle :', currentValue);
    if (newValue !== null) {
        currentBilletterieSpectacle.capacite = parseInt(newValue) || 0;
        saveBilletterieData();
        renderBilletterie();
    }
}

let showAllReleves = false;

function toggleHistoriqueComplet() {
    showAllReleves = !showAllReleves;
    const container = document.getElementById('relevesHistoriqueContainer');
    if (container) container.style.display = showAllReleves ? 'block' : 'none';
    renderReleves();
}

function calculerTotauxReleve(releve, reseaux) {
    let totalBillets = 0;
    let totalCA = 0;
    reseaux.forEach(r => {
        totalBillets += parseInt(releve[r]) || 0;
        totalCA += parseFloat(releve[r + '_ca']) || 0;
    });
    return { totalBillets, totalCA };
}

function renderRelevesDisplay() {
    const zone = document.getElementById('relevesDisplayZone');
    if (!zone) return;

    const reseaux = currentBilletterieSpectacle.reseaux || [];
    const releves = currentBilletterieSpectacle.releves || [];

    if (reseaux.length === 0) {
        zone.innerHTML = '<p style="color: #a0aec0; font-size: 0.88rem; text-align: center; padding: 0.5rem 0;">Sélectionnez d\'abord des réseaux de billetterie ci-dessus.</p>';
        return;
    }

    if (releves.length === 0) {
        zone.innerHTML = '<p style="color: #a0aec0; font-size: 0.88rem; text-align: center; padding: 0.5rem 0;">Aucun relevé. Cliquez sur "Ajouter / modifier un relevé" pour commencer.</p>';
        return;
    }

    const relevesSorted = [...releves].sort((a, b) => {
        const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
        const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
        return dtB - dtA;
    });
    const lastReleve = relevesSorted[0];
    const totaux = calculerTotauxReleve(lastReleve, reseaux);

    let html = '<div style="font-size: 0.82rem; margin-bottom: 0.5rem;">';
    reseaux.forEach(r => {
        const qty = parseInt(lastReleve[r]) || 0;
        const ca = parseFloat(lastReleve[r + '_ca']) || 0;
        if (qty > 0 || ca > 0) {
            html += '<div style="display: flex; justify-content: space-between; padding: 0.3rem 0; color: var(--mn-text, #2d3748);">';
            html += '<span>' + r + '</span>';
            html += '<span><strong>' + qty + '</strong> billets — <strong style="color: #00b894;">' + ca.toFixed(2) + ' €</strong></span>';
            html += '</div>';
        }
    });
    html += '</div>';
    html += '<div style="display: flex; gap: 1rem; padding: 0.6rem 0.75rem; background: var(--mn-bg, #f7fafc); border-radius: var(--mn-radius, 8px); font-size: 0.85rem; align-items: center; flex-wrap: wrap;">';
    html += '<div><span style="color: var(--mn-text-secondary);">Date :</span> <strong>' + (lastReleve.date || '') + (lastReleve.heure ? ' ' + lastReleve.heure : '') + '</strong></div>';
    html += '<div><span style="color: var(--mn-text-secondary);">Total :</span> <strong>' + totaux.totalBillets + ' billets</strong></div>';
    html += '<div style="margin-left: auto;"><span style="color: var(--mn-text-secondary);">CA Total :</span> <strong style="color: #00b894; font-size: 1rem;">' + totaux.totalCA.toFixed(2) + ' €</strong></div>';
    html += '</div>';
    zone.innerHTML = html;
}

function renderReleves() {
    const thead = document.getElementById('relevesTableHead');
    const tbody = document.getElementById('relevesTableBody');
    const reseaux = currentBilletterieSpectacle.reseaux || [];

    const relevesSorted = [...(currentBilletterieSpectacle.releves || [])].sort((a, b) => {
        const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
        const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
        return dtB - dtA;
    });

    const btnHistorique = document.getElementById('voirHistoriqueBtn');
    if (btnHistorique) {
        if (relevesSorted.length > 1) {
            btnHistorique.style.display = 'inline-block';
            btnHistorique.textContent = showAllReleves ? 'Masquer l\'historique' : 'Voir tout l\'historique (' + relevesSorted.length + ')';
        } else {
            btnHistorique.style.display = 'none';
        }
    }

    thead.innerHTML = '<tr style="border-bottom: 2px solid var(--border);">' +
        '<th style="text-align: left; padding: 1rem; font-family: \'Playfair Display\', serif;" rowspan="2">Date / Heure</th>' +
        reseaux.map(r => '<th colspan="2" style="text-align: center; padding: 0.5rem 1rem; font-family: \'Playfair Display\', serif; border-bottom: 1px solid var(--border);">' + r + '</th>').join('') +
        '<th style="text-align: right; padding: 1rem; font-family: \'Playfair Display\', serif; background: var(--light);" rowspan="2">Total</th>' +
        '<th style="text-align: right; padding: 1rem; font-family: \'Playfair Display\', serif; background: linear-gradient(135deg, #00b894 0%, #00a884 100%); color: white;" rowspan="2">CA Total</th>' +
        '<th style="text-align: center; padding: 1rem; width: 50px;" rowspan="2"></th></tr>' +
        '<tr style="border-bottom: 2px solid var(--border);">' +
        reseaux.map(() => '<th style="text-align: right; padding: 0.3rem 0.5rem; font-size: 0.8rem; color: #636e72;">Billets</th><th style="text-align: right; padding: 0.3rem 0.5rem; font-size: 0.8rem; color: var(--success);">CA €</th>').join('') +
        '</tr>';

    if (relevesSorted.length === 0) {
        const colspan = reseaux.length * 2 + 5;
        tbody.innerHTML = '<tr><td colspan="' + colspan + '" style="text-align: center; padding: 3rem; color: #636e72;">Aucun relevé.</td></tr>';
        return;
    }

    const showReleveDelta = typeof isSpectacleDatePast === 'function' ? !isSpectacleDatePast(currentBilletterieSpectacle) : true;

    tbody.innerHTML = relevesSorted.map((releve, displayIndex) => {
        const realIndex = currentBilletterieSpectacle.releves.findIndex(r => r === releve);
        const totaux = calculerTotauxReleve(releve, reseaux);
        let deltaHtml = '';
        if (showReleveDelta && displayIndex < relevesSorted.length - 1) {
            const totauxPrev = calculerTotauxReleve(relevesSorted[displayIndex + 1], reseaux);
            const dB = totaux.totalBillets - totauxPrev.totalBillets;
            const dCA = totaux.totalCA - totauxPrev.totalCA;
            deltaHtml = '<div style="margin-top: 0.3rem; font-size: 0.85em;"><span style="color: ' + (dB >= 0 ? '#2d3436' : 'var(--danger)') + ';">' + (dB >= 0 ? '▲' : '▼') + ' ' + (dB >= 0 ? '+' : '') + dB + ' billets</span> <span style="color: ' + (dCA >= 0 ? '#2d3436' : 'var(--danger)') + ';">' + (dCA >= 0 ? '▲' : '▼') + ' ' + (dCA >= 0 ? '+' : '') + dCA.toFixed(2) + ' €</span></div>';
        }
        return '<tr style="border-bottom: 1px solid var(--border);">' +
            '<td style="padding: 0.5rem; font-size: 0.85rem;">' + (releve.date || '') + (releve.heure ? ' ' + releve.heure : '') + '</td>' +
            reseaux.map(r => '<td style="padding: 0.5rem; text-align: right; font-size: 0.85rem;">' + (parseInt(releve[r]) || 0) + '</td><td style="padding: 0.5rem; text-align: right; font-size: 0.85rem; color: var(--success);">' + (parseFloat(releve[r + '_ca']) || 0).toFixed(2) + ' €</td>').join('') +
            '<td style="padding: 0.5rem; text-align: right; font-weight: 700; background: var(--light); font-size: 0.85rem;">' + totaux.totalBillets + '</td>' +
            '<td style="padding: 0.5rem; text-align: right; font-weight: 700; background: linear-gradient(135deg, #00b894 0%, #00a884 100%); color: white; font-size: 0.85rem;">' + totaux.totalCA.toFixed(2) + ' €' + deltaHtml + '</td>' +
            '<td style="padding: 0.5rem; text-align: center;"><button class="btn-remove" onclick="deleteReleve(' + realIndex + ')" style="font-size: 0.8rem; padding: 0.2rem 0.4rem;">×</button></td>' +
            '</tr>';
    }).join('');
}

var _releveModalEditingIndex = -1;

function openReleveModal() {
    if (currentBilletterieSpectacle.reseaux.length === 0) {
        alert('Sélectionnez d\'abord des réseaux de billetterie.');
        return;
    }
    const releves = currentBilletterieSpectacle.releves || [];
    const relevesSorted = [...releves].sort((a, b) => {
        const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
        const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
        return dtB - dtA;
    });
    const lastReleve = relevesSorted.length > 0 ? relevesSorted[0] : null;
    _releveModalEditingIndex = lastReleve ? currentBilletterieSpectacle.releves.indexOf(lastReleve) : -1;

    document.getElementById('releveModalTitle').textContent = _releveModalEditingIndex >= 0 ? 'Modifier le dernier relevé' : 'Ajouter un relevé';

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const heure = now.toTimeString().slice(0, 5);

    if (_releveModalEditingIndex >= 0) {
        const r = currentBilletterieSpectacle.releves[_releveModalEditingIndex];
        document.getElementById('releveModalDate').value = r.date || today;
        document.getElementById('releveModalHeure').value = (r.heure || '12:00').substring(0, 5);
    } else {
        document.getElementById('releveModalDate').value = today;
        document.getElementById('releveModalHeure').value = heure;
    }

    const container = document.getElementById('releveModalReseaux');
    const reseaux = currentBilletterieSpectacle.reseaux;
    let r = _releveModalEditingIndex >= 0 ? currentBilletterieSpectacle.releves[_releveModalEditingIndex] : null;
    if (!r && relevesSorted.length > 0) {
        r = relevesSorted[0];
    }

    container.innerHTML = reseaux.map((res, idx) => {
        const val = r ? (parseInt(r[res]) || 0) : 0;
        const ca = r ? (parseFloat(r[res + '_ca']) || 0) : 0;
        const safeId = 'releveModal_' + idx;
        return '<div class="form-group" style="margin-bottom: 1rem; padding: 0.75rem; background: var(--mn-bg, #f7fafc); border-radius: var(--mn-radius);">' +
            '<label style="font-weight: 600; margin-bottom: 0.4rem;">' + res + '</label>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">' +
            '<div><label style="font-size: 0.8rem; color: #636e72;">Billets</label><input type="number" id="' + safeId + '_qty" value="' + val + '" min="0" style="width: 100%; padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: var(--mn-radius);"></div>' +
            '<div><label style="font-size: 0.8rem; color: #636e72;">CA €</label><input type="number" step="0.01" id="' + safeId + '_ca" value="' + ca + '" min="0" style="width: 100%; padding: 0.5rem; border: 1px solid var(--mn-border); border-radius: var(--mn-radius); color: var(--success);"></div>' +
            '</div></div>';
    }).join('');

    document.getElementById('releveModal').classList.add('active');
}

function closeReleveModal() {
    document.getElementById('releveModal').classList.remove('active');
}

function saveReleveModal() {
    const date = document.getElementById('releveModalDate').value;
    const heure = document.getElementById('releveModalHeure').value || '12:00';
    const reseaux = currentBilletterieSpectacle.reseaux;

    const releve = { date: date, heure: heure };
    reseaux.forEach((res, idx) => {
        const qtyEl = document.getElementById('releveModal_' + idx + '_qty');
        const caEl = document.getElementById('releveModal_' + idx + '_ca');
        releve[res] = parseInt(qtyEl && qtyEl.value) || 0;
        releve[res + '_ca'] = parseFloat(caEl && caEl.value) || 0;
    });

    if (_releveModalEditingIndex >= 0) {
        currentBilletterieSpectacle.releves[_releveModalEditingIndex] = releve;
    } else {
        currentBilletterieSpectacle.releves.push(releve);
    }
    saveBilletterieData();
    renderBilletterie();
    closeReleveModal();
}

function addReleve() {
    if (currentBilletterieSpectacle.reseaux.length === 0) {
        alert('Sélectionnez d\'abord des réseaux de billetterie.');
        return;
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const heure = now.toTimeString().slice(0, 5);
    const newReleve = { date: today, heure: heure };
    
    const lastReleve = currentBilletterieSpectacle.releves[currentBilletterieSpectacle.releves.length - 1];
    
    currentBilletterieSpectacle.reseaux.forEach(r => {
        newReleve[r] = lastReleve ? (lastReleve[r] || 0) : 0;
        newReleve[r + '_ca'] = lastReleve ? (lastReleve[r + '_ca'] || 0) : 0;
    });

    currentBilletterieSpectacle.releves.push(newReleve);
    saveBilletterieData();
    renderBilletterie();
}

function deleteReleve(index) {
    if (!confirm('Supprimer ce relevé ?')) return;
    currentBilletterieSpectacle.releves.splice(index, 1);
    saveBilletterieData();
    renderBilletterie();
}

function updateReleveDate(index, value) {
    currentBilletterieSpectacle.releves[index].date = value;
    saveBilletterieData();
    renderBilletterieChart();
}

function updateReleveHeure(index, value) {
    currentBilletterieSpectacle.releves[index].heure = value;
    saveBilletterieData();
    renderBilletterieChart();
}

function updateReleveValue(index, reseau, value) {
    currentBilletterieSpectacle.releves[index][reseau] = parseInt(value) || 0;
    saveBilletterieData();
    renderBilletterie();
}

function updateReleveCA(index, reseau, value) {
    currentBilletterieSpectacle.releves[index][reseau + '_ca'] = parseFloat(value) || 0;
    saveBilletterieData();
    renderBilletterie();
}

function updateReleveCategorieValue(index, reseau, categorieId, value) {
    const key = `${reseau}_${categorieId}`;
    currentBilletterieSpectacle.releves[index][key] = parseInt(value) || 0;
    
    // NE PLUS calculer automatiquement le CA - l'utilisateur saisit librement
    // Le CA est maintenant saisi manuellement via updateReleveCategorieCA
    
    saveBilletterieData();
    renderBilletterie();
}

function updateReleveCategorieCA(index, reseau, categorieId, value) {
    const key = `${reseau}_${categorieId}`;
    currentBilletterieSpectacle.releves[index][key + '_ca'] = parseFloat(value) || 0;
    saveBilletterieData();
    renderBilletterie();
}

function updateReleveTotalReseau(index, reseau, type, value) {
    const releve = currentBilletterieSpectacle.releves[index];
    
    if (type === 'billets') {
        releve[reseau] = parseInt(value) || 0;
    } else {
        releve[reseau + '_ca'] = parseFloat(value) || 0;
    }
    
    saveBilletterieData();
    renderBilletterie();
}

function drawBilletterieChartToCanvas(spectacle, canvas, wrapper) {
    if (!spectacle || !canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');

    // Cleanup previous listeners & tooltip
    if (canvas._chartMouseMove) { canvas.removeEventListener('mousemove', canvas._chartMouseMove); canvas._chartMouseMove = null; }
    if (canvas._chartMouseLeave) { canvas.removeEventListener('mouseleave', canvas._chartMouseLeave); canvas._chartMouseLeave = null; }
    if (canvas._chartTooltip) { canvas._chartTooltip.remove(); canvas._chartTooltip = null; }

    const releves = spectacle.releves || [];
    const reseaux = spectacle.reseaux || [];

    if (releves.length === 0) {
        canvas.width = wrapper.clientWidth;
        canvas.height = 200;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#636e72';
        ctx.font = '14px Figtree, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Ajoutez des relev\u00e9s pour voir le graphique', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Sort chronologically (date + heure)
    const relevesSorted = [...releves].sort((a, b) => {
        const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
        const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
        return dtA - dtB;
    });
    const labels = relevesSorted.map(r => r.date || '');
    
    // Guichet correction: deduct unsold guichet stock from displayed totals
    const guichetCorrectionValue = getGuichetCorrection(spectacle);
    
    const totals = relevesSorted.map(r => {
        let total = 0;
        reseaux.forEach(res => { total += parseInt(r[res]) || 0; });
        return Math.max(0, total - guichetCorrectionValue);
    });

    // ========== COMPUTE DAILY SALES (delta between consecutive points) ==========
    // The first point is NOT a "daily sale" - it's the initial stock.
    // We compute delta only from index 1 onwards. Index 0 gets null (no bar).
    const dailySales = totals.map((val, i) => {
        if (i === 0) return null; // No delta for first point
        const delta = val - totals[i - 1];
        return Math.max(0, delta);
    });

    // ========== DETECT COM ACTIONS ==========
    const comActions = spectacle.communications || [];
    const normD = (d) => typeof d === 'string' ? d.substring(0, 10) : new Date(d).toISOString().substring(0, 10);

    const getComActionsAtDate = (dateStr) => {
        const ds = normD(dateStr);
        return comActions.filter(a => {
            if (!a.dateDebut) return false;
            const debut = normD(a.dateDebut);
            const fin = a.dateFin ? normD(a.dateFin) : debut;
            return ds >= debut && ds <= fin;
        });
    };
    const isComActiveAtDate = (dateStr) => getComActionsAtDate(dateStr).length > 0;
    const comCountAtDate = (dateStr) => getComActionsAtDate(dateStr).length;

    // ========== ADAPTIVE SIZING ==========
    const numPoints = totals.length;
    const dpr = window.devicePixelRatio || 1;
    const minSpacingPerPoint = numPoints <= 5 ? 80 : numPoints <= 15 ? 65 : 55;
    const containerWidth = wrapper.clientWidth;

    const paddingLeft = 55;
    const paddingRight = 55;
    const paddingTop = 40;
    const paddingBottom = 55;

    const neededChartWidth = paddingLeft + paddingRight + (numPoints - 1) * minSpacingPerPoint;
    const chartWidth = Math.max(containerWidth, neededChartWidth);
    const chartHeight = Math.max(260, Math.min(380, 220 + numPoints * 3));

    canvas.style.width = chartWidth + 'px';
    canvas.style.height = chartHeight + 'px';
    canvas.width = chartWidth * dpr;
    canvas.height = chartHeight * dpr;
    ctx.scale(dpr, dpr);

    const drawWidth = chartWidth - paddingLeft - paddingRight;
    const drawHeight = chartHeight - paddingTop - paddingBottom;

    // ========== NICE Y-AXIS SCALING ==========
    const computeNiceMax = (maxVal) => {
        if (maxVal <= 0) return 2;
        if (maxVal <= 10) return Math.ceil(maxVal / 2) * 2 || 2;
        const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
        const norm = maxVal / mag;
        let nice;
        if (norm <= 1.5) nice = 1.5;
        else if (norm <= 2) nice = 2;
        else if (norm <= 3) nice = 3;
        else if (norm <= 5) nice = 5;
        else if (norm <= 7.5) nice = 7.5;
        else nice = 10;
        return Math.ceil(nice * mag);
    };

    const capSalle = Math.max(0, parseInt(spectacle.capacite, 10) || 0);
    let invReservees = spectacle._invPlacesReservees == null && spectacle === currentBilletterieSpectacle
        ? invGetUsedCount()
        : Math.max(0, parseInt(spectacle._invPlacesReservees, 10) || 0);
    const capVente = invGetCapacitePourVente(capSalle, invReservees);
    const maxTot = totals.length ? Math.max(...totals, 1) : 1;
    const niceMaxLeft = computeNiceMax(Math.max(maxTot, capVente > 0 ? capVente : 0));

    // Right axis: compute max from ACTUAL daily deltas only (exclude index 0)
    const actualDailySales = dailySales.filter(v => v !== null);
    const maxDaily = actualDailySales.length > 0 ? Math.max(...actualDailySales, 1) : 1;
    const niceMaxRight = computeNiceMax(maxDaily);

    const getX = (i) => paddingLeft + (numPoints === 1 ? drawWidth / 2 : (i / (numPoints - 1)) * drawWidth);
    const getYLeft = (val) => paddingTop + drawHeight - (val / niceMaxLeft) * drawHeight;

    ctx.clearRect(0, 0, chartWidth, chartHeight);

    // ========== COM ACTION HIGHLIGHT ZONES ==========
    // Intensity varies with number of simultaneous actions
    labels.forEach((label, i) => {
        const count = comCountAtDate(label);
        if (count > 0) {
            const x = getX(i);
            const halfGap = numPoints > 1 ? (drawWidth / (numPoints - 1)) / 2 : drawWidth / 2;
            // Base opacity 0.08, +0.05 per additional action, max ~0.30
            const opacity = Math.min(0.30, 0.08 + (count - 1) * 0.05);
            ctx.fillStyle = 'rgba(253, 171, 61, ' + opacity + ')';
            ctx.fillRect(x - halfGap, paddingTop, halfGap * 2, drawHeight);

            // Draw small colored ticks at the top for each action (stacked)
            for (let c = 0; c < Math.min(count, 4); c++) {
                ctx.fillStyle = 'rgba(253, 171, 61, ' + (0.5 + c * 0.15) + ')';
                const tickH = 4;
                const tickY = paddingTop + c * (tickH + 1);
                ctx.fillRect(x - halfGap, tickY, halfGap * 2, tickH);
            }
        }
    });

    // ========== GRID LINES (left Y axis) ==========
    const gridLines = 5;
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= gridLines; i++) {
        const val = Math.round((niceMaxLeft / gridLines) * i);
        const y = paddingTop + drawHeight - (val / niceMaxLeft) * drawHeight;

        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + drawWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#e94560';
        ctx.font = '10px Figtree, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(val.toLocaleString('fr-FR'), paddingLeft - 8, y);
    }

    // ========== RIGHT Y AXIS LABELS (ventes/jour - blue) ==========
    for (let i = 0; i <= gridLines; i++) {
        const val = Math.round((niceMaxRight / gridLines) * i);
        const y = paddingTop + drawHeight - (val / niceMaxRight) * drawHeight;

        ctx.fillStyle = '#579bfc';
        ctx.font = '10px Figtree, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(val.toLocaleString('fr-FR'), paddingLeft + drawWidth + 8, y);
    }

    // ========== AXES ==========
    ctx.strokeStyle = '#dfe6e9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(paddingLeft, paddingTop + drawHeight);
    ctx.lineTo(paddingLeft + drawWidth, paddingTop + drawHeight);
    ctx.lineTo(paddingLeft + drawWidth, paddingTop);
    ctx.stroke();

    // Ligne « places vendables » (capacité − invitations) — référence pour la jauge cumul
    if (capVente > 0) {
        const yCap = getYLeft(capVente);
        ctx.strokeStyle = 'rgba(99, 110, 114, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(paddingLeft, yCap);
        ctx.lineTo(paddingLeft + drawWidth, yCap);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#636e72';
        ctx.font = '9px Figtree, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Places vendables (' + capVente + ')', paddingLeft + 4, yCap - 2);
    }

    // ========== BARS: VENTES / JOUR (skip index 0) ==========
    const barMaxWidth = numPoints > 1 ? (drawWidth / (numPoints - 1)) * 0.55 : 40;
    const barWidth = Math.min(barMaxWidth, 30);

    dailySales.forEach((val, i) => {
        if (val === null || val <= 0) return; // Skip null (index 0) and zeros
        const x = getX(i);
        const barH = (val / niceMaxRight) * drawHeight;
        const barY = paddingTop + drawHeight - barH;

        const hasCom = isComActiveAtDate(labels[i]);
        const barColor = hasCom ? 'rgba(253, 171, 61, 0.65)' : 'rgba(87, 155, 252, 0.45)';
        const barBorder = hasCom ? 'rgba(253, 171, 61, 0.9)' : 'rgba(87, 155, 252, 0.7)';

        const r = Math.min(3, barWidth / 2);
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.moveTo(x - barWidth / 2, barY + r);
        ctx.arcTo(x - barWidth / 2, barY, x - barWidth / 2 + r, barY, r);
        ctx.arcTo(x + barWidth / 2, barY, x + barWidth / 2, barY + r, r);
        ctx.lineTo(x + barWidth / 2, paddingTop + drawHeight);
        ctx.lineTo(x - barWidth / 2, paddingTop + drawHeight);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = barBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // ========== AREA FILL UNDER CUMUL LINE ==========
    const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + drawHeight);
    gradient.addColorStop(0, 'rgba(233, 69, 96, 0.18)');
    gradient.addColorStop(1, 'rgba(233, 69, 96, 0.01)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(getX(0), paddingTop + drawHeight);
    totals.forEach((val, i) => ctx.lineTo(getX(i), getYLeft(val)));
    ctx.lineTo(getX(numPoints - 1), paddingTop + drawHeight);
    ctx.closePath();
    ctx.fill();

    // ========== CUMUL LINE ==========
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    totals.forEach((val, i) => {
        const x = getX(i); const y = getYLeft(val);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // ========== CUMUL POINTS ==========
    totals.forEach((val, i) => {
        const x = getX(i); const y = getYLeft(val);
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
        ctx.strokeStyle = '#e94560'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#e94560'; ctx.fill();
    });

    // ========== VALUE LABELS (cumul - above line, adaptive) ==========
    const showEveryNthValue = numPoints <= 12 ? 1 : numPoints <= 25 ? 2 : Math.ceil(numPoints / 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    totals.forEach((val, i) => {
        if (i === 0 || i === numPoints - 1 || i % showEveryNthValue === 0) {
            const x = getX(i); const y = getYLeft(val);
            ctx.fillStyle = '#c0392b';
            ctx.font = 'bold 10px Figtree, sans-serif';
            ctx.fillText(val.toLocaleString('fr-FR'), x, y - 8);
        }
    });

    // ========== VALUE LABELS (daily - above bars, adaptive, skip index 0) ==========
    const showEveryNthBar = numPoints <= 15 ? 1 : numPoints <= 30 ? 2 : Math.ceil(numPoints / 15);
    dailySales.forEach((val, i) => {
        if (val === null || val <= 0) return;
        if (i !== numPoints - 1 && i % showEveryNthBar !== 0) return;
        const x = getX(i);
        const barH = (val / niceMaxRight) * drawHeight;
        const barY = paddingTop + drawHeight - barH;
        ctx.fillStyle = isComActiveAtDate(labels[i]) ? '#e67e22' : '#3d7ce0';
        ctx.font = 'bold 9px Figtree, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('+' + val.toLocaleString('fr-FR'), x, barY - 3);
    });

    // ========== DATE LABELS (adaptive) ==========
    ctx.font = '10px Figtree, sans-serif';
    const maxLabelWidth = 70;
    const availablePerLabel = numPoints > 1 ? drawWidth / (numPoints - 1) : drawWidth;
    const showEveryNthLabel = Math.max(1, Math.ceil(maxLabelWidth / availablePerLabel));
    ctx.textBaseline = 'top';
    const shouldRotate = availablePerLabel < 60;

    labels.forEach((label, i) => {
        const isFirst = i === 0; const isLast = i === numPoints - 1;
        if (!isFirst && !isLast && i % showEveryNthLabel !== 0) return;
        const x = getX(i);
        const parts = label.split('-');
        let displayLabel = label;
        if (parts.length === 3) {
            if (numPoints > 5) {
                displayLabel = parts[2] + '/' + parts[1];
                if (numPoints <= 15 || isFirst || isLast) displayLabel += '/' + parts[0].slice(2);
            } else {
                displayLabel = parts[2] + '/' + parts[1] + '/' + parts[0].slice(2);
            }
        }
        ctx.fillStyle = '#999';
        ctx.font = '10px Figtree, sans-serif';
        ctx.textAlign = 'center';
        if (shouldRotate) {
            ctx.save();
            ctx.translate(x, paddingTop + drawHeight + 8);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'right';
            ctx.fillText(displayLabel, 0, 0);
            ctx.restore();
        } else {
            ctx.fillText(displayLabel, x, paddingTop + drawHeight + 8);
        }
    });

    // ========== COM ACTION MARKERS ==========
    // Show count of simultaneous actions: 1 icon = 1 action, 2 = 2, etc. (max 3 shown)
    labels.forEach((label, i) => {
        const count = comCountAtDate(label);
        if (count > 0) {
            const x = getX(i);
            const baseY = paddingTop + drawHeight + (shouldRotate ? 38 : 22);
            // Show stacked markers or a count badge
            if (count === 1) {
                ctx.font = '9px Figtree, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('\u{1F4E3}', x, baseY);
            } else {
                // Multiple: show icon + count
                ctx.font = '9px Figtree, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('\u{1F4E3}', x - 4, baseY);
                // Badge with count
                ctx.fillStyle = '#e67e22';
                ctx.font = 'bold 8px Figtree, sans-serif';
                ctx.fillText('x' + count, x + 9, baseY + 1);
            }
        }
    });

    // ========== TOOLTIP ON HOVER ==========
    let tooltip = document.createElement('div');
    tooltip.style.cssText = 'position: fixed; background: rgba(30,30,40,0.95); color: white; padding: 0.6rem 0.85rem; border-radius: 8px; font-size: 0.82rem; pointer-events: none; z-index: 10000; max-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: none; line-height: 1.5;';
    document.body.appendChild(tooltip);
    canvas._chartTooltip = tooltip;

    const mouseMoveHandler = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = chartWidth / rect.width;
        const mx = (e.clientX - rect.left) * scaleX;

        let closestIndex = -1; let minDist = Infinity;
        totals.forEach((val, i) => {
            const dist = Math.abs(mx - getX(i));
            if (dist < minDist && dist < minSpacingPerPoint) { minDist = dist; closestIndex = i; }
        });

        if (closestIndex !== -1) {
            const date = labels[closestIndex];
            const billets = totals[closestIndex];
            const daily = dailySales[closestIndex];
            const releveData = relevesSorted[closestIndex];

            let detailHtml = '';
            reseaux.forEach(res => {
                const qty = parseInt(releveData[res]) || 0;
                if (qty > 0) detailHtml += '<div style="display:flex;justify-content:space-between;gap:1rem;"><span style="opacity:0.7;">' + res + '</span> <strong>' + qty.toLocaleString('fr-FR') + '</strong></div>';
            });

            const activeActions = getComActionsAtDate(date);

            let content = '<div style="font-weight:700;margin-bottom:4px;">' + formatDateCourte(date) + '</div>';
            content += '<div style="display:flex;gap:1.5rem;align-items:baseline;">';
            content += '<div><span style="color:#e94560;font-weight:700;font-size:1.1em;">' + billets.toLocaleString('fr-FR') + '</span> <span style="opacity:0.6;">cumul\u00e9s</span></div>';
            if (daily !== null) {
                content += '<div><span style="color:' + (activeActions.length > 0 ? '#fdab3d' : '#579bfc') + ';font-weight:700;font-size:1.1em;">+' + daily.toLocaleString('fr-FR') + '</span> <span style="opacity:0.6;">ce jour</span></div>';
            }
            content += '</div>';

            if (detailHtml) {
                content += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.15);">' + detailHtml + '</div>';
            }

            // Show guichet correction in tooltip if applicable
            if (guichetCorrectionValue > 0) {
                const guichet = spectacle.guichet || {};
                content += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.15);font-size:0.8em;">';
                content += '<div style="opacity:0.6;">🏪 Correction guichet : -' + guichetCorrectionValue + ' invendus déduits</div>';
                if ((guichet.ventesReelles || 0) > 0) {
                    content += '<div style="opacity:0.6;">🎫 Ventes guichet réelles : ' + guichet.ventesReelles + '</div>';
                }
                content += '</div>';
            }

            if (activeActions.length > 0) {
                content += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.15);color:#fdab3d;">\u{1F4E3} <strong>' + activeActions.length + ' action(s) com\' active(s) :</strong>';
                activeActions.forEach(function(action) {
                    var dates = action.dateFin
                        ? formatDateCourte(action.dateDebut) + ' \u2192 ' + formatDateCourte(action.dateFin)
                        : formatDateCourte(action.dateDebut);
                    content += '<div style="color:white;">\u2022 ' + action.nom + ' <span style="opacity:0.5">(' + dates + ')</span></div>';
                });
                content += '</div>';
            }

            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            const ttRect = tooltip.getBoundingClientRect();
            let ttLeft = e.clientX + 12; let ttTop = e.clientY - ttRect.height - 10;
            if (ttLeft + ttRect.width > window.innerWidth - 10) ttLeft = e.clientX - ttRect.width - 12;
            if (ttTop < 10) ttTop = e.clientY + 12;
            tooltip.style.left = ttLeft + 'px';
            tooltip.style.top = ttTop + 'px';
        } else {
            tooltip.style.display = 'none';
        }
    };

    const mouseLeaveHandler = () => { tooltip.style.display = 'none'; };
    canvas.addEventListener('mousemove', mouseMoveHandler);
    canvas.addEventListener('mouseleave', mouseLeaveHandler);
    canvas._chartMouseMove = mouseMoveHandler;
    canvas._chartMouseLeave = mouseLeaveHandler;

    // Scroll pour afficher la date du jour (dernier point à droite)
    requestAnimationFrame(() => {
        if (wrapper.scrollWidth > wrapper.clientWidth) {
            wrapper.scrollLeft = wrapper.scrollWidth - wrapper.clientWidth;
        }
    });
}

function renderBilletterieChart() {
    const canvas = document.getElementById('billetterieChart');
    const wrapper = document.getElementById('billetterieChartWrapper');
    if (!canvas || !wrapper || !currentBilletterieSpectacle) return;
    if (billetterieChart) { billetterieChart.destroy(); billetterieChart = null; }
    drawBilletterieChartToCanvas(currentBilletterieSpectacle, canvas, wrapper);
}

function renderSpectacleDetailChart(spectacle) {
    const canvas = document.getElementById('spectacleDetailChart');
    const wrapper = document.getElementById('spectacleDetailChartWrapper');
    if (!canvas || !wrapper || !spectacle) return;
    wrapper.style.display = '';
    drawBilletterieChartToCanvas(spectacle, canvas, wrapper);
}

function renderSpectacleDetailLastReleve(spectacle) {
    const el = document.getElementById('spectacleDetailLastReleve');
    if (!el) return;
    const releves = spectacle.releves || [];
    let reseaux = (spectacle.reseaux && spectacle.reseaux.length > 0)
        ? spectacle.reseaux
        : ((typeof appSettings !== 'undefined' && appSettings.reseauxBilletterie) || []).map(r => String(r || '').toLowerCase().replace(/\s+/g, ''));
    if (reseaux.length === 0) reseaux = ['billetweb'];

    if (releves.length === 0) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }

    const relevesSorted = [...releves].sort((a, b) => {
        const dtA = new Date((a.date || '') + 'T' + (a.heure || '12:00:00'));
        const dtB = new Date((b.date || '') + 'T' + (b.heure || '12:00:00'));
        return dtB - dtA;
    });
    const lastReleve = relevesSorted[0];

    function calcTotaux(r) {
        let tb = 0, tc = 0;
        reseaux.forEach(res => {
            tb += parseInt(r[res]) || 0;
            tc += parseFloat(r[res + '_ca']) || 0;
        });
        return { totalBillets: tb, totalCA: tc };
    }
    const totaux = calcTotaux(lastReleve);

    el.style.display = '';
    el.innerHTML = `
        <div class="last-releve-title">Dernier relevé</div>
        <div class="last-releve-table-wrap">
            <table class="last-releve-table">
                <thead>
                    <tr>
                        <th>Date / Heure</th>
                        ${reseaux.map(r => `<th colspan="2">${r}</th>`).join('')}
                        <th>Total</th>
                        <th>CA Total</th>
                    </tr>
                    <tr>
                        <th></th>
                        ${reseaux.map(() => `<th>Billets</th><th>CA €</th>`).join('')}
                        <th></th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${lastReleve.date || ''} ${lastReleve.heure || ''}</td>
                        ${reseaux.map(r => `
                            <td>${lastReleve[r] || 0}</td>
                            <td>${(lastReleve[r + '_ca'] || 0).toFixed(2)}</td>
                        `).join('')}
                        <td style="font-weight: 700;">${totaux.totalBillets}</td>
                        <td style="font-weight: 700; color: var(--success);">${totaux.totalCA.toFixed(2)} €</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function saveBilletterieData() {
    const projectIndex = projects.findIndex(p => p.id === currentBilletterieSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentBilletterieSpectacle;
    }
    saveProjectsAsync();
    updateBilletterieStats();
}

// ============================================
// GUICHET PHYSIQUE
// ============================================

// Returns the number of unsold guichet places to deduct from billetweb totals
function getGuichetCorrection(spectacle) {
    const guichet = spectacle?.guichet;
    if (!guichet || !guichet.stockReserve || guichet.stockReserve <= 0) return 0;
    return Math.max(0, (guichet.stockReserve || 0) - (guichet.ventesReelles || 0));
}

// Helper to compute the corrected total for a given releve (used in evolution etc.)
function getCorrectTotalForReleve(spectacle, releve) {
    if (!releve) return 0;
    const reseaux = spectacle.reseaux || [];
    let total = 0;
    for (let reseau of reseaux) {
        total += parseInt(releve[reseau]) || 0;
    }
    total -= getGuichetCorrection(spectacle);
    return Math.max(0, total);
}

function loadGuichetData() {
    renderGuichetDisplay();
}

function updateGuichetData() {
    saveBilletterieData();
    renderGuichetDisplay();
    renderBilletterieChart();
}

function renderGuichetDisplay() {
    var zone = document.getElementById('guichetDisplayZone');
    if (!zone) return;

    var guichet = currentBilletterieSpectacle.guichet || {};
    var stockReserve = guichet.stockReserve || 0;
    var ventesReelles = guichet.ventesReelles || 0;
    var ca = guichet.ca || 0;
    var tarifs = guichet.tarifs || [];
    var hasTarifs = tarifs.length > 0 && tarifs.some(function(t) { return t.quantite > 0 || t.nom; });

    if (!hasTarifs && stockReserve <= 0) {
        zone.innerHTML = '<p style="color: #a0aec0; font-size: 0.88rem; text-align: center; padding: 0.5rem 0;">Aucune vente guichet configurée. Cliquez sur le bouton ci-dessous pour commencer.</p>';
        return;
    }

    var html = '';

    if (hasTarifs) {
        html += '<div style="font-size: 0.82rem; margin-bottom: 0.5rem;">';
        tarifs.forEach(function(t) {
            if (!t.quantite && !t.nom) return;
            var lineCA = ((t.prix || 0) * (t.quantite || 0)).toFixed(2);
            html += '<div style="display: flex; justify-content: space-between; padding: 0.3rem 0; color: var(--mn-text, #2d3748);">';
            html += '<span>' + (t.nom || 'Sans nom') + ' — <strong>' + (t.quantite || 0) + '</strong> x ' + (t.prix || 0).toFixed(2) + ' &euro;</span>';
            html += '<span style="font-weight: 600; color: #00b894;">' + lineCA + ' &euro;</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    html += '<div style="display: flex; gap: 1rem; flex-wrap: wrap; padding: 0.6rem 0.75rem; background: var(--mn-bg, #f7fafc); border-radius: var(--mn-radius, 8px); font-size: 0.85rem; align-items: center;">';
    if (stockReserve > 0) {
        var invendus = Math.max(0, stockReserve - ventesReelles);
        var taux = Math.round((ventesReelles / stockReserve) * 100);
        html += '<div><span style="color: var(--mn-text-secondary);">Stock :</span> <strong>' + stockReserve + '</strong></div>';
        html += '<div><span style="color: var(--mn-text-secondary);">Vendus :</span> <strong style="color: #00b894;">' + ventesReelles + '</strong></div>';
        html += '<div><span style="color: var(--mn-text-secondary);">Invendus :</span> <strong style="color: ' + (invendus > 0 ? '#e94560' : '#00b894') + ';">' + invendus + '</strong> <span style="font-size: 0.78rem; color: var(--mn-text-secondary);">(déduits)</span></div>';
        html += '<div><span style="color: var(--mn-text-secondary);">Taux :</span> <strong>' + taux + '%</strong></div>';
    } else if (ventesReelles > 0) {
        html += '<div><span style="color: var(--mn-text-secondary);">Vendus :</span> <strong style="color: #00b894;">' + ventesReelles + ' billets</strong></div>';
    }
    html += '<div style="margin-left: auto;"><span style="color: var(--mn-text-secondary);">CA :</span> <strong style="color: #00b894; font-size: 1rem;">' + ca.toFixed(2) + ' &euro;</strong></div>';
    html += '</div>';

    zone.innerHTML = html;
}

// ============================================
// GUICHET — MODALE TARIFS
// ============================================

var _guichetTempTarifs = [];

function openGuichetTarifsModal() {
    var guichet = currentBilletterieSpectacle.guichet || {};
    var tarifs = guichet.tarifs ? JSON.parse(JSON.stringify(guichet.tarifs)) : [];

    if (tarifs.length === 0) {
        var cats = currentBilletterieSpectacle.billetCategories || [];
        if (cats.length > 0) {
            tarifs = cats.map(function(cat) {
                return { nom: cat.nom || '', prix: cat.prix || 0, quantite: 0 };
            });
        } else {
            tarifs = [{ nom: '', prix: 0, quantite: 0 }];
        }
    }

    _guichetTempTarifs = tarifs;

    var stockInput = document.getElementById('guichetModalStockReserve');
    if (stockInput) stockInput.value = guichet.stockReserve || 0;

    renderGuichetTarifsLines();
    document.getElementById('guichetTarifsModal').classList.add('active');
}

function closeGuichetTarifsModal() {
    document.getElementById('guichetTarifsModal').classList.remove('active');
    _guichetTempTarifs = [];
}

function renderGuichetTarifsLines() {
    var container = document.getElementById('guichetTarifsLines');
    var totalBillets = 0;
    var totalCA = 0;

    container.innerHTML = _guichetTempTarifs.map(function(t, i) {
        var lineCA = (t.prix || 0) * (t.quantite || 0);
        totalBillets += (t.quantite || 0);
        totalCA += lineCA;
        return '<div class="guichet-tarif-line" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 0.5rem; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #edf2f7;">' +
            '<input type="text" value="' + (t.nom || '').replace(/"/g, '&quot;') + '" placeholder="Nom du tarif" ' +
                'onchange="updateGuichetTarif(' + i + ',\'nom\',this.value)" ' +
                'style="padding: 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: var(--mn-radius, 8px); font-size: 0.88rem;">' +
            '<input type="number" value="' + (t.prix || 0) + '" step="0.01" min="0" placeholder="Prix" ' +
                'oninput="recalcGuichetTarifLine(' + i + ')" ' +
                'style="padding: 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: var(--mn-radius, 8px); font-size: 0.88rem; text-align: right;">' +
            '<input type="number" value="' + (t.quantite || 0) + '" min="0" placeholder="Qté" ' +
                'oninput="recalcGuichetTarifLine(' + i + ')" ' +
                'style="padding: 0.5rem; border: 1px solid var(--mn-border, #e2e8f0); border-radius: var(--mn-radius, 8px); font-size: 0.88rem; text-align: right;">' +
            '<div id="guichetTarifLineCA_' + i + '" style="text-align: right; font-weight: 600; color: #00b894; font-size: 0.88rem; white-space: nowrap;">' + lineCA.toFixed(2) + ' &euro;</div>' +
            '<button onclick="removeGuichetTarif(' + i + ')" style="background: none; border: none; color: #e53e3e; cursor: pointer; font-size: 1.1rem; padding: 0.3rem; line-height: 1;">&#10005;</button>' +
        '</div>';
    }).join('');

    document.getElementById('guichetTarifsTotalBillets').textContent = totalBillets;
    document.getElementById('guichetTarifsTotalCA').textContent = totalCA.toFixed(2) + ' €';
}

function recalcGuichetTarifLine(index) {
    var lines = document.querySelectorAll('#guichetTarifsLines .guichet-tarif-line');
    var totalBillets = 0;
    var totalCA = 0;

    lines.forEach(function(line, i) {
        var inputs = line.querySelectorAll('input');
        var prix = parseFloat(inputs[1].value) || 0;
        var quantite = parseInt(inputs[2].value) || 0;
        var lineCA = prix * quantite;
        totalBillets += quantite;
        totalCA += lineCA;

        var caEl = document.getElementById('guichetTarifLineCA_' + i);
        if (caEl) caEl.innerHTML = lineCA.toFixed(2) + ' &euro;';

        if (_guichetTempTarifs[i]) {
            _guichetTempTarifs[i].nom = inputs[0].value;
            _guichetTempTarifs[i].prix = prix;
            _guichetTempTarifs[i].quantite = quantite;
        }
    });

    document.getElementById('guichetTarifsTotalBillets').textContent = totalBillets;
    document.getElementById('guichetTarifsTotalCA').textContent = totalCA.toFixed(2) + ' €';
}

function updateGuichetTarif(index, field, value) {
    if (!_guichetTempTarifs[index]) return;
    _guichetTempTarifs[index][field] = value;
}

function addGuichetTarif() {
    _guichetTempTarifs.push({ nom: '', prix: 0, quantite: 0 });
    renderGuichetTarifsLines();
}

function removeGuichetTarif(index) {
    _guichetTempTarifs.splice(index, 1);
    if (_guichetTempTarifs.length === 0) {
        _guichetTempTarifs.push({ nom: '', prix: 0, quantite: 0 });
    }
    renderGuichetTarifsLines();
}

function saveGuichetTarifs() {
    var lines = document.querySelectorAll('#guichetTarifsLines .guichet-tarif-line');
    lines.forEach(function(line, i) {
        var inputs = line.querySelectorAll('input');
        if (_guichetTempTarifs[i]) {
            _guichetTempTarifs[i].nom = inputs[0].value.trim();
            _guichetTempTarifs[i].prix = parseFloat(inputs[1].value) || 0;
            _guichetTempTarifs[i].quantite = parseInt(inputs[2].value) || 0;
        }
    });

    var validTarifs = _guichetTempTarifs.filter(function(t) { return t.nom || t.quantite > 0; });

    var totalBillets = 0;
    var totalCA = 0;
    validTarifs.forEach(function(t) {
        totalBillets += (t.quantite || 0);
        totalCA += (t.prix || 0) * (t.quantite || 0);
    });

    var stockReserve = parseInt((document.getElementById('guichetModalStockReserve') || {}).value) || 0;

    if (!currentBilletterieSpectacle.guichet) {
        currentBilletterieSpectacle.guichet = {};
    }
    currentBilletterieSpectacle.guichet.tarifs = validTarifs;
    currentBilletterieSpectacle.guichet.ventesReelles = totalBillets;
    currentBilletterieSpectacle.guichet.ca = totalCA;
    currentBilletterieSpectacle.guichet.stockReserve = stockReserve;

    saveBilletterieData();
    renderGuichetDisplay();
    renderBilletterieChart();
    closeGuichetTarifsModal();
}

// ============================================
// INVITATIONS — TEMPLATE BILLET + APERÇU
// ============================================

function getInvitationTicketTemplateDefaults() {
    const d = (appSettings && appSettings.invitationTicketDefaults) ? appSettings.invitationTicketDefaults : {};
    return {
        // override spectacle
        logo: '',
        partnerIds: [],
        // texts
        badgeText: d.badgeText || 'INVITATION',
        labelValidFor: d.labelValidFor || 'Invitation valable pour :',
        // colors
        headerColor1: d.headerColor1 || '#1e3c72',
        headerColor2: d.headerColor2 || '#2a5298',
        goldColor: d.goldColor || '#d7b14a',
        // blocks
        footerText: d.footerText || 'Merci de présenter ce billet à l’entrée.\nCe billet peut être scanné sur smartphone.\n\nContact : contact@tonsite.com',
        showPoster: d.showPoster !== false,
        showQr: d.showQr !== false,
        layoutMode: 'classic',
        invitationLayoutUseGlobal: true,
        customBackground: '',
        customBackgroundScale: 1,
        customZones: []
    };
}

function ensureInvitationTicketTemplateOnSpectacle() {
    if (!currentBilletterieSpectacle) return getInvitationTicketTemplateDefaults();
    if (!currentBilletterieSpectacle.invitationTicketTemplate) {
        currentBilletterieSpectacle.invitationTicketTemplate = getInvitationTicketTemplateDefaults();
    } else {
        // merge new defaults without overriding existing
        const d = getInvitationTicketTemplateDefaults();
        currentBilletterieSpectacle.invitationTicketTemplate = Object.assign({}, d, currentBilletterieSpectacle.invitationTicketTemplate || {});
    }
    return currentBilletterieSpectacle.invitationTicketTemplate;
}

function _invTplEl(id) {
    return document.getElementById(id);
}

function _invTplGetPartnersLibrary() {
    const list = (appSettings && Array.isArray(appSettings.partners)) ? appSettings.partners : [];
    return list.filter(p => p && (p.id || p.name || p.logo));
}

function _invTplEnsurePartnerIds(tpl) {
    if (!tpl) return [];
    if (!Array.isArray(tpl.partnerIds)) tpl.partnerIds = [];
    // normalize to strings
    tpl.partnerIds = tpl.partnerIds.map(String).filter(Boolean);
    return tpl.partnerIds;
}

let _invTplPartnerLogoDataUrl = '';

function invTplResetPartnerLogoDropzone() {
    _invTplPartnerLogoDataUrl = '';
    const fi = _invTplEl('invTplPartnerLogoFile');
    const prev = _invTplEl('invTplPartnerLogoPreview');
    const hint = _invTplEl('invTplPartnerLogoDropHint');
    const dz = _invTplEl('invTplPartnerLogoDropzone');
    if (fi) fi.value = '';
    if (prev) {
        prev.removeAttribute('src');
        prev.style.display = 'none';
    }
    if (hint) hint.style.display = '';
    if (dz) dz.style.borderColor = 'var(--mn-border, #e2e8f0)';
}

function invTplReadPartnerLogoFile(file) {
    if (!file || !file.type.match(/^image\//)) {
        alert('Veuillez choisir un fichier image (PNG, JPG, WebP, etc.).');
        return;
    }
    const r = new FileReader();
    r.onload = function () {
        _invTplPartnerLogoDataUrl = r.result || '';
        const prev = _invTplEl('invTplPartnerLogoPreview');
        const hint = _invTplEl('invTplPartnerLogoDropHint');
        if (prev) {
            prev.src = _invTplPartnerLogoDataUrl;
            prev.style.display = 'block';
        }
        if (hint) hint.style.display = 'none';
    };
    r.onerror = function () {
        alert('Impossible de lire le fichier.');
    };
    r.readAsDataURL(file);
}

function invTplWirePartnerLogoDropzone() {
    const dz = _invTplEl('invTplPartnerLogoDropzone');
    const fi = _invTplEl('invTplPartnerLogoFile');
    if (!dz || !fi || dz._invTplPartnerLogoBound) return;
    dz._invTplPartnerLogoBound = true;
    dz.addEventListener('click', function (e) {
        if (e.target === fi) return;
        fi.click();
    });
    fi.addEventListener('change', function () {
        const f = fi.files && fi.files[0];
        if (f) invTplReadPartnerLogoFile(f);
    });
    dz.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.style.borderColor = 'var(--mn-primary, #6161ff)';
    });
    dz.addEventListener('dragleave', function (e) {
        e.preventDefault();
        dz.style.borderColor = 'var(--mn-border, #e2e8f0)';
    });
    dz.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.style.borderColor = 'var(--mn-border, #e2e8f0)';
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) invTplReadPartnerLogoFile(f);
    });
}

function invTplOpenAddPartnerForm() {
    const f = _invTplEl('invTplAddPartnerForm');
    if (f) f.style.display = '';
    invTplWirePartnerLogoDropzone();
    invTplResetPartnerLogoDropzone();
}

function invTplCloseAddPartnerForm() {
    const f = _invTplEl('invTplAddPartnerForm');
    if (f) f.style.display = 'none';
    const n = _invTplEl('invTplNewPartnerName');
    if (n) n.value = '';
    invTplResetPartnerLogoDropzone();
}

function invTplClearPartners() {
    if (!currentBilletterieSpectacle) return;
    const tpl = ensureInvitationTicketTemplateOnSpectacle();
    tpl.partnerIds = [];
    invTplRenderPartnersList();
    renderInvitationTicketPreview();
}

function invTplTogglePartner(id, checked) {
    if (!currentBilletterieSpectacle) return;
    const tpl = ensureInvitationTicketTemplateOnSpectacle();
    const ids = _invTplEnsurePartnerIds(tpl);
    const sid = String(id);
    if (checked) {
        if (ids.indexOf(sid) === -1) ids.push(sid);
    } else {
        tpl.partnerIds = ids.filter(x => x !== sid);
    }
    renderInvitationTicketPreview();
}

function invTplRenderPartnersList() {
    const wrap = _invTplEl('invTplPartnersList');
    if (!wrap) return;
    if (!currentBilletterieSpectacle) {
        wrap.innerHTML = `<div style="color:#64748b;font-size:0.85rem;">Aucun spectacle sélectionné.</div>`;
        return;
    }
    const tpl = ensureInvitationTicketTemplateOnSpectacle();
    const selected = new Set(_invTplEnsurePartnerIds(tpl));
    const partners = _invTplGetPartnersLibrary();
    if (partners.length === 0) {
        wrap.innerHTML = `<div style="color:#64748b;font-size:0.85rem;">Aucun partenaire dans la bibliothèque. Cliquez sur “Nouveau partenaire”.</div>`;
        return;
    }
    wrap.innerHTML = partners.map(p => {
        const pid = String(p.id || '');
        const isChecked = selected.has(pid);
        const logo = p.logo ? `<img src="${p.logo}" alt="" style="width:26px;height:26px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid var(--mn-border,#e2e8f0);">` : `<div style="width:26px;height:26px;border-radius:6px;background:#f1f5f9;border:1px solid var(--mn-border,#e2e8f0);display:flex;align-items:center;justify-content:center;">🤝</div>`;
        const name = _escapeHtmlSafe(p.name || 'Partenaire');
        return `
            <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer; user-select:none;">
                <input type="checkbox" data-partner-id="${pid}" ${isChecked ? 'checked' : ''} style="transform: translateY(-0.5px);">
                ${logo}
                <span style="font-weight:600; font-size:0.88rem; color: var(--mn-text,#2d3748);">${name}</span>
            </label>
        `;
    }).join('');

    // Bind once per render (safe): attach change handlers
    wrap.querySelectorAll('input[type="checkbox"][data-partner-id]').forEach(cb => {
        if (cb._invTplBound) return;
        cb._invTplBound = true;
        cb.addEventListener('change', function() {
            const id = this.getAttribute('data-partner-id');
            invTplTogglePartner(id, !!this.checked);
        });
    });
}

function invTplOnLayoutModeChange() {
    const useGlobal = _invTplEl('invTplUseGlobalLayout') ? !!_invTplEl('invTplUseGlobalLayout').checked : true;
    const hint = document.getElementById('invTplGlobalLayoutHint');
    const specBlock = document.getElementById('invTplSpectacleLayoutBlock');
    if (hint) hint.style.display = useGlobal ? '' : 'none';
    if (specBlock) specBlock.style.display = useGlobal ? 'none' : '';

    const d = (appSettings && appSettings.invitationTicketDefaults) ? appSettings.invitationTicketDefaults : {};
    const effIsCustom = useGlobal ? (d.layoutMode === 'custom') : (_invTplEl('invTplLayoutMode')?.value === 'custom');
    const box = document.getElementById('invTplClassicLooks');
    if (box) box.style.display = effIsCustom ? 'none' : '';
    renderInvitationTicketPreview();
}

function invTplAddPartnerFromSpectacle() {
    if (!currentBilletterieSpectacle) return;
    const name = (_invTplEl('invTplNewPartnerName')?.value || '').trim();
    const logo = (_invTplPartnerLogoDataUrl || '').trim();
    if (!name) {
        alert('Nom du partenaire requis.');
        return;
    }
    if (!logo) {
        alert('Importez un fichier image pour le logo (glisser-déposer ou clic).');
        return;
    }
    if (!appSettings) window.appSettings = {};
    if (!Array.isArray(appSettings.partners)) appSettings.partners = [];
    const id = 'p_' + Math.random().toString(36).slice(2, 10);
    appSettings.partners.push({ id, name, logo });
    if (typeof saveSettings === 'function') saveSettings();

    const tpl = ensureInvitationTicketTemplateOnSpectacle();
    const ids = _invTplEnsurePartnerIds(tpl);
    if (ids.indexOf(String(id)) === -1) ids.push(String(id));
    tpl.partnerIds = ids;

    invTplCloseAddPartnerForm();
    invTplRenderPartnersList();
    renderInvitationTicketPreview();
    showToast('Partenaire ajouté', 'success');
}

function openInvitationTicketTemplateModal() {
    if (!currentBilletterieSpectacle) {
        alert('Aucun spectacle sélectionné.');
        return;
    }
    const tpl = ensureInvitationTicketTemplateOnSpectacle();

    const logoFallback = (tpl.logo || (appSettings && appSettings.logo) || localStorage.getItem('appLogo') || '');
    const prenom = (_invTplEl('invTplPreviewPrenom')?.value || '').trim();
    const nom = (_invTplEl('invTplPreviewNom')?.value || '').trim();
    const code = (_invTplEl('invTplPreviewCode')?.value || '').trim();

    _invTplEl('invTplLogo').value = tpl.logo || '';
    _invTplEl('invTplBadgeText').value = tpl.badgeText || 'INVITATION';
    _invTplEl('invTplLabelValidFor').value = tpl.labelValidFor || (appSettings?.invitationTicketDefaults?.labelValidFor) || 'Invitation valable pour :';
    _invTplEl('invTplColor1').value = tpl.headerColor1 || '#1e3c72';
    _invTplEl('invTplColor2').value = tpl.headerColor2 || '#2a5298';
    _invTplEl('invTplGoldColor').value = tpl.goldColor || (appSettings?.invitationTicketDefaults?.goldColor) || '#d7b14a';
    _invTplEl('invTplFooter').value = tpl.footerText || '';
    _invTplEl('invTplShowPoster').checked = !!tpl.showPoster;
    _invTplEl('invTplShowQr').checked = tpl.showQr !== false;
    if (_invTplEl('invTplPosterFit')) _invTplEl('invTplPosterFit').value = tpl.posterFit || (appSettings?.invitationTicketDefaults?.posterFit) || 'contain';
    if (_invTplEl('invTplLayoutMode')) _invTplEl('invTplLayoutMode').value = tpl.layoutMode === 'custom' ? 'custom' : 'classic';
    if (_invTplEl('invTplUseGlobalLayout')) _invTplEl('invTplUseGlobalLayout').checked = tpl.invitationLayoutUseGlobal !== false;

    invTplRenderPartnersList();

    // defaults for preview identity
    if (!prenom) _invTplEl('invTplPreviewPrenom').value = 'Marie';
    if (!nom) _invTplEl('invTplPreviewNom').value = 'Dupont';
    if (!code) _invTplEl('invTplPreviewCode').value = 'INVIT-AB12CD';

    // Live update
    ['invTplLogo','invTplBadgeText','invTplLabelValidFor','invTplColor1','invTplColor2','invTplGoldColor','invTplFooter','invTplShowPoster','invTplShowQr','invTplPosterFit','invTplLayoutMode','invTplUseGlobalLayout','invTplPreviewPrenom','invTplPreviewNom','invTplPreviewCode']
        .forEach(function(id) {
            const el = _invTplEl(id);
            if (!el) return;
            if (el._invTplBound) return;
            el._invTplBound = true;
            const evt = (el.tagName === 'TEXTAREA' || el.type === 'text') ? 'input' : 'change';
            el.addEventListener(evt, function() {
                renderInvitationTicketPreview();
            });
        });

    document.getElementById('invitationTicketTemplateModal').classList.add('active');
    invTplWirePartnerLogoDropzone();
    invTplOnLayoutModeChange();
}

function closeInvitationTicketTemplateModal() {
    document.getElementById('invitationTicketTemplateModal').classList.remove('active');
}

function resetInvitationTicketTemplate() {
    if (!currentBilletterieSpectacle) return;
    currentBilletterieSpectacle.invitationTicketTemplate = getInvitationTicketTemplateDefaults();
    saveBilletterieData();
    openInvitationTicketTemplateModal();
}

function saveInvitationTicketTemplateFromModal() {
    if (!currentBilletterieSpectacle) return;
    const tpl = ensureInvitationTicketTemplateOnSpectacle();
    tpl.logo = (_invTplEl('invTplLogo')?.value || '').trim();
    tpl.badgeText = (_invTplEl('invTplBadgeText')?.value || 'INVITATION').trim() || 'INVITATION';
    tpl.labelValidFor = (_invTplEl('invTplLabelValidFor')?.value || 'Invitation valable pour :').trim() || 'Invitation valable pour :';
    tpl.headerColor1 = _invTplEl('invTplColor1')?.value || '#1e3c72';
    tpl.headerColor2 = _invTplEl('invTplColor2')?.value || '#2a5298';
    tpl.goldColor = _invTplEl('invTplGoldColor')?.value || '#d7b14a';
    tpl.footerText = _invTplEl('invTplFooter')?.value || '';
    tpl.showPoster = !!_invTplEl('invTplShowPoster')?.checked;
    tpl.showQr = !!_invTplEl('invTplShowQr')?.checked;
    tpl.posterFit = (_invTplEl('invTplPosterFit')?.value || tpl.posterFit || (appSettings?.invitationTicketDefaults?.posterFit) || 'contain');
    tpl.invitationLayoutUseGlobal = !!_invTplEl('invTplUseGlobalLayout')?.checked;
    tpl.layoutMode = (_invTplEl('invTplLayoutMode')?.value === 'custom') ? 'custom' : 'classic';
    _invTplEnsurePartnerIds(tpl);
    currentBilletterieSpectacle.invitationTicketTemplate = tpl;
    saveBilletterieData();
    showToast('Template billet enregistré', 'success');
    renderInvitationTicketPreview();
}

let _qriousLoading = null;
function ensureQRious() {
    if (window.QRious) return Promise.resolve(window.QRious);
    if (_qriousLoading) return _qriousLoading;
    _qriousLoading = new Promise(function(resolve, reject) {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = function() { resolve(window.QRious); };
        s.onerror = function() { reject(new Error('QR lib load failed')); };
        document.head.appendChild(s);
    });
    return _qriousLoading;
}

function _escapeHtmlSafe(txt) {
    if (typeof escapeHtml === 'function') return escapeHtml(txt);
    return String(txt || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function _formatSpectacleDateForTicket(s) {
    if (!s) return '';
    if (typeof formatDate === 'function') return formatDate(s.date);
    return s.date || '';
}

function _getSpectacleLieuTextForTicket(s) {
    try {
        const lid = s?.lieuId || s?.tech?.lieuId;
        const lieu = (typeof getLieuById === 'function' && lid) ? getLieuById(lid) : null;
        if (lieu) {
            const parts = [];
            if (lieu.nom) parts.push(lieu.nom);
            if (lieu.ville) parts.push(lieu.ville);
            if (parts.length > 0) return parts.join(' — ');
        }
    } catch(e) {}
    const loc = (s?.location || s?.lieu || '').toString().trim();
    const city = (s?.city || '').toString().trim();
    if (loc && city) return loc + ' — ' + city;
    if (loc) return loc;
    return city || '';
}

async function renderInvitationTicketPreview() {
    if (!currentBilletterieSpectacle) return;
    const frame = document.getElementById('invitationTicketPreviewFrame');
    if (!frame) return;

    const tpl = ensureInvitationTicketTemplateOnSpectacle();
    const useGlobal = _invTplEl('invTplUseGlobalLayout') ? !!_invTplEl('invTplUseGlobalLayout').checked : (tpl.invitationLayoutUseGlobal !== false);

    const mergeInput = Object.assign({}, tpl, {
        invitationLayoutUseGlobal: useGlobal
    });
    if (!useGlobal) {
        mergeInput.layoutMode = (_invTplEl('invTplLayoutMode')?.value === 'custom') ? 'custom' : 'classic';
    }

    const eff = (typeof window.invitationTicketMergeEffectiveTemplate === 'function')
        ? window.invitationTicketMergeEffectiveTemplate(mergeInput)
        : mergeInput;

    const tplFromModal = {
        logo: (_invTplEl('invTplLogo')?.value || '').trim(),
        badgeText: (_invTplEl('invTplBadgeText')?.value || tpl.badgeText || 'INVITATION').trim() || 'INVITATION',
        labelValidFor: (_invTplEl('invTplLabelValidFor')?.value || tpl.labelValidFor || 'Invitation valable pour :').trim() || 'Invitation valable pour :',
        headerColor1: _invTplEl('invTplColor1')?.value || tpl.headerColor1 || '#1e3c72',
        headerColor2: _invTplEl('invTplColor2')?.value || tpl.headerColor2 || '#2a5298',
        goldColor: _invTplEl('invTplGoldColor')?.value || tpl.goldColor || '#d7b14a',
        footerText: _invTplEl('invTplFooter')?.value ?? tpl.footerText ?? '',
        showPoster: !!_invTplEl('invTplShowPoster')?.checked,
        showQr: !!_invTplEl('invTplShowQr')?.checked,
        posterFit: (_invTplEl('invTplPosterFit')?.value || tpl.posterFit || (appSettings?.invitationTicketDefaults?.posterFit) || 'contain'),
        partnerIds: _invTplEnsurePartnerIds(tpl),
        layoutMode: eff.layoutMode === 'custom' ? 'custom' : 'classic',
        customBackground: eff.customBackground || '',
        customBackgroundScale: (function () {
            var x = Number(eff.customBackgroundScale);
            return isFinite(x) && x > 0 ? x : 1;
        })(),
        customZones: Array.isArray(eff.customZones) ? eff.customZones : []
    };

    const prenom = (_invTplEl('invTplPreviewPrenom')?.value || 'Marie').trim();
    const nom = (_invTplEl('invTplPreviewNom')?.value || 'Dupont').trim();
    const code = (_invTplEl('invTplPreviewCode')?.value || 'INVIT-AB12CD').trim();

    const s = currentBilletterieSpectacle;
    const vis = (typeof getVisuelReference === 'function') ? getVisuelReference(s) : null;
    const affiche = vis ? (vis.base64 || vis.url || '') : '';

    const logoFinal = tplFromModal.logo
        || tpl.logo
        || (appSettings?.invitationTicketDefaults?.mainLogo)
        || (appSettings && appSettings.logo)
        || localStorage.getItem('appLogo')
        || '';
    const eventName = s.name || s.nom || 'Spectacle';
    const dateTxt = _formatSpectacleDateForTicket(s);
    const lieuTxt = _getSpectacleLieuTextForTicket(s);

    const partnersLib = _invTplGetPartnersLibrary();
    const partnerLogos = (tplFromModal.partnerIds || []).map(id => partnersLib.find(p => String(p.id) === String(id))).filter(p => p && p.logo);

    let qrDataUrl = '';
    if (tplFromModal.showQr) {
        try {
            await ensureQRious();
            const qr = new window.QRious({
                value: code,
                size: 240,
                level: 'M'
            });
            qrDataUrl = qr.toDataURL('image/png');
        } catch(e) {
            qrDataUrl = '';
        }
    }

    const footerHtml = _escapeHtmlSafe(String(tplFromModal.footerText || '')).replace(/\n/g, '<br>');
    const showPoster = !!tplFromModal.showPoster && !!affiche;
    const showQr = !!tplFromModal.showQr;

    const useCustomPreview = tplFromModal.layoutMode === 'custom'
        && Array.isArray(tplFromModal.customZones)
        && tplFromModal.customZones.length > 0
        && typeof window.invitationTicketRenderCustomTicketInnerHtml === 'function';

    if (useCustomPreview) {
        const dateLine = dateTxt
            ? (dateTxt + (s.time ? ' à ' + String(s.time) : ''))
            : (s.time ? String(s.time) : '');
        const partnersInnerHtml = partnerLogos.length
            ? partnerLogos.map(function (p) {
                return '<img src="' + p.logo + '" alt="" style="max-height:52px;max-width:150px;object-fit:contain;">';
            }).join('')
            : '';
        const tplCustom = Object.assign({}, tplFromModal, {
            layoutMode: 'custom',
            customBackground: tplFromModal.customBackground,
            customZones: tplFromModal.customZones
        });
        const ctx = {
            eventName: eventName,
            guestFullName: (prenom + ' ' + nom).trim() || 'Invité',
            lieuTxt: lieuTxt,
            dateLine: dateLine,
            badgeText: tplFromModal.badgeText,
            labelValid: tplFromModal.labelValidFor,
            footerHtml: footerHtml,
            affiche: (tplFromModal.showPoster && affiche) ? affiche : '',
            qrDataUrl: qrDataUrl,
            code: code,
            partnersInnerHtml: partnersInnerHtml,
            logoFinal: logoFinal
        };
        const inner = window.invitationTicketRenderCustomTicketInnerHtml(tplCustom, ctx);
        const customCss = typeof window.invitationTicketCustomTicketPrintCss === 'function'
            ? window.invitationTicketCustomTicketPrintCss()
            : '';
        const htmlCustom = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Billet Invitation</title>
<style>
@page { size: A4; margin: 0; }
body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
${customCss}
</style>
</head>
<body>
<div class="ticket ticket-custom">${inner}</div>
</body>
</html>`;
        frame.srcdoc = htmlCustom;
        return;
    }

    const posterFit = (tplFromModal.posterFit === 'cover') ? 'cover' : 'contain';
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Billet Invitation</title>
<style>
@page { size: A4; margin: 0; }
body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
.ticket{
  width:190mm; height:277mm; margin:0 auto;
  background:#fff; border-radius:10px; overflow:hidden;
  box-shadow:0 0 10px rgba(0,0,0,0.1);
  display:flex; flex-direction:column;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
.topbar{
  background: linear-gradient(90deg, ${tplFromModal.headerColor1}, ${tplFromModal.headerColor2});
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
  background:${tplFromModal.goldColor};
  color:#fff;
  text-align:center;
  padding:6px 10mm;
  font-weight:800;
  letter-spacing:2px;
}
.main{ display:flex; flex:1; min-height:0; }
.poster{ width:40%; background:transparent; }
.poster img{ width:100%; height:100%; object-fit:${posterFit}; object-position:center; display:block; background-color:transparent; }
.right{ width:${showPoster ? '60%' : '100%'}; padding:10mm; display:flex; flex-direction:column; gap:6px; }
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
}
.perfo{
  width:0;
  border-left:2px dashed #cbd5e1;
  margin:0 2mm;
}
.qrbox{
  width:42mm;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:6px;
}
.qrbox img{ width:34mm; height:34mm; object-fit:contain; }
.qr-missing{ color:#64748b; font-size:12px; text-align:center; }
.code{ font-weight:800; letter-spacing:0.5px; font-size:12px; }
.bottombar{
  background: linear-gradient(90deg, ${tplFromModal.headerColor1}, ${tplFromModal.headerColor2});
  color:#fff;
  padding:8px 10mm;
  font-weight:800;
  letter-spacing:1px;
  text-align:left;
}
</style>
</head>
<body>
<div class="ticket">
  <div class="topbar">
    <div class="topbar-left" style="min-width:0;">
      <div class="topbar-title">${_escapeHtmlSafe(eventName)}</div>
      <div class="topbar-sub">${_escapeHtmlSafe(dateTxt)}${dateTxt && lieuTxt ? ' • ' : ''}${_escapeHtmlSafe(lieuTxt)}</div>
    </div>
    <div class="topbar-right">
      ${partnerLogos.length ? `<div class="partners">${partnerLogos.map(p => `<img src="${p.logo}" alt="">`).join('')}</div>` : ''}
      ${logoFinal ? `<img src="${logoFinal}" alt="logo">` : ''}
    </div>
  </div>
  <div class="goldbar">${_escapeHtmlSafe(tplFromModal.badgeText)}</div>
  <div class="main">
    ${showPoster ? `<div class="poster"><img src="${affiche}" alt="affiche"></div>` : ''}
    <div class="right">
      <div class="validfor">${_escapeHtmlSafe(tplFromModal.labelValidFor)}</div>
      <div class="guest">${_escapeHtmlSafe(prenom)} ${_escapeHtmlSafe(nom)}</div>

      <div class="eventname">${_escapeHtmlSafe(eventName)}</div>
      ${lieuTxt ? `<div class="line">${_escapeHtmlSafe(lieuTxt)}</div>` : ''}
      ${dateTxt ? `<div class="line">Date : ${_escapeHtmlSafe(dateTxt)}</div>` : ''}

      <div class="right-bottom">
        <div class="notes">${footerHtml}</div>
        ${showQr ? `
          <div class="perfo"></div>
          <div class="qrbox">
            ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code">` : `<div class="qr-missing">QR indisponible</div>`}
            <div class="code">${_escapeHtmlSafe(code)}</div>
          </div>
        ` : ''}
      </div>
    </div>
  </div>
  <div class="bottombar">${_escapeHtmlSafe(tplFromModal.badgeText)} | ${_escapeHtmlSafe(code)}</div>
</div>
</body>
</html>`;

    frame.srcdoc = html;
}

if (typeof window !== 'undefined') {
    window.syncBilletterieSpectacleFromProject = syncBilletterieSpectacleFromProject;
    window.clearBilletterieSpectacleContext = clearBilletterieSpectacleContext;
    window.openInvitationTicketTemplateModal = openInvitationTicketTemplateModal;
    window.closeInvitationTicketTemplateModal = closeInvitationTicketTemplateModal;
    window.saveInvitationTicketTemplateFromModal = saveInvitationTicketTemplateFromModal;
    window.renderInvitationTicketPreview = renderInvitationTicketPreview;
    window.resetInvitationTicketTemplate = resetInvitationTicketTemplate;
    window.invTplOpenAddPartnerForm = invTplOpenAddPartnerForm;
    window.invTplCloseAddPartnerForm = invTplCloseAddPartnerForm;
    window.invTplClearPartners = invTplClearPartners;
    window.invTplAddPartnerFromSpectacle = invTplAddPartnerFromSpectacle;
    window.invTplResetPartnerLogoDropzone = invTplResetPartnerLogoDropzone;
    window.invTplOnLayoutModeChange = invTplOnLayoutModeChange;
}

// ============================================
// IMPORT DEVIS — OCR + BUDGET
// ============================================

var _devisImportFile = null;
var _devisUploadedFileData = null;
var _devisOcrData = null;
var _devisMode = 'new';

function openDevisImportModal() {
    if (!currentBudgetSpectacle) {
        showToast('Aucun spectacle sélectionné.', 'error');
        return;
    }
    _devisImportFile = null;
    _devisUploadedFileData = null;
    _devisOcrData = null;
    _devisMode = 'new';

    document.getElementById('devisStep1').style.display = '';
    document.getElementById('devisStep2').style.display = 'none';
    document.getElementById('devisDropzone').style.display = '';
    document.getElementById('devisAnalyzing').style.display = 'none';
    document.getElementById('devisFileInfo').style.display = 'none';
    document.getElementById('devisFileInput').value = '';
    document.getElementById('devisImportModal').classList.add('active');
}

function closeDevisImportModal() {
    document.getElementById('devisImportModal').classList.remove('active');
    _devisImportFile = null;
    _devisUploadedFileData = null;
    _devisOcrData = null;
}

function handleDevisFileDrop(event) {
    var files = event.dataTransfer ? event.dataTransfer.files : [];
    if (files.length > 0) processDevisFile(files[0]);
}

function handleDevisFileSelect(input) {
    if (input.files && input.files.length > 0) processDevisFile(input.files[0]);
}

function clearDevisFile() {
    _devisImportFile = null;
    document.getElementById('devisFileInfo').style.display = 'none';
    document.getElementById('devisDropzone').style.display = '';
    document.getElementById('devisFileInput').value = '';
}

async function processDevisFile(file) {
    var allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.some(function(t) { return file.type.includes(t.split('/')[1]); }) && !file.name.match(/\.(pdf|jpe?g|png|webp)$/i)) {
        showToast('Format non supporté. Utilisez PDF, JPG ou PNG.', 'error');
        return;
    }

    _devisImportFile = file;
    document.getElementById('devisDropzone').style.display = 'none';
    document.getElementById('devisFileInfo').style.display = 'block';
    document.getElementById('devisFileName').textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' Ko)';

    document.getElementById('devisFileInfo').style.display = 'none';
    document.getElementById('devisAnalyzing').style.display = '';

    try {
        var uploaded = null;
        try {
            uploaded = await uploadFile(file, 'budget');
        } catch (uploadErr) {
            console.warn('Upload serveur échoué pour devis:', uploadErr);
        }

        _devisUploadedFileData = uploaded ? {
            name: file.name,
            fileName: uploaded.fileName || file.name,
            fileType: file.type,
            fileSize: file.size,
            stored_externally: !!uploaded.url,
            id: uploaded.file_id || ('devis_' + Date.now()),
            file_id: uploaded.file_id,
            url: uploaded.url,
            downloadUrl: uploaded.downloadUrl || uploaded.url
        } : {
            name: file.name,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            stored_externally: false,
            id: 'devis_' + Date.now()
        };

        var base64ForOCR = await _devisFileToBase64(file);
        var ocrData = null;

        try {
            var payload = {
                justificatifId: 'devis_' + Date.now(),
                fileName: file.name,
                fileType: file.type,
                fileBase64: base64ForOCR,
                apiKey: (typeof N8N_CONFIG !== 'undefined') ? N8N_CONFIG.apiKey : 'ComptaL&Co'
            };

            var webhookUrl = (typeof N8N_CONFIG !== 'undefined') ? N8N_CONFIG.webhookOCR : 'https://vps-bffa8415.vps.ovh.net/webhook/compta-ocr';

            var response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': payload.apiKey },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                var result = await response.json();
                if (result.success && result.data) {
                    ocrData = result.data;
                } else if (result.fournisseur || result.montantTTC || result.montantHT) {
                    ocrData = result;
                }
            }
        } catch (ocrErr) {
            console.warn('OCR webhook non disponible:', ocrErr);
        }

        _devisOcrData = ocrData;
        showDevisStep2(ocrData);

    } catch (err) {
        console.error('Erreur traitement devis:', err);
        showToast('Erreur lors du traitement du fichier.', 'error');
        document.getElementById('devisAnalyzing').style.display = 'none';
        document.getElementById('devisDropzone').style.display = '';
    }
}

function _devisFileToBase64(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result.split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showDevisStep2(ocrData) {
    document.getElementById('devisStep1').style.display = 'none';
    document.getElementById('devisStep2').style.display = '';

    var catSelect = document.getElementById('devisCategory');
    var cats = (typeof BUDGET_CATEGORIES !== 'undefined') ? BUDGET_CATEGORIES : ['Cachet', 'Voyage', 'Hôtel', 'Repas', 'Location salle', 'Technique', 'Sécurité', 'Communication', 'L&Co', 'Autre'];
    catSelect.innerHTML = cats.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

    document.getElementById('devisDesignation').value = '';
    document.getElementById('devisMontantHT').value = '';
    document.getElementById('devisTauxTVA').value = '20';
    document.getElementById('devisMontantTTC').value = '';
    document.getElementById('devisEstimatifReel').value = 'estimatif';

    if (ocrData) {
        if (ocrData.fournisseur) document.getElementById('devisDesignation').value = ocrData.fournisseur;
        if (ocrData.montantHT) {
            document.getElementById('devisMontantHT').value = parseFloat(ocrData.montantHT).toFixed(2);
        }
        if (ocrData.tauxTVA !== undefined && ocrData.tauxTVA !== null) {
            var taux = parseFloat(ocrData.tauxTVA);
            var tauxSelect = document.getElementById('devisTauxTVA');
            var found = false;
            for (var i = 0; i < tauxSelect.options.length; i++) {
                if (Math.abs(parseFloat(tauxSelect.options[i].value) - taux) < 0.5) {
                    tauxSelect.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found) tauxSelect.value = '20';
        }
        if (ocrData.montantTTC) {
            document.getElementById('devisMontantTTC').value = parseFloat(ocrData.montantTTC).toFixed(2);
        } else {
            recalcDevisMontants('ht');
        }

        if (ocrData.fournisseur) {
            document.getElementById('devisCrmOrg').value = ocrData.fournisseur;
        }
    }

    document.getElementById('devisAttachedFileName').textContent = _devisImportFile ? _devisImportFile.name : '-';

    setDevisMode('new');
    populateDevisExistingLines();
    populateDevisCrmLists();

    if (ocrData && ocrData.fournisseur) {
        tryAutoMatchDevisLine(ocrData.fournisseur);
    }
}

function setDevisMode(mode) {
    _devisMode = mode;
    var btnNew = document.getElementById('devisModeNew');
    var btnExisting = document.getElementById('devisModeExisting');
    var wrapExisting = document.getElementById('devisExistingLineWrap');

    if (mode === 'new') {
        btnNew.className = 'btn';
        btnExisting.className = 'btn btn-secondary';
        wrapExisting.style.display = 'none';
    } else {
        btnNew.className = 'btn btn-secondary';
        btnExisting.className = 'btn';
        wrapExisting.style.display = '';
    }
}

function populateDevisExistingLines() {
    var select = document.getElementById('devisExistingLineSelect');
    select.innerHTML = '<option value="">— Sélectionner une ligne —</option>';

    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget) return;

    var cats = (typeof BUDGET_CATEGORIES !== 'undefined') ? BUDGET_CATEGORIES : [];
    var grouped = {};
    currentBudgetSpectacle.budget.forEach(function(line, index) {
        var cat = line.category || 'Autre';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ line: line, index: index });
    });

    cats.forEach(function(cat) {
        var items = grouped[cat];
        if (!items || items.length === 0) return;
        var optgroup = document.createElement('optgroup');
        optgroup.label = cat;
        items.forEach(function(item) {
            var opt = document.createElement('option');
            opt.value = item.index;
            var montant = item.line.montantFixe || 0;
            var type = item.line.isReel ? 'engagé' : 'estimatif';
            opt.textContent = (item.line.designation || 'Sans nom') + ' — ' + montant.toFixed(2) + ' € HT (' + type + ')';
            optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
    });
}

function onDevisExistingLineChange() {
    var select = document.getElementById('devisExistingLineSelect');
    var idx = select.value;
    if (idx === '' || !currentBudgetSpectacle || !currentBudgetSpectacle.budget) return;

    var line = currentBudgetSpectacle.budget[parseInt(idx)];
    if (!line) return;

    document.getElementById('devisDesignation').value = line.designation || '';
    document.getElementById('devisCategory').value = line.category || 'Autre';
    document.getElementById('devisEstimatifReel').value = line.isReel ? 'reel' : 'estimatif';
    document.getElementById('devisMontantHT').value = (line.montantFixe || 0).toFixed(2);

    var tauxSelect = document.getElementById('devisTauxTVA');
    var taux = line.tvaRate || 0;
    var found = false;
    for (var i = 0; i < tauxSelect.options.length; i++) {
        if (Math.abs(parseFloat(tauxSelect.options[i].value) - taux) < 0.5) {
            tauxSelect.selectedIndex = i;
            found = true;
            break;
        }
    }
    if (!found) tauxSelect.value = '20';

    recalcDevisMontants('ht');

    if (_devisOcrData) {
        if (_devisOcrData.montantHT) document.getElementById('devisMontantHT').value = parseFloat(_devisOcrData.montantHT).toFixed(2);
        if (_devisOcrData.tauxTVA !== undefined && _devisOcrData.tauxTVA !== null) {
            var ocrTaux = parseFloat(_devisOcrData.tauxTVA);
            for (var j = 0; j < tauxSelect.options.length; j++) {
                if (Math.abs(parseFloat(tauxSelect.options[j].value) - ocrTaux) < 0.5) {
                    tauxSelect.selectedIndex = j;
                    break;
                }
            }
        }
        if (_devisOcrData.montantTTC) {
            document.getElementById('devisMontantTTC').value = parseFloat(_devisOcrData.montantTTC).toFixed(2);
        } else {
            recalcDevisMontants('ht');
        }
    }
}

function tryAutoMatchDevisLine(fournisseur) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget || !fournisseur) return;

    var searchLower = fournisseur.toLowerCase().trim();
    var bestMatch = -1;
    var bestScore = 0;

    currentBudgetSpectacle.budget.forEach(function(line, idx) {
        var designation = (line.designation || '').toLowerCase().trim();
        if (!designation) return;
        if (designation === searchLower) {
            bestMatch = idx;
            bestScore = 100;
        } else if (designation.includes(searchLower) || searchLower.includes(designation)) {
            var score = 50;
            if (score > bestScore) { bestMatch = idx; bestScore = score; }
        } else {
            var words = searchLower.split(/\s+/);
            var matchedWords = words.filter(function(w) { return w.length > 2 && designation.includes(w); });
            var score = (matchedWords.length / words.length) * 40;
            if (score > bestScore) { bestMatch = idx; bestScore = score; }
        }
    });

    if (bestMatch >= 0 && bestScore >= 40) {
        setDevisMode('existing');
        document.getElementById('devisExistingLineSelect').value = bestMatch;
        onDevisExistingLineChange();
        showToast('Ligne existante détectée : "' + (currentBudgetSpectacle.budget[bestMatch].designation || 'Sans nom') + '"', 'info');
    }
}

function recalcDevisMontants(source) {
    var htInput = document.getElementById('devisMontantHT');
    var ttcInput = document.getElementById('devisMontantTTC');
    var tauxSelect = document.getElementById('devisTauxTVA');
    var taux = parseFloat(tauxSelect.value) || 0;

    if (source === 'ht') {
        var ht = parseFloat(htInput.value) || 0;
        ttcInput.value = (ht * (1 + taux / 100)).toFixed(2);
    } else {
        var ttc = parseFloat(ttcInput.value) || 0;
        htInput.value = (ttc / (1 + taux / 100)).toFixed(2);
    }
}

function populateDevisCrmLists() {
    var select = document.getElementById('devisCrmList');
    select.innerHTML = '<option value="">— Ne pas ajouter au CRM —</option>';

    if (typeof crmData === 'undefined' || !crmData || !crmData.lists) return;

    crmData.lists.forEach(function(list) {
        var opt = document.createElement('option');
        opt.value = list.id;
        opt.textContent = list.name + ' (' + (list.prospects || []).length + ' prospects)';
        select.appendChild(opt);
    });
}

function saveDevisImport() {
    var designation = document.getElementById('devisDesignation').value.trim();
    var category = document.getElementById('devisCategory').value;
    var estReel = document.getElementById('devisEstimatifReel').value;
    var montantHT = parseFloat(document.getElementById('devisMontantHT').value) || 0;
    var tauxTVA = parseFloat(document.getElementById('devisTauxTVA').value) || 0;

    if (!designation) {
        showToast('Veuillez saisir une désignation.', 'error');
        return;
    }

    if (!currentBudgetSpectacle) return;
    if (!currentBudgetSpectacle.budget) currentBudgetSpectacle.budget = [];

    var isEstimatif = (estReel === 'estimatif');
    var isReel = (estReel === 'reel');
    var montantTTC = montantHT * (1 + tauxTVA / 100);

    if (_devisMode === 'existing') {
        var selectEl = document.getElementById('devisExistingLineSelect');
        var idx = parseInt(selectEl.value);
        if (isNaN(idx) || !currentBudgetSpectacle.budget[idx]) {
            showToast('Veuillez sélectionner une ligne existante.', 'error');
            return;
        }

        var line = currentBudgetSpectacle.budget[idx];
        line.designation = designation;
        line.category = category;
        line.montantFixe = montantHT;
        line.montantInputType = 'HT';
        line.tvaRate = tauxTVA;
        line.isEstimatif = isEstimatif;
        line.isReel = isReel;
        line.estime = isEstimatif ? montantTTC : 0;
        line.reel = isReel ? montantTTC : 0;
        line.montantTTCSaisi = null;

        if (_devisUploadedFileData) {
            var fileType = isReel ? 'facture' : 'devis';
            line[fileType] = _devisUploadedFileData;
        }
    } else {
        var newLine = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            category: category,
            designation: designation,
            montantType: 'fixe',
            montantFixe: montantHT,
            percentBilletterie: 0,
            montantInputType: 'HT',
            isEstimatif: isEstimatif,
            isReel: isReel,
            tvaRate: tauxTVA,
            estime: isEstimatif ? montantTTC : 0,
            reel: isReel ? montantTTC : 0
        };

        if (_devisUploadedFileData) {
            var fileType = isReel ? 'facture' : 'devis';
            newLine[fileType] = _devisUploadedFileData;
        }

        currentBudgetSpectacle.budget.push(newLine);
    }

    saveBudgetData();
    renderBudgetSections();
    updateBudgetTotals();

    saveDevisCrmProspect();

    var modeLabel = _devisMode === 'existing' ? 'Ligne mise à jour' : 'Nouvelle ligne créée';
    showToast(modeLabel + ' : ' + designation, 'success');
    closeDevisImportModal();

    if (_devisMode === 'new') {
        setTimeout(function() {
            var categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
            var content = document.getElementById('budgetCategoryContent_' + categoryId);
            var header = content ? content.previousElementSibling : null;
            var icon = header ? header.querySelector('.budget-category-icon') : null;
            if (content && content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                content.style.maxHeight = content.scrollHeight + 'px';
                if (header) header.classList.add('expanded');
                if (icon) icon.textContent = '▼';
            }
        }, 150);
    }
}

function saveDevisCrmProspect() {
    var listId = document.getElementById('devisCrmList').value;
    if (!listId) return;

    var orgName = document.getElementById('devisCrmOrg').value.trim();
    if (!orgName) return;

    if (typeof crmData === 'undefined' || !crmData || !crmData.lists) return;

    var list = crmData.lists.find(function(l) { return l.id === listId; });
    if (!list) return;
    if (!list.prospects) list.prospects = [];

    var existing = list.prospects.find(function(p) {
        return p.organisme && p.organisme.toLowerCase() === orgName.toLowerCase();
    });

    var contactVal = document.getElementById('devisCrmContact').value.trim();
    var telVal = document.getElementById('devisCrmTel').value.trim();
    var emailVal = document.getElementById('devisCrmEmail').value.trim();

    if (existing) {
        if (contactVal && !existing.contactNom) existing.contactNom = contactVal;
        if (telVal && !existing.tel) existing.tel = telVal;
        if (emailVal && !existing.email) existing.email = emailVal;
        showToast('Prospect "' + orgName + '" mis à jour dans le CRM.', 'info');
    } else {
        var newProspect = {
            id: 'crm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            organisme: orgName,
            contactNom: contactVal,
            tel: telVal,
            email: emailVal,
            notes: 'Ajouté depuis import devis - ' + (currentBudgetSpectacle ? currentBudgetSpectacle.name : ''),
            createdAt: new Date().toISOString()
        };
        list.prospects.push(newProspect);
        showToast('Prospect "' + orgName + '" ajouté au CRM.', 'success');
    }

    if (typeof saveCrmData === 'function') saveCrmData();
}

// Catégories de budget fixes
const BUDGET_CATEGORIES = ['Cachet', 'Voyage', 'Hôtel', 'Repas', 'Location salle', 'Technique', 'Sécurité', 'Communication', 'L&Co', 'Autre'];

/** Index de ligne en cours d’édition (cartes budget) — conservé au re-render */
window._budgetEditingIndex = null;

function budgetEscapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function computeBudgetCategoryStats(lines) {
    let totalTTC = 0;
    let totalTVA = 0;
    let fixeCount = 0;
    let percentCount = 0;
    lines.forEach(line => {
        const montantHT = calculateBudgetMontant(line);
        const tvaRate = line.tvaRate || 0;
        const montantTTC = montantHT * (1 + tvaRate / 100);
        totalTTC += montantTTC;
        totalTVA += montantTTC - montantHT;
        if ((line.montantType || 'fixe') === 'percent') percentCount++;
        else fixeCount++;
    });
    let dominant = 'Mixte';
    if (fixeCount > percentCount) dominant = 'Fixe';
    else if (percentCount > fixeCount) dominant = '% CA';
    return { totalTTC, totalTVA, count: lines.length, dominant, fixeCount, percentCount };
}

function toggleBudgetLineEdit(globalIndex, evt) {
    if (evt && evt.target && typeof evt.target.closest === 'function') {
        var block = evt.target.closest('button, a, input, select, textarea');
        if (block) return;
    }
    if (typeof globalIndex !== 'number') return;
    if (window._budgetEditingIndex === globalIndex) {
        window._budgetEditingIndex = null;
    } else {
        window._budgetEditingIndex = globalIndex;
    }
    renderBudgetSections();
}

function finishBudgetLineEdit() {
    window._budgetEditingIndex = null;
    renderBudgetSections();
    updateBudgetTotals();
}

function addBudgetLineFromData(el) {
    if (!el || !el.getAttribute) return;
    var cat = el.getAttribute('data-budget-cat');
    if (cat === null || cat === '') return;
    try {
        addBudgetLine(decodeURIComponent(cat));
    } catch (e) {
        addBudgetLine(cat);
    }
}

function renderBudgetSections() {
    const container = document.getElementById('budgetSections');
    if (!container) return;

    // Grouper les lignes par catégorie
    const linesByCategory = {};
    BUDGET_CATEGORIES.forEach(cat => {
        linesByCategory[cat] = [];
    });

    if (currentBudgetSpectacle.budget && currentBudgetSpectacle.budget.length > 0) {
        currentBudgetSpectacle.budget.forEach((line, index) => {
            const category = line.category || 'Autre';
            // Si la catégorie n'existe pas dans la liste, mettre dans "Autre"
            if (!BUDGET_CATEGORIES.includes(category)) {
                linesByCategory['Autre'].push({...line, originalIndex: index});
            } else {
                linesByCategory[category].push({...line, originalIndex: index});
            }
        });
    }

    container.innerHTML = BUDGET_CATEGORIES.map(category => {
        const lines = linesByCategory[category] || [];
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
        const isCollapsed = lines.length === 0;
        const icon = isCollapsed ? '▶' : '▼';
        const iconClass = isCollapsed ? '' : 'expanded';
        
        return `
            <div class="budget-section budget-panel budget-section--modern ${lines.length > 0 ? 'budget-section--has-lines' : ''}">
                <div class="budget-category-header ${iconClass}" onclick="toggleBudgetCategory('${categoryId}')">
                    <div class="budget-category-header-titles">
                        <span class="budget-category-icon" aria-hidden="true">${icon}</span>
                        <span class="budget-category-name">${category}</span>
                        <span class="budget-category-count">${lines.length} ligne${lines.length > 1 ? 's' : ''}</span>
                    </div>
                    <span class="budget-category-subtotal" id="budgetSubtotal_${categoryId}">0.00 €</span>
                    <button type="button" class="btn budget-add-line-btn budget-add-line-btn--header" data-budget-cat="${encodeURIComponent(category)}" onclick="event.stopPropagation(); addBudgetLineFromData(this)">+ Ligne</button>
                </div>
                <div class="budget-category-content ${isCollapsed ? 'collapsed' : ''}" id="budgetCategoryContent_${categoryId}">
                    <div id="budgetSection_${categoryId}" class="budget-category-body-inner">
                        ${renderBudgetSectionTable(category, lines)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Calculer les sous-totaux
    BUDGET_CATEGORIES.forEach(category => {
        updateBudgetSubtotal(category);
    });
    
    // Initialiser les hauteurs max pour les catégories dépliées
    setTimeout(() => {
        BUDGET_CATEGORIES.forEach(category => {
            const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
            const content = document.getElementById(`budgetCategoryContent_${categoryId}`);
            if (content && !content.classList.contains('collapsed')) {
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    }, 100);
}

function renderBudgetSectionTable(category, lines) {
    if (lines.length === 0) {
        return `
            <div class="budget-empty-cat">
                <p class="budget-empty-cat-msg">Aucune ligne dans cette catégorie.</p>
                <button type="button" class="btn btn-secondary budget-add-line-btn budget-add-line-btn--bottom" data-budget-cat="${encodeURIComponent(category)}" onclick="addBudgetLineFromData(this)">+ Ajouter une ligne</button>
            </div>
        `;
    }

    const stats = computeBudgetCategoryStats(lines);

    return `
        <div class="budget-cat-lines-wrap">
            <div class="budget-cat-summary" aria-label="Résumé de la catégorie">
                <div class="budget-cat-summary-item">
                    <span class="budget-cat-summary-lbl">Total TTC</span>
                    <strong class="budget-cat-summary-val">${stats.totalTTC.toFixed(2)} €</strong>
                </div>
                <div class="budget-cat-summary-item">
                    <span class="budget-cat-summary-lbl">TVA totale</span>
                    <strong class="budget-cat-summary-val budget-cat-summary-val--tva">+${stats.totalTVA.toFixed(2)} €</strong>
                </div>
                <div class="budget-cat-summary-item">
                    <span class="budget-cat-summary-lbl">Lignes</span>
                    <strong class="budget-cat-summary-val">${stats.count}</strong>
                </div>
                <div class="budget-cat-summary-item">
                    <span class="budget-cat-summary-lbl">Type dominant</span>
                    <strong class="budget-cat-summary-val">${stats.dominant}</strong>
                </div>
            </div>
            <div class="budget-lines-stack">
                ${lines.map((line) => renderBudgetLine(category, line.originalIndex, line, window._budgetEditingIndex === line.originalIndex)).join('')}
            </div>
            <div class="budget-cat-footer-actions">
                <button type="button" class="btn btn-secondary budget-add-line-btn budget-add-line-btn--bottom" data-budget-cat="${encodeURIComponent(category)}" onclick="addBudgetLineFromData(this)">+ Ligne</button>
            </div>
        </div>
    `;
}

function renderBudgetLine(category, globalIndex, line, isEditing) {
    const montantType = line.montantType || 'fixe';
    const tvaRate = line.tvaRate || 0;
    const montantInputType = line.montantInputType || 'HT';

    let montantHT, montantTTC;
    if (montantType === 'fixe') {
        const montantSaisi = parseFloat(line.montantFixe) || 0;
        if (montantInputType === 'TTC') {
            if (line.montantTTCSaisi !== null && line.montantTTCSaisi !== undefined) {
                montantTTC = line.montantTTCSaisi;
                montantHT = tvaRate > 0 ? montantTTC / (1 + tvaRate / 100) : montantTTC;
            } else {
                montantHT = montantSaisi;
                montantTTC = montantHT * (1 + tvaRate / 100);
            }
        } else {
            montantHT = montantSaisi;
            montantTTC = montantHT * (1 + tvaRate / 100);
        }
    } else {
        montantHT = calculateBudgetMontant(line);
        montantTTC = montantHT * (1 + tvaRate / 100);
    }

    const tvaAmount = montantTTC - montantHT;
    const isEstimatif = (line.isEstimatif === true || (line.isEstimatif !== false && line.isReel !== true));
    const isReel = line.isReel === true;

    const desigRaw = line.designation || line.label || '';
    const desigEsc = budgetEscapeHtml(desigRaw);
    const tourneeBadge = line.fromTournee
        ? '<span class="budget-badge budget-badge--tournee">Tournée</span>'
        : '';

    const typeBadge = montantType === 'percent'
        ? '<span class="budget-badge budget-badge--type">% CA</span>'
        : '<span class="budget-badge budget-badge--type">Fixe</span>';
    const statutBadge = isReel
        ? '<span class="budget-badge budget-badge--reel">Réel</span>'
        : '<span class="budget-badge budget-badge--estime">Estimé</span>';

    const montantReadMain = montantType === 'fixe'
        ? `<span class="budget-line-amount-num">${montantTTC.toFixed(2)} €</span><span class="budget-line-amount-suffix">TTC</span>`
        : `<span class="budget-line-amount-num">${montantTTC.toFixed(2)} €</span><span class="budget-line-amount-suffix">TTC</span><span class="budget-line-amount-pct">${line.percentBilletterie || 0}% du CA</span>`;

    const metaHtTtc = montantType === 'fixe'
        ? `HT ${montantHT.toFixed(2)} € · saisie ${montantInputType}`
        : `HT ${montantHT.toFixed(2)} €`;

    const devisRead = line.devis
        ? `<a href="${getFileDisplayUrl(line.devis)}" target="_blank" class="budget-line-file-link" title="Devis">📄 Devis</a>`
        : '<span class="budget-line-file-muted">Pas de devis</span>';
    const factRead = line.facture
        ? `<a href="${getFileDisplayUrl(line.facture)}" target="_blank" class="budget-line-file-link" title="Facture">🧾 Facture</a>`
        : '<span class="budget-line-file-muted">Pas de facture</span>';

    const editBlock = `
        <div class="budget-line-edit" onclick="event.stopPropagation();">
            <div class="budget-line-edit-grid">
                <label class="budget-line-field">
                    <span class="budget-line-field-lbl">Désignation</span>
                    <input type="text" value="${(line.designation || line.label || '').replace(/"/g, '&quot;')}" onchange="updateBudgetLine(${globalIndex}, 'designation', this.value)" placeholder="Désignation" class="budget-line-input">
                </label>
                <div class="budget-line-field budget-line-field--types">
                    <span class="budget-line-field-lbl">Type</span>
                    <div class="budget-line-radio-row">
                        <label class="budget-line-radio"><input type="radio" name="montantType_${globalIndex}" value="fixe" ${montantType === 'fixe' ? 'checked' : ''} onchange="updateBudgetLine(${globalIndex}, 'montantType', 'fixe')"> Fixe</label>
                        <label class="budget-line-radio"><input type="radio" name="montantType_${globalIndex}" value="percent" ${montantType === 'percent' ? 'checked' : ''} onchange="updateBudgetLine(${globalIndex}, 'montantType', 'percent')"> % CA</label>
                    </div>
                    ${montantType === 'percent' ? `<input type="number" step="0.01" class="budget-line-input budget-line-input--narrow" value="${line.percentBilletterie || 0}" onchange="updateBudgetLine(${globalIndex}, 'percentBilletterie', this.value)" placeholder="%">` : ''}
                </div>
                <div class="budget-line-field budget-line-field--montant">
                    <span class="budget-line-field-lbl">Montant</span>
                    ${montantType === 'fixe' ? `
                        <select class="budget-line-select" onchange="updateBudgetLine(${globalIndex}, 'montantInputType', this.value)">
                            <option value="HT" ${montantInputType === 'HT' ? 'selected' : ''}>Saisie HT</option>
                            <option value="TTC" ${montantInputType === 'TTC' ? 'selected' : ''}>Saisie TTC</option>
                        </select>
                        <div class="budget-line-montant-row">
                            ${montantInputType === 'HT' ? `
                                <span class="budget-line-mini">HT</span>
                                <input type="number" step="0.01" class="budget-line-input budget-line-input--money" value="${montantHT.toFixed(2)}" onchange="updateBudgetMontant(${globalIndex}, this.value, 'HT')">
                            ` : `
                                <span class="budget-line-mini">HT</span><span class="budget-line-calc">${montantHT.toFixed(2)} €</span>
                            `}
                            ${montantInputType === 'TTC' ? `
                                <span class="budget-line-mini">TTC</span>
                                <input type="number" step="0.01" class="budget-line-input budget-line-input--money" value="${montantTTC.toFixed(2)}" onchange="updateBudgetMontant(${globalIndex}, this.value, 'TTC')">
                            ` : `
                                <span class="budget-line-mini">TTC</span><span class="budget-line-calc">${montantTTC.toFixed(2)} €</span>
                            `}
                        </div>
                    ` : `
                        <div class="budget-line-calc-line"><strong>${montantTTC.toFixed(2)} € TTC</strong> · HT ${montantHT.toFixed(2)} € · ${line.percentBilletterie || 0}% CA</div>
                    `}
                </div>
                <div class="budget-line-field budget-line-field--checks">
                    <label class="budget-line-check"><input type="checkbox" ${isEstimatif ? 'checked' : ''} onchange="toggleBudgetEstimatif(${globalIndex}, this.checked)"> Estimatif</label>
                    <label class="budget-line-check"><input type="checkbox" ${isReel ? 'checked' : ''} onchange="toggleBudgetReel(${globalIndex}, this.checked)"> Réel (engagé)</label>
                </div>
                <div class="budget-line-field">
                    <span class="budget-line-field-lbl">TVA</span>
                    <div class="budget-line-tva-row">
                        <select class="budget-line-select" onchange="updateBudgetLine(${globalIndex}, 'tvaRate', this.value)">
                            <option value="0" ${tvaRate === 0 ? 'selected' : ''}>0%</option>
                            <option value="5.5" ${tvaRate === 5.5 ? 'selected' : ''}>5.5%</option>
                            <option value="10" ${tvaRate === 10 ? 'selected' : ''}>10%</option>
                            <option value="20" ${tvaRate === 20 ? 'selected' : ''}>20%</option>
                        </select>
                        <span class="budget-line-tva-amt">+${tvaAmount.toFixed(2)} €</span>
                    </div>
                </div>
                <div class="budget-line-field budget-line-field--files">
                    <span class="budget-line-field-lbl">Documents</span>
                    <div class="budget-line-files-row">
                        <span class="budget-line-file-cell">
                            ${line.devis ? `
                                <a href="${getFileDisplayUrl(line.devis)}" target="_blank" class="budget-line-file-link">📄</a>
                                <button type="button" class="budget-line-file-remove" onclick="deleteBudgetFile(${globalIndex}, 'devis')" title="Retirer">×</button>
                            ` : `
                                <input type="file" id="devis_${globalIndex}" accept=".pdf,.jpg,.jpeg,.png,.mp4,video/mp4" style="display:none" onchange="uploadBudgetFile(${globalIndex}, 'devis', this.files[0])">
                                <button type="button" class="btn btn-secondary budget-line-upload-btn" onclick="document.getElementById('devis_${globalIndex}').click()">Devis</button>
                            `}
                        </span>
                        <span class="budget-line-file-cell">
                            ${line.facture ? `
                                <a href="${getFileDisplayUrl(line.facture)}" target="_blank" class="budget-line-file-link">🧾</a>
                                <button type="button" class="budget-line-file-remove" onclick="deleteBudgetFile(${globalIndex}, 'facture')" title="Retirer">×</button>
                            ` : `
                                <input type="file" id="facture_${globalIndex}" accept=".pdf,.jpg,.jpeg,.png,.mp4,video/mp4" style="display:none" onchange="uploadBudgetFile(${globalIndex}, 'facture', this.files[0])">
                                <button type="button" class="btn btn-secondary budget-line-upload-btn" onclick="document.getElementById('facture_${globalIndex}').click()">Facture</button>
                            `}
                        </span>
                    </div>
                </div>
            </div>
            <div class="budget-line-edit-actions">
                <button type="button" class="btn btn-secondary budget-line-done-btn" onclick="event.stopPropagation(); finishBudgetLineEdit();">Terminer</button>
            </div>
        </div>`;

    const readBlock = `
        <div class="budget-line-read" role="button" tabindex="0" onclick="toggleBudgetLineEdit(${globalIndex}, event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleBudgetLineEdit(${globalIndex},event);}">
            <div class="budget-line-main">
                <div class="budget-line-title-block">
                    <span class="budget-line-title">${desigRaw ? desigEsc : '<span class="budget-line-placeholder">Sans titre</span>'}</span>
                    ${tourneeBadge}
                </div>
                <div class="budget-line-amount-block">${montantReadMain}</div>
                <div class="budget-line-badges">${typeBadge}${statutBadge}</div>
                <button type="button" class="budget-line-del" title="Supprimer la ligne" aria-label="Supprimer" onclick="event.stopPropagation(); deleteBudgetLine(${globalIndex})">🗑</button>
            </div>
            <div class="budget-line-meta">
                <span class="budget-line-meta-item budget-line-meta-tva">TVA ${tvaRate}% · +${tvaAmount.toFixed(2)} €</span>
                <span class="budget-line-meta-sep">·</span>
                <span class="budget-line-meta-item">${metaHtTtc}</span>
                <span class="budget-line-meta-sep">·</span>
                <span class="budget-line-meta-item">${devisRead}</span>
                <span class="budget-line-meta-sep">·</span>
                <span class="budget-line-meta-item">${factRead}</span>
            </div>
        </div>`;

    return `
        <div class="budget-line-card ${isEditing ? 'budget-line-card--editing' : ''}" data-line-index="${globalIndex}">
            ${isEditing ? editBlock : readBlock}
        </div>
    `;
}

function calculateBudgetMontant(line) {
    if (line.montantType === 'percent') {
        const caBilletterie = getTotalCA(currentBudgetSpectacle);
        const percent = parseFloat(line.percentBilletterie) || 0;
        return caBilletterie * (percent / 100);
    } else {
        return parseFloat(line.montantFixe) || 0;
    }
}

function addBudgetLine(category) {
    if (!currentBudgetSpectacle) return;
    
    if (!currentBudgetSpectacle.budget) {
        currentBudgetSpectacle.budget = [];
    }

    const newLine = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        category: category,
        designation: '',
        montantType: 'fixe',
        montantFixe: 0,
        percentBilletterie: 0,
        montantInputType: 'HT', // 'HT' ou 'TTC'
        isEstimatif: true,
        isReel: false,
        tvaRate: 0,
        estime: 0, // Pour compatibilité
        reel: 0    // Pour compatibilité
    };
    
    // Initialiser le montant estimatif à 0
    const tvaRate = 0;
    const montantTTC = 0 * (1 + tvaRate / 100);
    newLine.estime = montantTTC;

    currentBudgetSpectacle.budget.push(newLine);
    window._budgetEditingIndex = currentBudgetSpectacle.budget.length - 1;
    saveBudgetData();
    renderBudgetSections();
    updateBudgetTotals();
    
    // Déplier la catégorie après ajout d'une ligne
    setTimeout(() => {
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
        const content = document.getElementById(`budgetCategoryContent_${categoryId}`);
        const header = content?.previousElementSibling;
        const icon = header?.querySelector('.budget-category-icon');
        
        if (content && content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            content.style.maxHeight = content.scrollHeight + 'px';
            if (header) header.classList.add('expanded');
            if (icon) icon.textContent = '▼';
        } else if (content && !content.classList.contains('collapsed')) {
            // Réajuster la hauteur si déjà dépliée
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    }, 100);
}

function updateBudgetMontant(index, value, inputType) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget || !currentBudgetSpectacle.budget[index]) return;
    window._budgetEditingIndex = index;
    const line = currentBudgetSpectacle.budget[index];
    const montantSaisi = parseFloat(value) || 0;
    const tvaRate = line.tvaRate || 0;
    
    if (inputType === 'TTC') {
        // L'utilisateur a saisi un montant TTC, calculer le HT avec précision
        // On stocke le HT pour que le TTC recalculé corresponde exactement au TTC saisi
        const montantHT = tvaRate > 0 ? montantSaisi / (1 + tvaRate / 100) : montantSaisi;
        // Stocker avec plus de précision pour éviter les erreurs d'arrondi
        line.montantFixe = montantHT;
        // Stocker aussi le TTC saisi pour référence
        line.montantTTCSaisi = montantSaisi;
    } else {
        // L'utilisateur a saisi un montant HT
        line.montantFixe = montantSaisi;
        // Effacer le TTC saisi si on passe en HT
        line.montantTTCSaisi = null;
    }
    
    // Recalculer les montants estimatif/réel pour compatibilité
    const montantHT = calculateBudgetMontant(line);
    // Si on a un TTC saisi et qu'on est en mode TTC, utiliser le TTC saisi pour éviter les arrondis
    let montantTTC;
    if (inputType === 'TTC' && line.montantTTCSaisi !== null && line.montantTTCSaisi !== undefined) {
        montantTTC = line.montantTTCSaisi;
    } else {
        montantTTC = montantHT * (1 + tvaRate / 100);
    }
    
    // Mettre à jour les montants selon les cases cochées
    if (line.isEstimatif) {
        line.estime = montantTTC;
    } else {
        line.estime = 0;
    }
    
    if (line.isReel) {
        line.reel = montantTTC;
    } else {
        line.reel = 0;
    }
    
    // Synchronisation inverse : si la ligne budget est liée à un élément technique, mettre à jour
    if (line.techItemId && line.techItemType && currentBudgetSpectacle.tech) {
        const tech = currentBudgetSpectacle.tech;
        if (line.techItemType === 'voyage' && tech.voyages) {
            const voyage = tech.voyages.find(v => v.id === line.techItemId);
            if (voyage) {
                voyage.cout = line.montantFixe;
                voyage.coutStatut = line.isReel ? 'reel' : 'estimatif';
                voyage.tvaRate = line.tvaRate;
            }
        } else if (line.techItemType === 'hebergement' && tech.hebergements) {
            const hebergement = tech.hebergements.find(h => h.id === line.techItemId);
            if (hebergement) {
                hebergement.total = line.montantFixe;
                hebergement.coutStatut = line.isReel ? 'reel' : 'estimatif';
                hebergement.tvaRate = line.tvaRate;
            }
        }
    }
    
    saveBudgetData();
    renderBudgetSections();
    updateBudgetTotals();
}

function updateBudgetLine(index, field, value) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget || !currentBudgetSpectacle.budget[index]) return;
    window._budgetEditingIndex = index;
    const line = currentBudgetSpectacle.budget[index];
    
    if (field === 'montantFixe' || field === 'percentBilletterie' || field === 'tvaRate') {
        line[field] = parseFloat(value) || 0;
    } else if (field === 'montantType') {
        line[field] = value;
    } else if (field === 'montantInputType') {
        // Quand on change le type de saisie (HT/TTC), convertir le montant actuel
        const ancienType = line.montantInputType || 'HT';
        const nouveauType = value;
        const montantActuel = parseFloat(line.montantFixe) || 0;
        const tvaRate = line.tvaRate || 0;
        
        if (ancienType !== nouveauType && montantActuel > 0) {
            if (ancienType === 'HT' && nouveauType === 'TTC') {
                // On avait un HT, maintenant on veut saisir en TTC
                // Le montantFixe actuel est en HT, on le convertit en TTC pour l'affichage
                // On garde le HT dans montantFixe et on stocke le TTC calculé
                const montantTTC = montantActuel * (1 + tvaRate / 100);
                line.montantTTCSaisi = montantTTC;
            } else if (ancienType === 'TTC' && nouveauType === 'HT') {
                // On avait un TTC, maintenant on veut saisir en HT
                // Si on a un TTC saisi, l'utiliser, sinon utiliser montantFixe
                if (line.montantTTCSaisi !== null && line.montantTTCSaisi !== undefined) {
                    const montantHT = tvaRate > 0 ? line.montantTTCSaisi / (1 + tvaRate / 100) : line.montantTTCSaisi;
                    line.montantFixe = montantHT;
                } else {
                    // Le montantFixe actuel représente un TTC, on le convertit en HT
                    const montantHT = tvaRate > 0 ? montantActuel / (1 + tvaRate / 100) : montantActuel;
                    line.montantFixe = montantHT;
                }
                // Effacer le TTC saisi puisqu'on passe en HT
                line.montantTTCSaisi = null;
            }
        }
        line[field] = value;
    } else {
        line[field] = value;
    }
    
    // Si le taux de TVA change, recalculer le montant selon le type de saisie
    if (field === 'tvaRate' && line.montantType === 'fixe') {
        const tvaRate = parseFloat(value) || 0;
        const montantInputType = line.montantInputType || 'HT';
        
        if (montantInputType === 'TTC') {
            // Si on a un TTC saisi, le recalculer avec le nouveau taux
            if (line.montantTTCSaisi !== null && line.montantTTCSaisi !== undefined) {
                const montantHT = tvaRate > 0 ? line.montantTTCSaisi / (1 + tvaRate / 100) : line.montantTTCSaisi;
                line.montantFixe = montantHT;
            } else {
                // Sinon, recalculer le HT à partir du montant actuel (qui est en HT)
                // Pas besoin de changer car montantFixe est déjà en HT
            }
        }
    }
    
    // Recalculer les montants estimatif/réel pour compatibilité
    const montantHT = calculateBudgetMontant(line);
    const tvaRate = line.tvaRate || 0;
    // Si on a un TTC saisi et qu'on est en mode TTC, utiliser le TTC saisi
    let montantTTC;
    if (line.montantInputType === 'TTC' && line.montantTTCSaisi !== null && line.montantTTCSaisi !== undefined) {
        montantTTC = line.montantTTCSaisi;
    } else {
        montantTTC = montantHT * (1 + tvaRate / 100);
    }
    
    // Mettre à jour les montants selon les cases cochées
    if (line.isEstimatif) {
        line.estime = montantTTC;
    } else {
        line.estime = 0;
    }
    
    if (line.isReel) {
        line.reel = montantTTC;
    } else {
        line.reel = 0;
    }
    
    // Synchronisation inverse : si la ligne budget est liée à un élément technique, mettre à jour
    if (line.techItemId && line.techItemType && currentBudgetSpectacle.tech) {
        const tech = currentBudgetSpectacle.tech;
        if (line.techItemType === 'voyage' && tech.voyages) {
            const voyage = tech.voyages.find(v => v.id === line.techItemId);
            if (voyage) {
                voyage.cout = line.montantFixe;
                voyage.coutStatut = line.isReel ? 'reel' : 'estimatif';
                voyage.tvaRate = line.tvaRate;
            }
        } else if (line.techItemType === 'hebergement' && tech.hebergements) {
            const hebergement = tech.hebergements.find(h => h.id === line.techItemId);
            if (hebergement) {
                hebergement.total = line.montantFixe;
                hebergement.coutStatut = line.isReel ? 'reel' : 'estimatif';
                hebergement.tvaRate = line.tvaRate;
            }
        }
    }
    
    saveBudgetData();
    renderBudgetSections();
    updateBudgetTotals();
}

function toggleBudgetEstimatif(index, checked) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget || !currentBudgetSpectacle.budget[index]) return;
    window._budgetEditingIndex = index;
    const line = currentBudgetSpectacle.budget[index];
    line.isEstimatif = checked;
    
    // Si on coche Estimatif, décocher Réel automatiquement
    if (checked) {
        line.isReel = false;
    }
    
    // Recalculer le montant
    const montantHT = calculateBudgetMontant(line);
    const tvaRate = line.tvaRate || 0;
    const montantTTC = montantHT * (1 + tvaRate / 100);
    
    if (checked) {
        line.estime = montantTTC;
        line.reel = 0;
    } else {
        line.estime = 0;
    }
    
    // Synchronisation inverse : si la ligne budget est liée à un élément technique, mettre à jour
    if (line.techItemId && line.techItemType && currentBudgetSpectacle.tech) {
        const tech = currentBudgetSpectacle.tech;
        if (line.techItemType === 'voyage' && tech.voyages) {
            const voyage = tech.voyages.find(v => v.id === line.techItemId);
            if (voyage) {
                voyage.coutStatut = line.isReel ? 'reel' : 'estimatif';
            }
        } else if (line.techItemType === 'hebergement' && tech.hebergements) {
            const hebergement = tech.hebergements.find(h => h.id === line.techItemId);
            if (hebergement) {
                hebergement.coutStatut = line.isReel ? 'reel' : 'estimatif';
            }
        }
    }
    
    saveBudgetData();
    renderBudgetSections();
    updateBudgetTotals();
}

function toggleBudgetReel(index, checked) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget || !currentBudgetSpectacle.budget[index]) return;
    window._budgetEditingIndex = index;
    const line = currentBudgetSpectacle.budget[index];
    line.isReel = checked;
    
    // Si on coche Réel, décocher Estimatif automatiquement
    if (checked) {
        line.isEstimatif = false;
    }
    
    // Recalculer le montant
    const montantHT = calculateBudgetMontant(line);
    const tvaRate = line.tvaRate || 0;
    const montantTTC = montantHT * (1 + tvaRate / 100);
    
    if (checked) {
        line.reel = montantTTC;
        line.estime = 0;
    } else {
        line.reel = 0;
    }
    
    // Synchronisation inverse : si la ligne budget est liée à un élément technique, mettre à jour
    if (line.techItemId && line.techItemType && currentBudgetSpectacle.tech) {
        const tech = currentBudgetSpectacle.tech;
        if (line.techItemType === 'voyage' && tech.voyages) {
            const voyage = tech.voyages.find(v => v.id === line.techItemId);
            if (voyage) {
                voyage.coutStatut = line.isReel ? 'reel' : 'estimatif';
            }
        } else if (line.techItemType === 'hebergement' && tech.hebergements) {
            const hebergement = tech.hebergements.find(h => h.id === line.techItemId);
            if (hebergement) {
                hebergement.coutStatut = line.isReel ? 'reel' : 'estimatif';
            }
        }
    }
    
    saveBudgetData();
    renderBudgetSections();
    updateBudgetTotals();
}

// Synchroniser un fichier (devis/facture) depuis le budget vers la ligne tech liée
function syncBudgetFileToTech(budgetLine, fileType, fileData) {
    if (!budgetLine || !budgetLine.techItemType || !currentBudgetSpectacle?.tech) return;
    
    const techType = budgetLine.techItemType;
    let techItems;
    if (techType === 'prestataire') techItems = currentBudgetSpectacle.tech.prestataires;
    else if (techType === 'voyage') techItems = currentBudgetSpectacle.tech.voyages;
    else if (techType === 'hebergement') techItems = currentBudgetSpectacle.tech.hebergements;
    else return;

    if (!techItems) return;

    // Trouver l'item tech dont le budgetLineId correspond
    const techItem = techItems.find(t => t.budgetLineId === budgetLine.id);
    if (techItem) {
        if (fileData) techItem[fileType] = fileData;
        else delete techItem[fileType];
    }
}

async function uploadBudgetFile(index, type, file) {
    if (!file || !currentBudgetSpectacle || !currentBudgetSpectacle.budget || !currentBudgetSpectacle.budget[index]) return;
    
    try {
        // Utiliser la fonction uploadFile() qui gère automatiquement base64 (< 500KB) ou serveur (>= 500KB)
        const uploadedFile = await uploadFile(file, 'budget');
        
        const line = currentBudgetSpectacle.budget[index];
        
        // Créer l'objet fichier avec les données retournées
        const fileData = {
            name: uploadedFile.name,
            fileName: uploadedFile.fileName,
            fileType: uploadedFile.fileType,
            fileSize: uploadedFile.fileSize,
            stored_externally: uploadedFile.stored_externally || false
        };
        
        // Ajouter base64 ou file_id/url selon le mode de stockage
        fileData.id = uploadedFile.file_id;
        fileData.file_id = uploadedFile.file_id;
        fileData.url = uploadedFile.url;
        fileData.downloadUrl = uploadedFile.downloadUrl;
        
        line[type] = fileData;
        
        // Synchroniser vers la ligne tech liée
        syncBudgetFileToTech(line, type, fileData);
        
        window._budgetEditingIndex = index;
        saveBudgetData();
        renderBudgetSections();
    } catch (error) {
        console.error('Erreur upload fichier budget:', error);
        const errorMessage = error.message || error.toString();
        let userMessage = `Impossible d'uploader le fichier "${file.name}".`;
        
        if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
            userMessage += ' Problème de connexion réseau.';
        } else {
            userMessage += ' Erreur lors de l\'upload.';
        }
        
        showErrorModal('Erreur lors de l\'upload', userMessage, errorMessage);
    }
}

function deleteBudgetFile(index, type) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget || !currentBudgetSpectacle.budget[index]) return;
    
    const line = currentBudgetSpectacle.budget[index];
    delete line[type];
    
    // Synchroniser vers la ligne tech liée
    syncBudgetFileToTech(line, type, null);
    
    window._budgetEditingIndex = index;
    saveBudgetData();
    renderBudgetSections();
}

function deleteBudgetLine(index) {
    if (!currentBudgetSpectacle || !confirm('Supprimer cette ligne de coût ?')) return;

    const line = currentBudgetSpectacle.budget[index];
    const category = line?.category || 'Autre';
    
    if (window._budgetEditingIndex === index) window._budgetEditingIndex = null;
    else if (typeof window._budgetEditingIndex === 'number' && window._budgetEditingIndex > index) window._budgetEditingIndex--;
    
    currentBudgetSpectacle.budget.splice(index, 1);
    saveBudgetData();
    renderBudgetSections();
    updateBudgetTotals();
    
    // Réinitialiser les hauteurs après suppression
    setTimeout(() => {
        BUDGET_CATEGORIES.forEach(cat => {
            const categoryId = cat.replace(/[^a-zA-Z0-9]/g, '_');
            const content = document.getElementById(`budgetCategoryContent_${categoryId}`);
            if (content && !content.classList.contains('collapsed')) {
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    }, 100);
}

function toggleBudgetCategory(categoryId) {
    const content = document.getElementById(`budgetCategoryContent_${categoryId}`);
    if (!content) return;
    
    const header = content.previousElementSibling;
    const icon = header?.querySelector('.budget-category-icon');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        content.style.maxHeight = content.scrollHeight + 'px';
        if (header) header.classList.add('expanded');
        if (icon) icon.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        content.style.maxHeight = '0';
        if (header) header.classList.remove('expanded');
        if (icon) icon.textContent = '▶';
    }
}

function updateBudgetSubtotal(category) {
    const container = document.getElementById(`budgetSubtotal_${category.replace(/[^a-zA-Z0-9]/g, '_')}`);
    if (!container) return;
    
    const lines = (currentBudgetSpectacle.budget || []).filter(l => (l.category || 'Autre') === category);
    let subtotal = 0;
    
    lines.forEach(line => {
        const montantHT = calculateBudgetMontant(line);
        const tvaRate = line.tvaRate || 0;
        const montantTTC = montantHT * (1 + tvaRate / 100);
        
        // Sous-total = somme de toutes les lignes
        subtotal += montantTTC;
    });
    
    container.textContent = subtotal.toFixed(2) + ' €';
}

function budgetApplyDeltaTvaCardClass(deltaTVA) {
    var card = document.getElementById('budgetDeltaTVACard');
    if (!card) return;
    card.classList.remove('budget-kpi-card--delta-positive', 'budget-kpi-card--delta-negative', 'budget-kpi-card--delta-neutral');
    if (deltaTVA > 0) card.classList.add('budget-kpi-card--delta-positive');
    else if (deltaTVA < 0) card.classList.add('budget-kpi-card--delta-negative');
    else card.classList.add('budget-kpi-card--delta-neutral');
}

function budgetApplyMargeProjeteeClass(marge) {
    var wrap = document.getElementById('budgetMargeProjeteeWrap');
    if (!wrap) return;
    wrap.classList.remove('budget-projection-result--positive', 'budget-projection-result--negative', 'budget-projection-result--neutral');
    if (marge > 0) wrap.classList.add('budget-projection-result--positive');
    else if (marge < 0) wrap.classList.add('budget-projection-result--negative');
    else wrap.classList.add('budget-projection-result--neutral');
}

function updateBudgetTotals() {
    // Calculer le CA billetterie une seule fois au début
    const caBilletterie = getTotalCA(currentBudgetSpectacle);
    
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.budget) {
        document.getElementById('budgetEstimeTotal').textContent = '0.00 €';
        document.getElementById('budgetReelTotal').textContent = '0.00 €';
        document.getElementById('budgetTVAPayee').textContent = '0.00 €';
        document.getElementById('budgetTVAVendue').textContent = '0.00 €';
        document.getElementById('budgetDeltaTVA').textContent = '0.00 €';
        
        // Calculer quand même la TVA sur les ventes (billetterie + apports) même sans budget
        const tvaRateBilletterie = currentBudgetSpectacle.tvaRateBilletterie || 20;
        const caHTBilletterie = tvaRateBilletterie > 0 ? caBilletterie / (1 + tvaRateBilletterie / 100) : caBilletterie;
        const tvaVendueBilletterie = caBilletterie - caHTBilletterie;
        
        let tvaApports = 0;
        if (currentBudgetSpectacle.apportsFinanciers && currentBudgetSpectacle.apportsFinanciers.length > 0) {
            currentBudgetSpectacle.apportsFinanciers.forEach(apport => {
                const montantHT = parseFloat(apport.montantFixe) || 0;
                const tvaRate = apport.tvaRate || 0;
                const montantInputType = apport.montantInputType || 'HT';
                let montantTTC, montantHTCalcul;
                if (montantInputType === 'TTC') {
                    montantTTC = montantHT;
                    montantHTCalcul = tvaRate > 0 ? montantTTC / (1 + tvaRate / 100) : montantTTC;
                } else {
                    montantHTCalcul = montantHT;
                    montantTTC = montantHT * (1 + tvaRate / 100);
                }
                tvaApports += (montantTTC - montantHTCalcul);
            });
        }
        
        const tvaVentes = tvaVendueBilletterie + tvaApports;
        const tvaAchats = 0; // Pas de TVA sur les achats si pas de budget
        // Delta = TVA sur les ventes - TVA sur les achats
        const deltaTVA = tvaVentes - tvaAchats;
        
        document.getElementById('budgetTVAPayee').textContent = tvaVentes.toFixed(2) + ' €';
        document.getElementById('budgetTVAVendue').textContent = tvaAchats.toFixed(2) + ' €';
        
        const deltaElement = document.getElementById('budgetDeltaTVA');
        if (deltaTVA > 0) {
            deltaElement.textContent = deltaTVA.toFixed(2) + ' € à payer';
        } else if (deltaTVA < 0) {
            deltaElement.textContent = Math.abs(deltaTVA).toFixed(2) + ' € à récupérer';
        } else {
            deltaElement.textContent = '0.00 €';
        }
        budgetApplyDeltaTvaCardClass(deltaTVA);
        document.getElementById('budgetCAMax').textContent = '0.00 €';
        document.getElementById('budgetApportsProjection').textContent = '0.00 €';
        document.getElementById('budgetDepensesProjetees').textContent = '0.00 €';
        document.getElementById('budgetMargeProjetee').textContent = '0.00 €';
        budgetApplyMargeProjeteeClass(0);
        // Mettre à jour le résultat même s'il n'y a pas de budget
        updateBudgetResultatInstantT(caBilletterie, 0);
        return;
    }

    let totalEstimatif = 0;
    let totalReel = 0;
    let tvaAchats = 0; // TVA sur les achats (dépenses)

    currentBudgetSpectacle.budget.forEach(line => {
        const montantHT = calculateBudgetMontant(line);
        const tvaRate = line.tvaRate || 0;
        const tvaAmount = montantHT * (tvaRate / 100);
        const montantTTC = montantHT + tvaAmount;
        
        // Coûts Estimatifs = somme de TOUTES les lignes (estimatifs + réels)
        totalEstimatif += montantTTC;
        
        // Coûts Engagés = seulement les lignes cochées "réel"
        if (line.isReel) {
            totalReel += montantTTC;
        }
        
        // TVA sur les achats = TVA de toutes les lignes de dépenses
        tvaAchats += tvaAmount;
    });

    // Calcul TVA sur les ventes (billetterie)
    // Le CA billetterie est en TTC, donc on calcule la TVA
    const tvaRateBilletterie = currentBudgetSpectacle.tvaRateBilletterie || 20;
    const caHTBilletterie = tvaRateBilletterie > 0 ? caBilletterie / (1 + tvaRateBilletterie / 100) : caBilletterie;
    const tvaVendueBilletterie = caBilletterie - caHTBilletterie; // TVA = TTC - HT

    // Calculer la TVA des apports financiers
    let tvaApports = 0;
    if (currentBudgetSpectacle.apportsFinanciers && currentBudgetSpectacle.apportsFinanciers.length > 0) {
        currentBudgetSpectacle.apportsFinanciers.forEach(apport => {
            const montantHT = parseFloat(apport.montantFixe) || 0;
            const tvaRate = apport.tvaRate || 0;
            const montantInputType = apport.montantInputType || 'HT';
            let montantTTC, montantHTCalcul;
            if (montantInputType === 'TTC') {
                montantTTC = montantHT;
                montantHTCalcul = tvaRate > 0 ? montantTTC / (1 + tvaRate / 100) : montantTTC;
            } else {
                montantHTCalcul = montantHT;
                montantTTC = montantHT * (1 + tvaRate / 100);
            }
            tvaApports += (montantTTC - montantHTCalcul);
        });
    }

    // TVA sur les ventes = TVA billetterie + TVA des apports financiers
    const tvaVentes = tvaVendueBilletterie + tvaApports;
    // TVA sur les achats = TVA des dépenses
    const tvaVendue = tvaAchats;
    // Delta = TVA sur les ventes - TVA sur les achats
    // Si positif : à payer (on a collecté plus qu'on a payé)
    // Si négatif : à récupérer (on a payé plus qu'on a collecté)
    const deltaTVA = tvaVentes - tvaVendue;

    // Calculer le total des apports financiers
    let totalApports = 0;
    if (currentBudgetSpectacle.apportsFinanciers && currentBudgetSpectacle.apportsFinanciers.length > 0) {
        currentBudgetSpectacle.apportsFinanciers.forEach(apport => {
            const montantHT = parseFloat(apport.montantFixe) || 0;
            const tvaRate = apport.tvaRate || 0;
            const montantInputType = apport.montantInputType || 'HT';
            let montantTTC;
            if (montantInputType === 'TTC') {
                montantTTC = montantHT;
            } else {
                montantTTC = montantHT * (1 + tvaRate / 100);
            }
            totalApports += montantTTC;
        });
    }

    // Calcul projection à 100%
    const caMax = getCAMaximum(currentBudgetSpectacle);
    let depensesProjetees = 0;
    
    currentBudgetSpectacle.budget.forEach(line => {
        let montantHT = 0;
        if (line.montantType === 'percent') {
            const percent = parseFloat(line.percentBilletterie) || 0;
            montantHT = caMax * (percent / 100);
        } else {
            montantHT = parseFloat(line.montantFixe) || 0;
        }
        
        const tvaRate = line.tvaRate || 0;
        const montantTTC = montantHT * (1 + tvaRate / 100);
        
        // Dépenses projetées = toutes les lignes
        depensesProjetees += montantTTC;
    });
    
    const margeProjetee = caMax + totalApports - depensesProjetees;

    document.getElementById('budgetEstimeTotal').textContent = totalEstimatif.toFixed(2) + ' €';
    document.getElementById('budgetReelTotal').textContent = totalReel.toFixed(2) + ' €';
    document.getElementById('budgetTVAPayee').textContent = tvaVentes.toFixed(2) + ' €';
    document.getElementById('budgetTVAVendue').textContent = tvaVendue.toFixed(2) + ' €';
    
    // Afficher le delta avec "à payer" ou "à récupérer"
    const deltaElement = document.getElementById('budgetDeltaTVA');
    if (deltaTVA > 0) {
        deltaElement.textContent = deltaTVA.toFixed(2) + ' € à payer';
    } else if (deltaTVA < 0) {
        deltaElement.textContent = Math.abs(deltaTVA).toFixed(2) + ' € à récupérer';
    } else {
        deltaElement.textContent = '0.00 €';
    }
    budgetApplyDeltaTvaCardClass(deltaTVA);
    document.getElementById('budgetCAMax').textContent = caMax.toFixed(2) + ' €';
    document.getElementById('budgetApportsProjection').textContent = totalApports.toFixed(2) + ' €';
    document.getElementById('budgetDepensesProjetees').textContent = depensesProjetees.toFixed(2) + ' €';
    var margeTxt = margeProjetee.toFixed(2) + ' €';
    if (margeProjetee > 0) margeTxt = '+' + margeTxt;
    document.getElementById('budgetMargeProjetee').textContent = margeTxt;
    budgetApplyMargeProjeteeClass(margeProjetee);

    // Mettre à jour le résultat à l'instant T et le seuil de rentabilité (avec apports)
    document.getElementById('budgetApportsActuel').textContent = totalApports.toFixed(2) + ' €';
    updateBudgetResultatInstantT(caBilletterie + totalApports, totalEstimatif);

    // Mettre à jour les sous-totaux
    BUDGET_CATEGORIES.forEach(category => {
        updateBudgetSubtotal(category);
    });
}

function updateBudgetResultatInstantT(caActuel, budgetEstimatif) {
    // caActuel inclut déjà les apports financiers
    const resultat = caActuel - budgetEstimatif;
    
    // Calculer le CA billetterie seul (sans apports) pour l'affichage
    const caBilletterieSeul = getTotalCA(currentBudgetSpectacle);
    document.getElementById('budgetCAActuel').textContent = caBilletterieSeul.toFixed(2) + ' €';
    var estEl = document.getElementById('budgetEstimeTotal');
    if (estEl) estEl.textContent = budgetEstimatif.toFixed(2) + ' €';
    
    const resultatElement = document.getElementById('budgetResultatInstantT');
    const labelElement = document.getElementById('budgetResultatLabel');
    const gapEl = document.getElementById('budgetResultatGap');
    const statusEl = document.getElementById('budgetHeroStatus');
    const hero = document.getElementById('budgetCockpitHero');
    
    if (resultatElement) resultatElement.style.color = '';
    if (hero) {
        hero.classList.remove('budget-cockpit-hero--positive', 'budget-cockpit-hero--negative', 'budget-cockpit-hero--neutral', 'budget-cockpit-hero--warn');
    }
    
    if (resultat > 0) {
        if (resultatElement) resultatElement.textContent = '+' + resultat.toFixed(2) + ' €';
        if (labelElement) labelElement.textContent = 'Vous êtes bénéficiaire (CA + apports vs coûts estimatifs).';
        if (statusEl) statusEl.textContent = 'Positif';
        if (gapEl) gapEl.textContent = '';
        if (hero) hero.classList.add('budget-cockpit-hero--positive');
    } else if (resultat < 0) {
        if (resultatElement) resultatElement.textContent = resultat.toFixed(2) + ' €';
        if (labelElement) labelElement.textContent = 'Vous êtes en perte par rapport aux coûts estimatifs.';
        if (statusEl) statusEl.textContent = 'Négatif';
        if (gapEl) gapEl.textContent = 'Il manque ' + Math.abs(resultat).toFixed(2) + ' € pour atteindre l’équilibre (CA + apports = coûts estimatifs).';
        if (hero) {
            hero.classList.add('budget-cockpit-hero--negative');
            if (Math.abs(resultat) < budgetEstimatif * 0.08 && budgetEstimatif > 0) {
                hero.classList.add('budget-cockpit-hero--warn');
            }
        }
    } else {
        if (resultatElement) resultatElement.textContent = '0.00 €';
        if (labelElement) labelElement.textContent = 'Équilibre : vos entrées couvrent les coûts estimatifs.';
        if (statusEl) statusEl.textContent = 'Équilibre';
        if (gapEl) gapEl.textContent = '';
        if (hero) hero.classList.add('budget-cockpit-hero--neutral');
    }
    
    // Mettre à jour le seuil de rentabilité
    updateBudgetSeuilRentabilite(budgetEstimatif);
}

function updateBudgetSeuilRentabilite(budgetEstimatif) {
    const prixMoyen = getPrixMoyenTicket(currentBudgetSpectacle);
    const billetsNecessairesElement = document.getElementById('budgetBilletsNecessaires');
    const prixMoyenElement = document.getElementById('budgetPrixMoyenTicket');
    const coutsElement = document.getElementById('budgetSeuilCoûts');
    const labelElement = document.getElementById('budgetSeuilLabel');
    const depensesPercentEl = document.getElementById('budgetSeuilDepensesPercent');
    const depensesPercentRow = document.getElementById('budgetSeuilDepensesPercentRow');
    const totalCoutEl = document.getElementById('budgetSeuilTotalCout');
    const billetsVendus = getTotalBillets(currentBudgetSpectacle);
    const capacite = currentBudgetSpectacle.capacite || 0;
    const seuilFill = document.getElementById('budgetSeuilProgressFill');
    const seuilTrack = document.getElementById('budgetSeuilProgressTrack');
    const seuilMeta = document.getElementById('budgetSeuilProgressMeta');
    const remplFill = document.getElementById('budgetRemplissageProgressFill');
    const remplTrack = document.getElementById('budgetRemplissageProgressTrack');
    const remplMeta = document.getElementById('budgetRemplissageMeta');

    function setSeuilProgress(pct, meta, addWarnClass) {
        var p = Math.min(100, Math.max(0, pct));
        if (seuilFill) {
            seuilFill.style.width = p + '%';
            seuilFill.classList.toggle('budget-progress-fill--warn', !!addWarnClass);
            seuilFill.classList.toggle('budget-progress-fill--ok', p >= 100 && !addWarnClass);
        }
        if (seuilTrack) seuilTrack.setAttribute('aria-valuenow', String(Math.round(p)));
        if (seuilMeta) seuilMeta.textContent = meta || '—';
    }
    function setRemplProgress(pct, meta) {
        var p = Math.min(100, Math.max(0, pct));
        if (remplFill) {
            remplFill.style.width = p + '%';
            remplFill.classList.toggle('budget-progress-fill--ok', p >= 100);
        }
        if (remplTrack) remplTrack.setAttribute('aria-valuenow', String(Math.round(p)));
        if (remplMeta) remplMeta.textContent = meta || '—';
    }
    
    if (prixMoyen > 0) {
        const res = getBilletsNecessairesSeuil(currentBudgetSpectacle);
        const billetsNecessaires = res.billets;
        
        coutsElement.textContent = res.coutsFixes.toFixed(2) + ' €';
        if (depensesPercentRow && depensesPercentEl && totalCoutEl) {
            if (res.tauxVariables > 0 && billetsNecessaires !== null) {
                depensesPercentRow.style.display = '';
                depensesPercentEl.textContent = res.depensesVariablesSeuil.toFixed(2) + ' €';
                totalCoutEl.textContent = res.totalCoutSeuil.toFixed(2) + ' €';
            } else {
                depensesPercentRow.style.display = 'none';
                totalCoutEl.textContent = res.coutsFixes.toFixed(2) + ' €';
            }
        }
        
        prixMoyenElement.textContent = prixMoyen.toFixed(2) + ' €';
        billetsNecessairesElement.textContent = billetsNecessaires === null ? '∞' : billetsNecessaires;
        
        if (billetsNecessaires === null) {
            setSeuilProgress(0, 'Seuil inatteignable (coûts variables ≥ 100 % du CA)', false);
        } else if (billetsNecessaires === 0) {
            setSeuilProgress(100, billetsVendus + ' billets vendus · seuil couvert par les apports', false);
        } else {
            var pctSeuil = (billetsVendus / billetsNecessaires) * 100;
            var warnSeuil = pctSeuil < 100 && pctSeuil >= 80;
            setSeuilProgress(
                pctSeuil,
                billetsVendus + ' / ' + billetsNecessaires + ' billets vers le seuil',
                warnSeuil
            );
        }
        
        if (capacite > 0) {
            var pctCap = (billetsVendus / capacite) * 100;
            setRemplProgress(pctCap, billetsVendus + ' / ' + capacite + ' places');
        } else {
            setRemplProgress(0, 'Définissez la capacité sur le spectacle');
        }
        
        if (capacite > 0 && billetsNecessaires !== null) {
            const pourcentage = Math.round((billetsNecessaires / capacite) * 100);
            labelElement.textContent = 'Seuil à ' + pourcentage + ' % de la capacité';
        } else if (billetsNecessaires === 0) {
            labelElement.textContent = 'Apports suffisants pour couvrir les coûts fixes';
        } else if (billetsNecessaires === null) {
            labelElement.textContent = 'Structure de coûts incompatible avec un seuil fini';
        } else {
            labelElement.textContent = 'Billets à vendre pour équilibre charges / produits billetterie';
        }
    } else {
        coutsElement.textContent = budgetEstimatif.toFixed(2) + ' €';
        if (depensesPercentRow && totalCoutEl) {
            depensesPercentRow.style.display = 'none';
            totalCoutEl.textContent = budgetEstimatif.toFixed(2) + ' €';
        }
        prixMoyenElement.textContent = 'Non défini';
        billetsNecessairesElement.textContent = '-';
        labelElement.textContent = 'Définissez le prix moyen dans la billetterie';
        setSeuilProgress(0, '—');
        if (capacite > 0) {
            var pv = billetsVendus / capacite * 100;
            setRemplProgress(pv, billetsVendus + ' / ' + capacite + ' places');
        } else {
            setRemplProgress(0, '—');
        }
    }
}

/**
 * Calcule le nombre de billets nécessaires pour atteindre le seuil de rentabilité.
 * Prend en compte les coûts variables (% du CA) et les apports financiers.
 * @param {Object} spectacle - Spectacle avec budget, apportsFinanciers, capacite
 * @returns {{ billets: number|null, coutsFixes: number, tauxVariables: number }} billets=null si jamais rentable
 */
function getBilletsNecessairesSeuil(spectacle) {
    if (!spectacle || !spectacle.budget || spectacle.budget.length === 0) return { billets: 0, coutsFixes: 0, tauxVariables: 0, depensesVariablesSeuil: 0, totalCoutSeuil: 0 };
    const prixMoyen = getPrixMoyenTicket(spectacle);
    if (prixMoyen <= 0) return { billets: null, coutsFixes: 0, tauxVariables: 0, depensesVariablesSeuil: 0, totalCoutSeuil: 0 };

    let coutsFixes = 0;
    let tauxVariables = 0;
    spectacle.budget.forEach(line => {
        const tvaRate = line.tvaRate || 0;
        if (line.montantType === 'percent') {
            const percent = parseFloat(line.percentBilletterie) || 0;
            tauxVariables += (percent / 100) * (1 + tvaRate / 100);
        } else {
            const montantHT = parseFloat(line.montantFixe) || 0;
            coutsFixes += montantHT * (1 + tvaRate / 100);
        }
    });

    let totalApports = 0;
    (spectacle.apportsFinanciers || []).forEach(apport => {
        const montantHT = parseFloat(apport.montantFixe) || 0;
        const tvaRate = apport.tvaRate || 0;
        const montantInputType = apport.montantInputType || 'HT';
        totalApports += montantInputType === 'TTC' ? montantHT : montantHT * (1 + tvaRate / 100);
    });

    const coutsACouvrir = Math.max(0, coutsFixes - totalApports);
    const margeNette = 1 - tauxVariables;

    if (margeNette <= 0) return { billets: null, coutsFixes, tauxVariables, depensesVariablesSeuil: 0, totalCoutSeuil: coutsFixes };
    if (coutsACouvrir <= 0) return { billets: 0, coutsFixes, tauxVariables, depensesVariablesSeuil: 0, totalCoutSeuil: coutsFixes };
    const billets = Math.ceil(coutsACouvrir / (prixMoyen * margeNette));
    const caSeuil = prixMoyen * billets;
    const depensesVariablesSeuil = caSeuil * tauxVariables;
    return { billets, coutsFixes, tauxVariables, depensesVariablesSeuil, totalCoutSeuil: coutsFixes + depensesVariablesSeuil };
}

function getPrixMoyenTicket(spectacle) {
    if (!spectacle) return 0;
    
    const capacite = spectacle.capacite || 0;
    const caMax = getCAMaximum(spectacle);
    const totalBillets = getTotalBillets(spectacle);
    const totalCA = getTotalCA(spectacle);
    
    // Cas particulier : Capacité = 0
    if (capacite === 0) {
        // Si des billets sont vendus, utiliser le calcul simple
        return totalBillets > 0 ? (totalCA / totalBillets) : 0;
    }
    
    // Cas particulier : CA MAX = 0 ou non défini
    if (caMax === 0 || !caMax) {
        // Utiliser le calcul simple (CA réel / Billets vendus)
        return totalBillets > 0 ? (totalCA / totalBillets) : 0;
    }
    
    // Quand aucun billet n'est vendu (0 ventes)
    if (totalBillets === 0) {
        // Prix moyen = CA MAX / Capacité (prix moyen théorique)
        return caMax / capacite;
    }
    
    // Cas particulier : 100% de remplissage
    if (totalBillets >= capacite) {
        // Prix moyen = CA réel / Billets vendus (c'est le réel final)
        return totalCA / totalBillets;
    }
    
    // Quand des billets sont vendus : moyenne pondérée
    // Prix théorique = CA MAX / Capacité
    const prixTheorique = caMax / capacite;
    
    // Places restantes = Capacité - Billets vendus
    const placesRestantes = capacite - totalBillets;
    
    // CA estimé restant = Places restantes × Prix théorique
    const caEstimeRestant = placesRestantes * prixTheorique;
    
    // Prix moyen estimé = (CA réel + CA estimé restant) / Capacité
    const prixMoyenEstime = (totalCA + caEstimeRestant) / capacite;
    
    return prixMoyenEstime;
}

function saveBudgetData() {
    const projectIndex = projects.findIndex(p => p.id === currentBudgetSpectacle.id);
    if (projectIndex !== -1) {
        projects[projectIndex] = currentBudgetSpectacle;
    }
    saveProjectsAsync();
}

// FONCTIONS APPORTS FINANCIERS
function renderApportsSection() {
    const container = document.getElementById('apportsFinanciersSection');
    if (!container) return;

    const apports = currentBudgetSpectacle.apportsFinanciers || [];

    if (apports.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 1rem; color: #636e72; font-size: 0.85rem;">
                Aucun apport. Cliquez sur "+ Ajouter un apport" pour commencer.
            </div>
        `;
        updateApportsTotal();
        return;
    }

    container.innerHTML = `
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 1200px;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border); background: var(--light);">
                        <th style="text-align: left; padding: 0.5rem; font-family: 'Playfair Display', serif; font-size: 0.85rem;">Désignation</th>
                        <th style="text-align: center; padding: 0.5rem; font-family: 'Playfair Display', serif; font-size: 0.85rem; width: 120px;">Type</th>
                        <th style="text-align: right; padding: 0.5rem; font-family: 'Playfair Display', serif; font-size: 0.85rem; width: 150px;">Montant</th>
                        <th style="text-align: center; padding: 0.5rem; font-family: 'Playfair Display', serif; font-size: 0.85rem; width: 100px;">TVA</th>
                        <th style="text-align: right; padding: 0.5rem; font-family: 'Playfair Display', serif; font-size: 0.85rem; width: 120px;">Montant TTC</th>
                        <th style="text-align: center; padding: 0.5rem; width: 50px; font-size: 0.85rem;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${apports.map((apport, index) => renderApportLine(index, apport)).join('')}
                </tbody>
            </table>
        </div>
    `;
    updateApportsTotal();
}

function renderApportLine(index, apport) {
    const tvaRate = apport.tvaRate || 0;
    const montantInputType = apport.montantInputType || 'HT';
    const montantSaisi = parseFloat(apport.montantFixe) || 0;
    
    let montantHT, montantTTC;
    if (montantInputType === 'TTC') {
        montantTTC = montantSaisi;
        montantHT = tvaRate > 0 ? montantTTC / (1 + tvaRate / 100) : montantTTC;
    } else {
        montantHT = montantSaisi;
        montantTTC = montantHT * (1 + tvaRate / 100);
    }

    return `
        <tr style="border-bottom: 1px solid var(--border);" data-apport-index="${index}">
            <td style="padding: 0.5rem;">
                <input type="text" value="${apport.designation || ''}" onchange="updateApportLine(${index}, 'designation', this.value)" placeholder="Désignation" style="width: 100%; border: 1px solid var(--border); border-radius: 5px; padding: 0.5rem;">
            </td>
            <td style="padding: 0.6rem; text-align: center;">
                <select onchange="updateApportLine(${index}, 'montantInputType', this.value)" style="width: 100%; border: 1px solid var(--border); border-radius: 5px; padding: 0.5rem;">
                    <option value="HT" ${montantInputType === 'HT' ? 'selected' : ''}>HT</option>
                    <option value="TTC" ${montantInputType === 'TTC' ? 'selected' : ''}>TTC</option>
                </select>
            </td>
            <td style="padding: 0.5rem;">
                <input type="number" value="${montantSaisi > 0 ? montantSaisi.toFixed(2) : ''}" step="0.01" onchange="updateApportMontant(${index}, this.value, '${montantInputType}')" placeholder="0.00" style="width: 100%; border: 1px solid var(--border); border-radius: 5px; padding: 0.5rem; text-align: right;">
            </td>
            <td style="padding: 0.5rem;">
                <select onchange="updateApportLine(${index}, 'tvaRate', this.value)" style="width: 100%; border: 1px solid var(--border); border-radius: 5px; padding: 0.5rem;">
                    <option value="0" ${tvaRate === 0 ? 'selected' : ''}>0%</option>
                    <option value="2.1" ${tvaRate === 2.1 ? 'selected' : ''}>2.1%</option>
                    <option value="5.5" ${tvaRate === 5.5 ? 'selected' : ''}>5.5%</option>
                    <option value="10" ${tvaRate === 10 ? 'selected' : ''}>10%</option>
                    <option value="20" ${tvaRate === 20 ? 'selected' : ''}>20%</option>
                </select>
            </td>
            <td style="padding: 0.6rem; text-align: right; font-weight: 600; color: var(--success);">
                ${montantTTC.toFixed(2)} €
            </td>
            <td style="padding: 0.6rem; text-align: center;">
                <button onclick="deleteApportLine(${index})" style="background: var(--danger); color: white; border: none; border-radius: 5px; padding: 0.4rem 0.8rem; cursor: pointer;">🗑️</button>
            </td>
        </tr>
    `;
}

function addApportLine() {
    if (!currentBudgetSpectacle) return;
    
    if (!currentBudgetSpectacle.apportsFinanciers) {
        currentBudgetSpectacle.apportsFinanciers = [];
    }

    const newApport = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        designation: '',
        montantFixe: 0,
        montantInputType: 'HT',
        tvaRate: 0
    };

    currentBudgetSpectacle.apportsFinanciers.push(newApport);
    saveBudgetData();
    renderApportsSection();
    updateBudgetTotals();
}

function deleteApportLine(index) {
    if (!currentBudgetSpectacle || !confirm('Supprimer cet apport financier ?')) return;

    currentBudgetSpectacle.apportsFinanciers.splice(index, 1);
    saveBudgetData();
    renderApportsSection();
    updateBudgetTotals();
}

function updateApportLine(index, field, value) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.apportsFinanciers || !currentBudgetSpectacle.apportsFinanciers[index]) return;
    
    const apport = currentBudgetSpectacle.apportsFinanciers[index];
    
    if (field === 'montantFixe' || field === 'tvaRate') {
        apport[field] = parseFloat(value) || 0;
    } else if (field === 'montantInputType') {
        // Convertir le montant si on change de HT à TTC ou vice versa
        const ancienType = apport.montantInputType || 'HT';
        const nouveauType = value;
        const montantActuel = parseFloat(apport.montantFixe) || 0;
        const tvaRate = apport.tvaRate || 0;
        
        if (ancienType !== nouveauType && montantActuel > 0) {
            if (ancienType === 'HT' && nouveauType === 'TTC') {
                // On avait un HT, maintenant on veut saisir en TTC
                // Le montantFixe actuel est en HT, on le convertit en TTC pour l'affichage
                const montantTTC = montantActuel * (1 + tvaRate / 100);
                apport.montantFixe = montantTTC;
            } else if (ancienType === 'TTC' && nouveauType === 'HT') {
                // On avait un TTC, maintenant on veut saisir en HT
                const montantHT = tvaRate > 0 ? montantActuel / (1 + tvaRate / 100) : montantActuel;
                apport.montantFixe = montantHT;
            }
        }
        apport[field] = value;
    } else {
        apport[field] = value;
    }
    
    // Si le taux de TVA change, recalculer le montant selon le type de saisie
    if (field === 'tvaRate') {
        const tvaRate = parseFloat(value) || 0;
        const montantInputType = apport.montantInputType || 'HT';
        const montantSaisi = parseFloat(apport.montantFixe) || 0;
        
        if (montantInputType === 'TTC') {
            // Recalculer le HT à partir du TTC saisi
            const montantHT = tvaRate > 0 ? montantSaisi / (1 + tvaRate / 100) : montantSaisi;
            apport.montantFixe = montantHT;
        }
    }
    
    saveBudgetData();
    renderApportsSection();
    updateBudgetTotals();
}

function updateApportMontant(index, value, inputType) {
    if (!currentBudgetSpectacle || !currentBudgetSpectacle.apportsFinanciers || !currentBudgetSpectacle.apportsFinanciers[index]) return;
    
    const apport = currentBudgetSpectacle.apportsFinanciers[index];
    const montantSaisi = parseFloat(value) || 0;
    const tvaRate = apport.tvaRate || 0;
    
    if (inputType === 'TTC') {
        // L'utilisateur a saisi un montant TTC, calculer le HT
        const montantHT = tvaRate > 0 ? montantSaisi / (1 + tvaRate / 100) : montantSaisi;
        apport.montantFixe = montantHT;
    } else {
        // L'utilisateur a saisi un montant HT
        apport.montantFixe = montantSaisi;
    }
    
    saveBudgetData();
    renderApportsSection();
    updateBudgetTotals();
}

function updateApportsTotal() {
    const containerTotal = document.getElementById('apportsTotal');
    const containerTVA = document.getElementById('apportsTVA');
    if (!containerTotal || !containerTVA) return;
    
    const apports = currentBudgetSpectacle.apportsFinanciers || [];
    let totalTTC = 0;
    let totalTVA = 0;
    
    apports.forEach(apport => {
        const montantHT = parseFloat(apport.montantFixe) || 0;
        const tvaRate = apport.tvaRate || 0;
        const montantInputType = apport.montantInputType || 'HT';
        let montantTTC, montantHTCalcul;
        if (montantInputType === 'TTC') {
            montantTTC = montantHT;
            montantHTCalcul = tvaRate > 0 ? montantTTC / (1 + tvaRate / 100) : montantTTC;
        } else {
            montantHTCalcul = montantHT;
            montantTTC = montantHT * (1 + tvaRate / 100);
        }
        totalTTC += montantTTC;
        totalTVA += (montantTTC - montantHTCalcul);
    });
    
    containerTotal.textContent = totalTTC.toFixed(2) + ' €';
    containerTVA.textContent = totalTVA.toFixed(2) + ' €';
}

function editBudgetField(lineIndex, field) {
    const line = currentBudgetSpectacle.budget[lineIndex];
    const currentValue = field === 'designation' ? (line[field] || '') : parseFloat(line[field] || 0).toFixed(2);
    
    const cell = event.target.closest('td');
    const span = event.target;
    
    const input = document.createElement('input');
    input.type = field === 'designation' ? 'text' : 'number';
    if (field !== 'designation') {
        input.step = '0.01';
        input.value = parseFloat(currentValue);
    } else {
        input.value = currentValue;
    }
    input.className = 'editable-input';
    input.style.width = '100%';
    
    span.replaceWith(input);
    input.focus();
    if (field === 'designation') {
        input.select();
    }
    
    const save = () => {
        const newValue = field === 'designation' ? input.value.trim() : parseFloat(input.value) || 0;
        line[field] = newValue;
        
        // Mettre à jour dans projects
        const projectIndex = projects.findIndex(p => p.id === currentBudgetSpectacle.id);
        if (projectIndex !== -1) {
            projects[projectIndex] = currentBudgetSpectacle;
        }
        
        saveProjectsAsync();
        renderBudgetTable();
        updateBudgetTotals();
    };
    
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            save();
        } else if (e.key === 'Escape') {
            renderBudgetTable();
        }
    });
}

// ========== MEMBRES PROJET ==========

function renderMembresCard(project, cardElementId) {
    const targetId = cardElementId || (project.type === 'tournee' ? 'tourneeMembresCard' : 'spectacleDetailMembresCard');
    const card = document.getElementById(targetId);
    if (!card) return;
    
    const members = project.members || [];
    let totalCount = members.length;
    
    // Pour les spectacles de tournée, compter aussi les membres hérités
    if (project.parentId) {
        const tournee = projects.find(p => p.id === project.parentId);
        if (tournee && tournee.members) {
            const inherited = tournee.members.filter(m => !members.includes(String(m)));
            totalCount += inherited.length;
        }
    }
    
    const isTournee = project.type === 'tournee';
    const subtitle = isTournee 
        ? 'Accès à tous les spectacles' 
        : project.parentId 
            ? (totalCount === 0 ? 'Aucun membre' : totalCount === 1 ? '1 membre (dont tournée)' : totalCount + ' membres (dont tournée)')
            : (totalCount === 0 ? 'Aucun membre' : totalCount === 1 ? '1 membre' : totalCount + ' membres');
    
    const label = totalCount === 0 ? 'Aucun membre' : totalCount === 1 ? '1 membre' : totalCount + ' membres';
    
    card.innerHTML = `
        <div class="project-card" onclick="openMembresModal('${project.id}')" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1rem; font-weight: 600; color: var(--primary);">👥 Équipe</span>
                <span style="background: var(--light); color: var(--primary); font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; font-size: 0.85rem;">${totalCount}</span>
            </div>
            <span style="color: var(--accent); font-size: 1.1rem;">→</span>
        </div>
    `;
}

let currentMembresProjectId = null;
async function openMembresModal(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    currentMembresProjectId = projectId;
    const users = await loadUsersForAssignments();
    const currentMembers = (project.members || []).map(String);
    
    const isTournee = project.type === 'tournee';
    const isChildOfTournee = !!project.parentId;
    
    // Pour spectacles de tournée : les membres de la tournée sont auto-hérités (non décochables)
    let tourneeMembers = [];
    if (isChildOfTournee) {
        const tournee = projects.find(p => p.id === project.parentId);
        if (tournee) tourneeMembers = (tournee.members || []).map(String);
    }
    
    let html = '<div class="modal-content" style="max-width: 550px;"><h2>👥 Gérer l\'équipe' + (isTournee ? ' de la tournée' : '') + '</h2>';
    if (isTournee) {
        html += '<p style="color: #636e72; margin-bottom: 0.5rem; font-size: 0.9rem;">Les producteurs et chargés de production sont assignés automatiquement. Ces membres auront accès à <strong>tous les spectacles</strong> de la tournée.</p>';
    } else if (isChildOfTournee) {
        html += '<p style="color: #636e72; margin-bottom: 0.5rem; font-size: 0.9rem;">Les membres de la tournée (grisés) ont automatiquement accès. Ajoutez ici des membres spécifiques à cette date uniquement.</p>';
    } else {
        html += '<p style="color: #636e72; margin-bottom: 0.5rem; font-size: 0.9rem;">Les producteurs et chargés de production sont assignés automatiquement.</p>';
    }
    html += '<div style="max-height: 350px; overflow-y: auto;">';
    
    // Trier : auto-assignés / hérités en premier, puis les autres
    const sorted = [...users].sort((a, b) => {
        const uid_a = String(a.id), uid_b = String(b.id);
        const aLocked = (isTournee || !isChildOfTournee) ? AUTO_ASSIGN_ROLES.includes(a.role_professionnel) : tourneeMembers.includes(uid_a);
        const bLocked = (isTournee || !isChildOfTournee) ? AUTO_ASSIGN_ROLES.includes(b.role_professionnel) : tourneeMembers.includes(uid_b);
        if (aLocked && !bLocked) return -1;
        if (!aLocked && bLocked) return 1;
        return 0;
    });
    
    sorted.forEach(u => {
        const uid = String(u.id);
        const isAutoRole = AUTO_ASSIGN_ROLES.includes(u.role_professionnel);
        
        // Logique de verrouillage selon le contexte
        let isLocked = false;
        let lockReason = '';
        if (isTournee || !isChildOfTournee) {
            // Tournée ou spectacle isolé : les auto-rôles sont verrouillés
            isLocked = isAutoRole;
            lockReason = 'auto';
        } else {
            // Spectacle enfant de tournée : les membres de la tournée sont verrouillés
            if (tourneeMembers.includes(uid)) {
                isLocked = true;
                lockReason = 'tournée';
            }
        }
        
        const checked = isLocked || currentMembers.includes(uid) ? 'checked' : '';
        const name = `${u.prenom || ''} ${u.nom || u.username}`.trim();
        const role = u.role_professionnel || '';
        const roleColor = role === 'Producteur' ? '#e17055' : role === 'Chargé de production' ? '#0984e3' : role === 'Directeur technique' ? '#6c5ce7' : role === 'Coproducteur' ? '#00b894' : role === 'Graphiste' ? '#fdcb6e' : role === 'Stagiaire' ? '#74b9ff' : '#b2bec3';
        const roleBadge = role ? `<span style="font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 12px; background: ${roleColor}20; color: ${roleColor}; font-weight: 600; white-space: nowrap;">${role}</span>` : '';
        const lockBadge = isLocked ? `<span style="font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 8px; background: #dfe6e9; color: #636e72; white-space: nowrap;">${lockReason}</span>` : '';
        const opacity = isLocked ? 'opacity: 0.8;' : '';
        
        html += `<label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.5rem; cursor: ${isLocked ? 'default' : 'pointer'}; border-bottom: 1px solid #f1f3f5; ${opacity}">
            <input type="checkbox" value="${uid}" ${isLocked ? 'checked disabled' : checked} data-auto="${isAutoRole}" data-locked="${isLocked}" data-lock-reason="${lockReason}">
            <div style="flex: 1; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span style="font-weight: 500;">${name}</span>
                ${roleBadge}
                ${lockBadge}
            </div>
        </label>`;
    });
    
    html += '</div><div class="form-actions" style="margin-top: 1rem;"><button class="btn btn-secondary" onclick="closeMembresModal()">Annuler</button><button class="btn" onclick="saveMembresModal()">Enregistrer</button></div></div>';
    let modal = document.getElementById('membresModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'membresModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
}
function closeMembresModal() {
    const modal = document.getElementById('membresModal');
    if (modal) modal.style.display = 'none';
    currentMembresProjectId = null;
}

// Rôles qui donnent une assignation automatique aux spectacles
const AUTO_ASSIGN_ROLES = ['Producteur', 'Chargé de production'];

// Vérifier si un userId est auto-assigné (son rôle professionnel est dans AUTO_ASSIGN_ROLES)
function isAutoAssignedUser(userId) {
    const user = getUserById(userId);
    if (!user) return false;
    return AUTO_ASSIGN_ROLES.includes(user.role_professionnel);
}

// Obtenir tous les IDs des utilisateurs auto-assignables
async function getAutoAssignUserIds() {
    try {
        const users = await loadUsersForAssignments();
        return users
            .filter(u => AUTO_ASSIGN_ROLES.includes(u.role_professionnel))
            .map(u => String(u.id));
    } catch (e) {
        console.error('Erreur getAutoAssignUserIds:', e);
        return [];
    }
}

// Synchro quand le rôle professionnel d'un user change dans l'admin
function syncUserRoleToSpectacleMembers(userId, oldRole, newRole) {
    const wasAuto = AUTO_ASSIGN_ROLES.includes(oldRole);
    const isNowAuto = AUTO_ASSIGN_ROLES.includes(newRole);
    const uid = String(userId);
    
    if (wasAuto === isNowAuto) return; // Pas de changement concernant l'auto-assign
    
    let changed = false;
    projects.forEach(p => {
        // Traiter les tournées ET les spectacles isolés (pas les enfants de tournée → héritage via tournée)
        if (p.parentId) return; // Spectacle enfant de tournée → skip
        if (!p.members) p.members = [];
        if (!p.membersManual) p.membersManual = [];
        
        if (isNowAuto && !wasAuto) {
            // Devient Producteur/Chargé de prod → ajouter à tous les projets racine
            if (!p.members.includes(uid)) {
                p.members.push(uid);
                changed = true;
            }
        } else if (wasAuto && !isNowAuto) {
            // N'est plus Producteur/Chargé de prod → retirer SAUF si ajouté manuellement
            if (!p.membersManual.includes(uid)) {
                const idx = p.members.indexOf(uid);
                if (idx !== -1) {
                    p.members.splice(idx, 1);
                    changed = true;
                }
            }
        }
    });
    
    if (changed) {
        saveProjectsAsync();
        console.log(`Synchro membres spectacles pour user ${uid}: ${oldRole} → ${newRole}`);
    }
}

// Auto-assigner les Producteurs/Chargés de production à un nouveau spectacle
async function autoAssignMembersToNewSpectacle(spectacle) {
    try {
        const autoIds = await getAutoAssignUserIds();
        if (!spectacle.members) spectacle.members = [];
        if (!spectacle.membersManual) spectacle.membersManual = [];
        autoIds.forEach(uid => {
            if (!spectacle.members.includes(uid)) {
                spectacle.members.push(uid);
            }
        });
    } catch (e) {
        console.error('Erreur autoAssignMembers:', e);
    }
}

// Trouver le DT d'un spectacle : chercher dans les members celui qui a le rôle "Directeur technique"
function getDirecteurTechniqueFromEquipe(spectacle) {
    if (!spectacle || !spectacle.members || !spectacle.members.length) return null;
    for (const memberId of spectacle.members) {
        const user = getUserById(memberId);
        if (user && user.role_professionnel === 'Directeur technique') {
            return user;
        }
    }
    return null;
}

async function saveMembresModal() {
    if (!currentMembresProjectId) return;
    const project = projects.find(p => p.id === currentMembresProjectId);
    if (!project) return;
    
    // Les checkboxes cochées manuellement (non disabled)
    const manualChecked = Array.from(document.querySelectorAll('#membresModal input[type="checkbox"]:checked:not(:disabled)')).map(cb => cb.value);
    // Les locked (disabled) sont toujours inclus - mais seulement ceux avec data-lock-reason="auto" (pas "tournée" car ceux-là sont hérités, pas stockés)
    const autoLocked = Array.from(document.querySelectorAll('#membresModal input[type="checkbox"][data-locked="true"][data-lock-reason="auto"]')).map(cb => cb.value);
    // Les hérités de tournée NE SONT PAS ajoutés aux members du spectacle enfant
    
    // Fusion sans doublons
    const newMembers = [...new Set([...autoLocked, ...manualChecked])];
    const prevMembers = (project.members || []).map(String);
    
    // Les membres manuels = ceux cochés qui ne sont PAS auto-assignés par rôle
    const newManual = manualChecked.filter(uid => !isAutoAssignedUser(uid));
    
    if (!project.members) project.members = [];
    if (!project.membersManual) project.membersManual = [];
    project.members = newMembers;
    project.membersManual = newManual;
    
    const projectName = project.name || project.lieu || 'Projet';
    newMembers.filter(id => !prevMembers.includes(id)).forEach(uid => 
        notifyUserAssigned(uid, 'Assignation au projet', `Vous avez été assigné(e) au projet « ${projectName} ».`, 'assignment', { type: 'project', projectId: project.id }));
    saveProjectsAsync();
    renderMembresCard(project);
    closeMembresModal();
}

function filterProjectsByMembership(projectsList) {
    if (!window.hasPermission) return projectsList;
    const isAdmin = currentUser?.role === 'admin';
    if (isAdmin) return projectsList;
    const isAssignesOnly = window.hasPermission('projets_assignes');
    if (!isAssignesOnly) return projectsList;
    const userId = currentUser?.id ? String(currentUser.id) : null;
    if (!userId) return projectsList;
    
    const toStr = (x) => (typeof x === 'object' && x && x.id != null) ? String(x.id) : String(x);
    
    // Vérifie si l'user est directement dans les members d'un projet
    const isDirectMember = (p) => {
        if (p.members && p.members.some(m => toStr(m) === userId)) return true;
        // Tâches assignées
        const assignedToOrAssignees = (t) => (t.assignedTo || t.assignees || []).some(id => toStr(id) === userId);
        if (p.tasks && p.tasks.some(assignedToOrAssignees)) return true;
        // DT legacy
        if (p.tech && p.tech.directeurTechniqueId && String(p.tech.directeurTechniqueId) === userId) return true;
        // DT depuis équipe
        const dtUser = getDirecteurTechniqueFromEquipe(p);
        if (dtUser && String(dtUser.id) === userId) return true;
        return false;
    };
    
    // Vérifie si l'user est membre de la tournée parente
    const isMemberOfParentTournee = (spectacle) => {
        if (!spectacle.parentId) return false;
        const tournee = projects.find(p => p.id === spectacle.parentId);
        return tournee ? isDirectMember(tournee) : false;
    };
    
    return projectsList.filter(p => {
        if (p.type === 'tournee') {
            // Tournée visible si : membre direct de la tournée OU membre d'au moins un spectacle enfant
            if (isDirectMember(p)) return true;
            return projects.filter(s => s.parentId === p.id).some(s => isDirectMember(s));
        }
        // Spectacle (isolé ou enfant de tournée)
        // Visible si : membre direct DU spectacle OU membre de la tournée parente
        return isDirectMember(p) || isMemberOfParentTournee(p);
    });
}

if (typeof window !== 'undefined') {
    window.downloadProjectBackup = downloadProjectBackup;
}
