import { ALL_MENU_ITEMS, type MenuItem } from '../navigation/menuItems'
import type { User } from '../types'

const ADMIN_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'system_admin'
])

function isAdmin(user: User | null | undefined) {
  const role = String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '')
  return ADMIN_ROLES.has(role) || role.includes('admin')
}

/** Role-based menu filter (mobile has no PermissionChecker — admins see all). */
export function getVisibleMenuItems(user: User | null | undefined): MenuItem[] {
  const role = String(user?.role || '').toLowerCase()

  if (role === 'guest') {
    return ALL_MENU_ITEMS.filter((item) => ['projects', 'my-tasks', 'my-notes'].includes(item.id))
  }

  if (isAdmin(user)) {
    return ALL_MENU_ITEMS
  }

  return ALL_MENU_ITEMS.filter((item) => {
    if (item.id === 'users') return false
    return true
  })
}
