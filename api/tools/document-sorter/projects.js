import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, created, ok } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { createSorterProject, listSorterProjectsByUser } from './projectStore.js'
import { getUserIdFromReq } from './learningStore.js'

async function handler(req, res) {
  const userId = getUserIdFromReq(req)
  if (req.method === 'GET') {
    return ok(res, { projects: listSorterProjectsByUser({ userId }) })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req).catch(() => ({}))
    const name = String(body.name || '').trim()
    if (!name) return badRequest(res, 'Project name is required')
    const project = createSorterProject({ userId, name })
    return created(res, { project })
  }

  return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))
