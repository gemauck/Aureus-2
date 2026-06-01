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
  })

  test('includes manual cost override step', async () => {
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
})
