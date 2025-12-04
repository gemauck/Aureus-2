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
        // Use raw SQL to bypass Prisma relation resolution
        const result = await prisma.$queryRaw`
          SELECT sites FROM "Client" WHERE id = ${clientId}
        `
        
        if (!result || !result[0]) return notFound(res)
        
        const sites = typeof result[0].sites === 'string' 
          ? JSON.parse(result[0].sites) 
          : (Array.isArray(result[0].sites) ? result[0].sites : [])
        
        return ok(res, { sites })
      } catch (dbError) {
        console.error('❌ Database error getting sites:', dbError)
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
        // Get current sites using raw SQL
        const result = await prisma.$queryRaw`
          SELECT sites FROM "Client" WHERE id = ${clientId}
        `
        
        if (!result || !result[0]) return notFound(res)
        
        const existingSites = typeof result[0].sites === 'string' 
          ? JSON.parse(result[0].sites) 
          : (Array.isArray(result[0].sites) ? result[0].sites : [])
        
        // Create new site
        const newSite = {
          id: `site-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: body.name,
          address: body.address || '',
          contactPerson: body.contactPerson || '',
          contactPhone: body.contactPhone || '',
          contactEmail: body.contactEmail || '',
          notes: body.notes || ''
        }
        
        // Add to array
        const updatedSites = [...existingSites, newSite]
        
        // Save back to database using raw SQL
        const sitesJson = JSON.stringify(updatedSites)
        await prisma.$executeRaw`
          UPDATE "Client" SET sites = ${sitesJson} WHERE id = ${clientId}
        `
        
        return created(res, { site: newSite, sites: updatedSites })
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
        // Get current sites using raw SQL
        const result = await prisma.$queryRaw`
          SELECT sites FROM "Client" WHERE id = ${clientId}
        `
        
        if (!result || !result[0]) return notFound(res)
        
        const sites = typeof result[0].sites === 'string' 
          ? JSON.parse(result[0].sites) 
          : (Array.isArray(result[0].sites) ? result[0].sites : [])
        
        // Find and update the site
        const siteIndex = sites.findIndex(s => s.id === siteId)
        if (siteIndex === -1) return notFound(res, 'Site not found')
        
        sites[siteIndex] = {
          ...sites[siteIndex],
          ...body,
          id: siteId // Don't allow changing the ID
        }
        
        // Save back to database using raw SQL
        await prisma.$executeRaw`
          UPDATE "Client" SET sites = ${JSON.stringify(sites)}::text WHERE id = ${clientId}
        `
        
        return ok(res, { site: sites[siteIndex], sites })
      } catch (dbError) {
        console.error('❌ Database error updating site:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to update site', dbError.message)
      }
    }
    
    // DELETE /api/sites/client/:clientId/:siteId - Delete a site
    if (req.method === 'DELETE' && clientId && siteId) {
      if (!clientId || !siteId) return badRequest(res, 'clientId and siteId required')
      
      try {
        // Get current sites using raw SQL
        const result = await prisma.$queryRaw`
          SELECT sites FROM "Client" WHERE id = ${clientId}
        `
        
        if (!result || !result[0]) return notFound(res)
        
        const sites = typeof result[0].sites === 'string' 
          ? JSON.parse(result[0].sites) 
          : (Array.isArray(result[0].sites) ? result[0].sites : [])
        
        // Remove the site
        const updatedSites = sites.filter(s => s.id !== siteId)
        
        // Save back to database using raw SQL
        const sitesJson = JSON.stringify(updatedSites)
        await prisma.$executeRaw`
          UPDATE "Client" SET sites = ${sitesJson} WHERE id = ${clientId}
        `
        
        return ok(res, { deleted: true, sites: updatedSites })
      } catch (dbError) {
        console.error('❌ Database error deleting site:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
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
