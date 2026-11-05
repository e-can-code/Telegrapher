// Network-first application shell for the browser edition. The Android build
// bundles the same assets locally and does not depend on this worker.
const CACHE = 'telegrapher-v1.5';
const ASSETS = [
  './', './index.html', './icon.svg', './manifest.webmanifest',
  './styles/tokens.css', './styles/compose.css', './styles/layout.css',
  './styles/foundation.css', './styles/telegrapher12.css', './styles/telegrapher13.css',
  './js/workspace-shell.js', './js/app.js', './js/library-controller.js',
  './js/listen/quiet-controller.js', './js/storage/library.js',
  './js/compose/compose-controller.js', './js/compose/haptics.js', './js/audio/synthesis.js'
];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
