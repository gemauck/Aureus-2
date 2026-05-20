#!/usr/bin/env node
/**
 * Find and remove duplicate mobile job cards (same client/site/heading/technician + created second).
 * Dry-run by default; pass --write to delete duplicates (keeps best status / highest JC number).
 *
 * Usage:
 *   npm run report:duplicate-job-cards
 *   npm run report:duplicate-job-cards -- --agent "Nathan"
 *   npm run merge:duplicate-job-cards -- --write
 *   npm run merge:duplicate-job-cards -- --write --allow-with-stock
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'
import {
  jobCardDuplicateFingerprint,
  pickKeeperJobCard
} from '../api/_lib/jobCardIdempotency.js'
import { extractHeadingFromOtherComments } from '../api/_lib/jobCardOtherComments.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const write = process.argv.includes('--write')
const allowWithStock = process.argv.includes('--allow-with-stock')
const agentArgIdx = process.argv.indexOf('--agent')
const agentFilter =
  agentArgIdx >= 0 ? String(process.argv[agentArgIdx + 1] || '').trim().toLowerCase() : ''

function logDatabaseTarget() {
  const raw = process.env.DATABASE_URL || ''
  if (!raw) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }
  try {
    const u = new URL(
      raw.replace(/^postgresql:\/\//, 'http://').replace(/^postgres:\/\//, 'http://')
    )
    const host = u.hostname || '(unknown host)'
    const db = (u.pathname || '').replace(/^\//, '').split('?')[0] || '(unknown db)'
    const port = u.port ? `:${u.port}` : ''
    console.log(`Database target: ${host}${port} / database "${db}"`)
  } catch {
    console.log('Database target: (could not parse DATABASE_URL)')
  }
}

async function countStockMovementsForJobCard(jobCardId) {
  const n = await prisma.stockMovement.count({
    where: { movementId: { startsWith: `MOV-JC-${jobCardId}-` } }
  })
  return n
}

async function main() {
  logDatabaseTarget()
  console.log(write ? 'Mode: WRITE (will delete duplicates)' : 'Mode: dry-run (report only)')

  const rows = await prisma.jobCard.findMany({
    select: {
      id: true,
      jobCardNumber: true,
      status: true,
      clientId: true,
      clientName: true,
      siteName: true,
      agentName: true,
      otherComments: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  })

  const filtered = agentFilter
    ? rows.filter(r => String(r.agentName || '').toLowerCase().includes(agentFilter))
    : rows

  const groups = new Map()
  for (const jc of filtered) {
    const fp = jobCardDuplicateFingerprint(jc)
    if (!groups.has(fp)) groups.set(fp, [])
    groups.get(fp).push(jc)
  }

  const duplicateGroups = [...groups.values()].filter(g => g.length > 1)
  if (duplicateGroups.length === 0) {
    console.log('No duplicate groups found.')
    return
  }

  const plan = []
  for (const group of duplicateGroups) {
    const keeper = pickKeeperJobCard(group)
    const losers = group.filter(j => j.id !== keeper.id)
    const heading = extractHeadingFromOtherComments(keeper.otherComments || '')
    plan.push({ keeper, losers, heading, group })
  }

  console.log(`\nFound ${duplicateGroups.length} duplicate group(s), ${plan.reduce((s, p) => s + p.losers.length, 0)} card(s) to remove:\n`)

  const toDelete = []
  for (const { keeper, losers, heading } of plan) {
    console.log(
      `— ${keeper.jobCardNumber} [${keeper.status}] ${keeper.clientName} / ${keeper.siteName} — "${heading}" (${keeper.agentName}) @ ${keeper.createdAt?.toISOString?.() || keeper.createdAt}`
    )
    for (const dup of losers) {
      const movCount = await countStockMovementsForJobCard(dup.id)
      const blocked = movCount > 0 && !allowWithStock
      console.log(
        `    DROP ${dup.jobCardNumber} [${dup.status}] id=${dup.id} movements=${movCount}${blocked ? ' (skipped — has stock movements)' : ''}`
      )
      if (!blocked) toDelete.push(dup)
    }
    console.log('')
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: write ? 'write' : 'dry-run',
    groups: plan.map(({ keeper, losers, heading }) => ({
      keeper: {
        id: keeper.id,
        jobCardNumber: keeper.jobCardNumber,
        status: keeper.status
      },
      heading,
      delete: losers.map(d => ({
        id: d.id,
        jobCardNumber: d.jobCardNumber,
        status: d.status
      }))
    })),
    deleteIds: toDelete.map(d => d.id)
  }

  const reportsDir = path.join(__dirname, '..', 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(
    reportsDir,
    `duplicate-job-cards-${write ? 'applied' : 'dryrun'}-${stamp}.json`
  )
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`Report written: ${reportPath}`)

  if (!write) {
    console.log('\nDry-run complete. Re-run with --write to delete listed cards.')
    return
  }

  if (toDelete.length === 0) {
    console.log('Nothing to delete (all duplicates blocked by stock movements). Use --allow-with-stock to force.')
    return
  }

  let deleted = 0
  for (const dup of toDelete) {
    await prisma.jobCard.delete({ where: { id: dup.id } })
    deleted += 1
    console.log(`Deleted ${dup.jobCardNumber} (${dup.id})`)
  }
  console.log(`\nDeleted ${deleted} duplicate job card(s).`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
