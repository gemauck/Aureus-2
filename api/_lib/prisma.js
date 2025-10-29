import { PrismaClient } from '@prisma/client'

let prismaGlobal

if (!global.__prisma) {
  try {
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL is not set')
      throw new Error('DATABASE_URL environment variable is required')
    }
    
    global.__prisma = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'pretty'
    })
    console.log('✅ Prisma client initialized')
  } catch (error) {
    console.error('❌ Failed to create Prisma client:', error)
    throw error
  }
}

prismaGlobal = global.__prisma

// Ensure connection on first use
let connectionAttempted = false
async function ensureConnected() {
  if (!connectionAttempted) {
    connectionAttempted = true
    try {
      await prismaGlobal.$connect()
      console.log('✅ Prisma database connection established')
    } catch (error) {
      console.error('❌ Prisma connection failed:', error.message)
      console.error('❌ Prisma connection error stack:', error.stack)
      // Don't throw - let Prisma handle connection lazily
    }
  }
}

// Attempt initial connection (non-blocking)
ensureConnected().catch((error) => {
  console.error('❌ Prisma initial connection attempt failed:', error.message)
  // Connection will be retried on first query
})

// Export with connection check helper
export const prisma = prismaGlobal

// Helper to verify connection
export async function verifyConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('❌ Prisma connection verification failed:', error.message)
    return false
  }
}

