import { prisma } from './prisma.js'

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('@prisma/client').PrismaClient} prismaClient
 */
export async function resolveIncidentActorName(req, prismaClient = prisma) {
  const userId = req.user?.sub || req.user?.id || null
  if (!userId) return String(req.user?.name || req.user?.email || '').trim()
  try {
    const user = await prismaClient.user.findUnique({
      where: { id: String(userId) },
      select: { name: true, email: true }
    })
    return String(user?.name || user?.email || req.user?.name || req.user?.email || '').trim()
  } catch {
    return String(req.user?.name || req.user?.email || '').trim()
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} incidentReportId
 * @param {string} action
 * @param {object} [metadata]
 */
export async function insertIncidentReportActivityFromRequest(req, incidentReportId, action, metadata = {}) {
  if (!incidentReportId || !action) return
  const actorUserId = req.user?.sub || req.user?.id || null
  const actorName = await resolveIncidentActorName(req)
  const source = String(req.headers?.['x-client-source'] || metadata.source || 'web').slice(0, 32)
  try {
    await prisma.incidentReportActivity.create({
      data: {
        incidentReportId,
        actorUserId: actorUserId ? String(actorUserId) : null,
        actorName,
        action: String(action).slice(0, 80),
        source,
        metadata: Object.keys(metadata).length ? metadata : undefined
      }
    })
  } catch (e) {
    console.warn('insertIncidentReportActivityFromRequest failed (non-fatal):', e?.message)
  }
}
