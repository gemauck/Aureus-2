/**
 * Shared security guards for API routes (legacy blocks, cron secrets, public field access, admin checks).
 */
import { unauthorized } from './response.js'

const ADMIN_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'system_admin'
])

const SUPERADMIN_ROLES = new Set(['superadmin', 'super-admin', 'super_admin'])

/** Field job card / mobile reference-data client marker (not a secret; blocks casual scraping). */
export const PUBLIC_FIELD_CLIENT_HEADER = 'x-abcotronics-client'
export const PUBLIC_FIELD_CLIENT_VALUE = 'field-app-v1'

export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production'
}

export function isAdminOrManageUsers(user) {
  if (!user) return false
  const role = String(user.role || '').trim().toLowerCase()
  if (ADMIN_ROLES.has(role)) return true
  const perms = user.permissions
  return Array.isArray(perms) && perms.includes('manage_users')
}

export function isSuperAdminRole(role) {
  return SUPERADMIN_ROLES.has(String(role || '').trim().toLowerCase())
}

/** Block one-off migration / bootstrap routes in production unless explicitly enabled. */
export function blockLegacyMigrationEndpoint(res, label = 'endpoint') {
  if (process.env.ALLOW_LEGACY_MIGRATION_ENDPOINTS === 'true') return false
  if (!isProductionRuntime()) return false
  res.status(404).json({ error: 'Not found' })
  return true
}

/** Cron / debug routes must fail closed in production when no secret is configured. */
export function requireCronSecret(req, res, { extraEnvKeys = [] } = {}) {
  const secrets = [
    process.env.CRON_SECRET,
    process.env.RESEND_WEBHOOK_SECRET,
    ...extraEnvKeys.map((key) => process.env[key])
  ]
    .map((s) => (s && String(s).trim()) || '')
    .filter(Boolean)

  if (!secrets.length) {
    if (isProductionRuntime()) {
      res.status(503).json({ error: 'Cron secret not configured' })
      return false
    }
    return true
  }

  const provided =
    (req.query && req.query.secret) ||
    (req.headers && (req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')))
  if (!secrets.includes(provided)) {
    res.status(400).json({ error: 'Invalid or missing cron secret' })
    return false
  }
  return true
}

function normalizeHost(value) {
  if (!value || typeof value !== 'string') return ''
  try {
    const withProto = value.includes('://') ? value : `https://${value}`
    return new URL(withProto).hostname.toLowerCase()
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase()
  }
}

function trustedAppHosts() {
  const hosts = new Set(['localhost', '127.0.0.1', 'abcoafrica.co.za', 'www.abcoafrica.co.za'])
  const extra = String(process.env.PUBLIC_FIELD_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => normalizeHost(h.trim()))
    .filter(Boolean)
  for (const h of extra) hosts.add(h)
  return hosts
}

function requestHostMatches(req) {
  const hosts = trustedAppHosts()
  const origin = req.headers?.origin
  const referer = req.headers?.referer
  for (const raw of [origin, referer]) {
    const host = normalizeHost(raw)
    if (host && hosts.has(host)) return true
  }
  return false
}

function bearerTokenPresent(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || ''
  return auth.startsWith('Bearer ') && auth.slice(7).trim().length > 0
}

/**
 * Gate reference-data public APIs used by field job cards (web + mobile).
 * Allows: Bearer auth, trusted Origin/Referer, field client header, optional PUBLIC_FIELD_API_KEY.
 */
export function assertPublicFieldAccess(req, res) {
  if (!isProductionRuntime()) return true
  if (process.env.PUBLIC_FIELD_OPEN === 'true') return true
  if (bearerTokenPresent(req)) return true
  if (requestHostMatches(req)) return true

  const clientMarker = String(req.headers?.[PUBLIC_FIELD_CLIENT_HEADER] || '').trim()
  if (clientMarker === PUBLIC_FIELD_CLIENT_VALUE) return true

  const configuredKey = String(process.env.PUBLIC_FIELD_API_KEY || '').trim()
  const providedKey = String(req.headers?.['x-public-field-key'] || '').trim()
  if (configuredKey && providedKey && providedKey === configuredKey) return true

  res.status(403).json({
    error: 'Forbidden',
    code: 'PUBLIC_FIELD_ACCESS_DENIED',
    message: 'This endpoint is restricted to authorized field applications.'
  })
  return false
}

export function requireAdminOrManageUsers(req, res) {
  if (!isAdminOrManageUsers(req.user)) {
    unauthorized(res, 'Permission required: manage_users')
    return false
  }
  return true
}

/** Resolve safe uploads subdirectory (no traversal). */
export function resolveSafeUploadDir(uploadRoot, folder) {
  const raw = String(folder || 'uploads').trim() || 'uploads'
  const segments = raw.split(/[/\\]+/).filter((s) => s && s !== '.' && s !== '..')
  const safeFolder = segments.length ? segments.join('/') : 'uploads'
  const targetDir = `${uploadRoot.replace(/[/\\]+$/, '')}/${safeFolder}`
  const resolvedRoot = uploadRoot.replace(/[/\\]+$/, '')
  if (!targetDir.startsWith(resolvedRoot)) {
    return null
  }
  return { targetDir, safeFolder }
}
