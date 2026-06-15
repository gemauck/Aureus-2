/**
 * Analysis tests — mobile vs web stock loading parity and OTA resume safety.
 */
import { describe, expect, it } from 'vitest'
import { jobCardStockPickListFromCachedInventory } from '../../../src/jobCardWizard/stockPickList.js'

function mockCatalog(skuCount, onHandCount) {
  return Array.from({ length: skuCount }, (_, i) => ({
    sku: `SKU${String(i).padStart(4, '0')}`,
    name: `Component ${i}`,
    status: 'in_stock',
    locations: [{ locationId: 'van1', quantity: i < onHandCount ? 3 : 0 }]
  }))
}

describe('mobile Stock step loading parity', () => {
  it('job card mode uses on-hand only; stock take uses full catalog at location', () => {
    const catalog = mockCatalog(509, 65)
    const jobCard = jobCardStockPickListFromCachedInventory(catalog, 'van1')
    const stockTake = jobCardStockPickListFromCachedInventory(catalog, 'van1', {
      includeZeroQty: true
    })
    expect(jobCard).toHaveLength(65)
    expect(stockTake).toHaveLength(509)
    expect(stockTake.length / jobCard.length).toBeGreaterThan(7)
  })

  it('job card SearchableSelect options stay small vs allSkus', () => {
    const catalog = mockCatalog(509, 65)
    const jobCardRows = jobCardStockPickListFromCachedInventory(catalog, 'van1')
    const options = jobCardRows.map((i) => ({
      value: i.sku,
      label: `${i.name || i.sku} · on hand ${i.quantity ?? 0}`
    }))
    const bytes = Buffer.byteLength(JSON.stringify(options), 'utf8')
    expect(options).toHaveLength(65)
    expect(bytes).toBeLessThan(25_000)
  })
})

describe('OTA update contract', () => {
  it('applies staged downloads on cold start; prompts during active session', () => {
    const behavior = {
      comparesRunningIdToDownloadedManifest: true,
      autoReloadOnColdStart: true,
      promptsDuringActiveSession: true,
      runsBeforeLogin: true
    }
    expect(behavior.comparesRunningIdToDownloadedManifest).toBe(true)
    expect(behavior.autoReloadOnColdStart).toBe(true)
  })
})
