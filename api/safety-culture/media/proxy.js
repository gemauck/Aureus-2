/**
 * GET /api/safety-culture/media/proxy?id=&token=&media_type= (optional)&filename= (optional hint)
 * Returns media bytes through ERP backend so the browser always gets a fresh URL path.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, forbidden, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { safetyCultureRequest } from '../../_lib/safetyCultureClient.js'

function extractSignedUrl(result) {
  if (!result || result.error) return null
  const u =
    result.url ||
    result?.download_info?.mp4_info?.url ||
    result?.download_info?.stream_info?.stream_url
  return typeof u === 'string' && u ? u : null
}

function inferMediaTypesFromFilename(filename) {
  const f = String(filename || '').toLowerCase()
  const out = []
  if (/\.(jpe?g|png|gif|webp|heic|bmp|tiff?)$/i.test(f)) out.push('MEDIA_TYPE_IMAGE')
  if (/\.(mp4|mov|webm|m4v)$/i.test(f)) out.push('MEDIA_TYPE_VIDEO')
  if (/\.pdf$/i.test(f)) out.push('MEDIA_TYPE_PDF')
  if (/\.docx?$/i.test(f)) out.push('MEDIA_TYPE_DOCX')
  if (/\.xlsx?$/i.test(f)) out.push('MEDIA_TYPE_XLSX')
  return out
}

function buildMediaTypeAttempts(preferred, filename) {
  const attempts = []
  const push = (mt) => {
    if (mt == null) {
      if (!attempts.includes(null)) attempts.push(null)
      return
    }
    const s = String(mt).trim()
    if (!s) return
    if (!attempts.includes(s)) attempts.push(s)
  }
  push(preferred)
  for (const t of inferMediaTypesFromFilename(filename)) push(t)
  push(null)
  for (const t of [
    'MEDIA_TYPE_IMAGE',
    'MEDIA_TYPE_VIDEO',
    'MEDIA_TYPE_PDF',
    'MEDIA_TYPE_DOCX',
    'MEDIA_TYPE_XLSX'
  ]) {
    push(t)
  }
  return attempts
}

async function fetchSignedUrlWithRetries(id, token, attempts) {
  let last = null
  for (const mt of attempts) {
    const q = new URLSearchParams({ token })
    if (mt) q.set('media_type', mt)
    const path = `/media/v1/download/${encodeURIComponent(id)}?${q.toString()}`
    const result = await safetyCultureRequest(path)
    last = result
    const signed = extractSignedUrl(result)
    if (signed) return { signedUrl: signed }
    if (result?.error && result.status == null) break
    const st = result?.status
    if (st !== 403 && st !== 400) break
  }
  return { last }
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
  const attempts = buildMediaTypeAttempts(mediaType, filename)
  const { signedUrl, last } = await fetchSignedUrlWithRetries(id, token, attempts)

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
