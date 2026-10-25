const CACHE_NAME = "bizpulse-shell-v11";
const SHELL_ASSETS = [
  "/offline.html",
  "/css/style.css",
  "/images/bizpulse-icon-192.png",
  "/images/bizpulse-icon-512.png",
  "/images/bizpulse-icon.svg",
  "/images/bizpulse-icon-maskable.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith("bizpulse-shell-") && cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offlinePage = await caches.match("/offline.html");
        if (offlinePage) return offlinePage;
        return new Response("You are offline. Reconnect to access BizPulse.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
    );
    return;
  }

  if (SHELL_ASSETS.includes(requestUrl.pathname)) {
    event.respondWith(
      caches.match(request).then(cachedResponse =>
        cachedResponse || fetch(request).then(response => {
          if (response.ok) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseCopy));
          }
          return response;
        })
      )
    );
  }
});
