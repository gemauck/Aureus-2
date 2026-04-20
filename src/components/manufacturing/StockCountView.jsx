/**
 * Stock count: in-app stocktake (same flow as Job Cards), Excel import/export,
 * and pending submission review/apply.
 * Loaded via lazy-load-components → window.StockCountView
 */
(function () {
  const React = window.React;
  if (!React) return;

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  const STOCK_TAKE_DRAFT_KEY = 'erpStockCountView_stockTakeDraft_v1';
  const STOCK_TAKE_PAGE_SIZE = 50;

  /** Maps to api/manufacturing/inventory/:id/qr?size= */
  const QR_LABEL_PRESETS = {
    small: { apiSize: 'sm', label: 'Small — 4 per row', cols: 4, qrDisplayPx: 72 },
    medium: { apiSize: 'md', label: 'Medium — 3 per row', cols: 3, qrDisplayPx: 96 },
    large: { apiSize: 'lg', label: 'Large — 2 per row', cols: 2, qrDisplayPx: 128 },
    xlarge: { apiSize: 'xl', label: 'Extra large — full width', cols: 1, qrDisplayPx: 200 }
  };

  const QR_SHEET_MAX = 400;

  function inventoryPayloadForQr(inventoryItemId) {
    if (typeof window.encodeInventoryQrPayload === 'function') {
      return window.encodeInventoryQrPayload(inventoryItemId);
    }
    const id = String(inventoryItemId || '').trim();
    return id ? 'ABCO:INV:' + id : '';
  }

  async function fetchQrBlobUrl(apiBase, authHeaders, inventoryItemId, apiSize) {
    const url =
      apiBase +
      '/api/manufacturing/inventory/' +
      encodeURIComponent(inventoryItemId) +
      '/qr?size=' +
      encodeURIComponent(apiSize);
    const res = await fetch(url, { method: 'GET', headers: authHeaders });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || res.statusText || 'QR request failed');
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  function toDatetimeLocalValue(ts) {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  function fromDatetimeLocalToIso(localStr) {
    if (!localStr || typeof localStr !== 'string') return null;
    const d = new Date(localStr);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function buildStockTakeLines(rows, counts, newItems) {
    const existingLines = (rows || [])
      .map((row) => {
        const sku = String(row?.sku || '').trim();
        const raw = counts[sku];
        if (raw === undefined || raw === null || raw === '') return null;
        const countedQty = Number(raw);
        if (!Number.isFinite(countedQty)) return null;
        return {
          locationInventoryId: row?.locationInventoryId || null,
          inventoryItemId: row?.inventoryItemId || null,
          sku,
          itemName: row?.name || row?.itemName || sku,
          systemQty: Number(row?.quantity) || 0,
          countedQty
        };
      })
      .filter(Boolean);
    const newItemLines = (newItems || [])
      .map((item) => {
        const countedQty = Number(item?.countedQty);
        if (!item?.itemName || !Number.isFinite(countedQty)) return null;
        const parsedUnitCost = Number(item?.unitCost);
        const parsedReorderPoint = Number(item?.reorderPoint);
        return {
          locationInventoryId: null,
          inventoryItemId: null,
          sku: item?.sku ? String(item.sku).trim() : '',
          itemName: String(item.itemName).trim(),
          unit: String(item?.unit || 'pcs').trim() || 'pcs',
          systemQty: 0,
          countedQty,
          isNewItem: true,
          proposedItemDetails: {
            category: String(item?.category || 'components').trim() || 'components',
            type: String(item?.type || 'raw_material').trim() || 'raw_material',
            unitCost: Number.isFinite(parsedUnitCost) ? parsedUnitCost : 0,
            reorderPoint: Number.isFinite(parsedReorderPoint) ? parsedReorderPoint : 0,
            supplier: String(item?.supplier || '').trim(),
            supplierPartNumber: String(item?.supplierPartNumber || '').trim(),
            manufacturingPartNumber: String(item?.manufacturingPartNumber || '').trim(),
            boxNumber: String(item?.boxNumber || '').trim(),
            notes: String(item?.notes || '').trim()
          }
        };
      })
      .filter(Boolean);
    return existingLines.concat(newItemLines);
  }

  function StockCountView({ isDark = false, onApplied }) {
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [lastResult, setLastResult] = React.useState(null);
    const [dryRun, setDryRun] = React.useState(true);
    const [forceDup, setForceDup] = React.useState(false);
    const [submissions, setSubmissions] = React.useState([]);
    const [submissionsLoading, setSubmissionsLoading] = React.useState(false);
    const [submissionDetail, setSubmissionDetail] = React.useState(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [applyingSubmissionId, setApplyingSubmissionId] = React.useState('');
    const fileInputRef = React.useRef(null);

    const defaultDraftNewItem = () => ({
      itemName: '',
      sku: '',
      unit: 'pcs',
      category: 'components',
      type: 'raw_material',
      unitCost: '',
      reorderPoint: '',
      supplier: '',
      supplierPartNumber: '',
      manufacturingPartNumber: '',
      boxNumber: '',
      countedQty: '',
      notes: ''
    });

    const [stLocations, setStLocations] = React.useState([]);
    const [stLocationsLoading, setStLocationsLoading] = React.useState(false);
    const [stLocationId, setStLocationId] = React.useState('');
    const [stRows, setStRows] = React.useState([]);
    const [stRowsLoading, setStRowsLoading] = React.useState(false);
    const [stPage, setStPage] = React.useState(1);
    const [stCounts, setStCounts] = React.useState({});
    const [stNotes, setStNotes] = React.useState('');
    const [stStartedLocal, setStStartedLocal] = React.useState('');
    const [stNewItems, setStNewItems] = React.useState([]);
    const [stDraftNewItem, setStDraftNewItem] = React.useState(() => defaultDraftNewItem());
    const [stSubmitting, setStSubmitting] = React.useState(false);
    const [stDraftNotice, setStDraftNotice] = React.useState('');

    const [qrLocationId, setQrLocationId] = React.useState('');
    const [qrOnlyInStock, setQrOnlyInStock] = React.useState(true);
    const [qrSizePreset, setQrSizePreset] = React.useState('medium');
    const [qrSheetItems, setQrSheetItems] = React.useState([]);
    const [qrSheetLoading, setQrSheetLoading] = React.useState(false);
    const [qrSheetNote, setQrSheetNote] = React.useState('');
    const qrBlobUrlsRef = React.useRef(new Set());

    const card = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
    const text = isDark ? 'text-gray-100' : 'text-gray-900';
    const muted = isDark ? 'text-gray-400' : 'text-gray-500';
    const btn = isDark
      ? 'px-4 py-2 text-sm rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800'
      : 'px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50';
    const btnPrimary = 'px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';

    const authHeaders = () => {
      const token = window.storage?.getToken?.();
      const h = { 'Content-Type': 'application/json' };
      if (token) h.Authorization = 'Bearer ' + token;
      return h;
    };

    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
    const parseLineMeta = (line) => {
      try {
        return line?.meta ? JSON.parse(line.meta) : {};
      } catch {
        return {};
      }
    };

    const loadSubmissions = React.useCallback(async () => {
      setSubmissionsLoading(true);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions?status=pending_review', {
          method: 'GET',
          headers: authHeaders()
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        const data = await res.json();
        const rows = data?.data?.submissions || data?.submissions || [];
        setSubmissions(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setError(e.message || 'Failed to load pending stock-take submissions');
      } finally {
        setSubmissionsLoading(false);
      }
    }, [apiBase]);

    React.useEffect(() => {
      void loadSubmissions();
    }, [loadSubmissions]);

    const loadStockLocations = React.useCallback(async () => {
      setStLocationsLoading(true);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/locations', {
          method: 'GET',
          headers: authHeaders()
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        const data = await res.json();
        const locs = data?.data?.locations || data?.locations || [];
        setStLocations(Array.isArray(locs) ? locs : []);
      } catch (e) {
        setError(e.message || 'Failed to load stock locations');
      } finally {
        setStLocationsLoading(false);
      }
    }, [apiBase]);

    React.useEffect(() => {
      void loadStockLocations();
    }, [loadStockLocations]);

    React.useEffect(() => {
      if (!stLocationId) {
        setStRows([]);
        return;
      }
      let cancelled = false;
      setStRowsLoading(true);
      fetch(
        apiBase + '/api/manufacturing/inventory?locationId=' + encodeURIComponent(stLocationId),
        { method: 'GET', headers: authHeaders() }
      )
        .then(async (res) => {
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || res.statusText);
          }
          return res.json();
        })
        .then((data) => {
          const inv = data?.data?.inventory || data?.inventory || [];
          if (!cancelled) setStRows(Array.isArray(inv) ? inv : []);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message || 'Failed to load inventory for this location');
        })
        .finally(() => {
          if (!cancelled) setStRowsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [stLocationId, apiBase]);

    const revokeAllQrBlobs = () => {
      qrBlobUrlsRef.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      });
      qrBlobUrlsRef.current.clear();
    };

    React.useEffect(() => {
      return () => {
        revokeAllQrBlobs();
      };
    }, []);

    const buildQrLabelSheet = async () => {
      if (!qrLocationId) {
        setError('Select a stock location for QR labels.');
        return;
      }
      const preset = QR_LABEL_PRESETS[qrSizePreset] || QR_LABEL_PRESETS.medium;
      setQrSheetLoading(true);
      setError(null);
      setQrSheetNote('');
      revokeAllQrBlobs();
      setQrSheetItems([]);
      try {
        const res = await fetch(
          apiBase + '/api/manufacturing/inventory?locationId=' + encodeURIComponent(qrLocationId),
          { method: 'GET', headers: authHeaders() }
        );
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        const data = await res.json();
        const inv = data?.data?.inventory || data?.inventory || [];
        const rows = Array.isArray(inv) ? inv : [];
        const seen = new Set();
        const candidates = [];
        for (const row of rows) {
          const iid = row?.inventoryItemId ? String(row.inventoryItemId).trim() : '';
          if (!iid || seen.has(iid)) continue;
          const qty = Number(row?.quantity) || 0;
          if (qrOnlyInStock && qty <= 0) continue;
          seen.add(iid);
          candidates.push({
            inventoryItemId: iid,
            sku: String(row?.sku || '').trim() || '—',
            name: String(row?.name || row?.itemName || row?.sku || '').trim() || '—',
            quantity: qty
          });
        }
        if (!candidates.length) {
          setQrSheetNote(
            qrOnlyInStock
              ? 'No in-stock lines with a catalog link at this location. Try “Include zero qty” or add stock first.'
              : 'No printable lines found for this location.'
          );
          return;
        }
        const slice = candidates.slice(0, QR_SHEET_MAX);
        if (candidates.length > QR_SHEET_MAX) {
          setQrSheetNote('Showing first ' + QR_SHEET_MAX + ' of ' + candidates.length + ' labels.');
        }
        const concurrency = 8;
        const out = new Array(slice.length);
        let idx = 0;
        async function worker() {
          while (idx < slice.length) {
            const my = idx++;
            const c = slice[my];
            const blobUrl = await fetchQrBlobUrl(apiBase, authHeaders(), c.inventoryItemId, preset.apiSize);
            qrBlobUrlsRef.current.add(blobUrl);
            out[my] = {
              ...c,
              blobUrl,
              payload: inventoryPayloadForQr(c.inventoryItemId)
            };
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, () => worker()));
        setQrSheetItems(out);
      } catch (e) {
        revokeAllQrBlobs();
        setQrSheetItems([]);
        setError(e.message || 'Failed to build QR label sheet');
      } finally {
        setQrSheetLoading(false);
      }
    };

    const persistStockTakeDraft = () => {
      try {
        const payload = {
          locationId: stLocationId,
          notes: stNotes,
          startedLocal: stStartedLocal,
          counts: stCounts,
          newItems: stNewItems,
          draftNewItem: stDraftNewItem,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(STOCK_TAKE_DRAFT_KEY, JSON.stringify(payload));
        setStDraftNotice('Draft saved on this device (' + new Date().toLocaleString() + ').');
        setMessage(null);
      } catch (e) {
        setError(e.message || 'Could not save draft');
      }
    };

    const restoreStockTakeDraft = () => {
      try {
        const raw = localStorage.getItem(STOCK_TAKE_DRAFT_KEY);
        if (!raw) {
          setStDraftNotice('No saved draft found.');
          return;
        }
        const d = JSON.parse(raw);
        if (d.locationId) setStLocationId(String(d.locationId));
        if (typeof d.notes === 'string') setStNotes(d.notes);
        if (typeof d.startedLocal === 'string') setStStartedLocal(d.startedLocal);
        if (d.counts && typeof d.counts === 'object') setStCounts(d.counts);
        if (Array.isArray(d.newItems)) setStNewItems(d.newItems);
        if (d.draftNewItem && typeof d.draftNewItem === 'object') {
          setStDraftNewItem({ ...defaultDraftNewItem(), ...d.draftNewItem });
        }
        setStDraftNotice(
          d.savedAt ? 'Restored draft from ' + new Date(d.savedAt).toLocaleString() + '.' : 'Draft restored.'
        );
        setError(null);
      } catch (e) {
        setError(e.message || 'Could not restore draft');
      }
    };

    const clearStockTakeDraft = () => {
      try {
        localStorage.removeItem(STOCK_TAKE_DRAFT_KEY);
        setStDraftNotice('Draft cleared.');
      } catch {
        /* ignore */
      }
    };

    const resetInlineStockTake = () => {
      setStLocationId('');
      setStRows([]);
      setStPage(1);
      setStCounts({});
      setStNotes('');
      setStStartedLocal('');
      setStNewItems([]);
      setStDraftNewItem(defaultDraftNewItem());
      setStDraftNotice('');
    };

    const submitInlineStockTake = async () => {
      if (!stLocationId) {
        setError('Select a stock location first.');
        return;
      }
      const lines = buildStockTakeLines(stRows, stCounts, stNewItems);
      if (!lines.length) {
        setError('Enter at least one counted quantity or add a new item before submitting.');
        return;
      }
      const startedIso = fromDatetimeLocalToIso(stStartedLocal) || new Date().toISOString();
      setStSubmitting(true);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            locationId: stLocationId,
            notes: stNotes,
            startedAt: startedIso,
            finishedAt: new Date().toISOString(),
            lines
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            payload?.error?.message || payload?.message || payload?.error || 'Failed to submit stock take.';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        const sub = payload?.data?.submission || payload?.submission;
        const ref = sub?.submissionRef || sub?.id || '';
        setMessage(
          ref
            ? 'Stock take submitted for review (ref: ' + ref + ').'
            : 'Stock take submitted for review.'
        );
        clearStockTakeDraft();
        resetInlineStockTake();
        await loadSubmissions();
      } catch (e) {
        setError(e.message || 'Failed to submit stock take.');
      } finally {
        setStSubmitting(false);
      }
    };

    const stLocationOptions = React.useMemo(
      () =>
        stLocations.filter((loc) => loc.status !== 'inactive' && loc.status !== 'suspended'),
      [stLocations]
    );

    const qrPreset = QR_LABEL_PRESETS[qrSizePreset] || QR_LABEL_PRESETS.medium;
    const qrLocationLabel = React.useMemo(() => {
      const loc = stLocationOptions.find((l) => l.id === qrLocationId);
      return loc ? String(loc.name || loc.code || '') + (loc.code ? ' (' + loc.code + ')' : '') : '';
    }, [stLocationOptions, qrLocationId]);

    const stLineCount = stRows?.length ?? 0;
    const stTotalPages = Math.max(1, Math.ceil(stLineCount / STOCK_TAKE_PAGE_SIZE));
    const stPagedRows = React.useMemo(() => {
      const start = (stPage - 1) * STOCK_TAKE_PAGE_SIZE;
      return (stRows || []).slice(start, start + STOCK_TAKE_PAGE_SIZE);
    }, [stRows, stPage]);

    React.useEffect(() => {
      setStPage((p) => {
        const total = Math.max(1, Math.ceil((stRows?.length || 0) / STOCK_TAKE_PAGE_SIZE));
        if (p > total) return total;
        if (p < 1) return 1;
        return p;
      });
    }, [stRows?.length]);

    const handleDownload = async () => {
      setError(null);
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-count/export', {
          method: 'GET',
          headers: authHeaders()
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition');
        let name = 'stock-count-template.xlsx';
        if (cd) {
          const m = /filename="([^"]+)"/.exec(cd);
          if (m) name = m[1];
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        setMessage('Download started.');
      } catch (e) {
        setError(e.message || 'Export failed');
      } finally {
        setBusy(false);
      }
    };

    const runImport = async (file, opts) => {
      setError(null);
      setMessage(null);
      setLastResult(null);
      setBusy(true);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await fetch(apiBase + '/api/manufacturing/stock-count/import', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            file: { name: file.name, dataUrl },
            dryRun: opts.dryRun,
            forceCreateDuplicate: opts.forceDup
          })
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(text || res.statusText);
        }
        if (!res.ok) {
          const msg =
            data?.error?.message || data?.message || data?.error || text || 'Import failed';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        const payload = data?.data ?? data;
        setLastResult(payload);
        if (opts.dryRun) {
          let msg =
            'Dry run complete. Movements that would be created: ' + (payload.movementsWouldCreate ?? 0) + '.';
          if (payload.duplicateCandidates?.length) {
            msg +=
              ' Note: ' +
              payload.duplicateCandidates.length +
              ' possible name duplicate(s) — review preview; use “Allow duplicate names” only if intended.';
          }
          setMessage(msg);
        } else {
          setMessage('Import applied. Movements created: ' + (payload.movementsCreated ?? 0) + '.');
          if (typeof onApplied === 'function') onApplied();
        }
      } catch (e) {
        setError(e.message || 'Import failed');
      } finally {
        setBusy(false);
      }
    };

    const onFileChange = (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      void runImport(f, { dryRun, forceDup });
    };

    const openSubmissionDetail = async (submissionId) => {
      if (!submissionId) return;
      setDetailLoading(true);
      setSubmissionDetail(null);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions/' + encodeURIComponent(submissionId), {
          method: 'GET',
          headers: authHeaders()
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        const data = await res.json();
        setSubmissionDetail(data?.data?.submission || data?.submission || null);
      } catch (e) {
        setError(e.message || 'Failed to load submission detail');
      } finally {
        setDetailLoading(false);
      }
    };

    const applySubmission = async (submissionId) => {
      if (!submissionId) return;
      if (!window.confirm('Apply this stock-take submission to inventory now?')) return;
      setApplyingSubmissionId(submissionId);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions/' + encodeURIComponent(submissionId) + '/apply', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({})
        });
        const txt = await res.text();
        let data = {};
        try { data = JSON.parse(txt); } catch {}
        if (!res.ok) {
          const msg = data?.error?.message || data?.message || data?.error || txt || res.statusText;
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        const payload = data?.data || {};
        setMessage(
          'Submission applied. Movements created: ' + (payload.movementsCreated ?? 0) + ', skipped: ' + (payload.skipped ?? 0) + '.'
        );
        if (submissionDetail?.id === submissionId) {
          setSubmissionDetail((prev) => prev ? { ...prev, status: 'applied' } : prev);
        }
        await loadSubmissions();
        if (typeof onApplied === 'function') onApplied();
      } catch (e) {
        setError(e.message || 'Failed to apply submission');
      } finally {
        setApplyingSubmissionId('');
      }
    };

    const stCountedExisting = (stRows || []).filter((row) => {
      const sku = String(row?.sku || '').trim();
      return sku && stCounts[sku] !== undefined && stCounts[sku] !== '';
    }).length;
    const stCountedTotal = stCountedExisting + stNewItems.length;
    const inputCls =
      'w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ' +
      (isDark ? 'border-gray-600 bg-gray-950 ' + text : 'border-gray-300 bg-white text-gray-900');

    return React.createElement(
      'div',
      { className: 'space-y-4 erp-module-root' },
      React.createElement(
        'div',
        { className: 'rounded-xl border p-5 shadow-sm ' + card },
        React.createElement('h3', { className: 'text-lg font-semibold ' + text }, 'In-app stocktake'),
        React.createElement(
          'p',
          { className: 'mt-1 text-sm ' + muted },
          'Match the Job Cards app: pick a location, set when the count started, enter quantities, save progress on this device, then submit for review (same API as the mobile stock-take).'
        ),
        React.createElement(
          'div',
          { className: 'mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3' },
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { htmlFor: 'erp-st-commenced', className: 'block text-xs font-semibold ' + muted + ' mb-1' },
              'Commenced at'
            ),
            React.createElement('input', {
              id: 'erp-st-commenced',
              type: 'datetime-local',
              className: inputCls,
              value: stStartedLocal,
              onChange: (e) => setStStartedLocal(e.target.value)
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'mt-2 text-xs font-semibold ' + (isDark ? 'text-blue-300 hover:text-blue-200' : 'text-blue-700 hover:text-blue-800'),
                onClick: () => setStStartedLocal(toDatetimeLocalValue(Date.now()))
              },
              'Set to now'
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { htmlFor: 'erp-st-location', className: 'block text-xs font-semibold ' + muted + ' mb-1' },
              'Stock location'
            ),
            React.createElement(
              'select',
              {
                id: 'erp-st-location',
                className: inputCls,
                value: stLocationId,
                disabled: stLocationsLoading,
                onChange: (e) => {
                  const v = e.target.value;
                  setStLocationId(v);
                  setStPage(1);
                  setStCounts({});
                  setStStartedLocal((prev) => prev || toDatetimeLocalValue(Date.now()));
                }
              },
              React.createElement('option', { value: '' }, stLocationsLoading ? 'Loading locations…' : 'Select location'),
              stLocationOptions.map((loc) =>
                React.createElement(
                  'option',
                  { key: loc.id, value: loc.id },
                  (loc.name || loc.code) + ' (' + (loc.code || '') + ')'
                )
              )
            )
          )
        ),
        React.createElement(
          'label',
          { htmlFor: 'erp-st-notes', className: 'block text-xs font-semibold ' + muted + ' mt-3 mb-1' },
          'Notes (optional)'
        ),
        React.createElement('textarea', {
          id: 'erp-st-notes',
          rows: 2,
          className: inputCls,
          value: stNotes,
          onChange: (e) => setStNotes(e.target.value),
          placeholder: 'Anything reviewers should know about this count…'
        }),
        stLocationId
          ? React.createElement(
              'div',
              { className: 'mt-4 rounded-lg border overflow-hidden ' + (isDark ? 'border-gray-700' : 'border-gray-200') },
              React.createElement(
                'div',
                {
                  className:
                    'px-3 py-2 border-b flex items-center justify-between ' +
                    (isDark ? 'border-gray-700 bg-gray-950/50' : 'border-gray-100 bg-gray-50')
                },
                React.createElement('p', { className: 'text-sm font-semibold ' + text }, 'Stock lines'),
                React.createElement(
                  'p',
                  { className: 'text-xs ' + muted },
                  stRowsLoading
                    ? 'Loading…'
                    : stCountedTotal +
                        ' counted · ' +
                        stRows.length +
                        ' lines' +
                        (stTotalPages > 1 ? ' · page ' + stPage + ' of ' + stTotalPages : '')
                )
              ),
              stRowsLoading
                ? React.createElement('div', { className: 'px-3 py-6 text-sm ' + muted }, 'Loading inventory…')
                : stRows.length === 0
                  ? React.createElement(
                      'div',
                      { className: 'px-3 py-6 text-sm ' + muted },
                      'No stock lines for this location.'
                    )
                  : React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(
                        'div',
                        { className: 'divide-y ' + (isDark ? 'divide-gray-800' : 'divide-gray-100') },
                        stPagedRows.map((row) => {
                          const sku = String(row?.sku || '').trim();
                          const sys = Number(row?.quantity) || 0;
                          return React.createElement(
                            'div',
                            {
                              key: stLocationId + '-' + sku,
                              className: 'px-3 py-2 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center'
                            },
                            React.createElement(
                              'div',
                              { className: 'sm:col-span-7 min-w-0' },
                              React.createElement('p', { className: 'text-sm font-medium truncate ' + text }, row?.name || sku),
                              React.createElement(
                                'p',
                                { className: 'text-xs ' + muted },
                                sku + ' · System: ' + sys
                              )
                            ),
                            React.createElement(
                              'div',
                              { className: 'sm:col-span-5' },
                              React.createElement('input', {
                                type: 'number',
                                step: '0.01',
                                inputMode: 'decimal',
                                className: inputCls,
                                placeholder: 'Counted qty',
                                value: stCounts[sku] ?? '',
                                onChange: (e) => {
                                  const next = e.target.value;
                                  setStCounts((prev) => ({ ...prev, [sku]: next }));
                                }
                              })
                            )
                          );
                        })
                      ),
                      stTotalPages > 1
                        ? React.createElement(
                            'div',
                            {
                              className:
                                'px-3 py-2 border-t flex flex-wrap items-center justify-between gap-2 ' +
                                (isDark ? 'border-gray-800 bg-gray-950/50' : 'border-gray-100 bg-gray-50/80')
                            },
                            React.createElement(
                              'p',
                              { className: 'text-[11px] ' + muted },
                              'Showing ' +
                                ((stPage - 1) * STOCK_TAKE_PAGE_SIZE + 1) +
                                '–' +
                                Math.min(stPage * STOCK_TAKE_PAGE_SIZE, stLineCount) +
                                ' of ' +
                                stLineCount
                            ),
                            React.createElement(
                              'div',
                              { className: 'flex items-center gap-2' },
                              React.createElement(
                                'button',
                                {
                                  type: 'button',
                                  className:
                                    'rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ' +
                                    (isDark
                                      ? 'border-gray-600 bg-gray-900 text-gray-100 hover:bg-gray-800'
                                      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'),
                                  disabled: stPage <= 1,
                                  onClick: () => setStPage((p) => Math.max(1, p - 1))
                                },
                                'Previous'
                              ),
                              React.createElement(
                                'button',
                                {
                                  type: 'button',
                                  className:
                                    'rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ' +
                                    (isDark
                                      ? 'border-gray-600 bg-gray-900 text-gray-100 hover:bg-gray-800'
                                      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'),
                                  disabled: stPage >= stTotalPages,
                                  onClick: () => setStPage((p) => Math.min(stTotalPages, p + 1))
                                },
                                'Next'
                              )
                            )
                          )
                        : null
                    )
            )
          : null,
        React.createElement(
          'div',
          { className: 'mt-4 rounded-lg border p-3 space-y-2 ' + (isDark ? 'border-amber-900/50 bg-amber-950/20' : 'border-amber-200 bg-amber-50/80') },
          React.createElement(
            'div',
            { className: 'flex items-center justify-between' },
            React.createElement('p', { className: 'text-sm font-semibold ' + text }, 'New items (need admin confirmation on apply)'),
            React.createElement('span', { className: 'text-xs ' + muted }, stNewItems.length + ' added')
          ),
          React.createElement(
            'div',
            { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2' },
            ['itemName', 'sku', 'unit', 'countedQty', 'category', 'type', 'unitCost', 'reorderPoint', 'supplier', 'supplierPartNumber', 'manufacturingPartNumber', 'boxNumber'].map(
              (field) => {
                const labels = {
                  itemName: 'Item name *',
                  sku: 'SKU (optional)',
                  unit: 'Unit',
                  countedQty: 'Counted qty *',
                  category: 'Category',
                  type: 'Type',
                  unitCost: 'Unit cost',
                  reorderPoint: 'Reorder point',
                  supplier: 'Supplier',
                  supplierPartNumber: 'Supplier part #',
                  manufacturingPartNumber: 'Mfg part #',
                  boxNumber: 'Box #'
                };
                const ph = labels[field] || field;
                const isNum = field === 'countedQty' || field === 'unitCost' || field === 'reorderPoint';
                return React.createElement('input', {
                  key: field,
                  type: isNum ? 'number' : 'text',
                  step: isNum ? '0.01' : undefined,
                  inputMode: isNum ? 'decimal' : undefined,
                  className: inputCls,
                  placeholder: ph,
                  value: stDraftNewItem[field] ?? '',
                  onChange: (e) =>
                    setStDraftNewItem((prev) => ({
                      ...prev,
                      [field]: e.target.value
                    }))
                });
              }
            )
          ),
          React.createElement('textarea', {
            rows: 2,
            className: inputCls,
            placeholder: 'Notes for admin confirmation',
            value: stDraftNewItem.notes,
            onChange: (e) => setStDraftNewItem((prev) => ({ ...prev, notes: e.target.value }))
          }),
          React.createElement(
            'div',
            { className: 'flex justify-end' },
            React.createElement(
              'button',
              {
                type: 'button',
                className: btnPrimary,
                onClick: () => {
                  const itemName = String(stDraftNewItem.itemName || '').trim();
                  const countedQty = Number(stDraftNewItem.countedQty);
                  if (!itemName || !Number.isFinite(countedQty)) {
                    setError('New item needs item name and counted qty.');
                    return;
                  }
                  setError(null);
                  setStNewItems((prev) => [...prev, { ...stDraftNewItem, itemName, countedQty }]);
                  setStDraftNewItem(defaultDraftNewItem());
                }
              },
              'Add new item'
            )
          ),
          stNewItems.length > 0
            ? React.createElement(
                'ul',
                { className: 'space-y-2' },
                stNewItems.map((item, idx) =>
                  React.createElement(
                    'li',
                    {
                      key: 'stk-new-' + idx,
                      className:
                        'rounded border px-2 py-1.5 flex justify-between gap-2 text-sm ' +
                        (isDark ? 'border-amber-800 bg-amber-950/40' : 'border-amber-300 bg-white')
                    },
                    React.createElement(
                      'div',
                      { className: 'min-w-0' },
                      React.createElement('p', { className: 'font-semibold truncate ' + text }, item.itemName),
                      React.createElement(
                        'p',
                        { className: 'text-xs ' + muted },
                        'Qty ' +
                          Number(item.countedQty) +
                          ' · ' +
                          (item.unit || 'pcs') +
                          ' · SKU ' +
                          (item.sku || 'auto')
                      )
                    ),
                    React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'text-xs font-semibold underline shrink-0 ' + muted,
                        onClick: () => setStNewItems((prev) => prev.filter((_, i) => i !== idx))
                      },
                      'Remove'
                    )
                  )
                )
              )
            : null
        ),
        stDraftNotice
          ? React.createElement(
              'div',
              {
                className:
                  'mt-3 rounded-lg border text-sm px-3 py-2 ' +
                  (isDark ? 'border-amber-800 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900')
              },
              stDraftNotice
            )
          : null,
        React.createElement(
          'div',
          { className: 'mt-4 flex flex-wrap gap-2' },
          React.createElement(
            'button',
            { type: 'button', className: btn, onClick: persistStockTakeDraft },
            React.createElement('i', { className: 'fas fa-save mr-2' }),
            'Save draft'
          ),
          React.createElement(
            'button',
            { type: 'button', className: btn, onClick: restoreStockTakeDraft },
            'Restore draft'
          ),
          React.createElement(
            'button',
            { type: 'button', className: btn, onClick: clearStockTakeDraft },
            'Clear draft'
          )
        ),
        React.createElement(
          'div',
          { className: 'mt-3 flex flex-wrap gap-2' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: btnPrimary,
              disabled: stSubmitting || !stLocationId,
              onClick: submitInlineStockTake
            },
            stSubmitting ? 'Submitting…' : 'Submit for review'
          ),
          React.createElement(
            'button',
            { type: 'button', className: btn, disabled: stSubmitting, onClick: resetInlineStockTake },
            'Reset form'
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'rounded-xl border p-5 shadow-sm ' + card },
        React.createElement('h3', { className: 'text-lg font-semibold ' + text }, 'Inventory QR labels'),
        React.createElement(
          'p',
          { className: 'mt-1 text-sm ' + muted },
          'Each stock line is tied to a catalog item. The QR encodes that item id (ABCO:INV:…) for Job Cards stock-take scanning. Build a sheet for this location, choose a label size, then print — only the label grid is sent to the printer.'
        ),
        React.createElement('style', {
          dangerouslySetInnerHTML: {
            __html:
              '@media print { @page { size: A4; margin: 10mm; } body * { visibility: hidden !important; } #erp-stock-qr-print-root, #erp-stock-qr-print-root * { visibility: visible !important; } #erp-stock-qr-print-root { position: absolute; left: 0; top: 0; width: 100%; box-sizing: border-box; padding: 0; background: #fff !important; } }'
          }
        }),
        React.createElement(
          'div',
          { className: 'mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3' },
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { htmlFor: 'erp-qr-loc', className: 'block text-xs font-semibold ' + muted + ' mb-1' },
              'Location for labels'
            ),
            React.createElement(
              'select',
              {
                id: 'erp-qr-loc',
                className: inputCls,
                value: qrLocationId,
                disabled: stLocationsLoading,
                onChange: (e) => setQrLocationId(e.target.value)
              },
              React.createElement('option', { value: '' }, stLocationsLoading ? 'Loading locations…' : 'Select location'),
              stLocationOptions.map((loc) =>
                React.createElement(
                  'option',
                  { key: 'qr-' + loc.id, value: loc.id },
                  (loc.name || loc.code) + ' (' + (loc.code || '') + ')'
                )
              )
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { htmlFor: 'erp-qr-size', className: 'block text-xs font-semibold ' + muted + ' mb-1' },
              'Label size on paper'
            ),
            React.createElement(
              'select',
              {
                id: 'erp-qr-size',
                className: inputCls,
                value: qrSizePreset,
                onChange: (e) => setQrSizePreset(e.target.value)
              },
              Object.keys(QR_LABEL_PRESETS).map((k) =>
                React.createElement(
                  'option',
                  { key: k, value: k },
                  QR_LABEL_PRESETS[k].label
                )
              )
            )
          )
        ),
        React.createElement(
          'label',
          { className: 'mt-3 flex items-center gap-2 cursor-pointer text-sm ' + muted },
          React.createElement('input', {
            type: 'checkbox',
            checked: qrOnlyInStock,
            onChange: (e) => setQrOnlyInStock(e.target.checked)
          }),
          'Only lines with quantity on hand (uncheck to include zero qty)'
        ),
        React.createElement(
          'div',
          { className: 'mt-4 flex flex-wrap gap-2' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: btnPrimary,
              disabled: qrSheetLoading || !qrLocationId,
              onClick: () => void buildQrLabelSheet()
            },
            qrSheetLoading
              ? 'Preparing labels…'
              : React.createElement(React.Fragment, null, React.createElement('i', { className: 'fas fa-qrcode mr-2' }), 'Build label sheet')
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: btn,
              disabled: !qrSheetItems.length,
              onClick: () => {
                if (qrSheetItems.length) window.print();
              }
            },
            React.createElement('i', { className: 'fas fa-print mr-2' }),
            'Print labels'
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: btn,
              disabled: qrSheetLoading,
              onClick: () => {
                revokeAllQrBlobs();
                setQrSheetItems([]);
                setQrSheetNote('');
              }
            },
            'Clear sheet'
          )
        ),
        qrSheetNote
          ? React.createElement(
              'p',
              { className: 'mt-3 text-xs ' + (isDark ? 'text-amber-200' : 'text-amber-800') },
              qrSheetNote
            )
          : null,
        !qrSheetLoading && qrLocationId && !qrSheetItems.length && !qrSheetNote
          ? React.createElement(
              'p',
              { className: 'mt-3 text-xs ' + muted },
              'Choose options and click “Build label sheet” to load QR images for every catalog line at this location.'
            )
          : null,
        qrSheetItems.length
          ? React.createElement(
              'div',
              {
                id: 'erp-stock-qr-print-root',
                className:
                  'mt-5 rounded-xl border p-4 ' +
                  (isDark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50/80')
              },
              React.createElement(
                'div',
                { className: 'mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3 ' + (isDark ? 'border-slate-700' : 'border-slate-200') },
                React.createElement('p', { className: 'text-sm font-semibold ' + text }, 'Print preview'),
                React.createElement(
                  'p',
                  { className: 'text-xs ' + muted },
                  (qrLocationLabel || 'Location') +
                    ' · ' +
                    qrPreset.label +
                    ' · ' +
                    qrSheetItems.length +
                    ' label' +
                    (qrSheetItems.length === 1 ? '' : 's') +
                    ' · ' +
                    new Date().toLocaleString()
                )
              ),
              React.createElement(
                'div',
                {
                  className: 'grid gap-3',
                  style: {
                    gridTemplateColumns: 'repeat(' + qrPreset.cols + ', minmax(0, 1fr))'
                  }
                },
                qrSheetItems.map((item) =>
                  React.createElement(
                    'div',
                    {
                      key: item.inventoryItemId,
                      className:
                        'flex flex-col items-center justify-start text-center rounded-lg border p-3 break-inside-avoid shadow-sm ' +
                        (isDark ? 'border-slate-600 bg-gray-900' : 'border-slate-200 bg-white'),
                      style: { pageBreakInside: 'avoid' }
                    },
                    React.createElement('img', {
                      src: item.blobUrl,
                      alt: 'QR ' + item.sku,
                      width: qrPreset.qrDisplayPx,
                      height: qrPreset.qrDisplayPx,
                      className: 'shrink-0 object-contain bg-white p-1 rounded border border-slate-200'
                    }),
                    React.createElement(
                      'p',
                      { className: 'mt-2 text-xs font-semibold leading-tight line-clamp-2 ' + text },
                      item.name
                    ),
                    React.createElement(
                      'p',
                      { className: 'mt-0.5 text-[11px] font-mono ' + muted },
                      item.sku
                    ),
                    React.createElement(
                      'p',
                      { className: 'mt-1 text-[10px] ' + muted },
                      'Qty ' + item.quantity
                    )
                  )
                )
              )
            )
          : null
      ),
      React.createElement(
        'div',
        { className: 'rounded-xl border p-5 shadow-sm ' + card },
        React.createElement('h3', { className: 'text-lg font-semibold ' + text }, 'Stock count (Excel)'),
        React.createElement(
          'ul',
          { className: 'mt-2 text-sm list-disc pl-5 space-y-1 ' + muted },
          React.createElement('li', null, 'Download the template — one sheet per location.'),
          React.createElement('li', null, 'Fill ', React.createElement('strong', null, 'CountedQty'), ' only; do not rename columns.'),
          React.createElement(
            'li',
            null,
            'New lines: leave ',
            React.createElement('strong', null, 'SKU'),
            ' blank; set ',
            React.createElement('strong', null, 'ItemName'),
            ' and ',
            React.createElement('strong', null, 'CountedQty'),
            '.'
          ),
          React.createElement('li', null, 'Run dry run first. Apply blocks duplicate names unless you check “Allow duplicate names”.')
        )
      ),
      React.createElement(
        'div',
        { className: 'flex flex-wrap gap-3 items-center' },
        React.createElement(
          'button',
          { type: 'button', disabled: busy, className: btnPrimary, onClick: handleDownload },
          busy ? '…' : React.createElement(React.Fragment, null, React.createElement('i', { className: 'fas fa-download mr-2' }), 'Download template')
        ),
        React.createElement(
          'label',
          { className: 'inline-flex items-center gap-2 cursor-pointer text-sm ' + muted },
          React.createElement('input', { type: 'checkbox', checked: dryRun, onChange: (e) => setDryRun(e.target.checked) }),
          'Dry run only'
        ),
        React.createElement(
          'label',
          { className: 'inline-flex items-center gap-2 cursor-pointer text-sm ' + muted },
          React.createElement('input', {
            type: 'checkbox',
            checked: forceDup,
            onChange: (e) => setForceDup(e.target.checked)
          }),
          'Allow duplicate names (apply)'
        ),
        React.createElement(
          'button',
          { type: 'button', disabled: busy, className: btn, onClick: () => fileInputRef.current?.click() },
          React.createElement('i', { className: 'fas fa-upload mr-2' }),
          dryRun ? 'Upload (dry run)' : 'Upload (apply)'
        ),
        React.createElement('input', {
          ref: fileInputRef,
          type: 'file',
          accept: '.xlsx,.xls',
          className: 'hidden',
          onChange: onFileChange
        })
      ),
      message &&
        React.createElement('div', { className: 'rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-4 py-2' }, message),
      error &&
        React.createElement('div', { className: 'rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-2 whitespace-pre-wrap' }, error),
      lastResult &&
        lastResult.preview &&
        React.createElement(
          'div',
          { className: 'rounded-xl border overflow-hidden ' + card },
          React.createElement(
            'div',
            { className: 'px-4 py-2 border-b ' + (isDark ? 'border-gray-800' : 'border-gray-100') },
            React.createElement('h4', { className: 'text-sm font-semibold ' + text }, 'Preview (first 30 rows)')
          ),
          React.createElement(
            'div',
            { className: 'overflow-x-auto max-h-80' },
            React.createElement(
              'table',
              { className: 'w-full text-xs' },
              React.createElement(
                'thead',
                null,
                React.createElement(
                  'tr',
                  { className: isDark ? 'bg-gray-800' : 'bg-gray-50' },
                  ['Location', 'SKU', 'Name', 'Delta', 'Sheet', 'Row'].map((h) =>
                    React.createElement(
                      'th',
                      { key: h, className: 'text-left px-3 py-2 font-medium ' + muted },
                      h
                    )
                  )
                )
              ),
              React.createElement(
                'tbody',
                null,
                lastResult.preview.slice(0, 30).map((p, i) =>
                  React.createElement(
                    'tr',
                    { key: i, className: isDark ? 'border-t border-gray-800' : 'border-t border-gray-100' },
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.locationId),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.sku || p.proposedSku || '—'),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, (p.itemName || '').slice(0, 40)),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.delta),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.sheet),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.rowNum)
                  )
                )
              )
            )
          )
        ),
      React.createElement(
        'div',
        { className: 'rounded-xl border p-5 shadow-sm ' + card },
        React.createElement('h3', { className: 'text-lg font-semibold ' + text }, 'Pending mobile stock-take submissions'),
        React.createElement(
          'p',
          { className: 'mt-1 text-sm ' + muted },
          'Counts submitted from the Job Cards app or from In-app stocktake above appear here for review before apply.'
        ),
        React.createElement(
          'div',
          { className: 'mt-3 flex items-center gap-2' },
          React.createElement(
            'button',
            { type: 'button', disabled: submissionsLoading, className: btn, onClick: () => void loadSubmissions() },
            submissionsLoading ? 'Refreshing…' : 'Refresh'
          )
        ),
        submissionsLoading && submissions.length === 0
          ? React.createElement('div', { className: 'mt-3 text-sm ' + muted }, 'Loading submissions…')
          : null,
        !submissionsLoading && submissions.length === 0
          ? React.createElement('div', { className: 'mt-3 text-sm ' + muted }, 'No pending submissions.')
          : null,
        submissions.length > 0
          ? React.createElement(
              'div',
              { className: 'mt-3 space-y-2' },
              submissions.map((row) =>
                React.createElement(
                  'div',
                  {
                    key: row.id,
                    className:
                      'rounded-lg border px-3 py-2 ' + (isDark ? 'border-gray-700 bg-gray-950/40' : 'border-gray-200 bg-white')
                  },
                  React.createElement(
                    'div',
                    { className: 'flex flex-wrap items-center justify-between gap-2' },
                    React.createElement(
                      'div',
                      { className: 'min-w-0' },
                      React.createElement('p', { className: 'text-sm font-semibold ' + text }, row.submissionRef || row.id),
                      React.createElement(
                        'p',
                        { className: 'text-xs ' + muted },
                        (row.locationName || 'Unknown location') +
                          ' · ' +
                          (row.lineCount || 0) +
                          ' lines · by ' +
                          (row.submittedBy || 'Unknown')
                      )
                    ),
                    React.createElement(
                      'div',
                      { className: 'flex gap-2' },
                      React.createElement(
                        'button',
                        { type: 'button', className: btn, onClick: () => void openSubmissionDetail(row.id) },
                        'Review'
                      ),
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: btnPrimary,
                          disabled: applyingSubmissionId === row.id,
                          onClick: () => void applySubmission(row.id)
                        },
                        applyingSubmissionId === row.id ? 'Applying…' : 'Apply'
                      )
                    )
                  )
                )
              )
            )
          : null,
        detailLoading
          ? React.createElement('div', { className: 'mt-3 text-xs ' + muted }, 'Loading selected submission detail…')
          : null,
        submissionDetail
          ? React.createElement(
              'div',
              {
                className:
                  'mt-4 rounded-lg border p-3 ' + (isDark ? 'border-gray-700 bg-gray-950/50' : 'border-gray-200 bg-gray-50')
              },
              React.createElement(
                'p',
                { className: 'text-sm font-semibold ' + text },
                'Review: ' + (submissionDetail.submissionRef || submissionDetail.id)
              ),
              React.createElement(
                'p',
                { className: 'text-xs mt-1 ' + muted },
                (submissionDetail.locationName || '') +
                  ' · submitted ' +
                  new Date(submissionDetail.submittedAt || Date.now()).toLocaleString()
              ),
              React.createElement(
                'div',
                { className: 'mt-2 overflow-x-auto max-h-64' },
                React.createElement(
                  'table',
                  { className: 'w-full text-xs' },
                  React.createElement(
                    'thead',
                    null,
                    React.createElement(
                      'tr',
                      { className: isDark ? 'bg-gray-800' : 'bg-gray-100' },
                      ['SKU', 'Name', 'System', 'Counted', 'Delta'].map((h) =>
                        React.createElement('th', { key: h, className: 'text-left px-2 py-1 font-medium ' + muted }, h)
                      )
                    )
                  ),
                  React.createElement(
                    'tbody',
                    null,
                    (submissionDetail.lines || []).slice(0, 100).map((line) =>
                      (() => {
                        const meta = parseLineMeta(line);
                        const isNewItem = meta?.isNewItem === true;
                        const proposed = meta?.proposedItemDetails && typeof meta.proposedItemDetails === 'object'
                          ? meta.proposedItemDetails
                          : {};
                        return React.createElement(
                          'tr',
                          { key: line.id, className: isDark ? 'border-t border-gray-800' : 'border-t border-gray-200' },
                          React.createElement('td', { className: 'px-2 py-1 ' + text }, isNewItem ? (meta?.proposedSku || line.sku || 'AUTO') : line.sku),
                          React.createElement(
                            'td',
                            { className: 'px-2 py-1 ' + text },
                            (line.itemName || '').slice(0, 42),
                            isNewItem
                              ? React.createElement(
                                  'span',
                                  { className: 'ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold ' + (isDark ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-100 text-amber-800') },
                                  'NEW ITEM'
                                )
                              : null,
                            isNewItem && (proposed?.supplier || proposed?.supplierPartNumber || proposed?.manufacturingPartNumber)
                              ? React.createElement(
                                  'div',
                                  { className: 'text-[10px] mt-0.5 ' + muted },
                                  'Supplier: ' + (proposed?.supplier || '—') +
                                  ' · Supplier Part: ' + (proposed?.supplierPartNumber || '—') +
                                  ' · Mfg Part: ' + (proposed?.manufacturingPartNumber || '—')
                                )
                              : null
                          ),
                          React.createElement('td', { className: 'px-2 py-1 ' + text }, Number(line.systemQty || 0).toFixed(2)),
                          React.createElement('td', { className: 'px-2 py-1 ' + text }, Number(line.countedQty || 0).toFixed(2)),
                          React.createElement('td', { className: 'px-2 py-1 ' + text }, Number(line.deltaQty || 0).toFixed(2))
                        );
                      })()
                    )
                  )
                )
              )
            )
          : null
      )
    );
  }

  window.StockCountView = StockCountView;
})();
