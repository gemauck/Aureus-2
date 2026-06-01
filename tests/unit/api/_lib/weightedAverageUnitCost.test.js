import { computedInventoryTotalValue } from '../../../../api/_lib/inventoryValue.js'
import {
  applyCatalogWeightedAverageCostTx,
  computeWeightedAverageUnitCost,
  roundUnitCost,
  syncCatalogTotalValueForSkuTx
} from '../../../../api/_lib/weightedAverageUnitCost.js'

function makeTx({
  onHand = 0,
  unitCost = 0,
  lastInboundUnitPrice = 0,
  lastInboundAt = null,
  sku = 'SKU-1',
  canonicalId = 'inv-1'
} = {}) {
  const catalogRow = {
    id: canonicalId,
    sku,
    unitCost,
    lastInboundUnitPrice,
    lastInboundAt,
    quantity: onHand,
    reorderPoint: 0
  }
  const updateManyCalls = []
  const updateCalls = []
  return {
    inventoryItem: {
      findMany: async () => [catalogRow],
      updateMany: async ({ data }) => {
        updateManyCalls.push(data)
        Object.assign(catalogRow, data)
        return { count: 1 }
      },
      update: async ({ where, data }) => {
        updateCalls.push({ where, data })
        Object.assign(catalogRow, data)
        return { ...catalogRow }
      }
    },
    locationInventory: {
      aggregate: async () => ({ _sum: { quantity: onHand } })
    },
    _catalogRow: catalogRow,
    _updateManyCalls: updateManyCalls,
    _updateCalls: updateCalls
  }
}

describe('weightedAverageUnitCost', () => {
  describe('roundUnitCost', () => {
    test('rounds to 4 decimal places', () => {
      expect(roundUnitCost(10.123456)).toBe(10.1235)
    })

    test('returns 0 for non-finite input', () => {
      expect(roundUnitCost(NaN)).toBe(0)
      expect(roundUnitCost(Infinity)).toBe(0)
    })
  })

  describe('computeWeightedAverageUnitCost', () => {
    test('first receipt (zero on-hand) uses inbound price', () => {
      expect(computeWeightedAverageUnitCost(0, 0, 10, 100)).toBe(100)
      expect(computeWeightedAverageUnitCost(0, 999, 3, 657)).toBe(657)
    })

    test('second receipt blends weighted average', () => {
      // 10 @ 100 + 5 @ 130 => (1000 + 650) / 15 = 110
      expect(computeWeightedAverageUnitCost(10, 100, 5, 130)).toBe(110)
    })

    test('three-step blend matches catalog-style scenario (avg 219)', () => {
      // 1 @ 100 then 2 @ 278.5 => (100 + 557) / 3 = 219
      const afterFirst = computeWeightedAverageUnitCost(0, 0, 1, 100)
      expect(afterFirst).toBe(100)
      const afterSecond = computeWeightedAverageUnitCost(1, afterFirst, 2, 278.5)
      expect(afterSecond).toBe(219)
    })

    test('receipt at higher price after established average', () => {
      // 3 @ 219 + 1 @ 657 => (657 + 657) / 4 = 328.5 — not 219; documents blend math
      expect(computeWeightedAverageUnitCost(3, 219, 1, 657)).toBe(328.5)
    })

    test('zero inbound qty keeps old cost', () => {
      expect(computeWeightedAverageUnitCost(10, 100, 0, 130)).toBe(100)
    })

    test('zero inbound price keeps old cost', () => {
      expect(computeWeightedAverageUnitCost(10, 100, 5, 0)).toBe(100)
    })

    test('negative inbound qty keeps old cost', () => {
      expect(computeWeightedAverageUnitCost(10, 100, -3, 50)).toBe(100)
    })

    test('fractional quantities and prices round consistently', () => {
      // 0.5 @ 10 + 0.5 @ 20 => 15
      expect(computeWeightedAverageUnitCost(0.5, 10, 0.5, 20)).toBe(15)
    })

    test('large values stay finite and rounded', () => {
      const result = computeWeightedAverageUnitCost(10000, 99.9999, 1, 200)
      expect(result).toBe(roundUnitCost((10000 * 99.9999 + 200) / 10001))
      expect(Number.isFinite(result)).toBe(true)
    })
  })

  describe('applyCatalogWeightedAverageCostTx', () => {
    test('updates all SKU rows with blended cost and last inbound when priced', async () => {
      const tx = makeTx({ onHand: 10, unitCost: 100 })
      const result = await applyCatalogWeightedAverageCostTx(tx, {
        sku: 'SKU-1',
        inboundQty: 5,
        inboundUnitPrice: 130,
        inboundAt: new Date('2024-06-15')
      })

      expect(result.newUnitCost).toBe(110)
      expect(result.previousUnitCost).toBe(100)
      expect(result.onHandBefore).toBe(10)
      expect(result.lastInboundUnitPrice).toBe(130)
      expect(tx._catalogRow.unitCost).toBe(110)
      expect(tx._catalogRow.lastInboundUnitPrice).toBe(130)
      expect(tx._catalogRow.lastInboundAt).toEqual(new Date('2024-06-15'))
      expect(tx._updateManyCalls).toHaveLength(1)
    })

    test('unpriced inbound does not update lastInbound fields', async () => {
      const tx = makeTx({
        onHand: 5,
        unitCost: 100,
        lastInboundUnitPrice: 80,
        lastInboundAt: new Date('2024-01-01')
      })
      const result = await applyCatalogWeightedAverageCostTx(tx, {
        sku: 'SKU-1',
        inboundQty: 2,
        inboundUnitPrice: 0
      })

      expect(result.newUnitCost).toBe(100)
      expect(result.lastInboundUnitPrice).toBe(80)
      expect(tx._catalogRow.lastInboundUnitPrice).toBe(80)
      expect(tx._catalogRow.lastInboundAt).toEqual(new Date('2024-01-01'))
    })

    test('first priced receipt on empty stock sets average to inbound price', async () => {
      const tx = makeTx({ onHand: 0, unitCost: 0 })
      const result = await applyCatalogWeightedAverageCostTx(tx, {
        sku: 'SKU-1',
        inboundQty: 3,
        inboundUnitPrice: 657
      })
      expect(result.newUnitCost).toBe(657)
      expect(tx._catalogRow.unitCost).toBe(657)
    })
  })

  describe('syncCatalogTotalValueForSkuTx', () => {
    test('sets totalValue to qty × unit cost (2 decimal places)', async () => {
      const tx = makeTx({ unitCost: 219 })
      await syncCatalogTotalValueForSkuTx(tx, 'SKU-1', 3, 219)
      expect(tx._catalogRow.totalValue).toBe(computedInventoryTotalValue(3, 219))
      expect(tx._catalogRow.totalValue).toBe(657)
    })

    test('line value uses average not latest inbound price', async () => {
      const tx = makeTx({
        unitCost: 219,
        lastInboundUnitPrice: 657
      })
      await syncCatalogTotalValueForSkuTx(tx, 'SKU-1', 3, null)
      expect(tx._catalogRow.totalValue).toBe(657)
      expect(tx._catalogRow.totalValue).not.toBe(
        computedInventoryTotalValue(3, tx._catalogRow.lastInboundUnitPrice)
      )
    })
  })
})
