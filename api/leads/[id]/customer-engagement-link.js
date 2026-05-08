import { authRequired } from '../../_lib/authRequired.js'
import { Prisma } from '@prisma/client'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, forbidden, ok, notFound, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { isAdminRole } from '../../_lib/authRoles.js'
import { generateCustomerEngagementToken, hashCustomerEngagementToken } from '../../_lib/customerEngagementToken.js'
import { getAppUrl } from '../../_lib/getAppUrl.js'
import {
  sanitizeCustomerEngagementPrefill,
  sanitizeCustomerEngagementCustomFields,
  getCustomerEngagementFormDefinition
} from '../../_lib/customerEngagementSchema.js'

function buildQuestionnaireId() {
  return `ceq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeQuestionnaires(raw) {
  const rows = Array.isArray(raw) ? raw.filter((q) => q && typeof q === 'object') : []
  return rows.map((q) => ({
    ...q,
    id: String(q.id || '').trim() || buildQuestionnaireId()
  }))
}

function summarizeQuestionnaire(q) {
  return {
    id: q.id,
    name: q.name || 'Customer engagement questionnaire',
    linkActive: !!q.tokenHash && !q.revokedAt,
    tokenCreatedAt: q.tokenCreatedAt || null,
    submittedAt: q.submittedAt || null,
    revokedAt: q.revokedAt || null
  }
}

/**
 * POST — create or rotate token; DELETE — revoke link(s)
 * /api/leads/:id/customer-engagement-link
 * POST body:
 *   {
 *     clearSubmission?: boolean,
 *     questionnaireId?: string,
 *     questionnaireName?: string,
 *     customFields?: array,
 *     prefill?: object | null
 *   }
 * DELETE body/query:
 *   { questionnaireId?: string, remove?: boolean } (remove=true deletes questionnaire row)
 */
async function handler(req, res) {
  try {
    let id = req.params?.id
    if (!id) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const segs = url.pathname.split('/').filter(Boolean)
      const idx = segs.indexOf('leads')
      if (idx >= 0 && segs[idx + 1]) id = segs[idx + 1]
    }
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'Lead ID required')
    }

    if (!isAdminRole(req.user?.role)) {
      return forbidden(res, 'Only administrators can manage customer engagement links')
    }

    const lead = await prisma.client.findFirst({
      where: { id, type: 'lead' },
      select: {
        id: true,
        name: true,
        customerEngagementQuestionnaires: true,
        customerEngagementPrefill: true
      }
    })
    if (!lead) {
      return notFound(res)
    }

    if (req.method === 'DELETE') {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const questionnaireId = String(body.questionnaireId || req.query?.questionnaireId || '').trim()
      const removeQuestionnaire = body.remove === true || String(req.query?.remove || '').toLowerCase() === 'true'
      const nowIso = new Date().toISOString()
      const current = normalizeQuestionnaires(lead.customerEngagementQuestionnaires)
      if (removeQuestionnaire && !questionnaireId) {
        return badRequest(res, 'questionnaireId required when remove=true')
      }
      const next =
        removeQuestionnaire
          ? current.filter((q) => q.id !== questionnaireId)
          : questionnaireId.length > 0
          ? current.map((q) =>
              q.id === questionnaireId
                ? {
                    ...q,
                    tokenHash: null,
                    tokenCreatedAt: null,
                    revokedAt: nowIso,
                    updatedAt: nowIso
                  }
                : q
            )
          : current.map((q) => ({
              ...q,
              tokenHash: null,
              tokenCreatedAt: null,
              revokedAt: nowIso,
              updatedAt: nowIso
            }))

      await prisma.client.update({
        where: { id },
        data: {
          customerEngagementTokenHash: null,
          customerEngagementTokenCreatedAt: null,
          customerEngagementRevokedAt: new Date(),
          customerEngagementQuestionnaires: next.length > 0 ? next : Prisma.DbNull
        }
      })
      return ok(res, {
        removed: removeQuestionnaire,
        revoked: true,
        revokedAll: questionnaireId.length === 0,
        questionnaireId: questionnaireId || null,
        questionnaires: next.map(summarizeQuestionnaire)
      })
    }

    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const questionnaireId = String(body.questionnaireId || '').trim()
    const questionnaireNameRaw = String(body.questionnaireName || '').trim()
    const customFields = sanitizeCustomerEngagementCustomFields(body.customFields)

    const rawToken = generateCustomerEngagementToken()
    const tokenHash = hashCustomerEngagementToken(rawToken)
    const now = new Date()
    const nowIso = now.toISOString()
    const current = normalizeQuestionnaires(lead.customerEngagementQuestionnaires)
    let index = questionnaireId
      ? current.findIndex((q) => String(q.id || '').trim() === questionnaireId)
      : -1
    if (index < 0 && questionnaireNameRaw) {
      const byName = questionnaireNameRaw.trim().toLowerCase()
      index = current.findIndex((q) => String(q.name || '').trim().toLowerCase() === byName)
    }

    let baseFormDef = getCustomerEngagementFormDefinition(customFields)
    if (index >= 0 && customFields.length === 0) {
      const existingCustom = sanitizeCustomerEngagementCustomFields(current[index].customFields)
      baseFormDef = getCustomerEngagementFormDefinition(existingCustom)
    }
    let sanitizedPrefill = null
    if (Object.prototype.hasOwnProperty.call(body, 'prefill')) {
      sanitizedPrefill = sanitizeCustomerEngagementPrefill(body.prefill, baseFormDef)
    } else if (index >= 0) {
      sanitizedPrefill = sanitizeCustomerEngagementPrefill(current[index].prefill, baseFormDef)
    } else {
      sanitizedPrefill = sanitizeCustomerEngagementPrefill(lead.customerEngagementPrefill, baseFormDef)
    }

    let record
    if (index >= 0) {
      const prev = current[index]
      record = {
        ...prev,
        id: prev.id,
        name: questionnaireNameRaw || prev.name || 'Customer engagement questionnaire',
        customFields:
          customFields.length > 0
            ? customFields
            : sanitizeCustomerEngagementCustomFields(prev.customFields),
        prefill: sanitizedPrefill,
        tokenHash,
        tokenCreatedAt: nowIso,
        revokedAt: null,
        updatedAt: nowIso,
        // Generating a fresh link always opens a fresh response round.
        submittedAt: null,
        responses: null
      }
      current[index] = record
    } else {
      record = {
        id: buildQuestionnaireId(),
        name: questionnaireNameRaw || 'Customer engagement questionnaire',
        customFields,
        prefill: sanitizedPrefill,
        tokenHash,
        tokenCreatedAt: nowIso,
        revokedAt: null,
        submittedAt: null,
        responses: null,
        createdAt: nowIso,
        updatedAt: nowIso
      }
      current.unshift(record)
      index = 0
    }

    await prisma.client.update({
      where: { id },
      data: {
        customerEngagementTokenHash: tokenHash,
        customerEngagementTokenCreatedAt: now,
        customerEngagementRevokedAt: null,
        // Keep legacy fields aligned with a fresh round too.
        customerEngagementSubmittedAt: null,
        customerEngagementResponses: null,
        customerEngagementPrefill:
          sanitizedPrefill === null ? Prisma.DbNull : sanitizedPrefill,
        customerEngagementQuestionnaires: current
      }
    })

    const base = getAppUrl().replace(/\/$/, '')
    const url = `${base}/customer-engagement?token=${encodeURIComponent(rawToken)}&q=${encodeURIComponent(record.id)}`

    return ok(res, {
      url,
      tokenCreatedAt: now.toISOString(),
      leadName: lead.name,
      clearedSubmission: true,
      questionnaireId: record.id,
      questionnaireName: record.name,
      questionnaires: current.map(summarizeQuestionnaire)
    })
  } catch (e) {
    console.error('customer-engagement-link:', e)
    return serverError(res, 'Failed to update engagement link', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
