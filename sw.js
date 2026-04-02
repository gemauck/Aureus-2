/**
 * Service worker stub — previous versions intercepted all same-origin GET requests,
 * which could serve stale or bad cached responses and break React / core-bundle loading.
 *
 * This file remains so existing registrations update cleanly. It performs cache cleanup
 * only; it does NOT register a fetch handler (all requests use normal browser + HTTP cache).
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter(key => typeof key === 'string' && key.includes('jobcard-offline'))
            .map(key => caches.delete(key))
        );
      } catch {
        /* ignore */
      }
      await self.clients.claim();
    })()
  );
});

// Intentionally no 'fetch' listener.
