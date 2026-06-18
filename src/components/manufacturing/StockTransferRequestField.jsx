/**
 * Field web: stock transfer request + pending approvals (Job cards hub).
 * Loaded via lazy-load → window.StockTransferRequestField
 */
(function () {
  const { useState, useEffect, useCallback, useMemo } = React;

  const PENDING_KEY = 'erpStockTransferRequest_pending_v1';

  function readPendingQueue() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      const arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writePendingQueue(rows) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(rows));
  }

  function StockTransferRequestField({ onBack, stockLocations = [], inventory = [], getAuthToken }) {
    const [mode, setMode] = useState('request');
    const [fromLocationId, setFromLocationId] = useState('');
    const [toLocationId, setToLocationId] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState([]);
    const [pickSku, setPickSku] = useState('');
    const [pickQty, setPickQty] = useState('1');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [requests, setRequests] = useState([]);
    const [selected, setSelected] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [loading, setLoading] = useState(false);

    const sourceRows = useMemo(() => {
      if (!fromLocationId) return [];
      return (inventory || []).filter((row) => {
        const locs = row.locations || [];
        if (locs.length) {
          const at = locs.find((l) => l.locationId === fromLocationId);
          return at && Number(at.quantity) > 0;
        }
        return row.locationId === fromLocationId && Number(row.quantity) > 0;
      });
    }, [inventory, fromLocationId]);

    const loadApprovals = useCallback(async () => {
      const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
      if (!token || !window.DatabaseAPI?.getStockTransferRequests) return;
      setLoading(true);
      setError('');
      try {
        const res = await window.DatabaseAPI.getStockTransferRequests({ pendingMyApproval: true });
        setRequests(res?.data?.requests || []);
      } catch (e) {
        setError(e?.message || 'Failed to load approvals');
      } finally {
        setLoading(false);
      }
    }, [getAuthToken]);

    useEffect(() => {
      if (mode === 'approvals') loadApprovals();
    }, [mode, loadApprovals]);

    const flushPendingQueue = useCallback(async () => {
      const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
      if (!token || !navigator.onLine) return;
      const queue = readPendingQueue();
      if (!queue.length) return;
      const remaining = [];
      for (const item of queue) {
        try {
          await window.DatabaseAPI.createStockTransferRequest(item.payload);
        } catch {
          remaining.push(item);
        }
      }
      writePendingQueue(remaining);
    }, [getAuthToken]);

    useEffect(() => {
      void flushPendingQueue();
      window.addEventListener('online', flushPendingQueue);
      return () => window.removeEventListener('online', flushPendingQueue);
    }, [flushPendingQueue]);

    const addLine = () => {
      const sku = String(pickSku || '').trim();
      const qty = parseFloat(pickQty);
      if (!sku || !Number.isFinite(qty) || qty <= 0) {
        setError('Select SKU and enter a positive quantity.');
        return;
      }
      const row = sourceRows.find((r) => r.sku === sku);
      const onHand = Number(row?.quantity) || 0;
      if (qty > onHand) {
        setError(`Only ${onHand} available at source for ${sku}.`);
        return;
      }
      const itemName = row?.name || row?.itemName || sku;
      setLines((prev) => {
        const rest = prev.filter((l) => l.sku !== sku);
        return [...rest, { sku, itemName, quantity: qty }];
      });
      setPickSku('');
      setPickQty('1');
      setError('');
    };

    const submitRequest = async () => {
      if (!fromLocationId || !toLocationId) {
        setError('Select from and to locations.');
        return;
      }
      if (fromLocationId === toLocationId) {
        setError('From and to must differ.');
        return;
      }
      if (!lines.length) {
        setError('Add at least one line.');
        return;
      }
      const payload = { fromLocationId, toLocationId, notes: notes.trim(), lines };
      setSubmitting(true);
      setError('');
      setStatus('');
      try {
        const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || !navigator.onLine) {
          const queue = readPendingQueue();
          queue.unshift({ id: `str-${Date.now()}`, savedAt: new Date().toISOString(), payload });
          writePendingQueue(queue);
          setStatus('Saved offline — will submit when back online.');
          setLines([]);
          return;
        }
        await window.DatabaseAPI.createStockTransferRequest(payload);
        setStatus('Transfer request submitted for approval.');
        setLines([]);
      } catch (e) {
        setError(e?.message || 'Submit failed');
      } finally {
        setSubmitting(false);
      }
    };

    const act = async (action) => {
      if (!selected?.id) return;
      setSubmitting(true);
      setError('');
      try {
        if (action === 'approve') {
          await window.DatabaseAPI.approveStockTransferRequest(selected.id, reviewNotes);
        } else {
          await window.DatabaseAPI.rejectStockTransferRequest(selected.id, reviewNotes);
        }
        setSelected(null);
        setReviewNotes('');
        await loadApprovals();
        setStatus(action === 'approve' ? 'Approved — stock moved.' : 'Request rejected.');
      } catch (e) {
        setError(e?.message || 'Action failed');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <button type="button" onClick={onBack} className="text-blue-600 text-sm font-medium">
            ← Back to job cards
          </button>
          <h1 className="text-2xl font-bold">Transfer stock</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('request')}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === 'request' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300'}`}
            >
              New request
            </button>
            <button
              type="button"
              onClick={() => setMode('approvals')}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === 'approvals' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300'}`}
            >
              Pending approvals
            </button>
          </div>
          {error ? <div className="rounded-lg bg-red-50 text-red-800 px-3 py-2 text-sm">{error}</div> : null}
          {status ? <div className="rounded-lg bg-green-50 text-green-800 px-3 py-2 text-sm">{status}</div> : null}

          {mode === 'request' ? (
            <div className="space-y-3 bg-white rounded-xl border p-4">
              <label className="block text-sm font-medium">From (source)</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={fromLocationId}
                onChange={(e) => setFromLocationId(e.target.value)}
              >
                <option value="">Select…</option>
                {stockLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} — {loc.name}
                  </option>
                ))}
              </select>
              <label className="block text-sm font-medium">To (destination)</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value)}
              >
                <option value="">Select…</option>
                {stockLocations
                  .filter((loc) => loc.id !== fromLocationId)
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name}
                    </option>
                  ))}
              </select>
              <label className="block text-sm font-medium">Notes</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="border-t pt-3 space-y-2">
                <label className="block text-sm font-medium">Add item</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={pickSku}
                  onChange={(e) => setPickSku(e.target.value)}
                >
                  <option value="">SKU at source…</option>
                  {sourceRows.map((row) => (
                    <option key={row.sku} value={row.sku}>
                      {row.sku} — {row.name || row.itemName} ({row.quantity})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="w-24 border rounded-lg px-3 py-2 text-sm"
                    value={pickQty}
                    onChange={(e) => setPickQty(e.target.value)}
                  />
                  <button type="button" onClick={addLine} className="px-3 py-2 bg-slate-100 rounded-lg text-sm">
                    Add line
                  </button>
                </div>
                <ul className="text-sm space-y-1">
                  {lines.map((l) => (
                    <li key={l.sku} className="flex justify-between">
                      <span>
                        {l.sku} — {l.itemName}
                      </span>
                      <span>× {l.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitRequest()}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            </div>
          ) : loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : selected ? (
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <div className="font-semibold">{selected.requestRef}</div>
              <div className="text-sm">
                {selected.fromLocationName} → {selected.toLocationName}
              </div>
              {(selected.lines || []).map((l) => (
                <div key={l.sku} className="text-sm">
                  {l.sku} × {l.quantity}
                </div>
              ))}
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
                placeholder="Review notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void act('approve')}
                  className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void act('reject')}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold"
                >
                  Reject
                </button>
              </div>
              <button type="button" className="text-sm text-blue-600" onClick={() => setSelected(null)}>
                ← Back
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.length === 0 ? (
                <p className="text-sm text-slate-500">No pending approvals.</p>
              ) : (
                requests.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="w-full text-left bg-white border rounded-xl p-4"
                  >
                    <div className="font-medium">{r.requestRef}</div>
                    <div className="text-sm text-slate-600">
                      {r.fromLocationName} → {r.toLocationName}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  window.StockTransferRequestField = StockTransferRequestField;
})();
