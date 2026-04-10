#!/usr/bin/env node
import 'dotenv/config'

/**
 * One-off repair: align LocationInventory.unitCost and InventoryItem (unitCost, totalValue)
 * with the canonical catalog row per SKU (same template resolution as api/manufacturing.js).
 *
 * The "correct" economics are: catalog unit cost on InventoryItem × quantities — not a sum of
 * stale per-location costs. This script pushes the template unit cost to every location row
 * and sets totalValue = quantity × unitCost on every InventoryItem row for that SKU.
 *
 * Usage: npm run repair:inventory-location-costs
 */

import { prisma } from '../api/_lib/prisma.js'

async function canonicalTemplateBySku() {
  const allTemplates = await prisma.inventoryItem.findMany({
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  const templateBySku = new Map()
  for (const meta of allTemplates) {
    if (!templateBySku.has(meta.sku)) {
      templateBySku.set(meta.sku, meta)
    }
  }
  return templateBySku
}

async function main() {
  const templateBySku = await canonicalTemplateBySku()
  let locationBatches = 0
  let inventoryBatches = 0

  for (const [, template] of templateBySku) {
    const sku = template.sku
    const c = Number(template.unitCost) || 0

    const loc = await prisma.locationInventory.updateMany({
      where: { sku },
      data: { unitCost: c }
    })
    if (loc.count > 0) locationBatches++

    const inv = await prisma.$executeRaw`
      UPDATE "InventoryItem"
      SET "unitCost" = ${c},
          "totalValue" = "quantity" * ${c}
      WHERE "sku" = ${sku}
    `
    if (inv > 0) inventoryBatches++
  }

  console.log(
    JSON.stringify(
      {
        skusProcessed: templateBySku.size,
        locationInventoryUpdateManyCalls: locationBatches,
        inventoryItemRowsUpdatedStatementRuns: inventoryBatches
      },
      null,
      2
    )
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
