// Service Worker for caching critical resources
// Supports 300ms performance budget through intelligent caching

const CACHE_NAME = 'attendance-system-v1.0.2';
const STATIC_CACHE = 'attendance-system-static-v1.0.2';
const API_CACHE = 'attendance-system-api-v1.0.2';

// Resources to cache immediately on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/favicon.ico',
    // Add critical CSS/JS bundles here when available
];

// API endpoints to cache (with appropriate TTL)
const API_ENDPOINTS = [
    '/api/auth/me',
    '/api/attendance/dashboard',
    '/api/leaves/dashboard',
];

// Cache strategies
const CACHE_STRATEGIES = {
    // Network first for critical API calls
    NETWORK_FIRST: 'network-first',
    // Cache first for static assets
    CACHE_FIRST: 'cache-first',
    // Stale while revalidate for dashboard data
    STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
};

self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker');

    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE).then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),

            // Skip waiting to activate immediately
            self.skipWaiting()
        ])
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker');

    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE && cacheName !== API_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),

            // Take control of all clients
            self.clients.claim()
        ])
    );
});

function offlineResponse() {
    return new Response(JSON.stringify({ error: 'Network unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
    });
}

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Never intercept writes. respondWith(undefined) throws
    // "Failed to convert value to 'Response'" and breaks PATCH/POST.
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // API calls go to the network. Caching a subset must still return a Response.
    if (url.pathname.startsWith('/api/')) {
        if (API_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint))) {
            event.respondWith(handleApiRequest(request));
        }
        return;
    }

    if (STATIC_ASSETS.some(asset => url.pathname === asset)) {
        event.respondWith(handleStaticRequest(request));
        return;
    }

    event.respondWith(
        fetch(request).then((response) => response).catch(async () => {
            const cached = await caches.match(request);
            return cached || offlineResponse();
        })
    );
});

async function handleApiRequest(request) {
    const cache = await caches.open(API_CACHE);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            return cachedResponse;
        }
        return offlineResponse();
    }
}

async function handleStaticRequest(request) {
    const cache = await caches.open(STATIC_CACHE);

    // Try cache first
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('[SW] Failed to fetch static asset:', request.url);
        const cached = await cache.match(request);
        return cached || offlineResponse();
    }
}

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);

    if (event.tag === 'attendance-sync') {
        event.waitUntil(syncAttendanceData());
    }
});

async function syncAttendanceData() {
    // Implement offline attendance sync logic here
    console.log('[SW] Syncing attendance data');
}

// Handle push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    if (event.data) {
        const data = event.data.json();

        const options = {
            body: data.body,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            data: data.url,
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');

    event.notification.close();

    event.waitUntil(
        clients.openWindow(event.notification.data || '/')
    );
});