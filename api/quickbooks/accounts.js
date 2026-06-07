/**
 * GET /api/quickbooks/accounts — QBO expense accounts for ERP mapping (admin).
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, badRequest, forbidden, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'
import { fetchQboExpenseAccounts, getQuickBooksClient } from '../_lib/quickbooksOnline.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') return badRequest(res, 'Method not allowed')

    const user = await getUserForReceiptCapture(req)
    if (!user?.id) return forbidden(res, 'Authentication required')
    if (!isReceiptCaptureAdmin(user)) return forbidden(res, 'Admin only')

    const client = await getQuickBooksClient()
    if (!client) return badRequest(res, 'QuickBooks is not connected')

    const rows = await fetchQboExpenseAccounts(client.accessToken, client.realmId)
    const accounts = rows.map((a) => ({
      id: String(a.Id),
      name: a.Name || '',
      accountType: a.AccountType || '',
      acctNum: a.AcctNum || ''
    }))
    return ok(res, { accounts })
  } catch (e) {
    console.error('quickbooks accounts:', e)
    return serverError(res, 'Failed to load QuickBooks accounts', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
