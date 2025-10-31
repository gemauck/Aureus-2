// Calendar Notes API endpoint - User-specific daily notes
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    // Parse the URL path and query (already has /api/ stripped by server)
    const url = new URL(req.url, 'http://localhost')
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]
    const userId = req.user?.sub

    if (!userId) {
      return badRequest(res, 'User authentication required')
    }

    // Get all notes for user (GET /api/calendar-notes)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'calendar-notes') {
      try {
        // Optionally filter by date range via query params
        const startParam = url.searchParams.get('startDate')
        const endParam = url.searchParams.get('endDate')
        const startDate = startParam ? new Date(startParam) : null
        const endDate = endParam ? new Date(endParam) : null

        let whereClause = { userId }
        
        if (startDate && endDate) {
          whereClause.date = {
            gte: startDate,
            lte: endDate
          }
        }

        const notes = await prisma.calendarNote.findMany({
          where: whereClause,
          orderBy: { date: 'desc' }
        })

        console.log('✅ Calendar notes retrieved successfully:', notes.length)
        
        // Return as object keyed by date string for easy lookup
        const notesByDate = {}
        notes.forEach(note => {
          const dateStr = note.date.toISOString().split('T')[0] // YYYY-MM-DD
          notesByDate[dateStr] = note.note
        })
        
        return ok(res, { notes: notesByDate })
      } catch (dbError) {
        console.error('❌ Database error listing calendar notes:', dbError)
        return serverError(res, 'Failed to list calendar notes', dbError.message)
      }
    }

    // Get note for specific date (GET /api/calendar-notes/[date])
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[0] === 'calendar-notes') {
      try {
        const dateStr = id // Expecting YYYY-MM-DD format
        const date = new Date(dateStr + 'T00:00:00') // Parse as date only

        if (isNaN(date.getTime())) {
          return badRequest(res, 'Invalid date format. Expected YYYY-MM-DD')
        }

        const note = await prisma.calendarNote.findUnique({
          where: {
            userId_date: {
              userId,
              date
            }
          }
        })

        if (!note) {
          return ok(res, { note: '' })
        }

        console.log('✅ Calendar note retrieved successfully for date:', dateStr)
        return ok(res, { note: note.note, id: note.id })
      } catch (dbError) {
        console.error('❌ Database error getting calendar note:', dbError)
        return serverError(res, 'Failed to get calendar note', dbError.message)
      }
    }

    // Create or Update note for specific date (POST/PUT /api/calendar-notes)
    if ((req.method === 'POST' || req.method === 'PUT') && pathSegments.length === 1 && pathSegments[0] === 'calendar-notes') {
      const body = await parseJsonBody(req)
      
      if (!body.date) {
        return badRequest(res, 'date is required (YYYY-MM-DD format)')
      }

      const dateStr = body.date
      const date = new Date(dateStr + 'T00:00:00') // Parse as date only

      if (isNaN(date.getTime())) {
        return badRequest(res, 'Invalid date format. Expected YYYY-MM-DD')
      }

      const noteText = body.note || ''
      const userId = req.user?.sub

      try {
        // Use upsert to create or update
        const note = await prisma.calendarNote.upsert({
          where: {
            userId_date: {
              userId,
              date
            }
          },
          update: {
            note: noteText,
            updatedAt: new Date()
          },
          create: {
            userId,
            date,
            note: noteText
          }
        })

        console.log('✅ Calendar note saved successfully for date:', dateStr)
        return ok(res, { note: note.note, id: note.id, date: note.date })
      } catch (dbError) {
        console.error('❌ Database error saving calendar note:', dbError)
        return serverError(res, 'Failed to save calendar note', dbError.message)
      }
    }

    // Delete note for specific date (DELETE /api/calendar-notes/[date])
    if (req.method === 'DELETE' && pathSegments.length === 2 && pathSegments[0] === 'calendar-notes') {
      try {
        const dateStr = id // Expecting YYYY-MM-DD format
        const date = new Date(dateStr + 'T00:00:00')

        if (isNaN(date.getTime())) {
          return badRequest(res, 'Invalid date format. Expected YYYY-MM-DD')
        }

        await prisma.calendarNote.delete({
          where: {
            userId_date: {
              userId,
              date
            }
          }
        })

        console.log('✅ Calendar note deleted successfully for date:', dateStr)
        return ok(res, { deleted: true })
      } catch (dbError) {
        // If note doesn't exist, that's okay
        if (dbError.code === 'P2025') {
          return ok(res, { deleted: true })
        }
        console.error('❌ Database error deleting calendar note:', dbError)
        return serverError(res, 'Failed to delete calendar note', dbError.message)
      }
    }

    return badRequest(res, 'Invalid method or calendar note action')
  } catch (e) {
    return serverError(res, 'Calendar note handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

