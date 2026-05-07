import { authRequired } from '../../_lib/authRequired.js'
import { Prisma } from '@prisma/client'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, forbidden, ok, notFound, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { isAdminRole } from '../../_lib/authRoles.js'
import { generateCustomerEngagementToken, hashCustomerEngagementToken } from '../../_lib/customerEngagementToken.js'
import { getAppUrl } from '../../_lib/getAppUrl.js'
import { sanitizeCustomerEngagementPrefill } from '../../_lib/customerEngagementSchema.js'

/**
 * POST — create or rotate token; DELETE — revoke link
 * /api/leads/:id/customer-engagement-link
 * POST body: { clearSubmission?: boolean, prefill?: object | null } — prefill rotates with the link; null clears stored prefill
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
      select: { id: true, name: true }
    })
    if (!lead) {
      return notFound(res)
    }

    if (req.method === 'DELETE') {
      await prisma.client.update({
        where: { id },
        data: {
          customerEngagementTokenHash: null,
          customerEngagementTokenCreatedAt: null,
          customerEngagementRevokedAt: new Date()
        }
      })
      return ok(res, { revoked: true })
    }

    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const clearSubmission = body.clearSubmission === true

    const rawToken = generateCustomerEngagementToken()
    const tokenHash = hashCustomerEngagementToken(rawToken)
    const now = new Date()

    const data = {
      customerEngagementTokenHash: tokenHash,
      customerEngagementTokenCreatedAt: now,
      customerEngagementRevokedAt: null,
      ...(clearSubmission
        ? {
            customerEngagementSubmittedAt: null,
            customerEngagementResponses: null
          }
        : {})
    }

    if (Object.prototype.hasOwnProperty.call(body, 'prefill')) {
      const sanitized = sanitizeCustomerEngagementPrefill(body.prefill)
      data.customerEngagementPrefill = sanitized === null ? Prisma.DbNull : sanitized
    }

    await prisma.client.update({
      where: { id },
      data
    })

    const base = getAppUrl().replace(/\/$/, '')
    const url = `${base}/customer-engagement?token=${encodeURIComponent(rawToken)}`

    return ok(res, {
      url,
      tokenCreatedAt: now.toISOString(),
      leadName: lead.name,
      clearedSubmission: clearSubmission
    })
  } catch (e) {
    console.error('customer-engagement-link:', e)
    return serverError(res, 'Failed to update engagement link', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
