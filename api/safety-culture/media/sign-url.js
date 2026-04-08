/**
 * GET /api/safety-culture/media/sign-url?id=&token=&media_type=MEDIA_TYPE_IMAGE (optional)
 * Proxies SafetyCulture signed download URL (short-lived) for authenticated ERP users only.
 * @see https://developer.safetyculture.com/reference/mediaservice_getdownloadsignedurl
 */
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, forbidden, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { safetyCultureRequest } from '../../_lib/safetyCultureClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed', { allowed: ['GET'] })
  }

  const url = new URL(req.url || '', 'http://localhost')
  const id = url.searchParams.get('id')
  const token = url.searchParams.get('token')
  if (!id || !token) {
    return badRequest(res, 'Query parameters id and token are required')
  }

  const mediaType = url.searchParams.get('media_type')
  const q = new URLSearchParams({ token })
  if (mediaType) q.set('media_type', mediaType)

  const path = `/media/v1/download/${encodeURIComponent(id)}?${q.toString()}`
  const result = await safetyCultureRequest(path)

  if (result?.error) {
    if (result?.status === 403) {
      return forbidden(res, 'Media unavailable: permission denied by SafetyCulture')
    }
    if (result?.status === 404) {
      return badRequest(res, 'Media unavailable: file or token not found')
    }
    return serverError(res, result.error, result.details)
  }

  const signedUrl =
    result?.url ||
    result?.download_info?.mp4_info?.url ||
    result?.download_info?.stream_info?.stream_url

  if (!signedUrl || typeof signedUrl !== 'string') {
    return serverError(res, 'No download URL in SafetyCulture response', result)
  }

  return ok(res, { url: signedUrl })
}

export default withHttp(withLogging(authRequired(handler)))
