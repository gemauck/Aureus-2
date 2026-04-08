/**
 * Safety Culture integration - status/config
 * GET /api/safety-culture - Check integration status and configuration
 * PATCH /api/safety-culture - Admins: set or clear API key stored in database (optional when env is unset)
 */
import { authRequired } from './_lib/authRequired.js'
import { badRequest, forbidden, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { parseJsonBody } from './_lib/body.js'
import { prisma } from './_lib/prisma.js'
import { isAdminUser } from './_lib/adminRoles.js'
import { fetchGroups } from './_lib/safetyCultureClient.js'
import { resolveSafetyCultureApiKey, invalidateSafetyCultureApiKeyCache } from './_lib/safetyCultureApiKey.js'

async function handler(req, res) {
  if (req.method === 'GET') {
    const envKey = (process.env.SAFETY_CULTURE_API_KEY || '').trim()
    const resolved = await resolveSafetyCultureApiKey()
    const configured = !!(resolved && resolved.startsWith('scapi_'))

    let system = null
    try {
      system = await prisma.systemSettings.findUnique({
        where: { id: 'system' },
        select: { safetyCultureApiKey: true }
      })
    } catch (e) {
      console.error('safety-culture status: system settings read failed', e.message)
    }
    const storedKeyInDatabase = !!(system?.safetyCultureApiKey && system.safetyCultureApiKey.trim().length > 0)
    const keySource = configured ? (envKey.length > 0 ? 'environment' : 'database') : null

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

    let localCache = null
    try {
      const [inspectionRows, issueRows, syncState] = await Promise.all([
        prisma.safetyCultureCachedInspection.count(),
        prisma.safetyCultureCachedIssue.count(),
        prisma.safetyCultureSyncState.findUnique({
          where: { id: 'safety-culture-sync' }
        })
      ])
      localCache = {
        inspections: inspectionRows,
        issues: issueRows,
        lastInspectionsSyncAt: syncState?.lastInspectionsSyncAt ?? null,
        lastIssuesSyncAt: syncState?.lastIssuesSyncAt ?? null,
        lastRunAt: syncState?.lastRunAt ?? null,
        lastRunError: syncState?.lastRunError ?? null
      }
    } catch (e) {
      console.warn('safety-culture status: local cache counts failed', e.message)
    }

    return ok(res, {
      integration: 'safety-culture',
      configured,
      keySource,
      storedKeyInDatabase,
      connected: configured ? connected : null,
      endpoints: {
        inspections: '/api/safety-culture/inspections',
        inspectionDetail: '/api/safety-culture/inspections/detail?id=',
        issues: '/api/safety-culture/issues',
        issueDetail: '/api/safety-culture/issues/detail?id=',
        mediaSignUrl: '/api/safety-culture/media/sign-url?id=&token=',
        groups: '/api/safety-culture/groups',
        sync: 'POST /api/safety-culture/sync'
      },
      docs: 'https://developer.safetyculture.com/',
      ...(localCache && { localCache }),
      ...(configured && { groupsCount: groupsPreview })
    })
  }

  if (req.method === 'PATCH') {
    if (!isAdminUser(req.user)) {
      return forbidden(res, 'Only administrators can update the Safety Culture API key')
    }

    const body = await parseJsonBody(req)
    if (body.safetyCultureApiKey === undefined) {
      return badRequest(res, 'Expected safetyCultureApiKey (string to set, empty string to clear)')
    }

    const raw = body.safetyCultureApiKey
    const trimmed = raw == null ? '' : String(raw).trim()
    const nextKey = trimmed.length === 0 ? null : trimmed
    if (nextKey !== null && !nextKey.startsWith('scapi_')) {
      return badRequest(res, 'API key must start with scapi_')
    }

    try {
      await prisma.systemSettings.upsert({
        where: { id: 'system' },
        update: {
          safetyCultureApiKey: nextKey,
          updatedBy: req.user?.sub || req.user?.id || null
        },
        create: {
          id: 'system',
          companyName: 'Abcotronics',
          safetyCultureApiKey: nextKey,
          updatedBy: req.user?.sub || req.user?.id || null
        }
      })
    } catch (e) {
      console.error('safety-culture PATCH failed', e)
      return serverError(res, 'Failed to save API key', e.message)
    }

    invalidateSafetyCultureApiKeyCache()

    return ok(res, {
      saved: true,
      storedKeyInDatabase: !!nextKey
    })
  }

  return badRequest(res, 'Method not allowed', { allowed: ['GET', 'PATCH'] })
}

export default withHttp(withLogging(authRequired(handler)))
