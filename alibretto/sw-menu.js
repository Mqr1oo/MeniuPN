

const CACHE_VERSION = 'alibretto-menu-v2'; // <-- schimbă numărul la orice update viitor de logică
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'supabase.in',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'loremflickr.com',
  'maps.app.goo.gl'
];

function isNeverCache(url) {
  try {
    const u = new URL(url);
    return NEVER_CACHE_HOSTS.some(h => u.hostname.includes(h));
  } catch (e) {
    return false;
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('alibretto-') && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET' || isNeverCache(req.url)) return;

  const url = new URL(req.url);
  const isNavigation = req.mode === 'navigate' || req.destination === 'document';
  const isMenuJson = url.pathname.endsWith('menu.json');
  const isImage = req.destination === 'image' || /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname);

  if (isNavigation || isMenuJson) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isImage) {
    event.respondWith(cacheFirstSafe(req));
    return;
  }

  event.respondWith(cacheFirstSafe(req));
});

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirstSafe(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const fresh = await fetch(req);
    // Cache-uim STRICT doar răspunsuri reușite, same-origin (fresh.ok).
    // NU mai cache-uim "opaque" — un opaque poate ascunde un 404/500
    // de la un server extern și rămâne "spart" pentru totdeauna.
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    throw err;
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
