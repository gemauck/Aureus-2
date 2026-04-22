#!/usr/bin/env node
/**
 * Hard-delete StockMovement rows WITHOUT adjusting inventory.
 *
 * Use only for ledger rows where on-hand quantities are already correct and the row
 * is redundant (e.g. auto-reversal lines left after undoing a stock-count import).
 *
 * Default filter:
 *   - notes contain "Auto-reversal for deleted movement"
 *   - reference contain "Stock count import"
 *
 * Narrow further:
 *   STOCK_PURGE_REFERENCE_CONTAINS="Stock count import 2026-04-21"
 *
 * Usage:
 *   node scripts/purge-stock-movement-records.mjs --dry-run
 *   node scripts/purge-stock-movement-records.mjs --execute
 *
 * Optional explicit IDs (skips default filter):
 *   STOCK_PURGE_MOVEMENT_IDS="MOV-aaa,MOV-bbb" node scripts/purge-stock-movement-records.mjs --execute
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const dryRun = process.argv.includes('--dry-run')
const execute = process.argv.includes('--execute')

function buildWhere() {
  const explicit = process.env.STOCK_PURGE_MOVEMENT_IDS
  if (explicit && explicit.trim()) {
    const movementIds = explicit
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    return { movementId: { in: movementIds } }
  }

  const refContains = (process.env.STOCK_PURGE_REFERENCE_CONTAINS || 'Stock count import').trim()
  return {
    AND: [
      { notes: { contains: 'reversal for deleted movement' } },
      { reference: { contains: refContains } }
    ]
  }
}

async function main() {
  const where = buildWhere()
  const rows = await prisma.stockMovement.findMany({
    where,
    select: { id: true, movementId: true, reference: true, notes: true, quantity: true, sku: true }
  })

  console.error(`Matching rows: ${rows.length}`)
  if (rows.length && process.env.STOCK_PURGE_VERBOSE === '1') {
    console.log(JSON.stringify(rows, null, 2))
  }

  if (!execute) {
    console.error(
      dryRun
        ? 'Dry run only. Pass --execute to hard-delete these rows (inventory quantities are NOT changed).'
        : 'Pass --dry-run to list count, or --execute to delete.'
    )
    await prisma.$disconnect()
    return
  }

  const result = await prisma.stockMovement.deleteMany({ where })
  console.log(JSON.stringify({ deleted: result.count, message: 'Rows removed; inventory not recalculated.' }, null, 2))

  const actor =
    (await prisma.user.findFirst({
      where: { role: { in: ['admin', 'administrator', 'superadmin'] } },
      select: { id: true, name: true, role: true }
    })) || (await prisma.user.findFirst({ select: { id: true, name: true, role: true } }))

  if (actor) {
    void logAuditFromRequest(prisma, {
      method: 'POST',
      user: { sub: actor.id, id: actor.id, name: actor.name, role: actor.role },
      headers: {}
    }, {
      action: 'delete',
      entity: 'manufacturing',
      entityId: 'stock-movement-purge',
      details: {
        resource: 'stock-movements-purge-records',
        summary: `Purge ${result.count} stock movement row(s) (record-only, no qty change)`,
        count: result.count
      }
    })
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
