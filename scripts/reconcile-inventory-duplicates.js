#!/usr/bin/env node
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

function statusFromQuantity(quantity, reorderPoint) {
  const q = Number(quantity || 0)
  const rp = Number(reorderPoint || 0)
  if (q > rp) return 'in_stock'
  if (q > 0) return 'low_stock'
  return 'out_of_stock'
}

function sortForCanonical(a, b) {
  const aLoc = String(a.locationId || '')
  const bLoc = String(b.locationId || '')
  if (aLoc !== bLoc) return aLoc.localeCompare(bLoc)
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function fmt(n) {
  return Number(n || 0).toFixed(2)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 0) : null

  const [items, locationTotals] = await Promise.all([
    prisma.inventoryItem.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        quantity: true,
        unitCost: true,
        totalValue: true,
        reorderPoint: true,
        status: true,
        locationId: true,
        allocatedQuantity: true,
        completedQuantity: true,
        inProductionQuantity: true,
        updatedAt: true
      }
    }),
    prisma.locationInventory.groupBy({
      by: ['sku'],
      _sum: { quantity: true }
    })
  ])

  const totalsBySku = new Map()
  for (const row of locationTotals) {
    const sku = String(row.sku || '').trim()
    if (!sku) continue
    totalsBySku.set(sku, Number(row._sum.quantity || 0))
  }

  const groups = new Map()
  for (const item of items) {
    const sku = String(item.sku || '').trim()
    if (!sku) continue
    if (!groups.has(sku)) groups.set(sku, [])
    groups.get(sku).push(item)
  }

  let duplicateGroups = 0
  let canonicalWouldUpdate = 0
  let duplicateRowsWouldArchive = 0
  let totalQtyDelta = 0
  const sample = []
  const tasks = []

  for (const [sku, list] of groups.entries()) {
    if (list.length <= 1) continue
    duplicateGroups++
    const ordered = [...list].sort(sortForCanonical)
    const canonical = ordered[0]
    const duplicates = ordered.slice(1)
    const locationQty = Number(totalsBySku.get(sku) || 0)
    const canonicalCurrentQty = Number(canonical.quantity || 0)
    const qtyChanged = Math.abs(canonicalCurrentQty - locationQty) > 0.0001

    const allocatedTotal = ordered.reduce((sum, r) => sum + Number(r.allocatedQuantity || 0), 0)
    const completedTotal = ordered.reduce((sum, r) => sum + Number(r.completedQuantity || 0), 0)
    const inProdTotal = ordered.reduce((sum, r) => sum + Number(r.inProductionQuantity || 0), 0)
    const nextStatus = statusFromQuantity(locationQty, canonical.reorderPoint || 0)
    const nextTotalValue = locationQty * Number(canonical.unitCost || 0)

    if (
      qtyChanged ||
      Math.abs(Number(canonical.allocatedQuantity || 0) - allocatedTotal) > 0.0001 ||
      Math.abs(Number(canonical.completedQuantity || 0) - completedTotal) > 0.0001 ||
      Math.abs(Number(canonical.inProductionQuantity || 0) - inProdTotal) > 0.0001 ||
      Math.abs(Number(canonical.totalValue || 0) - nextTotalValue) > 0.0001 ||
      String(canonical.status || '') !== nextStatus
    ) {
      canonicalWouldUpdate++
    }
    duplicateRowsWouldArchive += duplicates.length
    totalQtyDelta += locationQty - canonicalCurrentQty

    if (sample.length < 20) {
      sample.push({
        sku,
        canonicalId: canonical.id,
        canonicalQty: canonicalCurrentQty,
        locationQty,
        duplicateCount: duplicates.length
      })
    }

    tasks.push({
      sku,
      canonical,
      duplicates,
      locationQty,
      allocatedTotal,
      completedTotal,
      inProdTotal,
      nextStatus,
      nextTotalValue
    })
  }

  let slicedTasks = tasks
  if (limit) slicedTasks = tasks.slice(0, limit)

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`Inventory rows: ${items.length}`)
  console.log(`Unique SKUs: ${groups.size}`)
  console.log(`Duplicate SKU groups: ${duplicateGroups}`)
  console.log(`Canonical rows needing update: ${canonicalWouldUpdate}`)
  console.log(`Duplicate rows to archive: ${duplicateRowsWouldArchive}`)
  console.log(`Total canonical quantity delta: ${fmt(totalQtyDelta)}`)
  if (limit) console.log(`Task limit: ${limit} (of ${tasks.length})`)
  console.log('Sample:')
  for (const row of sample) {
    console.log(
      `  ${row.sku} | canonical=${row.canonicalId} | qty ${fmt(row.canonicalQty)} -> ${fmt(row.locationQty)} | duplicates=${row.duplicateCount}`
    )
  }

  if (!apply) {
    console.log('\nDry-run complete. Re-run with --apply to execute changes.')
    return
  }

  let canonicalUpdated = 0
  let duplicatesArchived = 0
  for (const task of slicedTasks) {
    await prisma.$transaction(async (tx) => {
      const canonicalPatch = {
        quantity: task.locationQty,
        allocatedQuantity: task.allocatedTotal,
        completedQuantity: task.completedTotal,
        inProductionQuantity: task.inProdTotal,
        totalValue: task.nextTotalValue,
        status: task.nextStatus
      }

      await tx.inventoryItem.update({
        where: { id: task.canonical.id },
        data: canonicalPatch
      })
      canonicalUpdated++

      for (const dup of task.duplicates) {
        await tx.inventoryItem.update({
          where: { id: dup.id },
          data: {
            quantity: 0,
            allocatedQuantity: 0,
            completedQuantity: 0,
            inProductionQuantity: 0,
            totalValue: 0,
            status: 'inactive'
          }
        })
        duplicatesArchived++
      }
    })
  }

  console.log('\nApply complete.')
  console.log(`Canonical rows updated: ${canonicalUpdated}`)
  console.log(`Duplicate rows archived: ${duplicatesArchived}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Reconciliation failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })

