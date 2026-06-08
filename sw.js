const SW_VERSION = 'abcotronics-pwa-v3-20260608';
const APP_CACHE = `${SW_VERSION}-app`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/messenger.webmanifest',
  '/messenger.html',
  '/job-card',
  '/jobcard',
  '/job-cards',
  '/index.html',
  '/fast-loader.js',
  '/dist/core-bundle.js',
  '/dist/styles.css',
  '/mobile-helper.js',
  '/mobile-responsive.css',
  '/dark-mode-fixes.css',
  '/job-card-public-mobile.css',
  '/node_modules/react/umd/react.production.min.js',
  '/node_modules/react-dom/umd/react-dom.production.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        await cache.addAll(PRECACHE_URLS);
      } catch (e) {
        console.warn('[sw] precache partial failure', e);
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const keep = new Set([APP_CACHE, RUNTIME_CACHE]);
      await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', event => {
  if (event?.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isAppShellNavigation(url, mode) {
  if (mode !== 'navigate') return false;
  return (
    url.pathname === '/job-card' ||
    url.pathname === '/jobcard' ||
    url.pathname === '/job-cards' ||
    url.pathname === '/messenger.html' ||
    url.pathname === '/'
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isAppShellNavigation(url, request.mode)) {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          const cache = await caches.open(APP_CACHE);
          if (network && network.ok) {
            await cache.put(request, network.clone());
          }
          return network;
        } catch {
          return (
            (await caches.match(request)) ||
            (await caches.match('/messenger.html')) ||
            (await caches.match('/job-card')) ||
            (await caches.match('/index.html'))
          );
        }
      })()
    );
    return;
  }

  const isStaticAsset = request.destination === 'script' || request.destination === 'style';
  if (!isStaticAsset) return;

  // Lazy-loaded UI modules under /dist/src/ must not be served stale from the SW cache
  // (e.g. POA Review after removing AI checkbox).
  if (url.pathname.startsWith('/dist/src/')) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request, { cache: 'no-store' });
        } catch {
          // Avoid unhandled promise rejections when offline or the origin is unreachable.
          const cached = await caches.match(request);
          if (cached) return cached;
          return Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const network = await fetch(request);
        if (network && network.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, network.clone());
        }
        return network;
      } catch {
        return caches.match(request);
      }
    })()
  );
});
