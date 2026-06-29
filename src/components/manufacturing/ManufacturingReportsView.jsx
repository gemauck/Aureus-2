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
    { id: 'receipts', label: 'Receipt of Stock Report', icon: 'fa-truck-loading' },
    { id: 'inventory-valuation', label: 'Inventory Valuation', icon: 'fa-coins' },
    { id: 'cost-overrides', label: 'Cost Overrides', icon: 'fa-user-shield', adminOnly: true }
  ];

  const DATE_PRESET_LAST_CALENDAR_MONTH = 'last-calendar-month';
  const DATE_PRESET_CURRENT_CALENDAR_MONTH = 'current-calendar-month';
  const DATE_PRESET_CUSTOM = 'custom';
  const DATE_PRESET_ALL = 'all';

  function formatYmd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** First and last day of the calendar month before `refDate` (local time). */
  function getLastCalendarMonthRange(refDate = new Date()) {
    const anchor = refDate instanceof Date ? refDate : new Date();
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
    return { start: formatYmd(start), end: formatYmd(end) };
  }

  function getCurrentCalendarMonthRange(refDate = new Date()) {
    const anchor = refDate instanceof Date ? refDate : new Date();
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: formatYmd(start), end: formatYmd(end) };
  }

  const DEFAULT_DATE_RANGE = getCurrentCalendarMonthRange();

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
      const pri = [
        'sourceType',
        'recordSource',
        'date',
        'movement_date',
        'customerName',
        'order_orderNumber',
        'jobCard_jobCardNumber',
        'jobCard_clientName',
        'jobCard_siteName'
      ];
      const ai = pri.indexOf(a);
      const bi = pri.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b);
    });
  }

  async function waitForXlsx() {
    if (typeof window.ensureXLSX === 'function') {
      try {
        return await window.ensureXLSX();
      } catch (_) {
        return null;
      }
    }
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

  const JOURNAL_CSV_HEADERS = [
    'Journal Code',
    'Date',
    'Account',
    'Description',
    'Debit',
    'Credit',
    'Name',
    'Class'
  ];
  const JOURNAL_ACCOUNT_STOCK_ASSET = 'Stock on Hand';
  const JOURNAL_ACCOUNT_PARTS_COS = 'Parts & Components - COS';
  const JOURNAL_ACCOUNT_REPAIRS_COS = 'Repairs & Maintenance - COS';
  const JOURNAL_JOB_CARD_CATEGORY_NEW_INSTALL = 'New Install';
  const JOURNAL_DEFAULT_CLASS = 'Technical';

  function excelSerialFromLocalDate(date = new Date()) {
    const epoch = new Date(1899, 11, 30);
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((local - epoch) / 86400000);
  }

  function formatJournalAmount(value) {
    const n = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) return '';
    return Number.isInteger(n) ? String(n) : String(n);
  }

  async function fetchClientNameByIdMap() {
    const map = new Map();
    if (!window.DatabaseAPI?.getClients) return map;
    try {
      const res = await window.DatabaseAPI.getClients(true);
      const clients = res?.data?.clients || res?.clients || [];
      for (const c of clients) {
        if (c?.id && c?.name) map.set(String(c.id), String(c.name).trim());
      }
    } catch (err) {
      console.warn('ManufacturingReportsView: failed to load clients for name resolution', err);
    }
    return map;
  }

  function resolveClientDisplayName(storedName, clientId, nameById) {
    const id = clientId != null ? String(clientId).trim() : '';
    if (id && nameById?.has(id)) return nameById.get(id);
    const stored = storedName != null ? String(storedName).trim() : '';
    return stored;
  }

  function formatClientSiteLabel(client, site, joiner) {
    const c = client != null ? String(client).trim() : '';
    const s = site != null ? String(site).trim() : '';
    if (c && s) return `${c}${joiner}${s}`;
    return c || s;
  }

  function formatAllocationCustomerName(client, site) {
    return formatClientSiteLabel(client, site, ': ');
  }

  function getClientNameFromAllocationRow(row) {
    const name = row.jobCard_clientName || row.order_clientName || '';
    if (name && String(name).trim()) return String(name).trim();
    return '';
  }

  function getSiteNameFromAllocationRow(row) {
    const site = row.jobCard_siteName || '';
    if (site && String(site).trim()) return String(site).trim();
    return '';
  }

  /** QuickBooks journal "Name" — "Client:Site" when site present, else client only. */
  function getJournalCustomerNameFromRow(row) {
    if (row.customerName != null && String(row.customerName).trim()) {
      const cn = String(row.customerName).trim();
      const colonIdx = cn.indexOf(':');
      if (colonIdx >= 0) {
        const client = cn.slice(0, colonIdx).trim();
        const site = cn.slice(colonIdx + 1).trim();
        return formatClientSiteLabel(client, site, ':');
      }
      return cn;
    }
    return formatClientSiteLabel(
      getClientNameFromAllocationRow(row),
      getSiteNameFromAllocationRow(row),
      ':'
    );
  }

  function getJournalClassFromRow(row) {
    const svc = row.jobCard_serviceCategory;
    if (svc && String(svc).trim()) return String(svc).trim();
    return JOURNAL_DEFAULT_CLASS;
  }

  /** QuickBooks debit account: New Install job cards → Parts & Components; all else → Repairs & Maintenance. */
  function getJournalDebitAccountFromRow(row) {
    const category = String(row.jobCard_callOutCategory || '').trim();
    if (category === JOURNAL_JOB_CARD_CATEGORY_NEW_INSTALL) return JOURNAL_ACCOUNT_PARTS_COS;
    return JOURNAL_ACCOUNT_REPAIRS_COS;
  }

  function getAllocationLineValue(row) {
    const v = parseFloat(row.line_lineValue);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function formatJournalLineItemLabel(row) {
    const item = row.line_itemName || row.line_sku || '';
    const qty = parseFloat(row.line_quantity);
    if (!Number.isFinite(qty) || qty <= 0) return item;
    const qtyLabel = Number.isInteger(qty) ? String(qty) : String(qty);
    return item ? `${qtyLabel} x ${item}` : qtyLabel;
  }

  function buildJournalDebitDescription(row) {
    const client = getClientNameFromAllocationRow(row);
    const item = formatJournalLineItemLabel(row);
    if (row.sourceType === 'Sales Order') {
      const so = row.order_orderNumber || '';
      return `Sales Order ${so} - ${client} - ${item}`.replace(/\s+-\s+-/g, ' - ').trim();
    }
    if (row.sourceType === 'Job Card Consumption') {
      const jc = row.jobCard_jobCardNumber || '';
      const site = getSiteNameFromAllocationRow(row);
      const sitePart = site ? ` — ${site}` : '';
      return `Job Card ${jc}${sitePart} - ${client} - ${item}`.replace(/\s+-\s+-/g, ' - ').trim();
    }
    if (row.quickbooksMemo) return String(row.quickbooksMemo);
    return `Stock to client - ${client} - ${item}`.trim();
  }

  function buildStockIssuedCreditDescription(dateStart, dateEnd) {
    const refRaw = dateEnd || dateStart;
    const ref = refRaw ? new Date(`${refRaw}T12:00:00`) : new Date();
    const month = ref.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    return `Stock Issued ${month}`;
  }

  function buildClientAllocationJournalRows(journalNo, journalDateSerial, allocationRows, dateStart, dateEnd) {
    const lines = (allocationRows || [])
      .map((row) => ({ row, value: getAllocationLineValue(row) }))
      .filter((entry) => entry.value > 0);
    if (!lines.length) return [];

    const totalCredit = lines.reduce((sum, { value }) => sum + value, 0);
    const out = [
      [
        journalNo,
        journalDateSerial,
        JOURNAL_ACCOUNT_STOCK_ASSET,
        buildStockIssuedCreditDescription(dateStart, dateEnd),
        '',
        formatJournalAmount(totalCredit),
        '',
        ''
      ]
    ];

    for (const { row, value } of lines) {
      out.push([
        journalNo,
        journalDateSerial,
        getJournalDebitAccountFromRow(row),
        buildJournalDebitDescription(row),
        formatJournalAmount(value),
        '',
        getJournalCustomerNameFromRow(row),
        getJournalClassFromRow(row)
      ]);
    }
    return out;
  }

  function downloadJournalCsv(journalRows, journalNo) {
    const sanitizeCsv = (value) => {
      const s = value === null || value === undefined ? '' : String(value);
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      JOURNAL_CSV_HEADERS.map(sanitizeCsv).join(','),
      ...journalRows.map((r) => r.map(sanitizeCsv).join(','))
    ];
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `client_allocation_journal_${journalNo}_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const ALLOCATION_CHART_TOP_N = 10;

  function formatAllocationMoney(value) {
    const n = roundMoney(Number(value) || 0);
    return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function truncateChartLabel(label, maxLen = 36) {
    const s = label != null ? String(label).trim() : '';
    if (!s) return 'Unknown';
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}…`;
  }

  function buildClientAllocationInsights(rows) {
    const byCustomer = new Map();
    const byPart = new Map();
    const bySource = new Map();
    let totalValue = 0;
    let totalQty = 0;
    let lineCount = 0;

    for (const row of rows || []) {
      const value = getAllocationLineValue(row);
      const qty = parseFloat(row.line_quantity);
      const hasQty = Number.isFinite(qty) && qty > 0;
      if (!(value > 0) && !hasQty) continue;

      lineCount += 1;
      totalValue += value;
      totalQty += hasQty ? qty : 0;

      const customer =
        (row.customerName || getJournalCustomerNameFromRow(row) || 'Unknown').trim() || 'Unknown';
      const partKey = String(row.line_sku || row.line_itemName || 'Unknown').trim() || 'Unknown';
      const partLabel = row.line_itemName || row.line_sku || 'Unknown';
      const source = String(row.sourceType || 'Other').trim() || 'Other';

      const cust = byCustomer.get(customer) || { label: customer, value: 0, qty: 0, lines: 0 };
      cust.value = roundMoney(cust.value + value);
      cust.qty = roundMoney(cust.qty + (hasQty ? qty : 0));
      cust.lines += 1;
      byCustomer.set(customer, cust);

      const part = byPart.get(partKey) || { label: partLabel, sku: row.line_sku || '', value: 0, qty: 0 };
      part.value = roundMoney(part.value + value);
      part.qty = roundMoney(part.qty + (hasQty ? qty : 0));
      byPart.set(partKey, part);

      const src = bySource.get(source) || { label: source, value: 0, qty: 0, lines: 0 };
      src.value = roundMoney(src.value + value);
      src.qty = roundMoney(src.qty + (hasQty ? qty : 0));
      src.lines += 1;
      bySource.set(source, src);
    }

    const sortByValue = (a, b) => b.value - a.value || b.qty - a.qty;
    const topClients = Array.from(byCustomer.values()).sort(sortByValue).slice(0, ALLOCATION_CHART_TOP_N);
    const topParts = Array.from(byPart.values()).sort(sortByValue).slice(0, ALLOCATION_CHART_TOP_N);
    const bySourceType = Array.from(bySource.values()).sort(sortByValue);

    return {
      totals: {
        totalValue: roundMoney(totalValue),
        totalQty: roundMoney(totalQty),
        lineCount,
        clientCount: byCustomer.size,
        partCount: byPart.size
      },
      topClients,
      topParts,
      bySourceType,
      maxClientValue: topClients[0]?.value || 1,
      maxPartValue: topParts[0]?.value || 1,
      maxSourceValue: bySourceType[0]?.value || 1
    };
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawHorizontalBarSection(ctx, opts) {
    const {
      x,
      y,
      width,
      title,
      items,
      maxValue,
      valueFormatter,
      barColor,
      labelWidth = 220
    } = opts;
    const barMaxWidth = width - labelWidth - 120;
    const rowHeight = 28;

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(title, x, y);
    let cursorY = y + 28;

    if (!items.length) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('No allocation lines in this period.', x, cursorY + 14);
      return cursorY + 36;
    }

    ctx.font = '12px system-ui, sans-serif';
    for (const item of items) {
      const label = truncateChartLabel(item.label, 34);
      const value = Number(item.value) || 0;
      const pct = maxValue > 0 ? value / maxValue : 0;
      const barW = Math.max(value > 0 ? 6 : 0, pct * barMaxWidth);

      ctx.fillStyle = '#374151';
      ctx.fillText(label, x, cursorY + 14);

      const barX = x + labelWidth;
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(barX, cursorY + 4, barMaxWidth, 14);
      ctx.fillStyle = barColor;
      ctx.fillRect(barX, cursorY + 4, barW, 14);

      ctx.fillStyle = '#111827';
      ctx.textAlign = 'right';
      ctx.fillText(valueFormatter(value), barX + barMaxWidth + 108, cursorY + 14);
      ctx.textAlign = 'left';
      cursorY += rowHeight;
    }
    return cursorY + 12;
  }

  function downloadClientAllocationInsightsChart(insights, periodLabel) {
    const width = 1100;
    const clientRows = insights.topClients.length;
    const partRows = insights.topParts.length;
    const sourceRows = Math.max(insights.bySourceType.length, 1);
    const height = 220 + clientRows * 28 + 60 + partRows * 28 + 80 + sourceRows * 28 + 80;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      window.alert('Could not create chart image.');
      return;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('Client Part Allocation & Expenditure', 40, 42);
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Period: ${periodLabel}`, 40, 68);
    ctx.fillText(`Generated: ${formatYmd(new Date())}`, 40, 88);

    const { totals } = insights;
    const statY = 108;
    const stats = [
      { label: 'Total spend', value: formatAllocationMoney(totals.totalValue) },
      { label: 'Parts issued', value: totals.totalQty.toLocaleString('en-ZA') },
      { label: 'Clients', value: String(totals.clientCount) },
      { label: 'Unique parts', value: String(totals.partCount) }
    ];
    stats.forEach((stat, i) => {
      const boxX = 40 + i * 250;
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(boxX, statY, 230, 54);
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(stat.label, boxX + 12, statY + 20);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(stat.value, boxX + 12, statY + 42);
    });

    let y = statY + 84;
    y = drawHorizontalBarSection(ctx, {
      x: 40,
      y,
      width: width - 80,
      title: `Top clients by expenditure (${ALLOCATION_CHART_TOP_N})`,
      items: insights.topClients,
      maxValue: insights.maxClientValue,
      valueFormatter: formatAllocationMoney,
      barColor: '#4f46e5'
    });
    y = drawHorizontalBarSection(ctx, {
      x: 40,
      y,
      width: width - 80,
      title: `Top parts by cost (${ALLOCATION_CHART_TOP_N})`,
      items: insights.topParts,
      maxValue: insights.maxPartValue,
      valueFormatter: formatAllocationMoney,
      barColor: '#059669'
    });
    y = drawHorizontalBarSection(ctx, {
      x: 40,
      y,
      width: width - 80,
      title: 'Expenditure by source',
      items: insights.bySourceType,
      maxValue: insights.maxSourceValue,
      valueFormatter: formatAllocationMoney,
      barColor: '#d97706'
    });

    canvas.toBlob((blob) => {
      if (!blob) {
        window.alert('Chart export failed.');
        return;
      }
      const today = formatYmd(new Date());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `client_allocation_insights_${today}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  function AllocationHorizontalBarChart({ title, subtitle, items, maxValue, formatValue, barClass, isDark }) {
    const textMain = isDark ? 'text-gray-100' : 'text-gray-900';
    const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
    const trackClass = isDark ? 'bg-gray-800' : 'bg-gray-100';

    return React.createElement(
      'div',
      { className: 'min-w-0' },
      React.createElement(
        'div',
        { className: 'mb-2' },
        React.createElement('h4', { className: `text-xs font-semibold ${textMain}` }, title),
        subtitle &&
          React.createElement('p', { className: `text-[10px] mt-0.5 ${textMuted}` }, subtitle)
      ),
      !items.length
        ? React.createElement('p', { className: `text-xs ${textMuted}` }, 'No data for this period.')
        : React.createElement(
            'div',
            { className: 'space-y-2', role: 'img', 'aria-label': title },
            items.map((item, idx) => {
              const value = Number(item.value) || 0;
              const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const qtyNote =
                item.qty > 0 ? ` · ${item.qty.toLocaleString('en-ZA')} units` : '';
              return React.createElement(
                'div',
                { key: `${item.label}-${idx}`, className: 'group' },
                React.createElement(
                  'div',
                  { className: 'flex items-center justify-between gap-2 mb-0.5' },
                  React.createElement(
                    'span',
                    {
                      className: `text-[11px] truncate ${textMain}`,
                      title: item.label
                    },
                    truncateChartLabel(item.label, 42)
                  ),
                  React.createElement(
                    'span',
                    { className: `text-[10px] tabular-nums whitespace-nowrap ${textMuted}` },
                    `${formatValue(value)}${qtyNote}`
                  )
                ),
                React.createElement(
                  'div',
                  { className: `h-2.5 rounded-full overflow-hidden ${trackClass}` },
                  React.createElement('div', {
                    className: `h-full rounded-full ${barClass}`,
                    style: { width: `${Math.max(value > 0 ? 4 : 0, pct)}%` },
                    title: `${item.label}: ${formatValue(value)}${qtyNote}`
                  })
                )
              );
            })
          )
    );
  }

  function ClientAllocationInsightsPanel({ insights, periodLabel, isDark }) {
    const card = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
    const textMain = isDark ? 'text-gray-100' : 'text-gray-900';
    const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
    const statCard = isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-gray-50 border-gray-100';
    const { totals } = insights;

    const statTiles = [
      { label: 'Total spend', value: formatAllocationMoney(totals.totalValue), icon: 'fa-coins' },
      {
        label: 'Parts issued',
        value: totals.totalQty.toLocaleString('en-ZA'),
        icon: 'fa-boxes-stacked'
      },
      { label: 'Clients served', value: String(totals.clientCount), icon: 'fa-building' },
      { label: 'Unique parts', value: String(totals.partCount), icon: 'fa-puzzle-piece' }
    ];

    return React.createElement(
      'div',
      { className: `${card} rounded-xl border p-4 shadow-sm space-y-4` },
      React.createElement(
        'div',
        { className: 'flex flex-wrap items-start justify-between gap-2' },
        React.createElement(
          'div',
          null,
          React.createElement(
            'h4',
            { className: `text-sm font-semibold ${textMain}` },
            'Allocation insights'
          ),
          React.createElement(
            'p',
            { className: `text-xs mt-0.5 ${textMuted}` },
            `Part allocation and expenditure summary · ${periodLabel}`
          )
        ),
        React.createElement(
          'span',
          { className: `text-[10px] ${textMuted}` },
          `${totals.lineCount} line${totals.lineCount === 1 ? '' : 's'} with value or quantity`
        )
      ),
      React.createElement(
        'div',
        { className: 'grid grid-cols-2 lg:grid-cols-4 gap-2' },
        statTiles.map((tile) =>
          React.createElement(
            'div',
            {
              key: tile.label,
              className: `rounded-lg border px-3 py-2 ${statCard}`
            },
            React.createElement(
              'div',
              { className: `text-[10px] uppercase tracking-wide ${textMuted}` },
              React.createElement('i', { className: `fas ${tile.icon} mr-1 text-[9px]` }),
              tile.label
            ),
            React.createElement(
              'div',
              { className: `text-sm font-semibold tabular-nums mt-1 ${textMain}` },
              tile.value
            )
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'grid grid-cols-1 xl:grid-cols-2 gap-4' },
        React.createElement(AllocationHorizontalBarChart, {
          title: `Top clients by expenditure`,
          subtitle: `Top ${ALLOCATION_CHART_TOP_N} by line cost`,
          items: insights.topClients,
          maxValue: insights.maxClientValue,
          formatValue: formatAllocationMoney,
          barClass: 'bg-gradient-to-r from-indigo-600 to-indigo-400',
          isDark
        }),
        React.createElement(AllocationHorizontalBarChart, {
          title: 'Top parts by cost',
          subtitle: `Top ${ALLOCATION_CHART_TOP_N} SKUs / items`,
          items: insights.topParts,
          maxValue: insights.maxPartValue,
          formatValue: formatAllocationMoney,
          barClass: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
          isDark
        })
      ),
      React.createElement(AllocationHorizontalBarChart, {
        title: 'Expenditure by source',
        subtitle: 'Sales orders vs job card consumption',
        items: insights.bySourceType,
        maxValue: insights.maxSourceValue,
        formatValue: formatAllocationMoney,
        barClass: 'bg-gradient-to-r from-amber-600 to-amber-400',
        isDark
      })
    );
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

  /** Client allocation / journal COGS always uses master inventory unit cost (never location or line snapshot). */
  function getMasterUnitCost(sku, costMap) {
    const n = costMap.get(String(sku ?? ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  /** Company-wide catalog costs (all SKUs) — not the location-filtered Manufacturing inventory list. */
  async function fetchMasterInventoryCostMap() {
    if (!window.DatabaseAPI?.getInventory) return new Map();
    try {
      const res = await window.DatabaseAPI.getInventory(null, { forceRefresh: true });
      return buildInventoryCostMap(res?.data?.inventory || []);
    } catch (err) {
      console.warn('ManufacturingReportsView: failed to load master inventory costs', err);
      return new Map();
    }
  }

  function mergeMasterCostMaps(primary, fallback) {
    const out = new Map(fallback || []);
    for (const [sku, cost] of primary || []) {
      out.set(sku, cost);
    }
    return out;
  }

  function formatReportDate(isoOrDate) {
    if (!isoOrDate) return '';
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function roundMoney(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function buildInventoryValuationRows(inventoryList, locationFilterId) {
    const asAt = formatYmd(new Date());
    const bySku = new Map();
    for (const item of inventoryList || []) {
      if (!item?.sku) continue;
      if (locationFilterId && locationFilterId !== 'all') {
        if (String(item.locationId || '') !== String(locationFilterId)) continue;
      }
      const sku = String(item.sku).trim();
      const qty = Number(item.quantity) || 0;
      const averageCost = Number(item.unitCost) || 0;
      const latestPrice = Number(item.lastInboundUnitPrice) || 0;
      const lineValue = roundMoney(qty * averageCost);
      const row = {
        as_at_date: asAt,
        sku,
        name: item.name || sku,
        category: item.category || '',
        unit: item.unit || 'pcs',
        location: item.location || '',
        quantity: qty,
        average_unit_cost: averageCost,
        latest_unit_price: latestPrice,
        last_priced_receipt: formatReportDate(item.lastInboundAt),
        total_value: lineValue
      };
      if (bySku.has(sku)) {
        const prev = bySku.get(sku);
        prev.quantity = roundMoney(prev.quantity + qty);
        prev.total_value = roundMoney(prev.quantity * prev.average_unit_cost);
        if (!prev.location && row.location) prev.location = row.location;
      } else {
        bySku.set(sku, row);
      }
    }
    return Array.from(bySku.values()).sort((a, b) =>
      String(a.sku).localeCompare(String(b.sku))
    );
  }

  async function fetchCostOverrideRows(startStr, endStr) {
    if (!window.DatabaseAPI?.getManufacturingActivity) return [];
    const out = [];
    const pageSize = 500;
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const res = await window.DatabaseAPI.getManufacturingActivity({
        startDate: startStr || undefined,
        endDate: endStr || undefined,
        limit: pageSize,
        offset
      });
      const logs = res?.data?.logs || [];
      total = Number(res?.data?.total) || logs.length;
      for (const log of logs) {
        if (log.module !== 'manufacturing' || log.action !== 'update') continue;
        const d = log.details && typeof log.details === 'object' ? log.details : {};
        const prev = d.previousUnitCost;
        const next = d.newUnitCost;
        const isOverride =
          d.costOverride === true ||
          (prev != null && next != null && Math.abs(Number(next) - Number(prev)) > 0.0001);
        if (!isOverride) continue;
        out.push({
          timestamp: log.timestamp,
          user: log.user,
          user_email: log.userEmail || '',
          sku: d.sku || '',
          previous_unit_cost: prev != null ? prev : '',
          new_unit_cost: next != null ? next : '',
          summary: d.summary || ''
        });
      }
      offset += logs.length;
      if (!logs.length || logs.length < pageSize) break;
    }
    return out;
  }

  function ManufacturingReportsView({
    isDark = false,
    isAdmin = false,
    getLocationLabel,
    inventory = [],
    stockLocations = []
  }) {
    const [reportTab, setReportTab] = useState('stock-movements');
    const [datePreset, setDatePreset] = useState(DATE_PRESET_CURRENT_CALENDAR_MONTH);
    const [dateStart, setDateStart] = useState(DEFAULT_DATE_RANGE.start);
    const [dateEnd, setDateEnd] = useState(DEFAULT_DATE_RANGE.end);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);
    const [exporting, setExporting] = useState(false);
    const [journalExporting, setJournalExporting] = useState(false);
    const [chartDownloading, setChartDownloading] = useState(false);
    const [valuationLocationId, setValuationLocationId] = useState('all');

    const inventoryCostMap = useMemo(() => buildInventoryCostMap(inventory), [inventory]);

    const visibleReportTabs = useMemo(
      () => REPORT_TABS.filter((tab) => !tab.adminOnly || isAdmin),
      [isAdmin]
    );

    const isValuationTab = reportTab === 'inventory-valuation';
    const isCostOverrideTab = reportTab === 'cost-overrides';
    const isClientAllocationTab = reportTab === 'client-allocation';

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
        const masterFromApi = await fetchMasterInventoryCostMap();
        const costMap = mergeMasterCostMaps(masterFromApi, inventoryCostMap);
        const clientNameById = await fetchClientNameByIdMap();

        if (window.DatabaseAPI?.getSalesOrders) {
          const soRes = await window.DatabaseAPI.getSalesOrders();
          const orders = soRes?.data?.salesOrders || [];
          for (const order of orders) {
            const orderDate = order.shippedDate || order.orderDate || order.createdAt;
            if (!inDateRange(orderDate, dateStart, dateEnd)) continue;

            const items = parseJsonSafe(order.items, []);
            const resolvedClientName = resolveClientDisplayName(
              order.clientName,
              order.clientId,
              clientNameById
            );
            const orderForRow = { ...order, clientName: resolvedClientName };
            const orderFields = prefixKeys(orderForRow, 'order');

            if (!items.length) {
              out.push({
                sourceType: 'Sales Order',
                customerName: resolvedClientName,
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
              const unitCost = getMasterUnitCost(item.sku, costMap);
              const lineValue = qty * unitCost;
              out.push({
                sourceType: 'Sales Order',
                customerName: resolvedClientName,
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
                quickbooksMemo: `Stock to client: ${resolvedClientName || ''} — SO ${order.orderNumber || ''} — ${item.sku || item.name || ''}`
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

          const resolvedJcClientName = resolveClientDisplayName(
            jc.clientName,
            jc.clientId,
            clientNameById
          );
          const customerName = formatAllocationCustomerName(resolvedJcClientName, jc.siteName);
          const jcForRow = { ...jc, clientName: resolvedJcClientName };
          const jcFields = prefixKeys(jcForRow, 'jobCard');

          stockUsed.forEach((line, idx) => {
            const qty = parseFloat(line.quantity) || 0;
            if (!(qty > 0) && !String(line.sku || '').trim()) return;
            const unitCost = getMasterUnitCost(line.sku, costMap);
            const lineValue = qty * unitCost;
            out.push({
              sourceType: 'Job Card Consumption',
              customerName,
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
              quickbooksMemo: `Stock to client: ${resolvedJcClientName || ''}${jc.siteName ? ` @ ${jc.siteName}` : ''} — JC ${jc.jobCardNumber || ''} — ${line.itemName || line.sku || ''}`
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
        } else if (reportTab === 'inventory-valuation') {
          const masterFromApi = await fetchMasterInventoryCostMap();
          let list = inventory || [];
          if (!list.length && window.DatabaseAPI?.getInventory) {
            const res = await window.DatabaseAPI.getInventory(null, { forceRefresh: true });
            list = res?.data?.inventory || [];
          }
          const costBySku = masterFromApi;
          const merged = list.map((row) => {
            const sku = row?.sku;
            const fromMaster = sku ? costBySku.get(String(sku)) : undefined;
            return {
              ...row,
              unitCost: row.unitCost != null ? row.unitCost : fromMaster,
              lastInboundUnitPrice: row.lastInboundUnitPrice ?? 0,
              lastInboundAt: row.lastInboundAt ?? null
            };
          });
          setRows(buildInventoryValuationRows(merged, valuationLocationId));
        } else if (reportTab === 'cost-overrides') {
          setRows(await fetchCostOverrideRows(dateStart, dateEnd));
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
    }, [
      reportTab,
      buildStockMovementRows,
      buildClientAllocationRows,
      buildReceiptRows,
      valuationLocationId,
      inventory
    ]);

    useEffect(() => {
      void loadReport();
    }, [loadReport]);

    const applyDatePreset = useCallback((presetId) => {
      if (presetId === DATE_PRESET_LAST_CALENDAR_MONTH) {
        const range = getLastCalendarMonthRange();
        setDatePreset(DATE_PRESET_LAST_CALENDAR_MONTH);
        setDateStart(range.start);
        setDateEnd(range.end);
        return;
      }
      if (presetId === DATE_PRESET_CURRENT_CALENDAR_MONTH) {
        const range = getCurrentCalendarMonthRange();
        setDatePreset(DATE_PRESET_CURRENT_CALENDAR_MONTH);
        setDateStart(range.start);
        setDateEnd(range.end);
        return;
      }
      if (presetId === DATE_PRESET_ALL) {
        setDatePreset(DATE_PRESET_ALL);
        setDateStart('');
        setDateEnd('');
        return;
      }
      setDatePreset(DATE_PRESET_CUSTOM);
    }, []);

    const handleDateStartChange = (value) => {
      setDatePreset(DATE_PRESET_CUSTOM);
      setDateStart(value);
    };

    const handleDateEndChange = (value) => {
      setDatePreset(DATE_PRESET_CUSTOM);
      setDateEnd(value);
    };

    const periodLabel = useMemo(() => {
      if (isValuationTab) {
        const loc =
          valuationLocationId === 'all'
            ? 'All locations'
            : resolveLocationLabel(valuationLocationId) || valuationLocationId;
        return `As at ${formatYmd(new Date())} · ${loc}`;
      }
      if (datePreset === DATE_PRESET_ALL) return 'All dates';
      if (dateStart && dateEnd) return `${dateStart} → ${dateEnd}`;
      if (dateStart) return `From ${dateStart}`;
      if (dateEnd) return `Until ${dateEnd}`;
      return 'All dates';
    }, [datePreset, dateStart, dateEnd, isValuationTab, valuationLocationId, resolveLocationLabel]);

    const valuationGrandTotal = useMemo(() => {
      if (!isValuationTab) return 0;
      return roundMoney(rows.reduce((sum, r) => sum + (Number(r.total_value) || 0), 0));
    }, [isValuationTab, rows]);

    const allocationInsights = useMemo(() => {
      if (!isClientAllocationTab) return null;
      return buildClientAllocationInsights(rows);
    }, [isClientAllocationTab, rows]);

    const handleDownloadInsightsChart = () => {
      if (!allocationInsights?.totals?.lineCount) {
        window.alert('No allocation data to chart for this date range.');
        return;
      }
      setChartDownloading(true);
      try {
        downloadClientAllocationInsightsChart(allocationInsights, periodLabel);
      } catch (err) {
        console.error('Chart download failed:', err);
        window.alert('Chart download failed. See console for details.');
      } finally {
        setChartDownloading(false);
      }
    };

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

    const handleJournalExport = async () => {
      const eligible = (rows || []).filter((row) => getAllocationLineValue(row) > 0);
      if (!eligible.length) {
        window.alert('No allocation lines with a value to export for this date range.');
        return;
      }
      if (!window.DatabaseAPI?.allocateClientAllocationJournalNumber) {
        window.alert('Journal export is not available. Please refresh the page.');
        return;
      }

      setJournalExporting(true);
      try {
        const res = await window.DatabaseAPI.allocateClientAllocationJournalNumber();
        const journalNo = res?.data?.journalNo;
        if (!journalNo) {
          throw new Error(res?.error || 'No journal number returned from server');
        }
        const journalDateSerial = excelSerialFromLocalDate(new Date());
        const journalRows = buildClientAllocationJournalRows(
          journalNo,
          journalDateSerial,
          eligible,
          dateStart,
          dateEnd
        );
        if (!journalRows.length) {
          window.alert('No journal lines to export.');
          return;
        }
        downloadJournalCsv(journalRows, journalNo);
      } catch (err) {
        console.error('Journal export failed:', err);
        window.alert(err?.message || 'Journal export failed. See console for details.');
      } finally {
        setJournalExporting(false);
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
              'Export stock movements, allocations, receipts, inventory valuation (average & latest cost), and admin cost overrides. Default period: current calendar month (except valuation: point-in-time).'
            )
          ),
          React.createElement(
            'div',
            { className: 'flex flex-wrap items-center gap-2' },
            isValuationTab &&
              React.createElement(
                'select',
                {
                  value: valuationLocationId,
                  onChange: (e) => setValuationLocationId(e.target.value),
                  className: `px-2 py-1.5 text-sm border rounded-lg max-w-[220px] ${inputCls}`,
                  'aria-label': 'Valuation location filter'
                },
                React.createElement('option', { value: 'all' }, 'All locations'),
                ...(stockLocations || []).map((loc) =>
                  React.createElement(
                    'option',
                    { key: loc.id, value: loc.id },
                    `${loc.code || ''} — ${loc.name || loc.id}`
                  )
                )
              ),
            !isValuationTab &&
            React.createElement(
              'select',
              {
                value: datePreset,
                onChange: (e) => applyDatePreset(e.target.value),
                className: `px-2 py-1.5 text-sm border rounded-lg ${inputCls}`,
                'aria-label': 'Date period preset'
              },
              React.createElement(
                'option',
                { value: DATE_PRESET_CURRENT_CALENDAR_MONTH },
                'Current calendar month'
              ),
              React.createElement(
                'option',
                { value: DATE_PRESET_LAST_CALENDAR_MONTH },
                'Last calendar month'
              ),
              React.createElement('option', { value: DATE_PRESET_CUSTOM }, 'Custom range'),
              React.createElement('option', { value: DATE_PRESET_ALL }, 'All time')
            ),
            !isValuationTab &&
            React.createElement('input', {
              type: 'date',
              value: dateStart,
              onChange: (e) => handleDateStartChange(e.target.value),
              disabled: datePreset === DATE_PRESET_ALL,
              className: `px-2 py-1.5 text-sm border rounded-lg ${inputCls} disabled:opacity-50`,
              'aria-label': 'From date'
            }),
            !isValuationTab &&
            React.createElement('span', { className: `text-xs ${textMuted}` }, 'to'),
            !isValuationTab &&
            React.createElement('input', {
              type: 'date',
              value: dateEnd,
              onChange: (e) => handleDateEndChange(e.target.value),
              disabled: datePreset === DATE_PRESET_ALL,
              className: `px-2 py-1.5 text-sm border rounded-lg ${inputCls} disabled:opacity-50`,
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
            ),
            isClientAllocationTab &&
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: handleDownloadInsightsChart,
                  disabled:
                    chartDownloading ||
                    loading ||
                    !allocationInsights?.totals?.lineCount,
                  className: 'px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 flex items-center gap-2 disabled:opacity-50',
                  title: 'Download allocation insights chart as PNG'
                },
                React.createElement('i', { className: 'fas fa-chart-bar text-xs' }),
                chartDownloading ? 'Preparing chart…' : 'Download Chart'
              ),
            isClientAllocationTab &&
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => void handleJournalExport(),
                  disabled:
                    journalExporting ||
                    loading ||
                    !rows.some((row) => getAllocationLineValue(row) > 0),
                  className: 'px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50',
                  title:
                    'Download QuickBooks journal CSV (Stock on Hand credit; debit Parts & Components for New Install job cards, else Repairs & Maintenance - COS)'
                },
                React.createElement('i', { className: 'fas fa-book text-xs' }),
                journalExporting ? 'Exporting journal…' : 'Journal Export'
              )
          )
        ),
        React.createElement(
          'div',
          { className: 'flex flex-wrap gap-1' },
          visibleReportTabs.map((tab) =>
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
      isClientAllocationTab &&
        !loading &&
        allocationInsights?.totals?.lineCount > 0 &&
        React.createElement(ClientAllocationInsightsPanel, {
          insights: allocationInsights,
          periodLabel,
          isDark
        }),
      React.createElement(
        'div',
        { className: `${card} rounded-xl border overflow-hidden min-w-0` },
        React.createElement(
          'div',
          { className: `px-4 py-2 border-b flex items-center justify-between ${isDark ? 'border-gray-800' : 'border-gray-100'}` },
          React.createElement(
            'span',
            { className: `text-xs ${textMuted}` },
            loading
              ? 'Loading…'
              : isValuationTab && rows.length
                ? `${rows.length} SKU${rows.length === 1 ? '' : 's'} · Total value R ${valuationGrandTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${periodLabel}`
                : `${rows.length} row${rows.length === 1 ? '' : 's'} · ${columns.length} columns · ${periodLabel}`
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
                  isValuationTab
                    ? 'No inventory rows for this location filter.'
                    : isCostOverrideTab
                      ? 'No manual average cost overrides in this period.'
                      : 'No data for this report and date range.'
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
