#!/usr/bin/env node
/**
 * Backfill `InventoryItem` (catalog) rows for SKUs that currently have stock in
 * `LocationInventory` but no matching `InventoryItem`. These are the "orphan /
 * legacy" rows referenced in `api/_lib/stockCountAdjustment.js` — they appear
 * in the inventory list with `id: null` because the catalog row is missing.
 *
 * For every orphan SKU we aggregate across its LocationInventory rows:
 *   - quantity            -> sum across all locations
 *   - name                -> longest non-empty `itemName`
 *   - unitCost            -> non-zero cost backing the most stock (qty-weighted)
 *   - reorderPoint        -> max across location rows
 *   - lastRestocked       -> latest non-null `lastRestocked`
 *   - primary locationId  -> location with the most stock (ties: earliest code)
 *
 * The new `InventoryItem` is created with `needsCatalogReview: true` so it
 * shows up in the catalog-review filter — category / part numbers / supplier
 * are intentionally left blank for an admin to fill in later.
 *
 * Usage:
 *   node scripts/backfill-orphan-inventory-items.js                          # dry run
 *   node scripts/backfill-orphan-inventory-items.js --write --i-understand   # apply
 *
 * Options:
 *   --sku=SKU0540                Process only this SKU (repeatable)
 *   --report=path/to/file.json   Override report path
 *   --no-needs-catalog-review    Do NOT set needsCatalogReview = true on new rows
 *   --category=components        Override default category (default: components)
 *   --type=component             Override default type (default: component)
 */

import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { prisma } from '../api/_lib/prisma.js'
import { computedInventoryTotalValue } from '../api/_lib/inventoryValue.js'
import { getStatusFromQuantity } from '../api/_lib/stockCountAdjustment.js'

function argVal(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix))
  if (!hit) return null
  const eq = hit.indexOf('=')
  return eq >= 0 ? hit.slice(eq + 1).trim() : null
}

function allArgVals(prefix) {
  return process.argv.filter((a) => a.startsWith(prefix)).map((a) => {
    const eq = a.indexOf('=')
    return eq >= 0 ? a.slice(eq + 1).trim() : ''
  }).filter(Boolean)
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Choose the canonical unit cost across location rows for one SKU.
 * Same idea as `resolveCanonicalUnitCost` in reconcile-inventory-unit-costs-to-loc1.js
 * but without LOC1-bias (we have no catalog row to anchor to).
 */
function pickUnitCost(rows) {
  const positive = rows
    .map((r) => ({ uc: num(r.unitCost), qty: num(r.quantity) }))
    .filter((r) => r.uc > 0)
  if (positive.length === 0) return { unitCost: 0, reason: 'no_positive_unit_cost' }

  const distinct = [...new Set(positive.map((r) => Math.round(r.uc * 1e6) / 1e6))]
  if (distinct.length === 1) {
    return { unitCost: distinct[0], reason: 'single_positive_cost' }
  }

  const byCost = new Map()
  for (const r of positive) {
    const k = Math.round(r.uc * 1e6) / 1e6
    byCost.set(k, (byCost.get(k) || 0) + Math.max(0, r.qty))
  }
  let bestUc = distinct[0]
  let bestQty = -Infinity
  for (const [uc, sumQty] of byCost) {
    if (sumQty > bestQty) {
      bestUc = uc
      bestQty = sumQty
    } else if (sumQty === bestQty && uc < bestUc) {
      bestUc = uc
    }
  }
  return { unitCost: bestUc, reason: 'qty_weighted_dominant_cost' }
}

function pickName(rows) {
  let best = ''
  for (const r of rows) {
    const n = String(r.itemName || '').trim()
    if (n.length > best.length) best = n
  }
  return best
}

function pickPrimaryLocation(rows) {
  const positive = rows.filter((r) => num(r.quantity) > 0)
  const pool = positive.length ? positive : rows
  return pool.slice().sort((a, b) => {
    const qa = num(a.quantity)
    const qb = num(b.quantity)
    if (qb !== qa) return qb - qa
    const ca = String(a.location?.code || '').trim()
    const cb = String(b.location?.code || '').trim()
    return ca.localeCompare(cb)
  })[0]
}

function pickLastRestocked(rows) {
  let best = null
  for (const r of rows) {
    if (!r.lastRestocked) continue
    const t = new Date(r.lastRestocked).getTime()
    if (!Number.isFinite(t)) continue
    if (best === null || t > best) best = t
  }
  return best ? new Date(best) : null
}

function locationLabel(loc) {
  if (!loc) return ''
  const code = String(loc.code || '').trim()
  const name = String(loc.name || '').trim()
  if (code && name) return `${code} — ${name}`
  return code || name || ''
}

async function buildPlan(skuFilter) {
  const where = skuFilter && skuFilter.length ? { sku: { in: skuFilter } } : {}

  const locRows = await prisma.locationInventory.findMany({
    where,
    include: { location: { select: { id: true, code: true, name: true } } },
    orderBy: [{ sku: 'asc' }, { locationId: 'asc' }]
  })

  if (locRows.length === 0) return { plan: [], skuFilter }

  const skusInLocInv = [...new Set(locRows.map((r) => String(r.sku || '').trim()).filter(Boolean))]
  const existingCatalog = await prisma.inventoryItem.findMany({
    where: { sku: { in: skusInLocInv } },
    select: { sku: true }
  })
  const haveCatalog = new Set(existingCatalog.map((r) => r.sku))

  const orphanSkus = skusInLocInv.filter((sku) => !haveCatalog.has(sku))

  const bySku = new Map()
  for (const r of locRows) {
    const sku = String(r.sku || '').trim()
    if (!sku) continue
    if (!orphanSkus.includes(sku)) continue
    if (!bySku.has(sku)) bySku.set(sku, [])
    bySku.get(sku).push(r)
  }

  const plan = []
  for (const [sku, rows] of bySku) {
    const totalQty = rows.reduce((sum, r) => sum + num(r.quantity), 0)
    const { unitCost, reason: unitCostReason } = pickUnitCost(rows)
    const name = pickName(rows) || sku
    const primary = pickPrimaryLocation(rows)
    const reorderPoint = rows.reduce((m, r) => Math.max(m, num(r.reorderPoint)), 0)
    const lastRestocked = pickLastRestocked(rows)
    plan.push({
      sku,
      name,
      totalQty,
      unitCost,
      unitCostReason,
      reorderPoint,
      lastRestocked,
      totalValue: computedInventoryTotalValue(totalQty, unitCost),
      status: getStatusFromQuantity(totalQty, reorderPoint),
      primaryLocationId: primary?.locationId || null,
      primaryLocationLabel: locationLabel(primary?.location),
      locations: rows.map((r) => ({
        locationId: r.locationId,
        code: r.location?.code || '',
        name: r.location?.name || '',
        quantity: num(r.quantity),
        unitCost: num(r.unitCost),
        itemName: r.itemName || ''
      }))
    })
  }

  plan.sort((a, b) => a.sku.localeCompare(b.sku))
  return { plan, skuFilter, totalSkusInLocInv: skusInLocInv.length, orphanCount: orphanSkus.length }
}

async function applyPlan(plan, opts) {
  const { needsCatalogReview, category, type } = opts
  const results = []

  for (const row of plan) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const dup = await tx.inventoryItem.findFirst({
          where: { sku: row.sku },
          select: { id: true }
        })
        if (dup) {
          return { skipped: true, reason: 'catalog_row_already_exists', id: dup.id }
        }

        const item = await tx.inventoryItem.create({
          data: {
            sku: row.sku,
            name: row.name,
            category,
            type,
            quantity: row.totalQty,
            unit: 'pcs',
            reorderPoint: row.reorderPoint,
            reorderQty: 0,
            unitCost: row.unitCost,
            totalValue: row.totalValue,
            supplier: '',
            status: row.status,
            lastRestocked: row.lastRestocked,
            ownerId: null,
            locationId: row.primaryLocationId,
            location: row.primaryLocationLabel || '',
            needsCatalogReview
          }
        })

        await tx.locationInventory.updateMany({
          where: { sku: row.sku },
          data: { unitCost: row.unitCost }
        })

        return { created: true, id: item.id }
      })
      results.push({ sku: row.sku, ...created })
    } catch (e) {
      results.push({ sku: row.sku, error: e.message || String(e) })
    }
  }
  return results
}

function summarize(plan, results) {
  const created = results?.filter((r) => r.created).length ?? 0
  const skipped = results?.filter((r) => r.skipped).length ?? 0
  const errors = results?.filter((r) => r.error).length ?? 0
  return {
    orphanCount: plan.length,
    created,
    skipped,
    errors,
    totalQuantityBackfilled: plan.reduce((s, p) => s + p.totalQty, 0),
    totalValueBackfilled: plan.reduce((s, p) => s + p.totalValue, 0)
  }
}

function writeReport(reportPath, payload) {
  const abs = resolve(reportPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(payload, null, 2))
  return abs
}

async function main() {
  const isWrite = process.argv.includes('--write')
  const confirmed = process.argv.includes('--i-understand')
  const noNeedsReview = process.argv.includes('--no-needs-catalog-review')
  const skuFilter = allArgVals('--sku=')
  const category = argVal('--category=') || 'components'
  const type = argVal('--type=') || 'component'

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportArg = argVal('--report=')
  const reportPath =
    reportArg ||
    `reports/backfill-orphan-inventory-items-${isWrite && confirmed ? 'applied' : 'dryrun'}-${stamp}.json`

  if (isWrite && !confirmed) {
    console.error('Refusing to write without --i-understand')
    process.exit(1)
  }

  console.log('Backfill orphan InventoryItem rows from LocationInventory')
  console.log('Mode:', isWrite && confirmed ? 'WRITE' : 'DRY RUN (no DB changes)')
  if (skuFilter.length) console.log('SKU filter:', skuFilter.join(', '))
  console.log('needsCatalogReview:', !noNeedsReview)
  console.log('category / type:', `${category} / ${type}`)
  console.log('')

  const { plan, totalSkusInLocInv, orphanCount } = await buildPlan(skuFilter)

  console.log(`LocationInventory distinct SKUs: ${totalSkusInLocInv ?? '(filtered)'}`)
  console.log(`Orphan SKUs (LocationInventory without InventoryItem): ${orphanCount ?? plan.length}`)
  console.log('')

  if (plan.length === 0) {
    console.log('Nothing to backfill.')
    const reportAbs = writeReport(reportPath, {
      mode: isWrite && confirmed ? 'WRITE' : 'DRY_RUN',
      generatedAt: new Date().toISOString(),
      skuFilter,
      summary: { orphanCount: 0, created: 0, skipped: 0, errors: 0 },
      plan: []
    })
    console.log('Report:', reportAbs)
    await prisma.$disconnect()
    return
  }

  const preview = plan.slice(0, 25)
  for (const p of preview) {
    console.log(
      `  ${p.sku.padEnd(10)}  qty=${String(p.totalQty).padStart(7)}  cost=${String(p.unitCost).padStart(7)}  value=${String(p.totalValue).padStart(9)}  primary=${p.primaryLocationLabel || '(none)'}  name="${p.name}"`
    )
  }
  if (plan.length > preview.length) {
    console.log(`  … and ${plan.length - preview.length} more`)
  }
  console.log('')

  let results = null
  if (isWrite && confirmed) {
    console.log(`Applying ${plan.length} backfills…`)
    results = await applyPlan(plan, {
      needsCatalogReview: !noNeedsReview,
      category,
      type
    })
    const summary = summarize(plan, results)
    console.log('Done.', JSON.stringify(summary))
  } else {
    console.log('Dry run only. To apply:')
    console.log(`  node scripts/backfill-orphan-inventory-items.js --write --i-understand`)
  }

  const reportAbs = writeReport(reportPath, {
    mode: isWrite && confirmed ? 'WRITE' : 'DRY_RUN',
    generatedAt: new Date().toISOString(),
    skuFilter,
    options: {
      needsCatalogReview: !noNeedsReview,
      category,
      type
    },
    summary: summarize(plan, results),
    plan,
    results: results || null
  })
  console.log('Report:', reportAbs)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Backfill failed:', e)
  try {
    await prisma.$disconnect()
  } catch {}
  process.exit(1)
})
