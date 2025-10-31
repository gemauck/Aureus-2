import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { authRequired } from './_lib/authRequired.js'

async function handler(req, res) {
  try {
    console.log('🔧 Applying database performance indexes...')
    
    // Client table indexes
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_createdAt_idx" ON "Client"("createdAt")`
    console.log('✅ Created Client_createdAt_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_type_idx" ON "Client"("type")`
    console.log('✅ Created Client_type_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_status_idx" ON "Client"("status")`
    console.log('✅ Created Client_status_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Client_ownerId_idx" ON "Client"("ownerId")`
    console.log('✅ Created Client_ownerId_idx')
    
    // Project table indexes
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId")`
    console.log('✅ Created Project_clientId_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status")`
    console.log('✅ Created Project_status_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_ownerId_idx" ON "Project"("ownerId")`
    console.log('✅ Created Project_ownerId_idx')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Project_createdAt_idx" ON "Project"("createdAt")`
    console.log('✅ Created Project_createdAt_idx')
    
    // Verify indexes were created
    const clientIndexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Client' AND indexname LIKE 'Client_%'
    `
    
    const projectIndexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Project' AND indexname LIKE 'Project_%'
    `
    
    console.log(`✅ Created ${clientIndexes.length} Client indexes`)
    console.log(`✅ Created ${projectIndexes.length} Project indexes`)
    
    return ok(res, {
      success: true,
      message: 'Performance indexes applied successfully',
      clientIndexes: clientIndexes.length,
      projectIndexes: projectIndexes.length,
      indexes: {
        client: clientIndexes.map(idx => idx.indexname),
        project: projectIndexes.map(idx => idx.indexname)
      }
    })
  } catch (error) {
    console.error('❌ Failed to apply indexes:', error)
    return serverError(res, 'Failed to apply indexes', error.message)
  }
}

export default withHttp(authRequired(handler))

