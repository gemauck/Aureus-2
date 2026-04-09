import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, notFound, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'

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
    const id = req.params?.id
    if (!id) {
      return badRequest(res, 'Missing id')
    }

    const user = await getUserForReceiptCapture(req)
    if (!user?.id) {
      return forbidden(res, 'Authentication required')
    }

    if (!isReceiptCaptureAdmin(user)) {
      return forbidden(res, 'Only administrators can modify receipt accounts.')
    }

    if (req.method === 'GET') {
      const row = await prisma.receiptAccount.findUnique({ where: { id } })
      if (!row) return notFound(res)
      return ok(res, { account: serializeAccount(row) })
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req)
      const data = {}
      if (body.name !== undefined) data.name = String(body.name).trim()
      if (body.code !== undefined) data.code = String(body.code).trim().slice(0, 64)
      if (body.active !== undefined) data.active = Boolean(body.active)
      if (body.sortOrder !== undefined) {
        const n = parseInt(body.sortOrder, 10)
        if (Number.isFinite(n)) data.sortOrder = n
      }
      try {
        const row = await prisma.receiptAccount.update({
          where: { id },
          data
        })
        return ok(res, { account: serializeAccount(row) })
      } catch (e) {
        if (e.code === 'P2025') return notFound(res)
        throw e
      }
    }

    if (req.method === 'DELETE') {
      try {
        await prisma.receiptAccount.delete({ where: { id } })
        return ok(res, { deleted: true })
      } catch (e) {
        if (e.code === 'P2025') return notFound(res)
        throw e
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('receipt-accounts/[id]:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
