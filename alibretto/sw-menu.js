// =====================================================================
// Á LIBRETTO — Service Worker
// =====================================================================
// De ce s-a stricat înainte, probabil:
//   1. Fără self.skipWaiting() + clients.claim(), un SW nou instalat nu
//      preia controlul decât la a DOUA încărcare a paginii. Asta explică
//      exact "merge prima dată, se strică la refresh" — la refresh,
//      SW-ul (posibil cu bug) intră în joc pentru prima dată.
//   2. Dacă un fetch eșuează (ex. o imagine care încă nu există pe server)
//      și răspunsul e totuși pus în cache, browserul va servi acel eșec
//      la nesfârșit, chiar dacă imaginea există ulterior.
//   3. Cache "stale" (vechi) fără versionare = conținut vechi/rupt servit
//      la infinit, în loc de conținutul nou de pe server.
//
// Strategia de mai jos rezolvă toate trei:
//   - HTML și menu.json => network-first (mereu proaspăt; cache doar ca
//     rezervă pentru offline).
//   - Imagini/manifest/icons => cache-first, dar cu fallback la rețea și
//     FĂRĂ să cache-uiască vreodată un răspuns eșuat/non-200.
//   - Preia controlul imediat, fără să fie nevoie de refresh dublu.
// =====================================================================

const CACHE_VERSION = 'alibretto-menu-v1';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Domenii externe (Supabase, fonturi, CDN-uri) NU se ating niciodată —
// mereu trec direct prin rețea, fără cache, fără interceptare.
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'supabase.in',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net'
];

function isNeverCache(url) {
  try {
    const u = new URL(url);
    return NEVER_CACHE_HOSTS.some(h => u.hostname.includes(h));
  } catch (e) {
    return false;
  }
}

// Instalare: nu blocăm pe un precache mare (poate eșua dacă lipsește un
// fișier) — doar activăm imediat noul worker.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activare: ștergem cache-urile vechi (din versiuni anterioare) și
// preluăm controlul TUTUROR taburilor deschise, fără refresh dublu.
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

  // Doar GET; doar same-origin sau host-uri permise (nu Supabase/CDN-uri)
  if (req.method !== 'GET' || isNeverCache(req.url)) return;

  const url = new URL(req.url);
  const isNavigation = req.mode === 'navigate' || (req.destination === 'document');
  const isMenuJson = url.pathname.endsWith('menu.json');
  const isImage = req.destination === 'image' || /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname);

  if (isNavigation || isMenuJson) {
    // NETWORK-FIRST: mereu încercăm rețeaua întâi (conținut proaspăt).
    // Cache-uim rezultatul bun ca rezervă pentru offline; dacă rețeaua
    // pică, servim ultima variantă bună din cache.
    event.respondWith(networkFirst(req));
    return;
  }

  if (isImage) {
    // CACHE-FIRST cu fallback la rețea, dar NU cache-uim niciodată un
    // răspuns eșuat (404, opac-eroare etc.) — altfel rămâne "spart" pt totdeauna.
    event.respondWith(cacheFirstSafe(req));
    return;
  }

  // Restul (manifest.json, icons, css/js same-origin): cache-first simplu,
  // cu aceeași protecție de a nu cache-ui erori.
  event.respondWith(cacheFirstSafe(req));
});

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req);
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
    // Cache-uim DOAR răspunsuri reușite (200 same-origin, sau opaque
    // pentru resurse cross-origin permise). Niciodată erori.
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Nici cache, nici rețea — lăsăm browserul să arate eroarea normal
    // (ex. onerror din <img> va prelua fallback-ul din HTML).
    throw err;
  }
}

// Permite paginii să forțeze un SW nou să preia controlul imediat,
// dacă vreodată vrei să faci un "hard refresh" programatic din aplicație.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
