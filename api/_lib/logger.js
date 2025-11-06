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
      logger.info({ id, method: req.method, url: req.url, ms: Date.now() - start }, 'ok')
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
        }
      }, 'error')
      // Re-throw to be caught by outer handlers
      throw e
    }
  }
}

