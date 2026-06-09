import PDFDocument from 'pdfkit'
import { loadDocumentBranding } from './documentBranding.js'
import { parseIncidentPeopleInvolved } from './incidentReportResolve.js'

function billingBrandTextAlign(brandTextX, left) {
  return brandTextX > left ? 'right' : 'left'
}

function drawMetaCell(doc, x, y, cellW, label, value) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text(String(label || '').toUpperCase(), x, y, { width: cellW })
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(String(value ?? '—'), x, y + 12, { width: cellW })
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
    second: '2-digit',
    hour12: false,
    timeZone: 'Africa/Johannesburg'
  })
}

function parsePhotosJson(raw) {
  try {
    if (!raw) return []
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function photoItemUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return String(item.url || item.uri || '').trim()
}

function photoItemIsImage(item) {
  const url = photoItemUrl(item)
  if (!url) return false
  if (item?.kind === 'voice') return false
  const mediaType = String(item?.mediaType || item?.mimeType || '').toLowerCase()
  if (mediaType.includes('video') || mediaType.includes('audio')) return false
  if (/^data:video\//i.test(url) || /^data:audio\//i.test(url)) return false
  return /^data:image\//i.test(url) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)
}

async function loadImageBufferFromItem(item) {
  const url = photoItemUrl(item)
  if (!url || !photoItemIsImage(item)) return null
  if (/^data:image\/(png|jpeg|jpg);base64,/i.test(url)) {
    try {
      const b64 = url.split(',')[1]
      return Buffer.from(b64, 'base64')
    } catch {
      return null
    }
  }
  return null
}

function drawSection(doc, left, right, y, title, body) {
  const contentW = right - left
  const text = String(body || '').trim() || '—'
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(title, left, y, { width: contentW })
  let cy = y + 16
  doc.font('Helvetica').fontSize(10).fillColor('#374151')
  doc.text(text, left, cy, { width: contentW, lineGap: 2 })
  return doc.y + 14
}

function drawPdfHeader(doc, companyName, letterhead) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const headerTop = doc.page.margins.top
  let brandTextX = left
  const logoH = 50
  if (
    letterhead.logoDataUrl &&
    /^data:image\/(png|jpeg|jpg);base64,/i.test(String(letterhead.logoDataUrl))
  ) {
    try {
      const b64 = String(letterhead.logoDataUrl).split(',')[1]
      const imgBuf = Buffer.from(b64, 'base64')
      doc.image(imgBuf, left, headerTop, { height: logoH })
      brandTextX = left + 115
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
  let ty = headerTop + 20
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
  const underlineY = Math.max(headerTop + logoH, ty) + 10
  doc.strokeColor('#2563eb').lineWidth(2).moveTo(left, underlineY).lineTo(right, underlineY).stroke()
  doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(16).text('INCIDENT REPORT', left, underlineY + 12, {
    width: right - left
  })
  return underlineY + 36
}

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {object} incident
 */
export async function buildIncidentReportPdfBuffer(prismaClient, incident) {
  const { companyName, letterhead } = await loadDocumentBranding(prismaClient)
  const people = parseIncidentPeopleInvolved(incident.peopleInvolved)
  const photos = parsePhotosJson(incident.photos)
  const imageBuffers = []
  for (const item of photos.slice(0, 8)) {
    const buf = await loadImageBufferFromItem(item)
    if (buf) imageBuffers.push(buf)
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const contentW = right - left
    let y = drawPdfHeader(doc, companyName, letterhead)

    const colW = contentW / 3
    drawMetaCell(doc, left, y, colW - 6, 'Incident number', incident.incidentNumber || incident.id)
    drawMetaCell(doc, left + colW, y, colW - 6, 'Client', incident.clientName || '—')
    drawMetaCell(doc, left + colW * 2, y, colW - 6, 'Site', incident.siteName || '—')
    y += 44
    drawMetaCell(doc, left, y, colW - 6, 'Type', incident.incidentType || '—')
    drawMetaCell(doc, left + colW, y, colW - 6, 'Severity', incident.severity || '—')
    drawMetaCell(doc, left + colW * 2, y, colW - 6, 'Status', String(incident.status || 'draft').toUpperCase())
    y += 44
    drawMetaCell(doc, left, y, colW - 6, 'Incident date', formatPdfDateSast(incident.incidentAt))
    drawMetaCell(doc, left + colW, y, colW - 6, 'Reported by', incident.reportedByName || '—')
    drawMetaCell(
      doc,
      left + colW * 2,
      y,
      colW - 6,
      'Linked job card',
      incident.jobCardNumber || incident.jobCardId || '—'
    )
    y += 52

    y = drawSection(doc, left, right, y, 'Description', incident.description)
    y = drawSection(doc, left, right, y, 'Immediate actions', incident.immediateActions)
    y = drawSection(doc, left, right, y, 'Investigation notes', incident.investigationNotes)
    y = drawSection(doc, left, right, y, 'Corrective actions', incident.correctiveActions)
    y = drawSection(doc, left, right, y, 'Equipment involved', incident.equipmentInvolved)
    y = drawSection(doc, left, right, y, 'Witnesses', incident.witnesses)

    if (people.length > 0) {
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('People involved', left, y, { width: contentW })
      y = doc.y + 8
      for (const person of people) {
        const line = `${person.name || '—'}${person.role ? ` (${person.role})` : ''}${person.injured ? ' — INJURED' : ''}`
        doc.font('Helvetica').fontSize(10).fillColor('#374151').text(line, left, y, { width: contentW })
        y = doc.y + 4
      }
      y += 10
    }

    const locDesc = String(incident.locationDescription || '').trim()
    const lat = String(incident.locationLatitude || '').trim()
    const lng = String(incident.locationLongitude || '').trim()
    if (locDesc || (lat && lng)) {
      let locBody = locDesc
      if (lat && lng) locBody += (locBody ? '\n' : '') + `Coordinates: ${lat}, ${lng}`
      y = drawSection(doc, left, right, y, 'Location', locBody)
    }

    if (imageBuffers.length > 0) {
      if (y > doc.page.height - 180) {
        doc.addPage()
        y = doc.page.margins.top
      }
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Evidence photos', left, y)
      y = doc.y + 10
      const imgW = (contentW - 12) / 2
      let col = 0
      for (const buf of imageBuffers) {
        try {
          const x = left + col * (imgW + 12)
          doc.image(buf, x, y, { width: imgW, fit: [imgW, 120] })
          col += 1
          if (col >= 2) {
            col = 0
            y += 128
          }
        } catch {
          // skip bad image
        }
      }
      if (col > 0) y += 128
    }

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6b7280')
      .text(
        `${companyName} • Incident ${incident.incidentNumber || incident.id || ''} • Printed ${formatPdfDateSast(new Date())}`,
        left,
        doc.page.height - 54,
        { width: contentW, align: 'center' }
      )
    doc.end()
  })
}
