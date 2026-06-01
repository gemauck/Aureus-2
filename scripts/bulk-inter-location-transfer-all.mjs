#!/usr/bin/env node
/**
 * Transfer **all positive** `LocationInventory` quantity from one stock location to another,
 * one SKU per transaction — mirrors Manufacturing POST `stock-transactions` `type: transfer`
 * (LI updates, canonical aggregate, `StockMovement`, unit cost sync).
 *
 * Usage:
 *   node scripts/bulk-inter-location-transfer-all.mjs --from-code=02_LOC2 --to-code=01_LOC1
 *   node scripts/bulk-inter-location-transfer-all.mjs --from-code=02_LOC2 --to-code=01_LOC1 --write
 *
 * Env:
 *   ERP_SCRIPT_ACTOR_ID  Optional User id for AuditLog rows (defaults to first admin/super_admin, else first user).
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../api/_lib/prisma.js'
import { computedInventoryTotalValue } from '../api/_lib/inventoryValue.js'
import {
  findCanonicalInventoryItemBySkuTx,
  getStatusFromQuantity
} from '../api/_lib/stockCountAdjustment.js'
import { buildMovementId, createStockMovementTx } from '../api/_lib/movementId.js'

const EPS = 0.0001

function parseFiniteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

async function resolveActorId() {
  const envId = String(process.env.ERP_SCRIPT_ACTOR_ID || '').trim()
  if (envId) {
    const u = await prisma.user.findUnique({ where: { id: envId }, select: { id: true } })
    if (u) return u.id
    console.warn('⚠️ ERP_SCRIPT_ACTOR_ID not found in User table; picking default actor')
  }
  const admin = await prisma.user.findFirst({
    where: { role: { in: ['admin', 'super_admin'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  })
  if (admin) return admin.id
  const any = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  return any?.id || null
}

async function auditScriptTransfer(prisma, actorId, movementRow, extra) {
  if (!actorId) {
    console.warn('⚠️ No actor id — skipping AuditLog (transfers still applied)')
    return
  }
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'create',
        entity: 'manufacturing',
        entityId: String(movementRow.id),
        diff: JSON.stringify({
          user: 'bulk-inter-location-transfer-all.mjs',
          userId: actorId,
          userRole: 'script',
          details: {
            resource: 'stock-transactions',
            method: 'SCRIPT',
            path: 'scripts/bulk-inter-location-transfer-all.mjs',
            summary: `transfer ${extra.sku} qty ${extra.qty} ${extra.fromCode} → ${extra.toCode}`,
            movementId: movementRow.movementId,
            sku: extra.sku,
            transactionType: 'transfer',
            script: 'bulk-inter-location-transfer-all.mjs'
          },
          ipAddress: 'N/A',
          sessionId: 'N/A',
          success: true
        })
      }
    })
  } catch (e) {
    console.warn('⚠️ AuditLog write failed (non-fatal):', e?.message || e)
  }
}

async function upsertLocationSkuTx(tx, { locationId, sku, itemName, master, reorderPoint }) {
  const catalogCost = master ? parseFiniteNumber(master.unitCost, 0) : 0
  return tx.locationInventory.upsert({
    where: { locationId_sku: { locationId, sku } },
    update: {
      itemName,
      unitCost: catalogCost,
      reorderPoint: parseFiniteNumber(reorderPoint, 0)
    },
    create: {
      locationId,
      sku,
      itemName,
      quantity: 0,
      unitCost: catalogCost,
      reorderPoint: parseFiniteNumber(reorderPoint, 0),
      status: 'in_stock'
    }
  })
}

async function runTransferTx(tx, { fromLocationId, toLocationId, sku, itemName, qty, reference, performedBy }) {
  const master = await findCanonicalInventoryItemBySkuTx(tx, sku)
  const fromLi = await upsertLocationSkuTx(tx, {
    locationId: fromLocationId,
    sku,
    itemName,
    master,
    reorderPoint: 0
  })
  if ((fromLi.quantity || 0) + EPS < qty) {
    throw new Error(`Insufficient stock at source: ${sku} have ${fromLi.quantity} need ${qty}`)
  }
  const toLi = await upsertLocationSkuTx(tx, {
    locationId: toLocationId,
    sku,
    itemName,
    master,
    reorderPoint: 0
  })

  const fromNew = fromLi.quantity - qty
  const toNew = toLi.quantity + qty

  await tx.locationInventory.update({
    where: { id: fromLi.id },
    data: {
      quantity: fromNew,
      status: getStatusFromQuantity(fromNew, fromLi.reorderPoint || 0)
    }
  })
  await tx.locationInventory.update({
    where: { id: toLi.id },
    data: {
      quantity: toNew,
      status: getStatusFromQuantity(toNew, toLi.reorderPoint || 0)
    }
  })

  const totalAtLocations = await tx.locationInventory.aggregate({
    _sum: { quantity: true },
    where: { sku }
  })
  const aggQty = totalAtLocations._sum.quantity || 0
  if (master) {
    await tx.inventoryItem.update({
      where: { id: master.id },
      data: {
        quantity: aggQty,
        totalValue: computedInventoryTotalValue(aggQty, master.unitCost),
        status: getStatusFromQuantity(aggQty, master.reorderPoint || 0)
      }
    })
  }

  const now = new Date()
  const movement = await createStockMovementTx(tx, {
    movementId: buildMovementId(),
    date: now,
    type: 'transfer',
    itemName,
    sku,
    quantity: qty,
    fromLocation: fromLocationId,
    toLocation: toLocationId,
    reference: reference || '',
    performedBy: performedBy || 'bulk-inter-location-transfer-all.mjs',
    notes: `Bulk transfer all on-hand from source location to destination`
  })

  return { movement }
}

async function main() {
  const write = process.argv.includes('--write')
  const fromCode =
    process.argv.find((a) => a.startsWith('--from-code='))?.slice('--from-code='.length)?.trim() || '02_LOC2'
  const toCode =
    process.argv.find((a) => a.startsWith('--to-code='))?.slice('--to-code='.length)?.trim() || '01_LOC1'

  const fromLoc = await prisma.stockLocation.findFirst({
    where: { code: fromCode },
    select: { id: true, code: true, name: true }
  })
  const toLoc = await prisma.stockLocation.findFirst({
    where: { code: toCode },
    select: { id: true, code: true, name: true }
  })
  if (!fromLoc || !toLoc) {
    console.error(JSON.stringify({ ok: false, error: 'from or to location not found', fromCode, toCode }, null, 2))
    process.exit(1)
  }
  if (fromLoc.id === toLoc.id) {
    console.error(JSON.stringify({ ok: false, error: 'from and to must differ' }, null, 2))
    process.exit(1)
  }

  const sourceRows = await prisma.locationInventory.findMany({
    where: { locationId: fromLoc.id, quantity: { gt: EPS } },
    select: { id: true, sku: true, itemName: true, quantity: true },
    orderBy: { sku: 'asc' }
  })

  const actorId = await resolveActorId()
  const reference = 'BULK_LOC_TRANSFER'
  const performedBy = 'bulk-inter-location-transfer-all.mjs'

  const report = {
    dryRun: !write,
    from: fromLoc,
    to: toLoc,
    skuCount: sourceRows.length,
    results: [],
    errors: []
  }

  if (!write) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          hint: 'Re-run with --write to apply.',
          from: fromLoc,
          to: toLoc,
          transfers: sourceRows.map((r) => ({ sku: r.sku, qty: r.quantity, itemName: r.itemName }))
        },
        null,
        2
      )
    )
    await prisma.$disconnect()
    return
  }

  for (const row of sourceRows) {
    const qty = parseFloat(row.quantity) || 0
    if (qty <= EPS) continue
    const sku = String(row.sku || '').trim()
    const itemName = String(row.itemName || sku).trim() || sku
    try {
      const { movement } = await prisma.$transaction((tx) =>
        runTransferTx(tx, {
          fromLocationId: fromLoc.id,
          toLocationId: toLoc.id,
          sku,
          itemName,
          qty,
          reference,
          performedBy
        })
      )
      void auditScriptTransfer(prisma, actorId, movement, {
        sku,
        qty,
        fromCode: fromLoc.code,
        toCode: toLoc.code
      })
      report.results.push({ sku, qty, movementId: movement.movementId, id: movement.id })
    } catch (e) {
      report.errors.push({ sku, qty, error: e?.message || String(e) })
    }
  }

  const outDir = path.join(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `bulk-loc-transfer-${fromLoc.code}-to-${toLoc.code}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')

  console.log(JSON.stringify({ ...report, reportFile: outFile }, null, 2))
  await prisma.$disconnect()
  process.exit(report.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
