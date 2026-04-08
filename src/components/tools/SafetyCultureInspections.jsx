// Safety Culture Inspections - View iAuditor inspections in ERP
const { useState, useEffect, useMemo } = React;

const API_BASE = window.location.origin + '/api';
const PAGE_SIZE = 20;
/** Non-OK API responses use `{ error: { message, code } }` — surface instead of empty lists. */
const apiErrorFromResponse = (res, json) => {
    if (res.ok) return null;
    const err = json?.error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && err.message) return String(err.message);
    return json?.message ? String(json.message) : `Request failed (${res.status})`;
};

const mergeUniqueById = (existing, incoming) => {
    const seen = new Set((existing || []).map((item) => String(item?.id || '')));
    const next = [...(existing || [])];
    (incoming || []).forEach((item) => {
        const key = String(item?.id || '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        next.push(item);
    });
    return next;
};

const SC_ADMIN_ROLES = new Set([
    'admin',
    'administrator',
    'superadmin',
    'super-admin',
    'super_admin',
    'super_administrator',
    'system_admin'
]);

const isScKeyAdminUser = () => {
    const u = window.storage?.getUser?.();
    if (!u) return false;
    const role = (u.role || '').toString().trim().toLowerCase();
    return SC_ADMIN_ROLES.has(role);
};

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
    const [importingIssues, setImportingIssues] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [activeTab, setActiveTab] = useState('inspections');
    const [issues, setIssues] = useState([]);
    const [issuesMetadata, setIssuesMetadata] = useState({ next_page: null, remaining_records: 0 });
    const [issuesLoading, setIssuesLoading] = useState(false);
    const [issuesLoadingMore, setIssuesLoadingMore] = useState(false);
    const [issuesSearchQuery, setIssuesSearchQuery] = useState('');
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [selectedInspection, setSelectedInspection] = useState(null);
    const [inspectionSort, setInspectionSort] = useState({ key: 'completed', dir: 'desc' }); // default: last at top
    const [issuesSort, setIssuesSort] = useState({ key: 'created', dir: 'desc' });
    const [inspectionPage, setInspectionPage] = useState(1);
    const [issuesPage, setIssuesPage] = useState(1);
    const [autoLoadingInspections, setAutoLoadingInspections] = useState(false);
    const [autoLoadingIssues, setAutoLoadingIssues] = useState(false);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [scApiKeyDraft, setScApiKeyDraft] = useState('');
    const [keySaving, setKeySaving] = useState(false);
    const [keySaveError, setKeySaveError] = useState(null);
    const [importIncludeSnapshot, setImportIncludeSnapshot] = useState(true);
    const [importIncludeAnswers, setImportIncludeAnswers] = useState(false);
    const [inspectionExtra, setInspectionExtra] = useState(null);
    const [inspectionExtraLoading, setInspectionExtraLoading] = useState(false);
    const [inspectionExtraWithAnswers, setInspectionExtraWithAnswers] = useState(false);
    const [issueExtra, setIssueExtra] = useState(null);
    const [issueExtraLoading, setIssueExtraLoading] = useState(false);

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
            setKeySaveError(null);
            try {
                const res = await fetch(`${API_BASE}/safety-culture`, { headers: getHeaders() });
                const json = await res.json().catch(() => ({}));
                const data = json?.data ?? json;
                setStatus(data);
                if (!data?.configured) {
                    setError(
                        isScKeyAdminUser()
                            ? 'No valid Safety Culture API key is active. Paste a key below (stored in the database) or set SAFETY_CULTURE_API_KEY on the server.'
                            : 'Safety Culture is not configured. Ask an administrator to add the API key.'
                    );
                    setInspections([]);
                    setLoading(false);
                    return;
                }
                if (!data?.connected) {
                    setError('Unable to connect to Safety Culture. Check your API key.');
                }
                const inspRes = await fetch(`${API_BASE}/safety-culture/inspections?limit=200&enrich_cap=100`, {
                    headers: getHeaders()
                });
                const inspJson = await inspRes.json().catch(() => ({}));
                const apiErr = apiErrorFromResponse(inspRes, inspJson);
                if (apiErr) {
                    setError(apiErr);
                    setInspections([]);
                    return;
                }
                const inspData = inspJson?.data ?? inspJson;
                setInspections(inspData.inspections ?? []);
                setMetadata(inspData.metadata ?? { next_page: null, remaining_records: 0 });
                if (inspData?.metadata?.next_page) {
                    void loadAllInspectionsFrom(inspData.metadata.next_page, true);
                }
            } catch (e) {
                setError(e.message || 'Failed to load Safety Culture data');
            } finally {
                setLoading(false);
            }
        };
        check();
    }, [reloadNonce]);

    const saveScApiKey = async () => {
        if (!isScKeyAdminUser()) return;
        setKeySaving(true);
        setKeySaveError(null);
        try {
            const res = await fetch(`${API_BASE}/safety-culture`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({ safetyCultureApiKey: scApiKeyDraft.trim() })
            });
            const json = await res.json().catch(() => ({}));
            const apiErr = apiErrorFromResponse(res, json);
            if (apiErr) {
                setKeySaveError(apiErr);
                return;
            }
            setScApiKeyDraft('');
            setReloadNonce((n) => n + 1);
        } catch (e) {
            setKeySaveError(e.message || 'Failed to save API key');
        } finally {
            setKeySaving(false);
        }
    };

    const clearStoredScApiKey = async () => {
        if (!isScKeyAdminUser()) return;
        setKeySaving(true);
        setKeySaveError(null);
        try {
            const res = await fetch(`${API_BASE}/safety-culture`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({ safetyCultureApiKey: '' })
            });
            const json = await res.json().catch(() => ({}));
            const apiErr = apiErrorFromResponse(res, json);
            if (apiErr) {
                setKeySaveError(apiErr);
                return;
            }
            setReloadNonce((n) => n + 1);
        } catch (e) {
            setKeySaveError(e.message || 'Failed to clear API key');
        } finally {
            setKeySaving(false);
        }
    };

    const loadAllInspectionsFrom = async (startNextPage = null, silent = false) => {
        if (!silent) setLoadingMore(true);
        if (silent) setAutoLoadingInspections(true);
        try {
            let next = startNextPage || metadata?.next_page;
            while (next) {
                const url = `${API_BASE}/safety-culture/inspections?next_page=${encodeURIComponent(next)}`;
                const res = await fetch(url, { headers: getHeaders() });
                const json = await res.json().catch(() => ({}));
                const data = json?.data ?? json;
                const more = data.inspections ?? [];
                setInspections(prev => mergeUniqueById(prev, more));
                const meta = data.metadata ?? { next_page: null, remaining_records: 0 };
                setMetadata(meta);
                next = meta?.next_page || null;
            }
        } catch (e) {
            setError(e.message || 'Failed to load all inspections');
        } finally {
            if (!silent) setLoadingMore(false);
            if (silent) setAutoLoadingInspections(false);
        }
    };

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
            setInspections(prev => mergeUniqueById(prev, more));
            setMetadata(data.metadata ?? { next_page: null, remaining_records: 0 });
        } catch (e) {
            setError(e.message || 'Failed to load more');
        } finally {
            setLoadingMore(false);
        }
    };

    const loadAllInspections = async () => {
        setLoadingMore(true);
        try {
            await loadAllInspectionsFrom(metadata?.next_page, false);
        } catch (e) {
            setError(e.message || 'Failed to load all inspections');
        } finally {
            setLoadingMore(false);
        }
    };

    const loadIssues = async () => {
        setIssuesLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/safety-culture/issues?limit=200&enrich_cap=100`, { headers: getHeaders() });
            const json = await res.json().catch(() => ({}));
            const apiErr = apiErrorFromResponse(res, json);
            if (apiErr) {
                setError(apiErr);
                setIssues([]);
                setIssuesMetadata({ next_page: null, remaining_records: 0 });
                return;
            }
            const data = json?.data ?? json;
            setIssues(data.issues ?? []);
            setIssuesMetadata(data.metadata ?? { next_page: null, remaining_records: 0 });
            // Auto-fetch remaining issue pages so recently created issues are visible immediately.
            if (data?.metadata?.next_page) {
                void loadAllIssuesFrom(data.metadata.next_page, true);
            }
        } catch (e) {
            setError(e.message || 'Failed to load issues');
        } finally {
            setIssuesLoading(false);
        }
    };

    const loadAllIssuesFrom = async (startNextPage = null, silent = false) => {
        if (!silent) setIssuesLoadingMore(true);
        if (silent) setAutoLoadingIssues(true);
        try {
            let next = startNextPage || issuesMetadata?.next_page;
            while (next) {
                const res = await fetch(`${API_BASE}/safety-culture/issues?next_page=${encodeURIComponent(next)}`, { headers: getHeaders() });
                const json = await res.json().catch(() => ({}));
                const data = json?.data ?? json;
                setIssues(prev => mergeUniqueById(prev, data.issues ?? []));
                const meta = data.metadata ?? { next_page: null, remaining_records: 0 };
                setIssuesMetadata(meta);
                next = meta?.next_page || null;
            }
        } catch (e) {
            setError(e.message || 'Failed to load all issues');
        } finally {
            if (!silent) setIssuesLoadingMore(false);
            if (silent) setAutoLoadingIssues(false);
        }
    };

    const loadMoreIssues = async () => {
        const next = issuesMetadata?.next_page;
        if (!next) return;
        setIssuesLoadingMore(true);
        try {
            const res = await fetch(`${API_BASE}/safety-culture/issues?next_page=${encodeURIComponent(next)}`, { headers: getHeaders() });
            const json = await res.json().catch(() => ({}));
            const data = json?.data ?? json;
            setIssues(prev => mergeUniqueById(prev, data.issues ?? []));
            setIssuesMetadata(data.metadata ?? { next_page: null, remaining_records: 0 });
        } catch (e) {
            setError(e.message || 'Failed to load more issues');
        } finally {
            setIssuesLoadingMore(false);
        }
    };

    const loadAllIssues = async () => {
        setIssuesLoadingMore(true);
        try {
            await loadAllIssuesFrom(issuesMetadata?.next_page, false);
        } catch (e) {
            setError(e.message || 'Failed to load all issues');
        } finally {
            setIssuesLoadingMore(false);
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

    const sortInspection = (a, b, key, dir) => {
        const mult = dir === 'asc' ? 1 : -1;
        let va, vb;
        switch (key) {
            case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); return mult * ((va < vb) ? -1 : (va > vb) ? 1 : 0);
            case 'template': va = (a.template_name || '').toLowerCase(); vb = (b.template_name || '').toLowerCase(); return mult * ((va < vb) ? -1 : (va > vb) ? 1 : 0);
            case 'score': va = a.score ?? -1; vb = b.score ?? -1; return mult * (va - vb);
            case 'started': va = new Date(a.date_started || 0).getTime(); vb = new Date(b.date_started || 0).getTime(); return mult * (va - vb);
            case 'completed': va = new Date(a.date_completed || a.date_started || 0).getTime(); vb = new Date(b.date_completed || b.date_started || 0).getTime(); return mult * (va - vb);
            default: return 0;
        }
    };
    const sortIssue = (a, b, key, dir) => {
        const mult = dir === 'asc' ? 1 : -1;
        let va, vb;
        switch (key) {
            case 'title': va = (a.title || a.name || '').toLowerCase(); vb = (b.title || b.name || '').toLowerCase(); return mult * ((va < vb) ? -1 : (va > vb) ? 1 : 0);
            case 'status': va = (a.status || '').toLowerCase(); vb = (b.status || '').toLowerCase(); return mult * ((va < vb) ? -1 : (va > vb) ? 1 : 0);
            case 'priority': va = (a.priority || '').toLowerCase(); vb = (b.priority || '').toLowerCase(); return mult * ((va < vb) ? -1 : (va > vb) ? 1 : 0);
            case 'created': va = new Date(a.created_at || a.createdAt || 0).getTime(); vb = new Date(b.created_at || b.createdAt || 0).getTime(); return mult * (va - vb);
            case 'due': va = new Date(a.due_date || a.dueDate || 0).getTime(); vb = new Date(b.due_date || b.dueDate || 0).getTime(); return mult * (va - vb);
            case 'assignee': va = (a.assignee_name || a.assigneeName || '').toLowerCase(); vb = (b.assignee_name || b.assigneeName || '').toLowerCase(); return mult * ((va < vb) ? -1 : (va > vb) ? 1 : 0);
            default: return 0;
        }
    };

    const sortedInspections = useMemo(() => {
        const arr = [...filteredInspections];
        arr.sort((a, b) => sortInspection(a, b, inspectionSort.key, inspectionSort.dir));
        return arr;
    }, [filteredInspections, inspectionSort.key, inspectionSort.dir]);

    const sortedIssues = useMemo(() => {
        const arr = [...filteredIssues];
        arr.sort((a, b) => sortIssue(a, b, issuesSort.key, issuesSort.dir));
        return arr;
    }, [filteredIssues, issuesSort.key, issuesSort.dir]);

    const paginatedInspections = useMemo(() => {
        const start = (inspectionPage - 1) * PAGE_SIZE;
        return sortedInspections.slice(start, start + PAGE_SIZE);
    }, [sortedInspections, inspectionPage]);

    const paginatedIssues = useMemo(() => {
        const start = (issuesPage - 1) * PAGE_SIZE;
        return sortedIssues.slice(start, start + PAGE_SIZE);
    }, [sortedIssues, issuesPage]);

    const inspectionTotalPages = Math.max(1, Math.ceil(sortedInspections.length / PAGE_SIZE));
    const issuesTotalPages = Math.max(1, Math.ceil(sortedIssues.length / PAGE_SIZE));

    useEffect(() => {
        setInspectionPage((p) => Math.min(p, inspectionTotalPages));
    }, [inspectionTotalPages]);

    useEffect(() => {
        setIssuesPage((p) => Math.min(p, issuesTotalPages));
    }, [issuesTotalPages]);

    useEffect(() => {
        setInspectionExtra(null);
        setInspectionExtraWithAnswers(false);
    }, [selectedInspection?.id]);

    useEffect(() => {
        setIssueExtra(null);
    }, [selectedIssue?.id]);

    const SortableTh = ({ label, sortKey, currentSort, onSort, isDark, className = '' }) => {
        const isActive = currentSort.key === sortKey;
        return (
            <th className={`text-left p-3 font-medium cursor-pointer select-none hover:opacity-80 ${className} ${isDark ? 'text-gray-300' : 'text-gray-600'}`} onClick={() => onSort(sortKey)}>
                {label}
                {isActive && <span className="ml-1">{currentSort.dir === 'asc' ? '↑' : '↓'}</span>}
            </th>
        );
    };

    const setInspectionSortKey = (key) => {
        setInspectionSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
        setInspectionPage(1);
    };
    const setIssuesSortKey = (key) => {
        setIssuesSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
        setIssuesPage(1);
    };

    const runImport = async () => {
        setImporting(true);
        setImportResult(null);
        try {
            const res = await fetch(`${API_BASE}/safety-culture/import-job-cards`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    limit: 200,
                    include_snapshot: importIncludeSnapshot,
                    include_answers: importIncludeSnapshot && importIncludeAnswers
                })
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

    const runImportIssues = async () => {
        setImportingIssues(true);
        setImportResult(null);
        try {
            const res = await fetch(`${API_BASE}/safety-culture/import-issues-as-job-cards`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    limit: 200,
                    include_snapshot: importIncludeSnapshot
                })
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
            setImportingIssues(false);
        }
    };

    const loadInspectionFromApi = async (withAnswers, auditId) => {
        const id = auditId || selectedInspection?.id;
        if (!id) return;
        setInspectionExtraLoading(true);
        setInspectionExtra(null);
        setInspectionExtraWithAnswers(!!withAnswers);
        try {
            const q = withAnswers ? '&include_answers=1' : '';
            const res = await fetch(
                `${API_BASE}/safety-culture/inspections/detail?id=${encodeURIComponent(id)}${q}`,
                { headers: getHeaders() }
            );
            const json = await res.json().catch(() => ({}));
            const apiErr = apiErrorFromResponse(res, json);
            if (apiErr) {
                setInspectionExtra({ error: apiErr });
                return;
            }
            setInspectionExtra(json?.data ?? json);
        } catch (e) {
            setInspectionExtra({ error: e.message || 'Request failed' });
        } finally {
            setInspectionExtraLoading(false);
        }
    };

    const loadIssueFromApi = async (issueId) => {
        const id = issueId || selectedIssue?.id;
        if (!id) return;
        setIssueExtraLoading(true);
        setIssueExtra(null);
        try {
            const res = await fetch(
                `${API_BASE}/safety-culture/issues/detail?id=${encodeURIComponent(id)}`,
                { headers: getHeaders() }
            );
            const json = await res.json().catch(() => ({}));
            const apiErr = apiErrorFromResponse(res, json);
            if (apiErr) {
                setIssueExtra({ error: apiErr });
                return;
            }
            setIssueExtra(json?.data ?? json);
        } catch (e) {
            setIssueExtra({ error: e.message || 'Request failed' });
        } finally {
            setIssueExtraLoading(false);
        }
    };

    const renderIssueDetailValue = (val) => {
        if (val == null) return '-';
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        if (typeof val === 'object') return <pre className="text-xs overflow-auto max-h-32 p-2 bg-gray-100 dark:bg-gray-700 rounded">{JSON.stringify(val, null, 2)}</pre>;
        return String(val);
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
        const showAdminKeyForm = isScKeyAdminUser();
        return (
            <div className={`rounded-lg border p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start gap-3 text-amber-600">
                    <i className="fas fa-exclamation-triangle text-xl mt-0.5"></i>
                    <div className="flex-1 min-w-0 space-y-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">Safety Culture not configured</p>
                        <p className="text-sm opacity-90 text-gray-700 dark:text-gray-300">{error}</p>
                        {status?.storedKeyInDatabase && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                A key is saved in the database but is missing or invalid. Replace it below or clear it.
                            </p>
                        )}
                        {showAdminKeyForm ? (
                            <div className={`rounded-md border p-4 space-y-3 ${isDark ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Safety Culture API key (starts with scapi_)
                                </label>
                                <input
                                    type="password"
                                    autoComplete="off"
                                    value={scApiKeyDraft}
                                    onChange={(e) => setScApiKeyDraft(e.target.value)}
                                    placeholder="scapi_…"
                                    className={`w-full max-w-xl rounded border px-3 py-2 text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                                {keySaveError && (
                                    <p className="text-sm text-red-600 dark:text-red-400">{keySaveError}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void saveScApiKey()}
                                        disabled={keySaving || !scApiKeyDraft.trim()}
                                        className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {keySaving ? 'Saving…' : 'Save key'}
                                    </button>
                                    {status?.storedKeyInDatabase ? (
                                        <button
                                            type="button"
                                            onClick={() => void clearStoredScApiKey()}
                                            disabled={keySaving}
                                            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                                        >
                                            Clear stored key
                                        </button>
                                    ) : null}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Keys are stored as plain text in the database; restrict who can use admin accounts. If SAFETY_CULTURE_API_KEY is set on the server, it takes priority over the database value.
                                </p>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <i className="fas fa-clipboard-check text-green-600"></i>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Safety Culture Inspections</h3>
                        {status?.connected && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                Connected
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={runImport}
                            disabled={importing || importingIssues || !status?.connected}
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
                                    Import Inspections as Job Cards
                                </>
                            )}
                        </button>
                        <button
                            onClick={runImportIssues}
                            disabled={importing || importingIssues || !status?.connected}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {importingIssues ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-exclamation-circle"></i>
                                    Import Issues as Job Cards
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
                <div className={`flex flex-wrap gap-x-6 gap-y-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={importIncludeSnapshot}
                            onChange={(e) => {
                                setImportIncludeSnapshot(e.target.checked);
                                if (!e.target.checked) setImportIncludeAnswers(false);
                            }}
                        />
                        Full snapshot on job card (feed + API detail)
                    </label>
                    <label className={`inline-flex items-center gap-2 cursor-pointer ${!importIncludeSnapshot ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input
                            type="checkbox"
                            checked={importIncludeAnswers}
                            disabled={!importIncludeSnapshot}
                            onChange={(e) => setImportIncludeAnswers(e.target.checked)}
                        />
                        Include inspection answers (slow / large)
                    </label>
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
                    onChange={(e) => {
                        if (activeTab === 'inspections') {
                            setSearchQuery(e.target.value);
                            setInspectionPage(1);
                        } else {
                            setIssuesSearchQuery(e.target.value);
                            setIssuesPage(1);
                        }
                    }}
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
                {activeTab === 'inspections' && autoLoadingInspections && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Loading remaining inspections in background...</p>
                )}
                {activeTab === 'issues' && autoLoadingIssues && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Loading remaining issues in background...</p>
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
                                        <SortableTh label="Issue" sortKey="title" currentSort={issuesSort} onSort={setIssuesSortKey} isDark={isDark} />
                                        <SortableTh label="Status" sortKey="status" currentSort={issuesSort} onSort={setIssuesSortKey} isDark={isDark} />
                                        <SortableTh label="Priority" sortKey="priority" currentSort={issuesSort} onSort={setIssuesSortKey} isDark={isDark} />
                                        <SortableTh label="Created" sortKey="created" currentSort={issuesSort} onSort={setIssuesSortKey} isDark={isDark} />
                                        <SortableTh label="Due" sortKey="due" currentSort={issuesSort} onSort={setIssuesSortKey} isDark={isDark} />
                                        <SortableTh label="Assignee" sortKey="assignee" currentSort={issuesSort} onSort={setIssuesSortKey} isDark={isDark} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedIssues.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-6 text-center text-gray-500">
                                                {issues.length === 0 ? 'No issues found' : 'No issues match your search'}
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedIssues.map((issue) => (
                                            <tr
                                                key={issue.id}
                                                onClick={() => setSelectedIssue(issue)}
                                                className={`border-t cursor-pointer ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'}`}
                                            >
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
                    {!issuesLoading && (sortedIssues.length > 0 || issues.length > 0) && (
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                Page {issuesPage} of {issuesTotalPages}
                                {' · '}
                                {issues.length} newest loaded
                                {issuesMetadata?.scanned_total != null && issuesMetadata.scanned_total > 0 && (
                                    <> · {issuesMetadata.scanned_total} row(s) scanned from SafetyCulture</>
                                )}
                                {issuesMetadata?.not_returned_after_sort > 0 && (
                                    <> · {issuesMetadata.not_returned_after_sort} older in scan not listed (increase limit or use Load more)</>
                                )}
                                {issuesMetadata?.next_page && issuesMetadata?.remaining_records != null && (
                                    <> · Upstream: ~{issuesMetadata.remaining_records} more in feed</>
                                )}
                            </span>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setIssuesPage(p => Math.max(1, p - 1))}
                                        disabled={issuesPage <= 1}
                                        className={`px-2 py-1 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'}`}
                                    >
                                        Prev
                                    </button>
                                    <button
                                        onClick={() => setIssuesPage(p => Math.min(issuesTotalPages, p + 1))}
                                        disabled={issuesPage >= issuesTotalPages}
                                        className={`px-2 py-1 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'}`}
                                    >
                                        Next
                                    </button>
                                </div>
                            {issuesMetadata?.next_page && (
                                <>
                                    <button
                                        onClick={loadMoreIssues}
                                        disabled={issuesLoadingMore}
                                        className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm flex items-center gap-2"
                                    >
                                        {issuesLoadingMore ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin"></i>
                                                Loading...
                                            </>
                                        ) : (
                                            <>
                                                Load more
                                                {issuesMetadata.remaining_records != null && ` (${issuesMetadata.remaining_records})`}
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={loadAllIssues}
                                        disabled={issuesLoadingMore}
                                        className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 text-sm flex items-center gap-2"
                                    >
                                        Load all
                                    </button>
                                </>
                            )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedIssue && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    onClick={() => setSelectedIssue(null)}
                >
                    <div
                        className={`max-w-4xl w-full max-h-[90vh] overflow-auto rounded-lg shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 z-10 bg-inherit">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                Issue: {selectedIssue.title || selectedIssue.name || selectedIssue.description || selectedIssue.id}
                            </h4>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void loadIssueFromApi(selectedIssue.id)}
                                    disabled={issueExtraLoading}
                                    className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                                >
                                    {issueExtraLoading ? 'Loading…' : 'Load full API record'}
                                </button>
                                {(selectedIssue.url || selectedIssue.web_url || selectedIssue.link) && (
                                    <a
                                        href={selectedIssue.url || selectedIssue.web_url || selectedIssue.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        Open in Safety Culture →
                                    </a>
                                )}
                                <button
                                    onClick={() => setSelectedIssue(null)}
                                    className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        {issueExtra?.error && (
                            <div className="mx-4 mt-3 text-sm text-red-600 dark:text-red-400">{issueExtra.error}</div>
                        )}
                        {issueExtra && !issueExtra.error && (
                            <details className="mx-4 mt-3 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                                <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200">
                                    SafetyCulture API detail (JSON)
                                </summary>
                                <pre className={`mt-2 text-xs overflow-auto max-h-64 p-2 rounded ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
                                    {JSON.stringify(issueExtra.detail ?? issueExtra, null, 2)}
                                </pre>
                            </details>
                        )}
                        <div className="p-4 space-y-3 text-sm">
                            {Object.entries(selectedIssue)
                                .sort(([a], [b]) => {
                                    const order = ['id', 'title', 'name', 'description', 'status', 'priority', 'created_at', 'createdAt', 'due_date', 'dueDate', 'assignee_name', 'assigneeName', 'modified_at', 'modifiedAt'];
                                    const ai = order.indexOf(a);
                                    const bi = order.indexOf(b);
                                    if (ai >= 0 && bi >= 0) return ai - bi;
                                    if (ai >= 0) return -1;
                                    if (bi >= 0) return 1;
                                    return a.localeCompare(b);
                                })
                                .map(([key, val]) => (
                                <div key={key} className="flex gap-3">
                                    <span className={`font-medium min-w-[140px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {key.replace(/_/g, ' ')}
                                    </span>
                                    <span className={`flex-1 break-words ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                        {renderIssueDetailValue(val)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'inspections' && (
            <>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className={isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                            <SortableTh label="Inspection" sortKey="name" currentSort={inspectionSort} onSort={setInspectionSortKey} isDark={isDark} />
                            <SortableTh label="Template" sortKey="template" currentSort={inspectionSort} onSort={setInspectionSortKey} isDark={isDark} />
                                        <th className={`text-left p-3 font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Owner</th>
                            <SortableTh label="Score" sortKey="score" currentSort={inspectionSort} onSort={setInspectionSortKey} isDark={isDark} />
                            <SortableTh label="Started" sortKey="started" currentSort={inspectionSort} onSort={setInspectionSortKey} isDark={isDark} />
                            <SortableTh label="Completed" sortKey="completed" currentSort={inspectionSort} onSort={setInspectionSortKey} isDark={isDark} />
                            <th className={`text-left p-3 font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Report</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedInspections.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-6 text-center text-gray-500">
                                    {inspections.length === 0 ? 'No inspections found' : 'No inspections match your search'}
                                </td>
                            </tr>
                        ) : (
                            paginatedInspections.map((insp) => (
                                <tr
                                    key={insp.id}
                                    onClick={() => setSelectedInspection(insp)}
                                    className={`border-t cursor-pointer ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'}`}
                                >
                                    <td className="p-3 font-medium text-gray-900 dark:text-gray-100">
                                        {insp.name || insp.template_name || insp.id}
                                    </td>
                                    <td className="p-3 text-gray-600 dark:text-gray-400">
                                        {insp.template_name || '-'}
                                    </td>
                                    <td className="p-3 text-gray-600 dark:text-gray-400">
                                        {insp.owner_name || insp.owner?.name || insp.author_name || '-'}
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
                                                onClick={(e) => e.stopPropagation()}
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

            {(sortedInspections.length > 0 || inspections.length > 0) && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Page {inspectionPage} of {inspectionTotalPages}
                        {' · '}
                        {inspections.length} newest loaded
                        {metadata?.scanned_total != null && metadata.scanned_total > 0 && (
                            <> · {metadata.scanned_total} row(s) scanned from SafetyCulture</>
                        )}
                        {metadata?.not_returned_after_sort > 0 && (
                            <> · {metadata.not_returned_after_sort} older in scan not listed (increase limit or use Load more)</>
                        )}
                        {metadata?.next_page && metadata?.remaining_records != null && (
                            <> · Upstream: ~{metadata.remaining_records} more in feed</>
                        )}
                    </span>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                            <button
                                onClick={() => setInspectionPage(p => Math.max(1, p - 1))}
                                disabled={inspectionPage <= 1}
                                className={`px-2 py-1 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'}`}
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setInspectionPage(p => Math.min(inspectionTotalPages, p + 1))}
                                disabled={inspectionPage >= inspectionTotalPages}
                                className={`px-2 py-1 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'}`}
                            >
                                Next
                            </button>
                        </div>
                    {metadata?.next_page && (
                        <>
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm flex items-center gap-2"
                            >
                                {loadingMore ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i>
                                        Loading...
                                    </>
                                ) : (
                                    <>
                                        Load more
                                        {metadata.remaining_records != null && ` (${metadata.remaining_records})`}
                                    </>
                                )}
                            </button>
                            <button
                                onClick={loadAllInspections}
                                disabled={loadingMore}
                                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 text-sm flex items-center gap-2"
                            >
                                Load all
                            </button>
                        </>
                    )}
                    </div>
                </div>
            )}
            </>
            )}

            {selectedInspection && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    onClick={() => setSelectedInspection(null)}
                >
                    <div
                        className={`max-w-4xl w-full max-h-[90vh] overflow-auto rounded-lg shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 z-10 bg-inherit flex-wrap gap-2">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                Inspection: {selectedInspection.name || selectedInspection.template_name || selectedInspection.id}
                            </h4>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => void loadInspectionFromApi(false, selectedInspection.id)}
                                    disabled={inspectionExtraLoading}
                                    className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                                >
                                    {inspectionExtraLoading && !inspectionExtraWithAnswers ? 'Loading…' : 'API detail'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void loadInspectionFromApi(true, selectedInspection.id)}
                                    disabled={inspectionExtraLoading}
                                    className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                                    title="Fetches all checklist answers; may be slow"
                                >
                                    {inspectionExtraLoading && inspectionExtraWithAnswers ? 'Loading…' : 'API + answers'}
                                </button>
                                {selectedInspection.web_report_link && (
                                    <a
                                        href={selectedInspection.web_report_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        Open report →
                                    </a>
                                )}
                                <button
                                    onClick={() => setSelectedInspection(null)}
                                    className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        {inspectionExtra?.error && (
                            <div className="mx-4 mt-3 text-sm text-red-600 dark:text-red-400">{inspectionExtra.error}</div>
                        )}
                        {inspectionExtra && !inspectionExtra.error && (
                            <details className="mx-4 mt-3 border border-gray-200 dark:border-gray-600 rounded-lg p-3" open>
                                <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200">
                                    SafetyCulture API {inspectionExtraWithAnswers ? '(detail + answers)' : '(detail)'}
                                    {Array.isArray(inspectionExtra.answers) && (
                                        <span className="ml-2 font-normal opacity-75">
                                            — {inspectionExtra.answers.length} answer row(s)
                                        </span>
                                    )}
                                </summary>
                                <pre className={`mt-2 text-xs overflow-auto max-h-96 p-2 rounded ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
                                    {JSON.stringify(inspectionExtra, null, 2)}
                                </pre>
                            </details>
                        )}
                        <div className="p-4 space-y-3 text-sm">
                            {Object.entries(selectedInspection)
                                .sort(([a], [b]) => {
                                    const order = ['id', 'name', 'template_name', 'owner_name', 'score', 'max_score', 'date_started', 'date_completed', 'modified_at'];
                                    const ai = order.indexOf(a);
                                    const bi = order.indexOf(b);
                                    if (ai >= 0 && bi >= 0) return ai - bi;
                                    if (ai >= 0) return -1;
                                    if (bi >= 0) return 1;
                                    return a.localeCompare(b);
                                })
                                .map(([key, val]) => (
                                <div key={key} className="flex gap-3">
                                    <span className={`font-medium min-w-[140px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {key.replace(/_/g, ' ')}
                                    </span>
                                    <span className={`flex-1 break-words ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                        {renderIssueDetailValue(val)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

window.SafetyCultureInspections = SafetyCultureInspections;
