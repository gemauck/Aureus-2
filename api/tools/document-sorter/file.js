/**
 * GET /api/tools/document-sorter/file?uploadId=ds-xxx&outputRelativePath=...
 * Streams a sorted document with auth for preview/open actions in UI.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, notFound } from '../../_lib/response.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const outputBase = path.join(rootDir, 'uploads', 'document-sorter-output')

function contentTypeForExt(ext) {
  const map = {
    pdf: 'application/pdf',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  }
  return map[ext] || 'application/octet-stream'
}

async function handler(req, res) {
  try {
    if (req.method !== 'GET') return badRequest(res, 'Method not allowed')

    const uploadId = String(req.query?.uploadId || '').trim()
    const outputRelativePath = String(req.query?.outputRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!uploadId || !uploadId.startsWith('ds-')) return badRequest(res, 'Valid uploadId required')
    if (!outputRelativePath) return badRequest(res, 'outputRelativePath required')

    const outputDir = path.join(outputBase, uploadId)
    const absPath = path.resolve(outputDir, outputRelativePath)
    if (!absPath.startsWith(outputDir + path.sep) && absPath !== outputDir) {
      return badRequest(res, 'Invalid outputRelativePath')
    }
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return notFound(res, 'Document not found')
    }

    const ext = path.extname(absPath).slice(1).toLowerCase()
    const ct = contentTypeForExt(ext)
    const fileName = path.basename(absPath)
    const inline = String(req.query?.download || '') === '1' ? 'attachment' : 'inline'

    const st = fs.statSync(absPath)
    res.statusCode = 200
    res.setHeader('Content-Type', ct)
    res.setHeader('Content-Length', String(st.size))
    res.setHeader('Content-Disposition', `${inline}; filename="${fileName.replace(/"/g, '_')}"`)
    fs.createReadStream(absPath).pipe(res)
  } catch (e) {
    console.error('document-sorter file error:', e)
    return badRequest(res, e.message || 'Failed to read document')
  }
}

export default withHttp(withLogging(authRequired(handler)))

