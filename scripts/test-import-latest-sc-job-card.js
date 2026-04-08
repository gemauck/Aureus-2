#!/usr/bin/env node
/**
 * One-off: import the newest SafetyCulture inspection that is not yet linked to a job card.
 * Uses DATABASE_URL + SafetyCulture API key (env or System table, same as the app).
 *
 * Usage (from repo root):
 *   node scripts/test-import-latest-sc-job-card.js
 *
 * Optional env:
 *   SC_IMPORT_SNAPSHOT=0   — skip snapshot (not recommended)
 *   SC_IMPORT_ANSWERS=0    — skip /answers (faster, less data)
 *   SC_FEED_LIMIT=100      — max rows from first feed page(s) to consider
 */
import 'dotenv/config'
import { prisma } from '../api/_lib/prisma.js'
import {
  fetchInspections,
  fetchInspectionsNextPage,
  fetchInspectionDetails,
  fetchInspectionAnswers,
  normaliseFeedData
} from '../api/_lib/safetyCultureClient.js'
import { serializeSafetyCultureSnapshot } from '../api/_lib/safetyCultureSnapshot.js'

function inspectionSortTs(insp) {
  const candidates = [
    insp.date_completed,
    insp.modified_at,
    insp.date_started,
    insp.date_created
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
  const includeAnswers = includeSnapshot && process.env.SC_IMPORT_ANSWERS !== '0'
  const feedLimit = Math.min(
    500,
    Math.max(1, parseInt(process.env.SC_FEED_LIMIT || '100', 10) || 100)
  )

  const existingRows = await prisma.jobCard.findMany({
    where: { safetyCultureAuditId: { not: null } },
    select: { safetyCultureAuditId: true }
  })
  const importedIds = new Set(
    existingRows.map((r) => r.safetyCultureAuditId).filter(Boolean)
  )

  let fetched = 0
  let nextPage = null
  const all = []

  do {
    const result = nextPage
      ? await fetchInspectionsNextPage(nextPage)
      : await fetchInspections({
          limit: Math.min(100, feedLimit - fetched),
          completed: 'both',
          archived: 'both'
        })

    if (result.error) {
      console.error('SafetyCulture feed error:', result.error)
      process.exitCode = 1
      return
    }

    const batch = normaliseFeedData(result)
    all.push(...batch)
    fetched += batch.length
    nextPage = result.metadata?.next_page || null
  } while (nextPage && fetched < feedLimit)

  if (!all.length) {
    console.log('No inspections returned from SafetyCulture feed.')
    return
  }

  const pending = all
    .filter((i) => i.id && !importedIds.has(i.id))
    .sort((a, b) => inspectionSortTs(b) - inspectionSortTs(a))

  const insp = pending[0]
  if (!insp) {
    console.log(
      `No unimported inspections in the first ${all.length} feed row(s). All may already be job cards.`
    )
    return
  }

  const auditId = insp.id
  console.log('Picked inspection:', auditId, insp.name || insp.template_name || '')

  let detailResult = null
  let answersResult = null
  if (includeSnapshot) {
    detailResult = await fetchInspectionDetails(auditId)
    if (includeAnswers && !detailResult?.error) {
      answersResult = await fetchInspectionAnswers(auditId)
    }
  }

  const snapshotJson = includeSnapshot
    ? serializeSafetyCultureSnapshot({
        version: 1,
        source: 'inspection',
        id: auditId,
        capturedAt: new Date().toISOString(),
        feed: insp,
        detail: detailResult?.error
          ? { error: detailResult.error, details: detailResult.details }
          : (detailResult?.data ?? detailResult ?? null),
        answers:
          includeAnswers && answersResult && !answersResult.error
            ? answersResult.answers
            : undefined,
        answersError: answersResult?.error || undefined
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

  const reportLink = insp.web_report_link
    ? `\nSafety Culture report: ${insp.web_report_link}`
    : ''
  const scoreInfo =
    insp.score != null
      ? `\nScore: ${insp.score}${insp.max_score != null ? `/${insp.max_score}` : ''}`
      : ''
  const pct =
    insp.score_percentage != null ? `\nScore %: ${insp.score_percentage}` : ''
  const docNo = insp.document_no ? `\nDocument: ${insp.document_no}` : ''
  const templateLine = insp.template_id ? `\nTemplate ID: ${insp.template_id}` : ''

  const row = await prisma.jobCard.create({
    data: {
      jobCardNumber,
      agentName: insp.owner_name || insp.author_name || insp.prepared_by || '',
      otherTechnicians: '[]',
      clientId: null,
      clientName: insp.client_site || '',
      siteId: insp.site_id != null ? String(insp.site_id) : '',
      siteName: insp.client_site || insp.location || '',
      location: insp.location || insp.client_site || '',
      locationLatitude: insp.latitude != null ? String(insp.latitude) : '',
      locationLongitude: insp.longitude != null ? String(insp.longitude) : '',
      timeOfArrival: insp.date_started ? new Date(insp.date_started) : null,
      completedAt: insp.date_completed ? new Date(insp.date_completed) : null,
      submittedAt: insp.date_completed
        ? new Date(insp.date_completed)
        : insp.date_started
          ? new Date(insp.date_started)
          : new Date(),
      reasonForVisit: insp.template_name || '',
      diagnosis: insp.name || '',
      otherComments:
        `Imported from Safety Culture (test script).${reportLink}${scoreInfo}${pct}${docNo}${templateLine}`.trim(),
      photos: '[]',
      status: insp.date_completed ? 'completed' : 'draft',
      safetyCultureAuditId: auditId,
      safetyCultureSnapshotJson: snapshotJson,
      ownerId: null
    }
  })

  const snapLen = snapshotJson ? snapshotJson.length : 0
  const answerCount = Array.isArray(answersResult?.answers)
    ? answersResult.answers.length
    : 0
  console.log('OK — created job card', row.jobCardNumber, 'id=', row.id)
  console.log(
    'Snapshot chars:',
    snapLen,
    includeAnswers ? `(answers rows: ${answerCount})` : '(answers skipped)'
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })
