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
    console.log('🏥 Health check started')
    
    // Test database connection
    try {
      await prisma.$connect()
      console.log('✅ Database connection successful')
      healthData.checks.database = 'connected'
      
      // Test database query
      const userCount = await prisma.user.count()
      console.log('✅ Database query successful, user count:', userCount)
      
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
          console.log('✅ Admin users exist')
        } else {
          healthData.checks.admin_user = 'none_found'
          console.log('ℹ️ No active admin users found (this is informational only)')
        }
      } catch (adminCheckError) {
        console.log('ℹ️ Admin user check skipped:', adminCheckError.message)
        healthData.checks.admin_user = 'check_skipped'
      }
      
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError.message)
      healthData.checks.database = 'failed'
      healthData.checks.database_error = dbError.message
    }
    
    // Run database migration if needed (SQLite compatible)
    try {
      // Check if column exists first
      const tableInfo = await prisma.$queryRaw`PRAGMA table_info(Client)`
      const hasTypeColumn = tableInfo.some(col => col.name === 'type')
      
      if (!hasTypeColumn) {
        await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN "type" TEXT DEFAULT 'client'`
        console.log('✅ Added type column to Client table')
      }
      
      await prisma.$executeRaw`UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL`
      console.log('✅ Database migration completed in health check')
      healthData.migration = 'completed'
    } catch (migrationError) {
      console.log('Migration error (may be expected):', migrationError.message)
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
    
    console.log('🏥 Health check completed:', healthData.status)
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
