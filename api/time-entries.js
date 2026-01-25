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
    
    // Parse the URL path (already has /api/ stripped by server)
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Time Entries (GET /api/time-entries or GET /api/time-entries?projectId=xxx)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'time-entries') {
      try {
        const q = (req.url || '').indexOf('?')
        const queryString = q >= 0 ? req.url.slice(q) : ''
        const searchParams = new URLSearchParams(queryString)
        const projectId = searchParams.get('projectId') || null
        const where = projectId ? { projectId } : {}
        const timeEntries = await prisma.timeEntry.findMany({
          where,
          orderBy: { createdAt: 'desc' }
        })
        return ok(res, timeEntries)
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'listing time entries')
        if (isConnError) {
          // Return 503 (Service Unavailable) for database connection issues
          return res.status(503).json({
            error: 'Service Unavailable',
            message: 'Database connection failed. The database server is unreachable.',
            details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
            code: 'DATABASE_CONNECTION_ERROR',
            timestamp: new Date().toISOString()
          })
        }
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
        projectId: body.projectId || null,
        projectName: body.projectName ?? (body.project || ''),
        task: body.task || '',
        description: body.description || '',
        employee: body.employee || req.user?.name || 'Unknown',
        billable: body.billable !== undefined ? body.billable : true,
        rate: parseFloat(body.rate) || 0,
        ownerId: req.user?.sub || null
      }

      try {
        const timeEntry = await prisma.timeEntry.create({
          data: timeEntryData
        })
        return created(res, timeEntry)
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
          projectId: body.projectId,
          projectName: body.projectName ?? body.project,
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
        
        try {
          const timeEntry = await prisma.timeEntry.update({
            where: { id },
            data: updateData
          })
          return ok(res, timeEntry)
        } catch (dbError) {
          console.error('❌ Database error updating time entry:', dbError)
          return serverError(res, 'Failed to update time entry', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          await prisma.timeEntry.delete({ where: { id } })
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
