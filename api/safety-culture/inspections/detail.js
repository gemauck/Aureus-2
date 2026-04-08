/**
 * GET /api/safety-culture/inspections/detail?id=&include_answers=0|1
 * Full inspection/audit payload + optional question answers (can be large).
 */
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import {
  fetchInspectionDetails,
  fetchInspectionAnswers
} from '../../_lib/safetyCultureClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed', { allowed: ['GET'] })
  }

  const url = new URL(req.url || '', 'http://localhost')
  const id = url.searchParams.get('id')
  if (!id) {
    return badRequest(res, 'Query parameter id is required')
  }

  const includeAnswers =
    url.searchParams.get('include_answers') === '1' ||
    url.searchParams.get('include_answers') === 'true'

  try {
    const detail = await fetchInspectionDetails(id)
    if (detail?.error) {
      return serverError(res, detail.error, detail.details)
    }

    let answers = null
    let answersError = null
    if (includeAnswers) {
      const ans = await fetchInspectionAnswers(id)
      if (ans.error) {
        answersError = ans.error
      } else {
        answers = ans.answers
      }
    }

    return ok(res, {
      id,
      detail: detail?.data ?? detail,
      ...(includeAnswers && { answers, answersError })
    })
  } catch (e) {
    console.error('inspection detail error', e)
    return serverError(res, 'Failed to load inspection detail', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
