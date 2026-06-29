/**
 * POA Review Component - Proof of Activity Review Tool
 * 
 * This component provides a UI for uploading fuel transaction data files
 * and downloading formatted review reports with compliance analysis.
 * Server enforces file size (50MB) and row limits to avoid overload.
 */

const { useState, useCallback, useRef } = React;

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

// Must match server limits (api/poa-review/process-excel.js and process-batch.js)
const MAX_FILE_SIZE_MB = 50;
const MAX_ROWS = 500000;

// Max rows to scan when detecting sources from uploaded file (scan full allowed file so we find all unique sources)
const SOURCE_DETECT_MAX_ROWS = 250000;
// Browser (Pyodide) is much slower than server Python — cap to avoid multi-hour runs / tab hangs
const MAX_ROWS_BROWSER = 50000;
const BROWSER_ROWS_RECOMMENDED = 15000;

async function runPoaAnalysis(rows, sources, extraOptions = {}) {
    if (!rows?.length) return null;
    const full = typeof window !== 'undefined' && window.analyzePoaRowsFull;
    const basic = typeof window !== 'undefined' && window.analyzePoaRows;
    const base = {
        sources: sources || [],
        analyzedRowCount: rows.length,
        fileRowHint: rows.length,
        ...extraOptions,
    };
    if (full) return full(rows, base);
    if (basic) return basic(rows, base);
    return null;
}

function PoaInfoTip({ children, isDark }) {
    return (
        <span className="relative inline-flex group align-middle">
            <button
                type="button"
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                    isDark ? 'text-slate-400 hover:text-slate-200' : 'text-blue-600 hover:text-blue-800'
                }`}
                aria-label="More information"
            >
                <i className="fas fa-info-circle text-sm" aria-hidden="true" />
            </button>
            <span
                role="tooltip"
                className={`pointer-events-none absolute left-1/2 z-50 w-72 -translate-x-1/2 bottom-[calc(100%+6px)] rounded-lg border px-3 py-2 text-left text-xs leading-snug shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
                    isDark
                        ? 'bg-slate-900 text-slate-100 border-slate-600'
                        : 'bg-white text-gray-800 border-gray-200'
                }`}
            >
                {children}
            </span>
        </span>
    );
}

const BATCH_WINDOW_HELP = (
    <>
        <strong className="block mb-1">Batch window</strong>
        Maximum time gap between fuel dispenses on the same asset that still count as one
        dispensing session. Closer fills are grouped into a single batch for POA strength,
        compliance points, and proof linking. A later fill after this window starts a new batch
        (new label on the report). Default is 1 hour.
    </>
);

const SHIFT_FALLBACK_HELP = (
    <>
        <strong className="block mb-1">Shift POA fallback</strong>
        Used when a dispense has no proof row linked directly to that fill. The tool may reuse
        same-asset proof from the same calendar day (within the window below), but only if that
        proof describes a single activity for the day. The report marks these with{' '}
        <em>Shift POA Fallback = Yes</em> — verify manually; this is not the same as proof
        immediately before the pump.
    </>
);

function suggestColumnMapping(headers, resolution) {
    const mapping = {};
    const specs = window.COLUMN_SPECS || [];
    (resolution?.missingRequired || []).forEach((req) => {
        const spec = specs.find((s) => s.key === req.key);
        if (!spec) return;
        const hit = (headers || []).find((h) => {
            const n = String(h || '').trim().toLowerCase();
            return spec.aliases.some((a) => a === n);
        });
        if (hit) mapping[hit] = req.label;
    });
    return mapping;
}

function PreflightPanel({ preflight, loading, isDark, sourcesSelected }) {
    if (loading) {
        return (
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Analyzing file…
                </p>
            </div>
        );
    }
    if (!preflight) return null;

    const statClass = `text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`;
    const labelClass = `text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`;

    return (
        <div className={`rounded-lg border p-4 space-y-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-start justify-between gap-2">
                <h4 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    <i className={`fas fa-clipboard-check mr-2 ${preflight.ok ? 'text-green-500' : 'text-amber-500'}`}></i>
                    Pre-flight check
                </h4>
                {preflight.ok ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800'}`}>
                        Ready to process
                    </span>
                ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-900/40 text-amber-200' : 'bg-amber-100 text-amber-900'}`}>
                        Fix issues below
                    </span>
                )}
            </div>

            {preflight.errors.length > 0 && (
                <ul className={`text-xs space-y-1 rounded p-2 ${isDark ? 'bg-red-900/30 text-red-200' : 'bg-red-50 text-red-800'}`}>
                    {preflight.errors.map((msg, i) => (
                        <li key={i}>• {msg}</li>
                    ))}
                </ul>
            )}

            {preflight.warnings.length > 0 && (
                <ul className={`text-xs space-y-1 rounded p-2 ${isDark ? 'bg-amber-900/20 text-amber-200' : 'bg-amber-50 text-amber-900'}`}>
                    {preflight.warnings.map((msg, i) => (
                        <li key={i}>• {msg}</li>
                    ))}
                </ul>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                    <p className={labelClass}>Data rows</p>
                    <p className={statClass}>{preflight.analyzedRowCount.toLocaleString()}</p>
                </div>
                <div>
                    <p className={labelClass}>Transactions</p>
                    <p className={statClass}>{preflight.transactionCount.toLocaleString()}</p>
                </div>
                <div>
                    <p className={labelClass}>Proof records</p>
                    <p className={statClass}>{preflight.proofCount.toLocaleString()}</p>
                </div>
                <div>
                    <p className={labelClass}>Unique assets</p>
                    <p className={statClass}>{preflight.uniqueAssets.toLocaleString()}</p>
                </div>
                <div className="col-span-2 sm:col-span-4">
                    <p className={labelClass}>Date range</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                        {preflight.dateRangeLabel}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-dashed border-slate-600/40">
                <div>
                    <p className={labelClass}>Transactions with proof (preview)</p>
                    <p className={statClass}>{preflight.transactionCompliancePct}%</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                        {preflight.transactionsWithProof.toLocaleString()} with proof ·{' '}
                        {preflight.transactionsWithZeroProof.toLocaleString()} without
                    </p>
                </div>
                <div>
                    <p className={labelClass}>Assets with any proof</p>
                    <p className={statClass}>{preflight.assetCompliancePct}%</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                        {preflight.noPoaAssetCount.toLocaleString()} asset(s) with no proof rows
                    </p>
                </div>
            </div>

            {sourcesSelected > 0 && preflight.smrTotalSelectedSources > 0 && (
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Total SMR (selected sources, preview):{' '}
                    <span className="font-medium">{preflight.smrTotalSelectedSources.toLocaleString()}</span>
                </p>
            )}

            {preflight.preflightNote && (
                <p className={`text-xs rounded p-2 ${isDark ? 'bg-blue-900/30 text-blue-200' : 'bg-blue-50 text-blue-900'}`}>
                    {preflight.preflightNote}
                    {preflight.preflightEngine === 'client-estimate' ? ' (estimate only)' : ''}
                </p>
            )}

            {preflight.strengthSummary && preflight.strengthSummary.totalBatches > 0 && (
                <div className={`rounded p-2 text-xs ${isDark ? 'bg-slate-700/60 text-slate-300' : 'bg-gray-50 text-gray-700'}`}>
                    <p className="font-medium mb-1">POA strength preview (server rules)</p>
                    <p>
                        Strong {preflight.strengthSummary.tierCounts?.Strong || 0} · Moderate {preflight.strengthSummary.tierCounts?.Moderate || 0} · Weak {preflight.strengthSummary.tierCounts?.Weak || 0} · Insufficient {preflight.strengthSummary.tierCounts?.Insufficient || 0}
                    </p>
                </div>
            )}

            {preflight.noPoaAssetsSample.length > 0 && (
                <div>
                    <p className={`text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        Sample assets with no proof rows
                    </p>
                    <p className={`text-xs font-mono ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                        {preflight.noPoaAssetsSample.join(', ')}
                        {preflight.noPoaAssetCount > preflight.noPoaAssetsSample.length
                            ? ` (+${preflight.noPoaAssetCount - preflight.noPoaAssetsSample.length} more)`
                            : ''}
                    </p>
                </div>
            )}
        </div>
    );
}

function ReportSummaryPanel({ summary, isDark, completedInText }) {
    if (!summary) return null;

    const statClass = `text-xl font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`;
    const labelClass = `text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-gray-500'}`;

    return (
        <div className={`rounded-lg border p-4 space-y-4 ${isDark ? 'bg-slate-800 border-green-800/50' : 'bg-white border-green-200'}`}>
            <div className="flex items-center justify-between gap-2">
                <h4 className={`text-sm font-semibold ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                    <i className="fas fa-chart-pie mr-2"></i>
                    Report summary
                </h4>
                {completedInText && (
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        Completed in {completedInText}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-700/80' : 'bg-gray-50'}`}>
                    <p className={labelClass}>Transaction compliance</p>
                    <p className={statClass}>{summary.transactionCompliancePct}%</p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        {summary.transactionsWithProof.toLocaleString()} / {summary.transactionCount.toLocaleString()} with proof
                    </p>
                </div>
                <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-700/80' : 'bg-gray-50'}`}>
                    <p className={labelClass}>No-proof assets</p>
                    <p className={`${statClass} ${summary.noPoaAssetCount > 0 ? (isDark ? 'text-amber-300' : 'text-amber-700') : ''}`}>
                        {summary.noPoaAssetCount.toLocaleString()}
                    </p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        {summary.transactionsOnNoPoaAssets.toLocaleString()} transactions on those assets
                    </p>
                </div>
                <div className={`rounded-lg p-3 col-span-2 sm:col-span-1 ${isDark ? 'bg-slate-700/80' : 'bg-gray-50'}`}>
                    <p className={labelClass}>Total SMR (selected sources)</p>
                    <p className={statClass}>{summary.smrTotalSelectedSources.toLocaleString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center sm:text-left">
                <div>
                    <p className={labelClass}>Transactions</p>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                        {summary.transactionCount.toLocaleString()}
                    </p>
                </div>
                <div>
                    <p className={labelClass}>Proof rows</p>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                        {summary.proofCount.toLocaleString()}
                    </p>
                </div>
                <div>
                    <p className={labelClass}>Period</p>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                        {summary.dateRangeLabel}
                    </p>
                </div>
                <div>
                    <p className={labelClass}>Median hrs since proof</p>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                        {summary.medianHoursSinceProof != null ? summary.medianHoursSinceProof : '—'}
                    </p>
                </div>
            </div>

            {summary.strengthSummary && summary.strengthSummary.totalBatches > 0 && (
                <div>
                    <p className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        POA strength by batch (rules)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {['Strong', 'Moderate', 'Weak', 'Insufficient'].map((tier) => (
                            <div key={tier} className={`rounded p-2 ${isDark ? 'bg-slate-700/80' : 'bg-gray-50'}`}>
                                <span className={labelClass}>{tier}</span>
                                <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                    {summary.strengthSummary.tierCounts?.[tier] || 0}
                                    <span className={`ml-1 font-normal ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        ({summary.strengthSummary.tierPct?.[tier] || 0}%)
                                    </span>
                                </p>
                            </div>
                        ))}
                    </div>
                    {summary.strengthSummary.topShortfalls?.length > 0 && (
                        <ul className={`text-xs mt-2 space-y-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            {summary.strengthSummary.topShortfalls.map((item) => (
                                <li key={item.text} className="flex justify-between gap-2">
                                    <span className="truncate" title={item.text}>{item.text}</span>
                                    <span className="font-mono shrink-0">{item.count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {summary.topGapAssets.length > 0 && (
                <div>
                    <p className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        Largest time gaps (hours since last proof)
                    </p>
                    <ul className={`text-xs space-y-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                        {summary.topGapAssets.map((item) => (
                            <li key={item.asset} className="flex justify-between gap-2">
                                <span className="truncate" title={item.label}>{item.label}</span>
                                <span className="font-mono shrink-0">{item.hours}h</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                Download the Excel report for row-level detail and conditional formatting.
            </p>
        </div>
    );
}

const POAReview = () => {
    const { isDark } = window.useTheme || (() => ({ isDark: false }));
    
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState('');
    const [error, setError] = useState(null);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [sources, setSources] = useState([]);
    const [newSource, setNewSource] = useState('');
    const [processingProgressPercent, setProcessingProgressPercent] = useState(0);
    const [documentSources, setDocumentSources] = useState([]);
    const [sourcesDetecting, setSourcesDetecting] = useState(false);
    const [completedInText, setCompletedInText] = useState(null); // e.g. "2m 34s"
    const processingStartRef = useRef(null);
    const [runLocally, setRunLocally] = useState(false);
    const [preflight, setPreflight] = useState(null);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [reportSummary, setReportSummary] = useState(null);
    const parsedRowsRef = useRef(null);
    const [poaSettings, setPoaSettings] = useState({
        smrUsageMaxPerActivity: 1000,
        batchWindowHours: 1,
        shiftProofWindowHours: 24,
    });
    const [rulesMeta, setRulesMeta] = useState(null);
    const [columnMapping, setColumnMapping] = useState({});
    const [showColumnMap, setShowColumnMap] = useState(false);
    const [columnMapDraft, setColumnMapDraft] = useState({});
    const [columnMapHeaders, setColumnMapHeaders] = useState([]);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsMessage, setSettingsMessage] = useState('');

    React.useEffect(() => {
        (async () => {
            try {
                if (window.fetchPoaRulesMeta) {
                    const data = await window.fetchPoaRulesMeta();
                    setRulesMeta(data?.rulesMeta || data);
                }
            } catch (e) {
                console.warn('POA rules meta load failed', e);
            }
            try {
                if (window.fetchPoaSettings) {
                    const s = await window.fetchPoaSettings();
                    if (s) setPoaSettings((prev) => ({ ...prev, ...s }));
                }
            } catch (e) {
                console.warn('POA settings load failed', e);
            }
        })();
    }, []);

    React.useEffect(() => {
        if (sources.length > 0 && window.saveSmrSources) {
            window.saveSmrSources(sources);
        }
    }, [sources]);

    const applyPreflightForSources = useCallback(async (rows, selectedSources, browserRun = runLocally) => {
        const result = await runPoaAnalysis(rows, selectedSources, {
            settings: poaSettings,
            columnMapping,
        });
        if (result) {
            const rowCount = rows.length;
            if (browserRun && rowCount > MAX_ROWS_BROWSER) {
                result.errors = [
                    ...(result.errors || []),
                    `For "Run in my browser", use ${MAX_ROWS_BROWSER.toLocaleString()} rows or fewer (this file has ${rowCount.toLocaleString()}). Uncheck "Run in my browser" — the server supports up to ${MAX_ROWS.toLocaleString()} rows and is much faster.`,
                ];
                result.ok = false;
            } else if (browserRun && rowCount > BROWSER_ROWS_RECOMMENDED) {
                result.warnings = [
                    ...(result.warnings || []),
                    `Large file for browser processing (${rowCount.toLocaleString()} rows). Pyodide may take 10+ minutes — uncheck "Run in my browser" for faster server processing (up to ${MAX_ROWS.toLocaleString()} rows).`,
                ];
            } else if (!browserRun && rowCount > BROWSER_ROWS_RECOMMENDED) {
                result.warnings = [
                    ...(result.warnings || []),
                    `Large file (${rowCount.toLocaleString()} rows). Server processing supports up to ${MAX_ROWS.toLocaleString()} rows; keep this tab open until complete.`,
                ];
            }
            setPreflight(result);
        }
        return result;
    }, [runLocally, poaSettings, columnMapping]);

    const finalizeReportSummary = useCallback(async (selectedSources) => {
        const rows = parsedRowsRef.current;
        if (!rows?.length) return;
        const summary = await runPoaAnalysis(rows, selectedSources, {
            settings: poaSettings,
            columnMapping,
        });
        if (summary) setReportSummary(summary);
    }, [poaSettings, columnMapping]);

    // Parse Excel/CSV file client-side and convert to JSON rows (optional maxRows to limit for source detection)
    const parseFileToRows = useCallback(async (file, maxRows = null) => {
        const fileName = file.name.toLowerCase();
        const isCSV = fileName.endsWith('.csv');
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        if (isCSV) {
            // Parse CSV
            const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });

            const lines = text.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV must have at least a header row and one data row');
            }

            const headers = lines[0].split(',').map(h => h.trim());
            const rows = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Simple CSV parsing (handles quoted fields)
                const values = [];
                let current = '';
                let inQuotes = false;

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                        if (inQuotes && line[j + 1] === '"') {
                            current += '"';
                            j++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                values.push(current.trim());

                if (values.length === headers.length) {
                    const row = {};
                    headers.forEach((header, idx) => {
                        row[header] = values[idx] || '';
                    });
                    rows.push(row);
                    if (maxRows != null && rows.length >= maxRows) break;
                }
            }

            return maxRows != null ? rows.slice(0, maxRows) : rows;
        } else if (isExcel) {
            // Parse Excel using XLSX.js
            let XLSXLib = window.XLSX;
            if (!XLSXLib || !XLSXLib.utils) {
                if (typeof window.ensureXLSX === 'function') {
                    XLSXLib = await window.ensureXLSX();
                } else {
                    for (let i = 0; i < 30 && (!XLSXLib || !XLSXLib.utils); i++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        XLSXLib = window.XLSX;
                    }
                }
            }

            if (!XLSXLib || !XLSXLib.utils) {
                throw new Error('Excel file support requires xlsx library. Please refresh the page.');
            }

            const arrayBuffer = await file.arrayBuffer();
            console.log('POA Review - Excel file size:', file.size, 'bytes');
            
            const workbook = XLSXLib.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Get the range of the worksheet to see how many rows Excel thinks there are
            const range = XLSXLib.utils.decode_range(worksheet['!ref'] || 'A1');
            const excelRowCount = range.e.r + 1; // Excel is 1-indexed, range.e.r is 0-indexed
            console.log('POA Review - Excel worksheet range:', worksheet['!ref'], 'Total rows in Excel:', excelRowCount);
            
            // CRITICAL: Excel files often have title rows before headers
            // The Python script uses skiprows=1, meaning it skips the first row
            // We need to find the actual header row by looking for required columns
            const rawData = XLSXLib.utils.sheet_to_json(worksheet, { 
                header: 1, // Get as array of arrays
                defval: '',
                raw: false
            });
            
            console.log('POA Review - Raw data rows from XLSX:', rawData.length);
            console.log('POA Review - Expected rows from Excel range:', excelRowCount);
            
            if (rawData.length === 0) {
                throw new Error('Excel file appears to be empty');
            }
            
            if (rawData.length < excelRowCount) {
                console.warn(`POA Review - WARNING: XLSX parsed ${rawData.length} rows but Excel shows ${excelRowCount} rows. Some rows may have been skipped.`);
            }
            
            // Find the header row by looking for required columns
            // Required columns: "Transaction ID", "Asset Number", "Date & Time"
            const requiredKeywords = ['transaction', 'asset', 'date', 'time'];
            let headerRowIndex = -1;
            let headers = [];
            
            // Check first 5 rows to find header row
            for (let i = 0; i < Math.min(5, rawData.length); i++) {
                const row = rawData[i] || [];
                const rowStr = row.join(' ').toLowerCase();
                
                // Check if this row contains required keywords
                const hasRequiredKeywords = requiredKeywords.some(keyword => 
                    rowStr.includes(keyword)
                );
                
                if (hasRequiredKeywords) {
                    headerRowIndex = i;
                    headers = row.map(h => String(h || '').trim());
                    break;
                }
            }
            
            // If no header row found, use first row (fallback)
            if (headerRowIndex === -1) {
                console.warn('POA Review - Could not find header row, using first row');
                headerRowIndex = 0;
                headers = (rawData[0] || []).map(h => String(h || '').trim());
            }
            
            // Data rows start after the header row (optionally limit for source detection)
            const dataRowsRaw = rawData.slice(headerRowIndex + 1);
            const dataRows = maxRows != null ? dataRowsRaw.slice(0, maxRows) : dataRowsRaw;
            console.log('POA Review - Data rows after slicing (excluding header):', dataRows.length);
            
            // Filter out empty column headers and handle duplicates (like pandas does)
            const validHeaderIndices = [];
            const validHeaders = [];
            const headerCounts = {}; // Track how many times we've seen each header
            
            headers.forEach((header, idx) => {
                const trimmed = String(header || '').trim();
                if (trimmed && trimmed !== '' && !trimmed.match(/^Unnamed:/i)) {
                    validHeaderIndices.push(idx);
                    
                    // Handle duplicate column names like pandas does
                    // First occurrence: "Location"
                    // Second occurrence: "Location.1"
                    // Third occurrence: "Location.2", etc.
                    let finalHeader = trimmed;
                    if (headerCounts[trimmed] !== undefined) {
                        headerCounts[trimmed]++;
                        finalHeader = `${trimmed}.${headerCounts[trimmed]}`;
                    } else {
                        headerCounts[trimmed] = 0; // First occurrence, next will be .1
                    }
                    
                    validHeaders.push(finalHeader);
                }
            });
            
            if (validHeaders.length === 0) {
                throw new Error('No valid column headers found in Excel file. Please ensure the file has a header row with column names.');
            }
            
            // Convert to array of objects with proper column names (only valid columns)
            const rowsAfterLengthCheck = dataRows.filter(row => row && row.length > 0);
            console.log('POA Review - Rows after length check:', rowsAfterLengthCheck.length);
            
            const rowsAfterMapping = rowsAfterLengthCheck.map(row => {
                const rowObj = {};
                validHeaders.forEach((header, validIdx) => {
                    const origIdx = validHeaderIndices[validIdx];
                    rowObj[header] = row[origIdx] !== undefined ? String(row[origIdx] || '').trim() : '';
                });
                return rowObj;
            });
            console.log('POA Review - Rows after mapping to objects:', rowsAfterMapping.length);
            
            const rows = rowsAfterMapping.filter(row => {
                // Filter out rows that are completely empty
                return Object.values(row).some(val => val && val.trim() !== '');
            });
            
            console.log('POA Review - Rows after filtering empty rows:', rows.length);
            console.log('POA Review - Rows filtered out:', rowsAfterMapping.length - rows.length);
            
            // Log column names for debugging
            console.log('POA Review - Header row index:', headerRowIndex);
            console.log('POA Review - Parsed Excel columns (filtered):', validHeaders);
            console.log('POA Review - Total data rows (final):', rows.length);
            if (rows.length > 0) {
                console.log('POA Review - First row sample:', rows[0]);
            }
            
            if (rows.length === 0) {
                throw new Error('No data rows found in Excel file after parsing. Please check the file format.');
            }
            
            return rows;
        } else {
            throw new Error('Unsupported file type. Please use CSV or Excel files.');
        }
    }, []);

    const getUniqueSourceValuesFromRows = useCallback((rows) => {
        if (!rows || rows.length === 0) return [];
        const sourceKey = Object.keys(rows[0]).find(k => /^source$/i.test(String(k).trim()));
        if (!sourceKey) return [];
        const set = new Set();
        rows.forEach(row => {
            const v = row[sourceKey];
            if (v != null && String(v).trim() !== '') set.add(String(v).trim());
        });
        // Exclude the literal "Source" (column header that can appear in data rows)
        return Array.from(set).sort().filter(s => !/^source$/i.test(s));
    }, []);

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const validExtensions = ['.xlsx', '.xls', '.csv'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(fileExtension)) {
            setError('Please upload an Excel file (.xlsx, .xls) or CSV file');
            return;
        }
        const maxSize = MAX_FILE_SIZE_MB * 1024 * 1024;
        if (file.size > maxSize) {
            setError(`File size must be less than ${MAX_FILE_SIZE_MB}MB to avoid server overload.`);
            return;
        }
        setUploadedFile(file);
        setError(null);
        setDownloadUrl(null);
        setReportSummary(null);
        setPreflight(null);
        parsedRowsRef.current = null;
        setDocumentSources([]);
        setSources([]);
        setSourcesDetecting(true);
        setPreflightLoading(true);

        (async () => {
            try {
                const rows = await parseFileToRows(file, SOURCE_DETECT_MAX_ROWS);
                parsedRowsRef.current = rows;
                const headers = rows.length ? Object.keys(rows[0]) : [];
                const getResolution = window.getColumnResolution;
                if (getResolution) {
                    const resolution = getResolution(headers);
                    if (resolution.missingRequired?.length) {
                        const suggested = suggestColumnMapping(headers, resolution);
                        setColumnMapHeaders(headers);
                        setColumnMapDraft(suggested);
                        setShowColumnMap(true);
                    }
                }
                const unique = getUniqueSourceValuesFromRows(rows);
                setDocumentSources(unique);
                const saved = window.loadSavedSmrSources ? window.loadSavedSmrSources() : [];
                const restored = saved.filter((s) => unique.includes(s));
                if (restored.length) setSources(restored);
                await applyPreflightForSources(rows, restored.length ? restored : [], runLocally);
            } catch (err) {
                console.warn('POA Review - Pre-flight analysis failed:', err);
                setDocumentSources([]);
                setPreflight({
                    ok: false,
                    errors: [err.message || 'Could not read file for pre-flight check'],
                    warnings: [],
                    analyzedRowCount: 0,
                    transactionCount: 0,
                    proofCount: 0,
                    uniqueAssets: 0,
                    dateRangeLabel: '—',
                    transactionCompliancePct: 0,
                    assetCompliancePct: 0,
                    noPoaAssetCount: 0,
                    noPoaAssetsSample: [],
                    transactionsWithZeroProof: 0,
                    transactionsWithProof: 0,
                    smrTotalSelectedSources: 0,
                });
            } finally {
                setSourcesDetecting(false);
                setPreflightLoading(false);
            }
        })();
    }, [parseFileToRows, getUniqueSourceValuesFromRows, applyPreflightForSources]);

    React.useEffect(() => {
        const rows = parsedRowsRef.current;
        if (!rows?.length || preflightLoading) return;
        applyPreflightForSources(rows, sources, runLocally);
    }, [sources, runLocally, applyPreflightForSources, preflightLoading]);

    // Server limit (must match api/poa-review/process-batch.js MAX_TOTAL_ROWS)
    const MAX_POA_ROWS = 500000;

    // Process file in chunks using batch API (CSV uploads only — Excel uses process-excel)
    const handleChunkedUpload = useCallback(async (rows, fileName) => {
        const totalRows = rows.length;
        if (totalRows > MAX_POA_ROWS) {
            setError(`This file has too many rows (${totalRows.toLocaleString()}). Maximum ${MAX_POA_ROWS.toLocaleString()} rows are supported. Please split your file (e.g. by month) and run POA Review on each file separately.`);
            setProcessing(false);
            setProcessingProgress('');
            setProcessingProgressPercent(0);
            return;
        }
        // Larger batches = fewer round-trips (server allows up to 25k per batch)
        let BATCH_SIZE = 2000;
        if (totalRows > 200000) {
            BATCH_SIZE = 25000;
        } else if (totalRows > 50000) {
            BATCH_SIZE = 15000;
        } else if (totalRows > 10000) {
            BATCH_SIZE = 5000;
        }
        const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
        const batchId = `poa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('POA Review - Batch configuration:', {
            totalRows,
            batchSize: BATCH_SIZE,
            totalBatches
        });

        console.log('POA Review - Starting chunked upload:', {
            totalRows,
            totalBatches,
            batchId,
            fileName
        });

        setProcessingProgress(`Processing ${totalRows} rows in ${totalBatches} batches...`);
        setProcessingProgressPercent(0);

        try {
            // Send batches sequentially (await each one before sending the next)
            console.log('POA Review - Starting batch loop, totalBatches:', totalBatches);
            for (let i = 0; i < totalBatches; i++) {
                const start = i * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, totalRows);
                const batch = rows.slice(start, end);
                const batchNumber = i + 1;
                const isFinal = batchNumber === totalBatches;

                console.log(`POA Review - Preparing batch ${batchNumber}/${totalBatches}`, {
                    batchSize: batch.length,
                    isFinal,
                    batchId
                });

                setProcessingProgress(`Sending batch ${batchNumber} of ${totalBatches} (${end} of ${totalRows} rows)...`);
                setProcessingProgressPercent(Math.round((batchNumber / totalBatches) * 50)); // 50% for sending

                console.log(`POA Review - Sending batch ${batchNumber}/${totalBatches} to server...`);
                
                // Retry logic for 401 (auth), 502/503/504 errors (server/gateway errors)
                let batchResponse;
                let retries = 0;
                const maxRetries = 3;
                const retryDelay = 2000; // 2 seconds between retries
                
                // Helper function to get fresh token
                const getAuthToken = () => window.storage?.getToken?.() || '';
                
                // Helper function to refresh token
                const refreshToken = async () => {
                    try {
                        const refreshUrl = '/api/auth/refresh';
                        const refreshRes = await fetch(refreshUrl, { 
                            method: 'POST', 
                            credentials: 'include', 
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        if (refreshRes.ok) {
                            const text = await refreshRes.text();
                            const refreshData = text ? JSON.parse(text) : {};
                            const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                            if (newToken && window.storage?.setToken) {
                                window.storage.setToken(newToken);
                                console.log('POA Review - Token refreshed successfully');
                                return newToken;
                            }
                        }
                        console.warn('POA Review - Token refresh failed');
                        return null;
                    } catch (error) {
                        console.error('POA Review - Token refresh error:', error);
                        return null;
                    }
                };
                
                while (retries <= maxRetries) {
                    try {
                        let token = getAuthToken();
                        
                        batchResponse = await fetch('/api/poa-review/process-batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                batchId,
                                batchNumber,
                                totalBatches,
                                rows: batch,
                                sources: sources && sources.length > 0 ? sources : [],
                                settings: poaSettings,
                                columnMapping,
                                fileName,
                                isFinal,
                            })
                        });
                        
                        // Handle 401 Unauthorized - try to refresh token once
                        if (batchResponse.status === 401 && retries === 0) {
                            console.warn(`POA Review - Batch ${batchNumber} got 401, attempting token refresh...`);
                            const newToken = await refreshToken();
                            if (newToken) {
                                // Retry immediately with new token (don't count as retry)
                                token = newToken;
                                batchResponse = await fetch('/api/poa-review/process-batch', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        batchId,
                                        batchNumber,
                                        totalBatches,
                                        rows: batch,
                                        sources: sources && sources.length > 0 ? sources : [],
                                settings: poaSettings,
                                columnMapping,
                                        fileName,
                                        isFinal,
                                    })
                                });
                            }
                        }
                        
                        // If successful or client error (4xx except 401), don't retry
                        if (batchResponse.ok || (batchResponse.status >= 400 && batchResponse.status < 500 && batchResponse.status !== 401)) {
                            break;
                        }
                        
                        // Retry on server/gateway errors (5xx) or 401 after refresh failed
                        if ((batchResponse.status >= 500 || batchResponse.status === 401) && retries < maxRetries) {
                            retries++;
                            console.warn(`POA Review - Batch ${batchNumber} got ${batchResponse.status}, retrying (${retries}/${maxRetries})...`);
                            await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
                            continue;
                        }
                        
                        break;
                    } catch (fetchError) {
                        if (retries < maxRetries) {
                            retries++;
                            console.warn(`POA Review - Batch ${batchNumber} fetch error, retrying (${retries}/${maxRetries}):`, fetchError.message);
                            await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
                            continue;
                        }
                        throw fetchError;
                    }
                }
                
                console.log(`POA Review - Batch ${batchNumber}/${totalBatches} response received, status:`, batchResponse.status);

                if (!batchResponse.ok) {
                    // Get detailed error information
                    let errorMessage = `Failed to process batch ${batchNumber}`;
                    try {
                        const errorData = await batchResponse.json();
                        console.error('POA Review Batch API Error:', errorData);
                        errorMessage = errorData.error?.message || 
                                      errorData.message || 
                                      errorData.error || 
                                      errorMessage;
                        // Include more details if available
                        if (errorData.error?.details) {
                            errorMessage += `: ${errorData.error.details}`;
                        }
                    } catch (parseError) {
                        const errorText = await batchResponse.text().catch(() => batchResponse.statusText);
                        console.error('POA Review Batch API Error (text):', errorText);
                        errorMessage = `${errorMessage}: ${errorText || batchResponse.statusText}`;
                    }
                    throw new Error(errorMessage);
                }

                const batchResult = await batchResponse.json();
                console.log(`POA Review - Batch ${batchNumber} result:`, batchResult);

                if (isFinal) {
                    console.log('POA Review - Final batch received, checking for download URL...');
                    if (batchResult.data?.downloadUrl || batchResult.downloadUrl) {
                        // Final batch - processing complete
                        const downloadUrl = batchResult.data?.downloadUrl || batchResult.downloadUrl;
                        console.log('POA Review - Download URL received:', downloadUrl);
                        
                        setProcessingProgress('Generating final report...');
                        setProcessingProgressPercent(90);

                        // Wait a moment for server to finish processing
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Check for final result
                        setDownloadUrl(downloadUrl);
                        setProcessingProgress('Complete!');
                        setProcessingProgressPercent(100);
                        setCompletedInText(formatElapsed(Date.now() - (processingStartRef.current || Date.now())));
                        finalizeReportSummary(sources && sources.length > 0 ? sources : []);
                        console.log('POA Review - Processing complete, download URL set');
                        return;
                    } else {
                        console.warn('POA Review - Final batch received but no download URL:', batchResult);
                        throw new Error('Final batch processed but no download URL received. Server may still be processing.');
                    }
                } else {
                    // Update progress for non-final batches
                    const progress = batchResult.data?.progress || batchResult.progress || Math.round((batchNumber / totalBatches) * 50);
                    setProcessingProgressPercent(progress);
                    console.log(`POA Review - Batch ${batchNumber} acknowledged, progress: ${progress}%`);
                }
            }
        } catch (error) {
            console.error('POA Review - Chunked processing error:', error);
            throw error;
        }
    }, [sources, finalizeReportSummary, poaSettings, columnMapping]);

    const toggleDocumentSource = useCallback((sourceName) => {
        setSources(prev => prev.includes(sourceName) ? prev.filter(s => s !== sourceName) : [...prev, sourceName]);
    }, []);
    const selectAllDocumentSources = useCallback(() => {
        setSources(prev => {
            const combined = new Set([...prev, ...documentSources]);
            return Array.from(combined);
        });
    }, [documentSources]);
    const clearDocumentSourceSelection = useCallback(() => {
        setSources(prev => prev.filter(s => !documentSources.includes(s)));
    }, [documentSources]);

    // Main upload handler
    const handleUpload = useCallback(async () => {
        if (!uploadedFile) {
            setError('Please select a file first');
            return;
        }
        if (!sources || sources.length === 0) {
            setError('Select at least one SMR source to include (from the list above or add one manually).');
            return;
        }
        if (preflight && !preflight.ok) {
            setError('Fix pre-flight issues before processing (see checklist above).');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setReportSummary(null);
        setProcessingProgressPercent(0);
        setCompletedInText(null);
        processingStartRef.current = Date.now();

        try {
            // Run in browser (Pyodide) — no file sent to server
            if (runLocally) {
                setProcessingProgress('Reading file...');
                const rows = parsedRowsRef.current?.length
                    ? parsedRowsRef.current
                    : await parseFileToRows(uploadedFile);
                if (rows.length === 0) throw new Error('No data rows found in file');
                if (rows.length > MAX_ROWS_BROWSER) {
                    throw new Error(
                        `For "Run in my browser", use ${MAX_ROWS_BROWSER.toLocaleString()} rows or fewer. This file has ${rows.length.toLocaleString()} rows — uncheck "Run in my browser" for server processing (up to ${MAX_ROWS.toLocaleString()} rows, much faster).`
                    );
                }
                setProcessingProgress('Building data...');
                setProcessingProgressPercent(5);
                const headers = Object.keys(rows[0]);
                const numCols = headers.length;
                const escape = (v) => {
                    if (v == null || v === '') return '';
                    const s = String(v);
                    for (let k = 0; k < s.length; k++) {
                        const c = s[k];
                        if (c === '"' || c === ',' || c === '\r' || c === '\n') return '"' + s.replace(/"/g, '""') + '"';
                    }
                    return s;
                };
                const csvLines = new Array(rows.length + 1);
                csvLines[0] = headers.map(escape).join(',');
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    let line = escape(row[headers[0]]);
                    for (let j = 1; j < numCols; j++) line += ',' + escape(row[headers[j]]);
                    csvLines[i + 1] = line;
                }
                const csvString = csvLines.join('\n');
                const optionsJson = JSON.stringify({
                    sources: sources || ['Inmine: Daily Diesel Issues'],
                    settings: poaSettings,
                    columnMapping,
                });
                setProcessingProgress(`Starting Python (tab will stay responsive)…`);
                setProcessingProgressPercent(15);
                await new Promise(r => setTimeout(r, 0));
                const origin = (window.location.origin || '').replace(/\/$/, '');
                const scriptUrl = origin + '/api/poa-review/browser-script';
                const pyodideBase = origin + '/api/poa-review/pyodide';
                const workerCode = `
importScripts('${pyodideBase}/pyodide.js');
self.onmessage = async (e) => {
  const { csv, optionsJson, scriptUrl } = e.data;
  try {
    self.postMessage({ type: 'progress', message: 'Loading Python runtime…' });
    const pyodide = await self.loadPyodide({ indexURL: '${pyodideBase}/' });
    self.postMessage({ type: 'progress', message: 'Installing packages (pandas, openpyxl)…' });
    await pyodide.loadPackage('micropip');
    const micropip = pyodide.pyimport('micropip');
    await micropip.install('pandas');
    await micropip.install('openpyxl');
    self.postMessage({ type: 'progress', message: 'Processing ' + (csv.split('\\n').length - 1).toLocaleString() + ' rows… (this may take several minutes)' });
    pyodide.FS.writeFile('/tmp/input.csv', csv);
    pyodide.FS.writeFile('/tmp/options.json', optionsJson);
    const res = await fetch(scriptUrl);
    const script = await res.text();
    pyodide.runPython(script);
    pyodide.runPython('run()');
    const outBytes = pyodide.FS.readFile('/tmp/output.xlsx', { encoding: 'binary' });
    self.postMessage({ type: 'done', outBytes });
  } catch (err) {
    self.postMessage({ type: 'error', error: err && (err.message || String(err)) });
  }
};
`;
                const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(workerBlob);
                const worker = new Worker(workerUrl);
                URL.revokeObjectURL(workerUrl);
                await new Promise((resolve, reject) => {
                    worker.onmessage = (ev) => {
                        const d = ev.data;
                        if (d.type === 'progress') {
                            setProcessingProgress(d.message);
                            if (d.message.includes('Loading')) setProcessingProgressPercent(20);
                            else if (d.message.includes('Installing')) setProcessingProgressPercent(30);
                            else setProcessingProgressPercent(40);
                        } else if (d.type === 'done') {
                            try {
                                const blob = new Blob([d.outBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = (uploadedFile.name.replace(/\.[^.]+$/, '') || 'poa-review') + '-report.xlsx';
                                a.click();
                                URL.revokeObjectURL(url);
                            } catch (_) {}
                            const elapsed = formatElapsed(Date.now() - (processingStartRef.current || Date.now()));
                            setProcessingProgress('Complete! Report downloaded.');
                            setProcessingProgressPercent(100);
                            setCompletedInText(elapsed);
                            finalizeReportSummary(sources);
                            worker.terminate();
                            resolve();
                        } else if (d.type === 'error') {
                            worker.terminate();
                            reject(new Error(d.error));
                        }
                    };
                    worker.onerror = (err) => {
                        worker.terminate();
                        reject(err.message ? new Error(err.message) : new Error('Worker failed'));
                    };
                    worker.postMessage({
                        csv: csvString,
                        optionsJson,
                        scriptUrl,
                    });
                });
                return;
            }

            const fileName = uploadedFile.name.toLowerCase();
            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

            // Excel: always upload to server — native pandas is far faster than browser XLSX parse + JSON batches
            if (isExcel) {
                console.log('POA Review - Excel file, using server-side processing (native pandas)...');
                setProcessingProgress('Uploading file to server for processing...');

                let formData = new FormData();
                formData.append('file', uploadedFile);
                formData.append('sources', JSON.stringify(sources));
                formData.append('settings', JSON.stringify(poaSettings));
                formData.append('columnMapping', JSON.stringify(columnMapping || {}));
                const token = window.storage?.getToken?.() || '';
                const maxRetries = 2;
                const retryDelay = 2000;
                let response = null;

                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        if (attempt > 0) {
                            setProcessingProgress(`Retrying upload (${attempt}/${maxRetries})...`);
                            await new Promise(r => setTimeout(r, retryDelay * attempt));
                            // FormData body is consumed after first fetch; recreate for retry
                            const retryFormData = new FormData();
                            retryFormData.append('file', uploadedFile);
                            retryFormData.append('sources', JSON.stringify(sources));
                            retryFormData.append('settings', JSON.stringify(poaSettings));
                            retryFormData.append('columnMapping', JSON.stringify(columnMapping || {}));
                            formData = retryFormData;
                        }
                        response = await fetch('/api/poa-review/process-excel', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: formData
                        });
                        break;
                    } catch (fetchErr) {
                        const isNetworkError = fetchErr?.message === 'Failed to fetch' ||
                            (fetchErr?.name && /NetworkError|TypeError/i.test(fetchErr.name));
                        if (attempt < maxRetries && isNetworkError) {
                            console.warn(`POA Review - process-excel network error, retrying (${attempt + 1}/${maxRetries}):`, fetchErr.message);
                            continue;
                        }
                        const friendlyMsg = isNetworkError
                            ? 'Network request was interrupted (e.g. tab in background or connection lost). Please keep this tab active and try again.'
                            : (fetchErr?.message || 'Upload failed');
                        throw new Error(friendlyMsg);
                    }
                }

                if (!response?.ok) {
                    const errorData = await response.json().catch(() => ({ message: response?.statusText || 'Unknown error' }));
                    const msg = (typeof errorData.error === 'object' && errorData.error?.message)
                        ? errorData.error.message
                        : (typeof errorData.error === 'string' ? errorData.error : null)
                        || errorData.message
                        || (typeof errorData.errorDetails === 'object' && errorData.errorDetails?.message)
                        || (typeof errorData.errorDetails === 'string' ? errorData.errorDetails : null)
                        || 'Failed to process file';
                    console.error('POA Review process-excel API error:', errorData);
                    throw new Error(msg);
                }

                const result = await response.json();
                const downloadUrl = result.data?.downloadUrl || result.downloadUrl;

                if (downloadUrl) {
                    setDownloadUrl(downloadUrl);
                    setProcessingProgress('Complete!');
                    setProcessingProgressPercent(100);
                    setCompletedInText(formatElapsed(Date.now() - (processingStartRef.current || Date.now())));
                    finalizeReportSummary(sources);
                } else {
                    throw new Error('No download URL received from server');
                }
                return;
            }
            
            // CSV only: parse in browser then stream batches to server
            setProcessingProgress('Reading file...');
            const rows = parsedRowsRef.current?.length
                ? parsedRowsRef.current
                : await parseFileToRows(uploadedFile);
            
            console.log('POA Review - File parsed, rows:', rows.length);
            
            if (rows.length === 0) {
                throw new Error('No data rows found in file');
            }

            if (rows.length > MAX_ROWS) {
                throw new Error(
                    `This file has too many rows (${rows.length.toLocaleString()}). Maximum ${MAX_ROWS.toLocaleString()} rows are supported to avoid server overload. Please split your file or use a smaller dataset.`
                );
            }

            const largeFileNote = rows.length > 50000
                ? ' Large file — processing may take several minutes; do not close this page.'
                : '';
            setProcessingProgress(`Parsed ${rows.length} rows. Starting batch processing...${largeFileNote}`);
            await handleChunkedUpload(rows, uploadedFile.name);
        } catch (err) {
            console.error('POA Review error:', err);
            setError(err.message || 'An error occurred while processing the file');
            setProcessingProgress('');
            setProcessingProgressPercent(0);
        } finally {
            setIsProcessing(false);
        }
    }, [uploadedFile, sources, runLocally, parseFileToRows, handleChunkedUpload, preflight, finalizeReportSummary, poaSettings, columnMapping]);

    const handleDownload = useCallback(() => {
        if (downloadUrl) {
            window.open(downloadUrl, '_blank');
        }
    }, [downloadUrl]);

    const handleAddSource = useCallback(() => {
        if (newSource.trim() && !sources.includes(newSource.trim())) {
            setSources([...sources, newSource.trim()]);
            setNewSource('');
        }
    }, [newSource, sources]);

    const handleRemoveSource = useCallback((sourceToRemove) => {
        setSources(sources.filter(s => s !== sourceToRemove));
    }, [sources]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    Proof of Activity (POA) Review
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Upload fuel transaction data to generate compliance reports with proof of activity analysis
                </p>
            </div>

            {/* File Upload Section */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    Upload Transaction Data File
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex-1 cursor-pointer">
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileSelect}
                            disabled={isProcessing}
                            className="hidden"
                        />
                        <div className={`border-2 border-dashed rounded-lg p-4 text-center transition ${
                            isDark 
                                ? 'border-slate-600 bg-slate-700 hover:border-slate-500' 
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                            {uploadedFile ? (
                                <div>
                                    <i className={`fas fa-file-excel text-2xl mb-2 ${isDark ? 'text-green-400' : 'text-green-600'}`}></i>
                                    <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>
                                        {uploadedFile.name}
                                    </p>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <i className={`fas fa-cloud-upload-alt text-3xl mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}></i>
                                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                        Click to select file
                                    </p>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                                        Excel (.xlsx, .xls) or CSV files up to 50MB
                                    </p>
                                </div>
                            )}
                        </div>
                    </label>
                    {uploadedFile && !isProcessing && (
                        <button
                            onClick={() => {
                                setUploadedFile(null);
                                setDownloadUrl(null);
                                setError(null);
                                setCompletedInText(null);
                                setDocumentSources([]);
                                setSources([]);
                                setPreflight(null);
                                setReportSummary(null);
                                parsedRowsRef.current = null;
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                isDark 
                                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-times mr-2"></i>
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {uploadedFile && (
                <PreflightPanel
                    preflight={preflight}
                    loading={preflightLoading || sourcesDetecting}
                    isDark={isDark}
                    sourcesSelected={sources.length}
                />
            )}

            {showColumnMap && (
                <div className={`rounded-lg border p-4 space-y-3 ${isDark ? 'bg-amber-900/20 border-amber-700' : 'bg-amber-50 border-amber-200'}`}>
                    <h4 className={`text-sm font-semibold ${isDark ? 'text-amber-100' : 'text-amber-900'}`}>
                        Map columns
                    </h4>
                    <p className={`text-xs ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>
                        Match your file headers to the fields POA Review expects. Required fields must be mapped before processing.
                    </p>
                    {['Transaction ID', 'Asset Number', 'Date & Time', 'Opening SMR', 'Closing SMR', 'Total SMR Usage', 'Source', 'Activity'].map((target) => (
                        <label key={target} className="block text-xs">
                            <span className={isDark ? 'text-slate-300' : 'text-gray-700'}>{target}</span>
                            <select
                                value={Object.entries(columnMapDraft).find(([, t]) => t === target)?.[0] || ''}
                                onChange={(e) => {
                                    const header = e.target.value;
                                    setColumnMapDraft((prev) => {
                                        const next = { ...prev };
                                        Object.keys(next).forEach((k) => {
                                            if (next[k] === target) delete next[k];
                                        });
                                        if (header) next[header] = target;
                                        return next;
                                    });
                                }}
                                className={`mt-1 w-full px-2 py-1.5 rounded border text-sm ${
                                    isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'
                                }`}
                            >
                                <option value="">— not mapped —</option>
                                {columnMapHeaders.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                        </label>
                    ))}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={async () => {
                                setColumnMapping(columnMapDraft);
                                setShowColumnMap(false);
                                const rows = parsedRowsRef.current;
                                if (rows?.length) {
                                    setPreflightLoading(true);
                                    await applyPreflightForSources(rows, sources, runLocally);
                                    setPreflightLoading(false);
                                }
                            }}
                            className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Apply mapping
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowColumnMap(false)}
                            className={`px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-200 text-gray-800'}`}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    Processing thresholds
                </h4>
                <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Org-wide defaults (saved for all users with access). Used for batch grouping, shift POA fallback, and large SMR checks.
                </p>

                <div className="max-w-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                            Batch window
                        </span>
                        <PoaInfoTip isDark={isDark}>{BATCH_WINDOW_HELP}</PoaInfoTip>
                    </div>
                    <label className="block text-xs">
                        <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>
                            Batch window (hours)
                        </span>
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={poaSettings.batchWindowHours ?? ''}
                            onChange={(e) =>
                                setPoaSettings((s) => ({
                                    ...s,
                                    batchWindowHours: parseFloat(e.target.value) || 0,
                                }))
                            }
                            className={`mt-1 w-full px-2 py-1.5 rounded border text-sm ${
                                isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'
                            }`}
                        />
                    </label>
                </div>

                <label className="mt-3 block max-w-sm text-xs">
                    <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>
                        Max SMR delta per activity row
                    </span>
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={poaSettings.smrUsageMaxPerActivity ?? ''}
                        onChange={(e) =>
                            setPoaSettings((s) => ({
                                ...s,
                                smrUsageMaxPerActivity: parseFloat(e.target.value) || 0,
                            }))
                        }
                        className={`mt-1 w-full px-2 py-1.5 rounded border text-sm ${
                            isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'
                        }`}
                    />
                </label>

                <div className="mt-3 max-w-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                            Shift POA fallback
                        </span>
                        <PoaInfoTip isDark={isDark}>{SHIFT_FALLBACK_HELP}</PoaInfoTip>
                    </div>
                    <label className="block text-xs">
                        <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>
                            Shift fallback window (hours)
                        </span>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={poaSettings.shiftProofWindowHours ?? ''}
                            onChange={(e) =>
                                setPoaSettings((s) => ({
                                    ...s,
                                    shiftProofWindowHours: parseFloat(e.target.value) || 0,
                                }))
                            }
                            className={`mt-1 w-full px-2 py-1.5 rounded border text-sm ${
                                isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'
                            }`}
                        />
                    </label>
                </div>
                <div className="flex items-center gap-3 mt-3">
                    <button
                        type="button"
                        disabled={settingsSaving}
                        onClick={async () => {
                            if (!window.savePoaSettings) return;
                            setSettingsSaving(true);
                            setSettingsMessage('');
                            try {
                                await window.savePoaSettings(poaSettings);
                                setSettingsMessage('Saved.');
                                const rows = parsedRowsRef.current;
                                if (rows?.length) await applyPreflightForSources(rows, sources, runLocally);
                            } catch (e) {
                                setSettingsMessage(e.message || 'Save failed');
                            } finally {
                                setSettingsSaving(false);
                            }
                        }}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-50"
                    >
                        {settingsSaving ? 'Saving…' : 'Save thresholds'}
                    </button>
                    {settingsMessage && (
                        <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{settingsMessage}</span>
                    )}
                </div>
            </div>

            {/* Sources Configuration */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    SMR Sources to Include
                </label>
                <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Upload a file first to see sources found in the document, then select which to include when calculating total SMR usage.
                </p>

                {sourcesDetecting && (
                    <p className={`text-sm mb-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        <i className="fas fa-spinner fa-spin mr-2"></i>Detecting sources in document...
                    </p>
                )}

                {!sourcesDetecting && documentSources.length > 0 && (
                    <div className="mb-4">
                        <p className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                            Sources found in your document
                        </p>
                        <div className="flex gap-2 mb-2">
                            <button
                                type="button"
                                onClick={selectAllDocumentSources}
                                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-600 text-slate-200 hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            >
                                Select all
                            </button>
                            <button
                                type="button"
                                onClick={clearDocumentSourceSelection}
                                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-600 text-slate-200 hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            >
                                Clear selection
                            </button>
                        </div>
                        <div className={`max-h-32 overflow-y-auto rounded border p-2 space-y-1 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                            {documentSources.map((name) => (
                                <label key={name} className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                                    <input
                                        type="checkbox"
                                        checked={sources.includes(name)}
                                        onChange={() => toggleDocumentSource(name)}
                                        className="rounded border-gray-400"
                                    />
                                    <span className="text-sm">{name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <p className={`text-xs mb-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Or add a source name manually (if not in the list above):
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <input
                        type="text"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddSource()}
                        placeholder="Enter source name from your document"
                        className={`flex-1 px-3 py-2 text-sm border rounded-lg ${
                            isDark 
                                ? 'bg-slate-700 border-slate-600 text-slate-100' 
                                : 'bg-white border-gray-300'
                        }`}
                    />
                    <button
                        onClick={handleAddSource}
                        disabled={!newSource.trim()}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            newSource.trim()
                                ? isDark 
                                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                : isDark
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Add
                    </button>
                </div>

                {sources.length > 0 && (
                    <div className="space-y-2">
                        <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Selected sources (will be used for report):</p>
                        {sources.map((source, index) => (
                            <div
                                key={index}
                                className={`flex items-center justify-between p-2 rounded ${
                                    isDark ? 'bg-slate-700' : 'bg-gray-50'
                                }`}
                            >
                                <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                                    {source}
                                </span>
                                <button
                                    onClick={() => handleRemoveSource(source)}
                                    className={`p-1 rounded transition ${
                                        isDark 
                                            ? 'text-slate-400 hover:text-red-400 hover:bg-slate-600' 
                                            : 'text-gray-400 hover:text-red-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Run locally option */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    <input
                        type="checkbox"
                        checked={runLocally}
                        onChange={(e) => setRunLocally(e.target.checked)}
                        disabled={isProcessing}
                        className="rounded border-gray-400"
                    />
                    <span className="text-sm">Run in my browser</span>
                </label>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    Process on your device (no upload). Best for files under {BROWSER_ROWS_RECOMMENDED.toLocaleString()} rows; hard limit {MAX_ROWS_BROWSER.toLocaleString()}. For larger files, leave unchecked — server supports up to {MAX_ROWS.toLocaleString()} rows and is much faster.
                </p>
            </div>

            {/* Error Display */}
            {error && (
                <div className={`rounded-lg border p-3 ${isDark ? 'bg-red-900/30 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <div className="flex items-center gap-2">
                        <i className="fas fa-exclamation-circle"></i>
                        <span className="text-sm">{error}</span>
                    </div>
                </div>
            )}

            {/* Processing Status */}
            {isProcessing && (
                <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3 mb-3">
                        <i className={`fas ${processingProgressPercent >= 100 ? 'fa-check-circle text-green-600' : 'fa-spinner fa-spin text-blue-600'}`}></i>
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>
                                {processingProgressPercent >= 100 ? 'Complete!' : 'Processing...'}
                            </p>
                            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                {processingProgress}
                                {completedInText && processingProgressPercent >= 100 && (
                                    <span className="ml-1">— {completedInText}</span>
                                )}
                            </p>
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            {processingProgressPercent}%
                        </span>
                    </div>
                    {/* Progress Bar */}
                    <div className={`w-full h-2 rounded-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div 
                            className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${processingProgressPercent}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
                <button
                    onClick={handleUpload}
                    disabled={
                        !uploadedFile ||
                        isProcessing ||
                        !sources ||
                        sources.length === 0 ||
                        preflightLoading ||
                        (preflight && !preflight.ok)
                    }
                    title={
                        preflight && !preflight.ok
                            ? 'Fix pre-flight issues above'
                            : uploadedFile && sources.length === 0
                                ? 'Select at least one SMR source above'
                                : undefined
                    }
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition ${
                        uploadedFile && !isProcessing && sources && sources.length > 0 && !(preflight && !preflight.ok) && !preflightLoading
                            ? isDark
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            : isDark
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {isProcessing ? (
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

                {downloadUrl && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <button
                            onClick={handleDownload}
                            className={`px-4 py-3 rounded-lg text-sm font-medium transition ${
                                isDark
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                        >
                            <i className="fas fa-download mr-2"></i>
                            Download Report
                        </button>
                        {completedInText && (
                            <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                Completed in {completedInText}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {reportSummary && (
                <ReportSummaryPanel
                    summary={reportSummary}
                    isDark={isDark}
                    completedInText={completedInText}
                />
            )}

            {/* Info Section */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>
                    <i className="fas fa-info-circle mr-2"></i>
                    About POA Review
                </h4>
                <ul className={`text-xs space-y-1 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                    <li>• Analyzes fuel transaction data and proof of activity records</li>
                    <li>• Identifies assets with missing proof records (non-compliant)</li>
                    <li>• Groups consecutive transactions within 1 hour</li>
                    <li>• Calculates time gaps between proof records and transactions</li>
                    <li>• Generates formatted Excel reports with conditional formatting</li>
                    <li>• Scores POA strength per dispense batch (Strong / Moderate / Weak / Insufficient) using Schedule 6 rules — sector-aware for mining, forestry, and farming</li>
                    <li>• Reads all proof-row fields (not only Activity) — e.g. coal in Material + transport in Activity counts as eligible in-pit haul where rules apply</li>
                    <li>• Eligible operations list aligned to your SARS spreadsheet (mining, forestry, farming)</li>
                    <li>• Adds POA Compliance Points, Eligibility vs Completeness shortfalls, and Shift POA Fallback flag</li>
                    <li>• Pre-flight strength uses the same server rules as the Excel report</li>
                    {rulesMeta && (
                        <li>
                            • Rules version: {rulesMeta.version || '—'}
                            {rulesMeta.lastUpdated && rulesMeta.lastUpdated !== rulesMeta.version
                                ? ` (updated ${rulesMeta.lastUpdated})`
                                : ''}
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
};

// Make available globally
window.POAReview = POAReview;

// Dispatch event to notify other components
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'POAReview' } 
    }));
    console.log('✅ POAReview component registered and event dispatched');
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}

