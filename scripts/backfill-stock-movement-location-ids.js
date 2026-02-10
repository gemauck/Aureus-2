#!/usr/bin/env node
/**
 * Backfill StockMovement.fromLocation and toLocation to use location IDs instead of codes.
 * Older records may have been stored with location codes (e.g. "LOC001", "PMB"); the
 * inventory detail ledger filters by location ID, so those rows don't show. This script
 * resolves code -> id and updates movements so the ledger filter works for all history.
 *
 * Usage:
 *   node scripts/backfill-stock-movement-location-ids.js           # dry run (no writes)
 *   node scripts/backfill-stock-movement-location-ids.js --write  # apply updates
 */

import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'

const isWrite = process.argv.includes('--write')

async function main() {
  console.log('Backfill StockMovement location IDs (fromLocation / toLocation)')
  console.log('Mode:', isWrite ? 'WRITE (will update DB)' : 'DRY RUN (no changes)')
  console.log('')

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, code: true },
  })
  const idSet = new Set(locations.map((l) => l.id))
  const codeToId = new Map(locations.map((l) => [l.code, l.id]))
  const codeToIdLower = new Map(locations.map((l) => [l.code.toLowerCase().trim(), l.id]))

  function resolveToId(value) {
    if (!value || typeof value !== 'string') return null
    const v = value.trim()
    if (!v) return null
    if (idSet.has(v)) return v
    if (codeToId.has(v)) return codeToId.get(v)
    const lower = v.toLowerCase()
    if (codeToIdLower.has(lower)) return codeToIdLower.get(lower)
    return null
  }

  const movements = await prisma.stockMovement.findMany({
    select: { id: true, movementId: true, fromLocation: true, toLocation: true },
  })

  const toUpdate = []
  let skipped = 0

  for (const m of movements) {
    const fromRaw = (m.fromLocation || '').trim()
    const toRaw = (m.toLocation || '').trim()
    const fromId = resolveToId(fromRaw)
    const toId = resolveToId(toRaw)

    const fromChanged = fromRaw && fromId && fromId !== fromRaw
    const toChanged = toRaw && toId && toId !== toRaw
    if (!fromChanged && !toChanged) {
      skipped++
      continue
    }

    const newFrom = fromChanged ? fromId : fromRaw
    const newTo = toChanged ? toId : toRaw
    toUpdate.push({ id: m.id, movementId: m.movementId, newFrom, newTo, fromRaw, toRaw })
  }

  if (toUpdate.length > 0 && toUpdate.length <= 20) {
    toUpdate.forEach((u) => {
      console.log(`  ${isWrite ? 'Updated' : 'Would update'} ${u.movementId}: fromLocation "${u.fromRaw}" -> "${u.newFrom}", toLocation "${u.toRaw}" -> "${u.newTo}"`)
    })
  } else if (toUpdate.length > 20) {
    toUpdate.slice(0, 5).forEach((u) => {
      console.log(`  ${isWrite ? 'Updated' : 'Would update'} ${u.movementId}: fromLocation "${u.fromRaw}" -> "${u.newFrom}", toLocation "${u.toRaw}" -> "${u.newTo}"`)
    })
    console.log(`  ... and ${toUpdate.length - 5} more`)
  }

  if (isWrite && toUpdate.length > 0) {
    const BATCH = 50
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const batch = toUpdate.slice(i, i + BATCH)
      for (const u of batch) {
        await prisma.stockMovement.update({
          where: { id: u.id },
          data: { fromLocation: u.newFrom, toLocation: u.newTo },
        })
      }
      console.log(`  Applied batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(toUpdate.length / BATCH)} (${batch.length} rows)`)
    }
  }

  console.log('')
  console.log('Summary:')
  console.log('  Total movements:', movements.length)
  console.log('  Would update / updated:', toUpdate.length)
  console.log('  Unchanged (already ID or unknown code):', skipped)
  if (!isWrite && toUpdate.length) {
    console.log('')
    console.log('Run with --write to apply these updates.')
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
