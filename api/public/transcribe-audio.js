// Public endpoint: transcribe short voice clips for the field job card (Whisper).
// Requires OPENAI_API_KEY. Unauthenticated — abuse risk; consider rate limits at the edge.
import OpenAI, { APIConnectionError, APIError } from 'openai'
import { toFile } from 'openai/uploads'
import { badRequest, serverError, serviceUnavailable } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

const MAX_BYTES = 12 * 1024 * 1024

function extFromMime(m) {
  if (!m || typeof m !== 'string') return 'webm'
  if (m.includes('webm')) return 'webm'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('m4a')) return 'm4a'
  if (m.includes('aac')) return 'aac'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  if (m.includes('ogg')) return 'ogg'
  return 'webm'
}

/** Strip codecs/parameters — OpenAI multipart can reject `audio/webm;codecs=opus` */
function normalizeAudioMime(raw) {
  if (!raw || typeof raw !== 'string') return 'audio/webm'
  const base = raw.split(';')[0].trim().toLowerCase()
  if (!base.startsWith('audio/') && !base.startsWith('video/')) {
    return 'audio/webm'
  }
  if (base === 'video/webm') return 'audio/webm'
  return base || 'audio/webm'
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'Transcription is not configured on this server',
      code: 'NO_OPENAI'
    })
  }
  try {
    const body = req.body || {}
    const audioBase64 = body.audioBase64
    const mimeType = normalizeAudioMime(
      typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm'
    )
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return badRequest(res, 'audioBase64 is required')
    }
    const buf = Buffer.from(audioBase64, 'base64')
    if (!buf.length || buf.length < 32) {
      return badRequest(res, 'Audio data is too small')
    }
    if (buf.length > MAX_BYTES) {
      return badRequest(res, 'Audio file is too large')
    }
    const ext = extFromMime(mimeType)
    const file = await toFile(buf, `voice-note.${ext}`, { type: mimeType })
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const tr = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1'
    })
    const text = typeof tr.text === 'string' ? tr.text : ''
    res.status(200).json({ ok: true, text })
  } catch (error) {
    const detail = openAiErrorDetail(error)
    console.error('❌ Public transcribe-audio error:', detail, error)

    if (error instanceof APIConnectionError) {
      return serviceUnavailable(
        res,
        'Could not reach the transcription service. Try again shortly.',
        'OPENAI_CONNECTION'
      )
    }

    if (error instanceof APIError) {
      const st = error.status
      if (st === 401) {
        console.error('❌ transcribe-audio: OpenAI returned 401 — invalid or missing API key on server')
        return serviceUnavailable(
          res,
          'Transcription is not available. Ask your administrator to verify OPENAI_API_KEY.',
          'OPENAI_UNAUTHORIZED'
        )
      }
      if (st === 403) {
        return serviceUnavailable(res, 'Transcription is not available for this deployment.', 'OPENAI_FORBIDDEN')
      }
      if (st === 429) {
        return serviceUnavailable(res, 'Transcription is busy. Please wait a moment and try again.', 'OPENAI_RATE_LIMIT')
      }
      if (st === 400 || st === 422) {
        return badRequest(res, 'Could not transcribe this audio clip', detail)
      }
      if (st >= 500) {
        return serviceUnavailable(res, 'Transcription service had a temporary error. Try again.', 'OPENAI_UPSTREAM')
      }
    }

    return serverError(res, 'Transcription failed', detail)
  }
}

/** OpenAI SDK v4 uses APIError, not axios-style error.response */
function openAiErrorDetail(error) {
  if (error instanceof APIError) {
    const inner = error.error
    if (inner && typeof inner === 'object' && typeof inner.message === 'string') {
      return inner.message
    }
    return typeof error.message === 'string' ? error.message : String(error)
  }
  return (
    error?.response?.data?.error?.message ||
    (typeof error?.message === 'string' ? error.message : String(error))
  )
}

export default withHttp(handler)
