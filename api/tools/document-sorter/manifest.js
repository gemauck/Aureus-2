/**
 * GET /api/tools/document-sorter/manifest?uploadId=ds-xxx[&format=json|csv][&download=1]
 * Returns manifest data by default; can stream manifest.json/manifest.csv as attachment.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok, notFound } from '../../_lib/response.js'
import { normalizeUploadId } from './uploadId.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const outputBase = path.join(rootDir, 'uploads', 'document-sorter-output')

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }

    const uploadId = normalizeUploadId(req.query?.uploadId)
    if (!uploadId) {
      return badRequest(res, 'Valid uploadId required')
    }

    const format = (req.query?.format || 'json').toString().trim().toLowerCase()
    if (!['json', 'csv'].includes(format)) {
      return badRequest(res, 'format must be json or csv')
    }

    const fileName = format === 'csv' ? 'manifest.csv' : 'manifest.json'
    const filePath = path.join(outputBase, uploadId, fileName)
    if (!fs.existsSync(filePath)) {
      return notFound(res, `${fileName} not found. Run processing first.`)
    }

    const wantsDownload = (req.query?.download || '').toString() === '1'
    if (wantsDownload) {
      const downloadName = `${uploadId}-${fileName}`
      const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json'
      const content = fs.readFileSync(filePath)
      res.statusCode = 200
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
      res.setHeader('Content-Length', content.length)
      res.end(content)
      return
    }

    if (format === 'csv') {
      const csv = fs.readFileSync(filePath, 'utf8')
      return ok(res, { format: 'csv', content: csv })
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return ok(res, data)
  } catch (e) {
    console.error('document-sorter manifest error:', e)
    return badRequest(res, e.message || 'Failed to read manifest')
  }
}

export default withHttp(withLogging(authRequired(handler)))
