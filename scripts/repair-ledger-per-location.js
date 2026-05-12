#!/usr/bin/env node
/**
 * Align per-warehouse ledgers with LocationInventory without changing combined SKU totals:
 * inserts neutral transfers (combined net +0) so site-scoped movement sums match each site's qty.
 *
 * Usage:
 *   node scripts/repair-ledger-per-location.js --dry-run
 *   node scripts/repair-ledger-per-location.js --dry-run --sku=SKU0028
 *   node scripts/backup-stock-movements.js
 *   node scripts/repair-ledger-per-location.js --write
 *   node scripts/repair-ledger-per-location.js --write --sku=SKU0028
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { buildMovementId } from '../api/_lib/stockCountAdjustment.js'

const EPS = 0.001
const REF_TAG = 'LEDGER_SITE_ALIGN'

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

function skuFilterFromArgv(argv) {
  const eq = argv.find((a) => /^--sku=/.test(a))
  if (eq) return String(eq.split('=')[1] || '').trim()
  const idx = argv.indexOf('--sku')
  if (idx !== -1 && argv[idx + 1]) return String(argv[idx + 1]).trim()
  return ''
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const write = argv.includes('--write')
  const skuFilter = skuFilterFromArgv(argv)
  if ((dryRun && write) || (!dryRun && !write)) {
    console.error('Specify exactly one of --dry-run or --write')
    process.exit(1)
  }

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const codeById = new Map(locations.map((l) => [l.id, String(l.code || '').trim()]))

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

  const canonicalBySku = new Map()
  const invRows = await prisma.inventoryItem.findMany({
    orderBy: [{ sku: 'asc' }, { locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  for (const row of invRows) {
    const k = String(row.sku || '').trim()
    if (!k || canonicalBySku.has(k)) continue
    canonicalBySku.set(k, row)
  }

  const liRows = await prisma.locationInventory.findMany({
    select: { sku: true, locationId: true, quantity: true, itemName: true }
  })

  /** Planned inserts */
  const planned = []

  for (const li of liRows) {
    const sku = String(li.sku || '').trim()
    const locId = li.locationId
    if (!sku || !locId) continue
    if (skuFilter && sku !== skuFilter) continue
    const code = codeById.get(locId) || ''
    const list = movementsBySku.get(sku) || []
    let net = 0
    for (const m of list) {
      net += normalizeAtLocation(m, locId, code)
    }
    const recorded = parseFloat(li.quantity) || 0
    const delta = recorded - net
    if (Math.abs(delta) <= EPS) continue

    const itemName = canonicalBySku.get(sku)?.name || li.itemName || sku
    if (delta > 0) {
      planned.push({
        sku,
        itemName,
        kind: 'transfer_in',
        quantity: Math.abs(delta),
        fromLocation: '',
        toLocation: locId,
        locationLabel: code || locId
      })
    } else {
      planned.push({
        sku,
        itemName,
        kind: 'transfer_out',
        quantity: Math.abs(delta),
        fromLocation: locId,
        toLocation: '',
        locationLabel: code || locId
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'write',
        skuFilter: skuFilter || null,
        rowsToInsert: planned.length,
        sample: planned.slice(0, 20),
        truncated: planned.length > 20
      },
      null,
      2
    )
  )

  if (dryRun) {
    console.log('\nRun backup then: node scripts/repair-ledger-per-location.js --write')
    await prisma.$disconnect()
    return
  }

  const MOV_DATE = new Date()

  let inserted = 0
  await prisma.$transaction(
    async (tx) => {
      for (const p of planned) {
        await tx.stockMovement.create({
          data: {
            movementId: buildMovementId(),
            date: MOV_DATE,
            type: 'transfer',
            itemName: String(p.itemName || p.sku).slice(0, 500),
            sku: p.sku,
            quantity: p.quantity,
            fromLocation: p.fromLocation,
            toLocation: p.toLocation,
            reference: `${REF_TAG}:${p.sku}:${p.locationLabel}`.slice(0, 500),
            performedBy: 'repair-ledger-per-location.js',
            notes: `Align site ledger to LocationInventory (neutral in combined total): ${p.kind}`.slice(0, 2000),
            ownerId: null
          }
        })
        inserted++
      }
    },
    { maxWait: 60000, timeout: 300000 }
  )

  console.log(JSON.stringify({ insertedTransferLines: inserted }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
