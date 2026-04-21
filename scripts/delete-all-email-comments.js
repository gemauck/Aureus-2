/**
 * Delete all document-collection comments that represent emails.
 *
 * Removes DocumentItemComment rows where:
 * - author is "Email from Client"
 * - author is "Sent request (platform)"
 * - author is "Sent reply (platform)"
 * - OR text starts with "Email from Client"
 *
 * Usage:
 *   node scripts/delete-all-email-comments.js [--apply]
 *
 * Default is dry-run. Pass --apply to actually delete rows.
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

async function main() {
  const matches = await prisma.documentItemComment.findMany({
    where: {
      OR: [
        { author: 'Email from Client' },
        { author: 'Sent request (platform)' },
        { author: 'Sent reply (platform)' },
        { text: { startsWith: 'Email from Client' } }
      ]
    },
    select: {
      id: true,
      author: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  })

  console.log(`Matched email comments: ${matches.length}`)
  if (matches.length > 0) {
    const byAuthor = matches.reduce((acc, row) => {
      const key = row.author || '(no author)'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    console.log('Breakdown by author:', byAuthor)
  }

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to delete.')
    return
  }

  if (matches.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  const ids = matches.map((m) => m.id)
  const result = await prisma.documentItemComment.deleteMany({
    where: { id: { in: ids } }
  })
  console.log(`Deleted email comments: ${result.count}`)
}

main()
  .catch((err) => {
    console.error('Delete failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
