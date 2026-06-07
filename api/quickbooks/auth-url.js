/**
 * GET /api/quickbooks/auth-url — Intuit OAuth URL (admin only).
 */
import { authRequired } from '../_lib/authRequired.js'
import { signQuickBooksOAuthState } from '../_lib/jwt.js'
import { ok, badRequest, forbidden, serverError, serviceUnavailable } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'
import { buildQuickBooksAuthUrl, isQuickBooksConfigured } from '../_lib/quickbooksOnline.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }

    const user = await getUserForReceiptCapture(req)
    if (!user?.id) return forbidden(res, 'Authentication required')
    if (!isReceiptCaptureAdmin(user)) {
      return forbidden(res, 'Only administrators can connect QuickBooks.')
    }

    if (!isQuickBooksConfigured()) {
      return serviceUnavailable(
        res,
        'QuickBooks OAuth is not configured. Set INTUIT_CLIENT_ID and INTUIT_CLIENT_SECRET (and INTUIT_REDIRECT_URI) on the server.',
        'QBO_NOT_CONFIGURED'
      )
    }

    const state = signQuickBooksOAuthState(user.id)
    if (!state) {
      return serviceUnavailable(res, 'Could not create OAuth state (check JWT_SECRET).', 'QBO_OAUTH_STATE_FAILED')
    }

    const authUrl = buildQuickBooksAuthUrl(req, state)
    return ok(res, { authUrl })
  } catch (err) {
    console.error('quickbooks auth-url:', err)
    return serverError(res, 'Failed to build QuickBooks auth URL', err?.message || String(err))
  }
}

export default withHttp(withLogging(authRequired(handler)))
