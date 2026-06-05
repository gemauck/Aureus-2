import * as FileSystem from 'expo-file-system'

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
