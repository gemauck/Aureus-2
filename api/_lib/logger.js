import pino from 'pino'

export const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization'] })

export function withLogging(handler) {
  return async function(req, res) {
    const start = Date.now()
    const id = Math.random().toString(36).slice(2)
    req.id = id
    res.setHeader('X-Request-Id', id)
    try {
      await handler(req, res)
      logger.info({ id, method: req.method, url: req.url, ms: Date.now() - start }, 'ok')
    } catch (e) {
      logger.error({ id, method: req.method, url: req.url, ms: Date.now() - start, err: e }, 'error')
      throw e
    }
  }
}

