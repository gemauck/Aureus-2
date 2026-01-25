import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'

async function handler(req, res) {
  try {
    
    // Test basic database connection
    const startTime = Date.now()
    
    try {
      // Simple query to test connection
      await prisma.$queryRaw`SELECT 1 as test`
      const connectionTime = Date.now() - startTime
      
      
      // Test if tables exist
      const tableCount = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `
      
      const count = tableCount[0]?.count
      const tables = typeof count === 'bigint' ? Number(count) : (Number(count) || 0)
      return ok(res, {
        status: 'healthy',
        connectionTime: `${connectionTime}ms`,
        tables,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production'
      })
      
    } catch (dbError) {
      console.error('❌ Database connection test failed:', dbError)
      return serverError(res, 'Database connection failed', {
        error: dbError.message,
        code: dbError.code,
        timestamp: new Date().toISOString()
      })
    }
    
  } catch (error) {
    console.error('❌ Health check error:', error)
    return serverError(res, 'Health check failed', error.message)
  }
}

export default handler
