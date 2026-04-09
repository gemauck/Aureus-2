import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, forbidden, ok, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from './_lib/receiptCaptureAccess.js'

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
    const user = await getUserForReceiptCapture(req)
    if (!user?.id) {
      return forbidden(res, 'Authentication required')
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const allOrg = url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true'
    const isAdmin = isReceiptCaptureAdmin(user)

    if (req.method === 'GET') {
      const where =
        isAdmin && allOrg
          ? {}
          : {
              userId: user.id
            }
      const rows = await prisma.receiptDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: {
          account: { select: { id: true, name: true, code: true } },
          costCenter: { select: { id: true, name: true, code: true } }
        }
      })
      return ok(res, { documents: rows.map(serializeDocument) })
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      const fileUrl = String(body.fileUrl || '').trim()
      if (!fileUrl.startsWith('/uploads/receipt-capture/')) {
        return badRequest(res, 'fileUrl must be under /uploads/receipt-capture/')
      }

      let extractedJson = '{}'
      if (body.extraction !== undefined) {
        extractedJson = JSON.stringify(body.extraction)
      } else if (body.extractedJson !== undefined) {
        extractedJson =
          typeof body.extractedJson === 'string'
            ? body.extractedJson
            : JSON.stringify(body.extractedJson)
      }

      const ext = parseExtractedJson(extractedJson)
      const row = await prisma.receiptDocument.create({
        data: {
          userId: user.id,
          fileUrl,
          status: String(body.status || 'draft').slice(0, 32),
          extractedJson,
          vendor: String(body.vendor !== undefined ? body.vendor : ext.vendor || '').slice(0, 500),
          documentDate: String(body.documentDate !== undefined ? body.documentDate : ext.documentDate || '').slice(
            0,
            32
          ),
          total: Number.isFinite(parseFloat(body.total)) ? parseFloat(body.total) : parseFloat(ext.total) || 0,
          currency: String(body.currency || ext.currency || 'ZAR').slice(0, 8),
          taxAmount:
            body.taxAmount !== undefined && body.taxAmount !== null
              ? parseFloat(body.taxAmount)
              : ext.taxAmount !== undefined
                ? parseFloat(ext.taxAmount)
                : null,
          accountId: body.accountId || null,
          costCenterId: body.costCenterId || null,
          notes: String(body.notes || '').slice(0, 4000)
        },
        include: {
          account: { select: { id: true, name: true, code: true } },
          costCenter: { select: { id: true, name: true, code: true } }
        }
      })
      return created(res, { document: serializeDocument(row) })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('receipt-documents:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
