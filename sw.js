// Retire owns this Service Worker and its App Shell lifecycle.
// The stable cache name avoids coupling shell updates to a manually edited
// per-release cache string. Online navigations and shell assets revalidate
// against the canonical Retire deployment; the cache remains an offline
// fallback only.
const CACHE_NAME = 'retire-shell';
const OWNED_CACHE_PREFIXES = ['retire-shell', 'retire-v'];
const APP_SHELL = ['./', './index.html', './styles.css', './design-system/tokens.css', './design-system/components.css', './design-system/frontend.css', './src/main.js', './src/version.js', './src/navigation.js', './src/data.js', './src/calculation.js', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg', './sw.js'];

const isOwnedShellCache = (name) => OWNED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
const isShellRequest = (request) => request.mode === 'navigate' || ['script', 'style'].includes(request.destination);
const isCacheableResponse = (response) => response && response.ok && response.type === 'basic';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => isOwnedShellCache(name) && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (isShellRequest(request)) {
    const fresh = fetch(request, { cache: 'no-store' }).then((response) => {
      if (isCacheableResponse(response)) return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).then(() => response);
      return response;
    });
    event.respondWith(
      fresh.catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    fetch(request).then((response) => {
      if (isCacheableResponse(response)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
