/**
 * Expense Capture: photograph or upload slips, AI extraction, allocate to accounts & cost centres, export CSV.
 * Includes an app-style layout for phones (camera-first, bottom nav, card inbox).
 */
const { useState, useEffect, useCallback, useMemo } = React;

const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin']);

function isErpAdminUser() {
  const u = window.storage?.getUser?.();
  const role = (u?.role || '').toString().trim().toLowerCase();
  return ADMIN_ROLES.has(role);
}

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function uploadExpenseDataUrl(dataUrl, name) {
  const api = window.DatabaseAPI;
  if (!api?.API_BASE) throw new Error('DatabaseAPI not available');
  const token = window.storage?.getToken?.() || localStorage.getItem('token');
  const res = await fetch(`${api.API_BASE}/api/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      folder: 'receipt-capture',
      name: name || `expense-${Date.now()}.jpg`,
      dataUrl
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || json.message || `Upload failed (${res.status})`);
  }
  const url = json.data?.url || json.url;
  if (!url) throw new Error('No file URL returned');
  return url;
}

function ExpenseCaptureTool() {
  const { isDark } = window.useTheme?.() || { isDark: false };
  const api = window.DatabaseAPI;
  const isAdmin = useMemo(() => isErpAdminUser(), []);

  const [tab, setTab] = useState('inbox');
  const [documents, setDocuments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [capturePreview, setCapturePreview] = useState('');
  const [captureName, setCaptureName] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [extraction, setExtraction] = useState(null);
  const [noOpenAI, setNoOpenAI] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [vendor, setVendor] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [total, setTotal] = useState('');
  const [currency, setCurrency] = useState('ZAR');
  const [taxAmount, setTaxAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('draft');

  const [editingId, setEditingId] = useState(null);

  const [newAccName, setNewAccName] = useState('');
  const [newAccCode, setNewAccCode] = useState('');
  const [newCcName, setNewCcName] = useState('');
  const [newCcCode, setNewCcCode] = useState('');

  /** null = follow viewport; 'app' | 'classic' = user override */
  const [userLayout, setUserLayout] = useState(null);
  const [narrowViewport, setNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setNarrowViewport(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const appStyle = userLayout === 'app' || (userLayout === null && narrowViewport);

  const loadLookups = useCallback(async () => {
    if (!api) return;
    const [a, c] = await Promise.all([api.getReceiptAccounts(), api.getReceiptCostCenters()]);
    const accPayload = a?.data !== undefined ? a.data : a;
    const ccPayload = c?.data !== undefined ? c.data : c;
    setAccounts(accPayload?.accounts || []);
    setCostCenters(ccPayload?.costCenters || []);
  }, [api]);

  const loadDocuments = useCallback(async () => {
    if (!api) return;
    const all = isAdmin;
    const res = await api.getReceiptDocuments(all ? { all: true } : {});
    const payload = res?.data !== undefined ? res.data : res;
    const list = payload?.documents || [];
    setDocuments(Array.isArray(list) ? list : []);
  }, [api, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadLookups(), loadDocuments()]);
      } catch (e) {
        if (!cancelled) setMsg(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLookups, loadDocuments]);

  const resetCaptureForm = () => {
    setCapturePreview('');
    setCaptureName('');
    setUploadedUrl('');
    setExtraction(null);
    setNoOpenAI(false);
    setVendor('');
    setDocumentDate('');
    setTotal('');
    setCurrency('ZAR');
    setTaxAmount('');
    setAccountId('');
    setCostCenterId('');
    setNotes('');
    setStatus('draft');
    setEditingId(null);
  };

  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const okType =
      file.type.startsWith('image/') || file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!okType) {
      alert('Please choose an image or PDF.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File must be 20MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCapturePreview(typeof reader.result === 'string' ? reader.result : '');
      setCaptureName(file.name || 'expense');
      setUploadedUrl('');
      setExtraction(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const runExtractAndPrepare = async () => {
    if (!capturePreview) {
      alert('Choose a file or take a photo first.');
      return;
    }
    setProcessing(true);
    setMsg('');
    try {
      const url = await uploadExpenseDataUrl(capturePreview, captureName);
      setUploadedUrl(url);
      let ext = null;
      let nai = false;
      try {
        const res = await api.extractReceiptDocument({ imageUrl: url });
        ext = res?.data?.extraction || null;
        nai = res?.data?.noOpenAI === true;
      } catch (err) {
        setMsg(String(err?.message || err) || 'Extraction failed; you can still enter fields manually.');
      }
      setNoOpenAI(nai);
      setExtraction(ext);
      if (ext) {
        setVendor(ext.vendor || '');
        setDocumentDate((ext.documentDate || '').slice(0, 10));
        setTotal(String(ext.total != null ? ext.total : ''));
        setCurrency(ext.currency || 'ZAR');
        setTaxAmount(ext.taxAmount != null ? String(ext.taxAmount) : '');
      }
    } catch (e) {
      alert(e?.message || 'Upload failed');
    } finally {
      setProcessing(false);
    }
  };

  const saveDocument = async () => {
    if (!uploadedUrl) {
      alert('Upload and extract first.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const payload = {
        fileUrl: uploadedUrl,
        extraction: extraction || {},
        vendor,
        documentDate,
        total: parseFloat(total) || 0,
        currency,
        taxAmount: taxAmount === '' ? null : parseFloat(taxAmount),
        accountId: accountId || null,
        costCenterId: costCenterId || null,
        notes,
        status
      };
      if (editingId) {
        await api.updateReceiptDocument(editingId, payload);
        setMsg('Saved.');
      } else {
        await api.createReceiptDocument(payload);
        setMsg('Expense saved.');
      }
      await loadDocuments();
      resetCaptureForm();
      setTab('inbox');
    } catch (e) {
      setMsg(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (doc) => {
    setEditingId(doc.id);
    setUploadedUrl(doc.fileUrl);
    setExtraction(doc.extraction || {});
    setVendor(doc.vendor || '');
    setDocumentDate((doc.documentDate || '').slice(0, 10));
    setTotal(String(doc.total != null ? doc.total : ''));
    setCurrency(doc.currency || 'ZAR');
    setTaxAmount(doc.taxAmount != null ? String(doc.taxAmount) : '');
    setAccountId(doc.accountId || '');
    setCostCenterId(doc.costCenterId || '');
    setNotes(doc.notes || '');
    setStatus(doc.status || 'draft');
    const fu = doc.fileUrl || '';
    const isPdf = fu.toLowerCase().includes('.pdf');
    if (fu && !isPdf) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setCapturePreview(fu.startsWith('http') ? fu : `${origin}${fu.startsWith('/') ? fu : `/${fu}`}`);
    } else {
      setCapturePreview('');
    }
    setTab('capture');
  };

  const deleteDoc = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.deleteReceiptDocument(id);
      await loadDocuments();
    } catch (e) {
      alert(e?.message || 'Delete failed');
    }
  };

  const addAccount = async () => {
    const name = newAccName.trim();
    if (!name) return;
    try {
      await api.createReceiptAccount({ name, code: newAccCode.trim() });
      setNewAccName('');
      setNewAccCode('');
      await loadLookups();
    } catch (e) {
      alert(e?.message || 'Failed');
    }
  };

  const removeAccount = async (id) => {
    if (!confirm('Remove this account?')) return;
    try {
      await api.deleteReceiptAccount(id);
      await loadLookups();
    } catch (e) {
      alert(e?.message || 'Failed');
    }
  };

  const addCc = async () => {
    const name = newCcName.trim();
    if (!name) return;
    try {
      await api.createReceiptCostCenter({ name, code: newCcCode.trim() });
      setNewCcName('');
      setNewCcCode('');
      await loadLookups();
    } catch (e) {
      alert(e?.message || 'Failed');
    }
  };

  const removeCc = async (id) => {
    if (!confirm('Remove this cost centre?')) return;
    try {
      await api.deleteReceiptCostCenter(id);
      await loadLookups();
    } catch (e) {
      alert(e?.message || 'Failed');
    }
  };

  const exportCsv = () => {
    const rows = documents.filter((d) => d.status === 'reviewed' || d.status === 'exported' || d.status === 'draft');
    if (!rows.length) {
      alert('No rows to export. Save expenses or include draft rows.');
      return;
    }
    const header = [
      'Date',
      'Vendor',
      'Total',
      'Currency',
      'Tax',
      'Account',
      'AccountCode',
      'CostCentre',
      'CostCentreCode',
      'Status',
      'Notes',
      'SourceURL'
    ];
    const lines = [header.join(',')];
    for (const d of rows) {
      const acc = d.account || accounts.find((a) => a.id === d.accountId);
      const cc = d.costCenter || costCenters.find((c) => c.id === d.costCenterId);
      lines.push(
        [
          escapeCsvCell(d.documentDate),
          escapeCsvCell(d.vendor),
          escapeCsvCell(d.total),
          escapeCsvCell(d.currency),
          escapeCsvCell(d.taxAmount),
          escapeCsvCell(acc?.name),
          escapeCsvCell(acc?.code),
          escapeCsvCell(cc?.name),
          escapeCsvCell(cc?.code),
          escapeCsvCell(d.status),
          escapeCsvCell(d.notes),
          escapeCsvCell(d.fileUrl ? `${window.location.origin}${d.fileUrl}` : '')
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expense-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cardClass = `${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} rounded-lg border p-4`;
  const appCard = `${isDark ? 'bg-gray-800/90 border-gray-600' : 'bg-white border-gray-200'} rounded-2xl border shadow-sm`;

  const layoutToggle = (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className={isDark ? 'text-gray-500' : 'text-gray-500'}>Layout:</span>
      <button
        type="button"
        onClick={() => setUserLayout('app')}
        className={`px-2 py-1 rounded-lg ${appStyle ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
      >
        App-style (mobile)
      </button>
      <button
        type="button"
        onClick={() => setUserLayout('classic')}
        className={`px-2 py-1 rounded-lg ${!appStyle ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
      >
        Classic (table)
      </button>
      <button
        type="button"
        onClick={() => setUserLayout(null)}
        className={`px-2 py-1 rounded-lg ${userLayout === null ? 'ring-2 ring-blue-400' : ''} ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
      >
        Auto
      </button>
    </div>
  );

  const inboxTable = (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold mb-3">Saved expenses</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              <th className="text-left py-2 pr-2">Date</th>
              <th className="text-left py-2 pr-2">Vendor</th>
              <th className="text-right py-2 pr-2">Total</th>
              <th className="text-left py-2 pr-2">Status</th>
              <th className="text-left py-2 pr-2">Account</th>
              <th className="text-left py-2 pr-2">Cost centre</th>
              <th className="text-right py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-t border-gray-600/20">
                <td className="py-2 pr-2">{d.documentDate || '—'}</td>
                <td className="py-2 pr-2 max-w-[140px] truncate" title={d.vendor}>
                  {d.vendor || '—'}
                </td>
                <td className="py-2 pr-2 text-right">
                  {d.currency} {Number(d.total || 0).toFixed(2)}
                </td>
                <td className="py-2 pr-2">{d.status}</td>
                <td className="py-2 pr-2">{d.account?.name || '—'}</td>
                <td className="py-2 pr-2">{d.costCenter?.name || '—'}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button type="button" className="text-blue-500 mr-2" onClick={() => openEdit(d)}>
                    Edit
                  </button>
                  <button type="button" className="text-red-500" onClick={() => deleteDoc(d.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {documents.length === 0 ? (
          <p className={`text-sm mt-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No expenses yet.</p>
        ) : null}
      </div>
    </div>
  );

  const inboxCards = (
    <div className="space-y-3 px-1">
      {documents.length === 0 ? (
        <p className={`text-sm text-center py-8 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No expenses yet. Tap capture to add one.</p>
      ) : (
        documents.map((d) => (
          <div
            key={d.id}
            className={`${appCard} p-4 flex flex-col gap-2 active:scale-[0.99] transition-transform`}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-base truncate">{d.vendor || 'Expense'}</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{d.documentDate || '—'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">
                  {d.currency} {Number(d.total || 0).toFixed(2)}
                </p>
                <span className={`text-[10px] uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {d.status}
                </span>
              </div>
            </div>
            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {(d.account?.name || d.costCenter?.name) && (
                <span>
                  {d.account?.name || '—'}
                  {d.account?.name && d.costCenter?.name ? ' · ' : ''}
                  {d.costCenter?.name || ''}
                </span>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium"
                onClick={() => openEdit(d)}
              >
                Edit
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl border border-red-500/50 text-red-500 text-sm"
                onClick={() => deleteDoc(d.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const captureFields = (
    <>
      <div className={appStyle ? appCard + ' p-4 space-y-3' : cardClass}>
        <h3 className={`font-semibold ${appStyle ? 'text-base' : 'text-sm'} mb-2`}>{appStyle ? 'Photo or file' : '1. File'}</h3>
        {!appStyle && (
          <input type="file" accept="image/*,application/pdf" onChange={onPickFile} className="text-sm" />
        )}
        {appStyle && (
          <div className="flex flex-col gap-3">
            <label className="block">
              <input type="file" accept="image/*" capture="environment" className="hidden" id="expense-capture-camera" onChange={onPickFile} />
              <span
                className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-base font-semibold text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg cursor-pointer active:opacity-90`}
              >
                <i className="fas fa-camera text-xl" aria-hidden />
                Take photo
              </span>
            </label>
            <label className="block">
              <input type="file" accept="image/*,application/pdf" className="hidden" id="expense-capture-gallery" onChange={onPickFile} />
              <span
                className={`flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-medium border-2 border-dashed cursor-pointer ${
                  isDark ? 'border-gray-500 text-gray-200' : 'border-gray-300 text-gray-700'
                }`}
              >
                <i className="fas fa-images" aria-hidden />
                Choose from gallery or PDF
              </span>
            </label>
          </div>
        )}
        {capturePreview && !String(capturePreview).startsWith('data:application/pdf') ? (
          <img src={capturePreview} alt="" className={`mt-3 w-full rounded-xl border border-gray-600/30 ${appStyle ? 'max-h-64 object-contain bg-black/20' : 'max-h-48'}`} />
        ) : null}
        {capturePreview && String(capturePreview).startsWith('data:application/pdf') ? (
          <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>PDF selected — preview not shown.</p>
        ) : null}
        <div className={`mt-3 flex flex-wrap gap-2 ${appStyle ? 'flex-col' : ''}`}>
          <button
            type="button"
            disabled={processing || !capturePreview}
            onClick={runExtractAndPrepare}
            className={`rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50 ${appStyle ? 'w-full py-3.5 text-base' : 'px-3 py-1.5 text-sm'}`}
          >
            {processing ? 'Uploading / extracting…' : 'Upload & extract'}
          </button>
          {editingId ? (
            <span className="text-xs text-gray-500 self-center">Editing expense #{editingId.slice(0, 8)}…</span>
          ) : null}
        </div>
        {noOpenAI ? (
          <p className="text-amber-600 text-sm mt-2">Automatic extraction is not configured. Enter fields manually.</p>
        ) : null}
      </div>

      <div className={appStyle ? appCard + ' p-4' : cardClass}>
        <h3 className={`font-semibold mb-3 ${appStyle ? 'text-base' : 'text-sm'}`}>{appStyle ? 'Details' : '2. Details & allocation'}</h3>
        <div className={`grid grid-cols-1 gap-3 text-sm ${appStyle ? '' : 'sm:grid-cols-2'}`}>
          <label className="block">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Vendor</span>
            <input
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Date</span>
            <input
              type="date"
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Total</span>
            <input
              inputMode="decimal"
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Currency</span>
            <input
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Tax (optional)</span>
            <input
              inputMode="decimal"
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Status</span>
            <select
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">draft</option>
              <option value="reviewed">reviewed</option>
              <option value="exported">exported</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Account</span>
            <select
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} — ` : ''}
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Cost centre</span>
            <select
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent ${appStyle ? 'text-base' : ''}`}
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
            >
              <option value="">—</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Notes</span>
            <textarea
              className={`mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-500/30 bg-transparent min-h-[80px] ${appStyle ? 'text-base' : 'min-h-[72px]'}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <div className={`mt-4 flex gap-2 ${appStyle ? 'flex-col' : ''}`}>
          <button
            type="button"
            disabled={saving || !uploadedUrl}
            onClick={saveDocument}
            className={`rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 ${appStyle ? 'w-full py-3.5 text-base' : 'px-4 py-2 text-sm'}`}
          >
            {saving ? 'Saving…' : editingId ? 'Update expense' : 'Submit expense'}
          </button>
          <button
            type="button"
            onClick={() => {
              resetCaptureForm();
              setTab('inbox');
            }}
            className={`rounded-xl border border-gray-500/40 font-medium ${appStyle ? 'w-full py-3 text-base' : 'px-4 py-2 text-sm'}`}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );

  const settingsPanel = isAdmin && (
    <div className={appStyle ? 'space-y-4 px-1 pb-24' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
      <div className={appStyle ? appCard + ' p-4' : cardClass}>
        <h3 className="text-sm font-semibold mb-2">Accounts (admin)</h3>
        <div className="flex gap-2 mb-2 flex-wrap">
          <input
            placeholder="Name"
            className="flex-1 min-w-[120px] px-2 py-2 rounded-xl border border-gray-500/30 text-sm bg-transparent"
            value={newAccName}
            onChange={(e) => setNewAccName(e.target.value)}
          />
          <input
            placeholder="Code"
            className="w-24 px-2 py-2 rounded-xl border border-gray-500/30 text-sm bg-transparent"
            value={newAccCode}
            onChange={(e) => setNewAccCode(e.target.value)}
          />
          <button type="button" onClick={addAccount} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm">
            Add
          </button>
        </div>
        <ul className="text-sm space-y-1 max-h-56 overflow-y-auto">
          {accounts.map((a) => (
            <li key={a.id} className="flex justify-between items-center py-2 border-b border-gray-600/20">
              <span>
                {a.code ? `${a.code} — ` : ''}
                {a.name}
              </span>
              <button type="button" className="text-red-500 text-xs" onClick={() => removeAccount(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className={appStyle ? appCard + ' p-4' : cardClass}>
        <h3 className="text-sm font-semibold mb-2">Cost centres (admin)</h3>
        <div className="flex gap-2 mb-2 flex-wrap">
          <input
            placeholder="Name"
            className="flex-1 min-w-[120px] px-2 py-2 rounded-xl border border-gray-500/30 text-sm bg-transparent"
            value={newCcName}
            onChange={(e) => setNewCcName(e.target.value)}
          />
          <input
            placeholder="Code"
            className="w-24 px-2 py-2 rounded-xl border border-gray-500/30 text-sm bg-transparent"
            value={newCcCode}
            onChange={(e) => setNewCcCode(e.target.value)}
          />
          <button type="button" onClick={addCc} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm">
            Add
          </button>
        </div>
        <ul className="text-sm space-y-1 max-h-56 overflow-y-auto">
          {costCenters.map((c) => (
            <li key={c.id} className="flex justify-between items-center py-2 border-b border-gray-600/20">
              <span>
                {c.code ? `${c.code} — ` : ''}
                {c.name}
              </span>
              <button type="button" className="text-red-500 text-xs" onClick={() => removeCc(c.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className={`text-xs ${appStyle ? '' : 'md:col-span-2'} ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
        These lists are for allocating expenses in the ERP. QuickBooks Online sync is a future phase — see docs.
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        Loading Expense Capture…
      </div>
    );
  }

  if (appStyle) {
    const navBtn = (id, icon, label, flexClass = 'flex-1') => (
      <button
        type="button"
        onClick={() => {
          setTab(id);
          if (id === 'capture' && !editingId) resetCaptureForm();
        }}
        className={`flex flex-col items-center gap-0.5 ${flexClass} py-2 min-h-[48px] justify-center rounded-xl transition-colors ${
          tab === id ? 'text-blue-500' : isDark ? 'text-gray-400' : 'text-gray-500'
        }`}
      >
        <i className={`fas ${icon} text-lg`} aria-hidden />
        <span className="text-[10px] font-medium">{label}</span>
      </button>
    );

    return (
      <div
        className={`w-full max-w-md mx-auto flex flex-col min-h-[calc(100dvh-12rem)] rounded-[1.75rem] overflow-hidden border shadow-2xl ${
          isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-100 border-gray-200'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <header
          className={`px-4 pt-5 pb-4 shrink-0 ${
            isDark ? 'bg-gradient-to-br from-slate-800 to-slate-900' : 'bg-gradient-to-br from-emerald-600 to-teal-700'
          } text-white rounded-b-[1.5rem] shadow-md`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Expense Capture</h1>
              <p className="text-xs text-white/80 mt-0.5">Snap a slip · allocate · submit</p>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="text-xs px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25"
            >
              Export CSV
            </button>
          </div>
          {layoutToggle}
        </header>

        <div className="flex-1 overflow-y-auto min-h-0 px-3 pt-3 pb-2">
          <p className={`text-[11px] leading-snug mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            Only upload what you need for expenses; follow your company retention policy.
          </p>
          {msg ? <p className={`text-sm mb-2 ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>{msg}</p> : null}

          {tab === 'inbox' && inboxCards}
          {tab === 'capture' && <div className="space-y-4 pb-4">{captureFields}</div>}
          {tab === 'settings' && settingsPanel}
        </div>

        <nav
          className={`shrink-0 flex items-stretch justify-around border-t pt-1 ${
            isDark ? 'bg-gray-900/95 border-gray-700' : 'bg-white/95 border-gray-200'
          } backdrop-blur-sm pb-[max(0.35rem,env(safe-area-inset-bottom))]`}
        >
          {isAdmin ? (
            <>
              {navBtn('inbox', 'fa-inbox', 'Inbox')}
              {navBtn('capture', 'fa-camera', 'Capture')}
              {navBtn('settings', 'fa-cog', 'Setup')}
            </>
          ) : (
            <>
              {navBtn('inbox', 'fa-inbox', 'Inbox', 'flex-1')}
              {navBtn('capture', 'fa-camera', 'Capture', 'flex-1')}
            </>
          )}
        </nav>
      </div>
    );
  }

  return (
    <div className={`space-y-4 max-w-5xl ${isDark ? 'text-gray-100' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {layoutToggle}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {['inbox', 'capture', ...(isAdmin ? ['settings'] : [])].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              if (t === 'capture' && !editingId) resetCaptureForm();
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              tab === t
                ? 'bg-blue-600 text-white'
                : isDark
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-gray-100 text-gray-800'
            }`}
          >
            {t === 'inbox' ? 'Inbox' : t === 'capture' ? 'Capture' : 'Setup'}
          </button>
        ))}
        <button
          type="button"
          onClick={exportCsv}
          className={`ml-auto px-3 py-1.5 rounded-lg text-sm ${isDark ? 'bg-emerald-900 text-emerald-100' : 'bg-emerald-600 text-white'}`}
        >
          Export CSV
        </button>
      </div>
      <p className={`text-[11px] leading-snug ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
        Slips may show card or bank details. Only upload what you need for expenses; follow your company retention policy.
      </p>

      {msg ? (
        <p className={`text-sm ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>{msg}</p>
      ) : null}

      {tab === 'inbox' && inboxTable}
      {tab === 'capture' && <div className="space-y-4">{captureFields}</div>}
      {tab === 'settings' && isAdmin && settingsPanel}
    </div>
  );
}

window.ExpenseCaptureTool = ExpenseCaptureTool;
window.ReceiptCaptureTool = ExpenseCaptureTool;
