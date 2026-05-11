#!/usr/bin/env node
/**
 * Restore StockMovement table from a JSON file produced by backup-stock-movements.js.
 *
 * WARNING: Replaces ALL rows in StockMovement with the backup snapshot.
 * LocationInventory / InventoryItem are NOT modified — reconcile inventory separately if needed.
 *
 * Usage:
 *   node scripts/restore-stock-movements-backup.js reports/stock-movements-backup-....json --i-understand
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

async function main() {
  const argv = process.argv.slice(2)
  const confirm = argv.includes('--i-understand')
  const pathArg = argv.find((a) => !a.startsWith('--'))
  if (!pathArg) {
    console.error('Usage: node scripts/restore-stock-movements-backup.js <backup.json> --i-understand')
    process.exit(1)
  }
  if (!confirm) {
    console.error('Refusing to run without --i-understand (this wipes current StockMovement and restores from file).')
    process.exit(1)
  }

  const abs = resolve(process.cwd(), pathArg)
  let payload
  try {
    payload = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (e) {
    console.error('Failed to read or parse JSON:', e.message)
    process.exit(1)
  }

  const rows = payload.stockMovements
  if (!Array.isArray(rows)) {
    console.error('Backup file must contain { stockMovements: [...] }')
    process.exit(1)
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const deleted = await tx.stockMovement.deleteMany({})
    let inserted = 0
    for (const row of rows) {
      const {
        id,
        movementId,
        date,
        type,
        itemName,
        sku,
        quantity,
        fromLocation,
        toLocation,
        reference,
        performedBy,
        notes,
        ownerId,
        createdAt,
        updatedAt
      } = row
      await tx.stockMovement.create({
        data: {
          id,
          movementId,
          date: new Date(date),
          type: String(type || 'adjustment'),
          itemName: String(itemName || ''),
          sku: String(sku || ''),
          quantity: parseFloat(quantity) || 0,
          fromLocation: String(fromLocation ?? ''),
          toLocation: String(toLocation ?? ''),
          reference: String(reference ?? ''),
          performedBy: String(performedBy ?? ''),
          notes: String(notes ?? ''),
          ownerId: ownerId || null,
          createdAt: createdAt ? new Date(createdAt) : undefined,
          updatedAt: updatedAt ? new Date(updatedAt) : undefined
        }
      })
      inserted++
    }
    return { deleted: deleted.count, inserted }
  })

  console.log(JSON.stringify({ restoredFrom: abs, ...outcome }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
