#!/usr/bin/env node
/**
 * Remove duplicate job-card consumption rows (legacy mobile client posted "Job Card {draftId}"
 * while server already wrote MOV-JC-* / JOB CARD: JC####). Dry-run by default; --write applies.
 *
 * Usage:
 *   npm run cleanup:job-card-duplicate-movements
 *   npm run cleanup:job-card-duplicate-movements -- --write
 *   npm run cleanup:job-card-duplicate-movements -- --write --include-orphans
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../api/_lib/prisma.js'
import { purgeStockMovementTx } from '../api/_lib/reverseStockMovementDeletion.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DRAFT_REF_RE = /^Job Card (\d{10,})$/
const CREATED_AT_WINDOW_MS = 120_000
/** When draft id ≠ job card id, match canonical row by sku/qty/location within this window. */
const SIGNATURE_MATCH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

const write = process.argv.includes('--write')
const includeOrphans = process.argv.includes('--include-orphans')

function logDatabaseTarget() {
  const raw = process.env.DATABASE_URL || ''
  if (!raw) {
    console.error('DATABASE_URL is not set.')
    return
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

async function findJobCardForDraftRef(draftId) {
  const tsNum = Number(draftId)
  const or = [{ id: draftId }]
  if (Number.isFinite(tsNum) && tsNum > 0) {
    or.push({
      createdAt: {
        gte: new Date(tsNum - CREATED_AT_WINDOW_MS),
        lte: new Date(tsNum + CREATED_AT_WINDOW_MS)
      }
    })
  }
  return prisma.jobCard.findFirst({
    where: { OR: or },
    select: {
      id: true,
      jobCardNumber: true,
      clientName: true,
      agentName: true,
      location: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  })
}

const canonicalSelect = {
  id: true,
  movementId: true,
  reference: true,
  date: true,
  sku: true,
  quantity: true
}

async function findCanonicalForJobCard(draftMov, jobCard) {
  if (!jobCard?.id) return []
  return prisma.stockMovement.findMany({
    where: {
      movementId: { startsWith: `MOV-JC-${jobCard.id}-` },
      type: 'consumption',
      sku: draftMov.sku,
      quantity: draftMov.quantity,
      fromLocation: draftMov.fromLocation
    },
    select: canonicalSelect
  })
}

/** Fallback: same sku/qty/location as a single MOV-JC row near the draft movement date. */
async function findCanonicalBySignature(draftMov) {
  const draftDate = draftMov.date instanceof Date ? draftMov.date : new Date(draftMov.date)
  if (Number.isNaN(draftDate.getTime())) return []
  const hits = await prisma.stockMovement.findMany({
    where: {
      movementId: { startsWith: 'MOV-JC-' },
      type: 'consumption',
      sku: draftMov.sku,
      quantity: draftMov.quantity,
      fromLocation: draftMov.fromLocation,
      date: {
        gte: new Date(draftDate.getTime() - SIGNATURE_MATCH_WINDOW_MS),
        lte: new Date(draftDate.getTime() + SIGNATURE_MATCH_WINDOW_MS)
      }
    },
    select: canonicalSelect,
    orderBy: { date: 'asc' }
  })
  if (hits.length !== 1) return []
  return hits
}

async function classifyDraftMovement(draftMov) {
  const refMatch = String(draftMov.reference || '').trim().match(DRAFT_REF_RE)
  if (!refMatch) {
    return { draftMov, status: 'skip', reason: 'reference does not match Job Card {draftId}' }
  }

  const draftId = refMatch[1]
  const jobCard = await findJobCardForDraftRef(draftId)
  let canonical = jobCard ? await findCanonicalForJobCard(draftMov, jobCard) : []
  let matchKind = canonical.length > 0 ? 'job_card' : null

  if (canonical.length === 0) {
    canonical = await findCanonicalBySignature(draftMov)
    if (canonical.length > 0) matchKind = 'signature'
  }

  if (canonical.length > 0) {
    const jcNum = canonical[0].reference?.replace(/^JOB CARD:\s*/i, '').trim()
    const linkedJc =
      jobCard ||
      (jcNum
        ? await prisma.jobCard.findFirst({
            where: { jobCardNumber: jcNum },
            select: {
              id: true,
              jobCardNumber: true,
              clientName: true,
              agentName: true,
              location: true,
              createdAt: true
            }
          })
        : null)
    return {
      draftMov,
      status: 'delete',
      reason:
        matchKind === 'job_card'
          ? 'canonical MOV-JC row exists for same SKU/qty/location'
          : 'unique MOV-JC row matches SKU/qty/location within date window',
      draftId,
      jobCard: linkedJc,
      canonical,
      matchKind
    }
  }

  if (includeOrphans) {
    return {
      draftMov,
      status: 'delete',
      reason: jobCard
        ? '--include-orphans: no MOV-JC match but job card found'
        : '--include-orphans: no job card match',
      draftId,
      jobCard,
      canonical: []
    }
  }

  return {
    draftMov,
    status: 'review',
    reason: jobCard
      ? 'job card found but no matching MOV-JC-* consumption (manual review)'
      : 'no job card for draft id (manual review)',
    draftId,
    jobCard,
    canonical: []
  }
}

function summarizeRow(entry) {
  const d = entry.draftMov
  return {
    movementId: d.movementId,
    id: d.id,
    sku: d.sku,
    quantity: d.quantity,
    reference: d.reference,
    date: d.date,
    performedBy: d.performedBy,
    status: entry.status,
    reason: entry.reason,
    jobCardNumber: entry.jobCard?.jobCardNumber || null,
    jobCardId: entry.jobCard?.id || null,
    canonicalMovementIds: (entry.canonical || []).map((c) => c.movementId),
    matchKind: entry.matchKind || null
  }
}

async function main() {
  logDatabaseTarget()
  console.log(`Mode: ${write ? 'WRITE' : 'dry-run'}${includeOrphans ? ' (include orphans)' : ''}\n`)

  const draftMovs = await prisma.stockMovement.findMany({
    where: {
      type: 'consumption',
      reference: { startsWith: 'Job Card ' },
      NOT: { movementId: { startsWith: 'MOV-JC-' } }
    },
    orderBy: [{ date: 'desc' }, { sku: 'asc' }]
  })

  console.log(`Found ${draftMovs.length} legacy "Job Card {draftId}" consumption row(s).\n`)

  const classified = []
  for (const draftMov of draftMovs) {
    classified.push(await classifyDraftMovement(draftMov))
  }

  const toDelete = classified.filter((e) => e.status === 'delete')
  const toReview = classified.filter((e) => e.status === 'review')

  for (const entry of classified) {
    const row = summarizeRow(entry)
    const prefix = entry.status === 'delete' ? 'DELETE' : 'REVIEW'
    console.log(
      `[${prefix}] ${row.movementId}  ${row.sku}  qty=${row.quantity}  ref=${row.reference}` +
        (row.jobCardNumber ? `  → keep ${row.canonicalMovementIds.join(', ') || 'n/a'} (${row.jobCardNumber})` : '')
    )
    console.log(`         ${row.reason}`)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    write,
    includeOrphans,
    summary: {
      totalDraftRows: draftMovs.length,
      toDelete: toDelete.length,
      toReview: toReview.length
    },
    delete: toDelete.map(summarizeRow),
    review: toReview.map(summarizeRow)
  }

  const reportsDir = path.join(__dirname, '..', 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(
    reportsDir,
    `cleanup-job-card-duplicate-movements-${write ? 'applied' : 'dryrun'}-${stamp}.json`
  )
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nReport: ${reportPath}`)

  if (!write) {
    console.log('\nDry run complete. Re-run with --write to purge duplicate rows and restore inventory.')
    return
  }

  if (!toDelete.length) {
    console.log('\nNothing to delete.')
    return
  }

  console.log('\nApplying deletes (--write)...')
  const applied = []
  const failed = []

  for (const entry of toDelete) {
    const id = entry.draftMov.id
    try {
      await prisma.$transaction(async (tx) => {
        await purgeStockMovementTx(tx, id, { allowedTypes: ['consumption'] })
      })
      applied.push(entry.draftMov.movementId)
      console.log(`  ✓ ${entry.draftMov.movementId} (${entry.draftMov.sku})`)
    } catch (err) {
      failed.push({
        movementId: entry.draftMov.movementId,
        error: err?.message || String(err)
      })
      console.error(`  ✗ ${entry.draftMov.movementId}: ${err?.message || err}`)
    }
  }

  report.applied = applied
  report.failed = failed
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log(`\nDone. Deleted ${applied.length}, failed ${failed.length}.`)
  if (failed.length) process.exit(1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
