import * as FileSystem from 'expo-file-system'
import { JOB_CARD_VIDEO_MAX_BYTES } from '../../../../src/jobCardWizard/constants.js'
import type { MediaItem } from '../types'

/** Convert local file URI to data URL for API sync (voice notes, etc.). */
export async function uriToDataUrl(uri: string, fallbackMime = 'audio/mp4'): Promise<string> {
  const trimmed = String(uri || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:')) return trimmed
  if (!trimmed.startsWith('file:') && !trimmed.startsWith('content:')) return trimmed
  try {
    const ext = trimmed.split('.').pop()?.toLowerCase() || ''
    const mime =
      ext === 'm4a' || ext === 'aac'
        ? 'audio/mp4'
        : ext === 'webm'
          ? 'audio/webm'
          : ext === 'caf'
            ? 'audio/x-caf'
            : fallbackMime
    const base64 = await FileSystem.readAsStringAsync(trimmed, {
      encoding: FileSystem.EncodingType.Base64
    })
    return `data:${mime};base64,${base64}`
  } catch {
    return trimmed
  }
}

export async function voiceClipToPayloadUrl(clip: { dataUrl: string }): Promise<string> {
  return uriToDataUrl(clip.dataUrl, 'audio/mp4')
}

/** Resolve file:// attachments to data URLs before sync (photos, videos). */
export async function normalizeMediaItemForSave(item: MediaItem): Promise<MediaItem> {
  const url = String(item.url || '').trim()
  if (!url.startsWith('file:') && !url.startsWith('content:')) {
    return item
  }
  const isVideo =
    item.mediaType === 'video' ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ||
    url.startsWith('data:video')

  if (isVideo) {
    try {
      const info = await FileSystem.getInfoAsync(url)
      const size = info.exists && 'size' in info ? Number(info.size) : 0
      if (size > JOB_CARD_VIDEO_MAX_BYTES) {
        const mb = (size / (1024 * 1024)).toFixed(1)
        const limitMb = (JOB_CARD_VIDEO_MAX_BYTES / (1024 * 1024)).toFixed(0)
        throw new Error(
          `Video "${item.name || 'attachment'}" is ${mb} MB (max ${limitMb} MB). Remove it or use a shorter clip before submitting.`
        )
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('max')) throw error
    }
  }

  const dataUrl = await uriToDataUrl(url, isVideo ? 'video/mp4' : 'image/jpeg')
  if (isVideo && dataUrl.startsWith('data:') && dataUrl.length > JOB_CARD_VIDEO_MAX_BYTES * 1.4) {
    throw new Error(
      `Video "${item.name || 'attachment'}" is too large to upload. Remove it or use a shorter clip.`
    )
  }
  let thumbUrl = String(item.thumbUrl || '').trim()
  if (thumbUrl.startsWith('file:') || thumbUrl.startsWith('content:')) {
    try {
      thumbUrl = await uriToDataUrl(thumbUrl, 'image/jpeg')
    } catch {
      thumbUrl = dataUrl
    }
  }
  if (!thumbUrl) thumbUrl = dataUrl

  return {
    ...item,
    url: dataUrl,
    thumbUrl
  }
}
