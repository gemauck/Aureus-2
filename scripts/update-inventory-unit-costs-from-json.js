#!/usr/bin/env node
/**
 * Bulk-set catalog unit cost (InventoryItem.unitCost) by SKU.
 * Mirrors PATCH /api/manufacturing/inventory/:id unitCost behaviour for every row with that SKU.
 *
 * Usage:
 *   node scripts/update-inventory-unit-costs-from-json.js ./path/to/prices.json
 *   node scripts/update-inventory-unit-costs-from-json.js ./path/to/prices.csv --write
 *
 * Without --write, prints the plan only (no DB changes).
 *
 * JSON formats (UTF-8 file):
 *   [ { "sku": "SKU0006", "unitCost": 180 }, { "sku": "SKU0007", "unitCost": 95 } ]
 *   { "SKU0006": 180, "SKU0007": 95 }
 *
 * CSV (.csv or .tsv extension, UTF-8):
 *   Header row with sku + one of: unitCost, unit_cost, price, cost (case/spacing flexible).
 *   Or no header: column A = SKU, column B = price; or SKU in column A and price in the last
 *   column that parses as money (e.g. sku, name, unit, R180.00 from Excel).
 *   Delimiter auto: tab if the first line has more tabs than commas, else comma. Quoted fields OK.
 *
 * unitCost may be a number or a string like "R180.00", "R2,900.00", "180.50".
 * Omitted / null / "" skips that SKU (no change).
 */

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { prisma } from '../api/_lib/prisma.js'
import { computedInventoryTotalValue } from '../api/_lib/inventoryValue.js'
import { getStatusFromQuantity } from '../api/_lib/stockCountAdjustment.js'

function parseMoney(val) {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null
  }
  const s = String(val).trim()
  if (s === '') return null
  const cleaned = s.replace(/^[Rr]\s*/u, '').replace(/,/g, '').trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function normalizeSku(s) {
  return String(s || '').trim()
}

/**
 * @returns {Array<{ sku: string, unitCost: number }>}
 */
function entriesFromJson(data) {
  if (Array.isArray(data)) {
    const out = []
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const sku = normalizeSku(row.sku ?? row.SKU)
      const cost = parseMoney(row.unitCost ?? row.unit_cost ?? row.price ?? row.cost)
      if (!sku) continue
      if (cost === null) continue
      out.push({ sku, unitCost: cost })
    }
    return out
  }
  if (data && typeof data === 'object') {
    const out = []
    for (const [k, v] of Object.entries(data)) {
      const sku = normalizeSku(k)
      const cost = parseMoney(v)
      if (!sku) continue
      if (cost === null) continue
      out.push({ sku, unitCost: cost })
    }
    return out
  }
  throw new Error('JSON root must be an array of { sku, unitCost } or an object map SKU → number|string')
}

const SKU_HEADER_ALIASES = new Set(['sku', 'sku_code', 'code'])
const COST_HEADER_ALIASES = new Set(['unitcost', 'unit_cost', 'price', 'cost', 'new_price', 'catalog_price'])

function normHeaderCell(h) {
  return String(h || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function detectDelimiter(line) {
  const tabs = (line.match(/\t/g) || []).length
  const commas = (line.match(/,/g) || []).length
  return tabs > commas ? '\t' : ','
}

/** Split one CSV/TSV line; supports "quoted,fields" and doubled quotes. */
function splitDelimitedLine(line, delim) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQ = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQ = true
    } else if (c === delim) {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/**
 * @returns {Array<{ sku: string, unitCost: number }>}
 */
function entriesFromCsv(text, forceDelim = null) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
  if (lines.length === 0) return []

  const delim = forceDelim || detectDelimiter(lines[0])
  const split = (ln) => splitDelimitedLine(ln, delim)
  const firstCells = split(lines[0]).map((c) => c.trim())
  const norm = firstCells.map(normHeaderCell)

  let skuCol = -1
  let costCol = -1
  for (let i = 0; i < norm.length; i++) {
    if (SKU_HEADER_ALIASES.has(norm[i])) skuCol = i
    if (COST_HEADER_ALIASES.has(norm[i])) costCol = i
  }

  let dataStart = 0
  if (skuCol >= 0 && costCol >= 0) {
    dataStart = 1
  } else if (firstCells.length >= 2 && /^SKU/i.test(firstCells[0]) && parseMoney(firstCells[1]) !== null) {
    skuCol = 0
    costCol = 1
    dataStart = 0
  } else if (firstCells.length >= 2 && /^SKU/i.test(firstCells[0])) {
    skuCol = 0
    costCol = -1
    for (let j = firstCells.length - 1; j >= 1; j--) {
      if (parseMoney(firstCells[j]) !== null) {
        costCol = j
        break
      }
    }
    if (costCol < 0) {
      throw new Error(
        'CSV: could not find a price column. Use a header row (sku, unitCost) or put the price in the last numeric column.'
      )
    }
    dataStart = 0
  } else {
    throw new Error(
      'CSV: need a header row with columns sku + unitCost/price, or rows starting with SKU… and a parseable price.'
    )
  }

  const out = []
  for (let r = dataStart; r < lines.length; r++) {
    const cells = split(lines[r]).map((c) => c.trim())
    const sku = normalizeSku(cells[skuCol])
    const cost = parseMoney(cells[costCol])
    if (!sku) continue
    if (cost === null) continue
    out.push({ sku, unitCost: cost })
  }
  return out
}

function loadEntries(abs) {
  const ext = path.extname(abs).toLowerCase()
  if (ext === '.csv' || ext === '.tsv') {
    const text = fs.readFileSync(abs, 'utf8')
    return entriesFromCsv(text, ext === '.tsv' ? '\t' : null)
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'))
  return entriesFromJson(raw)
}

async function main() {
  const write = process.argv.includes('--write')
  const filePath = process.argv.slice(2).find((a) => a !== '--write')
  if (!filePath) {
    console.error(
      'Usage: node scripts/update-inventory-unit-costs-from-json.js <prices.json|prices.csv|prices.tsv> [--write]\n' +
        '  Omit --write for dry run (no changes).'
    )
    process.exit(1)
  }

  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  let entries
  try {
    entries = loadEntries(abs)
  } catch (e) {
    console.error(String(e?.message || e))
    process.exit(1)
  }
  if (entries.length === 0) {
    console.error('No SKU/cost pairs found (check columns and non-empty prices).')
    process.exit(1)
  }

  /** Last occurrence wins if the same SKU appears more than once. */
  const bySku = new Map()
  for (const e of entries) {
    bySku.set(e.sku, e.unitCost)
  }
  const unique = [...bySku.entries()].map(([sku, unitCost]) => ({ sku, unitCost }))

  const plan = []
  const missing = []

  for (const { sku, unitCost } of unique) {
    if (unitCost < 0) {
      console.error(`Invalid negative unitCost for ${sku}: ${unitCost}`)
      process.exit(1)
    }
    const items = await prisma.inventoryItem.findMany({
      where: { sku },
      select: { id: true, quantity: true, reorderPoint: true, unitCost: true, name: true }
    })
    if (!items.length) {
      missing.push(sku)
      continue
    }
    const locCount = await prisma.locationInventory.count({ where: { sku } })
    plan.push({
      sku,
      unitCost,
      inventoryRows: items.length,
      locationRows: locCount,
      beforeCosts: [...new Set(items.map((i) => Number(i.unitCost) || 0))].join(', '),
      nameSample: items[0]?.name || ''
    })
  }

  console.log(JSON.stringify({ dryRun: !write, file: abs, toApply: plan.length, missingSkus: missing }, null, 2))
  for (const row of plan) {
    console.log(
      `${row.sku} → R${row.unitCost.toFixed(2)} (${row.inventoryRows} InventoryItem, ${row.locationRows} LocationInventory; was: ${row.beforeCosts}) ${row.nameSample}`
    )
  }
  if (missing.length) {
    console.warn('SKUs not found in DB:', missing.join(', '))
  }

  if (!write) {
    console.log('\nDry run only. Re-run with --write to apply.')
    return
  }

  let applied = 0
  for (const { sku, unitCost } of unique) {
    const items = await prisma.inventoryItem.findMany({ where: { sku } })
    if (!items.length) continue

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const qty = Number(item.quantity) || 0
        const rp = Number(item.reorderPoint) || 0
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            unitCost,
            totalValue: computedInventoryTotalValue(qty, unitCost),
            status: getStatusFromQuantity(qty, rp)
          }
        })
      }
    })
    applied++
  }

  console.log(JSON.stringify({ appliedSkus: applied }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
