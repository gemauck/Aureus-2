import { verifyToken } from './jwt.js'

// Optional auth - allows requests without token, but sets req.user if valid token is provided
export function optionalAuth(handler) {
  return async function(req, res) {
    try {
      const auth = req.headers['authorization'] || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      
      if (token) {
        try {
          const payload = verifyToken(token)
          if (payload && payload.sub) {
            console.log('✅ Optional auth: Token verified for user:', payload.sub)
            req.user = payload
          } else {
            console.log('⚠️ Optional auth: Invalid token, proceeding without auth')
            req.user = null
          }
        } catch (error) {
          console.log('⚠️ Optional auth: Token verification failed, proceeding without auth:', error.message)
          req.user = null
        }
      } else {
        console.log('ℹ️ Optional auth: No token provided, proceeding without auth')
        req.user = null
      }
      
      return handler(req, res)
    } catch (error) {
      console.error('❌ Optional auth error:', error)
      req.user = null
      return handler(req, res)
    }
  }
}

