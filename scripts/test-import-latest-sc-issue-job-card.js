#!/usr/bin/env node
/**
 * One-off: import the newest SafetyCulture issue that is not yet linked to a job card.
 * Uses DATABASE_URL + SafetyCulture API key (env or System table, same as the app).
 *
 * Usage (from repo root):
 *   node scripts/test-import-latest-sc-issue-job-card.js
 *
 * Optional env:
 *   SC_IMPORT_SNAPSHOT=0   — skip snapshot (not recommended)
 *   SC_ISSUES_FEED_LIMIT=100 — max feed rows to scan
 */
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import {
  fetchIssues,
  fetchIssuesNextPage,
  fetchIssueDetails,
  normaliseFeedData
} from '../api/_lib/safetyCultureClient.js'
import { serializeSafetyCultureSnapshot } from '../api/_lib/safetyCultureSnapshot.js'

function issueSortTs(issue) {
  const candidates = [
    issue.modified_at,
    issue.updated_at,
    issue.completed_at,
    issue.completedAt,
    issue.occurred_at,
    issue.created_at,
    issue.createdAt
  ]
  let best = 0
  for (const c of candidates) {
    if (!c) continue
    const t = new Date(c).getTime()
    if (Number.isFinite(t) && t > best) best = t
  }
  return best
}

async function main() {
  const includeSnapshot = process.env.SC_IMPORT_SNAPSHOT !== '0'
  const feedLimit = Math.min(
    500,
    Math.max(1, parseInt(process.env.SC_ISSUES_FEED_LIMIT || '100', 10) || 100)
  )

  const existingRows = await prisma.jobCard.findMany({
    where: { safetyCultureIssueId: { not: null } },
    select: { safetyCultureIssueId: true }
  })
  const importedIds = new Set(
    existingRows.map((r) => r.safetyCultureIssueId).filter(Boolean)
  )

  let fetched = 0
  let nextPage = null
  const all = []

  do {
    const result = nextPage
      ? await fetchIssuesNextPage(nextPage)
      : await fetchIssues({
          limit: Math.min(100, feedLimit - fetched)
        })

    if (result.error) {
      console.error('SafetyCulture issues feed error:', result.error)
      process.exitCode = 1
      return
    }

    const batch = normaliseFeedData(result)
    all.push(...batch)
    fetched += batch.length
    nextPage = result.metadata?.next_page || null
  } while (nextPage && fetched < feedLimit)

  if (!all.length) {
    console.log('No issues returned from SafetyCulture feed.')
    return
  }

  const pending = all
    .filter((i) => i.id && !importedIds.has(i.id))
    .sort((a, b) => issueSortTs(b) - issueSortTs(a))

  const issue = pending[0]
  if (!issue) {
    console.log(
      `No unimported issues in the first ${all.length} feed row(s). All may already be job cards.`
    )
    return
  }

  const issueId = issue.id
  console.log('Picked issue:', issueId, issue.title || issue.name || issue.unique_id || '')

  let detailResult = null
  if (includeSnapshot) {
    detailResult = await fetchIssueDetails(issueId)
  }

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

  const title = issue.title || issue.name || issue.description || issueId
  const issueLink = issue.url || issue.web_url || issue.link
  const linkText = issueLink ? `\nSafety Culture issue: ${issueLink}` : ''
  const meta = []
  if (issue.status) meta.push(`Status: ${issue.status}`)
  if (issue.priority) meta.push(`Priority: ${issue.priority}`)
  if (issue.unique_id) meta.push(`Unique ID: ${issue.unique_id}`)
  if (issue.category_label) meta.push(`Category: ${issue.category_label}`)
  if (issue.inspection_name) meta.push(`Inspection: ${issue.inspection_name}`)
  if (issue.due_at) meta.push(`Due: ${issue.due_at}`)

  const statusLow = (issue.status || '').toLowerCase()
  const completedAt =
    issue.completed_at || issue.completedAt
      ? new Date(issue.completed_at || issue.completedAt)
      : statusLow === 'closed' || statusLow === 'complete' || statusLow === 'completed'
        ? new Date()
        : null

  const row = await prisma.jobCard.create({
    data: {
      jobCardNumber,
      agentName:
        issue.assignee_name ||
        issue.assigneeName ||
        issue.creator_user_name ||
        '',
      otherTechnicians: '[]',
      clientId: null,
      clientName: issue.site_name || '',
      siteId: issue.site_id != null ? String(issue.site_id) : '',
      siteName: issue.site_name || '',
      location: issue.location_name || '',
      timeOfArrival: issue.occurred_at
        ? new Date(issue.occurred_at)
        : issue.created_at || issue.createdAt
          ? new Date(issue.created_at || issue.createdAt)
          : null,
      completedAt,
      submittedAt: (issue.created_at || issue.createdAt)
        ? new Date(issue.created_at || issue.createdAt)
        : new Date(),
      reasonForVisit: 'Safety Culture Issue',
      diagnosis: title,
      otherComments:
        `Imported from Safety Culture issue (test script).${linkText}${meta.length ? '\n' + meta.join(', ') : ''}`.trim(),
      photos: '[]',
      status:
        statusLow === 'closed' || statusLow === 'complete' || statusLow === 'completed'
          ? 'completed'
          : 'draft',
      safetyCultureIssueId: issueId,
      safetyCultureSnapshotJson: snapshotJson,
      ownerId: null
    }
  })

  const snapLen = snapshotJson ? snapshotJson.length : 0
  console.log('OK — created job card', row.jobCardNumber, 'id=', row.id)
  console.log('Snapshot chars:', snapLen)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })
