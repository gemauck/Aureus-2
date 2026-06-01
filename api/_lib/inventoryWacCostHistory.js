import {
  computeWeightedAverageUnitCost,
  findCanonicalInventoryItemBySkuTx
} from './weightedAverageUnitCost.js'

function parsePoItems(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseAuditDetails(diff) {
  try {
    const d = typeof diff === 'string' ? JSON.parse(diff) : diff
    const details = d?.details && typeof d.details === 'object' ? d.details : d
    return details || {}
  } catch {
    return {}
  }
}

function parseCostFromMovementNotes(notes) {
  const text = String(notes || '')
  const prod = /Cost:\s*([\d.]+)\s*per unit/i.exec(text)
  if (prod) return parseFloat(prod[1]) || 0
  return 0
}

function eventDateValue(d) {
  const t = new Date(d || 0).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * Build priced inbound events + WAC replay steps for one SKU (export / detail download).
 */
export async function buildInventoryWacCostHistory(prisma, sku) {
  const skuNorm = String(sku || '').trim()
  if (!skuNorm) throw new Error('sku required')

  const item = await findCanonicalInventoryItemBySkuTx(prisma, skuNorm)
  const totalAtLocations = await prisma.locationInventory.aggregate({
    _sum: { quantity: true },
    where: { sku: skuNorm }
  })
  const currentQty = totalAtLocations._sum.quantity || 0

  const events = []

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { status: 'goods_received' },
    select: {
      id: true,
      orderNumber: true,
      supplierName: true,
      receivedDate: true,
      updatedAt: true,
      items: true
    },
    orderBy: { receivedDate: 'asc' }
  })

  for (const po of purchaseOrders) {
    const lines = parsePoItems(po.items)
    const receiptDate = po.receivedDate || po.updatedAt
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (String(line.sku || '').trim() !== skuNorm) continue
      const qty = parseFloat(line.quantityReceived) || 0
      if (qty <= 0) continue
      const price = parseFloat(line.receivedUnitPrice ?? line.unitPrice) || 0
      events.push({
        eventId: `po-${po.id}-${i}`,
        date: receiptDate,
        eventType: 'purchase_receipt',
        source: po.orderNumber || po.id,
        inboundQty: qty,
        unitPrice: price,
        performedBy: '',
        notes: `Supplier: ${po.supplierName || 'N/A'}`,
        userReason:
          price > 0
            ? 'Purchase order goods receipt'
            : 'PO receipt recorded without unit price (average unchanged in replay)'
      })
    }
  }

  const movements = await prisma.stockMovement.findMany({
    where: { sku: skuNorm },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  })

  const poReceiptKeys = new Set(
    events
      .filter((e) => e.eventType === 'purchase_receipt')
      .map((e) => `${e.source}|${e.inboundQty}`)
  )

  for (const m of movements) {
    const qty = Number(m.quantity) || 0
    const type = String(m.type || '').toLowerCase()
    if (type === 'receipt' && qty <= 0) continue
    if (type === 'adjustment' && qty <= 0) continue
    if (type !== 'receipt' && type !== 'adjustment') continue

    const ref = String(m.reference || '').trim()
    const inboundQty = Math.abs(qty)
    if (ref && poReceiptKeys.has(`${ref}|${inboundQty}`)) continue

    const price = parseCostFromMovementNotes(m.notes)
    events.push({
      eventId: `mov-${m.id}`,
      date: m.date || m.createdAt,
      eventType: type === 'adjustment' ? 'stock_count_or_adjustment' : 'stock_receipt',
      source: ref || m.movementId,
      inboundQty,
      unitPrice: price,
      performedBy: m.performedBy || '',
      notes: String(m.notes || '').slice(0, 500),
      userReason:
        price > 0
          ? type === 'adjustment'
            ? 'Positive adjustment with unit cost (from import or receipt path)'
            : 'Stock receipt (unit price parsed from movement notes)'
          : 'Inbound quantity without stored unit price'
    })
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: { entity: 'manufacturing' },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' }
  })

  for (const log of auditLogs) {
    const details = parseAuditDetails(log.diff)
    if (String(details.sku || '').trim() !== skuNorm) continue
    const prev = details.previousUnitCost
    const next = details.newUnitCost
    const isOverride =
      details.costOverride === true ||
      (prev != null &&
        next != null &&
        Math.abs(Number(next) - Number(prev)) > 0.0001)
    if (!isOverride) continue

    events.push({
      eventId: `audit-${log.id}`,
      date: log.createdAt,
      eventType: 'manual_cost_override',
      source: details.path || 'inventory',
      inboundQty: null,
      unitPrice: null,
      performedBy: log.actor?.name || log.actor?.email || details.user || 'Unknown',
      notes: details.summary || '',
      userReason: 'Administrator manual average cost override',
      previousUnitCost: Number(prev) || 0,
      newUnitCost: Number(next) || 0
    })
  }

  events.sort((a, b) => eventDateValue(a.date) - eventDateValue(b.date))

  let onHand = 0
  let avgCost = 0
  const steps = []
  let seq = 0

  for (const ev of events) {
    seq += 1
    if (ev.eventType === 'manual_cost_override') {
      const averageCostAfter = Number(ev.newUnitCost) || avgCost
      steps.push({
        seq,
        date: ev.date,
        eventType: ev.eventType,
        source: ev.source,
        inboundQty: '',
        unitPrice: '',
        onHandBefore: onHand,
        averageCostBefore: avgCost,
        onHandAfter: onHand,
        averageCostAfter,
        performedBy: ev.performedBy,
        notes: ev.notes,
        userReason: ev.userReason,
        wacFormula: `Manual override: ${ev.previousUnitCost} → ${ev.newUnitCost}`
      })
      avgCost = averageCostAfter
      continue
    }

    const iq = Number(ev.inboundQty) || 0
    const ip = Number(ev.unitPrice) || 0
    const onHandBefore = onHand
    const averageCostBefore = avgCost
    let onHandAfter = onHand
    let averageCostAfter = avgCost
    let wacFormula = ''

    if (iq > 0 && ip > 0) {
      averageCostAfter = computeWeightedAverageUnitCost(onHand, avgCost, iq, ip)
      onHandAfter = onHand + iq
      onHand = onHandAfter
      avgCost = averageCostAfter
      wacFormula =
        onHandBefore <= 0
          ? `First priced inbound: average = ${ip}`
          : `(${onHandBefore}×${averageCostBefore} + ${iq}×${ip}) ÷ (${onHandBefore + iq}) = ${averageCostAfter}`
    } else if (iq > 0) {
      onHandAfter = onHand + iq
      onHand = onHandAfter
      wacFormula = 'Qty increased; average unchanged (no inbound price)'
    } else {
      wacFormula = '—'
    }

    steps.push({
      seq,
      date: ev.date,
      eventType: ev.eventType,
      source: ev.source,
      inboundQty: iq > 0 ? iq : '',
      unitPrice: ip > 0 ? ip : '',
      onHandBefore,
      averageCostBefore,
      onHandAfter,
      averageCostAfter,
      performedBy: ev.performedBy,
      notes: ev.notes,
      userReason: ev.userReason,
      wacFormula
    })
  }

  return {
    sku: skuNorm,
    name: item?.name || skuNorm,
    generatedAt: new Date().toISOString(),
    currentCatalog: {
      quantityOnHand: currentQty,
      averageUnitCost: Number(item?.unitCost) || 0,
      latestUnitPrice: Number(item?.lastInboundUnitPrice) || 0,
      lastInboundAt: item?.lastInboundAt || null
    },
    replayEndState: {
      quantityOnHand: onHand,
      averageUnitCost: avgCost
    },
    disclaimer:
      'Reconstructs priced inbounds from PO lines, stock movements (incl. production notes), and admin cost overrides. Movements without a stored price affect quantity only in this replay. Pre–WAC history may be incomplete.',
    steps
  }
}
