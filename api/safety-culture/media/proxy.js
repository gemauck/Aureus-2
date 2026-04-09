/**
 * GET /api/safety-culture/media/proxy?id=&token=&media_type= (optional)&filename= (optional hint)&issue_id= (optional, SafetyCulture issue id for token refresh)
 * Returns media bytes through ERP backend so the browser always gets a fresh URL path.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, forbidden, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import {
  buildMediaTypeAttempts,
  fetchSignedUrlWithRetries,
  refreshIssueMediaCredentials
} from '../../_lib/safetyCultureMediaDownload.js'

async function resolveSignedUrl(id, token, mediaType, filename, issueId) {
  let attempts = buildMediaTypeAttempts(mediaType, filename)
  let { signedUrl, last } = await fetchSignedUrlWithRetries(id, token, attempts)

  const shouldRefresh =
    !signedUrl &&
    issueId &&
    (last?.status === 403 || last?.status === 404)

  if (shouldRefresh) {
    const fresh = await refreshIssueMediaCredentials(issueId, id, filename)
    if (fresh) {
      attempts = buildMediaTypeAttempts(fresh.mediaType || mediaType, fresh.filename || filename)
      ;({ signedUrl, last } = await fetchSignedUrlWithRetries(
        fresh.mediaId,
        fresh.token,
        attempts
      ))
    }
  }

  return { signedUrl, last }
}

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
  const filename = url.searchParams.get('filename')
  const issueId = url.searchParams.get('issue_id')

  const { signedUrl, last } = await resolveSignedUrl(id, token, mediaType, filename, issueId)

  if (!signedUrl) {
    if (last?.status === 403) {
      return forbidden(res, 'Media unavailable: permission denied by SafetyCulture')
    }
    if (last?.status === 404) {
      return badRequest(res, 'Media unavailable: file or token not found')
    }
    return serverError(res, last?.error || 'No download URL in SafetyCulture response', last?.details || last)
  }

  let upstream
  try {
    upstream = await fetch(signedUrl)
  } catch (e) {
    return serverError(res, 'Failed to fetch signed media URL', e?.message || e)
  }
  if (!upstream.ok) {
    return serverError(res, `Failed to download media (${upstream.status})`)
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')
  const disposition = upstream.headers.get('content-disposition')

  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'private, max-age=300')
  if (contentLength) res.setHeader('Content-Length', contentLength)
  if (disposition) res.setHeader('Content-Disposition', disposition)

  const ab = await upstream.arrayBuffer()
  res.end(Buffer.from(ab))
}

export default withHttp(withLogging(authRequired(handler)))
