import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok } from '../../_lib/response.js'
import { CHECKLIST_SUBFOLDERS } from './checklistTemplate.js'

async function handler(req, res) {
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed')
  return ok(res, {
    fileSubfolders: CHECKLIST_SUBFOLDERS,
  })
}

export default withHttp(withLogging(authRequired(handler)))

