import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, ok, notFound, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { hashCustomerEngagementToken } from '../_lib/customerEngagementToken.js'
import {
  CUSTOMER_ENGAGEMENT_SCHEMA_VERSION,
  getCustomerEngagementFormDefinition,
  validateCustomerEngagementResponses,
  buildInitialResponsesForPublic,
  sanitizeCustomerEngagementCustomFields
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

function parseQuestionnaireId(req) {
  const q = req.query || {}
  if (q.q && typeof q.q === 'string') return q.q.trim()
  if (q.questionnaireId && typeof q.questionnaireId === 'string') return q.questionnaireId.trim()
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    return (url.searchParams.get('q') || url.searchParams.get('questionnaireId') || '').trim()
  } catch {
    return ''
  }
}

function normalizeQuestionnaires(raw) {
  return Array.isArray(raw) ? raw.filter((q) => q && typeof q === 'object') : []
}

function normalizeSubmissionVersions(raw) {
  return Array.isArray(raw) ? raw.filter((v) => v && typeof v === 'object') : []
}

async function findLeadByRawToken(rawToken, questionnaireId) {
  if (!rawToken || rawToken.length < 20) return null
  const hash = hashCustomerEngagementToken(rawToken)
  if (!hash) return null
  const legacy = await prisma.client.findFirst({
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
      customerEngagementQuestionnaires: true,
      activityLogJsonb: true,
      activityLog: true
    }
  })
  if (legacy) {
    return {
      lead: legacy,
      mode: 'legacy',
      questionnaire:
        questionnaireId &&
        normalizeQuestionnaires(legacy.customerEngagementQuestionnaires).find((q) => q.id === questionnaireId)
    }
  }

  const leads = await prisma.client.findMany({
    where: {
      type: 'lead',
      customerEngagementQuestionnaires: { not: null }
    },
    select: {
      id: true,
      name: true,
      customerEngagementRevokedAt: true,
      customerEngagementSubmittedAt: true,
      customerEngagementResponses: true,
      customerEngagementPrefill: true,
      customerEngagementQuestionnaires: true,
      activityLogJsonb: true,
      activityLog: true
    }
  })
  for (const lead of leads) {
    const qrows = normalizeQuestionnaires(lead.customerEngagementQuestionnaires)
    const row = qrows.find(
      (q) =>
        q &&
        q.tokenHash === hash &&
        (!questionnaireId || String(q.id || '').trim() === questionnaireId)
    )
    if (row) return { lead, mode: 'questionnaire', questionnaire: row }
  }
  return null
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
    const questionnaireId = parseQuestionnaireId(req)

    if (req.method === 'GET') {
      if (!token) {
        return badRequest(res, 'token query parameter required')
      }
      const match = await findLeadByRawToken(token, questionnaireId)
      const lead = match?.lead
      if (!match || !lead) {
        return notFound(res, 'This link is invalid or has expired.')
      }
      if (match.mode === 'questionnaire') {
        if (!match.questionnaire?.tokenHash || match.questionnaire.revokedAt) {
          return notFound(res, 'This link is invalid or has expired.')
        }
      } else if (lead.customerEngagementRevokedAt) {
        return notFound(res, 'This link is invalid or has expired.')
      }
      const customFields =
        match.mode === 'questionnaire'
          ? sanitizeCustomerEngagementCustomFields(match.questionnaire?.customFields)
          : []
      const formDef = getCustomerEngagementFormDefinition(customFields)
      const submitted =
        match.mode === 'questionnaire'
          ? !!match.questionnaire?.submittedAt
          : !!lead.customerEngagementSubmittedAt
      const initialResponses = buildInitialResponsesForPublic(
        match.mode === 'questionnaire'
          ? match.questionnaire?.prefill
          : lead.customerEngagementPrefill,
        lead.name,
        formDef
      )
      return ok(res, {
        schemaVersion: CUSTOMER_ENGAGEMENT_SCHEMA_VERSION,
        form: formDef,
        initialResponses,
        submitted,
        questionnaireId:
          match.mode === 'questionnaire' ? (match.questionnaire?.id || null) : null,
        questionnaireName:
          match.mode === 'questionnaire'
            ? (match.questionnaire?.name || 'Customer engagement questionnaire')
            : null,
        submittedAt:
          match.mode === 'questionnaire'
            ? match.questionnaire?.submittedAt || null
            : lead.customerEngagementSubmittedAt
              ? lead.customerEngagementSubmittedAt.toISOString()
              : null,
        responses:
          submitted
            ? (match.mode === 'questionnaire'
                ? (match.questionnaire?.responses || null)
                : lead.customerEngagementResponses)
            : null
      })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const raw = typeof body.token === 'string' ? body.token.trim() : token
      if (!raw) {
        return badRequest(res, 'token required')
      }
      const match = await findLeadByRawToken(raw, questionnaireId)
      const lead = match?.lead
      if (!match || !lead) {
        return notFound(res, 'This link is invalid or has expired.')
      }
      if (match.mode === 'questionnaire') {
        if (!match.questionnaire?.tokenHash || match.questionnaire.revokedAt) {
          return notFound(res, 'This link is invalid or has expired.')
        }
      } else if (lead.customerEngagementRevokedAt) {
        return notFound(res, 'This link is invalid or has expired.')
      }
      const customFields =
        match.mode === 'questionnaire'
          ? sanitizeCustomerEngagementCustomFields(match.questionnaire?.customFields)
          : []
      const formDef = getCustomerEngagementFormDefinition(customFields)
      const responses = body.responses
      const validation = validateCustomerEngagementResponses(responses, formDef)
      if (!validation.ok) {
        return badRequest(res, validation.errors.join('; '))
      }

      const now = new Date()
      const nowIso = now.toISOString()
      const log = getActivityLogArray(lead)
      const questionnaireVersion =
        match.mode === 'questionnaire'
          ? normalizeSubmissionVersions(match.questionnaire?.submissions).length + 1
          : null
      log.push({
        id: `ce-${Date.now()}`,
        type: 'Customer engagement',
        description:
          match.mode === 'questionnaire'
            ? `Customer engagement questionnaire submitted via public link (version ${questionnaireVersion})`
            : 'Customer engagement questionnaire submitted via public link',
        timestamp: nowIso,
        user: 'External (questionnaire)',
        userId: null,
        userEmail: null,
        relatedId: null,
        meta: {
          source: 'customer_engagement_public',
          ...(match.mode === 'questionnaire' ? { version: questionnaireVersion } : {})
        }
      })

      if (match.mode === 'questionnaire') {
        const rows = normalizeQuestionnaires(lead.customerEngagementQuestionnaires).map((q) =>
          q.id === match.questionnaire.id
            ? {
                ...q,
                submissions: [
                  ...normalizeSubmissionVersions(q.submissions),
                  { submittedAt: nowIso, responses }
                ],
                responses,
                submittedAt: nowIso,
                updatedAt: nowIso
              }
            : q
        )
        await prisma.client.update({
          where: { id: lead.id },
          data: {
            customerEngagementQuestionnaires: rows,
            activityLog: JSON.stringify(log),
            activityLogJsonb: log
          }
        })
      } else {
        await prisma.client.update({
          where: { id: lead.id },
          data: {
            customerEngagementResponses: responses,
            customerEngagementSubmittedAt: now,
            activityLog: JSON.stringify(log),
            activityLogJsonb: log
          }
        })
      }

      return ok(res, {
        success: true,
        submittedAt: nowIso,
        version: questionnaireVersion || 1
      })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('public/customer-engagement:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(handler))
