// Helper function for consistent database error handling across API endpoints

/**
 * Checks if an error is a database connection error
 */
export function isConnectionError(error) {
  if (!error) return false
  
  const message = error.message?.toLowerCase() || ''
  const code = error.code || ''
  
  return (
    message.includes("can't reach database server") ||
    message.includes("connection") && (message.includes("refused") || message.includes("timeout")) ||
    code === 'P1001' || // Prisma connection error
    code === 'P1002' || // Prisma timeout error
    code === 'P1008' || // Prisma operations timeout
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND'
  )
}

/**
 * Logs database errors with detailed information
 */
export function logDatabaseError(error, operation) {
  const isConnError = isConnectionError(error)
  
  console.error(`❌ Database error in ${operation}:`, {
    message: error.message,
    code: error.code,
    name: error.name,
    meta: error.meta,
    stack: error.stack?.substring(0, 500)
  })
  
  if (isConnError) {
    console.error('🔌 Database connection issue detected - server may be unreachable')
    console.error('   Check:')
    console.error('   1. Database server is running')
    console.error('   2. Network connectivity')
    console.error('   3. Firewall/security group settings')
    console.error('   4. DATABASE_URL is correct')
  }
  
  return isConnError
}

/**
 * Gets a user-friendly error message for database errors
 */
export function getDatabaseErrorMessage(error, defaultMessage) {
  if (isConnectionError(error)) {
    return 'Database connection failed. The database server is unreachable.'
  }
  return error.message || defaultMessage || 'Database operation failed'
}

