/**
 * GET /api/safety-culture/issues/detail?id=
 * Full issue payload from SafetyCulture detail APIs.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { fetchIssueDetails } from '../../_lib/safetyCultureClient.js'
import { prisma } from '../../_lib/prisma.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed', { allowed: ['GET'] })
  }

  const url = new URL(req.url || '', 'http://localhost')
  const id = url.searchParams.get('id')
  if (!id) {
    return badRequest(res, 'Query parameter id is required')
  }

  const live =
    url.searchParams.get('live') === '1' || url.searchParams.get('refresh') === '1'

  try {
    if (!live && process.env.SAFETY_CULTURE_DISABLE_LOCAL_CACHE !== 'true') {
      const row = await prisma.safetyCultureCachedIssue.findUnique({
        where: { externalId: id },
        select: { detailJson: true }
      })
      const cached = row?.detailJson
      if (cached && typeof cached === 'object') {
        return ok(res, cached)
      }
    }

    const detail = await fetchIssueDetails(id)
    if (detail?.error) {
      return serverError(res, detail.error, detail.details)
    }
    const payload = {
      id,
      detail: detail?.data ?? detail
    }

    if (process.env.SAFETY_CULTURE_DISABLE_LOCAL_CACHE !== 'true') {
      void prisma.safetyCultureCachedIssue
        .upsert({
          where: { externalId: id },
          create: {
            externalId: id,
            payloadJson: { id },
            detailJson: payload
          },
          update: { detailJson: payload }
        })
        .catch(() => {})
    }

    return ok(res, payload)
  } catch (e) {
    console.error('issue detail error', e)
    return serverError(res, 'Failed to load issue detail', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
