#!/usr/bin/env node
/**
 * Align per-warehouse ledgers with LocationInventory without changing combined SKU totals:
 * inserts neutral **two-legged** transfers (combined net +0) so site-scoped movement sums match each site's qty.
 *
 * Omit `--sku` to plan **all** mismatched LocationInventory rows (bulk). Prefer `--dry-run` first,
 * then `--write` after a stock-movement backup.
 *
 * Usage:
 *   node scripts/repair-ledger-per-location.js --dry-run
 *   node scripts/repair-ledger-per-location.js --dry-run --require-combined-ok
 *   node scripts/repair-ledger-per-location.js --dry-run --sku=SKU0028
 *   node scripts/repair-ledger-per-location.js --dry-run --require-combined-ok --max-rows=50
 *   node scripts/backup-stock-movements.js
 *   node scripts/repair-ledger-per-location.js --write
 *   node scripts/repair-ledger-per-location.js --write --require-combined-ok
 *   node scripts/repair-ledger-per-location.js --write --sku=SKU0028
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { buildMovementId } from '../api/_lib/stockCountAdjustment.js'
import { buildPairedLedgerAlignTransfers } from '../api/_lib/stockMovementTransfer.js'

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

function intFlag(argv, name) {
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) {
    const n = parseInt(String(eq.split('=')[1] || ''), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const idx = argv.indexOf(name)
  if (idx !== -1 && argv[idx + 1]) {
    const n = parseInt(String(argv[idx + 1]), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return 0
}

function normalizeCombined(m) {
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const write = argv.includes('--write')
  const skuFilter = skuFilterFromArgv(argv)
  const requireCombinedOk = argv.includes('--require-combined-ok')
  const maxRows = intFlag(argv, '--max-rows')
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

  const netCombinedBySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    netCombinedBySku.set(sku, (netCombinedBySku.get(sku) || 0) + normalizeCombined(m))
  }

  const liRows = await prisma.locationInventory.findMany({
    select: { sku: true, locationId: true, quantity: true, itemName: true }
  })

  const liSumBySku = new Map()
  for (const li of liRows) {
    const sku = String(li.sku || '').trim()
    if (!sku) continue
    liSumBySku.set(sku, (liSumBySku.get(sku) || 0) + (parseFloat(li.quantity) || 0))
  }

  /**
   * For SKUs with any LocationInventory row, combined recorded stock is Σ LI (same as
   * verify-ledger-reconciliation when LI exists). No full-table InventoryItem scan — avoids
   * statement timeouts on large catalogs.
   */
  /** @type {Set<string>} */
  let combinedOkSku = null
  if (requireCombinedOk) {
    combinedOkSku = new Set()
    for (const sku of liSumBySku.keys()) {
      const rec = liSumBySku.get(sku) || 0
      const net = netCombinedBySku.get(sku) || 0
      if (Math.abs(net - rec) <= EPS) combinedOkSku.add(sku)
    }
  }

  /** Planned inserts */
  const planned = []

  for (const li of liRows) {
    const sku = String(li.sku || '').trim()
    const locId = li.locationId
    if (!sku || !locId) continue
    if (skuFilter && sku !== skuFilter) continue
    if (requireCombinedOk && combinedOkSku && !combinedOkSku.has(sku)) continue
    const code = codeById.get(locId) || ''
    const list = movementsBySku.get(sku) || []
    let net = 0
    for (const m of list) {
      net += normalizeAtLocation(m, locId, code)
    }
    const recorded = parseFloat(li.quantity) || 0
    const delta = recorded - net
    if (Math.abs(delta) <= EPS) continue

    const itemName = String(li.itemName || sku).slice(0, 500)
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

  const plannedBeforeCap = planned.length
  let droppedForMaxRows = 0
  if (maxRows > 0 && planned.length > maxRows) {
    droppedForMaxRows = planned.length - maxRows
    planned.length = maxRows
  }

  const mainLoc =
    locations.find((l) => l.code === '01_LOC1') ||
    locations.find((l) => l.code === 'LOC001') ||
    locations[0]
  if (!mainLoc?.id) {
    console.error('No stock location found for pairing ledger-align transfers')
    process.exit(1)
  }

  const paired = buildPairedLedgerAlignTransfers(planned, mainLoc.id)

  const skuSet = new Set(paired.map((p) => p.sku))
  const totalQty = paired.reduce((s, p) => s + (parseFloat(p.quantity) || 0), 0)
  const topByQuantity = [...paired]
    .sort((a, b) => (parseFloat(b.quantity) || 0) - (parseFloat(a.quantity) || 0))
    .slice(0, 25)
    .map((p) => ({
      sku: p.sku,
      quantity: p.quantity,
      fromLocation: p.fromLocation,
      toLocation: p.toLocation,
      reference: p.reference
    }))

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'write',
        skuFilter: skuFilter || null,
        requireCombinedOk: requireCombinedOk || undefined,
        maxRows: maxRows || undefined,
        siteLegPlans: planned.length,
        pairedTransferRows: paired.length,
        mainLocationCounterparty: { id: mainLoc.id, code: mainLoc.code, name: mainLoc.name },
        plannedBeforeMaxRowsCap: droppedForMaxRows ? plannedBeforeCap : undefined,
        droppedForMaxRows: droppedForMaxRows || undefined,
        distinctSkus: skuSet.size,
        sumAbsQuantities: totalQty,
        topByQuantity,
        sample: paired.slice(0, 20),
        sampleTruncated: paired.length > 20
      },
      null,
      2
    )
  )

  if (dryRun) {
    console.log(
      '\nAfter backup: node scripts/repair-ledger-per-location.js --write [--require-combined-ok] [--max-rows=N] [--sku=…]'
    )
    await prisma.$disconnect()
    return
  }

  const MOV_DATE = new Date()

  let inserted = 0
  await prisma.$transaction(
    async (tx) => {
      for (const p of paired) {
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
            reference: String(p.reference || `${REF_TAG}:${p.sku}`).slice(0, 500),
            performedBy: 'repair-ledger-per-location.js',
            notes: String(p.notes || 'Align site ledger to LocationInventory (paired transfer)').slice(0, 2000),
            ownerId: null
          }
        })
        inserted++
      }
    },
    { maxWait: 60000, timeout: 300000 }
  )

  console.log(JSON.stringify({ insertedPairedTransferRows: inserted }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
