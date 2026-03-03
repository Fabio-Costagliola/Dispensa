// sw.js — Dispensa PWA
// Caching statici + runtime, prompt aggiornamento (skipWaiting), versioning.

const VERSION = "1.3.4";
const CACHE_NAME = `dispensa-${VERSION}`;
const ASSETS = [
  "index.html",
  "app.js",
  "manifest.webmanifest",
  "icon.png"
  // Le dipendenze esterne (Tailwind CDN, html5-qrcode) verranno messe in cache a runtime
];

// Precache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Attiva nuova versione e pulisci i vecchi cache
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

// Messaggi dal client (es. SKIP_WAITING)
self.addEventListener("message", (event) => {
  const { type } = event.data || {};
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Strategia fetch:
// - Navigazioni (document): network-first con fallback a cache per offline
// - Asset statici same-origin (js/css/img): stale-while-revalidate
// - Chiamate Supabase: passa rete (no cache)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Non cache su Supabase o POST/PUT ecc.
  if (!req.method || req.method !== "GET" || url.hostname.includes("supabase.co")) {
    return; // lascia pass-through
  }

  if (req.mode === "navigate") {
    // Network-first per le pagine
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match("index.html");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Stale-while-revalidate per statici same-origin
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        const fetchPromise = fetch(req)
          .then(async (res) => {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || fetchPromise || Response.error();
      })()
    );
    return;
  }

  // Cross-origin (CDN): cache-first con revalidate best-effort
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) {
        // Aggiorna in background
        fetch(req).then(res => cache.put(req, res.clone())).catch(() => {});
        return cached;
      }
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return Response.error();
      }
    })()
  );
});
