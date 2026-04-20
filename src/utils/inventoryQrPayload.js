/**
 * Stable QR payload for inventory catalog rows (InventoryItem.id).
 * Keep in sync with api/_lib/inventoryQrPayload.js
 */
const PREFIX = 'ABCO:INV:'

export function encodeInventoryQrPayload(inventoryItemId) {
  const id = String(inventoryItemId || '').trim()
  if (!id) return ''
  return `${PREFIX}${id}`
}

/**
 * @returns {{ kind: 'inventory', inventoryItemId: string } | null}
 */
export function parseInventoryQrPayload(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  if (s.startsWith(PREFIX)) {
    const inventoryItemId = s.slice(PREFIX.length).trim()
    if (!inventoryItemId) return null
    return { kind: 'inventory', inventoryItemId }
  }
  return null
}

if (typeof window !== 'undefined') {
  window.encodeInventoryQrPayload = encodeInventoryQrPayload
  window.parseInventoryQrPayload = parseInventoryQrPayload
}
