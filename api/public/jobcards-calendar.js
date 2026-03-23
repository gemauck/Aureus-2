import { prisma } from '../_lib/prisma.js'
import { verifyToken } from '../_lib/jwt.js'
import { withHttp } from '../_lib/withHttp.js'

function pad(value) {
  return String(value).padStart(2, '0')
}

function toIcsDateTime(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function escapeIcsText(value) {
  const str = String(value || '')
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function eventDescription(jobCard, detailUrl) {
  const parts = [
    jobCard.futureWorkRequired ? `Future work: ${jobCard.futureWorkRequired}` : '',
    jobCard.agentName ? `Technician: ${jobCard.agentName}` : '',
    jobCard.jobCardNumber ? `Job card: ${jobCard.jobCardNumber}` : '',
    jobCard.status ? `Status: ${jobCard.status}` : '',
    detailUrl ? `Open in ERP: ${detailUrl}` : ''
  ].filter(Boolean)
  return parts.join('\n')
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Method not allowed' }))
  }

  let token = ''
  try {
    const url = new URL(req.url, 'http://localhost')
    token = String(url.searchParams.get('token') || '').trim()
  } catch {
    token = ''
  }

  if (!token) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Calendar token is required' }))
  }

  try {
    const payload = verifyToken(token)
    if (!payload?.sub) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ error: 'Invalid calendar token' }))
    }
  } catch {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Invalid calendar token' }))
  }

  try {
    const jobCards = await prisma.jobCard.findMany({
      where: {
        futureWorkScheduledAt: { not: null }
      },
      select: {
        id: true,
        jobCardNumber: true,
        clientName: true,
        siteName: true,
        location: true,
        agentName: true,
        status: true,
        futureWorkRequired: true,
        futureWorkScheduledAt: true,
        updatedAt: true
      },
      orderBy: { futureWorkScheduledAt: 'asc' }
    })

    const nowStamp = toIcsDateTime(new Date())
    const host = req.headers.host || 'abcoafrica.co.za'
    const protocol =
      req.headers['x-forwarded-proto'] ||
      (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https')
    const baseUrl = `${protocol}://${host}`

    const events = jobCards
      .filter(jc => {
        const status = String(jc.status || '').toLowerCase()
        return status !== 'cancelled' && status !== 'completed'
      })
      .map(jc => {
        const start = toIcsDateTime(jc.futureWorkScheduledAt)
        if (!start) return null
        const end = toIcsDateTime(new Date(new Date(jc.futureWorkScheduledAt).getTime() + 60 * 60 * 1000))
        const stamp = toIcsDateTime(jc.updatedAt) || nowStamp
        const summary = escapeIcsText(
          `Follow-up: ${jc.jobCardNumber || 'Job Card'}${jc.clientName ? ` - ${jc.clientName}` : ''}`
        )
        const location = escapeIcsText(jc.location || jc.siteName || '')
        const detailUrl = `${baseUrl}/service-maintenance/jobcards/${encodeURIComponent(jc.id)}`
        const description = escapeIcsText(eventDescription(jc, detailUrl))
        return [
          'BEGIN:VEVENT',
          `UID:jobcard-followup-${jc.id}@abcoafrica.co.za`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          `SUMMARY:${summary}`,
          location ? `LOCATION:${location}` : '',
          description ? `DESCRIPTION:${description}` : '',
          'END:VEVENT'
        ]
          .filter(Boolean)
          .join('\r\n')
      })
      .filter(Boolean)

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Abcotronics ERP//Job Cards Follow-ups//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Abcotronics Job Card Follow-ups',
      'X-WR-TIMEZONE:UTC',
      ...events,
      'END:VCALENDAR',
      ''
    ]

    const ics = lines.join('\r\n')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="abcotronics-jobcard-followups.ics"')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    return res.end(ics)
  } catch (error) {
    console.error('❌ Public jobcards calendar error:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Failed to build calendar feed' }))
  }
}

export default withHttp(handler)
