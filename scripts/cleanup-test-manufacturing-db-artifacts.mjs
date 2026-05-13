#!/usr/bin/env node
/**
 * Remove disposable manufacturing / stock test data created by mega audit scripts:
 *   MOVTYPE-* (test-all-stock-movements), FORENSIC-* (forensic E2E + extended flows),
 *   SalesOrder/PurchaseOrder rows whose notes match forensic runs, and StockMovement rows
 *   whose reference is movtest-* (MOVTYPE smoke references).
 *
 * Real-SKU test receipts (e.g. first catalog item from integration tests):
 *   - reference starting with PERSIST-TEST- (scripts/test-manufacturing-production-full.js)
 *   - optional explicit movementId list (MOV-...) — reverses +qty on LocationInventory then deletes row
 *
 * Does NOT delete StockLocation rows — tests used real warehouses (e.g. 03_LOC3).
 * Does NOT touch inventory whose SKU does not match MOVTYPE/FORENSIC unless you use receipt purge below.
 *
 * Usage:
 *   node scripts/cleanup-test-manufacturing-db-artifacts.mjs           # dry-run: counts only
 *   node scripts/cleanup-test-manufacturing-db-artifacts.mjs --write  # perform deletes
 *
 * Optional — purge specific receipt movementIds (after PERSIST-TEST- auto purge), reverses LI + catalog:
 *   PURGE_RECEIPT_MOVEMENT_IDS="MOV-MP3Z2A0Z-NNC3L4,MOV-MP3YZPSY-YMFD38" node scripts/cleanup-test-manufacturing-db-artifacts.mjs --write
 * Or: --purge-receipt-mov-ids=MOV-a,MOV-b
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

const persistTestRefWhere = {
  reference: { startsWith: 'PERSIST-TEST-', mode: 'insensitive' }
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

function parsePurgeReceiptMovIdsFromArgv() {
  const prefix = '--purge-receipt-mov-ids='
  const arg = process.argv.find((a) => a.startsWith(prefix))
  if (!arg) return []
  return arg
    .slice(prefix.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function receiptPurgeMovementIdsFromEnv() {
  const raw = process.env.PURGE_RECEIPT_MOVEMENT_IDS || ''
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function liStatus(qty, reorderPoint) {
  const rp = Number(reorderPoint) || 0
  if (qty <= 0) return 'out_of_stock'
  if (qty > rp) return 'in_stock'
  return 'low_stock'
}

/**
 * @param {{ id: string, type: string, sku: string, quantity: number, toLocation: string, movementId: string }} row
 */
async function reverseReceiptMovementThenDelete(row) {
  const type = String(row.type || '').toLowerCase()
  if (type !== 'receipt') {
    console.warn(`  skip (not receipt): ${row.movementId} type=${row.type}`)
    return false
  }
  const sku = String(row.sku || '').trim()
  const qty = Number(row.quantity) || 0
  if (!sku || qty <= 0) {
    console.warn(`  skip (bad sku/qty): ${row.movementId}`)
    return false
  }

  let locId = String(row.toLocation || '').trim()
  let li = null
  if (locId) {
    li = await prisma.locationInventory.findUnique({
      where: { locationId_sku: { locationId: locId, sku } }
    })
  }
  if (!li && locId) {
    const loc = await prisma.stockLocation.findFirst({
      where: { OR: [{ id: locId }, { code: locId }] },
      select: { id: true }
    })
    if (loc) {
      locId = loc.id
      li = await prisma.locationInventory.findUnique({
        where: { locationId_sku: { locationId: locId, sku } }
      })
    }
  }

  if (!li) {
    console.warn(`  no LocationInventory row for ${row.movementId} sku=${sku} toLocation=${row.toLocation} — deleting movement only`)
    await prisma.stockMovement.delete({ where: { id: row.id } })
    return true
  }

  const prev = Number(li.quantity) || 0
  const next = Math.max(0, prev - qty)
  if (prev < qty - 1e-6) {
    console.warn(
      `  warn: LI qty ${prev} < movement qty ${qty} for ${row.movementId} — clamping to 0 (ledger may have been adjusted elsewhere)`
    )
  }

  await prisma.locationInventory.update({
    where: { id: li.id },
    data: {
      quantity: next,
      status: liStatus(next, li.reorderPoint),
      lastRestocked: next > 0 ? li.lastRestocked : null
    }
  })

  const sumRow = await prisma.locationInventory.aggregate({
    _sum: { quantity: true },
    where: { sku }
  })
  const aggQty = sumRow._sum.quantity != null ? sumRow._sum.quantity : 0

  const masters = await prisma.inventoryItem.findMany({
    where: { sku },
    select: { id: true, reorderPoint: true, unitCost: true, lastRestocked: true }
  })
  for (const m of masters) {
    const uc = Number(m.unitCost) || 0
    await prisma.inventoryItem.update({
      where: { id: m.id },
      data: {
        quantity: aggQty,
        totalValue: aggQty * uc,
        status: liStatus(aggQty, m.reorderPoint || 0),
        ...(aggQty <= 0 ? { lastRestocked: null } : {})
      }
    })
  }

  await prisma.stockMovement.delete({ where: { id: row.id } })
  console.log(`  reversed receipt −${qty} ${sku} @ LI ${li.id.slice(0, 8)}…, deleted ${row.movementId}`)
  return true
}

async function purgePersistTestAndExplicitReceiptMoves() {
  const explicitIds = [...new Set([...receiptPurgeMovementIdsFromEnv(), ...parsePurgeReceiptMovIdsFromArgv()])]

  const persistRows = await prisma.stockMovement.findMany({
    where: persistTestRefWhere,
    select: { id: true, movementId: true, type: true, sku: true, quantity: true, toLocation: true, reference: true }
  })

  const explicitRows =
    explicitIds.length > 0
      ? await prisma.stockMovement.findMany({
          where: { movementId: { in: explicitIds } },
          select: { id: true, movementId: true, type: true, sku: true, quantity: true, toLocation: true, reference: true }
        })
      : []

  const persistSet = new Set(persistRows.map((r) => r.id))
  const extraExplicit = explicitRows.filter((r) => !persistSet.has(r.id))

  console.log(
    `\nReceipt test purge: ${persistRows.length} PERSIST-TEST-* + ${extraExplicit.length} explicit movementId(s) (after de-dup)`
  )

  let n = 0
  for (const row of persistRows) {
    if (await reverseReceiptMovementThenDelete(row)) n++
  }
  for (const row of extraExplicit) {
    if (await reverseReceiptMovementThenDelete(row)) n++
  }
  console.log(`receipt test movements processed: ${n}`)
}

async function counts() {
  const testItemIds = (
    await prisma.inventoryItem.findMany({ where: skuTestInsensitive, select: { id: true } })
  ).map((r) => r.id)
  const items = await prisma.inventoryItem.count({ where: skuTestInsensitive })
  const li = await prisma.locationInventory.count({ where: skuTestInsensitive })
  const mov = await prisma.stockMovement.count({ where: movementTestWhere })
  const persistReceipts = await prisma.stockMovement.count({ where: persistTestRefWhere })
  const explicitIds = [...new Set([...receiptPurgeMovementIdsFromEnv(), ...parsePurgeReceiptMovIdsFromArgv()])]
  const explicitReceiptMov =
    explicitIds.length > 0
      ? await prisma.stockMovement.count({ where: { movementId: { in: explicitIds } } })
      : 0
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
  return { items, li, mov, persistReceipts, explicitReceiptMov, boms, prod, so, po }
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
    console.log(
      'PERSIST-TEST-* receipts need --write to reverse LI + catalog and delete (included in --write).\n' +
        'Extra integration-test MOV-* ids: set PURGE_RECEIPT_MOVEMENT_IDS or --purge-receipt-mov-ids=MOV-a,MOV-b'
    )
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

  await purgePersistTestAndExplicitReceiptMoves()

  const after = await counts()
  console.log(JSON.stringify({ phase: 'after', ...after }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
