/**
 * Shared helpers for SafetyCulture GET /media/v1/download/{id} (signed URL + retries).
 * @see https://developer.safetyculture.com/reference/mediaservice_getdownloadsignedurl
 */
import { safetyCultureRequest, fetchIssueDetails } from './safetyCultureClient.js'
import { collectIssueMediaForJobCard } from './safetyCultureIssueJobCard.js'

export function extractSignedUrl(result) {
  if (!result || result.error) return null
  const u =
    result.url ||
    result?.download_info?.mp4_info?.url ||
    result?.download_info?.stream_info?.stream_url
  return typeof u === 'string' && u ? u : null
}

export function inferMediaTypesFromFilename(filename) {
  const f = String(filename || '').toLowerCase()
  const out = []
  if (/\.(jpe?g|png|gif|webp|heic|bmp|tiff?)$/i.test(f)) out.push('MEDIA_TYPE_IMAGE')
  if (/\.(mp4|mov|webm|m4v)$/i.test(f)) out.push('MEDIA_TYPE_VIDEO')
  if (/\.pdf$/i.test(f)) out.push('MEDIA_TYPE_PDF')
  if (/\.docx?$/i.test(f)) out.push('MEDIA_TYPE_DOCX')
  if (/\.xlsx?$/i.test(f)) out.push('MEDIA_TYPE_XLSX')
  return out
}

/**
 * @param {string|null} preferred — from query media_type
 * @param {string|null} filename — optional basename hint
 * @returns {(string|null)[]} null = omit media_type query param
 */
export function buildMediaTypeAttempts(preferred, filename) {
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

export async function fetchSignedUrlWithRetries(id, token, attempts) {
  let last = null
  for (const mt of attempts) {
    const q = new URLSearchParams({ token })
    if (mt) q.set('media_type', mt)
    const path = `/media/v1/download/${encodeURIComponent(id)}?${q.toString()}`
    const result = await safetyCultureRequest(path)
    last = result
    const signed = extractSignedUrl(result)
    if (signed) return { signedUrl: signed, last: result }
    if (result?.error && result.status == null) break
    const st = result?.status
    // Some valid assets return 404 for a wrong media_type; keep trying alternates.
    if (st !== 403 && st !== 400 && st !== 404) break
  }
  return { signedUrl: null, last }
}

/**
 * Re-fetch the issue from SafetyCulture and return a fresh id/token pair for this file.
 * Stored JobCard.photos tokens expire; SC returns 403 when token no longer matches.
 *
 * @param {string} issueId — SafetyCulture issue id (same as JobCard.safetyCultureIssueId)
 * @param {string} mediaId — media id from stored photos JSON
 * @param {string} [filenameHint]
 * @returns {Promise<{ mediaId: string, token: string, mediaType: string, filename: string } | null>}
 */
export async function refreshIssueMediaCredentials(issueId, mediaId, filenameHint) {
  if (!issueId || !mediaId) return null
  const res = await fetchIssueDetails(String(issueId).trim())
  if (res?.error || !res?.data) return null
  const detail = res.data
  const items = collectIssueMediaForJobCard({}, detail)
  const mid = String(mediaId)
  let match = items.find((x) => String(x.mediaId) === mid)
  if (!match && filenameHint) {
    const fn = String(filenameHint).trim()
    if (fn) {
      const lower = fn.toLowerCase()
      match = items.find(
        (x) =>
          String(x.filename || '') === fn ||
          String(x.filename || '').toLowerCase() === lower
      )
    }
  }
  if (!match?.token) return null
  return {
    mediaId: String(match.mediaId),
    token: String(match.token),
    mediaType: match.mediaType != null ? String(match.mediaType) : '',
    filename: match.filename != null ? String(match.filename) : filenameHint || 'media'
  }
}
