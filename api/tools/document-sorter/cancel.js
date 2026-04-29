/**
 * POST /api/tools/document-sorter/cancel
 * Body: { uploadId }
 * Creates cancel.flag so an in-flight process run exits cleanly after the current file.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const outputBase = path.join(rootDir, 'uploads', 'document-sorter-output')

export const CANCEL_FLAG_NAME = 'cancel.flag'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const payload = await parseJsonBody(req).catch(() => ({}))
    const uploadId = (payload.uploadId || '').toString().trim()
    if (!uploadId || !uploadId.startsWith('ds-')) {
      return badRequest(res, 'Valid uploadId required')
    }

    const outputDir = path.join(outputBase, uploadId)
    fs.mkdirSync(outputDir, { recursive: true })
    const flagPath = path.join(outputDir, CANCEL_FLAG_NAME)
    fs.writeFileSync(flagPath, JSON.stringify({ requestedAt: new Date().toISOString() }), 'utf8')

    return ok(res, {
      uploadId,
      message: 'Cancel requested. Sort will stop after the current file.',
    })
  } catch (e) {
    console.error('document-sorter cancel error:', e)
    return serverError(res, 'Cancel failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
