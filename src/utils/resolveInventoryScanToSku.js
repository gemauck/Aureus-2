import { publicFieldClientHeaders } from './publicFieldClientHeaders.js'
import { parseInventoryQrPayload } from './inventoryQrPayload.js'

function normalizeSku(sku) {
  return String(sku || '').trim()
}

export function findStockTakeRowBySku(rows, sku) {
  const target = normalizeSku(sku)
  if (!target) return null
  const targetLower = target.toLowerCase()
  return (
    (rows || []).find((r) => {
      const rowSku = normalizeSku(r.sku)
      return rowSku === target || rowSku.toLowerCase() === targetLower
    }) || null
  )
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
 * Build id → SKU lookups from stock-take rows and optional catalog caches (offline scan).
 * @param {Array<{ sku?: string, id?: string, inventoryItemId?: string | null }>} rows
 * @param {Map<string, string> | Record<string, string> | null} [extra]
 */
export function buildInventoryIdToSkuMap(rows, extra = null) {
  const map = new Map()
  const put = (id, sku) => {
    const key = String(id || '').trim()
    const val = normalizeSku(sku)
    if (!key || !val) return
    map.set(key, val)
  }

  for (const row of rows || []) {
    put(row.inventoryItemId, row.sku)
    if (!row.inventoryItemId && row.id && row.sku) {
      put(row.id, row.sku)
    }
  }

  if (extra instanceof Map) {
    for (const [k, v] of extra) put(k, v)
  } else if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) put(k, v)
  }
  return map
}

async function resolveSkuForInventoryItemId(inventoryItemId, opts) {
  const id = String(inventoryItemId || '').trim()
  if (!id) return ''

  const maps = []
  if (opts.idToSkuMap) maps.push(opts.idToSkuMap)
  if (opts.rows?.length) maps.push(buildInventoryIdToSkuMap(opts.rows))

  for (const map of maps) {
    let hit = null
    if (map instanceof Map) hit = map.get(id)
    else if (map && typeof map === 'object') hit = map[id]
    if (hit) return normalizeSku(hit)
  }

  if (typeof opts.resolveItemIdToSku === 'function') {
    return normalizeSku(await opts.resolveItemIdToSku(id))
  }
  return ''
}

/**
 * Resolve a stock-take barcode / ABCO:INV QR scan to a SKU present in `rows`.
 * QR labels encode a specific InventoryItem.id; the location list may expose a
 * different canonical catalog id for the same SKU — optional resolveItemIdToSku
 * bridges that gap (e.g. GET /api/public/inventory?resolveItemId=…).
 *
 * @param {string} scanText
 * @param {Array<{ sku?: string, inventoryItemId?: string | null }>} rows
 * @param {{
 *   resolveItemIdToSku?: (id: string) => Promise<string | null | undefined>,
 *   idToSkuMap?: Map<string, string> | Record<string, string>
 * }} [opts]
 * @returns {Promise<{ sku: string, row: object } | { error: 'not_in_list' | 'unrecognized' }>}
 */
export async function resolveInventoryScanToSku(scanText, rows, opts = {}) {
  const s = String(scanText || '').trim()
  if (!s) return { error: 'unrecognized' }

  const resolveOpts = { ...opts, rows }

  const parsed = parseInventoryQrPayload(s)
  if (parsed?.kind === 'inventory' && parsed.inventoryItemId) {
    let row = findStockTakeRowByInventoryItemId(rows, parsed.inventoryItemId)
    if (row?.sku) return { sku: normalizeSku(row.sku), row }

    const sku = await resolveSkuForInventoryItemId(parsed.inventoryItemId, resolveOpts)
    if (sku) {
      row = findStockTakeRowBySku(rows, sku)
      if (row?.sku) return { sku: normalizeSku(row.sku), row }
    }
    return { error: 'not_in_list' }
  }

  const row = findStockTakeRowBySku(rows, s)
  if (row?.sku) return { sku: normalizeSku(row.sku), row }
  return { error: 'unrecognized' }
}

/** Web stock-take scan fallback: map catalog row id → SKU via public inventory API. */
export async function fetchInventorySkuByItemId(apiBase, inventoryItemId) {
  const id = String(inventoryItemId || '').trim()
  if (!id) return null
  const base = String(apiBase || '').replace(/\/$/, '')
  const url = `${base}/api/public/inventory?resolveItemId=${encodeURIComponent(id)}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: publicFieldClientHeaders({ 'Content-Type': 'application/json' })
    })
    if (!res.ok) return null
    const data = await res.json()
    const item = data?.data?.item ?? data?.item
    const sku = item?.sku != null ? normalizeSku(item.sku) : ''
    return sku || null
  } catch {
    return null
  }
}

if (typeof window !== 'undefined') {
  window.resolveInventoryScanToSku = resolveInventoryScanToSku
  window.fetchInventorySkuByItemId = fetchInventorySkuByItemId
  window.buildInventoryIdToSkuMap = buildInventoryIdToSkuMap
}
