/**
 * Document Sorter: upload one chunk of the zip file.
 * Multipart: uploadId (string), chunkIndex (number), totalChunks (number), chunk (file).
 * Chunks are stored as chunk-0, chunk-1, ... and assembled on process.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { created, badRequest, serverError } from '../../_lib/response.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const uploadsBase = path.join(rootDir, 'uploads', 'document-sorter-uploads')

const MAX_CHUNK_BYTES = 15 * 1024 * 1024 // 15 MB per chunk

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const Busboy = (await import('busboy')).default
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_CHUNK_BYTES } })

    let uploadId = null
    let chunkIndex = null
    let totalChunks = null
    let chunkReceived = false
    let chunkPath = null

    await new Promise((resolve, reject) => {
      bb.on('field', (name, value) => {
        if (name === 'uploadId') uploadId = value
        if (name === 'chunkIndex') chunkIndex = parseInt(value, 10)
        if (name === 'totalChunks') totalChunks = parseInt(value, 10)
      })

      bb.on('file', (name, file, info) => {
        if (name !== 'chunk') {
          file.resume()
          return
        }
        chunkReceived = true
        const dir = path.join(uploadsBase, uploadId)
        if (!uploadId || !fs.existsSync(dir)) {
          file.resume()
          return reject(new Error('Invalid or missing uploadId'))
        }
        chunkPath = path.join(dir, `chunk-${chunkIndex}`)
        const write = fs.createWriteStream(chunkPath)
        file.pipe(write)
        write.on('finish', resolve)
        write.on('error', reject)
      })

      bb.on('finish', () => {
        if (!chunkReceived) resolve()
      })
      bb.on('error', reject)
      req.pipe(bb)
    })

    if (!uploadId || chunkIndex == null || chunkIndex < 0) {
      return badRequest(res, 'Missing uploadId or chunkIndex')
    }

    const dir = path.join(uploadsBase, uploadId)
    if (!fs.existsSync(dir)) {
      return badRequest(res, 'Upload session not found. Call upload-init first.')
    }

    if (!chunkReceived || !chunkPath || !fs.existsSync(chunkPath)) {
      return badRequest(res, 'No chunk file received')
    }

    // Update meta with totalChunks so process knows when all chunks are present
    const metaPath = path.join(dir, 'meta.json')
    let meta = {}
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (_) {}
    if (totalChunks != null) meta.totalChunks = totalChunks
    meta.lastChunkIndex = Math.max(meta.lastChunkIndex ?? -1, chunkIndex)
    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8')

    return created(res, { uploadId, chunkIndex, received: true })
  } catch (e) {
    console.error('document-sorter upload-chunk error:', e)
    return serverError(res, 'Chunk upload failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
