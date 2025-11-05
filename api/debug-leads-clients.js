// Debug endpoint to compare what different users see
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const userEmail = req.user?.email || 'unknown'
    const userId = req.user?.sub || 'unknown'
    
    console.log(`🔍 DEBUG: User ${userEmail} (${userId}) requesting debug info`)
    
    // Get ALL leads from database (no filtering)
    const allLeadsRaw = await prisma.$queryRaw`
      SELECT id, name, type, "ownerId", "createdAt", "updatedAt"
      FROM "Client"
      WHERE type = 'lead'
      ORDER BY "createdAt" DESC
    `
    
    // Get ALL clients from database (no filtering)
    const allClientsRaw = await prisma.$queryRaw`
      SELECT id, name, type, "ownerId", "createdAt", "updatedAt"
      FROM "Client"
      WHERE (type = 'client' OR type IS NULL)
      AND type != 'lead'
      ORDER BY "createdAt" DESC
    `
    
    // Also get via Prisma to compare
    const leadsViaPrisma = await prisma.client.findMany({
      where: { type: 'lead' },
      select: { id: true, name: true, type: true, ownerId: true, createdAt: true }
    })
    
    const clientsViaPrisma = await prisma.client.findMany({
      where: {
        OR: [
          { type: 'client' },
          { type: null }
        ]
      },
      select: { id: true, name: true, type: true, ownerId: true, createdAt: true }
    })
    
    // Compare counts
    const rawLeadsCount = allLeadsRaw.length
    const prismaLeadsCount = leadsViaPrisma.length
    const rawClientsCount = allClientsRaw.length
    const prismaClientsCount = clientsViaPrisma.length
    
    // Get lead IDs for comparison
    const rawLeadIds = allLeadsRaw.map(l => l.id).sort()
    const prismaLeadIds = leadsViaPrisma.map(l => l.id).sort()
    const missingInPrisma = rawLeadIds.filter(id => !prismaLeadIds.includes(id))
    const extraInPrisma = prismaLeadIds.filter(id => !rawLeadIds.includes(id))
    
    // Get client IDs for comparison
    const rawClientIds = allClientsRaw.map(c => c.id).sort()
    const prismaClientIds = clientsViaPrisma.map(c => c.id).sort()
    const missingClientsInPrisma = rawClientIds.filter(id => !prismaClientIds.includes(id))
    const extraClientsInPrisma = prismaClientIds.filter(id => !rawClientIds.includes(id))
    
    const debugInfo = {
      user: {
        email: userEmail,
        id: userId
      },
      leads: {
        rawSqlCount: rawLeadsCount,
        prismaCount: prismaLeadsCount,
        match: rawLeadsCount === prismaLeadsCount,
        rawSqlIds: rawLeadIds,
        prismaIds: prismaLeadIds,
        missingInPrisma: missingInPrisma,
        extraInPrisma: extraInPrisma,
        rawSqlDetails: allLeadsRaw.map(l => ({
          id: l.id,
          name: l.name,
          ownerId: l.ownerId || null
        }))
      },
      clients: {
        rawSqlCount: rawClientsCount,
        prismaCount: prismaClientsCount,
        match: rawClientsCount === prismaClientsCount,
        rawSqlIds: rawClientIds,
        prismaIds: prismaClientIds,
        missingInPrisma: missingClientsInPrisma,
        extraInPrisma: extraClientsInPrisma,
        rawSqlDetails: allClientsRaw.map(c => ({
          id: c.id,
          name: c.name,
          ownerId: c.ownerId || null
        }))
      },
      timestamp: new Date().toISOString()
    }
    
    console.log(`📊 DEBUG: User ${userEmail} - Leads: ${rawLeadsCount} (raw) vs ${prismaLeadsCount} (Prisma)`)
    console.log(`📊 DEBUG: User ${userEmail} - Clients: ${rawClientsCount} (raw) vs ${prismaClientsCount} (Prisma)`)
    
    if (!debugInfo.leads.match) {
      console.error(`❌ MISMATCH: Leads count differs for ${userEmail}!`)
      console.error(`   Raw SQL: ${rawLeadsCount}, Prisma: ${prismaLeadsCount}`)
      if (missingInPrisma.length > 0) {
        console.error(`   Missing in Prisma: ${missingInPrisma.join(', ')}`)
      }
      if (extraInPrisma.length > 0) {
        console.error(`   Extra in Prisma: ${extraInPrisma.join(', ')}`)
      }
    }
    
    if (!debugInfo.clients.match) {
      console.error(`❌ MISMATCH: Clients count differs for ${userEmail}!`)
      console.error(`   Raw SQL: ${rawClientsCount}, Prisma: ${prismaClientsCount}`)
      if (missingClientsInPrisma.length > 0) {
        console.error(`   Missing in Prisma: ${missingClientsInPrisma.join(', ')}`)
      }
      if (extraClientsInPrisma.length > 0) {
        console.error(`   Extra in Prisma: ${extraClientsInPrisma.join(', ')}`)
      }
    }
    
    return ok(res, debugInfo)
  } catch (error) {
    console.error('❌ Debug endpoint error:', error)
    return serverError(res, 'Debug endpoint failed', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

