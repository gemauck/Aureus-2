import { PrismaClient } from '@prisma/client'

let prismaGlobal = null
let initializationError = null

// Lazy initialization function - only called when Prisma is first accessed
// This allows handlers to load even if Prisma initialization would fail
function initializePrisma() {
  // If already initialized, return the existing client
  if (prismaGlobal) {
    return prismaGlobal
  }
  
  // If there was a previous initialization error, throw it
  if (initializationError) {
    throw initializationError
  }
  
  try {
    // Force recreate Prisma client to avoid stale connections
    if (global.__prisma) {
      try {
        // Disconnect synchronously (fire and forget)
        global.__prisma.$disconnect().catch(() => {})
      } catch (e) {
        // Ignore disconnect errors
      }
      delete global.__prisma
    }
    
    if (!process.env.DATABASE_URL) {
      const error = new Error('DATABASE_URL environment variable is required')
      console.error('❌ DATABASE_URL is not set')
      initializationError = error
      throw error
    }
    
    // Log the DATABASE_URL immediately for debugging
    const dbUrlForLog = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@')
    
    // Prohibit local database connections
    const dbUrl = process.env.DATABASE_URL.toLowerCase()
    const isLocalDatabase = 
      dbUrl.includes('localhost') ||
      dbUrl.includes('127.0.0.1') ||
      dbUrl.includes('::1') ||
      dbUrl.includes('0.0.0.0') ||
      (dbUrl.startsWith('postgresql://') && !dbUrl.includes('ondigitalocean.com'))
    
    if (isLocalDatabase) {
      const error = new Error('Local database connections are prohibited. Use the Digital Ocean production database.')
      console.error('❌ SECURITY ERROR: Local database connections are prohibited!')
      console.error('   Detected DATABASE_URL:', process.env.DATABASE_URL.substring(0, 100) + '...')
      console.error('   This application must connect to the Digital Ocean production database.')
      initializationError = error
      throw error
    }
    
    // Force use of process.env.DATABASE_URL - ensure it's the correct one
    let databaseUrl = process.env.DATABASE_URL
    
    // Remove quotes if present
    if (databaseUrl && (databaseUrl.startsWith('"') || databaseUrl.startsWith("'"))) {
      databaseUrl = databaseUrl.slice(1, -1)
    }
    
    // Add connection_limit to prevent connection pool exhaustion
    // Parse existing query params and add/update connection_limit
    try {
      const url = new URL(databaseUrl)
      url.searchParams.set('connection_limit', '3') // Limit to 3 connections max (very conservative)
      url.searchParams.set('pool_timeout', '10') // 10 second timeout
      databaseUrl = url.toString()
    } catch (e) {
      // If URL parsing fails, append connection_limit manually
      const separator = databaseUrl.includes('?') ? '&' : '?'
      databaseUrl = `${databaseUrl}${separator}connection_limit=3&pool_timeout=10`
    }
    
    // Check for valid database hostname (allow multiple valid hostnames)
    const validHostnames = [
      'nov-3-backup5-do-user-28031752-0',
      'dbaas-db-6934625-do-user-28031752-0',
      'ondigitalocean.com'
    ]
    
    const hasValidHostname = validHostnames.some(hostname => databaseUrl && databaseUrl.includes(hostname))
    
    if (!databaseUrl || !hasValidHostname) {
      console.error('❌ ERROR: DATABASE_URL does not contain valid hostname!')
      console.error('   Current DATABASE_URL:', databaseUrl ? databaseUrl.replace(/:([^:@]+)@/, ':***@') : 'NOT SET')
      console.error('   Expected hostnames:', validHostnames.join(', '))
      console.error('   Full DATABASE_URL (masked):', databaseUrl ? databaseUrl.replace(/:([^:@]+)@/, ':***@') : 'NOT SET')
      // In production, still throw error but with better message
      // In development, allow connection to proceed with warning
      if (process.env.NODE_ENV === 'production') {
        const error = new Error(`DATABASE_URL must contain one of these hostnames: ${validHostnames.join(', ')}`)
        initializationError = error
        throw error
      } else {
        console.warn('⚠️ WARNING: DATABASE_URL hostname check failed, but allowing connection in development mode')
      }
    }
    
    global.__prisma = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: databaseUrl  // Use explicit variable
        }
      },
      // Reduce connection pool to prevent connection exhaustion
      __internal: {
        engine: {
          connectTimeout: 10000,
          poolTimeout: 10
        }
      }
    })
    
    prismaGlobal = global.__prisma
    return prismaGlobal
  } catch (error) {
    console.error('❌ Failed to create Prisma client:', error)
    initializationError = error
    throw error
  }
}

// Don't initialize during module load - let it happen lazily on first access
// This ensures the module always exports successfully, even if Prisma initialization would fail
// Initialization will happen when Prisma is first accessed via the proxy

// Connection state tracking
let connectionAttempted = false
let isConnected = false
let connectionPromise = null

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

// Ensure connection with retry logic
async function ensureConnected() {
  // Ensure Prisma is initialized first
  if (!prismaGlobal) {
    try {
      initializePrisma()
    } catch (error) {
      throw initializationError || error
    }
  }
  
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

// Attempt initial connection (non-blocking) - only if Prisma is initialized
if (prismaGlobal) {
  ensureConnected().catch((error) => {
    console.error('❌ Prisma initial connection attempt failed:', error.message)
    // Connection will be retried on first query
  })
}

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
// This proxy handles lazy initialization - Prisma is only initialized when first accessed
const prismaProxy = new Proxy({}, {
  get(target, prop) {
    // Ensure Prisma is initialized before accessing
    if (!prismaGlobal) {
      try {
        initializePrisma()
      } catch (error) {
        // If initialization failed, throw the stored error
        throw initializationError || error
      }
    }
    
    const value = prismaGlobal[prop]
    
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

