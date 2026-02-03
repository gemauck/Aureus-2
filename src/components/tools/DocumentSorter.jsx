// Document Sorter – upload large zip (10+ GB) in chunks and sort into File 1–7 categories
const { useState, useRef } = React;

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
  const fileInputRef = useRef(null);

  const getHeaders = (json = true) => {
    const token = window.storage?.getToken?.();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploadId(null);
    setResult(null);
    setError(null);
    setUploadProgress(0);
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

  const runProcess = async () => {
    if (!uploadId) return;
    setError(null);
    setProcessing(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/process`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ uploadId }),
      });
      const json = await res.json().catch(() => ({}));
      const data = json?.data ?? json;
      if (res.status >= 400) {
        throw new Error(json?.error?.message || data?.message || 'Process failed');
      }
      setResult(data);
    } catch (e) {
      setError(e.message || 'Process failed');
    } finally {
      setProcessing(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
    return bytes + ' B';
  };

  return (
    <div className={`rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-6 shadow-sm`}>
      <div className="mb-6">
        <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Diesel Refund Document Sorter</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Upload a large zipped folder (10+ GB supported). Files are sorted into the 7 categories below by name and path.
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
          <div className="flex items-center gap-3">
            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Upload complete.</span>
            <button
              type="button"
              onClick={runProcess}
              disabled={processing}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {processing ? 'Sorting…' : 'Sort into File 1–7'}
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800/50 border-gray-600' : 'bg-green-50 border-green-200'}`}>
            <p className={`text-sm font-medium ${isDark ? 'text-green-300' : 'text-green-800'}`}>
              Sorted {result.stats?.totalFiles ?? 0} files.
            </p>
            {result.stats?.byFile && (
              <ul className="mt-2 text-xs space-y-0.5 text-gray-600 dark:text-gray-400">
                {FILE_CATEGORIES.map((c) => (
                  <li key={c.num}>
                    {c.name}: {result.stats.byFile[c.num] ?? 0} files
                  </li>
                ))}
                {(result.stats.byFile[0] ?? 0) > 0 && (
                  <li>Uncategorized: {result.stats.byFile[0]} files</li>
                )}
              </ul>
            )}
            {result.baseUrl && (
              <p className="mt-2 text-sm">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                  Output on server: <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs break-all">{result.baseUrl}</code>
                </span>
                <span className="block mt-1 text-xs opacity-80">Browse this path on the server or download the sorted folders from there. Links to directories are not opened in the browser.</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

window.DocumentSorter = DocumentSorter;
