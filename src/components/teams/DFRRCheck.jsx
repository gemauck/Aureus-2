// DFRR Check — audit Detailed Fuel Refund Report workbooks (Data Analytics team)
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

const DFRRCheck = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const saved = loadSavedOptions();
    const [file, setFile] = useState(null);
    const [requirePumpReadings, setRequirePumpReadings] = useState(!!saved?.requirePumpReadings);
    const [requireTankReadings, setRequireTankReadings] = useState(!!saved?.requireTankReadings);
    const [requireConsumptionAssessment, setRequireConsumptionAssessment] = useState(
        !!saved?.requireConsumptionAssessment
    );
    const [requireRefundRateCheck, setRequireRefundRateCheck] = useState(
        !!saved?.requireRefundRateCheck
    );
    const [requireOperatorCheck, setRequireOperatorCheck] = useState(!!saved?.requireOperatorCheck);
    const [requireLocationCheck, setRequireLocationCheck] = useState(!!saved?.requireLocationCheck);
    const [selectedCheckId, setSelectedCheckId] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingPhase, setProcessingPhase] = useState('');
    const [elapsedText, setElapsedText] = useState('');
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const fileInputRef = useRef(null);
    const processingStartRef = useRef(null);
    const elapsedTimerRef = useRef(null);

    const card = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200';
    const text = isDark ? 'text-slate-100' : 'text-gray-900';
    const muted = isDark ? 'text-slate-400' : 'text-gray-500';

    useEffect(() => {
        saveOptions({
            requirePumpReadings,
            requireTankReadings,
            requireConsumptionAssessment,
            requireRefundRateCheck,
            requireOperatorCheck,
            requireLocationCheck,
        });
    }, [
        requirePumpReadings,
        requireTankReadings,
        requireConsumptionAssessment,
        requireRefundRateCheck,
        requireOperatorCheck,
        requireLocationCheck,
    ]);

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
        setSelectedCheckId(null);
        setFile(selected);
    };

    const runAudit = () => {
        if (!file) return;
        setProcessing(true);
        setError(null);
        setResult(null);
        setSelectedCheckId(null);
        setUploadProgress(0);
        setProcessingPhase('Uploading workbook…');
        startElapsedTimer();

        const form = new FormData();
        form.append('file', file);
        if (requirePumpReadings) form.append('requirePumpReadings', 'true');
        if (requireTankReadings) form.append('requireTankReadings', 'true');
        if (requireConsumptionAssessment) form.append('requireConsumptionAssessment', 'true');
        if (requireRefundRateCheck) form.append('requireRefundRateCheck', 'true');
        if (requireOperatorCheck) form.append('requireOperatorCheck', 'true');
        if (requireLocationCheck) form.append('requireLocationCheck', 'true');

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
        setSelectedCheckId(null);
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

    const allFindings = Array.isArray(summary.findings) ? summary.findings : [];
    const filteredFindings = selectedCheckId
        ? allFindings.filter((f) => f.check_id === selectedCheckId)
        : [];
    const interpretationHints = summary.interpretation_hints || [];
    const parseWarnings = summary.parse_warnings || [];

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
                    <h3 className={`text-sm font-semibold mb-1 ${text}`}>
                        <i className="fas fa-gas-pump mr-2"></i>
                        DFRR Check
                    </h3>
                    <p className={`text-xs mb-2 ${muted}`}>
                        Upload the <strong className={text}>original</strong> InsightWare Detailed Fuel Refund
                        Report export (not a file that already has <code>-audit</code> in the name). Each run
                        replaces prior audit columns A–E and audit sheets with a fresh result.
                    </p>
                    <p className={`text-xs mb-4 ${muted}`}>
                        Returns an annotated workbook (inline audit columns A–E on Combined Fuel Transactions)
                        plus Audit Findings and Audit Summary sheets.
                    </p>

                    <div className={`rounded-lg border p-3 mb-4 space-y-2 text-sm ${text} ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Audit options</p>
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
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={requireRefundRateCheck}
                                onChange={(e) => setRequireRefundRateCheck(e.target.checked)}
                                disabled={processing}
                            />
                            <span>
                                <span className="font-medium">Check refund rate vs summary</span>
                                <span className={`block text-xs ${muted}`}>
                                    Compare Refund Price to Combined Tank Summary on rows with a claim only
                                    (optional; off by default — avoids thousands of historical rate warnings).
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={requireOperatorCheck}
                                onChange={(e) => setRequireOperatorCheck(e.target.checked)}
                                disabled={processing}
                            />
                            <span>
                                <span className="font-medium">Check missing operator</span>
                                <span className={`block text-xs ${muted}`}>
                                    Flag mining-eligible dispense rows where Operator is blank (optional; off by
                                    default).
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={requireLocationCheck}
                                onChange={(e) => setRequireLocationCheck(e.target.checked)}
                                disabled={processing}
                            />
                            <span>
                                <span className="font-medium">Check missing location</span>
                                <span className={`block text-xs ${muted}`}>
                                    Flag mining-eligible dispense rows where Location is blank (optional; off by
                                    default).
                                </span>
                            </span>
                        </label>
                    </div>

                    <div className={`rounded-lg border p-4 mb-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <label
                            htmlFor="dfrr-upload"
                            className={`block w-full p-5 border-2 border-dashed rounded-lg text-center cursor-pointer transition ${
                                isDark ? 'border-slate-600 hover:border-blue-500 bg-slate-700/40' : 'border-gray-300 hover:border-blue-400 bg-gray-50'
                            }`}
                        >
                            <input
                                id="dfrr-upload"
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileSelect}
                                disabled={processing}
                                className="hidden"
                            />
                            {file ? (
                                <div>
                                    <i className={`fas fa-file-excel text-2xl mb-2 ${isDark ? 'text-green-400' : 'text-green-600'}`}></i>
                                    <p className={`text-sm font-medium ${text}`}>{file.name}</p>
                                    <p className={`text-xs mt-1 ${muted}`}>{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                                </div>
                            ) : (
                                <div>
                                    <i className={`fas fa-cloud-upload-alt text-2xl mb-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}></i>
                                    <p className={`text-sm font-medium ${text}`}>Click to upload DFRR workbook</p>
                                    <p className={`text-xs mt-1 ${muted}`}>Excel (.xlsx, .xls)</p>
                                </div>
                            )}
                        </label>
                        {file && !processing && (
                            <button
                                type="button"
                                onClick={() => {
                                    setFile(null);
                                    setResult(null);
                                    setError(null);
                                    setSelectedCheckId(null);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                                    isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-times mr-1"></i>
                                Clear file
                            </button>
                        )}
                    </div>

                    {processing && (
                        <div className={`rounded-lg border p-4 mb-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-3 mb-3">
                                <i className="fas fa-spinner fa-spin text-blue-600"></i>
                                <div className="flex-1">
                                    <p className={`text-sm font-medium ${text}`}>Processing...</p>
                                    <p className={`text-xs mt-1 ${muted}`}>{processingPhase || 'Running audit…'}</p>
                                </div>
                                {elapsedText && <span className={`text-xs font-medium ${muted}`}>{elapsedText}</span>}
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

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            type="button"
                            onClick={runAudit}
                            disabled={!file || processing}
                            className={`px-4 py-3 rounded-lg text-sm font-medium transition ${
                                !file || processing
                                    ? isDark
                                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                            {processing ? (
                                <>
                                    <i className="fas fa-spinner fa-spin mr-2"></i>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-play mr-2"></i>
                                    Process & Generate Report
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            disabled={processing}
                            className={`px-4 py-3 text-sm rounded-lg border ${
                                isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <i className="fas fa-rotate-left mr-2"></i>
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
                        <h4 className={`text-sm font-semibold mb-3 ${text}`}>
                            <i className="fas fa-clipboard-check mr-2"></i>
                            DFRR audit results
                        </h4>

                        {parseWarnings.length > 0 && (
                            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 text-sm space-y-1">
                                {parseWarnings.map((w) => (
                                    <p key={w}>{w}</p>
                                ))}
                            </div>
                        )}

                        {interpretationHints.length > 0 && (
                            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-sm space-y-2">
                                {interpretationHints.map((hint) => (
                                    <p key={hint}>{hint}</p>
                                ))}
                            </div>
                        )}

                        {summary.findings_truncated && (
                            <p className={`text-xs mb-3 ${muted}`}>
                                Showing first {allFindings.length} of {summary.findings_total} findings in the
                                browser; download the workbook for the full Audit Findings sheet.
                            </p>
                        )}

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
                                <div className="flex items-center justify-between mb-2">
                                    <h5 className={`text-xs font-semibold ${muted}`}>Checks</h5>
                                    {selectedCheckId && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCheckId(null)}
                                            className={`text-xs underline ${muted}`}
                                        >
                                            Clear filter
                                        </button>
                                    )}
                                </div>
                                <p className={`text-xs mb-2 ${muted}`}>
                                    Click a check with findings to preview rows below (download workbook for
                                    full detail).
                                </p>
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
                                            {checkRows.map((row) => {
                                                const clickable =
                                                    row.status === 'fail' && row.count > 0;
                                                const isSelected = selectedCheckId === row.checkId;
                                                return (
                                                    <tr
                                                        key={row.checkId}
                                                        className={`${text} ${
                                                            clickable ? 'cursor-pointer' : ''
                                                        } ${
                                                            isSelected
                                                                ? isDark
                                                                    ? 'bg-gray-700'
                                                                    : 'bg-gray-100'
                                                                : ''
                                                        }`}
                                                        onClick={() => {
                                                            if (clickable) {
                                                                setSelectedCheckId(
                                                                    isSelected ? null : row.checkId
                                                                );
                                                            }
                                                        }}
                                                    >
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
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {selectedCheckId && (
                                    <div className="mt-4">
                                        <h5 className={`text-xs font-semibold mb-2 ${muted}`}>
                                            Findings: {selectedCheckId}
                                            {filteredFindings.length > 0 && (
                                                <span className="font-normal">
                                                    {' '}
                                                    (showing {Math.min(filteredFindings.length, 50)}
                                                    {filteredFindings.length > 50 ? '+' : ''})
                                                </span>
                                            )}
                                        </h5>
                                        <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-600">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                                        <th className="text-left py-1 px-2">Severity</th>
                                                        <th className="text-left py-1 px-2">Sheet</th>
                                                        <th className="text-left py-1 px-2">Row</th>
                                                        <th className="text-left py-1 px-2">Txn ID</th>
                                                        <th className="text-left py-1 px-2">Message</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredFindings.length === 0 ? (
                                                        <tr>
                                                            <td
                                                                colSpan={5}
                                                                className={`py-2 px-2 ${muted}`}
                                                            >
                                                                No findings in preview (may be truncated).
                                                                Use the downloaded workbook.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        filteredFindings.slice(0, 50).map((f, idx) => (
                                                            <tr
                                                                key={`${f.check_id}-${f.excel_row}-${idx}`}
                                                                className={text}
                                                            >
                                                                <td className="py-1 px-2">{f.severity}</td>
                                                                <td className="py-1 px-2">{f.sheet}</td>
                                                                <td className="py-1 px-2">
                                                                    {f.excel_row ?? '—'}
                                                                </td>
                                                                <td className="py-1 px-2 font-mono">
                                                                    {f.transaction_id || '—'}
                                                                </td>
                                                                <td className="py-1 px-2">{f.message}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={`mt-4 rounded-lg border p-4 ${isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                            <h5 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>
                                <i className="fas fa-info-circle mr-2"></i>
                                About DFRR Check
                            </h5>
                            <ul className={`text-xs space-y-1 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                                <li>• Audits Detailed Fuel Refund Report workbooks against configured rule checks.</li>
                                <li>• Adds inline audit columns A-E plus Audit Findings and Audit Summary sheets.</li>
                                <li>• Safely re-audits files by removing prior audit columns/sheets before processing.</li>
                                <li>• Use optional checkboxes for targeted compliance sweeps (pump, tank, operator, location, rate).</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

window.DFRRCheck = DFRRCheck;
window.FuelRefundReportAudit = DFRRCheck;

if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
        new CustomEvent('componentLoaded', {
            detail: { component: 'DFRRCheck' },
        })
    );
}
