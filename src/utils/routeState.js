(() => {
    if (typeof window === 'undefined') {
        return;
    }

    const subscribers = new Set();

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
        return normalized.replace(/^\//, '').split('/').filter(Boolean);
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
        const segments = getSegmentsFromPath();
        const page = segments[0] || 'dashboard';
        return {
            page,
            segments: segments.slice(1),
            search: new URLSearchParams(window.location.search || ''),
            hash: window.location.hash || ''
        };
    };

    const notifySubscribers = () => {
        const route = getRoute();
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
        const method = replace ? 'replaceState' : 'pushState';

        window.history[method](
            {
                page: targetPage,
                segments: targetSegments
            },
            '',
            nextUrl
        );

        notifySubscribers();
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


