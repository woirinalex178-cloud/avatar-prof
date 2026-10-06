// Appli installable : le site s'ouvre même avec un réseau faible (dernière version en cache)
const C = 'tdd-v21', SHELL = ['/', '/index.html', '/style.css', '/app.js', '/config.js', '/auth.js', '/game.js', '/legal.js', '/intro.js', '/critters.js', '/fx.js', '/guide.js', '/scan.js', '/recog.js', '/manifest.json', '/img/logo.webp', '/img/banner.webp', '/img/favicon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API, images, paiements : toujours en direct
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
