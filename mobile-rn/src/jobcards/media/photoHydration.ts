/** Parse job card photos JSON into gallery / section / voice state (mirrors web JobCardFormPublic). */
import type { MediaItem, SectionWorkMedia, VoiceClip } from '../types'

type PhotoRaw = string | Record<string, unknown>

function parsePhotosArray(value: unknown): PhotoRaw[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return value.trim() ? [value] : []
    }
  }
  return []
}

function resolveMediaUrl(raw: string, apiBase: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (s.startsWith('data:') || s.startsWith('file:') || s.startsWith('content:')) return s
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('/')) return `${apiBase.replace(/\/$/, '')}${s}`
  return s
}

export function extractVisualPhotos(photosValue: unknown, apiBase: string): MediaItem[] {
  const photosRaw = parsePhotosArray(photosValue)
  const out: MediaItem[] = []
  photosRaw.forEach((p, idx) => {
    if (typeof p === 'string') {
      const url = resolveMediaUrl(p, apiBase)
      if (url) out.push({ url, name: `Photo ${idx + 1}` })
      return
    }
    if (!p || typeof p !== 'object') return
    const kind = String(p.kind || '')
    if (kind === 'voice' || kind === 'sectionMedia' || kind === 'signature') return
    const candidate =
      (typeof p.url === 'string' && p.url) ||
      (typeof p.dataUrl === 'string' && p.dataUrl) ||
      (typeof p.src === 'string' && p.src) ||
      (typeof p.imageUrl === 'string' && p.imageUrl) ||
      ''
    const url = resolveMediaUrl(candidate, apiBase)
    if (!url) return
    out.push({
      url,
      name: String(p.name || `Photo ${idx + 1}`),
      thumbUrl:
        typeof p.thumbUrl === 'string'
          ? resolveMediaUrl(p.thumbUrl, apiBase)
          : typeof p.previewUrl === 'string'
            ? resolveMediaUrl(p.previewUrl, apiBase)
            : undefined,
      mediaType: typeof p.mediaType === 'string' ? p.mediaType : undefined
    })
  })
  return out
}

export function extractSectionWorkMedia(photosValue: unknown, apiBase: string): SectionWorkMedia {
  const photosRaw = parsePhotosArray(photosValue)
  const restored: SectionWorkMedia = {
    diagnosis: [],
    actionsTaken: [],
    futureWorkRequired: []
  }
  photosRaw.forEach((p, idx) => {
    if (!p || typeof p !== 'object' || p.kind !== 'sectionMedia') return
    const sec = String(p.section || '')
    if (!(sec in restored)) return
    const mediaUrl =
      (typeof p.url === 'string' && p.url) ||
      (typeof p.dataUrl === 'string' && p.dataUrl) ||
      ''
    const url = resolveMediaUrl(mediaUrl, apiBase)
    if (!url) return
    restored[sec as keyof SectionWorkMedia].push({
      url,
      name: String(p.name || `Attachment ${idx + 1}`),
      thumbUrl:
        typeof p.thumbUrl === 'string' ? resolveMediaUrl(p.thumbUrl, apiBase) : undefined
    })
  })
  return restored
}

export function extractVoiceClips(photosValue: unknown, apiBase: string): VoiceClip[] {
  const photosRaw = parsePhotosArray(photosValue)
  return photosRaw
    .filter((p) => p && typeof p === 'object' && p.kind === 'voice')
    .map((v, i) => {
      const raw = v as Record<string, unknown>
      const dataUrl = resolveMediaUrl(
        String(raw.url || raw.dataUrl || ''),
        apiBase
      )
      return {
        id: `vn_${i}_${Date.now()}`,
        section: String(raw.section || 'otherComments'),
        dataUrl,
        name: String(raw.name || `Voice note ${i + 1}`)
      }
    })
    .filter((v) => v.dataUrl)
}

export function extractSignatureFromPhotos(photosValue: unknown, apiBase: string): string {
  const photosRaw = parsePhotosArray(photosValue)
  const hit = photosRaw.find(
    (p) => p && typeof p === 'object' && p.kind === 'signature' && typeof p.url === 'string'
  ) as { url?: string } | undefined
  return hit?.url ? resolveMediaUrl(hit.url, apiBase) : ''
}

export function applyPhotosPayloadToWizardState(
  photosValue: unknown,
  apiBase: string
): {
  selectedPhotos: MediaItem[]
  sectionWorkMedia: SectionWorkMedia
  voiceAttachments: VoiceClip[]
  customerSignature: string
} {
  return {
    selectedPhotos: extractVisualPhotos(photosValue, apiBase),
    sectionWorkMedia: extractSectionWorkMedia(photosValue, apiBase),
    voiceAttachments: extractVoiceClips(photosValue, apiBase),
    customerSignature: extractSignatureFromPhotos(photosValue, apiBase)
  }
}
