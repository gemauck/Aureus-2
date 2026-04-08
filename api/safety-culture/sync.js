/**
 * POST /api/safety-culture/sync
 * Pull feeds into local cache (incremental by default). Body: { full?: boolean, inspections?: boolean, issues?: boolean, enrichCap?: number }
 */
import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { parseJsonBody } from '../_lib/body.js'
import { runSafetyCultureSync } from '../_lib/safetyCultureSync.js'
import { resolveSafetyCultureApiKey } from '../_lib/safetyCultureApiKey.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Method not allowed', { allowed: ['POST'] })
  }

  const key = await resolveSafetyCultureApiKey()
  if (!key || !key.startsWith('scapi_')) {
    return badRequest(res, 'Safety Culture API key is not configured')
  }

  let body = {}
  try {
    body = (await parseJsonBody(req)) || {}
  } catch {
    body = {}
  }

  const full = Boolean(body.full)
  const inspections = body.inspections !== false
  const issues = body.issues !== false
  const enrichCap =
    body.enrichCap != null ? Math.max(0, Math.min(Number(body.enrichCap), 200)) : undefined

  try {
    const result = await runSafetyCultureSync({ full, inspections, issues, enrichCap })
    if (!result.ok) {
      return serverError(res, result.error || result.inspections?.error || result.issues?.error, {
        inspections: result.inspections,
        issues: result.issues
      })
    }
    return ok(res, result)
  } catch (e) {
    console.error('safety-culture sync', e)
    return serverError(res, 'Sync failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
