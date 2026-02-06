#!/usr/bin/env node
/**
 * Re-import ABCOTRONICS STOCK COUNT Excel into manufacturing (fresh or after purge).
 * - One inventory item per spreadsheet row (392 rows → 392 items; no deduplication).
 * - Creates only locations that appear in the spreadsheet (e.g. PMB); supplier names normalized (e.g. RS/rs → one).
 * - Applies all fields as in spreadsheet: box number, prices, location, supplier, etc.
 * - Creates one adjustment movement per item so ledger shows: Opening 0, In +qty, Balance qty.
 *
 * Usage: node scripts/reimport-stock-count-excel.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx" [--dry-run]
 */

import 'dotenv/config'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { prisma } from '../api/_lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
  'Thumbnail': 'thumbnail',
  'SUPPLIER Part Number': 'supplierPartNumber',
  'Abcotronics Part Number': 'legacyPartNumber',
  'Location Code': 'locationCode',
}
const QUANTITY_HEADER_PATTERN = /quantity|qty|stock|count|on\s*hand|balance/i

function normalizeCode(s) {
  if (s == null || s === '') return ''
  return String(s).trim().toUpperCase() || ''
}

function normalizeCategory(val) {
  if (!val) return 'components'
  const v = String(val).trim().toLowerCase().replace(/\s+/g, '_')
  if (['components', 'accessories', 'finished_goods', 'raw_materials', 'work_in_progress', 'packaging'].includes(v)) return v
  return 'components'
}

function normalizeType(val) {
  if (!val) return 'component'
  const v = String(val).trim().toLowerCase()
  if (v === 'final_product' || v.includes('final') || v.includes('product')) return 'final_product'
  return 'component'
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

async function ensureSupplier(prisma, name) {
  if (!name || String(name).trim() === '') return null
  const n = String(name).trim()
  let s = await prisma.supplier.findFirst({
    where: { name: { equals: n, mode: 'insensitive' } },
  })
  if (s) return s
  s = await prisma.supplier.create({
    data: {
      name: n,
      code: n.slice(0, 20).replace(/\s+/g, '_'),
      status: 'active',
    },
  })
  console.log('   Created supplier:', s.name)
  return s
}

function getStatusFromQuantity(quantity, reorderPoint) {
  if (quantity > (reorderPoint || 0)) return 'in_stock'
  if (quantity > 0) return 'low_stock'
  return 'out_of_stock'
}

function getStr(row, colIndex, key) {
  if (colIndex[key] === undefined) return ''
  const v = row[colIndex[key]]
  return v != null ? String(v).trim() : ''
}

function parseNum(row, colIndex, key) {
  if (colIndex[key] === undefined) return 0
  const v = row[colIndex[key]]
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).trim())
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const pathArg = args.find(a => !a.startsWith('--'))
  if (!pathArg) {
    console.error('Usage: node scripts/reimport-stock-count-excel.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx" [--dry-run]')
    process.exit(1)
  }
  const inputPath = resolve(pathArg)
  if (dryRun) console.log('(Dry run: no database changes)\n')

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
  const qtyHeader = colIndex.quantity !== undefined ? (headerRow[colIndex.quantity] || '') : ''
  console.log('Sheet:', sheetName)
  console.log('Quantity column:', qtyHeader ? JSON.stringify(qtyHeader) : 'not found')

  const dataRows = rows.slice(1).filter(row => row && (row[nameCol] != null && String(row[nameCol]).trim() !== ''))
  console.log('Data rows in sheet:', dataRows.length)

  function parseQuantity(row) {
    if (colIndex.quantity === undefined) return 0
    const rawQty = row[colIndex.quantity]
    if (typeof rawQty === 'number' && !Number.isNaN(rawQty)) return Math.max(0, rawQty)
    const s = String(rawQty != null ? rawQty : '').trim()
    if (s === '') return 0
    const n = parseFloat(s)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }

  // Build one row per spreadsheet row (no deduplication; total = data rows with part name)
  const rowsToImport = []
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const name = (row[nameCol] != null ? String(row[nameCol]).trim() : '') || getStr(row, colIndex, 'name')
    if (!name) continue
    const quantity = parseQuantity(row)
    const totalValueRaw = parseNum(row, colIndex, 'totalValue')
    const unitCostRaw = parseNum(row, colIndex, 'unitCost')
    const unitCost = Number.isFinite(unitCostRaw) ? unitCostRaw : (quantity > 0 && totalValueRaw > 0 ? totalValueRaw / quantity : 0)
    const totalValue = totalValueRaw > 0 ? totalValueRaw : quantity * unitCost
    const reorderPointRaw = parseNum(row, colIndex, 'reorderPoint')
    const reorderQtyRaw = parseNum(row, colIndex, 'reorderQty')
    const reorderPoint = Number.isFinite(reorderPointRaw) && reorderPointRaw >= 0 ? reorderPointRaw : Math.max(0, Math.floor(quantity * 0.2))
    const reorderQty = Number.isFinite(reorderQtyRaw) && reorderQtyRaw >= 0 ? reorderQtyRaw : Math.max(0, Math.floor(quantity * 0.3))
    rowsToImport.push({
      name,
      boxNumber: getStr(row, colIndex, 'boxNumber'),
      quantity,
      unitCost,
      totalValue,
      reorderPoint,
      reorderQty,
      location: getStr(row, colIndex, 'location'),
      locationCode: getStr(row, colIndex, 'locationCode'),
      supplier: getStr(row, colIndex, 'supplier'),
      supplierPartNumber: getStr(row, colIndex, 'supplierPartNumber'),
      legacyPartNumber: getStr(row, colIndex, 'legacyPartNumber'),
      category: colIndex.category !== undefined ? row[colIndex.category] : '',
      type: colIndex.type !== undefined ? row[colIndex.type] : '',
      unit: getStr(row, colIndex, 'unit') || 'pcs',
      thumbnail: getStr(row, colIndex, 'thumbnail'),
    })
  }

  console.log('Rows to import (one item per row):', rowsToImport.length)
  if (dryRun) {
    console.log('Would create:', rowsToImport.length, 'inventory items, with one adjustment movement each (Opening 0 → In +qty → Balance qty)')
    const locs = new Set()
    const sups = new Set()
    rowsToImport.forEach(r => {
      if (r.locationCode) locs.add(r.locationCode)
      if (r.location) locs.add(r.location)
      if (r.supplier) sups.add(r.supplier)
    })
    console.log('Locations (would ensure):', [...locs])
    console.log('Suppliers (would ensure):', [...sups])
    console.log('Dry run complete. Run without --dry-run to import.')
    await prisma.$disconnect()
    return
  }

  const isLoc1 = (s) => /loc1|loc001/i.test(String(s || '').trim())
  // Ensure only locations from the spreadsheet; ignore any column value containing LOC1/LOC001
  const locationCodes = new Set()
  rowsToImport.forEach(r => {
    const code = String(r.locationCode || '').trim()
    const name = String(r.location || '').trim()
    if (code && !isLoc1(code)) locationCodes.add(code)
    if (name && !isLoc1(name)) locationCodes.add(name)
  })
  if (locationCodes.size === 0) locationCodes.add('PMB')
  console.log('Ensuring locations...')
  const locationMap = {}
  for (const codeOrName of locationCodes) {
    if (!codeOrName) continue
    const loc = await ensureLocation(prisma, codeOrName)
    locationMap[normalizeCode(codeOrName)] = loc
    locationMap[String(codeOrName).trim()] = loc
  }
  const defaultLocation = locationMap['PMB'] || Object.values(locationMap)[0] || null
  if (defaultLocation) locationMap[''] = defaultLocation

  // Ensure suppliers (dedupe by lowercase so "RS" and "rs" become one)
  const supplierByLower = new Map()
  rowsToImport.forEach(r => {
    if (r.supplier) {
      const key = r.supplier.trim().toLowerCase()
      if (!supplierByLower.has(key)) supplierByLower.set(key, r.supplier.trim())
    }
  })
  const supplierCanonical = new Map()
  console.log('Ensuring suppliers...')
  for (const [key, name] of supplierByLower) {
    const s = await ensureSupplier(prisma, name)
    if (s) supplierCanonical.set(key, s.name)
  }

  let nextSku = 1
  let movementCounter = 1
  let created = 0
  const errors = []

  for (const row of rowsToImport) {
    const quantity = row.quantity
    let locCode = String(row.locationCode || '').trim()
    let locName = String(row.location || '').trim()
    if (isLoc1(locCode)) locCode = ''
    if (isLoc1(locName)) locName = ''
    const location = (locCode ? locationMap[locCode] : null) || (locName ? locationMap[locName] : null) || (locCode ? locationMap[normalizeCode(locCode)] : null) || (locName ? locationMap[normalizeCode(locName)] : null) || defaultLocation
    const locationId = location ? location.id : null
    const locationName = location ? location.name : ''
    const canonicalSupplier = row.supplier ? (supplierCanonical.get(row.supplier.trim().toLowerCase()) || row.supplier.trim()) : ''
    const supplierPartNumbers = canonicalSupplier && row.supplierPartNumber
      ? JSON.stringify([{ supplier: canonicalSupplier, partNumber: row.supplierPartNumber }])
      : '[]'
    const status = getStatusFromQuantity(quantity, row.reorderPoint)
    const sku = `SKU${String(nextSku).padStart(4, '0')}`
    nextSku++

    try {
      const createData = {
        sku,
        name: row.name,
        thumbnail: row.thumbnail || '',
        category: normalizeCategory(row.category),
        type: normalizeType(row.type),
        quantity,
        unit: (row.unit || 'pcs').toLowerCase(),
        reorderPoint: row.reorderPoint,
        reorderQty: row.reorderQty,
        location: locationName,
        unitCost: row.unitCost,
        totalValue: row.totalValue || quantity * row.unitCost,
        supplier: canonicalSupplier,
        status,
        lastRestocked: new Date(),
        ownerId: null,
        locationId,
        supplierPartNumbers,
        manufacturingPartNumber: '',
        legacyPartNumber: row.legacyPartNumber || '',
        boxNumber: row.boxNumber || '',
      }
      const item = await prisma.inventoryItem.create({ data: createData })
      created++

      if (locationId != null) {
        await prisma.locationInventory.upsert({
          where: { locationId_sku: { locationId, sku: item.sku } },
          update: {
            itemName: item.name,
            quantity,
            unitCost: item.unitCost ?? 0,
            reorderPoint: item.reorderPoint ?? 0,
            status: getStatusFromQuantity(quantity, item.reorderPoint),
            lastRestocked: new Date(),
          },
          create: {
            locationId,
            sku: item.sku,
            itemName: item.name,
            quantity,
            unitCost: item.unitCost ?? 0,
            reorderPoint: item.reorderPoint ?? 0,
            status: getStatusFromQuantity(quantity, item.reorderPoint),
          },
        })
      }

      // One adjustment per item so ledger shows: Opening 0, In +quantity, Balance quantity
      const movementId = `MOV${String(movementCounter).padStart(4, '0')}`
      movementCounter++
      const toLocCode = location ? location.code : ''
      await prisma.stockMovement.create({
        data: {
          movementId,
          date: new Date(),
          type: 'adjustment',
          itemName: item.name,
          sku: item.sku,
          quantity,
          fromLocation: '',
          toLocation: toLocCode,
          reference: 'STOCK_COUNT_IMPORT',
          performedBy: 'System',
          notes: toLocCode ? `Stock count import: ${item.name} at ${toLocCode}` : `Stock count import: ${item.name}`,
          ownerId: null,
        },
      })

      if (created % 100 === 0) console.log('   Imported', created, 'items...')
    } catch (err) {
      errors.push({ name: row.name, error: err.message })
    }
  }

  console.log('')
  console.log('Done. Created', created, 'inventory items (one per spreadsheet row), each with one adjustment movement so ledger opens at 0 and balance = added amount.')
  if (errors.length) {
    console.log('Errors:', errors.length)
    errors.slice(0, 20).forEach(e => console.log('  ', e.name, '-', e.error))
    if (errors.length > 20) console.log('  ... and', errors.length - 20, 'more')
  }
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
