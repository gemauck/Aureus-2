const SW_VERSION = 'jobcard-offline-v1';
const APP_SHELL_CACHE = `${SW_VERSION}-app-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/job-card',
  '/jobcard',
  '/dist/styles.css',
  '/dist/core-bundle.js',
  '/fast-loader.js',
  '/mobile-helper.js',
  '/mobile-responsive.css',
  '/dark-mode-fixes.css',
  '/job-card-public-mobile.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const normalizeCacheKey = request => {
  const url = new URL(request.url);
  return `${url.origin}${url.pathname}`;
};

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          const copy = networkResponse.clone();
          caches.open(APP_SHELL_CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          return networkResponse;
        })
        .catch(async () => {
          const navCached =
            (await caches.match(request)) ||
            (await caches.match('/job-card')) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'));
          return navCached || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        const copy = networkResponse.clone();
        const key = normalizeCacheKey(request);
        caches.open(RUNTIME_CACHE).then(cache => cache.put(key, copy)).catch(() => {});
        return networkResponse;
      })
      .catch(async () => {
        const key = normalizeCacheKey(request);
        const cached = await caches.match(key);
        return cached || Response.error();
      })
  );
});
