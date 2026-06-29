/**
 * Stock Movements tab view for Manufacturing.
 * Loaded by lazy-load-components and attached to window.ManufacturingMovementsView.
 * Parent (Manufacturing.jsx) passes movements, loading state, and callbacks.
 */
(function () {
  const React = window.React;
  if (!React) return;

  const { useState, useMemo, useRef, useCallback } = React;

  const MOVEMENT_COLUMNS = [
    { key: 'movementId', label: 'Movement ID', align: 'left', placeholder: 'Filter ID…' },
    { key: 'date', label: 'Date', align: 'left', placeholder: 'Filter date…' },
    { key: 'type', label: 'Type', align: 'left', placeholder: 'Filter type…' },
    { key: 'item', label: 'Item', align: 'left', placeholder: 'Filter item…' },
    { key: 'quantity', label: 'Quantity', align: 'right', placeholder: 'Filter qty…' },
    { key: 'fromLocation', label: 'From Location', align: 'left', placeholder: 'Filter from…' },
    { key: 'toLocation', label: 'To Location', align: 'left', placeholder: 'Filter to…' },
    { key: 'reference', label: 'Reference', align: 'left', placeholder: 'Filter ref…' },
    { key: 'performedBy', label: 'Performed By', align: 'left', placeholder: 'Filter user…' },
    { key: 'notes', label: 'Notes', align: 'left', placeholder: 'Filter notes…' }
  ];

  function formatMovementDate(movement) {
    const raw = movement?.date || movement?.createdAt;
    if (!raw) return '-';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return String(raw);
    return parsed.toLocaleDateString();
  }

  function formatQuantityDisplay(movement) {
    const qty = parseFloat(movement.quantity) || 0;
    const normalizedQty = movement.type === 'production' ? -Math.abs(qty) : qty;
    if (movement.type === 'receipt') return '+' + Math.abs(qty);
    if (movement.type === 'production') return '' + normalizedQty;
    if (movement.type === 'consumption' || movement.type === 'sale' || movement.type === 'supplier_return') return '' + (-Math.abs(qty));
    if (movement.type === 'transfer') return '' + Math.abs(qty);
    return qty > 0 ? '+' + qty : '' + qty;
  }

  function movementSearchText(movement, getLocationLabel) {
    const fromLabel = getLocationLabel ? getLocationLabel(movement.fromLocation) : movement.fromLocation;
    const toLabel = getLocationLabel ? getLocationLabel(movement.toLocation) : movement.toLocation;
    const rawDate = movement?.date || movement?.createdAt || '';
    return {
      movementId: String(movement.movementId || movement.id || ''),
      date: formatMovementDate(movement) + ' ' + String(rawDate),
      type: String(movement.type || ''),
      item: [movement.itemName, movement.sku].filter(Boolean).join(' '),
      quantity: formatQuantityDisplay(movement) + ' ' + String(movement.quantity ?? ''),
      fromLocation: String(fromLabel || ''),
      toLocation: String(toLabel || ''),
      reference: String(movement.reference || ''),
      performedBy: String(movement.performedBy || ''),
      notes: String(movement.notes || '')
    };
  }

  function matchesColumnFilter(haystack, needle) {
    if (!needle) return true;
    return haystack.toLowerCase().includes(needle.toLowerCase());
  }

  function filterMovements(movements, columnFilters, getLocationLabel) {
    const activeKeys = Object.keys(columnFilters).filter(function (k) {
      return columnFilters[k];
    });
    if (activeKeys.length === 0) return movements;
    return movements.filter(function (movement) {
      const fields = movementSearchText(movement, getLocationLabel);
      return activeKeys.every(function (key) {
        return matchesColumnFilter(fields[key] || '', columnFilters[key]);
      });
    });
  }

  const EXPORT_HEADERS = [
    'Movement ID',
    'Date',
    'Type',
    'Item',
    'SKU',
    'Quantity',
    'From Location',
    'To Location',
    'Reference',
    'Performed By',
    'Notes'
  ];

  function movementExportRow(movement, getLocationLabel) {
    const rawDate = movement?.date || movement?.createdAt || '';
    let dateCell = '';
    if (rawDate) {
      const parsed = new Date(rawDate);
      dateCell = Number.isNaN(parsed.getTime())
        ? String(rawDate)
        : parsed.toISOString().slice(0, 10);
    }
    const fromLabel = getLocationLabel
      ? getLocationLabel(movement.fromLocation)
      : movement.fromLocation;
    const toLabel = getLocationLabel
      ? getLocationLabel(movement.toLocation)
      : movement.toLocation;
    const qty = parseFloat(movement.quantity);
    return [
      movement.movementId || movement.id || '',
      dateCell,
      movement.type || '',
      movement.itemName || '',
      movement.sku || '',
      Number.isFinite(qty) ? qty : movement.quantity ?? '',
      fromLabel || '',
      toLabel || '',
      movement.reference || '',
      movement.performedBy || '',
      movement.notes || ''
    ];
  }

  async function waitForXLSX(maxAttempts) {
    if (typeof window.ensureXLSX === 'function') {
      try {
        return await window.ensureXLSX();
      } catch (_) {
        return null;
      }
    }
    let XLSXLib = window.XLSX;
    for (let i = 0; i < maxAttempts && (!XLSXLib || !XLSXLib.utils); i++) {
      await new Promise(function (resolve) {
        setTimeout(resolve, 100);
      });
      XLSXLib = window.XLSX;
    }
    return XLSXLib && XLSXLib.utils ? XLSXLib : null;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function ManufacturingMovementsView({
    movements = [],
    movementsLoadedFromAPI = false,
    onRecordMovement,
    onRefreshMovements,
    onDeleteMovement,
    getStatusColor,
    getLocationLabel
  }) {
    const [columnFilters, setColumnFilters] = useState({});
    const [isExporting, setIsExporting] = useState(false);
    const columnFiltersRef = useRef({});
    const filterInputRefs = useRef({});
    const typingTimeoutRef = useRef(null);

    const handleColumnFilterChange = useCallback(function (column, value) {
      const next = { ...columnFiltersRef.current };
      if (value) {
        next[column] = value;
      } else {
        delete next[column];
      }
      columnFiltersRef.current = next;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(function () {
        setColumnFilters({ ...columnFiltersRef.current });
      }, 200);
    }, []);

    const clearColumnFilters = useCallback(function () {
      columnFiltersRef.current = {};
      setColumnFilters({});
      Object.keys(filterInputRefs.current).forEach(function (key) {
        const el = filterInputRefs.current[key];
        if (el) el.value = '';
      });
    }, []);

    const filteredMovements = useMemo(
      function () {
        return filterMovements(movements, columnFilters, getLocationLabel);
      },
      [movements, columnFilters, getLocationLabel]
    );

    const hasActiveFilters = Object.keys(columnFilters).length > 0;

    const handleRecordClick = function (e) {
      e?.preventDefault();
      e?.stopPropagation();
      if (typeof onRecordMovement === 'function') onRecordMovement();
    };

    const handleExportMovements = useCallback(
      async function () {
        const rows = filteredMovements;
        if (!rows.length) {
          window.alert('No movements to export. Adjust filters or refresh the list.');
          return;
        }
        setIsExporting(true);
        try {
          const today = new Date().toISOString().slice(0, 10);
          const suffix = hasActiveFilters ? '_filtered' : '';
          const baseName = 'stock_movements_' + today + suffix;
          const dataRows = rows.map(function (m) {
            return movementExportRow(m, getLocationLabel);
          });

          const XLSXLib = await waitForXLSX(30);
          if (XLSXLib) {
            const aoa = [EXPORT_HEADERS.slice(), ...dataRows];
            const ws = XLSXLib.utils.aoa_to_sheet(aoa);
            const wb = XLSXLib.utils.book_new();
            XLSXLib.utils.book_append_sheet(wb, ws, 'Stock Movements');
            const out = XLSXLib.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([out], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            downloadBlob(blob, baseName + '.xlsx');
          } else {
            const sanitizeCsv = function (value) {
              const s = value === null || value === undefined ? '' : String(value);
              if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
              return s;
            };
            const lines = [
              EXPORT_HEADERS.map(sanitizeCsv).join(','),
              ...dataRows.map(function (row) {
                return row.map(sanitizeCsv).join(',');
              })
            ];
            const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, baseName + '.csv');
          }
        } catch (err) {
          console.error('Failed to export stock movements:', err);
          window.alert('Failed to export movements. Please try again or check the console for details.');
        } finally {
          setIsExporting(false);
        }
      },
      [filteredMovements, getLocationLabel, hasActiveFilters]
    );

    function renderFilterInput(col) {
      const thClass =
        'px-3 py-1.5 ' + (col.align === 'right' ? 'text-right' : 'text-left');
      return React.createElement(
        'th',
        { key: 'filter-' + col.key, className: thClass },
        React.createElement('input', {
          key: 'filter-input-' + col.key,
          ref: function (el) {
            if (el) filterInputRefs.current[col.key] = el;
          },
          type: 'text',
          placeholder: col.placeholder,
          defaultValue: columnFilters[col.key] || '',
          onChange: function (e) {
            handleColumnFilterChange(col.key, e.target.value.trim() ? e.target.value : '');
          },
          className:
            'w-full min-w-[4.5rem] px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ' +
            (col.align === 'right' ? 'text-right' : 'text-left')
        })
      );
    }

    function renderMovementRow(movement) {
      const qtyDisplay = formatQuantityDisplay(movement);
      const qtyClass =
        movement.type === 'receipt'
          ? 'text-green-600'
          : movement.type === 'consumption' || movement.type === 'sale' || movement.type === 'supplier_return' || movement.type === 'production'
            ? 'text-red-600'
            : 'text-gray-900';
      return React.createElement(
        'tr',
        { key: movement.id, className: 'hover:bg-gray-50' },
        React.createElement('td', { className: 'px-3 py-2 text-sm font-medium text-gray-900' }, movement.movementId || movement.id),
        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-900' }, formatMovementDate(movement)),
        React.createElement(
          'td',
          { className: 'px-3 py-2' },
          React.createElement(
            'span',
            {
              className:
                'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ' +
                (getStatusColor ? getStatusColor(movement.type) : 'text-gray-600 bg-gray-50')
            },
            movement.type
          )
        ),
        React.createElement(
          'td',
          { className: 'px-3 py-2' },
          React.createElement('div', { className: 'text-sm font-medium text-gray-900' }, movement.itemName),
          React.createElement('div', { className: 'text-xs text-gray-500' }, movement.sku)
        ),
        React.createElement('td', { className: 'px-3 py-2 text-sm font-semibold text-right ' + qtyClass }, qtyDisplay),
        React.createElement(
          'td',
          { className: 'px-3 py-2 text-sm text-gray-600' },
          getLocationLabel ? getLocationLabel(movement.fromLocation) : movement.fromLocation
        ),
        React.createElement(
          'td',
          { className: 'px-3 py-2 text-sm text-gray-600' },
          (getLocationLabel ? getLocationLabel(movement.toLocation) : movement.toLocation) || '-'
        ),
        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-600' }, movement.reference),
        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-600' }, movement.performedBy),
        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-500' }, movement.notes),
        React.createElement(
          'td',
          { className: 'px-3 py-2' },
          React.createElement(
            'div',
            { className: 'flex items-center gap-2' },
            React.createElement('button', {
              onClick: function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof onDeleteMovement === 'function') onDeleteMovement(movement.id);
              },
              className:
                'inline-flex items-center justify-center w-8 h-8 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors cursor-pointer border border-red-200',
              title: 'Delete Movement',
              type: 'button',
              style: { minWidth: '32px', minHeight: '32px' }
            }, React.createElement('i', { className: 'fas fa-trash text-sm' }))
          )
        )
      );
    }

    const recordLabel =
      movements.length > 0
        ? '(' +
          (hasActiveFilters
            ? filteredMovements.length + ' of ' + movements.length
            : movements.length) +
          ' records' +
          (function () {
            const source = hasActiveFilters ? filteredMovements : movements;
            const typeCounts = source.reduce(function (acc, m) {
              acc[m.type] = (acc[m.type] || 0) + 1;
              return acc;
            }, {});
            const breakdown = Object.entries(typeCounts)
              .map(function (e) {
                return e[0] + ': ' + e[1];
              })
              .join(', ');
            return breakdown ? ' — ' + breakdown : '';
          })() +
          ')'
        : null;

    return React.createElement(
      'div',
      { className: 'space-y-3 min-w-0 max-w-full w-full' },
      React.createElement(
        'div',
        { className: 'bg-white p-3 rounded-lg border border-gray-200 min-w-0' },
        React.createElement(
          'div',
          { className: 'flex items-center justify-between flex-wrap gap-2' },
          React.createElement(
            'h3',
            { className: 'text-sm font-semibold text-gray-900' },
            'Stock Movements',
            recordLabel &&
              React.createElement('span', { className: 'ml-2 text-xs font-normal text-gray-500' }, recordLabel)
          ),
          React.createElement(
            'div',
            { className: 'flex items-center gap-2' },
            React.createElement(
              'button',
              {
                onClick: onRefreshMovements,
                className:
                  'px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2',
                title: 'Refresh movements list',
                type: 'button'
              },
              React.createElement('i', { className: 'fas fa-sync-alt text-xs' }),
              ' Refresh'
            ),
            React.createElement(
              'button',
              {
                onClick: handleExportMovements,
                disabled: isExporting || !movementsLoadedFromAPI || filteredMovements.length === 0,
                className:
                  'px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
                title: hasActiveFilters
                  ? 'Download filtered movements to Excel'
                  : 'Download all movements to Excel',
                type: 'button'
              },
              React.createElement('i', {
                className: (isExporting ? 'fas fa-spinner animate-spin' : 'fas fa-download') + ' text-xs'
              }),
              isExporting ? ' Exporting…' : ' Export'
            ),
            hasActiveFilters &&
              React.createElement(
                'button',
                {
                  onClick: clearColumnFilters,
                  className:
                    'px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-red-600',
                  title: 'Clear column filters',
                  type: 'button'
                },
                React.createElement('i', { className: 'fas fa-times text-xs' }),
                ' Clear filters'
              ),
            React.createElement(
              'button',
              {
                onClick: handleRecordClick,
                onMouseDown: function (e) {
                  e.preventDefault();
                },
                className:
                  'px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors cursor-pointer',
                type: 'button',
                'aria-label': 'Record Stock Movement'
              },
              React.createElement('i', { className: 'fas fa-plus text-xs' }),
              ' Record Movement'
            )
          )
        ),
        React.createElement(
          'p',
          { className: 'mt-2 text-xs text-gray-500' },
          'Type in the filter boxes under each column heading to narrow the list. Use Refresh if another user posted changes while this tab stayed open.'
        )
      ),
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg border border-gray-200 overflow-hidden min-w-0' },
        React.createElement(
          'div',
          { className: 'inventory-desktop-xscroll overflow-x-auto w-full min-w-0' },
          React.createElement(
            'table',
            { className: 'w-full min-w-max' },
            React.createElement(
              'thead',
              { className: 'bg-gray-50 border-b border-gray-200' },
              React.createElement(
                'tr',
                null,
                MOVEMENT_COLUMNS.map(function (col) {
                  return React.createElement(
                    'th',
                    {
                      key: col.label,
                      className:
                        'px-3 py-2 text-xs font-medium text-gray-500 ' +
                        (col.align === 'right' ? 'text-right' : 'text-left')
                    },
                    col.label
                  );
                }),
                React.createElement(
                  'th',
                  { className: 'px-3 py-2 text-left text-xs font-medium text-gray-500' },
                  'Actions'
                )
              ),
              React.createElement(
                'tr',
                { key: 'movements-filter-row', className: 'bg-gray-50 border-b border-gray-200' },
                MOVEMENT_COLUMNS.map(renderFilterInput),
                React.createElement(
                  'th',
                  { className: 'px-3 py-1.5' },
                  hasActiveFilters
                    ? React.createElement(
                        'button',
                        {
                          onClick: clearColumnFilters,
                          className: 'text-xs text-red-600 hover:text-red-800',
                          title: 'Clear all filters',
                          type: 'button'
                        },
                        React.createElement('i', { className: 'fas fa-times' })
                      )
                    : null
                )
              )
            ),
            React.createElement(
              'tbody',
              { className: 'divide-y divide-gray-200' },
              !movementsLoadedFromAPI
                ? React.createElement(
                    'tr',
                    null,
                    React.createElement(
                      'td',
                      { colSpan: 11, className: 'px-3 py-8 text-center text-sm text-gray-500' },
                      React.createElement(
                        'span',
                        { className: 'inline-flex items-center gap-2' },
                        React.createElement('span', {
                          className:
                            'animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600',
                          'aria-hidden': 'true'
                        }),
                        'Loading movements…'
                      )
                    )
                  )
                : movements.length === 0
                  ? React.createElement(
                      'tr',
                      null,
                      React.createElement(
                        'td',
                        { colSpan: 11, className: 'px-3 py-8 text-center text-sm text-gray-500' },
                        'No stock movements found. Click "Record Movement" to create one.'
                      )
                    )
                  : filteredMovements.length === 0
                    ? React.createElement(
                        'tr',
                        null,
                        React.createElement(
                          'td',
                          { colSpan: 11, className: 'px-3 py-8 text-center text-sm text-gray-500' },
                          'No movements match the current column filters.',
                          React.createElement(
                            'button',
                            {
                              type: 'button',
                              onClick: clearColumnFilters,
                              className: 'ml-2 text-blue-600 hover:text-blue-800 underline'
                            },
                            'Clear filters'
                          )
                        )
                      )
                    : filteredMovements.map(renderMovementRow)
            )
          )
        )
      )
    );
  }

  window.ManufacturingMovementsView = ManufacturingMovementsView;
})();
