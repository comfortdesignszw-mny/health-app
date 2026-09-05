const CACHE_NAME = 'comfort-health-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/dexie.min.js',
  '/js/db.js',
  '/js/health.js',
  '/js/ai.js',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache/intercept calls to the AI API or other cross-origin CDNs —
  // those need a live network round trip. Same-origin /api/* calls (the
  // Cloudflare Pages Function) are POSTs and must also bypass the cache,
  // since the Cache API only stores GET requests.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || req.method !== 'GET') {
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

// Stale-while-revalidate that ALWAYS resolves to a real Response.
// The previous version could resolve to `undefined` when nothing was
// cached and the network fetch failed — an invalid value for
// respondWith() that Chrome surfaces to the user as ERR_FAILED, which is
// exactly what breaks a freshly installed PWA launching at its start_url
// before that URL has ever been cached.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const networkFetch = fetch(req).then(response => {
    if (response && response.ok && response.type !== 'opaqueredirect') {
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);

  if (cached) {
    // Serve the cached copy immediately; let the network update run in the
    // background without blocking or rejecting this handler.
    networkFetch.catch(() => {});
    return cached;
  }

  const fresh = await networkFetch;
  if (fresh) return fresh;

  // Nothing cached and the network failed. For a page navigation, fall
  // back to the cached app shell so the installed app can still open.
  if (req.mode === 'navigate') {
    const shell = await cache.match('/index.html');
    if (shell) return shell;
  }

  return new Response('Offline and this resource is not cached yet.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}
