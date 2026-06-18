import type { JobCardFormData, MediaItem, SectionWorkMedia, VoiceClip } from '../types'

const SECTION_KEYS = ['diagnosis', 'actionsTaken', 'futureWorkRequired'] as const

export function buildSectionPhotoEntriesFromState(sectionWorkMedia: SectionWorkMedia) {
  return SECTION_KEYS.flatMap((sec) =>
    (sectionWorkMedia[sec] || []).map((item) => ({
      kind: 'sectionMedia' as const,
      section: sec,
      url: item.url,
      name: item.name || '',
      thumbUrl: item.thumbUrl || ''
    }))
  )
}

export function buildVoicePhotoEntriesFromState(voiceAttachments: VoiceClip[]) {
  return voiceAttachments.map((v) => ({
    kind: 'voice' as const,
    section: v.section,
    url: v.dataUrl,
    name: v.name || 'Voice note'
  }))
}

export function visualPhotosForSave(
  selectedPhotos: MediaItem[],
  formPhotos: JobCardFormData['photos']
): JobCardFormData['photos'] {
  return selectedPhotos.length ? (selectedPhotos as JobCardFormData['photos']) : formPhotos
}
