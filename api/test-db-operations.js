import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🧪 Testing basic database operations...')
    
    // First, run migration to fix schema issues
    console.log('🔧 Running database migration to fix schema...')
    
    try {
      // Add missing columns to Client table
      await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'client'`
      await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "value" DOUBLE PRECISION DEFAULT 0`
      await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "probability" INTEGER DEFAULT 0`
      
      // Update existing records
      await prisma.$executeRaw`UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL`
      
      // Add missing columns to Project table
      await prisma.$executeRaw`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientName" TEXT DEFAULT ''`
      await prisma.$executeRaw`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "tasksList" JSONB DEFAULT '[]'`
      await prisma.$executeRaw`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "team" JSONB DEFAULT '[]'`
      
      // Ensure JSON columns have proper defaults
      await prisma.$executeRaw`UPDATE "Client" SET "contacts" = '[]' WHERE "contacts" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "followUps" = '[]' WHERE "followUps" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "projectIds" = '[]' WHERE "projectIds" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "comments" = '[]' WHERE "comments" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "sites" = '[]' WHERE "sites" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "contracts" = '[]' WHERE "contracts" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "activityLog" = '[]' WHERE "activityLog" IS NULL`
      
      await prisma.$executeRaw`UPDATE "Project" SET "tasksList" = '[]' WHERE "tasksList" IS NULL`
      await prisma.$executeRaw`UPDATE "Project" SET "team" = '[]' WHERE "team" IS NULL`
      
      console.log('✅ Database migration completed successfully')
    } catch (migrationError) {
      console.log('Migration error (may be expected):', migrationError.message)
    }
    
    // Test 1: Simple query
    const userCount = await prisma.user.count()
    console.log('✅ User count:', userCount)
    
    // Test 2: Try to create a minimal client
    const testClient = await prisma.client.create({
      data: {
        name: 'Test Client',
        type: 'client', // Add missing type field
        industry: 'Test',
        status: 'active',
        revenue: 0,
        address: '',
        website: '',
        notes: '',
        contacts: [],
        followUps: [],
        projectIds: [],
        comments: [],
        sites: [],
        contracts: [],
        activityLog: [],
        billingTerms: {
          paymentTerms: 'Net 30',
          billingFrequency: 'Monthly',
          currency: 'ZAR',
          retainerAmount: 0,
          taxExempt: false,
          notes: ''
        },
        ownerId: null
      }
    })
    console.log('✅ Test client created:', testClient.id)
    
    // Test 3: Clean up - delete the test client
    await prisma.client.delete({ where: { id: testClient.id } })
    console.log('✅ Test client deleted')
    
    return ok(res, { 
      message: 'All database operations working!',
      userCount,
      testPassed: true
    })
  } catch (e) {
    console.error('❌ Database test failed:', e)
    return serverError(res, 'Database test failed', e.message)
  }
}

export default withHttp(withLogging(handler))
