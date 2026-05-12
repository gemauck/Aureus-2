#!/usr/bin/env node
/**
 * Hard reset one SKU: delete all StockMovement rows for that SKU, delete all LocationInventory
 * rows for that SKU, collapse duplicate InventoryItem rows where safe, set canonical master to
 * opening qty at a warehouse, then insert one receipt movement (Option B: movement + LI truth).
 *
 * Default matches user request: SKU0002, qty 7, 2026-03-30 07:00 SAST, location 01_LOC1.
 *
 * Usage:
 *   node scripts/reset-sku-movements-and-opening-balance.mjs --dry-run
 *   node scripts/reset-sku-movements-and-opening-balance.mjs --dry-run --sku=SKU0002 --qty=7
 *   node scripts/backup-stock-movements.js
 *   node scripts/reset-sku-movements-and-opening-balance.mjs --write --sku=SKU0002 --qty=7
 *
 * Flags:
 *   --sku=SKU0002
 *   --qty=7
 *   --location-code=01_LOC1
 *   --opening-at=2026-03-30T07:00:00+02:00   (ISO; default 30 Mar 2026 07:00 SAST)
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { buildMovementId, findCanonicalInventoryItemBySkuTx, getStatusFromQuantity } from '../api/_lib/stockCountAdjustment.js'
import { computedInventoryTotalValue } from '../api/_lib/inventoryValue.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

function argVal(argv, name) {
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return String(eq.split('=').slice(1).join('=')).trim()
  const idx = argv.indexOf(name)
  if (idx !== -1 && argv[idx + 1]) return String(argv[idx + 1]).trim()
  return ''
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run')
  const write = argv.includes('--write')
  const sku = argVal(argv, '--sku') || 'SKU0002'
  const qtyRaw = argVal(argv, '--qty') || '7'
  const qty = parseFloat(qtyRaw)
  const locationCode = argVal(argv, '--location-code') || '01_LOC1'
  const openingAtRaw = argVal(argv, '--opening-at') || '2026-03-30T07:00:00+02:00'
  const openingAt = new Date(openingAtRaw)
  return { dryRun, write, sku, qty, locationCode, openingAt, openingAtRaw }
}

async function main() {
  const argv = process.argv.slice(2)
  const { dryRun, write, sku, qty, locationCode, openingAt, openingAtRaw } = parseArgs(argv)

  if ((dryRun && write) || (!dryRun && !write)) {
    console.error('Specify exactly one of --dry-run or --write')
    process.exit(1)
  }
  if (!sku) {
    console.error('Missing --sku')
    process.exit(1)
  }
  if (!Number.isFinite(qty) || qty < 0) {
    console.error('Invalid --qty')
    process.exit(1)
  }
  if (Number.isNaN(openingAt.getTime())) {
    console.error(`Invalid --opening-at: ${openingAtRaw}`)
    process.exit(1)
  }

  const loc = await prisma.stockLocation.findFirst({
    where: { code: locationCode },
    select: { id: true, code: true, name: true }
  })
  if (!loc) {
    console.error(`StockLocation not found for code: ${locationCode}`)
    process.exit(1)
  }

  const movementCount = await prisma.stockMovement.count({ where: { sku } })
  const liCount = await prisma.locationInventory.count({ where: { sku } })
  const invCount = await prisma.inventoryItem.count({ where: { sku } })
  const sampleMovements = await prisma.stockMovement.findMany({
    where: { sku },
    orderBy: { date: 'desc' },
    take: 5,
    select: { movementId: true, date: true, type: true, quantity: true, reference: true }
  })

  const preview = {
    mode: dryRun ? 'dry-run' : 'write',
    sku,
    openingQty: qty,
    locationCode: loc.code,
    locationId: loc.id,
    openingAt: openingAt.toISOString(),
    movementRowsToDelete: movementCount,
    locationInventoryRowsToDelete: liCount,
    inventoryItemRows: invCount,
    sampleMovementsToBeDeleted: sampleMovements
  }

  console.log(JSON.stringify(preview, null, 2))

  if (dryRun) {
    console.error('\nRe-run with --write after backup (e.g. node scripts/backup-stock-movements.js).')
    await prisma.$disconnect()
    return
  }

  const report = await prisma.$transaction(
    async (tx) => {
      const deletedMovements = await tx.stockMovement.deleteMany({ where: { sku } })
      const deletedLi = await tx.locationInventory.deleteMany({ where: { sku } })

      const allInv = await tx.inventoryItem.findMany({
        where: { sku },
        orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
      })
      if (!allInv.length) {
        throw new Error(`No InventoryItem found for ${sku}; create catalog row before reset.`)
      }

      const keeper = await findCanonicalInventoryItemBySkuTx(tx, sku)
      if (!keeper) throw new Error(`Could not resolve canonical InventoryItem for ${sku}`)

      let deletedInv = 0
      let zeroedInv = 0
      for (const it of allInv) {
        if (it.id === keeper.id) continue
        const [bomHit, lineHit] = await Promise.all([
          tx.bOM.findFirst({ where: { inventoryItemId: it.id }, select: { id: true } }),
          tx.stockTakeSubmissionLine.findFirst({ where: { inventoryItemId: it.id }, select: { id: true } })
        ])
        if (!bomHit && !lineHit) {
          await tx.inventoryItem.delete({ where: { id: it.id } })
          deletedInv++
        } else {
          await tx.inventoryItem.update({
            where: { id: it.id },
            data: {
              quantity: 0,
              totalValue: 0,
              allocatedQuantity: 0,
              completedQuantity: 0,
              inProductionQuantity: 0,
              status: 'out_of_stock'
            }
          })
          zeroedInv++
        }
      }

      const unitCost = Number(keeper.unitCost) || 0
      const reorderPoint = Number(keeper.reorderPoint) || 0
      const itemName = String(keeper.name || sku).slice(0, 500)
      const status = getStatusFromQuantity(qty, reorderPoint)

      await tx.inventoryItem.update({
        where: { id: keeper.id },
        data: {
          quantity: qty,
          locationId: loc.id,
          location: String(loc.name || loc.code || '').slice(0, 500),
          unitCost,
          totalValue: computedInventoryTotalValue(qty, unitCost),
          status,
          allocatedQuantity: 0,
          completedQuantity: 0,
          inProductionQuantity: 0,
          lastRestocked: openingAt
        }
      })

      await tx.locationInventory.create({
        data: {
          locationId: loc.id,
          sku,
          itemName,
          quantity: qty,
          unitCost,
          reorderPoint,
          status,
          lastRestocked: openingAt
        }
      })

      await tx.stockMovement.create({
        data: {
          movementId: buildMovementId(),
          date: openingAt,
          type: 'receipt',
          itemName,
          sku,
          quantity: qty,
          fromLocation: '',
          toLocation: loc.id,
          reference: `OPENING_RESET:${sku}`.slice(0, 500),
          performedBy: 'reset-sku-movements-and-opening-balance.mjs',
          notes: `Opening balance after full movement/LI reset for ${sku} at ${loc.code}`.slice(0, 2000),
          ownerId: null
        }
      })

      return {
        deletedMovements: deletedMovements.count,
        deletedLocationInventory: deletedLi.count,
        deletedDuplicateInventoryItems: deletedInv,
        zeroedInventoryItems: zeroedInv,
        keeperInventoryItemId: keeper.id
      }
    },
    { maxWait: 60000, timeout: 300000 }
  )

  console.log(JSON.stringify({ ok: true, ...report }, null, 2))

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
        entityId: `sku-reset-${sku}`,
        details: {
          resource: 'stock-movements-sku-ledger-reset',
          summary: `Hard reset ${sku}: deleted movements + LI, opening receipt qty ${qty} @ ${locationCode}`,
          sku,
          openingQty: qty,
          locationCode,
          ...report
        }
      }
    )
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
