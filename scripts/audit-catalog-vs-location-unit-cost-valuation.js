#!/usr/bin/env node
/**
 * Read-only: compare inventory valuation using catalog unit cost vs legacy LocationInventory.unitCost.
 * Run before dropping the column to confirm no material pricing impact for catalog SKUs.
 *
 * Usage:
 *   node scripts/audit-catalog-vs-location-unit-cost-valuation.js
 *   node scripts/audit-catalog-vs-location-unit-cost-valuation.js --json
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import {
  catalogUnitCostForSku,
  legacyCatalogUnitCostForSku,
  sumLocationInventoryValueByCatalogCost
} from '../api/_lib/inventoryCatalogUnitCost.js'
import { computedInventoryTotalValue } from '../api/_lib/inventoryValue.js'

const asJson = process.argv.includes('--json')
const EPS = 0.01

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const hasLiUnitCost = await prisma.$queryRaw`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'LocationInventory'
      AND column_name = 'unitCost'
    LIMIT 1
  `.then((rows) => rows.length > 0)

  const catalogRows = await prisma.inventoryItem.findMany({
      select: { id: true, sku: true, unitCost: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' }
    })

  const liRows = hasLiUnitCost
    ? await prisma.$queryRaw`
        SELECT "locationId", sku, quantity, "unitCost"
        FROM "LocationInventory"
      `
    : await prisma.locationInventory.findMany({
        select: { locationId: true, sku: true, quantity: true }
      })

  const templateBySku = new Map()
  for (const row of catalogRows) {
    if (row.sku && !templateBySku.has(row.sku)) {
      templateBySku.set(row.sku, row)
    }
  }

  let catalogGrand = sumLocationInventoryValueByCatalogCost(liRows, templateBySku)

  let legacyGrand = 0
  const mismatchedSkus = new Map()
  let orphanRows = 0
  let orphanLegacyValue = 0

  for (const row of liRows) {
    const sku = row.sku
    if (!sku) continue
    const template = templateBySku.get(sku) || {}
    const qty = num(row.quantity)
    const catalogUc = catalogUnitCostForSku(template)
    const legacyUc = legacyCatalogUnitCostForSku(template, row)
    const catalogLine = computedInventoryTotalValue(qty, catalogUc)
    const legacyLine = computedInventoryTotalValue(qty, legacyUc)
    legacyGrand += legacyLine

    if (!template?.id) {
      orphanRows += 1
      orphanLegacyValue += legacyLine
      continue
    }

    const diff = Math.abs(catalogLine - legacyLine)
    if (diff > EPS) {
      const prev = mismatchedSkus.get(sku) || { sku, catalogTotal: 0, legacyTotal: 0, diff: 0 }
      prev.catalogTotal += catalogLine
      prev.legacyTotal += legacyLine
      prev.diff += diff
      mismatchedSkus.set(sku, prev)
    }
  }

  const report = {
    locationInventoryRows: liRows.length,
    catalogSkus: templateBySku.size,
    hasLocationInventoryUnitCostColumn: hasLiUnitCost,
    grandTotalCatalogValuation: Math.round(catalogGrand * 100) / 100,
    grandTotalLegacyValuation: Math.round(legacyGrand * 100) / 100,
    grandTotalDiff: Math.round(Math.abs(catalogGrand - legacyGrand) * 100) / 100,
    catalogSkusWithValueMismatch: mismatchedSkus.size,
    orphanLocationRowsNoCatalog: orphanRows,
    orphanLegacyValuationOnly: Math.round(orphanLegacyValue * 100) / 100,
    topMismatches: [...mismatchedSkus.values()]
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 15)
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('Catalog vs legacy location unit-cost valuation audit')
    console.log('LocationInventory.unitCost column present:', hasLiUnitCost)
    console.log('')
    console.log('Grand total (catalog rules):', report.grandTotalCatalogValuation)
    console.log('Grand total (legacy rules):  ', report.grandTotalLegacyValuation)
    console.log('Absolute difference:         ', report.grandTotalDiff)
    console.log('Catalog SKUs with line mismatch:', report.catalogSkusWithValueMismatch)
    console.log('Orphan LI rows (no catalog):', report.orphanLocationRowsNoCatalog)
    console.log('Orphan value under legacy only:', report.orphanLegacyValuationOnly)
    if (report.topMismatches.length) {
      console.log('\nTop SKU mismatches (catalog vs legacy):')
      for (const m of report.topMismatches) {
        console.log(
          `  ${m.sku}  diff=${m.diff.toFixed(2)}  catalog=${m.catalogTotal.toFixed(2)}  legacy=${m.legacyTotal.toFixed(2)}`
        )
      }
    }
    if (report.grandTotalDiff <= EPS && report.catalogSkusWithValueMismatch === 0) {
      console.log('\n✓ No pricing impact for catalog-backed stock (within tolerance).')
    } else if (report.catalogSkusWithValueMismatch > 0) {
      console.log(
        '\n⚠ Some catalog SKUs still differ — usually LI.unitCost out of sync with catalog; run repair:inventory-location-costs before drop, or accept catalog as truth.'
      )
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
