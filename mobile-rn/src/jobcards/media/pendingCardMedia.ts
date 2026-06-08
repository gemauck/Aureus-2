/** Extract thumbnail URLs from a pending job card photos payload for list previews. */
import { API_BASE_URL } from '../../config'
import { extractSectionWorkMedia, extractVisualPhotos } from './photoHydration'

function resolveThumb(url: string, thumbUrl?: string): string {
  const thumb = String(thumbUrl || '').trim()
  if (thumb) return thumb
  const full = String(url || '').trim()
  if (!full) return ''
  if (full.startsWith('data:image') || full.startsWith('file:') || full.startsWith('content:')) {
    return full
  }
  if (full.startsWith('/') && !full.startsWith('//')) {
    return `${API_BASE_URL.replace(/\/$/, '')}${full}`
  }
  return full
}

export function extractPendingCardThumbUrls(photosValue: unknown, max = 4): string[] {
  const apiBase = API_BASE_URL
  const visual = extractVisualPhotos(photosValue, apiBase)
  const section = extractSectionWorkMedia(photosValue, apiBase)
  const sectionFlat = [
    ...section.diagnosis,
    ...section.actionsTaken,
    ...section.futureWorkRequired
  ]
  const out: string[] = []
  for (const item of [...visual, ...sectionFlat]) {
    const thumb = resolveThumb(item.url, item.thumbUrl)
    if (!thumb) continue
    if (item.mediaType === 'video' || thumb.startsWith('data:video')) continue
    out.push(thumb)
    if (out.length >= max) break
  }
  return out
}

export function countPendingCardMedia(photosValue: unknown): number {
  const apiBase = API_BASE_URL
  const visual = extractVisualPhotos(photosValue, apiBase)
  const section = extractSectionWorkMedia(photosValue, apiBase)
  return (
    visual.length +
    section.diagnosis.length +
    section.actionsTaken.length +
    section.futureWorkRequired.length
  )
}
