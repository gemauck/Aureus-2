import { withHttp } from '../../../../_lib/withHttp.js'
import { withLogging } from '../../../../_lib/logger.js'
import { authRequired } from '../../../../_lib/authRequired.js'
import { badRequest, notFound, ok } from '../../../../_lib/response.js'
import { parseJsonBody } from '../../../../_lib/body.js'
import { getProjectUiState, updateProjectUiState } from '../../projectStore.js'
import { getUserIdFromReq } from '../../learningStore.js'

async function handler(req, res) {
  const projectId = String(req.query?.id || '').trim()
  if (!projectId) return badRequest(res, 'Project id is required')
  const userId = getUserIdFromReq(req)

  if (req.method === 'GET') {
    const uiState = getProjectUiState({ projectId, userId })
    if (uiState == null) return notFound(res, 'Sorter project not found')
    return ok(res, { uiState })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req).catch(() => ({}))
    const uiState = updateProjectUiState({ projectId, userId, uiState: body.uiState || {} })
    if (uiState == null) return notFound(res, 'Sorter project not found')
    return ok(res, { uiState })
  }

  return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))
