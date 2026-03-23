/**
 * GET /api/erp-calendar/google-events?timeMin=&timeMax= — list primary calendar events from Google (requires connection).
 */
import { authRequired } from '../_lib/authRequired.js'
import { ok, badRequest, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getAuthorizedCalendarClient, TZ } from '../_lib/erpGoogleCalendar.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'

async function handler(req, res) {
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

  const url = new URL(req.url, `http://${req.headers.host}`)
  const timeMin = url.searchParams.get('timeMin')
  const timeMax = url.searchParams.get('timeMax')

  if (!timeMin || !timeMax) {
    return badRequest(res, 'timeMin and timeMax (ISO) are required')
  }

  try {
    const auth = await getAuthorizedCalendarClient(userId)
    if (!auth) {
      return ok(res, { events: [], connected: false })
    }

    const { calendar } = auth
    let items = []
    let pageToken
    const maxPages = 24

    for (let page = 0; page < maxPages; page++) {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken: pageToken || undefined
      })
      const batch = response.data.items || []
      items = items.concat(batch)
      pageToken = response.data.nextPageToken
      if (!pageToken) break
    }
    const events = items.map((ev) => ({
      id: ev.id,
      summary: ev.summary || '(No title)',
      htmlLink: ev.htmlLink || null,
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      source: 'google'
    }))

    return ok(res, { events, connected: true, timeZone: TZ })
  } catch (e) {
    console.error('google-events:', e)
    return serverError(res, 'Failed to load Google Calendar', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
