// Fuel Refund Report Audit — upload Detailed Fuel Refund Report xlsx, run server audit, download findings
const { useState, useRef, useEffect, useCallback } = React;

const OPTIONS_STORAGE_KEY = 'fuelRefundAuditOptions';

function formatElapsed(ms) {
    if (ms < 0 || !Number.isFinite(ms)) return '';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return min ? `${h}h ${min}m ${s}s` : `${h}h ${s}s`;
}

function loadSavedOptions() {
    try {
        const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function saveOptions(options) {
    try {
        localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
    } catch (_) {
        /* ignore quota / private mode */
    }
}

const FuelRefundReportAudit = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const saved = loadSavedOptions();
    const [file, setFile] = useState(null);
    const [reportStage, setReportStage] = useState(saved?.reportStage || 'checking');
    const [requirePumpReadings, setRequirePumpReadings] = useState(!!saved?.requirePumpReadings);
    const [requireTankReadings, setRequireTankReadings] = useState(!!saved?.requireTankReadings);
    const [requireConsumptionAssessment, setRequireConsumptionAssessment] = useState(
        !!saved?.requireConsumptionAssessment
    );
    const [processing, setProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingPhase, setProcessingPhase] = useState('');
    const [elapsedText, setElapsedText] = useState('');
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const fileInputRef = useRef(null);
    const processingStartRef = useRef(null);
    const elapsedTimerRef = useRef(null);

    const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const text = isDark ? 'text-gray-100' : 'text-gray-900';
    const muted = isDark ? 'text-gray-400' : 'text-gray-500';

    useEffect(() => {
        saveOptions({
            reportStage,
            requirePumpReadings,
            requireTankReadings,
            requireConsumptionAssessment,
        });
    }, [reportStage, requirePumpReadings, requireTankReadings, requireConsumptionAssessment]);

    useEffect(() => {
        return () => {
            if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
        };
    }, []);

    const getHeaders = () => {
        const token = window.storage?.getToken?.();
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const startElapsedTimer = useCallback(() => {
        processingStartRef.current = Date.now();
        setElapsedText('0s');
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = setInterval(() => {
            setElapsedText(formatElapsed(Date.now() - (processingStartRef.current || Date.now())));
        }, 1000);
    }, []);

    const stopElapsedTimer = useCallback(() => {
        if (elapsedTimerRef.current) {
            clearInterval(elapsedTimerRef.current);
            elapsedTimerRef.current = null;
        }
        if (processingStartRef.current) {
            setElapsedText(formatElapsed(Date.now() - processingStartRef.current));
        }
    }, []);

    const handleFileSelect = (event) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        const ext = selected.name.split('.').pop()?.toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            setError('Please upload an Excel workbook (.xlsx or .xls).');
            return;
        }
        setError(null);
        setResult(null);
        setFile(selected);
    };

    const runAudit = () => {
        if (!file) return;
        setProcessing(true);
        setError(null);
        setResult(null);
        setUploadProgress(0);
        setProcessingPhase('Uploading workbook…');
        startElapsedTimer();

        const form = new FormData();
        form.append('file', file);
        form.append('reportStage', reportStage);
        if (requirePumpReadings) form.append('requirePumpReadings', 'true');
        if (requireTankReadings) form.append('requireTankReadings', 'true');
        if (requireConsumptionAssessment) form.append('requireConsumptionAssessment', 'true');

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/fuel-refund-audit/process');
        const headers = getHeaders();
        Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                const pct = Math.round((event.loaded / event.total) * 100);
                setUploadProgress(pct);
                setProcessingPhase(`Uploading workbook… ${pct}%`);
            }
        };

        xhr.upload.onload = () => {
            setUploadProgress(100);
            setProcessingPhase('Running audit rules on server…');
        };

        xhr.onload = () => {
            stopElapsedTimer();
            setProcessing(false);
            setUploadProgress(0);
            setProcessingPhase('');

            let payload = {};
            try {
                payload = JSON.parse(xhr.responseText || '{}');
            } catch (_) {
                setError('Invalid response from server');
                return;
            }

            const data = payload?.data ?? payload;

            if (xhr.status < 200 || xhr.status >= 300) {
                const message =
                    payload?.error?.message || payload?.error || `Server error ${xhr.status}`;
                setError(message);
                return;
            }

            setResult(data);
        };

        xhr.onerror = () => {
            stopElapsedTimer();
            setProcessing(false);
            setUploadProgress(0);
            setProcessingPhase('');
            setError('Network error while uploading workbook');
        };

        xhr.onabort = () => {
            stopElapsedTimer();
            setProcessing(false);
            setUploadProgress(0);
            setProcessingPhase('');
            setError('Upload cancelled');
        };

        xhr.send(form);
    };

    const reset = () => {
        setFile(null);
        setResult(null);
        setError(null);
        setUploadProgress(0);
        setProcessingPhase('');
        setElapsedText('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const summary = result?.summary || {};
    const bySeverity = summary.by_severity || {};
    const rowsPassed = summary.rows_passed ?? 0;
    const rowsFailed = summary.rows_failed ?? 0;
    const rowsWarningOnly = summary.rows_warning_only ?? 0;
    const rowsAudited = summary.rows_audited ?? summary.row_count_combined ?? 0;
    const passRatePct = summary.pass_rate_pct ?? 0;
    const allRowsPassed = rowsAudited > 0 && rowsPassed === rowsAudited;

    const checksPassed = summary.checks_passed || [];
    const checksFailed = summary.checks_failed || [];
    const checksSkipped = summary.checks_skipped || [];
    const processTaskNames = {};
    checksFailed.forEach((item) => {
        if (item.process_task) processTaskNames[item.check_id] = item.process_task;
    });

    const checkRows = [
        ...checksFailed.map((item) => ({
            checkId: item.check_id,
            processTask: item.process_task,
            count: item.count,
            status: 'fail',
        })),
        ...checksSkipped.map((checkId) => ({
            checkId,
            processTask: processTaskNames[checkId] || null,
            count: 0,
            status: 'skipped',
        })),
        ...checksPassed.map((checkId) => ({
            checkId,
            processTask: null,
            count: 0,
            status: 'pass',
        })),
    ].sort((a, b) => a.checkId.localeCompare(b.checkId));

    const progressTotal = Math.max(rowsPassed + rowsFailed + rowsWarningOnly, 1);
    const passPct = (rowsPassed / progressTotal) * 100;
    const warnPct = (rowsWarningOnly / progressTotal) * 100;
    const failPct = (rowsFailed / progressTotal) * 100;

    const isUploading = processing && uploadProgress < 100;
    const isServerProcessing = processing && uploadProgress >= 100;

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`rounded-lg border p-4 ${card}`}>
                    <h3 className={`text-sm font-semibold mb-1 ${text}`}>Fuel Refund Report Audit</h3>
                    <p className={`text-xs mb-4 ${muted}`}>
                        Upload a Detailed Fuel Refund Report workbook (Combined Fuel Transactions). Returns an
                        annotated workbook with inline audit columns A–E on the combined sheet, plus Audit
                        Findings and Audit Summary sheets.
                    </p>

                    <div className="flex flex-wrap gap-4 mb-4 text-sm">
                        <label className={`flex items-center gap-2 ${text}`}>
                            <span className={muted}>Stage:</span>
                            <select
                                value={reportStage}
                                onChange={(e) => setReportStage(e.target.value)}
                                disabled={processing}
                                className={`rounded border px-2 py-1 text-sm ${
                                    isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'
                                }`}
                            >
                                <option value="checking">Checking copy</option>
                                <option value="final">Final submission</option>
                            </select>
                        </label>
                    </div>

                    <div className={`space-y-2 mb-4 text-sm ${text}`}>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={requirePumpReadings}
                                onChange={(e) => setRequirePumpReadings(e.target.checked)}
                                disabled={processing}
                            />
                            <span>
                                <span className="font-medium">Require pump readings</span>
                                <span className={`block text-xs ${muted}`}>
                                    Flag dispense rows missing Pump Readings Before/After (optional; off by
                                    default).
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={requireTankReadings}
                                onChange={(e) => setRequireTankReadings(e.target.checked)}
                                disabled={processing}
                            />
                            <span>
                                <span className="font-medium">Require tank readings</span>
                                <span className={`block text-xs ${muted}`}>
                                    Flag missing tank litre Before/After on combined and asset sheets when those
                                    columns exist.
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={requireConsumptionAssessment}
                                onChange={(e) => setRequireConsumptionAssessment(e.target.checked)}
                                disabled={processing}
                            />
                            <span>
                                <span className="font-medium">Assess consumption rates</span>
                                <span className={`block text-xs ${muted}`}>
                                    Flag dispenses where Consumption (L/hr or L/km) is far above the asset median
                                    or configured caps (optional; off by default).
                                </span>
                            </span>
                        </label>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                        disabled={processing}
                        className="block w-full text-sm mb-3"
                    />

                    {file && (
                        <p className={`text-xs mb-3 ${muted}`}>
                            Selected: <span className={text}>{file.name}</span> (
                            {(file.size / (1024 * 1024)).toFixed(2)} MB)
                        </p>
                    )}

                    {processing && (
                        <div className="mb-4 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className={muted}>{processingPhase || 'Processing…'}</span>
                                {elapsedText && <span className={muted}>Elapsed: {elapsedText}</span>}
                            </div>
                            {isUploading && (
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary-600 rounded-full transition-all duration-200"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                    <span className={`text-xs ${muted}`}>{uploadProgress}%</span>
                                </div>
                            )}
                            {isServerProcessing && (
                                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full w-1/3 bg-primary-600 rounded-full animate-pulse" />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={runAudit}
                            disabled={!file || processing}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                            {processing ? 'Running audit…' : 'Run audit'}
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            disabled={processing}
                            className={`px-4 py-2 text-sm rounded-lg border ${
                                isDark ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700'
                            }`}
                        >
                            Reset
                        </button>
                    </div>

                    {error && (
                        <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
                            {error}
                        </div>
                    )}

                    <details className={`mt-4 rounded-lg border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                        <summary className={`px-3 py-2 text-xs cursor-pointer font-medium ${text}`}>
                            Excel colour legend
                        </summary>
                        <div className={`px-3 pb-3 space-y-2 text-xs ${muted}`}>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#E8F5E9' }} />
                                Pass — audit columns only (row passed all checks)
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#E2D5F0' }} />
                                Error — full row highlight
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#EDE7F6' }} />
                                Warning — full row highlight
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#DDEBF7' }} />
                                Info — full row highlight
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#1F4E79' }} />
                                Audit Findings sheet header
                            </div>
                        </div>
                    </details>
                </div>

                {result && (
                    <div className={`rounded-lg border p-4 ${card}`}>
                        <h4 className={`text-sm font-semibold mb-3 ${text}`}>Audit results</h4>

                        {allRowsPassed && (
                            <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 text-sm">
                                All {rowsAudited} combined transaction rows passed — no findings on the
                                combined sheet.
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                            <div className="rounded-lg p-3 text-center bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
                                <div className="text-lg font-bold text-red-700 dark:text-red-300">
                                    {bySeverity.error || rowsFailed || 0}
                                </div>
                                <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
                            </div>
                            <div className="rounded-lg p-3 text-center bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                                    {bySeverity.warning || rowsWarningOnly || 0}
                                </div>
                                <div className="text-xs text-amber-600 dark:text-amber-400">Warnings</div>
                            </div>
                            <div className="rounded-lg p-3 text-center bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40">
                                <div className="text-lg font-bold text-green-700 dark:text-green-300">
                                    {rowsPassed}
                                </div>
                                <div className="text-xs text-green-600 dark:text-green-400">Passed rows</div>
                            </div>
                            <div
                                className={`rounded-lg p-3 text-center ${
                                    isDark ? 'bg-gray-900' : 'bg-gray-50'
                                }`}
                            >
                                <div className={`text-lg font-bold ${text}`}>{passRatePct}%</div>
                                <div className={`text-xs ${muted}`}>Pass rate</div>
                            </div>
                            <div
                                className={`rounded-lg p-3 text-center ${
                                    isDark ? 'bg-gray-900' : 'bg-gray-50'
                                }`}
                            >
                                <div className={`text-lg font-bold ${text}`}>
                                    {summary.row_count_combined ?? rowsAudited}
                                </div>
                                <div className={`text-xs ${muted}`}>Combined rows</div>
                            </div>
                            {elapsedText && (
                                <div
                                    className={`rounded-lg p-3 text-center ${
                                        isDark ? 'bg-gray-900' : 'bg-gray-50'
                                    }`}
                                >
                                    <div className={`text-lg font-bold ${text}`}>{elapsedText}</div>
                                    <div className={`text-xs ${muted}`}>Completed in</div>
                                </div>
                            )}
                        </div>

                        {rowsAudited > 0 && (
                            <div className="mb-4">
                                <div className={`text-xs mb-1 ${muted}`}>Row outcomes (combined sheet)</div>
                                <div className="flex h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    {passPct > 0 && (
                                        <div
                                            className="bg-green-500"
                                            style={{ width: `${passPct}%` }}
                                            title={`${rowsPassed} passed`}
                                        />
                                    )}
                                    {warnPct > 0 && (
                                        <div
                                            className="bg-amber-400"
                                            style={{ width: `${warnPct}%` }}
                                            title={`${rowsWarningOnly} warning only`}
                                        />
                                    )}
                                    {failPct > 0 && (
                                        <div
                                            className="bg-red-500"
                                            style={{ width: `${failPct}%` }}
                                            title={`${rowsFailed} failed`}
                                        />
                                    )}
                                </div>
                                <div className={`flex gap-4 mt-1 text-xs ${muted}`}>
                                    <span className="text-green-600 dark:text-green-400">
                                        {rowsPassed} pass
                                    </span>
                                    <span className="text-amber-600 dark:text-amber-400">
                                        {rowsWarningOnly} warning
                                    </span>
                                    <span className="text-red-600 dark:text-red-400">{rowsFailed} fail</span>
                                </div>
                            </div>
                        )}

                        {Array.isArray(summary.refund_rates) && summary.refund_rates.length > 0 && (
                            <p className={`text-xs mb-3 ${muted}`}>
                                Refund rate:{' '}
                                <span className={text}>
                                    {summary.refund_rates.map((r) => `${r.rate} (${r.label})`).join('; ')}
                                </span>
                            </p>
                        )}

                        {result.hasErrors && !allRowsPassed && (
                            <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                                One or more error-severity findings were detected.
                            </p>
                        )}

                        {result.downloadUrl && (
                            <div className="mb-4">
                                <a
                                    href={result.downloadUrl}
                                    download={result.fileName || 'fuel-refund-audit.xlsx'}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700"
                                >
                                    <i className="fas fa-download" />
                                    Download audit workbook
                                </a>
                                <p className={`text-xs mt-2 ${muted}`}>
                                    Audit columns A–E on Combined Fuel Transactions; original data from column F.
                                </p>
                            </div>
                        )}

                        {checkRows.length > 0 && (
                            <div>
                                <h5 className={`text-xs font-semibold mb-2 ${muted}`}>Checks</h5>
                                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                                <th className="text-left py-1 pr-4">Check</th>
                                                <th className="text-right py-1 pr-4">Failed count</th>
                                                <th className="text-left py-1">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {checkRows.map((row) => (
                                                <tr key={row.checkId} className={text}>
                                                    <td className="py-1 pr-4 font-mono">{row.checkId}</td>
                                                    <td className="py-1 pr-4 text-right">
                                                        {row.status === 'fail' ? row.count : '—'}
                                                    </td>
                                                    <td className="py-1">
                                                        {row.status === 'pass' && (
                                                            <span className="text-green-600 dark:text-green-400">
                                                                ✓ Pass
                                                            </span>
                                                        )}
                                                        {row.status === 'fail' && (
                                                            <span className="text-red-600 dark:text-red-400">
                                                                Fail
                                                            </span>
                                                        )}
                                                        {row.status === 'skipped' && (
                                                            <span className="text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide">
                                                                Skipped
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

window.FuelRefundReportAudit = FuelRefundReportAudit;
