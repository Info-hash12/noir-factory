// NOIR FACTORY SERVICE WORKER v3 — Network-first strategy
// Forces fresh content on every load, caches only as offline fallback

const CACHE_NAME = 'noir-factory-v3';

self.addEventListener('install', (event) => {
  // Skip waiting — activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete ALL old caches on activate
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Everything else: NETWORK FIRST, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache the fresh response for offline use
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
