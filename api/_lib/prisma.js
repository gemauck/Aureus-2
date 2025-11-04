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
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })
    console.log('✅ Prisma client initialized')
    console.log(`🔗 DATABASE_URL: ${process.env.DATABASE_URL.substring(0, 50)}${process.env.DATABASE_URL.length > 50 ? '...' : ''}`)
  } catch (error) {
    console.error('❌ Failed to create Prisma client:', error)
    throw error
  }
}

prismaGlobal = global.__prisma

// Connection state tracking
let connectionAttempted = false
let isConnected = false
let connectionPromise = null

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

// Ensure connection with retry logic
async function ensureConnected() {
  // If already connected, return immediately
  if (isConnected) {
    return true
  }

  // If a connection attempt is in progress, wait for it
  if (connectionPromise) {
    return connectionPromise
  }

  // Create new connection promise
  connectionPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await prismaGlobal.$connect()
        isConnected = true
        connectionAttempted = true
        console.log('✅ Prisma database connection established')
        connectionPromise = null
        return true
      } catch (error) {
        console.error(`❌ Prisma connection attempt ${attempt}/${MAX_RETRIES} failed:`, error.message)
        
        if (attempt < MAX_RETRIES) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt))
        } else {
          // Last attempt failed
          console.error('❌ Prisma connection failed after all retries')
          isConnected = false
          connectionPromise = null
          // Don't throw - let Prisma handle connection lazily on first query
          return false
        }
      }
    }
    return false
  })()

  return connectionPromise
}

// Attempt initial connection (non-blocking)
ensureConnected().catch((error) => {
  console.error('❌ Prisma initial connection attempt failed:', error.message)
  // Connection will be retried on first query
})

// Helper to retry database operations
async function withRetry(operation, operationName = 'database operation') {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Ensure connection before operation
      if (!isConnected) {
        await ensureConnected()
      }
      
      return await operation()
    } catch (error) {
      // Check if it's a connection error
      const isConnectionError = 
        error.message?.includes("Can't reach database server") ||
        error.message?.includes("connection") ||
        error.code === 'P1001' || // Prisma connection error
        error.code === 'P1002' || // Prisma timeout error
        error.code === 'P1008' || // Prisma operations timeout
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND'

      if (isConnectionError) {
        console.warn(`⚠️ Connection error on ${operationName} (attempt ${attempt}/${MAX_RETRIES}):`, error.message)
        
        // Mark as disconnected
        isConnected = false
        connectionPromise = null
        
        // Try to reconnect
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt))
          continue
        } else {
          console.error(`❌ ${operationName} failed after ${MAX_RETRIES} retries`)
          throw error
        }
      } else {
        // Not a connection error, throw immediately
        throw error
      }
    }
  }
}

// Create a proxy to wrap Prisma model operations with retry logic
const prismaProxy = new Proxy(prismaGlobal, {
  get(target, prop) {
    const value = target[prop]
    
    // Only wrap Prisma model objects (notification, calendarNote, user, etc.)
    // Skip Prisma internal methods and properties
    if (typeof value === 'object' && value !== null && 
        typeof prop === 'string' &&
        !prop.startsWith('$') && 
        !prop.startsWith('_') &&
        prop !== 'constructor' &&
        typeof value.findMany === 'function') {
      // For model access (e.g., prisma.notification)
      return new Proxy(value, {
        get(modelTarget, modelProp) {
          const modelValue = modelTarget[modelProp]
          
          // Only wrap query methods (findMany, findUnique, create, update, etc.)
          if (typeof modelValue === 'function' && 
              (modelProp.startsWith('find') || 
               modelProp.startsWith('create') || 
               modelProp.startsWith('update') || 
               modelProp.startsWith('delete') || 
               modelProp.startsWith('upsert') ||
               modelProp === 'count' ||
               modelProp === 'updateMany' ||
               modelProp === 'deleteMany')) {
            return function(...args) {
              return withRetry(
                () => modelValue.apply(modelTarget, args),
                `${prop}.${modelProp}`
              )
            }
          }
          
          return modelValue
        }
      })
    }
    
    // For $connect, $disconnect, $queryRaw, etc., pass through directly
    return value
  }
})

// Export with connection check helper
export const prisma = prismaProxy

// Helper to verify connection
export async function verifyConnection() {
  try {
    await withRetry(
      () => prismaGlobal.$queryRaw`SELECT 1`,
      'connection verification'
    )
    return true
  } catch (error) {
    console.error('❌ Prisma connection verification failed:', error.message)
    isConnected = false
    connectionPromise = null
    return false
  }
}

