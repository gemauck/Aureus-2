import { randomUUID } from 'crypto'
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    
    // Strip query parameters before splitting (safety fallback)
    const urlPath = (req.url || '').split('?')[0].split('#')[0]
    const pathSegments = urlPath.split('/').filter(Boolean)
    // Express route is /api/sites/client/:clientId/:siteId? so path is like .../api/sites/client/ABC or .../sites/client/ABC
    const clientIdx = pathSegments.indexOf('client')
    const clientIdFromUrl = clientIdx >= 0 && pathSegments[clientIdx + 1] ? pathSegments[clientIdx + 1] : null
    const siteIdFromUrl = clientIdx >= 0 && pathSegments[clientIdx + 2] ? pathSegments[clientIdx + 2] : null
    const clientId = (req.params && req.params.clientId) || clientIdFromUrl
    const siteId = (req.params && req.params.siteId) || siteIdFromUrl
    
    
    // GET /api/sites/client/:clientId - Get all sites for a client (or lead; leads are Client rows with type=lead)
    if (req.method === 'GET' && clientId && !siteId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      try {
        // FIXED: Validate clientId format before querying
        if (typeof clientId !== 'string' || clientId.trim().length === 0) {
          return badRequest(res, 'Invalid clientId format')
        }
        const tid = clientId.trim()

        let sites = []
        try {
          // Phase 6: Use normalized ClientSite table
          sites = await prisma.clientSite.findMany({
            where: { clientId: tid },
            orderBy: { createdAt: 'asc' }
          })
        } catch (findErr) {
          console.warn('⚠️ ClientSite.findMany failed for', tid, findErr.message)
          sites = []
        }

        // Fallback: If no sites in normalized table, try JSON field (backward compatibility)
        if (sites.length === 0) {
          try {
            const result = await prisma.$queryRaw`
              SELECT sites, sitesJsonb FROM "Client" WHERE id = ${tid}
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
              return ok(res, { sites: jsonSites })
            }
          } catch (fallbackError) {
            console.warn('⚠️ Fallback query for sites failed:', fallbackError.message)
          }
        }

        return ok(res, { sites })
      } catch (err) {
        // Never 500 on GET: return empty sites so UI does not retry and hit rate limits
        console.error('❌ Sites GET error (returning empty):', err.message)
        console.error('❌ ClientId:', clientId, 'Code:', err.code)
        return ok(res, { sites: [] })
      }
    }
    
    // POST /api/sites/client/:clientId - Add a site to a client
    if (req.method === 'POST') {
      const rawClientId = clientId && typeof clientId === 'string' ? clientId.trim() : ''
      if (!rawClientId || rawClientId === 'undefined' || rawClientId === 'null') {
        return badRequest(res, 'Client ID is required to add a site. Save the client first.')
      }
      
      const body = req.body || {}
      const siteName = (body.name && String(body.name).trim()) || ''
      if (!siteName) return badRequest(res, 'Site name is required')
      
      try {
        // Verify client exists
        const client = await prisma.client.findUnique({
          where: { id: rawClientId },
          select: { id: true }
        })
        
        if (!client) return notFound(res, 'Client not found')
        
        // Phase 6: Create site in normalized ClientSite table (persist stage/aidaStatus for leads)
        const createData = {
          clientId: rawClientId,
          name: siteName,
          address: typeof body.address === 'string' ? body.address : '',
          contactPerson: typeof body.contactPerson === 'string' ? body.contactPerson : '',
          contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : '',
          contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : '',
          notes: typeof body.notes === 'string' ? body.notes : '',
          siteLead: body.siteLead != null ? String(body.siteLead) : '',
          stage: body.stage != null ? String(body.stage) : 'Potential',
          aidaStatus: body.aidaStatus != null ? String(body.aidaStatus) : 'Awareness'
        }
        const enrich = (row) => ({
          ...row,
          siteLead: row.siteLead ?? createData.siteLead,
          stage: row.stage ?? createData.stage,
          aidaStatus: row.aidaStatus ?? createData.aidaStatus
        })
        let newSite
        try {
          newSite = await prisma.clientSite.create({ data: createData })
        } catch (createErr) {
          const m = String(createErr?.message || '')
          if (m.includes('siteLead') && (m.includes('does not exist') || m.includes('column'))) {
            const id = randomUUID()
            const rows = await prisma.$queryRawUnsafe(
              `INSERT INTO "ClientSite" ("id","clientId","name","address","contactPerson","contactPhone","contactEmail","notes","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
               RETURNING *`,
              id, createData.clientId, createData.name, createData.address,
              createData.contactPerson || '', createData.contactPhone || '', createData.contactEmail || '', createData.notes || ''
            )
            newSite = Array.isArray(rows) ? rows[0] : rows
            if (!newSite) throw createErr
            newSite = enrich(newSite)
          } else {
            throw createErr
          }
        }
        return created(res, { site: newSite })
      } catch (dbError) {
        const msg = (dbError && dbError.message) ? String(dbError.message) : 'Unknown error'
        console.error('❌ Database error adding site:', {
          clientId: rawClientId,
          errorCode: dbError.code,
          errorName: dbError.name,
          errorMessage: msg,
          errorMeta: dbError.meta,
          stack: dbError.stack?.substring(0, 500)
        })
        
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${msg}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        // Check for specific Prisma errors
        if (dbError.code === 'P2025') {
          return notFound(res, 'Client not found')
        }
        
        if (dbError.code === 'P2002' || dbError.code === 'P2003') {
          return serverError(res, 'Database constraint error', `The client data may be corrupted or have invalid relationships. Error: ${msg}`)
        }

        // Table/model missing – give actionable message
        if (msg.includes('ClientSite') && (msg.includes('does not exist') || msg.includes('Relation') || msg.includes('relation "'))) {
          return serverError(
            res,
            'Sites table not initialized',
            'The ClientSite table is missing. Run: npx prisma db push (or prisma migrate deploy) then restart the server.'
          )
        }
        
        return serverError(res, 'Failed to add site', msg || 'Unknown database error')
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
        
        // Use defaults for stage/aidaStatus when empty so they persist after refresh
        const stageVal = body.stage !== undefined ? (body.stage != null && String(body.stage).trim() !== '' ? String(body.stage).trim() : 'Potential') : undefined
        const aidaVal = body.aidaStatus !== undefined ? (body.aidaStatus != null && String(body.aidaStatus).trim() !== '' ? String(body.aidaStatus).trim() : 'Awareness') : undefined
        const baseUpdate = {
          name: body.name !== undefined ? body.name : undefined,
          address: body.address !== undefined ? body.address : undefined,
          contactPerson: body.contactPerson !== undefined ? body.contactPerson : undefined,
          contactPhone: body.contactPhone !== undefined ? body.contactPhone : undefined,
          contactEmail: body.contactEmail !== undefined ? body.contactEmail : undefined,
          notes: body.notes !== undefined ? body.notes : undefined,
          siteLead: body.siteLead !== undefined ? String(body.siteLead) : undefined,
          stage: stageVal,
          aidaStatus: aidaVal
        }
        const removeUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
        const data = removeUndefined(baseUpdate)
        let updatedSite
        try {
          updatedSite = await prisma.clientSite.update({
            where: { id: siteId },
            data
          })
        } catch (updateErr) {
          const m = String(updateErr?.message || '')
          if (m.includes('siteLead') && (m.includes('does not exist') || m.includes('column'))) {
            const dataBaseOnly = removeUndefined({
              name: body.name !== undefined ? body.name : undefined,
              address: body.address !== undefined ? body.address : undefined,
              contactPerson: body.contactPerson !== undefined ? body.contactPerson : undefined,
              contactPhone: body.contactPhone !== undefined ? body.contactPhone : undefined,
              contactEmail: body.contactEmail !== undefined ? body.contactEmail : undefined,
              notes: body.notes !== undefined ? body.notes : undefined
            })
            updatedSite = await prisma.clientSite.update({ where: { id: siteId }, data: dataBaseOnly })
            updatedSite = { ...updatedSite, siteLead: body.siteLead ?? '', stage: body.stage ?? '', aidaStatus: body.aidaStatus ?? '' }
          } else {
            throw updateErr
          }
        }
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
    // GET /sites/client/:id must never 500: return empty sites so UI does not retry/rate-limit
    const isGetSites = req.method === 'GET' && (req.url || '').includes('/sites/client/') && !(req.url || '').match(/\/sites\/client\/[^/]+\/[^/]/)
    if (isGetSites && res && !res.headersSent) {
      return ok(res, { sites: [] })
    }
    return serverError(res, 'Sites handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
