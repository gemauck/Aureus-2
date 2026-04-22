import XLSX from 'xlsx'
import { parseStockCountDecimal, runStockCountImportPipeline } from './stockCountTemplateImport.js'

function normalizeName(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normCell(v) {
  return String(v ?? '').trim()
}

/**
 * Map first-row headers to logical column keys (flexible naming).
 */
function mapFlexibleHeaderRow(row) {
  const aliases = {
    sku: 'sku',
    part: 'sku',
    partnumber: 'sku',
    itemcode: 'sku',
    productcode: 'sku',
    stockcode: 'sku',
    stockno: 'sku',
    locationid: 'locationId',
    locationcode: 'locationCode',
    loccode: 'locationCode',
    bincode: 'locationCode',
    locationname: 'locationName',
    location: 'locationText',
    loc: 'locationText',
    bin: 'locationText',
    warehouse: 'locationText',
    storagelocation: 'locationText',
    site: 'locationText',
    quantity: 'countedQty',
    qty: 'countedQty',
    count: 'countedQty',
    stock: 'countedQty',
    onhand: 'countedQty',
    counted: 'countedQty',
    countedqty: 'countedQty',
    qtyonhand: 'countedQty',
    physicalqty: 'countedQty',
    description: 'itemName',
    itemname: 'itemName',
    partname: 'itemName',
    productdescription: 'itemName',
    name: 'itemName',
    product: 'itemName'
  }
  const col = {}
  row.forEach((cell, i) => {
    const raw = String(cell ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
    const key = aliases[raw] || raw
    if (key && col[key] === undefined) col[key] = i
  })
  return col
}

async function buildLocationIndexes(prisma) {
  const locations = await prisma.stockLocation.findMany({
    where: { status: 'active' },
    select: { id: true, code: true, name: true }
  })
  const byId = new Map(locations.map((l) => [l.id, l]))
  const byCode = new Map()
  const byName = new Map()
  for (const l of locations) {
    const c = normCell(l.code).toLowerCase()
    if (c && !byCode.has(c)) byCode.set(c, l)
    const n = normCell(l.name).toLowerCase()
    if (n && !byName.has(n)) byName.set(n, l)
  }
  return { byId, byCode, byName }
}

/**
 * Resolve active stock location from row cells.
 */
function resolveLocationId(col, line, idx, sheetName, rowNum, errors) {
  const idRaw =
    col.locationId !== undefined ? normCell(line[col.locationId]) : ''
  const codeRaw =
    col.locationCode !== undefined ? normCell(line[col.locationCode]) : ''
  const nameRaw =
    col.locationName !== undefined ? normCell(line[col.locationName]) : ''
  const textRaw =
    col.locationText !== undefined ? normCell(line[col.locationText]) : ''

  if (idRaw && idx.byId.has(idRaw)) return idRaw

  if (codeRaw) {
    const hit = idx.byCode.get(codeRaw.toLowerCase())
    if (hit) return hit.id
  }

  if (nameRaw) {
    const hit = idx.byName.get(nameRaw.toLowerCase())
    if (hit) return hit.id
  }

  if (textRaw) {
    if (idx.byId.has(textRaw)) return textRaw
    const tl = textRaw.toLowerCase()
    if (idx.byCode.has(tl)) return idx.byCode.get(tl).id
    if (idx.byName.has(tl)) return idx.byName.get(tl).id
  }

  const hint = idRaw || codeRaw || nameRaw || textRaw
  if (hint) {
    errors.push({
      sheet: sheetName,
      row: rowNum,
      error: `Unknown or inactive location "${hint}"`
    })
  }
  return null
}

function hasLocationColumns(col) {
  return (
    col.locationId !== undefined ||
    col.locationCode !== undefined ||
    col.locationName !== undefined ||
    col.locationText !== undefined
  )
}

/**
 * Parse a workbook whose columns name SKU, a location (id/code/name/free text), and counted quantity.
 * Rows are merged on (locationId, sku) or (locationId, new-line name). Then the shared stock-count pipeline applies deltas.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Buffer} buffer
 * @param {{ dryRun: boolean, forceCreateDuplicate: boolean }} options
 * @param {object} req
 */
export async function runFlexibleStockCountByLocationImport(prisma, buffer, options, req) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const locIdx = await buildLocationIndexes(prisma)
  const errors = []
  const rawRows = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (!aoa.length) continue

    const col = mapFlexibleHeaderRow(aoa[0])
    if (col.countedQty === undefined) {
      errors.push({
        sheet: sheetName,
        error:
          'Missing quantity column (expected Qty, Quantity, Count, Stock, OnHand, CountedQty, etc.)'
      })
      continue
    }
    if (!hasLocationColumns(col)) {
      errors.push({
        sheet: sheetName,
        error:
          'Missing location column (expected LocationId, LocationCode, LocationName, Location, Loc, Bin, Warehouse, etc.)'
      })
      continue
    }

    for (let r = 1; r < aoa.length; r++) {
      const line = aoa[r]
      if (!line || !line.length) continue

      const countedRaw = line[col.countedQty]
      const counted = parseStockCountDecimal(countedRaw)
      if (countedRaw === '' || countedRaw === null || counted === null || counted === undefined) {
        continue
      }

      const locationId = resolveLocationId(col, line, locIdx, sheetName, r + 1, errors)
      if (!locationId) {
        if (
          col.locationId !== undefined ||
          col.locationCode !== undefined ||
          col.locationName !== undefined ||
          col.locationText !== undefined
        ) {
          const idR = col.locationId !== undefined ? normCell(line[col.locationId]) : ''
          const cR = col.locationCode !== undefined ? normCell(line[col.locationCode]) : ''
          const nR = col.locationName !== undefined ? normCell(line[col.locationName]) : ''
          const tR = col.locationText !== undefined ? normCell(line[col.locationText]) : ''
          if (!idR && !cR && !nR && !tR) continue
        }
        continue
      }

      let sku = col.sku !== undefined ? normCell(line[col.sku]) : ''
      const desc =
        col.itemName !== undefined ? normCell(line[col.itemName]) : ''

      let itemName = desc
      let isNewLine = !sku

      if (sku) {
        const inv = await prisma.inventoryItem.findFirst({
          where: { sku },
          select: { sku: true, name: true }
        })
        if (inv) {
          sku = inv.sku
          if (!itemName) itemName = inv.name
        } else if (itemName) {
          isNewLine = true
          sku = ''
        } else {
          errors.push({
            sheet: sheetName,
            row: r + 1,
            error: `Unknown SKU "${sku}" and no description for new line`
          })
          continue
        }
      }

      if (isNewLine && !itemName) {
        errors.push({
          sheet: sheetName,
          row: r + 1,
          error: 'Description / item name required when SKU is empty or unknown'
        })
        continue
      }

      if (!itemName) itemName = sku

      rawRows.push({
        sheet: sheetName,
        rowNum: r + 1,
        locationId,
        sku: sku || null,
        itemName,
        countedQty: counted,
        isNewLine
      })
    }
  }

  const mergeMap = new Map()
  for (const row of rawRows) {
    const key = row.isNewLine
      ? `${row.locationId}|N:${normalizeName(row.itemName)}`
      : `${row.locationId}|S:${row.sku}`
    const prev = mergeMap.get(key)
    if (!prev) {
      mergeMap.set(key, {
        ...row,
        _rows: [row.rowNum]
      })
    } else {
      prev.countedQty += row.countedQty
      prev._rows.push(row.rowNum)
    }
  }

  const parsedRows = []
  for (const m of mergeMap.values()) {
    const rowLabel = m._rows.length > 1 ? m._rows.join(',') : String(m.rowNum)
    parsedRows.push({
      sheet: m.sheet,
      rowNum: rowLabel,
      locationId: m.locationId,
      sku: m.sku,
      itemName: m.itemName,
      countedQty: m.countedQty,
      systemQtyFile: null,
      unit: 'pcs',
      unitCost: 0,
      reorderPoint: 0,
      reorderQty: 0,
      supplierName: '',
      supplierPartNumbersJson: '[]',
      legacyPartNumber: '',
      manufacturingPartNumber: '',
      boxNumber: '',
      categoryRaw: '',
      itemTypeRaw: '',
      catalogNote: '',
      isNewLine: m.isNewLine
    })
  }

  return runStockCountImportPipeline(prisma, parsedRows, errors, options, req, {
    referencePrefix: 'Stock count import (by location)',
    batchIdPrefix: 'scloc'
  })
}
