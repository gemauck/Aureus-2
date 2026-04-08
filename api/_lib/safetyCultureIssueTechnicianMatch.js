/**
 * Match SafetyCulture issue People (creator / assignee) to an ERP User for job card technician allocation.
 * Conservative: only returns a user on strong match; ambiguous near-ties return null.
 */

import { extractIssuePeopleFromDetail } from './safetyCultureIssueJobCard.js'

const MIN_NAME_SCORE = 0.88
const TIE_MARGIN = 0.04

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeForNameMatch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function tokenSortKey(s) {
  return normalizeForNameMatch(s)
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

function diceBigramCoefficient(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const counts = new Map()
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2)
    counts.set(bg, (counts.get(bg) || 0) + 1)
  }
  let intersection = 0
  let bTotal = 0
  const bCounts = new Map()
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2)
    bCounts.set(bg, (bCounts.get(bg) || 0) + 1)
    bTotal++
  }
  for (const [bg, bv] of bCounts) {
    intersection += Math.min(bv, counts.get(bg) || 0)
  }
  const aTotal = a.length - 1
  return (2 * intersection) / (aTotal + bTotal)
}

export function nameSimilarityForTechnicianMatch(scName, erpName) {
  const na = normalizeForNameMatch(scName)
  const nb = normalizeForNameMatch(erpName)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = tokenSortKey(scName)
  const tb = tokenSortKey(erpName)
  if (ta && ta === tb) return 1
  return Math.max(diceBigramCoefficient(na, nb), diceBigramCoefficient(ta, tb))
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object|null|undefined} detailData — SafetyCulture issue detail payload
 * @returns {Promise<{ user: { id: string, name: string | null, email: string }, via: 'email' | 'creatorName' | 'assigneeName' } | null>}
 */
export async function resolveSafetyCultureIssueTechnicianUser(prisma, detailData) {
  const people = extractIssuePeopleFromDetail(detailData)

  const users = await prisma.user.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, email: true }
  })
  if (!users.length) return null

  if (people.creatorEmail && EMAIL_RE.test(people.creatorEmail)) {
    const want = people.creatorEmail.toLowerCase()
    const hit = users.find((u) => (u.email || '').toLowerCase() === want)
    if (hit) return { user: hit, via: 'email' }
  }

  const pickUniqueBestName = (labelName, via) => {
    const raw = String(labelName || '').trim()
    if (!raw) return null
    const scored = users
      .filter((u) => u.name && String(u.name).trim())
      .map((u) => ({
        u,
        score: nameSimilarityForTechnicianMatch(raw, u.name)
      }))
      .filter((x) => x.score >= MIN_NAME_SCORE)
      .sort((a, b) => b.score - a.score)

    if (!scored.length) return null
    const top = scored[0]
    if (scored.length >= 2) {
      const second = scored[1]
      if (second.score >= top.score - TIE_MARGIN) return null
    }
    return { user: top.u, via }
  }

  const creatorHit = pickUniqueBestName(people.creatorName, 'creatorName')
  if (creatorHit) return creatorHit

  if (
    people.assigneeName &&
    normalizeForNameMatch(people.assigneeName) !== normalizeForNameMatch(people.creatorName)
  ) {
    const assigneeHit = pickUniqueBestName(people.assigneeName, 'assigneeName')
    if (assigneeHit) return assigneeHit
  }

  return null
}
