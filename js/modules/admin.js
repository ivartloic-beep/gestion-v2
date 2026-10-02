// ========== GESTION DES PROFILS DE PERMISSIONS (ADMIN) ==========

let currentEditingProfile = null;
let allProfiles = [];

async function loadProfilesList() {
    try {
        const data = await apiCall('permission_profiles.php', 'GET');
        if (data && data.profiles) {
            allProfiles = data.profiles;
            renderProfilesList(data.profiles);
        }
    } catch (error) {
        console.error('Erreur chargement profils:', error);
        const list = document.getElementById('adminProfilesList');
        if (list) {
            list.innerHTML = '<div class="admin-empty">Erreur de chargement: ' + error.message + '</div>';
        }
    }
}

function renderProfilesList(profiles) {
    const list = document.getElementById('adminProfilesList');
    if (!list) return;
    
    if (!profiles || profiles.length === 0) {
        list.innerHTML = '<div class="admin-empty">Aucun profil de permissions. Créez-en un pour commencer.</div>';
        return;
    }
    
    let html = '';
    profiles.forEach(profile => {
        const permissions = profile.permissions || {};
        const permCount = Object.keys(permissions).length;
        html += `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-name">${profile.name}</div>
                    <div class="admin-list-item-detail">${profile.description || 'Aucune description'} - ${permCount} section(s) configurée(s)</div>
                </div>
                <div class="admin-list-item-actions">
                    <button class="btn btn-secondary" onclick="editProfile(${profile.id})" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">Modifier</button>
                    <button class="btn" onclick="deleteProfile(${profile.id})" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background: var(--accent);">Supprimer</button>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

function openProfileModal(profile = null) {
    currentEditingProfile = profile;
    const modal = document.getElementById('profileModal');
    if (!modal) {
        createProfileModal();
    }
    
    if (profile) {
        document.getElementById('profileModalTitle').textContent = 'Modifier le profil';
        document.getElementById('profileFormName').value = profile.name;
        document.getElementById('profileFormDescription').value = profile.description || '';
        
        // Remplir les permissions
        const permissions = profile.permissions || {};
        sectionsList.forEach(section => {
            const perm = permissions[section] || { can_view: false, can_edit: false };
            document.getElementById(`profile_perm_${section}_view`).checked = perm.can_view;
            document.getElementById(`profile_perm_${section}_edit`).checked = perm.can_edit;
        });
    } else {
        document.getElementById('profileModalTitle').textContent = 'Nouveau profil de permissions';
        document.getElementById('profileForm').reset();
        sectionsList.forEach(section => {
            document.getElementById(`profile_perm_${section}_view`).checked = false;
            document.getElementById(`profile_perm_${section}_edit`).checked = false;
        });
    }
    
    document.getElementById('profileModal').style.display = 'flex';
}

function createProfileModal() {
    const modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    
    let permissionsHTML = '';
    sectionsList.forEach(section => {
        const sectionNames = {
            'bureau': 'Mon Bureau',
            'espaces_travail': 'Espaces de travail (Projets)',
            'projets': 'Spectacles / Tournées',
            'projets_assignes': 'Spectacles (assignés uniquement)',
            'budget': 'Budget',
            'billetterie': 'Billetterie',
            'visuels': 'Visuels',
            'technique': 'Technique',
            'taches': 'Tâches',
            'communication': 'Communication',
            'comptabilite': 'Comptabilité — dépôt documents (factures, devis…)',
            'previsionnels': 'Prévisionnels',
            'crm': 'CRM',
            'catalogue': 'Catalogue Spectacles',
            'import_ventes': 'Import des ventes',
            'notes_de_frais_validation': 'Validation (compta) — notes, factures, devis',
            'admin': 'Administration'
        };
        permissionsHTML += `
            <div style="margin-bottom: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                <div style="font-weight: bold; margin-bottom: 0.5rem;">${sectionNames[section] || section}</div>
                <div style="display: flex; gap: 1.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="profile_perm_${section}_view">
                        <span>Voir</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="profile_perm_${section}_edit">
                        <span>Modifier</span>
                    </label>
                </div>
            </div>
        `;
    });
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
            <h2 id="profileModalTitle">Nouveau profil de permissions</h2>
            <form id="profileForm" onsubmit="saveProfile(event)">
                <div class="form-group">
                    <label>Nom du profil *</label>
                    <input type="text" id="profileFormName" required placeholder="Ex: Admin, Totale, Partielle...">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="profileFormDescription" rows="3" placeholder="Description du profil de permissions"></textarea>
                </div>
                <div style="margin-top: 1.5rem;">
                    <h3 style="margin-bottom: 1rem;">Permissions par section</h3>
                    ${permissionsHTML}
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeProfileModal()">Annuler</button>
                    <button type="submit" class="btn">Enregistrer</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
}

async function saveProfile(event) {
    event.preventDefault();
    
    const permissions = {};
    sectionsList.forEach(section => {
        permissions[section] = {
            can_view: document.getElementById(`profile_perm_${section}_view`).checked,
            can_edit: document.getElementById(`profile_perm_${section}_edit`).checked
        };
    });
    
    const profileData = {
        name: document.getElementById('profileFormName').value,
        description: document.getElementById('profileFormDescription').value,
        permissions: permissions
    };
    
    try {
        if (currentEditingProfile) {
            profileData.id = currentEditingProfile.id;
            await apiCall('permission_profiles.php', 'PUT', profileData);
        } else {
            await apiCall('permission_profiles.php', 'POST', profileData);
        }
        
        closeProfileModal();
        await loadProfilesList();
        alert(currentEditingProfile ? 'Profil modifié avec succès' : 'Profil créé avec succès');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        alert('Erreur: ' + error.message);
    }
}

async function editProfile(profileId) {
    try {
        const data = await apiCall('permission_profiles.php', 'GET');
        const profile = data.profiles.find(p => p.id === profileId);
        if (profile) {
            openProfileModal(profile);
        }
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

async function deleteProfile(profileId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce profil ? Les utilisateurs utilisant ce profil devront être modifiés.')) {
        return;
    }
    
    try {
        await apiCall('permission_profiles.php', 'DELETE', { id: profileId });
        await loadProfilesList();
        alert('Profil supprimé avec succès');
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

// ========== GESTION DES UTILISATEURS (ADMIN) ==========

let currentEditingUser = null;
const sectionsList = ['bureau', 'espaces_travail', 'projets', 'projets_assignes', 'budget', 'billetterie', 'visuels', 'technique', 'taches', 'communication', 'comptabilite', 'previsionnels', 'crm', 'catalogue', 'import_ventes', 'notes_de_frais_validation', 'admin'];
let allUsers = []; // Cache des utilisateurs pour les assignations de tâches

async function loadUsersList() {
    const list = document.getElementById('adminUsersList');
    if (list && currentUser && currentUser.role !== 'admin') {
        list.innerHTML = '<div class="admin-empty">Accès refusé. Réservé aux administrateurs.</div>';
        return;
    }
    try {
        console.log('Chargement de la liste des utilisateurs...');
        console.log('Token actuel:', authToken ? 'présent' : 'absent');
        console.log('Current user:', currentUser);
        
        const data = await apiCall('users.php', 'GET');
        console.log('Réponse complète de l\'API:', JSON.stringify(data, null, 2));
        
        if (data && data.users) {
            console.log(`Nombre d'utilisateurs reçus: ${data.users.length}`);
            console.log('Détails des utilisateurs:', data.users);
            allUsers = data.users; // Mettre en cache pour les assignations
            renderUsersList(data.users);
        } else if (data && data.error) {
            console.error('Erreur de l\'API:', data.error);
            if (list) list.innerHTML = '<div class="admin-empty">Erreur: ' + data.error + '</div>';
        } else {
            console.error('Format de réponse inattendu:', data);
            if (list) list.innerHTML = '<div class="admin-empty">Format de réponse inattendu: ' + JSON.stringify(data) + '</div>';
        }
    } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        if (msg.indexOf('403') !== -1 || msg.indexOf('Accès refusé') !== -1 || msg.indexOf('refusé') !== -1) {
            if (list) list.innerHTML = '<div class="admin-empty">Accès refusé. Réservé aux administrateurs.</div>';
        } else {
            console.error('Erreur chargement utilisateurs:', e);
            if (list) list.innerHTML = '<div class="admin-empty">Erreur: ' + msg + '</div>';
        }
    }
}

// Charger les utilisateurs pour les assignations (accessible à tous via users_list.php)
function deduplicateUsersById(users) {
    const seenIds = new Set();
    const seenNames = new Set();
    return (users || []).filter(u => {
        const id = String(u?.id ?? '');
        if (!id || seenIds.has(id)) return false;
        const nameKey = `${(u?.prenom||'').trim()} ${(u?.nom||u?.username||'').trim()}`.trim().toLowerCase();
        if (nameKey && seenNames.has(nameKey)) return false;
        seenIds.add(id);
        if (nameKey) seenNames.add(nameKey);
        return true;
    });
}
async function loadUsersForAssignments() {
    if (allUsers.length > 0) return allUsers;
    try {
        const data = await apiCall('users_list.php', 'GET');
        if (data?.users?.length) {
            allUsers = deduplicateUsersById(data.users);
            return allUsers;
        }
    } catch (e) { /* users_list peut ne pas exister */ }
    if (currentUser && currentUser.role === 'admin') {
        try {
            const data = await apiCall('users.php', 'GET');
            if (data?.users?.length) allUsers = deduplicateUsersById(data.users);
        } catch (e) { /* 403 si non-admin, ignoré */ }
    }
    return allUsers;
}

function renderUsersList(users) {
    console.log('renderUsersList appelé avec', users ? users.length : 0, 'utilisateurs');
    const list = document.getElementById('adminUsersList');
    if (!list) {
        console.error('Élément adminUsersList introuvable dans le DOM');
        console.error('Recherche de l\'élément...');
        // Attendre un peu et réessayer
        setTimeout(() => {
            const retryList = document.getElementById('adminUsersList');
            if (retryList) {
                console.log('Élément trouvé après attente, affichage...');
                renderUsersList(users);
            } else {
                console.error('Élément toujours introuvable après attente');
            }
        }, 100);
        return;
    }
    
    console.log('Élément adminUsersList trouvé, affichage de', users ? users.length : 0, 'utilisateurs');
    
    if (!users || users.length === 0) {
        console.warn('Aucun utilisateur à afficher');
        list.innerHTML = '<div class="admin-empty">Aucun utilisateur</div>';
        return;
    }
    
    let html = '';
    users.forEach((user, index) => {
        console.log(`Traitement utilisateur ${index + 1}:`, user.username, user.id);
        const permissions = user.permissions || {};
        const roleProf = user.role_professionnel || '';
        const roleDisplay = roleProf ? ` <span style="color: #636e72; font-size: 0.9em;">(${roleProf})</span>` : '';
        const isSelf = currentUser && String(user.id) === String(currentUser.id);
        html += `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-name">
                        ${user.prenom || ''} ${user.nom || user.username}${roleDisplay} ${user.role === 'admin' ? '<span style="color: var(--accent);">(Admin)</span>' : ''}${isSelf ? ' <span style="color: #636e72; font-size: 0.85em;">(vous)</span>' : ''}
                    </div>
                    <div class="admin-list-item-detail">${user.username} - ${user.email || 'Pas d\'email'}</div>
                </div>
                <div class="admin-list-item-actions">
                    <button class="btn btn-secondary" onclick="editUser(${user.id})" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">${isSelf ? 'Mon profil' : 'Modifier'}</button>
                    ${isSelf ? '' : `<button class="btn" onclick="deleteUser(${user.id})" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background: var(--accent);">Supprimer</button>`}
                </div>
            </div>
        `;
    });
    console.log('HTML généré, longueur:', html.length);
    list.innerHTML = html;
    console.log('Liste des utilisateurs affichée avec succès');
}

function isEditingOwnUser(user) {
    return !!(user && currentUser && String(user.id) === String(currentUser.id));
}

function setUserModalSelfEditMode(selfEdit) {
    const roleGroup = document.getElementById('userFormRoleGroup');
    if (roleGroup) roleGroup.style.display = selfEdit ? 'none' : '';
}

async function openUserModal(user = null) {
    currentEditingUser = user;
    const modal = document.getElementById('userModal');
    if (!modal) {
        createUserModal();
    }
    
    // Charger les profils de permissions
    await populateProfileSelect();
    
    if (user) {
        const selfEdit = isEditingOwnUser(user);
        document.getElementById('userModalTitle').textContent = selfEdit ? 'Modifier mon profil' : 'Modifier l\'utilisateur';
        setUserModalSelfEditMode(selfEdit);
        const roleEl = document.getElementById('userFormRole');
        if (roleEl) {
            if (selfEdit) roleEl.removeAttribute('required');
            else roleEl.setAttribute('required', 'required');
        }
        document.getElementById('userFormUsername').value = user.username;
        document.getElementById('userFormUsername').disabled = true;
        document.getElementById('userFormNom').value = user.nom || '';
        document.getElementById('userFormPrenom').value = user.prenom || '';
        document.getElementById('userFormEmail').value = user.email || '';
        document.getElementById('userFormRole').value = user.role || 'user';
        document.getElementById('userFormRoleProfessionnel').value = user.role_professionnel || '';
        document.getElementById('userFormPassword').required = false;
        document.getElementById('userFormPassword').placeholder = 'Laisser vide pour ne pas changer';
        document.getElementById('userFormPassword').value = '';
        
        // Remplir le profil de permissions si défini
        if (user.permission_profile_id) {
            document.getElementById('userFormProfile').value = user.permission_profile_id;
        } else {
            document.getElementById('userFormProfile').value = '';
        }
        
        // Remplir les permissions
        const permissions = user.permissions || {};
        sectionsList.forEach(section => {
            const perm = permissions[section] || { can_view: false, can_edit: false };
            document.getElementById(`perm_${section}_view`).checked = perm.can_view;
            document.getElementById(`perm_${section}_edit`).checked = perm.can_edit;
        });
        const mbSection = document.getElementById('userMailboxesSection');
        if (mbSection) mbSection.style.display = '';
        await loadUserMailboxesAdmin(user.id);
    } else {
        document.getElementById('userModalTitle').textContent = 'Nouvel utilisateur';
        setUserModalSelfEditMode(false);
        document.getElementById('userForm').reset();
        document.getElementById('userFormUsername').disabled = false;
        document.getElementById('userFormPassword').required = true;
        document.getElementById('userFormPassword').placeholder = '';
        sectionsList.forEach(section => {
            document.getElementById(`perm_${section}_view`).checked = true;
            document.getElementById(`perm_${section}_edit`).checked = true;
        });
        const mbSection = document.getElementById('userMailboxesSection');
        if (mbSection) mbSection.style.display = 'none';
    }
    
    document.getElementById('userModal').style.display = 'flex';
}

async function populateProfileSelect() {
    const select = document.getElementById('userFormProfile');
    if (!select) return;
    
    try {
        const data = await apiCall('permission_profiles.php', 'GET');
        if (data && data.profiles) {
            // Garder l'option "Aucun"
            const currentValue = select.value;
            select.innerHTML = '<option value="">-- Aucun (permissions personnalisées) --</option>';
            
            data.profiles.forEach(profile => {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.name;
                select.appendChild(option);
            });
            
            // Restaurer la valeur si elle existait
            if (currentValue) {
                select.value = currentValue;
            }
        }
    } catch (error) {
        console.error('Erreur chargement profils:', error);
    }
}

async function applyProfilePermissions() {
    const profileId = document.getElementById('userFormProfile').value;
    if (!profileId) {
        // Si aucun profil, ne rien faire (garder les permissions actuelles)
        return;
    }
    
    try {
        const data = await apiCall('permission_profiles.php', 'GET');
        if (data && data.profiles) {
            const profile = data.profiles.find(p => p.id.toString() === profileId.toString());
            if (profile && profile.permissions) {
                // Appliquer les permissions du profil
                sectionsList.forEach(section => {
                    const perm = profile.permissions[section] || { can_view: false, can_edit: false };
                    document.getElementById(`perm_${section}_view`).checked = perm.can_view;
                    document.getElementById(`perm_${section}_edit`).checked = perm.can_edit;
                });
            }
        }
    } catch (error) {
        console.error('Erreur application profil:', error);
        alert('Erreur lors de l\'application du profil: ' + error.message);
    }
}

function createUserModal() {
    const modal = document.createElement('div');
    modal.id = 'userModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
            <h2 id="userModalTitle">Nouvel utilisateur</h2>
            <form id="userForm" onsubmit="saveUser(event)">
                <input type="hidden" id="userId">
                <div class="form-group">
                    <label>Nom d'utilisateur *</label>
                    <input type="text" id="userFormUsername" required>
                </div>
                <div class="form-group">
                    <label>Mot de passe *</label>
                    <input type="password" id="userFormPassword" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Nom</label>
                        <input type="text" id="userFormNom">
                    </div>
                    <div class="form-group">
                        <label>Prénom</label>
                        <input type="text" id="userFormPrenom">
                    </div>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="userFormEmail">
                </div>
                <div class="form-group" id="userFormRoleGroup">
                    <label>Rôle système *</label>
                    <select id="userFormRole" required>
                        <option value="user">Utilisateur</option>
                        <option value="admin">Administrateur</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Rôle professionnel</label>
                    <select id="userFormRoleProfessionnel">
                        <option value="">-- Aucun --</option>
                        <option value="Producteur">Producteur</option>
                        <option value="Chargé de production">Chargé de production</option>
                        <option value="Directeur technique">Directeur technique</option>
                        <option value="Coproducteur">Coproducteur</option>
                        <option value="Graphiste">Graphiste</option>
                        <option value="Stagiaire">Stagiaire</option>
                    </select>
                </div>
                <div class="form-group" id="userFormProfileGroup">
                    <label>Profil de permissions</label>
                    <select id="userFormProfile" onchange="applyProfilePermissions()">
                        <option value="">-- Aucun (permissions personnalisées) --</option>
                    </select>
                    <small style="color: #636e72; display: block; margin-top: 0.25rem;">Sélectionnez un profil pour appliquer automatiquement les permissions, ou configurez-les manuellement ci-dessous.</small>
                </div>
                <div class="form-group" id="userFormPermissionsGroup">
                    <label style="margin-bottom: 0.5rem; display: block;">Permissions</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; background: var(--light); padding: 1rem; border-radius: 8px;">
                        ${sectionsList.map(section => `
                            <div style="grid-column: 1 / -1; font-weight: 600; margin-top: 0.5rem; text-transform: capitalize;">${section}</div>
                            <label style="display: flex; align-items: center; gap: 0.5rem;">
                                <input type="checkbox" id="perm_${section}_view">
                                <span>Voir</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem;">
                                <input type="checkbox" id="perm_${section}_edit">
                                <span>Modifier</span>
                            </label>
                            <div></div>
                        `).join('')}
                    </div>
                </div>
                <div class="user-mailboxes-section" id="userMailboxesSection" style="display: none;">
                    <label style="margin-bottom: 0.5rem; display: block; font-weight: 600;">📧 Boîtes mail (Mails)</label>
                    <p style="font-size: 0.85rem; color: #636e72; margin: 0 0 0.75rem;">Configurez les boîtes OVH accessibles depuis le menu Mails. Sans boîte, le menu n'apparaît pas.</p>
                    <div id="userMailboxesList" class="user-mailboxes-list"></div>
                    <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px; margin-top: 0.5rem;">
                        <div style="font-weight: 600; margin-bottom: 0.75rem; font-size: 0.9rem;">Ajouter une boîte</div>
                        <div class="form-group" style="margin-bottom: 0.5rem;">
                            <label style="font-size: 0.85rem;">Libellé</label>
                            <input type="text" id="userMailboxLabel" placeholder="Ex: Contact, Booking…">
                        </div>
                        <div class="form-group" style="margin-bottom: 0.5rem;">
                            <label style="font-size: 0.85rem;">Adresse email *</label>
                            <input type="email" id="userMailboxEmail" placeholder="contact@domaine.com">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.85rem;">Identifiant IMAP/SMTP</label>
                                <input type="text" id="userMailboxUsername" placeholder="= email si vide">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.85rem;">Mot de passe OVH *</label>
                                <input type="password" id="userMailboxPassword" placeholder="Mot de passe boîte">
                            </div>
                        </div>
                        <details style="font-size: 0.85rem; margin-bottom: 0.75rem;">
                            <summary style="cursor: pointer; color: #636e72;">Serveurs avancés (OVH par défaut)</summary>
                            <p style="margin: 0.5rem 0; color: #636e72; line-height: 1.35;">
                                Classique / MX Plan : ssl0.ovh.net — Email Pro : pro1.mail.ovh.net — Exchange : ex2.mail.ovh.net (Manager OVH → Email).
                            </p>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
                                <input type="text" id="userMailboxImapHost" value="ssl0.ovh.net" placeholder="IMAP host">
                                <input type="number" id="userMailboxImapPort" value="993" placeholder="IMAP port">
                                <input type="text" id="userMailboxSmtpHost" value="ssl0.ovh.net" placeholder="SMTP host">
                                <input type="number" id="userMailboxSmtpPort" value="465" placeholder="SMTP port">
                            </div>
                        </details>
                        <button type="button" class="btn btn-secondary" style="width: 100%;" onclick="addUserMailboxFromForm()">+ Ajouter cette boîte</button>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeUserModal()">Annuler</button>
                    <button type="submit" class="btn">Enregistrer</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveUser(event) {
    event.preventDefault();
    
    const permissions = {};
    sectionsList.forEach(section => {
        permissions[section] = {
            can_view: document.getElementById(`perm_${section}_view`).checked,
            can_edit: document.getElementById(`perm_${section}_edit`).checked
        };
    });
    
    const roleProfessionnel = document.getElementById('userFormRoleProfessionnel').value;
    const profileId = document.getElementById('userFormProfile').value || null;
    var societies = ['lcom'];
    const isSelf = currentEditingUser && isEditingOwnUser(currentEditingUser);
    
    const userData = {
        username: document.getElementById('userFormUsername').value,
        password: document.getElementById('userFormPassword').value,
        nom: document.getElementById('userFormNom').value,
        prenom: document.getElementById('userFormPrenom').value,
        email: document.getElementById('userFormEmail').value,
        role: document.getElementById('userFormRole').value,
        role_professionnel: roleProfessionnel || null,
        role_professionnel_autre: null,
        permission_profile_id: profileId ? parseInt(profileId) : null,
        societies: societies,
        permissions: permissions
    };

    if (isSelf) {
        delete userData.role;
        delete userData.societies;
    }
    
    // Déterminer l'ancien rôle professionnel pour savoir si on doit synchro les membres
    const oldRole = currentEditingUser ? (currentEditingUser.role_professionnel || '') : '';
    const newRole = roleProfessionnel || '';
    
    try {
        if (currentEditingUser) {
            // Modifier
            userData.id = currentEditingUser.id;
            if (!userData.password) {
                delete userData.password;
            }
            await apiCall('users.php', 'PUT', userData);
            
            if (isSelf && currentUser) {
                currentUser.nom = userData.nom;
                currentUser.prenom = userData.prenom;
                currentUser.email = userData.email;
                currentUser.role_professionnel = userData.role_professionnel;
                if (userData.permission_profile_id) {
                    currentUser.permission_profile_id = userData.permission_profile_id;
                } else {
                    delete currentUser.permission_profile_id;
                }
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                userPermissions = permissions;
                localStorage.setItem('userPermissions', JSON.stringify(userPermissions));
                if (typeof applyPermissions === 'function') applyPermissions();
            }
            
            // Synchro membres spectacles si le rôle professionnel a changé
            if (oldRole !== newRole) {
                syncUserRoleToSpectacleMembers(String(userData.id), oldRole, newRole);
            }
        } else {
            // Créer
            const result = await apiCall('users.php', 'POST', userData);
            
            // Si c'est un Producteur ou Chargé de production, l'ajouter à tous les projets racine (tournées + spectacles isolés)
            const autoRoles = ['Producteur', 'Chargé de production'];
            const newUserId = result?.user_id || result?.user?.id || result?.id;
            if (autoRoles.includes(newRole) && newUserId) {
                const uid = String(newUserId);
                projects.forEach(p => {
                    // Ajouter aux tournées et spectacles isolés (pas aux enfants de tournée)
                    if (p.parentId) return;
                    if (!p.members) p.members = [];
                    if (!p.members.includes(uid)) {
                        p.members.push(uid);
                    }
                });
                saveProjectsAsync();
            }
        }
        
        closeUserModal();
        await loadUsersList();
        alert(currentEditingUser ? (isSelf ? 'Profil modifié avec succès' : 'Utilisateur modifié avec succès') : 'Utilisateur créé avec succès');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        alert('Erreur: ' + error.message);
    }
}

async function editUser(userId) {
    try {
        const data = await apiCall('users.php', 'GET');
        const users = data && data.users ? data.users : [];
        let user = users.find(u => u.id == userId || String(u.id) === String(userId));
        if (!user && typeof allUsers !== 'undefined' && allUsers && allUsers.length) {
            user = allUsers.find(u => u.id == userId || String(u.id) === String(userId));
        }
        if (user) {
            openUserModal(user);
        } else {
            console.warn('editUser: utilisateur introuvable', userId);
        }
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
        return;
    }
    
    try {
        await apiCall('users.php', 'DELETE', { id: userId });
        loadUsersList();
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
    currentEditingUser = null;
}

// ========== Boîtes mail utilisateur (admin) ==========

async function loadUserMailboxesAdmin(userId) {
    const list = document.getElementById('userMailboxesList');
    if (!list) return;
    list.innerHTML = '<div style="color:#636e72;font-size:0.85rem;">Chargement…</div>';
    try {
        const data = await apiCall('mailboxes.php?user_id=' + encodeURIComponent(userId), 'GET');
        renderUserMailboxesAdmin(userId, data?.mailboxes || []);
    } catch (e) {
        list.innerHTML = '<div style="color:#d63031;font-size:0.85rem;">' + (e.message || 'Erreur') + '</div>';
    }
}

function renderUserMailboxesAdmin(userId, mailboxes) {
    const list = document.getElementById('userMailboxesList');
    if (!list) return;
    if (!mailboxes.length) {
        list.innerHTML = '<div style="color:#636e72;font-size:0.85rem;">Aucune boîte configurée.</div>';
        return;
    }
    list.innerHTML = mailboxes.map(mb => `
        <div class="user-mailbox-card">
            <div class="user-mailbox-card-header">
                <span class="user-mailbox-card-title">${escapeHtml(mb.label || mb.email)}</span>
                <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary" style="padding:0.3rem 0.5rem;font-size:0.75rem;"
                        onclick="testUserMailbox(${userId}, ${mb.id})">IMAP</button>
                    <button type="button" class="btn btn-secondary" style="padding:0.3rem 0.5rem;font-size:0.75rem;"
                        onclick="testUserMailboxSmtp(${userId}, ${mb.id})">SMTP</button>
                    <button type="button" class="btn btn-secondary" style="padding:0.3rem 0.5rem;font-size:0.75rem;"
                        onclick="showUserMailboxSendLog(${userId}, ${mb.id})">Journal</button>
                    <button type="button" class="btn btn-secondary" style="padding:0.3rem 0.5rem;font-size:0.75rem;color:#d63031;"
                        onclick="deleteUserMailbox(${userId}, ${mb.id})">Suppr.</button>
                </div>
            </div>
            <div style="font-size:0.82rem;color:#636e72;">${escapeHtml(mb.email)} · ${escapeHtml(mb.username)}</div>
        </div>
    `).join('');
}

async function addUserMailboxFromForm() {
    if (!currentEditingUser || !currentEditingUser.id) {
        alert('Enregistrez d\'abord l\'utilisateur, puis ajoutez une boîte mail.');
        return;
    }
    const email = document.getElementById('userMailboxEmail')?.value.trim();
    const password = document.getElementById('userMailboxPassword')?.value || '';
    const username = document.getElementById('userMailboxUsername')?.value.trim() || email;
    if (!email || !password) {
        alert('Email et mot de passe requis');
        return;
    }
    try {
        await apiCall('mailboxes.php', 'POST', {
            user_id: currentEditingUser.id,
            label: document.getElementById('userMailboxLabel')?.value.trim() || email,
            email,
            username,
            password,
            imap_host: document.getElementById('userMailboxImapHost')?.value.trim() || 'ssl0.ovh.net',
            imap_port: parseInt(document.getElementById('userMailboxImapPort')?.value, 10) || 993,
            smtp_host: document.getElementById('userMailboxSmtpHost')?.value.trim() || 'ssl0.ovh.net',
            smtp_port: parseInt(document.getElementById('userMailboxSmtpPort')?.value, 10) || 465,
        });
        document.getElementById('userMailboxEmail').value = '';
        document.getElementById('userMailboxPassword').value = '';
        document.getElementById('userMailboxLabel').value = '';
        document.getElementById('userMailboxUsername').value = '';
        await loadUserMailboxesAdmin(currentEditingUser.id);
        if (currentUser && String(currentUser.id) === String(currentEditingUser.id) && typeof refreshMailsNavVisibility === 'function') {
            await refreshMailsNavVisibility();
        }
        if (typeof showToast === 'function') showToast('Boîte mail ajoutée', 'success');
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function deleteUserMailbox(userId, mailboxId) {
    if (!confirm('Supprimer cette boîte mail ?')) return;
    try {
        await apiCall('mailboxes.php', 'DELETE', { user_id: userId, id: mailboxId });
        await loadUserMailboxesAdmin(userId);
        if (currentUser && String(currentUser.id) === String(userId) && typeof refreshMailsNavVisibility === 'function') {
            await refreshMailsNavVisibility();
        }
    } catch (e) {
        alert('Erreur : ' + (e.message || e));
    }
}

async function testUserMailbox(userId, mailboxId) {
    try {
        const data = await apiCall('mailboxes.php', 'POST', {
            action: 'test',
            user_id: userId,
            mailbox_id: mailboxId,
        });
        let msg = 'Connexion IMAP OK — ' + (data.messages ?? 0) + ' message(s) dans la boîte.';
        if (data.hint_update_host && data.imap_host_used) {
            const used = data.imap_host_used + ':' + (data.imap_port_used || 993);
            const update = confirm(
                'Connexion réussie via ' + used + '.\n\n' +
                'Le serveur configuré était différent. Mettre à jour automatiquement ?'
            );
            if (update) {
                await apiCall('mailboxes.php', 'PUT', {
                    id: mailboxId,
                    user_id: userId,
                    imap_host: data.imap_host_used,
                    imap_port: data.imap_port_used || 993,
                    smtp_host: data.imap_host_used,
                });
                msg += '\n\nServeur IMAP mis à jour (' + used + ').';
                await loadUserMailboxesAdmin(userId);
            } else {
                msg += '\n\nServeur utilisé : ' + used + ' (pensez à mettre à jour la config).';
            }
        }
        alert(msg);
    } catch (e) {
        alert('Échec du test IMAP : ' + (e.message || e));
    }
}

async function testUserMailboxSmtp(userId, mailboxId) {
    try {
        const data = await apiCall('mailboxes.php', 'POST', {
            action: 'test_smtp',
            user_id: userId,
            mailbox_id: mailboxId,
        });
        if (!data.success) {
            alert('Échec test SMTP :\n\n' + (data.error || 'Erreur inconnue'));
            return;
        }
        const stats = data.stats || {};
        const hour = stats.last_hour || {};
        const day = stats.last_24h || {};
        alert(
            (data.message || 'SMTP OK') + '\n\n' +
            'Envois via L&Com Gestion :\n' +
            '• Dernière heure : ' + (hour.sends || 0) + ' envoi(s), ' + (hour.recipients || 0) + ' destinataire(s)\n' +
            '• Dernières 24 h : ' + (day.sends || 0) + ' envoi(s), ' + (day.recipients || 0) + ' destinataire(s)\n\n' +
            'Si OVH bloque malgré 0 envoi ici, l\'adresse est utilisée ailleurs (téléphone, Outlook…) ou il faut contacter OVH.'
        );
    } catch (e) {
        alert('Échec du test SMTP : ' + (e.message || e));
    }
}

async function showUserMailboxSendLog(userId, mailboxId) {
    try {
        const data = await apiCall(
            'mailboxes.php?action=send_log&user_id=' + encodeURIComponent(userId) +
            '&mailbox_id=' + encodeURIComponent(mailboxId),
            'GET'
        );
        const stats = data.stats || {};
        const hour = stats.last_hour || {};
        const day = stats.last_24h || {};
        const recent = stats.recent || [];
        let lines = [
            'Boîte : ' + (data.email || ''),
            '',
            'Via L&Com Gestion :',
            '• Dernière heure : ' + (hour.sends || 0) + ' envoi(s), ' + (hour.recipients || 0) + ' destinataire(s)',
            '• Dernières 24 h : ' + (day.sends || 0) + ' envoi(s), ' + (day.recipients || 0) + ' destinataire(s)',
            '',
            'Derniers envois :',
        ];
        if (!recent.length) {
            lines.push('(aucun enregistré — l\'application n\'a pas envoyé de mail depuis ce module)');
        } else {
            recent.forEach(row => {
                const ok = row.success == 1 ? 'OK' : 'ÉCHEC';
                lines.push(
                    '- ' + row.created_at + ' [' + ok + '] ' +
                    (row.recipient_count || 1) + ' dest. → ' + (row.to_preview || '') +
                    (row.subject ? ' — ' + row.subject : '')
                );
            });
        }
        alert(lines.join('\n'));
    } catch (e) {
        alert('Journal indisponible : ' + (e.message || e));
    }
}


// Fonction pour charger les paramètres
async function loadSettings() {
    // Vérifier que l'authentification a été vérifiée ET réussie
    if (!authChecked) {
        console.error('loadSettings: ERREUR - Authentification pas encore vérifiée !');
        return;
    }
    
    if (!isAuthenticated) {
        console.log('loadSettings: Utilisateur non authentifié, chargement annulé');
        return;
    }
    
    // Double vérification des variables
    if (!authToken || !currentUser) {
        console.error('loadSettings: ERREUR - Variables d\'authentification manquantes malgré isAuthenticated=true !', { authToken: !!authToken, currentUser: !!currentUser });
        return;
    }
    
    console.log('loadSettings: Début du chargement des paramètres');
    
    try {
        const data = await apiCall('settings.php', 'GET');
        if (data.settings) {
            // Fusionner au lieu de remplacer pour ne pas perdre les clés ajoutées dynamiquement
            const loadedSettings = data.settings;
            Object.keys(loadedSettings).forEach(function(key) {
                if (key === 'workProjects') return;
                appSettings[key] = loadedSettings[key];
            });
            applySettings();
            // Stocker le logo en localStorage pour la page de connexion
            if (appSettings.logo || appSettings.logoFileId) {
                if (typeof cacheLogoForLoginDisplay === 'function') {
                    cacheLogoForLoginDisplay(appSettings.logoFileId, appSettings.logo);
                } else if (appSettings.logo && appSettings.logo.indexOf('data:') === 0) {
                    localStorage.setItem('appLogo', appSettings.logo);
                }
            }
            if (appSettings.appName) {
                localStorage.setItem('appName', appSettings.appName);
            }
            // Modules stockés hors settings (api/catalogue.php, crm.php)
            if (typeof loadCatalogueData === 'function') await loadCatalogueData();
            if (typeof loadCrmData === 'function') await loadCrmData();
        }
    } catch (error) {
        console.error('Erreur chargement paramètres:', error);
        // Utiliser les paramètres par défaut en cas d'erreur
    }
}

/* ========== ANCIEN CODE GOOGLE DRIVE (COMMENTÉ) ==========
async function loadSettings() {
    try {
        const response = await gapi.client.drive.files.list({
            q: "name='gestion-spectacles-settings.json'",
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (response.result.files && response.result.files.length > 0) {
            const fileId = response.result.files[0].id;
            const fileContent = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            appSettings = JSON.parse(fileContent.body);
            applySettings();
        }
    } catch (error) {
        console.error('Erreur chargement paramètres:', error);
    }
}
*/

// Fonction pour sauvegarder les paramètres (catalogue / CRM : APIs dédiées)
async function saveSettings() {
    try {
        const settingsToSave = { ...appSettings };
        delete settingsToSave.catalogue;
        delete settingsToSave.crm;
        delete settingsToSave.workProjects;
        await apiCall('settings.php', 'POST', { settings: settingsToSave });
    } catch (error) {
        console.error('Erreur sauvegarde paramètres:', error);
    }
}

/* ========== ANCIEN CODE GOOGLE DRIVE (COMMENTÉ) ==========
async function saveSettings() {
    try {
        const content = JSON.stringify(appSettings, null, 2);
        const file = new Blob([content], {type: 'application/json'});
        const metadata = {
            name: 'gestion-spectacles-settings.json',
            mimeType: 'application/json'
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
        form.append('file', file);

        const response = await gapi.client.drive.files.list({
            q: "name='gestion-spectacles-settings.json'",
            spaces: 'drive',
            fields: 'files(id)'
        });

        let fileId = null;
        if (response.result.files && response.result.files.length > 0) {
            fileId = response.result.files[0].id;
        }

        if (fileId) {
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: new Headers({'Authorization': 'Bearer ' + accessToken}),
                body: form
            });
        } else {
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({'Authorization': 'Bearer ' + accessToken}),
                body: form
            });
        }
    } catch (error) {
        console.error('Erreur sauvegarde paramètres:', error);
    }
}
*/

function refreshMainHeaderLogo() {
    const el = document.getElementById('mainHeaderLogo');
    if (!el) return;
    const logoUrl = typeof resolveMediaUrl === 'function'
        ? resolveMediaUrl(appSettings?.logo, appSettings?.logoFileId)
        : appSettings?.logo;
    if (logoUrl && logoUrl.indexOf('download.php') !== -1 && typeof API_URL !== 'undefined') {
        el.innerHTML = `<img src="${API_URL}/logo.php" alt="Logo">`;
        return;
    }
    if (logoUrl) {
        el.innerHTML = `<img src="${logoUrl}" alt="Logo">`;
    } else {
        el.innerHTML = '';
    }
}

// Appliquer les paramètres à l'interface
function applySettings() {
    // Logo de la société (remplace l'emoticon dans la sidebar)
    const logoUrl = typeof resolveMediaUrl === 'function'
        ? resolveMediaUrl(appSettings?.logo, appSettings?.logoFileId)
        : appSettings?.logo;
    const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo">` : null;
    const sidebarEl = document.getElementById('sidebarLogo');
    const previewEl = document.getElementById('logoPreview');
    if (sidebarEl) sidebarEl.innerHTML = logoHtml || '<span style="font-size:2.5rem;">🎭</span>';
    if (previewEl) previewEl.innerHTML = logoHtml || '<span style="font-size:3rem;">🎭</span>';
    refreshMainHeaderLogo();
    if (typeof updateHomeTiles === 'function') updateHomeTiles();

    // Nom de l'app
    if (appSettings.appName) {
        document.getElementById('sidebarTitle').textContent = appSettings.appName;
        document.getElementById('appNameInput').value = appSettings.appName;
        document.title = appSettings.appName;
    }
    
    // Favicon dynamique (utiliser le logo de l'app)
    if (logoUrl) {
        const favicon = document.getElementById('dynamicFavicon');
        if (favicon) favicon.href = logoUrl;
    }
    
    // Initialiser les tableaux s'ils n'existent pas (migration)
    // equipeInterne supprimé - utiliser les utilisateurs de la base de données
    if (!appSettings.lieux) appSettings.lieux = [];
    if (!appSettings.prestataires) appSettings.prestataires = [];
    if (!appSettings.reseauxBilletterie) appSettings.reseauxBilletterie = [];
    if (appSettings.ndfKmRate == null || isNaN(parseFloat(appSettings.ndfKmRate)) || parseFloat(appSettings.ndfKmRate) <= 0) {
        appSettings.ndfKmRate = 0.57;
    }
    if (!appSettings.partners) appSettings.partners = [];
    if (!appSettings.invitationTicketDefaults) appSettings.invitationTicketDefaults = {
        mainLogo: '',
        badgeText: 'INVITATION',
        labelValidFor: 'Invitation valable pour :',
        headerColor1: '#1e3c72',
        headerColor2: '#2a5298',
        goldColor: '#d7b14a',
        footerText: 'Merci de présenter ce billet à l’entrée.\nCe billet peut être scanné directement depuis un smartphone.\n\nContact : contact@tonsite.com',
        showPoster: true,
        showQr: true,
        posterFit: 'contain', // 'contain' (affiche entière) | 'cover' (plein cadre)
        layoutMode: 'classic',
        customBackground: '',
        customBackgroundScale: 1,
        customZones: []
    };
    if (appSettings.invitationTicketDefaults) {
        const id = appSettings.invitationTicketDefaults;
        if (id.layoutMode === undefined) id.layoutMode = 'classic';
        if (id.customBackground === undefined) id.customBackground = '';
        if (id.customBackgroundScale === undefined) id.customBackgroundScale = 1;
        if (!Array.isArray(id.customZones)) id.customZones = [];
    }
    
    // Mettre à jour la liste des réseaux dans l'admin
    renderAdminReseaux();
    
    // Mettre à jour les nouvelles bases de données
    renderAdminLieux();
    renderAdminPrestataires();
}



// Admin Page
function openAdminPage() {
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Vous n\'avez pas accès à la section Administration.');
        return;
    }
    
    // Fermer toutes les pages
    closeAllPages();
    const homeWelcome = document.getElementById('homeWelcome');
    if (homeWelcome) homeWelcome.style.display = 'none';
    
    // Mettre à jour le menu actif
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const adminNavItem = document.querySelector('.nav-item[onclick="openAdminPage()"]');
    if (adminNavItem) {
        adminNavItem.classList.add('active');
    }
    
    document.getElementById('adminPage').classList.add('active');
    if (typeof renderHomeWelcomeLogo === 'function') {
        renderHomeWelcomeLogo(document.getElementById('adminHomeLogo'), '⚙️');
    }
    var ac = document.getElementById('adminModuleContent');
    if (ac) ac.style.display = '';
    
    // Afficher les cartes admin si admin
    const isAdmin = currentUser && currentUser.role === 'admin';
    const usersCard = document.getElementById('adminUsersCard');
    const profilesCard = document.getElementById('adminProfilesCard');
    
    if (isAdmin) {
        if (usersCard) usersCard.style.display = 'block';
        if (profilesCard) profilesCard.style.display = 'block';
        const sauvegardeCard = document.getElementById('adminSauvegardeCard');
        if (sauvegardeCard) sauvegardeCard.style.display = 'block';
    } else {
        if (usersCard) usersCard.style.display = 'none';
        if (profilesCard) profilesCard.style.display = 'none';
        const sauvegardeCard = document.getElementById('adminSauvegardeCard');
        if (sauvegardeCard) sauvegardeCard.style.display = 'none';
    }
    
    // Charger le résumé stockage sur la carte
    loadStorageSummary();
    
    closeSidebarOnMobile();
}

function closeAdminPage() {
    document.getElementById('adminPage').classList.remove('active');
    // Réinitialiser le menu actif
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const homeNavItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (homeNavItem) {
        homeNavItem.classList.add('active');
    }
}

// Ouvrir une sous-page admin
function openAdminSubPage(page) {
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Vous n\'avez pas accès à la section Administration.');
        return;
    }
    document.getElementById('adminPage').classList.remove('active');
    
    const pageId = 'admin' + page.charAt(0).toUpperCase() + page.slice(1) + 'Page';
    const pageEl = document.getElementById(pageId);
    
    if (pageEl) {
        pageEl.classList.add('active');
        
        // Charger les données selon la page
        switch(page) {
            case 'apparence':
                // Rien de spécial
                break;
            case 'billets':
                if (typeof renderAdminBillets === 'function') renderAdminBillets();
                break;
            case 'reseaux':
                renderAdminReseaux();
                break;
            case 'profils':
                loadProfilesList();
                break;
            case 'lieux':
                renderAdminLieux();
                break;
            case 'prestataires':
                renderAdminPrestataires();
                break;
            case 'integrations':
                loadIntegrationSettings();
                break;
            case 'stockage':
                loadStorageData();
                break;
            case 'sauvegarde':
                break;
            case 'ndf':
                if (typeof loadNdfAdminSettings === 'function') loadNdfAdminSettings();
                break;
        }
    }
}

/** Export ZIP complet (BDD + api/uploads + uploads racine) — admin uniquement */
function downloadFullBackup() {
    if (!authToken) {
        alert('Non authentifié');
        return;
    }
    const url = `${API_URL}/backup.php?token=${encodeURIComponent(authToken)}`;
    fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Auth-Token': authToken
        }
    }).then(function (res) {
        if (!res.ok) {
            return res.text().then(function (text) {
                let msg = 'Erreur ' + res.status;
                try {
                    const j = JSON.parse(text);
                    if (j.error) msg = j.error;
                } catch (e) { /* ignore */ }
                throw new Error(msg);
            });
        }
        return res.blob();
    }).then(function (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'gestion-sauvegarde-complete-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        if (typeof showToast === 'function') showToast('Sauvegarde téléchargée', 'success');
    }).catch(function (err) {
        alert(err.message || String(err));
    });
}

/** Restauration totale depuis un ZIP — destructif */
async function restoreFullBackup() {
    const fileInput = document.getElementById('fullBackupRestoreFile');
    const confirmEl = document.getElementById('fullBackupRestoreConfirm');
    const statusEl = document.getElementById('fullBackupRestoreStatus');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
        alert('Choisissez un fichier .zip');
        return;
    }
    if ((confirmEl && confirmEl.value.trim()) !== 'RESTAURER') {
        alert('Confirmation : tapez exactement RESTAURER');
        return;
    }
    if (!window.confirm('Remplacer TOUTE la base de données et TOUS les fichiers uploadés par cette sauvegarde ? Cette opération est définitive.')) {
        return;
    }
    if (statusEl) statusEl.textContent = 'Restauration en cours…';
    const fd = new FormData();
    fd.append('backup', file);
    fd.append('token', authToken);
    fd.append('confirmRestore', 'RESTAURER');
    try {
        const res = await fetch(`${API_URL}/backup.php`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'X-Auth-Token': authToken
            },
            body: fd
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(text.slice(0, 300) || ('HTTP ' + res.status));
        }
        if (!res.ok || !data.success) {
            throw new Error(data.error || data.message || 'Échec de la restauration');
        }
        if (statusEl) statusEl.textContent = data.message || 'OK';
        if (typeof showToast === 'function') showToast('Restauration terminée — rechargement…', 'success');
        setTimeout(function () { window.location.reload(); }, 1200);
    } catch (e) {
        if (statusEl) statusEl.textContent = '';
        alert(e.message || String(e));
    }
}

// Expose helpers for inline onclick handlers in index.html
if (typeof window !== 'undefined') {
    window.downloadFullBackup = downloadFullBackup;
    window.restoreFullBackup = restoreFullBackup;
    window.renderAdminBillets = renderAdminBillets;
    window.adminSaveInvitationDefaults = adminSaveInvitationDefaults;
    window.adminResetInvitationDefaults = adminResetInvitationDefaults;
    window.adminAddPartner = adminAddPartner;
    window.adminRemovePartner = adminRemovePartner;
    window.adminResetPartnerLogoDropzone = adminResetPartnerLogoDropzone;
}

// ============================
// ADMIN — BILLETS & PARTENAIRES
// ============================

function _adminIdSafe() {
    return 'p_' + Math.random().toString(36).slice(2, 10);
}

let _adminPartnerLogoDataUrl = '';

function adminResetPartnerLogoDropzone() {
    _adminPartnerLogoDataUrl = '';
    const fi = document.getElementById('adminPartnerLogoFile');
    const prev = document.getElementById('adminPartnerLogoPreview');
    const hint = document.getElementById('adminPartnerLogoDropHint');
    const dz = document.getElementById('adminPartnerLogoDropzone');
    if (fi) fi.value = '';
    if (prev) {
        prev.removeAttribute('src');
        prev.style.display = 'none';
    }
    if (hint) hint.style.display = '';
    if (dz) {
        dz.style.borderColor = 'var(--border)';
    }
}

function _adminReadPartnerLogoFile(file) {
    if (!file || !file.type.match(/^image\//)) {
        alert('Veuillez choisir un fichier image (PNG, JPG, WebP, etc.).');
        return;
    }
    const r = new FileReader();
    r.onload = function () {
        _adminPartnerLogoDataUrl = r.result || '';
        const prev = document.getElementById('adminPartnerLogoPreview');
        const hint = document.getElementById('adminPartnerLogoDropHint');
        if (prev) {
            prev.src = _adminPartnerLogoDataUrl;
            prev.style.display = 'block';
        }
        if (hint) hint.style.display = 'none';
    };
    r.onerror = function () {
        alert('Impossible de lire le fichier.');
    };
    r.readAsDataURL(file);
}

function adminWirePartnerLogoDropzone() {
    const dz = document.getElementById('adminPartnerLogoDropzone');
    const fi = document.getElementById('adminPartnerLogoFile');
    if (!dz || !fi || dz._adminPartnerLogoBound) return;
    dz._adminPartnerLogoBound = true;
    dz.addEventListener('click', function (e) {
        if (e.target === fi) return;
        fi.click();
    });
    fi.addEventListener('change', function () {
        const f = fi.files && fi.files[0];
        if (f) _adminReadPartnerLogoFile(f);
    });
    dz.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.style.borderColor = 'var(--primary, #6161ff)';
    });
    dz.addEventListener('dragleave', function (e) {
        e.preventDefault();
        dz.style.borderColor = 'var(--border)';
    });
    dz.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.style.borderColor = 'var(--border)';
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) _adminReadPartnerLogoFile(f);
    });
}

function renderAdminBillets() {
    // ensure migrations
    if (!appSettings.partners) appSettings.partners = [];
    if (!appSettings.invitationTicketDefaults) applySettings();
    const d = appSettings.invitationTicketDefaults || {};

    const el = (id) => document.getElementById(id);
    if (el('adminInvTplMainLogo')) el('adminInvTplMainLogo').value = d.mainLogo || '';
    if (el('adminInvTplBadgeText')) el('adminInvTplBadgeText').value = d.badgeText || 'INVITATION';
    if (el('adminInvTplLabelValidFor')) el('adminInvTplLabelValidFor').value = d.labelValidFor || 'Invitation valable pour :';
    if (el('adminInvTplColor1')) el('adminInvTplColor1').value = d.headerColor1 || '#1e3c72';
    if (el('adminInvTplColor2')) el('adminInvTplColor2').value = d.headerColor2 || '#2a5298';
    if (el('adminInvTplGoldColor')) el('adminInvTplGoldColor').value = d.goldColor || '#d7b14a';
    if (el('adminInvTplFooter')) el('adminInvTplFooter').value = d.footerText || '';
    if (el('adminInvTplShowPoster')) el('adminInvTplShowPoster').checked = !!d.showPoster;
    if (el('adminInvTplShowQr')) el('adminInvTplShowQr').checked = d.showQr !== false;

    renderAdminPartnersList();
    adminWirePartnerLogoDropzone();
    adminResetPartnerLogoDropzone();
}

function renderAdminPartnersList() {
    const wrap = document.getElementById('adminPartnersList');
    if (!wrap) return;
    if (!Array.isArray(appSettings.partners)) appSettings.partners = [];
    if (appSettings.partners.length === 0) {
        wrap.innerHTML = `<div style="color:#64748b;font-size:0.88rem;">Aucun partenaire pour le moment.</div>`;
        return;
    }
    wrap.innerHTML = appSettings.partners.map(p => {
        const logo = p?.logo ? `<img src="${p.logo}" alt="" style="width:32px;height:32px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid var(--border);">` : `<div style="width:32px;height:32px;border-radius:6px;background:#f1f5f9;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;">🤝</div>`;
        const name = (p?.name || 'Partenaire').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.6rem; border:1px solid var(--border); border-radius:12px;">
                <div style="display:flex; align-items:center; gap:0.6rem; min-width:0;">
                    ${logo}
                    <div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</div>
                </div>
                <button type="button" class="btn btn-secondary" style="padding:0.45rem 0.6rem;" onclick="adminRemovePartner('${p.id}')">Supprimer</button>
            </div>
        `;
    }).join('');
}

function adminSaveInvitationDefaults() {
    const el = (id) => document.getElementById(id);
    if (!appSettings.invitationTicketDefaults) appSettings.invitationTicketDefaults = {};
    const d = appSettings.invitationTicketDefaults;
    d.mainLogo = (el('adminInvTplMainLogo')?.value || '').trim();
    d.badgeText = (el('adminInvTplBadgeText')?.value || 'INVITATION').trim() || 'INVITATION';
    d.labelValidFor = (el('adminInvTplLabelValidFor')?.value || 'Invitation valable pour :').trim() || 'Invitation valable pour :';
    d.headerColor1 = el('adminInvTplColor1')?.value || '#1e3c72';
    d.headerColor2 = el('adminInvTplColor2')?.value || '#2a5298';
    d.goldColor = el('adminInvTplGoldColor')?.value || '#d7b14a';
    d.footerText = el('adminInvTplFooter')?.value || '';
    d.showPoster = !!el('adminInvTplShowPoster')?.checked;
    d.showQr = !!el('adminInvTplShowQr')?.checked;
    appSettings.invitationTicketDefaults = d;
    saveSettings();
    showToast('Défauts billet enregistrés', 'success');
}

function adminResetInvitationDefaults() {
    appSettings.invitationTicketDefaults = null;
    applySettings();
    renderAdminBillets();
    saveSettings();
    showToast('Défauts réinitialisés', 'success');
}

function adminAddPartner() {
    const name = (document.getElementById('adminNewPartnerName')?.value || '').trim();
    const logo = (_adminPartnerLogoDataUrl || '').trim();
    if (!name) {
        alert('Nom du partenaire requis.');
        return;
    }
    if (!logo) {
        alert('Importez un fichier image pour le logo (glisser-déposer ou clic).');
        return;
    }
    if (!Array.isArray(appSettings.partners)) appSettings.partners = [];
    const p = { id: _adminIdSafe(), name, logo };
    appSettings.partners.push(p);
    document.getElementById('adminNewPartnerName').value = '';
    adminResetPartnerLogoDropzone();
    saveSettings();
    renderAdminPartnersList();
    showToast('Partenaire ajouté', 'success');
}

function adminRemovePartner(id) {
    if (!Array.isArray(appSettings.partners)) appSettings.partners = [];
    appSettings.partners = appSettings.partners.filter(p => p && p.id !== id);
    saveSettings();
    renderAdminPartnersList();
    showToast('Partenaire supprimé', 'success');
}

// Fermer une sous-page admin et revenir à la page admin principale
function closeAdminSubPage() {
    document.querySelectorAll('.tournee-page').forEach(p => p.classList.remove('active'));
    openAdminPage();
}

// Fonction de recherche/filtre pour la page Lieux
function filterAdminLieux() {
    const search = document.getElementById('adminLieuxSearch')?.value?.toLowerCase() || '';
    renderAdminLieux(search);
}

// Fonction de recherche/filtre pour la page Prestataires
function filterAdminPrestataires() {
    const search = document.getElementById('adminPrestatairesSearch')?.value?.toLowerCase() || '';
    renderAdminPrestataires(search);
}

// ========== GESTION DES INTÉGRATIONS ==========

const DEFAULT_TRIUM_API_URL = 'https://api.lcoproduction.fr';

// Charger les paramètres d'intégration dans le formulaire admin
function loadIntegrationSettings() {
    const billetwebUser = appSettings.billetwebUser || localStorage.getItem('billetweb_org_id') || '';
    const billetwebKey = appSettings.billetwebKey || localStorage.getItem('billetweb_api_key') || '';
    
    const triumUser1 = appSettings.triumUser1 || localStorage.getItem('trium_user1') || 'ticketnet';
    const triumPass1 = appSettings.triumPass1 || localStorage.getItem('trium_pass1') || '';
    const triumUser2 = appSettings.triumUser2 || localStorage.getItem('trium_user2') || '';
    const triumPass2 = appSettings.triumPass2 || localStorage.getItem('trium_pass2') || '';
    const triumApiUrl = appSettings.triumApiUrl || localStorage.getItem('trium_api_url') || DEFAULT_TRIUM_API_URL;
    
    const bwUserInput = document.getElementById('adminBilletwebUser');
    const bwKeyInput = document.getElementById('adminBilletwebKey');
    
    if (bwUserInput) bwUserInput.value = billetwebUser;
    if (bwKeyInput) bwKeyInput.value = billetwebKey;
    
    // Trium inputs
    const tu1 = document.getElementById('adminTriumUser1');
    const tp1 = document.getElementById('adminTriumPass1');
    const tu2 = document.getElementById('adminTriumUser2');
    const tp2 = document.getElementById('adminTriumPass2');
    
    if (tu1) tu1.value = triumUser1;
    if (tp1) tp1.value = triumPass1;
    if (tu2) tu2.value = triumUser2;
    if (tp2) tp2.value = triumPass2;
    const triumApiUrlInput = document.getElementById('adminTriumApiUrl');
    if (triumApiUrlInput) triumApiUrlInput.value = triumApiUrl;
    
    // France Billet
    const francebilletStructure = appSettings.francebilletStructure || localStorage.getItem('francebillet_structure') || '';
    const francebilletUser = appSettings.francebilletUser || localStorage.getItem('francebillet_user') || '';
    const francebilletPass = appSettings.francebilletPass || localStorage.getItem('francebillet_pass') || '';
    const fbStructInput = document.getElementById('adminFrancebilletStructure');
    const fbUserInput = document.getElementById('adminFrancebilletUser');
    const fbPassInput = document.getElementById('adminFrancebilletPass');
    if (fbStructInput) fbStructInput.value = francebilletStructure;
    if (fbUserInput) fbUserInput.value = francebilletUser;
    if (fbPassInput) fbPassInput.value = francebilletPass;
}

// Sauvegarder les paramètres d'intégration
async function saveIntegrationSettings() {
    const billetwebUser = document.getElementById('adminBilletwebUser')?.value.trim() || '';
    const billetwebKey = document.getElementById('adminBilletwebKey')?.value.trim() || '';
    
    const triumUser1 = document.getElementById('adminTriumUser1')?.value.trim() || 'ticketnet';
    const triumPass1 = document.getElementById('adminTriumPass1')?.value.trim() || '';
    const triumUser2 = document.getElementById('adminTriumUser2')?.value.trim() || '';
    const triumPass2 = document.getElementById('adminTriumPass2')?.value.trim() || '';
    const triumApiUrl = document.getElementById('adminTriumApiUrl')?.value.trim() || DEFAULT_TRIUM_API_URL;
    
    const francebilletStructure = document.getElementById('adminFrancebilletStructure')?.value.trim() || '';
    const francebilletUser = document.getElementById('adminFrancebilletUser')?.value.trim() || '';
    const francebilletPass = document.getElementById('adminFrancebilletPass')?.value.trim() || '';
    
    appSettings.billetwebUser = billetwebUser;
    appSettings.billetwebKey = billetwebKey;
    appSettings.triumUser1 = triumUser1;
    appSettings.triumPass1 = triumPass1;
    appSettings.triumUser2 = triumUser2;
    appSettings.triumPass2 = triumPass2;
    appSettings.triumApiUrl = triumApiUrl;
    appSettings.francebilletStructure = francebilletStructure;
    appSettings.francebilletUser = francebilletUser;
    appSettings.francebilletPass = francebilletPass;
    
    localStorage.setItem('billetweb_org_id', billetwebUser);
    localStorage.setItem('billetweb_api_key', billetwebKey);
    localStorage.setItem('trium_user1', triumUser1);
    localStorage.setItem('trium_pass1', triumPass1);
    localStorage.setItem('trium_user2', triumUser2);
    localStorage.setItem('trium_pass2', triumPass2);
    localStorage.setItem('trium_api_url', triumApiUrl);
    localStorage.setItem('francebillet_structure', francebilletStructure);
    localStorage.setItem('francebillet_user', francebilletUser);
    localStorage.setItem('francebillet_pass', francebilletPass);
    
    // Sauvegarder appSettings
    await saveSettings();
    
    showToast('Paramètres d\'intégration enregistrés !', 'success');
}

// Tester la connexion BilletWeb
async function testBilletwebConnection() {
    const user = document.getElementById('adminBilletwebUser')?.value.trim();
    const key = document.getElementById('adminBilletwebKey')?.value.trim();
    
    if (!user || !key) {
        showToast('Veuillez entrer User ID et Clé API', 'error');
        return;
    }
    
    try {
        showToast('Test en cours...', 'info');
        
        // Appeler l'API BilletWeb directement
        const response = await fetch(`https://www.billetweb.fr/api/events?user=${user}&key=${key}&version=1`);
        
        if (response.ok) {
            const data = await response.json();
            const eventCount = Array.isArray(data) ? data.length : 0;
            showToast(`✅ Connexion BilletWeb réussie ! (${eventCount} événement(s) trouvé(s))`, 'success');
        } else {
            showToast('❌ Erreur BilletWeb: ' + response.status, 'error');
        }
    } catch (error) {
        // CORS peut bloquer - c'est normal depuis le navigateur
        showToast('⚠️ Test direct impossible (CORS). Les credentials seront testés lors de l\'import.', 'info');
    }
}

// Fonction pour obtenir les credentials BilletWeb (utilisée par l'import)
function getBilletwebCredentials() {
    return {
        user: appSettings.billetwebUser || localStorage.getItem('billetweb_org_id') || '',
        key: appSettings.billetwebKey || localStorage.getItem('billetweb_api_key') || ''
    };
}

// Fonction pour obtenir les credentials Ticketmaster/Trium (utilisée par l'import)
function getTicketmasterCredentials() {
    return {
        user1: appSettings.triumUser1 || localStorage.getItem('trium_user1') || 'ticketnet',
        pass1: appSettings.triumPass1 || localStorage.getItem('trium_pass1') || '',
        user2: appSettings.triumUser2 || localStorage.getItem('trium_user2') || '',
        pass2: appSettings.triumPass2 || localStorage.getItem('trium_pass2') || '',
        apiUrl: appSettings.triumApiUrl || localStorage.getItem('trium_api_url') || DEFAULT_TRIUM_API_URL
    };
}

// Fonction pour obtenir les credentials France Billet (utilisée par l'import)
function getFrancebilletCredentials() {
    return {
        structure: appSettings.francebilletStructure || localStorage.getItem('francebillet_structure') || '',
        user: appSettings.francebilletUser || localStorage.getItem('francebillet_user') || '',
        pass: appSettings.francebilletPass || localStorage.getItem('francebillet_pass') || ''
    };
}

// Tester la connexion France Billet
async function testFrancebilletConnection() {
    const structure = document.getElementById('adminFrancebilletStructure')?.value.trim();
    const user = document.getElementById('adminFrancebilletUser')?.value.trim();
    const pass = document.getElementById('adminFrancebilletPass')?.value.trim();
    
    if (!structure || !user || !pass) {
        showToast('Veuillez entrer code structure, identifiant et mot de passe France Billet', 'error');
        return;
    }
    
    showToast('France Billet : saisie manuelle uniquement (API à venir).', 'info');
}

// Tester la connexion Trium
async function testTriumConnection() {
    const user2 = document.getElementById('adminTriumUser2')?.value.trim();
    const pass2 = document.getElementById('adminTriumPass2')?.value.trim();
    
    if (!user2 || !pass2) {
        showToast('Veuillez entrer les identifiants Trium Prod', 'error');
        return;
    }
    
    showToast('Configuration Trium sauvegardée. Testé lors de l\'import (API VPS).', 'info');
}

// ========== STOCKAGE ==========
let storageDataCache = null;

async function loadStorageSummary() {
    const el = document.getElementById('adminStorageSummary');
    if (!el) return;
    try {
        const data = await apiCall('disk_usage.php', 'GET');
        if (data && data.success) {
            storageDataCache = data;
            el.textContent = `${data.app.totalSizeFormatted} utilisés`;
        } else {
            el.textContent = 'Erreur de chargement';
        }
    } catch (e) {
        el.textContent = 'Non disponible';
    }
}

async function loadStorageData() {
    const container = document.getElementById('storageContent');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 3rem; color: white;"><div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>Analyse du stockage en cours...</div>';
    
    try {
        const data = storageDataCache || await apiCall('disk_usage.php', 'GET');
        if (!data || !data.success) {
            container.innerHTML = '<div style="text-align: center; padding: 3rem; color: #ff7675;">❌ Erreur de chargement des données de stockage</div>';
            return;
        }
        storageDataCache = data;
        
        const pct = data.quota.percentage;
        const barColor = pct > 80 ? '#ff7675' : pct > 50 ? '#fdcb6e' : '#00b894';
        
        // Icônes par dossier
        const folderIcons = {
            'uploads': '📁', 'images': '🖼️', 'video': '🎬', 'api': '⚙️',
            'icons': '🔷', 'css': '🎨', 'js': '📜', 'assets': '📦',
            'admin': '🔐', 'Fichiers racine': '📄'
        };
        
        let detailsHtml = '';
        data.app.details.forEach(d => {
            const icon = folderIcons[d.name] || '📂';
            const folderPct = data.app.totalSize > 0 ? ((d.size / data.app.totalSize) * 100).toFixed(1) : 0;
            detailsHtml += `
                <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #f1f3f5;">
                    <div style="font-size: 1.3rem; width: 30px; text-align: center;">${icon}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 0.95rem;">${d.name}/</div>
                        <div style="font-size: 0.8rem; color: #636e72;">${d.files} fichier${d.files > 1 ? 's' : ''}</div>
                    </div>
                    <div style="text-align: right; min-width: 80px;">
                        <div style="font-weight: 700; color: var(--primary);">${d.sizeFormatted}</div>
                        <div style="font-size: 0.75rem; color: #636e72;">${folderPct}%</div>
                    </div>
                </div>`;
        });
        
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
                <!-- Jauge principale -->
                <div style="background: white; border-radius: 15px; padding: 2rem; box-shadow: 0 5px 20px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 1.5rem 0; font-size: 1.1rem; color: #2d3436;">📊 Espace utilisé</h3>
                    
                    <div style="text-align: center; margin-bottom: 1.5rem;">
                        <div style="position: relative; width: 160px; height: 160px; margin: 0 auto;">
                            <svg viewBox="0 0 36 36" style="width: 160px; height: 160px; transform: rotate(-90deg);">
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none" stroke="#eee" stroke-width="3"/>
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none" stroke="${barColor}" stroke-width="3"
                                    stroke-dasharray="${pct}, 100" stroke-linecap="round"/>
                            </svg>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                                <div style="font-size: 1.8rem; font-weight: 700; color: ${barColor};">${pct}%</div>
                                <div style="font-size: 0.75rem; color: #636e72;">utilisé</div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: #f8f9fa; border-radius: 10px; margin-bottom: 0.75rem;">
                        <span style="color: #636e72; font-size: 0.9rem;">Espace utilisé</span>
                        <span style="font-weight: 700;">${data.app.totalSizeFormatted}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: #f8f9fa; border-radius: 10px; margin-bottom: 0.75rem;">
                        <span style="color: #636e72; font-size: 0.9rem;">Quota OVH</span>
                        <span style="font-weight: 700;">${data.quota.totalFormatted}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: #f8f9fa; border-radius: 10px;">
                        <span style="color: #636e72; font-size: 0.9rem;">Disque libre</span>
                        <span style="font-weight: 700;">${data.disk.freeFormatted}</span>
                    </div>
                </div>
                
                <!-- Détail par dossier -->
                <div style="background: white; border-radius: 15px; padding: 2rem; box-shadow: 0 5px 20px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: #2d3436;">📂 Détail par dossier</h3>
                    <div style="max-height: 400px; overflow-y: auto;">
                        ${detailsHtml || '<div style="color: #636e72; text-align: center; padding: 2rem;">Aucun dossier trouvé</div>'}
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 1.5rem; text-align: center;">
                <button class="btn btn-secondary" onclick="refreshStorageData()" style="padding: 0.5rem 1.5rem;">🔄 Rafraîchir</button>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `
            <div style="background: white; border-radius: 15px; padding: 2rem; box-shadow: 0 5px 20px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 2.5rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #2d3436; margin-bottom: 0.5rem;">Impossible de charger les données</h3>
                <p style="color: #636e72; margin-bottom: 1rem;">Le fichier <code>disk_usage.php</code> doit être uploadé dans le dossier <code>api/</code> du serveur.</p>
                <button class="btn btn-secondary" onclick="refreshStorageData()">🔄 Réessayer</button>
            </div>`;
    }
}

async function refreshStorageData() {
    storageDataCache = null;
    await loadStorageData();
}

// ========== MIGRATION BASE64 → SERVEUR ==========

function scanBase64Files() {
    const statusEl = document.getElementById('migrationStatus');
    const startBtn = document.getElementById('migrationStartBtn');
    
    let base64Items = [];
    
    // Scanner tous les projets
    (projects || []).forEach(p => {
        // Visuels
        (p.visuels || []).forEach((v, i) => {
            if (v.base64 && !v.stored_externally) {
                base64Items.push({
                    projectId: p.id,
                    projectName: p.name,
                    type: 'visuel',
                    index: i,
                    name: v.titre || v.fileName || 'Sans nom',
                    size: Math.round((v.base64.length * 3) / 4),
                    mimeType: v.fileType || 'image/jpeg'
                });
            }
        });
        
        // Documents
        (p.documents || []).forEach((d, i) => {
            if (d.base64 && !d.stored_externally) {
                base64Items.push({
                    projectId: p.id,
                    projectName: p.name,
                    type: 'document',
                    index: i,
                    name: d.name || d.fileName || 'Sans nom',
                    size: Math.round((d.base64.length * 3) / 4),
                    mimeType: d.fileType || 'application/octet-stream'
                });
            }
        });
        
        // Budget (devis/factures)
        (p.budget || []).forEach((line, i) => {
            if (line.devis && line.devis.base64 && !line.devis.stored_externally) {
                base64Items.push({
                    projectId: p.id,
                    projectName: p.name,
                    type: 'devis',
                    index: i,
                    name: line.devis.name || 'Devis',
                    size: Math.round((line.devis.base64.length * 3) / 4),
                    mimeType: line.devis.fileType || 'application/pdf'
                });
            }
            if (line.facture && line.facture.base64 && !line.facture.stored_externally) {
                base64Items.push({
                    projectId: p.id,
                    projectName: p.name,
                    type: 'facture',
                    index: i,
                    name: line.facture.name || 'Facture',
                    size: Math.round((line.facture.base64.length * 3) / 4),
                    mimeType: line.facture.fileType || 'application/pdf'
                });
            }
        });
    });
    
    // Scanner les tournées (projets de type tournée)
    (projects || []).filter(t => t.type === 'tournee').forEach(t => {
        (t.visuels || []).forEach((v, i) => {
            // Vérifier si pas déjà scanné dans la boucle projets
            if (v.base64 && !v.stored_externally && !base64Items.find(b => b.projectId === t.id && b.type === 'visuel' && b.index === i)) {
                base64Items.push({
                    projectId: t.id,
                    projectName: t.name + ' (tournée)',
                    type: 'visuel',
                    index: i,
                    name: v.titre || v.fileName || 'Sans nom',
                    size: Math.round((v.base64.length * 3) / 4),
                    mimeType: v.fileType || 'image/jpeg'
                });
            }
        });
    });
    
    // Logo en base64 ?
    if (appSettings.logo && appSettings.logo.startsWith('data:')) {
        base64Items.push({
            type: 'logo',
            name: 'Logo application',
            size: Math.round((appSettings.logo.length * 3) / 4),
            mimeType: 'image/png'
        });
    }
    
    // Catalogue : visuels et documents
    const catalogue = appSettings.catalogue || (typeof catalogueData !== 'undefined' ? catalogueData : []);
    (catalogue).forEach((fiche, catIdx) => {
        const ficheName = fiche?.name || `Fiche ${catIdx + 1}`;
        (fiche.visuels || []).forEach((v, vIdx) => {
            if (v.base64 && !v.stored_externally) {
                base64Items.push({
                    type: 'catalogueVisuel',
                    catIndex: catIdx,
                    visuelIndex: vIdx,
                    projectName: ficheName,
                    name: v.titre || v.fileName || 'Visuel',
                    size: Math.round((v.base64.length * 3) / 4),
                    mimeType: v.fileType || 'image/jpeg'
                });
            }
        });
        (fiche.documents || []).forEach((d, dIdx) => {
            if (d.base64 && !d.stored_externally) {
                base64Items.push({
                    type: 'catalogueDocument',
                    catIndex: catIdx,
                    documentIndex: dIdx,
                    projectName: ficheName,
                    name: d.name || d.fileName || 'Document',
                    size: Math.round((d.base64.length * 3) / 4),
                    mimeType: d.fileType || 'application/octet-stream'
                });
            }
        });
    });
    
    window._base64MigrationItems = base64Items;
    
    const totalSize = base64Items.reduce((sum, item) => sum + item.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    if (base64Items.length === 0) {
        statusEl.innerHTML = `
            <div style="padding: 1rem; background: #d4edda; border-radius: 10px; color: #155724;">
                ✅ Aucun fichier base64 trouvé — tout est déjà sur le serveur !
            </div>`;
        startBtn.style.display = 'none';
    } else {
        statusEl.innerHTML = `
            <div style="padding: 1rem; background: #fff3cd; border-radius: 10px; color: #856404;">
                ⚠️ <strong>${base64Items.length} fichier${base64Items.length > 1 ? 's' : ''}</strong> en base64 trouvé${base64Items.length > 1 ? 's' : ''} 
                (${totalSizeMB} Mo dans la base de données)
                <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                    ${base64Items.slice(0, 5).map(item => `• ${item.name} (${item.projectName || 'app'}) — ${(item.size / 1024).toFixed(0)} Ko`).join('<br>')}
                    ${base64Items.length > 5 ? `<br>... et ${base64Items.length - 5} autre(s)` : ''}
                </div>
            </div>`;
        startBtn.style.display = 'inline-flex';
    }
}

async function migrateBase64ToServer() {
    const items = window._base64MigrationItems;
    if (!items || items.length === 0) {
        showToast('Rien à migrer', 'info');
        return;
    }
    
    if (!confirm(`Migrer ${items.length} fichier(s) base64 vers le serveur ?\n\nLes fichiers seront uploadés sur le serveur et supprimés de la base de données. Cette opération est irréversible.`)) {
        return;
    }
    
    const progressEl = document.getElementById('migrationProgress');
    const barEl = document.getElementById('migrationBar');
    const logEl = document.getElementById('migrationLog');
    const startBtn = document.getElementById('migrationStartBtn');
    
    progressEl.style.display = 'block';
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Migration en cours...';
    logEl.innerHTML = '';
    
    let migrated = 0;
    let errors = 0;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const pct = Math.round(((i + 1) / items.length) * 100);
        barEl.style.width = pct + '%';
        
        try {
            // Convertir base64 en Blob puis File
            let base64Data;
            let sourceObj;
            
            if (item.type === 'logo') {
                base64Data = appSettings.logo;
            } else if (item.type === 'catalogueVisuel') {
                const cat = appSettings.catalogue || (typeof catalogueData !== 'undefined' ? catalogueData : []);
                sourceObj = cat[item.catIndex]?.visuels?.[item.visuelIndex];
                base64Data = sourceObj?.base64;
            } else if (item.type === 'catalogueDocument') {
                const cat = appSettings.catalogue || (typeof catalogueData !== 'undefined' ? catalogueData : []);
                sourceObj = cat[item.catIndex]?.documents?.[item.documentIndex];
                base64Data = sourceObj?.base64;
            } else {
                const project = projects.find(p => p.id === item.projectId);
                if (item.type === 'visuel') {
                    sourceObj = project?.visuels?.[item.index];
                } else if (item.type === 'document') {
                    sourceObj = project?.documents?.[item.index];
                } else if (item.type === 'devis') {
                    sourceObj = project?.budget?.[item.index]?.devis;
                } else if (item.type === 'facture') {
                    sourceObj = project?.budget?.[item.index]?.facture;
                }
                base64Data = sourceObj?.base64;
            }
            
            if (!base64Data) {
                logEl.innerHTML += `<div style="color: #e17055;">⚠️ ${item.name} — données introuvables, ignoré</div>`;
                errors++;
                continue;
            }
            
            // Convertir base64 en File
            const parts = base64Data.split(',');
            const byteString = atob(parts[1] || parts[0]);
            const mimeMatch = base64Data.match(/data:([^;]+);/);
            const mime = mimeMatch ? mimeMatch[1] : item.mimeType;
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let j = 0; j < byteString.length; j++) {
                ia[j] = byteString.charCodeAt(j);
            }
            const blob = new Blob([ab], { type: mime });
            
            // Extension correcte selon le mime
            const mimeToExt = {
                'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
                'image/webp': 'webp', 'application/pdf': 'pdf',
                'application/msword': 'doc', 'text/plain': 'txt',
                'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
            };
            const ext = mimeToExt[mime] || mime.split('/')[1] || 'bin';
            const safeName = (item.name || 'file').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
            const fileName = safeName + '.' + ext;
            const file = new File([blob], fileName, { type: mime });
            
            // Upload sur serveur (type: visuels, documents, videos, ou budget)
            const uploadType = ['logo', 'catalogueVisuel', 'visuel'].includes(item.type) ? 'visuels' :
                item.type === 'catalogueDocument' || item.type === 'document' ? 'documents' :
                (item.type === 'devis' || item.type === 'facture') ? 'budget' : 'documents';
            const uploaded = await uploadFile(file, uploadType);
            
            // Mettre à jour l'objet source
            const fileRef = { file_id: uploaded.file_id, url: uploaded.url || uploaded.downloadUrl, downloadUrl: uploaded.downloadUrl, stored_externally: true, fileName: uploaded.fileName };
            if (item.type === 'logo') {
                appSettings.logo = fileRef.url;
                appSettings.logoFileId = uploaded.file_id;
            } else if (sourceObj) {
                sourceObj.file_id = fileRef.file_id;
                sourceObj.url = fileRef.url;
                sourceObj.downloadUrl = fileRef.downloadUrl;
                sourceObj.stored_externally = true;
                sourceObj.fileName = fileRef.fileName;
                delete sourceObj.base64;
            }
            
            migrated++;
            logEl.innerHTML += `<div style="color: #00b894;">✅ ${item.name} — migré (${(item.size / 1024).toFixed(0)} Ko libérés)</div>`;
        } catch (err) {
            errors++;
            logEl.innerHTML += `<div style="color: #d63031;">❌ ${item.name} — erreur: ${err.message}</div>`;
            console.error('Migration error:', item.name, err);
        }
        
        // Scroll log to bottom
        logEl.scrollTop = logEl.scrollHeight;
    }
    
    // Sauvegarder tout
    if (migrated > 0) {
        const hasProjectItems = items.some(i => ['visuel', 'document', 'devis', 'facture'].includes(i.type));
        if (hasProjectItems) saveProjectsAsync();
        const hasSettingsItems = items.some(i => ['logo', 'catalogueVisuel', 'catalogueDocument'].includes(i.type));
        if (hasSettingsItems) await saveSettings();
    }
    
    const totalFreed = items.filter((_, i) => i < migrated).reduce((s, it) => s + it.size, 0);
    const statusEl = document.getElementById('migrationStatus');
    statusEl.innerHTML = `
        <div style="padding: 1rem; background: ${errors === 0 ? '#d4edda' : '#fff3cd'}; border-radius: 10px; color: ${errors === 0 ? '#155724' : '#856404'};">
            Migration terminée : <strong>${migrated}</strong> fichier${migrated > 1 ? 's' : ''} migré${migrated > 1 ? 's' : ''}${errors > 0 ? `, <strong>${errors}</strong> erreur(s)` : ''}
            <br>~${(totalFreed / (1024 * 1024)).toFixed(2)} Mo libérés de la base de données
        </div>`;
    
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Lancer la migration';
    if (migrated === items.length) {
        startBtn.style.display = 'none';
    }
    
    // Rafraîchir les données stockage
    storageDataCache = null;
}

// Users Page
function openUsersPage() {
    // Fermer toutes les autres pages
    document.querySelectorAll('.tournee-page').forEach(p => p.classList.remove('active'));
    document.getElementById('adminPage').classList.remove('active');
    
    // Ouvrir la page utilisateurs
    document.getElementById('usersPage').classList.add('active');
    
    // Charger la liste des utilisateurs
    loadUsersList();
    
    // Fermer le menu sur mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

function closeUsersPage() {
    document.getElementById('usersPage').classList.remove('active');
    // Retourner à la page admin
    document.getElementById('adminPage').classList.add('active');
}

// Gestion du logo
async function uploadLogo(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const uploadedFile = await uploadFile(file, 'visuels');
        const base = typeof API_URL !== 'undefined' ? API_URL : 'api';
        appSettings.logo = base + '/download.php?id=' + uploadedFile.file_id;
        appSettings.logoFileId = uploadedFile.file_id;
        const displayUrl = typeof getDownloadFileUrl === 'function'
            ? getDownloadFileUrl(uploadedFile.file_id)
            : uploadedFile.url;
        document.getElementById('logoPreview').innerHTML = `<img src="${displayUrl}" alt="Logo">`;
        document.getElementById('sidebarLogo').innerHTML = `<img src="${displayUrl}" alt="Logo">`;
        refreshMainHeaderLogo();
        saveSettings();
        if (typeof cacheLogoForLoginDisplay === 'function') {
            cacheLogoForLoginDisplay(uploadedFile.file_id, appSettings.logo);
        }
        showToast('Logo mis à jour', 'success');
    } catch (error) {
        console.error('Erreur upload logo:', error);
        alert('Erreur lors de l\'upload du logo. Vérifiez votre connexion.');
    }
}

// Gestion du nom de l'app
function updateAppName() {
    const name = document.getElementById('appNameInput').value.trim();
    if (name) {
        appSettings.appName = name;
        document.getElementById('sidebarTitle').textContent = name;
        saveSettings();
    }
}

// Gestion des réseaux dans l'admin
function renderAdminReseaux() {
    const container = document.getElementById('adminReseauxList');
    if (!container) return;
    
    // Initialiser reseauxBilletterie si undefined
    if (!appSettings.reseauxBilletterie) {
        appSettings.reseauxBilletterie = [];
    }
    
    if (appSettings.reseauxBilletterie.length === 0) {
        container.innerHTML = '<div style="color: #636e72; padding: 1rem;">Aucun réseau défini. Ajoutez vos réseaux de billetterie ci-dessous.</div>';
        return;
    }
    
    container.innerHTML = appSettings.reseauxBilletterie.map((reseau, index) => `
        <div class="reseau-item">
            <span>${reseau}</span>
            <button class="btn-remove" onclick="removeReseauAdmin(${index})" style="width: 30px; height: 30px; font-size: 1rem;">×</button>
        </div>
    `).join('');
}

function addReseauAdmin() {
    const input = document.getElementById('newReseauInput');
    const name = input.value.trim();
    if (name && !appSettings.reseauxBilletterie.includes(name)) {
        appSettings.reseauxBilletterie.push(name);
        saveSettings();
        renderAdminReseaux();
        input.value = '';
    }
}

function removeReseauAdmin(index) {
    if (confirm('Supprimer ce réseau ?')) {
        appSettings.reseauxBilletterie.splice(index, 1);
        saveSettings();
        renderAdminReseaux();
    }
}

// ============================================
// GESTION ÉQUIPE INTERNE
// ============================================
let currentEditingEquipe = null;

// Fonctions équipe interne supprimées - Utiliser la gestion des utilisateurs à la place

// ============================================
// GESTION LIEUX
// ============================================
let currentEditingLieu = null;

function renderAdminLieux(filter = '') {
    const container = document.getElementById('adminLieuxList');
    if (!container) return;
    
    if (!appSettings.lieux || appSettings.lieux.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun lieu enregistré. Ajoutez vos salles et lieux.</div>';
        return;
    }
    
    const filterLower = filter.toLowerCase();
    const lieuxFiltres = appSettings.lieux
        .map((lieu, index) => ({ ...lieu, originalIndex: index }))
        .filter(lieu => {
            if (!filterLower) return true;
            return (lieu.nom || '').toLowerCase().includes(filterLower) ||
                   (lieu.ville || '').toLowerCase().includes(filterLower) ||
                   (lieu.type || '').toLowerCase().includes(filterLower);
        });
    
    if (lieuxFiltres.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun lieu trouvé pour cette recherche.</div>';
        return;
    }
    
    container.innerHTML = lieuxFiltres.map(lieu => `
        <div class="admin-list-item">
            <div class="admin-list-item-info">
                <div class="admin-list-item-name">📍 ${lieu.nom}</div>
                <div class="admin-list-item-detail">${lieu.ville || ''}${lieu.type ? ' • ' + lieu.type : ''}${lieu.capacite ? ' • ' + lieu.capacite + ' places' : ''}</div>
            </div>
            <div class="admin-list-item-actions">
                <button class="btn-edit-small" onclick="editLieu(${lieu.originalIndex})">✏️</button>
                <button class="btn-delete-small" onclick="deleteLieu(${lieu.originalIndex})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function openLieuModal() {
    currentEditingLieu = null;
    document.getElementById('lieuModalTitle').textContent = 'Nouveau lieu';
    document.getElementById('lieuForm').reset();
    document.getElementById('lieuId').value = '';
    document.getElementById('lieuPays').value = 'France';
    document.getElementById('lieuContactsList').innerHTML = '';
    document.getElementById('lieuDocumentsList').innerHTML = '<div style="color: #636e72; padding: 1rem; text-align: center;">Aucun document</div>';
    // Décocher tous les équipements
    document.querySelectorAll('#lieuForm input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('lieuModal').classList.add('active');
}

function closeLieuModal() {
    document.getElementById('lieuModal').classList.remove('active');
    currentEditingLieu = null;
    
    // Si on venait du formulaire projet, y revenir
    if (returnToProjectModal && window.tempProjectData) {
        returnToProjectModal = false;
        document.getElementById('projectModal').classList.add('active');
        // Restaurer les valeurs
        document.getElementById('projectType').value = window.tempProjectData.type;
        document.getElementById('projectName').value = window.tempProjectData.name || '';
        document.getElementById('projectDate').value = window.tempProjectData.date || '';
        document.getElementById('projectTime').value = window.tempProjectData.time || '';
        document.getElementById('parentTourneeId').value = window.tempProjectData.parentId || '';
        // Recharger les lieux et sélectionner le dernier ajouté
        populateLieuxSelect();
        if (appSettings.lieux && appSettings.lieux.length > 0) {
            const lastLieu = appSettings.lieux[appSettings.lieux.length - 1];
            document.getElementById('projectLieuId').value = lastLieu.id;
            updateLieuPreview();
        }
        window.tempProjectData = null;
    }
}

function addLieuContact() {
    const container = document.getElementById('lieuContactsList');
    const contactHtml = `
        <div class="lieu-contact-row">
            <select class="lieu-contact-role">
                <option value="Direction">Direction</option>
                <option value="Régisseur général">Régisseur général</option>
                <option value="Régisseur technique">Régisseur technique</option>
                <option value="Billetterie">Billetterie</option>
                <option value="Accueil artistes">Accueil artistes</option>
                <option value="Autre">Autre</option>
            </select>
            <input type="text" class="lieu-contact-nom" placeholder="Nom">
            <input type="tel" class="lieu-contact-tel" placeholder="Téléphone">
            <button type="button" class="btn-remove" onclick="this.parentElement.remove()" style="width: 35px; height: 35px;">×</button>
            <input type="email" class="lieu-contact-email" placeholder="Email">
        </div>
    `;
    container.insertAdjacentHTML('beforeend', contactHtml);
}

function editLieu(index) {
    const lieu = appSettings.lieux[index];
    if (!lieu) return;
    
    currentEditingLieu = index;
    document.getElementById('lieuModalTitle').textContent = 'Modifier le lieu';
    document.getElementById('lieuId').value = lieu.id;
    document.getElementById('lieuNom').value = lieu.nom || '';
    document.getElementById('lieuAdresse').value = lieu.adresse || '';
    document.getElementById('lieuVille').value = lieu.ville || '';
    document.getElementById('lieuCodePostal').value = lieu.codePostal || '';
    document.getElementById('lieuPays').value = lieu.pays || 'France';
    document.getElementById('lieuCapacite').value = lieu.capacite || '';
    document.getElementById('lieuType').value = lieu.type || '';
    document.getElementById('lieuNotes').value = lieu.notes || '';
    
    // Contacts
    const contactsContainer = document.getElementById('lieuContactsList');
    contactsContainer.innerHTML = '';
    if (lieu.contacts && lieu.contacts.length > 0) {
        lieu.contacts.forEach(contact => {
            addLieuContact();
            const lastRow = contactsContainer.lastElementChild;
            lastRow.querySelector('.lieu-contact-role').value = contact.role || 'Autre';
            lastRow.querySelector('.lieu-contact-nom').value = contact.nom || '';
            lastRow.querySelector('.lieu-contact-tel').value = contact.telephone || '';
            lastRow.querySelector('.lieu-contact-email').value = contact.email || '';
        });
    }
    
    // Documents
    renderLieuDocuments();
    
    document.getElementById('lieuModal').classList.add('active');
}

function saveLieu(event) {
    event.preventDefault();
    
    const nom = document.getElementById('lieuNom').value.trim();
    const ville = document.getElementById('lieuVille').value.trim();
    if (!nom || !ville) return;
    
    // Récupérer les contacts
    const contacts = [];
    document.querySelectorAll('#lieuContactsList .lieu-contact-row').forEach(row => {
        const contactNom = row.querySelector('.lieu-contact-nom').value.trim();
        if (contactNom) {
            contacts.push({
                role: row.querySelector('.lieu-contact-role').value,
                nom: contactNom,
                telephone: row.querySelector('.lieu-contact-tel').value.trim(),
                email: row.querySelector('.lieu-contact-email').value.trim()
            });
        }
    });
    
    const lieuData = {
        id: document.getElementById('lieuId').value || Date.now().toString(),
        nom: nom,
        adresse: document.getElementById('lieuAdresse').value.trim(),
        ville: ville,
        codePostal: document.getElementById('lieuCodePostal').value.trim(),
        pays: document.getElementById('lieuPays').value.trim(),
        capacite: parseInt(document.getElementById('lieuCapacite').value) || null,
        type: document.getElementById('lieuType').value,
        contacts: contacts,
        notes: document.getElementById('lieuNotes').value.trim(),
        documents: currentEditingLieu !== null ? (appSettings.lieux[currentEditingLieu].documents || []) : []
    };
    
    if (currentEditingLieu !== null) {
        appSettings.lieux[currentEditingLieu] = lieuData;
    } else {
        appSettings.lieux.push(lieuData);
    }
    
    saveSettings();
    closeLieuModal();
    renderAdminLieux();
}

function deleteLieu(index) {
    if (!confirm('Supprimer ce lieu ?')) return;
    appSettings.lieux.splice(index, 1);
    saveSettings();
    renderAdminLieux();
}

// ============================================
// GESTION PRESTATAIRES
// ============================================
let currentEditingPrestataire = null;

function renderAdminPrestataires(filter = '') {
    const container = document.getElementById('adminPrestataires');
    if (!container) return;
    
    if (!appSettings.prestataires || appSettings.prestataires.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun prestataire enregistré. Ajoutez vos prestataires.</div>';
        return;
    }
    
    const filterLower = filter.toLowerCase();
    const prestaFiltres = appSettings.prestataires
        .map((presta, index) => ({ ...presta, originalIndex: index }))
        .filter(presta => {
            if (!filterLower) return true;
            return (presta.nom || '').toLowerCase().includes(filterLower) ||
                   (presta.type || '').toLowerCase().includes(filterLower) ||
                   (presta.contact || '').toLowerCase().includes(filterLower);
        });
    
    if (prestaFiltres.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun prestataire trouvé pour cette recherche.</div>';
        return;
    }
    
    container.innerHTML = prestaFiltres.map(presta => `
        <div class="admin-list-item">
            <div class="admin-list-item-info">
                <div class="admin-list-item-name">🏢 ${presta.nom}</div>
                <div class="admin-list-item-detail">${presta.type || 'Type non défini'}${presta.contact ? ' • ' + presta.contact : ''}</div>
            </div>
            <div class="admin-list-item-actions">
                <button class="btn-edit-small" onclick="editPrestataire(${presta.originalIndex})">✏️</button>
                <button class="btn-delete-small" onclick="deletePrestataire(${presta.originalIndex})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function openPrestataireModal() {
    currentEditingPrestataire = null;
    document.getElementById('prestataireModalTitle').textContent = 'Nouveau prestataire';
    document.getElementById('prestataireForm').reset();
    document.getElementById('prestataireId').value = '';
    document.getElementById('prestataireModal').classList.add('active');
}

function closePrestataireModal() {
    document.getElementById('prestataireModal').classList.remove('active');
    currentEditingPrestataire = null;
}

function editPrestataire(index) {
    const presta = appSettings.prestataires[index];
    if (!presta) return;
    
    currentEditingPrestataire = index;
    document.getElementById('prestataireModalTitle').textContent = 'Modifier le prestataire';
    document.getElementById('prestataireId').value = presta.id;
    document.getElementById('prestataireNom').value = presta.nom || '';
    document.getElementById('prestataireType').value = presta.type || '';
    document.getElementById('prestataireContact').value = presta.contact || '';
    document.getElementById('prestataireTelephone').value = presta.telephone || '';
    document.getElementById('prestataireEmail').value = presta.email || '';
    document.getElementById('prestataireNotes').value = presta.notes || '';
    
    document.getElementById('prestataireModal').classList.add('active');
}

function savePrestataire(event) {
    event.preventDefault();
    
    const nom = document.getElementById('prestataireNom').value.trim();
    if (!nom) return;
    
    const prestaData = {
        id: document.getElementById('prestataireId').value || Date.now().toString(),
        nom: nom,
        type: document.getElementById('prestataireType').value,
        contact: document.getElementById('prestataireContact').value.trim(),
        telephone: document.getElementById('prestataireTelephone').value.trim(),
        email: document.getElementById('prestataireEmail').value.trim(),
        notes: document.getElementById('prestataireNotes').value.trim()
    };
    
    if (currentEditingPrestataire !== null) {
        appSettings.prestataires[currentEditingPrestataire] = prestaData;
    } else {
        appSettings.prestataires.push(prestaData);
    }
    
    saveSettings();
    closePrestataireModal();
    renderAdminPrestataires();
}

function deletePrestataire(index) {
    if (!confirm('Supprimer ce prestataire ?')) return;
    appSettings.prestataires.splice(index, 1);
    saveSettings();
    renderAdminPrestataires();
}

// ============================================
// FONCTIONS UTILITAIRES POUR LES BASES
// ============================================

// Remplacer getEquipeMembreById par getUserById (utilise les utilisateurs de la base)
function getUserById(id) {
    if (!id) return null;
    return allUsers.find(u => u.id.toString() === id.toString());
}

// Alias pour compatibilité avec l'ancien code
function getEquipeMembreById(id) {
    return getUserById(id);
}

function getLieuById(id) {
    return appSettings.lieux.find(l => l.id === id);
}

function getPrestataireById(id) {
    return appSettings.prestataires.find(p => p.id === id);
}

// Remplacer getEquipeMembresWithRole par getUsersWithRole (utilise les utilisateurs de la base)
function getUsersWithRole(role) {
    return allUsers.filter(u => u.role_professionnel === role);
}

// Alias pour compatibilité avec l'ancien code
function getEquipeMembresWithRole(role) {
    return getUsersWithRole(role);
}
