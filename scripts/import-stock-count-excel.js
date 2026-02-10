#!/usr/bin/env node
/**
 * Intelligent import of ABCOTRONICS STOCK COUNT Excel into manufacturing inventory.
 * - Reads the Excel file (sheet "ABCO Stock Take January 2026" or first sheet)
 * - Creates missing Stock Locations (from Location Code or Location name)
 * - Creates missing Suppliers (from Supplier column)
 * - Imports each row as an inventory item with boxNumber, supplier part numbers, etc.
 *
 * Usage: node scripts/import-stock-count-excel.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx"
 * Requires: DATABASE_URL in .env (or environment)
 */

import 'dotenv/config'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { prisma } from '../api/_lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Column header mapping (Excel header -> our field)
const HEADERS = {
  'BOX NUMBER (NO LONGER SKU)': 'boxNumber',
  'Box Number': 'boxNumber',
  'BOX NUMBER': 'boxNumber',
  'PART NAME (NO LONGER NAME)': 'name',
  'Part Name': 'name',
  'PART NAME': 'name',
  'Category': 'category',
  'Type': 'type',
  'Quantity': 'quantity',
  'Qty': 'quantity',
  'QTY': 'quantity',
  'Unit': 'unit',
  'Unit Cost': 'unitCost',
  'Total Value': 'totalValue',
  'Total Value (R)': 'totalValue',
  'Value': 'totalValue',
  'Reorder Point': 'reorderPoint',
  'Reorder Qty': 'reorderQty',
  'Location': 'location',
  'Supplier': 'supplier',
  'Thumbnail': 'thumbnail',
  'SUPPLIER Part Number': 'supplierPartNumber',
  'Supplier Part Number': 'supplierPartNumber',
  'Abcotronics Part Number': 'legacyPartNumber',
  'ABCOTRONICS DESCRIPTION (NO LONGER LEGACY PAR NUMBER)': 'legacyPartNumber',
  'ABCOTRONICS DESCRIPTION (NO LONGER LEGACY PART NUMBER)': 'legacyPartNumber',
  'SUPPLIER DESCRIPTION (No Longer Supplier Part Number)': 'supplierDescription',
  'Location Code': 'locationCode',
}

// Headers that indicate a quantity column (for fallback detection)
const QUANTITY_HEADER_PATTERN = /quantity|qty|stock|count|on\s*hand|balance/i

function normalizeCode(s) {
  if (s == null || s === '') return ''
  const t = String(s).trim().toUpperCase()
  return t || ''
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

// Parse numeric cells: support both "362,593.29" (US) and "362 158,29" (SA: space=thousands, comma=decimal)
function parseDecimal(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  let s = String(val).trim().replace(/\s/g, '')
  if (!s) return 0
  // SA/EU format: comma is decimal only when no dot (e.g. "362 158,29" -> 362158.29)
  // If there's a dot, treat as US (comma = thousands), e.g. "362,593.29" -> 362593.29
  if (!/\.\d/.test(s) && /,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

// US format only for currency (comma = thousands): "362,593.29" -> 362593.29. Use for Total Value / Unit Cost when spreadsheet uses US.
function parseDecimalUS(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  const s = String(val).trim().replace(/\s/g, '').replace(/,/g, '')
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

async function ensureLocation(prisma, codeOrName) {
  const code = normalizeCode(codeOrName) || 'LOC001'
  let loc = await prisma.stockLocation.findFirst({ where: { code } })
  if (loc) return loc
  // Try by name (case-insensitive)
  const name = String(codeOrName).trim() || code
  loc = await prisma.stockLocation.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } }
  })
  if (loc) return loc
  // Create new location (use code as LOCxxx if it looks like a name, e.g. PMB)
  const newCode = /^LOC\d+$/i.test(code) ? code : code.slice(0, 20).replace(/\s+/g, '_')
  loc = await prisma.stockLocation.create({
    data: {
      code: newCode,
      name: name || newCode,
      type: 'warehouse',
      status: 'active',
    }
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
    }
  })
  console.log('   Created supplier:', s.name)
  return s
}

function getStatusFromQuantity(quantity, reorderPoint) {
  if (quantity > (reorderPoint || 0)) return 'in_stock'
  if (quantity > 0) return 'low_stock'
  return 'out_of_stock'
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const updateQuantitiesOnly = args.includes('--update-quantities-only')
  const updateLegacyPartNumbersOnly = args.includes('--update-legacy-part-numbers')
  const onlyLocationArg = args.find(a => a.startsWith('--only-location='))
  const onlyLocation = onlyLocationArg
    ? onlyLocationArg.replace('--only-location=', '').trim()
    : (process.env.ONLY_LOCATION || '').trim()
  const pathArg = args.find(a => !a.startsWith('--'))
  if (!pathArg) {
    console.error('Usage: node scripts/import-stock-count-excel.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx" [--dry-run] [--only-location=PMB] [--update-quantities-only] [--update-legacy-part-numbers]')
    process.exit(1)
  }
  const inputPath = resolve(pathArg)
  if (dryRun) console.log('(Dry run: no database changes)\n')
  if (onlyLocation) console.log('Only location:', onlyLocation, '(skipping rows for other locations)\n')
  let workbook
  try {
    workbook = XLSX.read(readFileSync(inputPath), { type: 'buffer' })
  } catch (e) {
    console.error('Failed to read Excel file:', e.message)
    process.exit(1)
  }
  const sheetName = workbook.SheetNames.find(n =>
    /stock|take|inventory|count/i.test(n)
  ) || workbook.SheetNames[0]
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
    console.error('Could not find Part Name / Name column. Headers:', headerRow.slice(0, 20).join(', '))
    process.exit(1)
  }
  // Fallback: ensure quantity column is found (try multiple header names/patterns)
  if (colIndex.quantity === undefined) {
    const qtyIdx = headerRow.findIndex(h => QUANTITY_HEADER_PATTERN.test(String(h)))
    if (qtyIdx >= 0) colIndex.quantity = qtyIdx
  }
  if (colIndex.quantity === undefined) {
    console.warn('⚠️ Quantity column not found. Headers:', headerRow.join(', '))
  } else {
    const qtyHeader = headerRow[colIndex.quantity] || '(column ' + colIndex.quantity + ')'
    console.log('Using quantity column:', JSON.stringify(qtyHeader), 'at index', colIndex.quantity)
  }

  let dataRows = rows.slice(1).filter(row => row && (row[nameCol] != null && String(row[nameCol]).trim() !== ''))
  if (onlyLocation) {
    const locMatch = (row) => {
      const code = (row[colIndex.locationCode] != null ? String(row[colIndex.locationCode]).trim() : '').toUpperCase()
      const name = (row[colIndex.location] != null ? String(row[colIndex.location]).trim() : '')
      return code === onlyLocation.toUpperCase() || (name && name.toUpperCase() === onlyLocation.toUpperCase())
    }
    const before = dataRows.length
    dataRows = dataRows.filter(locMatch)
    console.log('Rows for location', onlyLocation + ':', dataRows.length, '(skipped', before - dataRows.length, 'other locations)')
  } else {
    console.log('Rows to import:', dataRows.length)
  }

  // Helper to parse quantity from a row (used in both import and update-quantities-only)
  function parseQuantity(row) {
    if (colIndex.quantity === undefined) return 0
    const rawQty = row[colIndex.quantity]
    if (typeof rawQty === 'number' && !Number.isNaN(rawQty)) return Math.max(0, rawQty)
    return Math.max(0, parseDecimal(rawQty))
  }

  const get = (row, key) => {
    const idx = colIndex[key]
    if (idx === undefined) return ''
    const v = row[idx]
    return v != null ? String(v).trim() : ''
  }

  if (dryRun) {
    const locations = new Set()
    const suppliers = new Set()
    const sampleQuantities = []
    for (const row of dataRows) {
      const locCode = row[colIndex.locationCode] != null ? String(row[colIndex.locationCode]).trim() : ''
      const locName = row[colIndex.location] != null ? String(row[colIndex.location]).trim() : ''
      if (locCode) locations.add(locCode)
      if (locName) locations.add(locName)
      const sup = row[colIndex.supplier] != null ? String(row[colIndex.supplier]).trim() : ''
      if (sup) suppliers.add(sup)
      if (sampleQuantities.length < 5) sampleQuantities.push(parseQuantity(row))
    }
    console.log('Unique locations (would ensure):', [...locations])
    console.log('Unique suppliers (would ensure):', [...suppliers])
    if (colIndex.quantity !== undefined) {
      console.log('Sample quantities (first 5 data rows):', sampleQuantities.join(', '))
    }
    console.log('Dry run complete. Run without --dry-run to import.')
    await prisma.$disconnect()
    return
  }

  if (updateQuantitiesOnly) {
    console.log('--update-quantities-only: updating quantities for existing items (match by name + box number)...')
    const existingItems = await prisma.inventoryItem.findMany({
      where: { sku: { startsWith: 'SKU' } },
      select: { id: true, sku: true, name: true, boxNumber: true, locationId: true, unitCost: true }
    })
    const byKey = new Map()
    for (const item of existingItems) {
      const name = (item.name || '').trim().toLowerCase()
      const box = (item.boxNumber || '').trim()
      const key = box ? `${name}::${box}` : name
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(item)
    }
    let updated = 0
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const name = (row[nameCol] != null ? String(row[nameCol]).trim() : '') || get(row, 'name')
      if (!name) continue
      const quantity = parseQuantity(row)
      const boxNumber = get(row, 'boxNumber')
      const key = boxNumber ? `${name.trim().toLowerCase()}::${boxNumber}` : name.trim().toLowerCase()
      const candidates = byKey.get(key) || byKey.get(name.trim().toLowerCase())
      if (!candidates || candidates.length === 0) continue
      const item = candidates[0]
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantity,
          totalValue: quantity * (item.unitCost || 0),
          status: quantity > 0 ? 'in_stock' : 'out_of_stock'
        }
      })
      if (item.locationId && quantity >= 0) {
        await prisma.locationInventory.upsert({
          where: { locationId_sku: { locationId: item.locationId, sku: item.sku } },
          update: { quantity, status: quantity > 0 ? 'in_stock' : 'out_of_stock', lastRestocked: new Date() },
          create: {
            locationId: item.locationId,
            sku: item.sku,
            itemName: item.name,
            quantity,
            unitCost: 0,
            reorderPoint: 0,
            status: quantity > 0 ? 'in_stock' : 'out_of_stock'
          }
        })
      }
      updated++
      if (updated % 100 === 0) console.log('   Updated', updated, 'quantities...')
    }
    console.log('Done. Updated quantities for', updated, 'items.')
    await prisma.$disconnect()
    return
  }

  if (updateLegacyPartNumbersOnly) {
    console.log('--update-legacy-part-numbers: updating Abcotronics part numbers into legacy field (match by name + box number)...')
    const existingItems = await prisma.inventoryItem.findMany({
      where: { sku: { startsWith: 'SKU' } },
      select: { id: true, name: true, boxNumber: true, manufacturingPartNumber: true, legacyPartNumber: true }
    })
    const byKey = new Map()
    for (const item of existingItems) {
      const name = (item.name || '').trim().toLowerCase()
      const box = (item.boxNumber || '').trim()
      const key = box ? `${name}::${box}` : name
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(item)
    }
    let updated = 0
    let skipped = 0
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const name = (row[nameCol] != null ? String(row[nameCol]).trim() : '') || get(row, 'name')
      if (!name) continue
      const boxNumber = get(row, 'boxNumber')
      const partNumber = get(row, 'legacyPartNumber')
      if (!partNumber) {
        skipped++
        continue
      }
      const key = boxNumber ? `${name.trim().toLowerCase()}::${boxNumber}` : name.trim().toLowerCase()
      const candidates = byKey.get(key) || byKey.get(name.trim().toLowerCase())
      if (!candidates || candidates.length === 0) {
        skipped++
        continue
      }
      const item = candidates[0]
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          legacyPartNumber: partNumber,
          manufacturingPartNumber: item.manufacturingPartNumber === partNumber ? '' : item.manufacturingPartNumber
        }
      })
      updated++
      if (updated % 100 === 0) console.log('   Updated', updated, 'part numbers...')
    }
    console.log('Done. Updated legacy part numbers for', updated, 'items.')
    if (skipped) console.log('Skipped rows without matches or part numbers:', skipped)
    await prisma.$disconnect()
    return
  }

  const locationCodes = new Set()
  const supplierByLower = new Map()
  for (const row of dataRows) {
    const locCode = row[colIndex.locationCode] != null ? String(row[colIndex.locationCode]).trim() : ''
    const locName = row[colIndex.location] != null ? String(row[colIndex.location]).trim() : ''
    if (locCode) locationCodes.add(locCode)
    if (locName) locationCodes.add(locName)
    const sup = row[colIndex.supplier] != null ? String(row[colIndex.supplier]).trim() : ''
    if (sup) {
      const key = sup.toLowerCase()
      if (!supplierByLower.has(key)) supplierByLower.set(key, sup)
    }
  }

  console.log('Ensuring locations...')
  const locationMap = {}
  const locationsToEnsure = onlyLocation ? [onlyLocation] : [...locationCodes]
  for (const codeOrName of locationsToEnsure) {
    if (!codeOrName) continue
    const loc = await ensureLocation(prisma, codeOrName)
    locationMap[normalizeCode(codeOrName)] = loc
    locationMap[String(codeOrName).trim()] = loc
  }
  if (onlyLocation) {
    const singleLoc = locationMap[normalizeCode(onlyLocation)] || locationMap[String(onlyLocation).trim()]
    if (singleLoc) locationMap[''] = singleLoc
  } else {
    const mainWarehouse = await prisma.stockLocation.findFirst({ where: { code: 'LOC001' } })
    if (mainWarehouse) {
      locationMap[''] = mainWarehouse
      locationMap['LOC001'] = mainWarehouse
    }
  }

  console.log('Ensuring suppliers...')
  for (const name of supplierByLower.values()) {
    await ensureSupplier(prisma, name)
  }
  const supplierCanonical = new Map()
  const allSuppliers = await prisma.supplier.findMany({ select: { name: true } })
  allSuppliers.forEach(s => supplierCanonical.set(s.name.toLowerCase(), s.name))

  const existing = await prisma.inventoryItem.findMany({ where: { sku: { startsWith: 'SKU' } }, select: { sku: true } })
  let maxNum = 0
  for (const item of existing) {
    const m = item.sku.match(/^SKU(\d+)$/)
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
  }
  let nextSku = maxNum + 1

  let created = 0
  const errors = []

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const get = (key) => {
      const idx = colIndex[key]
      if (idx === undefined) return ''
      const v = row[idx]
      return v != null ? String(v).trim() : ''
    }
    const name = (row[nameCol] != null ? String(row[nameCol]).trim() : '') || get('name')
    if (!name) continue

    const quantity = parseQuantity(row)
    const totalValue = (colIndex.totalValue !== undefined && row[colIndex.totalValue] != null)
      ? parseDecimal(row[colIndex.totalValue])
      : 0
    const unitCostNum = colIndex.unitCost !== undefined && row[colIndex.unitCost] != null
      ? parseDecimal(row[colIndex.unitCost])
      : NaN
    const unitCost = Number.isFinite(unitCostNum) ? unitCostNum : (quantity > 0 && totalValue > 0 ? Math.round((totalValue / quantity) * 100) / 100 : 0)
    const reorderPoint = colIndex.reorderPoint !== undefined ? parseFloat(row[colIndex.reorderPoint]) : NaN
    const reorderQty = colIndex.reorderQty !== undefined ? parseFloat(row[colIndex.reorderQty]) : NaN
    const reorderPointVal = Number.isFinite(reorderPoint) && reorderPoint >= 0 ? reorderPoint : Math.max(0, Math.floor(quantity * 0.2))
    const reorderQtyVal = Number.isFinite(reorderQty) && reorderQty >= 0 ? reorderQty : Math.max(0, Math.floor(quantity * 0.3))
    const status = getStatusFromQuantity(quantity, reorderPointVal)

    const locationCodeRaw = get('locationCode')
    const locationNameRaw = get('location')
    const locKey = normalizeCode(locationCodeRaw) || locationNameRaw
    const location = locationMap[locKey] || locationMap[locationNameRaw] || mainWarehouse
    const locationId = location ? location.id : null

    const supplierRaw = get('supplier')
    const supplierName = supplierRaw ? (supplierCanonical.get(supplierRaw.toLowerCase()) || supplierRaw) : ''
    const boxNumber = get('boxNumber')
    const supplierPartNum = get('supplierPartNumber')
    const legacyPartNumber = get('legacyPartNumber')
    const supplierPartNumbers = supplierName && supplierPartNum
      ? JSON.stringify([{ supplier: supplierName, partNumber: supplierPartNum }])
      : '[]'

    const sku = `SKU${String(nextSku).padStart(4, '0')}`
    nextSku++

    try {
      const createData = {
        sku,
        name,
        thumbnail: get('thumbnail') || '',
        category: normalizeCategory(colIndex.category !== undefined ? row[colIndex.category] : ''),
        type: normalizeType(colIndex.type !== undefined ? row[colIndex.type] : ''),
        quantity,
        unit: (get('unit') || 'pcs').toLowerCase(),
        reorderPoint: reorderPointVal,
        reorderQty: reorderQtyVal,
        location: locationNameRaw || (location ? location.name : ''),
        unitCost,
        totalValue: totalValue || quantity * unitCost,
        supplier: supplierName,
        status,
        lastRestocked: new Date(),
        ownerId: null,
        locationId,
        supplierPartNumbers,
        manufacturingPartNumber: '',
        legacyPartNumber: legacyPartNumber || '',
        boxNumber: boxNumber || '',
      }

      const item = await prisma.inventoryItem.create({ data: createData })
      created++

      if (locationId && quantity > 0) {
        await prisma.locationInventory.upsert({
          where: { locationId_sku: { locationId, sku: item.sku } },
          update: { itemName: item.name, quantity, unitCost: item.unitCost || 0, reorderPoint: item.reorderPoint || 0, status: getStatusFromQuantity(quantity, item.reorderPoint), lastRestocked: new Date() },
          create: {
            locationId,
            sku: item.sku,
            itemName: item.name,
            quantity,
            unitCost: item.unitCost || 0,
            reorderPoint: item.reorderPoint || 0,
            status: getStatusFromQuantity(quantity, item.reorderPoint),
          }
        })
      }

      if (quantity > 0) {
        const lastMov = await prisma.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
        const nextNum = lastMov && lastMov.movementId && lastMov.movementId.startsWith('MOV')
          ? parseInt(lastMov.movementId.replace('MOV', ''), 10) + 1
          : 1
        const locCode = location ? location.code : ''
        await prisma.stockMovement.create({
          data: {
            movementId: `MOV${String(nextNum).padStart(4, '0')}`,
            date: new Date(),
            type: 'adjustment',
            itemName: item.name,
            sku: item.sku,
            quantity,
            fromLocation: '',
            toLocation: locCode,
            reference: 'STOCK_COUNT_IMPORT',
            performedBy: 'System',
            notes: locCode ? `Stock count import: ${item.name} at ${locCode}` : `Stock count import: ${item.name}`,
            ownerId: null,
          }
        })
      }

      if (created % 100 === 0) console.log('   Imported', created, 'items...')
    } catch (err) {
      errors.push({ row: i + 2, name, error: err.message })
    }
  }

  console.log('')
  console.log('Done. Created', created, 'inventory items.')
  if (errors.length) {
    console.log('Errors:', errors.length)
    errors.slice(0, 20).forEach(e => console.log('  Row', e.row, e.name, '-', e.error))
    if (errors.length > 20) console.log('  ... and', errors.length - 20, 'more')
  }
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
