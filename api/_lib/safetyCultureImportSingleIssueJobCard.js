/**
 * Create one job card from a SafetyCulture issue (feed row + detail fetch result).
 * Shared by batch import and single-issue import API.
 */

import { fetchIssueDetails } from './safetyCultureClient.js'
import { serializeSafetyCultureSnapshot } from './safetyCultureSnapshot.js'
import {
  buildIssueJobCardPhotosJson,
  buildSafetyCultureIssueNotesAppendix,
  issueFeedRowFromIssueDetail,
  overlayIssueJobCardFieldsFromDetail
} from './safetyCultureIssueJobCard.js'
import { resolveSafetyCultureIssueTechnicianUser } from './safetyCultureIssueTechnicianMatch.js'

/**
 * @param {object} opts
 * @param {import('@prisma/client').PrismaClient} opts.prisma
 * @param {object} opts.issue — feed-like row (must include id)
 * @param {string} opts.issueId — SafetyCulture issue id (uuid)
 * @param {{ data?: object, error?: string, details?: unknown }} opts.detailResult
 * @param {boolean} opts.includeSnapshot
 * @param {{ sub?: string, id?: string }|null|undefined} opts.reqUser
 * @param {string} opts.jobCardNumber — next JC####
 */
export async function createJobCardFromSafetyCultureIssueImport(opts) {
  const {
    prisma,
    issue,
    issueId,
    detailResult,
    includeSnapshot,
    reqUser,
    jobCardNumber
  } = opts

  const detailData =
    detailResult && !detailResult.error ? detailResult.data ?? null : null
  const enriched = overlayIssueJobCardFieldsFromDetail({ ...issue }, detailData)

  const snapshotJson = includeSnapshot
    ? serializeSafetyCultureSnapshot({
        version: 1,
        source: 'issue',
        id: issueId,
        capturedAt: new Date().toISOString(),
        feed: issue,
        detail: detailResult?.error
          ? { error: detailResult.error, details: detailResult.details }
          : (detailResult?.data ?? detailResult ?? null)
      })
    : null

  const title =
    enriched.title || enriched.name || enriched.description || issueId
  const issueLink =
    enriched.url ||
    enriched.web_url ||
    enriched.link ||
    issue.url ||
    issue.web_url ||
    issue.link
  const linkText = issueLink ? `\nSafety Culture issue: ${issueLink}` : ''
  const meta = []
  const st = enriched.status ?? issue.status
  const pr = enriched.priority ?? issue.priority
  const uid = enriched.unique_id ?? issue.unique_id
  const cat = enriched.category_label ?? issue.category_label
  const insp = enriched.inspection_name ?? issue.inspection_name
  const due = enriched.due_at ?? issue.due_at
  if (st) meta.push(`Status: ${st}`)
  if (pr) meta.push(`Priority: ${pr}`)
  if (uid) meta.push(`Unique ID: ${uid}`)
  if (cat) meta.push(`Category: ${cat}`)
  if (insp) meta.push(`Inspection: ${insp}`)
  if (due) meta.push(`Due: ${due}`)

  const statusLow = (st || '').toLowerCase()
  const completedAt =
    enriched.completed_at || enriched.completedAt || issue.completed_at || issue.completedAt
      ? new Date(
          enriched.completed_at ||
            enriched.completedAt ||
            issue.completed_at ||
            issue.completedAt
        )
      : statusLow === 'closed' || statusLow === 'complete' || statusLow === 'completed'
        ? new Date()
        : null

  const photosJson = buildIssueJobCardPhotosJson(issue, detailData)
  const fullNotesAppendix = buildSafetyCultureIssueNotesAppendix(
    issueId,
    issue,
    detailData
  )
  const otherCommentsBase = `Imported from Safety Culture issue.${linkText}${meta.length ? '\n' + meta.join(', ') : ''}`.trim()

  const scAgentDisplay =
    enriched.assignee_name ||
    enriched.assigneeName ||
    enriched.creator_user_name ||
    ''
  let technicianUser = null
  try {
    technicianUser = await resolveSafetyCultureIssueTechnicianUser(prisma, detailData)
  } catch (e) {
    console.warn('SafetyCulture technician match skipped:', e?.message || e)
  }
  const ownerSub = reqUser?.sub || reqUser?.id || null
  const ownerIdForCard = technicianUser ? technicianUser.user.id : ownerSub
  const agentNameForCard = technicianUser
    ? String(technicianUser.user.name || '').trim() || scAgentDisplay
    : scAgentDisplay

  return prisma.jobCard.create({
    data: {
      jobCardNumber,
      agentName: agentNameForCard,
      otherTechnicians: '[]',
      clientId: null,
      clientName:
        enriched.client_name ||
        enriched.site_name ||
        issue.site_name ||
        '',
      siteId:
        enriched.site_id != null
          ? String(enriched.site_id)
          : issue.site_id != null
            ? String(issue.site_id)
            : '',
      siteName: enriched.site_name || issue.site_name || '',
      location: enriched.location_name || issue.location_name || '',
      locationLatitude:
        enriched.latitude != null && enriched.latitude !== ''
          ? String(enriched.latitude)
          : issue.latitude != null && issue.latitude !== ''
            ? String(issue.latitude)
            : '',
      locationLongitude:
        enriched.longitude != null && enriched.longitude !== ''
          ? String(enriched.longitude)
          : issue.longitude != null && issue.longitude !== ''
            ? String(issue.longitude)
            : '',
      timeOfArrival:
        enriched.occurred_at || issue.occurred_at
          ? new Date(enriched.occurred_at || issue.occurred_at)
          : enriched.created_at || enriched.createdAt || issue.created_at || issue.createdAt
            ? new Date(
                enriched.created_at ||
                  enriched.createdAt ||
                  issue.created_at ||
                  issue.createdAt
              )
            : null,
      completedAt,
      submittedAt:
        enriched.created_at || enriched.createdAt || issue.created_at || issue.createdAt
          ? new Date(
              enriched.created_at ||
                enriched.createdAt ||
                issue.created_at ||
                issue.createdAt
            )
          : new Date(),
      reasonForVisit: 'Safety Culture Issue',
      diagnosis: title,
      otherComments: `${otherCommentsBase}${fullNotesAppendix}`.trim(),
      photos: photosJson,
      status:
        statusLow === 'closed' || statusLow === 'complete' || statusLow === 'completed'
          ? 'completed'
          : 'draft',
      safetyCultureIssueId: issueId,
      safetyCultureSnapshotJson: snapshotJson,
      ownerId: ownerIdForCard
    }
  })
}

/**
 * Import one issue by UUID when no job card exists yet.
 * @returns {Promise<
 *   | { ok: true, skipped: true, jobCardId: string, jobCardNumber: string, issueId: string }
 *   | { ok: true, created: true, jobCard: object, issueId: string }
 *   | { ok: false, error: string, details?: unknown, issueId: string }
 * >}
 */
export async function importSingleSafetyCultureIssueAsJobCard({
  prisma,
  issueId: rawIssueId,
  reqUser,
  includeSnapshot = true
}) {
  const issueId = String(rawIssueId || '').trim()
  if (!issueId) {
    return { ok: false, error: 'issue_id is required', issueId: '' }
  }

  const existing = await prisma.jobCard.findFirst({
    where: { safetyCultureIssueId: issueId },
    select: { id: true, jobCardNumber: true }
  })
  if (existing) {
    return {
      ok: true,
      skipped: true,
      jobCardId: existing.id,
      jobCardNumber: existing.jobCardNumber,
      issueId
    }
  }

  const detailResult = await fetchIssueDetails(issueId)
  if (detailResult?.error) {
    return {
      ok: false,
      error: detailResult.error,
      details: detailResult.details,
      issueId
    }
  }

  const issue = issueFeedRowFromIssueDetail(detailResult.data, issueId)
  const resolvedIssueId = issue.id || issueId

  const lastCard = await prisma.jobCard.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { jobCardNumber: true }
  })
  let nextNum = 1
  if (lastCard?.jobCardNumber) {
    const m = lastCard.jobCardNumber.match(/JC(\d+)/)
    if (m) nextNum = parseInt(m[1], 10) + 1
  }
  const jobCardNumber = `JC${String(nextNum).padStart(4, '0')}`

  const jobCard = await createJobCardFromSafetyCultureIssueImport({
    prisma,
    issue,
    issueId: resolvedIssueId,
    detailResult,
    includeSnapshot,
    reqUser,
    jobCardNumber
  })

  return { ok: true, created: true, jobCard, issueId: resolvedIssueId }
}
