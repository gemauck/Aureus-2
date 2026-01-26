// Dedicated KYC persistence – PATCH /api/clients/:id/kyc
// Ensures KYC is saved even when the full client PATCH is heavy or fails.
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../../_lib/response.js'
import { withLogging } from '../../_lib/logger.js'
import { withHttp } from '../../_lib/withHttp.js'
import { DEFAULT_KYC } from '../../_lib/clientJsonFields.js'

async function handler(req, res) {
  try {
    const id = req.params?.id
    if (!id) return badRequest(res, 'Client ID required')

    const existing = await prisma.client.findUnique({
      where: { id },
      select: { type: true }
    })
    if (!existing) return notFound(res)
    if (existing.type === 'lead') return badRequest(res, 'Cannot update lead KYC via clients endpoint.')

    if (req.method !== 'PATCH') return badRequest(res, 'Method not allowed')

    const body = req.body || {}
    const kycPayload = body.kyc
    if (kycPayload === undefined || kycPayload === null) return badRequest(res, 'kyc object required')

    const kycStr = typeof kycPayload === 'string' ? kycPayload : JSON.stringify(kycPayload)
    let kycObj
    if (typeof kycPayload === 'object' && kycPayload !== null) {
      kycObj = { ...DEFAULT_KYC, ...kycPayload }
      if (kycPayload.legalEntity && typeof kycPayload.legalEntity === 'object') {
        kycObj.legalEntity = { ...(DEFAULT_KYC.legalEntity || {}), ...kycPayload.legalEntity }
      }
      if (kycPayload.businessProfile && typeof kycPayload.businessProfile === 'object') {
        kycObj.businessProfile = { ...(DEFAULT_KYC.businessProfile || {}), ...kycPayload.businessProfile }
      }
      if (kycPayload.bankingDetails && typeof kycPayload.bankingDetails === 'object') {
        kycObj.bankingDetails = { ...(DEFAULT_KYC.bankingDetails || {}), ...kycPayload.bankingDetails }
      }
    } else {
      try {
        kycObj = { ...DEFAULT_KYC, ...JSON.parse(kycStr || '{}') }
      } catch (_) {
        kycObj = DEFAULT_KYC
      }
    }

    await prisma.client.update({
      where: { id },
      data: {
        kyc: typeof kycObj === 'string' ? kycObj : JSON.stringify(kycObj),
        kycJsonb: kycObj
      }
    })

    return ok(res, { ok: true, kyc: kycObj })
  } catch (e) {
    console.error('❌ KYC save error:', e?.message)
    return serverError(res, e?.message || 'Failed to save KYC')
  }
}

export default withHttp(withLogging(authRequired(handler)))
