/**
 * Import Safety Culture issues as ERP Job Cards
 * POST /api/safety-culture/import-issues-as-job-cards
 * Body: { limit?: number, modified_after?: string } - optional filters
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { parseJsonBody } from '../_lib/body.js'
import { prisma } from '../_lib/prisma.js'
import { fetchIssues, fetchIssuesNextPage } from '../_lib/safetyCultureClient.js'

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
        ? await fetchIssuesNextPage(nextPage)
        : await fetchIssues({
            limit: Math.min(50, limit - fetched),
            modified_after: modifiedAfter || undefined
          })

      if (result.error) {
        return serverError(res, result.error, result.details)
      }

      const issues = result.data || []
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
          const jobCardNumber = `JC${String(nextNum++).padStart(4, '0')}`
          const title = issue.title || issue.name || issue.description || issueId
          const issueLink = issue.url || issue.web_url || issue.link
          const linkText = issueLink ? `\nSafety Culture issue: ${issueLink}` : ''
          const meta = []
          if (issue.status) meta.push(`Status: ${issue.status}`)
          if (issue.priority) meta.push(`Priority: ${issue.priority}`)

          await prisma.jobCard.create({
            data: {
              jobCardNumber,
              agentName: issue.assignee_name || issue.assigneeName || '',
              otherTechnicians: '[]',
              clientId: null,
              clientName: '',
              siteId: '',
              siteName: '',
              location: '',
              timeOfArrival: issue.created_at || issue.createdAt
                ? new Date(issue.created_at || issue.createdAt)
                : null,
              completedAt: (issue.status || '').toLowerCase() === 'closed' && (issue.due_date || issue.dueDate)
                ? new Date(issue.due_date || issue.dueDate)
                : null,
              submittedAt: (issue.created_at || issue.createdAt)
                ? new Date(issue.created_at || issue.createdAt)
                : new Date(),
              reasonForVisit: 'Safety Culture Issue',
              diagnosis: title,
              otherComments: `Imported from Safety Culture issue.${linkText}${meta.length ? '\n' + meta.join(', ') : ''}`.trim(),
              photos: '[]',
              status: (issue.status || '').toLowerCase() === 'closed' ? 'completed' : 'draft',
              safetyCultureIssueId: issueId,
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
    return serverError(res, 'Import failed', err.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
