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

/**
 * Build SKU lookup for stock-take line normalization (location inventory + catalog names).
 * @param {Array<{ id: string, sku: string, itemName?: string, quantity?: number, unit?: string }>} locationInventoryRows
 * @param {Array<{ id: string, sku: string, name?: string, unit?: string }>} inventoryItems
 */
export function buildStockTakeSkuMetaMap(locationInventoryRows, inventoryItems = []) {
  const itemBySku = new Map()
  for (const item of inventoryItems) {
    const sku = String(item?.sku || '').trim()
    if (sku && !itemBySku.has(sku)) itemBySku.set(sku, item)
  }

  const skuMeta = new Map()
  for (const row of locationInventoryRows || []) {
    const sku = String(row?.sku || '').trim()
    if (!sku) continue
    const inv = itemBySku.get(sku)
    skuMeta.set(sku, {
      locationInventoryId: row.id ? String(row.id) : null,
      inventoryItemId: inv?.id ? String(inv.id) : null,
      itemName: String(row.itemName || inv?.name || sku).trim() || sku,
      unit: String(row.unit || inv?.unit || 'pcs').trim() || 'pcs',
      systemQty: Number(row.quantity) || 0
    })
  }
  return skuMeta
}

/**
 * Normalize direct stock-take submission lines (non-session POST).
 * Fills systemQty/itemName from location inventory when mobile sends only sku + countedQty.
 */
export function normalizeStockTakeLinesInput(linesInput, skuMetaBySku = new Map()) {
  if (!Array.isArray(linesInput) || !linesInput.length) return []

  const cleanLines = []
  for (let idx = 0; idx < linesInput.length; idx++) {
    const line = linesInput[idx]
    const isNewItem = line?.isNewItem === true
    const sku = String(line?.sku || '').trim()
    const countedQty = Number(line?.countedQty)
    if (!Number.isFinite(countedQty)) continue

    let itemName = String(line?.itemName || line?.name || '').trim()
    let systemQty = Number(line?.systemQty)
    let unit = String(line?.unit || '').trim()
    let locationInventoryId = line?.locationInventoryId ? String(line.locationInventoryId) : null
    let inventoryItemId = line?.inventoryItemId ? String(line.inventoryItemId) : null

    if (!isNewItem) {
      if (!sku) continue
      const meta = skuMetaBySku.get(sku)
      if (!itemName) itemName = meta?.itemName || sku
      if (!Number.isFinite(systemQty)) systemQty = meta?.systemQty ?? 0
      if (!unit) unit = meta?.unit || 'pcs'
      if (!locationInventoryId && meta?.locationInventoryId) {
        locationInventoryId = meta.locationInventoryId
      }
      if (!inventoryItemId && meta?.inventoryItemId) {
        inventoryItemId = meta.inventoryItemId
      }
    } else {
      if (!itemName) continue
      if (!Number.isFinite(systemQty)) systemQty = 0
      if (!unit) unit = 'pcs'
    }

    if (!itemName) continue

    cleanLines.push({
      row: idx + 1,
      locationInventoryId,
      inventoryItemId,
      sku,
      itemName,
      unit: unit || 'pcs',
      systemQty,
      countedQty,
      deltaQty: countedQty - systemQty,
      isNewItem,
      proposedItemDetails:
        line?.proposedItemDetails && typeof line.proposedItemDetails === 'object'
          ? line.proposedItemDetails
          : {}
    })
  }

  return cleanLines
}

/** Load location inventory metadata and normalize stock-take create lines. */
export async function normalizeStockTakeLinesForCreate(prisma, locationId, linesInput) {
  const locId = String(locationId || '').trim()
  if (!locId || !Array.isArray(linesInput) || !linesInput.length) return []

  const locationInventoryRows = await prisma.locationInventory.findMany({
    where: { locationId: locId },
    select: {
      id: true,
      sku: true,
      itemName: true,
      quantity: true,
      unit: true
    }
  })

  const skus = locationInventoryRows
    .map((row) => String(row.sku || '').trim())
    .filter(Boolean)
  const inventoryItems = skus.length
    ? await prisma.inventoryItem.findMany({
        where: { sku: { in: skus } },
        select: { id: true, sku: true, name: true, unit: true },
        orderBy: { updatedAt: 'desc' }
      })
    : []

  const skuMetaBySku = buildStockTakeSkuMetaMap(locationInventoryRows, inventoryItems)
  return normalizeStockTakeLinesInput(linesInput, skuMetaBySku)
}
