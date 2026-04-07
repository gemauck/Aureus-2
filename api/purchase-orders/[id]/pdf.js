import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { notFound, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { buildPurchaseOrderPdfBuffer } from '../../_lib/purchaseOrderPdf.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ error: 'Method not allowed' }))
    }

    const id = req.params?.id
    if (!id) {
      res.statusCode = 400
      return res.end(JSON.stringify({ error: 'Missing purchase order id' }))
    }

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        receivingLocation: true
      }
    })

    if (!purchaseOrder) return notFound(res, 'Purchase order not found')

    const systemSettings = await prisma.systemSettings.findUnique({ where: { id: 'system' } })

    const poForPdf = {
      ...purchaseOrder,
      items: typeof purchaseOrder.items === 'string' ? JSON.parse(purchaseOrder.items || '[]') : purchaseOrder.items
    }

    const pdfBuffer = await buildPurchaseOrderPdfBuffer({
      purchaseOrder: poForPdf,
      supplier: purchaseOrder.supplier,
      receivingLocation: purchaseOrder.receivingLocation,
      systemSettings: systemSettings || { companyName: 'Abcotronics', currency: 'ZAR', poLetterheadJson: '{}' }
    })

    const filename = `${purchaseOrder.orderNumber || 'PO'}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_')
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', String(pdfBuffer.length))
    return res.end(pdfBuffer)
  } catch (e) {
    console.error('PO PDF error:', e)
    return serverError(res, 'Failed to generate PDF', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
