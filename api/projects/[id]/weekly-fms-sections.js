/**
 * PUT /api/projects/:id/weekly-fms-sections
 * Updates only the Project.weeklyFMSReviewSections column.
 * Used by Weekly FMS Review tracker so section add/delete/edit persists after refresh.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { logProjectActivity, getActivityUserFromRequest } from '../../_lib/projectActivityLog.js'
import { buildWeeklyFMSStatusMap } from '../../projects.js'

async function handler(req, res) {
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    return badRequest(res, 'Method not allowed')
  }
  const id = req.params?.id
  if (!id) {
    return badRequest(res, 'Project ID required')
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  if (!body || typeof body !== 'object') {
    body = await parseJsonBody(req)
  }
  body = body || {}

  const raw =
    body.weeklyFMSReviewSections !== undefined
      ? body.weeklyFMSReviewSections
      : body.sections
  const payload =
    typeof raw === 'string'
      ? (raw.trim() || '{}')
      : JSON.stringify(raw != null && typeof raw === 'object' ? raw : {})

  let sectionCount = 0
  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const year of Object.keys(parsed)) {
        const arr = parsed[year]
        sectionCount += Array.isArray(arr) ? arr.length : 0
      }
    }
  } catch (_) {}
  console.log('[weekly-fms-sections] PUT', id, 'payload length', payload.length, 'section count', sectionCount)

  try {
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { weeklyFMSReviewSections: true }
    })
    if (existing) {
      try {
        const oldJson = existing.weeklyFMSReviewSections
        const oldParsed = (typeof oldJson === 'string' && oldJson) ? JSON.parse(oldJson) : (oldJson && typeof oldJson === 'object' ? oldJson : {})
        const newParsed = typeof payload === 'string' ? JSON.parse(payload) : payload
        const oldMap = buildWeeklyFMSStatusMap(oldParsed)
        const newMap = buildWeeklyFMSStatusMap(newParsed)
        const { userId: activityUserId, userName: activityUserName } = getActivityUserFromRequest(req)
        for (const [entryKey, newEntry] of newMap) {
          const oldEntry = oldMap.get(entryKey)
          const oldStatus = oldEntry ? oldEntry.status : null
          if (oldStatus !== newEntry.status) {
            await logProjectActivity(prisma, {
              projectId: id,
              userId: activityUserId,
              userName: activityUserName,
              type: 'weekly_fms_status_change',
              description: `Weekly FMS "${newEntry.docName}" (${newEntry.statusKey}): ${oldStatus || 'pending'} → ${newEntry.status}`,
              metadata: { entityType: 'weekly_fms', entityId: newEntry.docId, documentName: newEntry.docName, year: newEntry.year, statusKey: newEntry.statusKey, oldValue: oldStatus, newValue: newEntry.status }
            })
          }
        }
      } catch (logErr) {
        console.warn('[weekly-fms-sections] Activity log diff failed (non-fatal):', logErr?.message)
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: { weeklyFMSReviewSections: payload }
    })
    return ok(res, { project: { id: project.id, weeklyFMSReviewSections: payload } })
  } catch (e) {
    if (e.code === 'P2025') {
      return notFound(res, 'Project not found')
    }
    console.error('PUT weekly-fms-sections failed:', e.message)
    return serverError(res, e.message || 'Update failed')
  }
}

export default authRequired(handler)
