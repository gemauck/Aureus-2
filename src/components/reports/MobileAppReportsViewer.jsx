// Admin viewer for automatic mobile app crash and error reports
const { useState, useEffect } = React;

function parseMobileMeta(meta) {
    if (!meta) return null;
    try {
        return typeof meta === 'string' ? JSON.parse(meta) : meta;
    } catch {
        return null;
    }
}

function mobileCategoryLabel(category) {
    if (category === 'crash') return 'Crash';
    if (category === 'api') return 'API error';
    if (category === 'functionality') return 'Functionality';
    return category || 'Unknown';
}

function mobileCategoryClass(category, isDark) {
    if (category === 'crash') {
        return isDark ? 'bg-red-900/40 text-red-300 border-red-700' : 'bg-red-100 text-red-800 border-red-200';
    }
    if (category === 'api') {
        return isDark ? 'bg-amber-900/40 text-amber-300 border-amber-700' : 'bg-amber-100 text-amber-800 border-amber-200';
    }
    return isDark ? 'bg-blue-900/40 text-blue-300 border-blue-700' : 'bg-blue-100 text-blue-800 border-blue-200';
}

const MobileAppReportsViewer = (props = {}) => {
    const { scrollToFeedbackId = null } = props;
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);
    const [filter, setFilter] = useState({
        category: 'all',
        severity: 'all',
        status: 'open',
        search: ''
    });
    const { isDark } = window.useTheme();
    const { user } = window.useAuth();

    const isAdmin = ['admin', 'superadmin'].includes(user?.role?.toLowerCase() || '');

    const loadReports = async (opts = {}) => {
        const silent = opts?.silent === true;
        if (!silent) setLoading(true);
        try {
            const response = await window.api.getFeedback({
                section: 'mobile-app',
                includeUser: true
            });
            const data = response?.data || response || [];
            setReports(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load mobile app reports:', error);
            setReports([]);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) loadReports();
    }, [isAdmin]);

    useEffect(() => {
        if (!scrollToFeedbackId || !reports.length) return undefined;
        setExpandedId(scrollToFeedbackId);
        const safe =
            typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(scrollToFeedbackId)
                : String(scrollToFeedbackId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const t = window.setTimeout(() => {
            document.querySelector(`[data-mobile-report-id="${safe}"]`)?.scrollIntoView?.({
                behavior: 'smooth',
                block: 'center'
            });
        }, 400);
        return () => window.clearTimeout(t);
    }, [scrollToFeedbackId, reports]);

    const handleUpdateStatus = async (id, status) => {
        if (updatingId === id) return;
        setUpdatingId(id);
        try {
            await window.api.updateFeedback(id, { status });
            await loadReports({ silent: true });
        } catch (error) {
            console.error('Failed to update mobile report status:', error);
        } finally {
            setUpdatingId(null);
        }
    };

    const enriched = reports.map((item) => {
        const meta = parseMobileMeta(item.meta);
        return { ...item, mobileMeta: meta };
    });

    const filtered = enriched.filter((item) => {
        const category = item.mobileMeta?.category || 'functionality';
        const status = item.status ?? 'open';
        if (filter.category !== 'all' && category !== filter.category) return false;
        if (filter.severity !== 'all' && item.severity !== filter.severity) return false;
        if (filter.status === 'open' && status !== 'open') return false;
        if (filter.status === 'done' && status !== 'done') return false;
        if (filter.search) {
            const q = filter.search.toLowerCase();
            const hay = [
                item.message,
                item.mobileMeta?.context,
                item.mobileMeta?.screen,
                item.mobileMeta?.error?.message,
                item.user?.name,
                item.user?.email
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    const formatDate = (dateString) =>
        new Date(dateString).toLocaleString('en-ZA', {
            timeZone: 'Africa/Johannesburg',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

    const countByCategory = (cat) =>
        enriched.filter((r) => (r.mobileMeta?.category || 'functionality') === cat).length;

    if (!isAdmin) {
        return (
            <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <i className="fas fa-lock text-3xl mb-3"></i>
                <p>Admin access required to view mobile app reports</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                        <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Mobile app errors &amp; crashes
                        </h2>
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Automatic reports from the Android app — crashes, API failures, and functionality issues
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => loadReports()}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                            isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <i className="fas fa-sync-alt mr-1.5"></i>
                        Refresh
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{reports.length}</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Open</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {reports.filter((r) => (r.status ?? 'open') === 'open').length}
                        </div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Crashes</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>{countByCategory('crash')}</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>API errors</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{countByCategory('api')}</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Other issues</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                            {countByCategory('functionality')}
                        </div>
                    </div>
                </div>
            </div>

            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                        type="text"
                        placeholder="Search errors..."
                        value={filter.search}
                        onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                        className={`md:col-span-2 px-3 py-2 text-sm border rounded-lg ${
                            isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'border-gray-300'
                        }`}
                    />
                    <select
                        value={filter.category}
                        onChange={(e) => setFilter({ ...filter, category: e.target.value })}
                        className={`px-3 py-2 text-sm border rounded-lg ${
                            isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'border-gray-300'
                        }`}
                    >
                        <option value="all">All categories</option>
                        <option value="crash">Crashes</option>
                        <option value="api">API errors</option>
                        <option value="functionality">Functionality</option>
                    </select>
                    <select
                        value={filter.status}
                        onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                        className={`px-3 py-2 text-sm border rounded-lg ${
                            isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'border-gray-300'
                        }`}
                    >
                        <option value="open">Open only</option>
                        <option value="done">Done only</option>
                        <option value="all">All statuses</option>
                    </select>
                </div>
            </div>

            <div className="space-y-3">
                {loading ? (
                    <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p>Loading mobile reports...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <i className="fas fa-mobile-alt text-3xl mb-3 opacity-50"></i>
                        <p>No mobile app reports yet</p>
                        <p className="text-xs mt-2 opacity-75">Reports appear here when the app encounters crashes or errors</p>
                    </div>
                ) : (
                    filtered.map((item) => {
                        const meta = item.mobileMeta || {};
                        const category = meta.category || 'functionality';
                        const isExpanded = expandedId === item.id;
                        const api = meta.api || {};
                        const device = meta.device || {};
                        const breadcrumbs = Array.isArray(meta.breadcrumbs) ? meta.breadcrumbs : [];

                        return (
                            <div
                                key={item.id}
                                data-mobile-report-id={item.id}
                                className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                        <span
                                            className={`px-2 py-0.5 rounded text-xs font-medium border ${mobileCategoryClass(
                                                category,
                                                isDark
                                            )}`}
                                        >
                                            {mobileCategoryLabel(category)}
                                        </span>
                                        <span
                                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                item.severity === 'high'
                                                    ? isDark
                                                        ? 'bg-red-900/40 text-red-300'
                                                        : 'bg-red-100 text-red-800'
                                                    : item.severity === 'medium'
                                                      ? isDark
                                                          ? 'bg-yellow-900/40 text-yellow-300'
                                                          : 'bg-yellow-100 text-yellow-800'
                                                      : isDark
                                                        ? 'bg-green-900/40 text-green-300'
                                                        : 'bg-green-100 text-green-800'
                                            }`}
                                        >
                                            {item.severity}
                                        </span>
                                        <select
                                            value={item.status ?? 'open'}
                                            onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                                            disabled={updatingId === item.id}
                                            className={`px-2 py-0.5 rounded text-xs font-medium border cursor-pointer ${
                                                (item.status ?? 'open') === 'done'
                                                    ? isDark
                                                        ? 'bg-green-900/40 text-green-300 border-green-700'
                                                        : 'bg-green-100 text-green-800 border-green-200'
                                                    : isDark
                                                      ? 'bg-gray-700 text-gray-200 border-gray-600'
                                                      : 'bg-gray-100 text-gray-800 border-gray-300'
                                            }`}
                                        >
                                            <option value="open">Open</option>
                                            <option value="done">Done</option>
                                        </select>
                                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            {formatDate(item.createdAt)}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                        className={`text-xs font-medium ${
                                            isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-600 hover:text-primary-700'
                                        }`}
                                    >
                                        {isExpanded ? 'Hide details' : 'Show details'}
                                    </button>
                                </div>

                                <p className={`text-sm mt-2 whitespace-pre-wrap ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                    {item.message}
                                </p>

                                <div className={`text-xs mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    <div>
                                        <strong>User:</strong> {item.user?.name || item.user?.email || 'Unknown'}
                                    </div>
                                    <div>
                                        <strong>Screen:</strong> {meta.screen || item.pageUrl || '—'}
                                    </div>
                                    <div>
                                        <strong>Context:</strong> {meta.context || '—'}
                                    </div>
                                    {api.path ? (
                                        <div>
                                            <strong>API:</strong> {api.method || 'GET'} {api.path}
                                            {api.statusCode != null ? ` (${api.statusCode})` : ''}
                                        </div>
                                    ) : null}
                                    {device.nativeVersion ? (
                                        <div>
                                            <strong>App:</strong> v{device.nativeVersion}
                                            {device.runtimeVersion ? ` · OTA ${device.runtimeVersion}` : ''}
                                        </div>
                                    ) : null}
                                    {device.platform ? (
                                        <div>
                                            <strong>Device:</strong> {device.platform} {device.osVersion || ''}
                                            {device.deviceName ? ` · ${device.deviceName}` : ''}
                                        </div>
                                    ) : null}
                                </div>

                                {isExpanded ? (
                                    <div className={`mt-4 pt-4 border-t space-y-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                        {meta.error?.stack ? (
                                            <div>
                                                <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    Stack trace
                                                </div>
                                                <pre
                                                    className={`text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap ${
                                                        isDark ? 'bg-gray-900 text-red-200' : 'bg-gray-100 text-red-900'
                                                    }`}
                                                >
                                                    {meta.error.stack}
                                                </pre>
                                            </div>
                                        ) : null}

                                        {meta.componentStack ? (
                                            <div>
                                                <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    React component stack
                                                </div>
                                                <pre
                                                    className={`text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap ${
                                                        isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'
                                                    }`}
                                                >
                                                    {meta.componentStack}
                                                </pre>
                                            </div>
                                        ) : null}

                                        {breadcrumbs.length > 0 ? (
                                            <div>
                                                <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    Activity before error ({breadcrumbs.length})
                                                </div>
                                                <ol className={`text-xs space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    {breadcrumbs.map((crumb, idx) => (
                                                        <li key={`${item.id}-crumb-${idx}`} className="flex gap-2">
                                                            <span className="opacity-60 shrink-0">{crumb.ts || ''}</span>
                                                            <span className="font-medium shrink-0">[{crumb.type}]</span>
                                                            <span>{crumb.message}</span>
                                                        </li>
                                                    ))}
                                                </ol>
                                            </div>
                                        ) : null}

                                        <div>
                                            <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                Raw diagnostic payload
                                            </div>
                                            <pre
                                                className={`text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap max-h-64 ${
                                                    isDark ? 'bg-gray-900 text-gray-400' : 'bg-gray-50 text-gray-700'
                                                }`}
                                            >
                                                {JSON.stringify(meta, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

window.MobileAppReportsViewer = MobileAppReportsViewer;
