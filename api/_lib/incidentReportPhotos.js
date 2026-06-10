/** Shared incident photo parsing, job-card copy, and PDF buffer loading. */

const SKIP_KINDS = new Set(['signature', 'voice'])

export function parseIncidentPhotosArray(raw) {
  try {
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return typeof raw === 'string' && raw.trim() ? [raw] : []
  }
}

export function incidentPhotoUrl(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return String(entry).trim()
  if (typeof entry !== 'object') return ''
  if (entry.kind === 'safetyCultureMedia' && entry.mediaId && entry.token) {
    const params = new URLSearchParams({
      media_id: String(entry.mediaId),
      token: String(entry.token)
    })
    if (entry.issueId != null) params.set('issue_id', String(entry.issueId))
    return `/api/safety-culture/media/proxy?${params}`
  }
  return String(
    entry.url || entry.thumbUrl || entry.dataUrl || entry.previewUrl || entry.src || entry.imageUrl || ''
  ).trim()
}

export function incidentPhotoIsVideo(entry) {
  const url = incidentPhotoUrl(entry)
  if (!url) return false
  if (typeof entry === 'object' && entry) {
    const mt = String(entry.mediaType || entry.mimeType || '').toLowerCase()
    if (mt.includes('video')) return true
    if (entry.kind === 'video') return true
  }
  return /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

function photoDedupeKey(entry) {
  const url = incidentPhotoUrl(entry)
  if (url) return url
  if (entry && typeof entry === 'object' && entry.kind === 'safetyCultureMedia' && entry.mediaId) {
    return `sc:${entry.mediaId}`
  }
  return ''
}

/** Visual job card attachments suitable for incident reports (no signatures / voice notes). */
export function photosForIncidentFromJobCard(photosInput) {
  const rows = parseIncidentPhotosArray(photosInput)
  const out = []
  const seen = new Set()
  for (const entry of rows) {
    if (entry && typeof entry === 'object') {
      const kind = String(entry.kind || '').trim()
      if (SKIP_KINDS.has(kind)) continue
    }
    const url = incidentPhotoUrl(entry)
    if (!url && !(entry && typeof entry === 'object' && entry.kind === 'safetyCultureMedia')) continue
    if (incidentPhotoIsVideo(entry)) continue
    const key = photoDedupeKey(entry)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    if (typeof entry === 'string') {
      out.push({ kind: 'imageMedia', name: 'Job card photo', url: entry, thumbUrl: entry })
      continue
    }
    if (entry && typeof entry === 'object') {
      const kind = String(entry.kind || '').trim()
      if (kind === 'sectionMedia' || kind === 'imageMedia' || kind === 'safetyCultureMedia') {
        out.push({ ...entry })
        continue
      }
      if (entry.url || entry.dataUrl) {
        out.push({
          kind: 'imageMedia',
          name: String(entry.name || entry.filename || 'Job card photo'),
          url: String(entry.url || entry.dataUrl),
          thumbUrl: String(entry.thumbUrl || entry.previewUrl || entry.url || entry.dataUrl || '')
        })
      }
    }
  }
  return out
}

export function mergeIncidentPhotos(...lists) {
  const out = []
  const seen = new Set()
  for (const list of lists) {
    for (const entry of parseIncidentPhotosArray(list)) {
      const key = photoDedupeKey(entry)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(entry)
    }
  }
  return out
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} jobCardIds
 */
export async function loadJobCardPhotosForIncident(prisma, jobCardIds) {
  const ids = [...new Set((jobCardIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return []
  const rows = await prisma.jobCard.findMany({
    where: { id: { in: ids } },
    select: { photos: true }
  })
  const merged = []
  for (const row of rows) {
    merged.push(...photosForIncidentFromJobCard(row.photos))
  }
  return mergeIncidentPhotos(merged)
}

/**
 * Incident photos for display/PDF: stored photos plus linked job card photos when empty.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} incident
 */
export async function resolveIncidentPhotosWithJobCardFallback(prisma, incident) {
  const stored = parseIncidentPhotosArray(incident?.photos)
  if (stored.length) return stored
  const linkIds = []
  if (Array.isArray(incident?.linkedJobCards)) {
    for (const row of incident.linkedJobCards) {
      const id = String(row?.id || row?.jobCardId || '').trim()
      if (id) linkIds.push(id)
    }
  }
  const legacyId = String(incident?.jobCardId || '').trim()
  if (legacyId) linkIds.push(legacyId)
  if (!linkIds.length) return []
  return loadJobCardPhotosForIncident(prisma, linkIds)
}
