#!/usr/bin/env node
/**
 * Backfill StockMovement consumption rows from JobCard.stockUsed (dry-run by default).
 * Usage: node scripts/sync-job-card-stock-movements.js [--write] [--limit N]
 */
import { prisma } from '../api/_lib/prisma.js'
import { syncJobCardStockMovements, parseJobCardStockUsed } from '../api/_lib/jobCardStockMovements.js'

const write = process.argv.includes('--write')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

async function main() {
  const cards = await prisma.jobCard.findMany({
    where: { NOT: { stockUsed: { in: ['[]', ''] } } },
    orderBy: { updatedAt: 'desc' },
    ...(limit && Number.isFinite(limit) ? { take: limit } : {})
  })

  let wouldSync = 0
  let created = 0
  let updated = 0
  let skipped = 0
  let errorLines = 0

  for (const jc of cards) {
    const lines = parseJobCardStockUsed(jc.stockUsed)
    if (lines.length === 0) continue
    wouldSync++

    if (!write) continue

    const r = await syncJobCardStockMovements(prisma, {
      jobCard: jc,
      performedBy: jc.agentName || 'backfill'
    })
    created += r.created
    updated += r.updated
    skipped += r.skipped
    errorLines += r.errors.length
  }

  console.log(
    JSON.stringify(
      {
        mode: write ? 'write' : 'dry-run',
        jobCardsWithStock: wouldSync,
        scanned: cards.length,
        ...(write ? { created, updated, skipped, errorLines } : {})
      },
      null,
      2
    )
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
