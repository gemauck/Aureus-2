import { PermissionChecker, PERMISSIONS } from '../../../src/utils/permissions.js'
import type { User } from '../types'

export { PERMISSIONS, PermissionChecker }

export function createPermissionChecker(user: User | null | undefined) {
  return new PermissionChecker(user)
}

export function hasPermission(user: User | null | undefined, permission: string) {
  return new PermissionChecker(user).hasPermission(permission)
}

/** Map menu item keys (`ACCESS_CRM`) to stored permission values (`access_crm`). */
export function resolveMenuPermission(key: string | null | undefined): string | null {
  if (!key) return null
  const mapped = PERMISSIONS[key as keyof typeof PERMISSIONS]
  return mapped || key
}

export function canAccessMenuPermission(user: User | null | undefined, permissionKey: string | null | undefined) {
  const resolved = resolveMenuPermission(permissionKey)
  if (!resolved) return true
  return hasPermission(user, resolved)
}
