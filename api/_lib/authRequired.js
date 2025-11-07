import { verifyToken } from './jwt.js'
import { unauthorized } from './response.js'

export function authRequired(handler) {
  return async function(req, res) {
    try {
      const auth = req.headers['authorization'] || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      if (!token) {
        console.log('❌ No token provided')
        // Ensure response hasn't been sent before attempting to send
        if (!res.headersSent && !res.writableEnded) {
          return unauthorized(res)
        }
        return
      }
      
      console.log('🔍 Verifying token:', token.substring(0, 20) + '...')
      const payload = verifyToken(token)
      
      if (!payload || !payload.sub) {
        console.log('❌ Invalid or expired token')
        // Ensure response hasn't been sent before attempting to send
        if (!res.headersSent && !res.writableEnded) {
          return unauthorized(res)
        }
        return
      }
      
      console.log('✅ Token verified for user:', payload.sub)
      req.user = payload
      
      // Await the handler to properly catch async errors
      try {
        const result = handler(req, res)
        if (result && typeof result.then === 'function') {
          return await result
        }
        return result
      } catch (handlerError) {
        // If handler throws an error and response hasn't been sent, handle it
        if (!res.headersSent && !res.writableEnded) {
          console.error('❌ Handler error in authRequired:', handlerError)
          // Re-throw to be caught by outer error handler
          throw handlerError
        }
        // If response already sent, just log the error
        console.error('❌ Handler error after response sent:', handlerError)
        throw handlerError
      }
    } catch (e) {
      console.error('❌ Token verification failed:', e.message)
      console.error('❌ Auth middleware error stack:', e.stack)
      // Only send unauthorized if response hasn't been sent
      if (!res.headersSent && !res.writableEnded) {
        return unauthorized(res)
      }
      // If response already sent, re-throw to be caught by outer handler
      throw e
    }
  }
}

