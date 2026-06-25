import { describe, expect, test } from '@jest/globals'
import {
  encodeInventoryQrPayload
} from '../../src/utils/inventoryQrPayload.js'
import {
  buildInventoryIdToSkuMap,
  findStockTakeRowByInventoryItemId,
  findStockTakeRowBySku,
  resolveInventoryScanToSku
} from '../../src/utils/resolveInventoryScanToSku.js'

describe('resolveInventoryScanToSku', () => {
  const rows = [
    { sku: 'SKU0010', name: '25mm Buckles', inventoryItemId: 'canonical-bbb' },
    { sku: 'SKU0015', name: '1 x 25mm Strap', inventoryItemId: 'canonical-strap' }
  ]

  test('matches inventory QR by inventoryItemId on the row', async () => {
    const qr = encodeInventoryQrPayload('canonical-bbb')
    const result = await resolveInventoryScanToSku(qr, rows)
    expect(result).toEqual({ sku: 'SKU0010', row: rows[0] })
  })

  test('matches raw SKU barcode', async () => {
    const result = await resolveInventoryScanToSku('SKU0015', rows)
    expect(result).toEqual({ sku: 'SKU0015', row: rows[1] })
  })

  test('matches SKU barcode case-insensitively', async () => {
    const result = await resolveInventoryScanToSku('sku0010', rows)
    expect(result).toEqual({ sku: 'SKU0010', row: rows[0] })
  })

  test('resolves duplicate catalog id on QR via resolveItemIdToSku', async () => {
    const qr = encodeInventoryQrPayload('legacy-aaa')
    const result = await resolveInventoryScanToSku(qr, rows, {
      resolveItemIdToSku: async (id) => (id === 'legacy-aaa' ? 'SKU0010' : null)
    })
    expect(result).toEqual({ sku: 'SKU0010', row: rows[0] })
    expect(findStockTakeRowByInventoryItemId(rows, 'legacy-aaa')).toBeNull()
    expect(findStockTakeRowBySku(rows, 'SKU0010')).toEqual(rows[0])
  })

  test('resolves legacy QR offline via idToSkuMap without network', async () => {
    const qr = encodeInventoryQrPayload('legacy-aaa')
    const idToSkuMap = buildInventoryIdToSkuMap(rows, { 'legacy-aaa': 'SKU0010' })
    const result = await resolveInventoryScanToSku(qr, rows, { idToSkuMap })
    expect(result).toEqual({ sku: 'SKU0010', row: rows[0] })
  })

  test('returns not_in_list when QR id cannot map to a row SKU', async () => {
    const qr = encodeInventoryQrPayload('unknown-id')
    const result = await resolveInventoryScanToSku(qr, rows, {
      resolveItemIdToSku: async () => 'SKU9999'
    })
    expect(result).toEqual({ error: 'not_in_list' })
  })

  test('returns unrecognized for empty or unknown plain text', async () => {
    expect(await resolveInventoryScanToSku('', rows)).toEqual({ error: 'unrecognized' })
    expect(await resolveInventoryScanToSku('NOT-A-SKU', rows)).toEqual({ error: 'unrecognized' })
  })
})
