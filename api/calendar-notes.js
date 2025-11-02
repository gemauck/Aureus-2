// Calendar Notes API endpoint - User-specific daily notes
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    // Log all calendar-notes requests for debugging
    console.log('📅 Calendar notes handler called:', {
      method: req.method,
      url: req.url,
      pathname: req.url.split('?')[0],
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      userId: req.user?.sub
    })
    
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
        
        console.log('📅 GET calendar notes - userId:', userId, 'whereClause:', JSON.stringify(whereClause))
        
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
        if (notes.length > 0) {
          console.log('📅 Sample note dates:', notes.slice(0, 3).map(n => ({
            rawDate: n.date,
            isoString: n.date.toISOString(),
            dateStr: n.date.toISOString().split('T')[0],
            noteLength: n.note?.length || 0
          })))
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
          
          console.log('📝 Processing note:', {
            rawDate: note.date,
            dateStr,
            notePreview: note.note?.substring(0, 20) || 'empty'
          })
        })
        
        console.log('📅 Returning notesByDate:', {
          keys: Object.keys(notesByDate),
          count: Object.keys(notesByDate).length,
          sample: Object.keys(notesByDate).slice(0, 3)
        })
        
        const responseData = { notes: notesByDate }
        console.log('📤 Response data structure:', {
          hasNotes: !!responseData.notes,
          notesType: typeof responseData.notes,
          notesKeys: Object.keys(responseData.notes || {}),
          notesCount: Object.keys(responseData.notes || {}).length
        })
        
        return ok(res, responseData)
      } catch (dbError) {
        console.error('❌ Database error listing calendar notes:', dbError)
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

        console.log('✅ Calendar note retrieved successfully for date:', dateStr)
        return ok(res, { note: note.note, id: note.id })
      } catch (dbError) {
        console.error('❌ Database error getting calendar note:', dbError)
        return serverError(res, 'Failed to get calendar note', dbError.message)
      }
    }

    // Create or Update note for specific date (POST/PUT /api/calendar-notes)
    if ((req.method === 'POST' || req.method === 'PUT') && pathSegments.length === 1 && pathSegments[0] === 'calendar-notes') {
      console.log('📝 Calendar notes POST/PUT request received:', {
        method: req.method,
        url: req.url,
        hasBody: !!req.body,
        bodyType: typeof req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        rawBody: req.body
      })
      
      const body = await parseJsonBody(req)
      
      console.log('📝 Calendar notes POST request parsed:', {
        method: req.method,
        body: body,
        hasDate: !!body.date,
        dateValue: body.date,
        noteLength: body.note?.length || 0,
        bodyKeys: Object.keys(body)
      })
      
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

      console.log('📅 Saving calendar note:', {
        userId,
        dateStr,
        date: date.toISOString(),
        noteLength: noteText.length
      })

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

        console.log('✅ Calendar note saved successfully:', {
          id: note.id,
          userId: note.userId,
          date: note.date.toISOString(),
          dateStr: note.date.toISOString().split('T')[0],
          noteLength: note.note.length
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

