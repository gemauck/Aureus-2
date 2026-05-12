#!/usr/bin/env node
/**
 * Dry-run planner: per-location movement net vs LocationInventory (same rules as
 * `scripts/verify-ledger-per-location.js`), then suggests internal **transfers**
 * (movement-only story; does NOT write) to move attribution from sites with
 * excess movement net vs on-hand toward sites with a deficit.
 *
 * Option B (multi-warehouse truth): use this output to post matching transfers in
 * Manufacturing (or paired adjustments that net to zero company-wide), then re-run verify.
 *
 * Usage:
 *   node scripts/plan-location-ledger-rebalance.mjs
 *   node scripts/plan-location-ledger-rebalance.mjs --sku=SKU0044
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const EPS = 0.001

function normalizeAtLocation(m, locId, locCode) {
  const matches = (loc) => !!loc && (loc === locId || (!!locCode && loc === locCode))
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') {
    const qtyAbs = Math.abs(qty)
    const fromHere = matches(m.fromLocation)
    const toHere = matches(m.toLocation)
    if (toHere && !fromHere) return qtyAbs
    if (fromHere && !toHere) return -qtyAbs
    if (fromHere && toHere) return 0
    return 0
  }
  const touches = matches(m.fromLocation) || matches(m.toLocation)
  if (!touches) return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

function suggestTransfersForSku(rows) {
  /** @type {{ fromLocationId: string, toLocationId: string, quantity: number, note: string }[]} */
  const transfers = []
  const donors = rows
    .filter((r) => r.diff > EPS)
    .map((r) => ({
      locationId: r.locationId,
      code: r.locationCode,
      name: r.locationName,
      diff: r.diff
    }))
  const receivers = rows
    .filter((r) => r.diff < -EPS)
    .map((r) => ({
      locationId: r.locationId,
      code: r.locationCode,
      name: r.locationName,
      need: -r.diff
    }))

  const dState = donors.map((x) => ({ ...x }))
  const rState = receivers.map((x) => ({ ...x }))

  while (dState.length && rState.length) {
    dState.sort((a, b) => b.diff - a.diff)
    rState.sort((a, b) => b.need - a.need)
    const d = dState[0]
    const r = rState[0]
    const t = Math.min(d.diff, r.need)
    if (t <= EPS) break
    transfers.push({
      fromLocationId: d.locationId,
      toLocationId: r.locationId,
      quantity: Math.round(t * 1000) / 1000,
      note: `Rebalance movement attribution: excess net at ${d.code || d.locationId} vs on-hand → site ${r.code || r.locationId} understates net`
    })
    d.diff -= t
    r.need -= t
    if (d.diff <= EPS) dState.shift()
    if (r.need <= EPS) rState.shift()
  }

  return transfers
}

async function main() {
  const skuArg = process.argv.find((a) => a.startsWith('--sku='))?.slice('--sku='.length)?.trim()

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const codeById = new Map(locations.map((l) => [l.id, String(l.code || '').trim()]))
  const nameById = new Map(locations.map((l) => [l.id, String(l.name || '').trim()]))

  const movements = await prisma.stockMovement.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })

  const movementsBySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    if (!movementsBySku.has(sku)) movementsBySku.set(sku, [])
    movementsBySku.get(sku).push(m)
  }

  const liRows = await prisma.locationInventory.findMany({
    select: { sku: true, locationId: true, quantity: true }
  })

  const mismatched = []
  for (const li of liRows) {
    const sku = String(li.sku || '').trim()
    const locId = li.locationId
    if (!sku || !locId) continue
    if (skuArg && sku !== skuArg) continue
    const code = codeById.get(locId) || ''
    const list = movementsBySku.get(sku) || []
    let net = 0
    for (const m of list) {
      net += normalizeAtLocation(m, locId, code)
    }
    const recorded = parseFloat(li.quantity) || 0
    if (Math.abs(net - recorded) > EPS) {
      mismatched.push({
        sku,
        locationId: locId,
        locationCode: code || null,
        locationName: nameById.get(locId) || null,
        recordedOnHand: recorded,
        netFromMovements: net,
        diff: net - recorded
      })
    }
  }

  const bySku = new Map()
  for (const row of mismatched) {
    if (!bySku.has(row.sku)) bySku.set(row.sku, [])
    bySku.get(row.sku).push(row)
  }

  const skuPlans = []
  for (const [sku, rows] of bySku) {
    const transfers = suggestTransfersForSku(rows)
    if (transfers.length || rows.length) {
      skuPlans.push({ sku, rowCount: rows.length, suggestedTransfers: transfers })
    }
  }
  skuPlans.sort((a, b) => b.rowCount - a.rowCount)

  const transferCount = skuPlans.reduce((n, p) => n + p.suggestedTransfers.length, 0)

  console.log(
    JSON.stringify(
      {
        policy: 'Option B — planner only (no DB writes). Post transfers in Manufacturing to apply.',
        skuFilter: skuArg || null,
        mismatchedLiRows: mismatched.length,
        skusAffected: bySku.size,
        suggestedTransferLegs: transferCount,
        note:
          'Heuristic pairs excess movement net (diff>0) with deficit sites (diff<0). Multi-site imbalances may need manual review or multiple rounds.',
        skuPlans: skuPlans.slice(0, 200),
        truncatedSkuPlans: skuPlans.length > 200
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
