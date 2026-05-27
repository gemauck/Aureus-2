import { sanitizeJobCardStockUsedForSave } from '../../../src/utils/jobCardStockUsed.js'

describe('sanitizeJobCardStockUsedForSave', () => {
  test('keeps only rows with sku, locationId, and positive qty', () => {
    const rows = sanitizeJobCardStockUsedForSave([
      { sku: 'A', locationId: 'loc-1', quantity: 2, itemName: 'Part A' },
      { sku: 'B', locationId: '', quantity: 1 },
      { sku: '', locationId: 'loc-1', quantity: 1 },
      { sku: 'C', locationId: 'loc-2', quantity: 0 }
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      sku: 'A',
      locationId: 'loc-1',
      quantity: 2,
      itemName: 'Part A'
    })
  })

  test('assigns stable id when missing', () => {
    const rows = sanitizeJobCardStockUsedForSave([
      { sku: 'X', locationId: 'loc-1', quantity: 1 }
    ])
    expect(rows[0].id).toMatch(/^stock-line-/)
  })

  test('preserves existing line id', () => {
    const rows = sanitizeJobCardStockUsedForSave([
      { id: 'my-line-42', sku: 'X', locationId: 'loc-1', quantity: 1.5 }
    ])
    expect(rows[0].id).toBe('my-line-42')
    expect(rows[0].quantity).toBe(1.5)
  })
})
