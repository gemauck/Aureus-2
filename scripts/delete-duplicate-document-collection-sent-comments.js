/**
 * Remove duplicate legacy "sent" comments from document collection activity.
 *
 * Deletes DocumentItemComment rows authored as:
 * - Sent request (platform)
 * - Sent reply (platform)
 *
 * ...when a matching DocumentCollectionEmailLog already exists for the same
 * document/month/year and approximately the same timestamp/subject.
 *
 * Usage:
 *   node scripts/delete-duplicate-document-collection-sent-comments.js [--apply]
 *
 * Default mode is dry-run (no deletes). Pass --apply to perform deletions.
 */

import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
config({ path: join(root, '.env') })
if (!process.env.USE_PROD && !process.env.PRODUCTION_DB) {
  config({ path: join(root, '.env.local'), override: true })
}

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const SENT_AUTHORS = new Set(['Sent request (platform)', 'Sent reply (platform)'])
const MATCH_WINDOW_MS = 2 * 60 * 1000

function parseSubject(text) {
  const firstLine = (text || '').split('\n')[0] || ''
  if (firstLine.startsWith('Subject: ')) return firstLine.slice(9).trim()
  return firstLine.trim()
}

function getTimeMs(value) {
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

async function main() {
  const comments = await prisma.documentItemComment.findMany({
    where: {
      author: { in: Array.from(SENT_AUTHORS) }
    },
    select: {
      id: true,
      itemId: true,
      year: true,
      month: true,
      text: true,
      author: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  })

  if (comments.length === 0) {
    console.log('No platform sent comments found.')
    return
  }

  let deletedViaLogMatch = 0
  let deletedDuplicateComments = 0
  const toDelete = new Set()

  // Pass 1: delete platform comments that duplicate a sent log entry.
  for (const c of comments) {
    const subject = parseSubject(c.text)
    const ct = getTimeMs(c.createdAt)
    const logs = await prisma.documentCollectionEmailLog.findMany({
      where: {
        documentId: c.itemId,
        year: c.year,
        month: c.month,
        kind: 'sent'
      },
      select: { id: true, createdAt: true, subject: true }
    })
    const matched = logs.some((log) => {
      const lt = getTimeMs(log.createdAt)
      if (!ct || !lt || Math.abs(ct - lt) > MATCH_WINDOW_MS) return false
      const ls = (log.subject || '').trim()
      return ls === subject || (!ls && !subject)
    })
    if (matched) {
      toDelete.add(c.id)
      deletedViaLogMatch += 1
    }
  }

  // Pass 2: if multiple platform comments are exact duplicates (subject+time+cell),
  // keep the earliest and delete extras.
  const keepByKey = new Map()
  for (const c of comments) {
    if (toDelete.has(c.id)) continue
    const subject = parseSubject(c.text)
    const ct = getTimeMs(c.createdAt)
    const key = `${c.itemId}::${c.year}::${c.month}::${subject}::${ct}`
    const existing = keepByKey.get(key)
    if (!existing) {
      keepByKey.set(key, c.id)
    } else {
      toDelete.add(c.id)
      deletedDuplicateComments += 1
    }
  }

  const ids = Array.from(toDelete)
  console.log(`Found ${comments.length} platform sent comments.`)
  console.log(`Marked ${deletedViaLogMatch} duplicate(s) that match sent logs.`)
  console.log(`Marked ${deletedDuplicateComments} duplicate platform comment(s).`)
  console.log(`Total marked for deletion: ${ids.length}`)

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to delete.')
    return
  }

  if (ids.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  const result = await prisma.documentItemComment.deleteMany({
    where: { id: { in: ids } }
  })
  console.log(`Deleted ${result.count} duplicate comment(s).`)
}

main()
  .catch((err) => {
    console.error('Cleanup failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
