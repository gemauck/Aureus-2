import fs from 'fs'
import path from 'path'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { authRequired } from './_lib/authRequired.js'
import { created, badRequest, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    // Expect JSON: { folder?: 'contracts', name: string, dataUrl: string }
    const payload = await parseJsonBody(req)

    const name = (payload.name || '').toString()
    const dataUrl = (payload.dataUrl || '').toString()
    const folder = (payload.folder || 'uploads').toString()
    if (!name || !dataUrl.startsWith('data:')) {
      return badRequest(res, 'Invalid payload: name and dataUrl required')
    }

    // Parse data URL
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!match) {
      return badRequest(res, 'Invalid dataUrl format')
    }
    const mimeType = match[1]
    const base64 = match[2]
    const buffer = Buffer.from(base64, 'base64')

    // Security: restrict max size (50MB to match POA Review component limit)
    // Base64 encoding adds ~33% overhead, so 50MB file becomes ~66MB when encoded
    const MAX_BYTES = 50 * 1024 * 1024
    if (buffer.length > MAX_BYTES) {
      return badRequest(res, 'File too large (max 50MB)')
    }

    // Ensure uploads directory exists
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
    const uploadRoot = path.join(rootDir, 'uploads')
    const targetDir = path.join(uploadRoot, folder)
    fs.mkdirSync(targetDir, { recursive: true })

    // Generate unique filename, preserve extension if present
    const extFromName = path.extname(name)
    const safeBase = path.basename(name, extFromName).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ext = extFromName || (mimeType.split('/')[1] ? `.${mimeType.split('/')[1]}` : '')
    const fileName = `${safeBase || 'file'}-${unique}${ext}`
    const filePath = path.join(targetDir, fileName)

    fs.writeFileSync(filePath, buffer)

    // Public URL (server serves static from root)
    const publicPath = `/uploads/${folder}/${fileName}`
    return created(res, { url: publicPath, name, size: buffer.length, mimeType })
  } catch (e) {
    console.error('File upload error:', e)
    return serverError(res, 'Upload failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))


