/* Composition — service worker
  Network-first for the app shell so installed clients receive site updates
  while the tracker still opens offline.
   Nothing medical is cached beyond the user's own device. */

const CACHE = 'composition-v26';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/maskable.svg',
  './js/main.js',

  /* Plumbing shared by everything. */
  './js/core/constants.js',
  './js/core/dom.js',
  './js/core/events.js',
  './js/core/format.js',
  './js/core/metrics.js',
  './js/core/router.js',
  './js/core/settings.js',
  './js/core/shell.js',
  './js/core/theme.js',

  /* The readings themselves, and where they are kept. */
  './js/data/store.js',
  './js/data/sync.js',
  './js/data/export.js',

  /* Everything that talks to a system we do not own. */
  './js/services/auth.js',
  './js/services/ocr.js',
  './js/services/report-url.js',
  './js/services/share.js',

  /* The add-a-reading flow. */
  './js/ingest/capture.js',
  './js/ingest/review.js',
  './js/ingest/scanfan.js',

  './js/components/chart.js',
  './js/components/chip.js',
  './js/components/tile.js',
  './js/components/wheel.js',

  './js/pages/dashboard.js',
  './js/pages/trends.js',
  './js/pages/history.js',
  './js/pages/detail.js',
  './js/pages/settings.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API traffic: Supabase auth, the OCR proxy, or Gemini.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/functions/') !== -1) return;
  if (url.pathname.indexOf('/rest/') !== -1) return;
  if (url.pathname.indexOf('/auth/') !== -1) return;
  // Never cache the share inbox: a shared report is read once, then deleted.
  if (url.pathname.indexOf('/share/') !== -1) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || Response.error()))
  );
});
