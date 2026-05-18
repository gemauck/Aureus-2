#!/usr/bin/env node
/**
 * Rename duplicate StockMovement.movementId values before/at unique migration (dry-run default).
 *
 * Usage:
 *   node scripts/dedupe-stock-movement-public-ids.mjs
 *   node scripts/dedupe-stock-movement-public-ids.mjs --write
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import { buildMovementId } from '../api/_lib/movementId.js'

function parseArgs(argv) {
  return { write: argv.includes('--write') }
}

async function main() {
  const { write } = parseArgs(process.argv.slice(2))

  const rows = await prisma.stockMovement.findMany({
    select: { id: true, movementId: true, sku: true, date: true, createdAt: true },
    orderBy: [{ movementId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
  })

  const byPublicId = new Map()
  for (const row of rows) {
    const key = row.movementId
    if (!byPublicId.has(key)) byPublicId.set(key, [])
    byPublicId.get(key).push(row)
  }

  const plans = []
  for (const [movementId, group] of byPublicId) {
    if (group.length < 2) continue
    const [keep, ...dupes] = group
    for (const dup of dupes) {
      plans.push({
        id: dup.id,
        oldMovementId: movementId,
        newMovementId: buildMovementId(),
        sku: dup.sku,
        keepId: keep.id
      })
    }
  }

  console.log(`Mode: ${write ? 'WRITE' : 'DRY RUN'}`)
  console.log(`Duplicate public movementIds: ${plans.length} row(s) to rename (${byPublicId.size - plans.length} unique ids with dupes)`)

  if (!plans.length) {
    console.log('No duplicate movementId values found.')
    await prisma.$disconnect()
    return
  }

  for (const p of plans) {
    console.log(
      `  ${p.oldMovementId} → ${p.newMovementId}  id=${p.id}  sku=${p.sku}  (keep id=${p.keepId})`
    )
  }

  if (!write) {
    console.log('\nRun with --write to apply.')
    await prisma.$disconnect()
    return
  }

  for (const p of plans) {
    await prisma.stockMovement.update({
      where: { id: p.id },
      data: { movementId: p.newMovementId }
    })
  }

  console.log(`\nRenamed ${plans.length} movement(s).`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
