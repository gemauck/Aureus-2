const SAFE_UPLOAD_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/

/**
 * Accept both current ds-* ids and legacy ids while preventing path traversal.
 * Returns normalized id string or empty string when invalid.
 */
export function normalizeUploadId(value) {
  const id = String(value || '').trim()
  if (!id) return ''
  if (!SAFE_UPLOAD_ID_RE.test(id)) return ''
  if (id.includes('..')) return ''
  return id
}
