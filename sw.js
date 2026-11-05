// Network-first for source assets prevents stale versions during development.
const CACHE='morse-composer-v0.5.3';
const ASSETS=['./','./index.html','./icon.svg','./manifest.webmanifest','./styles/tokens.css','./styles/compose.css','./styles/layout.css','./styles/listen.css',
'./js/app.js','./js/navigation.js','./js/core/morse.js','./js/core/message.js','./js/core/tempo.js','./js/core/intent.js','./js/core/decoder.js',
'./js/compose/compose-controller.js','./js/compose/illumination.js','./js/audio/synthesis.js','./js/audio/playback-timeline.js',
'./js/storage/storage.js','./js/storage/event-log.js','./js/listen/listen-controller.js','./js/listen/audio-import.js','./js/listen/audio-player.js','./js/listen/selection.js','./js/listen/listening-speed.js','./js/listen/visualization.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin)e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
