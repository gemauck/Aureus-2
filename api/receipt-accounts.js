import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, forbidden, ok, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from './_lib/receiptCaptureAccess.js'

function serializeAccount(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

async function handler(req, res) {
  try {
    const user = await getUserForReceiptCapture(req)
    if (!user?.id) {
      return forbidden(res, 'Authentication required')
    }

    if (req.method === 'GET') {
      const rows = await prisma.receiptAccount.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
      })
      return ok(res, { accounts: rows.map(serializeAccount) })
    }

    if (req.method === 'POST') {
      if (!isReceiptCaptureAdmin(user)) {
        return forbidden(res, 'Only administrators can create receipt accounts.')
      }
      const body = await parseJsonBody(req)
      const name = String(body.name || '').trim()
      if (!name) {
        return badRequest(res, 'name is required')
      }
      const row = await prisma.receiptAccount.create({
        data: {
          name,
          code: String(body.code || '').trim().slice(0, 64),
          active: body.active !== false,
          sortOrder: Number.isFinite(parseInt(body.sortOrder, 10)) ? parseInt(body.sortOrder, 10) : 0
        }
      })
      return created(res, { account: serializeAccount(row) })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('receipt-accounts:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
