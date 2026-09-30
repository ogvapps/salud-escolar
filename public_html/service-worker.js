const CACHE_NAME = "salud-escolar-v8";
const urlsToCache = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./diff-service.js",
  "./firebase-service.js",
  "./ui-service.js",
  "./report-service.js",
  "./utils.js",
  "./data.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("Caching app shell v8...");
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => {
        console.log("Deleting old cache:", key);
        return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);

  // No interceptar peticiones de Firebase Authentication ni Google APIs
  if (
    requestUrl.origin.includes('googleapis.com') ||
    requestUrl.origin.includes('firebase') ||
    requestUrl.origin.includes('gstatic.com') ||
    requestUrl.origin.includes('accounts.google.com')
  ) {
    return;
  }

  // Network-First para páginas HTML y scripts JS (para asegurar que siempre se cargue la última versión online)
  const isDocOrScript = event.request.mode === 'navigate' ||
                        event.request.destination === 'document' ||
                        event.request.destination === 'script' ||
                        event.request.url.endsWith('.html') ||
                        event.request.url.endsWith('.js');

  if (isDocOrScript) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            return cached || caches.match("./index.html");
          });
        })
    );
    return;
  }

  // Cache-first con fallback a red para otros recursos
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );
});
