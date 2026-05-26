/**
 * Remove document-collection "Email from Client" rows that are requester Reply-All echoes
 * (sender matches requesterEmail on DocumentRequestEmailSent for the same cell).
 *
 * Real client replies are kept — they still power the Email activity "received" list.
 *
 * Usage:
 *   node scripts/delete-requester-echo-email-comments.js [--apply]
 *
 * Default is dry-run. Pass --apply to delete matched rows.
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value) {
  if (!value || typeof value !== 'string') return ''
  const trimmed = value.trim()
  const match = trimmed.match(/<([^>]+)>/)
  const email = (match && match[1] ? match[1] : trimmed).trim().toLowerCase()
  return EMAIL_RE.test(email) ? email : ''
}

function parseSenderFromCommentText(text) {
  const m = String(text || '').trim().match(/^Email from Client\s*\(([^)]+)\)/i)
  return m && m[1] ? normalizeEmail(m[1]) : ''
}

async function main() {
  const comments = await prisma.documentItemComment.findMany({
    where: { author: 'Email from Client' },
    select: {
      id: true,
      itemId: true,
      year: true,
      month: true,
      text: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  })

  if (comments.length === 0) {
    console.log('No "Email from Client" comments found.')
    return
  }

  const toDelete = []
  for (const c of comments) {
    const sender = parseSenderFromCommentText(c.text)
    if (!sender) continue
    const sent = await prisma.documentRequestEmailSent.findFirst({
      where: {
        documentId: c.itemId,
        year: c.year,
        month: c.month,
        requesterEmail: { equals: sender, mode: 'insensitive' }
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, requesterEmail: true, createdAt: true }
    })
    if (sent) {
      toDelete.push({
        id: c.id,
        sender,
        requesterEmail: sent.requesterEmail,
        itemId: c.itemId,
        year: c.year,
        month: c.month,
        createdAt: c.createdAt
      })
    }
  }

  console.log(`Scanned ${comments.length} inbound email comment(s).`)
  console.log(`Requester echo(s) to remove: ${toDelete.length}`)
  if (toDelete.length > 0) {
    for (const row of toDelete.slice(0, 20)) {
      console.log(
        `  - ${row.id} ${row.year}-${String(row.month).padStart(2, '0')} doc=${row.itemId} from=${row.sender}`
      )
    }
    if (toDelete.length > 20) console.log(`  ... and ${toDelete.length - 20} more`)
  }

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to delete.')
    return
  }

  if (toDelete.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  const ids = toDelete.map((r) => r.id)
  const result = await prisma.documentItemComment.deleteMany({ where: { id: { in: ids } } })
  console.log(`Deleted ${result.count} requester echo comment(s).`)
}

main()
  .catch((err) => {
    console.error('Cleanup failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
