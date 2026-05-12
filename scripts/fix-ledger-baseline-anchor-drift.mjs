#!/usr/bin/env node
/**
 * Report (default) or safely fix mis-anchored `LEDGER_BASELINE_*` stock movements.
 *
 * **Mode A (default):** SKU has **only** `LEDGER_BASELINE_*` movements — same as before.
 *
 * **Mode B (`--merge-baseline-splits`):** Use when cutover wrongly created **multiple**
 * baseline rows (e.g. PIETERMARITZBURG + South Coast R&D). Deletes **only** rows whose
 * `reference` starts with `LEDGER_BASELINE_REF_PREFIX`, inserts **one** adjustment at main
 * office with **quantity = sum** of those baselines. **Leaves** LI_ALIGN, receipts, sales,
 * etc. **unchanged** (combined net from non-baseline rows unchanged).
 *
 * SKUs with sales/receipts/transfers/etc. mixed in are **skipped** in Mode A on `--write`.
 * Mode B still runs when those exist, as long as there is something to merge in baseline rows.
 *
 * Usage:
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs --sku=SKU0091
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs --write
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs --merge-baseline-splits --sku=SKU0091
 *   node scripts/fix-ledger-baseline-anchor-drift.mjs --merge-baseline-splits --write
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { LEDGER_BASELINE_REF_PREFIX } from '../api/_lib/ledgerBaselinePrefix.js'
import { buildMovementId } from '../api/_lib/stockCountAdjustment.js'

const argv = process.argv.slice(2)
const write = argv.includes('--write')
const mergeBaselineSplits = argv.includes('--merge-baseline-splits')
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

    const baselineOnlyEligible =
      !mergeBaselineSplits && nonBase.length === 0 && baseRows.length >= 1 && needsConsolidation
    const mergeSplitsEligible =
      mergeBaselineSplits && baseRows.length >= 1 && needsConsolidation

    const row = {
      sku,
      strategy: mergeBaselineSplits ? 'merge-baseline-splits' : 'baseline-only',
      baselineRowCount: baseRows.length,
      otherMovementCount: nonBase.length,
      wrongAnchorCount: wrongAnchor.length,
      anchorId,
      anchorCode: anchorMeta?.code || null,
      combinedNetBefore: combinedBefore,
      sumBaselineQuantities: sumBaselineQty,
      eligibleForConsolidate: baselineOnlyEligible || mergeSplitsEligible
    }

    if (row.eligibleForConsolidate) {
      eligibleForConsolidate.push({
        ...row,
        movementIdsToDelete: baseRows.map((m) => m.id),
        sampleFromLocations: [...new Set(baseRows.map((m) => String(m.fromLocation || '').slice(0, 24)))]
      })
    } else if (needsConsolidation && !mergeBaselineSplits) {
      skippedMixedHistory.push({
        sku,
        reason: `Has ${nonBase.length} non-baseline movement(s); re-run with --merge-baseline-splits to fix baseline rows only, or use ledger-cutover / manual transfers`,
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
        mergeBaselineSplits,
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
    const hint = mergeBaselineSplits
      ? '\nDry run. Apply merge: node scripts/fix-ledger-baseline-anchor-drift.mjs --merge-baseline-splits --write'
      : '\nDry run. Baseline-only SKUs: node scripts/fix-ledger-baseline-anchor-drift.mjs --write\nSplit baselines + other movements: node scripts/fix-ledger-baseline-anchor-drift.mjs --merge-baseline-splits --write'
    console.error(hint)
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
      const strat = item.strategy || 'baseline-only'
      const notes =
        strat === 'merge-baseline-splits'
          ? `Merged ${baseRows.length} split LEDGER_BASELINE row(s) onto main office; total qty ${sumQty}; other movement types unchanged.`
          : `Consolidated ${baseRows.length} baseline row(s) onto main office anchor; total qty ${sumQty}.`

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
            notes: notes.slice(0, 2000),
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
