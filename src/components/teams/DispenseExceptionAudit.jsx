/**
 * Dispense Exception Audit — verify manual decisions in InsightWare exception workbooks.
 */

const { useState, useCallback, useRef, useEffect } = React;

const MAX_FILE_SIZE_MB = 50;
const COMMENTS_STORAGE_PREFIX = 'dispenseExceptionAudit_comments_';

function formatElapsed(ms) {
    if (ms < 0 || !Number.isFinite(ms)) return '';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
}

function PreflightPanel({ preflight, loading, isDark }) {
    if (loading) {
        return (
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Analyzing workbook…
                </p>
            </div>
        );
    }
    if (!preflight) return null;

    const labelClass = `text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`;
    const statClass = `text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`;

    return (
        <div className={`rounded-lg border p-4 space-y-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-start justify-between gap-2">
                <h4 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    <i className={`fas fa-clipboard-check mr-2 ${preflight.ok ? 'text-green-500' : 'text-amber-500'}`}></i>
                    Pre-flight check
                </h4>
                <span className={`text-xs px-2 py-0.5 rounded-full ${preflight.ok
                    ? (isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800')
                    : (isDark ? 'bg-amber-900/40 text-amber-200' : 'bg-amber-100 text-amber-900')}`}>
                    {preflight.ok ? 'Ready to audit' : 'Fix issues below'}
                </span>
            </div>

            {preflight.errors?.length > 0 && (
                <ul className={`text-xs space-y-1 rounded p-2 ${isDark ? 'bg-red-900/30 text-red-200' : 'bg-red-50 text-red-800'}`}>
                    {preflight.errors.map((msg, i) => <li key={i}>• {msg}</li>)}
                </ul>
            )}
            {preflight.warnings?.length > 0 && (
                <ul className={`text-xs space-y-1 rounded p-2 ${isDark ? 'bg-amber-900/20 text-amber-200' : 'bg-amber-50 text-amber-900'}`}>
                    {preflight.warnings.map((msg, i) => <li key={i}>• {msg}</li>)}
                </ul>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                    <p className={labelClass}>Transactions</p>
                    <p className={statClass}>{preflight.transactionCount?.toLocaleString()}</p>
                </div>
                <div>
                    <p className={labelClass}>Exception flags</p>
                    <p className={statClass}>{preflight.exceptionCount?.toLocaleString()}</p>
                </div>
                <div>
                    <p className={labelClass}>Review queue</p>
                    <p className={statClass}>{preflight.reviewQueueCount?.toLocaleString()}</p>
                </div>
                <div>
                    <p className={labelClass}>Period</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{preflight.dateRangeLabel}</p>
                </div>
            </div>
        </div>
    );
}

function SummaryPanel({ summary, isDark }) {
    if (!summary) return null;
    const labelClass = `text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`;
    const statClass = `text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`;

    return (
        <div className={`rounded-lg border p-4 space-y-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <h4 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                <i className="fas fa-chart-pie mr-2 text-primary-500"></i>
                Audit summary
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                    <p className={labelClass}>Decision pass rate</p>
                    <p className={statClass}>{summary.decision_pass_rate_pct ?? '—'}%</p>
                </div>
                <div>
                    <p className={labelClass}>Exception recompute</p>
                    <p className={statClass}>{summary.exception_match_pct ?? '—'}%</p>
                </div>
                <div>
                    <p className={labelClass}>Errors</p>
                    <p className={`${statClass} ${summary.error_count > 0 ? 'text-red-500' : 'text-green-500'}`}>{summary.error_count ?? 0}</p>
                </div>
                <div>
                    <p className={labelClass}>Warnings</p>
                    <p className={statClass}>{summary.warning_count ?? 0}</p>
                </div>
            </div>
            {summary.findings_by_check && (
                <div className={`text-xs grid grid-cols-2 gap-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    {Object.entries(summary.findings_by_check).map(([check, count]) => (
                        <p key={check} className="flex justify-between gap-2">
                            <span>{check.replace(/_/g, ' ')}</span>
                            <span className="font-mono">{count}</span>
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

function loadStoredComments(fileName) {
    if (!fileName) return {};
    try {
        const raw = localStorage.getItem(`${COMMENTS_STORAGE_PREFIX}${fileName}`);
        return raw ? JSON.parse(raw) : {};
    } catch (_) {
        return {};
    }
}

function saveStoredComments(fileName, comments) {
    if (!fileName) return;
    try {
        localStorage.setItem(`${COMMENTS_STORAGE_PREFIX}${fileName}`, JSON.stringify(comments));
    } catch (_) {}
}

function severityBadgeClass(severity, isDark) {
    if (severity === 'error') return isDark ? 'text-red-300 bg-red-900/30' : 'text-red-800 bg-red-50';
    if (severity === 'warning') return isDark ? 'text-amber-200 bg-amber-900/30' : 'text-amber-900 bg-amber-50';
    if (severity === 'info') return isDark ? 'text-slate-300 bg-slate-700/50' : 'text-gray-600 bg-gray-50';
    return isDark ? 'text-slate-400 bg-slate-800' : 'text-gray-500 bg-gray-100';
}

function TransactionReviewList({
    reviewTransactions,
    comments,
    onCommentChange,
    filterMode,
    isDark,
}) {
    const filtered = (reviewTransactions || []).filter((txn) => {
        if (filterMode === 'review_queue') return txn.in_review_queue;
        if (filterMode === 'warnings') return txn.max_severity === 'error' || txn.max_severity === 'warning';
        return true;
    });

    if (!filtered.length) {
        return (
            <p className={`text-sm py-4 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                No transactions match this filter.
            </p>
        );
    }

    const labelClass = `text-[10px] uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-gray-400'}`;

    return (
        <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
            {filtered.map((txn) => {
                const tid = txn.transaction_id;
                const criticalFindings = (txn.findings || []).filter((f) => f.severity !== 'info');
                return (
                    <div
                        key={tid}
                        className={`rounded-lg border p-3 space-y-2 ${isDark ? 'border-slate-600 bg-slate-900/40' : 'border-gray-200 bg-gray-50'}`}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                    {txn.asset_number || '—'}
                                    {txn.asset_description ? (
                                        <span className={`font-normal ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                            {' '}· {txn.asset_description}
                                        </span>
                                    ) : null}
                                </p>
                                <p className={`text-xs font-mono truncate ${isDark ? 'text-slate-400' : 'text-gray-500'}`} title={tid}>
                                    {tid}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1 shrink-0">
                                {txn.max_severity && txn.max_severity !== 'none' && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${severityBadgeClass(txn.max_severity, isDark)}`}>
                                        {txn.max_severity}
                                    </span>
                                )}
                                {txn.in_review_queue && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-blue-900/40 text-blue-200' : 'bg-blue-100 text-blue-800'}`}>
                                        review queue
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                                <p className={labelClass}>Date</p>
                                <p className={isDark ? 'text-slate-200' : 'text-gray-800'}>{txn.date_time || '—'}</p>
                            </div>
                            <div>
                                <p className={labelClass}>Litres</p>
                                <p className={isDark ? 'text-slate-200' : 'text-gray-800'}>
                                    {txn.litres != null ? Number(txn.litres).toLocaleString() : '—'}
                                </p>
                            </div>
                            <div>
                                <p className={labelClass}>Refund</p>
                                <p className={isDark ? 'text-slate-200' : 'text-gray-800'}>{txn.refund_eligibility || '—'}</p>
                            </div>
                            <div>
                                <p className={labelClass}>Department</p>
                                <p className={isDark ? 'text-slate-200' : 'text-gray-800'}>{txn.department || '—'}</p>
                            </div>
                        </div>

                        {txn.abco_comment ? (
                            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                <span className={labelClass}>Abco comment · </span>
                                {txn.abco_comment}
                            </p>
                        ) : null}

                        {txn.exception_60 ? (
                            <p className={`text-xs ${isDark ? 'text-amber-200/90' : 'text-amber-900'}`}>
                                <span className={labelClass}>Exception · </span>
                                {txn.exception_60}
                            </p>
                        ) : null}

                        {criticalFindings.length > 0 && (
                            <ul className={`text-xs space-y-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                {criticalFindings.map((f, i) => (
                                    <li key={`${f.check}-${i}`} className="flex gap-2">
                                        <span className={`shrink-0 px-1 rounded ${severityBadgeClass(f.severity, isDark)}`}>{f.check}</span>
                                        <span className="min-w-0">{f.expected_value || f.manual_value}</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div>
                            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                Your auditor comment
                            </label>
                            <textarea
                                rows={2}
                                value={comments[tid] || ''}
                                onChange={(e) => onCommentChange(tid, e.target.value)}
                                placeholder="Explain why the manual decision is acceptable, or what follow-up is needed…"
                                className={`w-full text-xs rounded-md border px-2 py-1.5 resize-y min-h-[2.5rem] ${isDark
                                    ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500'
                                    : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'}`}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function FindingsTable({ findings, filterSeverity, filterCheck, isDark }) {
    const filtered = (findings || []).filter((f) => {
        if (filterSeverity && filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
        if (filterCheck && filterCheck !== 'all' && f.check !== filterCheck) return false;
        return true;
    });

    if (!filtered.length) {
        return (
            <p className={`text-sm py-4 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                No findings match the current filters.
            </p>
        );
    }

    const severityClass = (s) => {
        if (s === 'error') return isDark ? 'text-red-300 bg-red-900/30' : 'text-red-800 bg-red-50';
        if (s === 'warning') return isDark ? 'text-amber-200 bg-amber-900/30' : 'text-amber-900 bg-amber-50';
        return isDark ? 'text-slate-300 bg-slate-700/50' : 'text-gray-600 bg-gray-50';
    };

    return (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-slate-600/20">
            <table className="min-w-full text-xs">
                <thead className={`sticky top-0 ${isDark ? 'bg-slate-900 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                    <tr>
                        <th className="px-2 py-2 text-left">Severity</th>
                        <th className="px-2 py-2 text-left">Check</th>
                        <th className="px-2 py-2 text-left">Transaction</th>
                        <th className="px-2 py-2 text-left">Manual</th>
                        <th className="px-2 py-2 text-left">Expected</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.slice(0, 200).map((f, i) => (
                        <tr key={`${f.transaction_id}-${f.check}-${i}`} className={isDark ? 'border-t border-slate-700' : 'border-t border-gray-200'}>
                            <td className="px-2 py-1.5">
                                <span className={`px-1.5 py-0.5 rounded ${severityClass(f.severity)}`}>{f.severity}</span>
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{f.check}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px] max-w-[120px] truncate" title={f.transaction_id}>{f.transaction_id || '—'}</td>
                            <td className="px-2 py-1.5 max-w-[180px] truncate" title={f.manual_value}>{f.manual_value || '—'}</td>
                            <td className="px-2 py-1.5 max-w-[180px] truncate" title={f.expected_value}>{f.expected_value || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {filtered.length > 200 && (
                <p className={`text-xs p-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    Showing first 200 of {filtered.length} findings. Download the Excel report for the full list.
                </p>
            )}
        </div>
    );
}

const DispenseExceptionAudit = () => {
    const { isDark } = window.useTheme || (() => ({ isDark: false }));
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [preflight, setPreflight] = useState(null);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [summary, setSummary] = useState(null);
    const [findings, setFindings] = useState([]);
    const [reviewTransactions, setReviewTransactions] = useState([]);
    const [auditFileName, setAuditFileName] = useState(null);
    const [comments, setComments] = useState({});
    const [viewMode, setViewMode] = useState('transactions');
    const [txnFilterMode, setTxnFilterMode] = useState('all');
    const [exportingComments, setExportingComments] = useState(false);
    const [filterSeverity, setFilterSeverity] = useState('all');
    const [filterCheck, setFilterCheck] = useState('all');
    const [completedInText, setCompletedInText] = useState(null);
    const processingStartRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (uploadedFile?.name) {
            setComments(loadStoredComments(uploadedFile.name));
        }
    }, [uploadedFile?.name]);

    const handleCommentChange = useCallback((transactionId, text) => {
        setComments((prev) => {
            const next = { ...prev, [transactionId]: text };
            if (uploadedFile?.name) saveStoredComments(uploadedFile.name, next);
            return next;
        });
    }, [uploadedFile?.name]);

    const runPreflight = useCallback(async (file) => {
        setPreflightLoading(true);
        setPreflight(null);
        try {
            let XLSXLib = window.XLSX;
            for (let i = 0; i < 30 && (!XLSXLib || !XLSXLib.read); i++) {
                await new Promise((r) => setTimeout(r, 100));
                XLSXLib = window.XLSX;
            }
            if (!XLSXLib?.read) throw new Error('Excel library not loaded. Refresh the page and try again.');

            const buffer = await file.arrayBuffer();
            const workbook = XLSXLib.read(buffer, { type: 'array', cellDates: true });
            const analyze = window.analyzeDispenseExceptionWorkbook;
            if (!analyze) throw new Error('Preflight module not loaded. Refresh the page.');
            setPreflight(analyze(workbook));
        } catch (err) {
            setPreflight({
                ok: false,
                errors: [err.message || 'Could not read workbook'],
                warnings: [],
                transactionCount: 0,
                exceptionCount: 0,
                reviewQueueCount: 0,
                dateRangeLabel: '—',
            });
        } finally {
            setPreflightLoading(false);
        }
    }, []);

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!['.xlsx', '.xls'].includes(ext)) {
            setError('Please upload an Excel workbook (.xlsx or .xls)');
            return;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            setError(`File must be under ${MAX_FILE_SIZE_MB}MB`);
            return;
        }
        setUploadedFile(file);
        setError(null);
        setDownloadUrl(null);
        setSummary(null);
        setFindings([]);
        setReviewTransactions([]);
        setAuditFileName(null);
        setViewMode('transactions');
        runPreflight(file);
    }, [runPreflight]);

    const handleProcess = useCallback(async () => {
        if (!uploadedFile) return;
        setIsProcessing(true);
        setError(null);
        setDownloadUrl(null);
        setSummary(null);
        setFindings([]);
        setReviewTransactions([]);
        setAuditFileName(null);
        processingStartRef.current = Date.now();
        setCompletedInText(null);

        try {
            const token = window.storage?.getToken?.() || '';
            const formData = new FormData();
            formData.append('file', uploadedFile);

            const response = await fetch('/api/dispense-exception-audit/process-excel', {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                credentials: 'include',
                body: formData,
            });

            const text = await response.text();
            let data = {};
            try { data = text ? JSON.parse(text) : {}; } catch (_) {
                throw new Error(text || `Server error (${response.status})`);
            }

            if (!response.ok) {
                throw new Error(data.error?.message || data.error || data.message || `Request failed (${response.status})`);
            }

            const body = data.data || data;
            setDownloadUrl(body.downloadUrl);
            setAuditFileName(body.fileName || null);
            setSummary(body.summary || {});
            setFindings(body.findings || []);
            setReviewTransactions(body.reviewTransactions || []);
            if (uploadedFile?.name) {
                setComments(loadStoredComments(uploadedFile.name));
            }
            setCompletedInText(formatElapsed(Date.now() - processingStartRef.current));
        } catch (err) {
            setError(err.message || 'Audit failed');
        } finally {
            setIsProcessing(false);
        }
    }, [uploadedFile]);

    const handleExportComments = useCallback(async () => {
        if (!auditFileName) {
            setError('Run the audit first before saving comments to the report.');
            return;
        }
        const hasComments = Object.values(comments).some((c) => String(c || '').trim());
        if (!hasComments) {
            setError('Add at least one auditor comment before exporting.');
            return;
        }

        setExportingComments(true);
        setError(null);
        try {
            const token = window.storage?.getToken?.() || '';
            const response = await fetch('/api/dispense-exception-audit/export-comments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'include',
                body: JSON.stringify({
                    fileName: auditFileName,
                    comments,
                    reviewTransactions,
                }),
            });

            const text = await response.text();
            let data = {};
            try { data = text ? JSON.parse(text) : {}; } catch (_) {
                throw new Error(text || `Server error (${response.status})`);
            }

            if (!response.ok) {
                throw new Error(data.error?.message || data.error || data.message || `Request failed (${response.status})`);
            }

            const body = data.data || data;
            if (body.downloadUrl) setDownloadUrl(body.downloadUrl);
        } catch (err) {
            setError(err.message || 'Failed to save comments to report');
        } finally {
            setExportingComments(false);
        }
    }, [auditFileName, comments, reviewTransactions]);

    const checkTypes = [...new Set(findings.map((f) => f.check))].sort();
    const commentCount = Object.values(comments).filter((c) => String(c || '').trim()).length;
    const hasResults = findings.length > 0 || reviewTransactions.length > 0;

    return (
        <div className={`max-w-5xl mx-auto p-4 sm:p-6 space-y-6 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <i className="fas fa-balance-scale text-primary-500"></i>
                    Dispense Exception Audit
                </h2>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Upload an InsightWare / Abcotronics &quot;Transaction Exceptions - In Context&quot; workbook to verify manual review decisions
                    (Possible Cause, Abco Comment, review queue, refund eligibility).
                </p>
            </div>

            <div className={`rounded-xl border p-4 sm:p-6 space-y-4 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                <div>
                    <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                        Exception workbook (.xlsx)
                    </label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                        className={`block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium ${isDark ? 'file:bg-primary-600 file:text-white text-slate-300' : 'file:bg-primary-50 file:text-primary-700 text-gray-600'}`}
                    />
                    {uploadedFile && (
                        <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            Selected: {uploadedFile.name} ({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                    )}
                </div>

                <PreflightPanel preflight={preflight} loading={preflightLoading} isDark={isDark} />

                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={handleProcess}
                        disabled={!uploadedFile || isProcessing || preflightLoading || (preflight && !preflight.ok)}
                        className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? (
                            <><i className="fas fa-spinner fa-spin mr-2"></i>Running audit…</>
                        ) : (
                            <><i className="fas fa-play mr-2"></i>Run audit</>
                        )}
                    </button>
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download
                            className={`px-4 py-2 rounded-lg text-sm font-medium border ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-gray-300 text-gray-800 hover:bg-gray-50'}`}
                        >
                            <i className="fas fa-download mr-2"></i>
                            Download audit report
                        </a>
                    )}
                </div>

                {completedInText && (
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Completed in {completedInText}</p>
                )}
                {error && (
                    <div className={`rounded-lg p-3 text-sm ${isDark ? 'bg-red-900/30 text-red-200' : 'bg-red-50 text-red-800'}`}>
                        {error}
                    </div>
                )}
            </div>

            <SummaryPanel summary={summary} isDark={isDark} />

            {hasResults && (
                <div className={`rounded-xl border p-4 space-y-3 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            Audit review
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setViewMode('transactions')}
                                className={`text-xs px-3 py-1 rounded-md border ${viewMode === 'transactions'
                                    ? (isDark ? 'bg-primary-600 border-primary-500 text-white' : 'bg-primary-600 border-primary-600 text-white')
                                    : (isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}`}
                            >
                                Transactions ({reviewTransactions.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('findings')}
                                className={`text-xs px-3 py-1 rounded-md border ${viewMode === 'findings'
                                    ? (isDark ? 'bg-primary-600 border-primary-500 text-white' : 'bg-primary-600 border-primary-600 text-white')
                                    : (isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}`}
                            >
                                All findings ({findings.length})
                            </button>
                        </div>
                    </div>

                    {viewMode === 'transactions' ? (
                        <>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                Comment on transactions flagged for review or with audit warnings. Comments are saved in your browser and written to
                                {' '}<strong>Audit Severity</strong>, <strong>Audit Findings</strong>, and <strong>Auditor Comment</strong> columns on the Details as Assets sheet when you save to the report.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={txnFilterMode}
                                    onChange={(e) => setTxnFilterMode(e.target.value)}
                                    className={`text-xs rounded border px-2 py-1 ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'}`}
                                >
                                    <option value="all">All flagged transactions</option>
                                    <option value="review_queue">Review queue only</option>
                                    <option value="warnings">Errors &amp; warnings only</option>
                                </select>
                                {commentCount > 0 && (
                                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {commentCount} comment{commentCount !== 1 ? 's' : ''} drafted
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={handleExportComments}
                                    disabled={exportingComments || !auditFileName || commentCount === 0}
                                    className={`ml-auto text-xs px-3 py-1.5 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed ${isDark
                                        ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                                        : 'border-gray-300 text-gray-800 hover:bg-gray-50'}`}
                                >
                                    {exportingComments ? (
                                        <><i className="fas fa-spinner fa-spin mr-1"></i>Saving…</>
                                    ) : (
                                        <><i className="fas fa-file-export mr-1"></i>Save comments to report</>
                                    )}
                                </button>
                            </div>
                            <TransactionReviewList
                                reviewTransactions={reviewTransactions}
                                comments={comments}
                                onCommentChange={handleCommentChange}
                                filterMode={txnFilterMode}
                                isDark={isDark}
                            />
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-2">
                                <select
                                    value={filterSeverity}
                                    onChange={(e) => setFilterSeverity(e.target.value)}
                                    className={`text-xs rounded border px-2 py-1 ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'}`}
                                >
                                    <option value="all">All severities</option>
                                    <option value="error">Errors</option>
                                    <option value="warning">Warnings</option>
                                    <option value="info">Info</option>
                                </select>
                                <select
                                    value={filterCheck}
                                    onChange={(e) => setFilterCheck(e.target.value)}
                                    className={`text-xs rounded border px-2 py-1 ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'}`}
                                >
                                    <option value="all">All checks</option>
                                    {checkTypes.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <FindingsTable
                                findings={findings}
                                filterSeverity={filterSeverity}
                                filterCheck={filterCheck}
                                isDark={isDark}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

window.DispenseExceptionAudit = DispenseExceptionAudit;
