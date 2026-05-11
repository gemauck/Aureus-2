#!/usr/bin/env node
/**
 * Combined-view reconciliation: sum(normalized movements) vs LocationInventory (+ catalog fallback).
 * Matches Manufacturing "All locations" logic (adjustments count toward net).
 *
 * Usage:
 *   node scripts/verify-ledger-reconciliation.js
 *   node scripts/verify-ledger-reconciliation.js --quiet   # exit 1 if any mismatch, minimal output
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const EPS = 0.001

function normalizeCombined(m) {
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

async function main() {
  const quiet = process.argv.includes('--quiet')

  const liRows = await prisma.locationInventory.findMany({ select: { sku: true, quantity: true } })
  const liSumBySku = new Map()
  const liCountBySku = new Map()
  for (const r of liRows) {
    const sku = String(r.sku || '').trim()
    if (!sku) continue
    liSumBySku.set(sku, (liSumBySku.get(sku) || 0) + (r.quantity ?? 0))
    liCountBySku.set(sku, (liCountBySku.get(sku) || 0) + 1)
  }

  const movements = await prisma.stockMovement.findMany({
    select: { sku: true, quantity: true, type: true }
  })
  const netBySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    netBySku.set(sku, (netBySku.get(sku) || 0) + normalizeCombined(m))
  }

  const allInv = await prisma.inventoryItem.findMany({
    select: { sku: true, quantity: true },
    orderBy: [{ sku: 'asc' }, { locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  const canonicalBySku = new Map()
  for (const row of allInv) {
    const sku = String(row.sku || '').trim()
    if (!sku || canonicalBySku.has(sku)) continue
    canonicalBySku.set(sku, parseFloat(row.quantity) || 0)
  }

  const allSkus = new Set([...liSumBySku.keys(), ...netBySku.keys(), ...canonicalBySku.keys()])

  function recordedCombined(sku) {
    if ((liCountBySku.get(sku) || 0) > 0) return liSumBySku.get(sku) || 0
    return canonicalBySku.get(sku) || 0
  }

  const mismatched = []
  for (const sku of allSkus) {
    const recorded = recordedCombined(sku)
    const net = netBySku.get(sku) || 0
    if (Math.abs(net - recorded) > EPS) {
      mismatched.push({ sku, recorded, net, diff: net - recorded })
    }
  }
  mismatched.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  const summary = {
    ok: mismatched.length === 0,
    totalSkus: allSkus.size,
    movementRows: movements.length,
    mismatchedCount: mismatched.length,
    mismatched: mismatched.slice(0, 50),
    truncated: mismatched.length > 50
  }

  if (!quiet) {
    console.log(JSON.stringify(summary, null, 2))
  } else if (mismatched.length > 0) {
    console.error(`Ledger mismatch: ${mismatched.length} SKU(s). First: ${mismatched[0]?.sku}`)
  }

  await prisma.$disconnect()
  process.exit(mismatched.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
