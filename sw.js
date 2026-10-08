/* UNIVIA service worker: uygulama kabuğu önbellekte; API yanıtları ağ öncelikli, ağ yoksa son kayıt.
   Uygulama ayrıca kendi IndexedDB önbelleğinde verileri TARİHİYLE tutar (son güncel veri gösterimi). */
const SHELL = 'univia-shell-v2', RUNTIME = 'univia-runtime-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; const u = new URL(req.url);
  if (u.origin === location.origin) { e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req))); return; }
  const isTile = /(tile\.openstreetmap\.org|basemaps\.cartocdn\.com|arcgisonline\.com)/.test(u.hostname), isImg = /upload\.wikimedia\.org/.test(u.hostname);
  if (isTile || isImg) { e.respondWith(caches.open(RUNTIME).then(async c => { const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; } catch (_) { return hit || Response.error(); } })); return; }
});
