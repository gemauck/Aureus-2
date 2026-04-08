/**
 * POST/GET /api/cron/safety-culture-sync?secret=
 * Scheduled incremental sync into local Safety Culture cache.
 */
import { ok, badRequest, serverError } from '../_lib/response.js'
import { runSafetyCultureSync } from '../_lib/safetyCultureSync.js'
import { resolveSafetyCultureApiKey } from '../_lib/safetyCultureApiKey.js'

async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const provided =
    (req.query && req.query.secret) ||
    (req.headers && (req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')))
  if (secret && provided !== secret) {
    return badRequest(res, 'Invalid or missing cron secret')
  }

  const key = await resolveSafetyCultureApiKey()
  if (!key || !key.startsWith('scapi_')) {
    return ok(res, { skipped: true, reason: 'Safety Culture API key not configured' })
  }

  try {
    const enrichCap = parseInt(process.env.SAFETY_CULTURE_CRON_SYNC_ENRICH_CAP || '0', 10)
    const result = await runSafetyCultureSync({
      full: false,
      inspections: true,
      issues: true,
      enrichCap: Number.isFinite(enrichCap) ? enrichCap : 0
    })
    if (!result.ok) {
      return serverError(res, result.error || 'Sync failed', {
        inspections: result.inspections,
        issues: result.issues
      })
    }
    return ok(res, { ok: true, ...result })
  } catch (e) {
    console.error('cron safety-culture-sync', e)
    return serverError(res, 'Sync failed', e.message)
  }
}

export default handler
