#!/usr/bin/env node
import 'dotenv/config'

/**
 * One-off repair: set InventoryItem unitCost + totalValue from the canonical catalog row per SKU.
 * (Location rows no longer store unit cost — catalog only.)
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
  let inventoryBatches = 0

  for (const [, template] of templateBySku) {
    const sku = template.sku
    const c = Number(template.unitCost) || 0

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
