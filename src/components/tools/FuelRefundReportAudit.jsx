// Fuel Refund Report Audit — upload Detailed Fuel Refund Report xlsx, run server audit, download findings
const { useState, useRef } = React;

const FuelRefundReportAudit = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const [file, setFile] = useState(null);
    const [reportStage, setReportStage] = useState('checking');
    const [enableV2, setEnableV2] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const fileInputRef = useRef(null);

    const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const text = isDark ? 'text-gray-100' : 'text-gray-900';
    const muted = isDark ? 'text-gray-400' : 'text-gray-500';

    const getHeaders = () => {
        const token = window.storage?.getToken?.();
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

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

    const runAudit = async () => {
        if (!file) return;
        setProcessing(true);
        setError(null);
        setResult(null);

        try {
            const form = new FormData();
            form.append('file', file);
            form.append('reportStage', reportStage);
            if (enableV2) form.append('enableV2', 'true');

            const response = await fetch('/api/fuel-refund-audit/process', {
                method: 'POST',
                headers: getHeaders(),
                body: form,
            });

            const payload = await response.json().catch(() => ({}));
            const data = payload?.data ?? payload;

            if (!response.ok) {
                const message =
                    payload?.error?.message || payload?.error || `Server error ${response.status}`;
                throw new Error(message);
            }

            setResult(data);
        } catch (e) {
            setError(e.message || 'Audit failed');
        } finally {
            setProcessing(false);
        }
    };

    const reset = () => {
        setFile(null);
        setResult(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const summary = result?.summary || {};
    const byCheck = summary.by_check || {};
    const bySeverity = summary.by_severity || {};
    const checkEntries = Object.entries(byCheck).sort((a, b) => b[1] - a[1]);

    return (
        <div className="space-y-4 max-w-4xl">
            <div className={`rounded-lg border p-4 ${card}`}>
                <h3 className={`text-sm font-semibold mb-1 ${text}`}>Fuel Refund Report Audit</h3>
                <p className={`text-xs mb-4 ${muted}`}>
                    Upload a Detailed Fuel Refund Report workbook (Combined Fuel Transactions). Returns an
                    annotated workbook with Audit Findings and Audit Summary sheets.
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
                            <option value="checking">Checking copy (pump readings)</option>
                            <option value="final">Final (tank litres on asset tabs)</option>
                        </select>
                    </label>
                    <label className={`flex items-center gap-2 cursor-pointer ${text}`}>
                        <input
                            type="checkbox"
                            checked={enableV2}
                            onChange={(e) => setEnableV2(e.target.checked)}
                            disabled={processing}
                        />
                        <span>Enable v2 checks</span>
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
            </div>

            {result && (
                <div className={`rounded-lg border p-4 ${card}`}>
                    <h4 className={`text-sm font-semibold mb-3 ${text}`}>Audit results</h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        {['error', 'warning', 'info'].map((sev) => (
                            <div
                                key={sev}
                                className={`rounded-lg p-3 text-center ${
                                    isDark ? 'bg-gray-900' : 'bg-gray-50'
                                }`}
                            >
                                <div className={`text-lg font-bold ${text}`}>{bySeverity[sev] || 0}</div>
                                <div className={`text-xs capitalize ${muted}`}>{sev}</div>
                            </div>
                        ))}
                        <div
                            className={`rounded-lg p-3 text-center ${
                                isDark ? 'bg-gray-900' : 'bg-gray-50'
                            }`}
                        >
                            <div className={`text-lg font-bold ${text}`}>
                                {summary.row_count_combined ?? '—'}
                            </div>
                            <div className={`text-xs ${muted}`}>Combined rows</div>
                        </div>
                    </div>

                    {Array.isArray(summary.refund_rates) && summary.refund_rates.length > 0 && (
                        <p className={`text-xs mb-3 ${muted}`}>
                            Refund rate:{' '}
                            <span className={text}>
                                {summary.refund_rates.map((r) => `${r.rate} (${r.label})`).join('; ')}
                            </span>
                        </p>
                    )}

                    {result.hasErrors && (
                        <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                            One or more error-severity findings were detected.
                        </p>
                    )}

                    {result.downloadUrl && (
                        <a
                            href={result.downloadUrl}
                            download={result.fileName || 'fuel-refund-audit.xlsx'}
                            className="inline-flex items-center gap-2 px-4 py-2 mb-4 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700"
                        >
                            <i className="fas fa-download" />
                            Download audit workbook
                        </a>
                    )}

                    {checkEntries.length > 0 && (
                        <div>
                            <h5 className={`text-xs font-semibold mb-2 ${muted}`}>Findings by check</h5>
                            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                            <th className="text-left py-1 pr-4">Check</th>
                                            <th className="text-right py-1">Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {checkEntries.map(([checkId, count]) => (
                                            <tr key={checkId} className={text}>
                                                <td className="py-1 pr-4 font-mono">{checkId}</td>
                                                <td className="py-1 text-right">{count}</td>
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
    );
};

window.FuelRefundReportAudit = FuelRefundReportAudit;
