/**
 * Mobile job card POST deduplication via clientDraftId (local wizard id) stored on create activity.
 */

import { extractHeadingFromOtherComments } from './jobCardOtherComments.js'

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} clientDraftId
 * @returns {Promise<object|null>}
 */
export async function findJobCardByClientDraftId(prisma, clientDraftId) {
  const draftId = String(clientDraftId || '').trim()
  if (!draftId) return null

  const activity = await prisma.jobCardActivity.findFirst({
    where: {
      action: 'created',
      metadata: { path: ['clientDraftId'], equals: draftId }
    },
    orderBy: { createdAt: 'desc' },
    select: { jobCardId: true }
  })
  if (!activity?.jobCardId) return null

  return prisma.jobCard.findUnique({ where: { id: activity.jobCardId } })
}

/**
 * Fingerprint for duplicate grouping (admin script).
 * @param {object} jc
 */
export function jobCardDuplicateFingerprint(jc) {
  const heading = extractHeadingFromOtherComments(jc.otherComments || '')
  const clientKey = String(jc.clientId || jc.clientName || '')
    .trim()
    .toLowerCase()
  const siteKey = String(jc.siteName || jc.siteId || '')
    .trim()
    .toLowerCase()
  const agentKey = String(jc.agentName || '')
    .trim()
    .toLowerCase()
  const createdMs =
    jc.createdAt instanceof Date
      ? jc.createdAt.getTime()
      : new Date(jc.createdAt).getTime()
  const bucketSec = Number.isFinite(createdMs) ? Math.floor(createdMs / 1000) : 0
  return `${clientKey}|${siteKey}|${heading.toLowerCase()}|${agentKey}|${bucketSec}`
}

/** Prefer submitted/completed over draft; higher job card number as tie-breaker. */
export function pickKeeperJobCard(cards) {
  const statusRank = { completed: 3, submitted: 2, draft: 1 }
  return [...cards].sort((a, b) => {
    const ra = statusRank[String(a.status || '').toLowerCase()] || 0
    const rb = statusRank[String(b.status || '').toLowerCase()] || 0
    if (rb !== ra) return rb - ra
    const na = String(a.jobCardNumber || '')
    const nb = String(b.jobCardNumber || '')
    return nb.localeCompare(na)
  })[0]
}
