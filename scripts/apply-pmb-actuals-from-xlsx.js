#!/usr/bin/env node
/**
 * Apply physical "Actual" quantities from a spreadsheet to PMB only: set PMB LocationInventory
 * to Actual, zero other locations for those SKUs, refresh InventoryItem aggregates, and create
 * one adjustment StockMovement per SKU (quantity = net change from previous system total).
 *
 * Expected workbook: column B = sku, column F = Actual (first non-empty per SKU wins).
 *
 * Usage:
 *   node scripts/apply-pmb-actuals-from-xlsx.js "/path/to/Please check.xlsx"
 *   node scripts/apply-pmb-actuals-from-xlsx.js "/path/to/Please check.xlsx" --write
 */

import 'dotenv/config'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import XLSX from 'xlsx'
import { prisma } from '../api/_lib/prisma.js'

function getStatusFromQuantity(quantity = 0, reorderPoint = 0) {
  if (quantity > (reorderPoint || 0)) return 'in_stock'
  if (quantity > 0) return 'low_stock'
  return 'out_of_stock'
}

async function findCanonicalInventoryItemTx(tx, sku) {
  const rows = await tx.inventoryItem.findMany({
    where: { sku },
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  return rows[0] || null
}

function parseFirstActualPerSku(rows) {
  /** Column B = index 1, F = index 5. First row (sheet order) with non-empty Actual per SKU wins. */
  const bySku = new Map()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const sku = String(r[1] ?? '').trim()
    if (!sku) continue
    const raw = r[5]
    if (raw === '' || raw === null || raw === undefined) continue
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.').trim())
    if (!Number.isFinite(num)) continue
    if (!bySku.has(sku)) bySku.set(sku, num)
  }
  return bySku
}

async function main() {
  const argv = process.argv.slice(2)
  const write = argv.includes('--write')
  const pathArg = argv.find((a) => !a.startsWith('--'))
  if (!pathArg) {
    console.error('Usage: node scripts/apply-pmb-actuals-from-xlsx.js "/path/to/file.xlsx" [--write]')
    process.exit(1)
  }
  const inputPath = resolve(pathArg)

  let workbook
  try {
    workbook = XLSX.read(readFileSync(inputPath), { type: 'buffer' })
  } catch (e) {
    console.error('Failed to read workbook:', e.message)
    process.exit(1)
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  const targets = parseFirstActualPerSku(rows)
  if (targets.size === 0) {
    console.error('No SKU/Actual pairs found (need column B = sku, F = Actual).')
    process.exit(1)
  }

  const pmb = await prisma.stockLocation.findFirst({
    where: { OR: [{ code: 'PMB' }, { name: { equals: 'PMB', mode: 'insensitive' } }] }
  })
  if (!pmb) {
    console.error('Stock location PMB not found.')
    process.exit(1)
  }

  const plan = []
  for (const [sku, actual] of targets) {
    const lis = await prisma.locationInventory.findMany({ where: { sku } })
    const prevTotal = lis.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const delta = actual - prevTotal
    const nonPmb = lis.filter((r) => r.locationId !== pmb.id)
    const pmbRow = lis.find((r) => r.locationId === pmb.id)
    plan.push({
      sku,
      actual,
      prevTotal,
      delta,
      nonPmbCount: nonPmb.length,
      pmbBefore: pmbRow?.quantity ?? 0
    })
  }

  console.log('Mode:', write ? 'WRITE' : 'DRY RUN')
  console.log('PMB:', pmb.code, pmb.name, pmb.id)
  console.log('Sheet:', sheetName, '| SKUs with Actual:', targets.size)
  console.log('')
  for (const p of plan) {
    console.log(
      `${p.sku} | system total before: ${p.prevTotal} → target Actual: ${p.actual} | delta: ${p.delta} | non-PMB rows to zero: ${p.nonPmbCount}`
    )
  }

  if (!write) {
    console.log('')
    console.log('Run with --write to apply.')
    await prisma.$disconnect()
    return
  }

  const lastMov = await prisma.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
  let movSeq =
    lastMov && lastMov.movementId?.startsWith('MOV') ? parseInt(lastMov.movementId.replace('MOV', ''), 10) + 1 : 1

  for (const p of plan) {
    const movementId = `MOV${String(movSeq).padStart(4, '0')}`
    movSeq += 1

    await prisma.$transaction(async (tx) => {
      const master = await findCanonicalInventoryItemTx(tx, p.sku)
      if (!master) {
        throw new Error(`No InventoryItem for ${p.sku} — create the item first.`)
      }
      const itemName = master.name || p.sku

      const allLi = await tx.locationInventory.findMany({ where: { sku: p.sku } })
      for (const row of allLi) {
        if (row.locationId === pmb.id) continue
        await tx.locationInventory.update({
          where: { id: row.id },
          data: {
            quantity: 0,
            status: 'out_of_stock'
          }
        })
      }

      const existingPmb = await tx.locationInventory.findUnique({
        where: { locationId_sku: { locationId: pmb.id, sku: p.sku } }
      })
      const unitCost = existingPmb?.unitCost ?? master.unitCost ?? 0
      const reorderPoint = existingPmb?.reorderPoint ?? master.reorderPoint ?? 0

      await tx.locationInventory.upsert({
        where: { locationId_sku: { locationId: pmb.id, sku: p.sku } },
        create: {
          locationId: pmb.id,
          sku: p.sku,
          itemName,
          quantity: p.actual,
          unitCost,
          reorderPoint,
          status: getStatusFromQuantity(p.actual, reorderPoint)
        },
        update: {
          itemName,
          quantity: p.actual,
          unitCost,
          reorderPoint,
          status: getStatusFromQuantity(p.actual, reorderPoint)
        }
      })

      const agg = await tx.locationInventory.aggregate({
        _sum: { quantity: true },
        where: { sku: p.sku }
      })
      const aggQty = agg._sum.quantity || 0
      await tx.inventoryItem.update({
        where: { id: master.id },
        data: {
          quantity: aggQty,
          totalValue: aggQty * (master.unitCost || 0),
          status: getStatusFromQuantity(aggQty, master.reorderPoint || 0)
        }
      })

      await tx.stockMovement.create({
        data: {
          movementId,
          date: new Date(),
          type: 'adjustment',
          itemName,
          sku: p.sku,
          quantity: p.delta,
          fromLocation: pmb.id,
          toLocation: '',
          reference: 'PMB physical count',
          performedBy: 'System',
          notes: `PMB actual reconciliation from workbook. System total ${p.prevTotal} → ${p.actual} (non-PMB locations cleared). #erp:pmb-actual`
        }
      })
    })
    console.log(`Applied ${p.sku}: ${movementId} qty delta ${p.delta}, PMB = ${p.actual}`)
  }

  console.log('')
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
