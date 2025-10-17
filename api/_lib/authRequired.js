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
      console.log('✅ Token verified for user:', payload.sub)
      req.user = payload
      return handler(req, res)
    } catch (e) {
      console.error('❌ Token verification failed:', e.message)
      return unauthorized(res)
    }
  }
}

