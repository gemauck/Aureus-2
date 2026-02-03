/**
 * Safety Culture integration - status/config
 * GET /api/safety-culture - Check integration status and configuration
 */
import { authRequired } from './_lib/authRequired.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { fetchGroups } from './_lib/safetyCultureClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return ok(res, { error: 'Method not allowed', allowed: ['GET'] })
  }

  const apiKey = process.env.SAFETY_CULTURE_API_KEY
  const configured = !!(apiKey && apiKey.startsWith('scapi_'))

  // Quick connectivity test if configured
  let connected = false
  let groupsPreview = null
  if (configured) {
    const result = await fetchGroups()
    if (result.error) {
      connected = false
    } else {
      connected = true
      const data = result.data ?? result
      groupsPreview = Array.isArray(data) ? data.length : (data?.connections?.length ?? 'unknown')
    }
  }

  return ok(res, {
    integration: 'safety-culture',
    configured,
    connected: configured ? connected : null,
    endpoints: {
      inspections: '/api/safety-culture/inspections',
      issues: '/api/safety-culture/issues',
      groups: '/api/safety-culture/groups'
    },
    docs: 'https://developer.safetyculture.com/',
    ...(configured && { groupsCount: groupsPreview })
  })
}

export default withHttp(withLogging(authRequired(handler)))
