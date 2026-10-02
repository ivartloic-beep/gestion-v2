// Configuration globale - utilisation de window pour éviter les erreurs de déclaration
try {
    if (typeof window.CLIENT_ID === 'undefined') {
        window.CLIENT_ID = '384029709694-3jncjdn9uc3tt9jqqlvhs13avpdd6ao8.apps.googleusercontent.com';
    }
} catch (e) {
    console.error('Erreur lors de la déclaration de CLIENT_ID:', e);
}
// Configuration API PHP
// Si le fichier HTML est dans /outils/, alors API_URL doit être 'api' (relatif au dossier actuel)
// Si le fichier HTML est à la racine, alors API_URL doit être 'outils/api'
if (!window.API_URL) {
    window.API_URL = 'api'; // Chemin relatif au dossier où se trouve ce fichier HTML
}

// Variables de session
if (!window.authToken) {
    window.authToken = null;
}
if (!window.currentUser) {
    window.currentUser = null;
}
if (!window.userPermissions) {
    window.userPermissions = {};
}

// Flag pour s'assurer que l'authentification est vérifiée ET réussie avant de charger quoi que ce soit
if (!window.authChecked) {
    window.authChecked = false;
}
if (!window.isAuthenticated) {
    window.isAuthenticated = false;
}

// ========== ANCIEN CODE GOOGLE DRIVE (COMMENTÉ) ==========
/*
const API_KEY = 'AIzaSyChlj6ace594FthiND_IrAD5t0NyX1fExs';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;
*/
if (!window.projects) {
    window.projects = [];
}
if (!window.currentProject) {
    window.currentProject = null;
}
if (!window.notesfrais) {
    window.notesfrais = [];
}
if (!window.currentFiles) {
    window.currentFiles = [];
}
if (!window.currentTournee) {
    window.currentTournee = null;
}

// Données Mon Bureau (personnel)
if (!window.myBureau) {
    window.myBureau = { tasks: [], notes: [], ideas: [] };
}
// Variables éditeurs (legacy localStorage)
if (!window.currentNoteId) {
    window.currentNoteId = null;
}
if (!window.currentNoteType) {
    window.currentNoteType = 'personal';
}
if (!window.currentIdeaId) {
    window.currentIdeaId = null;
}
if (!window.currentIdeaType) {
    window.currentIdeaType = 'personal';
}
if (!window.currentNoteFiles) {
    window.currentNoteFiles = [];
}
if (!window.currentIdeaFiles) {
    window.currentIdeaFiles = [];
}

if (!window.workspaceElements) {
    window.workspaceElements = [];
}
if (!window.currentWorkspaceVisibility) {
    window.currentWorkspaceVisibility = 'personal';
}
if (!window.currentWsElementId) {
    window.currentWsElementId = null;
}
if (!window.currentWsElementType) {
    window.currentWsElementType = null;
}
if (!window.currentWsFolderId) {
    window.currentWsFolderId = null;
}
if (!window.currentWsProjectId) {
    window.currentWsProjectId = null;
}
if (!window.mindmapData) {
    window.mindmapData = null;
}
if (!window.mindmapSelectedNode) {
    window.mindmapSelectedNode = null;
}
if (!window.mindmapZoom) {
    window.mindmapZoom = 1;
}
if (!window.mindmapPan) {
    window.mindmapPan = { x: 0, y: 0 };
}
if (!window.drawingCtx) {
    window.drawingCtx = null;
}
if (!window.drawingTool) {
    window.drawingTool = 'pen';
}
if (!window.drawingHistory) {
    window.drawingHistory = [];
}
if (!window.isDrawing) {
    window.isDrawing = false;
}

// Notifications
if (!window.notifications) {
    window.notifications = [];
}

if (!window.syncInterval) {
    window.syncInterval = null;
}
if (!window.lastProjectsHash) {
    window.lastProjectsHash = '';
}
if (!window.lastUsersHash) {
    window.lastUsersHash = '';
}
if (!window.lastSettingsHash) {
    window.lastSettingsHash = '';
}
if (!window.isSyncing) {
    window.isSyncing = false;
}
if (!window.lastSaveTimestamp) {
    window.lastSaveTimestamp = 0;
}
if (!window.isSaving) {
    window.isSaving = false;
}
if (!window.lastUsersSyncTime) {
    window.lastUsersSyncTime = 0;
}
if (!window.lastSettingsSyncTime) {
    window.lastSettingsSyncTime = 0;
}

// Paramètres de l'application
if (!window.appSettings) {
    window.appSettings = {
    logo: null,
    appName: 'L&Com Gestion',
    reseauxBilletterie: [],
    // Nouvelles bases de données
    equipeInterne: [],      // {id, nom, prenom, roles[], telephone, email}
    lieux: [],              // {id, nom, adresse, ville, codePostal, pays, capacite, type, contacts[], notes, documents[]}
    prestataires: [],       // {id, nom, type, contact, telephone, email, notes}
    crm: { lists: [], categories: [], activityLines: [], globalAccessUsers: [], deals: [] },
    workProjects: { projects: [], templates: [] },
    clients: [],  // Base clients/organisateurs pour vente et coproduction {id, nom, contact, telephone, email, adresse, notes}
    catalogue: [],  // Catalogue spectacles {id, name, description, genre, duree, notes, visuels[], documents[], budgetModel[]}
    ndfKmRate: 0.57,  // Tarif €/km pour indemnités kilométriques (notes de frais)
    };
}

if (!window.currentTasksProject) {
    window.currentTasksProject = null;
}
if (!window.currentEditingTask) {
    window.currentEditingTask = null;
}

// Dépôt justificatif (menu) — défini dès le chargement pour éviter ReferenceError si compta.js charge après
function openDepotJustificatif() {
    if (typeof openComptabiliteHomePage === 'function') {
        openComptabiliteHomePage();
    } else if (typeof openDepotJustificatifsPage === 'function') {
        openDepotJustificatifsPage();
    }
}
if (typeof window !== 'undefined') window.openDepotJustificatif = openDepotJustificatif;

// ========== FONCTIONS DE CONNEXION ET GESTION DE SESSION ==========

// Vérifier si l'utilisateur est connecté au chargement
async function checkAuth() {
    console.log('checkAuth: Début de la vérification');
    authChecked = false; // Réinitialiser le flag
    
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    const permissions = localStorage.getItem('userPermissions');
    
    // Si pas de token, afficher uniquement le formulaire de connexion
    if (!token || !user) {
        console.log('checkAuth: Pas de token ou utilisateur dans localStorage, affichage du login');
        // S'assurer que les variables sont bien réinitialisées
        authToken = null;
        currentUser = null;
        userPermissions = {};
        authChecked = true; // Marquer comme vérifié
        isAuthenticated = false; // Mais pas authentifié
        showLogin();
        return;
    }
    
    console.log('checkAuth: Token trouvé dans localStorage, vérification...');
    
    // Si token existe, vérifier qu'il est valide AVANT de définir les variables
    try {
        authToken = token;
        currentUser = JSON.parse(user);
        if (currentUser && !Array.isArray(currentUser.societies)) currentUser.societies = ['lcom'];
        if (currentUser && typeof normalizeUserSocieties === 'function') {
            currentUser.societies = normalizeUserSocieties(currentUser.societies);
        } else if (currentUser) {
            currentUser.societies = ['lcom'];
        }
        
        // Utiliser apiCall pour récupérer les permissions (même auth que le reste de l'app)
        const data = await apiCall('permissions.php', 'GET');
        
        if (!data.success) {
            throw new Error(data.error || 'Token invalide');
        }
        
        // Permissions fraîches de l'API
        userPermissions = (data.permissions && typeof data.permissions === 'object') ? data.permissions : JSON.parse(permissions || '{}');
        try {
            localStorage.setItem('userPermissions', JSON.stringify(userPermissions));
        } catch (e) { /* quota */ }
        authChecked = true;
        isAuthenticated = true;
        
        showApp();
    } catch (error) {
        // Token invalide ou expiré, nettoyer et afficher le login
        console.error('checkAuth: ERREUR lors de la vérification du token:', error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userPermissions');
        authToken = null;
        currentUser = null;
        userPermissions = {};
        authChecked = true; // Marquer comme vérifié
        isAuthenticated = false; // Mais pas authentifié
        showLogin();
    }
}

// Afficher la page de connexion
function showLogin() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    document.getElementById('mainHeader').style.display = '';
    document.getElementById('sidebar').classList.remove('logged-in');
    document.getElementById('mainContent').classList.remove('logged-in');
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    // Forcer la fermeture de TOUTES les pages (y compris celles hors #app comme la messagerie)
    if (typeof closeAllPages === 'function') closeAllPages();
    else document.querySelectorAll('.msg-page.active, .compta-page.active, .crm-page.active, .crm-list-page.active, .tournee-page.active, .bureau-page.active, .tasks-page.active, .editor-page.active').forEach(function(p) { p.classList.remove('active'); });
    // Aussi fermer les modales ouvertes
    document.querySelectorAll('.modal.active').forEach(function(m) { m.classList.remove('active'); });
    // Logo depuis le serveur (navigation privée : pas de cache local)
    if (typeof loadLoginBranding === 'function') {
        loadLoginBranding();
    } else {
        const cachedLogo = localStorage.getItem('appLogo');
        const headerLogoEl = document.getElementById('mainHeaderLogo');
        if (headerLogoEl) {
            headerLogoEl.innerHTML = cachedLogo ? '<img src="' + cachedLogo + '" alt="Logo">' : '';
        }
    }
    // Réinitialiser le formulaire de connexion (bouton cliquable après déconnexion)
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Se connecter';
    }
    const loginError = document.getElementById('loginError');
    if (loginError) {
        loginError.style.display = 'none';
        loginError.textContent = '';
    }
}

// Afficher l'application (appelée uniquement après vérification du token)
async function showApp() {
    // Vérification CRITIQUE : ne rien faire si pas authentifié
    if (!isAuthenticated || !authToken || !currentUser) {
        console.error('showApp: ERREUR - Tentative d\'affichage sans authentification !', {
            isAuthenticated,
            authToken: !!authToken,
            currentUser: !!currentUser,
            authTokenValue: authToken ? authToken.substring(0, 20) + '...' : null
        });
        showLogin();
        return;
    }
    
    console.log('showApp: Affichage de l\'application pour', currentUser.username);
    
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('sidebar').classList.add('logged-in');
    document.getElementById('mainContent').classList.add('logged-in');
    
    // Afficher les infos utilisateur
    if (currentUser) {
        document.getElementById('userInfo').style.display = 'block';
        document.getElementById('userName').textContent = `${currentUser.prenom || ''} ${currentUser.nom || currentUser.username}`.trim();
        document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Administrateur' : 'Utilisateur';
        document.getElementById('logoutBtn').style.display = 'block';
    }
    
    // Appliquer les permissions après chargement des données (widget tâches accueil, visibilité CRM, etc.)
    // Rafraîchir les permissions depuis l'API (au cas où le premier chargement aurait échoué)
    setTimeout(async () => {
        try {
            const data = await apiCall('permissions.php', 'GET');
            if (data.permissions && typeof data.permissions === 'object') {
                userPermissions = data.permissions;
                try { localStorage.setItem('userPermissions', JSON.stringify(userPermissions)); } catch (e) {}
                applyPermissions();
                if (typeof updateHomeTiles === 'function') updateHomeTiles();
            }
        } catch (e) { /* ignore */ }
    }, 500);
    
    // Mettre à jour la visibilité du menu admin
    updateAdminMenuVisibility();
    
    // Charger les données UNIQUEMENT après connexion réussie
    // Triple vérification avant de charger
    if (isAuthenticated && authToken && currentUser) {
        console.log('showApp: Démarrage du chargement des données');
        await loadSettings();
        if (typeof loadWorkProjectsData === 'function') await loadWorkProjectsData();
        await loadProjects();
        if (typeof refreshMailsNavVisibility === 'function') await refreshMailsNavVisibility();
        if (typeof loadPrevisionnels === 'function') await loadPrevisionnels(true);
        // Charger les utilisateurs pour les assignations de tâches
        loadUsersForAssignments();
        // Charger données bureau et CRM avant le rendu accueil
        if (typeof loadMyBureauData === 'function') await loadMyBureauData();
        if (typeof loadCrmData === 'function') await loadCrmData();
        applyPermissions();
        // Messagerie (widget accueil + synchro temps réel hors page messagerie)
        if (typeof loadConversations === 'function') await loadConversations();
        if (typeof startMsgBackgroundSync === 'function') startMsgBackgroundSync();
        if (typeof startMailsBackgroundSync === 'function') startMailsBackgroundSync();
        setTimeout(startSync, 5000);
        // Push window.notifications
        setTimeout(() => initPushNotifications(), 2000);
        // Deep-link depuis notification push
        if (window._pendingOpenConv) {
            const convId = window._pendingOpenConv;
            delete window._pendingOpenConv;
            setTimeout(() => {
                if (typeof openMessagingPage === 'function') {
                    openMessagingPage();
                    setTimeout(() => openConversation(convId), 500);
                }
            }, 1500);
        }
    } else {
        console.error('showApp: ERREUR - Conditions d\'authentification non remplies lors du chargement des données', {
            isAuthenticated,
            authToken: !!authToken,
            currentUser: !!currentUser
        });
    }
    
    // Vérifier et afficher le bouton d'installation
    checkAndShowInstallButton();
    
    // Afficher la bannière d'installation sur mobile
    // Attendre un peu pour que tout soit chargé
    setTimeout(() => {
        showInstallBanner();
    }, 1000);
}

// Gestion de la connexion
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    
    errorDiv.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Connexion...';
    
    try {
        const loginUrl = `${API_URL}/login.php`;
        console.log('handleLogin: Tentative de connexion à', loginUrl);
        console.log('handleLogin: Username:', username);
        
        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        console.log('handleLogin: Réponse reçue, status:', response.status);
        console.log('handleLogin: Headers de réponse:', [...response.headers.entries()]);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('handleLogin: Erreur HTTP', response.status, errorText);
            try {
                const errorData = JSON.parse(errorText);
                errorDiv.textContent = errorData.error || `Erreur ${response.status}`;
            } catch (e) {
                errorDiv.textContent = `Erreur ${response.status}: ${errorText}`;
            }
            errorDiv.style.display = 'block';
            loginBtn.disabled = false;
            loginBtn.textContent = 'Se connecter';
            return;
        }
        
        const data = await response.json();
        console.log('handleLogin: Données reçues:', data);
        
        if (data.success && data.token) {
            console.log('handleLogin: Connexion réussie, token reçu');
            
            // Sauvegarder les informations de session
            authToken = data.token;
            currentUser = data.user;
            if (currentUser && !Array.isArray(currentUser.societies)) currentUser.societies = ['lcom'];
        if (currentUser && typeof normalizeUserSocieties === 'function') {
            currentUser.societies = normalizeUserSocieties(currentUser.societies);
        } else if (currentUser) {
            currentUser.societies = ['lcom'];
        }
            userPermissions = data.permissions || {};
            
            // Vérifier que le token est bien défini
            if (!authToken || !currentUser) {
                console.error('handleLogin: ERREUR - Token ou utilisateur manquant après connexion !');
                errorDiv.textContent = 'Erreur: Données de session invalides';
                errorDiv.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Se connecter';
                return;
            }
            
            console.log('handleLogin: Token et utilisateur définis, sauvegarde dans localStorage');
            function saveSessionToStorage() {
                localStorage.setItem('authToken', authToken);
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                localStorage.setItem('userPermissions', JSON.stringify(userPermissions));
            }
            try {
                saveSessionToStorage();
            } catch (storageError) {
                if (storageError.name === 'QuotaExceededError') {
                    // Libérer un peu d'espace (données optionnelles / cache) et réessayer une fois
                    try {
                        localStorage.removeItem('installBannerDismissed');
                        localStorage.removeItem('previsionnels');
                        saveSessionToStorage();
                    } catch (retryError) {
                        console.error('handleLogin: Quota toujours dépassé après libération:', retryError);
                        errorDiv.textContent = 'Espace de stockage insuffisant. Veuillez vider les données du site (Paramètres du navigateur > Confidentialité > Données du site) ou supprimer des données inutiles, puis réessayer.';
                        errorDiv.style.display = 'block';
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Se connecter';
                        return;
                    }
                } else {
                    throw storageError;
                }
            }
            
            // Si login.php retourne un token, c'est qu'il est valide
            // Pas besoin de vérification supplémentaire qui peut causer des problèmes de timing
            console.log('handleLogin: Connexion réussie, affichage de l\'application');
            
            // Marquer comme vérifié et authentifié
            authChecked = true;
            isAuthenticated = true;
            
            // Afficher l'application
            showApp();
        } else {
            console.error('handleLogin: Échec de la connexion, données reçues:', data);
            errorDiv.textContent = data.error || 'Erreur de connexion';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('handleLogin: ERREUR lors de la connexion:', error);
        console.error('handleLogin: Type d\'erreur:', error.name);
        console.error('handleLogin: Message:', error.message);
        console.error('handleLogin: Stack:', error.stack);
        if (error.name === 'QuotaExceededError') {
            errorDiv.textContent = 'Espace de stockage insuffisant. Veuillez vider les données du site (Paramètres du navigateur > Confidentialité > Données du site) ou supprimer des données inutiles, puis réessayer.';
        } else {
            errorDiv.textContent = 'Erreur de connexion au serveur: ' + error.message + '. Vérifiez la console (F12) pour plus de détails.';
        }
        errorDiv.style.display = 'block';
        // Nettoyer en cas d'erreur
        authToken = null;
        currentUser = null;
        userPermissions = {};
        authChecked = false;
        isAuthenticated = false;
        loginBtn.disabled = false;
        loginBtn.textContent = 'Se connecter';
    }
}

// Déconnexion
function logout() {
    stopSync();
    // Arrêter le polling messagerie
    if (typeof stopMsgPolling === 'function') stopMsgPolling();
    if (typeof stopMsgBackgroundSync === 'function') stopMsgBackgroundSync();
    if (typeof stopMailsPolling === 'function') stopMailsPolling();
    if (typeof stopMailsBackgroundSync === 'function') stopMailsBackgroundSync();
    if (typeof resetWorkProjectsClientState === 'function') resetWorkProjectsClientState();
    // Fermer TOUTES les pages ouvertes (tous les types)
    document.querySelectorAll('.tournee-page.active, .bureau-page.active, .tasks-page.active, .msg-page.active, .compta-page.active, .crm-page.active, .crm-list-page.active, .editor-page.active, .admin-page.active').forEach(p => p.classList.remove('active'));
    // Aussi fermer via closeAllPages si disponible
    if (typeof closeAllPages === 'function') closeAllPages();
    // Réinitialiser les variables globales
    window.currentSpectacleDetail = null;
    window.currentTournee = null;
    window.currentTechSpectacle = null;
    window.currentBudgetSpectacle = null;
    window.currentBilletterieSpectacle = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userPermissions');
    authToken = null;
    currentUser = null;
    isAuthenticated = false;
    authChecked = false;
    userPermissions = {};
    window.projects = [];
    showLogin();
}

// Appliquer les permissions (masquer/désactiver les sections)
function applyPermissions() {
    const sections = {
        'budget': ['budget', 'finance'],
        'billetterie': ['billetterie', 'billets'],
        'visuels': ['visuels', 'visuel'],
        'technique': ['technique', 'tech'],
        'taches': ['taches', 'tasks', 'tâches'],
        'admin': ['admin', 'administration']
    };
    
    // Vérifier si c'est un admin (avec ou sans profil)
    const isAdmin = currentUser && currentUser.role === 'admin';
    // Super-admin = admin sans profil et sans restrictions personnalisées enregistrées
    const hasCustomPermissionOverrides = (perms) => {
        if (!perms || typeof perms !== 'object') return false;
        return Object.keys(perms).some(section => {
            if (section === 'admin') return false;
            const p = perms[section];
            return p && (!p.can_view || !p.can_edit);
        });
    };
    const isSuperAdmin = isAdmin && !currentUser.permission_profile_id && !hasCustomPermissionOverrides(userPermissions);
    
    // Fonction helper pour vérifier une permission
    function hasPermission(section, action = 'view') {
        if (isSuperAdmin) {
            return true; // Les super-admins ont tous les droits
        }
        // Pour les admins avec un profil, vérifier les permissions du profil
        const perm = userPermissions[section];
        if (!perm) return false;
        return action === 'edit' ? perm.can_edit : perm.can_view;
    }
    
    // Masquer/afficher les cartes dans la page de détail d'un spectacle
    const budgetCard = document.getElementById('spectacleDetailBudgetCard');
    const billetterieCard = document.getElementById('spectacleDetailBilletterieCard');
    const visuelsCard = document.getElementById('spectacleDetailVisuelsCard');
    const techCard = document.getElementById('spectacleDetailTechCard');
    const communicationCard = document.getElementById('spectacleDetailCommunicationCard');
    const documentsCard = document.getElementById('spectacleDetailDocumentsCard');
    const tasksSection = document.getElementById('spectacleAllTasksList')?.parentElement;
    
    console.log('=== applyPermissions DEBUG ===');
    console.log('isAdmin:', isAdmin, 'isSuperAdmin:', isSuperAdmin);
    console.log('userPermissions:', userPermissions);
    console.log('hasPermission budget:', hasPermission('budget'));
    console.log('hasPermission billetterie:', hasPermission('billetterie'));
    console.log('hasPermission communication:', hasPermission('communication'));
    
    if (budgetCard) {
        budgetCard.style.display = hasPermission('budget') ? '' : 'none';
    }
    if (billetterieCard) {
        billetterieCard.style.display = hasPermission('billetterie') ? '' : 'none';
    }
    if (visuelsCard) {
        visuelsCard.style.display = hasPermission('visuels') ? '' : 'none';
    }
    if (techCard) {
        techCard.style.display = hasPermission('technique') ? '' : 'none';
    }
    if (communicationCard) {
        communicationCard.style.display = hasPermission('communication') ? '' : 'none';
    }
    if (documentsCard) {
        // Documents accessible à tous (pas de permission spécifique pour l'instant)
        // Ou vous pouvez créer une permission 'documents' si nécessaire
    }
    if (tasksSection) {
        tasksSection.style.display = hasPermission('taches') ? '' : 'none';
    }
    
    // Masquer/afficher la section Billetterie dans la page billetterie
    const billetterieDetail = document.getElementById('spectacleBilletterieDetail');
    if (billetterieDetail) {
        billetterieDetail.style.display = hasPermission('billetterie') ? 'block' : 'none';
    }
    
    // Masquer/afficher la section Visuels dans la page visuels
    const visuelsDetail = document.getElementById('spectacleVisuelsDetail');
    if (visuelsDetail) {
        visuelsDetail.style.display = hasPermission('visuels') ? 'block' : 'none';
    }
    
    // Masquer/afficher la page Technique
    const techPage = document.getElementById('techPage');
    if (techPage && !hasPermission('technique')) {
        // Si on est sur la page technique sans permission, rediriger
        if (techPage.classList.contains('active')) {
            closeTechPage();
        }
    }
    
    // Masquer/afficher les boutons d'édition selon les permissions
    // Désactiver les boutons d'ajout/modification si pas de permission d'édition
    const editButtons = document.querySelectorAll('[onclick*="edit"], [onclick*="add"], [onclick*="save"], [onclick*="create"]');
    editButtons.forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes('Budget') && !hasPermission('budget', 'edit')) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else if (onclick.includes('Billetterie') && !hasPermission('billetterie', 'edit')) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else if (onclick.includes('Visuel') && !hasPermission('visuels', 'edit')) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else if (onclick.includes('Tech') && !hasPermission('technique', 'edit')) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else if (onclick.includes('Task') && !hasPermission('taches', 'edit')) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
    });
    
    // Afficher les sections admin si admin (même avec profil)
    const usersCard = document.getElementById('adminUsersCard');
    const profilesSection = document.getElementById('adminProfilesSection');
    
    if (usersCard) {
        if (!isAdmin) {
            usersCard.style.display = 'none';
        } else {
            usersCard.style.display = 'block';
        }
    }
    
    if (profilesSection) {
        if (!isAdmin) {
            profilesSection.style.display = 'none';
        } else {
            profilesSection.style.display = 'block';
            loadProfilesList();
        }
    }
    
    // Stocker les permissions dans une variable globale pour utilisation dans les fonctions de rendu
    window.hasPermission = hasPermission;
    
    // Masquer/afficher les éléments de navigation selon les permissions
    const navTasksItem = document.getElementById('navTasksItem');
    if (navTasksItem) {
        navTasksItem.style.display = hasPermission('taches') ? 'flex' : 'none';
    }
    
    const homeTasksWidget = document.getElementById('homeTasksWidget');
    if (homeTasksWidget) {
        homeTasksWidget.style.display = hasPermission('bureau') ? 'block' : 'none';
    }
    
    // Administration : menu latéral uniquement (plus de tuile sur l'accueil)
    const navAdminItem = document.getElementById('navAdminItem');
    const adminVisible = isAdmin;
    if (navAdminItem) navAdminItem.style.display = adminVisible ? '' : 'none';
    
    if (typeof updateComptabiliteNavVisibility === 'function') updateComptabiliteNavVisibility();

    const depotJustifTabCollecte = document.getElementById('depotJustifTabCollecte');
    if (depotJustifTabCollecte) {
        depotJustifTabCollecte.style.display = 'none';
    }
    
    const navPrevisionnelsItem = document.getElementById('navPrevisionnelsItem');
    if (navPrevisionnelsItem) {
        navPrevisionnelsItem.style.display = hasPermission('previsionnels') ? '' : 'none';
    }
    
    // Masquer/afficher l'item Mon Bureau
    const navBureauItem = document.getElementById('navBureauItem');
    if (navBureauItem) {
        navBureauItem.style.display = hasPermission('bureau') ? '' : 'none';
    }
    
    // Visibilité menu / tuiles Événementiel
    if (typeof updateEvenementielNavVisibility === 'function') updateEvenementielNavVisibility();
    if (typeof updateCrmVisibility === 'function') updateCrmVisibility();

    // Visibilité des sections métier selon sociétés attribuées (entity-v2.js)
    if (typeof applySocietiesVisibility === 'function') applySocietiesVisibility();

    if (typeof updateWorkProjectsNavVisibility === 'function') updateWorkProjectsNavVisibility();

    if (typeof updateMailsNavVisibility === 'function') updateMailsNavVisibility();

    // Mettre à jour les tuiles d'accueil
    updateHomeTiles();
}


// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (!sidebar) return;
    
    sidebar.classList.toggle('open');
    if (overlay) {
        overlay.classList.toggle('active');
    }
    
    // Empêcher le scroll du body quand menu ouvert
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

// Fermer le menu quand on clique sur un item (mobile)
function closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Fermer toutes les pages plein écran (accueils module, sous-pages, fiches…)
var OVERLAY_PAGE_SELECTORS = [
    '.tournee-page',
    '.evenementiel-page',
    '.compta-page',
    '.crm-page',
    '.crm-list-page',
    '.crm-fiche-page',
    '.crm-pipeline-page',
    '.module-home-page',
    '.admin-page',
    '.bureau-page',
    '.msg-page',
    '.wp-list-page',
    '.wp-detail-page',
    '.tasks-page',
    '.editor-page',
    '.catalogue-page',
    '.catalogue-fiche-page',
    '.ai-page'
].join(', ');

function closeAllPages() {
    if (typeof closeGlobalSearchDropdown === 'function') closeGlobalSearchDropdown();
    document.querySelectorAll(OVERLAY_PAGE_SELECTORS).forEach(function(p) {
        p.classList.remove('active');
    });
    const pagesToClose = ['evenementielHomePage', 'comptaHomePage', 'comptaValidationPage', 'comptaValidationNdfPage', 'comptaValidationFacturesPage', 'comptaValidationDevisPage', 'depotDevisPage', 'comptaDocsEmisPage', 'adminPage', 'comptaPage', 'depotJustificatifsPage', 'notesFraisPage', 'globalTasksPage', 'projectTasksPage', 'projectsListPage', 'workProjectsListPage', 'workProjectPage', 'previsionnelsListPage', 'previsionnelPage', 'usersPage', 'techPage', 'budgetPage', 'visuelsPage', 'documentsPage', 'projectNotesPage', 'communicationPage', 'communicationTourneePage', 'tourneeVisuelsPage', 'tourneeDocumentsPage', 'billetteriePage', 'tourneePage', 'spectaclePage', 'myBureauPage', 'bureauDoneTasksPage', 'noteEditorPage', 'ideaEditorPage', 'messageriePage', 'mailsPage', 'workspaceEditorPage', 'workspaceMindmapPage', 'workspaceDrawingPage', 'spectacleContactsPage', 'cataloguePage', 'catalogueFichePage', 'catalogueFolderPage', 'invitationsPage', 'crmPage', 'crmProspectsHubPage', 'crmProspectsBrowsePage', 'crmListsBrowsePage', 'crmStructuresBrowsePage', 'crmDealsBrowsePage', 'crmRelancesBrowsePage', 'crmListPage', 'crmProspectPage', 'crmStructurePage', 'crmDealPage', 'crmDealDocumentsPage', 'crmDealNotesPage', 'taskFichePage', 'adminCrmPage'];
    pagesToClose.forEach(function(pageId) {
        const page = document.getElementById(pageId);
        if (page) page.classList.remove('active');
    });
}
window.closeAllPages = closeAllPages;

// Navigation
function navigateTo(page) {
    closeAllPages();
    
    // Afficher l'accueil
    const homeWelcome = document.getElementById('homeWelcome');
    if (homeWelcome) homeWelcome.style.display = '';
    
    // Mettre à jour le menu actif
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const homeItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
    if (homeItem) homeItem.classList.add('active');
    
    // Mettre à jour les badges et tuiles
    updateHomeTiles();
    
    // Fermer le menu sur mobile
    closeSidebarOnMobile();
    updateFabAppearance();
}

window.onload = async function() {
    if (typeof loadLoginBranding === 'function') {
        await loadLoginBranding();
    } else {
        const cachedLogo = localStorage.getItem('appLogo');
        const cachedName = localStorage.getItem('appName');
        const headerLogoEl = document.getElementById('mainHeaderLogo');
        if (headerLogoEl && cachedLogo) {
            headerLogoEl.innerHTML = '<img src="' + cachedLogo + '" alt="Logo">';
        }
        if (cachedLogo) {
            const favicon = document.getElementById('dynamicFavicon');
            if (favicon) favicon.href = cachedLogo;
        }
        if (cachedName) {
            document.title = cachedName;
        }
    }
    
    // Vérifier l'authentification au chargement (attendre la vérification)
    await checkAuth();
    
    /* ========== ANCIEN CODE GOOGLE DRIVE (COMMENTÉ) ==========
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = gapiLoaded;
    document.head.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.onload = gisLoaded;
    document.head.appendChild(gisScript);
    */
};
// ========== PWA ==========

// Enregistrement du Service Worker
if (!window.swRegistration) {
    window.swRegistration = null;
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('Service Worker enregistré');
                window.swRegistration = reg;
            })
            .catch(err => console.log('Service Worker erreur:', err));
        
        // Vérifier le bouton d'installation au chargement
        setTimeout(() => {
            checkAndShowInstallButton();
        }, 500);

        // Écouter les messages du SW pour la navigation push
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'OPEN_CONVERSATION') {
                if (typeof openMessagingPage === 'function') {
                    openMessagingPage();
                    if (event.data.convId) {
                        setTimeout(() => openConversation(event.data.convId), 500);
                    }
                }
            }
        });
    });
}

// Gestion deep-link depuis notification (quand l'app s'ouvre via une notification)
window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const openConv = params.get('openConv');
    if (openConv) {
        window._pendingOpenConv = openConv;
        history.replaceState(null, '', window.location.pathname);
    }
});

// ========== PUSH NOTIFICATIONS ==========

const VAPID_PUBLIC_KEY = 'BDKrKrbOerOjZNt-9iB_MTaJYbtXfcTHa_P_r14Hj-LzN4xp8CQp8wHn6qWcfFh_OoRTBtaUlyZSiAI_gI_TZ8c';

async function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push: non supporté par ce navigateur');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Push: permission refusée');
            return;
        }

        const reg = swRegistration || await navigator.serviceWorker.ready;
        
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
            const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });
        }

        const subJson = subscription.toJSON();
        const response = await apiCall('push_subscribe.php', 'POST', {
            endpoint: subJson.endpoint,
            keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth
            }
        });

        if (response && response.pushToken) {
            // Persist config to SW via IndexedDB
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SAVE_PUSH_CONFIG',
                    pushToken: response.pushToken,
                    apiBase: API_URL
                });
            }
            console.log('Push: abonnement réussi');
        }
    } catch (err) {
        console.error('Push: erreur d\'abonnement:', err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Installation PWA
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    checkAndShowInstallButton();
});

function showInstallPromotion() {}

function checkAndShowInstallButton() {}

async function installApp() {
    if (!deferredPrompt) {
        // Pour iOS, montrer les instructions
        alert("Pour installer sur iPhone/iPad :\n\n1. Appuyez sur le bouton Partager (carré avec flèche)\n2. Faites défiler et appuyez sur 'Sur l'écran d'accueil'\n3. Appuyez sur 'Ajouter'");
        return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
}

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
});

// Détecter si déjà en mode PWA
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

if (isPWA()) {
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
}

// Afficher la bannière d'installation sur mobile (une seule fois)
function showInstallBanner() {
    // Vérifier que l'élément existe
    const banner = document.getElementById('installBanner');
    if (!banner) {
        console.error('showInstallBanner: Élément installBanner introuvable dans le DOM');
        return;
    }
    
    // Vérifications
    if (isPWA()) {
        console.log('showInstallBanner: Déjà en PWA, bannière masquée');
        banner.style.display = 'none';
        return;
    }
    
    const dismissed = localStorage.getItem('installBannerDismissed');
    if (dismissed === 'true') {
        console.log('showInstallBanner: Bannière déjà rejetée, masquée');
        banner.style.display = 'none';
        return;
    }
    
    // Détecter mobile : largeur <= 768 OU user agent mobile
    const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) {
        console.log('showInstallBanner: Desktop, bannière masquée (largeur:', window.innerWidth, ')');
        banner.style.display = 'none';
        return;
    }
    
    console.log('showInstallBanner: Conditions OK, affichage programmé dans 2 secondes');
    console.log('showInstallBanner: Largeur écran:', window.innerWidth, 'isPWA:', isPWA(), 'dismissed:', dismissed, 'isMobile:', isMobile);
    
    // Attendre un peu pour que la page soit chargée
    setTimeout(() => {
        const bannerEl = document.getElementById('installBanner');
        if (bannerEl) {
            console.log('showInstallBanner: Affichage de la bannière');
            // Forcer l'affichage avec !important via setAttribute
            bannerEl.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important; position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; z-index: 99999 !important;');
        } else {
            console.error('showInstallBanner: Élément installBanner introuvable dans le DOM (timeout)');
        }
    }, 2000); // Attendre 2 secondes
}

function dismissInstallBanner() {
    const banner = document.getElementById('installBanner');
    if (banner) {
        banner.style.display = 'none';
        banner.style.visibility = 'hidden';
    }
    localStorage.setItem('installBannerDismissed', 'true');
}

// Fonction de test pour forcer l'affichage de la bannière (pour débug)
function testShowInstallBanner() {
    const banner = document.getElementById('installBanner');
    if (banner) {
        banner.style.display = 'block';
        banner.style.visibility = 'visible';
        banner.style.opacity = '1';
        console.log('testShowInstallBanner: Bannière forcée à afficher');
    } else {
        console.error('testShowInstallBanner: Élément installBanner introuvable');
    }
}

// ========== RECHERCHE GLOBALE ==========

function escapeSearchHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function clearGlobalSearchInputs() {
    var topInput = document.getElementById('searchGlobalInput');
    if (topInput) topInput.value = '';
    document.querySelectorAll('.search-global-input').forEach(function(el) { el.value = ''; });
}

function getGlobalSearchInput() {
    var active = document.activeElement;
    if (active) {
        if (active.id === 'searchGlobalInput') return active;
        if (active.classList && active.classList.contains('search-global-input')) return active;
    }
    var home = document.querySelector('.search-global-input');
    if (home && home.offsetParent !== null) return home;
    return document.getElementById('searchGlobalInput');
}

function getGlobalSearchAnchor(input) {
    if (!input) return null;
    return input.closest('#searchGlobalContainer')
        || input.closest('.mn-search-bar')
        || input.parentElement;
}

function positionGlobalSearchDropdown() {
    var dropdown = document.getElementById('searchResultsDropdown');
    var input = getGlobalSearchInput();
    if (!dropdown || !input) return;
    var anchor = getGlobalSearchAnchor(input);
    if (!anchor) return;

    if (dropdown.parentElement !== anchor) {
        anchor.appendChild(dropdown);
    }

    var aRect = anchor.getBoundingClientRect();
    var iRect = input.getBoundingClientRect();
    dropdown.style.position = 'absolute';
    dropdown.style.top = Math.round(iRect.bottom - aRect.top + 6) + 'px';
    dropdown.style.left = Math.round(iRect.left - aRect.left) + 'px';
    dropdown.style.width = Math.round(iRect.width) + 'px';
}

function closeGlobalSearchDropdown() {
    var dropdown = document.getElementById('searchResultsDropdown');
    if (dropdown) dropdown.classList.remove('active');
}

let _globalSearchTimer = null;
let _globalSearchRequestId = 0;

function renderGlobalSearchDropdown(results) {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (!dropdown) return;
    if (results.length === 0) {
        dropdown.innerHTML = '<div class="search-result-empty">Aucun résultat</div>';
    } else {
        dropdown.innerHTML = results.slice(0, 25).map((r, i) => `
            <div class="search-result-item" onclick="executeSearchResult(${i})">
                <span class="search-result-icon">${r.imageUrl ? `<img src="${escapeSearchHtml(r.imageUrl)}" alt="" class="search-result-icon-img">` : r.icon}</span>
                <div class="search-result-info">
                    <div class="search-result-title">${escapeSearchHtml(r.title)}</div>
                    <div class="search-result-type">${escapeSearchHtml(r.subtitle)}</div>
                </div>
            </div>
        `).join('');
    }
    positionGlobalSearchDropdown();
    dropdown.classList.add('active');
    window._searchResults = results;
}

async function ensureGlobalSearchDataLoaded() {
    const jobs = [];
    if (typeof ensureCrmDataLoaded === 'function') jobs.push(ensureCrmDataLoaded());
    if (typeof loadWorkProjectsData === 'function') jobs.push(loadWorkProjectsData());
    if (typeof loadMyBureauData === 'function') jobs.push(loadMyBureauData());
    if (typeof loadConversations === 'function') jobs.push(loadConversations());
    if (typeof loadCatalogueData === 'function' && (typeof catalogueData === 'undefined' || !catalogueData.length)) {
        jobs.push(loadCatalogueData());
    }
    await Promise.all(jobs.map(function(p) { return Promise.resolve(p).catch(function() {}); }));
}

async function runGlobalSearch(query, requestId) {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (!dropdown || requestId !== _globalSearchRequestId) return;

    const results = [];
    const seen = {};

    function pushResult(key, item) {
        if (seen[key]) return;
        seen[key] = true;
        results.push(item);
    }

    try {
        await ensureGlobalSearchDataLoaded();
        if (requestId !== _globalSearchRequestId) return;

        if (typeof globalSearchAppendAppEntities === 'function') {
            await globalSearchAppendAppEntities(query, pushResult);
        }
        if (requestId !== _globalSearchRequestId) return;

        if (typeof messagerieGlobalSearchAppend === 'function') {
            messagerieGlobalSearchAppend(query, results, pushResult);
        }
    } catch (err) {
        console.error('runGlobalSearch:', err);
    }

    if (requestId !== _globalSearchRequestId) return;
    renderGlobalSearchDropdown(results);
}

function handleGlobalSearch(query) {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (!dropdown) return;
    if (!query || query.length < 2) {
        closeGlobalSearchDropdown();
        return;
    }

    clearTimeout(_globalSearchTimer);
    dropdown.innerHTML = '<div class="search-result-empty">Recherche…</div>';
    positionGlobalSearchDropdown();
    dropdown.classList.add('active');

    const requestId = ++_globalSearchRequestId;
    _globalSearchTimer = setTimeout(function() {
        runGlobalSearch(query, requestId);
    }, 220);
}

function executeSearchResult(index) {
    const results = window._searchResults;
    if (results && results[index]) {
        results[index].action();
        closeGlobalSearchDropdown();
        clearGlobalSearchInputs();
    }
}

function showSearchResults() {
    positionGlobalSearchDropdown();
    const topInput = document.getElementById('searchGlobalInput');
    const homeInput = document.querySelector('.search-global-input');
    const val = (topInput && topInput.value) || (homeInput && homeInput.value) || '';
    if (val && val.length >= 2) handleGlobalSearch(val);
}

// Fermer recherche en cliquant ailleurs
document.addEventListener('mousedown', function(e) {
    var dropdown = document.getElementById('searchResultsDropdown');
    if (!dropdown || !dropdown.classList.contains('active')) return;
    if (dropdown.contains(e.target)) return;
    if (e.target.closest('#searchGlobalContainer, .mn-search-bar')) return;
    closeGlobalSearchDropdown();
});

function bindGlobalSearchDropdownTracking() {
    if (window._globalSearchDropdownTracking) return;
    window._globalSearchDropdownTracking = true;
    window.addEventListener('resize', function() {
        var dropdown = document.getElementById('searchResultsDropdown');
        if (dropdown && dropdown.classList.contains('active')) positionGlobalSearchDropdown();
    });
    window.addEventListener('scroll', function() {
        var dropdown = document.getElementById('searchResultsDropdown');
        if (dropdown && dropdown.classList.contains('active')) positionGlobalSearchDropdown();
    }, true);
}
bindGlobalSearchDropdownTracking();

// ========== NOTIFICATIONS ==========
let notificationsLoadError = null;

async function loadNotifications() {
    notificationsLoadError = null;
    try {
        const data = await apiCall('notifications.php', 'GET');
        if (data && data.success && Array.isArray(data.notifications)) {
            const uid = String(currentUser?.id || '');
            window.notifications = data.notifications
                .filter(n => {
                    // Exclure les window.notifications créées par l'utilisateur lui-même
                    if (uid && n.created_by && String(n.created_by) === uid) return false;
                    return true;
                })
                .map(n => ({
                    id: 'api_' + n.id,
                    title: n.title || '',
                    message: n.message || '',
                    type: n.type || 'info',
                    read: !!(n.read ?? n.read_flag),
                    link: n.link || null,
                    createdAt: n.created_at || n.createdAt
                }));
        } else {
            window.notifications = [];
        }
        const syncKey = 'notifSyncDone_' + (currentUser?.id || '');
        if (window.notifications.length === 0 && !localStorage.getItem(syncKey)) {
            await syncNotificationsForExistingAssignments();
            localStorage.setItem(syncKey, '1');
            return loadNotifications();
        }
    } catch(e) { 
        console.warn('loadNotifications:', e);
        notificationsLoadError = e.message || 'Erreur de chargement';
        try {
            const data = localStorage.getItem('notifications_' + (currentUser?.id || 'default'));
            if (data) window.notifications = JSON.parse(data);
            else window.notifications = [];
        } catch(e2) { window.notifications = []; }
    }
    return window.notifications;
}

async function syncNotificationsForExistingAssignments() {
    const uid = String(currentUser?.id || '');
    if (!uid) return;
    const toCreate = [];
    (window.projects || []).forEach(p => {
        const pname = p.name || p.lieu || 'Projet';
        // Ne pas notifier si l'utilisateur a créé le projet lui-même
        const projectCreatedBySelf = p.createdBy && String(p.createdBy) === uid;
        if (!projectCreatedBySelf && p.members && p.members.some(m => String(m && (m.id ?? m)) === uid)) {
            toCreate.push({ title: 'Assignation au projet', message: `Vous êtes membre du projet « ${pname} ».`, type: 'assignment' });
        }
        if (!projectCreatedBySelf && p.tech?.directeurTechniqueId && String(p.tech.directeurTechniqueId) === uid) {
            toCreate.push({ title: 'Directeur technique', message: `Vous êtes directeur technique pour « ${pname} ».`, type: 'assignment' });
        }
        // Vérifier aussi via le rôle dans l'équipe
        if (!projectCreatedBySelf) {
            const dtFromEquipe = getDirecteurTechniqueFromEquipe(p);
            if (dtFromEquipe && String(dtFromEquipe.id) === uid) {
                if (!toCreate.some(n => n.title === 'Directeur technique' && n.message.includes(pname))) {
                    toCreate.push({ title: 'Directeur technique', message: `Vous êtes directeur technique pour « ${pname} ».`, type: 'assignment' });
                }
            }
        }
        (p.tasks || []).forEach(t => {
            // Ne pas notifier si l'utilisateur a créé la tâche lui-même
            if (t.createdBy && String(t.createdBy) === uid) return;
            const assigned = t.assignedTo || t.assignees || [];
            if (assigned.some(a => String(a && (a.id ?? a)) === uid)) {
                toCreate.push({ title: 'Tâche assignée', message: `Tâche « ${(t.title || 'Sans titre').substring(0, 40)} » - ${pname}`, type: 'assignment' });
            }
        });
    });
    for (const n of toCreate.slice(0, 10)) {
        try {
            await apiCall('notifications.php', 'POST', { userId: uid, title: n.title, message: n.message, type: n.type });
        } catch (e) { break; }
    }
}

function saveNotifications() {
    try {
        localStorage.setItem('notifications_' + (currentUser?.id || 'default'), JSON.stringify(window.notifications));
    } catch(e) {}
}

function addNotification(title, message, type) {
    window.notifications.unshift({ id: 'notif_' + Date.now(), title, message, type, read: false, createdAt: new Date().toISOString() });
    if (window.notifications.length > 50) window.notifications = window.notifications.slice(0, 50);
    saveNotifications();
}

async function notifyUserAssigned(userId, title, message, type, link = null) {
    if (!userId || String(userId) === String(currentUser?.id)) return;
    try {
        const body = { userId: String(userId), title, message, type: type || 'info', createdBy: String(currentUser?.id || '') };
        if (link) body.link = link;
        await apiCall('notifications.php', 'POST', body);
    } catch (e) { console.warn('Erreur envoi notification:', e); }
}

async function toggleNotifDropdown() { /* Notifications désactivées */ }
function _notifDropdownClickOutside() { /* Notifications désactivées */ }
function renderNotificationsDropdown() {
    const list = document.getElementById('notifList');
    if (!list) return; /* Notifications désactivées */
    const unread = window.notifications.filter(n => !n.read);
    if (badge) {
        badge.textContent = unread.length;
        badge.style.display = unread.length > 0 ? 'flex' : 'none';
    }
    const footer = document.getElementById('notifFooter');
    if (footer) footer.style.display = 'none';
    if (notificationsLoadError) {
        list.innerHTML = `<div style="padding: 1.5rem; text-align: center;">
            <div style="color: #dc2626; font-size: 0.9rem; margin-bottom: 0.5rem;">Erreur de chargement</div>
            <button class="btn btn-secondary" onclick="loadNotifications().then(()=>renderNotificationsDropdown())" style="font-size: 0.85rem; margin-bottom: 0.5rem;">Réessayer</button>
            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem;">Si le problème persiste, exécutez api/update_db.php</div>
        </div>`;
        return;
    }
    if (footer) footer.style.display = window.notifications.length > 0 ? 'block' : 'none';
    if (window.notifications.length === 0) {
        list.innerHTML = '<div id="notifEmpty" style="padding: 1.5rem; text-align: center; color: #94a3b8; font-size: 0.9rem;">Aucune notification</div>';
        return;
    }
    list.innerHTML = window.notifications.slice(0, 20).map(n => {
        const time = n.createdAt ? new Date(n.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const unreadClass = !n.read ? ' unread' : '';
        const clickHandler = n.link ? `handleNotifClick('${n.id}')` : `markNotifRead('${n.id}')`;
        return `<div class="notif-item${unreadClass}" onclick="${clickHandler}" style="cursor: ${n.link ? 'pointer' : 'default'};" title="${n.link ? 'Cliquer pour ouvrir' : ''}">
            <div class="notif-item-title">${(n.title || '').replace(/</g, '&lt;')}</div>
            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">${(n.message || '').replace(/</g, '&lt;').substring(0, 80)}${(n.message || '').length > 80 ? '...' : ''}</div>
            <div class="notif-item-time">${time}</div>
        </div>`;
    }).join('');
}
function handleNotifClick(notifId) {
    const n = window.notifications.find(x => String(x.id) === String(notifId));
    if (!n) return;
    if (n.link) navigateFromNotification(n.link);
    markNotifRead(notifId);
    document.getElementById('notifDropdown')?.classList.remove('active');
}

function navigateFromNotification(link) {
    if (!link || !link.type) return;
    if (link.type === 'bureau_task') {
        openMyBureauPage();
    } else if (link.type === 'project' && link.projectId) {
        const p = getProjectById(link.projectId);
        if (p) {
            if (p.type === 'tournee' || !p.parentId) viewTournee(link.projectId);
            else viewSpectacle(link.projectId);
        }
    } else if (link.type === 'task' && link.projectId) {
        const p = getProjectById(link.projectId);
        if (p) {
            if (p.type === 'tournee' || !p.parentId) viewTournee(link.projectId);
            else viewSpectacle(link.projectId);
            if (typeof openProjectTasksPage === 'function' && link.taskId) {
                setTimeout(() => openProjectTasksPage(link.projectId), 300);
            }
        }
    } else if (link.type === 'spectacle_tech' && link.projectId) {
        if (typeof openTechPage === 'function') openTechPage(link.projectId);
    } else if (link.type === 'crm_task' && link.crmDealId) {
        if (typeof openCrmPage === 'function') openCrmPage();
        if (typeof openCrmDealFiche === 'function') setTimeout(function() { openCrmDealFiche(link.crmDealId); }, 300);
    }
}

function markNotifRead(notifId) {
    const n = window.notifications.find(x => String(x.id) === String(notifId));
    if (n) n.read = true;
    if (String(notifId).startsWith('api_')) {
        const id = parseInt(notifId.replace('api_', ''), 10);
        if (!isNaN(id)) apiCall('notifications.php', 'PUT', { id }).catch(() => {});
    }
    renderNotificationsDropdown();
}

async function deleteAllNotifications() {
    if (window.notifications.length === 0) return;
    if (!confirm('Supprimer toutes les notifications ?')) return;
    try {
        await apiCall('notifications.php', 'DELETE');
        window.notifications = [];
        renderNotificationsDropdown();
    } catch (e) {
        alert('Erreur : ' + (e.message || 'Impossible de supprimer'));
    }
}

