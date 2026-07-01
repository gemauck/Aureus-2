/**
 * POST /api/projects/:id/correspondence-attachments — upload attachment (dataUrl JSON)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { authRequired } from '../../_lib/authRequired.js'
import { created, badRequest, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { resolveSafeUploadDir } from '../../_lib/securityGuards.js'
import { assertProjectCorrespondenceEnabled, ensureCorrespondenceTables } from '../../_lib/projectCorrespondence.js'

const UPLOAD_FOLDER = 'project-correspondence'

async function handler(req, res) {
  const projectId = req.params?.id
  if (!projectId) return badRequest(res, 'Project ID required')
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' })
  }

  try {
    await ensureCorrespondenceTables()
    const gate = await assertProjectCorrespondenceEnabled(projectId)
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error })
    }

    const payload = await parseJsonBody(req)
    const name = (payload.name || '').toString()
    const dataUrl = (payload.dataUrl || '').toString()
    if (!name || !dataUrl.startsWith('data:')) {
      return badRequest(res, 'Invalid payload: name and dataUrl required')
    }

    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!match) return badRequest(res, 'Invalid dataUrl format')
    const mimeType = match[1]
    const buffer = Buffer.from(match[2], 'base64')
    const MAX_BYTES = 25 * 1024 * 1024
    if (buffer.length > MAX_BYTES) {
      return badRequest(res, 'File too large (max 25MB)')
    }

    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const rootDir = path.resolve(__dirname, '../../..')
    const uploadRoot = path.join(rootDir, 'uploads')
    const resolved = resolveSafeUploadDir(uploadRoot, UPLOAD_FOLDER)
    if (!resolved) return badRequest(res, 'Invalid upload folder')
    const { targetDir, safeFolder } = resolved
    fs.mkdirSync(targetDir, { recursive: true })

    const extFromName = path.extname(name)
    const safeBase = path.basename(name, extFromName).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ext = extFromName || (mimeType.split('/')[1] ? `.${mimeType.split('/')[1]}` : '')
    const fileName = `${safeBase || 'file'}-${unique}${ext}`
    const filePath = path.join(targetDir, fileName)
    fs.writeFileSync(filePath, buffer)

    const publicPath = `/uploads/${safeFolder}/${fileName}`
    return created(res, {
      attachment: {
        fileName: name,
        filePath: publicPath,
        mimeType,
        size: buffer.length
      }
    })
  } catch (e) {
    console.error('correspondence-attachments:', e)
    return serverError(res, 'Upload failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
