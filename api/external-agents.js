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

    // Check admin role for POST, PATCH, DELETE operations
    const userRole = req.user?.role?.toLowerCase()
    const isAdmin = userRole === 'admin'
    const requiresAdmin = ['POST', 'PATCH', 'DELETE'].includes(req.method)

    if (requiresAdmin && !isAdmin) {
      return unauthorized(res, 'Admin access required')
    }

    // List All External Agents (GET /api/external-agents)
    if (req.method === 'GET' && pathSegments[pathSegments.length - 1] === 'external-agents') {
      try {
        // Try to create table if it doesn't exist (idempotent)
        try {
          await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "ExternalAgent" (
              id TEXT PRIMARY KEY,
              name TEXT UNIQUE NOT NULL,
              "isActive" BOOLEAN DEFAULT true,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `
          await prisma.$executeRaw`
            CREATE INDEX IF NOT EXISTS "ExternalAgent_name_idx" ON "ExternalAgent"(name);
          `
          await prisma.$executeRaw`
            CREATE INDEX IF NOT EXISTS "ExternalAgent_isActive_idx" ON "ExternalAgent"("isActive");
          `
        } catch (createError) {
          // Table might already exist, ignore error
          if (!createError.message.includes('already exists') && createError.code !== '42P07') {
            console.warn('⚠️ Could not ensure ExternalAgent table exists:', createError.message)
          }
        }
        
        // Get external agents
        const externalAgents = await prisma.externalAgent.findMany({
          where: { isActive: true },
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
      const body = await parseJsonBody(req)
      
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return badRequest(res, 'External agent name is required')
      }

      const name = String(body.name).trim()
      
      // Check if external agent with this name already exists
      const existingAgent = await prisma.externalAgent.findUnique({
        where: { name }
      })
      
      if (existingAgent) {
        return badRequest(res, 'An external agent with this name already exists')
      }

      try {
        const externalAgent = await prisma.externalAgent.create({
          data: {
            name,
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
        
        const duplicateAgent = await prisma.externalAgent.findUnique({
          where: { name }
        })
        
        if (duplicateAgent) {
          return badRequest(res, 'An external agent with this name already exists')
        }
      }

      const updateData = {}
      if (body.name !== undefined) updateData.name = String(body.name).trim()
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

