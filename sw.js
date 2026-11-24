// Makes the app work offline after the first visit. Your data stays in this device's storage.
const CACHE = 'exam-pass-v11';
const SHELL = ['./', './index.html', './app.js', './logic.js', './questions.js', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isShell = url.origin === location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!isShell && !isFont) return;
  if (url.pathname.includes('/library/files/')) return; // scrambled files: the app saves the unscrambled copy itself
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isFont) { const hit = await cache.match(req); if (hit) return hit; }
    try {
      // App files skip the browser's short-term cache so updates show up on the next open.
      const res = await fetch(isShell ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('./index.html');
      throw err;
    }
  })());
});
