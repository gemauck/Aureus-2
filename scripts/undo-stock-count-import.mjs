#!/usr/bin/env node
/**
 * Reverses a stock-count template import by deleting each created movement
 * (same as DELETE /api/manufacturing/stock-movements/:id per row):
 * restores location + master quantities, writes auto-reversal adjustment, removes original row.
 *
 * Usage:
 *   node scripts/undo-stock-count-import.mjs
 *   STOCK_COUNT_UNDO_MOVEMENT_IDS="MOV-xxx,MOV-yyy" node scripts/undo-stock-count-import.mjs
 *   STOCK_COUNT_UNDO_BATCH_ID=sc-... optional: deletes AuditLog row for that import batch
 *
 * Default movementIds match the import batch from 2026-04-21 (17 movements).
 *
 * After undo, to remove auto-reversal ledger rows and reconcile master catalog qty
 * to location sums, run:
 *   node scripts/complete-stock-count-import-cleanup.mjs --execute
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'
import { reverseStockMovementDeletionTx } from '../api/_lib/reverseStockMovementDeletion.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

/** Import run (CLI output) — override via STOCK_COUNT_UNDO_MOVEMENT_IDS */
const DEFAULT_MOVEMENT_IDS = [
  'MOV-MO925G6B-U852W2',
  'MOV-MO925I6G-2H17A3',
  'MOV-MO925JC0-VXUVT3',
  'MOV-MO925KHV-0YL4JP',
  'MOV-MO925LO7-MC9QIR',
  'MOV-MO925N5Y-RTSI0Q',
  'MOV-MO925OCK-WBFED4',
  'MOV-MO925PIV-275XCR',
  'MOV-MO925QOP-EJOVLR',
  'MOV-MO925RV4-B01DJ3',
  'MOV-MO925T19-YWXV9P',
  'MOV-MO925UCW-YXTMNM',
  'MOV-MO925VJI-RSLZKP',
  'MOV-MO925XCT-REWFZB',
  'MOV-MO925YLM-6UR3J1',
  'MOV-MO925ZT7-9PON34',
  'MOV-MO92615C-QHJCRQ'
]

const BATCH_ID = process.env.STOCK_COUNT_UNDO_BATCH_ID || 'sc-1776802194264'

function parseMovementIds() {
  const raw = process.env.STOCK_COUNT_UNDO_MOVEMENT_IDS
  if (raw && raw.trim()) {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return DEFAULT_MOVEMENT_IDS
}

async function main() {
  const movementIds = parseMovementIds()
  const rows = await prisma.stockMovement.findMany({
    where: { movementId: { in: movementIds } },
    select: { id: true, movementId: true, reference: true }
  })

  const foundIds = new Set(rows.map((r) => r.movementId))
  const missing = movementIds.filter((m) => !foundIds.has(m))
  if (missing.length) {
    console.error('Movements not found (already reversed or wrong DB?):', missing.join(', '))
    process.exit(1)
  }

  const actor =
    (await prisma.user.findFirst({
      where: { role: { in: ['admin', 'administrator', 'superadmin'] } },
      select: { id: true, name: true, role: true }
    })) || (await prisma.user.findFirst({ select: { id: true, name: true, role: true } }))

  const mockReq = actor
    ? {
        method: 'DELETE',
        user: {
          sub: actor.id,
          id: actor.id,
          name: actor.name || 'Undo CLI',
          role: actor.role || 'admin'
        },
        headers: {}
      }
    : null

  let reversed = 0
  for (const row of rows) {
    await prisma.$transaction(async (tx) => {
      await reverseStockMovementDeletionTx(tx, row.id, actor?.name || 'Undo stock count import')
    })
    reversed++
    console.error('Reversed', row.movementId, row.reference || '')
  }

  const auditDel = await prisma.auditLog.deleteMany({
    where: {
      entity: 'manufacturing',
      entityId: BATCH_ID
    }
  })

  if (mockReq) {
    void logAuditFromRequest(prisma, mockReq, {
      action: 'delete',
      entity: 'manufacturing',
      entityId: BATCH_ID,
      details: {
        resource: 'stock-count-import-undo',
        summary: `Undid stock count import: reversed ${reversed} movements`,
        movementIds,
        auditLogRowsRemoved: auditDel.count
      }
    })
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        reversed,
        batchAuditLogDeleted: auditDel.count,
        note:
          'Original movements removed; auto-reversal adjustments remain (same as UI delete). Inventory quantities restored.'
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
