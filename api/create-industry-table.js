import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  // Only allow POST and only for admins
  if (req.method !== 'POST') {
    return unauthorized(res, 'Method not allowed')
  }

  const userRole = req.user?.role?.toLowerCase()
  const isAdmin = userRole === 'admin'

  if (!isAdmin) {
    return unauthorized(res, 'Admin access required')
  }

  try {
    // Create Industry table if it doesn't exist
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Industry" (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    
    // Create indexes if they don't exist
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Industry_name_idx" ON "Industry"(name);
    `
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Industry_isActive_idx" ON "Industry"("isActive");
    `
    
    
    return ok(res, { 
      message: 'Industry table created successfully',
      table: 'Industry'
    })
  } catch (error) {
    if (error.message.includes('already exists') || error.code === '42P07') {
      return ok(res, { 
        message: 'Industry table already exists',
        table: 'Industry'
      })
    }
    console.error('❌ Error creating Industry table:', error)
    return serverError(res, 'Failed to create Industry table', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

