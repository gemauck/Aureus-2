import PDFDocument from 'pdfkit'
import { incidentStatusLabel } from './incidentReportConstants.js'
import { loadDocumentBranding } from './documentBranding.js'

function billingBrandTextAlign(brandTextX, left) {
  return brandTextX > left ? 'right' : 'left'
}

function displayValue(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}

function formatPdfDateSast(value) {
  if (!value) return '—'
  const dt = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-ZA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Johannesburg'
  })
}

function severityFill(severity) {
  const s = String(severity || '').trim().toLowerCase()
  if (s === 'critical') return '#7f1d1d'
  if (s === 'high') return '#fee2e2'
  if (s === 'medium') return '#fef3c7'
  if (s === 'low') return '#d1fae5'
  return '#f3f4f6'
}

function severityTextColor(severity) {
  const s = String(severity || '').trim().toLowerCase()
  if (s === 'critical') return '#ffffff'
  if (s === 'high') return '#991b1b'
  if (s === 'medium') return '#92400e'
  if (s === 'low') return '#065f46'
  return '#374151'
}

function drawTitleBand(doc, left, right, incidentNumber) {
  const bandH = 42
  const y = doc.y
  doc.save()
  doc.rect(left, y, right - left, bandH).fill('#1e3a5f')
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('INCIDENT REPORT', left + 16, y + 13, {
    width: (right - left) * 0.55
  })
  doc.font('Helvetica').fontSize(8).text('REFERENCE', right - 150, y + 10, { width: 134, align: 'right' })
  doc.font('Helvetica-Bold').fontSize(13).text(displayValue(incidentNumber), right - 150, y + 22, {
    width: 134,
    align: 'right'
  })
  doc.restore()
  return y + bandH
}

function drawSummaryRow(doc, left, right, y, cells, rowOptions = {}) {
  const rowW = right - left
  const colW = rowW / 4
  const rowH = 46
  let x = left
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]
    if (!cell) {
      x += colW
      continue
    }
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text(String(cell.label || '').toUpperCase(), x + 10, y + 8, {
      width: colW - 14
    })
    if (rowOptions.severityCol === i && typeof rowOptions.drawSeverity === 'function') {
      rowOptions.drawSeverity(x + 10, y + 22)
    } else {
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(String(cell.value ?? '—'), x + 10, y + 22, {
        width: colW - 14
      })
    }
    x += colW
  }
  doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(left, y + rowH).lineTo(right, y + rowH).stroke()
  return y + rowH
}

function drawSeverityBadge(doc, x, y, severity) {
  const text = displayValue(severity)
  if (text === '—') {
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('—', x, y)
    return
  }
  const padX = 8
  const textW = doc.widthOfString(text, { font: 'Helvetica-Bold', size: 9 })
  const badgeW = textW + padX * 2
  const badgeH = 16
  doc.save()
  doc.roundedRect(x, y - 2, badgeW, badgeH, 8).fill(severityFill(severity))
  doc.fillColor(severityTextColor(severity)).font('Helvetica-Bold').fontSize(9).text(text, x + padX, y + 1)
  doc.restore()
}

function drawNarrativeSection(doc, left, right, y, title, body) {
  const contentW = right - left
  const text = String(body ?? '').trim()
  const headH = 28
  doc.save()
  doc.rect(left, y, contentW, headH).fill('#f8fafc')
  doc.strokeColor('#d1d5db').lineWidth(0.5).rect(left, y, contentW, headH).stroke()
  doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9).text(String(title || '').toUpperCase(), left + 12, y + 10, {
    width: contentW - 24
  })
  doc.restore()

  const bodyY = y + headH
  const bodyPad = 12
  doc.font('Helvetica').fontSize(10).fillColor(text ? '#1f2937' : '#9ca3af')
  const rendered = text || 'Not recorded'
  doc.text(rendered, left + bodyPad, bodyY + bodyPad, {
    width: contentW - bodyPad * 2,
    lineGap: 3
  })
  const bodyH = Math.max(56, doc.y - bodyY + bodyPad)
  doc.strokeColor('#d1d5db').lineWidth(0.5).rect(left, bodyY, contentW, bodyH).stroke()
  return bodyY + bodyH + 14
}

function drawPdfHeader(doc, companyName, letterhead) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const headerTop = doc.page.margins.top
  let brandTextX = left
  const logoH = 48
  if (
    letterhead.logoDataUrl &&
    /^data:image\/(png|jpeg|jpg);base64,/i.test(String(letterhead.logoDataUrl))
  ) {
    try {
      const b64 = String(letterhead.logoDataUrl).split(',')[1]
      const imgBuf = Buffer.from(b64, 'base64')
      doc.image(imgBuf, left, headerTop, { height: logoH })
      brandTextX = left + 110
    } catch {
      brandTextX = left
    }
  }
  doc.fillColor('#111827')
  doc.font('Helvetica-Bold').fontSize(14).text(companyName, brandTextX, headerTop, {
    width: right - brandTextX,
    align: billingBrandTextAlign(brandTextX, left)
  })
  const addressLines = Array.isArray(letterhead.addressLines) ? letterhead.addressLines : []
  let ty = headerTop + 18
  doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
  for (const line of addressLines) {
    const s = String(line || '').trim()
    if (!s) continue
    doc.text(s, brandTextX, ty, { width: right - brandTextX, align: billingBrandTextAlign(brandTextX, left) })
    ty += 11
  }
  if (letterhead.phone) {
    doc.text(`Tel: ${letterhead.phone}`, brandTextX, ty, {
      width: right - brandTextX,
      align: billingBrandTextAlign(brandTextX, left)
    })
    ty += 11
  }
  if (letterhead.email) {
    doc.text(`Email: ${letterhead.email}`, brandTextX, ty, {
      width: right - brandTextX,
      align: billingBrandTextAlign(brandTextX, left)
    })
    ty += 11
  }
  return Math.max(headerTop + logoH, ty) + 12
}

function drawSignOffSection(doc, left, right, y, incident) {
  const contentW = right - left
  const sig = String(incident.authorSignature || '').trim()
  const authorName = displayValue(incident.authorName)
  const technicianName = displayValue(incident.technicianName)
  const draftedAt = formatPdfDateSast(incident.createdAt)
  const submittedAt = formatPdfDateSast(incident.submittedAt)
  const sectionH = sig ? 130 : 88

  doc.save()
  doc.rect(left, y, contentW, 28).fill('#f8fafc')
  doc.strokeColor('#d1d5db').lineWidth(0.5).rect(left, y, contentW, sectionH).stroke()
  doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9).text('AUTHOR SIGN-OFF', left + 12, y + 10)

  const metaY = y + 36
  const colW = contentW / 2
  doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('AUTHOR', left + 12, metaY)
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(authorName, left + 12, metaY + 12, { width: colW - 20 })
  doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('TECHNICIAN INVOLVED', left + colW + 12, metaY)
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(technicianName, left + colW + 12, metaY + 12, {
    width: colW - 20
  })

  const dateY = metaY + 34
  doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('DRAFT RECORDED', left + 12, dateY)
  doc.fillColor('#111827').font('Helvetica').fontSize(9).text(draftedAt, left + 12, dateY + 11)
  doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('SUBMITTED', left + colW + 12, dateY)
  doc.fillColor('#111827').font('Helvetica').fontSize(9).text(submittedAt, left + colW + 12, dateY + 11)

  if (sig && /^data:image\/(png|jpeg|jpg);base64,/i.test(sig)) {
    try {
      const b64 = sig.split(',')[1]
      const imgBuf = Buffer.from(b64, 'base64')
      doc.image(imgBuf, left + 12, dateY + 28, { fit: [140, 44] })
      doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5).text('Signature', left + 12, dateY + 74)
    } catch {
      /* skip bad signature image */
    }
  }

  doc.restore()
  return y + sectionH + 14
}

/**
 * Web form fields: client, site, type, severity, date, status, description, immediate actions.
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {object} incident
 */
export async function buildIncidentReportPdfBuffer(prismaClient, incident) {
  const { companyName, letterhead } = await loadDocumentBranding(prismaClient)
  const incidentNumber = displayValue(incident.incidentNumber || incident.id)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const contentW = right - left
    let y = drawPdfHeader(doc, companyName, letterhead)
    doc.y = y
    y = drawTitleBand(doc, left, right, incidentNumber)

    doc.strokeColor('#d1d5db').lineWidth(0.75).rect(left, y, contentW, 92).stroke()
    const row1Y = y
    const cellsRow1 = [
      { label: 'Client', value: displayValue(incident.clientName) },
      { label: 'Site', value: displayValue(incident.siteName) },
      { label: 'Incident type', value: displayValue(incident.incidentType) },
      { label: 'Severity', value: displayValue(incident.severity) }
    ]
    drawSummaryRow(doc, left, right, row1Y, cellsRow1, {
      severityCol: 3,
      drawSeverity: (x, badgeY) => drawSeverityBadge(doc, x, badgeY, incident.severity)
    })

    const row2Y = row1Y + 46
    drawSummaryRow(doc, left, right, row2Y, [
      { label: 'Incident date & time', value: formatPdfDateSast(incident.incidentAt) },
      { label: 'Status', value: incidentStatusLabel(incident.status) },
      { label: 'Technician', value: displayValue(incident.technicianName) },
      { label: 'Author', value: displayValue(incident.authorName) }
    ])
    y += 92 + 18

    y = drawNarrativeSection(doc, left, right, y, 'Relevant assets', incident.relevantAssets)
    y = drawNarrativeSection(doc, left, right, y, 'Relevant tanks / mobile bowsers', incident.relevantTanksMobileBowsers)
    y = drawNarrativeSection(doc, left, right, y, 'Description', incident.description)
    y = drawNarrativeSection(doc, left, right, y, 'Immediate actions', incident.immediateActions)
    y = drawSignOffSection(doc, left, right, y, incident)

    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#6b7280')
      .text(
        'This document contains operational incident information. Handle in accordance with company policy.',
        left,
        y + 8,
        { width: contentW, align: 'center' }
      )

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        `${companyName} • Incident ${incidentNumber} • Printed ${formatPdfDateSast(new Date())}`,
        left,
        doc.page.height - 54,
        { width: contentW, align: 'center' }
      )
    doc.end()
  })
}
