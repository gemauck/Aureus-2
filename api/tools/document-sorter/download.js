/**
 * Document Sorter: stream the sorted output folder as a zip download.
 * GET ?uploadId=ds-xxx
 * Returns: zip stream (Content-Disposition: attachment; filename="sorted-output.zip")
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, serverError } from '../../_lib/response.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const outputBase = path.join(rootDir, 'uploads', 'document-sorter-output')

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }

    const uploadId = (req.query?.uploadId || '').toString().trim()
    if (!uploadId || !uploadId.startsWith('ds-')) {
      return badRequest(res, 'Valid uploadId required')
    }

    const outputDir = path.join(outputBase, uploadId)
    if (!fs.existsSync(outputDir)) {
      return badRequest(res, 'Output not found. Run sort first.')
    }

    const stat = fs.statSync(outputDir)
    if (!stat.isDirectory()) {
      return badRequest(res, 'Invalid output')
    }

    const filename = 'sorted-output.zip'
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.on('error', (err) => {
      console.error('document-sorter download archive error:', err)
      if (!res.headersSent) serverError(res, 'Zip failed', err.message)
    })

    res.on('close', () => {
      if (!archive.writableEnded) archive.abort()
    })

    archive.pipe(res)
    archive.directory(outputDir, false)
    await archive.finalize()
  } catch (e) {
    console.error('document-sorter download error:', e)
    if (!res.headersSent) return serverError(res, 'Download failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
