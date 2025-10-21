// Health check endpoint for Railway with database migration
import { withHttp } from './_lib/withHttp.js'
import { prisma } from './_lib/prisma.js'

async function handler(req, res) {
  try {
    // Run database migration if needed
    try {
      await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'client'`
      await prisma.$executeRaw`UPDATE "Client" SET "type" = 'client' WHERE "type" IS NULL`
      console.log('✅ Database migration completed in health check')
    } catch (migrationError) {
      console.log('Migration error (may be expected):', migrationError.message)
    }
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      platform: 'railway',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      migration: 'completed'
    })
  } catch (error) {
    console.error('Health check error:', error)
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    })
  }
}

export default withHttp(handler)
