const CACHE = "dispensa-v1";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => 
      c.addAll([
        "index.html",
        "app.js",
        "manifest.webmanifest",
        "icon.png"
      ])
    )
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request)
      .then(resp => resp || fetch(e.request))
  );
});