/**
 * Project Correspondence — threads, formal log fields, attachments, project CC inbox.
 */
const { useState, useEffect, useCallback, useMemo } = React;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_TYPES = [
    { id: 'formal_letter', label: 'Formal letter' },
    { id: 'email', label: 'Email' },
    { id: 'phone_call', label: 'Phone call' },
    { id: 'meeting', label: 'Meeting / minutes' },
    { id: 'site_visit', label: 'Site visit' },
    { id: 'memo', label: 'Memo / note' },
    { id: 'contract', label: 'Contract / agreement' },
    { id: 'notice', label: 'Notice / instruction' },
    { id: 'invoice_payment', label: 'Invoice / payment' },
    { id: 'other', label: 'Other' }
];

const DEFAULT_STATUSES = [
    { id: 'open', label: 'Open' },
    { id: 'pending', label: 'Awaiting response' },
    { id: 'closed', label: 'Closed' },
    { id: 'archived', label: 'Archived' }
];

const DEFAULT_CONFIDENTIALITY = [
    { id: 'standard', label: 'Standard' },
    { id: 'client', label: 'Client confidential' },
    { id: 'internal', label: 'Internal only' }
];

function formatDateTime(value) {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return '';
    }
}

function formatDateOnly(value) {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) {
        return '';
    }
}

function toLocalInputValue(date) {
    const d = date ? new Date(date) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInputValue(date) {
    const d = date ? new Date(date) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function labelFor(list, id) {
    return (list || []).find((x) => x.id === id)?.label || id || 'Other';
}

function parseProjectContacts(raw) {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((c) => {
                const email = (c?.email || '').trim();
                if (!EMAIL_RE.test(email)) return null;
                const name = (c?.name || c?.contactName || '').trim();
                return { email, name, label: name ? `${name} <${email}>` : email };
            })
            .filter(Boolean);
    } catch (_) {
        return [];
    }
}

function kindBadge(kind) {
    if (kind === 'sent') return { label: 'Sent', cls: 'bg-sky-100 text-sky-800' };
    if (kind === 'received') return { label: 'Received', cls: 'bg-emerald-100 text-emerald-800' };
    return { label: 'Logged', cls: 'bg-gray-100 text-gray-700' };
}

function emptyManualForm() {
    return {
        correspondenceType: 'memo',
        direction: 'internal',
        occurredAt: toLocalInputValue(new Date()),
        contactName: '',
        contactOrganization: '',
        contactPhone: '',
        externalReference: '',
        participants: '',
        location: '',
        durationMinutes: '',
        subject: '',
        body: '',
        actionRequired: '',
        followUpDate: '',
        outcome: '',
        confidentiality: 'standard',
        attachments: []
    };
}

function Field({ label, children, className = '' }) {
    return (
        <div className={className}>
            {label ? <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label> : null}
            {children}
        </div>
    );
}

function inputCls() {
    return 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600';
}

function AttachmentList({ items, onRemove }) {
    if (!items?.length) return null;
    return (
        <ul className="mt-2 space-y-1">
            {items.map((a, i) => (
                <li key={`${a.filePath || a.fileName}-${i}`} className="flex items-center gap-2 text-xs text-gray-600">
                    <i className="fas fa-paperclip text-gray-400"></i>
                    <span className="flex-1 truncate">{a.fileName}</span>
                    {onRemove ? (
                        <button type="button" className="text-red-500 hover:text-red-700" onClick={() => onRemove(i)} title="Remove">
                            <i className="fas fa-times"></i>
                        </button>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}

/** Label-wrapped file input — reliable native picker (hidden display:none inputs often block programmatic click). */
function FileAttachButton({ inputId, label, disabled, onFilesSelected }) {
    return (
        <label
            htmlFor={inputId}
            className={`inline-flex items-center text-xs text-primary-600 cursor-pointer hover:text-primary-700 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            <input
                id={inputId}
                type="file"
                multiple
                accept="*/*"
                className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
                style={{ clip: 'rect(0,0,0,0)', clipPath: 'inset(50%)' }}
                disabled={disabled}
                onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    if (files.length) onFilesSelected(files);
                }}
            />
            <i className="fas fa-paperclip mr-1"></i>
            {label}
        </label>
    );
}

function EntryDetail({ entry, types }) {
    const badge = kindBadge(entry.kind);
    return (
        <div className="px-3 py-3 text-sm text-gray-800 dark:text-gray-200 space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
                <span className={`font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800">{labelFor(types, entry.correspondenceType)}</span>
                {entry.direction ? <span className="text-gray-500 capitalize">{entry.direction}</span> : null}
                {entry.confidentiality && entry.confidentiality !== 'standard' ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">{labelFor(DEFAULT_CONFIDENTIALITY, entry.confidentiality)}</span>
                ) : null}
            </div>
            {entry.subject && entry.kind !== 'manual' ? (
                <div className="font-medium text-gray-900 dark:text-gray-100">{entry.subject}</div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                {entry.fromEmail ? <div><span className="font-medium">From:</span> {entry.fromEmail}</div> : null}
                {(entry.toEmails || []).length > 0 ? <div><span className="font-medium">To:</span> {entry.toEmails.join(', ')}</div> : null}
                {(entry.ccEmails || []).length > 0 ? <div><span className="font-medium">CC:</span> {entry.ccEmails.join(', ')}</div> : null}
                {entry.contactName ? <div><span className="font-medium">Contact:</span> {entry.contactName}</div> : null}
                {entry.contactOrganization ? <div><span className="font-medium">Organisation:</span> {entry.contactOrganization}</div> : null}
                {entry.contactPhone ? <div><span className="font-medium">Phone:</span> {entry.contactPhone}</div> : null}
                {entry.externalReference ? <div><span className="font-medium">Their ref:</span> {entry.externalReference}</div> : null}
                {entry.location ? <div><span className="font-medium">Location:</span> {entry.location}</div> : null}
                {entry.durationMinutes ? <div><span className="font-medium">Duration:</span> {entry.durationMinutes} min</div> : null}
                {entry.followUpDate ? <div><span className="font-medium">Follow-up:</span> {formatDateOnly(entry.followUpDate)}</div> : null}
            </div>
            {entry.actionRequired ? (
                <div className="text-xs bg-amber-50 border border-amber-100 rounded p-2 text-amber-900">
                    <span className="font-medium">Action required:</span> {entry.actionRequired}
                </div>
            ) : null}
            <div className="whitespace-pre-wrap">{entry.bodyText || '(No content)'}</div>
            {entry.outcome ? (
                <div className="text-xs text-gray-600 border-t pt-2"><span className="font-medium">Outcome:</span> {entry.outcome}</div>
            ) : null}
            {(entry.attachments || []).length > 0 ? (
                <ul className="space-y-1 border-t pt-2">
                    <li className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Attachments</li>
                    {entry.attachments.map((a, i) => (
                        <li key={i}>
                            <a href={a.filePath} target="_blank" rel="noopener noreferrer" download={a.fileName} className="text-xs text-primary-600 hover:underline">
                                <i className="fas fa-download mr-1"></i>{a.fileName}
                                {a.size ? <span className="text-gray-400 ml-1">({Math.round(a.size / 1024)} KB)</span> : null}
                            </a>
                        </li>
                    ))}
                </ul>
            ) : null}
            {(entry.emailArchivePath || entry.rawEmailPath) ? (
                <ul className="space-y-1 border-t pt-2">
                    <li className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Saved email</li>
                    {entry.rawEmailPath ? (
                        <li>
                            <a href={entry.rawEmailPath} target="_blank" rel="noopener noreferrer" download className="text-xs text-primary-600 hover:underline">
                                <i className="fas fa-envelope mr-1"></i>Original email (.eml)
                            </a>
                        </li>
                    ) : null}
                    {entry.emailArchivePath ? (
                        <li>
                            <a href={entry.emailArchivePath} target="_blank" rel="noopener noreferrer" download className="text-xs text-primary-600 hover:underline">
                                <i className="fas fa-file-code mr-1"></i>Email archive (JSON)
                            </a>
                        </li>
                    ) : null}
                </ul>
            ) : null}
        </div>
    );
}

function statusBadgeClass(status) {
    if (status === 'closed') return 'bg-gray-100 text-gray-700';
    if (status === 'archived') return 'bg-slate-100 text-slate-600';
    if (status === 'pending') return 'bg-amber-100 text-amber-800';
    return 'bg-emerald-100 text-emerald-800';
}

function entryContactDisplay(entry) {
    if (entry.fromEmail) return entry.fromEmail;
    if (entry.contactName) {
        return entry.contactOrganization
            ? `${entry.contactName} · ${entry.contactOrganization}`
            : entry.contactName;
    }
    if (entry.author?.name) return entry.author.name;
    return '—';
}

function entryToDisplay(entry) {
    const to = entry.toEmails || [];
    if (to.length === 0) return '—';
    if (to.length === 1) return to[0];
    return `${to[0]} +${to.length - 1}`;
}

function attachmentCount(entry) {
    return (entry.attachments || []).length + (entry.emailArchivePath || entry.rawEmailPath ? 1 : 0);
}

function thCls() {
    return 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap';
}

function tdCls() {
    return 'px-3 py-2 text-xs text-gray-800 dark:text-gray-200 align-top';
}

function ThreadsTable({ threads, types, statuses, selectedThreadId, onSelect }) {
    if (!threads.length) return null;
    return (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/80">
                    <tr>
                        <th className={thCls()}>Last activity</th>
                        <th className={thCls()}>Subject / matter</th>
                        <th className={thCls()}>Type</th>
                        <th className={thCls()}>Status</th>
                        <th className={thCls()}>Counterparty</th>
                        <th className={thCls()}>Our ref</th>
                        <th className={thCls()}>Their ref</th>
                        <th className={thCls()}>Entries</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {threads.map((t) => (
                        <tr
                            key={t.id}
                            onClick={() => onSelect(t.id)}
                            className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 ${selectedThreadId === t.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                        >
                            <td className={`${tdCls()} whitespace-nowrap text-gray-500`}>{formatDateTime(t.lastActivityAt)}</td>
                            <td className={`${tdCls()} font-medium max-w-[220px]`}>
                                <div className="line-clamp-2">{t.subject}</div>
                                {t.summary ? <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{t.summary}</div> : null}
                            </td>
                            <td className={tdCls()}>{labelFor(types, t.correspondenceType)}</td>
                            <td className={tdCls()}>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadgeClass(t.status)}`}>
                                    {labelFor(statuses, t.status)}
                                </span>
                            </td>
                            <td className={`${tdCls()} max-w-[140px] truncate`}>{t.counterparty || '—'}</td>
                            <td className={`${tdCls()} font-mono text-[10px]`}>{t.requestNumber || '—'}</td>
                            <td className={`${tdCls()} max-w-[120px] truncate`}>{t.externalReference || '—'}</td>
                            <td className={`${tdCls()} text-center`}>{t.entryCount || 0}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function EntriesTable({ entries, types, expandedEntryId, onToggleEntry, onReply }) {
    if (!entries.length) return null;
    const colCount = 10;
    return (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/80">
                    <tr>
                        <th className={thCls()}>Date</th>
                        <th className={thCls()}>Kind</th>
                        <th className={thCls()}>Type</th>
                        <th className={thCls()}>Direction</th>
                        <th className={thCls()}>From / contact</th>
                        <th className={thCls()}>To</th>
                        <th className={thCls()}>Subject</th>
                        <th className={thCls()}>Summary</th>
                        <th className={`${thCls()} text-center`}>Att</th>
                        <th className={`${thCls()} text-right`}>Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {entries.map((entry) => {
                        const badge = kindBadge(entry.kind);
                        const isExpanded = expandedEntryId === entry.id;
                        const attN = attachmentCount(entry);
                        return (
                            <React.Fragment key={entry.id}>
                                <tr className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${isExpanded ? 'bg-gray-50 dark:bg-gray-800/40' : ''}`}>
                                    <td className={`${tdCls()} whitespace-nowrap text-gray-500`}>{formatDateTime(entry.occurredAt || entry.createdAt)}</td>
                                    <td className={tdCls()}>
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                                    </td>
                                    <td className={tdCls()}>{labelFor(types, entry.correspondenceType)}</td>
                                    <td className={`${tdCls()} capitalize`}>{entry.direction || '—'}</td>
                                    <td className={`${tdCls()} max-w-[160px] truncate`} title={entryContactDisplay(entry)}>{entryContactDisplay(entry)}</td>
                                    <td className={`${tdCls()} max-w-[140px] truncate`} title={entryToDisplay(entry)}>{entryToDisplay(entry)}</td>
                                    <td className={`${tdCls()} max-w-[160px]`}>
                                        <div className="line-clamp-2">{entry.subject || '—'}</div>
                                    </td>
                                    <td className={`${tdCls()} max-w-[200px] text-gray-600`}>
                                        <div className="line-clamp-2">{(entry.bodyText || '').slice(0, 120) || '—'}</div>
                                    </td>
                                    <td className={`${tdCls()} text-center`}>
                                        {attN > 0 ? (
                                            <span className="inline-flex items-center gap-0.5 text-gray-500" title={`${attN} file(s)`}>
                                                <i className="fas fa-paperclip text-[10px]"></i>{attN}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className={`${tdCls()} text-right whitespace-nowrap`}>
                                        <button
                                            type="button"
                                            className="text-[10px] text-primary-600 hover:underline mr-2"
                                            onClick={() => onToggleEntry(entry.id)}
                                        >
                                            {isExpanded ? 'Hide' : 'View'}
                                        </button>
                                        {entry.kind === 'received' && entry.fromEmail ? (
                                            <button
                                                type="button"
                                                className="text-[10px] text-gray-600 hover:text-sky-600"
                                                onClick={() => onReply(entry)}
                                                title="Reply"
                                            >
                                                <i className="fas fa-reply"></i>
                                            </button>
                                        ) : null}
                                    </td>
                                </tr>
                                {isExpanded ? (
                                    <tr className="bg-gray-50/80 dark:bg-gray-800/30">
                                        <td colSpan={colCount} className="p-0 border-t border-gray-200 dark:border-gray-700">
                                            <EntryDetail entry={entry} types={types} />
                                        </td>
                                    </tr>
                                ) : null}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function normalizeInboxSlugClient(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
}

function previewInboxFromSlug(slug, domain) {
    const normalized = normalizeInboxSlugClient(slug);
    if (!normalized || !domain) return '';
    return `${normalized}_doc_proj@${domain}`;
}

function ProjectCorrespondenceSection({ project, activeSection }) {
    const projectId = project?.id;
    const [threads, setThreads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedThreadId, setSelectedThreadId] = useState(null);
    const [threadDetail, setThreadDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState(null);

    const [types, setTypes] = useState(DEFAULT_TYPES);
    const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
    const [confidentialityLevels, setConfidentialityLevels] = useState(DEFAULT_CONFIDENTIALITY);
    const [inboxEmail, setInboxEmail] = useState(project?.correspondenceInboundEmail || '');
    const [inboxSlug, setInboxSlug] = useState('');
    const [inboxDomain, setInboxDomain] = useState('');
    const [inboxEditing, setInboxEditing] = useState(false);
    const [inboxSaving, setInboxSaving] = useState(false);
    const [copiedInbox, setCopiedInbox] = useState(false);

    const [showNewThread, setShowNewThread] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newType, setNewType] = useState('other');
    const [newStatus, setNewStatus] = useState('open');
    const [newCounterparty, setNewCounterparty] = useState('');
    const [newExternalRef, setNewExternalRef] = useState('');
    const [newSummary, setNewSummary] = useState('');
    const [newBody, setNewBody] = useState('');
    const [newDirection, setNewDirection] = useState('internal');
    const [newAttachments, setNewAttachments] = useState([]);
    const [creating, setCreating] = useState(false);

    const [showManual, setShowManual] = useState(false);
    const [manual, setManual] = useState(emptyManualForm);
    const [savingManual, setSavingManual] = useState(false);

    const [showCompose, setShowCompose] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [composeCc, setComposeCc] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeAttachments, setComposeAttachments] = useState([]);
    const [sendingEmail, setSendingEmail] = useState(false);

    const [expandedEntryId, setExpandedEntryId] = useState(null);
    const [uploadingCount, setUploadingCount] = useState(0);

    const contactOptions = useMemo(() => parseProjectContacts(project?.projectContacts), [project?.projectContacts]);

    const apiBase = useCallback((suffix) => `/projects/${encodeURIComponent(projectId)}/${suffix}`, [projectId]);

    const loadThreads = useCallback(async ({ silent = false } = {}) => {
        if (!projectId || !window.DatabaseAPI?.makeRequest) return;
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await window.DatabaseAPI.makeRequest(apiBase('correspondence'), { method: 'GET', forceRefresh: true });
            const data = res?.data ?? res;
            setThreads(Array.isArray(data?.threads) ? data.threads : []);
            if (data?.correspondenceInboundEmail) setInboxEmail(data.correspondenceInboundEmail);
            if (data?.correspondenceInboxSlug != null) setInboxSlug(data.correspondenceInboxSlug || '');
            if (data?.correspondenceInboxDomain) setInboxDomain(data.correspondenceInboxDomain);
            if (data?.types?.length) setTypes(data.types);
            if (data?.statuses?.length) setStatuses(data.statuses);
            if (data?.confidentialityLevels?.length) setConfidentialityLevels(data.confidentialityLevels);
        } catch (e) {
            if (!silent) setError(e?.message || 'Failed to load correspondence');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [projectId, apiBase]);

    const loadThreadDetail = useCallback(async (threadId, { silent = false } = {}) => {
        if (!threadId || !projectId || !window.DatabaseAPI?.makeRequest) return;
        if (!silent) setDetailLoading(true);
        try {
            const res = await window.DatabaseAPI.makeRequest(
                `${apiBase('correspondence-thread')}?threadId=${encodeURIComponent(threadId)}`,
                { method: 'GET', forceRefresh: true }
            );
            const data = res?.data ?? res;
            setThreadDetail(data?.thread || null);
        } catch (e) {
            if (!silent) setError(e?.message || 'Failed to load thread');
        } finally {
            if (!silent) setDetailLoading(false);
        }
    }, [projectId, apiBase]);

    useEffect(() => {
        if (activeSection !== 'correspondence' || !projectId) return;
        loadThreads();
        setSelectedThreadId(null);
        setThreadDetail(null);
    }, [activeSection, projectId, loadThreads]);

    useEffect(() => {
        if (!selectedThreadId) {
            setThreadDetail(null);
            return;
        }
        loadThreadDetail(selectedThreadId);
    }, [selectedThreadId, loadThreadDetail]);

    useEffect(() => {
        if (activeSection !== 'correspondence' || !projectId) return;
        const params = new URLSearchParams(window.location.search);
        const threadFromUrl = params.get('corrThreadId');
        if (threadFromUrl) setSelectedThreadId(threadFromUrl);
    }, [activeSection, projectId]);

    const copyInboxEmail = async () => {
        if (!inboxEmail) return;
        try {
            await navigator.clipboard.writeText(inboxEmail);
            setCopiedInbox(true);
            setTimeout(() => setCopiedInbox(false), 2000);
        } catch (_) {
            alert(inboxEmail);
        }
    };

    const saveInboxName = async () => {
        const slug = normalizeInboxSlugClient(inboxSlug);
        if (!slug || slug.length < 2) {
            alert('Inbox name must be at least 2 characters (letters and numbers)');
            return;
        }
        setInboxSaving(true);
        try {
            const res = await window.DatabaseAPI.makeRequest(apiBase('correspondence'), {
                method: 'PATCH',
                body: JSON.stringify({ inboxName: slug })
            });
            const data = res?.data ?? res;
            if (data?.correspondenceInboundEmail) setInboxEmail(data.correspondenceInboundEmail);
            if (data?.correspondenceInboxSlug != null) setInboxSlug(data.correspondenceInboxSlug || slug);
            if (data?.correspondenceInboxDomain) setInboxDomain(data.correspondenceInboxDomain);
            setInboxEditing(false);
        } catch (e) {
            alert(e?.message || 'Failed to save inbox name');
        } finally {
            setInboxSaving(false);
        }
    };

    const inboxPreview = useMemo(
        () => previewInboxFromSlug(inboxSlug, inboxDomain),
        [inboxSlug, inboxDomain]
    );

    const handleCreateThread = async () => {
        if (!newSubject.trim()) {
            alert('Subject is required');
            return;
        }
        setCreating(true);
        try {
            const payload = {
                subject: newSubject.trim(),
                correspondenceType: newType,
                status: newStatus,
                counterparty: newCounterparty.trim() || null,
                externalReference: newExternalRef.trim() || null,
                summary: newSummary.trim() || null,
                entry: newBody.trim() || newAttachments.length
                    ? {
                        bodyText: newBody.trim() || '(Attachment only)',
                        direction: newDirection,
                        correspondenceType: newType,
                        occurredAt: new Date().toISOString(),
                        attachments: newAttachments
                    }
                    : null
            };
            const res = await window.DatabaseAPI.makeRequest(apiBase('correspondence-threads'), {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = res?.data ?? res;
            setShowNewThread(false);
            setNewSubject('');
            setNewBody('');
            setNewAttachments([]);
            setNewCounterparty('');
            setNewExternalRef('');
            setNewSummary('');
            await loadThreads({ silent: true });
            if (data?.thread?.id) setSelectedThreadId(data.thread.id);
        } catch (e) {
            alert(e?.message || 'Failed to create thread');
        } finally {
            setCreating(false);
        }
    };

    const buildManualPayload = () => {
        const toEmails = manual.participants
            .split(/[;,]+/)
            .map((s) => s.trim())
            .filter((s) => EMAIL_RE.test(s));
        return {
            threadId: selectedThreadId,
            correspondenceType: manual.correspondenceType,
            direction: manual.direction,
            subject: manual.subject.trim() || undefined,
            bodyText: manual.body.trim(),
            occurredAt: manual.occurredAt ? new Date(manual.occurredAt).toISOString() : new Date().toISOString(),
            toEmails,
            contactName: manual.contactName.trim() || null,
            contactOrganization: manual.contactOrganization.trim() || null,
            contactPhone: manual.contactPhone.trim() || null,
            externalReference: manual.externalReference.trim() || null,
            location: manual.location.trim() || null,
            durationMinutes: manual.durationMinutes ? parseInt(manual.durationMinutes, 10) : null,
            actionRequired: manual.actionRequired.trim() || null,
            followUpDate: manual.followUpDate ? new Date(manual.followUpDate).toISOString() : null,
            outcome: manual.outcome.trim() || null,
            confidentiality: manual.confidentiality,
            attachments: manual.attachments
        };
    };

    const handleAddManual = async () => {
        if (!selectedThreadId) return;
        if (!manual.body.trim()) {
            alert('Notes / body text is required');
            return;
        }
        setSavingManual(true);
        try {
            await window.DatabaseAPI.makeRequest(apiBase('correspondence-entries'), {
                method: 'POST',
                body: JSON.stringify(buildManualPayload())
            });
            setShowManual(false);
            setManual(emptyManualForm());
            await Promise.all([
                loadThreadDetail(selectedThreadId, { silent: true }),
                loadThreads({ silent: true })
            ]);
        } catch (e) {
            alert(e?.message || 'Failed to save entry');
        } finally {
            setSavingManual(false);
        }
    };

    const handleSendEmail = async () => {
        if (!selectedThreadId) return;
        const toList = composeTo.split(/[;,]+/).map((s) => s.trim()).filter((s) => EMAIL_RE.test(s));
        if (toList.length === 0) {
            alert('Enter at least one valid To address');
            return;
        }
        if (!composeSubject.trim() || !composeBody.trim()) {
            alert('Subject and message are required');
            return;
        }
        setSendingEmail(true);
        try {
            const ccList = composeCc.split(/[;,]+/).map((s) => s.trim()).filter((s) => EMAIL_RE.test(s));
            await window.DatabaseAPI.makeRequest(apiBase('correspondence-send-email'), {
                method: 'POST',
                body: JSON.stringify({
                    threadId: selectedThreadId,
                    to: toList,
                    cc: ccList,
                    subject: composeSubject.trim(),
                    text: composeBody.trim(),
                    correspondenceType: 'email',
                    attachments: composeAttachments
                })
            });
            setShowCompose(false);
            setComposeBody('');
            setComposeAttachments([]);
            await Promise.all([
                loadThreadDetail(selectedThreadId, { silent: true }),
                loadThreads({ silent: true })
            ]);
        } catch (e) {
            alert(e?.message || 'Failed to send email');
        } finally {
            setSendingEmail(false);
        }
    };

    const openReplyCompose = (entry) => {
        setComposeTo(entry?.fromEmail || '');
        setComposeCc('');
        const subj = threadDetail?.subject || '';
        setComposeSubject(subj.toLowerCase().startsWith('re:') ? subj : `Re: ${subj}`);
        setComposeBody('');
        setComposeAttachments([]);
        setShowCompose(true);
    };

    const uploadFiles = async (files, applyAttachment) => {
        if (!files?.length || !projectId || !applyAttachment) return;
        for (const file of files) {
            setUploadingCount((n) => n + 1);
            try {
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error('Could not read file'));
                    reader.readAsDataURL(file);
                });
                const res = await window.DatabaseAPI.makeRequest(apiBase('correspondence-attachments'), {
                    method: 'POST',
                    body: JSON.stringify({ name: file.name, dataUrl }),
                    timeout: 120000
                });
                const data = res?.data ?? res;
                const att = data?.attachment;
                if (!att?.filePath) {
                    throw new Error('Upload succeeded but no attachment was returned');
                }
                applyAttachment(att);
            } catch (e) {
                alert(`${file.name}: ${e?.message || 'Upload failed'}`);
            } finally {
                setUploadingCount((n) => Math.max(0, n - 1));
            }
        }
    };

    const attachLabel = uploadingCount > 0 ? `Uploading (${uploadingCount})…` : 'Add attachments (any file type)';
    const composeAttachLabel = uploadingCount > 0 ? `Uploading (${uploadingCount})…` : 'Attach files';

    const entries = threadDetail?.entries || [];

    if (activeSection !== 'correspondence') return null;

    return (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden min-h-[520px] flex flex-col">
            {inboxEmail || inboxDomain ? (
                <div className="px-3 py-2.5 border-b border-sky-100 bg-sky-50/80 dark:bg-sky-900/20 dark:border-sky-900">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-sky-900 dark:text-sky-200">
                                    <i className="fas fa-inbox mr-1"></i>Project correspondence inbox
                                </div>
                                <p className="text-[11px] text-sky-800/80 dark:text-sky-300/80 mt-0.5">
                                    Name this inbox (becomes <strong>name_doc_proj@…</strong>), then CC the address below on project emails.
                                </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                {!inboxEditing ? (
                                    <button type="button" onClick={() => setInboxEditing(true)} className="px-2 py-1 text-xs rounded border border-sky-200 bg-white hover:bg-sky-50">
                                        <i className="fas fa-pen mr-1"></i>Name
                                    </button>
                                ) : null}
                                <button type="button" onClick={copyInboxEmail} disabled={!inboxEmail} className="px-2 py-1 text-xs rounded border border-sky-200 bg-white hover:bg-sky-50 disabled:opacity-50">
                                    {copiedInbox ? 'Copied' : 'Copy address'}
                                </button>
                            </div>
                        </div>
                        {inboxEditing ? (
                            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                                <Field label="Inbox name" className="flex-1">
                                    <input
                                        type="text"
                                        className={inputCls()}
                                        value={inboxSlug}
                                        onChange={(e) => setInboxSlug(e.target.value)}
                                        placeholder="e.g. samancor"
                                    />
                                </Field>
                                <div className="flex gap-2">
                                    <button type="button" className="px-2 py-1.5 text-xs rounded border" onClick={() => { setInboxEditing(false); loadThreads({ silent: true }); }}>Cancel</button>
                                    <button type="button" disabled={inboxSaving} className="px-2 py-1.5 text-xs rounded bg-primary-600 text-white" onClick={saveInboxName}>
                                        {inboxSaving ? 'Saving…' : 'Save name'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-sky-900 dark:text-sky-100">
                                {inboxSlug ? <span className="font-medium mr-2">Name: {inboxSlug}</span> : null}
                            </div>
                        )}
                        <code className="text-xs text-sky-900 dark:text-sky-100 break-all block">
                            {inboxEditing && inboxPreview ? inboxPreview : inboxEmail}
                        </code>
                        {inboxEditing && inboxPreview && inboxPreview !== inboxEmail ? (
                            <p className="text-[10px] text-sky-700/80">Preview — save to apply this address</p>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {selectedThreadId ? (
                        <button type="button" onClick={() => { setSelectedThreadId(null); setExpandedEntryId(null); }} className="text-xs text-primary-600 hover:underline">
                            <i className="fas fa-arrow-left mr-1"></i>All matters
                        </button>
                    ) : (
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Correspondence register</h3>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    {selectedThreadId ? (
                        <>
                            <button type="button" onClick={() => { setManual(emptyManualForm()); setShowManual(true); }} className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                                <i className="fas fa-pen mr-1"></i>Log entry
                            </button>
                            <button type="button" onClick={() => {
                                setComposeSubject(threadDetail?.subject || '');
                                setComposeTo(contactOptions.map((c) => c.email).join(', '));
                                setComposeCc(inboxEmail || '');
                                setComposeBody('');
                                setComposeAttachments([]);
                                setShowCompose(true);
                            }} className="px-2.5 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700">
                                <i className="fas fa-paper-plane mr-1"></i>Send email
                            </button>
                        </>
                    ) : null}
                    <button type="button" onClick={() => setShowNewThread(true)} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700">
                        <i className="fas fa-plus mr-1"></i>New matter
                    </button>
                </div>
            </div>

            <div className="p-3 overflow-auto flex-1 min-h-0">
                {loading ? (
                    <div className="text-sm text-gray-500 py-8 text-center">Loading correspondence…</div>
                ) : error ? (
                    <div className="text-sm text-red-600 py-4">{error}</div>
                ) : !selectedThreadId ? (
                    threads.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-12">
                            <i className="fas fa-envelope-open-text text-2xl mb-2 text-gray-300"></i>
                            <p>No correspondence yet</p>
                            <p className="text-xs mt-1">Create a matter or CC the project inbox on emails.</p>
                        </div>
                    ) : (
                        <ThreadsTable
                            threads={threads}
                            types={types}
                            statuses={statuses}
                            selectedThreadId={selectedThreadId}
                            onSelect={setSelectedThreadId}
                        />
                    )
                ) : (
                    <div className="space-y-3">
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 px-3 py-2">
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{threadDetail?.subject || '…'}</div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                                {threadDetail?.requestNumber ? <span><span className="font-medium">Our ref:</span> {threadDetail.requestNumber}</span> : null}
                                {threadDetail?.externalReference ? <span><span className="font-medium">Their ref:</span> {threadDetail.externalReference}</span> : null}
                                {threadDetail?.counterparty ? <span><span className="font-medium">Counterparty:</span> {threadDetail.counterparty}</span> : null}
                                {threadDetail?.correspondenceType ? <span><span className="font-medium">Type:</span> {labelFor(types, threadDetail.correspondenceType)}</span> : null}
                                {threadDetail?.status ? (
                                    <span>
                                        <span className="font-medium">Status:</span>{' '}
                                        <span className={`px-1.5 py-0.5 rounded ${statusBadgeClass(threadDetail.status)}`}>{labelFor(statuses, threadDetail.status)}</span>
                                    </span>
                                ) : null}
                            </div>
                            {threadDetail?.summary ? <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{threadDetail.summary}</p> : null}
                        </div>

                        {detailLoading && !threadDetail ? (
                            <div className="text-sm text-gray-500 py-6 text-center">Loading entries…</div>
                        ) : entries.length === 0 ? (
                            <div className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                                No entries in this matter — log correspondence or send an email.
                            </div>
                        ) : (
                            <EntriesTable
                                entries={entries}
                                types={types}
                                expandedEntryId={expandedEntryId}
                                onToggleEntry={(id) => setExpandedEntryId((prev) => (prev === id ? null : id))}
                                onReply={openReplyCompose}
                            />
                        )}
                    </div>
                )}
            </div>

            {showNewThread ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl p-4 space-y-3 my-4 max-h-[92vh] overflow-y-auto">
                        <h4 className="text-sm font-semibold">New correspondence thread</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Subject *" className="sm:col-span-2">
                                <input type="text" className={inputCls()} value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Subject / matter" />
                            </Field>
                            <Field label="Type">
                                <select className={inputCls()} value={newType} onChange={(e) => setNewType(e.target.value)}>
                                    {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </Field>
                            <Field label="Status">
                                <select className={inputCls()} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                                    {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                            </Field>
                            <Field label="Counterparty / organisation">
                                <input type="text" className={inputCls()} value={newCounterparty} onChange={(e) => setNewCounterparty(e.target.value)} placeholder="Client, contractor, authority…" />
                            </Field>
                            <Field label="Their reference">
                                <input type="text" className={inputCls()} value={newExternalRef} onChange={(e) => setNewExternalRef(e.target.value)} placeholder="Letter ref, PO number…" />
                            </Field>
                            <Field label="Summary" className="sm:col-span-2">
                                <textarea className={`${inputCls()} min-h-[60px]`} value={newSummary} onChange={(e) => setNewSummary(e.target.value)} placeholder="Brief summary of this matter" />
                            </Field>
                            <Field label="First entry direction">
                                <select className={inputCls()} value={newDirection} onChange={(e) => setNewDirection(e.target.value)}>
                                    <option value="internal">Internal</option>
                                    <option value="outbound">Outbound</option>
                                    <option value="inbound">Inbound</option>
                                </select>
                            </Field>
                            <Field label="First entry notes" className="sm:col-span-2">
                                <textarea className={`${inputCls()} min-h-[100px]`} value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Meeting notes, call summary, letter body…" />
                            </Field>
                            <div className="sm:col-span-2">
                                <FileAttachButton
                                    inputId="corr-new-thread-files"
                                    label={attachLabel}
                                    disabled={uploadingCount > 0}
                                    onFilesSelected={(files) => uploadFiles(files, (att) => setNewAttachments((prev) => [...prev, att]))}
                                />
                                <AttachmentList items={newAttachments} onRemove={(i) => setNewAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="px-3 py-1.5 text-sm rounded-lg border" onClick={() => setShowNewThread(false)}>Cancel</button>
                            <button type="button" disabled={creating} className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white" onClick={handleCreateThread}>{creating ? 'Creating…' : 'Create'}</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showManual ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl p-4 space-y-3 my-4 max-h-[92vh] overflow-y-auto">
                        <h4 className="text-sm font-semibold">Log correspondence</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Type">
                                <select className={inputCls()} value={manual.correspondenceType} onChange={(e) => setManual((m) => ({ ...m, correspondenceType: e.target.value }))}>
                                    {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </Field>
                            <Field label="Direction">
                                <select className={inputCls()} value={manual.direction} onChange={(e) => setManual((m) => ({ ...m, direction: e.target.value }))}>
                                    <option value="internal">Internal</option>
                                    <option value="outbound">Outbound</option>
                                    <option value="inbound">Inbound</option>
                                </select>
                            </Field>
                            <Field label="Date & time">
                                <input type="datetime-local" className={inputCls()} value={manual.occurredAt} onChange={(e) => setManual((m) => ({ ...m, occurredAt: e.target.value }))} />
                            </Field>
                            <Field label="Confidentiality">
                                <select className={inputCls()} value={manual.confidentiality} onChange={(e) => setManual((m) => ({ ...m, confidentiality: e.target.value }))}>
                                    {confidentialityLevels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </Field>
                            <Field label="Contact name">
                                <input type="text" className={inputCls()} value={manual.contactName} onChange={(e) => setManual((m) => ({ ...m, contactName: e.target.value }))} />
                            </Field>
                            <Field label="Organisation">
                                <input type="text" className={inputCls()} value={manual.contactOrganization} onChange={(e) => setManual((m) => ({ ...m, contactOrganization: e.target.value }))} />
                            </Field>
                            <Field label="Phone">
                                <input type="text" className={inputCls()} value={manual.contactPhone} onChange={(e) => setManual((m) => ({ ...m, contactPhone: e.target.value }))} />
                            </Field>
                            <Field label="Their reference">
                                <input type="text" className={inputCls()} value={manual.externalReference} onChange={(e) => setManual((m) => ({ ...m, externalReference: e.target.value }))} />
                            </Field>
                            <Field label="Location">
                                <input type="text" className={inputCls()} value={manual.location} onChange={(e) => setManual((m) => ({ ...m, location: e.target.value }))} placeholder="Site, office, video call…" />
                            </Field>
                            <Field label="Duration (minutes)">
                                <input type="number" min="0" className={inputCls()} value={manual.durationMinutes} onChange={(e) => setManual((m) => ({ ...m, durationMinutes: e.target.value }))} />
                            </Field>
                            <Field label="Subject (optional)" className="sm:col-span-2">
                                <input type="text" className={inputCls()} value={manual.subject} onChange={(e) => setManual((m) => ({ ...m, subject: e.target.value }))} />
                            </Field>
                            <Field label="Participants (emails)" className="sm:col-span-2">
                                <input type="text" className={inputCls()} value={manual.participants} onChange={(e) => setManual((m) => ({ ...m, participants: e.target.value }))} placeholder="Comma-separated emails" />
                                {contactOptions.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {contactOptions.map((c) => (
                                            <button key={c.email} type="button" className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100" onClick={() => setManual((m) => ({ ...m, participants: m.participants ? `${m.participants}, ${c.email}` : c.email }))}>{c.label}</button>
                                        ))}
                                    </div>
                                ) : null}
                            </Field>
                            <Field label="Notes / body *" className="sm:col-span-2">
                                <textarea className={`${inputCls()} min-h-[120px]`} value={manual.body} onChange={(e) => setManual((m) => ({ ...m, body: e.target.value }))} placeholder="Full correspondence content, minutes, letter text…" />
                            </Field>
                            <Field label="Action required" className="sm:col-span-2">
                                <textarea className={`${inputCls()} min-h-[60px]`} value={manual.actionRequired} onChange={(e) => setManual((m) => ({ ...m, actionRequired: e.target.value }))} />
                            </Field>
                            <Field label="Follow-up date">
                                <input type="date" className={inputCls()} value={manual.followUpDate} onChange={(e) => setManual((m) => ({ ...m, followUpDate: e.target.value }))} />
                            </Field>
                            <Field label="Outcome / resolution" className="sm:col-span-2">
                                <textarea className={`${inputCls()} min-h-[60px]`} value={manual.outcome} onChange={(e) => setManual((m) => ({ ...m, outcome: e.target.value }))} />
                            </Field>
                            <div className="sm:col-span-2">
                                <FileAttachButton
                                    inputId="corr-manual-log-files"
                                    label={attachLabel}
                                    disabled={uploadingCount > 0}
                                    onFilesSelected={(files) => uploadFiles(files, (att) => setManual((m) => ({ ...m, attachments: [...(m.attachments || []), att] })))}
                                />
                                <AttachmentList items={manual.attachments} onRemove={(i) => setManual((m) => ({ ...m, attachments: m.attachments.filter((_, idx) => idx !== i) }))} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="px-3 py-1.5 text-sm rounded-lg border" onClick={() => setShowManual(false)}>Cancel</button>
                            <button type="button" disabled={savingManual} className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white" onClick={handleAddManual}>{savingManual ? 'Saving…' : 'Save entry'}</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showCompose ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg p-4 space-y-3 my-4">
                        <h4 className="text-sm font-semibold">Send email</h4>
                        <Field label="To">
                            <input type="text" className={inputCls()} value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="Comma-separated" />
                        </Field>
                        {contactOptions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {contactOptions.map((c) => (
                                    <button key={c.email} type="button" className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100" onClick={() => setComposeTo((p) => (p ? `${p}, ${c.email}` : c.email))}>{c.label}</button>
                                ))}
                            </div>
                        ) : null}
                        <Field label="CC">
                            <input type="text" className={inputCls()} value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder={inboxEmail ? `Include ${inboxEmail} to capture replies` : 'CC'} />
                        </Field>
                        <Field label="Subject">
                            <input type="text" className={inputCls()} value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
                        </Field>
                        <Field label="Message">
                            <textarea className={`${inputCls()} min-h-[140px]`} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} />
                        </Field>
                        <div>
                            <FileAttachButton
                                inputId="corr-compose-email-files"
                                label={composeAttachLabel}
                                disabled={uploadingCount > 0}
                                onFilesSelected={(files) => uploadFiles(files, (att) => setComposeAttachments((prev) => [...prev, att]))}
                            />
                            <AttachmentList items={composeAttachments} onRemove={(i) => setComposeAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="px-3 py-1.5 text-sm rounded-lg border" onClick={() => setShowCompose(false)}>Cancel</button>
                            <button type="button" disabled={sendingEmail} className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white" onClick={handleSendEmail}>{sendingEmail ? 'Sending…' : 'Send'}</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

window.ProjectCorrespondenceSection = ProjectCorrespondenceSection;
