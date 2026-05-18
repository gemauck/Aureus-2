/**
 * Manufacturing → Reports tab: stock movements, client allocation, receipts.
 * Loaded via lazy-load-components → window.ManufacturingReportsView
 */
(function () {
  const React = window.React;
  if (!React) return;

  const { useState, useEffect, useCallback, useMemo } = React;

  const REPORT_TABS = [
    { id: 'stock-movements', label: 'Stock Movement Report', icon: 'fa-exchange-alt' },
    { id: 'client-allocation', label: 'Client Allocation Report', icon: 'fa-users' },
    { id: 'receipts', label: 'Receipt of Stock Report', icon: 'fa-truck-loading' }
  ];

  function parseJsonSafe(raw, fallback = []) {
    if (raw == null || raw === '') return fallback;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') return raw;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : fallback;
    } catch {
      return fallback;
    }
  }

  function parseDateValue(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function inDateRange(isoOrDate, startStr, endStr) {
    const d = parseDateValue(isoOrDate);
    if (!d) return true;
    if (startStr) {
      const s = new Date(startStr + 'T00:00:00');
      if (d < s) return false;
    }
    if (endStr) {
      const e = new Date(endStr + 'T23:59:59.999');
      if (d > e) return false;
    }
    return true;
  }

  function flattenValue(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (entry === null || entry === undefined) return '';
          if (typeof entry === 'object') {
            try {
              return JSON.stringify(entry);
            } catch {
              return '[Object]';
            }
          }
          return String(entry);
        })
        .join(' | ');
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }
    return value;
  }

  function collectColumnKeys(rows) {
    const keys = new Set();
    for (const row of rows) {
      Object.keys(row || {}).forEach((k) => keys.add(k));
    }
    return Array.from(keys).sort((a, b) => {
      const pri = ['sourceType', 'recordSource', 'date', 'movement_date', 'order_orderNumber', 'jobCard_jobCardNumber'];
      const ai = pri.indexOf(a);
      const bi = pri.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b);
    });
  }

  async function waitForXlsx() {
    let XLSXLib = window.XLSX;
    if (!XLSXLib || !XLSXLib.utils) {
      for (let i = 0; i < 30 && (!XLSXLib || !XLSXLib.utils); i++) {
        await new Promise((r) => setTimeout(r, 100));
        XLSXLib = window.XLSX;
      }
    }
    return XLSXLib && XLSXLib.utils ? XLSXLib : null;
  }

  async function exportRowsToExcel(rows, sheetName, fileBase) {
    if (!rows.length) {
      window.alert('No rows to export.');
      return;
    }
    const columns = collectColumnKeys(rows);
    const headerRow = columns.slice();
    const dataRows = rows.map((row) => columns.map((col) => flattenValue(row[col])));
    const today = new Date().toISOString().split('T')[0];
    const XLSXLib = await waitForXlsx();

    if (XLSXLib) {
      const ws = XLSXLib.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const wb = XLSXLib.utils.book_new();
      XLSXLib.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
      const out = XLSXLib.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileBase}_${today}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const sanitizeCsv = (value) => {
      const s = String(flattenValue(value));
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      headerRow.map(sanitizeCsv).join(','),
      ...dataRows.map((r) => r.map(sanitizeCsv).join(','))
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBase}_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function fetchAllJobCardsWithStockUsed() {
    if (!window.DatabaseAPI?.getJobCards) return [];
    const all = [];
    let page = 1;
    let totalPages = 1;
    const pageSize = 200;

    while (page <= totalPages) {
      const res = await window.DatabaseAPI.getJobCards({
        page,
        pageSize,
        includeStockUsed: true,
        withStockUsedOnly: true,
        forceRefresh: true
      });
      const batch = res?.data?.jobCards || [];
      const pag = res?.data?.pagination;
      if (!pag) {
        return batch.length ? batch : all;
      }
      all.push(...batch);
      totalPages = pag.totalPages || 1;
      page += 1;
      if (!batch.length) break;
    }
    return all;
  }

  async function fetchAllStockMovements() {
    if (!window.DatabaseAPI?.getStockMovements) return [];
    const all = [];
    let page = 1;
    const pageSize = 200;
    let totalPages = 1;

    while (page <= totalPages) {
      const res = await window.DatabaseAPI.getStockMovements({ page, pageSize });
      const batch = res?.data?.movements || [];
      const pag = res?.data?.pagination;
      if (!pag) {
        return batch.length ? batch : all;
      }
      all.push(...batch);
      totalPages = pag.totalPages || 1;
      page += 1;
      if (!batch.length) break;
    }
    return all;
  }

  function prefixKeys(obj, prefix) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'items' || k === 'stockUsed' || k === 'materialsBought') continue;
      out[`${prefix}_${k}`] = flattenValue(v);
    }
    return out;
  }

  function buildInventoryCostMap(inventory) {
    const map = new Map();
    for (const item of inventory || []) {
      if (item?.sku) map.set(String(item.sku), Number(item.unitCost) || 0);
    }
    return map;
  }

  function ManufacturingReportsView({
    isDark = false,
    getLocationLabel,
    inventory = [],
    stockLocations = []
  }) {
    const [reportTab, setReportTab] = useState('stock-movements');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);
    const [exporting, setExporting] = useState(false);

    const inventoryCostMap = useMemo(() => buildInventoryCostMap(inventory), [inventory]);

    const resolveLocationLabel = useCallback(
      (locIdOrCode) => {
        if (!locIdOrCode) return '';
        if (typeof getLocationLabel === 'function') {
          const label = getLocationLabel(locIdOrCode);
          if (label && label !== locIdOrCode) return label;
        }
        const loc = (stockLocations || []).find(
          (l) => l.id === locIdOrCode || l.code === locIdOrCode
        );
        return loc ? `${loc.code} — ${loc.name}` : String(locIdOrCode);
      },
      [getLocationLabel, stockLocations]
    );

    const buildStockMovementRows = useCallback(
      (movements) => {
        return (movements || [])
          .filter((m) => inDateRange(m.date || m.createdAt, dateStart, dateEnd))
          .map((m) => ({
            recordSource: 'Stock Movement',
            id: m.id,
            movementId: m.movementId,
            date: m.date,
            type: m.type,
            itemName: m.itemName,
            sku: m.sku,
            quantity: m.quantity,
            fromLocation: m.fromLocation,
            fromLocationLabel: resolveLocationLabel(m.fromLocation),
            toLocation: m.toLocation,
            toLocationLabel: resolveLocationLabel(m.toLocation),
            reference: m.reference,
            performedBy: m.performedBy,
            notes: m.notes,
            ownerId: m.ownerId,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt
          }));
      },
      [dateStart, dateEnd, resolveLocationLabel]
    );

    const buildClientAllocationRows = useCallback(
      async () => {
        const out = [];
        const costMap = inventoryCostMap;

        if (window.DatabaseAPI?.getSalesOrders) {
          const soRes = await window.DatabaseAPI.getSalesOrders();
          const orders = soRes?.data?.salesOrders || [];
          for (const order of orders) {
            const orderDate = order.shippedDate || order.orderDate || order.createdAt;
            if (!inDateRange(orderDate, dateStart, dateEnd)) continue;

            const items = parseJsonSafe(order.items, []);
            const orderFields = prefixKeys(order, 'order');

            if (!items.length) {
              out.push({
                sourceType: 'Sales Order',
                ...orderFields,
                line_index: '',
                line_sku: '',
                line_itemName: '',
                line_quantity: '',
                line_unitPrice: '',
                line_unitCost: '',
                line_lineValue: '',
                line_locationId: '',
                line_locationLabel: '',
                allocationDate: flattenValue(orderDate)
              });
              continue;
            }

            items.forEach((item, idx) => {
              const qty = parseFloat(item.quantity) || 0;
              const unitPrice = parseFloat(item.unitPrice) || 0;
              const unitCost = parseFloat(item.unitCost) || costMap.get(String(item.sku)) || unitPrice || 0;
              const lineValue = qty * unitCost;
              out.push({
                sourceType: 'Sales Order',
                ...orderFields,
                line_index: idx + 1,
                line_id: item.id || '',
                line_sku: item.sku || '',
                line_itemName: item.name || item.itemName || '',
                line_quantity: qty,
                line_unitPrice: unitPrice,
                line_unitCost: unitCost,
                line_lineValue: lineValue,
                line_total: item.total != null ? item.total : qty * unitPrice,
                line_locationId: item.locationId || '',
                line_locationLabel: resolveLocationLabel(item.locationId),
                allocationDate: flattenValue(orderDate),
                quickbooksMemo: `Stock to client: ${order.clientName || ''} — SO ${order.orderNumber || ''} — ${item.sku || item.name || ''}`
              });
            });
          }
        }

        const jobCards = await fetchAllJobCardsWithStockUsed();
        for (const jc of jobCards) {
          const stockUsed = parseJsonSafe(jc.stockUsed, []);
          if (!stockUsed.length) continue;

          const jcDate =
            jc.completedAt || jc.submittedAt || jc.startedAt || jc.updatedAt || jc.createdAt;
          if (!inDateRange(jcDate, dateStart, dateEnd)) continue;

          const jcFields = prefixKeys(jc, 'jobCard');

          stockUsed.forEach((line, idx) => {
            const qty = parseFloat(line.quantity) || 0;
            if (!(qty > 0) && !String(line.sku || '').trim()) return;
            const unitCost = parseFloat(line.unitCost) || costMap.get(String(line.sku)) || 0;
            const lineValue = qty * unitCost;
            out.push({
              sourceType: 'Job Card Consumption',
              ...jcFields,
              line_index: idx + 1,
              line_id: line.id || '',
              line_sku: line.sku || '',
              line_itemName: line.itemName || '',
              line_quantity: qty,
              line_unitCost: unitCost,
              line_lineValue: lineValue,
              line_locationId: line.locationId || '',
              line_locationName: line.locationName || '',
              line_locationLabel: line.locationName || resolveLocationLabel(line.locationId),
              allocationDate: flattenValue(jcDate),
              jobCard_status: jc.status || '',
              quickbooksMemo: `Stock to client: ${jc.clientName || ''} — JC ${jc.jobCardNumber || ''} — ${line.itemName || line.sku || ''}`
            });
          });
        }

        return out;
      },
      [dateStart, dateEnd, inventoryCostMap, resolveLocationLabel]
    );

    const buildReceiptRows = useCallback(
      async (movements) => {
        const out = [];
        const costFromInv = (sku) => inventoryCostMap.get(String(sku)) || 0;
        const receiptMovements = (movements || []).filter(
          (m) => String(m.type || '').toLowerCase() === 'receipt' && inDateRange(m.date || m.createdAt, dateStart, dateEnd)
        );

        for (const m of receiptMovements) {
          out.push({
            recordSource: 'Stock Movement',
            ...m,
            fromLocationLabel: resolveLocationLabel(m.fromLocation),
            toLocationLabel: resolveLocationLabel(m.toLocation)
          });
        }

        if (window.DatabaseAPI?.getPurchaseOrders) {
          const poRes = await window.DatabaseAPI.getPurchaseOrders();
          const orders = poRes?.data?.purchaseOrders || [];
          for (const po of orders) {
            const recvDate = po.receivedDate || po.updatedAt || po.orderDate;
            const items = parseJsonSafe(po.items, []);
            const receivedLines = items.filter((it) => parseFloat(it.quantityReceived) > 0);

            if (!receivedLines.length) continue;

            const poFields = prefixKeys(po, 'po');

            receivedLines.forEach((item, idx) => {
              const qtyRec = parseFloat(item.quantityReceived);
              if (!(qtyRec > 0)) return;
              if (!inDateRange(recvDate, dateStart, dateEnd)) return;

              const unitCost =
                parseFloat(item.receivedUnitPrice ?? item.unitPrice) || costFromInv(item.sku) || 0;
              out.push({
                recordSource: 'Purchase Order Line',
                ...poFields,
                line_index: idx + 1,
                line_sku: item.sku || '',
                line_itemName: item.name || item.itemName || '',
                line_quantityOrdered: parseFloat(item.quantity) || 0,
                line_quantityReceived: qtyRec,
                line_receivedUnitPrice: parseFloat(item.receivedUnitPrice) || '',
                line_receivedLineTotal: parseFloat(item.receivedLineTotal) || qtyRec * unitCost,
                line_unitPrice: parseFloat(item.unitPrice) || '',
                receiptDate: flattenValue(recvDate),
                supplierName: po.supplierName || '',
                receivingLocationId: po.receivingLocationId || '',
                receivingLocationLabel: resolveLocationLabel(po.receivingLocationId)
              });
            });
          }
        }

        return out;
      },
      [dateStart, dateEnd, inventoryCostMap, resolveLocationLabel]
    );

    const loadReport = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        if (reportTab === 'stock-movements') {
          const movements = await fetchAllStockMovements();
          setRows(buildStockMovementRows(movements));
        } else if (reportTab === 'client-allocation') {
          setRows(await buildClientAllocationRows());
        } else if (reportTab === 'receipts') {
          const movements = await fetchAllStockMovements();
          setRows(await buildReceiptRows(movements));
        } else {
          setRows([]);
        }
      } catch (err) {
        console.error('ManufacturingReportsView load failed:', err);
        setError(err?.message || 'Failed to load report data');
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, [reportTab, buildStockMovementRows, buildClientAllocationRows, buildReceiptRows]);

    useEffect(() => {
      void loadReport();
    }, [loadReport]);

    const handleExport = async () => {
      setExporting(true);
      try {
        const tabMeta = REPORT_TABS.find((t) => t.id === reportTab);
        const base = `manufacturing_${(tabMeta?.label || reportTab).replace(/\s+/g, '_').toLowerCase()}`;
        await exportRowsToExcel(rows, tabMeta?.label || 'Report', base);
      } catch (err) {
        console.error('Export failed:', err);
        window.alert('Export failed. See console for details.');
      } finally {
        setExporting(false);
      }
    };

    const columns = useMemo(() => collectColumnKeys(rows), [rows]);
    const card = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
    const textMain = isDark ? 'text-gray-100' : 'text-gray-900';
    const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
    const inputCls = isDark
      ? 'bg-gray-800 border-gray-700 text-gray-100'
      : 'bg-white border-gray-300 text-gray-900';

    return React.createElement(
      'div',
      { className: 'space-y-4 min-w-0 max-w-full w-full' },
      React.createElement(
        'div',
        { className: `${card} rounded-xl border p-4 shadow-sm space-y-4` },
        React.createElement(
          'div',
          { className: 'flex flex-wrap items-start justify-between gap-3' },
          React.createElement(
            'div',
            null,
            React.createElement('h3', { className: `text-sm font-semibold ${textMain}` }, 'Manufacturing Reports'),
            React.createElement(
              'p',
              { className: `text-xs mt-1 ${textMuted}` },
              'Export full field sets to Excel for stock movements, client stock allocation (sales orders & job card consumption), and stock receipts.'
            )
          ),
          React.createElement(
            'div',
            { className: 'flex flex-wrap items-center gap-2' },
            React.createElement('input', {
              type: 'date',
              value: dateStart,
              onChange: (e) => setDateStart(e.target.value),
              className: `px-2 py-1.5 text-sm border rounded-lg ${inputCls}`,
              'aria-label': 'From date'
            }),
            React.createElement('span', { className: `text-xs ${textMuted}` }, 'to'),
            React.createElement('input', {
              type: 'date',
              value: dateEnd,
              onChange: (e) => setDateEnd(e.target.value),
              className: `px-2 py-1.5 text-sm border rounded-lg ${inputCls}`,
              'aria-label': 'To date'
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => void loadReport(),
                disabled: loading,
                className: `px-3 py-2 text-sm border rounded-lg flex items-center gap-2 ${
                  isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-50'
                }`
              },
              React.createElement('i', { className: `fas fa-sync-alt text-xs ${loading ? 'animate-spin' : ''}` }),
              'Refresh'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => void handleExport(),
                disabled: exporting || !rows.length,
                className: 'px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50'
              },
              React.createElement('i', { className: 'fas fa-file-excel text-xs' }),
              exporting ? 'Exporting…' : 'Export Excel'
            )
          )
        ),
        React.createElement(
          'div',
          { className: 'flex flex-wrap gap-1' },
          REPORT_TABS.map((tab) =>
            React.createElement(
              'button',
              {
                key: tab.id,
                type: 'button',
                onClick: () => setReportTab(tab.id),
                className: `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap ${
                  reportTab === tab.id
                    ? isDark
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-900'
                    : isDark
                      ? 'text-gray-400 hover:bg-gray-800'
                      : 'text-gray-600 hover:bg-gray-50'
                }`
              },
              React.createElement('i', { className: `fas ${tab.icon} text-xs` }),
              tab.label
            )
          )
        )
      ),
      error &&
        React.createElement(
          'div',
          {
            className: `rounded-xl border px-4 py-3 text-sm ${
              isDark ? 'bg-red-900/20 border-red-800 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
            }`
          },
          error
        ),
      React.createElement(
        'div',
        { className: `${card} rounded-xl border overflow-hidden min-w-0` },
        React.createElement(
          'div',
          { className: `px-4 py-2 border-b flex items-center justify-between ${isDark ? 'border-gray-800' : 'border-gray-100'}` },
          React.createElement(
            'span',
            { className: `text-xs ${textMuted}` },
            loading ? 'Loading…' : `${rows.length} row${rows.length === 1 ? '' : 's'} · ${columns.length} columns`
          )
        ),
        React.createElement(
          'div',
          { className: 'inventory-desktop-xscroll overflow-x-auto w-full min-w-0 max-h-[70vh] overflow-y-auto' },
          loading
            ? React.createElement(
                'div',
                { className: 'px-4 py-12 text-center text-sm text-gray-500' },
                React.createElement('span', { className: 'inline-flex items-center gap-2' },
                  React.createElement('span', {
                    className: 'animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600',
                    'aria-hidden': 'true'
                  }),
                  'Loading report…'
                )
              )
            : !rows.length
              ? React.createElement(
                  'div',
                  { className: `px-4 py-12 text-center text-sm ${textMuted}` },
                  'No data for this report and date range.'
                )
              : React.createElement(
                  'table',
                  { className: 'w-full min-w-max text-left' },
                  React.createElement(
                    'thead',
                    { className: `${isDark ? 'bg-gray-800' : 'bg-gray-50'} sticky top-0 z-10` },
                    React.createElement(
                      'tr',
                      null,
                      columns.map((col) =>
                        React.createElement(
                          'th',
                          {
                            key: col,
                            className: `px-3 py-2 text-xs font-medium whitespace-nowrap ${textMuted}`
                          },
                          col
                        )
                      )
                    )
                  ),
                  React.createElement(
                    'tbody',
                    { className: `divide-y ${isDark ? 'divide-gray-800' : 'divide-gray-100'}` },
                    rows.map((row, ri) =>
                      React.createElement(
                        'tr',
                        {
                          key: row.id ? `${row.id}-${ri}` : `row-${ri}`,
                          className: isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'
                        },
                        columns.map((col) =>
                          React.createElement(
                            'td',
                            {
                              key: col,
                              className: `px-3 py-2 text-xs whitespace-nowrap max-w-xs truncate ${textMain}`,
                              title: String(flattenValue(row[col]))
                            },
                            flattenValue(row[col])
                          )
                        )
                      )
                    )
                  )
                )
        )
      )
    );
  }

  window.ManufacturingReportsView = ManufacturingReportsView;
})();
