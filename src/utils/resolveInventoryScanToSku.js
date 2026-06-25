import { parseInventoryQrPayload } from './inventoryQrPayload.js'

export function findStockTakeRowBySku(rows, sku) {
  const s = String(sku || '').trim()
  if (!s) return null
  return (rows || []).find((r) => String(r.sku || '').trim() === s) || null
}

export function findStockTakeRowByInventoryItemId(rows, inventoryItemId) {
  const id = String(inventoryItemId || '').trim()
  if (!id) return null
  return (
    (rows || []).find(
      (r) => r.inventoryItemId && String(r.inventoryItemId).trim() === id
    ) || null
  )
}

/**
 * Resolve a stock-take barcode / ABCO:INV QR scan to a SKU present in `rows`.
 * QR labels encode a specific InventoryItem.id; the location list may expose a
 * different canonical catalog id for the same SKU — optional resolveItemIdToSku
 * bridges that gap (e.g. GET /api/public/inventory?resolveItemId=…).
 *
 * @param {string} scanText
 * @param {Array<{ sku?: string, inventoryItemId?: string | null }>} rows
 * @param {{ resolveItemIdToSku?: (id: string) => Promise<string | null | undefined> }} [opts]
 * @returns {Promise<{ sku: string, row: object } | { error: 'not_in_list' | 'unrecognized' }>}
 */
export async function resolveInventoryScanToSku(scanText, rows, opts = {}) {
  const s = String(scanText || '').trim()
  if (!s) return { error: 'unrecognized' }

  const parsed = parseInventoryQrPayload(s)
  if (parsed?.kind === 'inventory' && parsed.inventoryItemId) {
    let row = findStockTakeRowByInventoryItemId(rows, parsed.inventoryItemId)
    if (row?.sku) return { sku: String(row.sku).trim(), row }

    let sku = ''
    if (typeof opts.resolveItemIdToSku === 'function') {
      sku = String((await opts.resolveItemIdToSku(parsed.inventoryItemId)) || '').trim()
    }
    if (sku) {
      row = findStockTakeRowBySku(rows, sku)
      if (row?.sku) return { sku: String(row.sku).trim(), row }
    }
    return { error: 'not_in_list' }
  }

  const row = findStockTakeRowBySku(rows, s)
  if (row?.sku) return { sku: String(row.sku).trim(), row }
  return { error: 'unrecognized' }
}

/** Web stock-take scan fallback: map catalog row id → SKU via public inventory API. */
export async function fetchInventorySkuByItemId(apiBase, inventoryItemId) {
  const id = String(inventoryItemId || '').trim()
  if (!id) return null
  const base = String(apiBase || '').replace(/\/$/, '')
  const url =
  `${base}/api/public/inventory?resolveItemId=${encodeURIComponent(id)}`
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const item = data?.data?.item ?? data?.item
    const sku = item?.sku != null ? String(item.sku).trim() : ''
    return sku || null
  } catch {
    return null
  }
}

if (typeof window !== 'undefined') {
  window.resolveInventoryScanToSku = resolveInventoryScanToSku
  window.fetchInventorySkuByItemId = fetchInventorySkuByItemId
}
