/**
 * Merge in-progress stock entry rows (location + SKU + qty filled) into stockUsed before save.
 * Prevents "ether" lines that never reached "+ Add to job card".
 */

function parsePositiveQty(value) {
  const qty = parseFloat(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/** Row has enough data to become a stock-used line. */
export function isCompleteStockEntryRow(row) {
  if (!row || typeof row !== 'object') return false;
  const locationId = String(row.locationId || row.location || '').trim();
  const sku = String(row.sku || '').trim();
  return Boolean(locationId && sku && parsePositiveQty(row.quantity) > 0);
}

function stockUsedLineMatchesRow(line, row) {
  if (!line || !row) return false;
  const rowId = String(row.id || '').trim();
  const lineId = String(line.id || '').trim();
  if (!rowId || !lineId || rowId !== lineId) return false;
  const locationId = String(row.locationId || row.location || '').trim();
  return (
    String(line.sku || '').trim() === String(row.sku || '').trim() &&
    String(line.locationId || line.location || '').trim() === locationId &&
    parsePositiveQty(line.quantity) === parsePositiveQty(row.quantity)
  );
}

/**
 * Entry rows with selections that are not yet reflected on stockUsed (or were edited after add).
 * @param {Array} stockEntryRows
 * @param {Array} stockUsed
 */
export function findPendingStockEntryRows(stockEntryRows, stockUsed = []) {
  const used = Array.isArray(stockUsed) ? stockUsed : [];
  return (Array.isArray(stockEntryRows) ? stockEntryRows : []).filter((row) => {
    if (!isCompleteStockEntryRow(row)) return false;
    return !used.some((line) => stockUsedLineMatchesRow(line, row));
  });
}

function resolveInventoryItem(sku, locationId, inventory, inventoryByLocation) {
  const locKey = locationId != null ? String(locationId) : '';
  const locRows = inventoryByLocation?.[locKey];
  if (Array.isArray(locRows)) {
    const hit = locRows.find((item) => item?.sku === sku || item?.id === sku);
    if (hit) return hit;
  }
  return (Array.isArray(inventory) ? inventory : []).find(
    (item) => item?.sku === sku || item?.id === sku
  );
}

function stockLineFromEntryRow(row, { locationName = '', itemName = '', unitCost } = {}) {
  const locationId = String(row.locationId || row.location || '').trim();
  const sku = String(row.sku || '').trim();
  const quantity = parsePositiveQty(row.quantity);
  const line = {
    id: String(row.id || '').trim() || `stock-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sku,
    quantity,
    locationId,
    locationName: String(locationName || '').trim(),
    itemName: String(itemName || sku).trim()
  };
  if (unitCost !== undefined && unitCost !== null && unitCost !== '') {
    const uc = parseFloat(unitCost);
    if (Number.isFinite(uc)) line.unitCost = uc;
  }
  return line;
}

/**
 * @param {object} opts
 * @param {Array} opts.stockEntryRows
 * @param {Array} opts.stockUsed
 * @param {Array} [opts.stockLocations]
 * @param {Array} [opts.inventory]
 * @param {Record<string, Array>} [opts.inventoryByLocation]
 * @returns {{ stockUsed: Array, flushed: Array, clearedRowIds: string[] }}
 */
export function flushPendingStockEntryRows({
  stockEntryRows = [],
  stockUsed = [],
  stockLocations = [],
  inventory = [],
  inventoryByLocation = null
} = {}) {
  const pending = findPendingStockEntryRows(stockEntryRows, stockUsed);
  if (!pending.length) {
    return { stockUsed: Array.isArray(stockUsed) ? [...stockUsed] : [], flushed: [], clearedRowIds: [] };
  }

  let next = Array.isArray(stockUsed) ? [...stockUsed] : [];
  const flushed = [];
  const clearedRowIds = [];

  for (const row of pending) {
    const locationId = String(row.locationId || row.location || '').trim();
    const sku = String(row.sku || '').trim();
    const loc = (Array.isArray(stockLocations) ? stockLocations : []).find(
      (l) => String(l?.id) === locationId || String(l?.code) === locationId
    );
    const invItem = resolveInventoryItem(sku, locationId, inventory, inventoryByLocation);
    const line = stockLineFromEntryRow(row, {
      locationName: loc?.name || loc?.code || '',
      itemName: invItem?.name || invItem?.itemName || sku,
      unitCost: invItem?.unitCost
    });
    const lineId = String(line.id);
    next = next.filter((x) => String(x?.id || '') !== lineId);
    next.push(line);
    flushed.push(line);
    if (String(row.id || '').trim()) clearedRowIds.push(String(row.id));
  }

  return { stockUsed: next, flushed, clearedRowIds };
}

/** Reset entry rows that were flushed so the UI does not show duplicate drafts. */
export function clearFlushedStockEntryRows(stockEntryRows, clearedRowIds = []) {
  const ids = new Set((clearedRowIds || []).map((id) => String(id)));
  if (!ids.size) return stockEntryRows;
  return (Array.isArray(stockEntryRows) ? stockEntryRows : []).map((row) =>
    ids.has(String(row.id)) ? { ...row, sku: '', quantity: 0 } : row
  );
}
