import {
  normalizeInventoryItemRow,
  inventoryRowTotalValueForQuantity,
  inventoryLineTotalValue
} from '../../src/utils/manufacturingInventoryValue.js';

describe('manufacturingInventoryValue', () => {
  test('normalizeInventoryItemRow prefers API totalValue', () => {
    const row = { quantity: 10, unitCost: 5, totalValue: 999 };
    expect(normalizeInventoryItemRow(row).totalValue).toBe(999);
  });

  test('normalizeInventoryItemRow falls back to qty × unitCost', () => {
    const row = { quantity: 10, unitCost: 5 };
    expect(normalizeInventoryItemRow(row).totalValue).toBe(50);
  });

  test('inventoryRowTotalValueForQuantity uses API totalValue when quantity matches row', () => {
    const row = { quantity: 10, unitCost: 5, totalValue: 47 };
    expect(inventoryRowTotalValueForQuantity(row, 10)).toBe(47);
  });

  test('inventoryRowTotalValueForQuantity recomputes when displayed quantity differs', () => {
    const row = { quantity: 10, unitCost: 5, totalValue: 50 };
    expect(inventoryRowTotalValueForQuantity(row, 2)).toBe(inventoryLineTotalValue(2, 5));
  });
});
