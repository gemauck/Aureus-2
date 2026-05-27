/**
 * Post StockMovement consumption rows for JobCard.stockUsed (all statuses, all clients).
 * Idempotent per job card line index via deterministic movementId MOV-JC-{jobCardId}-L{n}.
 */
import {
  findCanonicalInventoryItemBySkuTx,
  getStatusFromQuantity
} from './stockCountAdjustment.js'
import { createStockMovementTx } from './movementId.js'
import { computedInventoryTotalValue } from './inventoryValue.js'

export function parseJobCardStockUsed(raw) {
  if (!raw) return []
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null
      const sku = String(row.sku || '').trim()
      const locationId = String(row.locationId || row.location || '').trim()
      const qty = parseFloat(row.quantity)
      const itemName = String(row.itemName || row.name || '').trim()
      // Each line must name its warehouse — empty locationId would wrongly default to main office.
      if (!sku || !locationId || !Number.isFinite(qty) || qty <= 0) return null
      const clientLineId = String(row.id || row.lineId || '').trim() || undefined
      return {
        lineIndex: index,
        clientLineId,
        sku,
        locationId,
        quantity: qty,
        itemName: itemName || sku,
        unitCost:
          row.unitCost !== undefined && row.unitCost !== null && row.unitCost !== ''
            ? parseFloat(row.unitCost)
            : undefined
      }
    })
    .filter(Boolean)
}

/** Stable movement key: prefer client line id (survives reorder); else array index. */
export function jobCardStockMovementId(jobCardId, lineOrIndex) {
  const jobId = String(jobCardId)
  if (lineOrIndex != null && typeof lineOrIndex === 'object') {
    const safe = String(lineOrIndex.clientLineId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 48)
    if (safe) return `MOV-JC-${jobId}-R${safe}`
    return `MOV-JC-${jobId}-L${lineOrIndex.lineIndex}`
  }
  return `MOV-JC-${jobId}-L${lineOrIndex}`
}

/** Canonical JSON persisted on JobCard.stockUsed (matches parse rules). */
export function serializeJobCardStockUsedForDb(raw) {
  const lines = parseJobCardStockUsed(raw)
  return JSON.stringify(
    lines.map((l) => {
      const row = {
        sku: l.sku,
        quantity: l.quantity,
        locationId: l.locationId,
        itemName: l.itemName
      }
      if (l.clientLineId) row.id = l.clientLineId
      if (l.unitCost !== undefined && Number.isFinite(l.unitCost)) row.unitCost = l.unitCost
      return row
    })
  )
}

export function jobCardStockMovementReference(jobCard) {
  const num = jobCard?.jobCardNumber ? String(jobCard.jobCardNumber).trim() : ''
  const id = jobCard?.id ? String(jobCard.id).trim() : ''
  return num ? `JOB CARD: ${num}` : id ? `JOB CARD: ${id}` : 'JOB CARD'
}

/** Best date for ledger/reporting (visit completion preferred over save time). */
export function resolveJobCardMovementDate(jobCard) {
  const candidates = [
    jobCard?.completedAt,
    jobCard?.submittedAt,
    jobCard?.startedAt,
    jobCard?.createdAt,
    jobCard?.updatedAt
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const d = raw instanceof Date ? raw : new Date(raw)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

function sameCalendarDay(a, b) {
  const da = a instanceof Date ? a : new Date(a)
  const db = b instanceof Date ? b : new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** Job card lines must deduct from the selected site — never silently default to main office. */
async function resolveJobCardLineLocationIdTx(tx, locationIdOrCode) {
  const s = String(locationIdOrCode || '').trim()
  if (!s) return null
  const loc = await tx.stockLocation.findFirst({
    where: {
      OR: [{ id: s }, { code: s }, { name: { equals: s, mode: 'insensitive' } }]
    }
  })
  return loc?.id || null
}

async function reverseMovementOnLocationInventory(tx, movement) {
  if (!movement?.sku) return
  const loc = String(movement.fromLocation || '').trim()
  if (!loc) return
  const qty = Number(movement.quantity)
  if (!Number.isFinite(qty) || qty === 0) return
  await upsertLocationInventoryDelta(
    tx,
    loc,
    movement.sku,
    movement.itemName || movement.sku,
    -qty,
    undefined
  )
}

async function upsertLocationInventoryDelta(tx, locationId, sku, itemName, quantityDelta, unitCost) {
  let li = await tx.locationInventory.findUnique({
    where: { locationId_sku: { locationId, sku } }
  })
  if (!li) {
    li = await tx.locationInventory.create({
      data: {
        locationId,
        sku,
        itemName,
        quantity: 0,
        unitCost: unitCost || 0,
        reorderPoint: 0,
        status: 'out_of_stock'
      }
    })
  }
  const newQty = (li.quantity || 0) + quantityDelta
  const st = getStatusFromQuantity(newQty, li.reorderPoint || 0)
  await tx.locationInventory.update({
    where: { id: li.id },
    data: {
      quantity: newQty,
      unitCost: unitCost !== undefined && !Number.isNaN(unitCost) ? unitCost : li.unitCost,
      status: st,
      itemName: itemName || li.itemName
    }
  })
}

async function reconcileInventoryMasterTx(tx, sku) {
  const item = await findCanonicalInventoryItemBySkuTx(tx, sku)
  if (!item) return null
  const totalAtLocations = await tx.locationInventory.aggregate({
    _sum: { quantity: true },
    where: { sku }
  })
  const aggQty = totalAtLocations._sum.quantity || 0
  return tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      quantity: aggQty,
      totalValue: computedInventoryTotalValue(aggQty, item.unitCost),
      status: getStatusFromQuantity(aggQty, item.reorderPoint || 0)
    }
  })
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ jobCard: object, performedBy?: string, applyJobCardDate?: boolean, audit?: (action: string, movementId: string, details: object) => void }} opts
 */
export async function syncJobCardStockMovements(prisma, opts) {
  const jobCard = opts?.jobCard
  if (!jobCard?.id) {
    return { created: 0, updated: 0, skipped: 0, dateFixed: 0, removed: 0, errors: [] }
  }

  const lines = parseJobCardStockUsed(jobCard.stockUsed)
  const performedBy = String(opts.performedBy || jobCard.agentName || 'System').trim()
  const reference = jobCardStockMovementReference(jobCard)
  const visitNote = jobCard.location ? ` — ${jobCard.location}` : ''
  const movementDate = resolveJobCardMovementDate(jobCard)
  const applyJobCardDate = opts.applyJobCardDate !== false
  const result = { created: 0, updated: 0, skipped: 0, dateFixed: 0, removed: 0, errors: [] }

  await prisma.$transaction(async (tx) => {
    const activeMovementIds = new Set()

    for (const line of lines) {
      const movementId = jobCardStockMovementId(jobCard.id, line)
      activeMovementIds.add(movementId)
      const locationId = await resolveJobCardLineLocationIdTx(tx, line.locationId)
      if (!locationId) {
        result.errors.push({
          lineIndex: line.lineIndex,
          sku: line.sku,
          message: `Unknown stock location: ${line.locationId}`
        })
        continue
      }

      const targetQty = -Math.abs(line.quantity)
      const notes = `Stock used in job card: ${reference}${visitNote}`

      try {
        const existing = await tx.stockMovement.findFirst({
          where: { movementId }
        })

        if (
          existing &&
          existing.sku === line.sku &&
          String(existing.fromLocation) === String(locationId) &&
          existing.quantity === targetQty
        ) {
          if (applyJobCardDate && !sameCalendarDay(existing.date, movementDate)) {
            await tx.stockMovement.update({
              where: { id: existing.id },
              data: {
                date: movementDate,
                reference,
                performedBy,
                notes
              }
            })
            result.dateFixed++
          } else {
            result.skipped++
          }
          continue
        }

        if (existing) {
          const liDelta = targetQty - existing.quantity
          const oldSku = existing.sku
          const oldLoc = String(existing.fromLocation || '')
          const locationOrSkuChanged =
            oldSku !== line.sku || oldLoc !== String(locationId)

          await tx.stockMovement.update({
            where: { id: existing.id },
            data: {
              sku: line.sku,
              itemName: line.itemName,
              quantity: targetQty,
              fromLocation: locationId,
              toLocation: '',
              reference,
              performedBy,
              notes,
              date: applyJobCardDate ? movementDate : new Date()
            }
          })
          if (locationOrSkuChanged || liDelta !== 0) {
            if (locationOrSkuChanged) {
              if (oldLoc) {
                await upsertLocationInventoryDelta(
                  tx,
                  oldLoc,
                  oldSku,
                  existing.itemName || oldSku,
                  -existing.quantity,
                  undefined
                )
              }
              await upsertLocationInventoryDelta(
                tx,
                locationId,
                line.sku,
                line.itemName,
                targetQty,
                line.unitCost
              )
            } else {
              await upsertLocationInventoryDelta(
                tx,
                locationId,
                line.sku,
                line.itemName,
                liDelta,
                line.unitCost
              )
            }
            await reconcileInventoryMasterTx(tx, line.sku)
            if (oldSku !== line.sku) await reconcileInventoryMasterTx(tx, oldSku)
          }
          result.updated++
          opts.audit?.('update', existing.id, {
            movementId,
            sku: line.sku,
            quantity: targetQty,
            jobCardId: jobCard.id
          })
          continue
        }

        const item = await findCanonicalInventoryItemBySkuTx(tx, line.sku)
        if (!item) {
          result.errors.push({
            lineIndex: line.lineIndex,
            sku: line.sku,
            message: 'Inventory item not found for SKU'
          })
          continue
        }

        const movement = await createStockMovementTx(tx, {
          movementId: movementId || undefined,
          date: applyJobCardDate ? movementDate : new Date(),
          type: 'consumption',
          itemName: line.itemName,
          sku: line.sku,
          quantity: targetQty,
          fromLocation: locationId,
          toLocation: '',
          reference,
          performedBy,
          notes,
          ownerId: null
        })

        await upsertLocationInventoryDelta(
          tx,
          locationId,
          line.sku,
          line.itemName,
          targetQty,
          line.unitCost
        )
        await reconcileInventoryMasterTx(tx, line.sku)

        result.created++
        opts.audit?.('create', movement.id, {
          movementId: movement.movementId,
          sku: line.sku,
          quantity: targetQty,
          jobCardId: jobCard.id
        })
      } catch (e) {
        result.errors.push({
          lineIndex: line.lineIndex,
          sku: line.sku,
          message: e?.message || String(e)
        })
      }
    }

    const movementPrefix = `MOV-JC-${String(jobCard.id)}-`
    const linkedMovements = await tx.stockMovement.findMany({
      where: { movementId: { startsWith: movementPrefix } }
    })
    for (const mov of linkedMovements) {
      if (!mov.movementId || activeMovementIds.has(mov.movementId)) continue
      await reverseMovementOnLocationInventory(tx, mov)
      await tx.stockMovement.delete({ where: { id: mov.id } })
      await reconcileInventoryMasterTx(tx, mov.sku)
      result.removed++
      opts.audit?.('delete', mov.id, {
        movementId: mov.movementId,
        sku: mov.sku,
        jobCardId: jobCard.id,
        reason: 'stock_line_removed'
      })
    }
  })

  if (result.errors.length > 0) {
    console.warn('syncJobCardStockMovements: some lines failed', {
      jobCardId: jobCard.id,
      errors: result.errors
    })
  }

  return result
}
