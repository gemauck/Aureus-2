/**
 * Safety Culture groups / organizations
 * GET /api/safety-culture/groups - List groups and orgs the user belongs to
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { fetchGroups } from '../_lib/safetyCultureClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return ok(res, { error: 'Method not allowed', allowed: ['GET'] })
  }

  const result = await fetchGroups()

  if (result.error) {
    return serverError(res, result.error, result.details)
  }

  const data = result.data ?? result
  const groups = Array.isArray(data) ? data : (data?.connections ?? data?.data ?? [])

  return ok(res, { groups })
}

export default withHttp(withLogging(authRequired(handler)))
