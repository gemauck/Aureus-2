import { ALL_MENU_ITEMS, type MenuItem } from '../navigation/menuItems'
import type { User } from '../types'
import { canAccessMenuPermission } from './permissions'

const ADMIN_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'system_admin'
])

export function isAdmin(user: User | null | undefined) {
  const role = String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '')
  return ADMIN_ROLES.has(role) || role.includes('admin')
}

function isGuest(user: User | null | undefined) {
  return String(user?.role || '').toLowerCase() === 'guest'
}

/** Mirrors web PermissionChecker + guest role restrictions. */
export function getVisibleMenuItems(user: User | null | undefined): MenuItem[] {
  if (isGuest(user)) {
    return ALL_MENU_ITEMS.filter((item) => ['projects', 'my-tasks', 'my-notes'].includes(item.id))
  }

  return ALL_MENU_ITEMS.filter((item) => canAccessMenuPermission(user, item.permission))
}

export function canAccessMenuItem(user: User | null | undefined, item: MenuItem) {
  return getVisibleMenuItems(user).some((visible) => visible.id === item.id)
}
