import { google } from 'googleapis'
import { authRequired } from './_lib/authRequired.js'
import { ok, serverError, badRequest } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
)

async function handler(req, res) {
  try {

    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const action = pathSegments[pathSegments.length - 1]

    // Get Google OAuth URL
    if (req.method === 'GET' && action === 'auth-url') {
      const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ]

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: req.user?.sub || 'anonymous'
      })

      return ok(res, { authUrl })
    }

    // Handle OAuth callback
    if (req.method === 'GET' && action === 'callback') {
      const { code, state } = url.searchParams
      
      if (!code) {
        return badRequest(res, 'Authorization code required')
      }

      try {
        const { tokens } = await oauth2Client.getToken(code)
        oauth2Client.setCredentials(tokens)

        // Store tokens for the user (you might want to save this to database)
        const userTokens = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date
        }

        return ok(res, { 
          success: true, 
          message: 'Google Calendar connected successfully',
          tokens: userTokens 
        })
      } catch (error) {
        console.error('❌ OAuth callback error:', error)
        return serverError(res, 'Failed to authenticate with Google', error.message)
      }
    }

    // Create calendar event
    if (req.method === 'POST' && action === 'create-event') {
      const body = await parseJsonBody(req)
      const { 
        summary, 
        description, 
        startDateTime, 
        endDateTime, 
        attendees = [],
        location,
        clientId,
        followUpId
      } = body

      if (!summary || !startDateTime || !endDateTime) {
        return badRequest(res, 'Summary, start time, and end time are required')
      }

      // Set up OAuth2 client with user's tokens
      const userTokens = body.tokens || {}
      oauth2Client.setCredentials(userTokens)

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      const event = {
        summary,
        description: description || `Follow-up for client ID: ${clientId}`,
        start: {
          dateTime: startDateTime,
          timeZone: 'Africa/Johannesburg'
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Africa/Johannesburg'
        },
        attendees: attendees.map(email => ({ email })),
        location: location || '',
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 }
          ]
        },
        extendedProperties: {
          private: {
            clientId: clientId?.toString(),
            followUpId: followUpId?.toString(),
            erpSystem: 'abcotronics-erp'
          }
        }
      }

      try {
        const response = await calendar.events.insert({
          calendarId: 'primary',
          resource: event
        })


        return ok(res, { 
          event: response.data,
          message: 'Event created successfully in Google Calendar'
        })
      } catch (error) {
        console.error('❌ Google Calendar API error:', error)
        return serverError(res, 'Failed to create calendar event', error.message)
      }
    }

    // List calendar events
    if (req.method === 'GET' && action === 'events') {
      const userTokens = req.headers['x-google-tokens'] ? 
        JSON.parse(req.headers['x-google-tokens']) : {}

      if (!userTokens.access_token) {
        return badRequest(res, 'Google Calendar authentication required')
      }

      oauth2Client.setCredentials(userTokens)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      try {
        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: new Date().toISOString(),
          maxResults: 50,
          singleEvents: true,
          orderBy: 'startTime'
        })

        const events = response.data.items || []

        return ok(res, { events })
      } catch (error) {
        console.error('❌ Failed to fetch calendar events:', error)
        return serverError(res, 'Failed to fetch calendar events', error.message)
      }
    }

    // Update calendar event
    if (req.method === 'PATCH' && action === 'update-event') {
      const body = await parseJsonBody(req)
      const { eventId, ...updateData } = body

      if (!eventId) {
        return badRequest(res, 'Event ID is required')
      }

      const userTokens = body.tokens || {}
      oauth2Client.setCredentials(userTokens)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      try {
        const response = await calendar.events.update({
          calendarId: 'primary',
          eventId,
          resource: updateData
        })

        return ok(res, { 
          event: response.data,
          message: 'Event updated successfully'
        })
      } catch (error) {
        console.error('❌ Failed to update calendar event:', error)
        return serverError(res, 'Failed to update calendar event', error.message)
      }
    }

    // Delete calendar event
    if (req.method === 'DELETE' && action === 'delete-event') {
      const { eventId } = url.searchParams
      const userTokens = req.headers['x-google-tokens'] ? 
        JSON.parse(req.headers['x-google-tokens']) : {}

      if (!eventId) {
        return badRequest(res, 'Event ID is required')
      }

      if (!userTokens.access_token) {
        return badRequest(res, 'Google Calendar authentication required')
      }

      oauth2Client.setCredentials(userTokens)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId
        })

        return ok(res, { message: 'Event deleted successfully' })
      } catch (error) {
        console.error('❌ Failed to delete calendar event:', error)
        return serverError(res, 'Failed to delete calendar event', error.message)
      }
    }

    return badRequest(res, 'Invalid endpoint or method')
  } catch (error) {
    console.error('❌ Google Calendar API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
