/**
 * Document Sorter: after all chunks are uploaded, assemble zip and sort into File 1-7.
 * POST body: JSON { uploadId }
 * Returns: { outputPath, baseUrl, stats: { totalFiles, byFile: { 1: n, 2: n, ... } } }
 */

import fs from 'fs'
import path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'
import yauzl from 'yauzl'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, serverError, ok } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { classifyPath } from './classify.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const uploadsBase = path.join(rootDir, 'uploads', 'document-sorter-uploads')
const outputBase = path.join(rootDir, 'uploads', 'document-sorter-output')

function sanitizeEntryPath(entryPath) {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  const safe = parts.map(p => p.replace(/[<>:"|?*]/g, '_')).join(path.sep)
  return safe || 'unnamed'
}

async function assembleZipFromChunks(uploadDir, totalChunks) {
  const archivePath = path.join(uploadDir, 'archive.zip')
  const writeStream = createWriteStream(archivePath)
  const count = totalChunks != null ? totalChunks : (() => {
    let i = 0
    while (fs.existsSync(path.join(uploadDir, `chunk-${i}`))) i++
    return i
  })()

  for (let i = 0; i < count; i++) {
    const chunkPath = path.join(uploadDir, `chunk-${i}`)
    if (!fs.existsSync(chunkPath)) throw new Error(`Missing chunk ${i}`)
    await pipeline(createReadStream(chunkPath), writeStream, { end: false })
  }
  writeStream.end()
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
  return archivePath
}

function openZip(archivePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      resolve(zipfile)
    })
  })
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const payload = await parseJsonBody(req).catch(() => ({}))
    const uploadId = (payload.uploadId || '').toString()
    if (!uploadId) {
      return badRequest(res, 'uploadId required')
    }

    const uploadDir = path.join(uploadsBase, uploadId)
    if (!fs.existsSync(uploadDir)) {
      return badRequest(res, 'Upload session not found')
    }

    let meta = {}
    try {
      meta = JSON.parse(fs.readFileSync(path.join(uploadDir, 'meta.json'), 'utf8'))
    } catch (_) {}

    let totalChunks = meta.totalChunks ?? (meta.lastChunkIndex != null ? meta.lastChunkIndex + 1 : null)
    if (totalChunks != null) {
      for (let i = 0; i < totalChunks; i++) {
        if (!fs.existsSync(path.join(uploadDir, `chunk-${i}`))) {
          return badRequest(res, `Chunk ${i} missing. Upload all chunks before processing.`)
        }
      }
    } else {
      let i = 0
      while (fs.existsSync(path.join(uploadDir, `chunk-${i}`))) i++
      if (i === 0) return badRequest(res, 'No chunks found. Upload at least one chunk.')
      totalChunks = i
    }

    const outputDir = path.join(outputBase, uploadId)
    fs.mkdirSync(outputDir, { recursive: true })

    const stats = { totalFiles: 0, byFile: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } }

    const archivePath = await assembleZipFromChunks(uploadDir, totalChunks)
    const zipfile = await openZip(archivePath)

    await new Promise((resolve, reject) => {
      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry()
          return
        }
        const { fileNum, folderName } = classifyPath(entry.fileName)
        const safePath = sanitizeEntryPath(entry.fileName)
        const dir = path.join(outputDir, folderName)
        const outPath = path.join(dir, safePath)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        stats.totalFiles++
        stats.byFile[fileNum] = (stats.byFile[fileNum] || 0) + 1

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            zipfile.readEntry()
            return reject(err)
          }
          const writeStream = fs.createWriteStream(outPath)
          readStream.pipe(writeStream)
          writeStream.on('finish', () => {
            zipfile.readEntry()
          })
          writeStream.on('error', (e) => {
            zipfile.readEntry()
            reject(e)
          })
        })
      })
      zipfile.on('end', resolve)
      zipfile.on('error', reject)
    })

    zipfile.close()

    const baseUrl = `/uploads/document-sorter-output/${uploadId}`
    return ok(res, {
      outputPath: outputDir,
      baseUrl,
      uploadId,
      stats,
      message: `Sorted ${stats.totalFiles} files into File 1–7. Download from ${baseUrl} or browse server folder.`,
    })
  } catch (e) {
    console.error('document-sorter process error:', e)
    return serverError(res, 'Process failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
