/**
 * Shared normalizer for document-collection email cell identity.
 * Use this in both send and activity APIs so DocumentCollectionEmailLog
 * writes and reads use identical projectId, documentId, month, year.
 */

/**
 * Normalize project ID from request (URL param or path).
 * @param {object} options - { req, rawId }
 * @returns {string|null} - Trimmed string or null
 */
export function normalizeProjectIdFromRequest({ req, rawId }) {
  const fromParam = req?.params?.id != null ? String(req.params.id).trim() : null
  if (fromParam) return fromParam
  if (rawId) return String(rawId).trim()
  const pathOrUrl = (req?.originalUrl || req?.url || req?.path || '').split('?')[0].split('#')[0]
  const match = pathOrUrl.match(/(?:\/api)?\/projects\/([^/]+)\//)
  return match && match[1] ? String(match[1]).trim() : null
}

/**
 * Normalize document-collection cell keys for DB (DocumentCollectionEmailLog).
 * Returns null if any required value is missing or invalid.
 *
 * @param {object} options - { projectId, documentId, month, year }
 * @returns {{ projectId: string, documentId: string, month: number, year: number } | null}
 */
export function normalizeDocumentCollectionCell({ projectId, documentId, month, year }) {
  const pid = projectId != null ? String(projectId).trim() : null
  const docId = documentId != null ? String(documentId).trim() : null
  if (!pid || !docId) return null

  const m = month != null ? (typeof month === 'number' ? month : parseInt(String(month), 10)) : null
  const y = year != null ? (typeof year === 'number' ? year : parseInt(String(year), 10)) : null
  if (m == null || isNaN(m) || m < 1 || m > 12 || y == null || isNaN(y)) return null

  return {
    projectId: pid,
    documentId: docId,
    month: Number(m),
    year: Number(y)
  }
}
