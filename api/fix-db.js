// Simple migration endpoint
import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'

async function handler(req, res) {
  try {
    console.log('🔧 Running direct database migration...')
    
    // Add the missing type column
    await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'client'`
    console.log('✅ Added type column')
    
    // Update existing records
    await prisma.$executeRaw`UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL`
    console.log('✅ Updated existing clients')
    
    // Test creating a client
    const testClient = await prisma.client.create({
      data: {
        name: 'Migration Test',
        type: 'client',
        industry: 'Test'
      }
    })
    
    await prisma.client.delete({ where: { id: testClient.id } })
    console.log('✅ Migration test passed')
    
    return ok(res, { message: 'Migration successful', success: true })
  } catch (e) {
    console.error('❌ Migration failed:', e)
    return serverError(res, 'Migration failed', e.message)
  }
}

export default withHttp(handler)
