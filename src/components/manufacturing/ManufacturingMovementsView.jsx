/**
 * Stock Movements tab view for Manufacturing.
 * Loaded by lazy-load-components and attached to window.ManufacturingMovementsView.
 * Parent (Manufacturing.jsx) passes movements, loading state, and callbacks.
 */
(function () {
  const React = window.React;
  if (!React) return;

  function ManufacturingMovementsView({
    movements = [],
    movementsLoadedFromAPI = false,
    onRecordMovement,
    onRefreshMovements,
    onDeleteMovement,
    getStatusColor,
    getLocationLabel
  }) {
    const handleRecordClick = (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (typeof onRecordMovement === 'function') {
        onRecordMovement();
      }
    };

    return React.createElement('div', { className: 'space-y-3' },
      React.createElement('div', { className: 'bg-white p-3 rounded-lg border border-gray-200' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('h3', { className: 'text-sm font-semibold text-gray-900' },
            'Stock Movements',
            movements.length > 0 && React.createElement('span', { className: 'ml-2 text-xs font-normal text-gray-500' },
              '(' + movements.length + ' records',
              (() => {
                const typeCounts = movements.reduce((acc, m) => {
                  acc[m.type] = (acc[m.type] || 0) + 1;
                  return acc;
                }, {});
                const breakdown = Object.entries(typeCounts).map(function (e) { return e[0] + ': ' + e[1]; }).join(', ');
                return breakdown ? ' - ' + breakdown : '';
              })(),
              ')'
            )
          ),
          React.createElement('div', { className: 'flex items-center gap-2' },
            React.createElement('button', {
              onClick: onRefreshMovements,
              className: 'px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2',
              title: 'Refresh movements list',
              type: 'button'
            }, React.createElement('i', { className: 'fas fa-sync-alt text-xs' }), ' Refresh'),
            React.createElement('button', { className: 'px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2', type: 'button' },
              React.createElement('i', { className: 'fas fa-filter text-xs' }), ' Filter'),
            React.createElement('button', {
              onClick: handleRecordClick,
              onMouseDown: function (e) { e.preventDefault(); },
              className: 'px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors cursor-pointer',
              type: 'button',
              'aria-label': 'Record Stock Movement'
            }, React.createElement('i', { className: 'fas fa-plus text-xs' }), ' Record Movement')
          )
        )
      ),
      React.createElement('div', { className: 'bg-white rounded-lg border border-gray-200 overflow-hidden' },
        React.createElement('div', { className: 'overflow-x-auto' },
          React.createElement('table', { className: 'w-full' },
            React.createElement('thead', { className: 'bg-gray-50 border-b border-gray-200' },
              React.createElement('tr', null,
                ['Movement ID', 'Date', 'Type', 'Item', 'Quantity', 'From Location', 'To Location', 'Reference', 'Performed By', 'Notes', 'Actions'].map(function (label) {
                  return React.createElement('th', { key: label, className: label === 'Quantity' ? 'px-3 py-2 text-right text-xs font-medium text-gray-500' : 'px-3 py-2 text-left text-xs font-medium text-gray-500' }, label);
                })
              )
            ),
            React.createElement('tbody', { className: 'divide-y divide-gray-200' },
              !movementsLoadedFromAPI
                ? React.createElement('tr', null,
                    React.createElement('td', { colSpan: 11, className: 'px-3 py-8 text-center text-sm text-gray-500' },
                      React.createElement('span', { className: 'inline-flex items-center gap-2' },
                        React.createElement('span', { className: 'animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600', 'aria-hidden': 'true' }),
                        'Loading movements…'
                      )
                    )
                  )
                : movements.length === 0
                  ? React.createElement('tr', null,
                      React.createElement('td', { colSpan: 11, className: 'px-3 py-8 text-center text-sm text-gray-500' },
                        'No stock movements found. Click "Record Movement" to create one.'
                      )
                    )
                  : movements.map(function (movement) {
                      const qty = parseFloat(movement.quantity) || 0;
                      let qtyDisplay;
                      if (movement.type === 'receipt' || movement.type === 'production') {
                        qtyDisplay = '+' + Math.abs(qty);
                      } else if (movement.type === 'consumption' || movement.type === 'sale') {
                        qtyDisplay = '' + (-Math.abs(qty));
                      } else {
                        qtyDisplay = qty > 0 ? '+' + qty : '' + qty;
                      }
                      const qtyClass = (movement.type === 'receipt' || movement.type === 'production') ? 'text-green-600' : (movement.type === 'consumption' || movement.type === 'sale') ? 'text-red-600' : 'text-gray-900';
                      return React.createElement('tr', { key: movement.id, className: 'hover:bg-gray-50' },
                        React.createElement('td', { className: 'px-3 py-2 text-sm font-medium text-gray-900' }, movement.movementId || movement.id),
                        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-900' }, movement.date),
                        React.createElement('td', { className: 'px-3 py-2' },
                          React.createElement('span', { className: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ' + (getStatusColor ? getStatusColor(movement.type) : 'text-gray-600 bg-gray-50') }, movement.type)
                        ),
                        React.createElement('td', { className: 'px-3 py-2' },
                          React.createElement('div', { className: 'text-sm font-medium text-gray-900' }, movement.itemName),
                          React.createElement('div', { className: 'text-xs text-gray-500' }, movement.sku)
                        ),
                        React.createElement('td', { className: 'px-3 py-2 text-sm font-semibold text-right ' + qtyClass }, qtyDisplay),
                        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-600' }, getLocationLabel ? getLocationLabel(movement.fromLocation) : movement.fromLocation),
                        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-600' }, (getLocationLabel ? getLocationLabel(movement.toLocation) : movement.toLocation) || '-'),
                        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-600' }, movement.reference),
                        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-600' }, movement.performedBy),
                        React.createElement('td', { className: 'px-3 py-2 text-sm text-gray-500' }, movement.notes),
                        React.createElement('td', { className: 'px-3 py-2' },
                          React.createElement('div', { className: 'flex items-center gap-2' },
                            React.createElement('button', {
                              onClick: function (e) {
                                e.preventDefault();
                                e.stopPropagation();
                                if (typeof onDeleteMovement === 'function') onDeleteMovement(movement.id);
                              },
                              className: 'inline-flex items-center justify-center w-8 h-8 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors cursor-pointer border border-red-200',
                              title: 'Delete Movement',
                              type: 'button',
                              style: { minWidth: '32px', minHeight: '32px' }
                            }, React.createElement('i', { className: 'fas fa-trash text-sm' }))
                          )
                        )
                      );
                    })
            )
          )
        )
      )
    );
  }

  window.ManufacturingMovementsView = ManufacturingMovementsView;
})();
