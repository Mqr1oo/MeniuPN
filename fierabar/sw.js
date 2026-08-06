const CACHE_NAME = 'alibretto-cache-v4';

const urlsToCache = [
  './',
  './dashboard.html',
  './menu.json',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache Álibretto deschis cu succes');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// NETWORK-FIRST Strategy: Descarcă mereu de pe net pentru a avea ultima versiune.
// Folosește cache-ul doar dacă internetul a picat complet.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Dacă răspunsul e valid, actualizăm cache-ul invizibil în fundal
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, cacheCopy);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Dacă nu avem internet, returnăm versiunea din cache
        return caches.match(event.request);
      })
  );
});