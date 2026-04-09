/**
 * GET /api/safety-culture/media/sign-url?id=&token=&media_type= (optional)&filename= (optional hint)&issue_id= (optional)
 * Proxies SafetyCulture signed download URL (short-lived) for authenticated ERP users only.
 * Retries with alternate media_type values when SC returns 403/400 (wrong type is a common cause).
 * When download fails with 403/404 and issue_id is provided, re-fetches fresh credentials from Get an issue.
 * @see https://developer.safetyculture.com/reference/mediaservice_getdownloadsignedurl
 */
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, forbidden, ok, serverError } from '../../_lib/response.js'
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

  const { signedUrl, last: resultForError } = await resolveSignedUrl(
    id,
    token,
    mediaType,
    filename,
    issueId
  )

  if (!signedUrl) {
    if (resultForError?.error) {
      if (resultForError?.status === 403) {
        return forbidden(res, 'Media unavailable: permission denied by SafetyCulture')
      }
      if (resultForError?.status === 404) {
        return badRequest(res, 'Media unavailable: file or token not found')
      }
      return serverError(res, resultForError.error, resultForError.details)
    }
    return serverError(res, 'No download URL in SafetyCulture response', resultForError)
  }

  return ok(res, { url: signedUrl })
}

export default withHttp(withLogging(authRequired(handler)))
