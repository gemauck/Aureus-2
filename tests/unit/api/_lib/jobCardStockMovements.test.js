import { jest } from '@jest/globals'

const movementsCreated = []

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
  syncJobCardStockMovements
} = await import('../../../../api/_lib/jobCardStockMovements.js')

describe('jobCardStockMovements', () => {
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

  test('jobCardStockMovementId is stable per line', () => {
    expect(jobCardStockMovementId('jc-abc', 2)).toBe('MOV-JC-jc-abc-L2')
  })

  test('jobCardStockMovementReference prefers job card number', () => {
    expect(jobCardStockMovementReference({ id: 'x', jobCardNumber: 'JC0008' })).toBe(
      'JOB CARD: JC0008'
    )
  })

  test('syncJobCardStockMovements deducts each line from its own location', async () => {
    movementsCreated.length = 0
    const locA = 'loc-a-uuid'
    const locB = 'loc-b-uuid'

    const tx = {
      stockLocation: {
        findFirst: jest.fn(async ({ where }) => {
          const id = where?.OR?.[0]?.id
          if (id === locA) return { id: locA, code: 'BAKKIE1' }
          if (id === locB) return { id: locB, code: 'BAKKIE2' }
          return null
        })
      },
      stockMovement: { findFirst: jest.fn(async () => null), update: jest.fn() },
      locationInventory: {
        findUnique: jest.fn(async () => ({
          id: 'li-1',
          quantity: 10,
          reorderPoint: 0,
          unitCost: 5,
          itemName: 'Part'
        })),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(async () => ({ _sum: { quantity: 8 } }))
      },
      inventoryItem: { update: jest.fn() }
    }

    const prisma = {
      $transaction: jest.fn(async (fn) => fn(tx))
    }

    const stockUsed = [
      { sku: 'SKU-A', locationId: locA, quantity: 2, itemName: 'Part A' },
      { sku: 'SKU-B', locationId: locB, quantity: 3, itemName: 'Part B' }
    ]

    const result = await syncJobCardStockMovements(prisma, {
      jobCard: { id: 'jc-1', stockUsed: JSON.stringify(stockUsed), jobCardNumber: 'JC0099' }
    })

    expect(result.errors).toEqual([])
    expect(result.created).toBe(2)
    expect(movementsCreated).toHaveLength(2)
    expect(movementsCreated[0].fromLocation).toBe(locA)
    expect(movementsCreated[0].quantity).toBe(-2)
    expect(movementsCreated[0].movementId).toBe('MOV-JC-jc-1-L0')
    expect(movementsCreated[1].fromLocation).toBe(locB)
    expect(movementsCreated[1].quantity).toBe(-3)
    expect(movementsCreated[1].movementId).toBe('MOV-JC-jc-1-L1')
  })
})
