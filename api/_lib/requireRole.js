import { forbidden } from './response.js'

export function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  return function(handler) {
    return async function(req, res) {
      const role = req.user?.role
      if (!role || !allowed.includes(role)) return forbidden(res)
      return handler(req, res)
    }
  }
}

