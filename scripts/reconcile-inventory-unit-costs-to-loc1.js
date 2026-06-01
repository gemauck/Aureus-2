#!/usr/bin/env node
/**
 * Reconcile **catalog** unit cost per SKU using legacy LOC1 rules (reads `InventoryItem` rows only).
 *
 * 1. Prefer non-zero `unitCost` on the catalog row tied to LOC1 (`locationId`).
 * 2. Else promote a single positive cost from other catalog rows for that SKU.
 * 3. Else qty-weighted dominant cost across catalog rows.
 *
 * Updates `InventoryItem` only (`unitCost` + `totalValue`). Per-location rows do not store price.
 *
 * Usage:
 *   node scripts/reconcile-inventory-unit-costs-to-loc1.js
 *   node scripts/reconcile-inventory-unit-costs-to-loc1.js --write --i-understand
 *
 * Options:
 *   --loc1-code=01_LOC1   Stock location code treated as LOC1 (default 01_LOC1)
 *   --sku=SKU0540       Process only this SKU (optional)
 */

import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { prisma } from '../api/_lib/prisma.js'

function argVal(prefix) {
  const a = process.argv.find((x) => x.startsWith(prefix))
  if (!a) return null
  const eq = a.indexOf('=')
  return eq >= 0 ? a.slice(eq + 1).trim() : null
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

async function findLoc1(prismaClient, loc1Code) {
  const code = String(loc1Code || '').trim()
  if (!code) return null
  let loc = await prismaClient.stockLocation.findFirst({ where: { code } })
  if (loc) return loc
  const upper = code.toUpperCase()
  const all = await prismaClient.stockLocation.findMany({ select: { id: true, code: true, name: true } })
  loc = all.find((l) => String(l.code || '').trim().toUpperCase() === upper)
  return loc || null
}

/**
 * @param {Array<{ locationId: string, unitCost: unknown, quantity: unknown }>} rows
 * @param {string} loc1Id
 * @returns {{ canonical: number, reason: string }}
 */
function resolveCanonicalUnitCost(rows, loc1Id) {
  const normalized = rows.map((r) => ({
    locationId: r.locationId,
    uc: num(r.unitCost),
    qty: num(r.quantity)
  }))

  const loc1Row = normalized.find((r) => r.locationId === loc1Id)
  const loc1Cost = loc1Row ? loc1Row.uc : 0

  if (loc1Cost > 0) {
    return { canonical: loc1Cost, reason: 'loc1_nonzero_wins' }
  }

  const positive = normalized.filter((r) => r.uc > 0)
  if (positive.length === 0) {
    return { canonical: 0, reason: 'no_positive_unit_cost_anywhere' }
  }

  const distinct = [...new Set(positive.map((r) => Math.round(r.uc * 1e6) / 1e6))]
  if (distinct.length === 1) {
    return { canonical: distinct[0], reason: 'promote_single_price_from_non_loc1' }
  }

  const byUc = new Map()
  for (const r of positive) {
    const k = Math.round(r.uc * 1e6) / 1e6
    byUc.set(k, (byUc.get(k) || 0) + r.qty)
  }
  let bestUc = distinct[0]
  let bestQty = -Infinity
  for (const [uc, sumQty] of byUc) {
    if (sumQty > bestQty) {
      bestQty = sumQty
      bestUc = uc
    } else if (sumQty === bestQty && uc < bestUc) {
      bestUc = uc
    }
  }
  return { canonical: bestUc, reason: 'loc1_zero_multi_conflict_dominant_qty' }
}

async function main() {
  const isWrite = process.argv.includes('--write')
  const confirmed = process.argv.includes('--i-understand')
  const loc1Code = argVal('--loc1-code=') || '01_LOC1'
  const singleSku = argVal('--sku=')

  console.log('Reconcile inventory unit costs → LOC1 policy')
  console.log('LOC1 code:', loc1Code)
  console.log('Mode:', isWrite && confirmed ? 'WRITE' : 'DRY RUN (no DB changes)')
  if (isWrite && !confirmed) {
    console.error('\nRefusing to write without --i-understand\n')
    process.exit(1)
  }

  const loc1 = await findLoc1(prisma, loc1Code)
  if (!loc1) {
    console.error(`No StockLocation found for code "${loc1Code}".`)
    process.exit(1)
  }
  console.log('Resolved LOC1:', loc1.id, loc1.code, loc1.name || '')
  console.log('')

  const skuRows = singleSku
    ? await prisma.inventoryItem.findMany({
        where: { sku: String(singleSku).trim() },
        select: { sku: true, locationId: true, unitCost: true, quantity: true, name: true }
      })
    : await prisma.inventoryItem.findMany({
        select: { sku: true, locationId: true, unitCost: true, quantity: true, name: true }
      })

  const bySku = new Map()
  for (const r of skuRows) {
    const sku = String(r.sku || '').trim()
    if (!sku) continue
    if (!bySku.has(sku)) bySku.set(sku, [])
    bySku.get(sku).push(r)
  }

  const planned = []
  for (const [sku, rows] of bySku) {
    const { canonical, reason } = resolveCanonicalUnitCost(rows, loc1.id)
    const before = rows.map((x) => ({
      locationId: x.locationId,
      uc: num(x.unitCost),
      qty: num(x.quantity)
    }))
    const changed = before.some((x) => Math.round(x.uc * 1e6) !== Math.round(canonical * 1e6))
    if (canonical === 0 && !changed) continue
    if (canonical === 0 && !before.some((x) => x.uc > 0)) continue
    planned.push({ sku, canonical, reason, before, rows })
  }

  planned.sort((a, b) => a.sku.localeCompare(b.sku))
  console.log('SKUs to touch:', planned.length)
  for (const p of planned.slice(0, 40)) {
    console.log(`  ${p.sku} → ${p.canonical} (${p.reason})`)
  }
  if (planned.length > 40) console.log(`  … and ${planned.length - 40} more`)
  console.log('')

  if (!isWrite || !confirmed) {
    await prisma.$disconnect()
    return
  }

  let updatedIi = 0
  const orphanSkus = []

  const BATCH = 60
  for (const part of chunkArray(planned, BATCH)) {
    const valueTuples = part.map((p) => Prisma.sql`(${p.sku}, ${p.canonical}::double precision)`)
    const valuesSql = Prisma.join(valueTuples, ', ')

    const iiCount = await prisma.$executeRaw(Prisma.sql`
      UPDATE "InventoryItem" AS ii
      SET
        "unitCost" = v.price,
        "totalValue" = ROUND((ii.quantity * v.price)::numeric, 2),
        "status" = CASE
          WHEN ii.quantity > COALESCE(ii."reorderPoint", 0)::double precision THEN 'in_stock'
          WHEN ii.quantity > 0::double precision THEN 'low_stock'
          ELSE 'out_of_stock'
        END
      FROM (VALUES ${valuesSql}) AS v(sku, price)
      WHERE ii.sku = v.sku
    `)
    updatedIi += Number(iiCount) || 0
  }

  const skuList = planned.map((p) => p.sku)
  const catalogSkus = await prisma.inventoryItem.findMany({
    where: { sku: { in: skuList } },
    select: { sku: true }
  })
  const catalogSet = new Set(catalogSkus.map((r) => r.sku))
  for (const p of planned) {
    if (!catalogSet.has(p.sku) && p.canonical > 0) {
      orphanSkus.push(p.sku)
    }
  }

  console.log('Done.')
  console.log('  InventoryItem rows touched (PG row count):', updatedIi)
  if (orphanSkus.length) {
    console.log(
      '  Warning: SKUs with stock rows but no InventoryItem catalog row (set cost after creating catalog):',
      orphanSkus.length
    )
    console.log('   ', orphanSkus.slice(0, 25).join(', '), orphanSkus.length > 25 ? '…' : '')
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
