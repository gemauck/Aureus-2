#!/usr/bin/env node
/**
 * Completes cleanup after a stock-count import was undone:
 *  1) Hard-deletes auto-reversal StockMovement rows (ledger only — does NOT change LocationInventory).
 *  2) Reconciles canonical InventoryItem.quantity to sum(LocationInventory) for affected SKUs
 *     so master catalog matches locations (pre-import truth if undo ran correctly).
 *
 * Usage:
 *   node scripts/complete-stock-count-import-cleanup.mjs --dry-run
 *   node scripts/complete-stock-count-import-cleanup.mjs --execute
 *
 * Optional:
 *   STOCK_PURGE_REFERENCE_CONTAINS="Stock count import 2026-04-21"
 *   STOCK_PURGE_MOVEMENT_IDS="MOV-a,MOV-b"  (bypasses note/reference filter)
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'
import { reconcileInventoryMasterForSkus } from '../api/_lib/reconcileInventoryMasterForSkus.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

/** SKUs touched by the 2026-04-21 import batch (always reconciled on --execute) */
const DEFAULT_RECONCILE_SKUS = [
  'SKU0028',
  'SKU0037',
  'SKU0127',
  'SKU0128',
  'SKU0182',
  'SKU0250',
  'SKU0252',
  'SKU0258',
  'SKU0264',
  'SKU0267',
  'SKU0272',
  'SKU0394'
]

const dryRun = process.argv.includes('--dry-run')
const execute = process.argv.includes('--execute')

function buildPurgeWhere() {
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
  if (!execute && !dryRun) {
    console.error('Pass --dry-run (preview) or --execute (purge + reconcile).')
    process.exit(1)
  }

  const where = buildPurgeWhere()
  const toPurge = await prisma.stockMovement.findMany({
    where,
    select: { movementId: true, sku: true, reference: true, notes: true }
  })

  const skusFromMovements = [...new Set(toPurge.map((r) => r.sku).filter(Boolean))]
  const skusToReconcile = [...new Set([...DEFAULT_RECONCILE_SKUS, ...skusFromMovements])]

  console.error(`Rows to purge: ${toPurge.length}`)
  console.error(`SKUs to reconcile: ${skusToReconcile.length}`)

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          purgeSample: toPurge.slice(0, 8),
          skusToReconcile
        },
        null,
        2
      )
    )
    console.error('\nRe-run with --execute to purge ledger rows and reconcile masters.')
    await prisma.$disconnect()
    return
  }

  const del = await prisma.stockMovement.deleteMany({ where })
  const reconciled = await reconcileInventoryMasterForSkus(prisma, skusToReconcile)

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
        action: 'update',
        entity: 'manufacturing',
        entityId: 'stock-count-import-cleanup',
        details: {
          resource: 'stock-count-import-cleanup',
          summary: `Purge ${del.count} movement row(s); reconciled ${reconciled.length} SKU master(s)`,
          deletedMovements: del.count,
          reconciled
        }
      }
    )
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedMovementRows: del.count,
        inventoryMasterUpdates: reconciled,
        message:
          'Ledger rows removed where matched. Location quantities unchanged. Master InventoryItem rows aligned to sum(LocationInventory) per SKU.'
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
