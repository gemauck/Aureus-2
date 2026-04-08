/**
 * GET /api/safety-culture/issues/detail?id=
 * Full issue payload from SafetyCulture detail APIs.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { fetchIssueDetails } from '../../_lib/safetyCultureClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed', { allowed: ['GET'] })
  }

  const url = new URL(req.url || '', 'http://localhost')
  const id = url.searchParams.get('id')
  if (!id) {
    return badRequest(res, 'Query parameter id is required')
  }

  try {
    const detail = await fetchIssueDetails(id)
    if (detail?.error) {
      return serverError(res, detail.error, detail.details)
    }
    return ok(res, {
      id,
      detail: detail?.data ?? detail
    })
  } catch (e) {
    console.error('issue detail error', e)
    return serverError(res, 'Failed to load issue detail', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
