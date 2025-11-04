// Time Entries API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { logDatabaseError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    console.log('🔍 Time Entries API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    // Parse the URL path (already has /api/ stripped by server)
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Time Entries (GET /api/time-entries)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'time-entries') {
      try {
        const timeEntries = await prisma.timeEntry.findMany({ 
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Time entries retrieved successfully:', timeEntries.length)
        return ok(res, timeEntries)
      } catch (dbError) {
        logDatabaseError(dbError, 'listing time entries')
        return serverError(res, 'Failed to list time entries', dbError.message)
      }
    }

    // Create Time Entry (POST /api/time-entries)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'time-entries') {
      const body = await parseJsonBody(req)
      if (!body.date) return badRequest(res, 'date required')
      if (!body.hours) return badRequest(res, 'hours required')

      const timeEntryData = {
        date: new Date(body.date),
        hours: parseFloat(body.hours) || 0,
        project: body.project || '',
        task: body.task || '',
        description: body.description || '',
        employee: body.employee || req.user?.name || 'Unknown',
        billable: body.billable !== undefined ? body.billable : true,
        rate: parseFloat(body.rate) || 0,
        ownerId: req.user?.sub || null
      }

      console.log('🔍 Creating time entry with data:', timeEntryData)
      try {
        const timeEntry = await prisma.timeEntry.create({
          data: timeEntryData
        })
        console.log('✅ Time entry created successfully:', timeEntry.id)
        return created(res, { timeEntry })
      } catch (dbError) {
        console.error('❌ Database error creating time entry:', dbError)
        return serverError(res, 'Failed to create time entry', dbError.message)
      }
    }

    // Get, Update, Delete Single Time Entry (GET, PUT, DELETE /api/time-entries/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'time-entries' && id) {
      if (req.method === 'GET') {
        try {
          const timeEntry = await prisma.timeEntry.findUnique({ where: { id } })
          if (!timeEntry) return notFound(res)
          console.log('✅ Time entry retrieved successfully:', timeEntry.id)
          return ok(res, { timeEntry })
        } catch (dbError) {
          console.error('❌ Database error getting time entry:', dbError)
          return serverError(res, 'Failed to get time entry', dbError.message)
        }
      }
      if (req.method === 'PUT') {
        const body = await parseJsonBody(req)
        const updateData = {
          date: body.date ? new Date(body.date) : undefined,
          hours: body.hours,
          project: body.project,
          task: body.task,
          description: body.description,
          employee: body.employee,
          billable: body.billable,
          rate: body.rate
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating time entry with data:', updateData)
        try {
          const timeEntry = await prisma.timeEntry.update({ 
            where: { id }, 
            data: updateData 
          })
          console.log('✅ Time entry updated successfully:', timeEntry.id)
          return ok(res, { timeEntry })
        } catch (dbError) {
          console.error('❌ Database error updating time entry:', dbError)
          return serverError(res, 'Failed to update time entry', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          await prisma.timeEntry.delete({ where: { id } })
          console.log('✅ Time entry deleted successfully:', id)
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting time entry:', dbError)
          return serverError(res, 'Failed to delete time entry', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or time entry action')
  } catch (e) {
    return serverError(res, 'Time entry handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
