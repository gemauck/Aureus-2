/**
 * Merge in-progress wizard fields into job card form data before save.
 * Catches stock entry rows and ad-hoc material drafts that were filled but not added.
 */
import {
  flushPendingStockEntryRows,
  clearFlushedStockEntryRows,
  findPendingStockEntryRows
} from './stockEntryFlush.js';

export { findPendingStockEntryRows, flushPendingStockEntryRows, clearFlushedStockEntryRows };

export function emptyMaterialDraft() {
  return { itemName: '', description: '', reason: '', cost: '' };
}

export function isCompleteMaterialDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  const itemName = String(draft.itemName || '').trim();
  const cost = parseFloat(draft.cost);
  return Boolean(itemName && Number.isFinite(cost) && cost > 0);
}

/** Material form with name + cost filled but not yet added to materialsBought. */
export function findPendingMaterialDraft(materialDraft) {
  return isCompleteMaterialDraft(materialDraft) ? materialDraft : null;
}

export function flushPendingMaterialDraft(materialDraft, materialsBought = []) {
  if (!isCompleteMaterialDraft(materialDraft)) {
    return {
      materialsBought: Array.isArray(materialsBought) ? [...materialsBought] : [],
      flushed: null,
      clearDraft: false
    };
  }
  const line = {
    id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    itemName: String(materialDraft.itemName).trim(),
    description: String(materialDraft.description || '').trim(),
    reason: String(materialDraft.reason || '').trim(),
    cost: parseFloat(materialDraft.cost)
  };
  return {
    materialsBought: [...(Array.isArray(materialsBought) ? materialsBought : []), line],
    flushed: line,
    clearDraft: true
  };
}

/**
 * @param {object} opts
 * @returns {{
 *   stockUsed: Array,
 *   stockEntryRows: Array,
 *   materialsBought: Array,
 *   materialDraft: object,
 *   flushedStock: Array,
 *   flushedMaterial: object|null
 * }}
 */
export function flushJobCardWizardEphemeralFields({
  stockEntryRows = [],
  stockUsed = [],
  stockLocations = [],
  inventory = [],
  inventoryByLocation = null,
  materialDraft = null,
  materialsBought = []
} = {}) {
  const stock = flushPendingStockEntryRows({
    stockEntryRows,
    stockUsed,
    stockLocations,
    inventory,
    inventoryByLocation
  });
  const mat = flushPendingMaterialDraft(materialDraft, materialsBought);

  return {
    stockUsed: stock.stockUsed,
    stockEntryRows: clearFlushedStockEntryRows(stockEntryRows, stock.clearedRowIds),
    materialsBought: mat.materialsBought,
    materialDraft: mat.clearDraft ? emptyMaterialDraft() : materialDraft || emptyMaterialDraft(),
    flushedStock: stock.flushed,
    flushedMaterial: mat.flushed
  };
}

/** Preserve submitted/completed status during lightweight local-only saves. */
export function lightweightSaveStatus(currentStatus) {
  const s = String(currentStatus || '').trim().toLowerCase();
  if (s && s !== 'draft' && s !== 'cancelled') return s;
  return 'draft';
}
