import PDFDocument from 'pdfkit'

const MAX_LOGO_BYTES = 900000

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i)
  if (!m) return null
  try {
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > MAX_LOGO_BYTES) return null
    return { format: m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase(), buffer: buf }
  } catch {
    return null
  }
}

function formatMoney(amount, currency) {
  const n = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0
  const sym = currency === 'ZAR' ? 'R' : currency || ''
  return `${sym} ${n.toFixed(2)}`.trim()
}

function formatDate(d) {
  if (!d) return '—'
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  return x.toISOString().split('T')[0]
}

/**
 * @param {object} opts
 * @param {object} opts.purchaseOrder - row with items array or JSON string
 * @param {object|null} opts.supplier
 * @param {object|null} opts.receivingLocation
 * @param {object} opts.systemSettings
 */
export function buildPurchaseOrderPdfBuffer(opts) {
  const { purchaseOrder, supplier, receivingLocation, systemSettings } = opts
  let letterhead = {}
  try {
    letterhead = JSON.parse(systemSettings?.poLetterheadJson || '{}')
  } catch {
    letterhead = {}
  }
  const companyName = systemSettings?.companyName || 'Company'
  const currency = systemSettings?.currency || 'ZAR'

  const items =
    typeof purchaseOrder.items === 'string'
      ? JSON.parse(purchaseOrder.items || '[]')
      : purchaseOrder.items || []

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `PO ${purchaseOrder.orderNumber}` } })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const contentW = right - left

    const logoParsed = parseDataUrl(letterhead.logoDataUrl)
    const headerTop = doc.y
    if (logoParsed) {
      try {
        doc.image(logoParsed.buffer, left, headerTop, { height: 44 })
      } catch {
        // ignore
      }
    }

    const textStartX = logoParsed ? left + 130 : left
    const textW = contentW - (logoParsed ? 130 : 0)
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111')
    doc.text(companyName, textStartX, headerTop, { width: textW, align: 'right' })
    doc.font('Helvetica').fontSize(8).fillColor('#444444')
    const addr = (letterhead.addressLines || []).filter(Boolean).join('\n')
    if (addr) doc.text(addr, textStartX, doc.y + 2, { width: textW, align: 'right' })
    if (letterhead.phone) doc.text(`Tel: ${letterhead.phone}`, textStartX, doc.y, { width: textW, align: 'right' })
    if (letterhead.email) doc.text(`Email: ${letterhead.email}`, textStartX, doc.y, { width: textW, align: 'right' })
    if (letterhead.vatNumber) doc.text(`VAT: ${letterhead.vatNumber}`, textStartX, doc.y, { width: textW, align: 'right' })

    doc.y = Math.max(doc.y, headerTop + 50)
    doc.x = left
    doc.moveDown(0.8)

    doc.font('Helvetica-Bold').fontSize(17).fillColor('#111111').text('PURCHASE ORDER', { width: contentW })
    doc.moveDown(0.3)
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    doc.text(`PO No: ${purchaseOrder.orderNumber}`)
    doc.text(`Status: ${(purchaseOrder.status || '').replace(/_/g, ' ')}`)
    doc.text(`Order date: ${formatDate(purchaseOrder.orderDate)}`)
    doc.text(`Expected: ${formatDate(purchaseOrder.expectedDate)}`)
    doc.text(`Priority: ${purchaseOrder.priority || 'normal'}`)
    doc.moveDown(0.6)

    doc.font('Helvetica-Bold').text('Supplier')
    doc.font('Helvetica')
    const supLines = [
      supplier?.name || purchaseOrder.supplierName || '—',
      supplier?.address,
      supplier?.contactPerson && `Attn: ${supplier.contactPerson}`,
      supplier?.phone && `Tel: ${supplier.phone}`,
      supplier?.email && `Email: ${supplier.email}`
    ].filter(Boolean)
    doc.text(supLines.join('\n') || '—', { width: contentW })
    doc.moveDown(0.5)

    doc.font('Helvetica-Bold').text('Ship to / receiving location')
    doc.font('Helvetica').text(
      receivingLocation
        ? `${receivingLocation.name} (${receivingLocation.code})\n${receivingLocation.address || ''}`.trim()
        : '—',
      { width: contentW }
    )
    doc.moveDown(0.8)

    const rowH = 14
    const colSku = left
    const colDesc = left + 62
    const colPart = left + 200
    const colQty = left + 268
    const colPrice = left + 308
    const colLine = left + 380

    doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000')
    doc.text('SKU', colSku, doc.y, { width: 58 })
    doc.text('Description', colDesc, doc.y, { width: 130 })
    doc.text('Supp.#', colPart, doc.y, { width: 62 })
    doc.text('Qty', colQty, doc.y, { width: 34, align: 'right' })
    doc.text('Unit', colPrice, doc.y, { width: 66, align: 'right' })
    doc.text('Line', colLine, doc.y, { width: 66, align: 'right' })
    doc.moveDown(0.2)
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke('#bbbbbb')
    doc.moveDown(0.35)

    doc.font('Helvetica').fontSize(7).fillColor('#222222')
    for (const line of items) {
      const qty = parseFloat(line.quantity) || 0
      const unit = parseFloat(line.unitPrice) || 0
      const lineTot = line.total != null ? parseFloat(line.total) : qty * unit
      if (doc.y > doc.page.height - 100) {
        doc.addPage()
        doc.x = left
      }
      const rowTop = doc.y
      doc.text(String(line.sku || ''), colSku, rowTop, { width: 58 })
      doc.text(String(line.name || ''), colDesc, rowTop, { width: 130 })
      doc.text(String(line.supplierPartNumber || ''), colPart, rowTop, { width: 62 })
      doc.text(qty.toString(), colQty, rowTop, { width: 34, align: 'right' })
      doc.text(formatMoney(unit, currency), colPrice, rowTop, { width: 66, align: 'right' })
      doc.text(formatMoney(lineTot, currency), colLine, rowTop, { width: 66, align: 'right' })
      doc.y = rowTop + rowH
      doc.x = left
    }

    doc.moveDown(0.5)
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke('#bbbbbb')
    doc.moveDown(0.5)

    const sub = parseFloat(purchaseOrder.subtotal) || 0
    const tax = parseFloat(purchaseOrder.tax) || 0
    const tot = parseFloat(purchaseOrder.total) || 0
    const includeVat = purchaseOrder.includeVat === true
    doc.font('Helvetica').fontSize(9).fillColor('#222222')
    doc.text(`Subtotal (ex VAT): ${formatMoney(sub, currency)}`, left, doc.y, { width: contentW, align: 'right' })
    if (includeVat) {
      doc.text(`VAT (15%): ${formatMoney(tax, currency)}`, left, doc.y, { width: contentW, align: 'right' })
    } else {
      doc.font('Helvetica').fontSize(8).fillColor('#555555')
      doc.text('VAT: Not included on this order.', left, doc.y, { width: contentW, align: 'right' })
      doc.font('Helvetica').fontSize(9).fillColor('#222222')
    }
    doc.font('Helvetica-Bold').text(`Total: ${formatMoney(tot, currency)}`, left, doc.y, { width: contentW, align: 'right' })

    if (purchaseOrder.notes) {
      doc.moveDown(0.8)
      doc.font('Helvetica-Bold').fontSize(9).text('Notes (supplier)')
      doc.font('Helvetica').text(purchaseOrder.notes, { width: contentW })
    }

    if (letterhead.footerNote) {
      doc.moveDown(1)
      doc.fontSize(7).fillColor('#666666').text(letterhead.footerNote, { width: contentW, align: 'center' })
    }

    doc.end()
  })
}
