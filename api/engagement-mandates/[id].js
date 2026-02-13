// Single engagement mandate API (get, put, delete)
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, notFound, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

function parseMandate(m) {
  const mandate = { ...m }
  if (typeof mandate.servicesRequired === 'string' && mandate.servicesRequired) {
    try {
      mandate.servicesRequired = JSON.parse(mandate.servicesRequired)
    } catch (_) {
      mandate.servicesRequired = []
    }
  } else if (!Array.isArray(mandate.servicesRequired)) {
    mandate.servicesRequired = []
  }
  if (typeof mandate.workflowStages === 'string' && mandate.workflowStages) {
    try {
      mandate.workflowStages = JSON.parse(mandate.workflowStages)
    } catch (_) {
      mandate.workflowStages = []
    }
  } else if (!Array.isArray(mandate.workflowStages)) {
    mandate.workflowStages = []
  }
  return mandate
}

async function handler(req, res) {
  try {
    const urlPath = (req.url || '').split('?')[0].split('#')[0]
    const pathSegments = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
    const id = req.params?.id || (pathSegments.length >= 2 && pathSegments[0] === 'engagement-mandates' ? pathSegments[1] : null)

    if (!id) {
      return badRequest(res, 'Mandate ID required')
    }

    if (req.method === 'GET') {
      const mandate = await prisma.engagementMandate.findUnique({
        where: { id }
      })
      if (!mandate) return notFound(res, 'Mandate not found')
      return ok(res, { mandate: parseMandate(mandate) })
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      const existing = await prisma.engagementMandate.findUnique({ where: { id } })
      if (!existing) return notFound(res, 'Mandate not found')

      const updateData = {}
      if (body.clientName !== undefined) updateData.clientName = String(body.clientName).trim()
      if (body.siteName !== undefined) updateData.siteName = String(body.siteName || '').trim()
      if (body.dateOfVisit !== undefined) updateData.dateOfVisit = body.dateOfVisit != null ? String(body.dateOfVisit) : ''
      if (body.typeOfOperation !== undefined) updateData.typeOfOperation = String(body.typeOfOperation || '').trim()
      if (body.siteLocation !== undefined) updateData.siteLocation = String(body.siteLocation || '').trim()
      if (body.servicesRequired !== undefined) {
        updateData.servicesRequired = Array.isArray(body.servicesRequired)
          ? JSON.stringify(body.servicesRequired)
          : (typeof body.servicesRequired === 'string' ? body.servicesRequired : '[]')
      }
      if (body.status !== undefined) {
        const s = String(body.status).toLowerCase()
        if (['draft', 'in_progress', 'won', 'lost'].includes(s)) updateData.status = s
      }
      if (body.clientId !== undefined) updateData.clientId = body.clientId ? String(body.clientId).trim() || null : null
      if (body.opportunityId !== undefined) updateData.opportunityId = body.opportunityId ? String(body.opportunityId).trim() || null : null
      if (body.workflowStages !== undefined) {
        updateData.workflowStages = Array.isArray(body.workflowStages)
          ? JSON.stringify(body.workflowStages)
          : (typeof body.workflowStages === 'string' ? body.workflowStages : '[]')
      }

      const mandate = await prisma.engagementMandate.update({
        where: { id },
        data: updateData
      })
      return ok(res, { mandate: parseMandate(mandate) })
    }

    if (req.method === 'DELETE') {
      const existing = await prisma.engagementMandate.findUnique({ where: { id } })
      if (!existing) return notFound(res, 'Mandate not found')
      await prisma.engagementMandate.delete({ where: { id } })
      return ok(res, { deleted: true })
    }

    return badRequest(res, 'Invalid method')
  } catch (e) {
    console.error('❌ Engagement mandate [id] handler error:', e)
    return serverError(res, 'Engagement mandate request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
