// Public endpoint: transcribe short voice clips for the field job card (Whisper).
// Requires OPENAI_API_KEY. Unauthenticated — abuse risk; consider rate limits at the edge.
import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { badRequest, serverError } from '../_lib/response.js'
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
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm'
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
    console.error('❌ Public transcribe-audio error:', error)
    return serverError(res, 'Transcription failed', error.message)
  }
}

export default withHttp(handler)
