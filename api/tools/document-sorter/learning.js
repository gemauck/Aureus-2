import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { appendLearningExample, getUserIdFromReq, readLearningStore, writeLearningStore } from './learningStore.js'

async function handler(req, res) {
  const userId = getUserIdFromReq(req)

  if (req.method === 'GET') {
    const store = readLearningStore()
    const raw = store.users?.[userId] || []
    const list = Array.isArray(raw) ? raw : (raw.rules || [])
    return ok(res, { userId, total: list.length, samples: list.slice(-50) })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req).catch(() => ({}))
    const action = String(body.action || 'add')
    if (action === 'clear') {
      const store = readLearningStore()
      store.users = store.users || {}
      store.users[userId] = { rules: [] }
      writeLearningStore(store)
      return ok(res, { userId, cleared: true })
    }
    if (action === 'add') {
      const n = appendLearningExample({
        userId,
        originalPath: body.originalPath,
        fileNum: Number(body.fileNum),
        subFolderName: body.subFolderName,
      })
      return ok(res, { userId, added: n })
    }
    return badRequest(res, 'Unknown action')
  }

  return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))

