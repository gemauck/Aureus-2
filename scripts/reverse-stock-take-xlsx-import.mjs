#!/usr/bin/env node
/**
 * Reverses stock movements created by scripts/apply-stock-take-from-xlsx.mjs
 * (same mechanism as scripts/undo-stock-count-import.mjs: reverseStockMovementDeletionTx).
 *
 * Matches rows where:
 *   - type = adjustment
 *   - reference = STOCK_TAKE_REFERENCE (default: Stock Take April 30 2026)
 *   - notes contains "batch=st-" (tag from the import script)
 * Excludes auto-reversal rows.
 *
 * Usage:
 *   node scripts/reverse-stock-take-xlsx-import.mjs [--dry-run] [--execute]
 *
 * Default is --dry-run (list only). Use --execute to apply.
 *
 * Env:
 *   STOCK_TAKE_REFERENCE - must match the import run you are undoing
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'
import { reverseStockMovementDeletionTx } from '../api/_lib/reverseStockMovementDeletion.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const REFERENCE = process.env.STOCK_TAKE_REFERENCE?.trim() || 'Stock Take April 30 2026'

async function findStockTakeXlsxImportMovements() {
  return prisma.stockMovement.findMany({
    where: {
      type: 'adjustment',
      AND: [
        {
          OR: [
            { reference: REFERENCE },
            { notes: { contains: REFERENCE } }
          ]
        },
        { notes: { contains: 'batch=st-' } }
      ],
      NOT: { notes: { startsWith: 'Auto-reversal' } }
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, movementId: true, sku: true, quantity: true, reference: true, notes: true, createdAt: true }
  })
}

async function main() {
  const execute = process.argv.includes('--execute')
  const dryRun = process.argv.includes('--dry-run') || !execute

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const rows = await findStockTakeXlsxImportMovements()

  console.log('Reference filter:', JSON.stringify(REFERENCE))
  console.log('Movements found:', rows.length)
  if (rows.length === 0) {
    console.log('Nothing to reverse (wrong STOCK_TAKE_REFERENCE or already reversed).')
    await prisma.$disconnect()
    return
  }

  if (rows.length <= 20) {
    for (const r of rows) {
      console.log(' ', r.movementId, r.sku, r.quantity, r.notes?.slice(0, 80))
    }
  } else {
    console.log('First 5:', rows.slice(0, 5).map((r) => r.movementId).join(', '), '…')
  }

  if (dryRun) {
    console.log('\nDry run: no changes. Add --execute to reverse these movements.')
    await prisma.$disconnect()
    return
  }

  const actor =
    (await prisma.user.findFirst({
      where: { role: { in: ['admin', 'administrator', 'superadmin'] } },
      select: { id: true, name: true, role: true, email: true }
    })) || (await prisma.user.findFirst({ select: { id: true, name: true, role: true, email: true } }))

  const mockReq = {
    method: 'POST',
    user: {
      sub: actor?.id || 'script',
      id: actor?.id || 'script',
      name: actor?.name || 'Reverse stock take import',
      email: actor?.email || '',
      role: actor?.role || 'admin'
    },
    headers: {},
    connection: {},
    socket: {}
  }

  let reversed = 0
  const failed = []
  for (const row of rows) {
    try {
      await prisma.$transaction(
        async (tx) => {
          await reverseStockMovementDeletionTx(
            tx,
            row.id,
            actor?.name || 'Reverse stock take xlsx import'
          )
        },
        { timeout: 120000, maxWait: 30000 }
      )
      reversed++
      if (reversed % 25 === 0) console.log('… reversed', reversed, '/', rows.length)
    } catch (e) {
      failed.push({ movementId: row.movementId, sku: row.sku, error: e.message || String(e) })
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        reference: REFERENCE,
        requested: rows.length,
        reversed,
        failed: failed.slice(0, 15),
        failedTotal: failed.length
      },
      null,
      2
    )
  )

  if (actor) {
    await logAuditFromRequest(prisma, mockReq, {
      action: 'delete',
      entity: 'manufacturing',
      entityId: `reverse-stock-take-xlsx-${Date.now()}`,
      details: {
        resource: 'stock-take-xlsx-import-reversal',
        summary: `Reversed ${reversed} of ${rows.length} stock-take import movements (reference: ${REFERENCE})`,
        reference: REFERENCE,
        reversed,
        requested: rows.length,
        failed: failed.length
      }
    })
  }

  await prisma.$disconnect()
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
