// sw.js — caches the app shell on install, then serves from cache first.
// Bump CACHE_NAME whenever you deploy changes, so old caches don't serve stale files.
const CACHE_NAME = 'nosco-v6';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/app.js',
  'js/crypto.js',
  'js/storage.js',
  'js/ledger.js',
  'js/charts.js',
  'js/dossier.js',
  'js/nodemap.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
  'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            // Don't let one blocked/failed resource (e.g. a CDN script an ad-blocker stops)
            // sabotage the whole install — that's what left old versions stuck before.
            console.warn('Nosco SW: could not cache', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache anything same-origin we fetch along the way (e.g. new pages added later).
        if (event.request.method === 'GET' && response.ok && new URL(event.request.url).origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
