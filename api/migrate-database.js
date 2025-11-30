// Database migration endpoint to fix schema issues
import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    
    // Run the migration SQL
    const migrationSQL = `
      -- Add type column to Client table if it doesn't exist
      ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'client';
      
      -- Update existing clients to have 'client' type
      UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL;
      
      -- Add any other missing columns that might be needed
      ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "value" DOUBLE PRECISION DEFAULT 0;
      ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "probability" INTEGER DEFAULT 0;
      
      -- Ensure all JSON columns have proper defaults
      UPDATE "Client" SET "contacts" = '[]' WHERE "contacts" IS NULL;
      UPDATE "Client" SET "followUps" = '[]' WHERE "followUps" IS NULL;
      UPDATE "Client" SET "projectIds" = '[]' WHERE "projectIds" IS NULL;
      UPDATE "Client" SET "comments" = '[]' WHERE "comments" IS NULL;
      UPDATE "Client" SET "sites" = '[]' WHERE "sites" IS NULL;
      UPDATE "Client" SET "contracts" = '[]' WHERE "contracts" IS NULL;
      UPDATE "Client" SET "activityLog" = '[]' WHERE "activityLog" IS NULL;
      
      -- Set default billing terms if null
      UPDATE "Client" SET "billingTerms" = '{"paymentTerms":"Net 30","billingFrequency":"Monthly","currency":"ZAR","retainerAmount":0,"taxExempt":false,"notes":""}' WHERE "billingTerms" IS NULL;
      
      -- Add any missing columns to Project table
      ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientName" TEXT DEFAULT '';
      ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "tasksList" JSONB DEFAULT '[]';
      ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "team" JSONB DEFAULT '[]';
      
      -- Ensure Project JSON columns have proper defaults
      UPDATE "Project" SET "tasksList" = '[]' WHERE "tasksList" IS NULL;
      UPDATE "Project" SET "team" = '[]' WHERE "team" IS NULL;
    `
    
    await prisma.$executeRawUnsafe(migrationSQL)
    
    // Test that the migration worked
    const testClient = await prisma.client.create({
      data: {
        name: 'Migration Test Client',
        type: 'client',
        industry: 'Test',
        status: 'active'
      }
    })
    
    await prisma.client.delete({ where: { id: testClient.id } })
    
    return ok(res, { 
      message: 'Database migration completed successfully',
      migrationPassed: true
    })
  } catch (e) {
    console.error('❌ Database migration failed:', e)
    return serverError(res, 'Database migration failed', e.message)
  }
}

export default withHttp(withLogging(handler))
