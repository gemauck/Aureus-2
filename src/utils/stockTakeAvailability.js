/** @typedef {'all' | 'in_stock' | 'out_of_stock'} StockTakeAvailabilityFilter */

export const STOCK_TAKE_AVAILABILITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'out_of_stock', label: 'Out of stock' }
];

/** System on-hand qty at the selected location when the stock-take list was built. */
export function stockTakeRowSystemQty(row) {
  const n = Number(row?.quantity ?? row?.systemQty ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {unknown} row
 * @param {StockTakeAvailabilityFilter} filter
 */
export function stockTakeRowMatchesAvailability(row, filter) {
  if (!filter || filter === 'all') return true;
  const qty = stockTakeRowSystemQty(row);
  if (filter === 'in_stock') return qty > 0;
  if (filter === 'out_of_stock') return qty <= 0;
  return true;
}

/**
 * @param {StockTakeAvailabilityFilter} filter
 */
export function stockTakeAvailabilityEmptyMessage(filter) {
  if (filter === 'in_stock') return 'No in-stock lines at this location.';
  if (filter === 'out_of_stock') return 'No out-of-stock lines at this location.';
  return 'No lines match your filters.';
}
