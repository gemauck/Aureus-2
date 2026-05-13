#!/usr/bin/env node
/**
 * Forensic reconciliation for one SKU: every StockMovement row, per-location movement net vs LocationInventory,
 * and combined ledger vs Σ LI vs catalog (canonical InventoryItem).
 *
 * Uses the same normalization rules as `api/_lib/alignLocationInventoryToMovements.js` and
 * `scripts/verify-ledger-per-location.js`.
 *
 * Usage:
 *   node scripts/forensic-stock-movement-audit.mjs --sku=YOUR-SKU
 *   node scripts/forensic-stock-movement-audit.mjs --sku=YOUR-SKU --json
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'
import { prisma } from '../api/_lib/prisma.js'
import {
  normalizeCombinedForSkuLedger,
  normalizeMovementAtLocationForSiteLedger,
  COMBINED_LEDGER_RECONCILE_EPS
} from '../api/_lib/alignLocationInventoryToMovements.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const EPS = COMBINED_LEDGER_RECONCILE_EPS

function parseArgs(argv) {
  const out = { sku: '', json: false }
  for (const a of argv) {
    if (a === '--json') out.json = true
    else if (a.startsWith('--sku=')) out.sku = a.slice('--sku='.length).trim()
  }
  return out
}

/**
 * @param {import('@prisma/client').PrismaClient} db
 * @param {string} skuRaw
 * @returns {Promise<{ ok: boolean, sku: string, report: Record<string, unknown> }>}
 */
export async function runForensicSkuAudit(db, skuRaw) {
  const sku = String(skuRaw || '').trim()
  if (!sku) {
    return { ok: false, sku: '', report: { error: 'empty sku' } }
  }

  const locations = await db.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const codeById = new Map(locations.map((l) => [l.id, String(l.code || '').trim()]))

  const movements = await db.stockMovement.findMany({
    where: { sku },
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })

  const liRows = await db.locationInventory.findMany({
    where: { sku },
    select: { id: true, locationId: true, quantity: true, itemName: true }
  })

  const invRows = await db.inventoryItem.findMany({
    where: { sku },
    select: { id: true, sku: true, quantity: true, name: true, locationId: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }]
  })

  const movementTable = movements.map((m, idx) => {
    const qty = parseFloat(m.quantity) || 0
    const combinedDelta = normalizeCombinedForSkuLedger(m)
    const perLoc = {}
    for (const li of liRows) {
      const code = codeById.get(li.locationId) || ''
      perLoc[li.locationId] = normalizeMovementAtLocationForSiteLedger(m, li.locationId, code)
    }
    return {
      seq: idx + 1,
      id: m.id,
      movementId: m.movementId,
      date: m.date,
      type: m.type,
      quantityRaw: m.quantity,
      combinedLedgerDelta: combinedDelta,
      fromLocation: m.fromLocation,
      toLocation: m.toLocation,
      reference: m.reference,
      perLocationSignedEffect: perLoc
    }
  })

  let combinedNet = 0
  for (const m of movements) {
    combinedNet += normalizeCombinedForSkuLedger(m)
  }

  const sumLi = liRows.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0)

  const perLocationAudit = []
  for (const li of liRows) {
    const code = codeById.get(li.locationId) || ''
    let net = 0
    for (const m of movements) {
      net += normalizeMovementAtLocationForSiteLedger(m, li.locationId, code)
    }
    const recorded = parseFloat(li.quantity) || 0
    const diff = net - recorded
    perLocationAudit.push({
      locationId: li.locationId,
      locationCode: code || null,
      recordedOnHand: recorded,
      netFromMovements: net,
      diff,
      reconciled: Math.abs(diff) <= EPS
    })
  }

  const canonical = invRows[0] || null
  const catalogQty = canonical ? parseFloat(canonical.quantity) || 0 : null
  const catalogVsSumLi =
    catalogQty != null ? catalogQty - sumLi : null

  const combinedVsSumLi = combinedNet - sumLi
  const combinedVsCatalog = catalogQty != null ? combinedNet - catalogQty : null

  const locMismatches = perLocationAudit.filter((r) => !r.reconciled)
  const ok =
    locMismatches.length === 0 &&
    Math.abs(combinedVsSumLi) <= EPS &&
    (catalogVsSumLi == null || Math.abs(catalogVsSumLi) <= EPS) &&
    (combinedVsCatalog == null || Math.abs(combinedVsCatalog) <= EPS)

  const report = {
    sku,
    movementCount: movements.length,
    locationInventoryRows: liRows.length,
    inventoryItemRows: invRows.length,
    sumLocationInventory: sumLi,
    combinedMovementNet: combinedNet,
    deltaCombinedVsSumLi: combinedVsSumLi,
    canonicalInventoryItemId: canonical?.id ?? null,
    catalogQuantity: catalogQty,
    deltaCatalogVsSumLi: catalogVsSumLi,
    deltaCombinedVsCatalog: combinedVsCatalog,
    duplicateInventoryItems: invRows.length > 1 ? invRows.map((r) => r.id) : [],
    perLocationAudit,
    movementTable,
    eps: EPS,
    ok
  }

  return { ok, sku, report }
}

async function cliMain() {
  const { sku, json } = parseArgs(process.argv.slice(2))
  if (!sku) {
    console.error('Usage: node scripts/forensic-stock-movement-audit.mjs --sku=YOUR-SKU [--json]')
    process.exit(1)
  }

  const { ok, report } = await runForensicSkuAudit(prisma, sku)
  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('\n=== FORENSIC STOCK MOVEMENT AUDIT ===\n')
    console.log('SKU:', report.sku)
    console.log('Movements:', report.movementCount, '| LI rows:', report.locationInventoryRows, '| InventoryItem rows:', report.inventoryItemRows)
    if (report.duplicateInventoryItems?.length) {
      console.log('⚠️  Multiple InventoryItem rows for this SKU:', report.duplicateInventoryItems.join(', '))
    }
    console.log('\n--- Totals ---')
    console.log('Σ LocationInventory:', report.sumLocationInventory)
    console.log('Combined movement net (internal transfers net 0):', report.combinedMovementNet)
    console.log('Δ (combinedNet − ΣLI):', report.deltaCombinedVsSumLi)
    console.log('Canonical catalog qty:', report.catalogQuantity)
    console.log('Δ (catalog − ΣLI):', report.deltaCatalogVsSumLi)
    console.log('Δ (combinedNet − catalog):', report.deltaCombinedVsCatalog)
    console.log('\n--- Per location (movement math vs LI) ---')
    for (const row of report.perLocationAudit) {
      const mark = row.reconciled ? '✓' : '✗'
      console.log(
        `${mark} ${row.locationCode || row.locationId}  on-hand=${row.recordedOnHand}  netMovements=${row.netFromMovements}  diff=${row.diff}`
      )
    }
    console.log('\n--- Movement ledger (chronological) ---')
    for (const m of report.movementTable) {
      console.log(
        `#${m.seq} ${m.type} qty=${m.quantityRaw} combinedΔ=${m.combinedLedgerDelta} ref=${m.reference || ''} from=${m.fromLocation || '∅'} to=${m.toLocation || '∅'}`
      )
    }
    console.log('\n=== RESULT:', ok ? 'PASS' : 'FAIL', `(tolerance ±${report.eps}) ===\n`)
  }

  await prisma.$disconnect().catch(() => {})
  process.exit(ok ? 0 : 1)
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('forensic-stock-movement-audit.mjs') ||
    process.argv[1].includes('forensic-stock-movement-audit.mjs'))

if (isMain) {
  cliMain().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
