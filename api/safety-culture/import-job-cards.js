/**
 * Import Safety Culture inspections as ERP Job Cards
 * POST /api/safety-culture/import-job-cards
 * Body: { limit?: number, modified_after?: string } - optional filters
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { parseJsonBody } from '../_lib/body.js'
import { prisma } from '../_lib/prisma.js'
import { fetchInspections, fetchInspectionsNextPage } from '../_lib/safetyCultureClient.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Method not allowed', { allowed: ['POST'] })
  }

  const body = (await parseJsonBody(req)) || {}

  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 100, 1), 500)
  const modifiedAfter = body.modified_after || null

  try {
    const results = { imported: 0, skipped: 0, errors: [] }

    // Get next job card number
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
            completed: 'both',
            archived: 'both'
          })

      if (result.error) {
        return serverError(res, result.error, result.details)
      }

      const inspections = result.data || []
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
          const jobCardNumber = `JC${String(nextNum++).padStart(4, '0')}`
          const reportLink = insp.web_report_link
            ? `\nSafety Culture report: ${insp.web_report_link}`
            : ''
          const scoreInfo =
            insp.score != null
              ? `\nScore: ${insp.score}${insp.max_score != null ? `/${insp.max_score}` : ''}`
              : ''

          await prisma.jobCard.create({
            data: {
              jobCardNumber,
              agentName: insp.owner_name || insp.author_name || '',
              otherTechnicians: '[]',
              clientId: null,
              clientName: insp.client_site || '',
              siteId: '',
              siteName: insp.client_site || '',
              location: insp.location || '',
              timeOfArrival: insp.date_started ? new Date(insp.date_started) : null,
              completedAt: insp.date_completed ? new Date(insp.date_completed) : null,
              submittedAt: insp.date_completed
                ? new Date(insp.date_completed)
                : insp.date_started
                  ? new Date(insp.date_started)
                  : new Date(),
              reasonForVisit: insp.template_name || '',
              diagnosis: insp.name || '',
              otherComments: `Imported from Safety Culture.${reportLink}${scoreInfo}`.trim(),
              photos: '[]',
              status: insp.date_completed ? 'completed' : 'draft',
              safetyCultureAuditId: auditId,
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
