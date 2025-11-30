// Raw SQL database fix endpoint
import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'

async function handler(req, res) {
  try {
    
    // Use raw SQL to add the missing column
    await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'client'`
    
    // Update existing records
    await prisma.$executeRaw`UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL`
    
    // Test the fix
    const testResult = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Client"`
    
    return ok(res, { 
      message: 'Database fix completed successfully',
      success: true,
      testResult
    })
  } catch (e) {
    console.error('❌ Database fix failed:', e)
    return serverError(res, 'Database fix failed', e.message)
  }
}

export default withHttp(handler)
