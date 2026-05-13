#!/usr/bin/env node
/**
 * Remove disposable manufacturing / stock test data created by mega audit scripts:
 *   MOVTYPE-* (test-all-stock-movements), FORENSIC-* (forensic E2E + extended flows),
 *   SalesOrder/PurchaseOrder rows whose notes match forensic runs, and StockMovement rows
 *   whose reference is movtest-* (MOVTYPE smoke references).
 *
 * Does NOT delete StockLocation rows — tests used real warehouses (e.g. 03_LOC3).
 * Does NOT touch inventory whose SKU does not match the patterns below.
 *
 * Usage:
 *   node scripts/cleanup-test-manufacturing-db-artifacts.mjs           # dry-run: counts only
 *   node scripts/cleanup-test-manufacturing-db-artifacts.mjs --write  # perform deletes
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { prisma } from '../api/_lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const WRITE = process.argv.includes('--write')

const skuTestInsensitive = {
  OR: [
    { sku: { startsWith: 'MOVTYPE-', mode: 'insensitive' } },
    { sku: { startsWith: 'FORENSIC-', mode: 'insensitive' } }
  ]
}

const movementTestWhere = {
  OR: [
    { sku: { startsWith: 'MOVTYPE-', mode: 'insensitive' } },
    { sku: { startsWith: 'FORENSIC-', mode: 'insensitive' } },
    { reference: { startsWith: 'movtest-', mode: 'insensitive' } }
  ]
}

function bomWhereForTests(testItemIds) {
  const idList = testItemIds.length ? [{ inventoryItemId: { in: testItemIds } }] : []
  return {
    OR: [
      { productSku: { startsWith: 'MOVTYPE-', mode: 'insensitive' } },
      { productSku: { startsWith: 'FORENSIC-', mode: 'insensitive' } },
      { notes: { contains: 'forensic-bom-', mode: 'insensitive' } },
      ...idList
    ]
  }
}

function productionWhereForTests() {
  return {
    OR: [
      { productSku: { startsWith: 'MOVTYPE-', mode: 'insensitive' } },
      { productSku: { startsWith: 'FORENSIC-', mode: 'insensitive' } },
      { workOrderNumber: { startsWith: 'FORENSIC-WO-', mode: 'insensitive' } },
      { notes: { contains: 'forensic-prod-', mode: 'insensitive' } }
    ]
  }
}

async function counts() {
  const testItemIds = (
    await prisma.inventoryItem.findMany({ where: skuTestInsensitive, select: { id: true } })
  ).map((r) => r.id)
  const items = await prisma.inventoryItem.count({ where: skuTestInsensitive })
  const li = await prisma.locationInventory.count({ where: skuTestInsensitive })
  const mov = await prisma.stockMovement.count({ where: movementTestWhere })
  const boms = await prisma.bOM.count({
    where: bomWhereForTests(testItemIds)
  })
  const prod = await prisma.productionOrder.count({ where: productionWhereForTests() })
  const so = await prisma.salesOrder.count({
    where: { notes: { contains: 'forensic-so-', mode: 'insensitive' } }
  })
  const po = await prisma.purchaseOrder.count({
    where: { notes: { contains: 'forensic-po-', mode: 'insensitive' } }
  })
  return { items, li, mov, boms, prod, so, po }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required (e.g. from .env)')
    process.exit(1)
  }

  const before = await counts()
  console.log(JSON.stringify({ phase: 'before', write: WRITE, ...before }, null, 2))

  if (!WRITE) {
    console.log('\nDry-run only. Re-run with --write to delete the rows above.')
    await prisma.$disconnect()
    return
  }

  const testItemIds = (
    await prisma.inventoryItem.findMany({ where: skuTestInsensitive, select: { id: true } })
  ).map((r) => r.id)

  const delProd = await prisma.productionOrder.deleteMany({ where: productionWhereForTests() })
  console.log('deleted ProductionOrder:', delProd.count)

  const delSo = await prisma.salesOrder.deleteMany({
    where: { notes: { contains: 'forensic-so-', mode: 'insensitive' } }
  })
  console.log('deleted SalesOrder:', delSo.count)

  const delPo = await prisma.purchaseOrder.deleteMany({
    where: { notes: { contains: 'forensic-po-', mode: 'insensitive' } }
  })
  console.log('deleted PurchaseOrder:', delPo.count)

  const delBom = await prisma.bOM.deleteMany({ where: bomWhereForTests(testItemIds) })
  console.log('deleted BOM:', delBom.count)

  const delMov = await prisma.stockMovement.deleteMany({
    where: movementTestWhere
  })
  console.log('deleted StockMovement:', delMov.count)

  const delLi = await prisma.locationInventory.deleteMany({ where: skuTestInsensitive })
  console.log('deleted LocationInventory:', delLi.count)

  const delSup = await prisma.inventoryItemSupplier.deleteMany({
    where: { inventoryItemId: { in: testItemIds } }
  })
  console.log('deleted InventoryItemSupplier:', delSup.count)

  const delItems = await prisma.inventoryItem.deleteMany({ where: skuTestInsensitive })
  console.log('deleted InventoryItem:', delItems.count)

  const after = await counts()
  console.log(JSON.stringify({ phase: 'after', ...after }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
