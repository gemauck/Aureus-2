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
import { createJobCardFromSafetyCultureIssueImport } from '../_lib/safetyCultureImportSingleIssueJobCard.js'

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
          const detailResult = await fetchIssueDetails(issueId)
          const jobCardNumber = `JC${String(nextNum++).padStart(4, '0')}`

          await createJobCardFromSafetyCultureIssueImport({
            prisma,
            issue,
            issueId,
            detailResult,
            includeSnapshot,
            reqUser: req.user,
            jobCardNumber
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
