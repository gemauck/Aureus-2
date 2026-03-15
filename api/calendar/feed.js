/**
 * iCal feed for Follow-ups & Meetings.
 * GET /api/calendar/feed?token=... — returns text/calendar with VEVENTs.
 * Token is a long-lived JWT from /api/calendar/feed-token (Bearer auth).
 */
import { verifyCalendarFeedToken } from '../_lib/jwt.js'
import { prisma } from '../_lib/prisma.js'
import { unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

const TZ = 'Africa/Johannesburg'

function icalEscape(str) {
  if (str == null) return ''
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Format date (YYYY-MM-DD) and time (HH:mm or HH:mm:ss) to iCal DATE-TIME: YYYYMMDDTHHmmss */
function toIcalDateTime(dateStr, timeStr, defaultHour = 9, defaultMin = 0) {
  const date = (dateStr || '').trim() || '1970-01-01'
  const parts = (timeStr || '').trim().split(':').filter(Boolean)
  const hour = parts.length >= 1 ? parseInt(parts[0], 10) || defaultHour : defaultHour
  const min = parts.length >= 2 ? parseInt(parts[1], 10) || defaultMin : defaultMin
  const sec = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0
  const ymd = date.replace(/-/g, '')
  const hms = `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}${String(sec).padStart(2, '0')}`
  return `${ymd}T${hms}`
}

/** End time: default 1 hour after start if no time. */
function endTimeFromStart(dateStr, timeStr) {
  const date = (dateStr || '').trim() || '1970-01-01'
  const parts = (timeStr || '').trim().split(':').filter(Boolean)
  let hour = 9
  let min = 0
  if (parts.length >= 1) hour = parseInt(parts[0], 10) || 9
  if (parts.length >= 2) min = parseInt(parts[1], 10) || 0
  hour += 1
  if (hour >= 24) hour = 23
  const ymd = date.replace(/-/g, '')
  const hms = `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}00`
  return `${ymd}T${hms}`
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return unauthorized(res, 'Method not allowed')
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const token = url.searchParams.get('token')
  const payload = verifyCalendarFeedToken(token)
  if (!payload) {
    return unauthorized(res, 'Invalid or expired calendar feed token')
  }

  try {
    const followUps = await prisma.clientFollowUp.findMany({
      where: {},
      include: { client: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }]
    })

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Abcotronics ERP//Follow-ups//EN',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:Abcotronics Follow-ups'
    ]

    for (const f of followUps) {
      const clientName = (f.client && f.client.name) ? f.client.name : 'Client'
      const summary = `${f.type || 'Follow-up'} - ${clientName}`
      const dtStart = toIcalDateTime(f.date, f.time)
      const dtEnd = endTimeFromStart(f.date, f.time)
      const uid = `erp-followup-${f.id}@abcotronics`
      const desc = icalEscape(f.description || '')

      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${uid}`)
      lines.push(`DTSTART;TZID=${TZ}:${dtStart}`)
      lines.push(`DTEND;TZID=${TZ}:${dtEnd}`)
      lines.push(`SUMMARY:${icalEscape(summary)}`)
      if (desc) lines.push(`DESCRIPTION:${desc}`)
      lines.push('END:VEVENT')
    }

    lines.push('END:VCALENDAR')
    const ics = lines.join('\r\n')
    const buf = Buffer.from(ics, 'utf8')

    if (!res.headersSent && !res.writableEnded) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
      res.setHeader('Content-Disposition', 'inline; filename="follow-ups.ics"')
      res.setHeader('Content-Length', buf.length)
      res.end(buf)
    }
  } catch (err) {
    console.error('Calendar feed error:', err)
    if (!res.headersSent && !res.writableEnded) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain')
      res.end('Calendar feed error')
    }
  }
}

export default withHttp(withLogging(handler))
