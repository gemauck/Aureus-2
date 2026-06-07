import * as FileSystem from 'expo-file-system'
import { API_BASE_URL } from '../../config'

export function formatVoiceNoteTranscriptBlock(noteNumber: number, text: string): string {
  const n = Math.max(1, Number(noteNumber) || 1)
  const body = String(text || '').trim()
  return `----- Voice note ${n} · start -----\n${body}\n----- Voice note ${n} · end -----\n`
}

export function mimeFromRecordingUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() || ''
  if (ext === 'm4a' || ext === 'aac' || ext === 'mp4') return 'audio/mp4'
  if (ext === 'webm') return 'audio/webm'
  if (ext === '3gp') return 'audio/3gpp'
  if (ext === 'caf') return 'audio/x-caf'
  return 'audio/mp4'
}

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; message: string }

async function readClipBase64(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
  const trimmed = String(dataUrl || '').trim()
  if (trimmed.startsWith('data:')) {
    const comma = trimmed.indexOf(',')
    const meta = comma >= 0 ? trimmed.slice(0, comma) : ''
    const mimeMatch = /^data:([^;,]+)/i.exec(meta)
    const mimeType = mimeMatch ? mimeMatch[1].trim() : 'audio/mp4'
    const base64 = comma >= 0 ? trimmed.slice(comma + 1) : trimmed
    return { base64, mimeType }
  }
  const mimeType = mimeFromRecordingUri(trimmed)
  const base64 = await FileSystem.readAsStringAsync(trimmed, {
    encoding: FileSystem.EncodingType.Base64
  })
  return { base64, mimeType }
}

export async function transcribeVoiceClip(clip: {
  dataUrl: string
  mimeType?: string
}): Promise<TranscribeResult> {
  try {
    const { base64, mimeType: sniffed } = await readClipBase64(clip.dataUrl)
    const mimeType = clip.mimeType || sniffed
    const res = await fetch(`${API_BASE_URL}/api/public/transcribe-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: base64, mimeType })
    })
    const data = (await res.json().catch(() => ({}))) as {
      text?: string
      error?: string | { message?: string; details?: string; code?: string }
      code?: string
    }
    if (!res.ok) {
      const err = data.error && typeof data.error === 'object' ? data.error : null
      const errMsg =
        err && typeof err.message === 'string'
          ? err.message
          : typeof data.error === 'string'
            ? data.error
            : null
      const errDetails = err && typeof err.details === 'string' ? err.details : null
      if (res.status === 503) {
        return {
          ok: false,
          message:
            errMsg ||
            'Transcription is not configured on the server. Type the text manually or ask your admin to enable OPENAI_API_KEY.'
        }
      }
      return {
        ok: false,
        message: errDetails || errMsg || 'Transcription failed. Try again or type manually.'
      }
    }
    return { ok: true, text: typeof data.text === 'string' ? data.text : '' }
  } catch {
    return {
      ok: false,
      message: 'Could not reach the transcription service. Check your connection and try again.'
    }
  }
}
