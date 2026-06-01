import { computeWeightedAverageUnitCost } from '../../../../api/_lib/weightedAverageUnitCost.js'
import { buildInventoryWacCostHistory } from '../../../../api/_lib/inventoryWacCostHistory.js'

function mockPrisma(overrides = {}) {
  const defaults = {
    locationInventory: {
      aggregate: async () => ({ _sum: { quantity: 0 } })
    },
    inventoryItem: {
      findMany: async () => [
        {
          id: 'inv-1',
          sku: 'SKU-1',
          name: 'Test Widget',
          unitCost: 110,
          lastInboundUnitPrice: 130,
          lastInboundAt: new Date('2024-06-01')
        }
      ]
    },
    purchaseOrder: { findMany: async () => [] },
    stockMovement: { findMany: async () => [] },
    auditLog: { findMany: async () => [] }
  }
  return { ...defaults, ...overrides }
}

/** Replay priced inbound steps only — must match buildInventoryWacCostHistory math. */
function replayPricedSteps(steps) {
  let onHand = 0
  let avg = 0
  for (const s of steps) {
    if (s.eventType === 'manual_cost_override') {
      avg = Number(s.averageCostAfter) || avg
      continue
    }
    const iq = Number(s.inboundQty) || 0
    const ip = Number(s.unitPrice) || 0
    if (iq > 0 && ip > 0) {
      avg = computeWeightedAverageUnitCost(onHand, avg, iq, ip)
      onHand += iq
    } else if (iq > 0) {
      onHand += iq
    }
  }
  return { onHand, avg }
}

describe('buildInventoryWacCostHistory', () => {
  test('rejects empty sku', async () => {
    await expect(buildInventoryWacCostHistory(mockPrisma(), '')).rejects.toThrow(/sku required/i)
  })

  test('replays PO receipts with WAC formula', async () => {
    const prisma = mockPrisma({
      locationInventory: {
        aggregate: async () => ({ _sum: { quantity: 15 } })
      },
      purchaseOrder: {
        findMany: async () => [
          {
            id: 'po1',
            orderNumber: 'PO-001',
            supplierName: 'Acme',
            receivedDate: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            items: JSON.stringify([
              { sku: 'SKU-1', quantityReceived: 10, receivedUnitPrice: 100 },
              { sku: 'OTHER', quantityReceived: 5, receivedUnitPrice: 50 }
            ])
          },
          {
            id: 'po2',
            orderNumber: 'PO-002',
            supplierName: 'Acme',
            receivedDate: new Date('2024-02-01'),
            updatedAt: new Date('2024-02-01'),
            items: JSON.stringify([
              { sku: 'SKU-1', quantityReceived: 5, receivedUnitPrice: 130 }
            ])
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    expect(history.sku).toBe('SKU-1')
    expect(history.steps).toHaveLength(2)
    expect(history.steps[0].eventType).toBe('purchase_receipt')
    expect(history.steps[0].averageCostAfter).toBe(100)
    expect(history.steps[1].averageCostAfter).toBe(110)
    expect(history.steps[1].wacFormula).toMatch(/10×100/)
    expect(history.replayEndState.averageUnitCost).toBe(110)
    expect(history.replayEndState.quantityOnHand).toBe(15)

    const replay = replayPricedSteps(history.steps)
    expect(replay.avg).toBe(110)
    expect(replay.onHand).toBe(15)
  })

  test('each priced step averageCostAfter matches computeWeightedAverageUnitCost', async () => {
    const prisma = mockPrisma({
      purchaseOrder: {
        findMany: async () => [
          {
            id: 'po1',
            orderNumber: 'PO-001',
            supplierName: 'Acme',
            receivedDate: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            items: [
              { sku: 'SKU-1', quantityReceived: 1, receivedUnitPrice: 100 },
              { sku: 'SKU-1', quantityReceived: 2, unitPrice: 278.5 }
            ]
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    expect(history.steps[0].averageCostAfter).toBe(100)
    expect(history.steps[1].averageCostAfter).toBe(219)
    expect(history.steps[1].onHandBefore).toBe(1)
    expect(history.steps[1].averageCostBefore).toBe(100)
  })

  test('includes manual cost override step without changing on-hand', async () => {
    const prisma = mockPrisma({
      auditLog: {
        findMany: async () => [
          {
            id: 'log1',
            createdAt: new Date('2024-03-01'),
            diff: JSON.stringify({
              sku: 'SKU-1',
              costOverride: true,
              previousUnitCost: 110,
              newUnitCost: 219,
              path: 'inventory',
              summary: 'Corrected supplier invoice'
            }),
            actor: { name: 'Admin User', email: 'admin@test.com' }
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    const override = history.steps.find((s) => s.eventType === 'manual_cost_override')
    expect(override).toBeDefined()
    expect(override.performedBy).toBe('Admin User')
    expect(override.wacFormula).toMatch(/110.*219/)
    expect(override.averageCostAfter).toBe(219)
    expect(override.onHandBefore).toBe(override.onHandAfter)
  })

  test('receipts then override: replay end average is override value', async () => {
    const prisma = mockPrisma({
      purchaseOrder: {
        findMany: async () => [
          {
            id: 'po1',
            orderNumber: 'PO-001',
            supplierName: 'MANTECH',
            receivedDate: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            items: [{ sku: 'SKU-1', quantityReceived: 1, receivedUnitPrice: 100 }]
          },
          {
            id: 'po2',
            orderNumber: 'PO-002',
            supplierName: 'MANTECH',
            receivedDate: new Date('2024-02-17'),
            updatedAt: new Date('2024-02-17'),
            items: [{ sku: 'SKU-1', quantityReceived: 2, receivedUnitPrice: 278.5 }]
          }
        ]
      },
      auditLog: {
        findMany: async () => [
          {
            id: 'log1',
            createdAt: new Date('2024-03-01'),
            diff: JSON.stringify({
              sku: 'SKU-1',
              costOverride: true,
              previousUnitCost: 219,
              newUnitCost: 219,
              path: 'inventory'
            }),
            actor: { name: 'Admin', email: 'a@test.com' }
          }
        ]
      },
      locationInventory: {
        aggregate: async () => ({ _sum: { quantity: 3 } })
      },
      inventoryItem: {
        findMany: async () => [
          {
            id: 'inv-1',
            sku: 'SKU-1',
            name: '10K POT',
            unitCost: 219,
            lastInboundUnitPrice: 657,
            lastInboundAt: new Date('2024-02-17')
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    const priced = history.steps.filter((s) => s.eventType === 'purchase_receipt')
    expect(priced[1].averageCostAfter).toBe(219)
    const replay = replayPricedSteps(history.steps)
    expect(replay.avg).toBe(219)
    expect(replay.onHand).toBe(3)
  })

  test('unpriced inbound increases on-hand but not average', async () => {
    const prisma = mockPrisma({
      stockMovement: {
        findMany: async () => [
          {
            id: 'm0',
            movementId: 'MOV-0',
            type: 'receipt',
            quantity: 2,
            reference: 'ADJ-1',
            date: new Date('2024-01-01'),
            createdAt: new Date('2024-01-01'),
            notes: 'Stock count import',
            performedBy: 'system'
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    expect(history.steps).toHaveLength(1)
    expect(history.steps[0].averageCostAfter).toBe(0)
    expect(history.steps[0].onHandAfter).toBe(2)
    expect(history.steps[0].wacFormula).toMatch(/unchanged/i)
  })

  test('skips stock movement duplicate of PO receipt', async () => {
    const prisma = mockPrisma({
      purchaseOrder: {
        findMany: async () => [
          {
            id: 'po1',
            orderNumber: 'PO-001',
            supplierName: 'Acme',
            receivedDate: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            items: [{ sku: 'SKU-1', quantityReceived: 5, receivedUnitPrice: 100 }]
          }
        ]
      },
      stockMovement: {
        findMany: async () => [
          {
            id: 'm1',
            movementId: 'MOV-1',
            type: 'receipt',
            quantity: 5,
            reference: 'PO-001',
            date: new Date('2024-01-01'),
            createdAt: new Date('2024-01-01'),
            notes: 'Goods receipt',
            performedBy: 'user'
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    expect(history.steps).toHaveLength(1)
    expect(history.steps[0].source).toBe('PO-001')
  })

  test('parses production cost from movement notes', async () => {
    const prisma = mockPrisma({
      stockMovement: {
        findMany: async () => [
          {
            id: 'm1',
            movementId: 'MOV-1',
            type: 'receipt',
            quantity: 3,
            reference: 'PROD-1',
            date: new Date('2024-04-01'),
            createdAt: new Date('2024-04-01'),
            notes: 'Production complete. Cost: 50 per unit',
            performedBy: 'operator@test.com'
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    expect(history.steps).toHaveLength(1)
    expect(history.steps[0].unitPrice).toBe(50)
    expect(history.steps[0].inboundQty).toBe(3)
    expect(history.steps[0].averageCostAfter).toBe(50)
  })

  test('sorts events chronologically regardless of query order', async () => {
    const prisma = mockPrisma({
      purchaseOrder: {
        findMany: async () => [
          {
            id: 'po2',
            orderNumber: 'PO-002',
            supplierName: 'Acme',
            receivedDate: new Date('2024-06-01'),
            updatedAt: new Date('2024-06-01'),
            items: [{ sku: 'SKU-1', quantityReceived: 5, receivedUnitPrice: 130 }]
          },
          {
            id: 'po1',
            orderNumber: 'PO-001',
            supplierName: 'Acme',
            receivedDate: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            items: [{ sku: 'SKU-1', quantityReceived: 10, receivedUnitPrice: 100 }]
          }
        ]
      }
    })

    const history = await buildInventoryWacCostHistory(prisma, 'SKU-1')
    expect(history.steps[0].source).toBe('PO-001')
    expect(history.steps[0].averageCostAfter).toBe(100)
    expect(history.steps[1].averageCostAfter).toBe(110)
  })
})
