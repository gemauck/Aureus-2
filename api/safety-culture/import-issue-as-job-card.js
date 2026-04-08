/**
 * Import a single Safety Culture issue as one ERP job card (by UUID).
 * POST /api/safety-culture/import-issue-as-job-card
 * Body: { issue_id: string, include_snapshot?: boolean (default true) }
 *
 * Uses the same API key resolution as the app (env or System settings).
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { parseJsonBody } from '../_lib/body.js'
import { prisma } from '../_lib/prisma.js'
import { resolveSafetyCultureApiKey } from '../_lib/safetyCultureApiKey.js'
import { importSingleSafetyCultureIssueAsJobCard } from '../_lib/safetyCultureImportSingleIssueJobCard.js'

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

  const issueId = String(body.issue_id || body.issueId || '').trim()
  if (!issueId) {
    return badRequest(res, 'issue_id is required (SafetyCulture issue UUID)')
  }

  const includeSnapshot = body.include_snapshot !== false

  const key = await resolveSafetyCultureApiKey()
  if (!key || !key.startsWith('scapi_')) {
    return badRequest(res, 'Safety Culture API key is not configured')
  }

  try {
    const result = await importSingleSafetyCultureIssueAsJobCard({
      prisma,
      issueId,
      reqUser: req.user,
      includeSnapshot
    })

    if (!result.ok) {
      return serverError(res, result.error || 'Import failed', result.details)
    }

    if (result.skipped) {
      return ok(res, {
        skipped: true,
        message: 'This issue is already linked to a job card',
        issueId: result.issueId,
        jobCardId: result.jobCardId,
        jobCardNumber: result.jobCardNumber
      })
    }

    return ok(res, {
      skipped: false,
      imported: true,
      issueId: result.issueId,
      jobCardId: result.jobCard.id,
      jobCardNumber: result.jobCard.jobCardNumber
    })
  } catch (err) {
    console.error('Safety Culture single issue import error:', err)
    if (!res.headersSent) {
      return serverError(res, 'Import failed', err.message)
    }
  }
}

export default withHttp(withLogging(authRequired(handler)))
