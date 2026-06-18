/**
 * Stock transfer request queue — pending approvals, my requests, approve/reject.
 * Loaded via lazy-load-components → window.StockTransferRequestsView
 */
(function () {
  const { useState, useEffect, useCallback, useMemo } = React;

  const STATUS_LABELS = {
    pending_approval: 'Pending approval',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled'
  };

  function statusBadgeClass(status) {
    switch (status) {
      case 'pending_approval':
        return 'bg-amber-100 text-amber-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  function StockTransferRequestsView({ isDark = false, initialRequestId = '' }) {
    const [view, setView] = useState('pending');
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState(initialRequestId || '');
    const [detail, setDetail] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [acting, setActing] = useState(false);

    const loadList = useCallback(async () => {
      if (!window.DatabaseAPI?.getStockTransferRequests) {
        setError('Transfer requests API not available');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const opts =
          view === 'pending'
            ? { pendingMyApproval: true }
            : view === 'mine'
              ? { mine: true }
              : { status: 'pending_approval' };
        const res = await window.DatabaseAPI.getStockTransferRequests(opts);
        setRequests(res?.data?.requests || []);
      } catch (e) {
        setError(e?.message || 'Failed to load transfer requests');
        setRequests([]);
      } finally {
        setLoading(false);
      }
    }, [view]);

    const loadDetail = useCallback(async (id) => {
      if (!id || !window.DatabaseAPI?.getStockTransferRequest) return;
      try {
        const res = await window.DatabaseAPI.getStockTransferRequest(id);
        setDetail(res?.data?.request || res?.request || null);
      } catch (e) {
        setError(e?.message || 'Failed to load request detail');
        setDetail(null);
      }
    }, []);

    useEffect(() => {
      void loadList();
    }, [loadList]);

    useEffect(() => {
      if (initialRequestId) {
        setSelectedId(initialRequestId);
      }
    }, [initialRequestId]);

    useEffect(() => {
      if (selectedId) loadDetail(selectedId);
      else setDetail(null);
    }, [selectedId, loadDetail]);

    const selected = useMemo(() => {
      if (detail?.id === selectedId) return detail;
      return requests.find((r) => r.id === selectedId) || detail;
    }, [detail, requests, selectedId]);

    const handleApprove = async () => {
      if (!selected?.id || acting) return;
      if (!window.confirm('Approve this transfer request and move stock?')) return;
      setActing(true);
      setError('');
      try {
        await window.DatabaseAPI.approveStockTransferRequest(selected.id, reviewNotes);
        setReviewNotes('');
        await loadList();
        await loadDetail(selected.id);
      } catch (e) {
        setError(e?.message || 'Approve failed');
      } finally {
        setActing(false);
      }
    };

    const handleReject = async () => {
      if (!selected?.id || acting) return;
      if (!window.confirm('Reject this transfer request?')) return;
      setActing(true);
      setError('');
      try {
        await window.DatabaseAPI.rejectStockTransferRequest(selected.id, reviewNotes);
        setReviewNotes('');
        await loadList();
        await loadDetail(selected.id);
      } catch (e) {
        setError(e?.message || 'Reject failed');
      } finally {
        setActing(false);
      }
    };

    const cardBg = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Transfer requests</h2>
            <p className="text-sm text-slate-500">
              Approve or reject inter-location stock transfers submitted from the field.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'pending', label: 'Pending my approval' },
              { id: 'mine', label: 'My requests' },
              { id: 'all', label: 'All pending' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setView(tab.id);
                  setSelectedId('');
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  view === tab.id
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadList()}
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`rounded-xl border ${cardBg} overflow-hidden`}>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No transfer requests in this view.</div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {requests.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${
                        selectedId === r.id ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">{r.requestRef}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {r.fromLocationName || r.fromLocationCode} → {r.toLocationName || r.toLocationCode}
                          </div>
                          <div className="text-xs text-slate-500">By {r.requestedBy || 'Unknown'}</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(r.status)}`}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`rounded-xl border ${cardBg} p-4 min-h-[280px]`}>
            {!selected ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Select a request to review
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{selected.requestRef}</div>
                  <h3 className="text-base font-semibold mt-1">
                    {selected.fromLocationName} → {selected.toLocationName}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Requested by {selected.requestedBy} ·{' '}
                    {selected.requestedAt ? new Date(selected.requestedAt).toLocaleString() : ''}
                  </p>
                  {selected.notes ? (
                    <p className="text-sm mt-2 text-slate-700">
                      <span className="font-medium">Notes:</span> {selected.notes}
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Lines</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-2 pr-3">SKU</th>
                          <th className="py-2 pr-3">Item</th>
                          <th className="py-2 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selected.lines || []).map((line) => (
                          <tr key={line.id || line.sku} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-mono text-xs">{line.sku}</td>
                            <td className="py-2 pr-3">{line.itemName}</td>
                            <td className="py-2 text-right">{line.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selected.status === 'pending_approval' ? (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <label className="block text-sm">
                      <span className="font-medium">Review notes (optional)</span>
                      <textarea
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        rows={2}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Reason or handover notes…"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={acting}
                        onClick={handleApprove}
                        className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve & move stock
                      </button>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={handleReject}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600 pt-2 border-t border-slate-200">
                    {selected.reviewedBy ? (
                      <>
                        Reviewed by {selected.reviewedBy}
                        {selected.reviewedAt ? ` · ${new Date(selected.reviewedAt).toLocaleString()}` : ''}
                        {selected.reviewNotes ? ` — ${selected.reviewNotes}` : ''}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  window.StockTransferRequestsView = StockTransferRequestsView;
})();
