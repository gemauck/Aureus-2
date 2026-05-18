import {
  parseJobCardStockUsed,
  jobCardStockMovementId,
  jobCardStockMovementReference
} from '../../../../api/_lib/jobCardStockMovements.js'

describe('jobCardStockMovements', () => {
  test('parseJobCardStockUsed filters invalid rows', () => {
    const lines = parseJobCardStockUsed([
      { sku: 'ABC', locationId: 'loc1', quantity: 2, itemName: 'Widget' },
      { sku: '', locationId: 'loc1', quantity: 1 },
      { sku: 'X', locationId: '', quantity: 1 },
      { sku: 'Y', locationId: 'loc1', quantity: 0 }
    ])
    expect(lines).toHaveLength(2)
    expect(lines[0].sku).toBe('ABC')
    expect(lines[1].sku).toBe('X')
    expect(lines[1].locationId).toBe('')
  })

  test('jobCardStockMovementId is stable per line', () => {
    expect(jobCardStockMovementId('jc-abc', 2)).toBe('MOV-JC-jc-abc-L2')
  })

  test('jobCardStockMovementReference prefers job card number', () => {
    expect(jobCardStockMovementReference({ id: 'x', jobCardNumber: 'JC0008' })).toBe(
      'JOB CARD: JC0008'
    )
  })
})
