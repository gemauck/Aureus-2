// Test database connection and Prisma client
import { prisma, verifyConnection } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { authRequired } from './_lib/authRequired.js'

async function handler(req, res) {
  try {
    
    // Test 1: Check if Prisma client exists
    if (!prisma) {
      return serverError(res, 'Prisma client not initialized')
    }
    
    // Test 2: Try to connect
    try {
      await prisma.$connect()
    } catch (connError) {
      console.error('❌ Prisma $connect() failed:', connError)
      console.error('❌ Connection error details:', {
        name: connError.name,
        code: connError.code,
        message: connError.message,
        meta: connError.meta
      })
      return serverError(res, `Connection failed: ${connError.message}`, connError.stack)
    }
    
    // Test 3: Try a simple query
    try {
      const result = await prisma.$queryRaw`SELECT 1 as test`
    } catch (queryError) {
      console.error('❌ Simple query failed:', queryError)
      console.error('❌ Query error details:', {
        name: queryError.name,
        code: queryError.code,
        message: queryError.message
      })
      return serverError(res, `Query failed: ${queryError.message}`, queryError.stack)
    }
    
    // Test 4: Try to query a table (User table should exist)
    try {
      const userCount = await prisma.user.count()
    } catch (tableError) {
      console.error('❌ User table query failed:', tableError)
      console.error('❌ Table error details:', {
        name: tableError.name,
        code: tableError.code,
        message: tableError.message
      })
      return serverError(res, `Table query failed: ${tableError.message}`, tableError.stack)
    }
    
    // Test 5: Verify connection helper
    try {
      const isConnected = await verifyConnection()
    } catch (verifyError) {
      console.error('❌ verifyConnection() failed:', verifyError)
      return serverError(res, `Verify connection failed: ${verifyError.message}`, verifyError.stack)
    }
    
    return ok(res, {
      status: 'success',
      message: 'All database connection tests passed',
      tests: {
        prismaClientExists: true,
        connectionSuccessful: true,
        simpleQuerySuccessful: true,
        tableQuerySuccessful: true,
        verifyConnectionSuccessful: true
      },
      databaseUrl: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 30)}...` : 'NOT SET'
    })
  } catch (error) {
    console.error('❌ Database test failed:', error)
    console.error('❌ Error details:', {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack?.substring(0, 500)
    })
    return serverError(res, `Test failed: ${error.message}`, error.stack)
  }
}

export default withHttp(authRequired(handler))

