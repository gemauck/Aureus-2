import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Sites API Debug:', {
      method: req.method,
      url: req.url,
      params: req.params,
      headers: req.headers,
      user: req.user
    });
    
    // Strip query parameters before splitting (safety fallback)
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.split('/').filter(Boolean)
    
    // Extract clientId and siteId from Express params or path
    const clientId = req.params?.clientId || (pathSegments[1] === 'client' ? pathSegments[2] : null)
    const siteId = req.params?.siteId || (pathSegments[1] === 'client' && pathSegments.length > 3 ? pathSegments[3] : null)
    
    console.log('🔍 Path analysis:', {
      url: req.url,
      pathSegments,
      clientId,
      siteId,
      params: req.params
    });
    
    // GET /api/sites/client/:clientId - Get all sites for a client
    if (req.method === 'GET' && clientId && !siteId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { sites: true }
        })
        
        if (!client) return notFound(res)
        
        const sites = typeof client.sites === 'string' 
          ? JSON.parse(client.sites) 
          : (Array.isArray(client.sites) ? client.sites : [])
        
        console.log('✅ Sites retrieved for client:', clientId, '- Count:', sites.length)
        return ok(res, { sites })
      } catch (dbError) {
        console.error('❌ Database error getting sites:', dbError)
        return serverError(res, 'Failed to get sites', dbError.message)
      }
    }
    
    // POST /api/sites/client/:clientId - Add a site to a client
    if (req.method === 'POST' && clientId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      const body = req.body || {}
      if (!body.name) return badRequest(res, 'site name required')
      
      try {
        // Get current sites
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { sites: true }
        })
        
        if (!client) return notFound(res)
        
        const existingSites = typeof client.sites === 'string' 
          ? JSON.parse(client.sites) 
          : (Array.isArray(client.sites) ? client.sites : [])
        
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
        
        // Save back to database
        const updatedClient = await prisma.client.update({
          where: { id: clientId },
          data: { sites: JSON.stringify(updatedSites) }
        })
        
        console.log('✅ Site added to client:', clientId, '- Site:', newSite.name)
        return created(res, { site: newSite, sites: updatedSites })
      } catch (dbError) {
        console.error('❌ Database error adding site:', dbError)
        return serverError(res, 'Failed to add site', dbError.message)
      }
    }
    
    // PATCH /api/sites/client/:clientId/:siteId - Update a site
    if (req.method === 'PATCH' && clientId && siteId) {
      if (!clientId || !siteId) return badRequest(res, 'clientId and siteId required')
      
      const body = req.body || {}
      
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { sites: true }
        })
        
        if (!client) return notFound(res)
        
        const sites = typeof client.sites === 'string' 
          ? JSON.parse(client.sites) 
          : (Array.isArray(client.sites) ? client.sites : [])
        
        // Find and update the site
        const siteIndex = sites.findIndex(s => s.id === siteId)
        if (siteIndex === -1) return notFound(res, 'Site not found')
        
        sites[siteIndex] = {
          ...sites[siteIndex],
          ...body,
          id: siteId // Don't allow changing the ID
        }
        
        // Save back to database
        await prisma.client.update({
          where: { id: clientId },
          data: { sites: JSON.stringify(sites) }
        })
        
        console.log('✅ Site updated:', siteId, 'for client:', clientId)
        return ok(res, { site: sites[siteIndex], sites })
      } catch (dbError) {
        console.error('❌ Database error updating site:', dbError)
        return serverError(res, 'Failed to update site', dbError.message)
      }
    }
    
    // DELETE /api/sites/client/:clientId/:siteId - Delete a site
    if (req.method === 'DELETE' && clientId && siteId) {
      if (!clientId || !siteId) return badRequest(res, 'clientId and siteId required')
      
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { sites: true }
        })
        
        if (!client) return notFound(res)
        
        const sites = typeof client.sites === 'string' 
          ? JSON.parse(client.sites) 
          : (Array.isArray(client.sites) ? client.sites : [])
        
        // Remove the site
        const updatedSites = sites.filter(s => s.id !== siteId)
        
        // Save back to database
        await prisma.client.update({
          where: { id: clientId },
          data: { sites: JSON.stringify(updatedSites) }
        })
        
        console.log('✅ Site deleted:', siteId, 'from client:', clientId)
        return ok(res, { deleted: true, sites: updatedSites })
      } catch (dbError) {
        console.error('❌ Database error deleting site:', dbError)
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
