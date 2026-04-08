/**
 * Import Safety Culture inspections as ERP Job Cards
 * POST /api/safety-culture/import-job-cards
 * Body: {
 *   limit?: number,
 *   modified_after?: string,
 *   modified_before?: string,
 *   template?: string | string[] (template IDs),
 *   web_report_link?: 'private' | 'public',
 *   completed?: 'true' | 'false' | 'both',
 *   archived?: 'true' | 'false' | 'both',
 *   include_snapshot?: boolean (default true) — store feed + API detail (+ answers by default) on JobCard,
 *   include_answers?: boolean (default true when snapshot on) — include /inspections/v1/answers (large/slow); set false to skip
 * }
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { parseJsonBody } from '../_lib/body.js'
import { prisma } from '../_lib/prisma.js'
import {
  fetchInspections,
  fetchInspectionsNextPage,
  fetchInspectionDetails,
  fetchInspectionAnswers,
  normaliseFeedData
} from '../_lib/safetyCultureClient.js'
import { serializeSafetyCultureSnapshot } from '../_lib/safetyCultureSnapshot.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Method not allowed', { allowed: ['POST'] })
  }

  const body = (await parseJsonBody(req)) || {}

  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 100, 1), 500)
  const modifiedAfter = body.modified_after || null
  const modifiedBefore = body.modified_before || null
  const webReportLink = body.web_report_link === 'public' || body.web_report_link === 'private' ? body.web_report_link : undefined
  const template = body.template != null ? body.template : undefined
  const completed = body.completed != null ? body.completed : 'both'
  const archived = body.archived != null ? body.archived : 'both'
  const includeSnapshot = body.include_snapshot !== false
  const includeAnswers = includeSnapshot && body.include_answers !== false

  try {
    const results = { imported: 0, skipped: 0, errors: [] }

    const lastCard = await prisma.jobCard.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { jobCardNumber: true }
    })
    let nextNum = 1
    if (lastCard?.jobCardNumber) {
      const m = lastCard.jobCardNumber.match(/JC(\d+)/)
      if (m) nextNum = parseInt(m[1], 10) + 1
    }

    let fetched = 0
    let nextPage = null

    do {
      const result = nextPage
        ? await fetchInspectionsNextPage(nextPage)
        : await fetchInspections({
            limit: Math.min(50, limit - fetched),
            modified_after: modifiedAfter || undefined,
            modified_before: modifiedBefore || undefined,
            template,
            web_report_link: webReportLink,
            completed,
            archived
          })

      if (result.error) {
        return serverError(res, result.error, result.details)
      }

      const inspections = normaliseFeedData(result)
      fetched += inspections.length

      for (const insp of inspections) {
        const auditId = insp.id
        if (!auditId) continue

        const existing = await prisma.jobCard.findFirst({
          where: { safetyCultureAuditId: auditId },
          select: { id: true }
        })
        if (existing) {
          results.skipped++
          continue
        }

        try {
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

          const jobCardNumber = `JC${String(nextNum++).padStart(4, '0')}`
          const reportLink = insp.web_report_link
            ? `\nSafety Culture report: ${insp.web_report_link}`
            : ''
          const scoreInfo =
            insp.score != null
              ? `\nScore: ${insp.score}${insp.max_score != null ? `/${insp.max_score}` : ''}`
              : ''
          const pct =
            insp.score_percentage != null
              ? `\nScore %: ${insp.score_percentage}`
              : ''
          const docNo = insp.document_no ? `\nDocument: ${insp.document_no}` : ''
          const templateLine = insp.template_id ? `\nTemplate ID: ${insp.template_id}` : ''

          await prisma.jobCard.create({
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
                `Imported from Safety Culture.${reportLink}${scoreInfo}${pct}${docNo}${templateLine}`.trim(),
              photos: '[]',
              status: insp.date_completed ? 'completed' : 'draft',
              safetyCultureAuditId: auditId,
              safetyCultureSnapshotJson: snapshotJson,
              ownerId: req.user?.sub || null
            }
          })
          results.imported++
        } catch (err) {
          results.errors.push({ auditId, message: err.message })
        }
      }

      nextPage = result.metadata?.next_page || null
    } while (nextPage && fetched < limit)

    return ok(res, {
      summary: `Imported ${results.imported} job cards, skipped ${results.skipped} (already exist)`,
      ...results
    })
  } catch (err) {
    console.error('Safety Culture import error:', err)
    return serverError(res, 'Import failed', err.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
