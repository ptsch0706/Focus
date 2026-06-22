// Focus PWA Service Worker
// Strategy: NETWORK-FIRST. Always try to fetch the latest version from the
// network. Only fall back to a cached copy if the network request fails
// (i.e. genuinely offline). This means deploying a new version of index.html
// is picked up the next time the app is opened with any connectivity at all —
// no more deleting and reinstalling the PWA to see updates.
//
// Trade-off: this app is always network-first, so it does one fetch on every
// open when online (negligible for a file this size) in exchange for never
// getting stuck on a stale cached version.

const CACHE_NAME = 'focus-cache-v1';
// Bump CACHE_NAME (e.g. 'focus-cache-v2') only if you want to force a one-time
// purge of old cached files. Not required for normal updates, since this
// service worker is network-first and old cache entries get silently
// overwritten by fresh fetches whenever the user is online.

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './focusicon.PNG',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Best-effort precache. Don't block install if one of these fails
      // (e.g. firebase-config.js may not exist in every deployment).
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            /* ignore individual precache failures */
          })
        )
      );
    })
  );
  // Activate this new service worker immediately instead of waiting for
  // old tabs to close — we want updates to take effect right away.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of any already-open pages immediately.
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for our own origin. Let everything else
  // (Firestore, Google Fonts, cross-origin API calls) pass through untouched.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Network succeeded — use it, and update the cache in the background
        // so the offline fallback stays reasonably fresh too.
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone).catch(() => {});
        });
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline) — fall back to whatever we have cached.
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response(
            'Offline and no cached version available.',
            { status: 503, statusText: 'Offline' }
          );
        });
      })
  );
});
