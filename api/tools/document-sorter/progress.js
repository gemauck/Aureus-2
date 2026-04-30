/**
 * GET /api/tools/document-sorter/progress?uploadId=ds-xxx
 * Returns latest progress.json written during processing (for polling UI).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok } from '../../_lib/response.js'
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

    const progressPath = path.join(outputBase, uploadId, 'progress.json')
    if (!fs.existsSync(progressPath)) {
      return ok(res, {
        status: 'idle',
        phase: null,
        processed: 0,
        total: null,
        message: 'Processing has not started yet.',
      })
    }

    const data = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
    return ok(res, data)
  } catch (e) {
    console.error('document-sorter progress error:', e)
    return badRequest(res, e.message || 'Failed to read progress')
  }
}

export default withHttp(withLogging(authRequired(handler)))
