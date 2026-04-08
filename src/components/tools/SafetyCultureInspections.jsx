// Safety Culture Inspections - View iAuditor inspections in ERP
const { useState, useEffect, useMemo } = React;

const API_BASE = window.location.origin + '/api';
const PAGE_SIZE = 20;
const scMediaSignedUrlCache = new Map();
/** Non-OK API responses use `{ error: { message, code } }` — surface instead of empty lists. */
const apiErrorFromResponse = (res, json) => {
    if (res.ok) return null;
    const err = json?.error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && err.message) return String(err.message);
    return json?.message ? String(json.message) : `Request failed (${res.status})`;
};

/** Dedupe list merges by SafetyCulture id, or issue `unique_id` when `id` is absent. */
const mergeUniqueById = (existing, incoming) => {
    const keyOf = (item) => String(item?.id ?? item?.unique_id ?? '');
    const seen = new Set((existing || []).map(keyOf).filter(Boolean));
    const next = [...(existing || [])];
    (incoming || []).forEach((item) => {
        const key = keyOf(item);
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

function formatScLocationLines(o) {
    if (!o || typeof o !== 'object') return [];
    const lines = [];
    if (o.name) lines.push(String(o.name));
    const region = [o.locality, o.administrative_area, o.region, o.country].filter(Boolean);
    if (region.length) lines.push(region.join(', '));
    if (o.address && typeof o.address === 'string') lines.push(o.address);
    if (o.formatted_address) lines.push(String(o.formatted_address));
    if (o.postal_code) lines.push(`Postal code: ${o.postal_code}`);
    if (o.latitude != null && o.longitude != null) {
        lines.push(`Map: ${o.latitude}, ${o.longitude}`);
    }
    return lines;
}

function renderScTaskBlock(o) {
    if (!o || typeof o !== 'object') return null;
    const name = [o.firstname || o.first_name, o.lastname || o.last_name].filter(Boolean).join(' ');
    const desc = o.description || o.summary || o.title || '';
    return (
        <div className="space-y-1">
            {name ? (
                <div>
                    <span className="opacity-70 text-xs uppercase tracking-wide">Assignee</span>
                    <div className="font-medium">{name}</div>
                </div>
            ) : null}
            {desc ? (
                <div>
                    <span className="opacity-70 text-xs uppercase tracking-wide">Description</span>
                    <div className="whitespace-pre-wrap mt-0.5">{desc}</div>
                </div>
            ) : null}
            {o.task_id ? <div className="text-xs opacity-60">Task ID: {o.task_id}</div> : null}
        </div>
    );
}

function renderScCategoryBlock(o) {
    if (!o || typeof o !== 'object') return null;
    const label = o.label || o.category_label || o.name;
    const desc = o.description || o.category_description;
    if (!label && !desc) return null;
    return (
        <div className="space-y-1">
            {label ? <div className="font-medium">{label}</div> : null}
            {desc ? <div className="text-sm opacity-90 whitespace-pre-wrap">{desc}</div> : null}
            {o.id ? <div className="text-xs opacity-60">ID: {o.id}</div> : null}
        </div>
    );
}

function renderScItemsList(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return <span className="opacity-70">None</span>;
    }
    return (
        <ol className="list-decimal list-inside space-y-2 text-sm">
            {arr.map((item, idx) => {
                if (!item || typeof item !== 'object') {
                    return <li key={idx}>{String(item)}</li>;
                }
                const type = (item.type || item.item_type || '').toString().replace(/^ITEM_TYPE_/, '') || 'Field';
                const q = item.question_data || item.question || {};
                const label = q.label || q.title || item.name || item.label || `Item ${idx + 1}`;
                const text =
                    item.text ||
                    item.text_value ||
                    item.string_value ||
                    item.answer?.text ||
                    item.answer?.value ||
                    (item.value != null && typeof item.value === 'string' ? item.value : '');
                return (
                    <li key={item.id || idx} className="pl-1">
                        <span className="font-medium">{label}</span>
                        <span className="text-xs opacity-70 ml-1">({type})</span>
                        {text ? <div className="whitespace-pre-wrap mt-0.5 pl-0 opacity-95">{text}</div> : null}
                    </li>
                );
            })}
        </ol>
    );
}

function renderScInspectionsList(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return <span className="opacity-70">None linked</span>;
    }
    return (
        <ul className="list-disc list-inside space-y-1 text-sm">
            {arr.map((insp, idx) => {
                if (!insp || typeof insp !== 'object') return <li key={idx}>{String(insp)}</li>;
                const title = insp.title || insp.name || insp.template_title || insp.id;
                return (
                    <li key={insp.id || idx}>
                        <span className="font-medium">{title}</span>
                        {insp.status ? <span className="text-xs opacity-70 ml-2">{insp.status}</span> : null}
                    </li>
                );
            })}
        </ul>
    );
}

const ScMediaTile = ({ item, isDark, getHeaders }) => {
    const [src, setSrc] = useState(null);
    const [err, setErr] = useState(null);
    const id = item?.id || item?.media_id || item?.document_id;
    const token = item?.token || item?.download_token || item?.media_token || item?.access_token;
    const mediaType = item?.media_type || item?.mediaType || '';
    const fileName = item?.file_name || item?.filename || item?.name || 'Attachment';

    useEffect(() => {
        if (!id || !token) {
            setErr('Missing media id or token');
            return;
        }
        const cacheKey = `${id}:${token}:${mediaType || ''}`;
        const cached = scMediaSignedUrlCache.get(cacheKey);
        if (cached?.url) {
            setSrc(cached.url);
            setErr(null);
            return;
        }
        if (cached?.error) {
            setErr(cached.error);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const params = new URLSearchParams({ id: String(id), token: String(token) });
                if (mediaType) params.set('media_type', String(mediaType));
                const res = await fetch(`${API_BASE}/safety-culture/media/sign-url?${params}`, { headers: getHeaders() });
                const json = await res.json().catch(() => ({}));
                const u = json?.data?.url;
                if (!res.ok || !u) {
                    const msg =
                        (typeof json?.error === 'object' && json?.error?.message) ||
                        json?.error ||
                        json?.message ||
                        `Could not load media (${res.status})`;
                    const safeMsg = String(msg);
                    scMediaSignedUrlCache.set(cacheKey, { error: safeMsg });
                    if (!cancelled) setErr(safeMsg);
                    return;
                }
                scMediaSignedUrlCache.set(cacheKey, { url: u });
                if (!cancelled) setSrc(u);
            } catch (e) {
                const safeMsg = e.message || 'Request failed';
                scMediaSignedUrlCache.set(cacheKey, { error: safeMsg });
                if (!cancelled) setErr(safeMsg);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id, token, mediaType]);

    const isImage =
        String(mediaType).includes('IMAGE') ||
        /\.(jpe?g|png|gif|webp)$/i.test(fileName);

    const cardClass = isDark ? 'border-gray-600 bg-gray-900/50' : 'border-gray-200 bg-gray-50';

    return (
        <div className={`rounded-lg border p-2 max-w-xs ${cardClass}`}>
            <div className="text-xs font-medium truncate mb-1" title={fileName}>
                {fileName}
            </div>
            {err ? <div className="text-xs text-red-500 dark:text-red-400">{err}</div> : null}
            {!err && !src ? (
                <div className="text-xs opacity-60 py-4 flex items-center gap-2">
                    <i className="fas fa-spinner fa-spin" />
                    Loading…
                </div>
            ) : null}
            {src && isImage ? (
                <a href={src} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={src} alt="" className="max-w-full max-h-56 rounded object-contain mx-auto" />
                </a>
            ) : null}
            {src && !isImage ? (
                <a href={src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                    Open / download file
                </a>
            ) : null}
        </div>
    );
};

function renderScMediaList(items, isDark, getHeaders) {
    if (!Array.isArray(items) || items.length === 0) {
        return <span className="opacity-70">None</span>;
    }
    return (
        <div className="flex flex-wrap gap-3">
            {items.map((item, idx) => (
                <ScMediaTile key={item?.id || item?.media_id || idx} item={item} isDark={isDark} getHeaders={getHeaders} />
            ))}
        </div>
    );
}

function renderIssueDetailField(key, val, isDark, getHeaders) {
    if (val == null) return '-';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val !== 'object') return String(val);
    const k = key.toLowerCase();

    if (k === 'location' && !Array.isArray(val)) {
        const lines = formatScLocationLines(val);
        if (lines.length) {
            return (
                <div className="space-y-0.5">
                    {lines.map((t, i) => (
                        <div key={i}>{t}</div>
                    ))}
                </div>
            );
        }
    }

    if ((k === 'task' || k === 'tasks') && Array.isArray(val)) {
        if (val.length === 0) return <span className="opacity-70">None</span>;
        return (
            <div className="space-y-3">
                {val.map((t, i) => (
                    <div
                        key={t?.task_id || t?.id || i}
                        className="border-l-2 pl-2 border-gray-300 dark:border-gray-600"
                    >
                        {renderScTaskBlock(t)}
                    </div>
                ))}
            </div>
        );
    }

    if ((k === 'task' || k === 'tasks') && !Array.isArray(val)) {
        const block = renderScTaskBlock(val);
        if (block) return block;
    }

    if ((k === 'category' || k === 'categories') && !Array.isArray(val)) {
        const block = renderScCategoryBlock(val);
        if (block) return block;
    }

    const mediaArrayKeys = new Set(['media', 'medias', 'images', 'attachments', 'photos', 'files', 'media_items', 'evidence']);
    if (mediaArrayKeys.has(k) && Array.isArray(val)) {
        const looksLikeSignedMedia = val.some(
            (x) => x && typeof x === 'object' && (x.token || x.download_token || x.media_token) && (x.id || x.media_id || x.document_id)
        );
        if (looksLikeSignedMedia || k === 'media' || k === 'medias' || k === 'images') {
            return renderScMediaList(val, isDark, getHeaders);
        }
    }

    if (mediaArrayKeys.has(k) && val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.items)) {
        return renderScMediaList(val.items, isDark, getHeaders);
    }

    if (mediaArrayKeys.has(k) && val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.media)) {
        return renderScMediaList(val.media, isDark, getHeaders);
    }

    if (k === 'items' && Array.isArray(val)) {
        return renderScItemsList(val);
    }

    if (k === 'inspections' && Array.isArray(val)) {
        return renderScInspectionsList(val);
    }

    if (Array.isArray(val) && val.length > 0 && val.every((x) => x != null && typeof x !== 'object')) {
        return val.join(', ');
    }

    return (
        <details className="group">
            <summary className="cursor-pointer text-xs text-blue-600 dark:text-blue-400">Raw data</summary>
            <pre className="mt-2 text-xs overflow-auto max-h-40 p-2 rounded bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
                {JSON.stringify(val, null, 2)}
            </pre>
        </details>
    );
}

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
    const [cacheSyncing, setCacheSyncing] = useState(false);
    const [cacheSyncError, setCacheSyncError] = useState(null);

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
                    void loadAllInspectionsFrom(inspData.metadata.next_page, true, null);
                } else if (inspData?.metadata?.cache_offset_next != null) {
                    void loadAllInspectionsFrom(null, true, inspData.metadata.cache_offset_next);
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

    const loadAllInspectionsFrom = async (startNextPage = null, silent = false, startCacheOffset = null) => {
        if (!silent) setLoadingMore(true);
        if (silent) setAutoLoadingInspections(true);
        try {
            let next = startNextPage ?? null;
            let cacheOff = startCacheOffset ?? null;
            if (next == null && cacheOff == null) {
                next = metadata?.next_page || null;
                if (metadata?.source === 'local_cache' && metadata?.cache_offset_next != null) {
                    cacheOff = metadata.cache_offset_next;
                }
            }
            while (true) {
                let url;
                if (cacheOff != null) {
                    url = `${API_BASE}/safety-culture/inspections?limit=200&cache_offset=${cacheOff}&enrich_cap=100`;
                } else if (next) {
                    url = `${API_BASE}/safety-culture/inspections?next_page=${encodeURIComponent(next)}`;
                } else {
                    break;
                }
                const res = await fetch(url, { headers: getHeaders() });
                const json = await res.json().catch(() => ({}));
                const data = json?.data ?? json;
                const more = data.inspections ?? [];
                setInspections(prev => mergeUniqueById(prev, more));
                const meta = data.metadata ?? { next_page: null, remaining_records: 0 };
                setMetadata(meta);
                if (meta.source === 'local_cache' && meta.cache_offset_next != null) {
                    cacheOff = meta.cache_offset_next;
                    next = null;
                } else if (meta.next_page) {
                    next = meta.next_page;
                    cacheOff = null;
                } else {
                    break;
                }
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
        const cacheNext = metadata?.source === 'local_cache' ? metadata?.cache_offset_next : null;
        if (!next && cacheNext == null) return;
        setLoadingMore(true);
        try {
            const url =
                cacheNext != null
                    ? `${API_BASE}/safety-culture/inspections?limit=200&cache_offset=${cacheNext}&enrich_cap=100`
                    : `${API_BASE}/safety-culture/inspections?next_page=${encodeURIComponent(next)}`;
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
            await loadAllInspectionsFrom(
                metadata?.next_page,
                false,
                metadata?.source === 'local_cache' ? metadata?.cache_offset_next : null
            );
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
                void loadAllIssuesFrom(data.metadata.next_page, true, null);
            } else if (data?.metadata?.cache_offset_next != null) {
                void loadAllIssuesFrom(null, true, data.metadata.cache_offset_next);
            }
        } catch (e) {
            setError(e.message || 'Failed to load issues');
        } finally {
            setIssuesLoading(false);
        }
    };

    const runCacheSync = async (full = false) => {
        if (!status?.connected) return;
        setCacheSyncing(true);
        setCacheSyncError(null);
        try {
            // Incremental: moderate detail merge. Full re-sync: max cap (200) server allows per run —
            // still only the *first* N rows get detail API merge; all rows get feed data.
            const enrichCap = full ? 200 : 40;
            const res = await fetch(`${API_BASE}/safety-culture/sync`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ full, enrichCap })
            });
            const json = await res.json().catch(() => ({}));
            const apiErr = apiErrorFromResponse(res, json);
            if (apiErr) {
                setCacheSyncError(apiErr);
                return;
            }
            setReloadNonce((n) => n + 1);
            if (activeTab === 'issues') {
                void loadIssues();
            }
        } catch (e) {
            setCacheSyncError(e.message || 'Sync failed');
        } finally {
            setCacheSyncing(false);
        }
    };

    const loadAllIssuesFrom = async (startNextPage = null, silent = false, startCacheOffset = null) => {
        if (!silent) setIssuesLoadingMore(true);
        if (silent) setAutoLoadingIssues(true);
        try {
            let next = startNextPage ?? null;
            let cacheOff = startCacheOffset ?? null;
            if (next == null && cacheOff == null) {
                next = issuesMetadata?.next_page || null;
                if (issuesMetadata?.source === 'local_cache' && issuesMetadata?.cache_offset_next != null) {
                    cacheOff = issuesMetadata.cache_offset_next;
                }
            }
            while (true) {
                let url;
                if (cacheOff != null) {
                    url = `${API_BASE}/safety-culture/issues?limit=200&cache_offset=${cacheOff}&enrich_cap=100`;
                } else if (next) {
                    url = `${API_BASE}/safety-culture/issues?next_page=${encodeURIComponent(next)}`;
                } else {
                    break;
                }
                const res = await fetch(url, { headers: getHeaders() });
                const json = await res.json().catch(() => ({}));
                const data = json?.data ?? json;
                setIssues(prev => mergeUniqueById(prev, data.issues ?? []));
                const meta = data.metadata ?? { next_page: null, remaining_records: 0 };
                setIssuesMetadata(meta);
                if (meta.source === 'local_cache' && meta.cache_offset_next != null) {
                    cacheOff = meta.cache_offset_next;
                    next = null;
                } else if (meta.next_page) {
                    next = meta.next_page;
                    cacheOff = null;
                } else {
                    break;
                }
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
        const cacheNext = issuesMetadata?.source === 'local_cache' ? issuesMetadata?.cache_offset_next : null;
        if (!next && cacheNext == null) return;
        setIssuesLoadingMore(true);
        try {
            const url =
                cacheNext != null
                    ? `${API_BASE}/safety-culture/issues?limit=200&cache_offset=${cacheNext}&enrich_cap=100`
                    : `${API_BASE}/safety-culture/issues?next_page=${encodeURIComponent(next)}`;
            const res = await fetch(url, { headers: getHeaders() });
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
            await loadAllIssuesFrom(
                issuesMetadata?.next_page,
                false,
                issuesMetadata?.source === 'local_cache' ? issuesMetadata?.cache_offset_next : null
            );
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
            const id = (i.id || i.unique_id || '').toLowerCase();
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

    /** Merge list row with live/cached API detail so media tokens and extra fields stay current in the modal grid. */
    const inspectionDisplayRecord = useMemo(() => {
        if (!selectedInspection) return null;
        const raw =
            inspectionExtra &&
            !inspectionExtra.error &&
            inspectionExtra.detail &&
            typeof inspectionExtra.detail === 'object' &&
            !Array.isArray(inspectionExtra.detail)
                ? inspectionExtra.detail
                : null;
        if (!raw) return selectedInspection;
        return { ...selectedInspection, ...raw };
    }, [selectedInspection, inspectionExtra]);

    useEffect(() => {
        if (!selectedInspection) {
            setInspectionExtra(null);
            setInspectionExtraWithAnswers(false);
            return;
        }
        const id = selectedInspection.id;
        if (!id) return;
        let cancelled = false;
        setInspectionExtraLoading(true);
        setInspectionExtra(null);
        setInspectionExtraWithAnswers(false);
        (async () => {
            try {
                const res = await fetch(
                    `${API_BASE}/safety-culture/inspections/detail?id=${encodeURIComponent(String(id))}&live=1`,
                    { headers: getHeaders() }
                );
                const json = await res.json().catch(() => ({}));
                const apiErr = apiErrorFromResponse(res, json);
                if (cancelled) return;
                if (apiErr) {
                    setInspectionExtra({ error: apiErr });
                    return;
                }
                setInspectionExtra(json?.data ?? json);
            } catch (e) {
                if (!cancelled) setInspectionExtra({ error: e.message || 'Request failed' });
            } finally {
                if (!cancelled) setInspectionExtraLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedInspection?.id]);

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
            const q = `${withAnswers ? '&include_answers=1' : ''}&live=1`;
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
        const id = issueId || selectedIssue?.id || selectedIssue?.unique_id;
        if (!id) return;
        setIssueExtraLoading(true);
        setIssueExtra(null);
        try {
            const res = await fetch(
                `${API_BASE}/safety-culture/issues/detail?id=${encodeURIComponent(id)}&live=1`,
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

    /** Merge list row with cached/API detail so media, inspection links, etc. appear in the modal grid. */
    const issueDisplayRecord = useMemo(() => {
        if (!selectedIssue) return null;
        const raw =
            issueExtra &&
            !issueExtra.error &&
            issueExtra.detail &&
            typeof issueExtra.detail === 'object' &&
            !Array.isArray(issueExtra.detail)
                ? issueExtra.detail
                : null;
        if (!raw) return selectedIssue;
        return { ...selectedIssue, ...raw };
    }, [selectedIssue, issueExtra]);

    useEffect(() => {
        if (!selectedIssue) {
            setIssueExtra(null);
            return;
        }
        const id = selectedIssue.id || selectedIssue.unique_id;
        if (!id) return;
        let cancelled = false;
        setIssueExtraLoading(true);
        setIssueExtra(null);
        (async () => {
            try {
                const res = await fetch(
                    `${API_BASE}/safety-culture/issues/detail?id=${encodeURIComponent(String(id))}&live=1`,
                    { headers: getHeaders() }
                );
                const json = await res.json().catch(() => ({}));
                const apiErr = apiErrorFromResponse(res, json);
                if (cancelled) return;
                if (apiErr) {
                    setIssueExtra({ error: apiErr });
                    return;
                }
                setIssueExtra(json?.data ?? json);
            } catch (e) {
                if (!cancelled) setIssueExtra({ error: e.message || 'Request failed' });
            } finally {
                if (!cancelled) setIssueExtraLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedIssue?.id, selectedIssue?.unique_id]);

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
                {status?.configured && status?.connected && status?.localCache != null && (
                    <div
                        className={`flex flex-wrap items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                        <span>
                            Local cache: {status.localCache.inspections} inspections, {status.localCache.issues}{' '}
                            issues
                            {status.localCache.lastRunAt
                                ? ` · Last sync ${formatDate(status.localCache.lastRunAt)}`
                                : ''}
                        </span>
                        <button
                            type="button"
                            onClick={() => void runCacheSync(false)}
                            disabled={cacheSyncing}
                            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                            {cacheSyncing ? (
                                <>
                                    <i className="fas fa-spinner fa-spin mr-1"></i>Syncing…
                                </>
                            ) : (
                                <>Update cache</>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => void runCacheSync(true)}
                            disabled={cacheSyncing}
                            title="Re-fetch all inspection/issue feed pages into the database (up to server page limit). First 200 rows also merge SafetyCulture detail per run; open a row to cache its detail anytime."
                            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                            Full re-sync
                        </button>
                        <span className="opacity-80">
                            Lists read from DB when populated; add ?live=1 to API to force SafetyCulture. Raise
                            SAFETY_CULTURE_SYNC_MAX_PAGES on the server if feeds are huge.
                        </span>
                    </div>
                )}
                {cacheSyncError ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{cacheSyncError}</p>
                ) : null}
                {status?.localCache?.lastRunError ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        Last sync error: {status.localCache.lastRunError}
                    </p>
                ) : null}
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
                                                key={issue.id || issue.unique_id}
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
                                {(issuesMetadata?.next_page || issuesMetadata?.cache_offset_next != null) &&
                                    issuesMetadata?.remaining_records != null && (
                                    <> · Upstream: ~{issuesMetadata.remaining_records} more in feed</>
                                )}
                                {issuesMetadata?.source === 'local_cache' && issuesMetadata?.cache_rows_loaded != null && (
                                    <> · Local cache ({issuesMetadata.cache_rows_loaded} rows scanned for filters)</>
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
                            {(issuesMetadata?.next_page || issuesMetadata?.cache_offset_next != null) && (
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
                                Issue:{' '}
                                {(issueDisplayRecord || selectedIssue).title ||
                                    (issueDisplayRecord || selectedIssue).name ||
                                    (issueDisplayRecord || selectedIssue).description ||
                                    (issueDisplayRecord || selectedIssue).id ||
                                    (issueDisplayRecord || selectedIssue).unique_id}
                            </h4>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void loadIssueFromApi(selectedIssue.id || selectedIssue.unique_id)}
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
                            {issueExtraLoading ? (
                                <div className="text-xs opacity-70 py-2 flex items-center gap-2">
                                    <i className="fas fa-spinner fa-spin" />
                                    Loading full issue record (photos and links come from this)…
                                </div>
                            ) : null}
                            {Object.entries(issueDisplayRecord || selectedIssue)
                                .filter(([key]) => key !== '_enrichment')
                                .sort(([a], [b]) => {
                                    const order = [
                                        'id',
                                        'title',
                                        'name',
                                        'description',
                                        'status',
                                        'priority',
                                        'location',
                                        'location_name',
                                        'site_name',
                                        'site_id',
                                        'task',
                                        'category',
                                        'category_label',
                                        'media',
                                        'items',
                                        'inspections',
                                        'unique_id',
                                        'created_at',
                                        'createdAt',
                                        'due_at',
                                        'due_date',
                                        'dueDate',
                                        'assignee_name',
                                        'assigneeName',
                                        'creator_user_name',
                                        'modified_at',
                                        'modifiedAt'
                                    ];
                                    const ai = order.indexOf(a);
                                    const bi = order.indexOf(b);
                                    if (ai >= 0 && bi >= 0) return ai - bi;
                                    if (ai >= 0) return -1;
                                    if (bi >= 0) return 1;
                                    return a.localeCompare(b);
                                })
                                .map(([key, val]) => (
                                <div key={key} className="flex gap-3">
                                    <span className={`font-medium min-w-[140px] shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {key.replace(/_/g, ' ')}
                                    </span>
                                    <span className={`flex-1 break-words min-w-0 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                        {renderIssueDetailField(key, val, isDark, getHeaders)}
                                    </span>
                                </div>
                            ))}
                            {selectedIssue._enrichment && !selectedIssue._enrichment.ok ? (
                                <div className={`text-xs pt-2 border-t ${isDark ? 'border-gray-600 text-amber-400' : 'border-gray-200 text-amber-800'}`}>
                                    Detail merge: {selectedIssue._enrichment.error || selectedIssue._enrichment.reason || 'partial'}
                                </div>
                            ) : null}
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
                        {(metadata?.next_page || metadata?.cache_offset_next != null) && metadata?.remaining_records != null && (
                            <> · Upstream: ~{metadata.remaining_records} more in feed</>
                        )}
                        {metadata?.source === 'local_cache' && metadata?.cache_rows_loaded != null && (
                            <> · Local cache ({metadata.cache_rows_loaded} rows scanned for filters)</>
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
                    {(metadata?.next_page || metadata?.cache_offset_next != null) && (
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
                            {Object.entries(inspectionDisplayRecord || selectedInspection)
                                .filter(([key]) => key !== '_enrichment')
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
                                    <span className={`font-medium min-w-[140px] shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {key.replace(/_/g, ' ')}
                                    </span>
                                    <span className={`flex-1 break-words min-w-0 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                        {renderIssueDetailField(key, val, isDark, getHeaders)}
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
