(() => {
    if (typeof window === 'undefined') {
        return;
    }

    const subscribers = new Set();
    
    // Global navigation lock to prevent concurrent navigation calls
    let isNavigating = false;
    let navigationLockTimeout = null;
    let lastNavigationUrl = null;
    let pendingNavigationArgs = null;
    
    let lastNotifiedRoute = null;

    const sanitizeSegments = (segments = []) => {
        if (!Array.isArray(segments)) {
            return [];
        }
        return segments
            .filter(Boolean)
            .map((segment) => segment.toString().trim())
            .map((segment) => segment.replace(/\/+/g, '/'))
            .map((segment) => segment.replace(/^\//, '').replace(/\/$/, ''))
            .filter(Boolean);
    };

    const normalizePathname = (pathname) => {
        if (!pathname) {
            return '';
        }
        return pathname.replace(/\/+/g, '/');
    };

    const getSegmentsFromPath = (pathname = window.location.pathname) => {
        const normalized = normalizePathname(pathname);
        if (!normalized || normalized === '/') {
            return [];
        }
        return normalized
            .replace(/^\//, '')
            .split('/')
            .filter(Boolean)
            .map((seg) => String(seg).split('?')[0].split('&')[0].trim());
    };

    const buildPath = (page, segments = []) => {
        const sanitizedPage = (page || 'dashboard').replace(/^\//, '').replace(/\/$/, '');
        const sanitizedSegments = sanitizeSegments(segments);
        const combined = [sanitizedPage, ...sanitizedSegments].filter(Boolean);
        const rawPath = `/${combined.join('/')}`;
        if (rawPath.length > 1 && rawPath.endsWith('/')) {
            return rawPath.slice(0, -1);
        }
        return rawPath;
    };

    const buildSearch = (searchInput) => {
        if (searchInput === '' || searchInput === null || searchInput === undefined) {
            return '';
        }

        if (searchInput instanceof URLSearchParams) {
            const str = searchInput.toString();
            return str ? `?${str}` : '';
        }

        if (typeof searchInput === 'string') {
            if (!searchInput) {
                return '';
            }
            if (searchInput === '?') {
                return '';
            }
            return searchInput.startsWith('?') ? searchInput : `?${searchInput}`;
        }

        if (typeof searchInput === 'object') {
            const params = new URLSearchParams(searchInput);
            const str = params.toString();
            return str ? `?${str}` : '';
        }

        return '';
    };

    const buildHash = (hashInput) => {
        if (!hashInput) {
            return '';
        }
        if (hashInput === '#') {
            return '';
        }
        return hashInput.startsWith('#') ? hashInput : `#${hashInput}`;
    };

    const getRoute = () => {
        // First check hash-based routing (e.g., #/projects/{id}?params)
        const hash = window.location.hash || '';
        if (hash.startsWith('#/')) {
            // Parse hash-based route: #/projects/{id}?params
            const hashPath = hash.substring(2); // Remove '#/'
            const hashParts = hashPath.split('?');
            const hashPathname = hashParts[0] || '';
            const hashSegments = hashPathname.split('/').filter(Boolean);
            
            if (hashSegments.length > 0) {
                let page = hashSegments[0];
                // Map 'crm' to 'clients' for backward compatibility
                if (page === 'crm') {
                    page = 'clients';
                }
                
                // Parse query params from hash if present
                let search = new URLSearchParams(window.location.search || '');
                if (hashParts.length > 1) {
                    // Merge hash query params with regular search params
                    const hashParams = new URLSearchParams(hashParts[1]);
                    hashParams.forEach((value, key) => {
                        search.set(key, value);
                    });
                }
                
                return {
                    page,
                    segments: hashSegments.slice(1),
                    search: search,
                    hash: window.location.hash || ''
                };
            }
        }
        
        // Fallback to pathname-based routing
        const segments = getSegmentsFromPath();
        let page = segments[0] || 'dashboard';
        // Map 'crm' to 'clients' for backward compatibility
        if (page === 'crm') {
            page = 'clients';
        }
        return {
            page,
            segments: segments.slice(1),
            search: new URLSearchParams(window.location.search || ''),
            hash: window.location.hash || ''
        };
    };

    const notifySubscribers = () => {
        const route = getRoute();
        const routeKey = `${route?.page || 'dashboard'}-${JSON.stringify(route?.segments || [])}-${route?.search?.toString?.() || ''}-${route?.hash || ''}`;
        if (lastNotifiedRoute === routeKey) {
            return;
        }
        
        lastNotifiedRoute = routeKey;
        
        subscribers.forEach((callback) => {
            try {
                callback(route);
            } catch (error) {
                console.error('routeState subscriber error:', error);
            }
        });

        try {
            window.dispatchEvent(new CustomEvent('route:change', { detail: route }));
        } catch (error) {
            console.error('routeState dispatch error:', error);
        }
    };

    const navigate = ({
        page,
        segments = [],
        search,
        hash,
        replace = false,
        preserveSearch = true,
        preserveHash = true
    } = {}) => {
        const currentRoute = getRoute();
        const targetPage = page || currentRoute.page || 'dashboard';
        const targetSegments = sanitizeSegments(segments);
        const searchValue = search !== undefined ? search : (preserveSearch ? window.location.search : '');
        const hashValue = hash !== undefined ? hash : (preserveHash ? window.location.hash : '');

        const nextUrl = `${buildPath(targetPage, targetSegments)}${buildSearch(searchValue)}${buildHash(hashValue)}`;

        if (isNavigating) {
            if (nextUrl === lastNavigationUrl) {
                return;
            }
            pendingNavigationArgs = { page, segments, search, hash, replace, preserveSearch, preserveHash };
            return;
        }
        
        // Set navigation lock
        isNavigating = true;
        
        // Clear any existing timeout
        if (navigationLockTimeout) {
            clearTimeout(navigationLockTimeout);
        }
        
        lastNavigationUrl = nextUrl;
        
        // CRITICAL: Prevent infinite loops by checking if URL actually changed
        // Normalize URLs for comparison (remove trailing slashes, normalize query params)
        const normalizeUrl = (url) => {
            if (!url) return '';
            // Remove trailing slash (except for root)
            let normalized = url.replace(/\/+$/, '') || '/';
            // Normalize query params (sort them)
            if (normalized.includes('?')) {
                const [path, query] = normalized.split('?');
                if (query) {
                    const params = new URLSearchParams(query);
                    const sortedParams = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
                    const newParams = new URLSearchParams(sortedParams);
                    normalized = path + (newParams.toString() ? '?' + newParams.toString() : '');
                }
            }
            return normalized;
        };
        
        const currentUrl = normalizeUrl(window.location.pathname + window.location.search + window.location.hash);
        const normalizedNextUrl = normalizeUrl(nextUrl);
        
        if (normalizedNextUrl === currentUrl) {
            // URL hasn't changed, don't navigate (but still notify if route object changed)
            const routeChanged = 
                targetPage !== currentRoute.page ||
                JSON.stringify(targetSegments) !== JSON.stringify(currentRoute.segments);
            
            // Release lock immediately if no navigation needed
            isNavigating = false;
            lastNavigationUrl = null;
            
            if (routeChanged) {
                // Route object changed but URL is the same, just notify subscribers
                notifySubscribers();
            }
            return;
        }

        const method = replace ? 'replaceState' : 'pushState';

        try {
            window.history[method](
                {
                    page: targetPage,
                    segments: targetSegments
                },
                '',
                nextUrl
            );

            // Release lock after a delay to allow subscribers to process
            navigationLockTimeout = setTimeout(() => {
                isNavigating = false;
                lastNavigationUrl = null;
                const pending = pendingNavigationArgs;
                pendingNavigationArgs = null;
                if (pending) {
                    navigate(pending);
                }
            }, 120);

            notifySubscribers();
        } catch (error) {
            // Release lock on error
            isNavigating = false;
            lastNavigationUrl = null;
            pendingNavigationArgs = null;
            
            // Prevent stack overflow by catching navigation errors
            if (error.message && error.message.includes('Maximum call stack size exceeded')) {
                console.error('🚨 Navigation loop detected, preventing further navigation:', error);
                return;
            }
            throw error;
        }
    };

    const setSubpathForCurrentPage = (segments = [], options = {}) => {
        const route = getRoute();
        navigate({
            page: route.page,
            segments,
            ...options
        });
    };

    const setPageSubpath = (page, segments = [], options = {}) => {
        navigate({
            page,
            segments,
            ...options
        });
    };

    const subscribe = (callback) => {
        if (typeof callback !== 'function') {
            return () => {};
        }
        subscribers.add(callback);
        return () => {
            subscribers.delete(callback);
        };
    };

    window.addEventListener('popstate', () => {
        notifySubscribers();
    });

    if (!window.RouteState) {
        window.RouteState = {
            getRoute,
            navigate,
            setSubpathForCurrentPage,
            setPageSubpath,
            subscribe,
            buildPath
        };
    }
})();





