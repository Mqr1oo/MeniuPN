const CACHE_NAME = 'alibretto-cache-v5';

// Cai RELATIVE: aplicatia e servita dintr-un subfolder (/MeniuPN/alibretto/),
// iar caile absolute ('/dashboard') dadeau 404 -> cache.addAll pica -> service
// worker-ul nu se instala deloc si PWA-ul ramanea fara offline.
const urlsToCache = [
  './',
  './index.html',
  './dashboard.html',
  './menu.json',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Fiecare fisier separat: daca unul lipseste, instalarea continua.
      Promise.all(urlsToCache.map(url =>
        cache.add(url).catch(err => console.warn('SW: nu am putut pune in cache', url, err))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
      }))
    )
  );
  self.clients.claim();
});

// NETWORK-FIRST, doar pentru fisierele proprii.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Nu se pun NICIODATA in cache raspunsurile Supabase (comenzi, jurnal, sesiuni).
  // Altfel datele clientilor si ale personalului ramaneau stocate pe telefon.
  if (url.origin !== self.location.origin || url.hostname.endsWith('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheCopy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------------------------------------------------------------------------
// WEB PUSH
// Aici ajung notificarile trimise de Edge Function-ul `notifica-comanda`.
// Functioneaza si cu aplicatia inchisa complet, spre deosebire de vechea
// abordare care cerea ca pagina sa fie inca deschisa in fundal.
// ---------------------------------------------------------------------------

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }

  const title = d.title || '🛎️ Álibretto';
  const options = {
    body: d.body || 'Nuevo pedido',
    icon: './icons/icon-192.jpg',
    badge: './icons/icon-192.jpg',
    tag: d.tag || 'alibretto',
    renotify: true,              // suna din nou chiar daca exista deja una cu acelasi tag
    requireInteraction: true,    // ramane pe ecran pana o atinge cineva
    vibrate: [400, 200, 400, 200, 800],
    data: { url: d.url || './dashboard.html', comandaId: d.comandaId || null }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // daca dashboard-ul e deja deschis undeva, il aducem in fata
      for (const c of list) {
        if (c.url.includes('dashboard') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// Unele browsere invalideaza abonamentul periodic; il reinnoim tacut.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(sub => self.clients.matchAll().then(list =>
        list.forEach(c => c.postMessage({ tip: 'push-resubscribe', sub: sub.toJSON() }))
      ))
      .catch(() => {})
  );
});
