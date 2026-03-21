/**
 * GET /api/erp-calendar/erp-events?start=&end=
 * POST /api/erp-calendar/erp-events
 * PATCH /api/erp-calendar/erp-events
 * DELETE /api/erp-calendar/erp-events?id=
 *
 * Greenfield ERP-owned events; optional sync to Google when connected.
 */
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { parseJsonBody } from '../_lib/body.js'
import { ok, badRequest, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import {
  getAuthorizedCalendarClient,
  calendarEventInsertBody,
  TZ
} from '../_lib/erpGoogleCalendar.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'

function parseDate(s) {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

async function handler(req, res) {
  const userId = req.user?.sub
  if (!userId) {
    return badRequest(res, 'User required')
  }

  if (!requireErpCalendarAccess(req, res)) {
    return
  }

  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const start = parseDate(url.searchParams.get('start'))
    const end = parseDate(url.searchParams.get('end'))
    if (!start || !end) {
      return badRequest(res, 'start and end query params (ISO) are required')
    }

    const rows = await prisma.erpCalendarEvent.findMany({
      where: {
        userId,
        startUtc: { lt: end },
        endUtc: { gt: start }
      },
      orderBy: { startUtc: 'asc' }
    })

    return ok(res, {
      events: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        startUtc: r.startUtc.toISOString(),
        endUtc: r.endUtc.toISOString(),
        timezone: r.timezone,
        googleEventId: r.googleEventId,
        googleHtmlLink: r.googleHtmlLink,
        syncedAt: r.syncedAt?.toISOString() || null,
        source: 'erp'
      }))
    })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const title = (body.title || '').trim()
    const startUtc = parseDate(body.start)
    const endUtc = parseDate(body.end)
    const timezone = (body.timezone || TZ).trim() || TZ
    const description = (body.description || '').trim()
    const syncToGoogle = !!body.syncToGoogle

    if (!title || !startUtc || !endUtc || endUtc <= startUtc) {
      return badRequest(res, 'title, start, end required; end must be after start')
    }

    let row = await prisma.erpCalendarEvent.create({
      data: {
        userId,
        title,
        description,
        startUtc,
        endUtc,
        timezone
      }
    })

    if (syncToGoogle) {
      try {
        const auth = await getAuthorizedCalendarClient(userId)
        if (auth?.calendar) {
          const resource = calendarEventInsertBody(row, timezone)
          const inserted = await auth.calendar.events.insert({
            calendarId: 'primary',
            resource
          })
          const g = inserted.data
          row = await prisma.erpCalendarEvent.update({
            where: { id: row.id },
            data: {
              googleEventId: g.id || null,
              googleHtmlLink: g.htmlLink || null,
              syncedAt: new Date()
            }
          })
        }
      } catch (e) {
        console.error('erp-events POST sync:', e)
        /* keep ERP row even if Google fails */
      }
    }

    return ok(res, { event: row })
  }

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const id = body.id
    if (!id) {
      return badRequest(res, 'id required')
    }

    const existing = await prisma.erpCalendarEvent.findFirst({
      where: { id, userId }
    })
    if (!existing) {
      return badRequest(res, 'Event not found')
    }

    const title = body.title != null ? String(body.title).trim() : existing.title
    const description = body.description != null ? String(body.description).trim() : existing.description
    const startUtc = body.start != null ? parseDate(body.start) : existing.startUtc
    const endUtc = body.end != null ? parseDate(body.end) : existing.endUtc
    const timezone = body.timezone != null ? String(body.timezone).trim() : existing.timezone

    if (!startUtc || !endUtc || endUtc <= startUtc) {
      return badRequest(res, 'Invalid start/end')
    }

    let row = await prisma.erpCalendarEvent.update({
      where: { id },
      data: {
        title,
        description,
        startUtc,
        endUtc,
        timezone
      }
    })

    const syncToGoogle = body.syncToGoogle !== false && !!existing.googleEventId

    if (syncToGoogle && existing.googleEventId) {
      try {
        const auth = await getAuthorizedCalendarClient(userId)
        if (auth?.calendar) {
          await auth.calendar.events.update({
            calendarId: 'primary',
            eventId: existing.googleEventId,
            resource: calendarEventInsertBody(row, timezone)
          })
          row = await prisma.erpCalendarEvent.update({
            where: { id },
            data: { syncedAt: new Date() }
          })
        }
      } catch (e) {
        console.error('erp-events PATCH sync:', e)
      }
    }

    return ok(res, { event: row })
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const id = url.searchParams.get('id')
    if (!id) {
      return badRequest(res, 'id query required')
    }

    const existing = await prisma.erpCalendarEvent.findFirst({
      where: { id, userId }
    })
    if (!existing) {
      return badRequest(res, 'Event not found')
    }

    if (existing.googleEventId) {
      try {
        const auth = await getAuthorizedCalendarClient(userId)
        if (auth?.calendar) {
          await auth.calendar.events.delete({
            calendarId: 'primary',
            eventId: existing.googleEventId
          })
        }
      } catch (e) {
        console.error('erp-events DELETE google:', e)
      }
    }

    await prisma.erpCalendarEvent.delete({ where: { id } })
    return ok(res, { deleted: true })
  }

  return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))
