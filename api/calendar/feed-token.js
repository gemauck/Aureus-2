/**
 * GET /api/calendar/feed-token — returns a long-lived token and feed URL for calendar subscription.
 * Requires Bearer auth. Used by the frontend to show "Subscribe to calendar" and copy URL.
 */
import { authRequired } from '../_lib/authRequired.js'
import { signCalendarFeedToken } from '../_lib/jwt.js'
import { ok, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return unauthorized(res, 'Method not allowed')
  }

  const userId = req.user?.sub || req.user?.id
  if (!userId) {
    return unauthorized(res, 'User not found')
  }

  const token = signCalendarFeedToken({ sub: userId })
  const baseUrl = process.env.BASE_URL || process.env.APP_URL || (req.headers.host ? `https://${req.headers.host}` : '')
  const feedUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/calendar/feed?token=${encodeURIComponent(token)}` : null

  return ok(res, { feedUrl, token: feedUrl ? undefined : token })
}

export default withHttp(withLogging(authRequired(handler)))
