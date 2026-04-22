import XLSX from 'xlsx'
import {
  applyStockCountAdjustmentTx,
  allocateStockCountSkuTx
} from './stockCountAdjustment.js'

function normalizeStockCountName(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function parseStockCountDecimal(val) {
  if (val == null || val === '') return null
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  let s = String(val).trim().replace(/\s/g, '')
  if (!s) return null
  if (!/\.\d/.test(s) && /,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function buildSupplierPartNumbersJson(supplierName, partNumber) {
  const s = String(supplierName || '').trim()
  const p = String(partNumber || '').trim()
  if (!s || !p) return '[]'
  return JSON.stringify([{ supplier: s, partNumber: p }])
}

async function createZeroStockNewLineTx(tx, sku, pr) {
  const status = 'out_of_stock'
  const existingLi = await tx.locationInventory.findUnique({
    where: { locationId_sku: { locationId: pr.locationId, sku } }
  })
  if (!existingLi) {
    await tx.locationInventory.create({
      data: {
        locationId: pr.locationId,
        sku,
        itemName: pr.itemName,
        quantity: 0,
        unitCost: pr.unitCost ?? 0,
        reorderPoint: pr.reorderPoint ?? 0,
        status
      }
    })
  }

  const existingItem = await tx.inventoryItem.findFirst({
    where: { sku, locationId: pr.locationId },
    select: { id: true }
  })
  if (!existingItem) {
    await tx.inventoryItem.create({
      data: {
        sku,
        name: pr.itemName,
        category: pr.categoryRaw || 'components',
        type: pr.itemTypeRaw || 'component',
        quantity: 0,
        unit: pr.unit || 'pcs',
        reorderPoint: pr.reorderPoint ?? 0,
        reorderQty: pr.reorderQty ?? 0,
        location: '',
        unitCost: pr.unitCost ?? 0,
        totalValue: 0,
        supplier: pr.supplierName || '',
        status,
        legacyPartNumber: pr.legacyPartNumber || '',
        supplierPartNumbers: pr.supplierPartNumbersJson || '[]',
        locationId: pr.locationId,
        manufacturingPartNumber: pr.manufacturingPartNumber || '',
        boxNumber: pr.boxNumber || '',
        needsCatalogReview: true
      }
    })
  }
}

/**
 * Shared apply path after rows are parsed (template or location-based workbook).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object[]} parsedRows
 * @param {object[]} errors
 * @param {{ dryRun: boolean, forceCreateDuplicate: boolean, includeZeroNewItems?: boolean }} options
 * @param {object} req
 * @param {{ referencePrefix?: string, batchIdPrefix?: string }} [pipelineOpts]
 */
export async function runStockCountImportPipeline(
  prisma,
  parsedRows,
  errors,
  options,
  req,
  pipelineOpts = {}
) {
  const { dryRun, forceCreateDuplicate, includeZeroNewItems = false } = options
  const referencePrefix = pipelineOpts.referencePrefix || 'Stock count import'
  const batchIdPrefix = pipelineOpts.batchIdPrefix || 'sc'

  const allItems = await prisma.inventoryItem.findMany({
    select: { sku: true, name: true },
    orderBy: { updatedAt: 'desc' }
  })
  const nameToSkus = new Map()
  for (const it of allItems) {
    const k = normalizeStockCountName(it.name)
    if (!k) continue
    if (!nameToSkus.has(k)) nameToSkus.set(k, [])
    nameToSkus.get(k).push({ sku: it.sku, name: it.name })
  }

  const duplicateCandidates = []
  const fileInternalDuplicates = []
  const newLineKeys = new Map()

  for (const pr of parsedRows) {
    if (!pr.isNewLine) continue
    const nk = `${pr.locationId}|${normalizeStockCountName(pr.itemName)}`
    if (newLineKeys.has(nk)) {
      fileInternalDuplicates.push({
        locationId: pr.locationId,
        itemName: pr.itemName,
        rows: [newLineKeys.get(nk), pr.rowNum]
      })
    } else {
      newLineKeys.set(nk, pr.rowNum)
    }

    const nameKey = normalizeStockCountName(pr.itemName)
    const matches = nameKey ? nameToSkus.get(nameKey) : null
    if (matches && matches.length) {
      duplicateCandidates.push({
        type: 'existing_name',
        locationId: pr.locationId,
        itemName: pr.itemName,
        existing: matches
      })
    }
  }

  if (dryRun) {
    const preview = []
    for (const pr of parsedRows) {
      if (pr.isNewLine) {
        preview.push({
          ...pr,
          proposedSku: '(allocated on apply)',
          delta: pr.countedQty
        })
      } else {
        const li = await prisma.locationInventory.findUnique({
          where: { locationId_sku: { locationId: pr.locationId, sku: pr.sku } }
        })
        const current = li?.quantity ?? 0
        const delta = pr.countedQty - current
        preview.push({
          ...pr,
          currentQty: current,
          delta,
          staleFile:
            pr.systemQtyFile !== null && Math.abs(pr.systemQtyFile - current) > 0.0001
        })
      }
    }
    const dryPayload = {
      dryRun: true,
      blocked: false,
      duplicateCandidates,
      fileInternalDuplicates,
      errors,
      preview,
      movementsWouldCreate: preview.filter((p) => Math.abs(p.delta || 0) > 0.0001).length
    }
    return { kind: 'dry', payload: dryPayload }
  }

  if (!forceCreateDuplicate && duplicateCandidates.length) {
    return {
      kind: 'badRequest',
      message:
        'Possible duplicate catalog names. Run dry run to review duplicateCandidates, or pass forceCreateDuplicate: true.'
    }
  }

  if (fileInternalDuplicates.length && !forceCreateDuplicate) {
    return {
      kind: 'badRequest',
      message:
        'Duplicate new lines in file (same location + name). Fix the sheet or pass forceCreateDuplicate: true.'
    }
  }

  const importRef = `${referencePrefix} ${new Date().toISOString().slice(0, 10)}`
  const batchId = `${batchIdPrefix}-${Date.now()}`

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '180s'`
      let movementsCreated = 0
      let skipped = 0
      const applied = []
      const localNameKeys = new Set()

      for (const pr of parsedRows) {
        if (pr.isNewLine) {
          const nk = `${pr.locationId}|${normalizeStockCountName(pr.itemName)}`
          if (localNameKeys.has(nk)) {
            skipped++
            continue
          }
          localNameKeys.add(nk)
        }

        let sku = pr.sku
        if (pr.isNewLine) {
          sku = await allocateStockCountSkuTx(tx)
        }

        const li = await tx.locationInventory.findUnique({
          where: { locationId_sku: { locationId: pr.locationId, sku } }
        })
        const currentQty = li?.quantity ?? 0
        const delta = pr.countedQty - currentQty
        if (Math.abs(delta) < 0.0001) {
          if (pr.isNewLine && includeZeroNewItems) {
            await createZeroStockNewLineTx(tx, sku, pr)
            applied.push({
              sku,
              delta: 0,
              movementId: null,
              isNewLine: true,
              createdWithoutMovement: true
            })
            continue
          }
          skipped++
          continue
        }

        const noteExtra = pr.catalogNote ? ` | ${String(pr.catalogNote).slice(0, 400)}` : ''
        const { movement } = await applyStockCountAdjustmentTx(tx, {
          req,
          sku,
          itemName: pr.itemName,
          quantityDelta: delta,
          locationId: pr.locationId,
          reference: importRef,
          notes: `${importRef} sheet=${pr.sheet} row=${pr.rowNum}${pr.isNewLine ? ` autoSku=${sku}` : ''}${noteExtra}`,
          unitCost: pr.unitCost,
          reorderPoint: pr.reorderPoint,
          reorderQty: pr.reorderQty,
          unit: pr.unit,
          category: pr.categoryRaw,
          itemType: pr.itemTypeRaw,
          supplier: pr.supplierName,
          supplierPartNumbers: pr.supplierPartNumbersJson,
          legacyPartNumber: pr.legacyPartNumber,
          manufacturingPartNumber: pr.manufacturingPartNumber,
          boxNumber: pr.boxNumber,
          needsCatalogReview: pr.isNewLine,
          importDate: new Date()
        })
        if (movement) {
          movementsCreated++
          applied.push({
            sku,
            delta,
            movementId: movement.movementId,
            isNewLine: pr.isNewLine
          })
        }
      }

      return { movementsCreated, skipped, applied }
    },
    {
      maxWait: 60000,
      timeout: 180000
    }
  )

  return {
    kind: 'ok',
    data: {
      batchId,
      movementsCreated: result.movementsCreated,
      skipped: result.skipped,
      applied: result.applied,
      duplicateCandidates,
      fileInternalDuplicates,
      errors
    }
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Buffer} buffer
 * @param {{ dryRun: boolean, forceCreateDuplicate: boolean, includeZeroNewItems?: boolean }} options
 * @param {object} req - request with user (for movements + audit)
 * @returns {Promise<{ kind: 'dry', payload: object } | { kind: 'badRequest', message: string } | { kind: 'ok', data: object }>}
 */
export async function runStockCountTemplateImport(prisma, buffer, options, req) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const normHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, '')

  const headerAliases = {
    locationid: 'locationId',
    locationcode: 'locationCode',
    locationname: 'locationName',
    sku: 'sku',
    itemname: 'itemName',
    partname: 'itemName',
    systemqty: 'systemQty',
    quantity: 'systemQty',
    unit: 'unit',
    unitcost: 'unitCost',
    reorderpoint: 'reorderPoint',
    status: 'status',
    locationinventoryid: 'locationInventoryId',
    countedqty: 'countedQty',
    qtycounted: 'countedQty',
    category: 'category',
    type: 'itemType',
    itemtype: 'itemType',
    boxnumber: 'boxNumber',
    legacypartnumber: 'legacyPartNumber',
    abcotronicspartnumber: 'legacyPartNumber',
    manufacturingpartnumber: 'manufacturingPartNumber',
    suppliername: 'supplierName',
    supplierpartnumber: 'supplierPartNumber',
    abconame: 'abcoName',
    reorderqty: 'reorderQty',
    catalognote: 'catalogNote',
    itemnote: 'catalogNote',
    notes: 'catalogNote'
  }

  function mapHeaderRow(row) {
    const col = {}
    row.forEach((cell, i) => {
      const raw = normHeader(cell)
      const key = headerAliases[raw] || raw
      if (key) col[key] = i
    })
    return col
  }

  const locations = await prisma.stockLocation.findMany({
    where: { status: 'active' },
    select: { id: true, code: true, name: true }
  })
  const validLocIds = new Set(locations.map((l) => l.id))

  const parsedRows = []
  const errors = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (!aoa.length) continue
    const col = mapHeaderRow(aoa[0])
    if (col.locationId === undefined) {
      errors.push({ sheet: sheetName, error: 'Missing LocationId column' })
      continue
    }

    for (let r = 1; r < aoa.length; r++) {
      const line = aoa[r]
      if (!line || !line.length) continue
      const locationId = String(line[col.locationId] ?? '').trim()
      if (!locationId) continue
      const countedRaw = col.countedQty !== undefined ? line[col.countedQty] : ''
      const counted = parseStockCountDecimal(countedRaw)
      if (countedRaw === '' || countedRaw === null || counted === null || counted === undefined) {
        continue
      }

      let sku = col.sku !== undefined ? String(line[col.sku] ?? '').trim() : ''
      const rawItem = col.itemName !== undefined ? String(line[col.itemName] ?? '').trim() : ''
      const rawAbco = col.abcoName !== undefined ? String(line[col.abcoName] ?? '').trim() : ''
      const rawLegacy = col.legacyPartNumber !== undefined ? String(line[col.legacyPartNumber] ?? '').trim() : ''

      let itemName = rawItem || rawAbco
      let legacyPartNumber = rawLegacy
      if (!legacyPartNumber && rawAbco && rawItem && rawAbco !== rawItem) {
        legacyPartNumber = rawAbco
      }

      if (!sku && !itemName) {
        errors.push({ sheet: sheetName, row: r + 1, error: 'ItemName required when SKU is empty' })
        continue
      }

      const systemQtyFile =
        col.systemQty !== undefined ? parseStockCountDecimal(line[col.systemQty]) : null

      const unit = col.unit !== undefined ? String(line[col.unit] ?? '').trim() || 'pcs' : 'pcs'
      const unitCost = col.unitCost !== undefined ? parseStockCountDecimal(line[col.unitCost]) : null
      const reorderPointVal =
        col.reorderPoint !== undefined ? parseStockCountDecimal(line[col.reorderPoint]) : null
      const reorderQtyVal =
        col.reorderQty !== undefined ? parseStockCountDecimal(line[col.reorderQty]) : null

      const supplierName =
        col.supplierName !== undefined ? String(line[col.supplierName] ?? '').trim() : ''
      const supplierPartNum =
        col.supplierPartNumber !== undefined ? String(line[col.supplierPartNumber] ?? '').trim() : ''
      const supplierPartNumbersJson = buildSupplierPartNumbersJson(supplierName, supplierPartNum)

      const categoryRaw =
        col.category !== undefined ? String(line[col.category] ?? '').trim() : ''
      const itemTypeRaw =
        col.itemType !== undefined ? String(line[col.itemType] ?? '').trim() : ''
      const boxNumber = col.boxNumber !== undefined ? String(line[col.boxNumber] ?? '').trim() : ''
      const manufacturingPartNumber =
        col.manufacturingPartNumber !== undefined
          ? String(line[col.manufacturingPartNumber] ?? '').trim()
          : ''
      const catalogNote =
        col.catalogNote !== undefined ? String(line[col.catalogNote] ?? '').trim() : ''

      if (!validLocIds.has(locationId)) {
        errors.push({ sheet: sheetName, row: r + 1, error: `Unknown LocationId ${locationId}` })
        continue
      }

      const isNewLine = !sku
      parsedRows.push({
        sheet: sheetName,
        rowNum: r + 1,
        locationId,
        sku: sku || null,
        itemName: itemName || sku,
        countedQty: counted,
        systemQtyFile: systemQtyFile ?? null,
        unit,
        unitCost: unitCost ?? 0,
        reorderPoint: reorderPointVal ?? 0,
        reorderQty: reorderQtyVal ?? 0,
        supplierName,
        supplierPartNumbersJson,
        legacyPartNumber,
        manufacturingPartNumber,
        boxNumber,
        categoryRaw,
        itemTypeRaw,
        catalogNote,
        isNewLine
      })
    }
  }

  return runStockCountImportPipeline(prisma, parsedRows, errors, options, req, {
    referencePrefix: 'Stock count import',
    batchIdPrefix: 'sc'
  })
}
