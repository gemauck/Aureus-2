import { verifyToken } from './jwt.js'
import { unauthorized } from './response.js'

export function authRequired(handler) {
  return async function(req, res) {
    try {
      const auth = req.headers['authorization'] || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      if (!token) {
        console.log('❌ No token provided')
        return unauthorized(res)
      }
      
      console.log('🔍 Verifying token:', token.substring(0, 20) + '...')
      const payload = verifyToken(token)
      
      if (!payload || !payload.sub) {
        console.log('❌ Invalid or expired token')
        return unauthorized(res)
      }
      
      console.log('✅ Token verified for user:', payload.sub)
      req.user = payload
      
      // Await the handler to properly catch async errors
      const result = handler(req, res)
      if (result && typeof result.then === 'function') {
        return await result
      }
      return result
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

