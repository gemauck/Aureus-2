// Quick database connection test script
// Run with: node test-db-connection-script.js  (or npm run db:test)
// Loads .env from the project root (script directory) so it works when run from any cwd.

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })
dotenv.config({ path: join(__dirname, '.env.local'), override: true })

const prisma = new PrismaClient({
  log: ['error', 'warn', 'info'],
})

async function testConnection() {
  console.log('🔍 Testing database connection...\n')
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is NOT SET!')
    console.error('   Please set DATABASE_URL in your .env file or environment variables')
    process.exit(1)
  }
  
  console.log('✅ DATABASE_URL is set')
  console.log(`   Connection string: ${process.env.DATABASE_URL.substring(0, 50)}...`)
  console.log('')
  
  try {
    // Test 1: Connect to database
    console.log('📡 Attempting to connect to database...')
    await prisma.$connect()
    console.log('✅ Database connection successful!\n')
    
    // Test 2: Run a simple query
    console.log('📡 Testing database query...')
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Query successful:', result)
    console.log('')
    
    // Test 3: Count users
    console.log('📡 Counting users...')
    const userCount = await prisma.user.count()
    console.log(`✅ User count: ${userCount}`)
    console.log('')
    
    // Test 4: Get database version
    console.log('📡 Getting database version...')
    const version = await prisma.$queryRaw`SELECT version()`
    console.log('✅ Database version:', version)
    console.log('')
    
    console.log('🎉 All database tests passed!')
    console.log('   Your database connection is working correctly.')
    
  } catch (error) {
    console.error('\n❌ Database connection failed!\n')
    console.error('Error details:')
    console.error('  Name:', error.name)
    console.error('  Code:', error.code)
    console.error('  Message:', error.message)
    console.error('')
    
    if (error.code === 'P1001') {
      console.error('🔍 Diagnosis: Cannot reach database server')
      console.error('   Possible causes:')
      console.error('   1. Database server is not running')
      console.error('   2. Wrong host/port in DATABASE_URL')
      console.error('   3. Firewall blocking connection')
      console.error('   4. Network connectivity issues')
    } else if (error.code === 'P1002') {
      console.error('🔍 Diagnosis: Database server not reachable')
      console.error('   Check your DATABASE_URL host and port')
    } else if (error.code === 'P1008') {
      console.error('🔍 Diagnosis: Connection timeout')
      console.error('   Database server may be slow or unreachable')
    } else if (error.code === 'P1017') {
      console.error('🔍 Diagnosis: Server closed the connection')
      console.error('   Database server may have restarted')
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔍 Diagnosis: Hostname not found')
      console.error('   Check the host in your DATABASE_URL')
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔍 Diagnosis: Connection refused')
      console.error('   Database server is not accepting connections')
    }
    
    console.error('')
    console.error('Stack trace:')
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()

