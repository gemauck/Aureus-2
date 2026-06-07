/**
 * GET /api/quickbooks/classes — QBO classes for cost-centre mapping (admin).
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, badRequest, forbidden, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'
import { fetchQboClasses, getQuickBooksClient } from '../_lib/quickbooksOnline.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') return badRequest(res, 'Method not allowed')

    const user = await getUserForReceiptCapture(req)
    if (!user?.id) return forbidden(res, 'Authentication required')
    if (!isReceiptCaptureAdmin(user)) return forbidden(res, 'Admin only')

    const client = await getQuickBooksClient()
    if (!client) return badRequest(res, 'QuickBooks is not connected')

    const rows = await fetchQboClasses(client.accessToken, client.realmId)
    const classes = rows.map((c) => ({
      id: String(c.Id),
      name: c.Name || ''
    }))
    return ok(res, { classes })
  } catch (e) {
    console.error('quickbooks classes:', e)
    return serverError(res, 'Failed to load QuickBooks classes', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
