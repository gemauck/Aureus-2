const SW_VERSION = 'jobcard-offline-v6';
const APP_CACHE = `${SW_VERSION}-app`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const PRECACHE_URLS = [
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
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key.startsWith('jobcard-offline-') && key !== APP_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', event => {
  if (event?.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isJobCardNavigation(url, mode) {
  if (mode !== 'navigate') return false;
  return (
    url.pathname === '/job-card' ||
    url.pathname === '/jobcard' ||
    url.pathname === '/job-cards' ||
    url.pathname === '/'
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isJobCardNavigation(url, request.mode)) {
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
            (await caches.match('/job-card')) ||
            (await caches.match('/index.html'))
          );
        }
      })()
    );
    return;
  }

  // Only runtime-cache script/style assets required by the job-card shell.
  const isStaticAsset = request.destination === 'script' || request.destination === 'style';
  if (!isStaticAsset) return;

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
