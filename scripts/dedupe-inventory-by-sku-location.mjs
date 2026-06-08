#!/usr/bin/env node
/**
 * Remove duplicate InventoryItem rows that share the same SKU + locationId.
 * Keeps the list-representative row (same ordering as Manufacturing inventory API),
 * syncs catalog quantity from LocationInventory sums, archives duplicate rows.
 *
 * Usage:
 *   node scripts/dedupe-inventory-by-sku-location.mjs [--dry-run]
 *   node scripts/dedupe-inventory-by-sku-location.mjs --write --i-understand
 *   node scripts/dedupe-inventory-by-sku-location.mjs --location-id=<uuid> --dry-run
 */
import dotenv from 'dotenv'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const PMB_LOC = 'cmlgo8w1z0000zvy5mwo8wc8k'

function statusFromQuantity(quantity, reorderPoint = 0) {
  const q = Number(quantity || 0)
  const rp = Number(reorderPoint || 0)
  if (q > rp) return 'in_stock'
  if (q > 0) return 'low_stock'
  return 'out_of_stock'
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const locArg = argv.find((a) => a.startsWith('--location-id='))
  return {
    dryRun: flags.has('--dry-run') || !flags.has('--write'),
    write: flags.has('--write') && flags.has('--i-understand'),
    locationId: locArg ? locArg.replace('--location-id=', '').trim() : ''
  }
}

async function loadListRepresentativeIdBySku() {
  const rows = await prisma.inventoryItem.findMany({
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }],
    select: { id: true, sku: true }
  })
  const map = new Map()
  for (const row of rows) {
    const sku = String(row.sku || '').trim()
    if (!sku || map.has(sku)) continue
    map.set(sku, row.id)
  }
  return map
}

async function buildPlan(locationFilter) {
  const where = locationFilter ? { locationId: locationFilter } : {}
  const items = await prisma.inventoryItem.findMany({
    where,
    select: {
      id: true,
      sku: true,
      name: true,
      locationId: true,
      quantity: true,
      unitCost: true,
      totalValue: true,
      reorderPoint: true,
      allocatedQuantity: true,
      completedQuantity: true,
      inProductionQuantity: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ sku: 'asc' }, { locationId: 'asc' }, { createdAt: 'asc' }]
  })

  const liTotals = await prisma.locationInventory.groupBy({
    by: ['sku'],
    _sum: { quantity: true }
  })
  const qtyBySku = new Map(
    liTotals.map((r) => [String(r.sku || '').trim(), Number(r._sum.quantity || 0)])
  )

  const listRepIdBySku = await loadListRepresentativeIdBySku()
  const groups = new Map()
  for (const item of items) {
    const key = `${String(item.sku || '').trim()}::${item.locationId || 'null'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  const plan = []
  for (const [key, list] of groups.entries()) {
    if (list.length <= 1) continue
    const sku = String(list[0].sku || '').trim()
    const repId = listRepIdBySku.get(sku)
    let keeper = list.find((x) => x.id === repId)
    if (!keeper) keeper = list[0]
    const duplicates = list.filter((x) => x.id !== keeper.id)
    const locationQty = qtyBySku.get(sku) ?? 0
    const allocatedTotal = list.reduce((s, r) => s + Number(r.allocatedQuantity || 0), 0)
    const completedTotal = list.reduce((s, r) => s + Number(r.completedQuantity || 0), 0)
    const inProdTotal = list.reduce((s, r) => s + Number(r.inProductionQuantity || 0), 0)
    plan.push({
      key,
      sku,
      locationId: keeper.locationId,
      keeperId: keeper.id,
      keeperQty: Number(keeper.quantity || 0),
      locationQty,
      duplicateIds: duplicates.map((d) => d.id),
      duplicateCount: duplicates.length,
      nextStatus: statusFromQuantity(locationQty, keeper.reorderPoint || 0),
      nextTotalValue: locationQty * Number(keeper.unitCost || 0),
      allocatedTotal,
      completedTotal,
      inProdTotal
    })
  }
  return plan
}

async function main() {
  const { dryRun, write, locationId } = parseArgs(process.argv.slice(2))
  const filter = locationId || process.env.DEDUPE_LOCATION_ID || ''

  const plan = await buildPlan(filter || undefined)
  const report = {
    mode: write ? 'apply' : 'dry-run',
    locationFilter: filter || null,
    duplicateGroups: plan.length,
    rowsToArchive: plan.reduce((s, p) => s + p.duplicateCount, 0),
    plan: plan.slice(0, 50)
  }

  console.log(JSON.stringify(report, null, 2))

  if (!write) {
    console.error('\nDry-run only. Re-run with --write --i-understand to archive duplicate rows.')
    return
  }

  let archived = 0
  let keepersUpdated = 0
  for (const task of plan) {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: task.keeperId },
        data: {
          quantity: task.locationQty,
          allocatedQuantity: task.allocatedTotal,
          completedQuantity: task.completedTotal,
          inProductionQuantity: task.inProdTotal,
          totalValue: task.nextTotalValue,
          status: task.nextStatus
        }
      })
      keepersUpdated++

      for (const dupId of task.duplicateIds) {
        await tx.inventoryItem.update({
          where: { id: dupId },
          data: {
            quantity: 0,
            allocatedQuantity: 0,
            completedQuantity: 0,
            inProductionQuantity: 0,
            totalValue: 0,
            status: 'inactive'
          }
        })
        archived++
      }
    })
  }

  const outPath = resolve(
    process.cwd(),
    `reports/dedupe-inventory-by-sku-location-applied-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ ...report, keepersUpdated, archived, plan }, null, 2))
  console.log(JSON.stringify({ applied: true, keepersUpdated, archived, reportPath: outPath }, null, 2))
}

main()
  .catch((e) => {
    console.error(e.message || e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
