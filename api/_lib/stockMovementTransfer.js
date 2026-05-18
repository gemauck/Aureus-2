/**
 * Two-legged transfer rules (Option B): every `type: transfer` row must have distinct
 * from/to location IDs. Used by Manufacturing API and ledger-align scripts.
 */

const EPS = 0.001

/**
 * @param {string|null|undefined} fromLocationId
 * @param {string|null|undefined} toLocationId
 * @throws {Error}
 */
export function assertValidTransferLocations(fromLocationId, toLocationId) {
  const from = String(fromLocationId || '').trim()
  const to = String(toLocationId || '').trim()
  if (!from || !to) {
    throw new Error('fromLocationId and toLocationId are required for transfers (both warehouse legs)')
  }
  if (from === to) {
    throw new Error('fromLocationId and toLocationId must be different for transfers')
  }
}

/**
 * Per-site ledger align plan → proper two-legged transfer movement payloads.
 * Positive delta at a site needs inbound movement story; negative needs outbound.
 *
 * @param {Array<{ sku: string, itemName: string, kind: 'transfer_in'|'transfer_out', quantity: number, fromLocation: string, toLocation: string, locationLabel: string }>} planned
 * @param {string} mainLocationId — counterparty when only one side has imbalance (typically 01_LOC1)
 * @returns {Array<{ sku: string, itemName: string, quantity: number, fromLocation: string, toLocation: string, reference: string, notes: string }>}
 */
export function buildPairedLedgerAlignTransfers(planned, mainLocationId) {
  const main = String(mainLocationId || '').trim()
  if (!main) {
    throw new Error('mainLocationId is required to pair ledger-align transfers')
  }

  /** @type {Map<string, { itemName: string, ins: { locationId: string, label: string, remaining: number }[], outs: { locationId: string, label: string, remaining: number }[] }>} */
  const bySku = new Map()

  for (const p of planned) {
    const sku = String(p.sku || '').trim()
    if (!sku) continue
    if (!bySku.has(sku)) {
      bySku.set(sku, { itemName: p.itemName || sku, ins: [], outs: [] })
    }
    const g = bySku.get(sku)
    const qty = Math.abs(parseFloat(p.quantity) || 0)
    if (qty <= EPS) continue
    if (p.kind === 'transfer_in') {
      g.ins.push({
        locationId: String(p.toLocation || '').trim(),
        label: p.locationLabel || '',
        remaining: qty
      })
    } else {
      g.outs.push({
        locationId: String(p.fromLocation || '').trim(),
        label: p.locationLabel || '',
        remaining: qty
      })
    }
  }

  /** @type {Array<{ sku: string, itemName: string, quantity: number, fromLocation: string, toLocation: string, reference: string, notes: string }>} */
  const rows = []

  for (const [sku, g] of bySku) {
    const ins = g.ins.filter((x) => x.locationId && x.remaining > EPS)
    const outs = g.outs.filter((x) => x.locationId && x.remaining > EPS)
    ins.sort((a, b) => b.remaining - a.remaining)
    outs.sort((a, b) => b.remaining - a.remaining)

    let ii = 0
    let oi = 0
    while (ii < ins.length && oi < outs.length) {
      const inn = ins[ii]
      const out = outs[oi]
      const t = Math.min(inn.remaining, out.remaining)
      if (t <= EPS) {
        if (inn.remaining <= EPS) ii++
        if (out.remaining <= EPS) oi++
        continue
      }
      rows.push({
        sku,
        itemName: g.itemName,
        quantity: t,
        fromLocation: out.locationId,
        toLocation: inn.locationId,
        reference: `LEDGER_SITE_ALIGN:${sku}:${out.label || out.locationId}->${inn.label || inn.locationId}`,
        notes: `Align site ledger to LocationInventory (paired transfer): ${out.label || out.locationId} → ${inn.label || inn.locationId}`
      })
      inn.remaining -= t
      out.remaining -= t
      if (inn.remaining <= EPS) ii++
      if (out.remaining <= EPS) oi++
    }

    for (let i = ii; i < ins.length; i++) {
      const inn = ins[i]
      while (inn.remaining > EPS) {
        const t = inn.remaining
        rows.push({
          sku,
          itemName: g.itemName,
          quantity: t,
          fromLocation: main,
          toLocation: inn.locationId,
          reference: `LEDGER_SITE_ALIGN:${sku}:${main}->${inn.label || inn.locationId}`,
          notes: `Align site ledger to LocationInventory (inbound vs ${inn.label || inn.locationId}; counterparty main office)`
        })
        inn.remaining = 0
      }
    }

    for (let i = oi; i < outs.length; i++) {
      const out = outs[i]
      while (out.remaining > EPS) {
        const t = out.remaining
        rows.push({
          sku,
          itemName: g.itemName,
          quantity: t,
          fromLocation: out.locationId,
          toLocation: main,
          reference: `LEDGER_SITE_ALIGN:${sku}:${out.label || out.locationId}->${main}`,
          notes: `Align site ledger to LocationInventory (outbound from ${out.label || out.locationId}; counterparty main office)`
        })
        out.remaining = 0
      }
    }
  }

  for (const row of rows) {
    assertValidTransferLocations(row.fromLocation, row.toLocation)
  }

  return rows
}
