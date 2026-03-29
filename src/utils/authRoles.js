/**
 * Role checks aligned with api/_lib/authRoles.js — keep both files in sync.
 * Exposed on window for components loaded without ES module imports.
 */

const ADMIN_ROLE_SET = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'super_administrator',
  'super_user',
  'system_admin',
])

/** Super-admin tier only (excludes plain admin) — e.g. audit trail tab. */
const SUPER_ADMIN_TIER_SET = new Set([
  'superadmin',
  'super-admin',
  'super_admin',
  'super_administrator',
  'system_admin',
])

function normalizeRole(role) {
  if (!role) return ''
  return String(role).trim().toLowerCase().replace(/\s+/g, '_')
}

export function isAdminRole(role) {
  return ADMIN_ROLE_SET.has(normalizeRole(role))
}

export function isSuperAdminRole(role) {
  return SUPER_ADMIN_TIER_SET.has(normalizeRole(role))
}

/** Matches api/_lib/hrAccess.js isHrAdministrator — admins or manage_hr_admin permission */
export function isHrAdministratorUser(user) {
  if (!user) return false
  if (isAdminRole(user.role)) return true
  let perms = []
  try {
    if (typeof user.permissions === 'string') {
      perms = JSON.parse(user.permissions || '[]')
    } else if (Array.isArray(user.permissions)) {
      perms = user.permissions
    }
  } catch (_) {
    perms = []
  }
  if (!Array.isArray(perms)) perms = []
  const lower = perms.map((p) => String(p).trim().toLowerCase())
  if (lower.includes('all')) return true
  return lower.includes('manage_hr_admin')
}

if (typeof window !== 'undefined') {
  window.isAdminRole = isAdminRole
  window.isSuperAdminRole = isSuperAdminRole
  window.isHrAdministratorUser = isHrAdministratorUser
}
