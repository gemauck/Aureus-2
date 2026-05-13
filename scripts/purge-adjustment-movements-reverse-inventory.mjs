#!/usr/bin/env node
/**
 * Remove adjustment StockMovement rows and reverse their effect on LocationInventory +
 * master InventoryItem (same logic as purgeAdjustmentStockMovementTx).
 *
 * Default filter targets WO0001 production-delete stock returns:
 *   type=adjustment, reference=WO0001, notes contain "Stock return - Production order deleted"
 *
 * Override with explicit public movementIds (comma/space-separated):
 *   STOCK_PURGE_MOVEMENT_IDS="MOV-aaa,MOV-bbb"
 *
 * If --write fails with "reversal would make stock negative at location", per-location
 * quantities may already match reality (e.g. duplicate InventoryItem rows / empty LI).
 * Remove those rows only (no qty change) with explicit IDs:
 *   STOCK_PURGE_MOVEMENT_IDS="MOV-…" node scripts/purge-stock-movement-records.mjs --execute
 *
 * Usage:
 *   node scripts/purge-adjustment-movements-reverse-inventory.mjs --dry-run
 *   node scripts/purge-adjustment-movements-reverse-inventory.mjs --write
 */
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { purgeAdjustmentStockMovementTx } from '../api/_lib/reverseStockMovementDeletion.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

/** Direct client avoids api/_lib/prisma.js query timeouts on long batch $transaction runs. */
const prisma = new PrismaClient()

const dryRun = process.argv.includes('--dry-run')
const write = process.argv.includes('--write')

function buildWhere() {
  const explicit = process.env.STOCK_PURGE_MOVEMENT_IDS
  if (explicit && explicit.trim()) {
    const movementIds = explicit
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    return { movementId: { in: movementIds } }
  }

  const ref = (process.env.STOCK_PURGE_REFERENCE || 'WO0001').trim()
  const notesContains = (
    process.env.STOCK_PURGE_NOTES_CONTAINS || 'Stock return - Production order deleted'
  ).trim()

  return {
    type: 'adjustment',
    reference: ref,
    notes: { contains: notesContains }
  }
}

async function main() {
  if (dryRun && write) {
    console.error('Use only one of --dry-run or --write')
    process.exit(1)
  }
  if (!dryRun && !write) {
    console.error('Pass --dry-run (list + count) or --write (apply purges)')
    process.exit(1)
  }

  const where = buildWhere()
  const rows = await prisma.stockMovement.findMany({
    where,
    orderBy: { date: 'asc' },
    select: {
      id: true,
      movementId: true,
      date: true,
      sku: true,
      quantity: true,
      reference: true,
      notes: true
    }
  })

  console.error(`Matching movements: ${rows.length}`)
  if (process.env.STOCK_PURGE_VERBOSE === '1') {
    console.log(JSON.stringify(rows, null, 2))
  } else if (rows.length) {
    const sample = rows.slice(0, 5).map((r) => r.movementId)
    console.error('Sample movementIds:', sample.join(', '), rows.length > 5 ? '…' : '')
  }

  if (!write) {
    console.error('Dry run only. Pass --write to reverse inventory and delete these rows.')
    await prisma.$disconnect()
    return
  }

  const report = { purged: 0, errors: [] }

  for (const row of rows) {
    try {
      await prisma.$transaction(
        async (tx) => {
          await purgeAdjustmentStockMovementTx(tx, row.id)
        },
        { maxWait: 60000, timeout: 120000 }
      )
      report.purged++
      console.error(`OK ${report.purged}/${rows.length} ${row.movementId}`)
    } catch (e) {
      report.errors.push({ movementId: row.movementId, id: row.id, message: e?.message || String(e) })
      console.error(`ERR ${row.movementId}:`, e?.message || e)
    }
  }

  console.log(JSON.stringify(report, null, 2))

  if (report.purged > 0) {
    const actor =
      (await prisma.user.findFirst({
        where: { role: { in: ['admin', 'administrator', 'superadmin'] } },
        select: { id: true, name: true, role: true }
      })) || (await prisma.user.findFirst({ select: { id: true, name: true, role: true } }))

    if (actor) {
      void logAuditFromRequest(
        prisma,
        {
          method: 'POST',
          user: { sub: actor.id, id: actor.id, name: actor.name, role: actor.role },
          headers: {}
        },
        {
          action: 'delete',
          entity: 'manufacturing',
          entityId: 'stock-movement-purge-adjustment',
          details: {
            resource: 'stock-movements-purge-with-inventory-reversal',
            summary: `Purged ${report.purged} adjustment movement(s); inventory reversed`,
            purged: report.purged,
            errorCount: report.errors.length
          }
        }
      )
    }
  }

  await prisma.$disconnect()
  if (report.errors.length) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
