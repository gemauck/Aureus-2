/**
 * Safety Culture inspections feed
 * GET /api/safety-culture/inspections
 * Query: modified_after (ISO date), limit, completed, archived, next_page
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, badRequest, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { fetchInspections, fetchInspectionsNextPage } from '../_lib/safetyCultureClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return ok(res, { error: 'Method not allowed', allowed: ['GET'] })
  }

  const url = new URL(req.url || '', 'http://localhost')
  const modifiedAfter = url.searchParams.get('modified_after')
  const limit = url.searchParams.get('limit')
  const completed = url.searchParams.get('completed') || 'both'
  const archived = url.searchParams.get('archived') || 'both'
  const nextPage = url.searchParams.get('next_page')

  let result
  if (nextPage) {
    result = await fetchInspectionsNextPage(nextPage)
  } else {
    result = await fetchInspections({
      modified_after: modifiedAfter || undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      completed: completed === 'true' ? true : completed === 'false' ? false : 'both',
      archived: archived === 'true' ? true : archived === 'false' ? false : 'both'
    })
  }

  if (result.error) {
    return serverError(res, result.error, result.details)
  }

  return ok(res, {
    inspections: result.data ?? [],
    metadata: result.metadata ?? { next_page: null, remaining_records: 0 }
  })
}

export default withHttp(withLogging(authRequired(handler)))
