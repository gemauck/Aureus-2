import { computedInventoryTotalValue } from './inventoryValue.js'
import { findCanonicalInventoryItemBySkuTx, getStatusFromQuantity } from './stockCountAdjustment.js'

const EPS = 0.001
/** Same tolerance as `scripts/verify-ledger-reconciliation.js` for list badges. */
export const COMBINED_LEDGER_RECONCILE_EPS = EPS
export const ALIGN_LI_TO_MOVEMENTS_REF = 'LI_ALIGN_TO_MOVEMENTS'

/** Same rules as `scripts/verify-ledger-reconciliation.js` (company-wide net per movement). */
export function normalizeCombinedForSkuLedger(m) {
  let qty = parseFloat(m.quantity) || 0
  const t = (m.type || '').toLowerCase()
  if (t === 'transfer') return 0
  if (t === 'receipt') return Math.abs(qty)
  if (t === 'production') return -Math.abs(qty)
  if (t === 'consumption' || t === 'sale') return -Math.abs(qty)
  if (t === 'issue') return -Math.abs(qty)
  return qty
}

/**
 * SKUs where sum(LocationInventory) ≠ sum(normalized movements), using catalog fallback when no LI rows.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<Array<{ sku: string, recorded: number, net: number, diff: number }>>}
 */
export async function computeCombinedLedgerMismatches(prisma) {
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
    netBySku.set(sku, (netBySku.get(sku) || 0) + normalizeCombinedForSkuLedger(m))
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
    if (Math.abs(net - recorded) > COMBINED_LEDGER_RECONCILE_EPS) {
      mismatched.push({ sku, recorded, net, diff: net - recorded })
    }
  }
  mismatched.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  return mismatched
}

/**
 * Company-wide movement-implied on-hand per SKU (internal transfers net to 0).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<Map<string, number>>}
 */
export async function loadMovementNetCombinedBySku(prisma) {
  const movements = await prisma.stockMovement.findMany({
    select: { sku: true, quantity: true, type: true }
  })
  const netBySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '').trim()
    if (!sku) continue
    netBySku.set(sku, (netBySku.get(sku) || 0) + normalizeCombinedForSkuLedger(m))
  }
  return netBySku
}

/**
 * Annotate aggregated (all-locations) inventory rows with combined ledger reconciliation.
 * `row.quantity` must already be recorded on-hand (Σ LocationInventory or catalog fallback).
 * @param {Array<Record<string, unknown>>} rows
 * @param {Map<string, number>} movementNetBySku
 */
export function annotateInventoryRowsWithCompanyWideLedger(rows, movementNetBySku) {
  for (const row of rows) {
    const sku = String(row.sku || '').trim()
    const recorded = Number(row.quantity) || 0
    const movementNet = sku ? movementNetBySku.get(sku) ?? 0 : 0
    const variance = recorded - movementNet
    row.ledgerMovementNet = movementNet
    row.ledgerVariance = variance
    row.ledgerReconciled = Math.abs(variance) <= COMBINED_LEDGER_RECONCILE_EPS
  }
  return rows
}

async function defaultStockLocationId(tx) {
  const loc = await tx.stockLocation.findFirst({
    where: { status: 'active' },
    orderBy: { code: 'asc' }
  })
  return loc?.id || null
}

async function syncMasterQuantityFromLocationSumTx(tx, skuTrim) {
  const agg = await tx.locationInventory.aggregate({
    _sum: { quantity: true },
    where: { sku: skuTrim }
  })
  const aggQty = agg._sum.quantity ?? 0
  const item = await findCanonicalInventoryItemBySkuTx(tx, skuTrim)
  if (!item) return
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      quantity: aggQty,
      totalValue: computedInventoryTotalValue(aggQty, item.unitCost || 0),
      status: getStatusFromQuantity(aggQty, item.reorderPoint || 0)
    }
  })
}

/**
 * Set sum(LocationInventory) to match existing combined StockMovement net **without** inserting new
 * movements (adjustments would add to net and double-count). Updates LI + canonical aggregate only.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} sku
 * @param {{ dryRun?: boolean }} [options]
 */
export async function alignSkuInventoryToCombinedMovements(prisma, sku, options = {}) {
  const dryRun = Boolean(options.dryRun)

  const skuTrim = String(sku || '').trim()
  if (!skuTrim) throw new Error('sku required')

  const liRows = await prisma.locationInventory.findMany({ where: { sku: skuTrim } })
  const sumLi = liRows.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0)
  const movements = await prisma.stockMovement.findMany({
    where: { sku: skuTrim },
    select: { quantity: true, type: true }
  })
  const net = movements.reduce((s, m) => s + normalizeCombinedForSkuLedger(m), 0)
  const delta = net - sumLi

  if (Math.abs(delta) <= EPS) {
    return {
      applied: false,
      dryRun,
      sku: skuTrim,
      sumLi,
      net,
      delta: 0,
      locationRowsUpdated: 0,
      detail: 'already aligned'
    }
  }

  const inv = await prisma.inventoryItem.findFirst({
    where: { sku: skuTrim },
    orderBy: { updatedAt: 'desc' }
  })
  const itemName = inv?.name || liRows[0]?.itemName || skuTrim

  if (dryRun) {
    const negSteps =
      delta < -EPS
        ? (() => {
            let remaining = Math.abs(delta)
            const sorted = [...liRows]
              .filter((r) => (parseFloat(r.quantity) || 0) > EPS)
              .sort((a, b) => (parseFloat(b.quantity) || 0) - (parseFloat(a.quantity) || 0))
            const steps = []
            for (const row of sorted) {
              if (remaining <= EPS) break
              const q = parseFloat(row.quantity) || 0
              const take = Math.min(q, remaining)
              if (take > EPS) {
                steps.push({ locationId: row.locationId, take })
                remaining -= take
              }
            }
            return { steps, remaining }
          })()
        : { steps: [], remaining: 0 }

    return {
      applied: false,
      dryRun: true,
      sku: skuTrim,
      sumLi,
      net,
      delta,
      locationUpdatesPlanned: delta > EPS ? (liRows.length ? 1 : 1) : negSteps.steps.length,
      wouldFailNegative: delta < -EPS && negSteps.remaining > EPS,
      unresolvedRemaining: negSteps.remaining > EPS ? negSteps.remaining : 0,
      negativePlan: delta < -EPS ? negSteps : null
    }
  }

  let locationRowsUpdated = 0

  await prisma.$transaction(
    async (tx) => {
      if (delta > EPS) {
        const sorted = [...liRows].sort(
          (a, b) => (parseFloat(b.quantity) || 0) - (parseFloat(a.quantity) || 0)
        )
        const canon = await findCanonicalInventoryItemBySkuTx(tx, skuTrim)
        const uc = Number(canon?.unitCost) || Number(sorted[0]?.unitCost) || 0
        const rp = Number(canon?.reorderPoint) || Number(sorted[0]?.reorderPoint) || 0

        if (sorted.length === 0) {
          let locationId = canon?.locationId || (await defaultStockLocationId(tx))
          if (!locationId) throw new Error(`No location to create LocationInventory for ${skuTrim}`)
          const nq = delta
          await tx.locationInventory.create({
            data: {
              locationId,
              sku: skuTrim,
              itemName,
              quantity: nq,
              unitCost: uc,
              reorderPoint: rp,
              status: getStatusFromQuantity(nq, rp)
            }
          })
          locationRowsUpdated = 1
        } else {
          const row = sorted[0]
          const q = parseFloat(row.quantity) || 0
          const nq = q + delta
          await tx.locationInventory.update({
            where: { id: row.id },
            data: {
              quantity: nq,
              status: getStatusFromQuantity(nq, row.reorderPoint || rp)
            }
          })
          locationRowsUpdated = 1
        }
      } else {
        let remaining = Math.abs(delta)
        const sorted = [...liRows]
          .filter((r) => (parseFloat(r.quantity) || 0) > EPS)
          .sort((a, b) => (parseFloat(b.quantity) || 0) - (parseFloat(a.quantity) || 0))

        for (const row of sorted) {
          if (remaining <= EPS) break
          const q = parseFloat(row.quantity) || 0
          const take = Math.min(q, remaining)
          if (take <= EPS) continue
          const nq = q - take
          await tx.locationInventory.update({
            where: { id: row.id },
            data: {
              quantity: nq,
              status: getStatusFromQuantity(nq, row.reorderPoint || 0)
            }
          })
          locationRowsUpdated++
          remaining -= take
        }

        if (remaining > EPS) {
          throw new Error(
            `Cannot fully align ${skuTrim}: still ${remaining} units to remove but insufficient LocationInventory on hand.`
          )
        }
      }

      await syncMasterQuantityFromLocationSumTx(tx, skuTrim)
    },
    { maxWait: 60000, timeout: 120000 }
  )

  return {
    applied: true,
    sku: skuTrim,
    sumLiBefore: sumLi,
    net,
    delta,
    locationRowsUpdated,
    method: 'direct_location_inventory_only'
  }
}
