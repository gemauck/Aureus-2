// Purchase Orders API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound, forbidden } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isAdminUser } from './_lib/adminRoles.js'
// Mutations: after successful create/update/delete, call logAuditFromRequest (see .cursorrules / manufacturingAuditLog.js).
import { logAuditFromRequest } from './_lib/manufacturingAuditLog.js'
import { computedInventoryTotalValue } from './_lib/inventoryValue.js'

const S_DRAFT = 'draft'
const S_FINAL = 'final'
const S_SENT = 'sent'
const S_GOODS_RECEIVED = 'goods_received'
const S_CANCELLED = 'cancelled'

/** South African standard VAT rate for purchase order totals (line amounts are ex VAT). */
const PO_VAT_RATE = 0.15

function vatAmountFromSubtotal(subtotal) {
  const s = parseFloat(subtotal) || 0
  return Math.round(s * PO_VAT_RATE * 100) / 100
}

/** Fields non-admins cannot change once PO is final or sent */
const NON_ADMIN_LOCKED = new Set([
  'supplierId',
  'supplierName',
  'items',
  'subtotal',
  'tax',
  'total',
  'includeVat',
  'receivingLocationId',
  'orderDate',
  'expectedDate',
  'priority',
  'shippingAddress',
  'shippingMethod',
  'sourceDocumentUrl'
])

/** Only allow stored app upload paths (mitigate arbitrary URL injection). */
function sanitizeSourceDocumentUrl(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (!s || s.length > 2048) return null
  if (!s.startsWith('/uploads/po-source-documents/')) return null
  if (s.includes('..') || s.includes('\\')) return null
  return s
}

function parseItemsJson(order) {
  const raw = order.items
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '[]')
    } catch {
      return []
    }
  }
  return Array.isArray(raw) ? raw : []
}

function normalizeDateForCompare(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value)
  return s.split('T')[0] || s
}

function normalizeLineForSnapshot(line) {
  const qty = parseFloat(line.quantity) || 0
  const unit = parseFloat(line.unitPrice) || 0
  return {
    sku: line.sku || '',
    name: line.name || line.itemName || '',
    quantity: qty,
    unitPrice: unit,
    total: parseFloat(line.total) || qty * unit,
    supplierPartNumber: line.supplierPartNumber || ''
  }
}

/** Plain snapshot for before/after amendment diffs (audit trail). */
function snapshotPurchaseOrder(order) {
  const items = parseItemsJson(order).map(normalizeLineForSnapshot)
  return {
    supplierId: order.supplierId || '',
    supplierName: order.supplierName || '',
    status: order.status || '',
    priority: order.priority || 'normal',
    orderDate: normalizeDateForCompare(order.orderDate),
    expectedDate: order.expectedDate ? normalizeDateForCompare(order.expectedDate) : null,
    sentAt: order.sentAt ? normalizeDateForCompare(order.sentAt) : null,
    subtotal: parseFloat(order.subtotal) || 0,
    tax: parseFloat(order.tax) || 0,
    total: parseFloat(order.total) || 0,
    includeVat: order.includeVat === true,
    items,
    notes: order.notes || '',
    internalNotes: order.internalNotes || '',
    sourceDocumentUrl: order.sourceDocumentUrl || '',
    receivingLocationId: order.receivingLocationId || null,
    shippingAddress: order.shippingAddress || '',
    shippingMethod: order.shippingMethod || ''
  }
}

function diffPurchaseOrderSnapshots(beforeSnap, afterSnap) {
  const changes = []
  const scalarKeys = [
    'supplierId',
    'supplierName',
    'status',
    'priority',
    'orderDate',
    'expectedDate',
    'sentAt',
    'subtotal',
    'tax',
    'total',
    'includeVat',
    'notes',
    'internalNotes',
    'sourceDocumentUrl',
    'receivingLocationId',
    'shippingAddress',
    'shippingMethod'
  ]
  for (const k of scalarKeys) {
    const a = beforeSnap[k]
    const b = afterSnap[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ path: k, oldValue: a, newValue: b })
    }
  }
  const ib = JSON.stringify(beforeSnap.items)
  const ia = JSON.stringify(afterSnap.items)
  if (ib !== ia) {
    changes.push({ path: 'items', oldValue: beforeSnap.items, newValue: afterSnap.items })
  }
  return changes
}

/** Final/Sent POs need a stated reason if anything other than status/sentAt/internalNotes changes. */
function amendmentChangesRequireReason(oldStatus, changes) {
  if (oldStatus !== S_FINAL && oldStatus !== S_SENT) return false
  const material = changes.filter((c) => {
    if (c.path === 'status' || c.path === 'sentAt') return false
    if (c.path === 'internalNotes') return false
    return true
  })
  return material.length > 0
}

function allowedStatusStep(from, to) {
  if (from === to) return true
  if (from === S_CANCELLED) return false
  if (to === S_CANCELLED) {
    return from === S_DRAFT || from === S_FINAL || from === S_SENT
  }
  if (from === S_DRAFT && to === S_FINAL) return true
  if (from === S_FINAL && to === S_SENT) return true
  if (from === S_SENT && to === S_GOODS_RECEIVED) return true
  return false
}

/**
 * @param {Array} items - order lines (ordered qty)
 * @param {Array} receivedLines - { sku, quantityReceived, unitPrice }
 * @param {number|undefined} taxOverride
 * @param {object} existingOrder - for default tax
 */
function mergeReceipt(items, receivedLines, taxOverride, existingOrder) {
  if (!Array.isArray(receivedLines) || receivedLines.length === 0) {
    throw new Error('receivedLines array is required')
  }
  const bySku = new Map(receivedLines.map((r) => [r.sku, r]))
  let subtotal = 0
  const merged = []

  for (const line of items) {
    const sku = line.sku
    if (!sku) throw new Error('Each line item must have a sku')
    const r = bySku.get(sku)
    if (!r) throw new Error(`Missing receipt confirmation for SKU ${sku}`)

    const ordered = parseFloat(line.quantity) || 0
    const qtyRec = parseFloat(r.quantityReceived)
    const unitP = parseFloat(r.unitPrice)
    if (Number.isNaN(qtyRec) || qtyRec < 0) throw new Error(`Invalid quantity received for ${sku}`)
    if (qtyRec > ordered) throw new Error(`Quantity received cannot exceed ordered quantity for ${sku}`)
    if (Number.isNaN(unitP) || unitP < 0) throw new Error(`Invalid unit price for ${sku}`)

    const lineTotal = qtyRec * unitP
    subtotal += lineTotal
    merged.push({
      ...line,
      quantityReceived: qtyRec,
      receivedUnitPrice: unitP,
      receivedLineTotal: lineTotal
    })
  }

  let tax
  if (taxOverride !== undefined && taxOverride !== null && !Number.isNaN(parseFloat(taxOverride))) {
    tax = parseFloat(taxOverride)
  } else if (existingOrder.includeVat === true) {
    tax = vatAmountFromSubtotal(subtotal)
  } else {
    tax = parseFloat(existingOrder.tax) || 0
  }
  const total = subtotal + tax

  return { items: merged, subtotal, tax, total }
}

async function runGoodsReceiptInTransaction(tx, { existingOrder, mergedItems, subtotal, tax, total, updateData, req, id }) {
  let toLocationId = existingOrder.receivingLocationId || null
  let mainWarehouse = null
  if (toLocationId) {
    mainWarehouse = await tx.stockLocation.findUnique({ where: { id: toLocationId } })
  }
  if (!mainWarehouse) {
    mainWarehouse = await tx.stockLocation.findFirst({
      where: { code: 'LOC001' }
    })
    toLocationId = mainWarehouse?.id || null
  }

  async function upsertLocationInventory(locationId, sku, itemName, quantityDelta, unitCost, reorderPoint) {
    if (!locationId) return null

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
          reorderPoint: reorderPoint || 0,
          status: 'out_of_stock'
        }
      })
    }

    const now = new Date()
    const newQty = (li.quantity || 0) + quantityDelta
    const status =
      newQty > (li.reorderPoint || reorderPoint || 0) ? 'in_stock' : newQty > 0 ? 'low_stock' : 'out_of_stock'

    return await tx.locationInventory.update({
      where: { id: li.id },
      data: {
        quantity: newQty,
        unitCost: unitCost !== undefined ? unitCost : li.unitCost,
        reorderPoint: reorderPoint !== undefined ? reorderPoint : li.reorderPoint,
        status,
        itemName: itemName || li.itemName,
        lastRestocked: quantityDelta > 0 ? now : li.lastRestocked
      }
    })
  }

  const lastMovement = await tx.stockMovement.findFirst({
    orderBy: { createdAt: 'desc' }
  })
  let seq =
    lastMovement && lastMovement.movementId?.startsWith('MOV')
      ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
      : 1

  const now = new Date()

  for (const item of mergedItems) {
    const quantity = parseFloat(item.quantityReceived) || 0
    if (!item.sku || quantity <= 0) {
      continue
    }

    const unitCost = parseFloat(item.receivedUnitPrice) || 0

    await tx.stockMovement.create({
      data: {
        movementId: `MOV${String(seq++).padStart(4, '0')}`,
        date: now,
        type: 'receipt',
        itemName: item.name || item.sku,
        sku: item.sku,
        quantity: quantity,
        fromLocation: '',
        toLocation: mainWarehouse?.code || '',
        reference: existingOrder.orderNumber || id,
        performedBy: req.user?.name || 'System',
        notes: `Stock received from purchase order ${existingOrder.orderNumber || id} - Supplier: ${existingOrder.supplierName || 'N/A'}`,
        ownerId: null
      }
    })

    let inventoryItem = await tx.inventoryItem.findFirst({
      where: { sku: item.sku }
    })

    if (!inventoryItem) {
      const totalValue = computedInventoryTotalValue(quantity, unitCost)
      inventoryItem = await tx.inventoryItem.create({
        data: {
          sku: item.sku,
          name: item.name || item.sku,
          category: 'components',
          type: 'raw_material',
          quantity: quantity,
          unit: 'pcs',
          reorderPoint: 0,
          reorderQty: 0,
          unitCost: unitCost,
          totalValue: totalValue,
          status: quantity > 0 ? 'in_stock' : 'out_of_stock',
          lastRestocked: now,
          ownerId: null,
          locationId: toLocationId
        }
      })
    } else {
      const newQuantity = (inventoryItem.quantity || 0) + quantity
      const newUnitCost = unitCost > 0 ? unitCost : inventoryItem.unitCost || 0
      const totalValue = computedInventoryTotalValue(newQuantity, newUnitCost)
      const reorderPoint = inventoryItem.reorderPoint || 0
      const status =
        newQuantity > reorderPoint ? 'in_stock' : newQuantity > 0 ? 'low_stock' : 'out_of_stock'

      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          quantity: newQuantity,
          unitCost: newUnitCost,
          totalValue: totalValue,
          status: status,
          lastRestocked: now
        }
      })
    }

    if (toLocationId) {
      await upsertLocationInventory(
        toLocationId,
        item.sku,
        item.name || item.sku,
        quantity,
        unitCost,
        inventoryItem?.reorderPoint || 0
      )

      const totalAtLocations = await tx.locationInventory.aggregate({
        _sum: { quantity: true },
        where: { sku: item.sku }
      })
      const aggQty = totalAtLocations._sum.quantity || 0

      const costForValue = unitCost > 0 ? unitCost : inventoryItem.unitCost || 0
      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          quantity: aggQty,
          totalValue: computedInventoryTotalValue(aggQty, costForValue),
          status:
            aggQty > (inventoryItem.reorderPoint || 0) ? 'in_stock' : aggQty > 0 ? 'low_stock' : 'out_of_stock'
        }
      })
    }
  }

  const finalUpdate = {
    ...updateData,
    status: S_GOODS_RECEIVED,
    items: JSON.stringify(mergedItems),
    subtotal,
    tax,
    total,
    receivedDate: updateData.receivedDate || now
  }

  await tx.purchaseOrder.update({
    where: { id },
    data: finalUpdate
  })
}

async function handler(req, res) {
  try {
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    const locationInclude = {
      select: { id: true, name: true, code: true, address: true }
    }

    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'purchase-orders') {
      try {
        const purchaseOrders = await prisma.purchaseOrder.findMany({
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                code: true
              }
            },
            receivingLocation: locationInclude
          },
          orderBy: { createdAt: 'desc' }
        })
        const withParsed = purchaseOrders.map((po) => ({
          ...po,
          items: parseItemsJson(po)
        }))
        return ok(res, { purchaseOrders: withParsed })
      } catch (dbError) {
        console.error('❌ Database error listing purchase orders:', dbError)
        return serverError(res, 'Failed to list purchase orders', dbError.message)
      }
    }

    if (
      req.method === 'GET' &&
      pathSegments.length === 3 &&
      pathSegments[0] === 'purchase-orders' &&
      pathSegments[2] === 'amendments'
    ) {
      const poId = pathSegments[1]
      try {
        const exists = await prisma.purchaseOrder.findUnique({
          where: { id: poId },
          select: { id: true, orderNumber: true }
        })
        if (!exists) return notFound(res, 'Purchase order not found')

        const logs = await prisma.auditLog.findMany({
          where: { entity: 'purchase_orders', entityId: poId },
          include: {
            actor: { select: { id: true, name: true, email: true, role: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 100
        })

        const amendments = logs.map((log) => {
          let diff = {}
          try {
            diff = JSON.parse(log.diff || '{}')
          } catch {
            diff = {}
          }
          const details = diff.details && typeof diff.details === 'object' ? diff.details : {}
          return {
            id: log.id,
            action: log.action,
            createdAt: log.createdAt,
            actorName: log.actor?.name || log.actor?.email || diff.user || 'Unknown',
            actorRole: log.actor?.role || diff.userRole || '',
            summary: details.summary || `${log.action} purchase order`,
            amendmentReason: details.amendmentReason || null,
            statusDuringAmendment: details.statusDuringAmendment || null,
            changes: Array.isArray(details.changes) ? details.changes : [],
            orderNumber: details.orderNumber || exists.orderNumber
          }
        })

        return ok(res, { amendments })
      } catch (dbError) {
        console.error('❌ Database error listing PO amendments:', dbError)
        return serverError(res, 'Failed to list purchase order amendments', dbError.message)
      }
    }

    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'purchase-orders') {
      const body = await parseJsonBody(req)

      let orderNumber = body.orderNumber
      if (!orderNumber) {
        const lastOrder = await prisma.purchaseOrder.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { orderNumber: true }
        })

        if (lastOrder && lastOrder.orderNumber && lastOrder.orderNumber.startsWith('PO')) {
          const match = lastOrder.orderNumber.match(/PO(\d+)/)
          const nextNum = match ? parseInt(match[1]) + 1 : 1
          orderNumber = `PO${String(nextNum).padStart(4, '0')}`
        } else {
          orderNumber = 'PO0001'
        }
      }

      let items = body.items || []
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items)
        } catch {
          items = []
        }
      }

      const purchaseOrderData = {
        orderNumber,
        supplierId: body.supplierId || '',
        supplierName: body.supplierName || '',
        status: S_DRAFT,
        priority: body.priority || 'normal',
        orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
        expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
        subtotal: parseFloat(body.subtotal) || 0,
        tax: parseFloat(body.tax) || 0,
        total: parseFloat(body.total) || 0,
        includeVat: body.includeVat === true,
        items: Array.isArray(items) ? JSON.stringify(items) : '[]',
        shippingAddress: body.shippingAddress || '',
        shippingMethod: body.shippingMethod || '',
        notes: body.notes || '',
        internalNotes: body.internalNotes || '',
        sourceDocumentUrl: sanitizeSourceDocumentUrl(body.sourceDocumentUrl),
        receivingLocationId: body.receivingLocationId || null,
        ownerId: req.user?.sub || null
      }

      try {
        const purchaseOrder = await prisma.purchaseOrder.create({
          data: purchaseOrderData
        })

        const full = await prisma.purchaseOrder.findUnique({
          where: { id: purchaseOrder.id },
          include: { supplier: true, receivingLocation: locationInclude }
        })

        const responseOrder = {
          ...full,
          items: parseItemsJson(full)
        }

        void logAuditFromRequest(prisma, req, {
          action: 'create',
          entity: 'purchase_orders',
          entityId: purchaseOrder.id,
          details: {
            resource: 'purchase-orders',
            method: req.method,
            path: urlPath,
            summary: `Purchase order ${purchaseOrder.orderNumber}`,
            orderNumber: purchaseOrder.orderNumber
          }
        })
        return created(res, { purchaseOrder: responseOrder })
      } catch (dbError) {
        console.error('❌ Database error creating purchase order:', dbError)
        return serverError(res, 'Failed to create purchase order', dbError.message)
      }
    }

    if (pathSegments.length === 2 && pathSegments[0] === 'purchase-orders' && id) {
      if (req.method === 'GET') {
        try {
          const purchaseOrder = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: {
              supplier: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  address: true,
                  contactPerson: true,
                  phone: true,
                  email: true
                }
              },
              receivingLocation: locationInclude
            }
          })
          if (!purchaseOrder) return notFound(res, 'Purchase order not found')

          const responseOrder = {
            ...purchaseOrder,
            items: parseItemsJson(purchaseOrder)
          }

          return ok(res, { purchaseOrder: responseOrder })
        } catch (dbError) {
          console.error('❌ Database error getting purchase order:', dbError)
          return serverError(res, 'Failed to get purchase order', dbError.message)
        }
      }

      if (req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        const amendmentReasonRaw =
          body.amendmentReason != null && String(body.amendmentReason).trim() !== ''
            ? String(body.amendmentReason).trim()
            : ''
        let amendmentChanges = []

        const existingOrder = await prisma.purchaseOrder.findUnique({ where: { id } })
        if (!existingOrder) {
          return notFound(res, 'Purchase order not found')
        }

        const oldStatus = existingOrder.status
        const admin = isAdminUser(req.user)

        if (oldStatus === S_GOODS_RECEIVED || oldStatus === S_CANCELLED) {
          const allowedTerminal = ['internalNotes']
          const attempted = Object.keys(body).filter((k) => body[k] !== undefined && k !== 'status')
          const bad = attempted.filter((k) => !allowedTerminal.includes(k))
          if (!admin && bad.length > 0) {
            const msg =
              oldStatus === S_CANCELLED
                ? 'This purchase order is cancelled and cannot be edited'
                : 'This purchase order is complete and cannot be edited'
            return forbidden(res, msg)
          }
          if (admin) {
            const onlyNotes = attempted.every((k) => allowedTerminal.includes(k))
            if (!onlyNotes) {
              const msg =
                oldStatus === S_CANCELLED
                  ? 'Only internal notes can be updated on a cancelled purchase order'
                  : 'Only internal notes can be updated after goods are received'
              return badRequest(res, msg)
            }
          }
        }

        const lockedPhase = oldStatus === S_FINAL || oldStatus === S_SENT
        if (lockedPhase && !admin) {
          for (const key of NON_ADMIN_LOCKED) {
            if (body[key] !== undefined) {
              return forbidden(res, 'Only administrators can change line items or supplier after the PO is finalized')
            }
          }
        }

        if (body.items !== undefined) {
          if (typeof body.items === 'string') {
            // keep
          } else if (Array.isArray(body.items)) {
            body.items = JSON.stringify(body.items)
          }
        }

        const newStatus = body.status !== undefined ? body.status : undefined

        if (newStatus !== undefined && newStatus !== oldStatus) {
          if (!allowedStatusStep(oldStatus, newStatus)) {
            return badRequest(
              res,
              `Invalid status transition: ${oldStatus} → ${newStatus}. Use draft → final → sent → goods_received, or cancel from draft, final, or sent (not after goods received).`
            )
          }
        }

        const updateData = {}

        const allowedFields = [
          'supplierId',
          'supplierName',
          'status',
          'priority',
          'orderDate',
          'expectedDate',
          'receivedDate',
          'sentAt',
          'subtotal',
          'tax',
          'total',
          'includeVat',
          'items',
          'shippingAddress',
          'shippingMethod',
          'notes',
          'internalNotes',
          'sourceDocumentUrl',
          'receivingLocationId'
        ]

        for (const field of allowedFields) {
          if (body[field] !== undefined) {
            if (field === 'sourceDocumentUrl') {
              updateData[field] = sanitizeSourceDocumentUrl(body[field])
            } else if (field.includes('Date') && field !== 'receivingLocationId' && body[field]) {
              updateData[field] = new Date(body[field])
            } else if (field === 'receivingLocationId') {
              updateData[field] = body[field] || null
            } else {
              updateData[field] = body[field]
            }
          }
        }

        if (newStatus === S_SENT && oldStatus === S_FINAL) {
          updateData.sentAt = body.sentAt ? new Date(body.sentAt) : new Date()
        }

        if (newStatus === S_CANCELLED && oldStatus !== S_CANCELLED) {
          const disallowedWithCancel = Object.keys(updateData).filter(
            (k) => k !== 'status' && k !== 'internalNotes'
          )
          if (disallowedWithCancel.length > 0) {
            return badRequest(
              res,
              'To cancel, send only status "cancelled" (you may also update internalNotes in the same request).'
            )
          }
        }

        const transitioningToReceived = newStatus === S_GOODS_RECEIVED && oldStatus === S_SENT

        if (transitioningToReceived) {
          const itemsArr = parseItemsJson(existingOrder)
          let merged
          try {
            merged = mergeReceipt(itemsArr, body.receivedLines, body.tax !== undefined ? body.tax : undefined, existingOrder)
          } catch (e) {
            return badRequest(res, e.message || 'Invalid receipt data')
          }

          updateData.items = JSON.stringify(merged.items)
          updateData.subtotal = merged.subtotal
          updateData.tax = merged.tax
          updateData.total = merged.total
          updateData.status = S_GOODS_RECEIVED

          try {
            await prisma.$transaction(
              async (tx) => {
                await runGoodsReceiptInTransaction(tx, {
                  existingOrder,
                  mergedItems: merged.items,
                  subtotal: merged.subtotal,
                  tax: merged.tax,
                  total: merged.total,
                  updateData: { ...updateData, receivedDate: body.receivedDate ? new Date(body.receivedDate) : undefined },
                  req,
                  id
                })
              },
              { timeout: 30000 }
            )

            const purchaseOrder = await prisma.purchaseOrder.findUnique({
              where: { id },
              include: { supplier: true, receivingLocation: locationInclude }
            })
            const responseOrder = {
              ...purchaseOrder,
              items: parseItemsJson(purchaseOrder)
            }
            void logAuditFromRequest(prisma, req, {
              action: 'update',
              entity: 'purchase_orders',
              entityId: id,
              details: {
                resource: 'purchase-orders',
                method: req.method,
                path: urlPath,
                summary: `Goods received ${purchaseOrder.orderNumber}`,
                orderNumber: purchaseOrder.orderNumber,
                statusFrom: oldStatus,
                statusTo: S_GOODS_RECEIVED
              }
            })
            return ok(res, { purchaseOrder: responseOrder })
          } catch (stockMovementError) {
            console.error('❌ Error creating stock movements:', stockMovementError)
            return serverError(
              res,
              'Failed to record goods receipt',
              stockMovementError.message
            )
          }
        }

        if (Object.keys(updateData).length > 0) {
          const mergedForDiff = { ...existingOrder, ...updateData }
          if (updateData.items !== undefined) {
            mergedForDiff.items = updateData.items
          }
          const beforeSnap = snapshotPurchaseOrder(existingOrder)
          const afterSnap = snapshotPurchaseOrder(mergedForDiff)
          amendmentChanges = diffPurchaseOrderSnapshots(beforeSnap, afterSnap)

          if (amendmentChanges.length > 0 && amendmentChangesRequireReason(oldStatus, amendmentChanges)) {
            if (!amendmentReasonRaw) {
              return badRequest(
                res,
                'Amendment reason is required when changing a Final or Sent purchase order (aside from status-only or internal notes-only updates).'
              )
            }
          }
        }

        if (Object.keys(updateData).length === 0) {
          const full = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { supplier: true, receivingLocation: locationInclude }
          })
          const responseOrder = {
            ...full,
            items: parseItemsJson(full)
          }
          return ok(res, { purchaseOrder: responseOrder })
        }

        try {
          const purchaseOrder = await prisma.purchaseOrder.update({
            where: { id },
            data: updateData
          })
          const full = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { supplier: true, receivingLocation: locationInclude }
          })
          const responseOrder = {
            ...full,
            items: parseItemsJson(full)
          }
          void logAuditFromRequest(prisma, req, {
            action: 'amend',
            entity: 'purchase_orders',
            entityId: id,
            details: {
              resource: 'purchase-orders',
              method: req.method,
              path: urlPath,
              summary:
                amendmentChanges.length > 0
                  ? `PO ${full.orderNumber} amended (${amendmentChanges.length} change group(s))`
                  : `PO ${full.orderNumber} updated`,
              orderNumber: full.orderNumber,
              amendmentReason: amendmentReasonRaw || null,
              statusDuringAmendment: oldStatus,
              statusTo: full.status,
              changes: amendmentChanges
            }
          })
          return ok(res, { purchaseOrder: responseOrder })
        } catch (dbError) {
          console.error('❌ Database error updating purchase order:', dbError)
          return serverError(res, 'Failed to update purchase order', dbError.message)
        }
      }

      if (req.method === 'DELETE') {
        try {
          const existingOrder = await prisma.purchaseOrder.findUnique({ where: { id } })
          if (!existingOrder) return notFound(res, 'Purchase order not found')
          if (existingOrder.status !== S_DRAFT) {
            if (!isAdminUser(req.user)) {
              return forbidden(res, 'Only draft purchase orders can be deleted')
            }
          }
          await prisma.purchaseOrder.delete({ where: { id } })
          void logAuditFromRequest(prisma, req, {
            action: 'delete',
            entity: 'purchase_orders',
            entityId: id,
            details: {
              resource: 'purchase-orders',
              method: req.method,
              path: urlPath,
              summary: `Deleted purchase order ${existingOrder.orderNumber || id}`,
              orderNumber: existingOrder.orderNumber
            }
          })
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting purchase order:', dbError)
          return serverError(res, 'Failed to delete purchase order', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or purchase order action')
  } catch (e) {
    console.error('❌ Purchase Orders API error:', e)
    return serverError(res, 'Purchase order handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
