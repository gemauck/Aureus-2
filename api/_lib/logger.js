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
      logger.error({ 
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
      }, 'error')
      
      // If response hasn't been sent, try to send an error response
      if (!res.headersSent && !res.writableEnded) {
        try {
          res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? e.message : 'An error occurred processing your request',
            requestId: id,
            timestamp: new Date().toISOString()
          })
        } catch (sendError) {
          // If we can't send the error response, log it
          logger.error({ id, sendError: sendError.message }, 'failed to send error response')
        }
      }
      
      // Re-throw to be caught by outer handlers (but only if response wasn't sent)
      if (!res.headersSent && !res.writableEnded) {
        throw e
      }
    }
  }
}

