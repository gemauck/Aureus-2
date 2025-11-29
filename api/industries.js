import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound, unauthorized } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    console.log('🔍 Industries API Debug:', {
      method: req.method,
      url: req.url,
      user: req.user
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] === 'industries' ? null : pathSegments[pathSegments.length - 1]

    // Check admin role for POST, PATCH, DELETE operations
    const userRole = req.user?.role?.toLowerCase()
    const isAdmin = userRole === 'admin'
    const requiresAdmin = ['POST', 'PATCH', 'DELETE'].includes(req.method)

    if (requiresAdmin && !isAdmin) {
      return unauthorized(res, 'Admin access required')
    }

    // Cache for sync status to avoid repeated syncs
    let lastSyncTime = 0
    const SYNC_INTERVAL = 5 * 60 * 1000 // Sync at most once every 5 minutes
    let syncInProgress = false

    // Helper function to sync industries from existing clients/leads (optimized)
    async function syncIndustriesFromClients(forceSync = false) {
      // Skip if sync is already in progress or recently completed
      const now = Date.now()
      if (!forceSync && (syncInProgress || (now - lastSyncTime < SYNC_INTERVAL))) {
        return 0
      }

      // Mark sync as in progress
      syncInProgress = true
      
      try {
        // Use a single query with DISTINCT to get unique industries efficiently
        const uniqueIndustriesResult = await prisma.$queryRaw`
          SELECT DISTINCT industry as name
          FROM "Client"
          WHERE industry IS NOT NULL 
            AND industry != ''
            AND TRIM(industry) != ''
        `
        
        const uniqueIndustries = uniqueIndustriesResult
          .map(row => row.name?.trim())
          .filter(Boolean)
        
        if (uniqueIndustries.length === 0) {
          lastSyncTime = now
          syncInProgress = false
          return 0
        }
        
        // Get all existing industries in one query
        const existingIndustries = await prisma.industry.findMany({
          select: { name: true, id: true, isActive: true }
        })
        const existingIndustryMap = new Map(
          existingIndustries.map(ind => [ind.name.toLowerCase(), ind])
        )
        
        // Batch create missing industries
        const industriesToCreate = uniqueIndustries.filter(
          name => !existingIndustryMap.has(name.toLowerCase())
        )
        
        let syncedCount = 0
        
        if (industriesToCreate.length > 0) {
          // Use createMany for batch insert (more efficient)
          try {
            await prisma.industry.createMany({
              data: industriesToCreate.map(name => ({
                name,
                isActive: true
              })),
              skipDuplicates: true
            })
            syncedCount = industriesToCreate.length
            console.log(`✅ Batch synced ${syncedCount} new industries from clients/leads`)
          } catch (batchError) {
            // Fallback to individual creates if batch fails
            console.warn('⚠️ Batch create failed, falling back to individual creates:', batchError.message)
            for (const industryName of industriesToCreate) {
              try {
                await prisma.industry.create({
                  data: { name: industryName, isActive: true }
                })
                syncedCount++
              } catch (createError) {
                if (createError.code !== 'P2002') {
                  console.warn(`⚠️ Error creating industry "${industryName}":`, createError.message)
                }
              }
            }
          }
        }
        
        // Reactivate deactivated industries that are still in use
        const deactivatedToReactivate = uniqueIndustries
          .map(name => existingIndustryMap.get(name.toLowerCase()))
          .filter(ind => ind && !ind.isActive)
        
        if (deactivatedToReactivate.length > 0) {
          await Promise.all(
            deactivatedToReactivate.map(ind =>
              prisma.industry.update({
                where: { id: ind.id },
                data: { isActive: true }
              }).catch(err => {
                console.warn(`⚠️ Error reactivating industry "${ind.name}":`, err.message)
              })
            )
          )
          console.log(`✅ Reactivated ${deactivatedToReactivate.length} industries`)
        }
        
        lastSyncTime = now
        return syncedCount
      } catch (error) {
        console.warn('⚠️ Error syncing industries from clients:', error.message)
        return 0
      } finally {
        syncInProgress = false
      }
    }

    // List All Industries (GET /api/industries)
    if (req.method === 'GET' && pathSegments[pathSegments.length - 1] === 'industries') {
      try {
        // Try to create table if it doesn't exist (idempotent)
        try {
          await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Industry" (
              id TEXT PRIMARY KEY,
              name TEXT UNIQUE NOT NULL,
              "isActive" BOOLEAN DEFAULT true,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `
          await prisma.$executeRaw`
            CREATE INDEX IF NOT EXISTS "Industry_name_idx" ON "Industry"(name);
          `
          await prisma.$executeRaw`
            CREATE INDEX IF NOT EXISTS "Industry_isActive_idx" ON "Industry"("isActive");
          `
        } catch (createError) {
          // Table might already exist, ignore error
          if (!createError.message.includes('already exists') && createError.code !== '42P07') {
            console.warn('⚠️ Could not ensure Industry table exists:', createError.message)
          }
        }
        
        // Get industries first (non-blocking)
        const industries = await prisma.industry.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' }
        })
        
        // Sync industries asynchronously (don't block the response)
        // Only sync if it's been more than 5 minutes since last sync
        syncIndustriesFromClients().catch(err => {
          console.warn('⚠️ Background industry sync failed:', err.message)
        })
        
        console.log('✅ Industries retrieved successfully:', industries.length)
        return ok(res, { industries })
      } catch (dbError) {
        console.error('❌ Database error getting industries:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get industries', dbError.message)
      }
    }

    // Get Single Industry (GET /api/industries/[id])
    if (req.method === 'GET' && id) {
      try {
        const industry = await prisma.industry.findUnique({ 
          where: { id }
        })
        if (!industry) return notFound(res)
        console.log('✅ Industry retrieved successfully:', industry.id)
        return ok(res, { industry })
      } catch (dbError) {
        console.error('❌ Database error getting industry:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get industry', dbError.message)
      }
    }

    // Create Industry (POST /api/industries)
    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return badRequest(res, 'Industry name is required')
      }

      const name = String(body.name).trim()
      
      // Check if industry with this name already exists
      const existingIndustry = await prisma.industry.findUnique({
        where: { name }
      })
      
      if (existingIndustry) {
        return badRequest(res, 'An industry with this name already exists')
      }

      try {
        const industry = await prisma.industry.create({
          data: {
            name,
            isActive: body.isActive !== undefined ? Boolean(body.isActive) : true
          }
        })
        console.log('✅ Industry created successfully:', industry.id)
        return created(res, { industry })
      } catch (dbError) {
        console.error('❌ Database error creating industry:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to create industry', dbError.message)
      }
    }

    // Update Industry (PATCH /api/industries/[id])
    if (req.method === 'PATCH' && id) {
      const body = await parseJsonBody(req)
      
      // Check if industry exists
      const existingIndustry = await prisma.industry.findUnique({ where: { id } })
      if (!existingIndustry) {
        return notFound(res, 'Industry not found')
      }

      // If name is being updated, check for duplicates
      if (body.name && body.name !== existingIndustry.name) {
        const name = String(body.name).trim()
        if (name.length === 0) {
          return badRequest(res, 'Industry name cannot be empty')
        }
        
        const duplicateIndustry = await prisma.industry.findUnique({
          where: { name }
        })
        
        if (duplicateIndustry) {
          return badRequest(res, 'An industry with this name already exists')
        }
      }

      const updateData = {}
      if (body.name !== undefined) updateData.name = String(body.name).trim()
      if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive)

      try {
        const industry = await prisma.industry.update({
          where: { id },
          data: updateData
        })
        console.log('✅ Industry updated successfully:', industry.id)
        return ok(res, { industry })
      } catch (dbError) {
        console.error('❌ Database error updating industry:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to update industry', dbError.message)
      }
    }

    // Delete Industry (DELETE /api/industries/[id])
    if (req.method === 'DELETE' && id) {
      try {
        // Check if industry exists
        const existingIndustry = await prisma.industry.findUnique({ where: { id } })
        if (!existingIndustry) {
          return notFound(res, 'Industry not found')
        }

        // Check if any clients are using this industry
        const clientsUsingIndustry = await prisma.client.findFirst({
          where: { industry: existingIndustry.name }
        })

        if (clientsUsingIndustry) {
          // Instead of hard delete, mark as inactive
          await prisma.industry.update({
            where: { id },
            data: { isActive: false }
          })
          console.log('✅ Industry deactivated (clients still using it):', id)
          return ok(res, { message: 'Industry deactivated (clients still using it)' })
        }

        // Safe to delete if no clients are using it
        await prisma.industry.delete({ where: { id } })
        console.log('✅ Industry deleted successfully:', id)
        return ok(res, { message: 'Industry deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting industry:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to delete industry', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Industries API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

