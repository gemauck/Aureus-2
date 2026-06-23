// Dispense Exception Prep — prepare InsightWare exception workbooks for analyst review
const { useState, useRef, useEffect, useCallback } = React;

function formatElapsed(ms) {
    if (ms < 0 || !Number.isFinite(ms)) return '';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
}

const DispenseExceptionPrep = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const [workbook, setWorkbook] = useState(null);
    const [assetLookup, setAssetLookup] = useState(null);
    const [avrSyncLookup, setAvrSyncLookup] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingPhase, setProcessingPhase] = useState('');
    const [elapsedText, setElapsedText] = useState('');
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const workbookRef = useRef(null);
    const assetLookupRef = useRef(null);
    const avrSyncRef = useRef(null);
    const processingStartRef = useRef(null);
    const elapsedTimerRef = useRef(null);

    const card = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200';
    const text = isDark ? 'text-slate-100' : 'text-gray-900';
    const muted = isDark ? 'text-slate-400' : 'text-gray-500';

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

    const validateExcel = (file) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ['xlsx', 'xls'].includes(ext);
    };

    const handleWorkbookSelect = (event) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (!validateExcel(selected)) {
            setError('Exception workbook must be .xlsx or .xls');
            return;
        }
        setError(null);
        setResult(null);
        setWorkbook(selected);
    };

    const handleAssetLookupSelect = (event) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (!validateExcel(selected)) {
            setError('Asset lookup must be .xlsx or .xls');
            return;
        }
        setError(null);
        setAssetLookup(selected);
    };

    const handleAvrSyncSelect = (event) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (!validateExcel(selected)) {
            setError('AVR Sync lookup must be .xlsx or .xls');
            return;
        }
        setError(null);
        setAvrSyncLookup(selected);
    };

    const runPrepare = () => {
        if (!workbook) return;
        setProcessing(true);
        setError(null);
        setResult(null);
        setUploadProgress(0);
        setProcessingPhase('Uploading files…');
        startElapsedTimer();

        const form = new FormData();
        form.append('workbook', workbook);
        if (assetLookup) form.append('assetLookup', assetLookup);
        if (avrSyncLookup) form.append('avrSyncLookup', avrSyncLookup);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/dispense-exception-prep/process');
        const headers = getHeaders();
        Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                const pct = Math.round((event.loaded / event.total) * 100);
                setUploadProgress(pct);
                setProcessingPhase(`Uploading… ${pct}%`);
            }
        };

        xhr.upload.onload = () => {
            setUploadProgress(100);
            setProcessingPhase('Preparing workbook on server…');
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
                setError(payload?.error?.message || payload?.error || `Server error ${xhr.status}`);
                return;
            }
            setResult(data);
        };

        xhr.onerror = () => {
            stopElapsedTimer();
            setProcessing(false);
            setUploadProgress(0);
            setProcessingPhase('');
            setError('Network error while uploading');
        };

        xhr.send(form);
    };

    const reset = () => {
        setWorkbook(null);
        setAssetLookup(null);
        setAvrSyncLookup(null);
        setResult(null);
        setError(null);
        setUploadProgress(0);
        setProcessingPhase('');
        setElapsedText('');
        if (workbookRef.current) workbookRef.current.value = '';
        if (assetLookupRef.current) assetLookupRef.current.value = '';
        if (avrSyncRef.current) avrSyncRef.current.value = '';
    };

    const summary = result?.summary || {};
    const isUploading = processing && uploadProgress < 100;
    const isServerProcessing = processing && uploadProgress >= 100;

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`rounded-lg border p-4 ${card}`}>
                    <h3 className={`text-sm font-semibold mb-1 ${text}`}>
                        <i className="fas fa-filter mr-2"></i>
                        Dispense Exception Prep
                    </h3>
                    <p className={`text-xs mb-4 ${muted}`}>
                        Upload the raw InsightWare <strong className={text}>Transaction Exceptions – In Context</strong>{' '}
                        export. The tool filters non-mining rows, splits 60/120 minute exception reasons, enriches
                        economy and department fields, flags AVR sync hits, and builds review summary tabs for the
                        analyst.
                    </p>

                    <div className="space-y-3 mb-4">
                        <div>
                            <label htmlFor="exception-workbook-upload" className={`block text-xs font-medium mb-1 ${text}`}>
                                Exception workbook <span className="text-red-500">*</span>
                            </label>
                            <input
                                ref={workbookRef}
                                id="exception-workbook-upload"
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleWorkbookSelect}
                                disabled={processing}
                                className="block w-full text-xs"
                            />
                            {workbook && (
                                <p className={`text-xs mt-1 ${muted}`}>
                                    <i className="fas fa-file-excel mr-1"></i>
                                    {workbook.name}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="asset-lookup-upload" className={`block text-xs font-medium mb-1 ${text}`}>
                                Asset Info Lookup <span className={muted}>(optional)</span>
                            </label>
                            <input
                                ref={assetLookupRef}
                                id="asset-lookup-upload"
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleAssetLookupSelect}
                                disabled={processing}
                                className="block w-full text-xs"
                            />
                            {assetLookup && (
                                <p className={`text-xs mt-1 ${muted}`}>
                                    <i className="fas fa-file-excel mr-1"></i>
                                    {assetLookup.name}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="avr-sync-upload" className={`block text-xs font-medium mb-1 ${text}`}>
                                AVR Sync Lookup <span className={muted}>(optional)</span>
                            </label>
                            <input
                                ref={avrSyncRef}
                                id="avr-sync-upload"
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleAvrSyncSelect}
                                disabled={processing}
                                className="block w-full text-xs"
                            />
                            {avrSyncLookup && (
                                <p className={`text-xs mt-1 ${muted}`}>
                                    <i className="fas fa-file-excel mr-1"></i>
                                    {avrSyncLookup.name}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={runPrepare}
                            disabled={!workbook || processing}
                            className={`px-4 py-2 text-sm font-medium rounded-lg ${
                                !workbook || processing
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                            {processing ? (
                                <>
                                    <i className="fas fa-spinner fa-spin mr-2"></i>
                                    Preparing…
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-magic mr-2"></i>
                                    Prepare workbook
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            disabled={processing}
                            className={`px-4 py-2 text-sm rounded-lg border ${
                                isDark
                                    ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            Reset
                        </button>
                    </div>

                    {processing && (
                        <div className={`mt-4 text-xs ${muted}`}>
                            <p>{processingPhase}</p>
                            {elapsedText && <p>Elapsed: {elapsedText}</p>}
                            {isUploading && (
                                <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                        className="h-full bg-blue-600 transition-all"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            )}
                            {isServerProcessing && (
                                <p className="mt-1">
                                    <i className="fas fa-cog fa-spin mr-1"></i>
                                    Running exception rules and building review tabs…
                                </p>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs whitespace-pre-wrap">
                            {error}
                        </div>
                    )}
                </div>

                <div className={`rounded-lg border p-4 ${card}`}>
                    <h3 className={`text-sm font-semibold mb-3 ${text}`}>What gets prepared</h3>
                    <ul className={`text-xs space-y-2 list-disc pl-4 ${muted}`}>
                        <li>Filters out non-mining / non-eligible asset groups</li>
                        <li>Splits exception reasons into 120 min and 60 min columns</li>
                        <li>Enriches department and 180-day average economy from Asset Lookup</li>
                        <li>Flags AVR Sync transactions when AVR lookup is supplied</li>
                        <li>Highlights rows: green (routine), orange (review), yellow (AVR sync)</li>
                        <li>Adds <code>Transactions for Review</code>, <code>Possible Cause Summary</code>, and <code>Summary Per Asset</code> tabs</li>
                    </ul>
                    <p className={`text-xs mt-4 ${muted}`}>
                        Analysts still add <strong className={text}>Abco Comment</strong> and move rows to an
                        ineligible tab manually — this tool does the heavy structural prep.
                    </p>
                </div>
            </div>

            {result && (
                <div className={`rounded-lg border p-4 ${card}`}>
                    <h3 className={`text-sm font-semibold mb-3 ${text}`}>
                        <i className="fas fa-check-circle text-green-500 mr-2"></i>
                        Prepared workbook ready
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {[
                            ['Transactions', summary.transaction_count],
                            ['Review queue', summary.review_queue_count],
                            ['Flagged exceptions', summary.flagged_exception_count],
                            ['AVR sync hits', summary.avr_sync_count],
                            ['Excluded non-mining', summary.excluded_non_mining_count],
                            ['Possible cause groups', summary.possible_cause_groups],
                            ['Assets in summary', summary.summary_asset_count],
                        ].map(([label, value]) => (
                            <div
                                key={label}
                                className={`rounded-lg border p-3 ${isDark ? 'border-slate-600' : 'border-gray-200'}`}
                            >
                                <p className={`text-[10px] uppercase tracking-wide ${muted}`}>{label}</p>
                                <p className={`text-lg font-semibold ${text}`}>{value ?? '—'}</p>
                            </div>
                        ))}
                    </div>
                    <a
                        href={result.downloadUrl}
                        download={result.fileName || 'dispense-exception-prepared.xlsx'}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700"
                    >
                        <i className="fas fa-download mr-2"></i>
                        Download prepared workbook
                    </a>
                </div>
            )}
        </div>
    );
};

window.DispenseExceptionPrep = DispenseExceptionPrep;

if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
        new CustomEvent('componentLoaded', {
            detail: { component: 'DispenseExceptionPrep' },
        })
    );
}
