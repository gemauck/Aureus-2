#!/usr/bin/env node
/**
 * Merge duplicate manufacturing catalog rows that share the same item name (case/spacing
 * normalized) but different SKUs — e.g. two stock-count imports for "2u2 25 VOLT FS01".
 *
 * For each duplicate group:
 *   - **Keeper**: oldest `InventoryItem` by `createdAt` (--keep=oldest|newest).
 *   - **Others**: `LocationInventory` rows are merged into the keeper SKU (sum qty,
 *     weighted unit cost); allocation/WIP fields are summed onto the keeper catalog row;
 *     then all `InventoryItem` rows with the duplicate SKU are removed (same as
 *     DELETE /api/manufacturing/inventory/:id).
 *
 * Skips a duplicate SKU when any `InventoryItem` with that SKU is linked as a BOM
 * finished product, or when `--skip-nonzero-alloc` is set (default) and merged rows
 * carry allocations/production quantities unless `--allow-alloc-merge` is passed.
 *
 * **Keeper visibility** (matches Manufacturing inventory list API): only rows that are the
 * canonical template for their SKU can be keepers — same ordering as
 * `buildAllLocationsInventoryResponse` in `api/manufacturing.js` (first `InventoryItem` per
 * SKU when ordering by `locationId` asc, `updatedAt` desc). Merges never target a “ghost”
 * catalog row that does not drive the SKU in the UI.
 *
 * Usage:
 *   node scripts/dedupe-inventory-items-by-name.js                    # dry run
 *   node scripts/dedupe-inventory-items-by-name.js --write --i-understand
 *
 * Options:
 *   --keep=oldest|newest        Keeper selection (default oldest)
 *   --min-name-length=N        Ignore groups whose normalized name length < N (default 4)
 *   --include=nameSubstring      Only groups whose normalized name includes this (repeatable)
 *   --skip-nonzero-alloc       Skip dup SKUs that have allocated/WIP qty (default true)
 *   --allow-alloc-merge        Sum alloc/WIP onto keeper and proceed
 *   --allow-non-list-keeper    Allow oldest/newest keeper even if not the list template (unsafe)
 *   --report=path.json         Write JSON report
 */

import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { prisma } from '../api/_lib/prisma.js'
import { reconcileInventoryMasterForSkus } from '../api/_lib/reconcileInventoryMasterForSkus.js'
import { findCanonicalInventoryItemBySkuTx, getStatusFromQuantity } from '../api/_lib/stockCountAdjustment.js'

function argVal(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix))
  if (!hit) return null
  const eq = hit.indexOf('=')
  return eq >= 0 ? hit.slice(eq + 1).trim() : null
}

function allIncludes(prefix) {
  return process.argv
    .filter((a) => a.startsWith(prefix))
    .map((a) => {
      const eq = a.indexOf('=')
      return eq >= 0 ? a.slice(eq + 1).trim().toLowerCase() : ''
    })
    .filter(Boolean)
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function latestDate(a, b) {
  if (!a) return b || null
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

/**
 * Same “one template per SKU” rule as `buildAllLocationsInventoryResponse` (api/manufacturing.js):
 * first InventoryItem row in global order [{ locationId: 'asc' }, { updatedAt: 'desc' }].
 * Only that row’s id represents the SKU in the manufacturing inventory list.
 */
async function loadListRepresentativeIdBySku() {
  const allTemplates = await prisma.inventoryItem.findMany({
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }],
    select: { id: true, sku: true }
  })
  const map = new Map()
  for (const meta of allTemplates) {
    const sku = String(meta.sku || '').trim()
    if (!sku) continue
    if (!map.has(sku)) map.set(sku, meta.id)
  }
  return map
}

function isListRepresentative(repIdBySku, item) {
  const sku = String(item.sku || '').trim()
  if (!sku) return false
  return repIdBySku.get(sku) === item.id
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
async function mergeLocationInventorySkus(tx, keeperSku, dupSku, keeperItemName) {
  const dupRows = await tx.locationInventory.findMany({ where: { sku: dupSku } })
  for (const row of dupRows) {
    const existing = await tx.locationInventory.findUnique({
      where: { locationId_sku: { locationId: row.locationId, sku: keeperSku } }
    })
    const q2 = num(row.quantity)
    const name = String(keeperItemName || row.itemName || '').trim()

    if (existing) {
      const q1 = num(existing.quantity)
      const newQty = q1 + q2
      const rp = Math.max(num(existing.reorderPoint), num(row.reorderPoint))
      await tx.locationInventory.update({
        where: { id: existing.id },
        data: {
          quantity: newQty,
          reorderPoint: rp,
          itemName: name || existing.itemName,
          status: getStatusFromQuantity(newQty, rp),
          lastRestocked: latestDate(existing.lastRestocked, row.lastRestocked)
        }
      })
    } else {
      await tx.locationInventory.create({
        data: {
          locationId: row.locationId,
          sku: keeperSku,
          itemName: name || row.itemName,
          quantity: q2,
          reorderPoint: num(row.reorderPoint),
          status: row.status || getStatusFromQuantity(q2, num(row.reorderPoint)),
          lastRestocked: row.lastRestocked
        }
      })
    }
    await tx.locationInventory.delete({ where: { id: row.id } })
  }
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
async function accumulateCatalogRollupsOntoKeeper(tx, keeperSku, dupSku) {
  const dupItems = await tx.inventoryItem.findMany({ where: { sku: dupSku } })
  if (!dupItems.length) return { skippedReason: 'no_catalog_rows' }

  let sumAlloc = 0
  let sumComp = 0
  let sumProd = 0
  for (const d of dupItems) {
    sumAlloc += num(d.allocatedQuantity)
    sumComp += num(d.completedQuantity)
    sumProd += num(d.inProductionQuantity)
  }

  const keeper = await findCanonicalInventoryItemBySkuTx(tx, keeperSku)
  if (!keeper) {
    throw new Error(`Keeper SKU ${keeperSku} has no InventoryItem — cannot merge rollups`)
  }

  await tx.inventoryItem.update({
    where: { id: keeper.id },
    data: {
      allocatedQuantity: num(keeper.allocatedQuantity) + sumAlloc,
      completedQuantity: num(keeper.completedQuantity) + sumComp,
      inProductionQuantity: num(keeper.inProductionQuantity) + sumProd
    }
  })

  return { sumAlloc, sumComp, sumProd }
}

async function main() {
  const write = process.argv.includes('--write') && process.argv.includes('--i-understand')
  const keepMode = (argVal('--keep') || 'oldest').toLowerCase()
  const minLen = Math.max(1, parseInt(argVal('--min-name-length') || '4', 10) || 4)
  const includesFilters = allIncludes('--include=')
  const allowAllocMerge = process.argv.includes('--allow-alloc-merge')
  const skipNonzeroAlloc =
    !allowAllocMerge && !process.argv.includes('--no-skip-nonzero-alloc')
  const allowNonListKeeper = process.argv.includes('--allow-non-list-keeper')

  const reportPath =
    argVal('--report') ||
    resolve(
      process.cwd(),
      `reports/dedupe-inventory-by-name-${write ? 'applied' : 'dryrun'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    )

  const items = await prisma.inventoryItem.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      createdAt: true,
      allocatedQuantity: true,
      completedQuantity: true,
      inProductionQuantity: true
    },
    orderBy: { createdAt: 'asc' }
  })

  const listRepIdBySku = await loadListRepresentativeIdBySku()

  const groups = new Map()
  for (const item of items) {
    const key = normalizeName(item.name)
    if (key.length < minLen) continue
    if (includesFilters.length && !includesFilters.every((f) => key.includes(f))) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  /** @type {Array<any>} */
  const plan = []
  /** @type {Array<any>} */
  const applied = []
  /** @type {Array<any>} */
  const skippedGroups = []

  for (const [normName, members] of groups) {
    if (members.length < 2) continue

    const representatives = allowNonListKeeper
      ? [...members]
      : members.filter((m) => isListRepresentative(listRepIdBySku, m))

    if (!allowNonListKeeper && representatives.length === 0) {
      skippedGroups.push({
        normalizedName: normName,
        reason: 'no_list_representative_for_any_member',
        memberIds: members.map((m) => m.id)
      })
      continue
    }

    const pool = representatives.length ? representatives : members
    const sortedPool =
      keepMode === 'newest'
        ? [...pool].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [...pool].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    const keeper = sortedPool[0]
    const duplicates = members.filter((m) => m.id !== keeper.id)

    /** @type {Array<any>} */
    const dupActions = []

    for (const dup of duplicates) {
      if (dup.sku === keeper.sku) {
        dupActions.push({
          dupSku: dup.sku,
          dupId: dup.id,
          skipped: true,
          reason: 'same_sku_as_keeper — manual review'
        })
        continue
      }

      const bomCount = await prisma.bOM.count({ where: { inventoryItemId: dup.id } })
      if (bomCount > 0) {
        dupActions.push({
          dupSku: dup.sku,
          dupId: dup.id,
          skipped: true,
          reason: `linked_to_${bomCount}_bom(s)`
        })
        continue
      }

      const rollup =
        num(dup.allocatedQuantity) + num(dup.completedQuantity) + num(dup.inProductionQuantity)
      if (skipNonzeroAlloc && rollup > 0.0001) {
        dupActions.push({
          dupSku: dup.sku,
          dupId: dup.id,
          skipped: true,
          reason: 'nonzero_allocation_or_wip',
          rollup
        })
        continue
      }

      dupActions.push({
        dupSku: dup.sku,
        dupId: dup.id,
        skipped: false
      })
    }

    const actionable = dupActions.filter((a) => !a.skipped)
    if (actionable.length === 0) continue

    plan.push({
      normalizedName: normName,
      keeperSku: keeper.sku,
      keeperId: keeper.id,
      keeperIsListRepresentative: isListRepresentative(listRepIdBySku, keeper),
      memberSkus: members.map((m) => m.sku),
      actions: dupActions
    })

    if (!write) continue

    for (const act of actionable) {
      const dupSku = act.dupSku
      const keeperRow = await prisma.inventoryItem.findUnique({
        where: { id: keeper.id },
        select: { sku: true, name: true }
      })
      if (!keeperRow) throw new Error(`Keeper ${keeper.id} missing`)

      await prisma.$transaction(async (tx) => {
        await mergeLocationInventorySkus(tx, keeperRow.sku, dupSku, keeperRow.name)
        await accumulateCatalogRollupsOntoKeeper(tx, keeperRow.sku, dupSku)

        const linkedBom = await tx.bOM.count({ where: { inventoryItemId: act.dupId } })
        if (linkedBom > 0) {
          throw new Error(`Abort: BOM linked mid-merge for ${dupSku}`)
        }

        await tx.inventoryItem.deleteMany({ where: { sku: dupSku } })
      })

      await reconcileInventoryMasterForSkus(prisma, [keeperRow.sku])

      applied.push({
        normalizedName: normName,
        keeperSku: keeperRow.sku,
        removedSku: dupSku
      })
    }
  }

  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        write,
        keepMode,
        allowNonListKeeper,
        minNameLength: minLen,
        includeFilters: includesFilters,
        plannedGroups: plan.length,
        skippedGroups: skippedGroups.length,
        appliedMerges: applied.length,
        plan,
        skippedGroups,
        applied
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(
    write
      ? `Applied ${applied.length} duplicate SKU merge(s). Report: ${reportPath}`
      : `Dry run: ${plan.length} name group(s) with mergeable duplicate SKUs. Report: ${reportPath}`
  )
  if (!write && plan.length) {
    console.log('Run with --write --i-understand to merge LocationInventory into keeper SKUs and delete duplicate catalog rows.')
  }
  if (skippedGroups.length) {
    console.log(`Skipped ${skippedGroups.length} name group(s) with no manufacturing-list template row (see report skippedGroups).`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
