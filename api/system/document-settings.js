import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { isAdminUser } from '../_lib/adminRoles.js'

const MAX_LETTERHEAD_JSON_LENGTH = 1_200_000
const MAX_LOGO_DATA_URL_LENGTH = 700_000

function parseLetterhead(jsonStr) {
  try {
    const o = JSON.parse(jsonStr || '{}')
    if (!o || typeof o !== 'object') return {}
    return o
  } catch {
    return {}
  }
}

function validateLetterhead(obj) {
  if (!obj || typeof obj !== 'object') return { ok: true, value: {} }
  const out = {}
  if (Array.isArray(obj.addressLines)) {
    out.addressLines = obj.addressLines.map((s) => String(s).slice(0, 200)).slice(0, 12)
  }
  if (obj.phone != null) out.phone = String(obj.phone).slice(0, 80)
  if (obj.email != null) out.email = String(obj.email).slice(0, 120)
  if (obj.vatNumber != null) out.vatNumber = String(obj.vatNumber).slice(0, 80)
  if (obj.footerNote != null) out.footerNote = String(obj.footerNote).slice(0, 2000)
  if (obj.logoDataUrl != null) {
    const s = String(obj.logoDataUrl)
    if (s.length > MAX_LOGO_DATA_URL_LENGTH) {
      return { ok: false, error: 'Logo image is too large (max ~500KB encoded)' }
    }
    if (s && !/^data:image\/(png|jpeg|jpg);base64,/i.test(s)) {
      return { ok: false, error: 'Logo must be a PNG or JPEG data URL' }
    }
    out.logoDataUrl = s
  }
  const str = JSON.stringify(out)
  if (str.length > MAX_LETTERHEAD_JSON_LENGTH) {
    return { ok: false, error: 'Letterhead data is too large' }
  }
  return { ok: true, value: out }
}

async function handler(req, res) {
  try {
    if (!isAdminUser(req.user)) {
      return forbidden(res, 'Only administrators can manage document settings')
    }

    if (req.method === 'GET') {
      const system = await prisma.systemSettings.findUnique({ where: { id: 'system' } })
      const companyName = system?.companyName ?? 'Abcotronics'
      const poLetterhead = parseLetterhead(system?.poLetterheadJson)
      return ok(res, {
        companyName,
        poLetterhead,
        currency: system?.currency ?? 'ZAR'
      })
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req)
      const updateData = {}

      if (body.companyName !== undefined) {
        updateData.companyName = String(body.companyName).slice(0, 200)
      }

      if (body.poLetterhead !== undefined) {
        const v = validateLetterhead(body.poLetterhead)
        if (!v.ok) return badRequest(res, v.error)
        updateData.poLetterheadJson = JSON.stringify(v.value)
      }

      if (Object.keys(updateData).length === 0) {
        return badRequest(res, 'No valid fields to update')
      }

      updateData.updatedBy = req.user?.sub || null

      const system = await prisma.systemSettings.upsert({
        where: { id: 'system' },
        update: updateData,
        create: {
          id: 'system',
          companyName: updateData.companyName || 'Abcotronics',
          poLetterheadJson: updateData.poLetterheadJson || '{}',
          ...updateData
        }
      })

      return ok(res, {
        companyName: system.companyName,
        poLetterhead: parseLetterhead(system.poLetterheadJson),
        currency: system.currency
      })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('document-settings error:', e)
    return serverError(res, 'Document settings failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
