// v2.3.1: network-first assets and versioned, complete offline cache.
// Only this app's old caches are removed on activation.
const CACHE = 'telegrapher-v2.3.1';
const ASSETS = ['./', './index.html', './icon.svg', './manifest.webmanifest', './styles/compose.css', './styles/foundation.css', './styles/layout.css', './styles/listen.css', './styles/receiver17.css', './styles/receiver18.css', './styles/telegrapher12.css', './styles/telegrapher13.css', './styles/telegrapher14.css', './styles/telegrapher16.css', './styles/telegrapher20.css', './styles/tokens.css', './js/app.js', './js/telegrapher-bundle.js', './js/audio/clean-morse.js', './js/audio/listening-transport.js', './js/audio/playback-timeline.js', './js/audio/sound-profiles.js', './js/audio/synthesis.js', './js/audio/time-stretch.js', './js/compose/backspace-model.js', './js/compose/compose-controller.js', './js/compose/message-naming.js', './js/compose/haptics.js', './js/compose/illumination.js', './js/core/decoder.js', './js/core/intent.js', './js/core/message.js', './js/core/morse.js', './js/core/tempo.js', './js/library-controller.js', './js/listen/celestial-layout.js', './js/listen/celestial-receiver.js', './js/listen/living-field.js', './js/listen/quiet-controller.js', './js/listen/receiver-scope.js', './js/listen/signal-analysis.js', './js/listen/signal-envelope.js', './js/navigation.js', './js/storage/event-log.js', './js/storage/library.js', './js/storage/storage.js', './js/workspace-shell.js'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('telegrapher-v') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request,{ignoreSearch:true})));
});
