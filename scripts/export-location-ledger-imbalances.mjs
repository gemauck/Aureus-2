#!/usr/bin/env node
/**
 * Export per-location ledger imbalances to CSV (same rules as verify-ledger-per-location.js).
 * Each row is one LocationInventory record where movement net at that site != quantity on hand.
 *
 * Usage:
 *   node scripts/export-location-ledger-imbalances.mjs
 *   node scripts/export-location-ledger-imbalances.mjs --out=/path/to/file.csv
 *
 * Default output: ~/Desktop/location-ledger-imbalances-<timestamp>.csv
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const EPS = 0.001

function normalizeAtLocation(m, locId, locCode) {
  const matches = (loc) => !!loc && (loc === locId || (!!locCode && loc === locCode))
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') {
    const qtyAbs = Math.abs(qty)
    const fromHere = matches(m.fromLocation)
    const toHere = matches(m.toLocation)
    if (toHere && !fromHere) return qtyAbs
    if (fromHere && !toHere) return -qtyAbs
    if (fromHere && toHere) return 0
    return 0
  }
  const touches = matches(m.fromLocation) || matches(m.toLocation)
  if (!touches) return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length)?.trim()
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const defaultPath = path.join(os.homedir(), 'Desktop', `location-ledger-imbalances-${ts}.csv`)
  const outPath = outArg ? path.resolve(outArg) : defaultPath

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const codeById = new Map(locations.map((l) => [l.id, String(l.code || '').trim()]))
  const nameById = new Map(locations.map((l) => [l.id, String(l.name || '').trim()]))

  const movements = await prisma.stockMovement.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })

  const movementsBySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    if (!movementsBySku.has(sku)) movementsBySku.set(sku, [])
    movementsBySku.get(sku).push(m)
  }

  const liRows = await prisma.locationInventory.findMany({
    select: { id: true, sku: true, itemName: true, locationId: true, quantity: true }
  })

  const rows = []
  for (const li of liRows) {
    const sku = String(li.sku || '').trim()
    const locId = li.locationId
    if (!sku || !locId) continue
    const code = codeById.get(locId) || ''
    const list = movementsBySku.get(sku) || []
    let net = 0
    for (const m of list) {
      net += normalizeAtLocation(m, locId, code)
    }
    const recorded = parseFloat(li.quantity) || 0
    if (Math.abs(net - recorded) > EPS) {
      rows.push({
        locationInventoryId: li.id,
        sku,
        itemName: li.itemName || '',
        locationId: locId,
        locationCode: code || '',
        locationName: nameById.get(locId) || '',
        recordedOnHand: recorded,
        netFromMovements: net,
        diffMovementMinusRecorded: net - recorded,
        movementRowCountForSku: list.length
      })
    }
  }

  rows.sort((a, b) => Math.abs(b.diffMovementMinusRecorded) - Math.abs(a.diffMovementMinusRecorded))

  const header = [
    'locationInventoryId',
    'sku',
    'itemName',
    'locationId',
    'locationCode',
    'locationName',
    'recordedOnHand',
    'netFromMovements',
    'diffMovementMinusRecorded',
    'movementRowCountForSku'
  ]

  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.locationInventoryId,
        r.sku,
        r.itemName,
        r.locationId,
        r.locationCode,
        r.locationName,
        r.recordedOnHand,
        r.netFromMovements,
        r.diffMovementMinusRecorded,
        r.movementRowCountForSku
      ].map(csvCell).join(',')
    )
  ]

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')

  console.log(
    JSON.stringify(
      {
        written: outPath,
        locationInventoryRowsChecked: liRows.length,
        imbalanceRows: rows.length,
        basis: 'Per LocationInventory row: sum of StockMovement contributions at that location (id or code match) vs quantity on hand; same as verify-ledger-per-location.js'
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
