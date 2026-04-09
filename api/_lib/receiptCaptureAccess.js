import { prisma } from './prisma.js'

const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'])
const ADMIN_PERMISSION_KEYS = new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'])

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
        .map((v) => v.trim())
        .filter(Boolean)
    }
  }
  return []
}

/**
 * Resolve DB user for role/permissions (JWT may omit permissions).
 */
export async function getUserForReceiptCapture(req) {
  if (!req.user?.sub) return null
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, role: true, permissions: true, name: true }
    })
    if (dbUser) return dbUser
  } catch (e) {
    console.warn('receiptCaptureAccess: user fetch failed', e?.message)
  }
  return {
    id: req.user.sub,
    email: req.user.email,
    role: req.user.role,
    permissions: req.user.permissions,
    name: req.user.name
  }
}

export function isReceiptCaptureAdmin(user) {
  if (!user) return false
  try {
    const role = (user.role || '').toString().trim().toLowerCase()
    if (ADMIN_ROLES.has(role)) return true
    const normalized = normalizePermissions(user.permissions).map((p) =>
      (p || '').toString().trim().toLowerCase()
    )
    return normalized.some((p) => ADMIN_PERMISSION_KEYS.has(p))
  } catch {
    return false
  }
}
