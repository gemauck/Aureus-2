#!/usr/bin/env node
/**
 * For each SKU in an inventory differences CSV, fetch StockMovement rows between
 * --from and --to (inclusive on `StockMovement.date`) and write:
 *   - detail CSV (every movement)
 *   - summary-by-SKU CSV (aggregates + performedBy / type splits + vs Excel delta)
 *
 * Usage:
 *   node scripts/audit-stock-movements-for-sku-diff-window.mjs --csv /path/to/differences.csv
 *   node scripts/audit-stock-movements-for-sku-diff-window.mjs --from 2026-04-30 --to 2026-05-12
 *
 * CSV must have a `sku` column (as produced by manufacturing_inventory_apr30_vs_may12_differences.csv).
 *
 * Date args: YYYY-MM-DD interpreted as UTC start/end of day.
 */
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { createReadStream, mkdirSync, writeFileSync, existsSync } from 'fs'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { dirname, resolve, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const prisma = new PrismaClient()

function parseArgs(argv) {
  const out = { from: null, to: null, csv: null, useCreatedAt: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--csv' && argv[i + 1]) out.csv = argv[++i]
    else if (a === '--from' && argv[i + 1]) out.from = argv[++i]
    else if (a === '--to' && argv[i + 1]) out.to = argv[++i]
    else if (a === '--use-created-at') out.useCreatedAt = true
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function utcDayStart(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0))
}

function utcDayEnd(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
}

/** Split CSV line respecting double-quoted fields */
function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuote = true
    } else if (c === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur)
  return cells
}

async function readDiffCsv(filePath) {
  const rows = []
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  let header = null
  let colIndex = {}
  for await (const line of rl) {
    if (!line.trim()) continue
    const cells = parseCsvLine(line)
    if (!header) {
      header = cells.map((h) => String(h).trim())
      header.forEach((h, i) => {
        colIndex[h] = i
      })
      if (colIndex.sku === undefined) {
        throw new Error(`CSV missing "sku" column. Found: ${header.join(', ')}`)
      }
      continue
    }
    const get = (name) => {
      const i = colIndex[name]
      return i === undefined ? '' : cells[i] ?? ''
    }
    rows.push({
      sku: String(get('sku') || '').trim(),
      name: String(get('name') || '').trim(),
      qty_2026_04_30: String(get('qty_2026_04_30') || '').trim(),
      qty_2026_05_12: String(get('qty_2026_05_12') || '').trim(),
      delta_may_minus_apr: String(get('delta_may_minus_apr') || '').trim(),
      note: String(get('note') || '').trim()
    })
  }
  return rows.filter((r) => r.sku)
}

function csvEscape(s) {
  const t = String(s ?? '')
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

function defaultCsvPath() {
  const repoRoot = resolve(__dirname, '..')
  const candidates = [
    process.env.INVENTORY_DIFF_CSV,
    join(repoRoot, 'reports', 'manufacturing_inventory_apr30_vs_may12_differences.csv'),
    join(homedir(), 'Downloads', 'manufacturing_inventory_apr30_vs_may12_differences.csv')
  ].filter(Boolean)
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function numOrNull(s) {
  if (s === '' || s === undefined || s === null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log(`Usage:
  node scripts/audit-stock-movements-for-sku-diff-window.mjs [--csv path] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--use-created-at]

Env: INVENTORY_DIFF_CSV=path  (optional; else tries reports/… and ~/Downloads/…)
`)
    process.exit(0)
  }

  const csvPath = args.csv || defaultCsvPath()
  if (!csvPath) {
    console.error(
      'No differences CSV found. Pass --csv path or set INVENTORY_DIFF_CSV, or place manufacturing_inventory_apr30_vs_may12_differences.csv in reports/ or Downloads/.'
    )
    process.exit(1)
  }

  const fromIso = args.from || '2026-04-30'
  const toIso = args.to || '2026-05-12'
  const fromDate = utcDayStart(fromIso)
  const toDate = utcDayEnd(toIso)

  console.log('CSV:', csvPath)
  console.log('Window (UTC):', fromDate.toISOString(), '→', toDate.toISOString())
  console.log('Filter field:', args.useCreatedAt ? 'createdAt' : 'date')

  const diffRows = await readDiffCsv(csvPath)
  const skus = [...new Set(diffRows.map((r) => r.sku))]
  console.log('Unique SKUs from CSV:', skus.length)

  const diffBySku = new Map()
  for (const r of diffRows) {
    diffBySku.set(r.sku, r)
  }

  const dateFilter = args.useCreatedAt
    ? { createdAt: { gte: fromDate, lte: toDate } }
    : { date: { gte: fromDate, lte: toDate } }

  const movements = await prisma.stockMovement.findMany({
    where: {
      sku: { in: skus },
      ...dateFilter
    },
    orderBy: [{ sku: 'asc' }, { date: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      movementId: true,
      date: true,
      createdAt: true,
      type: true,
      itemName: true,
      sku: true,
      quantity: true,
      fromLocation: true,
      toLocation: true,
      reference: true,
      performedBy: true,
      notes: true
    }
  })

  console.log('StockMovement rows in window:', movements.length)

  const bySku = new Map()
  for (const sku of skus) {
    bySku.set(sku, {
      movements: [],
      sumQty: 0,
      byPerformer: new Map(),
      byType: new Map(),
      nonSystemSum: 0,
      systemSum: 0
    })
  }
  for (const m of movements) {
    const b = bySku.get(m.sku)
    if (!b) continue
    b.movements.push(m)
    const q = Number(m.quantity) || 0
    b.sumQty += q
    const perf = String(m.performedBy || '').trim()
    const perfKey = perf || '(blank)'
    b.byPerformer.set(perfKey, (b.byPerformer.get(perfKey) || 0) + q)
    const typ = String(m.type || '').trim() || '(blank)'
    b.byType.set(typ, (b.byType.get(typ) || 0) + q)
    const isSystem = !perf || perf.toLowerCase() === 'system'
    if (isSystem) b.systemSum += q
    else b.nonSystemSum += q
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const repoReports = resolve(__dirname, '..', 'reports')
  mkdirSync(repoReports, { recursive: true })
  const detailPath = join(repoReports, `stock-movement-audit-detail-${stamp}.csv`)
  const summaryPath = join(repoReports, `stock-movement-audit-summary-by-sku-${stamp}.csv`)

  const detailHeader = [
    'sku',
    'movementId',
    'date',
    'createdAt',
    'type',
    'quantity',
    'performedBy',
    'reference',
    'notes',
    'itemName',
    'fromLocation',
    'toLocation',
    'id'
  ]
  const detailLines = [detailHeader.join(',')]
  for (const m of movements) {
    detailLines.push(
      [
        csvEscape(m.sku),
        csvEscape(m.movementId),
        csvEscape(m.date?.toISOString?.() ?? m.date),
        csvEscape(m.createdAt?.toISOString?.() ?? m.createdAt),
        csvEscape(m.type),
        csvEscape(m.quantity),
        csvEscape(m.performedBy),
        csvEscape(m.reference),
        csvEscape(m.notes),
        csvEscape(m.itemName),
        csvEscape(m.fromLocation),
        csvEscape(m.toLocation),
        csvEscape(m.id)
      ].join(',')
    )
  }
  writeFileSync(detailPath, detailLines.join('\n'), 'utf8')

  const summaryHeader = [
    'sku',
    'name_from_diff_csv',
    'note_from_diff_csv',
    'qty_apr_from_csv',
    'qty_may_from_csv',
    'delta_excel_may_minus_apr',
    'movement_row_count',
    'sum_movement_quantity_in_window',
    'sum_qty_non_system_performed_by',
    'sum_qty_system_or_blank_performer',
    'delta_minus_movement_sum',
    'match_flag',
    'performer_breakdown',
    'type_breakdown'
  ]
  const summaryLines = [summaryHeader.join(',')]

  function mapToJson(m) {
    return JSON.stringify(Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))))
  }

  for (const sku of skus.sort()) {
    const dr = diffBySku.get(sku) || {}
    const b = bySku.get(sku)
    const excelDelta = numOrNull(dr.delta_may_minus_apr)
    const sumMov = b.sumQty
    let deltaMinusMov = null
    if (excelDelta !== null && Number.isFinite(sumMov)) {
      deltaMinusMov = excelDelta - sumMov
    }
    let matchFlag = ''
    if (b.movements.length === 0) matchFlag = 'NO_MOVEMENTS_IN_WINDOW'
    else if (excelDelta !== null && Math.abs(excelDelta - sumMov) < 0.0001) matchFlag = 'SUM_MATCHES_EXCEL_DELTA'
    else if (excelDelta !== null) matchFlag = 'SUM_DIFFERS_FROM_EXCEL_DELTA'
    else matchFlag = 'EXCEL_DELTA_N_A'

    summaryLines.push(
      [
        csvEscape(sku),
        csvEscape(dr.name),
        csvEscape(dr.note),
        csvEscape(dr.qty_2026_04_30),
        csvEscape(dr.qty_2026_05_12),
        csvEscape(dr.delta_may_minus_apr),
        csvEscape(b.movements.length),
        csvEscape(sumMov),
        csvEscape(b.nonSystemSum),
        csvEscape(b.systemSum),
        csvEscape(deltaMinusMov === null ? '' : deltaMinusMov),
        csvEscape(matchFlag),
        csvEscape(mapToJson(b.byPerformer)),
        csvEscape(mapToJson(b.byType))
      ].join(',')
    )
  }
  writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8')

  console.log('Wrote:', detailPath)
  console.log('Wrote:', summaryPath)

  const match = summaryLines.slice(1).filter((l) => l.includes('SUM_MATCHES_EXCEL_DELTA')).length
  const differ = summaryLines.slice(1).filter((l) => l.includes('SUM_DIFFERS_FROM_EXCEL_DELTA')).length
  const none = summaryLines.slice(1).filter((l) => l.includes('NO_MOVEMENTS_IN_WINDOW')).length
  console.log('Summary flags — MATCH:', match, 'DIFFER:', differ, 'NO_MOVEMENTS:', none)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
