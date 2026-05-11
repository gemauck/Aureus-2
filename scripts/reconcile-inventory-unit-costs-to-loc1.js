#!/usr/bin/env node
/**
 * Reconcile **unit cost** so every SKU has one price aligned with **LOC1** rules:
 *
 * 1. If **01_LOC1** (or `--loc1-code=`) has a non-zero unit cost on `LocationInventory`, that value wins
 *    for the whole SKU (catalog + every location row). Other locations are overwritten.
 * 2. If LOC1 has **no** price (0 / missing row) but **exactly one** distinct positive price exists on
 *    other locations, that price becomes the canonical price everywhere (including creating a LOC1
 *    placeholder row at qty 0 if needed).
 * 3. If LOC1 has no price and **multiple** conflicting positive prices exist elsewhere, pick the unit
 *    cost that carries the **largest total quantity** (tie-break: lower numeric cost, then location id).
 *
 * Updates:
 * - All `LocationInventory` rows for the SKU → `unitCost = canonical`
 * - All `InventoryItem` rows for the SKU → `unitCost` + `totalValue = qty × unitCost` per row
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
    ? await prisma.locationInventory.findMany({
        where: { sku: String(singleSku).trim() },
        select: { sku: true, locationId: true, unitCost: true, quantity: true, itemName: true }
      })
    : await prisma.locationInventory.findMany({
        select: { sku: true, locationId: true, unitCost: true, quantity: true, itemName: true }
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

  let updatedLi = 0
  let updatedIi = 0
  let createdLoc1 = 0
  const orphanSkus = []

  for (const p of planned) {
    const { sku, canonical, rows } = p
    const hasLoc1 = rows.some((r) => r.locationId === loc1.id)
    const nameHint = rows.find((r) => String(r.itemName || '').trim())?.itemName || sku

    if (!hasLoc1 && canonical > 0) {
      try {
        await prisma.locationInventory.create({
          data: {
            locationId: loc1.id,
            sku,
            itemName: String(nameHint).slice(0, 500),
            quantity: 0,
            unitCost: canonical,
            reorderPoint: 0,
            status: 'out_of_stock'
          }
        })
        createdLoc1 += 1
      } catch (e) {
        if (e?.code === 'P2002') {
          /* row appeared concurrently */
        } else {
          throw e
        }
      }
    }
  }

  const BATCH = 60
  for (const part of chunkArray(planned, BATCH)) {
    const valueTuples = part.map((p) => Prisma.sql`(${p.sku}, ${p.canonical}::double precision)`)
    const valuesSql = Prisma.join(valueTuples, ', ')

    const liCount = await prisma.$executeRaw(Prisma.sql`
      UPDATE "LocationInventory" AS li
      SET "unitCost" = v.price
      FROM (VALUES ${valuesSql}) AS v(sku, price)
      WHERE li.sku = v.sku
    `)
    updatedLi += Number(liCount) || 0

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
  console.log('  LocationInventory rows touched (PG row count):', updatedLi)
  console.log('  InventoryItem rows touched (PG row count):', updatedIi)
  console.log('  LOC1 placeholder rows created:', createdLoc1)
  if (orphanSkus.length) {
    console.log(
      '  Warning: SKUs with LocationInventory but no InventoryItem catalog row (only LI unit costs updated):',
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
