/**
 * Incident report photo helpers (parse, display URLs, job card → incident copy).
 */

const SKIP_KINDS = new Set(['signature', 'voice'])

function parsePhotosArray(raw) {
  try {
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return typeof raw === 'string' && raw.trim() ? [raw] : []
  }
}

export function parseIncidentPhotosArray(raw) {
  return parsePhotosArray(raw)
}

export function incidentPhotoUrl(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return String(entry).trim()
  if (typeof entry !== 'object') return ''
  const obj = entry
  if (obj.kind === 'safetyCultureMedia' && obj.mediaId && obj.token) {
    const issueId = obj.issueId != null ? String(obj.issueId) : ''
    const params = new URLSearchParams({
      media_id: String(obj.mediaId),
      token: String(obj.token)
    })
    if (issueId) params.set('issue_id', issueId)
    return `/api/safety-culture/media/proxy?${params}`
  }
  return String(
    obj.url ||
      obj.thumbUrl ||
      obj.previewUrl ||
      obj.dataUrl ||
      obj.src ||
      obj.imageUrl ||
      ''
  ).trim()
}

export function incidentPhotoThumbUrl(entry) {
  if (!entry || typeof entry !== 'object') return incidentPhotoUrl(entry)
  return String(entry.thumbUrl || entry.previewUrl || entry.url || '').trim() || incidentPhotoUrl(entry)
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

export function incidentPhotoLabel(entry, index) {
  if (entry && typeof entry === 'object' && entry.name) return String(entry.name)
  return `Photo ${index + 1}`
}

function photoDedupeKey(entry) {
  const url = incidentPhotoUrl(entry)
  if (url) return url
  if (entry && typeof entry === 'object' && entry.kind === 'safetyCultureMedia' && entry.mediaId) {
    return `sc:${entry.mediaId}`
  }
  return ''
}

/**
 * Visual job card attachments suitable for incident reports (no signatures / voice notes).
 * @param {unknown} photosInput
 */
export function photosForIncidentFromJobCard(photosInput) {
  const rows = parsePhotosArray(photosInput)
  const out = []
  const seen = new Set()
  for (const entry of rows) {
    if (entry && typeof entry === 'object') {
      const kind = String(entry.kind || '').trim()
      if (SKIP_KINDS.has(kind)) continue
    }
    const url = incidentPhotoUrl(entry)
    if (!url && !(entry && typeof entry === 'object' && entry.kind === 'safetyCultureMedia')) continue
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

/** @param {...unknown[]} lists */
export function mergeIncidentPhotos(...lists) {
  const out = []
  const seen = new Set()
  for (const list of lists) {
    for (const entry of parsePhotosArray(list)) {
      const key = photoDedupeKey(entry)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(entry)
    }
  }
  return out
}

export function partitionIncidentPhotosForPrint(photosInput) {
  return parseIncidentPhotosArray(photosInput)
    .map((entry, idx) => ({
      entry,
      url: incidentPhotoUrl(entry),
      thumbUrl: incidentPhotoThumbUrl(entry),
      isVideo: incidentPhotoIsVideo(entry),
      label: incidentPhotoLabel(entry, idx)
    }))
    .filter((row) => row.url)
}

if (typeof window !== 'undefined') {
  window.IncidentPhotos = {
    parseIncidentPhotosArray,
    incidentPhotoUrl,
    incidentPhotoThumbUrl,
    incidentPhotoIsVideo,
    incidentPhotoLabel,
    photosForIncidentFromJobCard,
    mergeIncidentPhotos,
    partitionIncidentPhotosForPrint
  }
}
