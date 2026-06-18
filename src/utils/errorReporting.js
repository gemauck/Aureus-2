/**
 * Automatic web ERP error reporting — crashes, API failures, functionality issues.
 * Mirrors mobile-rn/src/services/errorReporting.ts; posts to /api/public/web-error-report.
 */
(function () {
    if (typeof window === 'undefined') return;

    const SECTION = 'web-erp';
    const PENDING_KEY = 'web_error_reports_pending_v1';
    const DEDUP_KEY = 'web_error_reports_dedup_v1';

    const MAX_BREADCRUMBS = 25;
    const MAX_PENDING = 40;
    const MAX_SESSION_REPORTS = 30;
    const META_STACK_MAX = 8000;

    /** @type {Array<{ ts: string, type: string, message: string, data?: object }>} */
    let breadcrumbs = [];
    let currentRoute = 'App';
    let sessionReportCount = 0;
    let flushInFlight = null;
    let initialized = false;

    function hashFingerprint(parts) {
        const raw = parts.join('|');
        let h = 0;
        for (let i = 0; i < raw.length; i++) {
            h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
        }
        return `fp_${Math.abs(h).toString(36)}`;
    }

    function stackTop(stack) {
        if (!stack) return '';
        return stack
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(' / ');
    }

    function inferCategory(context) {
        if (context === 'ErrorBoundary' || context === 'GlobalFatal' || context === 'UnhandledRejection') {
            return 'crash';
        }
        if (context.startsWith('api:')) return 'api';
        return 'functionality';
    }

    function inferSeverity(category, context, statusCode) {
        if (category === 'crash' || context === 'GlobalFatal' || context === 'ErrorBoundary') return 'high';
        if (category === 'api') {
            if (statusCode === 0) return 'low';
            if (!statusCode || statusCode >= 500) return 'high';
            if (statusCode === 401 || statusCode === 403) return 'low';
            if (statusCode >= 400) return 'medium';
            return 'medium';
        }
        if (context === 'authRefresh' || context === 'loadSession') return 'low';
        return 'medium';
    }

    function shouldSkipReport(context, statusCode, path) {
        if (context === 'webLogout') return true;
        if (context.startsWith('api:') && statusCode === 401) return true;
        if (context.startsWith('api:') && statusCode === 429) return true;
        const p = String(path || '');
        if (p.includes('/web-error-report') || p.includes('/feedback')) return true;
        if (p.includes('/users/heartbeat')) return true;
        if (p === '/auth/login' || p === '/login' || p.startsWith('/auth/')) return true;
        return false;
    }

    function collectBrowserContext() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            online: navigator.onLine,
            buildTag: document.querySelector('meta[name="build-tag"]')?.getAttribute('content') || undefined
        };
    }

    function getPageUrl() {
        return window.location.href || `web://${currentRoute}`;
    }

    function buildErrorMeta(error, context, extra) {
        const err = error instanceof Error ? error : new Error(String(error));
        const stack = typeof err.stack === 'string' ? err.stack.slice(0, META_STACK_MAX) : undefined;
        const category = inferCategory(context);

        return {
            source: SECTION,
            category,
            context,
            route: currentRoute,
            fingerprint: hashFingerprint([category, context, err.message, stackTop(stack)]),
            browser: collectBrowserContext(),
            error: {
                name: err.name,
                message: err.message,
                stack
            },
            ...(typeof extra?.componentStack === 'string'
                ? { componentStack: extra.componentStack.slice(0, 4000) }
                : {}),
            breadcrumbs: [...breadcrumbs],
            ...extra
        };
    }

    function formatReportMessage(category, context, message, extra) {
        const label =
            category === 'crash' ? 'Crash' : category === 'api' ? 'API error' : 'Functionality issue';
        const api = extra?.api;
        const apiBit =
            api?.method && api?.path
                ? ` — ${api.method} ${api.path}${api.statusCode ? ` (${api.statusCode})` : ''}`
                : '';
        return `[Web ERP — ${label}] ${message}\nContext: ${context}${apiBit}\nRoute: ${currentRoute}`;
    }

    function loadDedupMap() {
        try {
            const raw = sessionStorage.getItem(DEDUP_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    function saveDedupMap(map) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const pruned = {};
        for (const [key, entry] of Object.entries(map)) {
            if (entry?.at && entry.at >= cutoff) pruned[key] = entry;
        }
        try {
            sessionStorage.setItem(DEDUP_KEY, JSON.stringify(pruned));
        } catch {
            /* quota — non-fatal */
        }
    }

    function dedupCooldownMs(category, context) {
        if (category === 'crash') return 15 * 60 * 1000;
        if (category === 'api') return 60 * 60 * 1000;
        if (context === 'authRefresh') return 2 * 60 * 60 * 1000;
        return 30 * 60 * 1000;
    }

    function isDuplicate(fingerprint, category, context) {
        const map = loadDedupMap();
        const entry = map[fingerprint];
        if (!entry) return false;
        return Date.now() - entry.at < dedupCooldownMs(category, context);
    }

    function markReported(fingerprint) {
        const map = loadDedupMap();
        const prev = map[fingerprint];
        map[fingerprint] = { at: Date.now(), count: (prev?.count || 0) + 1 };
        saveDedupMap(map);
    }

    function loadPending() {
        try {
            const raw = localStorage.getItem(PENDING_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function savePending(items) {
        try {
            localStorage.setItem(PENDING_KEY, JSON.stringify(items.slice(-MAX_PENDING)));
        } catch {
            /* non-fatal */
        }
    }

    async function postReport(report) {
        try {
            const token = window.storage?.getToken?.() || null;
            const response = await fetch(`${window.location.origin}/api/public/web-error-report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    message: report.message,
                    pageUrl: report.pageUrl,
                    type: report.type,
                    severity: report.severity,
                    meta: report.meta
                })
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async function flushPendingReports() {
        if (flushInFlight) return flushInFlight;
        flushInFlight = (async () => {
            const pending = loadPending();
            if (!pending.length) return;

            const remaining = [];
            for (const item of pending) {
                const ok = await postReport(item);
                if (!ok) remaining.push(item);
            }
            savePending(remaining);
        })().finally(() => {
            flushInFlight = null;
        });
        return flushInFlight;
    }

    async function enqueueReport(report) {
        try {
            const ok = await postReport(report);
            if (ok) return;
        } catch {
            /* queue below */
        }
        const pending = loadPending();
        pending.push(report);
        savePending(pending);
    }

    async function reportError(error, context, extra) {
        try {
            const statusCode =
                typeof extra?.statusCode === 'number'
                    ? extra.statusCode
                    : typeof error?.statusCode === 'number'
                      ? error.statusCode
                      : undefined;
            const apiPath = extra?.api?.path;

            if (shouldSkipReport(context, statusCode, apiPath)) return;
            if (sessionReportCount >= MAX_SESSION_REPORTS) return;

            const err = error instanceof Error ? error : new Error(String(error));
            const category = inferCategory(context);
            const meta = buildErrorMeta(err, context, extra);
            const fingerprint = String(meta.fingerprint || hashFingerprint([category, context, err.message]));

            if (isDuplicate(fingerprint, category, context)) return;

            const severity = inferSeverity(category, context, statusCode);
            const report = {
                message: formatReportMessage(category, context, err.message, extra),
                pageUrl: getPageUrl(),
                type: 'bug',
                severity,
                meta,
                fingerprint,
                createdAt: new Date().toISOString()
            };

            sessionReportCount += 1;
            markReported(fingerprint);
            await enqueueReport(report);
            void flushPendingReports();
        } catch {
            /* never throw from reporter */
        }
    }

    function reportApiError(path, method, statusCode, message) {
        const ctx = `api:${method}:${path}`;
        addBreadcrumb('api', `${method} ${path} → ${statusCode}`, { path, method, statusCode });
        const error = Object.assign(new Error(message || `HTTP ${statusCode}`), { statusCode });
        void reportError(error, ctx, {
            api: { path, method, statusCode },
            statusCode
        });
    }

    function addBreadcrumb(type, message, data) {
        breadcrumbs.push({
            ts: new Date().toISOString(),
            type,
            message: String(message).slice(0, 500),
            ...(data ? { data } : {})
        });
        if (breadcrumbs.length > MAX_BREADCRUMBS) {
            breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
        }
    }

    function setErrorReportRoute(route) {
        const next = String(route || '').trim() || 'App';
        if (next === currentRoute) return;
        currentRoute = next;
        addBreadcrumb('navigation', `Route: ${next}`);
    }

    function initErrorReporting() {
        if (initialized) return;
        initialized = true;

        setErrorReportRoute(window.location.hash || window.location.pathname || 'App');

        window.addEventListener('hashchange', () => {
            setErrorReportRoute(window.location.hash || window.location.pathname || 'App');
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void flushPendingReports();
        });

        window.addEventListener('online', () => void flushPendingReports());

        if (window.routeState?.subscribe) {
            window.routeState.subscribe((route) => {
                const page = route?.page || route?.path || '';
                const segments = Array.isArray(route?.segments) ? route.segments.join('/') : '';
                const label = [page, segments].filter(Boolean).join('/') || window.location.hash || 'App';
                setErrorReportRoute(label);
            });
        }

        window.addEventListener('error', (event) => {
            const err = event.error || new Error(event.message || 'Script error');
            void reportError(err, 'GlobalFatal', {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            const err = reason instanceof Error ? reason : new Error(String(reason));
            void reportError(err, 'UnhandledRejection');
        });

        void flushPendingReports();
    }

    window.errorReporting = {
        initErrorReporting,
        reportError,
        reportApiError,
        addBreadcrumb,
        setErrorReportRoute,
        flushPendingReports
    };
})();
