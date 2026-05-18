/**
 * Resolve which warehouse row an adjustment should update.
 * Positive qty at a destination (toLocation) increases stock there; negative at source (fromLocation).
 */

export async function resolveAdjustmentLocationIdTx(
  tx,
  { fromLocationId, toLocationId, itemLocationId, fromStr, toStr, quantity = null }
) {
  let fromId = fromLocationId || null
  let toId = toLocationId || null

  async function resolveStr(str) {
    const s = (str || '').trim()
    if (!s) return null
    const loc = await tx.stockLocation.findFirst({
      where: {
        OR: [{ id: s }, { code: s }, { name: { equals: s, mode: 'insensitive' } }]
      }
    })
    return loc?.id || null
  }

  if (!fromId && fromStr) fromId = await resolveStr(fromStr)
  if (!toId && toStr) toId = await resolveStr(toStr)

  const qty = quantity !== null && quantity !== undefined ? parseFloat(quantity) : NaN
  if (fromId && toId && fromId !== toId) {
    if (qty > 0) return toId
    if (qty < 0) return fromId
  }

  let locationId = fromId || toId || itemLocationId || null
  if (locationId) return locationId

  const mainWarehouse = await tx.stockLocation.findFirst({ where: { code: 'LOC001' } })
  if (mainWarehouse) return mainWarehouse.id

  const anyLoc = await tx.stockLocation.findFirst({ orderBy: { code: 'asc' } })
  return anyLoc?.id || null
}
