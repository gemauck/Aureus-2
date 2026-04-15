#!/usr/bin/env node
import 'dotenv/config'

/**
 * Move a document-collection "Email from Client" comment to another document / month / project.
 * Does not update DocumentRequestEmailReceived (run only when you understand idempotency implications).
 *
 * Usage:
 *   node scripts/repair-document-collection-email-allocation.js \
 *     --commentId=<cuid> \
 *     --targetDocumentId=<DocumentItem id> \
 *     [--targetYear=2026] [--targetMonth=3] \
 *     [--targetProjectId=<must match target document's project>]
 *
 * Requires DATABASE_URL. Does not use JWT — run only on trusted machines.
 */

import { prisma } from '../api/_lib/prisma.js'

function arg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

async function main() {
  if (hasFlag('help') || hasFlag('h')) {
    console.log(
      `Usage: node scripts/repair-document-collection-email-allocation.js --commentId=... --targetDocumentId=... [--targetYear=] [--targetMonth=] [--targetProjectId=]`
    )
    process.exit(0)
  }

  const commentId = arg('commentId')
  const targetDocumentId = arg('targetDocumentId')
  if (!commentId || !targetDocumentId) {
    console.error('Required: --commentId and --targetDocumentId')
    process.exit(1)
  }

  const ty = arg('targetYear') != null ? parseInt(arg('targetYear'), 10) : null
  const tm = arg('targetMonth') != null ? parseInt(arg('targetMonth'), 10) : null
  const targetProjectId = arg('targetProjectId')

  const comment = await prisma.documentItemComment.findUnique({
    where: { id: commentId },
    include: {
      item: {
        include: {
          section: { select: { projectId: true } }
        }
      }
    }
  })
  if (!comment) {
    console.error('Comment not found:', commentId)
    process.exit(1)
  }
  if ((comment.author || '').trim() !== 'Email from Client') {
    console.error('Comment is not an inbound client email (author must be "Email from Client")')
    process.exit(1)
  }

  const sourceProjectId = String(comment.item?.section?.projectId || '')
  if (!sourceProjectId) {
    console.error('Could not resolve source project from comment')
    process.exit(1)
  }

  const targetDoc = await prisma.documentItem.findUnique({
    where: { id: targetDocumentId },
    include: { section: { select: { projectId: true, name: true } } }
  })
  if (!targetDoc) {
    console.error('Target document not found:', targetDocumentId)
    process.exit(1)
  }

  let destProjectId = sourceProjectId
  if (targetProjectId) {
    destProjectId = targetProjectId
  }
  if (String(targetDoc.section?.projectId) !== destProjectId) {
    console.error('Target document does not belong to destination project', {
      expectedProject: destProjectId,
      actual: targetDoc.section?.projectId
    })
    process.exit(1)
  }

  const newYear = Number.isFinite(ty) && ty >= 1900 && ty <= 3000 ? ty : comment.year
  const newMonth = Number.isFinite(tm) && tm >= 1 && tm <= 12 ? tm : comment.month

  await prisma.documentItemComment.update({
    where: { id: commentId },
    data: { itemId: targetDocumentId, year: newYear, month: newMonth }
  })

  console.log('Done. Comment updated.', {
    targetDocumentId,
    section: targetDoc.section?.name,
    year: newYear,
    month: newMonth,
    project: destProjectId
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
