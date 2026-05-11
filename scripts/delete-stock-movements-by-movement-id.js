#!/usr/bin/env node
/**
 * Remove stock movements by public movementId (e.g. MOV-MF8Z4HO-FIQN0X).
 * Reverses LocationInventory + master item totals, deletes the row — no auto-reversal
 * ledger line (adjustment-only; see purgeAdjustmentStockMovementTx).
 *
 * Usage:
 *   node scripts/delete-stock-movements-by-movement-id.js MOV-MF8Z4HO-FIQN0X MOV-MF8ZV7X-833J7Y
 *   node scripts/delete-stock-movements-by-movement-id.js MOV-... --write
 *
 * Production (point DATABASE_URL at prod — verify host printed below):
 *   DATABASE_URL='postgresql://...' node scripts/delete-stock-movements-by-movement-id.js MOV-... MOV-... --write
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { purgeAdjustmentStockMovementTx } from '../api/_lib/reverseStockMovementDeletion.js'

/** Safe summary so you confirm prod vs dev before --write */
function logDatabaseTarget() {
  const raw = process.env.DATABASE_URL || ''
  if (!raw) {
    console.error('DATABASE_URL is not set. Add it to .env or prefix the command.')
    return
  }
  try {
    const u = new URL(
      raw.replace(/^postgresql:\/\//, 'http://').replace(/^postgres:\/\//, 'http://')
    )
    const host = u.hostname || '(unknown host)'
    const db = (u.pathname || '').replace(/^\//, '').split('?')[0] || '(unknown db)'
    const port = u.port ? `:${u.port}` : ''
    console.log(`Database target: ${host}${port} / database "${db}"`)
  } catch {
    console.log('Database target: (could not parse DATABASE_URL — check connection string)')
  }
}

function parseArgs(argv) {
  const write = argv.includes('--write')
  const ids = argv.filter((a) => a !== '--write')
  return { write, movementIds: ids }
}

async function main() {
  logDatabaseTarget()

  const { write, movementIds } = parseArgs(process.argv.slice(2))
  if (!movementIds.length) {
    console.error('Usage: node scripts/delete-stock-movements-by-movement-id.js [--write] <movementId> [movementId...]')
    process.exit(1)
  }

  const rows = await prisma.stockMovement.findMany({
    where: { movementId: { in: movementIds } },
    select: {
      id: true,
      movementId: true,
      type: true,
      sku: true,
      quantity: true,
      reference: true,
      date: true
    }
  })

  for (const mid of movementIds) {
    const hit = rows.find((r) => r.movementId === mid)
    if (!hit) console.warn(`Not found: ${mid}`)
  }

  if (!rows.length) {
    console.error('No matching movements in database.')
    process.exit(1)
  }

  console.log('Matched movements:')
  for (const r of rows) {
    console.log(
      `  ${r.movementId}  id=${r.id}  type=${r.type}  sku=${r.sku}  qty=${r.quantity}  ref=${(r.reference || '').slice(0, 60)}`
    )
  }

  if (!write) {
    console.log('\nDry run. Re-run with --write to apply.')
    return
  }

  console.log('\nApplying deletes (--write). Inventory will be reversed for these adjustments.')

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await purgeAdjustmentStockMovementTx(tx, r.id)
      console.log(`Deleted ${r.movementId} (${r.id})`)
    }
  })

  console.log('\nDone.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
