import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

function parseLetterheadJson(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end(JSON.stringify({ error: 'Method not allowed' }))
    }

    const system = await prisma.systemSettings.findUnique({ where: { id: 'system' } })
    const companyName = (system?.companyName && String(system.companyName).trim()) || 'Abcotronics'
    const letterhead = parseLetterheadJson(system?.poLetterheadJson)
    const addressLines = Array.isArray(letterhead.addressLines) ? letterhead.addressLines.map(String) : []
    const logoDataUrl =
      letterhead.logoDataUrl && /^data:image\/(png|jpeg|jpg);base64,/i.test(String(letterhead.logoDataUrl))
        ? letterhead.logoDataUrl
        : null

    return ok(res, {
      companyName,
      letterhead: {
        logoDataUrl,
        addressLines,
        phone: letterhead.phone ? String(letterhead.phone) : '',
        email: letterhead.email ? String(letterhead.email) : '',
        vatNumber: letterhead.vatNumber ? String(letterhead.vatNumber) : ''
      }
    })
  } catch (e) {
    console.error('document-branding:', e)
    return serverError(res, 'Failed to load branding', e.message)
  }
}

export default withHttp(withLogging(handler))
