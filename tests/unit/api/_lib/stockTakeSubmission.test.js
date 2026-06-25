import { describe, expect, test } from '@jest/globals'
import {
  buildStockTakeSkuMetaMap,
  computeStockTakeApplyDeltaQty,
  normalizeStockTakeLinesInput,
  parseStockTakeLineMeta,
  resolveStockTakeMovementDate
} from '../../../../api/_lib/stockTakeSubmission.js'

describe('stockTakeSubmission', () => {
  test('resolveStockTakeMovementDate prefers submittedAt', () => {
    const submitted = new Date('2025-03-03T11:21:33.000Z')
    const d = resolveStockTakeMovementDate({
      submittedAt: submitted,
      finishedAt: new Date('2025-03-04T00:00:00.000Z'),
      startedAt: new Date('2025-03-01T00:00:00.000Z')
    })
    expect(d.getTime()).toBe(submitted.getTime())
  })

  test('resolveStockTakeMovementDate falls back to finishedAt then startedAt', () => {
    const finished = new Date('2025-03-04T12:00:00.000Z')
    expect(resolveStockTakeMovementDate({ finishedAt: finished }).getTime()).toBe(finished.getTime())
    const started = new Date('2025-03-01T08:00:00.000Z')
    expect(resolveStockTakeMovementDate({ startedAt: started }).getTime()).toBe(started.getTime())
  })

  test('parseStockTakeLineMeta returns object for valid JSON', () => {
    expect(parseStockTakeLineMeta({ meta: '{"isNewItem":true}' })).toEqual({ isNewItem: true })
    expect(parseStockTakeLineMeta({ meta: 'not-json' })).toEqual({})
  })

  test('computeStockTakeApplyDeltaQty preserves movements after submit', () => {
    // At submit: system 10, counted 8 → delta -2. After submit: sale -3 → current 7.
    expect(
      computeStockTakeApplyDeltaQty({
        countedQty: 8,
        currentQty: 7,
        netMovementSinceSubmit: -3
      })
    ).toBe(-2)
    // Final on-hand after apply: 7 + (-2) = 5 = counted 8 + net since submit (-3).
    expect(7 + -2).toBe(5)
    expect(8 + -3).toBe(5)
  })

  test('computeStockTakeApplyDeltaQty uses full counted for new items', () => {
    expect(
      computeStockTakeApplyDeltaQty({
        countedQty: 4,
        currentQty: 0,
        netMovementSinceSubmit: 0,
        isNewItem: true
      })
    ).toBe(4)
  })

  test('normalizeStockTakeLinesInput accepts mobile legacy sku + countedQty only', () => {
    const skuMeta = buildStockTakeSkuMetaMap(
      [
        {
          id: 'li-1',
          sku: 'ABC-001',
          itemName: 'Widget',
          quantity: 12,
          unit: 'pcs'
        }
      ],
      [{ id: 'inv-1', sku: 'ABC-001', name: 'Widget', unit: 'pcs' }]
    )

    const lines = normalizeStockTakeLinesInput(
      [{ sku: 'ABC-001', countedQty: 10 }],
      skuMeta
    )

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      sku: 'ABC-001',
      itemName: 'Widget',
      systemQty: 12,
      countedQty: 10,
      deltaQty: -2,
      locationInventoryId: 'li-1',
      inventoryItemId: 'inv-1'
    })
  })

  test('normalizeStockTakeLinesInput keeps explicit systemQty from web clients', () => {
    const lines = normalizeStockTakeLinesInput(
      [
        {
          sku: 'ABC-001',
          itemName: 'Widget',
          systemQty: 5,
          countedQty: 7
        }
      ],
      new Map()
    )

    expect(lines[0]).toMatchObject({
      systemQty: 5,
      countedQty: 7,
      deltaQty: 2
    })
  })
})
