// طفّيها — offline support. App files (fonts included): network first, cache as fallback.
const CACHE = 'tafiha-v24';
const SHELL = [
  './', './index.html', './css/fonts.css', './css/app.css', './css/onboarding.css', './manifest.webmanifest',
  './assets/fonts/alexandria-arabic.woff2', './assets/fonts/alexandria-latin-ext.woff2', './assets/fonts/alexandria-latin.woff2', './assets/fonts/big-shoulders-display-latin-ext.woff2', './assets/fonts/big-shoulders-display-latin.woff2', './assets/fonts/readex-pro-arabic.woff2', './assets/fonts/readex-pro-latin-ext.woff2', './assets/fonts/readex-pro-latin.woff2',
  './js/account.js', './js/captcha.js', './js/content.js', './js/onboarding.js', './js/sb.js', './js/validate.js', './js/security.js', './js/vendor/supabase.js', './js/vendor/html2canvas.js', './js/vendor/jspdf.js',
  './js/app.js', './js/store.js', './js/craving.js', './js/share.js', './js/cigarette.js', './js/smoke.js', './js/assessment.js', './js/plan.js', './js/report.js', './js/merge.js', './js/sync.js', './js/config.js',
  './assets/cig-body.webp', './assets/cig-tip-out.webp', './assets/cig-tip-idle.webp', './assets/cig-tip-hot.webp',
  './assets/hero-vape.webp', './assets/icons/coins.webp', './assets/icons/pack.webp', './assets/icons/drop.webp', './assets/icons/heart.webp', './assets/icons/shield.webp', './assets/icons/gum.webp', './assets/icons/patch.webp', './assets/icons/target.webp',
  './assets/brand/tafiha-logo-transparent-dark.svg', './assets/brand/tafiha-logo-transparent-light.svg', './assets/brand/tafiha-icon-rounded.svg', './assets/brand/tafiha-mark-transparent-light.svg', './assets/brand/favicon.svg',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png', './assets/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => /^tafiha-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const allowed = new Set(SHELL.map((path) => new URL(path, self.registration.scope).href));
  // OAuth codes, unknown paths and query strings never enter the cache.
  if (url.search || !allowed.has(url.href)) return;
  // always revalidate app files so an update shows up on the next open
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
    }
    return res;
  }).catch(async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
    return Response.error();
  }));
});
