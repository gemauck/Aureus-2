/**
 * Mobile-first wizard: capture a quote/invoice image, upload, optional AI line extraction,
 * match supplier/inventory, submit a draft purchase order for ERP review (Mark Final).
 */
const { useState, useMemo, useCallback, useEffect } = React;

const PO_VAT_RATE = 0.15;

function purchaseOrderVatFromSubtotal(subtotal) {
  const s = parseFloat(subtotal) || 0;
  return Math.round(s * PO_VAT_RATE * 100) / 100;
}

function inventoryItemLinkedToSupplierName(item, supplierName) {
  const needle = String(supplierName || '').trim().toLowerCase();
  if (!needle) return false;
  const relational = Array.isArray(item?.alternativeSuppliers) ? item.alternativeSuppliers : [];
  if (relational.some((row) => String(row?.supplierName || '').trim().toLowerCase() === needle)) return true;
  const primary = String(item?.supplier || '').trim().toLowerCase();
  if (primary === needle) return true;
  try {
    const raw = item?.supplierPartNumbers;
    const parts = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    if (!Array.isArray(parts)) return false;
    return parts.some((sp) => String(sp?.supplier || '').trim().toLowerCase() === needle);
  } catch {
    return false;
  }
}

function dedupeInventoryRowsBySku(items) {
  const out = [];
  const seen = new Set();
  for (const row of items) {
    const k = row.sku || row.id;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

function normalizeSearchText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** supplierPartNumbers JSON: [{ supplier, partNumber }, ...] or legacy string entries */
function parseSupplierPartNumbersJson(raw) {
  try {
    const parts = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    return Array.isArray(parts) ? parts : [];
  } catch {
    return [];
  }
}

function partNeedleMatchesSupplierPartNumbers(item, needleRaw) {
  const needle = normalizeSearchText(needleRaw);
  if (!needle || needle.length < 2) return false;
  const relational = Array.isArray(item?.alternativeSuppliers) ? item.alternativeSuppliers : [];
  for (const row of relational) {
    const pnRel = normalizeSearchText(row?.supplierPartNumber || '');
    if (pnRel && (pnRel === needle || pnRel.includes(needle) || needle.includes(pnRel))) return true;
  }
  const parts = parseSupplierPartNumbersJson(item.supplierPartNumbers);
  for (const sp of parts) {
    if (typeof sp === 'string') {
      const sn = normalizeSearchText(sp);
      if (sn && (sn === needle || sn.includes(needle) || needle.includes(sn))) return true;
    } else if (sp && typeof sp === 'object') {
      const pn = normalizeSearchText(sp.partNumber || '');
      if (pn && (pn === needle || pn.includes(needle) || needle.includes(pn))) return true;
    }
  }
  return false;
}

function partNeedleMatchesLegacy(item, needleRaw) {
  const leg = String(item.legacyPartNumber || '').trim();
  if (!leg) return false;
  const needle = normalizeSearchText(needleRaw);
  if (!needle || needle.length < 2) return false;
  const l = normalizeSearchText(leg);
  return l === needle || l.includes(needle) || needle.includes(l);
}

function partNeedleMatchesManufacturing(item, needleRaw) {
  const mfg = String(item.manufacturingPartNumber || '').trim();
  if (!mfg) return false;
  const needle = normalizeSearchText(needleRaw);
  if (!needle || needle.length < 2) return false;
  const m = normalizeSearchText(mfg);
  return m === needle || m.includes(needle) || needle.includes(m);
}

function tokenizeMeaningful(s) {
  return normalizeSearchText(s)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3);
}

/** Match extracted text to inventory name (description): substring or shared tokens */
function descriptionMatchesName(extractedText, inventoryName) {
  const d = normalizeSearchText(extractedText);
  const n = normalizeSearchText(inventoryName);
  if (!d || !n) return false;
  if (d.length >= 4 && (n.includes(d) || d.includes(n))) return true;
  const maxSlice = 40;
  if (d.length >= 6 && n.includes(d.slice(0, Math.min(maxSlice, d.length)))) return true;
  if (n.length >= 6 && d.includes(n.slice(0, Math.min(maxSlice, n.length)))) return true;
  const dTok = tokenizeMeaningful(d);
  const nSet = new Set(tokenizeMeaningful(n));
  if (dTok.length === 0) return false;
  let hits = 0;
  for (const t of dTok) {
    if (nSet.has(t)) hits++;
  }
  if (hits >= 2) return true;
  if (hits === 1 && dTok.length === 1) return true;
  return false;
}

/** Looks like a pure code (digits/delimiters only) — use for part fields, not as prose description */
function looksLikePartCodeOnly(s) {
  const t = String(s || '').trim();
  if (t.length < 2) return false;
  return /^[\d\-./\s]+$/.test(t);
}

function findInventoryForExtractedLine(invOpts, ln) {
  const partHint = String(ln.partNumberHint || '').trim();
  const desc = String(ln.description || '').trim();
  const skuLower = partHint.toLowerCase();

  let inv = skuLower
    ? invOpts.find((i) => String(i.sku || '').toLowerCase() === skuLower)
    : null;
  if (inv) return inv;

  if (partHint) {
    inv = invOpts.find((i) => partNeedleMatchesLegacy(i, partHint));
    if (inv) return inv;
    inv = invOpts.find((i) => partNeedleMatchesSupplierPartNumbers(i, partHint));
    if (inv) return inv;
    inv = invOpts.find((i) => partNeedleMatchesManufacturing(i, partHint));
    if (inv) return inv;
  }

  if (desc) {
    inv = invOpts.find((i) => descriptionMatchesName(desc, i.name));
    if (inv) return inv;
    inv = invOpts.find((i) => partNeedleMatchesLegacy(i, desc));
    if (inv) return inv;
    inv = invOpts.find((i) => partNeedleMatchesSupplierPartNumbers(i, desc));
    if (inv) return inv;
    inv = invOpts.find((i) => partNeedleMatchesManufacturing(i, desc));
    if (inv) return inv;
  }

  if (partHint && !looksLikePartCodeOnly(partHint)) {
    inv = invOpts.find((i) => descriptionMatchesName(partHint, i.name));
    if (inv) return inv;
  }

  return null;
}

function matchSupplierByHint(hint, suppliers) {
  if (!hint || !Array.isArray(suppliers)) return { id: '', name: '' };
  const n = String(hint).trim().toLowerCase();
  if (!n) return { id: '', name: '' };
  const exact = suppliers.find((s) => String(s.name || '').trim().toLowerCase() === n);
  if (exact) return { id: exact.id, name: exact.name || '' };
  const partial = suppliers.find(
    (s) => {
      const sn = String(s.name || '').trim().toLowerCase();
      return sn && (n.includes(sn) || sn.includes(n));
    }
  );
  if (partial) return { id: partial.id, name: partial.name || '' };
  return { id: '', name: '' };
}

function buildLinesFromExtraction(extraction, supplierName, inventoryList) {
  const invOpts = dedupeInventoryRowsBySku(
    supplierName
      ? inventoryList.filter((item) => inventoryItemLinkedToSupplierName(item, supplierName))
      : inventoryList
  );
  const lines = extraction?.lines && Array.isArray(extraction.lines) ? extraction.lines : [];
  return lines.map((ln, idx) => {
    const inv = findInventoryForExtractedLine(invOpts, ln);
    const qty = parseFloat(ln.quantity) > 0 ? parseFloat(ln.quantity) : 1;
    let unitPrice = parseFloat(ln.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      unitPrice = inv ? parseFloat(inv.unitCost) || 0 : 0;
    }
    return {
      id: `wiz-${idx}-${Date.now()}`,
      sku: inv?.sku || ln.partNumberHint || '',
      name: inv?.name || String(ln.description || '').trim() || '',
      quantity: qty,
      unitPrice,
      total: qty * unitPrice,
      supplierPartNumber: ln.partNumberHint || ''
    };
  });
}

async function uploadDataUrlToPoFolder(dataUrl, name) {
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
      folder: 'po-source-documents',
      name: name || `po-doc-${Date.now()}.jpg`,
      dataUrl
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || json.message || `Upload failed (${res.status})`);
  }
  const url = json.data?.url || json.url;
  if (!url) throw new Error('No file URL returned from upload');
  return url;
}

function PurchaseOrderFromDocumentWizard({
  onClose,
  onCreated,
  suppliers = [],
  inventory = [],
  stockLocations = [],
  defaultReceivingLocationId = null,
  safeCallAPI,
  isDark = false
}) {
  const [step, setStep] = useState('capture');
  const [previewName, setPreviewName] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [processingMessage, setProcessingMessage] = useState('');
  const [extractWarning, setExtractWarning] = useState('');
  const [extractionMeta, setExtractionMeta] = useState(null);

  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [receivingLocationId, setReceivingLocationId] = useState(defaultReceivingLocationId || '');
  const [includeVat, setIncludeVat] = useState(false);
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defaultReceivingLocationId && !receivingLocationId) {
      setReceivingLocationId(defaultReceivingLocationId);
    }
  }, [defaultReceivingLocationId, receivingLocationId]);

  const invForSupplier = useMemo(() => {
    return dedupeInventoryRowsBySku(
      supplierName
        ? inventory.filter((item) => inventoryItemLinkedToSupplierName(item, supplierName))
        : inventory
    );
  }, [inventory, supplierName]);

  const subtotal = useMemo(
    () => lines.reduce((sum, it) => sum + (parseFloat(it.total) || 0), 0),
    [lines]
  );
  const tax = includeVat ? purchaseOrderVatFromSubtotal(subtotal) : 0;
  const total = subtotal + tax;

  const onPickFile = useCallback((event) => {
    const file = event.target.files && event.target.files[0];
    const input = event.target;
    const isPdf =
      file &&
      (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
    const isImage = file && file.type.startsWith('image/');
    if (!file || (!isImage && !isPdf)) {
      if (file) alert('Please choose an image or a PDF file.');
      input.value = '';
      return;
    }
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert('File must be 20MB or smaller.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setDataUrl(typeof reader.result === 'string' ? reader.result : '');
      setPreviewName(file.name || 'document.jpg');
      setExtractWarning('');
      setUploadedUrl('');
    };
    reader.readAsDataURL(file);
    input.value = '';
  }, []);

  const runUploadAndExtract = useCallback(async () => {
    if (!dataUrl) {
      alert('Choose a photo, image, or PDF first.');
      return;
    }
    setStep('processing');
    setProcessingMessage('Uploading document…');
    setExtractWarning('');
    try {
      const url = await uploadDataUrlToPoFolder(dataUrl, previewName);
      setUploadedUrl(url);
      setProcessingMessage('Reading document…');
      let extraction = null;
      let noOpenAI = false;
      try {
        const res = await safeCallAPI('extractPurchaseOrderFromDocument', { imageUrl: url });
        extraction = res?.data?.extraction || null;
        noOpenAI = res?.data?.noOpenAI === true;
      } catch (err) {
        const m = String(err?.message || err);
        setExtractWarning(m || 'Extraction failed; you can still enter lines manually.');
      }

      if (noOpenAI) {
        setExtractWarning(
          'Automatic line extraction is not configured on the server. Enter supplier, lines, and totals manually.'
        );
      }

      setExtractionMeta(extraction);
      const hintName = extraction?.supplierNameHint
        ? matchSupplierByHint(extraction.supplierNameHint, suppliers)
        : { id: '', name: '' };
      const supId = hintName.id || '';
      const supNm = hintName.name || '';
      setSupplierId(supId);
      setSupplierName(supNm);

      if (!receivingLocationId && defaultReceivingLocationId) {
        setReceivingLocationId(defaultReceivingLocationId);
      }

      const built = buildLinesFromExtraction(extraction || { lines: [] }, supNm, inventory);
      setLines(built);
      setStep('edit');
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Upload failed');
      setStep('capture');
    } finally {
      setProcessingMessage('');
    }
  }, [dataUrl, previewName, safeCallAPI, suppliers, inventory, defaultReceivingLocationId, receivingLocationId]);

  const updateLine = useCallback((id, patch) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        const q = parseFloat(next.quantity) || 0;
        const p = parseFloat(next.unitPrice) || 0;
        next.quantity = q;
        next.unitPrice = p;
        next.total = q * p;
        return next;
      })
    );
  }, []);

  const applyInventoryToLine = useCallback(
    (lineId, sku) => {
      if (!sku) return;
      const inv = invForSupplier.find((i) => i.sku === sku || i.id === sku);
      if (!inv) return;
      updateLine(lineId, {
        sku: inv.sku || '',
        name: inv.name || '',
        unitPrice: parseFloat(inv.unitCost) || 0
      });
    },
    [invForSupplier, updateLine]
  );

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        sku: '',
        name: '',
        quantity: 1,
        unitPrice: 0,
        total: 0,
        supplierPartNumber: ''
      }
    ]);
  }, []);

  const removeLine = useCallback((id) => {
    setLines((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    const resolvedId = supplierId || (suppliers.find((s) => String(s.name) === String(supplierName))?.id || '');
    const resolvedName =
      (supplierId && suppliers.find((s) => s.id === supplierId)?.name) || supplierName || '';
    const sid = resolvedId;
    const sname = resolvedName;
    if (!sid || !sname) {
      alert('Please select a supplier');
      return;
    }
    if (lines.length === 0) {
      alert('Add at least one line item');
      return;
    }
    if (!receivingLocationId) {
      alert('Please select a receiving location');
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const docLink = uploadedUrl ? `${origin}${uploadedUrl}` : '';
    const internalNotes = [
      'Created from document scan (PO from document wizard).',
      docLink ? `Source document: ${docLink}` : '',
      extractionMeta
        ? `Detected: ${extractionMeta.documentTypeGuess || '—'}, supplier hint: ${extractionMeta.supplierNameHint || '—'}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');

    const orderData = {
      supplierId: sid || '',
      supplierName: sname || '',
      status: 'draft',
      priority: priority || 'normal',
      orderDate: orderDate || new Date().toISOString().split('T')[0],
      expectedDate: expectedDate || null,
      subtotal,
      tax,
      total,
      includeVat: includeVat === true,
      items: lines.map((item) => ({
        sku: item.sku,
        name: item.name,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        total: parseFloat(item.total),
        supplierPartNumber: item.supplierPartNumber || ''
      })),
      notes: notes || '',
      internalNotes,
      sourceDocumentUrl: uploadedUrl || undefined,
      receivingLocationId: receivingLocationId || null
    };

    setSubmitting(true);
    try {
      const response = await safeCallAPI('createPurchaseOrder', orderData);
      const created = response?.data?.purchaseOrder;
      if (created) {
        const orderWithParsedItems = {
          ...created,
          id: created.id,
          items:
            typeof created.items === 'string'
              ? JSON.parse(created.items || '[]')
              : (created.items || [])
        };
        onCreated(orderWithParsedItems);
      } else {
        alert('Purchase order created but response was incomplete. Refresh to verify.');
        onClose();
      }
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  }, [
    supplierId,
    supplierName,
    suppliers,
    lines,
    receivingLocationId,
    subtotal,
    tax,
    total,
    includeVat,
    priority,
    orderDate,
    expectedDate,
    notes,
    uploadedUrl,
    extractionMeta,
    safeCallAPI,
    onCreated,
    onClose
  ]);

  const panelBg = isDark ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900';
  const cardBg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const inputCls = isDark
    ? 'bg-gray-800 border-gray-700 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col ${panelBg}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-doc-wizard-title"
    >
      <header
        className={`flex items-center justify-between px-4 py-3 border-b ${
          isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
        }`}
      >
        <div>
          <h1 id="po-doc-wizard-title" className="text-lg font-semibold">
            PO from document
          </h1>
          <p className="text-xs opacity-70">Creates a draft PO for review (Mark Final in ERP)</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`px-3 py-2 text-sm rounded-lg ${
            isDark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'
          }`}
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full pb-24">
        {step === 'capture' && (
          <div className={`rounded-xl border p-4 space-y-4 ${cardBg}`}>
            <p className="text-sm">Photograph or upload a quote, invoice, packing list, or PDF.</p>
            <div
              className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-10 ${
                isDark ? 'border-gray-700' : 'border-gray-300'
              }`}
            >
              {dataUrl ? (
                dataUrl.includes('application/pdf') || /\.pdf$/i.test(previewName || '') ? (
                  <div className="flex flex-col items-center mb-3 text-center px-4">
                    <i className="fas fa-file-pdf text-5xl text-red-600 mb-2" aria-hidden />
                    <p className="text-sm font-medium">PDF selected</p>
                    <p className="text-xs opacity-70 break-all mt-1">{previewName || 'document.pdf'}</p>
                  </div>
                ) : (
                  <img src={dataUrl} alt="Document preview" className="max-h-64 object-contain mb-3" />
                )
              ) : (
                <i className="fas fa-camera text-4xl mb-3 opacity-40" />
              )}
              <label className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                Choose image or PDF
                <input
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  className="hidden"
                  onChange={onPickFile}
                />
              </label>
              {previewName && <p className="text-xs mt-2 opacity-70">{previewName}</p>}
            </div>
            <button
              type="button"
              disabled={!dataUrl}
              onClick={runUploadAndExtract}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'processing' && (
          <div className={`rounded-xl border p-8 text-center ${cardBg}`}>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-sm font-medium">{processingMessage || 'Working…'}</p>
          </div>
        )}

        {step === 'edit' && (
          <div className="space-y-4">
            {extractWarning && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  isDark ? 'bg-amber-900/30 border-amber-800 text-amber-100' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {extractWarning}
              </div>
            )}

            <div className={`rounded-xl border p-4 space-y-3 ${cardBg}`}>
              <h2 className="text-sm font-semibold">Supplier and delivery</h2>
              <div>
                <label className="text-xs opacity-70">Supplier</label>
                <select
                  className={`w-full mt-1 px-3 py-2 rounded-lg border ${inputCls}`}
                  value={supplierId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSupplierId(id);
                    const s = suppliers.find((x) => x.id === id);
                    setSupplierName(s?.name || '');
                  }}
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs opacity-70">Receiving location</label>
                <select
                  className={`w-full mt-1 px-3 py-2 rounded-lg border ${inputCls}`}
                  value={receivingLocationId}
                  onChange={(e) => setReceivingLocationId(e.target.value)}
                >
                  <option value="">Select location…</option>
                  {stockLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name || loc.code || loc.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs opacity-70">Order date</label>
                  <input
                    type="date"
                    className={`w-full mt-1 px-3 py-2 rounded-lg border ${inputCls}`}
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs opacity-70">Expected</label>
                  <input
                    type="date"
                    className={`w-full mt-1 px-3 py-2 rounded-lg border ${inputCls}`}
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs opacity-70">Priority</label>
                <select
                  className={`w-full mt-1 px-3 py-2 rounded-lg border ${inputCls}`}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeVat}
                  onChange={(e) => setIncludeVat(e.target.checked)}
                />
                Include 15% VAT (ZA)
              </label>
              <div>
                <label className="text-xs opacity-70">Notes (optional)</label>
                <textarea
                  className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${inputCls}`}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Visible on PO"
                />
              </div>
            </div>

            <div className={`rounded-xl border p-4 space-y-3 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Line items</h2>
                <button type="button" onClick={addLine} className="text-sm text-blue-600 font-medium">
                  + Add line
                </button>
              </div>
              {lines.length === 0 && (
                <p className="text-sm opacity-70">No lines yet. Add lines or go back and retake the photo.</p>
              )}
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={`rounded-lg border p-3 space-y-2 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
                >
                  <div>
                    <label className="text-xs opacity-70">Match inventory (optional)</label>
                    <select
                      className={`w-full mt-1 px-2 py-2 rounded-lg border text-sm ${inputCls}`}
                      value={
                        invForSupplier.some((i) => i.sku === line.sku && line.sku)
                          ? line.sku
                          : ''
                      }
                      onChange={(e) => applyInventoryToLine(line.id, e.target.value)}
                    >
                      <option value="">— Manual / type below —</option>
                      {invForSupplier.map((inv) => (
                        <option key={inv.sku || inv.id} value={inv.sku}>
                          {inv.sku} — {inv.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    className={`w-full px-2 py-2 rounded-lg border text-sm ${inputCls}`}
                    placeholder="SKU"
                    value={line.sku}
                    onChange={(e) => updateLine(line.id, { sku: e.target.value })}
                  />
                  <input
                    type="text"
                    className={`w-full px-2 py-2 rounded-lg border text-sm ${inputCls}`}
                    placeholder="Description / name"
                    value={line.name}
                    onChange={(e) => updateLine(line.id, { name: e.target.value })}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={`px-2 py-2 rounded-lg border text-sm ${inputCls}`}
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`px-2 py-2 rounded-lg border text-sm ${inputCls}`}
                      placeholder="Unit price"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                    />
                    <div className={`flex items-center justify-end text-sm font-medium ${inputCls} rounded-lg border px-2`}>
                      {line.total != null ? line.total.toFixed(2) : ''}
                    </div>
                  </div>
                  <input
                    type="text"
                    className={`w-full px-2 py-2 rounded-lg border text-sm ${inputCls}`}
                    placeholder="Supplier part #"
                    value={line.supplierPartNumber}
                    onChange={(e) => updateLine(line.id, { supplierPartNumber: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="text-xs text-red-600"
                  >
                    Remove line
                  </button>
                </div>
              ))}
            </div>

            <div className={`rounded-xl border p-4 ${cardBg}`}>
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>R {subtotal.toFixed(2)}</span>
              </div>
              {includeVat && (
                <div className="flex justify-between text-sm mt-1">
                  <span>VAT 15%</span>
                  <span>R {tax.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold mt-2">
                <span>Total</span>
                <span>R {total.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Creating draft…' : 'Create draft purchase order'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

window.PurchaseOrderFromDocumentWizard = PurchaseOrderFromDocumentWizard;
