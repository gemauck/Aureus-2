/**
 * Server-side AuditLog writes for manufacturing-related APIs.
 * Shape matches api/audit-logs.js POST so Reports Audit Trail renders correctly.
 * Failures are non-fatal.
 *
 * Maintenance: Any new POST/PATCH/DELETE in api/manufacturing.js should call the local
 * auditManufacturing() helper before success responses. Sales/purchase order mutations
 * in api/sales-orders.js and api/purchase-orders.js should call logAuditFromRequest here
 * with entity `sales_orders` or `purchase_orders`. See root .cursorrules ("Manufacturing audit trail").
 */

export function getClientIpFromRequest(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) {
    return fwd.split(',')[0].trim() || 'N/A'
  }
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'N/A'
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} req - Express request (req.user from authRequired)
 * @param {object} opts
 * @param {string} opts.action - e.g. create, update, delete, sync, consume, purge
 * @param {string} opts.entity - Audit Trail "module" (entity column), e.g. manufacturing, sales_orders
 * @param {string} [opts.entityId] - Primary id or descriptive id
 * @param {object} [opts.details] - Stored in diff.details (resource, summary, changes, path, method, etc.)
 * @returns {Promise<object|null>}
 */
export async function logAuditFromRequest(prisma, req, opts) {
  const { action, entity, entityId, details = {} } = opts || {}
  if (!action || !entity) {
    console.warn('⚠️ logAuditFromRequest: missing action or entity')
    return null
  }

  const userId = req.user?.sub || req.user?.id
  if (!userId) {
    console.warn('⚠️ logAuditFromRequest: no authenticated user, skipping')
    return null
  }

  let actorName = req.user?.name || req.user?.email || 'User'
  let actorRole = req.user?.role || 'user'
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { name: true, email: true, role: true }
    })
    if (dbUser) {
      actorName = dbUser.name || dbUser.email || actorName
      actorRole = dbUser.role || actorRole
    }
  } catch {
    // non-fatal
  }

  const eid = entityId != null && entityId !== '' ? String(entityId) : String(entity)

  try {
    const log = await prisma.auditLog.create({
      data: {
        actorId: String(userId),
        action: String(action),
        entity: String(entity),
        entityId: eid,
        diff: JSON.stringify({
          user: actorName,
          userId: String(userId),
          userRole: actorRole,
          details: typeof details === 'object' && details !== null ? details : {},
          ipAddress: getClientIpFromRequest(req),
          sessionId: 'N/A',
          success: true
        })
      }
    })
    return log
  } catch (err) {
    console.error('❌ logAuditFromRequest failed (non-fatal):', err?.message || err)
    return null
  }
}
