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
    const bySeverity = summary.by_severity || {};
    const rowsPassed = summary.rows_passed ?? 0;
    const rowsFailed = summary.rows_failed ?? 0;
    const rowsWarningOnly = summary.rows_warning_only ?? 0;
    const rowsAudited = summary.rows_audited ?? summary.row_count_combined ?? 0;
    const passRatePct = summary.pass_rate_pct ?? 0;
    const allRowsPassed = rowsAudited > 0 && rowsPassed === rowsAudited;

    const checksPassed = summary.checks_passed || [];
    const checksFailed = summary.checks_failed || [];
    const checkRows = [
        ...checksFailed.map((item) => ({
            checkId: item.check_id,
            processTask: item.process_task,
            count: item.count,
            passed: false,
        })),
        ...checksPassed.map((checkId) => ({
            checkId,
            processTask: null,
            count: 0,
            passed: true,
        })),
    ].sort((a, b) => a.checkId.localeCompare(b.checkId));

    const progressTotal = Math.max(rowsPassed + rowsFailed + rowsWarningOnly, 1);
    const passPct = (rowsPassed / progressTotal) * 100;
    const warnPct = (rowsWarningOnly / progressTotal) * 100;
    const failPct = (rowsFailed / progressTotal) * 100;

    return (
        <div className="space-y-4 max-w-4xl">
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

                    {allRowsPassed && (
                        <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 text-sm">
                            All {rowsAudited} combined transaction rows passed — no findings on the
                            combined sheet.
                        </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
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
                                The downloaded workbook includes audit columns A–E on Combined Fuel
                                Transactions: Audit Result, Audit Severity, Findings Count, Audit Comments,
                                and Checks Failed. Original data starts at column F.
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
                                                <td className="py-1 pr-4 text-right">{row.count}</td>
                                                <td className="py-1">
                                                    {row.passed ? (
                                                        <span className="text-green-600 dark:text-green-400">
                                                            ✓ Pass
                                                        </span>
                                                    ) : (
                                                        <span className="text-red-600 dark:text-red-400">
                                                            Fail
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
    );
};

window.FuelRefundReportAudit = FuelRefundReportAudit;
