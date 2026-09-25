const CACHE = 'retire-v0.5.0';
const ASSETS = ['./', './index.html', './styles.css', './src/main.js', './src/navigation.js', './src/data.js', './src/calculation.js', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg', './sw.js'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))));
self.addEventListener('fetch', (event) => event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))));
