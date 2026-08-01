// CFO Personale — Service Worker
// Network-first for the app shell (index.html/manifest) so a new deploy is
// visible immediately instead of being stuck on a stale cached version;
// falls back to cache when offline. Static icons stay cache-first since
// they basically never change. Data itself lives in localStorage + Supabase,
// not here.
const CACHE_NAME = 'cfo-personale-v2';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
// Bump CACHE_NAME (v2, v3, ...) on every deploy that changes index.html so
// old clients don't keep serving a stale offline fallback forever.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

const SHELL_PATHS = new Set(['/', '/index.html', '/manifest.json']);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept Supabase API calls or cross-origin CDN calls — always go to network.
  if (url.origin !== self.location.origin) {
    return;
  }

  const isShell = req.mode === 'navigate' || SHELL_PATHS.has(url.pathname) || url.pathname.endsWith('/index.html');

  if (isShell) {
    // Network-first: always try to fetch the latest app shell; only fall
    // back to the cached copy when offline or the request fails.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static assets (icons, etc.) — instant load, refreshed in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
