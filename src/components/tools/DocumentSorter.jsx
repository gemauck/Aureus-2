// Document Sorter – upload large zip (10+ GB) in chunks and sort into File 1–7 categories
const { useState, useRef, useEffect } = React;

const API_BASE = window.location.origin + '/api/tools/document-sorter';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB, must match server

const FILE_CATEGORIES = [
  { num: 1, name: 'File 1 - Regulatory and Operations Summary', desc: 'Mining Right, CIPC, Diesel Refund Registration, VAT, Environmental, Summary' },
  { num: 2, name: 'File 2 - Contracts', desc: 'Fuel Supply, Mining Contractors, Sale of Product Contracts' },
  { num: 3, name: 'File 3 - Fuel System and Transactions', desc: 'Tank/Pump, Delivery Notes, Invoices, Remittance, Reconciliations, Calibration' },
  { num: 4, name: 'File 4 - Assets and Drivers', desc: 'Asset Registers, Driver List' },
  { num: 5, name: 'File 5 - FMS Data and Reports', desc: 'FMS Literature, Raw Data, Fuel Refund Report/Logbook' },
  { num: 6, name: 'File 6 - Operational and Contractor', desc: 'Survey/Production/Activity Reports, Contractor Invoices/Remittances' },
  { num: 7, name: 'File 7 - Financial and Compliance', desc: 'Annual Financial Statements, Management Accounts, VAT 201, Deviations' },
];

const DocumentSorter = () => {
  const { isDark } = window.useTheme?.() || { isDark: false };
  const [file, setFile] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [aiScope, setAiScope] = useState('uncategorized');
  const [extraKeywordsJson, setExtraKeywordsJson] = useState('');
  const [sortPhaseProgress, setSortPhaseProgress] = useState(null);
  const fileInputRef = useRef(null);
  const progressPollRef = useRef(null);

  const getHeaders = (json = true) => {
    const token = window.storage?.getToken?.();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  useEffect(() => {
    return () => {
      if (progressPollRef.current) clearInterval(progressPollRef.current);
    };
  }, []);

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploadId(null);
    setResult(null);
    setError(null);
    setUploadProgress(0);
    setSortPhaseProgress(null);
  };

  const startUpload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const initRes = await fetch(`${API_BASE}/upload-init`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ fileName: file.name }),
      });
      const initJson = await initRes.json().catch(() => ({}));
      const initData = initJson?.data ?? initJson;
      if (initRes.status >= 400) {
        throw new Error(initJson?.error?.message || initData?.message || 'Failed to start upload');
      }
      const id = initData.uploadId;
      const chunkSize = initData.chunkSize || CHUNK_SIZE;
      setUploadId(id);

      const totalChunks = Math.ceil(file.size / chunkSize);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const blob = file.slice(start, end);
        const form = new FormData();
        form.append('uploadId', id);
        form.append('chunkIndex', String(i));
        form.append('totalChunks', String(totalChunks));
        form.append('chunk', blob, `chunk-${i}`);

        const chunkRes = await fetch(`${API_BASE}/upload-chunk`, {
          method: 'POST',
          headers: getHeaders(false),
          body: form,
        });
        const chunkJson = await chunkRes.json().catch(() => ({}));
        if (chunkRes.status >= 400) {
          throw new Error(chunkJson?.error?.message || 'Chunk upload failed');
        }
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const pollProgressOnce = async (id) => {
    try {
      const pr = await fetch(`${API_BASE}/progress?uploadId=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: getHeaders(false),
      });
      const pj = await pr.json().catch(() => ({}));
      const d = pj?.data ?? pj;
      if (pr.ok && d && typeof d === 'object') setSortPhaseProgress(d);
    } catch (_) {}
  };

  const requestCancel = async () => {
    if (!uploadId || !processing) return;
    try {
      await fetch(`${API_BASE}/cancel`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ uploadId }),
      });
    } catch (_) {}
  };

  const runProcess = async () => {
    if (!uploadId) return;

    let extraKeywords = undefined;
    if (extraKeywordsJson.trim()) {
      try {
        extraKeywords = JSON.parse(extraKeywordsJson);
        if (extraKeywords === null || typeof extraKeywords !== 'object' || Array.isArray(extraKeywords)) {
          throw new Error('Must be a JSON object with file numbers as keys');
        }
      } catch (e) {
        setError('Extra keywords: ' + (e.message || 'invalid JSON'));
        return;
      }
    }

    setError(null);
    setProcessing(true);
    setResult(null);
    setSortPhaseProgress(null);

    if (progressPollRef.current) clearInterval(progressPollRef.current);
    progressPollRef.current = setInterval(() => pollProgressOnce(uploadId), 1300);

    try {
      const res = await fetch(`${API_BASE}/process`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          uploadId,
          useAI,
          ...(useAI ? { aiScope } : {}),
          ...(extraKeywords && Object.keys(extraKeywords).length > 0 ? { extraKeywords } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      const data = json?.data ?? json;
      if (res.status >= 400) {
        throw new Error(json?.error?.message || data?.message || 'Process failed');
      }
      setResult(data);
      await pollProgressOnce(uploadId);
    } catch (e) {
      setError(e.message || 'Process failed');
    } finally {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
        progressPollRef.current = null;
      }
      setProcessing(false);
    }
  };

  const downloadZip = async () => {
    if (!result?.uploadId) return;
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/download?uploadId=${encodeURIComponent(result.uploadId)}`, {
        method: 'GET',
        headers: getHeaders(false),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sorted-output.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
    return bytes + ' B';
  };

  const verification = result?.verification;
  const uncategorizedSample = result?.uncategorizedSample || [];

  return (
    <div className={`rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-6 shadow-sm`}>
      <div className="mb-6">
        <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Diesel Refund Document Sorter</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Upload a large zipped folder (10+ GB supported). Default sorting uses each file&apos;s path and name only (fast).
          Optionally run AI on uncategorized files using the bundled taxonomy — reads PDF/text where possible (requires OPENAI_API_KEY on the server).
        </p>
      </div>

      {/* Categories reference */}
      <details className={`mb-6 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
        <summary className={`px-4 py-2 cursor-pointer text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
          View category mapping (File 1 – File 7)
        </summary>
        <ul className="px-4 pb-3 pt-1 text-xs space-y-1.5">
          {FILE_CATEGORIES.map((c) => (
            <li key={c.num} className={isDark ? 'text-gray-400' : 'text-gray-600'}>
              <strong>{c.name}</strong>: {c.desc}
            </li>
          ))}
        </ul>
      </details>

      {/* Upload */}
      <div className="space-y-4">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {file ? 'Change file' : 'Choose ZIP file'}
            </button>
            {file && (
              <>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {file.name} ({formatSize(file.size)})
                </span>
                {!uploadId && !uploading && (
                  <button
                    type="button"
                    onClick={startUpload}
                    className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                  >
                    Upload
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {uploading && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">{uploadProgress}%</span>
          </div>
        )}

        {uploadId && !uploading && (
          <div className="space-y-3">
            <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                disabled={processing}
                className="rounded border-gray-400"
              />
              Use AI classification (reads document text where supported; requires server OPENAI_API_KEY)
            </label>
            {useAI && (
              <div className={`flex flex-wrap items-center gap-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <label className="flex items-center gap-2">
                  AI scope:
                  <select
                    value={aiScope}
                    onChange={(e) => setAiScope(e.target.value)}
                    disabled={processing}
                    className={`rounded border px-2 py-1 text-sm ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                  >
                    <option value="uncategorized">Uncategorized only (default)</option>
                    <option value="all">All files — first N only, may override path rules (max 80)</option>
                  </select>
                </label>
              </div>
            )}
            <details className={`rounded-lg border ${isDark ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
              <summary className={`px-3 py-2 text-sm cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Optional: extra path keywords (JSON)
              </summary>
              <div className="px-3 pb-3 pt-0 space-y-2">
                <textarea
                  value={extraKeywordsJson}
                  onChange={(e) => setExtraKeywordsJson(e.target.value)}
                  disabled={processing}
                  rows={5}
                  placeholder={`{\n  "3": ["fuel slip", "shell invoice"],\n  "6": ["contractor site report"]\n}`}
                  className={`w-full text-xs font-mono rounded border p-2 ${
                    isDark ? 'bg-gray-950 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'
                  }`}
                />
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                  Merged with built-in rules (longest phrase wins). Keys are File numbers 1–7. Server caps total phrases.
                </p>
              </div>
            </details>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Upload complete.</span>
              <button
                type="button"
                onClick={runProcess}
                disabled={processing}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {processing ? 'Sorting…' : 'Sort into File 1–7'}
              </button>
              {processing && (
                <button
                  type="button"
                  onClick={requestCancel}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                    isDark
                      ? 'border-amber-500/70 text-amber-200 hover:bg-amber-900/30'
                      : 'border-amber-600 text-amber-900 hover:bg-amber-50'
                  }`}
                >
                  Cancel sort
                </button>
              )}
            </div>
          </div>
        )}

        {processing && (!sortPhaseProgress || sortPhaseProgress.status === 'idle') && (
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Starting sort…</p>
        )}

        {processing && sortPhaseProgress && sortPhaseProgress.status !== 'idle' && (
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{
                    width:
                      sortPhaseProgress.total > 0
                        ? `${Math.min(100, Math.round((sortPhaseProgress.processed / sortPhaseProgress.total) * 100))}%`
                        : '8%',
                  }}
                />
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {sortPhaseProgress.phase === 'ai' ? 'AI: ' : ''}
                {sortPhaseProgress.processed}
                {sortPhaseProgress.total != null ? ` / ${sortPhaseProgress.total}` : ''}
              </span>
            </div>
            {sortPhaseProgress.message && (
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{sortPhaseProgress.message}</p>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div
            className={`p-4 rounded-lg border ${
              result.cancelled
                ? isDark
                  ? 'bg-amber-900/20 border-amber-700/80'
                  : 'bg-amber-50 border-amber-300'
                : isDark
                  ? 'bg-gray-800/50 border-gray-600'
                  : 'bg-green-50 border-green-200'
            }`}
          >
            <p
              className={`text-sm font-medium ${
                result.cancelled
                  ? isDark
                    ? 'text-amber-200'
                    : 'text-amber-900'
                  : isDark
                    ? 'text-green-300'
                    : 'text-green-800'
              }`}
            >
              {result.cancelled ? 'Sort stopped early (partial output).' : `Sorted ${result.stats?.totalFiles ?? 0} files.`}
              {result.message && (
                <span className="block mt-1 text-xs font-normal opacity-90">{result.message}</span>
              )}
              {verification && (
                <span className="block mt-1 font-normal">
                  In: {verification.inputFiles ?? '—'} → Out on disk: {verification.outputFiles ?? '—'} (manifest rows:{' '}
                  {verification.manifestRows ?? '—'})
                  {verification.match ? (
                    <span className="text-green-600 dark:text-green-400"> — counts reconciled</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300"> — verification mismatch; check manifest.json</span>
                  )}
                  {(verification.collisionsResolved ?? 0) > 0 && (
                    <span className="block text-xs mt-0.5 opacity-90">
                      Path collisions resolved with duplicate filenames: {verification.collisionsResolved}
                    </span>
                  )}
                </span>
              )}
            </p>
            {result.ai && (
              <p className={`text-xs mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                AI ({result.ai.scope === 'all' ? 'all files — first batch' : 'uncategorized'}; cap {result.ai.cappedAt ?? result.ai.maxRequested ?? '—'}
                ): processed {result.ai.processed ?? 0}; skipped / failed {result.ai.skipped ?? 0}.
              </p>
            )}
            {result.extraKeywordsApplied && (
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Custom path keywords were merged into rule matching.</p>
            )}
            {result.stats?.byFile && (
              <ul className="mt-2 text-xs space-y-0.5 text-gray-600 dark:text-gray-400">
                {FILE_CATEGORIES.map((c) => (
                  <li key={c.num}>
                    {c.name}: {result.stats.byFile[c.num] ?? 0} files
                  </li>
                ))}
                <li className={isDark ? 'text-amber-200/90' : 'text-amber-900'}>
                  Uncategorized: {result.stats.byFile[0] ?? 0} files
                </li>
              </ul>
            )}
            {uncategorizedSample.length > 0 && (
              <details className="mt-3">
                <summary className={`text-xs cursor-pointer ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Sample uncategorized paths (up to 20)
                </summary>
                <ul className="mt-1 text-xs font-mono space-y-0.5 max-h-40 overflow-y-auto opacity-90">
                  {uncategorizedSample.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadZip}
                disabled={downloading}
                className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {downloading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-file-archive" />}
                {downloading ? 'Preparing…' : 'Download as ZIP'}
              </button>
            </div>
            {result.manifestPath && (
              <p className={`mt-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                Manifest JSON and CSV are written alongside the sorted folders (
                <code className="break-all">{result.manifestPath}</code>
                {result.manifestCsvPath && (
                  <>
                    {', '}
                    <code className="break-all">{result.manifestCsvPath}</code>
                  </>
                )}
                ).
              </p>
            )}
            {result.baseUrl && (
              <p className="mt-2 text-sm">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                  Output on server: <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs break-all">{result.baseUrl}</code>
                </span>
                <span className="block mt-1 text-xs opacity-80">Or browse this path on the server.</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

window.DocumentSorter = DocumentSorter;
