#!/usr/bin/env node
/**
 * Import a filled PMB-only stock-count sheet (SKU + ItemName + Count Qty columns)
 * into PIETERMARITZBURG OFFICE (01_LOC1) via the standard stock-count delta pipeline.
 *
 * Usage:
 *   node scripts/import-pmb-filled-stock-count-sheet.mjs "/path/to/file.xlsx" [--dry-run] [--movement-date=2026-06-05T16:00:00+02:00]
 */
import dotenv from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { runStockCountImportPipeline, parseStockCountDecimal } from '../api/_lib/stockCountTemplateImport.js'
import { prisma } from '../api/_lib/prisma.js'
import { logAuditFromRequest } from '../api/_lib/manufacturingAuditLog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const PMB_LOC = 'cmlgo8w1z0000zvy5mwo8wc8k'
const PMB_CODE = '01_LOC1'
const EPS = 0.001

function parseArgs(argv) {
  const flags = argv.filter((a) => a.startsWith('--'))
  const files = argv.filter((a) => !a.startsWith('--'))
  const movementDateArg = flags.find((f) => f.startsWith('--movement-date='))
  return {
    filePath: files[0] || '',
    dryRun: flags.includes('--dry-run'),
    skipPreflight: flags.includes('--skip-preflight'),
    movementDate: movementDateArg
      ? new Date(movementDateArg.replace('--movement-date=', '').trim())
      : new Date('2026-06-05T16:00:00+02:00')
  }
}

function assertNoFileSkuDuplicates(parsedRows) {
  const seen = new Map()
  const dups = []
  for (const row of parsedRows) {
    if (!row.sku) continue
    if (seen.has(row.sku)) dups.push({ sku: row.sku, rows: [seen.get(row.sku), row.rowNum] })
    else seen.set(row.sku, row.rowNum)
  }
  if (dups.length) {
    throw new Error(`File has duplicate SKUs (${dups.length}). Fix the sheet first.`)
  }
}

/** Per-location ledger check for 01_LOC1 only (pre/post import). */
async function verifyPmbLedger() {
  const loc = await prisma.stockLocation.findFirst({
    where: { OR: [{ id: PMB_LOC }, { code: PMB_CODE }] },
    select: { id: true, code: true }
  })
  if (!loc) throw new Error('PMB location not found')
  const code = String(loc.code || '').trim()
  const liRows = await prisma.locationInventory.findMany({
    where: { locationId: loc.id },
    select: { sku: true, quantity: true }
  })
  const movements = await prisma.stockMovement.findMany({ select: { sku: true, quantity: true, type: true, fromLocation: true, toLocation: true } })
  const bySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    if (!bySku.has(sku)) bySku.set(sku, [])
    bySku.get(sku).push(m)
  }
  const matches = (locVal) => !!locVal && (locVal === loc.id || locVal === code)
  let mismatched = 0
  for (const li of liRows) {
    const sku = String(li.sku || '').trim()
    let net = 0
    for (const m of bySku.get(sku) || []) {
      const t = String(m.type || '').toLowerCase()
      if (t === 'transfer') {
        const q = Math.abs(parseFloat(m.quantity) || 0)
        if (matches(m.toLocation) && !matches(m.fromLocation)) net += q
        else if (matches(m.fromLocation) && !matches(m.toLocation)) net -= q
      } else if (matches(m.fromLocation) || matches(m.toLocation)) {
        const q = parseFloat(m.quantity) || 0
        if (t === 'receipt') net += Math.abs(q)
        else if (t === 'production' || t === 'consumption' || t === 'sale' || t === 'supplier_return' || t === 'issue') net -= Math.abs(q)
        else net += q
      }
    }
    if (Math.abs(net - (parseFloat(li.quantity) || 0)) > EPS) mismatched++
  }
  return { ok: mismatched === 0, mismatchedCount: mismatched, locationCode: code }
}

function buildParsedRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames.find((n) => n.startsWith('01_LOC1')) || wb.SheetNames[0]
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  if (!aoa.length) throw new Error('Empty workbook')
  const hdr = aoa[0].map((h) =>
    String(h ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
  )
  const col = {}
  hdr.forEach((h, i) => {
    col[h] = i
  })
  if (col.countqty === undefined && col.countedqty === undefined) {
    throw new Error('Missing Count Qty / CountedQty column')
  }
  const qtyKey = col.countqty !== undefined ? 'countqty' : 'countedqty'

  const parsedRows = []
  for (let r = 1; r < aoa.length; r++) {
    const line = aoa[r]
    const sku = col.sku !== undefined ? String(line[col.sku] ?? '').trim() : ''
    const itemName = col.itemname !== undefined ? String(line[col.itemname] ?? '').trim() : ''
    if (!sku && !itemName) continue
    const countedRaw = line[col[qtyKey]]
    if (countedRaw === '' || countedRaw == null) continue
    const counted = parseStockCountDecimal(countedRaw)
    if (counted === null || counted === undefined) continue
    parsedRows.push({
      sheet: sheetName,
      rowNum: r + 1,
      locationId: PMB_LOC,
      sku: sku || null,
      itemName: itemName || sku,
      countedQty: counted,
      systemQtyFile: null,
      unit: 'pcs',
      unitCost: col.unitcost !== undefined ? (parseStockCountDecimal(line[col.unitcost]) ?? 0) : 0,
      reorderPoint: 0,
      reorderQty: 0,
      supplierName: '',
      supplierPartNumbersJson: '[]',
      legacyPartNumber: '',
      manufacturingPartNumber: '',
      boxNumber: col.boxnumber !== undefined ? String(line[col.boxnumber] ?? '').trim() : '',
      categoryRaw: '',
      itemTypeRaw: '',
      catalogNote: '',
      isNewLine: !sku
    })
  }
  return parsedRows
}

async function main() {
  const { filePath, dryRun, skipPreflight, movementDate } = parseArgs(process.argv.slice(2))
  if (!filePath) {
    console.error(
      'Usage: node scripts/import-pmb-filled-stock-count-sheet.mjs "/path/to/file.xlsx" [--dry-run] [--movement-date=ISO]'
    )
    process.exit(1)
  }
  const resolved = resolve(filePath)
  if (!existsSync(resolved)) {
    console.error('File not found:', resolved)
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const parsedRows = buildParsedRows(readFileSync(resolved))
  assertNoFileSkuDuplicates(parsedRows)

  if (!dryRun && !skipPreflight) {
    const ledgerBefore = await verifyPmbLedger()
    if (!ledgerBefore.ok) {
      throw new Error(
        `Pre-import ledger imbalance at ${ledgerBefore.locationCode}: ${ledgerBefore.mismatchedCount} row(s). Fix ledger first or pass --skip-preflight.`
      )
    }
    const preflight = await runStockCountImportPipeline(
      prisma,
      parsedRows,
      [],
      { dryRun: true, forceCreateDuplicate: false },
      { user: { name: 'preflight', role: 'admin' } },
      { referencePrefix: 'PMB stock count May 2026', batchIdPrefix: 'pmb-sc-may26' }
    )
    const p = preflight.payload
    if (p.duplicateCandidates.length || p.fileInternalDuplicates.length || p.blocked) {
      throw new Error(
        `Preflight blocked: duplicateCandidates=${p.duplicateCandidates.length}, fileInternalDuplicates=${p.fileInternalDuplicates.length}`
      )
    }
    if (p.preview.filter((x) => x.isNewLine).length) {
      throw new Error('Preflight blocked: file contains new lines without SKU (would create catalog duplicates).')
    }
  }

  const actor =
    (await prisma.user.findFirst({
      where: { role: { in: ['admin', 'administrator', 'superadmin'] } },
      select: { id: true, name: true, role: true }
    })) ||
    (await prisma.user.findFirst({ select: { id: true, name: true, role: true } }))

  const mockReq = {
    method: 'POST',
    headers: {},
    user: actor
      ? { sub: actor.id, id: actor.id, name: actor.name || 'PMB stock count CLI', role: actor.role || 'admin' }
      : { sub: 'cli-pmb-sc', id: 'cli-pmb-sc', name: 'PMB stock count CLI', role: 'admin' }
  }

  const outcome = await runStockCountImportPipeline(
    prisma,
    parsedRows,
    [],
    { dryRun, forceCreateDuplicate: false },
    mockReq,
    {
      referencePrefix: 'PMB stock count May 2026',
      batchIdPrefix: 'pmb-sc-may26',
      importDate: movementDate,
      transactionTimeoutMs: 900000
    }
  )

  if (outcome.kind === 'badRequest') {
    console.error('Blocked:', outcome.message)
    process.exit(1)
  }

  if (outcome.kind === 'dry') {
    const p = outcome.payload
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          parsedRows: parsedRows.length,
          movementsWouldCreate: p.movementsWouldCreate,
          skippedNoDelta: p.preview.length - p.movementsWouldCreate,
          newLines: p.preview.filter((x) => x.isNewLine).length,
          duplicateCandidates: p.duplicateCandidates.length,
          fileInternalDuplicates: p.fileInternalDuplicates.length,
          blocked: p.blocked
        },
        null,
        2
      )
    )
    return
  }

  if (actor) {
    void logAuditFromRequest(prisma, mockReq, {
      action: 'create',
      entity: 'manufacturing',
      entityId: outcome.data.batchId,
      details: {
        resource: 'stock-count-import',
        summary: `PMB stock count: ${outcome.data.movementsCreated} movements, ${outcome.data.skipped} skipped`,
        movementsCreated: outcome.data.movementsCreated,
        skipped: outcome.data.skipped,
        movementDate: movementDate.toISOString()
      }
    })
  }

  const ledgerAfter = await verifyPmbLedger()
  const dupRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM (
       SELECT sku FROM "InventoryItem" WHERE "locationId" = $1 GROUP BY sku HAVING COUNT(*) > 1
     ) t`,
    PMB_LOC
  )

  console.log(
    JSON.stringify(
      {
        applied: true,
        batchId: outcome.data.batchId,
        movementsCreated: outcome.data.movementsCreated,
        skipped: outcome.data.skipped,
        movementDate: movementDate.toISOString(),
        ledgerOk: ledgerAfter.ok,
        ledgerMismatches: ledgerAfter.mismatchedCount,
        pmbDuplicateSkuGroups: dupRows[0]?.c ?? 0
      },
      null,
      2
    )
  )

  if (!ledgerAfter.ok) {
    throw new Error(`Post-import ledger imbalance: ${ledgerAfter.mismatchedCount} row(s) at ${ledgerAfter.locationCode}`)
  }
}

main()
  .catch((e) => {
    console.error(e.message || e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
