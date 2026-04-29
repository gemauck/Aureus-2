import { withHttp } from '../../../../_lib/withHttp.js'
import { withLogging } from '../../../../_lib/logger.js'
import { authRequired } from '../../../../_lib/authRequired.js'
import { badRequest, notFound, ok } from '../../../../_lib/response.js'
import { getProjectRuns } from '../../projectStore.js'
import { getUserIdFromReq } from '../../learningStore.js'

async function handler(req, res) {
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed')
  const projectId = String(req.query?.id || '').trim()
  if (!projectId) return badRequest(res, 'Project id is required')
  const userId = getUserIdFromReq(req)
  const runs = getProjectRuns({ projectId, userId })
  if (!runs) return notFound(res, 'Sorter project not found')
  return ok(res, { runs })
}

export default withHttp(withLogging(authRequired(handler)))
