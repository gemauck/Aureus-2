import { google } from 'googleapis'
import { prisma } from './prisma.js'

const TZ = 'Africa/Johannesburg'

export function getRedirectUri(req) {
  const fromEnv = process.env.ERP_GOOGLE_REDIRECT_URI
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = req.headers?.host
  if (!host) return 'http://localhost:3000/api/erp-calendar/oauth-callback'
  const proto = host.includes('localhost') ? 'http' : 'https'
  return `${proto}://${host}/api/erp-calendar/oauth-callback`
}

export function createOAuth2Client(req) {
  const id = process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (!id || !secret) {
    return null
  }
  return new google.auth.OAuth2(id, secret, getRedirectUri(req))
}

/**
 * Load connection, refresh access token if needed, return oauth2 client + calendar API + connection row.
 */
export async function getAuthorizedCalendarClient(userId) {
  const conn = await prisma.erpGoogleCalendarConnection.findUnique({
    where: { userId }
  })
  if (!conn) return null

  const redirectUri =
    process.env.ERP_GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/erp-calendar/oauth-callback'
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  )

  oauth2.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken || undefined,
    expiry_date: conn.expiryDate ? conn.expiryDate.getTime() : undefined
  })

  const now = Date.now()
  const exp = conn.expiryDate ? conn.expiryDate.getTime() : 0
  if (exp && exp < now + 60_000) {
    const { credentials } = await oauth2.refreshAccessToken()
    const expiryDate = credentials.expiry_date ? new Date(credentials.expiry_date) : null
    await prisma.erpGoogleCalendarConnection.update({
      where: { userId },
      data: {
        accessToken: credentials.access_token || conn.accessToken,
        refreshToken: credentials.refresh_token || conn.refreshToken,
        expiryDate
      }
    })
    oauth2.setCredentials(credentials)
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2 })
  return { oauth2, calendar, connection: conn }
}

export function calendarEventInsertBody(eventRow, timeZone = TZ) {
  return {
    summary: eventRow.title,
    description: eventRow.description || '',
    start: { dateTime: eventRow.startUtc.toISOString(), timeZone },
    end: { dateTime: eventRow.endUtc.toISOString(), timeZone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'email', minutes: 24 * 60 }
      ]
    },
    extendedProperties: {
      private: {
        erpCalendarEventId: eventRow.id,
        erpSystem: 'abcotronics-erp'
      }
    }
  }
}

export { TZ }
