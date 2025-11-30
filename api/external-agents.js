import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound, unauthorized } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] === 'external-agents' ? null : pathSegments[pathSegments.length - 1]

    // Check admin role for all operations
    const userRole = req.user?.role?.toLowerCase()
    const isAdmin = userRole === 'admin'

    // List All External Agents (GET /api/external-agents)
    if (req.method === 'GET' && pathSegments[pathSegments.length - 1] === 'external-agents') {
      try {
        // Get all external agents (admin can see all, non-admin can only see active ones)
        const where = isAdmin ? {} : { isActive: true }
        
        const externalAgents = await prisma.externalAgent.findMany({
          where,
          orderBy: { name: 'asc' }
        })
        return ok(res, { externalAgents })
      } catch (dbError) {
        console.error('❌ Database error getting external agents:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get external agents', dbError.message)
      }
    }

    // Get Single External Agent (GET /api/external-agents/[id])
    if (req.method === 'GET' && id) {
      try {
        const externalAgent = await prisma.externalAgent.findUnique({ 
          where: { id }
        })
        if (!externalAgent) return notFound(res)
        return ok(res, { externalAgent })
      } catch (dbError) {
        console.error('❌ Database error getting external agent:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get external agent', dbError.message)
      }
    }

    // Create External Agent (POST /api/external-agents) - Admin only
    if (req.method === 'POST') {
      if (!isAdmin) {
        return unauthorized(res, 'Admin access required')
      }

      const body = await parseJsonBody(req)
      
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return badRequest(res, 'External agent name is required')
      }

      const name = String(body.name).trim()
      
      // Check if external agent with this name already exists
      const existingAgent = await prisma.externalAgent.findFirst({
        where: { name }
      })
      
      if (existingAgent) {
        return badRequest(res, 'An external agent with this name already exists')
      }

      try {
        const externalAgent = await prisma.externalAgent.create({
          data: {
            name,
            email: body.email ? String(body.email).trim() : '',
            phone: body.phone ? String(body.phone).trim() : '',
            company: body.company ? String(body.company).trim() : '',
            notes: body.notes ? String(body.notes).trim() : '',
            isActive: body.isActive !== undefined ? Boolean(body.isActive) : true
          }
        })
        return created(res, { externalAgent })
      } catch (dbError) {
        console.error('❌ Database error creating external agent:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to create external agent', dbError.message)
      }
    }

    // Update External Agent (PATCH /api/external-agents/[id]) - Admin only
    if (req.method === 'PATCH' && id) {
      if (!isAdmin) {
        return unauthorized(res, 'Admin access required')
      }

      const body = await parseJsonBody(req)
      
      // Check if external agent exists
      const existingAgent = await prisma.externalAgent.findUnique({ where: { id } })
      if (!existingAgent) {
        return notFound(res, 'External agent not found')
      }

      // If name is being updated, check for duplicates
      if (body.name && body.name !== existingAgent.name) {
        const name = String(body.name).trim()
        if (name.length === 0) {
          return badRequest(res, 'External agent name cannot be empty')
        }
        
        const duplicateAgent = await prisma.externalAgent.findFirst({
          where: { name }
        })
        
        if (duplicateAgent && duplicateAgent.id !== id) {
          return badRequest(res, 'An external agent with this name already exists')
        }
      }

      const updateData = {}
      if (body.name !== undefined) updateData.name = String(body.name).trim()
      if (body.email !== undefined) updateData.email = String(body.email).trim()
      if (body.phone !== undefined) updateData.phone = String(body.phone).trim()
      if (body.company !== undefined) updateData.company = String(body.company).trim()
      if (body.notes !== undefined) updateData.notes = String(body.notes).trim()
      if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive)

      try {
        const externalAgent = await prisma.externalAgent.update({
          where: { id },
          data: updateData
        })
        return ok(res, { externalAgent })
      } catch (dbError) {
        console.error('❌ Database error updating external agent:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to update external agent', dbError.message)
      }
    }

    // Delete External Agent (DELETE /api/external-agents/[id]) - Admin only
    if (req.method === 'DELETE' && id) {
      if (!isAdmin) {
        return unauthorized(res, 'Admin access required')
      }

      try {
        // Check if external agent exists
        const existingAgent = await prisma.externalAgent.findUnique({ where: { id } })
        if (!existingAgent) {
          return notFound(res, 'External agent not found')
        }

        // Check if any clients are using this external agent
        const clientsUsingAgent = await prisma.client.findFirst({
          where: { externalAgentId: id }
        })

        if (clientsUsingAgent) {
          // Instead of hard delete, mark as inactive
          await prisma.externalAgent.update({
            where: { id },
            data: { isActive: false }
          })
          return ok(res, { message: 'External agent deactivated (clients still using it)' })
        }

        // Safe to delete if no clients are using it
        await prisma.externalAgent.delete({ where: { id } })
        return ok(res, { message: 'External agent deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting external agent:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to delete external agent', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ External Agents API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

