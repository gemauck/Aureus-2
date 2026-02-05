#!/usr/bin/env node
/**
 * Find inventory items that have no STOCK_COUNT_IMPORT movement and create the missing adjustment.
 * Run after reimport if any stockMovement.create timed out.
 *
 * Usage: node scripts/backfill-missing-stock-movements.js
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

async function main() {
  const items = await prisma.inventoryItem.findMany({
    where: { sku: { startsWith: 'SKU' } },
    select: { id: true, sku: true, name: true, quantity: true, locationId: true },
    orderBy: { sku: 'asc' },
  })
  const movements = await prisma.stockMovement.findMany({
    where: { reference: 'STOCK_COUNT_IMPORT' },
    select: { sku: true },
  })
  const skusWithMovement = new Set(movements.map(m => m.sku))
  const missing = items.filter(i => !skusWithMovement.has(i.sku))

  console.log('Inventory items (SKU...):', items.length)
  console.log('Stock movements (STOCK_COUNT_IMPORT):', movements.length)
  console.log('Items missing a movement:', missing.length)

  if (missing.length === 0) {
    console.log('Nothing to backfill.')
    await prisma.$disconnect()
    return
  }

  let nextMov = 1
  const existing = await prisma.stockMovement.findMany({
    where: { movementId: { startsWith: 'MOV' } },
    select: { movementId: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  if (existing.length && existing[0].movementId) {
    const m = existing[0].movementId.match(/^MOV(\d+)$/)
    if (m) nextMov = parseInt(m[1], 10) + 1
  }

  let created = 0
  for (const item of missing) {
    const loc = item.locationId
      ? await prisma.stockLocation.findUnique({ where: { id: item.locationId }, select: { code: true } })
      : null
    const toLoc = loc ? loc.code : ''
    await prisma.stockMovement.create({
      data: {
        movementId: `MOV${String(nextMov).padStart(4, '0')}`,
        date: new Date(),
        type: 'adjustment',
        itemName: item.name,
        sku: item.sku,
        quantity: item.quantity ?? 0,
        fromLocation: '',
        toLocation: toLoc,
        reference: 'STOCK_COUNT_IMPORT',
        performedBy: 'System',
        notes: toLoc ? `Stock count import: ${item.name} at ${toLoc}` : `Stock count import: ${item.name}`,
        ownerId: null,
      },
    })
    nextMov++
    created++
  }
  console.log('Created', created, 'missing stock movements.')
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
