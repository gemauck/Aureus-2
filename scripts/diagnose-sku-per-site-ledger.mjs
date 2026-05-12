#!/usr/bin/env node
/**
 * Read-only: for one SKU, list each LocationInventory row with movement-implied net at that site
 * and diff — same rules as Manufacturing per-warehouse ledger / verify-ledger-per-location.js.
 *
 * Usage:
 *   node scripts/diagnose-sku-per-site-ledger.mjs SKU0028
 *   npm run diagnose:sku-ledger-sites -- SKU0028
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { normalizeMovementAtLocationForSiteLedger } from '../api/_lib/alignLocationInventoryToMovements.js'

const EPS = 0.001

async function main() {
  const sku = String(process.argv[2] || '').trim()
  if (!sku) {
    console.error('Usage: node scripts/diagnose-sku-per-site-ledger.mjs <SKU>')
    process.exit(1)
  }

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const codeById = new Map(locations.map((l) => [l.id, String(l.code || '').trim()]))
  const nameById = new Map(locations.map((l) => [l.id, String(l.name || '').trim()]))

  const movements = await prisma.stockMovement.findMany({
    where: { sku },
    select: { sku: true, quantity: true, type: true, fromLocation: true, toLocation: true, reference: true, date: true }
  })

  const liRows = await prisma.locationInventory.findMany({
    where: { sku },
    select: { locationId: true, quantity: true, itemName: true }
  })

  if (!liRows.length) {
    console.log(JSON.stringify({ sku, locationInventoryRows: 0, message: 'No LocationInventory rows for this SKU.' }, null, 2))
    return
  }

  const rows = []
  for (const li of liRows) {
    const locId = li.locationId
    const code = codeById.get(locId) || ''
    let net = 0
    for (const m of movements) {
      net += normalizeMovementAtLocationForSiteLedger(m, locId, code)
    }
    const recorded = parseFloat(li.quantity) || 0
    const diff = recorded - net
    rows.push({
      sku,
      locationId: locId,
      locationCode: code || null,
      locationName: nameById.get(locId) || null,
      recordedOnHand: recorded,
      netFromMovements: net,
      diff,
      mismatched: Math.abs(diff) > EPS
    })
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  const mismatched = rows.filter((r) => r.mismatched)
  console.log(
    JSON.stringify(
      {
        sku,
        movementCount: movements.length,
        locationInventoryRows: liRows.length,
        mismatchedSites: mismatched.length,
        rows,
        hint:
          mismatched.length > 0
            ? 'Per-site: stock exists where movement net does not match (often baseline anchored on another bin). Fix with posted transfers that match physical stock, or controlled scripts — not silent LI edits alone.'
            : 'All LI rows for this SKU match per-site movement nets within tolerance.'
      },
      null,
      2
    )
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
