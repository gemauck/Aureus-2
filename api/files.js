import fs from 'fs'
import path from 'path'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { authRequired } from './_lib/authRequired.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    // Expect JSON: { folder?: 'contracts', name: string, dataUrl: string }
    let body = ''
    for await (const chunk of req) body += chunk
    const payload = JSON.parse(body || '{}')

    const name = (payload.name || '').toString()
    const dataUrl = (payload.dataUrl || '').toString()
    const folder = (payload.folder || 'uploads').toString()
    if (!name || !dataUrl.startsWith('data:')) {
      res.status(400).json({ error: 'Invalid payload: name and dataUrl required' })
      return
    }

    // Parse data URL
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!match) {
      res.status(400).json({ error: 'Invalid dataUrl format' })
      return
    }
    const mimeType = match[1]
    const base64 = match[2]
    const buffer = Buffer.from(base64, 'base64')

    // Security: restrict max size (~8MB)
    const MAX_BYTES = 8 * 1024 * 1024
    if (buffer.length > MAX_BYTES) {
      res.status(413).json({ error: 'File too large (max 8MB)' })
      return
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
    res.status(201).json({ url: publicPath, name, size: buffer.length, mimeType })
  } catch (e) {
    console.error('File upload error:', e)
    res.status(500).json({ error: 'Upload failed', details: e.message })
  }
}

export default withHttp(withLogging(authRequired(handler)))


