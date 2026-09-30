// طفّيها — offline support. App files: network first, cache as fallback. Fonts and CDN libraries: cache first.
const CACHE = 'tafiha-v8';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/craving.js', './js/share.js', './js/cigarette.js', './js/smoke.js', './js/assessment.js', './js/plan.js', './js/report.js', './js/merge.js', './js/sync.js', './js/config.js',
  './assets/cig-body.webp', './assets/cig-tip-out.webp', './assets/cig-tip-idle.webp', './assets/cig-tip-hot.webp',
  './assets/hero-vape.webp', './assets/icons/coins.webp', './assets/icons/pack.webp', './assets/icons/drop.webp', './assets/icons/heart.webp', './assets/icons/shield.webp', './assets/icons/gum.webp', './assets/icons/patch.webp', './assets/icons/target.webp',
  './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // fonts and the PDF libraries: cache first, so they work offline after the first use
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // always revalidate app files so an update shows up on the next open
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
});
