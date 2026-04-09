/**
 * Mobile-first wizard: photograph a quote/invoice → OCR → line matching → submit for admin approval.
 * Requires login. Exposes window.ProductionOrderCapture for Manufacturing.jsx.
 */
const { useState, useEffect, useCallback, useMemo } = React;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function linesFromParserPayload(payload) {
  const lines = [];
  const tables = payload.tables || [];
  for (const t of tables) {
    const headers = (t.headers || []).map((h) => String(h).toLowerCase());
    const descIdx = headers.findIndex((h) =>
      /desc|item|product|part|name|material|description/.test(h)
    );
    const qtyIdx = headers.findIndex((h) => /qty|quantity/.test(h));
    for (const row of t.rows || []) {
      if (!Array.isArray(row)) continue;
      let text = descIdx >= 0 ? row[descIdx] : row.filter(Boolean).join(' ');
      text = String(text || '').trim();
      if (text.length < 2) continue;
      let quantity = null;
      if (qtyIdx >= 0 && row[qtyIdx] != null) quantity = row[qtyIdx];
      lines.push({ text, quantity });
    }
  }
  const et = payload.extractedText || '';
  if (lines.length === 0 && et) {
    et.split('\n').forEach((l) => {
      const t = l.trim();
      if (t.length > 4) lines.push({ text: t });
    });
  }
  return lines.slice(0, 100);
}

const ProductionOrderCapture = ({ onComplete, isDark }) => {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [fileName, setFileName] = useState('document.jpg');
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [extractedPayload, setExtractedPayload] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [boms, setBoms] = useState([]);
  const [clients, setClients] = useState([]);
  const [resolvedBomId, setResolvedBomId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [supplierHint, setSupplierHint] = useState('');

  const api = window.DatabaseAPI;
  const selectedBom = useMemo(
    () => boms.find((b) => b.id === resolvedBomId) || null,
    [boms, resolvedBomId]
  );

  const loadRefs = useCallback(async () => {
    if (!api?.getBOMs || !api?.getClients) return;
    try {
      const [bomRes, clientRes] = await Promise.all([api.getBOMs(), api.getClients()]);
      const bomList = bomRes?.data?.boms || [];
      setBoms(
        bomList.map((bom) => ({
          ...bom,
          components:
            Array.isArray(bom.components) ? bom.components : JSON.parse(bom.components || '[]')
        }))
      );
      setClients(clientRes?.data?.clients || []);
    } catch (e) {
      console.warn('ProductionOrderCapture: ref load', e);
    }
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    if (selectedBom) {
      setNotes((n) => n || '');
    }
  }, [selectedBom]);

  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image is too large (max ~12MB).');
      return;
    }
    setError('');
    setFileName(file.name || 'photo.jpg');
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      setDataUrl(url);
      setPreviewUrl(url);
      setStep(2);
    };
    reader.readAsDataURL(file);
  };

  const runUploadAndParse = async () => {
    if (!dataUrl || !api) return;
    setBusy(true);
    setError('');
    try {
      const up = await api.uploadDataUrlFile({
        folder: 'production-order-captures',
        name: fileName,
        dataUrl
      });
      const url = up?.data?.url;
      if (!url) throw new Error('Upload did not return a URL');
      setSourceImageUrl(url);

      const parseRes = await api.parseDocumentImage({
        file: { name: fileName, dataUrl, type: 'image/jpeg' },
        mode: 'comprehensive',
        extractTables: true,
        extractStructuredData: true
      });
      const payload = parseRes?.data ?? parseRes;
      setExtractedPayload(payload);

      const lines = linesFromParserPayload(payload);
      const match = await api.matchProductionOrderCaptureLines({
        lines: lines.map((l) => l.text),
        supplierHint: supplierHint || undefined
      });
      const mr = match?.data ?? match;
      setMatchResult(mr);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Failed to process document');
    } finally {
      setBusy(false);
    }
  };

  const submitForReview = async () => {
    if (!api) return;
    if (!resolvedBomId || !selectedBom) {
      setError('Select a BOM / product.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      setError('Enter a valid quantity.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.createProductionOrderCapture({
        sourceImageUrl,
        extractedPayload,
        matchedPayload: matchResult,
        resolvedBomId,
        productSku: selectedBom.productSku || '',
        productName: selectedBom.productName || '',
        quantity: qty,
        clientId: clientId || null,
        notes: notes || '',
        status: 'pending_review'
      });
      setStep(4);
    } catch (err) {
      setError(err.message || 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const cardClass = isDark ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`rounded-xl border p-4 sm:p-6 space-y-4 max-w-lg mx-auto ${cardClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">New production order from document</h3>
          <p className={`text-sm mt-1 ${muted}`}>
            Take a photo of a quote or invoice. An administrator will review before a production order is created.
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}
        >
          Step {step}/4
        </span>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-10 cursor-pointer hover:bg-gray-50/10">
            <i className="fas fa-camera text-3xl mb-2 opacity-70" />
            <span className="text-sm font-medium">Tap to take or choose photo</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickFile} />
          </label>
        </div>
      )}

      {step >= 2 && previewUrl && (
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-black/5">
          <img src={previewUrl} alt="Document preview" className="w-full max-h-64 object-contain" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <label className={`block text-sm ${muted}`}>Supplier / vendor hint (optional, improves matching)</label>
          <input
            type="text"
            value={supplierHint}
            onChange={(e) => setSupplierHint(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            placeholder="Name as shown on document"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void runUploadAndParse()}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Uploading & reading document…' : 'Upload & extract text'}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className={`text-sm ${muted}`}>Review matched lines (reference only). Choose the BOM and quantity for the production order.</p>
          {matchResult?.matchedLines && matchResult.matchedLines.length > 0 && (
            <ul className="text-xs max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
              {matchResult.matchedLines.slice(0, 12).map((line, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{line.rawText || line.text}</span>
                  <span className="opacity-70 whitespace-nowrap">
                    {line.sku || '—'} ({Math.round((line.matchScore || 0) * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <label className={`block text-sm mb-1 ${muted}`}>BOM / product *</label>
            <select
              value={resolvedBomId}
              onChange={(e) => setResolvedBomId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            >
              <option value="">Select BOM…</option>
              {boms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.productName || b.name} ({b.productSku || b.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-sm mb-1 ${muted}`}>Quantity *</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
          </div>
          <div>
            <label className={`block text-sm mb-1 ${muted}`}>Client (optional)</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            >
              <option value="">Stock / unallocated</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-sm mb-1 ${muted}`}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              placeholder="Context for the approver"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitForReview()}
            className="w-full py-3 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="text-center space-y-3 py-4">
          <i className="fas fa-check-circle text-4xl text-emerald-500" />
          <p className="font-medium">Request submitted</p>
          <p className={`text-sm ${muted}`}>
            An administrator will review your document and create the production order when approved.
          </p>
          <button
            type="button"
            onClick={() => onComplete && onComplete()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
          >
            Back to production orders
          </button>
        </div>
      )}

      {step > 1 && step < 4 && (
        <button
          type="button"
          className={`text-sm ${muted} underline`}
          onClick={() => {
            setStep(1);
            setDataUrl('');
            setPreviewUrl('');
            setExtractedPayload(null);
            setMatchResult(null);
            setSourceImageUrl('');
            setError('');
          }}
        >
          Start over
        </button>
      )}
    </div>
  );
};

window.ProductionOrderCapture = ProductionOrderCapture;
