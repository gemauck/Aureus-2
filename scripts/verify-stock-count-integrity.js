#!/usr/bin/env node
/**
 * Data integrity check: compare ABCOTRONICS STOCK COUNT Excel to the database.
 * Reports: missing in DB, quantity mismatches, unit cost / total value differences,
 * location/supplier mismatches.
 *
 * Usage: node scripts/verify-stock-count-integrity.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx"
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
  'Reorder Point': 'reorderPoint',
  'Reorder Qty': 'reorderQty',
  'Location': 'location',
  'Supplier': 'supplier',
  'Location Code': 'locationCode',
}
const QUANTITY_HEADER_PATTERN = /quantity|qty|stock|count|on\s*hand|balance/i

const NUM_TOLERANCE = 0.01 // allow 1 cent / 0.01 unit difference for floats

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

function sameNum(a, b, tolerance = NUM_TOLERANCE) {
  if (a === b) return true
  return Math.abs((a || 0) - (b || 0)) <= tolerance
}

async function main() {
  const pathArg = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!pathArg) {
    console.error('Usage: node scripts/verify-stock-count-integrity.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx"')
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
    console.error('Could not find Part Name column. Headers:', headerRow.slice(0, 20).join(', '))
    process.exit(1)
  }
  if (colIndex.quantity === undefined) {
    const qtyIdx = headerRow.findIndex(h => QUANTITY_HEADER_PATTERN.test(String(h)))
    if (qtyIdx >= 0) colIndex.quantity = qtyIdx
  }

  const dataRows = rows.slice(1).filter(row => row && (row[nameCol] != null && String(row[nameCol]).trim() !== ''))
  console.log('Spreadsheet:', sheetName)
  console.log('Data rows in sheet:', dataRows.length)
  console.log('')

  // Sum total value from every spreadsheet row (for comparison with DB and expected total)
  let sheetTotalValueAllRows = 0
  for (const row of dataRows) {
    const qty = parseQuantity(row, colIndex)
    const unitCost = parseNum(row, colIndex, 'unitCost')
    const totalValue = parseNum(row, colIndex, 'totalValue')
    const tv = totalValue > 0 ? totalValue : (qty * (Number.isFinite(unitCost) ? unitCost : 0))
    sheetTotalValueAllRows += tv
  }

  // Build sheet map: key = name (lowercase)::boxNumber -> canonical row (for duplicates use row with MAX quantity, same as fix script)
  const sheetMap = new Map()
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const name = (row[nameCol] != null ? String(row[nameCol]).trim() : '') || getStr(row, colIndex, 'name')
    if (!name) continue
    const boxNumber = getStr(row, colIndex, 'boxNumber')
    const key = boxNumber ? `${name.trim().toLowerCase()}::${boxNumber}` : name.trim().toLowerCase()
    const quantity = parseQuantity(row, colIndex)
    const unitCost = parseNum(row, colIndex, 'unitCost')
    const totalValue = parseNum(row, colIndex, 'totalValue')
    const location = getStr(row, colIndex, 'location')
    const locationCode = getStr(row, colIndex, 'locationCode')
    const supplier = getStr(row, colIndex, 'supplier')
    const uc = Number.isFinite(unitCost) ? unitCost : (quantity > 0 && totalValue > 0 ? totalValue / quantity : 0)
    const tv = totalValue || quantity * uc
    const existing = sheetMap.get(key)
    if (!existing || quantity > existing.quantity) {
      sheetMap.set(key, {
        name,
        boxNumber,
        quantity,
        unitCost: uc,
        totalValue: tv,
        location,
        locationCode,
        supplier,
        rowIndex: i + 2,
      })
    }
  }

  // Load DB items (imported SKU items) with location code
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
      stockLocation: { select: { code: true, name: true } },
    },
  })

  const dbByKey = new Map()
  let dbTotalValue = 0
  for (const item of dbItems) {
    dbTotalValue += Number(item.totalValue) || 0
    const name = (item.name || '').trim().toLowerCase()
    const box = (item.boxNumber || '').trim()
    const key = box ? `${name}::${box}` : name
    if (!dbByKey.has(key)) dbByKey.set(key, [])
    dbByKey.get(key).push(item)
  }

  // Compare
  const missingInDb = []
  const quantityMismatch = []
  const unitCostMismatch = []
  const totalValueMismatch = []
  const locationMismatch = []
  const supplierMismatch = []
  let matched = 0

  for (const [key, sheetRow] of sheetMap) {
    const dbList = dbByKey.get(key) || dbByKey.get(key.split('::')[0])
    if (!dbList || dbList.length === 0) {
      missingInDb.push({ ...sheetRow, key })
      continue
    }
    const db = dbList[0]
    matched++

    if (!sameNum(sheetRow.quantity, db.quantity, 0.5)) {
      quantityMismatch.push({
        name: sheetRow.name,
        boxNumber: sheetRow.boxNumber,
        sheetQty: sheetRow.quantity,
        dbQty: db.quantity,
        row: sheetRow.rowIndex,
      })
    }
    if (!sameNum(sheetRow.unitCost, db.unitCost)) {
      unitCostMismatch.push({
        name: sheetRow.name,
        boxNumber: sheetRow.boxNumber,
        sheet: sheetRow.unitCost,
        db: db.unitCost,
        row: sheetRow.rowIndex,
      })
    }
    if (!sameNum(sheetRow.totalValue, db.totalValue)) {
      totalValueMismatch.push({
        name: sheetRow.name,
        boxNumber: sheetRow.boxNumber,
        sheet: sheetRow.totalValue,
        db: db.totalValue,
        row: sheetRow.rowIndex,
      })
    }
    const dbLocCode = db.stockLocation?.code || ''
    const dbLocName = db.stockLocation?.name || ''
    const sheetLoc = (sheetRow.locationCode || sheetRow.location || '').trim().toUpperCase()
    const sheetLocNorm = sheetRow.locationCode ? sheetRow.locationCode.trim().toUpperCase() : (sheetRow.location || '').trim()
    if (sheetLoc && dbLocCode && sheetLoc !== dbLocCode && sheetLocNorm !== dbLocName) {
      locationMismatch.push({
        name: sheetRow.name,
        boxNumber: sheetRow.boxNumber,
        sheetLocation: sheetRow.locationCode || sheetRow.location,
        dbLocation: dbLocCode || dbLocName,
        row: sheetRow.rowIndex,
      })
    }
    const sheetSup = (sheetRow.supplier || '').trim()
    const dbSup = (db.supplier || '').trim()
    if (sheetSup && dbSup && sheetSup !== dbSup) {
      supplierMismatch.push({
        name: sheetRow.name,
        boxNumber: sheetRow.boxNumber,
        sheet: sheetRow.supplier,
        db: db.supplier,
        row: sheetRow.rowIndex,
      })
    }
  }

  // Items in DB that are not in sheet (by same key)
  const sheetKeys = new Set(sheetMap.keys())
  const onlyInDb = []
  for (const item of dbItems) {
    const name = (item.name || '').trim().toLowerCase()
    const box = (item.boxNumber || '').trim()
    const key = box ? `${name}::${box}` : name
    if (!sheetKeys.has(key)) onlyInDb.push({ name: item.name, boxNumber: item.boxNumber, sku: item.sku })
  }

  // Report
  const EXPECTED_SHEET_TOTAL = 362158.29
  const totalValueMatch = Math.abs(dbTotalValue - sheetTotalValueAllRows) <= 1
  const totalValueMatchExpected = Math.abs(dbTotalValue - EXPECTED_SHEET_TOTAL) <= 1

  console.log('=== DATA INTEGRITY REPORT ===')
  console.log('')
  console.log('Total value:')
  console.log('  Spreadsheet (sum of all rows):', sheetTotalValueAllRows.toFixed(2))
  console.log('  DB (sum of inventory totalValue):', dbTotalValue.toFixed(2))
  console.log('  Expected (from sheet total):     ', EXPECTED_SHEET_TOTAL.toFixed(2))
  console.log('  Sheet vs DB match:', totalValueMatch ? 'Yes' : 'No')
  console.log('  DB vs expected (362,158.29):   ', totalValueMatchExpected ? 'Yes' : 'No')
  console.log('')
  console.log('Summary:')
  console.log('  Rows in spreadsheet (with part name):', sheetMap.size)
  console.log('  Rows matched in DB:                 ', matched)
  console.log('  Missing in DB (in sheet only):     ', missingInDb.length)
  console.log('  In DB only (not in sheet):         ', onlyInDb.length)
  console.log('')

  if (missingInDb.length > 0) {
    console.log('Missing in DB (present in spreadsheet only):')
    missingInDb.slice(0, 25).forEach(r => {
      console.log('  Row', r.rowIndex, '|', r.name, r.boxNumber ? `| Box: ${r.boxNumber}` : '', '| Qty:', r.quantity)
    })
    if (missingInDb.length > 25) console.log('  ... and', missingInDb.length - 25, 'more')
    console.log('')
  }

  if (quantityMismatch.length > 0) {
    console.log('Quantity mismatches (sheet vs DB):')
    quantityMismatch.slice(0, 25).forEach(r => {
      console.log('  Row', r.row, '|', r.name, '| Sheet:', r.sheetQty, 'vs DB:', r.dbQty)
    })
    if (quantityMismatch.length > 25) console.log('  ... and', quantityMismatch.length - 25, 'more')
    console.log('')
  }

  if (unitCostMismatch.length > 0) {
    console.log('Unit cost mismatches (tolerance', NUM_TOLERANCE + '):')
    unitCostMismatch.slice(0, 15).forEach(r => {
      console.log('  Row', r.row, '|', r.name, '| Sheet:', r.sheet, 'vs DB:', r.db)
    })
    if (unitCostMismatch.length > 15) console.log('  ... and', unitCostMismatch.length - 15, 'more')
    console.log('')
  }

  if (totalValueMismatch.length > 0) {
    console.log('Total value mismatches (tolerance', NUM_TOLERANCE + '):')
    totalValueMismatch.slice(0, 15).forEach(r => {
      console.log('  Row', r.row, '|', r.name, '| Sheet:', r.sheet, 'vs DB:', r.db)
    })
    if (totalValueMismatch.length > 15) console.log('  ... and', totalValueMismatch.length - 15, 'more')
    console.log('')
  }

  if (locationMismatch.length > 0) {
    console.log('Location mismatches:')
    locationMismatch.slice(0, 15).forEach(r => {
      console.log('  Row', r.row, '|', r.name, '| Sheet:', r.sheetLocation, 'vs DB:', r.dbLocation)
    })
    if (locationMismatch.length > 15) console.log('  ... and', locationMismatch.length - 15, 'more')
    console.log('')
  }

  if (supplierMismatch.length > 0) {
    console.log('Supplier mismatches:')
    supplierMismatch.slice(0, 15).forEach(r => {
      console.log('  Row', r.row, '|', r.name, '| Sheet:', r.sheet, 'vs DB:', r.db)
    })
    if (supplierMismatch.length > 15) console.log('  ... and', supplierMismatch.length - 15, 'more')
    console.log('')
  }

  if (onlyInDb.length > 0 && onlyInDb.length <= 30) {
    console.log('In DB only (not in this spreadsheet):')
    onlyInDb.forEach(r => {
      console.log('  ', r.sku, '|', r.name, r.boxNumber ? `| Box: ${r.boxNumber}` : '')
    })
    console.log('')
  } else if (onlyInDb.length > 30) {
    console.log('In DB only:', onlyInDb.length, 'items (first 20):')
    onlyInDb.slice(0, 20).forEach(r => {
      console.log('  ', r.sku, '|', r.name, r.boxNumber ? `| Box: ${r.boxNumber}` : '')
    })
    console.log('  ... and', onlyInDb.length - 20, 'more')
    console.log('')
  }

  const hasErrors =
    missingInDb.length > 0 ||
    quantityMismatch.length > 0 ||
    unitCostMismatch.length > 0 ||
    totalValueMismatch.length > 0 ||
    locationMismatch.length > 0 ||
    supplierMismatch.length > 0

  if (!hasErrors && onlyInDb.length === 0) {
    console.log('Result: PASS — Spreadsheet and DB match (all rows matched, no quantity/cost/location/supplier mismatches).')
  } else if (!hasErrors) {
    console.log('Result: PASS — All spreadsheet rows present in DB with matching quantity, cost, location, supplier. (Some DB-only items exist.)')
  } else {
    console.log('Result: FAIL — See mismatches above.')
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
