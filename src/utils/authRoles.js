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

if (typeof window !== 'undefined') {
  window.isAdminRole = isAdminRole
  window.isSuperAdminRole = isSuperAdminRole
}
