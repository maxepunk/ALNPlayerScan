// Service Worker for ALN Memory Scanner
// Version 1.0.0 - Update this when making changes

const CACHE_NAME = 'aln-scanner-v1.1';  // Updated for orchestrator integration
const APP_SHELL = [
  './',
  './index.html',
  './config.html',  // Orchestrator configuration page
  './manifest.json',
  './tokens.json',
  './assets/images/placeholder.jpg',
  './js/orchestratorIntegration.js'  // Orchestrator client
];

const EXTERNAL_RESOURCES = [
  'https://unpkg.com/qr-scanner@1.4.2/qr-scanner.umd.min.js',
  'https://unpkg.com/qr-scanner@1.4.2/qr-scanner-worker.min.js'
];

// Install event - cache app shell
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        
        // Cache local resources
        return cache.addAll(APP_SHELL)
          .then(() => {
            // Try to cache external resources, but don't fail if they're unavailable
            return Promise.allSettled(
              EXTERNAL_RESOURCES.map(url => 
                cache.add(url).catch(err => 
                  console.log(`[Service Worker] Failed to cache ${url}:`, err)
                )
              )
            );
          });
      })
      .catch(err => {
        console.error('[Service Worker] Cache install error:', err);
      })
  );
  
  // Force the service worker to become active immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activated');
    })
  );
  
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle orchestrator API requests (network-first strategy)
  if (url.href.includes('/api/') || url.href.includes(':3000')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Return offline response for orchestrator APIs
          return new Response(
            JSON.stringify({
              status: 'offline',
              message: 'Orchestrator not available'
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // Handle app requests
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached version
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        return fetch(request)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200) {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Cache successful responses for images and audio
            if (request.url.includes('/assets/images/') || 
                request.url.includes('/assets/audio/')) {
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(request, responseToCache);
                })
                .catch(err => {
                  console.error('[Service Worker] Cache put error:', err);
                });
            }
            
            return response;
          })
          .catch(err => {
            console.error('[Service Worker] Fetch error:', err);
            
            // Offline fallbacks
            if (request.destination === 'image') {
              // Return placeholder image for failed image requests
              return caches.match('./assets/images/placeholder.jpg');
            }
            
            // For HTML requests, return the cached index.html
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // For JSON requests, return an offline response
            if (request.url.endsWith('.json')) {
              return new Response(
                JSON.stringify({ 
                  error: 'offline',
                  message: 'Content not available offline' 
                }),
                {
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            }
          });
      })
  );
});

// Handle messages from the main app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_ASSETS') {
    // Cache additional assets on demand
    const assets = event.data.assets;
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all(
          assets.map(asset => 
            cache.add(asset).catch(err => 
              console.log(`Failed to cache ${asset}:`, err)
            )
          )
        );
      });
  }
});

// Background sync for offline token scanning
self.addEventListener('sync', event => {
  if (event.tag === 'sync-tokens') {
    event.waitUntil(syncTokens());
  }
});

async function syncTokens() {
  try {
    // Get any pending scans from IndexedDB or localStorage
    const clients = await self.clients.matchAll();
    
    // Notify all clients that sync is complete
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        message: 'Tokens synchronized'
      });
    });
    
    console.log('[Service Worker] Tokens synced');
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
  }
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-tokens') {
    event.waitUntil(updateTokenDatabase());
  }
});

async function updateTokenDatabase() {
  try {
    // Fetch latest tokens.json
    const response = await fetch('./tokens.json');
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('./tokens.json', response);
      console.log('[Service Worker] Token database updated');
    }
  } catch (error) {
    console.error('[Service Worker] Update failed:', error);
  }
}

// Log service worker version
console.log('[Service Worker] Version 1.0.0 loaded');