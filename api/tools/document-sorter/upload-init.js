/**
 * Document Sorter: start a chunked upload.
 * POST body: JSON { fileName?: string }
 * Returns: { uploadId, chunkSize } for use in upload-chunk and process.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { created, badRequest, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const uploadsBase = path.join(rootDir, 'uploads', 'document-sorter-uploads')

// Chunk size for client (e.g. 10 MB per request to support 10+ GB without memory issues)
const CHUNK_SIZE = 10 * 1024 * 1024

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const payload = await parseJsonBody(req).catch(() => ({}))
    const fileName = (payload.fileName || 'archive.zip').toString().replace(/[^a-z0-9_.-]/gi, '_')

    const uploadId = `ds-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const uploadDir = path.join(uploadsBase, uploadId)
    fs.mkdirSync(uploadDir, { recursive: true })

    // Store metadata for process step
    const metaPath = path.join(uploadDir, 'meta.json')
    fs.writeFileSync(metaPath, JSON.stringify({ fileName, createdAt: new Date().toISOString() }), 'utf8')

    return created(res, {
      uploadId,
      chunkSize: CHUNK_SIZE,
      message: 'Send chunks to /api/tools/document-sorter/upload-chunk',
    })
  } catch (e) {
    console.error('document-sorter upload-init error:', e)
    return serverError(res, 'Upload init failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
