/**
 * Normalize job card stock-used rows before save/sync (wizard + classic editor).
 * Matches api/_lib/jobCardStockMovements.js parse rules (sku, locationId, qty > 0).
 */
export function sanitizeJobCardStockUsedForSave(stockUsed) {
  const rows = Array.isArray(stockUsed) ? stockUsed : [];
  return rows
    .filter((row) => {
      if (!row || typeof row !== 'object') return false;
      const sku = String(row.sku || '').trim();
      const locationId = String(row.locationId || row.location || '').trim();
      const qty = parseFloat(row.quantity);
      return sku && locationId && Number.isFinite(qty) && qty > 0;
    })
    .map((row) => {
      const sku = String(row.sku).trim();
      const locationId = String(row.locationId || row.location).trim();
      const out = {
        sku,
        quantity: parseFloat(row.quantity),
        locationId,
        locationName: String(row.locationName || '').trim(),
        itemName: String(row.itemName || row.name || '').trim()
      };
      if (row.id != null && String(row.id).trim()) {
        out.id = String(row.id).trim();
      }
      if (row.unitCost !== undefined && row.unitCost !== null && row.unitCost !== '') {
        const uc = parseFloat(row.unitCost);
        if (Number.isFinite(uc)) out.unitCost = uc;
      }
      return out;
    });
}
