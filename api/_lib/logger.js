import pino from 'pino'

export const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization'] })

export function withLogging(handler) {
  return async function(req, res) {
    const start = Date.now()
    const id = Math.random().toString(36).slice(2)
    req.id = id
    res.setHeader('X-Request-Id', id)
    try {
      const result = handler(req, res)
      // Await if it's a promise
      if (result && typeof result.then === 'function') {
        await result
      }
      // Only log success if response was sent
      if (res.headersSent || res.writableEnded) {
        logger.info({ id, method: req.method, url: req.url, ms: Date.now() - start }, 'ok')
      } else {
        logger.warn({ id, method: req.method, url: req.url, ms: Date.now() - start }, 'handler did not send response')
      }
    } catch (e) {
      // Enhanced error logging with more details
      const errorDetails = {
        id, 
        method: req.method, 
        url: req.url, 
        ms: Date.now() - start, 
        err: {
          message: e.message,
          name: e.name,
          code: e.code,
          stack: e.stack
        },
        headersSent: res.headersSent,
        writableEnded: res.writableEnded
      }
      
      // Add database-specific error details if available
      if (e.meta) {
        errorDetails.err.meta = e.meta
      }
      
      // Check for database connection errors
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                        e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                        e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN' ||
                        e.name === 'PrismaClientInitializationError' ||
                        e.message?.includes("Can't reach database server") ||
                        e.message?.includes("Can't reach database")
      
      if (isDbError) {
        errorDetails.err.type = 'DATABASE_CONNECTION_ERROR'
        console.error('🔌 Database connection error detected:', {
          code: e.code,
          name: e.name,
          message: e.message,
          url: req.url
        })
      }
      
      logger.error(errorDetails, 'error')
      
      // Also log to console for immediate visibility
      console.error('❌ API Error:', {
        method: req.method,
        url: req.url,
        error: e.message,
        code: e.code,
        name: e.name,
        isDbError
      })
      
      // If response hasn't been sent, try to send an error response
      if (!res.headersSent && !res.writableEnded) {
        try {
          const errorResponse = {
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? e.message : 'An error occurred processing your request',
            requestId: id,
            timestamp: new Date().toISOString()
          }
          
          // Include error code in development
          if (process.env.NODE_ENV === 'development' && e.code) {
            errorResponse.errorCode = e.code
          }
          
          // If it's a database connection error, provide a more helpful message
          if (isDbError) {
            errorResponse.error = 'DATABASE_CONNECTION_ERROR'
            errorResponse.message = 'Database connection failed. The database server is unreachable.'
          }
          
          res.status(500).json(errorResponse)
        } catch (sendError) {
          // If we can't send the error response, log it
          logger.error({ id, sendError: sendError.message }, 'failed to send error response')
          console.error('❌ Failed to send error response:', sendError.message)
        }
      }
      
      // Re-throw to be caught by outer handlers (but only if response wasn't sent)
      if (!res.headersSent && !res.writableEnded) {
        throw e
      }
    }
  }
}

