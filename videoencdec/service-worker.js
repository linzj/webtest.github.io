// Service Worker for Video Processor Web App
// Implements smart caching strategy for optimal performance

const CACHE_VERSION = 'v1';
const CACHE_NAME = `video-processor-${CACHE_VERSION}`;

// Assets that should be cached on install
const PRECACHE_ASSETS = [
  './', // Cache the root HTML
];

// Install event - precache essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching assets');
      return cache.addAll(PRECACHE_ASSETS).catch((error) => {
        console.warn('[Service Worker] Precaching failed (non-critical):', error);
        // Continue anyway - caching will happen on first fetch
      });
    }).then(() => {
      // Force the waiting service worker to become the active service worker
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      // Strategy 1: Cache-first for hashed JS files (immutable)
      // Files with content hash in name like: main.abc123.js, vendors.def456.js
      if (request.url.match(/\.[a-f0-9]{8,}\.(js|css)$/)) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          console.log('[Service Worker] Cache hit (immutable):', request.url);
          return cachedResponse;
        }

        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            const responseToCache = response.clone();
            cache.put(request, responseToCache);
            console.log('[Service Worker] Cached new asset:', request.url);
          }
          return response;
        } catch (error) {
          console.error('[Service Worker] Fetch failed:', request.url, error);
          throw error;
        }
      }

      // Strategy 2: Network-first for HTML (always check for updates)
      if (request.mode === 'navigate' || request.url.endsWith('.html')) {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            const responseToCache = response.clone();
            cache.put(request, responseToCache);
            console.log('[Service Worker] Updated HTML cache:', request.url);
          }
          return response;
        } catch (error) {
          // Network failed, try cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            console.log('[Service Worker] Network failed, serving cached HTML');
            return cachedResponse;
          }
          throw error;
        }
      }

      // Strategy 3: Stale-while-revalidate for other assets (bundle.js without hash)
      const cachedResponse = await caches.match(request);

      // Start fetching in background
      const fetchPromise = fetch(request).then(async (response) => {
        if (response && response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            const responseToCache = response.clone();
            await cache.put(request, responseToCache);
            console.log('[Service Worker] Background updated:', request.url);
          } catch (error) {
            console.warn('[Service Worker] Cache update failed:', request.url, error);
          }
        }
        return response;
      }).catch((error) => {
        console.warn('[Service Worker] Fetch failed:', request.url, error);
        // Network error, return cached version if available
        return cachedResponse;
      });

      // Return cached version immediately if available, update in background
      return cachedResponse || fetchPromise;
    })()
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING message');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CHECK_UPDATE') {
    console.log('[Service Worker] Checking for updates...');
    // Trigger update check
    self.registration.update();
  }
});
