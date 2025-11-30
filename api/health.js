// Health check endpoint for Railway with database connection test
import { withHttp } from './_lib/withHttp.js'
import { prisma } from './_lib/prisma.js'

async function handler(req, res) {
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    platform: 'railway',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    checks: {
      database: 'unknown',
      jwt_secret: !!process.env.JWT_SECRET,
      admin_user: 'unknown'
    }
  }

  try {
    
    // Test database connection
    try {
      await prisma.$connect()
      healthData.checks.database = 'connected'
      
      // Test database query
      const userCount = await prisma.user.count()
      
      // Check if any admin user exists (non-blocking check)
      try {
        const adminUsers = await prisma.user.findMany({
          where: { 
            role: 'admin',
            status: 'active'
          },
          take: 1
        })
        
        if (adminUsers.length > 0) {
          healthData.checks.admin_user = 'exists'
        } else {
          healthData.checks.admin_user = 'none_found'
        }
      } catch (adminCheckError) {
        healthData.checks.admin_user = 'check_skipped'
      }
      
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError.message)
      healthData.checks.database = 'failed'
      healthData.checks.database_error = dbError.message
    }
    
    // Run database migration if needed (PostgreSQL compatible)
    try {
      // Check if column exists first (PostgreSQL syntax)
      const columnCheck = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Client' AND column_name = 'type'
      `
      const hasTypeColumn = Array.isArray(columnCheck) && columnCheck.length > 0
      
      if (!hasTypeColumn) {
        await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN "type" TEXT DEFAULT 'client'`
      }
      
      await prisma.$executeRaw`UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL`
      healthData.migration = 'completed'
    } catch (migrationError) {
      healthData.migration = 'skipped'
    }
    
    // Determine overall status (only fail on critical issues)
    if (healthData.checks.database === 'failed') {
      healthData.status = 'error'
      healthData.message = 'Database connection failed'
    } else {
      healthData.status = 'ok'
      // Admin user check is informational only, not a blocking issue
    }
    
    res.json(healthData)
    
  } catch (error) {
    console.error('❌ Health check error:', error)
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

export default withHttp(handler)
