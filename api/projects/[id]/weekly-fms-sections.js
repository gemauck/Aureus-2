/**
 * PUT /api/projects/:id/weekly-fms-sections
 * Updates only the Project.weeklyFMSReviewSections column.
 * Used by Weekly FMS Review tracker so section add/delete/edit persists after refresh.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'

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

  try {
    const project = await prisma.project.update({
      where: { id },
      data: { weeklyFMSReviewSections: payload }
    })
    console.log('[weekly-fms-sections] Updated project', id, 'sections length', payload.length)
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
