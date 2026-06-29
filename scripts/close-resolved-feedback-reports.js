#!/usr/bin/env node
/**
 * Mark open Reports & Feedback items as done after known fixes (mobile public API,
 * job-card list scope, stock-take scan headers, contact edit UX). Dry-run by default.
 *
 *   node scripts/close-resolved-feedback-reports.js
 *   node scripts/close-resolved-feedback-reports.js --write
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const write = process.argv.includes('--write')

function parseMeta(meta) {
  if (!meta) return null
  try {
    return typeof meta === 'string' ? JSON.parse(meta) : meta
  } catch {
    return null
  }
}

function isResolvedAutoReport(item) {
  if (item.section === 'mobile-app' || item.section === 'web-erp') {
    const message = String(item.message || '')
    const meta = parseMeta(item.meta)
    const context = String(meta?.context || '')
    if (/restricted to authorized field applications/i.test(message)) return true
    if (context.startsWith('api:GET:/api/public/')) return true
    if (context.includes('PATCH:/api/jobcards/') && meta?.api?.statusCode === 403) return true
    if (context.includes('PATCH:/api/jobcards/') && /HTTP 403/i.test(message)) return true
    return false
  }
  if (item.section === 'Manufacturing' && /scan.*not found|not in the stock list/i.test(item.message)) {
    return true
  }
  if (item.section === 'Clients and Leads > Contacts' && /edit.*contact/i.test(item.message)) {
    return true
  }
  return false
}

async function main() {
  const open = await prisma.feedback.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      section: true,
      message: true,
      meta: true,
      createdAt: true
    }
  })

  const matches = open.filter(isResolvedAutoReport)
  console.log(`Found ${matches.length} open report(s) to close (of ${open.length} open total).`)

  for (const row of matches) {
    console.log(
      `  - ${row.id} · ${row.section} · ${row.createdAt.toISOString()} · ${String(row.message).slice(0, 90)}…`
    )
  }

  if (!matches.length) return

  if (!write) {
    console.log('\nDry run — pass --write to mark these as done.')
    return
  }

  const result = await prisma.feedback.updateMany({
    where: { id: { in: matches.map((m) => m.id) } },
    data: { status: 'done' }
  })
  console.log(`\nMarked ${result.count} report(s) as done.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
