#!/usr/bin/env node
/**
 * Backfill StockMovement consumption rows from JobCard.stockUsed (dry-run by default).
 * Usage:
 *   node scripts/sync-job-card-stock-movements.js [--write]
 *   node scripts/sync-job-card-stock-movements.js --from=2026-05-01 --to=2026-05-31 --write
 *   node scripts/sync-job-card-stock-movements.js --month=5 --year=2026 --write
 */
import { prisma } from '../api/_lib/prisma.js'
import {
  syncJobCardStockMovements,
  parseJobCardStockUsed,
  resolveJobCardMovementDate
} from '../api/_lib/jobCardStockMovements.js'

const write = process.argv.includes('--write')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null
const fromArg = process.argv.find((a) => a.startsWith('--from='))
const toArg = process.argv.find((a) => a.startsWith('--to='))
const monthArg = process.argv.find((a) => a.startsWith('--month='))
const yearArg = process.argv.find((a) => a.startsWith('--year='))

function parseYmd(s) {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseRange() {
  let from = fromArg ? parseYmd(fromArg.split('=')[1]) : null
  let to = toArg ? parseYmd(toArg.split('=')[1]) : null
  if (to) to = new Date(`${toArg.split('=')[1]}T23:59:59.999`)

  if (!from && !to && monthArg) {
    const month = parseInt(monthArg.split('=')[1], 10)
    const year = yearArg
      ? parseInt(yearArg.split('=')[1], 10)
      : new Date().getFullYear()
    if (month >= 1 && month <= 12 && Number.isFinite(year)) {
      from = new Date(year, month - 1, 1)
      to = new Date(year, month, 0, 23, 59, 59, 999)
    }
  }
  return { from, to }
}

const { from: rangeFrom, to: rangeTo } = parseRange()

function jobCardInRange(jc) {
  if (!rangeFrom && !rangeTo) return true
  const d = resolveJobCardMovementDate(jc)
  if (rangeFrom && d < rangeFrom) return false
  if (rangeTo && d > rangeTo) return false
  return true
}

async function main() {
  const cards = await prisma.jobCard.findMany({
    where: { NOT: { stockUsed: { in: ['[]', ''] } } },
    orderBy: { updatedAt: 'desc' },
    ...(limit && Number.isFinite(limit) ? { take: limit } : {})
  })

  const inRange = cards.filter(jobCardInRange)

  let wouldSync = 0
  let created = 0
  let updated = 0
  let skipped = 0
  let dateFixed = 0
  let errorLines = 0
  const errorSamples = []

  for (const jc of inRange) {
    const lines = parseJobCardStockUsed(jc.stockUsed)
    if (lines.length === 0) continue
    wouldSync++

    if (!write) continue

    const r = await syncJobCardStockMovements(prisma, {
      jobCard: jc,
      performedBy: jc.agentName || 'backfill',
      applyJobCardDate: true
    })
    created += r.created
    updated += r.updated
    skipped += r.skipped
    dateFixed += r.dateFixed || 0
    errorLines += r.errors.length
    for (const err of r.errors.slice(0, 3)) {
      if (errorSamples.length < 25) {
        errorSamples.push({
          jobCardNumber: jc.jobCardNumber,
          jobCardId: jc.id,
          ...err
        })
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: write ? 'write' : 'dry-run',
        dateRange: {
          from: rangeFrom ? rangeFrom.toISOString().slice(0, 10) : null,
          to: rangeTo ? rangeTo.toISOString().slice(0, 10) : null
        },
        jobCardsScanned: cards.length,
        jobCardsInRange: inRange.length,
        jobCardsWithStock: wouldSync,
        ...(write ? { created, updated, skipped, dateFixed, errorLines, errorSamples } : {})
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
