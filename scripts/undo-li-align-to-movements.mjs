#!/usr/bin/env node
/**
 * Reverse scripts/align-location-inventory-to-movements.mjs --write when it used
 * adjustments (those count toward combined net and double-counted).
 *
 * For each StockMovement with reference LI_ALIGN_TO_MOVEMENTS, posts an opposite
 * applyStockCountAdjustmentTx at the same fromLocation so combined net and LI return.
 *
 * Usage:
 *   node scripts/undo-li-align-to-movements.mjs --dry-run
 *   node scripts/undo-li-align-to-movements.mjs --write
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { ALIGN_LI_TO_MOVEMENTS_REF } from '../api/_lib/alignLocationInventoryToMovements.js'
import { applyStockCountAdjustmentTx } from '../api/_lib/stockCountAdjustment.js'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const write = argv.includes('--write')

if ((dryRun && write) || (!dryRun && !write)) {
  console.error('Specify exactly one of --dry-run or --write')
  process.exit(1)
}

async function main() {
  const rows = await prisma.stockMovement.findMany({
    where: { reference: ALIGN_LI_TO_MOVEMENTS_REF },
    orderBy: [{ createdAt: 'asc' }]
  })

  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', rowsToReverse: rows.length }, null, 2))

  if (dryRun) {
    console.log(JSON.stringify({ sample: rows.slice(0, 5) }, null, 2))
    await prisma.$disconnect()
    return
  }

  const req = { user: { name: 'script:undo-li-align-to-movements.mjs' } }
  let ok = 0
  for (const m of rows) {
    const qty = parseFloat(m.quantity) || 0
    const loc = String(m.fromLocation || '').trim()
    if (!loc || !qty) continue
    await prisma.$transaction(async (tx) => {
      await applyStockCountAdjustmentTx(tx, {
        req,
        sku: String(m.sku || '').trim(),
        itemName: String(m.itemName || m.sku || '').trim(),
        quantityDelta: -qty,
        locationId: loc,
        reference: 'LI_ALIGN_TO_MOVEMENTS_UNDO',
        notes: `Undo LI_ALIGN_TO_MOVEMENTS movement ${m.id} (reversed +${qty}).`
      })
    })
    ok++
  }

  console.log(JSON.stringify({ reversed: ok }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
