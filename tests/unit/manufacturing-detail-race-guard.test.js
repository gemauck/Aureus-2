import fs from 'fs'
import path from 'path'

describe('manufacturing inventory detail race-condition guard', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/manufacturing/Manufacturing.jsx')
  const source = fs.readFileSync(filePath, 'utf8')

  test('defines detail-open guard flag', () => {
    expect(source).toContain('const isInventoryDetailOpen = Boolean(viewingInventoryItemDetail);')
  })

  test('stops list->detail merge while detail is open', () => {
    const mergeEffectChunk = source.slice(
      source.indexOf('// Merge list refetches into the open detail view'),
      source.indexOf('// Load canonical InventoryItem from the API so detail matches the database')
    )
    expect(mergeEffectChunk).toContain('if (isInventoryDetailOpen) return;')
  })

  test('stops canonical detail hydration while detail is open', () => {
    const canonicalEffectChunk = source.slice(
      source.indexOf('// Load canonical InventoryItem from the API so detail matches the database'),
      source.indexOf('// Reload inventory when location changes - BUT NOT if user is actively typing')
    )
    expect(canonicalEffectChunk).toContain('if (isInventoryDetailOpen) return;')
  })

  test('stops inventory polling while detail is open', () => {
    const pollingChunk = source.slice(
      source.indexOf('// Keep inventory data fresh without requiring hard refreshes.'),
      source.indexOf('// Listen for location updates from StockLocations component')
    )
    expect(pollingChunk).toContain('if (isInventoryDetailOpen) {')
    expect(pollingChunk).toContain('clearInterval(inventoryAutoRefreshPollRef.current);')
  })
})
