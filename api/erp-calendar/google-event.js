/**
 * GET /api/erp-calendar/google-event?id=
 * PATCH /api/erp-calendar/google-event
 * DELETE /api/erp-calendar/google-event?id=&sendUpdates=
 *
 * Single Google Calendar event on primary calendar (read/write via Calendar API).
 */
import { authRequired } from '../_lib/authRequired.js'
import { parseJsonBody } from '../_lib/body.js'
import { ok, badRequest, serverError, notFound, forbidden } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getAuthorizedCalendarClient, TZ } from '../_lib/erpGoogleCalendar.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { randomBytes } from 'crypto'

const CALENDAR_ID = 'primary'

function serializeEvent(ev) {
  if (!ev) return null
  const allDay = !!(ev.start?.date && !ev.start?.dateTime)
  return {
    id: ev.id,
    summary: ev.summary || '',
    description: ev.description || '',
    location: ev.location || '',
    htmlLink: ev.htmlLink || null,
    hangoutLink: ev.hangoutLink || null,
    allDay,
    start: ev.start || null,
    end: ev.end || null,
    attendees: (ev.attendees || []).map((a) => ({
      email: a.email,
      displayName: a.displayName || null,
      responseStatus: a.responseStatus || null
    })),
    recurrence: ev.recurrence || null,
    recurringEventId: ev.recurringEventId || null,
    conferenceData: ev.conferenceData || null,
    colorId: ev.colorId || null,
    visibility: ev.visibility || null,
    status: ev.status || null,
    timeZone: TZ
  }
}

function mapGoogleError(res, e) {
  const status = e.response?.status || e.code
  const msg =
    e.response?.data?.error?.message ||
    e.response?.data?.error_description ||
    e.message ||
    'Google Calendar API error'
  const errors = e.response?.data?.error?.errors
  const details = errors?.length ? JSON.stringify(errors) : msg

  if (status === 404) {
    return notFound(res, msg)
  }
  if (status === 403) {
    return forbidden(res, msg)
  }
  if (status === 409) {
    return badRequest(res, msg, details)
  }
  return serverError(res, 'Google Calendar request failed', details)
}

/** Inclusive end date (YYYY-MM-DD) to Google exclusive end date */
function nextDayYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + 1)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function buildPatchRequestBody(body, timeZone) {
  const r = {}
  if (body.summary != null) r.summary = String(body.summary)
  if (body.description != null) r.description = String(body.description)
  if (body.location != null) r.location = String(body.location)
  if (body.colorId != null && body.colorId !== '') r.colorId = String(body.colorId)
  if (body.visibility != null && body.visibility !== '') r.visibility = String(body.visibility)

  const allDay = !!body.allDay
  if (allDay) {
    const sd = body.startDate || body.startInclusiveDate
    if (!sd) {
      throw new Error('all-day events require startDate (YYYY-MM-DD)')
    }
    let endExclusive = body.endDateExclusive
    if (!endExclusive) {
      const inclusive = body.endInclusiveDate || body.endDate
      if (!inclusive) {
        throw new Error('all-day events require endInclusiveDate or endDateExclusive')
      }
      endExclusive = nextDayYmd(inclusive)
    }
    r.start = { date: String(sd).trim(), timeZone }
    r.end = { date: String(endExclusive).trim(), timeZone }
  } else if (body.start != null && body.end != null) {
    const s = new Date(body.start)
    const en = new Date(body.end)
    if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) {
      throw new Error('Invalid start or end datetime')
    }
    if (en <= s) {
      throw new Error('End must be after start')
    }
    r.start = { dateTime: s.toISOString(), timeZone }
    r.end = { dateTime: en.toISOString(), timeZone }
  }

  if (Array.isArray(body.attendees)) {
    r.attendees = body.attendees
      .map((x) => (typeof x === 'string' ? { email: x.trim() } : { email: String(x.email || '').trim() }))
      .filter((a) => a.email.includes('@'))
  }

  if (body.addMeet === true) {
    r.conferenceData = {
      createRequest: {
        requestId: randomBytes(16).toString('hex'),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  }

  return r
}

async function handler(req, res) {
  const userId = req.user?.sub
  if (!userId) {
    return badRequest(res, 'User required')
  }

  if (!(await requireErpCalendarAccess(req, res))) {
    return
  }

  const auth = await getAuthorizedCalendarClient(userId)
  if (!auth?.calendar) {
    return badRequest(res, 'Google Calendar is not connected')
  }

  const { calendar } = auth
  const url = new URL(req.url, `http://${req.headers.host}`)
  const queryId = url.searchParams.get('id')

  if (req.method === 'GET') {
    if (!queryId) {
      return badRequest(res, 'id query parameter is required')
    }
    try {
      const { data } = await calendar.events.get({
        calendarId: CALENDAR_ID,
        eventId: queryId
      })
      return ok(res, { event: serializeEvent(data) })
    } catch (e) {
      console.error('google-event GET:', e)
      return mapGoogleError(res, e)
    }
  }

  if (req.method === 'DELETE') {
    if (!queryId) {
      return badRequest(res, 'id query parameter is required')
    }
    const sendUpdates = url.searchParams.get('sendUpdates') || 'all'
    try {
      await calendar.events.delete({
        calendarId: CALENDAR_ID,
        eventId: queryId,
        sendUpdates: sendUpdates === 'none' || sendUpdates === 'externalOnly' ? sendUpdates : 'all'
      })
      return ok(res, { deleted: true })
    } catch (e) {
      console.error('google-event DELETE:', e)
      return mapGoogleError(res, e)
    }
  }

  if (req.method === 'PATCH') {
    let body
    try {
      body = await parseJsonBody(req)
    } catch (e) {
      return badRequest(res, 'Invalid JSON body')
    }

    const patchInstanceId = body.id || body.eventId
    if (!patchInstanceId) {
      return badRequest(res, 'id is required')
    }

    const scopeSeries = body.scope === 'series' && body.recurringEventId
    const targetEventId = scopeSeries ? String(body.recurringEventId) : String(patchInstanceId)

    let requestBody
    try {
      requestBody = buildPatchRequestBody(body, TZ)
    } catch (e) {
      return badRequest(res, e.message || 'Invalid patch body')
    }

    const sendUpdates =
      body.sendUpdates === 'none' || body.sendUpdates === 'externalOnly' ? body.sendUpdates : 'all'

    const patchOpts = {
      calendarId: CALENDAR_ID,
      eventId: targetEventId,
      requestBody,
      sendUpdates
    }
    if (body.addMeet === true) {
      patchOpts.conferenceDataVersion = 1
    }

    try {
      const { data } = await calendar.events.patch(patchOpts)
      return ok(res, { event: serializeEvent(data) })
    } catch (e) {
      console.error('google-event PATCH:', e)
      return mapGoogleError(res, e)
    }
  }

  return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))
