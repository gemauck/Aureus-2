// Engagement mandates API (list + create)
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

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

const DEFAULT_STAGES = [
  { name: 'Create Site Inspection Document', department: 'Business Development', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Conduct site visit / input to Site Inspection', department: 'Technical', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Comments on work loading requirements', department: 'Data', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Comments on time allocations', department: 'Support', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Relevant comments / compliance', department: 'Compliance', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Creates proposal from template', department: 'Business Development', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Reviews proposal against Site Inspection', department: 'Operations Manager', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Price proposal', department: 'Commercial', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Final Approval', department: 'CEO', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' }
]

async function handler(req, res) {
  try {
    const urlPath = (req.url || '').split('?')[0].split('#')[0]
    const segments = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
    // This file handles only /api/engagement-mandates (no id)
    if (segments.length !== 1 || segments[0] !== 'engagement-mandates') {
      return badRequest(res, 'Invalid path')
    }

    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200)
      const mandates = await prisma.engagementMandate.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit
      })
      const parsed = mandates.map(parseMandate)
      return ok(res, { mandates: parsed })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      if (!body.clientName || String(body.clientName).trim() === '') {
        return badRequest(res, 'clientName is required')
      }
      const clientName = String(body.clientName).trim()
      const siteName = String(body.siteName || '').trim()
      const dateOfVisit = body.dateOfVisit != null ? String(body.dateOfVisit) : ''
      const typeOfOperation = String(body.typeOfOperation || '').trim()
      const siteLocation = String(body.siteLocation || '').trim()
      let servicesRequired = body.servicesRequired
      if (Array.isArray(servicesRequired)) {
        servicesRequired = JSON.stringify(servicesRequired)
      } else if (typeof servicesRequired !== 'string') {
        servicesRequired = '[]'
      }
      const status = ['draft', 'in_progress', 'won', 'lost'].includes(String(body.status || '').toLowerCase())
        ? String(body.status).toLowerCase()
        : 'draft'
      const clientId = body.clientId ? String(body.clientId).trim() || null : null
      const opportunityId = body.opportunityId ? String(body.opportunityId).trim() || null : null
      let workflowStages = body.workflowStages
      if (Array.isArray(workflowStages) && workflowStages.length > 0) {
        workflowStages = JSON.stringify(workflowStages)
      } else {
        workflowStages = JSON.stringify(DEFAULT_STAGES)
      }
      const createdById = req.user?.sub || null

      const mandate = await prisma.engagementMandate.create({
        data: {
          clientName,
          siteName,
          dateOfVisit,
          typeOfOperation,
          siteLocation,
          servicesRequired,
          status,
          clientId,
          opportunityId,
          workflowStages,
          createdById
        }
      })
      return created(res, { mandate: parseMandate(mandate) })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('❌ Engagement mandates handler error:', e)
    return serverError(res, 'Engagement mandates request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
