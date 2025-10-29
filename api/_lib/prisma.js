import { PrismaClient } from '@prisma/client'

let prismaGlobal

if (!global.__prisma) {
  try {
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
      // Don't throw - let Prisma handle connection lazily
    }
  }
}

// Attempt initial connection (non-blocking)
ensureConnected().catch(() => {
  // Connection will be retried on first query
})

export const prisma = prismaGlobal

