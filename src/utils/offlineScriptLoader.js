// Offline-aware script loader utility
// Provides window.loadScriptWithOfflineFallback(path, options?)
// Attempts to fetch script from network; if offline, loads cached copy from localStorage.
// Scripts executed via inline <script> with sourceURL for debugging.
(function() {
    if (typeof window === 'undefined') {
        return;
    }

    const CACHE_PREFIX = 'offline-script::';

    function resolvePath(path) {
        if (!path) return '';
        if (/^https?:\/\//i.test(path)) return path;
        if (path.startsWith('//')) {
            return `${window.location.protocol}${path}`;
        }
        if (path.startsWith('./')) {
            return `${window.location.origin}${path.slice(1)}`;
        }
        if (path.startsWith('/')) {
            return `${window.location.origin}${path}`;
        }
        return `${window.location.origin}/${path}`;
    }

    function appendScript(code, cacheKey, sourceUrl) {
        if (!code) return;
        if (cacheKey && document.querySelector(`script[data-offline-cache-key="${cacheKey}"]`)) {
            return;
        }
        const script = document.createElement('script');
        script.type = 'text/javascript';
        if (cacheKey) {
            script.dataset.offlineCacheKey = cacheKey;
        }
        script.text = `${code}\n//# sourceURL=${sourceUrl}`;
        document.head.appendChild(script);
    }

    function loadScriptWithOfflineFallback(path, options = {}) {
        const resolvedUrl = resolvePath(path);
        const cacheKey = options.cacheKey || `${CACHE_PREFIX}${resolvedUrl}`;
        const preventDuplicate = document.querySelector(`script[data-offline-cache-key="${cacheKey}"]`);
        if (preventDuplicate) {
            return Promise.resolve('already-loaded');
        }

        const cacheData = () => {
            try {
                return JSON.parse(localStorage.getItem(cacheKey));
            } catch (error) {
                console.warn('⚠️ Offline script loader: failed to parse cache', cacheKey, error);
                return null;
            }
        };

        const storeCache = (text) => {
            try {
                localStorage.setItem(cacheKey, JSON.stringify({
                    text,
                    updatedAt: Date.now()
                }));
            } catch (error) {
                // Ignore quota errors
                console.warn('⚠️ Offline script loader: unable to store cache', cacheKey, error);
            }
        };

        const execute = (text) => appendScript(text, cacheKey, resolvedUrl);

        const cacheBust = options.cacheBust !== false;
        const fetchUrl = cacheBust
            ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_v=${options.version || Date.now()}`
            : resolvedUrl;

        return fetch(fetchUrl, { cache: 'no-store' })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok (${response.status})`);
                }
                const text = await response.text();
                storeCache(text);
                execute(text);
                return 'network';
            })
            .catch((error) => {
                console.warn('⚠️ Offline script loader: network failed, attempting cache', resolvedUrl, error);
                const cached = cacheData();
                if (cached && cached.text) {
                    execute(cached.text);
                    return 'cache';
                }
                throw error;
            });
    }

    window.loadScriptWithOfflineFallback = loadScriptWithOfflineFallback;
})();











