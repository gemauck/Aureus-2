// SARS Website Monitoring Component for Compliance Team
const { useState, useEffect } = React;

/** API routes use ok(res, payload) → { data: payload } */
function unwrapSarsApi(json) {
    return json?.data ?? json ?? {};
}

function sarsChangesFromPayload(payload) {
    const data = unwrapSarsApi(payload);
    const list = data.changes ?? data.data?.changes;
    return Array.isArray(list) ? list : [];
}

function sarsStatsFromPayload(payload) {
    const data = unwrapSarsApi(payload);
    const stats = data.total !== undefined ? data : (data.data || {});
    return {
        total: stats.total || 0,
        new: stats.new || 0,
        unread: stats.unread || 0
    };
}

function sarsLastRunFromPayload(payload) {
    const data = unwrapSarsApi(payload);
    if (data?.ranAt) return data;
    if (data?.data?.ranAt) return data.data;
    return data?.data ?? null;
}

function parseSarsMetadata(change) {
    if (!change?.metadata) return {};
    try {
        return typeof change.metadata === 'string' ? JSON.parse(change.metadata) : change.metadata;
    } catch (_) {
        return {};
    }
}

function formatSarsDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

const SarsMonitoring = () => {
    const [changes, setChanges] = useState([]);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [expandedIds, setExpandedIds] = useState({});
    const [stats, setStats] = useState({
        total: 0,
        new: 0,
        unread: 0
    });
    const [filter, setFilter] = useState({
        isNew: null,
        isRead: null,
        category: '',
        priority: ''
    });
    const [lastRun, setLastRun] = useState(null);

    // Get theme state
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;

    // Load changes from API
    const loadChanges = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) {
                console.error('No authentication token found');
                return;
            }

            const params = new URLSearchParams({ limit: '200' });
            if (filter.isNew !== null) params.append('isNew', filter.isNew);
            if (filter.isRead !== null) params.append('isRead', filter.isRead);
            if (filter.category) params.append('category', filter.category);
            if (filter.priority) params.append('priority', filter.priority);

            const response = await fetch(`/api/sars-monitoring/check?action=list&${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                setChanges([]);
                if (response.status >= 500) {
                    console.warn('SARS monitoring API unavailable (server error). Check back later.');
                }
                return;
            }

            setChanges(sarsChangesFromPayload(await response.json().catch(() => ({}))));
        } catch (error) {
            console.error('Error loading SARS changes:', error);
            setChanges([]);
        } finally {
            setLoading(false);
        }
    };

    // Load statistics
    const loadStats = async () => {
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/api/sars-monitoring/check?action=stats', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                setStats(sarsStatsFromPayload(await response.json()));
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    // Load last run (for "Last checked" display)
    const loadLastRun = async () => {
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) return;
            const response = await fetch('/api/sars-monitoring/check?action=last-run', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                const lastRunData = sarsLastRunFromPayload(await response.json());
                if (lastRunData?.ranAt) setLastRun(lastRunData);
            }
        } catch (e) {
            console.error('Error loading last run:', e);
        }
    };

    // Trigger manual check
    const handleCheckNow = async () => {
        setChecking(true);
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) {
                alert('Please log in to check SARS website');
                return;
            }

            const response = await fetch('/api/sars-monitoring/check?action=check', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const msg = response.status >= 500
                    ? 'SARS check is temporarily unavailable (server error). Try again later.'
                    : `Error: ${response.status} ${response.statusText}`;
                alert(msg);
                setChecking(false);
                return;
            }

            const data = unwrapSarsApi(await response.json().catch(() => ({})));
            const checkOk = data.success !== false && (data.results || data.message);
            if (checkOk) {
                const lastRunData = data.lastRun ?? sarsLastRunFromPayload({ data: data.data });
                if (lastRunData?.ranAt) setLastRun(lastRunData);
                const newCount = data.results?.newChanges || 0;
                const errorCount = data.results?.errors || 0;
                const partialNote = errorCount > 0
                    ? ` (${errorCount} section${errorCount === 1 ? '' : 's'} could not be fetched.)`
                    : '';
                alert(`Check completed! Found ${newCount} new change${newCount === 1 ? '' : 's'}.${newCount > 0 ? ' A summary email has been sent to the Compliance team.' : ''}${partialNote}`);
                await Promise.all([loadChanges(), loadStats(), loadLastRun()]);
            } else {
                alert('Error checking SARS website: ' + (data.message || data.error?.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error checking SARS website:', error);
            alert('Error checking SARS website: ' + (error.message || 'Try again later.'));
        } finally {
            setChecking(false);
        }
    };

    // Mark change as read
    const handleMarkAsRead = async (id) => {
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/api/sars-monitoring/check?action=mark-read', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id })
            });

            if (response.ok) {
                // Update local state
                setChanges(changes.map(change => 
                    change.id === id ? { ...change, isRead: true } : change
                ));
                // Reload stats
                loadStats();
            }
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    useEffect(() => {
        loadChanges();
        loadStats();
        loadLastRun();
    }, [filter]);

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'Critical': return isDark ? 'text-red-400 bg-red-900/30 border-red-400' : 'text-red-700 bg-red-100 border-red-500';
            case 'High': return isDark ? 'text-orange-400 bg-orange-900/30 border-orange-400' : 'text-orange-700 bg-orange-100 border-orange-500';
            case 'Medium': return isDark ? 'text-yellow-400 bg-yellow-900/30 border-yellow-400' : 'text-yellow-700 bg-yellow-100 border-yellow-500';
            default: return isDark ? 'text-blue-400 bg-blue-900/30 border-blue-400' : 'text-blue-700 bg-blue-100 border-blue-500';
        }
    };

    const getCategoryColor = (category) => {
        switch (category) {
            case 'VAT': return isDark ? 'bg-primary-900/50 text-primary-300' : 'bg-primary-100 text-primary-700';
            case 'Tax': return isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700';
            case 'Compliance': return isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700';
            default: return isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700';
        }
    };

    const toggleOverview = (id) => {
        setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            SARS Website Monitoring
                        </h3>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                            Public notices, legislation, news and announcements. Summary emails sent to Compliance team when changes are found.
                        </p>
                        {lastRun && (
                            <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                                Last checked: {lastRun.ranAt ? new Date(lastRun.ranAt).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                {lastRun.errorMessage && (
                                    <span className={isDark ? 'text-amber-400' : 'text-amber-600'}> · Last error: {String(lastRun.errorMessage).slice(0, 60)}{String(lastRun.errorMessage).length > 60 ? '…' : ''}</span>
                                )}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleCheckNow}
                        disabled={checking}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                            checking
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:opacity-90'
                        } ${isDark ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                        {checking ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-1.5"></i>
                                Checking...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-sync-alt mr-1.5"></i>
                                Check Now
                            </>
                        )}
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                    <div className={`rounded p-2 ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Total Changes</p>
                        <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{stats.total}</p>
                    </div>
                    <div className={`rounded p-2 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-red-300' : 'text-red-600'}`}>New</p>
                        <p className={`text-lg font-bold ${isDark ? 'text-red-400' : 'text-red-700'}`}>{stats.new}</p>
                    </div>
                    <div className={`rounded p-2 ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Unread</p>
                        <p className={`text-lg font-bold ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>{stats.unread}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        value={filter.isNew === null ? '' : filter.isNew.toString()}
                        onChange={(e) => setFilter({ ...filter, isNew: e.target.value === '' ? null : e.target.value === 'true' })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Changes</option>
                        <option value="true">New Only</option>
                        <option value="false">Old Only</option>
                    </select>
                    <select
                        value={filter.isRead === null ? '' : filter.isRead.toString()}
                        onChange={(e) => setFilter({ ...filter, isRead: e.target.value === '' ? null : e.target.value === 'true' })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Status</option>
                        <option value="false">Unread</option>
                        <option value="true">Read</option>
                    </select>
                    <select
                        value={filter.category}
                        onChange={(e) => setFilter({ ...filter, category: e.target.value })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Categories</option>
                        <option value="Tax">Tax</option>
                        <option value="VAT">VAT</option>
                        <option value="Compliance">Compliance</option>
                        <option value="General">General</option>
                    </select>
                    <select
                        value={filter.priority}
                        onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Priorities</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Normal">Normal</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
            </div>

            {/* Changes List */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                {loading ? (
                    <div className="text-center py-8">
                        <i className={`fas fa-spinner fa-spin text-3xl mb-2 ${isDark ? 'text-slate-500' : 'text-gray-300'}`}></i>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Loading changes...</p>
                    </div>
                ) : changes.length > 0 ? (
                    <div className="space-y-2">
                        {changes.map(change => {
                            const meta = parseSarsMetadata(change);
                            const isExpanded = Boolean(expandedIds[change.id]);
                            const overviewText = (change.description || '').trim()
                                || (change.pageTitle && change.pageTitle !== change.title ? change.pageTitle : '')
                                || 'No summary was captured for this item. Open the SARS page for full details.';

                            return (
                            <div
                                key={change.id}
                                className={`border-l-4 rounded-lg p-3 transition ${
                                    !change.isRead
                                        ? isDark ? 'bg-blue-900/20 border-blue-400' : 'bg-blue-50 border-blue-500'
                                        : isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-300'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            {!change.isRead && (
                                                <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'}`}>
                                                    NEW
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 text-xs rounded border ${getPriorityColor(change.priority)}`}>
                                                {change.priority}
                                            </span>
                                            <span className={`px-2 py-0.5 text-xs rounded ${getCategoryColor(change.category)}`}>
                                                {change.category}
                                            </span>
                                        </div>
                                        <h4 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                            {change.title}
                                        </h4>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => toggleOverview(change.id)}
                                            className={`px-2 py-1 text-xs rounded transition flex items-center gap-1 ${
                                                isExpanded
                                                    ? isDark ? 'bg-slate-600 text-slate-100' : 'bg-gray-300 text-gray-800'
                                                    : isDark ? 'bg-slate-600/80 text-slate-200 hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                            }`}
                                            aria-expanded={isExpanded}
                                        >
                                            Overview
                                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-[10px]`}></i>
                                        </button>
                                        {!change.isRead && (
                                            <button
                                                type="button"
                                                onClick={() => handleMarkAsRead(change.id)}
                                                className={`px-2 py-1 text-xs rounded transition ${
                                                    isDark
                                                        ? 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                }`}
                                                title="Mark as read"
                                            >
                                                <i className="fas fa-check"></i>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className={`mb-3 rounded-lg border p-3 text-xs space-y-2 ${
                                        isDark ? 'bg-slate-800/80 border-slate-600' : 'bg-white border-gray-200'
                                    }`}>
                                        <div>
                                            <p className={`font-semibold mb-1 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>Summary</p>
                                            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                                {overviewText}
                                            </p>
                                        </div>
                                        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-1 border-t ${
                                            isDark ? 'border-slate-600 text-slate-400' : 'border-gray-200 text-gray-500'
                                        }`}>
                                            {meta.sourceLabel && (
                                                <p><span className="font-medium">Source section:</span> {meta.sourceLabel}</p>
                                            )}
                                            <p><span className="font-medium">Change type:</span> {change.changeType || 'new'}</p>
                                            <p><span className="font-medium">Published:</span> {formatSarsDate(change.publishedAt)}</p>
                                            <p><span className="font-medium">Detected:</span> {formatSarsDate(change.createdAt)}</p>
                                            <p><span className="font-medium">Status:</span> {change.isRead ? 'Read' : 'Unread'}{change.isNew ? ' · flagged new' : ''}</p>
                                            {meta.checkedAt && (
                                                <p><span className="font-medium">Last checked:</span> {formatSarsDate(meta.checkedAt)}</p>
                                            )}
                                        </div>
                                        {meta.sourceUrl && (
                                            <p className={`truncate ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                                                <span className="font-medium">Monitored from:</span>{' '}
                                                <a
                                                    href={meta.sourceUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}
                                                >
                                                    {meta.sourceLabel || 'Source page'}
                                                </a>
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center justify-between text-xs">
                                    <div className={`flex items-center gap-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {change.publishedAt && (
                                            <span>
                                                <i className="fas fa-calendar mr-1"></i>
                                                {formatSarsDate(change.publishedAt)}
                                            </span>
                                        )}
                                        <span>
                                            <i className="fas fa-clock mr-1"></i>
                                            Detected {formatSarsDate(change.createdAt)}
                                        </span>
                                    </div>
                                    {change.url && (
                                        <a
                                            href={change.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`font-medium transition ${
                                                isDark
                                                    ? 'text-blue-400 hover:text-blue-300'
                                                    : 'text-blue-600 hover:text-blue-700'
                                            }`}
                                        >
                                            View on SARS <i className="fas fa-external-link-alt ml-1"></i>
                                        </a>
                                    )}
                                </div>
                            </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <i className={`fas fa-search text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            No changes found. Click "Check Now" to monitor SARS website.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.SarsMonitoring = SarsMonitoring;

// Dispatch event to notify other components
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'SarsMonitoring' } 
    }));
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}

