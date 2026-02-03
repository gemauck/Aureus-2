// Safety Culture Inspections - View iAuditor inspections in ERP
const { useState, useEffect } = React;

const API_BASE = window.location.origin + '/api';

const SafetyCultureInspections = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const [status, setStatus] = useState(null);
    const [inspections, setInspections] = useState([]);
    const [metadata, setMetadata] = useState({ next_page: null, remaining_records: 0 });
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [activeTab, setActiveTab] = useState('inspections');
    const [issues, setIssues] = useState([]);
    const [issuesMetadata, setIssuesMetadata] = useState({ next_page: null, remaining_records: 0 });
    const [issuesLoading, setIssuesLoading] = useState(false);
    const [issuesSearchQuery, setIssuesSearchQuery] = useState('');

    const getHeaders = () => {
        const token = window.storage?.getToken?.();
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        };
    };

    useEffect(() => {
        const check = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_BASE}/safety-culture`, { headers: getHeaders() });
                const json = await res.json().catch(() => ({}));
                const data = json?.data ?? json;
                setStatus(data);
                if (!data?.configured) {
                    setError('Safety Culture API key not configured. Add SAFETY_CULTURE_API_KEY to .env');
                    setLoading(false);
                    return;
                }
                if (!data?.connected) {
                    setError('Unable to connect to Safety Culture. Check your API key.');
                }
                // Fetch initial inspections
                const inspRes = await fetch(`${API_BASE}/safety-culture/inspections?limit=20`, {
                    headers: getHeaders()
                });
                const inspJson = await inspRes.json().catch(() => ({}));
                const inspData = inspJson?.data ?? inspJson;
                setInspections(inspData.inspections ?? []);
                setMetadata(inspData.metadata ?? { next_page: null, remaining_records: 0 });
            } catch (e) {
                setError(e.message || 'Failed to load Safety Culture data');
            } finally {
                setLoading(false);
            }
        };
        check();
    }, []);

    const loadMore = async () => {
        const next = metadata?.next_page;
        if (!next) return;
        setLoadingMore(true);
        try {
            const url = `${API_BASE}/safety-culture/inspections?next_page=${encodeURIComponent(next)}`;
            const res = await fetch(url, { headers: getHeaders() });
            const json = await res.json().catch(() => ({}));
            const data = json?.data ?? json;
            const more = data.inspections ?? [];
            setInspections(prev => [...prev, ...more]);
            setMetadata(data.metadata ?? { next_page: null, remaining_records: 0 });
        } catch (e) {
            setError(e.message || 'Failed to load more');
        } finally {
            setLoadingMore(false);
        }
    };

    const loadIssues = async () => {
        setIssuesLoading(true);
        try {
            const res = await fetch(`${API_BASE}/safety-culture/issues?limit=50`, { headers: getHeaders() });
            const json = await res.json().catch(() => ({}));
            const data = json?.data ?? json;
            setIssues(data.issues ?? []);
            setIssuesMetadata(data.metadata ?? { next_page: null, remaining_records: 0 });
        } catch (e) {
            setError(e.message || 'Failed to load issues');
        } finally {
            setIssuesLoading(false);
        }
    };

    const loadMoreIssues = async () => {
        const next = issuesMetadata?.next_page;
        if (!next) return;
        setLoadingMore(true);
        try {
            const res = await fetch(`${API_BASE}/safety-culture/issues?next_page=${encodeURIComponent(next)}`, { headers: getHeaders() });
            const json = await res.json().catch(() => ({}));
            const data = json?.data ?? json;
            setIssues(prev => [...prev, ...(data.issues ?? [])]);
            setIssuesMetadata(data.metadata ?? { next_page: null, remaining_records: 0 });
        } catch (e) {
            setError(e.message || 'Failed to load more issues');
        } finally {
            setLoadingMore(false);
        }
    };

    const searchLower = (searchQuery || '').trim().toLowerCase();
    const filteredInspections = searchLower
        ? inspections.filter((insp) => {
            const name = (insp.name || '').toLowerCase();
            const template = (insp.template_name || '').toLowerCase();
            const owner = (insp.owner_name || '').toLowerCase();
            const id = (insp.id || '').toLowerCase();
            return name.includes(searchLower) || template.includes(searchLower) || owner.includes(searchLower) || id.includes(searchLower);
        })
        : inspections;

    const issuesSearchLower = (issuesSearchQuery || '').trim().toLowerCase();
    const filteredIssues = issuesSearchLower
        ? issues.filter((i) => {
            const title = (i.title || i.name || i.description || '').toLowerCase();
            const status = (i.status || '').toLowerCase();
            const id = (i.id || '').toLowerCase();
            return title.includes(issuesSearchLower) || status.includes(issuesSearchLower) || id.includes(issuesSearchLower);
        })
        : issues;

    const runImport = async () => {
        setImporting(true);
        setImportResult(null);
        try {
            const res = await fetch(`${API_BASE}/safety-culture/import-job-cards`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ limit: 200 })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = json?.error;
                const errMsg = (typeof err === 'object' && err?.message) || (typeof err === 'string' ? err : null) || json?.error?.details || json?.details || json?.message || `Import failed (${res.status})`;
                setImportResult({ error: String(errMsg) });
                return;
            }
            const data = json?.data ?? json;
            setImportResult(data);
            if (data?.imported > 0) {
                setError(null);
            }
        } catch (e) {
            setImportResult({ error: String(e.message || 'Import failed') });
        } finally {
            setImporting(false);
        }
    };

    const formatDate = (s) => {
        if (!s) return '-';
        try {
            const d = new Date(s);
            return isNaN(d) ? s : d.toLocaleDateString(undefined, {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return s;
        }
    };

    if (loading) {
        return (
            <div className={`rounded-lg border p-8 text-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <i className="fas fa-spinner fa-spin text-2xl text-gray-400 mb-3"></i>
                <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Connecting to Safety Culture...</p>
            </div>
        );
    }

    if (error && !status?.configured) {
        return (
            <div className={`rounded-lg border p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3 text-amber-600">
                    <i className="fas fa-exclamation-triangle text-xl"></i>
                    <div>
                        <p className="font-medium">Safety Culture not configured</p>
                        <p className="text-sm opacity-90">{error}</p>
                        <p className="text-xs mt-2 opacity-75">See docs/SAFETY-CULTURE-INTEGRATION.md for setup.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <i className="fas fa-clipboard-check text-green-600"></i>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Safety Culture Inspections</h3>
                    {status?.connected && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            Connected
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={runImport}
                        disabled={importing || !status?.connected}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {importing ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                Importing...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-download"></i>
                                Import as Job Cards
                            </>
                        )}
                    </button>
                    <a
                        href="https://app.safetyculture.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                    >
                        Open in Safety Culture →
                    </a>
                </div>
            </div>

            {importResult && (
                <div className={`mx-4 mt-3 p-3 rounded text-sm ${
                    importResult.error ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200' :
                    'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                }`}>
                    {importResult.error ? (
                        typeof importResult.error === 'string' ? importResult.error : (importResult.error?.message || String(importResult.error))
                    ) : (
                        <>
                            <strong>{importResult.summary}</strong>
                            {importResult.errors?.length > 0 && (
                                <span className="block mt-1 text-amber-700 dark:text-amber-300">
                                    {importResult.errors.length} error(s)
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}

            {error && status?.configured && (
                <div className="mx-4 mt-3 p-3 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm">
                    {error}
                </div>
            )}

            <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => setActiveTab('inspections')}
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'inspections' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                >
                    <i className="fas fa-clipboard-check mr-2"></i>
                    Inspections
                </button>
                <button
                    onClick={() => { setActiveTab('issues'); if (issues.length === 0 && !issuesLoading) loadIssues(); }}
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'issues' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                >
                    <i className="fas fa-exclamation-circle mr-2"></i>
                    Issues
                </button>
            </div>

            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <input
                    type="text"
                    placeholder={activeTab === 'inspections' ? 'Search inspections, templates, owners...' : 'Search issues...'}
                    value={activeTab === 'inspections' ? searchQuery : issuesSearchQuery}
                    onChange={(e) => activeTab === 'inspections' ? setSearchQuery(e.target.value) : setIssuesSearchQuery(e.target.value)}
                    className={`w-full max-w-md px-3 py-2 rounded-lg border text-sm placeholder-gray-400 ${
                        isDark
                            ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-primary-500 focus:border-primary-500'
                            : 'bg-white border-gray-300 text-gray-900 focus:ring-primary-500 focus:border-primary-500'
                    }`}
                />
                {((activeTab === 'inspections' && searchQuery) || (activeTab === 'issues' && issuesSearchQuery)) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                        Showing {activeTab === 'inspections' ? filteredInspections.length : filteredIssues.length} of {activeTab === 'inspections' ? inspections.length : issues.length} {activeTab === 'inspections' ? 'inspections' : 'issues'}
                    </p>
                )}
            </div>

            {activeTab === 'issues' && (
                <div className="p-4">
                    {issuesLoading ? (
                        <div className="py-8 text-center">
                            <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                            <p className="text-gray-500 mt-2">Loading issues...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className={isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                                        <th className="text-left p-3 font-medium">Issue</th>
                                        <th className="text-left p-3 font-medium">Status</th>
                                        <th className="text-left p-3 font-medium">Priority</th>
                                        <th className="text-left p-3 font-medium">Created</th>
                                        <th className="text-left p-3 font-medium">Due</th>
                                        <th className="text-left p-3 font-medium">Assignee</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredIssues.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-6 text-center text-gray-500">
                                                {issues.length === 0 ? 'No issues found' : 'No issues match your search'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredIssues.map((issue) => (
                                            <tr key={issue.id} className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'}`}>
                                                <td className="p-3 font-medium text-gray-900 dark:text-gray-100">
                                                    {issue.title || issue.name || issue.description || issue.id}
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                                        (issue.status || '').toLowerCase() === 'closed' ? 'bg-gray-200 dark:bg-gray-600' :
                                                        (issue.status || '').toLowerCase() === 'open' ? 'bg-amber-100 dark:bg-amber-900/40' :
                                                        'bg-blue-100 dark:bg-blue-900/40'
                                                    }`}>
                                                        {issue.status || '-'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-gray-600 dark:text-gray-400">{issue.priority || '-'}</td>
                                                <td className="p-3 text-gray-600 dark:text-gray-400">{formatDate(issue.created_at || issue.createdAt)}</td>
                                                <td className="p-3 text-gray-600 dark:text-gray-400">{formatDate(issue.due_date || issue.dueDate)}</td>
                                                <td className="p-3 text-gray-600 dark:text-gray-400">{issue.assignee_name || issue.assigneeName || '-'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!issuesLoading && issuesMetadata?.next_page && (
                        <div className="mt-4 text-center">
                            <button
                                onClick={loadMoreIssues}
                                disabled={loadingMore}
                                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm"
                            >
                                {loadingMore ? 'Loading...' : `Load more (${issuesMetadata.remaining_records} remaining)`}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'inspections' && (
            <>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className={isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                            <th className="text-left p-3 font-medium">Inspection</th>
                            <th className="text-left p-3 font-medium">Template</th>
                            <th className="text-left p-3 font-medium">Score</th>
                            <th className="text-left p-3 font-medium">Started</th>
                            <th className="text-left p-3 font-medium">Completed</th>
                            <th className="text-left p-3 font-medium">Report</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInspections.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-6 text-center text-gray-500">
                                    {inspections.length === 0 ? 'No inspections found' : 'No inspections match your search'}
                                </td>
                            </tr>
                        ) : (
                            filteredInspections.map((insp) => (
                                <tr
                                    key={insp.id}
                                    className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'}`}
                                >
                                    <td className="p-3 font-medium text-gray-900 dark:text-gray-100">
                                        {insp.name || insp.template_name || insp.id}
                                    </td>
                                    <td className="p-3 text-gray-600 dark:text-gray-400">
                                        {insp.template_name || '-'}
                                    </td>
                                    <td className="p-3">
                                        {insp.score != null ? (
                                            <span className={insp.score >= 80 ? 'text-green-600' : insp.score >= 50 ? 'text-amber-600' : 'text-red-600'}>
                                                {insp.score}{insp.max_score != null ? `/${insp.max_score}` : ''}
                                            </span>
                                        ) : (
                                            '-'
                                        )}
                                    </td>
                                    <td className="p-3 text-gray-600 dark:text-gray-400">
                                        {formatDate(insp.date_started)}
                                    </td>
                                    <td className="p-3 text-gray-600 dark:text-gray-400">
                                        {formatDate(insp.date_completed)}
                                    </td>
                                    <td className="p-3">
                                        {insp.web_report_link ? (
                                            <a
                                                href={insp.web_report_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline"
                                            >
                                                View
                                            </a>
                                        ) : (
                                            '-'
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {metadata?.next_page && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
                    <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm"
                    >
                        {loadingMore ? 'Loading...' : `Load more (${metadata.remaining_records} remaining)`}
                    </button>
                </div>
            )}
            </>
            )}
        </div>
    );
};

window.SafetyCultureInspections = SafetyCultureInspections;
