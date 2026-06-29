import { describe, expect, test } from '@jest/globals';
import {
  findPendingStockEntryRows,
  flushPendingStockEntryRows,
  isCompleteStockEntryRow,
  clearFlushedStockEntryRows
} from '../../../src/jobCardWizard/stockEntryFlush.js';

describe('stockEntryFlush', () => {
  test('isCompleteStockEntryRow requires location, sku, and positive qty', () => {
    expect(isCompleteStockEntryRow({ locationId: 'loc1', sku: 'SKU1', quantity: 2 })).toBe(true);
    expect(isCompleteStockEntryRow({ locationId: 'loc1', sku: 'SKU1', quantity: 0 })).toBe(false);
    expect(isCompleteStockEntryRow({ locationId: '', sku: 'SKU1', quantity: 1 })).toBe(false);
  });

  test('findPendingStockEntryRows detects ether rows', () => {
    const rows = [
      { id: 'r1', locationId: 'loc1', sku: 'SKU1', quantity: 2 },
      { id: 'r2', locationId: 'loc1', sku: '', quantity: 0 }
    ];
    const used = [{ id: 'r9', sku: 'SKU9', locationId: 'loc1', quantity: 1 }];
    expect(findPendingStockEntryRows(rows, used)).toHaveLength(1);
    expect(findPendingStockEntryRows(rows, used)[0].id).toBe('r1');
  });

  test('findPendingStockEntryRows ignores rows already on stockUsed', () => {
    const rows = [{ id: 'r1', locationId: 'loc1', sku: 'SKU1', quantity: 2 }];
    const used = [{ id: 'r1', sku: 'SKU1', locationId: 'loc1', quantity: 2, itemName: 'Part' }];
    expect(findPendingStockEntryRows(rows, used)).toHaveLength(0);
  });

  test('findPendingStockEntryRows treats edited row as pending', () => {
    const rows = [{ id: 'r1', locationId: 'loc1', sku: 'SKU1', quantity: 5 }];
    const used = [{ id: 'r1', sku: 'SKU1', locationId: 'loc1', quantity: 2 }];
    expect(findPendingStockEntryRows(rows, used)).toHaveLength(1);
  });

  test('flushPendingStockEntryRows merges ether lines and resolves names', () => {
    const result = flushPendingStockEntryRows({
      stockEntryRows: [{ id: 'entry-1', locationId: 'loc1', sku: 'SKU44', quantity: 3 }],
      stockUsed: [],
      stockLocations: [{ id: 'loc1', name: 'Ethan Van' }],
      inventory: [{ sku: 'SKU44', name: 'Cable', unitCost: 12.5 }]
    });
    expect(result.flushed).toHaveLength(1);
    expect(result.stockUsed).toHaveLength(1);
    expect(result.stockUsed[0]).toMatchObject({
      id: 'entry-1',
      sku: 'SKU44',
      quantity: 3,
      locationId: 'loc1',
      locationName: 'Ethan Van',
      itemName: 'Cable',
      unitCost: 12.5
    });
    expect(result.clearedRowIds).toEqual(['entry-1']);
  });

  test('clearFlushedStockEntryRows clears sku and qty on flushed rows', () => {
    const next = clearFlushedStockEntryRows(
      [{ id: 'a', locationId: 'loc1', sku: 'SKU1', quantity: 2 }],
      ['a']
    );
    expect(next[0]).toMatchObject({ locationId: 'loc1', sku: '', quantity: 0 });
  });
});
