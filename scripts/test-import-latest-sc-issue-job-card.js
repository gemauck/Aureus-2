#!/usr/bin/env node
/**
 * One-off: import a SafetyCulture issue as a job card.
 * Uses DATABASE_URL + SafetyCulture API key (env or System table, same as the app).
 *
 * Usage (from repo root):
 *   node scripts/test-import-latest-sc-issue-job-card.js
 *   node scripts/test-import-latest-sc-issue-job-card.js <issue-uuid>
 *
 * Optional env:
 *   SC_ISSUE_ID=<uuid>     — same as passing uuid as first argument
 *   SC_IMPORT_SNAPSHOT=0   — skip snapshot (not recommended)
 *   SC_ISSUES_FEED_LIMIT=100 — max feed rows to scan (latest-unimported mode only)
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
import {
  buildIssueJobCardPhotosJson,
  overlayIssueJobCardFieldsFromDetail
} from '../api/_lib/safetyCultureIssueJobCard.js'

/**
 * Map incident/detail API payload (mixed snake_case / camelCase / nested) to feed-like row.
 */
function issueFieldsForJobCard(d, fallbackId) {
  if (!d || typeof d !== 'object') d = {}
  const site = d.site && typeof d.site === 'object' ? d.site : {}
  const loc = d.location && typeof d.location === 'object' ? d.location : {}
  const cat = d.category && typeof d.category === 'object' ? d.category : {}
  const task = d.task && typeof d.task === 'object' ? d.task : {}
  const asg = d.assignee && typeof d.assignee === 'object' ? d.assignee : {}
  const cre = d.creator && typeof d.creator === 'object' ? d.creator : {}
  const id = d.id || d.issue_id || fallbackId
  const taskDesc = task.description || task.DESCRIPTION
  return {
    id,
    title: d.title || task.title || (taskDesc ? String(taskDesc).slice(0, 500) : undefined),
    name: d.name,
    description: d.description || taskDesc,
    status: d.status,
    priority: d.priority,
    unique_id: d.unique_id,
    category_label: d.category_label || cat.label || cat.name,
    inspection_name: d.inspection_name || d.inspectionName,
    due_at: d.due_at || d.dueAt,
    url: d.url || d.web_url || d.link,
    web_url: d.web_url,
    link: d.link,
    assignee_name:
      d.assignee_name ||
      d.assigneeName ||
      asg.name ||
      asg.display_name ||
      asg.full_name,
    assigneeName: d.assigneeName || asg.name,
    creator_user_name:
      d.creator_user_name ||
      d.creatorUserName ||
      cre.name ||
      cre.display_name,
    site_name: d.site_name || d.siteName || site.name,
    site_id: d.site_id ?? d.siteId ?? site.id,
    location_name:
      d.location_name ||
      d.locationName ||
      loc.name ||
      [loc.city, loc.region, loc.country].filter(Boolean).join(', ') ||
      '',
    occurred_at: d.occurred_at || d.occurredAt,
    created_at: d.created_at || d.createdAt,
    createdAt: d.createdAt,
    completed_at: d.completed_at || d.completedAt,
    completedAt: d.completedAt
  }
}

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

  const specificId = String(
    process.argv[2] || process.env.SC_ISSUE_ID || ''
  ).trim()

  let issue
  let issueId
  let detailResult = null
  const testLabel = specificId ? 'test import by id' : 'test script'

  if (specificId) {
    const existing = await prisma.jobCard.findFirst({
      where: { safetyCultureIssueId: specificId },
      select: { id: true, jobCardNumber: true }
    })
    if (existing) {
      console.log(
        `Issue ${specificId} is already a job card: ${existing.jobCardNumber} (id=${existing.id})`
      )
      return
    }

    detailResult = await fetchIssueDetails(specificId)
    if (detailResult?.error) {
      console.error('fetchIssueDetails:', detailResult.error, detailResult.details || '')
      process.exitCode = 1
      return
    }

    issue = issueFieldsForJobCard(detailResult.data, specificId)
    issueId = issue.id
    if (!issueId) {
      console.error('Could not resolve issue id from SafetyCulture API response.')
      process.exitCode = 1
      return
    }
    console.log('Importing issue by id:', issueId, issue.title || issue.description || '')
  } else {
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

    issue = pending[0]
    if (!issue) {
      console.log(
        `No unimported issues in the first ${all.length} feed row(s). All may already be job cards.`
      )
      return
    }

    issueId = issue.id
    console.log('Picked issue:', issueId, issue.title || issue.name || issue.unique_id || '')

    detailResult = await fetchIssueDetails(issueId)
  }

  const detailData =
    detailResult && !detailResult.error ? detailResult.data ?? null : null
  const enriched = overlayIssueJobCardFieldsFromDetail({ ...issue }, detailData)
  const photosJson = buildIssueJobCardPhotosJson(issue, detailData)

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

  const title =
    enriched.title || enriched.name || enriched.description || issueId
  const issueLink =
    enriched.url || enriched.web_url || enriched.link ||
    issue.url || issue.web_url || issue.link
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

  const row = await prisma.jobCard.create({
    data: {
      jobCardNumber,
      agentName:
        enriched.assignee_name ||
        enriched.assigneeName ||
        enriched.creator_user_name ||
        '',
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
      otherComments:
        `Imported from Safety Culture issue (${testLabel}).${linkText}${meta.length ? '\n' + meta.join(', ') : ''}`.trim(),
      photos: photosJson,
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
  let mediaCount = 0
  try {
    mediaCount = JSON.parse(photosJson).length
  } catch {
    mediaCount = 0
  }
  console.log('OK — created job card', row.jobCardNumber, 'id=', row.id)
  console.log('Snapshot chars:', snapLen, 'SC media slots in photos:', mediaCount)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })
