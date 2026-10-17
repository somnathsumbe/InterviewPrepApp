
const APP_CACHE_NAME = 'interview-prep-v12';
const APP_SHELL = [
  './', './index.html', './manifest.json', './css/app.css', './css/themes.css', './css/responsive.css',
  './js/app.js', './js/config.js', './js/storage.js', './js/state.js', './js/router.js', './js/ui.js',
  './js/question-engine.js', './js/search.js', './js/speech.js', './js/statistics.js', './js/utils.js',
  './data/subjects.json', './data/html.json', './data/css.json', './data/bootstrap5.json', './data/scss.json',
  './data/tailwind-css.json', './data/advance-javascript.json', './data/es6.json', './data/json.json',
  './data/angular20.json', './data/react.json', './data/nextjs.json', './data/typescript.json',
  './data/rxjs-toolkit.json', './data/javascript-example.json', './data/nodejs.json', './data/mongodb.json',
  './data/hr.json', './data/core-javascript.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== APP_CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();
            caches.open(APP_CACHE_NAME).then((cache) => cache.put(request, responseCopy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response('Question data is unavailable offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(APP_CACHE_NAME).then((cache) => cache.put(request, responseCopy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
