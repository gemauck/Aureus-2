/**
 * GET /api/erp-calendar/oauth-callback — Google redirects here (no Bearer auth).
 * Exchanges code, stores tokens server-side, returns HTML that notifies opener.
 */
import { google } from 'googleapis'
import { prisma } from '../_lib/prisma.js'
import { verifyErpCalendarOAuthState } from '../_lib/jwt.js'
import { createOAuth2Client } from '../_lib/erpGoogleCalendar.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { erpCalendarEmailAllowed } from '../_lib/erpCalendarAccess.js'

function htmlResponse(res, ok, message) {
  const type = ok ? 'ERP_CALENDAR_OAUTH_OK' : 'ERP_CALENDAR_OAUTH_ERR'
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Calendar</title></head><body>
<p style="font-family:system-ui;padding:1rem">${message}</p>
<script>
(function(){
  var payload = { type: '${type}', message: ${JSON.stringify(message || '')} };
  try {
    if (window.opener && window.opener.postMessage) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch (e) {}
  setTimeout(function(){ window.close(); }, 800);
})();
</script>
</body></html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(body)
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return htmlResponse(res, false, 'Invalid method')
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')

  if (err) {
    return htmlResponse(res, false, `Google OAuth error: ${err}`)
  }

  if (!code || !state) {
    return htmlResponse(res, false, 'Missing code or state')
  }

  const payload = verifyErpCalendarOAuthState(state)
  if (!payload?.sub) {
    return htmlResponse(res, false, 'Invalid or expired state')
  }

  const userId = payload.sub
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  })
  if (!userRow || !erpCalendarEmailAllowed(userRow.email)) {
    return htmlResponse(res, false, 'Calendar is not available for your account.')
  }

  const oauth2 = createOAuth2Client(req)
  if (!oauth2) {
    return htmlResponse(res, false, 'Server OAuth not configured')
  }

  try {
    const { tokens } = await oauth2.getToken(code)
    oauth2.setCredentials(tokens)

    let googleEmail = ''
    try {
      const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 })
      const u = await oauth2Api.userinfo.get()
      googleEmail = u.data.email || ''
    } catch (_) {
      /* optional */
    }

    const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null

    await prisma.erpGoogleCalendarConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token || '',
        expiryDate,
        googleEmail
      },
      update: {
        accessToken: tokens.access_token || '',
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiryDate,
        googleEmail
      }
    })

    return htmlResponse(res, true, 'Google Calendar connected. You can close this window.')
  } catch (e) {
    console.error('erp-calendar oauth-callback:', e)
    return htmlResponse(res, false, e.message || 'Failed to connect Google Calendar')
  }
}

export default withHttp(withLogging(handler))
