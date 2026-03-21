/**
 * GET /api/erp-calendar/auth-url — OAuth URL for greenfield ERP Calendar (Google).
 */
import { authRequired } from '../_lib/authRequired.js'
import { signErpCalendarOAuthState } from '../_lib/jwt.js'
import { ok, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { createOAuth2Client } from '../_lib/erpGoogleCalendar.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed')
  }

  const userId = req.user?.sub
  if (!userId) {
    return badRequest(res, 'User required')
  }

  if (!requireErpCalendarAccess(req, res)) {
    return
  }

  const oauth2 = createOAuth2Client(req)
  if (!oauth2) {
    return serverError(res, 'Google Calendar is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
  }

  const state = signErpCalendarOAuthState(userId)
  if (!state) {
    return serverError(res, 'Could not create OAuth state')
  }

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email'
  ]

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state
  })

  return ok(res, { authUrl })
}

export default withHttp(withLogging(authRequired(handler)))
