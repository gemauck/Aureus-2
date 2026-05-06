#!/usr/bin/env node
/**
 * Read-only: compare live DB on-hand at the PMB office to an Excel list (sku, name, quantity).
 * No database writes. Uses the same PMB resolution as apply-stock-take-from-xlsx.mjs.
 *
 * Usage:
 *   node scripts/compare-inventory-to-xlsx-pmb.mjs "/path/to/file.xlsx"
 *   node scripts/compare-inventory-to-xlsx-pmb.mjs "/path/to/file.xlsx" --csv
 *
 * Env:
 *   STOCK_TAKE_LOCATION_CODE - default PMB (same heuristics as import script)
 */
import dotenv from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { prisma } from '../api/_lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const LOCATION_CODE =
  process.env.STOCK_TAKE_LOCATION_CODE?.trim().toUpperCase() || 'PMB'

function isPmbOfficeLocation(loc) {
  const code = String(loc.code || '').trim().toUpperCase()
  const name = String(loc.name || '').trim().toUpperCase()
  if (code === 'PMB') return true
  if (name === 'PMB') return true
  if (name.startsWith('PMB ')) return true
  if (name.includes('PIETERMARITZBURG')) return true
  return false
}

async function resolveLocationByCode(client, code) {
  const c = String(code || 'PMB').trim()
  const upper = c.toUpperCase()
  const loc = await client.stockLocation.findFirst({
    where: {
      OR: [
        { code: upper },
        { code: { equals: c, mode: 'insensitive' } },
        { name: { equals: c, mode: 'insensitive' } }
      ]
    },
    select: { id: true, code: true, name: true }
  })
  if (loc) return loc

  if (upper === 'PMB') {
    const all = await client.stockLocation.findMany({
      select: { id: true, code: true, name: true },
      orderBy: [{ code: 'asc' }]
    })
    const hit = all.find(isPmbOfficeLocation)
    if (hit) return hit
  }

  return null
}

function normalizeSku(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
}

function parseTargetQty(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v)
  const n = parseFloat(String(v).trim().replace(/,/g, ''))
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function parseRow(raw, rowIndex) {
  const sku = normalizeSku(raw.sku ?? raw.SKU ?? raw['SKU Numbers'] ?? raw['sku'])
  const name = String(raw.name ?? raw.Name ?? raw.NAME ?? '').trim()
  const sheetQty = parseTargetQty(raw.quantity ?? raw.Quantity ?? raw.QTY)
  return { sku, name, sheetQty, fileRow: rowIndex + 2 }
}

const EPS = 0.0001

async function main() {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const asCsv = process.argv.includes('--csv')
  const fileArg = argv[0]
  if (!fileArg) {
    console.error(
      'Usage: node scripts/compare-inventory-to-xlsx-pmb.mjs "/path/to/file.xlsx" [--csv]'
    )
    process.exit(1)
  }

  const inputPath = resolve(fileArg)
  if (!existsSync(inputPath)) {
    console.error('File not found:', inputPath)
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const pmb = await resolveLocationByCode(prisma, LOCATION_CODE)
  if (!pmb) {
    console.error(`Stock location not found for STOCK_TAKE_LOCATION_CODE: ${LOCATION_CODE}`)
    process.exit(1)
  }

  let workbook
  try {
    workbook = XLSX.read(readFileSync(inputPath), { type: 'buffer' })
  } catch (e) {
    console.error('Failed to read Excel:', e.message)
    process.exit(1)
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  const parsed = []
  for (let i = 0; i < rows.length; i++) {
    const p = parseRow(rows[i], i)
    if (!p.sku) continue
    parsed.push(p)
  }

  const skuList = [...new Set(parsed.map((p) => p.sku))]

  const [items, liRows] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { sku: { in: skuList } },
      select: { sku: true, name: true }
    }),
    prisma.locationInventory.findMany({
      where: { sku: { in: skuList }, locationId: pmb.id },
      select: { sku: true, quantity: true }
    })
  ])

  const catalogNameBySku = new Map()
  for (const it of items) {
    if (!catalogNameBySku.has(it.sku)) catalogNameBySku.set(it.sku, it.name)
  }

  const pmbQtyBySku = new Map(liRows.map((r) => [r.sku, r.quantity ?? 0]))

  let match = 0
  let mismatch = 0
  let missingSku = 0
  const mismatches = []

  for (const p of parsed) {
    const { sku, name, sheetQty, fileRow } = p
    if (!catalogNameBySku.has(sku)) {
      missingSku++
      mismatches.push({
        fileRow,
        sku,
        sheetName: name,
        sheetQty,
        pmbQty: null,
        catalogName: null,
        delta: null,
        status: 'NO_INVENTORY_ITEM'
      })
      continue
    }

    const pmbQty = pmbQtyBySku.get(sku) ?? 0
    const delta = sheetQty - pmbQty
    if (Math.abs(delta) < EPS) {
      match++
    } else {
      mismatch++
      mismatches.push({
        fileRow,
        sku,
        sheetName: name,
        sheetQty,
        pmbQty,
        catalogName: catalogNameBySku.get(sku) || '',
        delta,
        status: 'MISMATCH'
      })
    }
  }

  const sheetSkuSet = new Set(skuList)
  const extraAtPmb = await prisma.locationInventory.findMany({
    where: {
      locationId: pmb.id,
      quantity: { gt: 0 },
      NOT: { sku: { in: skuList } }
    },
    select: { sku: true, quantity: true, itemName: true },
    take: 5000
  })

  console.log('PMB location:', pmb.code, '—', pmb.name, `(${pmb.id})`)
  console.log('Workbook:', inputPath)
  console.log('Rows in file (with SKU):', parsed.length)
  console.log('')
  console.log('Summary')
  console.log('  Sheet qty = PMB on-hand:', match)
  console.log('  Sheet qty ≠ PMB on-hand:', mismatch)
  console.log('  SKU in file, not in inventory catalog:', missingSku)
  console.log(
    '  SKUs with quantity at PMB but SKU not in file (sample cap 5000 rows checked):',
    extraAtPmb.length
  )
  if (extraAtPmb.length > 0 && !asCsv) {
    const show = extraAtPmb.slice(0, 25)
    console.log('    (first ' + show.length + '):')
    for (const e of show) {
      console.log(`      ${e.sku}  PMB qty=${e.quantity}  ${String(e.itemName || '').slice(0, 60)}`)
    }
    if (extraAtPmb.length > show.length) {
      console.log('      … +' + (extraAtPmb.length - show.length) + ' more')
    }
  }
  console.log('')

  const problemRows = mismatches.filter((m) => m.status === 'MISMATCH' || m.status === 'NO_INVENTORY_ITEM')
  if (asCsv) {
    console.log(
      'fileRow,sku,status,sheetQty,pmbQty,delta,sheetName,catalogName'
    )
    for (const m of problemRows) {
      const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
      console.log(
        [
          m.fileRow,
          m.sku,
          m.status,
          m.sheetQty,
          m.pmbQty ?? '',
          m.delta ?? '',
          esc(m.sheetName),
          esc(m.catalogName ?? '')
        ].join(',')
      )
    }
  } else {
    console.log('Lines where sheet ≠ PMB or item missing (' + problemRows.length + '):')
    console.log('')
    for (const m of problemRows) {
      if (m.status === 'NO_INVENTORY_ITEM') {
        console.log(
          `  Row ${m.fileRow}  ${m.sku}  NO_INVENTORY_ITEM  sheet=${m.sheetQty}  (no catalog row)`
        )
      } else {
        console.log(
          `  Row ${m.fileRow}  ${m.sku}  sheet=${m.sheetQty}  PMB=${m.pmbQty}  delta=${m.delta > 0 ? '+' : ''}${m.delta}`
        )
      }
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
