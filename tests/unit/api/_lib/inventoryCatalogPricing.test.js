import { computedInventoryTotalValue } from '../../../../api/_lib/inventoryValue.js'
import {
  catalogUnitCostForSku,
  legacyCatalogUnitCostForSku,
  inventoryLineValueForLocationRow,
  sumLocationInventoryValueByCatalogCost
} from '../../../../api/_lib/inventoryCatalogUnitCost.js'

describe('inventory catalog pricing (no per-location unit cost)', () => {
  const catalogTemplate = {
    id: 'cat-1',
    sku: 'SKU-TEST',
    name: 'Widget',
    unitCost: 125.5
  }

  const legacyDifferentLocationCost = {
    sku: 'SKU-TEST',
    quantity: 4,
    unitCost: 999.99
  }

  test('catalogUnitCostForSku uses InventoryItem unitCost only', () => {
    expect(catalogUnitCostForSku(catalogTemplate)).toBe(125.5)
    expect(catalogUnitCostForSku({})).toBe(0)
    expect(catalogUnitCostForSku(null)).toBe(0)
  })

  test('location row unit cost is not read (legacy field ignored)', () => {
    expect(catalogUnitCostForSku(catalogTemplate)).toBe(
      legacyCatalogUnitCostForSku(catalogTemplate, legacyDifferentLocationCost)
    )
  })

  test('inventory line value matches qty × catalog cost when catalog exists', () => {
    const qty = 4
    const { unitCost, totalValue } = inventoryLineValueForLocationRow(
      catalogTemplate,
      legacyDifferentLocationCost,
      qty
    )
    expect(unitCost).toBe(125.5)
    expect(totalValue).toBe(computedInventoryTotalValue(qty, 125.5))
    expect(totalValue).not.toBe(computedInventoryTotalValue(qty, 999.99))
  })

  test('multi-location rows for same SKU use identical unit cost', () => {
    const locA = { sku: 'SKU-TEST', quantity: 3, unitCost: 10 }
    const locB = { sku: 'SKU-TEST', quantity: 7, unitCost: 500 }
    const templateBySku = new Map([['SKU-TEST', catalogTemplate]])

    const vA = inventoryLineValueForLocationRow(catalogTemplate, locA, locA.quantity)
    const vB = inventoryLineValueForLocationRow(catalogTemplate, locB, locB.quantity)

    expect(vA.unitCost).toBe(vB.unitCost)
    expect(vA.unitCost).toBe(125.5)
    expect(vA.totalValue + vB.totalValue).toBe(
      computedInventoryTotalValue(10, 125.5)
    )
  })

  test('location value rollup equals sum of qty × catalog cost per row', () => {
    const rows = [
      { sku: 'SKU-TEST', quantity: 2, locationId: 'loc-a' },
      { sku: 'SKU-TEST', quantity: 5, locationId: 'loc-b' },
      { sku: 'SKU-OTHER', quantity: 1, locationId: 'loc-a' }
    ]
    const templateBySku = new Map([
      ['SKU-TEST', catalogTemplate],
      ['SKU-OTHER', { id: 'cat-2', sku: 'SKU-OTHER', unitCost: 40 }]
    ])

    const rollup = sumLocationInventoryValueByCatalogCost(rows, templateBySku)
    const expected =
      computedInventoryTotalValue(2, 125.5) +
      computedInventoryTotalValue(5, 125.5) +
      computedInventoryTotalValue(1, 40)

    expect(rollup).toBe(expected)
  })

  test('rollup unchanged vs legacy when every SKU has a catalog row', () => {
    const rows = [
      { sku: 'SKU-TEST', quantity: 2, unitCost: 1 },
      { sku: 'SKU-TEST', quantity: 3, unitCost: 999 }
    ]
    const templateBySku = new Map([['SKU-TEST', catalogTemplate]])

    let legacyTotal = 0
    for (const row of rows) {
      const template = templateBySku.get(row.sku) || {}
      const uc = legacyCatalogUnitCostForSku(template, row)
      legacyTotal += computedInventoryTotalValue(row.quantity, uc)
    }

    const catalogTotal = sumLocationInventoryValueByCatalogCost(rows, templateBySku)
    expect(catalogTotal).toBe(legacyTotal)
  })

  test('orphan SKU without catalog: legacy used location cost, catalog-only is zero', () => {
    const orphanRow = { sku: 'ORPHAN', quantity: 2, unitCost: 88 }
    const legacy = legacyCatalogUnitCostForSku({}, orphanRow)
    const current = catalogUnitCostForSku({})

    expect(legacy).toBe(88)
    expect(current).toBe(0)
    expect(computedInventoryTotalValue(orphanRow.quantity, current)).toBe(0)
  })
})
