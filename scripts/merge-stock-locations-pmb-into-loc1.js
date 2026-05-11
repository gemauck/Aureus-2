#!/usr/bin/env node
/**
 * Merge the legacy **PMB** stock site into **01_LOC1** (PIETERMARITZBURG OFFICE):
 * - Sum LocationInventory quantities into the target location; remove source rows.
 * - Rewire InventoryItem rows that pointed at PMB (dedupe when a LOC1 row already exists).
 * - Rewrite StockMovement from/to strings (PMB id and code "PMB") → target id.
 * - Point PurchaseOrder.receivingLocationId and StockTakeSubmission.locationId at target.
 * - Delete the source StockLocation row.
 * - Reconcile InventoryItem master quantities from LocationInventory sums for touched SKUs.
 *
 * Usage:
 *   node scripts/merge-stock-locations-pmb-into-loc1.js
 *   node scripts/merge-stock-locations-pmb-into-loc1.js --write --i-understand
 *
 * Options:
 *   --from-code=PMB       Source location code (default PMB)
 *   --into-code=01_LOC1   Target location code (default 01_LOC1)
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { reconcileInventoryMasterForSkus } from '../api/_lib/reconcileInventoryMasterForSkus.js'
import { getStatusFromQuantity } from '../api/_lib/stockCountAdjustment.js'

function argVal(prefix) {
  const a = process.argv.find((x) => x.startsWith(prefix))
  if (!a) return null
  const eq = a.indexOf('=')
  return eq >= 0 ? a.slice(eq + 1).trim() : null
}

function mergeUnitCost(q1, c1, q2, c2) {
  const Q = (Number(q1) || 0) + (Number(q2) || 0)
  if (Q <= 1e-9) return (Number(c1) || 0) || (Number(c2) || 0)
  return ((Number(q1) || 0) * (Number(c1) || 0) + (Number(q2) || 0) * (Number(c2) || 0)) / Q
}

async function main() {
  const isWrite = process.argv.includes('--write')
  const confirmed = process.argv.includes('--i-understand')
  const fromCode = argVal('--from-code=') || 'PMB'
  const intoCode = argVal('--into-code=') || '01_LOC1'

  console.log('Merge StockLocation:', fromCode, '→', intoCode)
  console.log('Mode:', isWrite && confirmed ? 'WRITE' : 'DRY RUN (no DB changes)')
  if (isWrite && !confirmed) {
    console.error('\nRefusing to write without --i-understand\n')
    process.exit(1)
  }
  console.log('')

  const [fromLoc, toLoc] = await Promise.all([
    prisma.stockLocation.findFirst({ where: { code: fromCode } }),
    prisma.stockLocation.findFirst({ where: { code: intoCode } })
  ])

  if (!fromLoc) {
    console.error(`Source location not found: code "${fromCode}"`)
    process.exit(1)
  }
  if (!toLoc) {
    console.error(`Target location not found: code "${intoCode}"`)
    process.exit(1)
  }
  if (fromLoc.id === toLoc.id) {
    console.log('Source and target are the same row; nothing to do.')
    await prisma.$disconnect()
    return
  }

  const pmbRows = await prisma.locationInventory.findMany({
    where: { locationId: fromLoc.id }
  })
  const loc1Rows = await prisma.locationInventory.findMany({
    where: { locationId: toLoc.id }
  })
  const loc1BySku = new Map(loc1Rows.map((r) => [r.sku, r]))

  let mergeBoth = 0
  let moveOnly = 0
  let sumPmbQty = 0
  let sumLoc1Qty = 0
  for (const r of pmbRows) {
    sumPmbQty += r.quantity || 0
    if (loc1BySku.has(r.sku)) mergeBoth++
    else moveOnly++
  }
  for (const r of loc1Rows) sumLoc1Qty += r.quantity || 0

  console.log('Locations:')
  console.log('  FROM:', fromLoc.code, '|', fromLoc.name, '|', fromLoc.id)
  console.log('  INTO:', toLoc.code, '|', toLoc.name, '|', toLoc.id)
  console.log('')
  console.log('LocationInventory:')
  console.log('  Rows at source:', pmbRows.length, '| qty sum:', sumPmbQty)
  console.log('  Rows at target (before):', loc1Rows.length, '| qty sum:', sumLoc1Qty)
  console.log('  SKUs present at both:', mergeBoth)
  console.log('  SKUs only at source (will move):', moveOnly)

  const movFrom = await prisma.stockMovement.count({
    where: { OR: [{ fromLocation: fromLoc.id }, { fromLocation: 'PMB' }, { fromLocation: fromCode }] }
  })
  const movTo = await prisma.stockMovement.count({
    where: { OR: [{ toLocation: fromLoc.id }, { toLocation: 'PMB' }, { toLocation: fromCode }] }
  })
  const poCount = await prisma.purchaseOrder.count({ where: { receivingLocationId: fromLoc.id } })
  const stCount = await prisma.stockTakeSubmission.count({ where: { locationId: fromLoc.id } })
  const invItems = await prisma.inventoryItem.count({ where: { locationId: fromLoc.id } })

  console.log('')
  console.log('Related rows pointing at source id / code:')
  console.log('  StockMovement fromLocation matches:', movFrom)
  console.log('  StockMovement toLocation matches:', movTo)
  console.log('  PurchaseOrder receivingLocationId:', poCount)
  console.log('  StockTakeSubmission locationId:', stCount)
  console.log('  InventoryItem locationId:', invItems)

  if (!isWrite || !confirmed) {
    console.log('')
    console.log('Dry run only. To apply:')
    console.log(`  node scripts/merge-stock-locations-pmb-into-loc1.js --write --i-understand --from-code=${fromCode} --into-code=${intoCode}`)
    await prisma.$disconnect()
    return
  }

  /** Only SKUs that were at the source site; master totals for other locations unchanged. */
  const affectedSkus = new Set(pmbRows.map((r) => r.sku))

  await prisma.$transaction(
    async (tx) => {
      for (const p of pmbRows) {
        const existing = loc1BySku.get(p.sku)
        if (existing) {
          const q1 = existing.quantity || 0
          const q2 = p.quantity || 0
          const qty = q1 + q2
          const unitCost = mergeUnitCost(q1, existing.unitCost, q2, p.unitCost)
          const reorderPoint = Math.max(existing.reorderPoint || 0, p.reorderPoint || 0)
          const itemName =
            (existing.itemName || '').trim().length >= (p.itemName || '').trim().length
              ? existing.itemName || p.itemName
              : p.itemName || existing.itemName

          await tx.locationInventory.update({
            where: { id: existing.id },
            data: {
              quantity: qty,
              unitCost,
              reorderPoint,
              itemName: itemName || p.sku,
              status: getStatusFromQuantity(qty, reorderPoint)
            }
          })
          await tx.locationInventory.delete({ where: { id: p.id } })
        } else {
          await tx.locationInventory.update({
            where: { id: p.id },
            data: {
              locationId: toLoc.id,
              status: getStatusFromQuantity(p.quantity || 0, p.reorderPoint || 0)
            }
          })
        }
      }

      const invAtPmb = await tx.inventoryItem.findMany({
        where: { locationId: fromLoc.id },
        select: { id: true, sku: true }
      })
      for (const row of invAtPmb) {
        const sibling = await tx.inventoryItem.findFirst({
          where: { sku: row.sku, locationId: toLoc.id }
        })
        if (sibling) {
          await tx.inventoryItem.delete({ where: { id: row.id } })
        } else {
          await tx.inventoryItem.update({
            where: { id: row.id },
            data: { locationId: toLoc.id }
          })
        }
      }

      const replaceFrom = { OR: [{ fromLocation: fromLoc.id }, { fromLocation: 'PMB' }, { fromLocation: fromCode }] }
      const replaceTo = { OR: [{ toLocation: fromLoc.id }, { toLocation: 'PMB' }, { toLocation: fromCode }] }

      await tx.stockMovement.updateMany({
        where: replaceFrom,
        data: { fromLocation: toLoc.id }
      })
      await tx.stockMovement.updateMany({
        where: replaceTo,
        data: { toLocation: toLoc.id }
      })

      await tx.purchaseOrder.updateMany({
        where: { receivingLocationId: fromLoc.id },
        data: { receivingLocationId: toLoc.id }
      })

      await tx.stockTakeSubmission.updateMany({
        where: { locationId: fromLoc.id },
        data: {
          locationId: toLoc.id,
          locationCode: toLoc.code,
          locationName: toLoc.name
        }
      })

      await tx.stockLocation.delete({ where: { id: fromLoc.id } })
    },
    { timeout: 120000 }
  )

  console.log('')
  console.log('Locations merged. Reconciling InventoryItem totals for affected SKUs...')
  const reconciled = await reconcileInventoryMasterForSkus(prisma, [...affectedSkus])
  console.log('  Reconcile updates:', reconciled.length)

  const afterRows = await prisma.locationInventory.findMany({ where: { locationId: toLoc.id } })
  const afterSum = afterRows.reduce((s, r) => s + (r.quantity || 0), 0)
  console.log('')
  console.log('Done.')
  console.log('  Target LocationInventory rows:', afterRows.length, '| qty sum:', afterSum)
  console.log('  Source location deleted:', fromCode)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
