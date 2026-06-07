import type { User } from '../types'
import { ROLE_DEFINITIONS } from './constants'
import type { ErpUserRecord, UserInvitation } from './types'

const ADMIN_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'system_admin'
])

const SUPER_ADMIN_ROLES = new Set(['superadmin', 'super-admin', 'super_admin'])

export function isAdminUser(user: User | null | undefined) {
  const role = String(user?.role || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  return ADMIN_ROLES.has(role) || role.includes('admin')
}

export function isSuperAdminUser(user: User | null | undefined) {
  const role = String(user?.role || '').toLowerCase()
  return SUPER_ADMIN_ROLES.has(role)
}

export function isAdminRole(role: string | undefined) {
  const normalized = String(role || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  return ADMIN_ROLES.has(normalized) || normalized.includes('admin')
}

export function roleDefinitionsForActor(actor: User | null | undefined) {
  if (isSuperAdminUser(actor)) return ROLE_DEFINITIONS
  const { superadmin: _removed, ...rest } = ROLE_DEFINITIONS
  return rest
}

export function normalizeStatus(status?: string) {
  const s = String(status || 'active').toLowerCase()
  return s === 'inactive' ? 'Inactive' : 'Active'
}

export function statusForApi(displayStatus: string) {
  return displayStatus.toLowerCase() === 'inactive' ? 'inactive' : 'active'
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

export function normalizeUser(raw: Record<string, unknown>): ErpUserRecord {
  return {
    id: String(raw.id),
    email: String(raw.email || ''),
    name: String(raw.name || raw.email || ''),
    role: raw.role ? String(raw.role) : undefined,
    status: normalizeStatus(raw.status as string | undefined),
    department: raw.department ? String(raw.department) : undefined,
    phone: raw.phone ? String(raw.phone) : undefined,
    permissions: parseStringArray(raw.permissions),
    accessibleProjectIds: parseStringArray(raw.accessibleProjectIds),
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
    lastLoginAt: raw.lastLoginAt ? String(raw.lastLoginAt) : undefined,
    lastSeenAt: raw.lastSeenAt ? String(raw.lastSeenAt) : undefined
  }
}

export function normalizeInvitation(raw: Record<string, unknown>): UserInvitation {
  return {
    id: String(raw.id),
    email: String(raw.email || ''),
    name: raw.name ? String(raw.name) : undefined,
    role: raw.role ? String(raw.role) : undefined,
    department: raw.department ? String(raw.department) : undefined,
    status: raw.status ? String(raw.status) : undefined,
    expiresAt: raw.expiresAt ? String(raw.expiresAt) : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
    accessibleProjectIds: parseStringArray(raw.accessibleProjectIds)
  }
}

export function roleLabel(role?: string) {
  if (!role) return 'User'
  const key = role.toLowerCase() as keyof typeof ROLE_DEFINITIONS
  return ROLE_DEFINITIONS[key]?.name || role
}

export function roleColor(role?: string) {
  if (!role) return '#6b7280'
  const key = role.toLowerCase() as keyof typeof ROLE_DEFINITIONS
  return ROLE_DEFINITIONS[key]?.color || '#6b7280'
}

export function isUserOnline(user: ErpUserRecord) {
  if (!user.lastSeenAt) return false
  const lastSeen = new Date(user.lastSeenAt).getTime()
  const now = Date.now()
  return (now - lastSeen) / (1000 * 60) <= 5
}

export function formatLastSeen(user: ErpUserRecord) {
  if (!user.lastSeenAt) return 'Never'
  if (isUserOnline(user)) return 'Online'

  const lastSeen = new Date(user.lastSeenAt)
  const diffMs = Date.now() - lastSeen.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return lastSeen.toLocaleDateString()
}

export function sortUsers(
  users: ErpUserRecord[],
  column: 'name' | 'email' | 'role' | 'department' | 'status' | 'lastSeen',
  direction: 'asc' | 'desc'
) {
  const sorted = [...users].sort((a, b) => {
    let aValue: string | number
    let bValue: string | number

    switch (column) {
      case 'email':
        aValue = (a.email || '').toLowerCase()
        bValue = (b.email || '').toLowerCase()
        break
      case 'role':
        aValue = (a.role || '').toLowerCase()
        bValue = (b.role || '').toLowerCase()
        break
      case 'department':
        aValue = (a.department || '').toLowerCase()
        bValue = (b.department || '').toLowerCase()
        break
      case 'status':
        aValue = (a.status || '').toLowerCase()
        bValue = (b.status || '').toLowerCase()
        break
      case 'lastSeen':
        aValue = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0
        bValue = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0
        break
      default:
        aValue = (a.name || '').toLowerCase()
        bValue = (b.name || '').toLowerCase()
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return direction === 'asc' ? aValue - bValue : bValue - aValue
    }
    const cmp = String(aValue).localeCompare(String(bValue))
    return direction === 'asc' ? cmp : -cmp
  })
  return sorted
}
