const ADMIN_ROLE_SET = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'super_administrator',
  'super_user',
  'system_admin'
])

export function normalizeRole(role) {
  if (!role) return ''
  return String(role).trim().toLowerCase().replace(/\s+/g, '_')
}

export function isAdminRole(role) {
  return ADMIN_ROLE_SET.has(normalizeRole(role))
}

