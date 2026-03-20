/** Same elevated roles as MainLayout / PermissionChecker — treat as leave "admin" for data and actions. */
const LEAVE_PLATFORM_ADMIN_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'system_admin'
])

export function isLeavePlatformAdminRole(role) {
  if (!role || typeof role !== 'string') return false
  return LEAVE_PLATFORM_ADMIN_ROLES.has(role.toLowerCase())
}
