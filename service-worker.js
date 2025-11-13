const CACHE_NAME = "salud-escolar-cache-v1";
const urlsToCache = [
  "/salud-escolar/",
  "/salud-escolar/index.html",
  "/salud-escolar/manifest.json",
  "/salud-escolar/icon-192.png",
  "/salud-escolar/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
