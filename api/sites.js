import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    
    // Strip query parameters before splitting (safety fallback)
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.split('/').filter(Boolean)
    
    // Extract clientId and siteId from Express params or path
    const clientId = req.params?.clientId || (pathSegments[1] === 'client' ? pathSegments[2] : null)
    const siteId = req.params?.siteId || (pathSegments[1] === 'client' && pathSegments.length > 3 ? pathSegments[3] : null)
    
    
    // GET /api/sites/client/:clientId - Get all sites for a client
    if (req.method === 'GET' && clientId && !siteId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      try {
        // FIXED: Validate clientId format before querying
        if (typeof clientId !== 'string' || clientId.trim().length === 0) {
          return badRequest(res, 'Invalid clientId format')
        }
        
        // Phase 6: Use normalized ClientSite table
        const sites = await prisma.clientSite.findMany({
          where: { clientId: clientId.trim() },
          orderBy: { createdAt: 'asc' }
        })
        
        // Fallback: If no sites in normalized table, try JSON field (backward compatibility)
        if (sites.length === 0) {
          try {
            const result = await prisma.$queryRaw`
              SELECT sites, sitesJsonb FROM "Client" WHERE id = ${clientId.trim()}
            `
            
            if (result && result[0]) {
              let jsonSites = []
              if (result[0].sitesJsonb && Array.isArray(result[0].sitesJsonb) && result[0].sitesJsonb.length > 0) {
                jsonSites = result[0].sitesJsonb
              } else if (result[0].sites && typeof result[0].sites === 'string') {
                try {
                  jsonSites = JSON.parse(result[0].sites)
                } catch (e) {
                  jsonSites = []
                }
              }
              
              // Return JSON sites for backward compatibility
              return ok(res, { sites: jsonSites })
            }
          } catch (fallbackError) {
            // If fallback query fails, just return empty array instead of error
            console.warn('⚠️ Fallback query for sites failed:', fallbackError.message)
            return ok(res, { sites: [] })
          }
        }
        
        return ok(res, { sites })
      } catch (dbError) {
        console.error('❌ Database error getting sites:', dbError)
        console.error('❌ ClientId:', clientId)
        console.error('❌ Error code:', dbError.code)
        console.error('❌ Error message:', dbError.message)
        
        // FIXED: Return empty array instead of error for invalid client IDs
        if (dbError.code === 'P2025' || dbError.message?.includes('Record to find does not exist')) {
          return ok(res, { sites: [] })
        }
        
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get sites', dbError.message)
      }
    }
    
    // POST /api/sites/client/:clientId - Add a site to a client
    if (req.method === 'POST' && clientId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      const body = req.body || {}
      if (!body.name) return badRequest(res, 'site name required')
      
      try {
        // Verify client exists
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true }
        })
        
        if (!client) return notFound(res, 'Client not found')
        
        // Phase 6: Create site in normalized ClientSite table
        const newSite = await prisma.clientSite.create({
          data: {
            clientId,
            name: body.name,
            address: body.address || '',
            contactPerson: body.contactPerson || '',
            contactPhone: body.contactPhone || '',
            contactEmail: body.contactEmail || '',
            notes: body.notes || ''
          }
        })
        
        // CRITICAL: Do NOT write to JSON fields - normalized table only
        return created(res, { site: newSite })
      } catch (dbError) {
        console.error('❌ Database error adding site:', {
          clientId: clientId,
          errorCode: dbError.code,
          errorName: dbError.name,
          errorMessage: dbError.message,
          errorMeta: dbError.meta,
          stack: dbError.stack?.substring(0, 500)
        })
        
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        // Check for specific Prisma errors
        if (dbError.code === 'P2025') {
          return notFound(res, 'Client not found')
        }
        
        if (dbError.code === 'P2002' || dbError.code === 'P2003') {
          return serverError(res, 'Database constraint error', `The client data may be corrupted or have invalid relationships. Error: ${dbError.message}`)
        }
        
        return serverError(res, 'Failed to add site', dbError.message || 'Unknown database error')
      }
    }
    
    // PATCH /api/sites/client/:clientId/:siteId - Update a site
    if (req.method === 'PATCH' && clientId && siteId) {
      if (!clientId || !siteId) return badRequest(res, 'clientId and siteId required')
      
      const body = req.body || {}
      
      try {
        // Phase 6: Update site in normalized ClientSite table
        // Verify site belongs to client
        const existingSite = await prisma.clientSite.findFirst({
          where: { id: siteId, clientId }
        })
        
        if (!existingSite) return notFound(res, 'Site not found')
        
        const updatedSite = await prisma.clientSite.update({
          where: { id: siteId },
          data: {
            name: body.name !== undefined ? body.name : undefined,
            address: body.address !== undefined ? body.address : undefined,
            contactPerson: body.contactPerson !== undefined ? body.contactPerson : undefined,
            contactPhone: body.contactPhone !== undefined ? body.contactPhone : undefined,
            contactEmail: body.contactEmail !== undefined ? body.contactEmail : undefined,
            notes: body.notes !== undefined ? body.notes : undefined
          }
        })
        
        // CRITICAL: Do NOT write to JSON fields - normalized table only
        return ok(res, { site: updatedSite })
      } catch (dbError) {
        console.error('❌ Database error updating site:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        if (dbError.code === 'P2025') {
          return notFound(res, 'Site not found')
        }
        
        return serverError(res, 'Failed to update site', dbError.message)
      }
    }
    
    // DELETE /api/sites/client/:clientId/:siteId - Delete a site
    if (req.method === 'DELETE' && clientId && siteId) {
      if (!clientId || !siteId) return badRequest(res, 'clientId and siteId required')
      
      try {
        // Phase 6: Delete site from normalized ClientSite table
        // Verify site belongs to client
        const existingSite = await prisma.clientSite.findFirst({
          where: { id: siteId, clientId }
        })
        
        if (!existingSite) return notFound(res, 'Site not found')
        
        await prisma.clientSite.delete({
          where: { id: siteId }
        })
        
        // CRITICAL: Do NOT write to JSON fields - normalized table only
        return ok(res, { deleted: true })
      } catch (dbError) {
        console.error('❌ Database error deleting site:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        if (dbError.code === 'P2025') {
          return notFound(res, 'Site not found')
        }
        
        return serverError(res, 'Failed to delete site', dbError.message)
      }
    }
    
    return badRequest(res, 'Invalid sites endpoint')
  } catch (e) {
    console.error('❌ Sites handler error:', e)
    return serverError(res, 'Sites handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
