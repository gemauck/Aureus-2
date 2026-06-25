#!/usr/bin/env node
/** List job card stockUsed lines (JSON to stdout). Usage: node scripts/list-job-card-stock-usage.js [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] */
import { prisma } from '../api/_lib/prisma.js'
import {
  parseJobCardStockUsed,
  resolveJobCardMovementDate
} from '../api/_lib/jobCardStockMovements.js'

const fromArg = process.argv.find((a) => a.startsWith('--from='))
const toArg = process.argv.find((a) => a.startsWith('--to='))
const monthArg = process.argv.find((a) => a.startsWith('--month='))
const yearArg = process.argv.find((a) => a.startsWith('--year='))

function parseYmd(s) {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

let rangeFrom = fromArg ? parseYmd(fromArg.split('=')[1]) : null
let rangeTo = toArg ? parseYmd(toArg.split('=')[1]) : null
if (!rangeFrom && !rangeTo && monthArg) {
  const month = parseInt(monthArg.split('=')[1], 10)
  const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : new Date().getFullYear()
  if (month >= 1 && month <= 12) {
    rangeFrom = new Date(year, month - 1, 1)
    rangeTo = new Date(year, month, 0, 23, 59, 59, 999)
  }
}

function inRange(d) {
  if (!rangeFrom && !rangeTo) return true
  if (rangeFrom && d < rangeFrom) return false
  if (rangeTo && d > rangeTo) return false
  return true
}

async function main() {
  const cards = await prisma.jobCard.findMany({
    where: { NOT: { stockUsed: { in: ['[]', ''] } } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      jobCardNumber: true,
      clientName: true,
      agentName: true,
      status: true,
      location: true,
      stockUsed: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      submittedAt: true
    }
  })

  const rows = []
  for (const jc of cards) {
    const visitDate = resolveJobCardMovementDate(jc)
    if (!inRange(visitDate)) continue
    const lines = parseJobCardStockUsed(jc.stockUsed)
    if (lines.length === 0) continue
    for (const line of lines) {
      rows.push({
        jobCardNumber: jc.jobCardNumber || jc.id,
        jobCardId: jc.id,
        status: jc.status,
        client: jc.clientName || '',
        technician: jc.agentName || '',
        siteLocation: jc.location || '',
        visitDate: visitDate.toISOString().slice(0, 10),
        line: line.lineIndex + 1,
        sku: line.sku,
        itemName: line.itemName,
        quantity: line.quantity,
        locationId: line.locationId || ''
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        dateRange: {
          from: rangeFrom ? rangeFrom.toISOString().slice(0, 10) : null,
          to: rangeTo ? rangeTo.toISOString().slice(0, 10) : null
        },
        jobCardsWithStock: new Set(rows.map((r) => r.jobCardId)).size,
        lineCount: rows.length,
        rows
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
