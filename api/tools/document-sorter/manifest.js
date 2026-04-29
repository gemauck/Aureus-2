/**
 * GET /api/tools/document-sorter/manifest?uploadId=ds-xxx
 * Returns manifest.json from the last completed sort for this upload session.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok, notFound } from '../../_lib/response.js'

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

    const manifestPath = path.join(outputBase, uploadId, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return notFound(res, 'manifest.json not found. Run processing first.')
    }

    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    return ok(res, data)
  } catch (e) {
    console.error('document-sorter manifest error:', e)
    return badRequest(res, e.message || 'Failed to read manifest')
  }
}

export default withHttp(withLogging(authRequired(handler)))
