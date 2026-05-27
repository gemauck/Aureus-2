import { jest } from '@jest/globals'

const movementsCreated = []
const liUpdates = []

jest.unstable_mockModule('../../../../api/_lib/stockCountAdjustment.js', () => ({
  findCanonicalInventoryItemBySkuTx: jest.fn(async () => ({
    id: 'item-1',
    sku: 'SKU-A',
    unitCost: 10,
    reorderPoint: 0
  })),
  getStatusFromQuantity: jest.fn(() => 'in_stock')
}))

jest.unstable_mockModule('../../../../api/_lib/inventoryValue.js', () => ({
  computedInventoryTotalValue: jest.fn((qty, cost) => qty * cost)
}))

jest.unstable_mockModule('../../../../api/_lib/movementId.js', () => ({
  createStockMovementTx: jest.fn(async (_tx, payload) => {
    movementsCreated.push(payload)
    return { id: `mov-${movementsCreated.length}`, movementId: payload.movementId }
  })
}))

const {
  parseJobCardStockUsed,
  jobCardStockMovementId,
  jobCardStockMovementReference,
  serializeJobCardStockUsedForDb,
  syncJobCardStockMovements
} = await import('../../../../api/_lib/jobCardStockMovements.js')

function makeTx({ existingMovement = null, linkedMovements = [] } = {}) {
  const locA = 'loc-a-uuid'
  const locB = 'loc-b-uuid'
  return {
    stockLocation: {
      findFirst: jest.fn(async ({ where }) => {
        const id = where?.OR?.[0]?.id
        if (id === locA) return { id: locA, code: 'BAKKIE1' }
        if (id === locB) return { id: locB, code: 'BAKKIE2' }
        return null
      })
    },
    stockMovement: {
      findFirst: jest.fn(async () => existingMovement),
      findMany: jest.fn(async () => linkedMovements),
      update: jest.fn(),
      delete: jest.fn()
    },
    locationInventory: {
      findUnique: jest.fn(async () => ({
        id: 'li-1',
        quantity: 10,
        reorderPoint: 0,
        unitCost: 5,
        itemName: 'Part'
      })),
      create: jest.fn(),
      update: jest.fn(async (args) => {
        liUpdates.push(args)
      }),
      aggregate: jest.fn(async () => ({ _sum: { quantity: 8 } }))
    },
    inventoryItem: { update: jest.fn() },
    locA,
    locB
  }
}

describe('jobCardStockMovements', () => {
  beforeEach(() => {
    movementsCreated.length = 0
    liUpdates.length = 0
  })

  test('parseJobCardStockUsed filters invalid rows', () => {
    const lines = parseJobCardStockUsed([
      { sku: 'ABC', locationId: 'loc1', quantity: 2, itemName: 'Widget' },
      { sku: '', locationId: 'loc1', quantity: 1 },
      { sku: 'X', locationId: '', quantity: 1 },
      { sku: 'Y', locationId: 'loc1', quantity: 0 }
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].sku).toBe('ABC')
    expect(lines[0].locationId).toBe('loc1')
  })

  test('jobCardStockMovementId prefers stable client line id', () => {
    expect(jobCardStockMovementId('jc-abc', { lineIndex: 2, clientLineId: 'line-99' })).toBe(
      'MOV-JC-jc-abc-Rline-99'
    )
    expect(jobCardStockMovementId('jc-abc', 2)).toBe('MOV-JC-jc-abc-L2')
  })

  test('serializeJobCardStockUsedForDb drops rows without location', () => {
    const json = serializeJobCardStockUsedForDb([
      { id: 'a1', sku: 'S1', locationId: 'loc1', quantity: 2 },
      { sku: 'S2', locationId: '', quantity: 1 }
    ])
    const rows = JSON.parse(json)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'a1', sku: 'S1', locationId: 'loc1', quantity: 2 })
  })

  test('jobCardStockMovementReference prefers job card number', () => {
    expect(jobCardStockMovementReference({ id: 'x', jobCardNumber: 'JC0008' })).toBe(
      'JOB CARD: JC0008'
    )
  })

  test('syncJobCardStockMovements deducts each line from its own location', async () => {
    const tx = makeTx()
    const stockUsed = [
      { id: 'line-a', sku: 'SKU-A', locationId: tx.locA, quantity: 2, itemName: 'Part A' },
      { id: 'line-b', sku: 'SKU-B', locationId: tx.locB, quantity: 3, itemName: 'Part B' }
    ]

    const result = await syncJobCardStockMovements(
      { $transaction: jest.fn(async (fn) => fn(tx)) },
      { jobCard: { id: 'jc-1', stockUsed: JSON.stringify(stockUsed), jobCardNumber: 'JC0099' } }
    )

    expect(result.errors).toEqual([])
    expect(result.created).toBe(2)
    expect(movementsCreated).toHaveLength(2)
    expect(movementsCreated[0].fromLocation).toBe(tx.locA)
    expect(movementsCreated[0].quantity).toBe(-2)
    expect(movementsCreated[0].movementId).toBe('MOV-JC-jc-1-Rline-a')
    expect(movementsCreated[1].fromLocation).toBe(tx.locB)
    expect(movementsCreated[1].quantity).toBe(-3)
    expect(movementsCreated[1].movementId).toBe('MOV-JC-jc-1-Rline-b')
  })

  test('syncJobCardStockMovements errors when location cannot be resolved', async () => {
    const tx = makeTx()
    const result = await syncJobCardStockMovements(
      { $transaction: jest.fn(async (fn) => fn(tx)) },
      {
        jobCard: {
          id: 'jc-2',
          stockUsed: JSON.stringify([
            { id: 'x', sku: 'SKU-A', locationId: 'unknown-warehouse', quantity: 1 }
          ])
        }
      }
    )
    expect(result.created).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('Unknown stock location')
  })

  test('syncJobCardStockMovements moves LI when only location changes', async () => {
    const tx = makeTx({
      existingMovement: {
        id: 'mov-1',
        movementId: 'MOV-JC-jc-3-Rline-1',
        sku: 'SKU-A',
        quantity: -2,
        fromLocation: 'loc-a-uuid',
        itemName: 'Part A'
      }
    })

    const result = await syncJobCardStockMovements(
      { $transaction: jest.fn(async (fn) => fn(tx)) },
      {
        jobCard: {
          id: 'jc-3',
          stockUsed: JSON.stringify([
            { id: 'line-1', sku: 'SKU-A', locationId: tx.locB, quantity: 2, itemName: 'Part A' }
          ])
        }
      }
    )

    expect(result.errors).toEqual([])
    expect(result.updated).toBe(1)
    expect(liUpdates.length).toBeGreaterThanOrEqual(2)
    const deltas = liUpdates.map((u) => u.data.quantity)
    expect(deltas.some((q) => q === 12)).toBe(true)
    expect(deltas.some((q) => q === 8)).toBe(true)
  })

  test('syncJobCardStockMovements removes orphan movements when lines deleted', async () => {
    const tx = makeTx({
      linkedMovements: [
        {
          id: 'orphan-1',
          movementId: 'MOV-JC-jc-4-L9',
          sku: 'SKU-A',
          quantity: -1,
          fromLocation: 'loc-a-uuid',
          itemName: 'Old'
        }
      ]
    })

    const result = await syncJobCardStockMovements(
      { $transaction: jest.fn(async (fn) => fn(tx)) },
      { jobCard: { id: 'jc-4', stockUsed: '[]' } }
    )

    expect(result.removed).toBe(1)
    expect(tx.stockMovement.delete).toHaveBeenCalled()
  })
})
