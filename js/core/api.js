// Fonction helper pour les appels API
async function apiCall(endpoint, method = 'GET', body = null) {
    // Vérifier qu'on a un token avant de faire l'appel
    if (!authToken) {
        console.error('apiCall: ERREUR - Pas de token d\'authentification !', { endpoint, method });
        throw new Error('Non authentifié');
    }
    
    console.log('apiCall: Appel à', endpoint, 'avec token', authToken.substring(0, 20) + '...');
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Auth-Token': authToken  // Header alternatif au cas où Authorization ne fonctionne pas
    };
    
    // Debug: vérifier que le header est bien défini
    console.log('apiCall: Headers envoyés:', {
        'Content-Type': headers['Content-Type'],
        'Authorization': headers['Authorization'].substring(0, 30) + '...',
        'X-Auth-Token': headers['X-Auth-Token'].substring(0, 30) + '...'
    });
    
    const options = {
        method,
        headers
    };
    
    // Ajouter le token dans le body aussi (pour compatibilité maximale)
    if (body) {
        body.token = authToken; // Ajouter le token dans le body
        options.body = JSON.stringify(body);
    } else if (method === 'GET') {
        // Pour les requêtes GET, ajouter le token en paramètre URL
        // (pas idéal mais fonctionne toujours)
        const separator = endpoint.includes('?') ? '&' : '?';
        endpoint = `${endpoint}${separator}token=${encodeURIComponent(authToken)}`;
    }
    
    console.log('apiCall: URL finale:', `${API_URL}/${endpoint}`);
    const response = await fetch(`${API_URL}/${endpoint}`, options);
    
    // Gérer les erreurs HTTP avant de parser le JSON
    if (!response.ok) {
        let errorText;
        try {
            errorText = await response.text();
        } catch (e) {
            errorText = `Erreur HTTP ${response.status}: ${response.statusText}`;
        }
        
        console.error('apiCall: Erreur HTTP', {
            status: response.status,
            statusText: response.statusText,
            endpoint: endpoint,
            errorText: errorText.substring(0, 500) // Limiter la taille du log
        });
        
        if (response.status === 401) {
            // Token expiré ou invalide, nettoyer et déconnecter
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('userPermissions');
            authToken = null;
            currentUser = null;
            userPermissions = {};
            showLogin();
            throw new Error('Session expirée');
        }
        
        let data;
        try {
            data = JSON.parse(errorText);
        } catch (e) {
            data = { error: errorText || `Erreur HTTP ${response.status}` };
        }
        
        const errorMessage = data.error || `Erreur HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
    }
    
    // Parser la réponse JSON
    let data;
    try {
        const responseText = await response.text();
        if (!responseText) {
            throw new Error('Réponse vide du serveur');
        }
        data = JSON.parse(responseText);
    } catch (e) {
        console.error('apiCall: Erreur parsing JSON:', e);
        throw new Error('Réponse invalide du serveur');
    }
    
    if (!data.success && data.error) {
        throw new Error(data.error);
    }
    
    return data;
}

// Upload fichier (photo/PDF) — utilisé par compta, notes de frais, etc.
async function uploadFile(file, type = 'documents') {
    if (!authToken) throw new Error('Non authentifié');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('token', authToken);
    const response = await fetch(`${API_URL}/upload.php`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + authToken, 'X-Auth-Token': authToken },
        body: formData
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur upload: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    if (!data.success || !data.file_id) throw new Error(data.error || 'Réponse invalide');
    return {
        name: file.name,
        file_id: data.file_id,
        url: getDownloadFileUrl(data.file_id),
        downloadUrl: getDownloadFileUrl(data.file_id),
        stored_externally: true,
        fileName: data.original_name || file.name,
        fileType: data.mime_type || file.type || 'application/octet-stream',
        fileSize: data.size || file.size
    };
}

function getSessionAuthToken() {
    if (typeof authToken !== 'undefined' && authToken) return authToken;
    try {
        return localStorage.getItem('authToken') || '';
    } catch (e) {
        return '';
    }
}
window.getSessionAuthToken = getSessionAuthToken;

function extractUploadFileId(urlOrId) {
    if (!urlOrId) return null;
    if (typeof urlOrId === 'string' && urlOrId.indexOf('download.php') === -1 && urlOrId.indexOf('/') === -1) {
        return urlOrId;
    }
    var m = String(urlOrId).match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

function getDownloadFileUrl(fileId) {
    if (!fileId) return null;
    var base = typeof API_URL !== 'undefined' ? API_URL : 'api';
    var url = base + '/download.php?id=' + encodeURIComponent(fileId);
    var token = getSessionAuthToken();
    if (token) {
        url += '&auth=' + encodeURIComponent(token);
    }
    return url;
}
window.getDownloadFileUrl = getDownloadFileUrl;

async function openUploadedFile(fileId, opts) {
    opts = opts || {};
    if (!fileId) {
        alert('Fichier inaccessible');
        return;
    }
    var name = opts.name || opts.fileName || 'fichier';
    var type = opts.type || opts.fileType || opts.mimeType || '';
    var token = getSessionAuthToken();
    if (!token) {
        alert('Session expirée — reconnectez-vous.');
        return;
    }
    var base = typeof API_URL !== 'undefined' ? API_URL : 'api';
    var formData = new FormData();
    formData.append('id', fileId);
    formData.append('token', token);
    try {
        var res = await fetch(base + '/download.php', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'X-Auth-Token': token },
            body: formData
        });
        if (!res.ok) {
            var msg = 'Impossible d\'ouvrir le fichier';
            try {
                var err = await res.json();
                if (err && err.error) msg = err.error;
            } catch (e) { /* ignore */ }
            alert(msg);
            return;
        }
        var blob = await res.blob();
        var blobUrl = URL.createObjectURL(blob);
        if (opts.download) {
            var a = document.createElement('a');
            a.href = blobUrl;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            return;
        }
        if (typeof openAttachmentPreview === 'function' && type && (type.startsWith('image/') || type === 'application/pdf')) {
            openAttachmentPreview(blobUrl, name, type);
            return;
        }
        window.open(blobUrl, '_blank', 'noopener');
    } catch (e) {
        console.error('openUploadedFile:', e);
        var fallback = getDownloadFileUrl(fileId);
        if (fallback) window.open(fallback, '_blank', 'noopener');
        else alert('Impossible d\'ouvrir le fichier');
    }
}
window.openUploadedFile = openUploadedFile;

/** URL affichable (img/a) pour un fichier uploadé — ajoute le token de session si nécessaire */
function resolveMediaUrl(url, fileId) {
    if (fileId && typeof getDownloadFileUrl === 'function') {
        return getDownloadFileUrl(fileId);
    }
    if (url && typeof url === 'string' && url.indexOf('download.php') !== -1) {
        var m = url.match(/[?&]id=([^&]+)/);
        if (m && typeof getDownloadFileUrl === 'function') {
            return getDownloadFileUrl(decodeURIComponent(m[1]));
        }
    }
    return url || '';
}
window.resolveMediaUrl = resolveMediaUrl;

/** Met en cache le logo en data URL pour la page de connexion (sans token dans l'URL) */
async function cacheLogoForLoginDisplay(fileId, fallbackUrl) {
    var resolved = resolveMediaUrl(fallbackUrl, fileId);
    if (!resolved) return;
    if (resolved.indexOf('data:') === 0) {
        try { localStorage.setItem('appLogo', resolved); } catch (e) {}
        return;
    }
    if (resolved.indexOf('download.php') === -1) {
        try { localStorage.setItem('appLogo', resolved); } catch (e) {}
        return;
    }
    if (typeof authToken === 'undefined' || !authToken) return;
    try {
        var res = await fetch(resolved, {
            headers: { 'Authorization': 'Bearer ' + authToken, 'X-Auth-Token': authToken }
        });
        if (!res.ok) return;
        var blob = await res.blob();
        var reader = new FileReader();
        reader.onload = function() {
            try { localStorage.setItem('appLogo', reader.result); } catch (e) {}
        };
        reader.readAsDataURL(blob);
    } catch (e) {
        console.warn('cacheLogoForLoginDisplay:', e);
    }
}
window.cacheLogoForLoginDisplay = cacheLogoForLoginDisplay;

/** Charge logo + nom app depuis le serveur (fonctionne sans localStorage / navigation privée) */
async function loadLoginBranding() {
    var base = typeof API_URL !== 'undefined' ? API_URL : 'api';
    try {
        var res = await fetch(base + '/branding.php', { cache: 'no-store' });
        if (!res.ok) return;
        var data = await res.json();
        if (!data || !data.success) return;

        var logoSrc = data.logo_data || null;
        if (!logoSrc && data.logo_url) {
            logoSrc = data.logo_url.indexOf('http') === 0 || data.logo_url.indexOf('data:') === 0
                ? data.logo_url
                : base + '/' + data.logo_url.replace(/^\/?api\//, '');
        }

        var headerLogoEl = document.getElementById('mainHeaderLogo');
        if (headerLogoEl) {
            headerLogoEl.innerHTML = logoSrc
                ? '<img src="' + logoSrc + '" alt="Logo">'
                : '';
        }

        if (data.app_name) {
            document.title = data.app_name;
            try { localStorage.setItem('appName', data.app_name); } catch (e) {}
        }
        if (logoSrc) {
            try { localStorage.setItem('appLogo', logoSrc); } catch (e) {}
            var favicon = document.getElementById('dynamicFavicon');
            if (favicon) favicon.href = logoSrc;
        }
    } catch (e) {
        console.warn('loadLoginBranding:', e);
        var cachedLogo = null;
        try { cachedLogo = localStorage.getItem('appLogo'); } catch (err) {}
        var el = document.getElementById('mainHeaderLogo');
        if (el && cachedLogo) {
            el.innerHTML = '<img src="' + cachedLogo + '" alt="Logo">';
        }
    }
}
window.loadLoginBranding = loadLoginBranding;

function getWorkspaceFileUrl(elementOrId, options) {
    options = options || {};
    var id = (elementOrId && typeof elementOrId === 'object') ? elementOrId.id : elementOrId;
    if (!id) return null;
    var base = typeof API_URL !== 'undefined' ? API_URL : 'api';
    var url = base + '/workspace_file.php?id=' + encodeURIComponent(id);
    if (options.download) url += '&download=1';
    if (typeof authToken !== 'undefined' && authToken) {
        url += '&token=' + encodeURIComponent(authToken);
    }
    return url;
}
window.getWorkspaceFileUrl = getWorkspaceFileUrl;
