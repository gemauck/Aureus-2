/** Stock pick-list helpers shared by wizard and stock-take flows. */

export function jobCardQuantityAtLocation(item, locationId) {
  if (!item || !locationId) return 0;
  const locs = Array.isArray(item.locations) ? item.locations : [];
  if (locs.length > 0) {
    const loc = locs.find((l) => l.locationId === locationId);
    return loc ? Number(loc.quantity) || 0 : 0;
  }
  if (item.locationId === locationId) {
    return Number(item.quantity) || 0;
  }
  return 0;
}

export function jobCardStockPickListFromCachedInventory(items, locationId, options = {}) {
  if (!locationId || !Array.isArray(items)) return [];
  const includeZeroQty = options.includeZeroQty === true;
  const out = [];
  for (const item of items) {
    const locs = Array.isArray(item.locations) ? item.locations : [];
    const atWarehouse = locs.length
      ? locs.some((l) => l.locationId === locationId)
      : item.locationId === locationId;
    const q = jobCardQuantityAtLocation(item, locationId);
    if (includeZeroQty) {
      if (!atWarehouse || q < 0) continue;
    } else if (q <= 0) {
      continue;
    }
    const sku = item.sku || item.id;
    if (!sku) continue;
    if (item.status === 'inactive') continue;
    out.push({ ...item, quantity: q, sku });
  }
  out.sort((a, b) =>
    String(a.name || a.sku || '').localeCompare(String(b.name || b.sku || ''), undefined, {
      sensitivity: 'base'
    })
  );
  return out;
}

export function jobCardStockTakePickListFromCachedInventory(items, locationId) {
  if (!locationId || !Array.isArray(items)) return [];
  const bySku = new Map();
  for (const item of items) {
    if (!item || item.status === 'inactive') continue;
    const sku = String(item.sku || item.id || '').trim();
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, item);
  }
  const out = [];
  for (const item of bySku.values()) {
    const q = jobCardQuantityAtLocation(item, locationId);
    if (q < 0) continue;
    const sku = String(item.sku || item.id || '').trim();
    out.push({ ...item, quantity: q, sku });
  }
  out.sort((a, b) =>
    String(a.name || a.sku || '').localeCompare(String(b.name || b.sku || ''), undefined, {
      sensitivity: 'base'
    })
  );
  return out;
}
