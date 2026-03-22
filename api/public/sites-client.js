// Public read-only sites for job card form (no auth). Same data as GET /api/sites/client/:clientId.
import { getSitesForClientRead } from '../_lib/getSitesForClientRead.js'
import { ok, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const clientId = req.params?.clientId
  if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
    return badRequest(res, 'clientId required')
  }

  try {
    const sites = await getSitesForClientRead(clientId)
    return ok(res, { sites })
  } catch (err) {
    console.error('❌ Public sites GET error (returning empty):', err.message)
    return ok(res, { sites: [] })
  }
}

export default withHttp(handler)
