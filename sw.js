// Bump this value on every deploy to avoid stale assets.
const CACHE_NAME = 'lco-gestion-v4-20260704-37';
const urlsToCache = [
    './index.html',
    './manifest.json'
];

// Installation
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Fetch - Network first, fallback to cache
// IMPORTANT: Ne pas mettre en cache les requêtes POST (API)
self.addEventListener('fetch', event => {
    // Ignorer les requêtes POST, PUT, DELETE (requêtes API)
    if (event.request.method !== 'GET') {
        // Laisser passer les requêtes non-GET sans interception
        return;
    }
    
    // Ignorer les requêtes vers l'API
    if (event.request.url.includes('/api/') || event.request.url.includes('.php')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Ne mettre en cache que les réponses valides
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, responseClone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// Activation - Nettoyage ancien cache
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// ========== PUSH NOTIFICATIONS ==========

// Store push_token received from the main thread
let pushToken = null;
let apiBase = '';

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'PUSH_CONFIG') {
        pushToken = event.data.pushToken;
        apiBase = event.data.apiBase || '';
    }
});

// IndexedDB helper to persist push_token across SW restarts
function getPushConfig() {
    return new Promise((resolve) => {
        if (pushToken && apiBase) {
            resolve({ pushToken, apiBase });
            return;
        }
        const req = indexedDB.open('pushConfig', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('config');
        req.onsuccess = () => {
            const tx = req.result.transaction('config', 'readonly');
            const store = tx.objectStore('config');
            const g = store.get('pushConfig');
            g.onsuccess = () => {
                if (g.result) {
                    pushToken = g.result.pushToken;
                    apiBase = g.result.apiBase;
                }
                resolve({ pushToken, apiBase });
            };
            g.onerror = () => resolve({ pushToken: null, apiBase: '' });
        };
        req.onerror = () => resolve({ pushToken: null, apiBase: '' });
    });
}

function savePushConfig(token, base) {
    pushToken = token;
    apiBase = base;
    const req = indexedDB.open('pushConfig', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('config');
    req.onsuccess = () => {
        const tx = req.result.transaction('config', 'readwrite');
        tx.objectStore('config').put({ pushToken: token, apiBase: base }, 'pushConfig');
    };
}

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SAVE_PUSH_CONFIG') {
        savePushConfig(event.data.pushToken, event.data.apiBase);
    }
});

self.addEventListener('push', event => {
    event.waitUntil(
        getPushConfig().then(config => {
            if (!config.pushToken || !config.apiBase) {
                return self.registration.showNotification('L&CO Gestion', {
                    body: 'Vous avez un nouveau message',
                    icon: './icons/icon-192.png',
                    tag: 'msg-generic',
                    renotify: true
                });
            }

            return fetch(`${config.apiBase}/push_check.php?push_token=${config.pushToken}`)
                .then(r => r.json())
                .then(data => {
                    if (!data.success || !data.hasUnread) return;

                    return self.registration.showNotification(
                        data.title || 'Nouveau message',
                        {
                            body: data.body || '',
                            icon: './icons/icon-192.png',
                            badge: './icons/icon-96.png',
                            tag: 'msg-' + data.convId,
                            renotify: true,
                            data: { convId: data.convId }
                        }
                    );
                })
                .catch(() => {
                    return self.registration.showNotification('L&CO Gestion', {
                        body: 'Vous avez un nouveau message',
                        icon: './icons/icon-192.png',
                        tag: 'msg-generic',
                        renotify: true
                    });
                });
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const convId = event.notification.data ? event.notification.data.convId : null;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if (client.url.includes('index.html') || client.url.endsWith('/')) {
                    client.focus();
                    client.postMessage({
                        type: 'OPEN_CONVERSATION',
                        convId: convId
                    });
                    return;
                }
            }
            const url = convId ? `./?openConv=${convId}` : './';
            return clients.openWindow(url);
        })
    );
});