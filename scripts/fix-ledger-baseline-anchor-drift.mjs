#!/usr/bin/env node
/**
 * Report (default) or safely fix mis-anchored `LEDGER_BASELINE_*` stock movements.
 *
 * **Safe auto-fix scope:** SKU has **only** movements whose `reference` starts with
 * `LEDGER_BASELINE_REF_PREFIX` (from `api/_lib/ledgerBaselinePrefix.js`). Then we
 * delete those rows and insert **one** adjustment at main office (`01_LOC1` / `LOC001`)
 * with `quantity` = sum of the removed baseline quantities (combined net unchanged).
 *
 * SKUs with sales/receipts/transfers/etc. mixed in are **skipped** on `--write` and
 * listed for manual handling (e.g. backup + `ledger-cutover-after-stocktake.js --mismatch-only`).
 *
 * Usage:
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs --sku=SKU0091
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs --write
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { LEDGER_BASELINE_REF_PREFIX } from '../api/_lib/ledgerBaselinePrefix.js'
import { buildMovementId } from '../api/_lib/stockCountAdjustment.js'

const argv = process.argv.slice(2)
const write = argv.includes('--write')
const skuArg = argv.find((a) => a.startsWith('--sku='))?.slice('--sku='.length)?.trim()

function isBaselineRef(ref) {
  return String(ref || '').startsWith(LEDGER_BASELINE_REF_PREFIX)
}

function defaultCatalogLocationId(locations) {
  const list = locations || []
  return (
    list.find((l) => String(l.code || '').trim() === '01_LOC1')?.id ||
    list.find((l) => String(l.code || '').trim() === 'LOC001')?.id ||
    list[0]?.id ||
    null
  )
}

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
  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true, name: true }
  })
  const anchorId = defaultCatalogLocationId(locations)
  if (!anchorId) {
    console.error('No StockLocation for anchor (need 01_LOC1 or LOC001).')
    process.exit(1)
  }

  const anchorMeta = locations.find((l) => l.id === anchorId)

  const baselineRows = await prisma.stockMovement.findMany({
    where: { reference: { startsWith: LEDGER_BASELINE_REF_PREFIX } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  })

  const skuSet = new Set()
  for (const m of baselineRows) {
    const sku = String(m.sku || '').trim()
    if (sku) skuSet.add(sku)
  }

  const skuList = [...skuSet].filter((s) => !skuArg || s === skuArg)

  const allMovementsForSkus =
    skuList.length === 0
      ? []
      : await prisma.stockMovement.findMany({
          where: { sku: { in: skuList } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }]
        })

  /** @type {Map<string, typeof allMovementsForSkus>} */
  const bySku = new Map()
  for (const m of allMovementsForSkus) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    if (!bySku.has(sku)) bySku.set(sku, [])
    bySku.get(sku).push(m)
  }

  const eligibleForConsolidate = []
  const skippedMixedHistory = []

  for (const sku of skuList) {
    const allMov = bySku.get(sku) || []

    const baseRows = allMov.filter((m) => isBaselineRef(m.reference))
    const nonBase = allMov.filter((m) => !isBaselineRef(m.reference))

    if (baseRows.length === 0) continue

    const wrongAnchor = baseRows.filter((m) => String(m.fromLocation || '').trim() !== anchorId)
    const needsConsolidation = baseRows.length > 1 || wrongAnchor.length > 0

    const combinedBefore = allMov.reduce((s, m) => s + normalizeCombined(m), 0)
    const sumBaselineQty = baseRows.reduce((s, m) => s + (parseFloat(m.quantity) || 0), 0)

    const row = {
      sku,
      baselineRowCount: baseRows.length,
      otherMovementCount: nonBase.length,
      wrongAnchorCount: wrongAnchor.length,
      anchorId,
      anchorCode: anchorMeta?.code || null,
      combinedNetBefore: combinedBefore,
      sumBaselineQuantities: sumBaselineQty,
      eligibleForConsolidate: nonBase.length === 0 && baseRows.length >= 1 && needsConsolidation
    }

    if (row.eligibleForConsolidate) {
      eligibleForConsolidate.push({
        ...row,
        movementIdsToDelete: baseRows.map((m) => m.id),
        sampleFromLocations: [...new Set(baseRows.map((m) => String(m.fromLocation || '').slice(0, 24)))]
      })
    } else if (needsConsolidation) {
      let reason = 'Needs consolidation but not eligible'
      if (nonBase.length > 0) {
        reason = `Has ${nonBase.length} non-baseline movement(s); use backup + ledger-cutover --mismatch-only or manual transfers`
      }
      skippedMixedHistory.push({
        sku,
        reason,
        otherMovementCount: nonBase.length,
        baselineRowCount: baseRows.length,
        wrongAnchorCount: wrongAnchor.length
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: write ? 'write' : 'dry-run',
        refPrefix: LEDGER_BASELINE_REF_PREFIX,
        anchorId,
        anchorCode: anchorMeta?.code || null,
        skuFilter: skuArg || null,
        baselineMovementRowsInDb: baselineRows.length,
        skusWithBaselineRows: skuSet.size,
        eligibleToConsolidate: eligibleForConsolidate.length,
        skippedNeedsManualReview: skippedMixedHistory.length,
        eligible: eligibleForConsolidate,
        skipped: skippedMixedHistory.slice(0, 80),
        skippedTruncated: skippedMixedHistory.length > 80
      },
      null,
      2
    )
  )

  if (!write) {
    console.error(
      '\nDry run. To apply safe consolidation (baseline-only SKUs): node scripts/fix-ledger-baseline-anchor-drift.mjs --write'
    )
    await prisma.$disconnect()
    return
  }

  let consolidated = 0
  const errors = []

  for (const item of eligibleForConsolidate) {
    const { sku, movementIdsToDelete } = item
    try {
      const baseRows = await prisma.stockMovement.findMany({
        where: { id: { in: movementIdsToDelete } }
      })
      if (baseRows.length === 0) continue

      const template = baseRows[0]
      const dates = baseRows.map((m) => new Date(m.date).getTime()).filter((t) => !Number.isNaN(t))
      const movementDate = new Date(Math.min(...dates))
      const itemName = String(template.itemName || sku).slice(0, 500)
      const sumQty = baseRows.reduce((s, m) => s + (parseFloat(m.quantity) || 0), 0)

      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.deleteMany({
          where: { id: { in: movementIdsToDelete } }
        })
        await tx.stockMovement.create({
          data: {
            movementId: buildMovementId(),
            date: movementDate,
            type: 'adjustment',
            itemName,
            sku,
            quantity: sumQty,
            fromLocation: anchorId,
            toLocation: '',
            reference: `${LEDGER_BASELINE_REF_PREFIX}:${sku}:${anchorId}`.slice(0, 500),
            performedBy: 'fix-ledger-baseline-anchor-drift.mjs',
            notes: `Consolidated ${baseRows.length} baseline row(s) onto main office anchor; total qty ${sumQty}.`.slice(
              0,
              2000
            ),
            ownerId: null
          }
        })
      })
      consolidated++
    } catch (e) {
      errors.push({ sku, error: e.message })
    }
  }

  console.log(JSON.stringify({ consolidated, errors }, null, 2))
  await prisma.$disconnect()
  process.exit(errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
