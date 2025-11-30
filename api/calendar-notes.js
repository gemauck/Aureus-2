// Calendar Notes API endpoint - User-specific daily notes
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { logDatabaseError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    // Log all calendar-notes requests for debugging
    
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

        if (notes.length > 0) {
        }
        
        // Return as object keyed by date string for easy lookup
        // Handle date conversion properly to avoid timezone issues
        const notesByDate = {}
        notes.forEach(note => {
          // Convert date to YYYY-MM-DD format, handling timezone correctly
          // Use UTC date parts to ensure consistent YYYY-MM-DD format
          const year = note.date.getUTCFullYear()
          const month = String(note.date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(note.date.getUTCDate()).padStart(2, '0')
          const dateStr = `${year}-${month}-${day}`
          notesByDate[dateStr] = note.note
          
        })
        
        
        const responseData = { notes: notesByDate }
        
        return ok(res, responseData)
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'listing calendar notes')
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to list calendar notes', dbError.message)
      }
    }

    // Get note for specific date (GET /api/calendar-notes/[date])
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[0] === 'calendar-notes') {
      try {
        const dateStr = id // Expecting YYYY-MM-DD format
        const date = new Date(dateStr + 'T00:00:00Z') // Parse as UTC midnight

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
        console.error('❌ Calendar note save failed: date is missing', { body, userId })
        return badRequest(res, 'date is required (YYYY-MM-DD format)')
      }

      const dateStr = body.date
      // Parse date as UTC midnight to ensure consistent storage
      // This avoids timezone conversion issues
      const date = new Date(dateStr + 'T00:00:00Z') // Z = UTC

      if (isNaN(date.getTime())) {
        console.error('❌ Invalid date format:', dateStr)
        return badRequest(res, 'Invalid date format. Expected YYYY-MM-DD')
      }

      const noteText = body.note || ''
      const userId = req.user?.sub


      try {
        // Validate userId exists in database
        const userExists = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true }
        })
        
        if (!userExists) {
          console.error('❌ User not found in database:', userId)
          return serverError(res, 'User not found', `User ID ${userId} does not exist`)
        }

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

        
        // Return the saved note with proper formatting
        const responseData = {
          note: note.note,
          id: note.id,
          date: note.date.toISOString(),
          saved: true,
          message: 'Calendar note saved successfully'
        }
        
        return ok(res, responseData)
      } catch (dbError) {
        console.error('❌ Database error saving calendar note:', {
          error: dbError,
          code: dbError.code,
          message: dbError.message,
          meta: dbError.meta,
          userId,
          dateStr,
          date: date.toISOString()
        })
        
        // Provide more specific error messages
        let errorMessage = 'Failed to save calendar note'
        if (dbError.code === 'P2002') {
          errorMessage = 'A note for this date already exists (unique constraint violation)'
        } else if (dbError.code === 'P2003') {
          errorMessage = 'Invalid user reference'
        } else if (dbError.message) {
          errorMessage = dbError.message
        }
        
        return serverError(res, errorMessage, dbError.message || 'Unknown database error')
      }
    }

    // Delete note for specific date (DELETE /api/calendar-notes/[date])
    if (req.method === 'DELETE' && pathSegments.length === 2 && pathSegments[0] === 'calendar-notes') {
      try {
        const dateStr = id // Expecting YYYY-MM-DD format
        const date = new Date(dateStr + 'T00:00:00Z') // Parse as UTC midnight

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

