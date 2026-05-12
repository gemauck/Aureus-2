#!/usr/bin/env node
/**
 * Align sum(LocationInventory) to combined StockMovement net (movements as truth).
 * Uses applyStockCountAdjustmentTx — every change is a visible adjustment row + LI update in one transaction.
 *
 * Usage:
 *   node scripts/align-location-inventory-to-movements.mjs --dry-run
 *   node scripts/align-location-inventory-to-movements.mjs --dry-run --sku SKU0091
 *   node scripts/align-location-inventory-to-movements.mjs --write
 *   node scripts/align-location-inventory-to-movements.mjs --write --sku SKU0091
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import {
  alignSkuInventoryToCombinedMovements,
  computeCombinedLedgerMismatches
} from '../api/_lib/alignLocationInventoryToMovements.js'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const write = argv.includes('--write')
const skuArg = argv.find((a) => a.startsWith('--sku='))?.slice('--sku='.length)?.trim()

if ((dryRun && write) || (!dryRun && !write)) {
  console.error('Specify exactly one of --dry-run or --write')
  process.exit(1)
}

async function main() {
  const mismatches = await computeCombinedLedgerMismatches(prisma)
  const targets = skuArg ? mismatches.filter((m) => m.sku === skuArg) : mismatches

  if (skuArg && targets.length === 0) {
    console.log(JSON.stringify({ message: 'SKU not in mismatch list (may already tie out)', sku: skuArg }, null, 2))
    await prisma.$disconnect()
    return
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'write',
        mismatchCount: mismatches.length,
        processingCount: targets.length,
        skus: targets.slice(0, 30).map((t) => t.sku),
        truncatedList: targets.length > 30
      },
      null,
      2
    )
  )

  const results = []
  for (const row of targets) {
    try {
      const r = await alignSkuInventoryToCombinedMovements(prisma, row.sku, {
        dryRun,
        req: { user: { name: 'script:align-location-inventory-to-movements.mjs' } }
      })
      results.push(r)
    } catch (e) {
      results.push({ sku: row.sku, error: e.message })
    }
  }

  console.log(JSON.stringify({ results }, null, 2))

  if (write) {
    const ok = results.filter((r) => r.applied && !r.error).length
    const failed = results.filter((r) => r.error)
    console.log(JSON.stringify({ aligned: ok, failed: failed.length, errors: failed }, null, 2))
  }

  await prisma.$disconnect()
  const hasErr = results.some((r) => r.error)
  process.exit(hasErr ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
