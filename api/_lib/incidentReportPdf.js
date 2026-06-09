import PDFDocument from 'pdfkit'
import { incidentStatusLabel } from './incidentReportConstants.js'
import { loadDocumentBranding } from './documentBranding.js'
import { formatLinkedJobCardLabels } from './incidentReportJobCards.js'
import { getAppUrl } from './getAppUrl.js'

function billingBrandTextAlign(brandTextX, left) {
  return brandTextX > left ? 'right' : 'left'
}

function displayValue(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}

function formatLocation(incident) {
  const desc = String(incident?.locationDescription || '').trim()
  const lat = String(incident?.locationLatitude || '').trim()
  const lng = String(incident?.locationLongitude || '').trim()
  if (desc && lat && lng) return `${desc} (${lat}, ${lng})`
  if (desc) return desc
  if (lat && lng) return `${lat}, ${lng}`
  return ''
}

function parseIncidentPhotos(raw) {
  try {
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    return typeof raw === 'string' ? JSON.parse(raw) : []
  } catch {
    return typeof raw === 'string' && raw.trim() ? [raw] : []
  }
}

function incidentPhotoUrl(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return String(entry).trim()
  if (typeof entry !== 'object') return ''
  if (entry.kind === 'safetyCultureMedia' && entry.mediaId && entry.token) {
    const params = new URLSearchParams({
      media_id: String(entry.mediaId),
      token: String(entry.token)
    })
    if (entry.issueId != null) params.set('issue_id', String(entry.issueId))
    return `/api/safety-culture/media/proxy?${params}`
  }
  return String(entry.url || entry.thumbUrl || entry.dataUrl || entry.previewUrl || '').trim()
}

function incidentPhotoIsVideo(entry) {
  const url = incidentPhotoUrl(entry)
  if (!url) return false
  if (typeof entry === 'object' && entry) {
    const mt = String(entry.mediaType || entry.mimeType || '').toLowerCase()
    if (mt.includes('video')) return true
    if (entry.kind === 'video') return true
  }
  return /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

async function fetchImageBufferForPdf(url, timeoutMs = 8000) {
  if (!url || typeof url !== 'string') return null
  let u = url.trim()
  if (/^data:image\/(png|jpeg|jpg);base64,/i.test(u)) {
    try {
      const b64 = u.split(',')[1]
      return Buffer.from(b64, 'base64')
    } catch {
      return null
    }
  }
  if (u.startsWith('/')) {
    u = `${getAppUrl()}${u}`
  }
  if (!/^https?:\/\//i.test(u)) return null
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(u, { signal: ac.signal, redirect: 'follow' })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!ct.startsWith('image/')) return null
    const ab = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    if (buf.length > 2_500_000) return null
    return buf
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function loadIncidentPhotoBuffers(photosInput, { maxImages = 12 } = {}) {
  const photos = parseIncidentPhotos(photosInput)
  const out = []
  for (const entry of photos) {
    if (out.length >= maxImages) break
    if (incidentPhotoIsVideo(entry)) continue
    const url = incidentPhotoUrl(entry)
    if (!url) continue
    const buf = await fetchImageBufferForPdf(url)
    if (!buf) continue
    const label =
      entry && typeof entry === 'object' && entry.name ? String(entry.name) : `Photo ${out.length + 1}`
    out.push({ buf, label })
  }
  return out
}

function buildSummaryCells(incident) {
  const cells = []
  const push = (label, value) => {
    const text = String(value ?? '').trim()
    if (!text || text === '—') return
    cells.push({ label, value: text })
  }

  push('Client', incident.clientName)
  push('Incident type', incident.incidentType)
  if (String(incident.severity || '').trim()) {
    cells.push({ label: 'Severity', value: String(incident.severity).trim(), severity: true })
  }
  const incidentAt = formatPdfDateSast(incident.incidentAt)
  if (incidentAt !== '—') push('Incident date & time', incidentAt)
  push('Status', incidentStatusLabel(incident.status))
  push('Technician', incident.technicianName)
  push('Author', incident.authorName)
  push('Linked job cards', formatLinkedJobCardLabels(incident))
  const drafted = formatPdfDateSast(incident.createdAt)
  if (drafted !== '—') push('Draft recorded', drafted)
  const submitted = formatPdfDateSast(incident.submittedAt)
  if (submitted !== '—') push('Submitted', submitted)
  push('Location', formatLocation(incident))
  return cells
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
  const text = String(body ?? '').trim()
  if (!text) return y
  const contentW = right - left
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
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  doc.text(text, left + bodyPad, bodyY + bodyPad, {
    width: contentW - bodyPad * 2,
    lineGap: 3
  })
  const bodyH = Math.max(56, doc.y - bodyY + bodyPad)
  doc.strokeColor('#d1d5db').lineWidth(0.5).rect(left, bodyY, contentW, bodyH).stroke()
  return bodyY + bodyH + 14
}

function drawPhotosSection(doc, left, right, y, photoRows) {
  if (!photoRows.length) return y
  const contentW = right - left
  const headH = 28
  doc.save()
  doc.rect(left, y, contentW, headH).fill('#f8fafc')
  doc.strokeColor('#d1d5db').lineWidth(0.5).rect(left, y, contentW, headH).stroke()
  doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9).text('PHOTOS', left + 12, y + 10, {
    width: contentW - 24
  })
  doc.restore()

  let contentY = y + headH + 12
  const colW = (contentW - 12) / 2
  let col = 0
  for (const row of photoRows) {
    const imgX = left + col * (colW + 12)
    if (contentY > doc.page.height - 180) {
      doc.addPage()
      contentY = doc.page.margins.top
      col = 0
    }
    try {
      doc.image(row.buf, imgX, contentY, { fit: [colW, 120] })
      doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5).text(row.label, imgX, contentY + 124, {
        width: colW
      })
    } catch {
      /* skip corrupt image */
    }
    col += 1
    if (col >= 2) {
      col = 0
      contentY += 142
    }
  }
  if (col > 0) contentY += 142
  doc.strokeColor('#d1d5db').lineWidth(0.5)
    .rect(left, y + headH, contentW, contentY - y - headH + 4)
    .stroke()
  return contentY + 14
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
  const sig = String(incident.authorSignature || '').trim()
  const authorName = String(incident.authorName || '').trim()
  const technicianName = String(incident.technicianName || '').trim()
  const draftedAt = formatPdfDateSast(incident.createdAt)
  const submittedAt = formatPdfDateSast(incident.submittedAt)
  const hasSig = sig && /^data:image\/(png|jpeg|jpg);base64,/i.test(sig)
  if (!authorName && !technicianName && draftedAt === '—' && submittedAt === '—' && !hasSig) {
    return y
  }

  const contentW = right - left
  const sectionH = hasSig ? 130 : 96

  doc.save()
  doc.rect(left, y, contentW, 28).fill('#f8fafc')
  doc.strokeColor('#d1d5db').lineWidth(0.5).rect(left, y, contentW, sectionH).stroke()
  doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9).text('AUTHOR SIGN-OFF', left + 12, y + 10)

  const metaY = y + 36
  const colW = contentW / 2
  let dateY = metaY
  if (authorName) {
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('AUTHOR', left + 12, metaY)
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(authorName, left + 12, metaY + 12, { width: colW - 20 })
  }
  if (technicianName) {
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('TECHNICIAN INVOLVED', left + colW + 12, metaY)
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(technicianName, left + colW + 12, metaY + 12, {
      width: colW - 20
    })
  }
  if (authorName || technicianName) dateY = metaY + 34

  if (draftedAt !== '—') {
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('DRAFT RECORDED', left + 12, dateY)
    doc.fillColor('#111827').font('Helvetica').fontSize(9).text(draftedAt, left + 12, dateY + 11)
  }
  if (submittedAt !== '—') {
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('SUBMITTED', left + colW + 12, dateY)
    doc.fillColor('#111827').font('Helvetica').fontSize(9).text(submittedAt, left + colW + 12, dateY + 11)
  }
  if (draftedAt !== '—' || submittedAt !== '—') dateY += 28

  if (hasSig) {
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5).text('SIGNATURE', left + 12, dateY)
    try {
      const b64 = sig.split(',')[1]
      const imgBuf = Buffer.from(b64, 'base64')
      doc.image(imgBuf, left + 12, dateY + 10, { fit: [160, 52] })
    } catch {
      /* skip bad signature */
    }
  }

  doc.restore()
  return y + sectionH + 14
}

/**
 * Full incident report PDF (summary, narratives, author sign-off with signature).
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {object} incident
 */
export async function buildIncidentReportPdfBuffer(prismaClient, incident) {
  const { companyName, letterhead } = await loadDocumentBranding(prismaClient)
  const incidentNumber = displayValue(incident.incidentNumber || incident.id)
  const photoRows = await loadIncidentPhotoBuffers(incident.photos)
  const summaryCells = buildSummaryCells(incident)

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

    if (summaryCells.length) {
      const summaryRows = []
      for (let i = 0; i < summaryCells.length; i += 4) {
        summaryRows.push(summaryCells.slice(i, i + 4))
      }
      const panelH = summaryRows.length * 46
      doc.strokeColor('#d1d5db').lineWidth(0.75).rect(left, y, contentW, panelH).stroke()
      let rowY = y
      for (const row of summaryRows) {
        const cells = [...row]
        while (cells.length < 4) cells.push(null)
        const severityIdx = cells.findIndex((cell) => cell?.severity)
        drawSummaryRow(doc, left, right, rowY, cells, {
          severityCol: severityIdx >= 0 ? severityIdx : undefined,
          drawSeverity:
            severityIdx >= 0
              ? (x, badgeY) => drawSeverityBadge(doc, x, badgeY, cells[severityIdx].value)
              : undefined
        })
        rowY += 46
      }
      y += panelH + 18
    } else {
      y += 18
    }

    y = drawNarrativeSection(doc, left, right, y, 'Equipment / vehicle involved', incident.equipmentInvolved)
    y = drawNarrativeSection(doc, left, right, y, 'Relevant tanks / mobile bowsers', incident.relevantTanksMobileBowsers)
    y = drawNarrativeSection(doc, left, right, y, 'Description', incident.description)
    y = drawNarrativeSection(doc, left, right, y, 'Immediate actions', incident.immediateActions)
    y = drawNarrativeSection(doc, left, right, y, 'Investigation notes', incident.investigationNotes)
    y = drawNarrativeSection(doc, left, right, y, 'Corrective / follow-up actions', incident.correctiveActions)
    y = drawPhotosSection(doc, left, right, y, photoRows)
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
