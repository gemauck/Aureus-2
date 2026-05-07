import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, ok, notFound, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { hashCustomerEngagementToken } from '../_lib/customerEngagementToken.js'
import {
  CUSTOMER_ENGAGEMENT_SCHEMA_VERSION,
  getCustomerEngagementFormDefinition,
  validateCustomerEngagementResponses,
  buildInitialResponsesForPublic
} from '../_lib/customerEngagementSchema.js'

function allowPublicCustomerEngagement() {
  const v = (process.env.ALLOW_PUBLIC_CUSTOMER_ENGAGEMENT || 'true').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function parseToken(req) {
  const q = req.query || {}
  if (q.token && typeof q.token === 'string') return q.token.trim()
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    return (url.searchParams.get('token') || '').trim()
  } catch {
    return ''
  }
}

async function findLeadByRawToken(rawToken) {
  if (!rawToken || rawToken.length < 20) return null
  const hash = hashCustomerEngagementToken(rawToken)
  if (!hash) return null
  return prisma.client.findFirst({
    where: {
      type: 'lead',
      customerEngagementTokenHash: hash
    },
    select: {
      id: true,
      name: true,
      customerEngagementRevokedAt: true,
      customerEngagementSubmittedAt: true,
      customerEngagementResponses: true,
      customerEngagementPrefill: true,
      activityLogJsonb: true,
      activityLog: true
    }
  })
}

function getActivityLogArray(client) {
  let value = client.activityLogJsonb
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    const s = client.activityLog
    if (typeof s === 'string' && s.trim()) {
      try {
        value = JSON.parse(s)
      } catch {
        value = []
      }
    } else {
      value = []
    }
  }
  return Array.isArray(value) ? value : []
}

async function handler(req, res) {
  try {
    if (!allowPublicCustomerEngagement()) {
      return forbidden(res, 'Customer engagement form is disabled.')
    }

    const token = parseToken(req)
    const formDef = getCustomerEngagementFormDefinition()

    if (req.method === 'GET') {
      if (!token) {
        return badRequest(res, 'token query parameter required')
      }
      const lead = await findLeadByRawToken(token)
      if (!lead || lead.customerEngagementRevokedAt) {
        return notFound(res, 'This link is invalid or has expired.')
      }
      const submitted = !!lead.customerEngagementSubmittedAt
      const initialResponses = buildInitialResponsesForPublic(lead.customerEngagementPrefill, lead.name)
      return ok(res, {
        schemaVersion: CUSTOMER_ENGAGEMENT_SCHEMA_VERSION,
        form: formDef,
        initialResponses,
        submitted,
        submittedAt: lead.customerEngagementSubmittedAt
          ? lead.customerEngagementSubmittedAt.toISOString()
          : null,
        responses: submitted ? lead.customerEngagementResponses : null
      })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const raw = typeof body.token === 'string' ? body.token.trim() : token
      if (!raw) {
        return badRequest(res, 'token required')
      }
      const lead = await findLeadByRawToken(raw)
      if (!lead || lead.customerEngagementRevokedAt) {
        return notFound(res, 'This link is invalid or has expired.')
      }
      if (lead.customerEngagementSubmittedAt) {
        return badRequest(res, 'This questionnaire has already been submitted.')
      }
      const responses = body.responses
      const validation = validateCustomerEngagementResponses(responses)
      if (!validation.ok) {
        return badRequest(res, validation.errors.join('; '))
      }

      const now = new Date()
      const log = getActivityLogArray(lead)
      log.push({
        id: `ce-${Date.now()}`,
        type: 'Customer engagement',
        description: 'Customer engagement questionnaire submitted via public link',
        timestamp: now.toISOString(),
        user: 'External (questionnaire)',
        userId: null,
        userEmail: null,
        relatedId: null,
        meta: { source: 'customer_engagement_public' }
      })

      await prisma.client.update({
        where: { id: lead.id },
        data: {
          customerEngagementResponses: responses,
          customerEngagementSubmittedAt: now,
          activityLog: JSON.stringify(log),
          activityLogJsonb: log
        }
      })

      return ok(res, { success: true, submittedAt: now.toISOString() })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('public/customer-engagement:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(handler))
