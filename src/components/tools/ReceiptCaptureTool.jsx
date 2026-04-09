/**
 * Dext-like MVP: capture receipts/invoices, extract with AI, allocate to accounts & cost centres, export CSV.
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

async function uploadReceiptDataUrl(dataUrl, name) {
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
      name: name || `receipt-${Date.now()}.jpg`,
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

function ReceiptCaptureTool() {
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
      setCaptureName(file.name || 'receipt');
      setUploadedUrl('');
      setExtraction(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const runExtractAndPrepare = async () => {
    if (!capturePreview) {
      alert('Choose a file first.');
      return;
    }
    setProcessing(true);
    setMsg('');
    try {
      const url = await uploadReceiptDataUrl(capturePreview, captureName);
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
        setMsg('Receipt saved.');
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
    if (!confirm('Delete this receipt record?')) return;
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
      alert('No rows to export. Save receipts or include draft rows.');
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
    a.download = `receipt-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cardClass = `${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} rounded-lg border p-4`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        Loading receipt capture…
      </div>
    );
  }

  return (
    <div className={`space-y-4 max-w-5xl ${isDark ? 'text-gray-100' : ''}`}>
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

      {tab === 'inbox' && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold mb-3">Saved receipts</h3>
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
              <p className={`text-sm mt-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No receipts yet.</p>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'capture' && (
        <div className="space-y-4">
          <div className={cardClass}>
            <h3 className="text-sm font-semibold mb-2">1. File</h3>
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={onPickFile} className="text-sm" />
            {capturePreview && !String(capturePreview).startsWith('data:application/pdf') ? (
              <img src={capturePreview} alt="" className="mt-3 max-h-48 rounded border border-gray-600/30" />
            ) : null}
            {capturePreview && String(capturePreview).startsWith('data:application/pdf') ? (
              <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>PDF selected — preview not shown.</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={processing || !capturePreview}
                onClick={runExtractAndPrepare}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
              >
                {processing ? 'Uploading / extracting…' : 'Upload & extract'}
              </button>
              {editingId ? (
                <span className="text-xs text-gray-500 self-center">Editing saved receipt #{editingId.slice(0, 8)}…</span>
              ) : null}
            </div>
            {noOpenAI ? (
              <p className="text-amber-600 text-sm mt-2">Automatic extraction is not configured. Enter fields manually.</p>
            ) : null}
          </div>

          <div className={cardClass}>
            <h3 className="text-sm font-semibold mb-2">2. Details & allocation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <label className="block">
                Vendor
                <input
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                />
              </label>
              <label className="block">
                Document date
                <input
                  type="date"
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                />
              </label>
              <label className="block">
                Total
                <input
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </label>
              <label className="block">
                Currency
                <input
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </label>
              <label className="block">
                Tax (optional)
                <input
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                />
              </label>
              <label className="block">
                Status
                <select
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="draft">draft</option>
                  <option value="reviewed">reviewed</option>
                  <option value="exported">exported</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                Account
                <select
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
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
                Cost centre
                <select
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent"
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
                Notes
                <textarea
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-500/30 bg-transparent min-h-[72px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={saving || !uploadedUrl}
                onClick={saveDocument}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Update receipt' : 'Save receipt'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetCaptureForm();
                  setTab('inbox');
                }}
                className="px-4 py-2 rounded-lg border border-gray-500/40 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'settings' && isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={cardClass}>
            <h3 className="text-sm font-semibold mb-2">Accounts (admin)</h3>
            <div className="flex gap-2 mb-2">
              <input
                placeholder="Name"
                className="flex-1 px-2 py-1.5 rounded border border-gray-500/30 text-sm bg-transparent"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
              />
              <input
                placeholder="Code"
                className="w-24 px-2 py-1.5 rounded border border-gray-500/30 text-sm bg-transparent"
                value={newAccCode}
                onChange={(e) => setNewAccCode(e.target.value)}
              />
              <button type="button" onClick={addAccount} className="px-2 py-1.5 bg-blue-600 text-white rounded text-sm">
                Add
              </button>
            </div>
            <ul className="text-sm space-y-1 max-h-56 overflow-y-auto">
              {accounts.map((a) => (
                <li key={a.id} className="flex justify-between items-center py-1 border-b border-gray-600/20">
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
          <div className={cardClass}>
            <h3 className="text-sm font-semibold mb-2">Cost centres (admin)</h3>
            <div className="flex gap-2 mb-2">
              <input
                placeholder="Name"
                className="flex-1 px-2 py-1.5 rounded border border-gray-500/30 text-sm bg-transparent"
                value={newCcName}
                onChange={(e) => setNewCcName(e.target.value)}
              />
              <input
                placeholder="Code"
                className="w-24 px-2 py-1.5 rounded border border-gray-500/30 text-sm bg-transparent"
                value={newCcCode}
                onChange={(e) => setNewCcCode(e.target.value)}
              />
              <button type="button" onClick={addCc} className="px-2 py-1.5 bg-blue-600 text-white rounded text-sm">
                Add
              </button>
            </div>
            <ul className="text-sm space-y-1 max-h-56 overflow-y-auto">
              {costCenters.map((c) => (
                <li key={c.id} className="flex justify-between items-center py-1 border-b border-gray-600/20">
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
          <p className={`text-xs md:col-span-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            These lists are for allocating slips in the ERP. QuickBooks Online sync is a future phase — see docs.
          </p>
        </div>
      )}
    </div>
  );
}

window.ReceiptCaptureTool = ReceiptCaptureTool;
