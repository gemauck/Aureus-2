import { badRequest, ok } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  // Stateless JWT flow: client clears local secure session after this succeeds.
  return ok(res, { success: true })
}

export default withHttp(withLogging(handler))
