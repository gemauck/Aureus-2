#!/usr/bin/env node
/**
 * Fix data integrity: sync DB to spreadsheet for quantities, unit cost, total value,
 * location, and supplier. Creates PMB location if needed. For duplicate (name, boxNumber)
 * rows in the sheet, uses the row with the maximum quantity as source of truth.
 *
 * Usage: node scripts/fix-stock-count-integrity.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx"
 */

import 'dotenv/config'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import XLSX from 'xlsx'
import { prisma } from '../api/_lib/prisma.js'

const HEADERS = {
  'BOX NUMBER (NO LONGER SKU)': 'boxNumber',
  'PART NAME (NO LONGER NAME)': 'name',
  'Category': 'category',
  'Type': 'type',
  'Quantity': 'quantity',
  'Qty': 'quantity',
  'QTY': 'quantity',
  'Unit': 'unit',
  'Unit Cost': 'unitCost',
  'Total Value': 'totalValue',
  'Location': 'location',
  'Supplier': 'supplier',
  'Location Code': 'locationCode',
}
const QUANTITY_HEADER_PATTERN = /quantity|qty|stock|count|on\s*hand|balance/i

function normalizeCode(s) {
  if (s == null || s === '') return ''
  return String(s).trim().toUpperCase() || ''
}

function parseQuantity(row, colIndex) {
  if (colIndex.quantity === undefined) return 0
  const rawQty = row[colIndex.quantity]
  if (typeof rawQty === 'number' && !Number.isNaN(rawQty)) return Math.max(0, rawQty)
  const s = String(rawQty != null ? rawQty : '').trim()
  if (s === '') return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function parseNum(row, colIndex, key) {
  if (colIndex[key] === undefined) return 0
  const v = row[colIndex[key]]
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).trim())
  return Number.isFinite(n) ? n : 0
}

function getStr(row, colIndex, key) {
  if (colIndex[key] === undefined) return ''
  const v = row[colIndex[key]]
  return v != null ? String(v).trim() : ''
}

async function ensureLocation(prisma, codeOrName) {
  const code = normalizeCode(codeOrName) || 'LOC001'
  let loc = await prisma.stockLocation.findFirst({ where: { code } })
  if (loc) return loc
  const name = String(codeOrName).trim() || code
  loc = await prisma.stockLocation.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  })
  if (loc) return loc
  const newCode = /^LOC\d+$/i.test(code) ? code : code.slice(0, 20).replace(/\s+/g, '_')
  loc = await prisma.stockLocation.create({
    data: {
      code: newCode,
      name: name || newCode,
      type: 'warehouse',
      status: 'active',
    },
  })
  console.log('   Created location:', loc.code, loc.name)
  return loc
}

function getStatusFromQuantity(quantity, reorderPoint) {
  if (quantity > (reorderPoint || 0)) return 'in_stock'
  if (quantity > 0) return 'low_stock'
  return 'out_of_stock'
}

async function main() {
  const pathArg = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!pathArg) {
    console.error('Usage: node scripts/fix-stock-count-integrity.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx"')
    process.exit(1)
  }
  const inputPath = resolve(pathArg)

  let workbook
  try {
    workbook = XLSX.read(readFileSync(inputPath), { type: 'buffer' })
  } catch (e) {
    console.error('Failed to read Excel file:', e.message)
    process.exit(1)
  }

  const sheetName = workbook.SheetNames.find(n => /stock|take|inventory|count/i.test(n)) || workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (rows.length < 2) {
    console.error('Sheet has no data rows.')
    process.exit(1)
  }

  const headerRow = rows[0].map(h => (h != null ? String(h).trim() : ''))
  const colIndex = {}
  headerRow.forEach((h, i) => {
    const key = HEADERS[h] || h
    if (key) colIndex[key] = i
  })
  if (colIndex.name === undefined) {
    const nameCol = headerRow.findIndex(h => /part name|name|description/i.test(String(h)))
    if (nameCol >= 0) colIndex.name = nameCol
  }
  const nameCol = colIndex.name
  if (nameCol === undefined) {
    console.error('Could not find Part Name column.')
    process.exit(1)
  }
  if (colIndex.quantity === undefined) {
    const qtyIdx = headerRow.findIndex(h => QUANTITY_HEADER_PATTERN.test(String(h)))
    if (qtyIdx >= 0) colIndex.quantity = qtyIdx
  }

  const dataRows = rows.slice(1).filter(row => row && (row[nameCol] != null && String(row[nameCol]).trim() !== ''))
  console.log('Spreadsheet:', sheetName, '| Rows:', dataRows.length)

  // Build canonical sheet map: for duplicate (name, boxNumber) keep row with MAX quantity
  const sheetMap = new Map()
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const name = (row[nameCol] != null ? String(row[nameCol]).trim() : '') || getStr(row, colIndex, 'name')
    if (!name) continue
    const boxNumber = getStr(row, colIndex, 'boxNumber')
    const key = boxNumber ? `${name.trim().toLowerCase()}::${boxNumber}` : name.trim().toLowerCase()
    const quantity = parseQuantity(row, colIndex)
    const unitCostRaw = parseNum(row, colIndex, 'unitCost')
    const totalValueRaw = parseNum(row, colIndex, 'totalValue')
    const location = getStr(row, colIndex, 'location')
    const locationCode = getStr(row, colIndex, 'locationCode')
    const supplier = getStr(row, colIndex, 'supplier')
    const unitCost = Number.isFinite(unitCostRaw) ? unitCostRaw : (quantity > 0 && totalValueRaw > 0 ? totalValueRaw / quantity : 0)
    const totalValue = totalValueRaw > 0 ? totalValueRaw : quantity * unitCost
    const existing = sheetMap.get(key)
    if (!existing || quantity > existing.quantity) {
      sheetMap.set(key, {
        name,
        boxNumber,
        quantity,
        unitCost,
        totalValue,
        location,
        locationCode,
        supplier,
      })
    }
  }

  // Collect unique location codes/names and ensure they exist (always ensure PMB)
  const locationCodes = new Set(['PMB'])
  for (const r of sheetMap.values()) {
    if (r.locationCode) locationCodes.add(String(r.locationCode).trim())
    if (r.location) locationCodes.add(String(r.location).trim())
  }
  console.log('Ensuring locations (including PMB)...')
  const locationMap = {}
  for (const codeOrName of locationCodes) {
    if (!codeOrName) continue
    const loc = await ensureLocation(prisma, codeOrName)
    locationMap[normalizeCode(codeOrName)] = loc
    locationMap[String(codeOrName).trim()] = loc
  }
  const mainWarehouse = await prisma.stockLocation.findFirst({ where: { code: 'LOC001' } })
  if (mainWarehouse) {
    locationMap[''] = mainWarehouse
    locationMap['LOC001'] = mainWarehouse
  }

  // Load DB items
  const dbItems = await prisma.inventoryItem.findMany({
    where: { sku: { startsWith: 'SKU' } },
    select: {
      id: true,
      sku: true,
      name: true,
      boxNumber: true,
      quantity: true,
      unitCost: true,
      totalValue: true,
      supplier: true,
      locationId: true,
      reorderPoint: true,
    },
  })
  const dbByKey = new Map()
  for (const item of dbItems) {
    const name = (item.name || '').trim().toLowerCase()
    const box = (item.boxNumber || '').trim()
    const key = box ? `${name}::${box}` : name
    if (!dbByKey.has(key)) dbByKey.set(key, [])
    dbByKey.get(key).push(item)
  }

  const supplierCanonical = new Map()
  const allSuppliers = await prisma.supplier.findMany({ select: { name: true } })
  allSuppliers.forEach(s => supplierCanonical.set(s.name.toLowerCase(), s.name))

  let updated = 0
  let skipped = 0
  for (const [key, sheetRow] of sheetMap) {
    const dbList = dbByKey.get(key) || dbByKey.get(key.split('::')[0])
    if (!dbList || dbList.length === 0) {
      skipped++
      continue
    }
    // Update all DB items that match this key (in case of duplicates)
    for (const db of dbList) {
    const quantity = sheetRow.quantity
    const unitCost = sheetRow.unitCost
    const totalValue = sheetRow.totalValue || quantity * unitCost
    const status = getStatusFromQuantity(quantity, db.reorderPoint || 0)
    const locCode = normalizeCode(sheetRow.locationCode || sheetRow.location)
    const locName = String(sheetRow.location || sheetRow.locationCode || '').trim()
    const location = locationMap[locCode] || locationMap[locName] || locationMap[sheetRow.locationCode] || locationMap[sheetRow.location] || mainWarehouse
    const locationId = location ? location.id : db.locationId
    const rawSupplier = sheetRow.supplier || db.supplier || ''
    const supplier = rawSupplier ? (supplierCanonical.get(rawSupplier.trim().toLowerCase()) || rawSupplier.trim()) : ''

    await prisma.inventoryItem.update({
      where: { id: db.id },
      data: {
        quantity,
        unitCost,
        totalValue,
        supplier,
        status,
        locationId,
        lastRestocked: new Date(),
      },
    })

    // Update or create LocationInventory at current DB location
    if (db.locationId && quantity >= 0) {
      const isMoving = locationId && locationId !== db.locationId
      await prisma.locationInventory.upsert({
        where: { locationId_sku: { locationId: db.locationId, sku: db.sku } },
        update: {
          quantity: isMoving ? 0 : quantity,
          status: isMoving ? 'out_of_stock' : status,
          lastRestocked: new Date(),
        },
        create: {
          locationId: db.locationId,
          sku: db.sku,
          itemName: db.name,
          quantity: isMoving ? 0 : quantity,
          unitCost: db.unitCost ?? 0,
          reorderPoint: db.reorderPoint ?? 0,
          status: isMoving ? 'out_of_stock' : status,
        },
      })
    }
    // If location changed (e.g. to PMB), ensure LocationInventory at new location has quantity
    if (locationId && locationId !== db.locationId) {
      await prisma.locationInventory.upsert({
        where: { locationId_sku: { locationId, sku: db.sku } },
        update: { itemName: db.name, quantity, unitCost: unitCost || 0, status, lastRestocked: new Date() },
        create: {
          locationId,
          sku: db.sku,
          itemName: db.name,
          quantity,
          unitCost: unitCost || 0,
          reorderPoint: db.reorderPoint || 0,
          status,
        },
      })
    }
    updated++
    if (updated % 100 === 0) console.log('   Updated', updated, '...')
    }
  }

  console.log('Done. Updated', updated, 'items. Skipped (no DB match):', skipped)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
