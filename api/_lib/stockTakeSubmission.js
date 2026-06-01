/**
 * Stock-take submission helpers: movement effective date and system-qty snapshot at submit.
 */

import { normalizeMovementAtLocationForSiteLedger } from './alignLocationInventoryToMovements.js'

export function parseStockTakeLineMeta(line) {
  try {
    return line?.meta ? JSON.parse(line.meta) : {}
  } catch {
    return {}
  }
}

/** Ledger date for applied stock-take adjustments (submission moment, not apply click). */
export function resolveStockTakeMovementDate(submission) {
  const candidates = [
    submission?.submittedAt,
    submission?.finishedAt,
    submission?.startedAt
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const d = raw instanceof Date ? raw : new Date(raw)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

/**
 * Refresh each existing-SKU line's systemQty from current LocationInventory and recompute deltaQty
 * so variances reflect on-hand at submit time (not session start).
 */
export async function refreshStockTakeLinesSystemQtyAtSubmitTx(tx, submissionId, locationId) {
  const locId = String(locationId || '').trim()
  if (!locId || !submissionId) return { refreshed: 0 }

  const lines = await tx.stockTakeSubmissionLine.findMany({
    where: { submissionId }
  })
  let refreshed = 0
  const refreshedAt = new Date().toISOString()

  for (const line of lines) {
    const meta = parseStockTakeLineMeta(line)
    if (meta?.isNewItem === true) continue

    const sku = String(line.sku || '').trim()
    if (!sku) continue

    const li = await tx.locationInventory.findUnique({
      where: { locationId_sku: { locationId: locId, sku } },
      select: { quantity: true }
    })
    const systemQty = li ? Number(li.quantity) || 0 : 0
    const countedQty = Number(line.countedQty) || 0

    await tx.stockTakeSubmissionLine.update({
      where: { id: line.id },
      data: {
        systemQty,
        deltaQty: countedQty - systemQty,
        meta: JSON.stringify({
          ...meta,
          systemQtyRefreshedAtSubmit: true,
          systemQtyRefreshedAt: refreshedAt
        })
      }
    })
    refreshed++
  }

  return { refreshed }
}

/**
 * Net signed movement effect at one warehouse for a SKU after `since` (exclusive).
 * Uses movement.date so delayed apply preserves activity after submission.
 */
export async function computeMovementNetAtLocationSinceTx(
  tx,
  { sku, locationId, locationCode, since }
) {
  const skuTrim = String(sku || '').trim()
  const locId = String(locationId || '').trim()
  if (!skuTrim || !locId) return 0

  const sinceDate = since instanceof Date ? since : new Date(since)
  if (Number.isNaN(sinceDate.getTime())) return 0

  const movements = await tx.stockMovement.findMany({
    where: {
      sku: skuTrim,
      date: { gt: sinceDate }
    },
    select: {
      quantity: true,
      type: true,
      fromLocation: true,
      toLocation: true
    }
  })

  const code = String(locationCode || '').trim()
  let net = 0
  for (const m of movements) {
    net += normalizeMovementAtLocationForSiteLedger(m, locId, code)
  }
  return net
}

/**
 * Adjustment to post on apply: counted at submit + movements since submit → current on-hand.
 * @param {{ countedQty: number, currentQty: number, netMovementSinceSubmit: number, isNewItem?: boolean }} p
 */
export function computeStockTakeApplyDeltaQty(p) {
  if (p?.isNewItem) return Number(p.countedQty) || 0
  const counted = Number(p.countedQty) || 0
  const current = Number(p.currentQty) || 0
  const net = Number(p.netMovementSinceSubmit) || 0
  return counted - (current - net)
}
