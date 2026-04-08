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
import { prisma } from '../../_lib/prisma.js'
import { sanitizePayloadForPrismaJson } from '../../_lib/safetyCultureJsonSafe.js'

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

  const live =
    url.searchParams.get('live') === '1' || url.searchParams.get('refresh') === '1'

  try {
    if (!live && process.env.SAFETY_CULTURE_DISABLE_LOCAL_CACHE !== 'true') {
      const row = await prisma.safetyCultureCachedInspection.findUnique({
        where: { externalId: id },
        select: { detailJson: true }
      })
      const cached = row?.detailJson
      if (cached && typeof cached === 'object') {
        const hasAnswers = Object.prototype.hasOwnProperty.call(cached, 'answers')
        if (!includeAnswers || hasAnswers) {
          return ok(res, cached)
        }
      }
    }

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

    const payload = {
      id,
      detail: detail?.data ?? detail,
      ...(includeAnswers && { answers, answersError })
    }

    if (process.env.SAFETY_CULTURE_DISABLE_LOCAL_CACHE !== 'true') {
      const detailJson = sanitizePayloadForPrismaJson(payload)
      const payloadJson = sanitizePayloadForPrismaJson({ id })
      void prisma.safetyCultureCachedInspection
        .upsert({
          where: { externalId: id },
          create: {
            externalId: id,
            payloadJson,
            detailJson
          },
          update: { detailJson }
        })
        .catch((err) => console.warn('inspection detail cache upsert:', err?.message || err))
    }

    return ok(res, payload)
  } catch (e) {
    console.error('inspection detail error', e)
    return serverError(res, 'Failed to load inspection detail', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
