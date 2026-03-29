/**
 * Leave & HR module access — keep in sync with src/utils/permissions.js (ACCESS_LEAVE_PLATFORM, MANAGE_HR_ADMIN).
 *
 * Matrix:
 * - canAccessLeaveModule: system admins OR explicit access_leave_platform OR legacy email parity with PermissionChecker
 * - isHrAdministrator: system admins OR manage_hr_admin (designated HR staff without full admin role)
 * - Elevated leave ops (approve, import, approver CRUD): isHrAdministrator (covers admins + manage_hr_admin)
 */
import { isLeavePlatformAdminRole } from './leavePlatformRoles.js'
import { badRequest, forbidden } from './response.js'

export const PERMISSION_ACCESS_LEAVE_PLATFORM = 'access_leave_platform'
export const PERMISSION_MANAGE_HR_ADMIN = 'manage_hr_admin'

/** Legacy allowlist — matches PermissionChecker for ACCESS_LEAVE_PLATFORM */
const LEGACY_LEAVE_MODULE_EMAIL = 'garethm@abcotronics.co.za'

export function parseDbUserPermissions(permissionsField) {
  if (!permissionsField) return []
  try {
    const p = typeof permissionsField === 'string' ? JSON.parse(permissionsField) : permissionsField
    if (!Array.isArray(p)) return []
    return p.map((x) => String(x).trim().toLowerCase())
  } catch {
    return []
  }
}

export function userHasPermission(permArray, key) {
  const k = String(key).trim().toLowerCase()
  if (permArray.includes('all')) return true
  return permArray.includes(k)
}

export function canAccessLeaveModule(dbUser) {
  if (!dbUser) return false
  if (isLeavePlatformAdminRole(dbUser.role)) return true
  const email = (dbUser.email || '').toLowerCase()
  if (email === LEGACY_LEAVE_MODULE_EMAIL) return true
  const perms = parseDbUserPermissions(dbUser.permissions)
  if (userHasPermission(perms, PERMISSION_ACCESS_LEAVE_PLATFORM)) return true
  if (userHasPermission(perms, PERMISSION_MANAGE_HR_ADMIN)) return true
  return false
}

/** Superadmins/admins OR users granted manage_hr_admin */
export function isHrAdministrator(dbUser) {
  if (!dbUser) return false
  if (isLeavePlatformAdminRole(dbUser.role)) return true
  const perms = parseDbUserPermissions(dbUser.permissions)
  return userHasPermission(perms, PERMISSION_MANAGE_HR_ADMIN)
}

/**
 * Fetch DB user and require Leave & HR module access. Sends response on failure; returns user or null.
 */
export async function requireLeaveModuleAccess(prisma, req, res) {
  const id = req.user?.sub || req.user?.id
  if (!id) {
    badRequest(res, 'User not authenticated')
    return null
  }
  const dbUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, permissions: true, name: true }
  })
  if (!dbUser) {
    badRequest(res, 'User not found')
    return null
  }
  if (!canAccessLeaveModule(dbUser)) {
    forbidden(res, 'Leave & HR module access denied')
    return null
  }
  return dbUser
}
