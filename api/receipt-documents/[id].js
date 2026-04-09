import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, notFound, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'

function parseExtractedJson(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function serializeDocument(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.userId,
    fileUrl: row.fileUrl,
    status: row.status,
    extraction: parseExtractedJson(row.extractedJson),
    vendor: row.vendor,
    documentDate: row.documentDate,
    total: row.total,
    currency: row.currency,
    taxAmount: row.taxAmount,
    accountId: row.accountId,
    costCenterId: row.costCenterId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    account: row.account
      ? { id: row.account.id, name: row.account.name, code: row.account.code }
      : null,
    costCenter: row.costCenter
      ? { id: row.costCenter.id, name: row.costCenter.name, code: row.costCenter.code }
      : null
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

    const isAdmin = isReceiptCaptureAdmin(user)

    const existing = await prisma.receiptDocument.findUnique({ where: { id } })
    if (!existing) {
      return notFound(res)
    }
    if (existing.userId !== user.id && !isAdmin) {
      return forbidden(res, 'You cannot access this document.')
    }

    if (req.method === 'GET') {
      const row = await prisma.receiptDocument.findUnique({
        where: { id },
        include: {
          account: { select: { id: true, name: true, code: true } },
          costCenter: { select: { id: true, name: true, code: true } }
        }
      })
      return ok(res, { document: serializeDocument(row) })
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req)
      const data = {}

      if (body.status !== undefined) data.status = String(body.status).slice(0, 32)
      if (body.vendor !== undefined) data.vendor = String(body.vendor).slice(0, 500)
      if (body.documentDate !== undefined) data.documentDate = String(body.documentDate).slice(0, 32)
      if (body.total !== undefined) data.total = parseFloat(body.total) || 0
      if (body.currency !== undefined) data.currency = String(body.currency).slice(0, 8)
      if (body.taxAmount !== undefined) {
        data.taxAmount = body.taxAmount === null ? null : parseFloat(body.taxAmount)
      }
      if (body.accountId !== undefined) data.accountId = body.accountId || null
      if (body.costCenterId !== undefined) data.costCenterId = body.costCenterId || null
      if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 4000)

      if (body.extraction !== undefined) {
        data.extractedJson = JSON.stringify(body.extraction)
      } else if (body.extractedJson !== undefined) {
        data.extractedJson =
          typeof body.extractedJson === 'string'
            ? body.extractedJson
            : JSON.stringify(body.extractedJson)
      }

      const row = await prisma.receiptDocument.update({
        where: { id },
        data,
        include: {
          account: { select: { id: true, name: true, code: true } },
          costCenter: { select: { id: true, name: true, code: true } }
        }
      })
      return ok(res, { document: serializeDocument(row) })
    }

    if (req.method === 'DELETE') {
      await prisma.receiptDocument.delete({ where: { id } })
      return ok(res, { deleted: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('receipt-documents/[id]:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
