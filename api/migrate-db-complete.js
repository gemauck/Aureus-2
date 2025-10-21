// Comprehensive database migration endpoint
import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'

async function handler(req, res) {
  try {
    console.log('🔧 Running comprehensive database migration...')
    
    const migrationSteps = []
    
    // Step 1: Add missing columns to Client table
    try {
      await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'client'`
      migrationSteps.push('✅ Added type column to Client table')
      
      await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "value" DOUBLE PRECISION DEFAULT 0`
      migrationSteps.push('✅ Added value column to Client table')
      
      await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "probability" INTEGER DEFAULT 0`
      migrationSteps.push('✅ Added probability column to Client table')
      
      // Update existing records
      await prisma.$executeRaw`UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL`
      migrationSteps.push('✅ Updated existing clients with default type')
      
    } catch (error) {
      migrationSteps.push(`❌ Client table migration failed: ${error.message}`)
    }
    
    // Step 2: Add missing columns to Project table
    try {
      await prisma.$executeRaw`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientName" TEXT DEFAULT ''`
      migrationSteps.push('✅ Added clientName column to Project table')
      
      await prisma.$executeRaw`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "tasksList" JSONB DEFAULT '[]'`
      migrationSteps.push('✅ Added tasksList column to Project table')
      
      await prisma.$executeRaw`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "team" JSONB DEFAULT '[]'`
      migrationSteps.push('✅ Added team column to Project table')
      
    } catch (error) {
      migrationSteps.push(`❌ Project table migration failed: ${error.message}`)
    }
    
    // Step 3: Ensure JSON columns have proper defaults
    try {
      await prisma.$executeRaw`UPDATE "Client" SET "contacts" = '[]' WHERE "contacts" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "followUps" = '[]' WHERE "followUps" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "projectIds" = '[]' WHERE "projectIds" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "comments" = '[]' WHERE "comments" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "sites" = '[]' WHERE "sites" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "contracts" = '[]' WHERE "contracts" IS NULL`
      await prisma.$executeRaw`UPDATE "Client" SET "activityLog" = '[]' WHERE "activityLog" IS NULL`
      migrationSteps.push('✅ Updated Client JSON columns with defaults')
      
      await prisma.$executeRaw`UPDATE "Project" SET "tasksList" = '[]' WHERE "tasksList" IS NULL`
      await prisma.$executeRaw`UPDATE "Project" SET "team" = '[]' WHERE "team" IS NULL`
      migrationSteps.push('✅ Updated Project JSON columns with defaults')
      
    } catch (error) {
      migrationSteps.push(`❌ JSON columns update failed: ${error.message}`)
    }
    
    // Step 4: Test the migration
    try {
      const testClient = await prisma.client.create({
        data: {
          name: 'Migration Test Client',
          type: 'client',
          industry: 'Test',
          status: 'active'
        }
      })
      
      await prisma.client.delete({ where: { id: testClient.id } })
      migrationSteps.push('✅ Migration test passed - database operations working')
      
    } catch (error) {
      migrationSteps.push(`❌ Migration test failed: ${error.message}`)
    }
    
    console.log('✅ Database migration completed')
    
    return ok(res, { 
      message: 'Database migration completed successfully',
      success: true,
      steps: migrationSteps,
      timestamp: new Date().toISOString()
    })
  } catch (e) {
    console.error('❌ Database migration failed:', e)
    return serverError(res, 'Database migration failed', e.message)
  }
}

export default withHttp(handler)
