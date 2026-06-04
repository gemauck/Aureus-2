// Sparrow to Gilbarco — convert Fuel Dispense Report to Transactions & Fuel Breakdown
const { useState, useRef } = React;

function formatElapsed(ms) {
    if (ms < 0 || !Number.isFinite(ms)) return '';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
}

const SparrowToGilbarco = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const [dispenseFile, setDispenseFile] = useState(null);
    const [referenceFile, setReferenceFile] = useState(null);
    const [includeOverrideFills, setIncludeOverrideFills] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [phase, setPhase] = useState('');
    const [elapsedText, setElapsedText] = useState('');
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const dispenseInputRef = useRef(null);
    const referenceInputRef = useRef(null);
    const startRef = useRef(null);
    const timerRef = useRef(null);

    const card = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200';
    const text = isDark ? 'text-slate-100' : 'text-gray-900';
    const muted = isDark ? 'text-slate-400' : 'text-gray-500';
    const inputBg = isDark ? 'bg-slate-900 border-slate-600' : 'bg-gray-50 border-gray-300';

    const getHeaders = () => {
        const token = window.storage?.getToken?.();
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (startRef.current) {
            setElapsedText(formatElapsed(Date.now() - startRef.current));
        }
    };

    const startTimer = () => {
        startRef.current = Date.now();
        setElapsedText('0s');
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setElapsedText(formatElapsed(Date.now() - (startRef.current || Date.now())));
        }, 1000);
    };

    React.useEffect(() => () => stopTimer(), []);

    const pickExcel = (file) => {
        if (!file) return false;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            setError('Please upload Excel workbooks (.xlsx or .xls).');
            return false;
        }
        return true;
    };

    const handleDispenseSelect = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!pickExcel(f)) return;
        setError(null);
        setResult(null);
        setDispenseFile(f);
    };

    const handleReferenceSelect = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!pickExcel(f)) return;
        setError(null);
        setResult(null);
        setReferenceFile(f);
    };

    const resetAll = () => {
        setDispenseFile(null);
        setReferenceFile(null);
        setResult(null);
        setError(null);
        setUploadProgress(0);
        setPhase('');
        if (dispenseInputRef.current) dispenseInputRef.current.value = '';
        if (referenceInputRef.current) referenceInputRef.current.value = '';
    };

    const runConvert = () => {
        if (!dispenseFile || !referenceFile) {
            setError('Upload both the Fuel Dispense Report and a reference Transactions workbook.');
            return;
        }

        setProcessing(true);
        setError(null);
        setResult(null);
        setUploadProgress(0);
        setPhase('Uploading files…');
        startTimer();

        const form = new FormData();
        form.append('dispense', dispenseFile);
        form.append('reference', referenceFile);
        if (includeOverrideFills) form.append('includeOverrideFills', 'true');

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/tools/sparrow-to-gilbarco');
        const headers = getHeaders();
        Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                const pct = Math.round((event.loaded / event.total) * 100);
                setUploadProgress(pct);
                setPhase(`Uploading… ${pct}%`);
            }
        };

        xhr.upload.onload = () => {
            setUploadProgress(100);
            setPhase('Converting on server…');
        };

        xhr.onload = () => {
            stopTimer();
            setProcessing(false);
            setUploadProgress(0);
            setPhase('');

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
            stopTimer();
            setProcessing(false);
            setPhase('');
            setError('Network error while uploading files');
        };

        xhr.send(form);
    };

    const summary = result?.summary || {};
    const warnings = result?.warnings || summary.warnings || [];

    return (
        <div className="space-y-3">
            <div className={`rounded-lg border p-4 ${card}`}>
                <h3 className={`text-sm font-semibold mb-1 ${text}`}>Sparrow to Gilbarco</h3>
                <p className={`text-xs mb-4 ${muted}`}>
                    Convert a FuelTrack / Sparrow <strong>Fuel Dispense Report</strong> into the{' '}
                    <strong>Transactions &amp; Fuel Breakdown</strong> Excel format. Fleet and pump
                    details are taken from your reference workbook (e.g. a prior month export).
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className={`block text-xs font-medium mb-1 ${text}`}>
                            1. Fuel Dispense Report (.xlsx)
                        </label>
                        <input
                            ref={dispenseInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleDispenseSelect}
                            className={`block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 ${inputBg} border rounded-lg`}
                        />
                        {dispenseFile ? (
                            <p className={`text-[10px] mt-1 truncate ${muted}`}>{dispenseFile.name}</p>
                        ) : null}
                    </div>
                    <div>
                        <label className={`block text-xs font-medium mb-1 ${text}`}>
                            2. Reference Transactions workbook (.xlsx)
                        </label>
                        <input
                            ref={referenceInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleReferenceSelect}
                            className={`block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 ${inputBg} border rounded-lg`}
                        />
                        {referenceFile ? (
                            <p className={`text-[10px] mt-1 truncate ${muted}`}>{referenceFile.name}</p>
                        ) : null}
                    </div>
                </div>

                <label className={`flex items-center gap-2 mt-3 text-xs ${muted}`}>
                    <input
                        type="checkbox"
                        checked={includeOverrideFills}
                        onChange={(e) => setIncludeOverrideFills(e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    Include small manual override fills (no asset number)
                </label>

                <div className="flex flex-wrap items-center gap-2 mt-4">
                    <button
                        type="button"
                        onClick={runConvert}
                        disabled={processing || !dispenseFile || !referenceFile}
                        className="px-4 py-2 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {processing ? 'Converting…' : 'Convert'}
                    </button>
                    <button
                        type="button"
                        onClick={resetAll}
                        disabled={processing}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border ${isDark ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-700'} disabled:opacity-50`}
                    >
                        Reset
                    </button>
                    {processing && elapsedText ? (
                        <span className={`text-xs ${muted}`}>{phase || 'Working…'} · {elapsedText}</span>
                    ) : null}
                </div>

                {processing && uploadProgress > 0 && uploadProgress < 100 ? (
                    <div className="mt-3 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div
                            className="h-full bg-primary-600 transition-all"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                ) : null}

                {error ? (
                    <p className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{error}</p>
                ) : null}
            </div>

            {result ? (
                <div className={`rounded-lg border p-4 ${card}`}>
                    <h4 className={`text-sm font-semibold mb-2 ${text}`}>Conversion complete</h4>
                    <ul className={`text-xs space-y-1 mb-3 ${muted}`}>
                        <li>
                            Dispense rows parsed:{' '}
                            <strong className={text}>{summary.dispense_rows ?? '—'}</strong>
                        </li>
                        <li>
                            All transactions:{' '}
                            <strong className={text}>{summary.all_transactions ?? '—'}</strong>
                            {' · '}
                            Excl. bowsers:{' '}
                            <strong className={text}>
                                {summary.transactions_excl_bowsers ?? '—'}
                            </strong>
                            {' · '}
                            Bowser: <strong className={text}>{summary.bowser_rows ?? '—'}</strong>
                        </li>
                    </ul>

                    {warnings.length > 0 ? (
                        <div
                            className={`mb-3 p-2 rounded text-[10px] max-h-32 overflow-y-auto ${isDark ? 'bg-amber-900/30 text-amber-200' : 'bg-amber-50 text-amber-900'}`}
                        >
                            <p className="font-medium mb-1">Warnings ({warnings.length})</p>
                            <ul className="list-disc pl-4 space-y-0.5">
                                {warnings.slice(0, 15).map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                                {warnings.length > 15 ? (
                                    <li>…and {warnings.length - 15} more</li>
                                ) : null}
                            </ul>
                        </div>
                    ) : null}

                    {result.downloadUrl ? (
                        <a
                            href={result.downloadUrl}
                            download={result.fileName || 'transactions-fuel-breakdown.xlsx'}
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                            <i className="fas fa-download" aria-hidden="true" />
                            Download {result.fileName || 'workbook'}
                        </a>
                    ) : null}
                </div>
            ) : null}

            <div className={`rounded-lg border p-4 text-[10px] ${card} ${muted}`}>
                <p className={`font-medium mb-1 ${text}`}>What you need</p>
                <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                        <strong className={text}>Dispense file</strong> — export from Sparrow /
                        FuelTrack (single sheet with Date &amp; Time, Asset Number, Litres, etc.)
                    </li>
                    <li>
                        <strong className={text}>Reference file</strong> — an existing Transactions
                        &amp; Fuel Breakdown workbook so fleet IDs match Make/Model and pump codes
                    </li>
                </ul>
            </div>
        </div>
    );
};

window.SparrowToGilbarco = SparrowToGilbarco;
