/**
 * GET /api/erp-calendar/auth-url — OAuth URL for greenfield ERP Calendar (Google).
 */
import { authRequired } from '../_lib/authRequired.js'
import { signErpCalendarOAuthState } from '../_lib/jwt.js'
import { ok, serverError, badRequest, serviceUnavailable } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { createOAuth2Client } from '../_lib/googleOAuthErpClient.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }

    const userId = req.user?.sub
    if (!userId) {
      return badRequest(res, 'User required')
    }

    if (!(await requireErpCalendarAccess(req, res))) {
      return
    }

    const oauth2 = createOAuth2Client(req)
    if (!oauth2) {
      return serviceUnavailable(
        res,
        'Google Calendar OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or reuse GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (Helpdesk). Add this redirect URI to that OAuth client: https://<your-host>/api/erp-calendar/oauth-callback (or set ERP_GOOGLE_REDIRECT_URI).',
        'ERP_CALENDAR_GOOGLE_NOT_CONFIGURED'
      )
    }

    const state = signErpCalendarOAuthState(userId)
    if (!state) {
      return serviceUnavailable(
        res,
        'Could not create OAuth state (check JWT_SECRET is set on the server).',
        'ERP_CALENDAR_OAUTH_STATE_FAILED'
      )
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email'
    ]

    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes.join(' '),
      state
    })

    return ok(res, { authUrl })
  } catch (err) {
    console.error('erp-calendar auth-url:', err)
    return serverError(
      res,
      'Failed to build Google Calendar auth URL',
      err?.message || String(err)
    )
  }
}

export default withHttp(withLogging(authRequired(handler)))
