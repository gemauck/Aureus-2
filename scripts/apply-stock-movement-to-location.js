#!/usr/bin/env node
/**
 * Apply an existing stock movement's quantity to LocationInventory at a chosen location
 * (fixes cases where StockMovement was saved but per-location stock was not updated).
 *
 * Also sets StockMovement.fromLocation / toLocation to the resolved location ID when empty,
 * so inventory detail / ledger filters match.
 *
 * Usage:
 *   node scripts/apply-stock-movement-to-location.js --movement MOV0339 --location PMB
 *   node scripts/apply-stock-movement-to-location.js --movement MOV0339 --location PMB --write
 *   node scripts/apply-stock-movement-to-location.js --movement MOV0339 --location PMB --write --force
 *
 * Idempotency: after a successful --write, a marker is appended to movement.notes so the
 * same movement is not applied twice. Use --force to apply again.
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const MARKER_PREFIX = '#erp:li-applied:'

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag) => {
    const i = argv.indexOf(flag)
    if (i === -1) return null
    return argv[i + 1] || null
  }
  return {
    movementId: get('--movement'),
    location: get('--location'),
    write: argv.includes('--write'),
    force: argv.includes('--force')
  }
}

function getStatusFromQuantity(quantity = 0, reorderPoint = 0) {
  if (quantity > (reorderPoint || 0)) return 'in_stock'
  if (quantity > 0) return 'low_stock'
  return 'out_of_stock'
}

/** Match Manufacturing.jsx / API normalization for ledger sign. */
function signedDeltaForMovement(movement) {
  let qty = parseFloat(movement.quantity) || 0
  const t = String(movement.type || '').toLowerCase()
  if (t === 'receipt') qty = Math.abs(qty)
  else if (t === 'production' || t === 'consumption' || t === 'sale') qty = -Math.abs(qty)
  return qty
}

async function resolveLocationId(locationRef) {
  const ref = (locationRef || '').trim()
  if (!ref) return null
  const byId = await prisma.stockLocation.findFirst({ where: { id: ref } })
  if (byId) return byId
  const byCode = await prisma.stockLocation.findFirst({ where: { code: ref } })
  if (byCode) return byCode
  const byName = await prisma.stockLocation.findFirst({
    where: { name: { equals: ref, mode: 'insensitive' } }
  })
  return byName || null
}

async function findCanonicalInventoryItemTx(tx, sku) {
  const rows = await tx.inventoryItem.findMany({
    where: { sku },
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  return rows[0] || null
}

async function main() {
  const { movementId, location: locationRef, write, force } = parseArgs()
  if (!movementId || !locationRef) {
    console.error(
      'Usage: node scripts/apply-stock-movement-to-location.js --movement MOV0339 --location PMB [--write] [--force]'
    )
    process.exit(1)
  }

  const movement = await prisma.stockMovement.findFirst({
    where: { movementId: String(movementId).trim() }
  })
  if (!movement) {
    console.error(`No stock movement found with movementId "${movementId}".`)
    process.exit(1)
  }

  const marker = `${MARKER_PREFIX}${movement.movementId}`
  const notes = movement.notes || ''
  if (!force && notes.includes(marker)) {
    console.log(
      `This movement already has reconciliation marker in notes. Use --force to apply again.\nMarker: ${marker}`
    )
    process.exit(0)
  }

  if (String(movement.type || '').toLowerCase() === 'transfer') {
    console.error('Transfers need from+to legs; this script does not support transfer type.')
    process.exit(1)
  }

  const loc = await resolveLocationId(locationRef)
  if (!loc) {
    console.error(`Could not resolve stock location "${locationRef}".`)
    process.exit(1)
  }

  const sku = (movement.sku || '').trim()
  if (!sku) {
    console.error('Movement has no SKU.')
    process.exit(1)
  }

  const delta = signedDeltaForMovement(movement)
  const existingLi = await prisma.locationInventory.findUnique({
    where: { locationId_sku: { locationId: loc.id, sku } }
  })
  const before = existingLi?.quantity ?? 0
  const after = before + delta

  console.log('Mode:', write ? 'WRITE' : 'DRY RUN')
  console.log('')
  console.log('Movement:  ', movement.movementId, movement.type, movement.date?.toISOString?.() || movement.date)
  console.log('SKU:       ', sku)
  console.log('Item name: ', movement.itemName)
  console.log('Signed Δ:  ', delta)
  console.log('Location:  ', loc.code, '/', loc.name, `(${loc.id})`)
  console.log('Location qty before → after:', before, '→', after)
  console.log('Movement from/to (raw):', JSON.stringify(movement.fromLocation), '→', JSON.stringify(movement.toLocation))

  if (!write) {
    console.log('')
    console.log('Run with --write to apply LocationInventory update and refresh master item aggregate.')
    process.exit(0)
  }

  await prisma.$transaction(async (tx) => {
    const itemName = movement.itemName?.trim() || sku
    const masterForCost = await findCanonicalInventoryItemTx(tx, sku)
    const seedUnitCost = masterForCost?.unitCost ?? 0
    const seedRp = masterForCost?.reorderPoint ?? 0

    await tx.locationInventory.upsert({
      where: { locationId_sku: { locationId: loc.id, sku } },
      create: {
        locationId: loc.id,
        sku,
        itemName,
        quantity: delta,
        unitCost: seedUnitCost,
        reorderPoint: seedRp,
        status: getStatusFromQuantity(delta, seedRp)
      },
      update: {
        itemName,
        quantity: { increment: delta }
      }
    })

    const updatedLi = await tx.locationInventory.findUnique({
      where: { locationId_sku: { locationId: loc.id, sku } }
    })
    const liQty = updatedLi?.quantity ?? 0
    const liRp = updatedLi?.reorderPoint ?? 0
    await tx.locationInventory.update({
      where: { locationId_sku: { locationId: loc.id, sku } },
      data: {
        status: getStatusFromQuantity(liQty, liRp)
      }
    })

    const agg = await tx.locationInventory.aggregate({
      _sum: { quantity: true },
      where: { sku }
    })
    const aggQty = agg._sum.quantity || 0
    const master = await findCanonicalInventoryItemTx(tx, sku)
    if (master) {
      await tx.inventoryItem.update({
        where: { id: master.id },
        data: {
          quantity: aggQty,
          totalValue: aggQty * (master.unitCost || 0),
          status: getStatusFromQuantity(aggQty, master.reorderPoint || 0)
        }
      })
    }

    const fromRaw = (movement.fromLocation || '').trim()
    const toRaw = (movement.toLocation || '').trim()
    const patch = {}
    if (!fromRaw) patch.fromLocation = loc.id
    if (typeUsesTo(movement.type) && !toRaw) patch.toLocation = loc.id

    const newNotes = notes.includes(marker) ? notes : `${notes}${notes ? '\n' : ''}${marker}`
    patch.notes = newNotes

    await tx.stockMovement.update({
      where: { id: movement.id },
      data: patch
    })
  })

  console.log('')
  console.log('Done. LocationInventory and master aggregate updated; movement linked to location (fromLocation if empty).')
}

function typeUsesTo(type) {
  const t = String(type || '').toLowerCase()
  return t === 'receipt' || t === 'production'
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
