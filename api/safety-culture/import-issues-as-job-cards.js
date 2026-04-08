/**
 * Import Safety Culture issues as ERP Job Cards
 * POST /api/safety-culture/import-issues-as-job-cards
 * Body: {
 *   limit?: number,
 *   modified_after?: string,
 *   modified_before?: string,
 *   include_snapshot?: boolean (default true),
 * }
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { parseJsonBody } from '../_lib/body.js'
import { prisma } from '../_lib/prisma.js'
import { fetchIssues, fetchIssuesNextPage, fetchIssueDetails, normaliseFeedData } from '../_lib/safetyCultureClient.js'
import { serializeSafetyCultureSnapshot } from '../_lib/safetyCultureSnapshot.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Method not allowed', { allowed: ['POST'] })
  }

  let body = {}
  try {
    body = (await parseJsonBody(req)) || {}
  } catch (e) {
    return badRequest(res, 'Invalid request body', { details: e.message })
  }

  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 100, 1), 500)
  const modifiedAfter = body.modified_after || null
  const modifiedBefore = body.modified_before || null
  const includeSnapshot = body.include_snapshot !== false

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
        ? await fetchIssuesNextPage(nextPage)
        : await fetchIssues({
            limit: Math.min(50, limit - fetched),
            modified_after: modifiedAfter || undefined,
            modified_before: modifiedBefore || undefined
          })

      if (result.error) {
        return serverError(res, result.error, result.details)
      }

      const issues = normaliseFeedData(result)
      fetched += issues.length

      for (const issue of issues) {
        const issueId = issue.id
        if (!issueId) continue

        const existing = await prisma.jobCard.findFirst({
          where: { safetyCultureIssueId: issueId },
          select: { id: true }
        })
        if (existing) {
          results.skipped++
          continue
        }

        try {
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

          const jobCardNumber = `JC${String(nextNum++).padStart(4, '0')}`
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

          await prisma.jobCard.create({
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
              otherComments: `Imported from Safety Culture issue.${linkText}${meta.length ? '\n' + meta.join(', ') : ''}`.trim(),
              photos: '[]',
              status:
                statusLow === 'closed' || statusLow === 'complete' || statusLow === 'completed'
                  ? 'completed'
                  : 'draft',
              safetyCultureIssueId: issueId,
              safetyCultureSnapshotJson: snapshotJson,
              ownerId: req.user?.sub || null
            }
          })
          results.imported++
        } catch (err) {
          results.errors.push({ issueId, message: err.message })
        }
      }

      nextPage = result.metadata?.next_page || null
    } while (nextPage && fetched < limit)

    return ok(res, {
      summary: `Imported ${results.imported} job cards from issues, skipped ${results.skipped} (already exist)`,
      ...results
    })
  } catch (err) {
    console.error('Safety Culture issues import error:', err)
    if (!res.headersSent) {
      return serverError(res, 'Import failed', err.message)
    }
  }
}

export default withHttp(withLogging(authRequired(handler)))
