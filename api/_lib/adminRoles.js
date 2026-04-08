/** Shared admin / superadmin checks (aligned with api/teams.js). */

const SUPER_ADMIN_ROLES = new Set([
  'superadmin',
  'super-admin',
  'super_admin',
  'super_administrator',
  'system_admin'
])
const ADMIN_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'super_administrator',
  'system_admin'
])
const ADMIN_PERMISSION_KEYS = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'super_administrator',
  'system_admin'
])

function normalizePermissions(permissions) {
  if (!permissions) return []
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return permissions
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    }
  }
  return []
}

export function isSuperAdminUser(user) {
  if (!user) return false
  const role = (user.role || '').toString().trim().toLowerCase()
  if (SUPER_ADMIN_ROLES.has(role)) return true
  const permissions = normalizePermissions(user.permissions).map((p) => (p || '').toString().trim().toLowerCase())
  return permissions.some((p) => SUPER_ADMIN_ROLES.has(p))
}

export function isAdminUser(user) {
  if (!user) return false
  const role = (user.role || '').toString().trim().toLowerCase()
  if (ADMIN_ROLES.has(role)) return true
  const normalizedPermissions = normalizePermissions(user.permissions).map((permission) =>
    (permission || '').toString().trim().toLowerCase()
  )
  return normalizedPermissions.some((permission) => ADMIN_PERMISSION_KEYS.has(permission))
}
