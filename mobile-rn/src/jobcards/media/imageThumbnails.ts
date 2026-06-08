import * as ImageManipulator from 'expo-image-manipulator'
import { JOB_CARD_IMAGE_THUMB_MAX_DIMENSION } from '../../../../src/jobCardWizard/constants.js'
import type { MediaItem } from '../types'

/** Build a small JPEG data URL for gallery thumbnails (mirrors web canvas thumb). */
export async function buildJobCardImageThumbnailDataUrl(sourceUri: string): Promise<string> {
  const uri = String(sourceUri || '').trim()
  if (!uri) return ''
  if (!uri.startsWith('data:image') && !uri.startsWith('file:') && !uri.startsWith('content:')) {
    return ''
  }
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: JOB_CARD_IMAGE_THUMB_MAX_DIMENSION } }],
      { compress: 0.58, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    )
    return result.base64 ? `data:image/jpeg;base64,${result.base64}` : ''
  } catch {
    return ''
  }
}

export async function compressImageToDataUrl(
  uri: string,
  maxDimension = 1920
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxDimension } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  return result.base64 ? `data:image/jpeg;base64,${result.base64}` : ''
}

/** Prepare a gallery photo with full image + lightweight thumb for offline display. */
export async function prepareImageMediaItem(
  uri: string,
  name: string
): Promise<MediaItem> {
  const [url, thumbUrl] = await Promise.all([
    compressImageToDataUrl(uri),
    buildJobCardImageThumbnailDataUrl(uri)
  ])
  return { url, thumbUrl: thumbUrl || url, name }
}
