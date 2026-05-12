#!/usr/bin/env node
/**
 * Per-warehouse reconciliation: for each LocationInventory row, movement net at that site
 * vs quantity on hand — matches Manufacturing inventory detail when a specific Location is selected.
 *
 * `StockMovement.fromLocation` / `toLocation` may be **location id** (preferred for new rows) or
 * **location code** (legacy); both are matched when resolving a site.
 *
 * Usage:
 *   node scripts/verify-ledger-per-location.js
 *   node scripts/verify-ledger-per-location.js --quiet   # exit 1 if any mismatch
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const EPS = 0.001

/** Mirrors Manufacturing.jsx normalizeQuantity when selectedDetailLocationId is set (non-transfer types must touch the site). */
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

async function main() {
  const quiet = process.argv.includes('--quiet')

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const codeById = new Map(locations.map((l) => [l.id, String(l.code || '').trim()]))
  const nameById = new Map(locations.map((l) => [l.id, String(l.name || '').trim()]))

  const movements = await prisma.stockMovement.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })

  /** @type {Map<string, typeof movements>} */
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

  mismatched.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  const summary = {
    check: 'per-location / per-warehouse',
    locationInventoryRowsChecked: liRows.length,
    ok: mismatched.length === 0,
    mismatchedCount: mismatched.length,
    mismatched: mismatched.slice(0, 80),
    truncated: mismatched.length > 80
  }

  if (!quiet) {
    console.log(JSON.stringify(summary, null, 2))
  } else if (mismatched.length > 0) {
    console.error(
      `Per-location ledger mismatch: ${mismatched.length} row(s). Largest gap: ${mismatched[0]?.sku} @ ${mismatched[0]?.locationCode || mismatched[0]?.locationId} (diff ${mismatched[0]?.diff})`
    )
  }

  await prisma.$disconnect()
  process.exit(mismatched.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
