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

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────────
// Adapted from a proven working implementation (same pattern used by another
// PWA's push backend). Handles incoming Web Push messages from the Focus
// Cloudflare Worker backend — see SETUP-NOTIFICATIONS.md.

// Push event: fires when the push service delivers a notification to this device.
// Payload format (sent by the Cloudflare Worker): { title, body, tag, url, data }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data = { title: 'Focus', body: event.data?.text() || '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Focus', {
      body: data.body || '',
      icon: data.icon || './focusicon.PNG',
      badge: data.badge || './focusicon.PNG',
      tag: data.tag, // de-dupes / replaces previous notif with same tag
      data: { url: data.url || './', ...(data.data || {}) },
      requireInteraction: false,
      vibrate: [80, 40, 80], // iOS ignores; harmless elsewhere
    })
  );
});

// Notification tap: focus the existing PWA window or open one.
//
// iOS quirk: openWindow() with a relative URL or a URL without the full PWA scope
// can launch Safari instead of the installed PWA. To force iOS to use the installed
// PWA we resolve the target URL against the SW's REGISTRATION scope (the PWA's
// origin) and ensure it's a full absolute URL pointing INSIDE that scope.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || './';

  let targetUrl;
  try {
    // self.registration.scope is the URL the SW was registered at, e.g.
    // "https://yourname.github.io/focus/". Resolving relative URLs against it
    // produces a URL inside the PWA's controlled area, which iOS recognizes
    // as the installed PWA's launch URL.
    targetUrl = new URL(rawUrl, self.registration.scope).href;
  } catch (e) {
    targetUrl = self.registration.scope;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Prefer focusing an existing PWA window over opening a new one
      const scopeOrigin = new URL(self.registration.scope).origin;
      const existing = wins.find((w) => w.url.startsWith(scopeOrigin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'notif-open', url: targetUrl, data: event.notification.data });
        return;
      }
      // No window open — launch a new one. Pass the full absolute URL so iOS
      // resolves it to the installed PWA rather than opening Safari.
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Diagnostic message channel from the page (e.g. "what version are you running").
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'sw-version') {
    event.source?.postMessage({ type: 'sw-version-reply', version: CACHE_NAME });
  }
});
