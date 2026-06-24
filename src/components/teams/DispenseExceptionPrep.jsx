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
    const [priorPrepared, setPriorPrepared] = useState(null);
    const [ruleProfile, setRuleProfile] = useState('belfast');
    const [processing, setProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingPhase, setProcessingPhase] = useState('');
    const [elapsedText, setElapsedText] = useState('');
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const workbookRef = useRef(null);
    const assetLookupRef = useRef(null);
    const avrSyncRef = useRef(null);
    const priorPreparedRef = useRef(null);
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

    const handlePriorPreparedSelect = (event) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (!validateExcel(selected)) {
            setError('Prior prepared workbook must be .xlsx or .xls');
            return;
        }
        setError(null);
        setPriorPrepared(selected);
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
        if (priorPrepared) form.append('priorPrepared', priorPrepared);
        if (ruleProfile) form.append('ruleProfile', ruleProfile);

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
        setPriorPrepared(null);
        setResult(null);
        setError(null);
        setUploadProgress(0);
        setProcessingPhase('');
        setElapsedText('');
        if (workbookRef.current) workbookRef.current.value = '';
        if (assetLookupRef.current) assetLookupRef.current.value = '';
        if (avrSyncRef.current) avrSyncRef.current.value = '';
        if (priorPreparedRef.current) priorPreparedRef.current.value = '';
    };

    const summary = result?.summary || {};
    const mom = summary.month_over_month || null;
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
                        export. The tool preserves the source layout, applies Andrew-style review rules, enriches
                        economy fields, flags AVR sync hits, and builds analyst summary tabs.
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
                                AVR Sync Lookup <span className={muted}>(recommended for AVR pass)</span>
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

                        <div>
                            <label htmlFor="prior-prepared-upload" className={`block text-xs font-medium mb-1 ${text}`}>
                                Prior month prepared workbook <span className={muted}>(optional)</span>
                            </label>
                            <input
                                ref={priorPreparedRef}
                                id="prior-prepared-upload"
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handlePriorPreparedSelect}
                                disabled={processing}
                                className="block w-full text-xs"
                            />
                            {priorPrepared && (
                                <p className={`text-xs mt-1 ${muted}`}>
                                    <i className="fas fa-file-excel mr-1"></i>
                                    {priorPrepared.name}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="rule-profile" className={`block text-xs font-medium mb-1 ${text}`}>
                                Site rule profile
                            </label>
                            <select
                                id="rule-profile"
                                value={ruleProfile}
                                onChange={(e) => setRuleProfile(e.target.value)}
                                disabled={processing}
                                className={`w-full text-xs rounded border px-2 py-1.5 ${
                                    isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'
                                }`}
                            >
                                <option value="belfast">Exxaro Belfast (Andrew)</option>
                                <option value="strict">Strict — all exception types</option>
                            </select>
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
                        <li>Light-touch update of <code>Details as Assets</code> — preserves InsightWare layout</li>
                        <li>Single <code>Exception Reason</code> column (60-minute rule)</li>
                        <li>Orange = deemed ineligible, green = other exceptions, yellow = AVR sync</li>
                        <li><code>Transactions deemed ineligible</code> with Review Reason + suggested Abco Comment</li>
                        <li><code>Possible Cause Summary</code> with blank Analyst Notes column</li>
                        <li><code>Non-Mining Excluded</code> and <code>Exception Reason Glossary</code> tabs</li>
                        <li>Optional month-over-month diff when prior prepared workbook is supplied</li>
                    </ul>
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
                            ['Deemed ineligible', summary.review_queue_count],
                            ['Review litres', summary.review_queue_litres],
                            ['Flagged exceptions', summary.flagged_exception_count],
                            ['AVR sync hits', summary.avr_sync_count],
                            ['Non-mining excluded', summary.excluded_non_mining_count],
                            ['Rule profile', summary.rule_profile_label || summary.rule_profile],
                            ['Possible cause groups', summary.possible_cause_groups],
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

                    {Array.isArray(summary.possible_causes) && summary.possible_causes.length > 0 && (
                        <div className="mb-4">
                            <h4 className={`text-xs font-semibold mb-2 ${text}`}>Possible cause breakdown</h4>
                            <div className={`overflow-x-auto rounded border ${isDark ? 'border-slate-600' : 'border-gray-200'}`}>
                                <table className="min-w-full text-xs">
                                    <thead className={isDark ? 'bg-slate-900' : 'bg-gray-50'}>
                                        <tr>
                                            <th className="text-left p-2">Exception reason</th>
                                            <th className="text-left p-2">Cause</th>
                                            <th className="text-right p-2">Txns</th>
                                            <th className="text-right p-2">Litres</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.possible_causes.map((row) => (
                                            <tr key={row.exception_reason} className="border-t border-gray-100">
                                                <td className="p-2">{row.exception_reason}</td>
                                                <td className="p-2">{row.possible_cause}</td>
                                                <td className="p-2 text-right">{row.transaction_count}</td>
                                                <td className="p-2 text-right">{row.litres}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {Array.isArray(summary.review_sample) && summary.review_sample.length > 0 && (
                        <div className="mb-4">
                            <h4 className={`text-xs font-semibold mb-2 ${text}`}>Review queue sample</h4>
                            <div className={`overflow-x-auto rounded border ${isDark ? 'border-slate-600' : 'border-gray-200'}`}>
                                <table className="min-w-full text-xs">
                                    <thead className={isDark ? 'bg-slate-900' : 'bg-gray-50'}>
                                        <tr>
                                            <th className="text-left p-2">Asset</th>
                                            <th className="text-left p-2">Review reason</th>
                                            <th className="text-left p-2">Exception</th>
                                            <th className="text-right p-2">Litres</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.review_sample.map((row) => (
                                            <tr key={row.transaction_id} className="border-t border-gray-100">
                                                <td className="p-2">{row.asset_number}</td>
                                                <td className="p-2">{row.review_reason}</td>
                                                <td className="p-2">{row.exception_reason}</td>
                                                <td className="p-2 text-right">{row.litres}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {mom && (
                        <div className={`mb-4 rounded-lg border p-3 text-xs ${isDark ? 'border-slate-600' : 'border-gray-200'}`}>
                            <h4 className={`font-semibold mb-2 ${text}`}>Month-over-month</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div><span className={muted}>Prior review:</span> {mom.prior_review_count}</div>
                                <div><span className={muted}>New in review:</span> {mom.new_in_review_count}</div>
                                <div><span className={muted}>Repeat in review:</span> {mom.repeat_in_review_count}</div>
                                <div><span className={muted}>Dropped:</span> {mom.dropped_from_review_count}</div>
                                <div><span className={muted}>New review litres:</span> {mom.new_review_litres}</div>
                                <div><span className={muted}>Repeat litres:</span> {mom.repeat_review_litres}</div>
                            </div>
                        </div>
                    )}

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
