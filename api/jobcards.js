import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError, forbidden } from './_lib/response.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'
import { isAdminRole } from './_lib/authRoles.js'
import { logAuditFromRequest } from './_lib/manufacturingAuditLog.js'
import { insertJobCardActivityFromRequest } from './_lib/jobCardActivity.js'
import { buildJobCardUpdateChanges, buildServiceFormInstanceChanges } from './_lib/jobCardActivityDiff.js'
import {
  computeNextJobCardNumber,
  findJobCardByLookupParam,
  normalizeJobCardNumberToken
} from './_lib/jobCardNumber.js'
import {
  syncJobCardStockMovements,
  serializeJobCardStockUsedForDb
} from './_lib/jobCardStockMovements.js'
import {
  buildJobCardListWhereClause,
  jobCardJsonFieldHasEntries
} from './_lib/jobCardListSearch.js'
import { resolveJobCardOwnerFilterByCreatorName } from './_lib/jobCardCreatorFilter.js'
import {
  fetchJobCardListHeadingsByIds,
  JOB_CARD_LIST_TABLE_SELECT
} from './_lib/jobCardListHeading.js'
import {
  enrichJobCardRowsSiteNames,
  resolveClientSiteName
} from './_lib/jobCardSiteResolve.js'
import {
  extractHeadingFromOtherComments,
  extractSignatureDataUrlFromPhotos,
  finalizeJobCardOtherCommentsForSave,
  mergeCustomerSignoffIntoOtherComments,
  resolveCustomerSignoffFields,
  hasCustomerSignoffContent,
  withComputedJobCardHeading
} from './_lib/jobCardOtherComments.js'
import { findJobCardByClientDraftId } from './_lib/jobCardIdempotency.js'
import { sendEmail } from './_lib/email.js'
import { getAppUrl } from './_lib/getAppUrl.js'
import PDFDocument from 'pdfkit'

// Some deployments may not yet have the optional service form tables used by
// the job card forms feature. When those tables are missing, Prisma throws
// a specific error. We treat that as "feature not available" instead of a
// hard failure so the rest of the job cards module remains usable.
function isMissingServiceFormInstanceTables(error) {
  if (!error) return false

  const message = String(error.message || '')
  const code = error.code

  if (code === 'P2021' || code === 'P2023') return true

  if (message.includes('ServiceFormTemplate') || message.includes('ServiceFormInstance')) {
    return true
  }

  return false
}

/** Roles that may create, update, or delete any job card (including public submissions with no owner). */
function jobCardMutateRole(user) {
  if (isAdminRole(user?.role)) return true
  const role = String(user?.role || 'user').toLowerCase()
  return role === 'service' || role === 'manager'
}

/** Owner may edit own card; elevated roles may edit any card. Unowned (public) cards: elevated roles only. */
function canMutateJobCard(jobCard, user) {
  if (jobCardMutateRole(user)) return true
  const userId = user?.sub || user?.id || null
  if (!userId) return false
  if (jobCard.ownerId && jobCard.ownerId === userId) return true
  return false
}

function isTerminalJobCardStatus(s) {
  return s === 'submitted' || s === 'completed'
}

const ALLOWED_JOB_CARD_STATUSES = new Set([
  'draft',
  'open',
  'submitted',
  'ready_for_invoice',
  'completed',
  'cancelled'
])
const BILLING_RECIPIENT_KEYWORDS = ['bianca', 'gareth', 'garethm', 'greg']

function normalizeJobCardStatus(status, fallback = 'draft') {
  if (status === undefined || status === null || String(status).trim() === '') return fallback
  const normalized = String(status).trim().toLowerCase().replace(/\s+/g, '_')
  return ALLOWED_JOB_CARD_STATUSES.has(normalized) ? normalized : null
}

const BILLING_PDF_HEADING_PREFIX = 'Heading:'
const BILLING_PDF_PROJECT_PREFIX = 'Project Association:'

function billingPdfParseJson(str, defaultValue = []) {
  try {
    if (!str) return defaultValue
    return typeof str === 'string' ? JSON.parse(str) : str
  } catch {
    return defaultValue
  }
}

async function loadBillingPdfBranding(prismaClient) {
  const system = await prismaClient.systemSettings.findUnique({ where: { id: 'system' } })
  const companyName = (system?.companyName && String(system.companyName).trim()) || 'Abcotronics'
  let letterhead = {}
  try {
    const raw = system?.poLetterheadJson
    letterhead = raw && typeof raw === 'string' ? JSON.parse(raw) : {}
  } catch {
    letterhead = {}
  }
  if (!letterhead || typeof letterhead !== 'object') letterhead = {}
  return { companyName, letterhead }
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

function technicianNotesFromOtherComments(rawComments) {
  if (!rawComments || typeof rawComments !== 'string') return ''
  const kept = []
  for (const line of rawComments.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith(BILLING_PDF_HEADING_PREFIX)) continue
    if (t.startsWith(BILLING_PDF_PROJECT_PREFIX)) continue
    if (t.startsWith('Customer:') || t.startsWith('Position:') || t.startsWith('Feedback:') || t.startsWith('Signature:')) {
      continue
    }
    kept.push(line)
  }
  return kept.join('\n').trim()
}

function formatPdfMoneyZar(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'R 0.00'
  return `R ${amount.toFixed(2)}`
}

function parseJobCardLatLng(jobCard) {
  if (!jobCard) return null
  const parseCoordinate = (value) => {
    if (value == null) return null
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }
  const lat = parseCoordinate(jobCard.locationLatitude)
  const lng = parseCoordinate(jobCard.locationLongitude)
  if (lat == null || lng == null) return null
  return { lat, lng }
}

function stockRowsForBillingPdf(jobCard) {
  const raw = billingPdfParseJson(jobCard?.stockUsed, [])
  if (!Array.isArray(raw)) return []
  return raw
}

function materialsRowsForBillingPdf(jobCard) {
  const raw = billingPdfParseJson(jobCard?.materialsBought, [])
  if (!Array.isArray(raw)) return []
  return raw
}

async function fetchImageBufferForBillingPdf(url, timeoutMs = 8000) {
  if (!url || typeof url !== 'string') return null
  const u = url.trim()
  if (/^data:image\/(png|jpeg|jpg);base64,/i.test(u)) {
    try {
      const b64 = u.split(',')[1]
      return Buffer.from(b64, 'base64')
    } catch {
      return null
    }
  }
  if (!/^https:\/\//i.test(u)) return null
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

async function loadBillingPdfSignatureBuffer(photosJson) {
  const url = extractSignatureDataUrlFromPhotos(billingPdfParseJson(photosJson, []))
  if (!url) return null
  return fetchImageBufferForBillingPdf(url)
}

async function loadBillingPdfImageBuffers(photosJson, { maxImages = 8 } = {}) {
  const photos = billingPdfParseJson(photosJson, [])
  if (!Array.isArray(photos)) return []
  const out = []
  for (const p of photos) {
    if (out.length >= maxImages) break
    if (!p || typeof p !== 'object') continue
    if (p.kind === 'signature') continue
    const url = typeof p.url === 'string' ? p.url : ''
    const isVideo =
      /^data:video\//i.test(url) ||
      /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ||
      String(p.mediaType || '').toLowerCase().includes('video')
    if (isVideo) continue
    const buf = await fetchImageBufferForBillingPdf(url)
    if (buf) out.push(buf)
  }
  return out
}

async function resolveBillingRecipients(prismaClient) {
  const envEmails = String(process.env.BILLING_RECIPIENT_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const users = await prismaClient.user.findMany({
    select: { id: true, name: true, email: true },
    where: {
      OR: BILLING_RECIPIENT_KEYWORDS.flatMap((kw) => [
        { name: { contains: kw, mode: 'insensitive' } },
        { email: { contains: kw, mode: 'insensitive' } }
      ])
    }
  })

  const emailSet = new Set(envEmails)
  const inAppUsers = []
  for (const user of users) {
    const email = String(user.email || '').trim().toLowerCase()
    if (email) emailSet.add(email)
    inAppUsers.push(user)
  }

  return {
    emails: Array.from(emailSet),
    users: inAppUsers
  }
}

function billingBrandTextAlign(brandTextX, left) {
  return brandTextX > left ? 'right' : 'left'
}

function drawBillingPdfMetaCell(doc, x, y, cellW, label, value) {
  const labelText = String(label || '').toUpperCase()
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text(labelText, x, y, { width: cellW })
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(String(value ?? '—'), x, y + 12, { width: cellW })
}

async function buildJobCardBillingPdf(prismaClient, jobCard) {
  const { companyName, letterhead } = await loadBillingPdfBranding(prismaClient)
  const heading = extractHeadingFromOtherComments(jobCard.otherComments)
  const additionalNotes = technicianNotesFromOtherComments(jobCard.otherComments)
  const stockRows = stockRowsForBillingPdf(jobCard)
  const materialRows = materialsRowsForBillingPdf(jobCard)
  const coords = parseJobCardLatLng(jobCard)
  const customerSignoff = resolveCustomerSignoffFields(jobCard)
  const signatureBuffer = customerSignoff.signatureDataUrl
    ? await loadBillingPdfSignatureBuffer([
        { kind: 'signature', url: customerSignoff.signatureDataUrl }
      ])
    : await loadBillingPdfSignatureBuffer(jobCard.photos)
  const imageBuffers = await loadBillingPdfImageBuffers(jobCard.photos, { maxImages: 12 })

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const contentW = right - left

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
      align: brandTextX > left ? 'right' : 'left'
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
    doc
      .strokeColor('#2563eb')
      .lineWidth(2)
      .moveTo(left, underlineY)
      .lineTo(right, underlineY)
      .stroke()
    doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(16).text('JOB CARD REPORT', left, underlineY + 12, {
      width: contentW
    })

    const gridTop = underlineY + 36
    const colW = contentW / 3
    drawBillingPdfMetaCell(doc, left, gridTop, colW - 6, 'Job card number', jobCard.jobCardNumber || jobCard.id || '—')
    drawBillingPdfMetaCell(doc, left + colW, gridTop, colW - 6, 'Client', jobCard.clientName || '—')
    drawBillingPdfMetaCell(doc, left + colW * 2, gridTop, colW - 6, 'Site', jobCard.siteName || '—')

    const gridRow2Y = gridTop + 44
    drawBillingPdfMetaCell(doc, left, gridRow2Y, colW - 6, 'Technician', jobCard.agentName || '—')
    drawBillingPdfMetaCell(doc, left + colW, gridRow2Y, colW - 6, 'Status', String(jobCard.status || 'draft').toUpperCase())
    drawBillingPdfMetaCell(
      doc,
      left + colW * 2,
      gridRow2Y,
      colW - 6,
      'Created',
      formatPdfDateSast(jobCard.startedAt || jobCard.createdAt)
    )

    const gridRow3Y = gridRow2Y + 44
    drawBillingPdfMetaCell(doc, left, gridRow3Y, colW - 6, 'Printed', formatPdfDateSast(new Date()))

    let contentY = gridRow3Y + 52
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Visit narrative', left, contentY, { width: contentW })
    contentY += 16
    doc.font('Helvetica').fontSize(10)
    const kv = (k, v) => {
      doc.font('Helvetica-Bold').text(`${k}: `, left, contentY, { continued: true })
      doc.font('Helvetica').text(String(v || '—'), { width: contentW })
      contentY = doc.y + 2
    }
    kv('Heading', heading || '—')
    kv('Call out category', jobCard.callOutCategory || '—')
    kv('Reason for visit', jobCard.reasonForVisit || '—')
    kv('Diagnosis', jobCard.diagnosis || '—')
    kv('Work Done / Carried Out', jobCard.actionsTaken || '—')
    kv('Future actions', jobCard.futureWorkRequired || '—')
    if (additionalNotes) {
      doc.font('Helvetica-Bold').text('Additional notes: ', left, contentY, { continued: true, width: contentW })
      doc.font('Helvetica').text(additionalNotes, { width: contentW })
      contentY = doc.y + 4
    }

    if (hasCustomerSignoffContent(customerSignoff)) {
      contentY += 8
      if (contentY > doc.page.height - 160) {
        doc.addPage()
        contentY = doc.page.margins.top
      }
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Customer sign-off', left, contentY, {
        width: contentW
      })
      contentY += 16
      doc.font('Helvetica').fontSize(10)
      const signKv = (k, v) => {
        doc.font('Helvetica-Bold').text(`${k}: `, left, contentY, { continued: true })
        doc.font('Helvetica').text(String(v || '—'), { width: contentW })
        contentY = doc.y + 2
      }
      signKv('Signatory name', customerSignoff.name || '—')
      signKv('Role / title', customerSignoff.position || '—')
      signKv('Customer feedback', customerSignoff.feedback || '—')
      if (customerSignoff.signatureLabel) {
        signKv('Signature status', customerSignoff.signatureLabel)
      }
      if (signatureBuffer) {
        try {
          if (contentY > doc.page.height - 100) {
            doc.addPage()
            contentY = doc.page.margins.top
          }
          doc.image(signatureBuffer, left, contentY, { fit: [220, 90] })
          contentY += 98
        } catch {
          doc.fillColor('#6b7280')
            .font('Helvetica-Oblique')
            .text('Signature image could not be embedded.', left, contentY, { width: contentW })
          contentY = doc.y + 4
          doc.fillColor('#111827').font('Helvetica')
        }
      } else if (customerSignoff.signatureLabel) {
        doc.fillColor('#6b7280')
          .font('Helvetica-Oblique')
          .text(
            `Signature marked ${customerSignoff.signatureLabel} but image not on file.`,
            left,
            contentY,
            { width: contentW }
          )
        contentY = doc.y + 4
        doc.fillColor('#111827').font('Helvetica')
      }
    }

    contentY += 8
    doc.font('Helvetica-Bold').fontSize(11).text('Travel and costs', left, contentY, { width: contentW })
    contentY += 14
    doc.font('Helvetica').fontSize(10)
    const travelKv = (k, v) => {
      doc.font('Helvetica-Bold').text(`${k}: `, left, contentY, { continued: true })
      doc.font('Helvetica').text(String(v || '—'), { width: contentW })
      contentY = doc.y + 2
    }
    travelKv('Vehicle', jobCard.vehicleUsed || 'Not specified')
    travelKv(
      'Kilometers',
      `${jobCard.kmReadingBefore ?? '—'} -> ${jobCard.kmReadingAfter ?? '—'}`
    )
    const travelKm = Number(jobCard.travelKilometers)
    travelKv('Travel distance', Number.isFinite(travelKm) ? `${travelKm.toFixed(1)} km` : '—')
    travelKv('Total materials cost', formatPdfMoneyZar(jobCard.totalMaterialsCost ?? 0))

    contentY += 8
    doc.font('Helvetica-Bold').fontSize(11).text('Stock used', left, contentY, { width: contentW })
    contentY += 14
    const tableLeft = left
    const tableW = contentW
    const colStock = [tableLeft, tableLeft + tableW * 0.28, tableLeft + tableW * 0.45, tableLeft + tableW * 0.62]
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151')
    doc.text('Item', colStock[0], contentY, { width: colStock[1] - colStock[0] - 4 })
    doc.text('SKU', colStock[1], contentY, { width: colStock[2] - colStock[1] - 4 })
    doc.text('Qty', colStock[2], contentY, { width: colStock[3] - colStock[2] - 4 })
    doc.text('Location', colStock[3], contentY, { width: tableLeft + tableW - colStock[3] })
    contentY += 12
    doc.fillColor('#111827').font('Helvetica').fontSize(9)
    if (stockRows.length === 0) {
      doc.fillColor('#6b7280').font('Helvetica-Oblique').text('No stock lines recorded.', tableLeft, contentY, {
        width: tableW
      })
      contentY = doc.y + 6
      doc.fillColor('#111827').font('Helvetica')
    } else {
      for (const item of stockRows) {
        if (typeof item === 'string' || typeof item === 'number') {
          doc.text(String(item), tableLeft, contentY, { width: tableW })
          contentY = doc.y + 4
          continue
        }
        const qty = item?.quantity != null && item.quantity !== '' ? String(item.quantity) : '—'
        doc.text(String(item?.itemName || item?.sku || 'Item'), colStock[0], contentY, {
          width: colStock[1] - colStock[0] - 4
        })
        doc.text(String(item?.sku || '—'), colStock[1], contentY, { width: colStock[2] - colStock[1] - 4 })
        doc.text(qty, colStock[2], contentY, { width: colStock[3] - colStock[2] - 4 })
        doc.text(String(item?.locationName || item?.locationId || '—'), colStock[3], contentY, {
          width: tableLeft + tableW - colStock[3]
        })
        contentY += 14
      }
    }

    contentY += 10
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Purchases', left, contentY, { width: contentW })
    contentY += 14
    const colPur = [tableLeft, tableLeft + tableW * 0.38, tableLeft + tableW * 0.78]
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151')
    doc.text('Item', colPur[0], contentY, { width: colPur[1] - colPur[0] - 4 })
    doc.text('Reason / Description', colPur[1], contentY, { width: colPur[2] - colPur[1] - 4 })
    doc.text('Cost', colPur[2], contentY, { width: tableLeft + tableW - colPur[2], align: 'right' })
    contentY += 12
    doc.font('Helvetica').fontSize(9).fillColor('#111827')
    if (materialRows.length === 0) {
      doc.fillColor('#6b7280').font('Helvetica-Oblique').text('No purchase lines recorded.', tableLeft, contentY, {
        width: tableW
      })
      contentY = doc.y + 6
      doc.fillColor('#111827').font('Helvetica')
    } else {
      for (const item of materialRows) {
        if (typeof item === 'string' || typeof item === 'number') {
          doc.text(String(item), tableLeft, contentY, { width: tableW })
          contentY = doc.y + 4
          continue
        }
        doc.text(String(item?.itemName || 'Purchase'), colPur[0], contentY, {
          width: colPur[1] - colPur[0] - 4
        })
        doc.text(String(item?.reason || item?.description || '—'), colPur[1], contentY, {
          width: colPur[2] - colPur[1] - 4
        })
        const costStr =
          item?.cost != null && item?.cost !== ''
            ? formatPdfMoneyZar(item.cost)
            : '—'
        doc.text(costStr, colPur[2], contentY, {
          width: tableLeft + tableW - colPur[2],
          align: 'right'
        })
        contentY += 14
      }
    }

    contentY += 10
    doc.font('Helvetica-Bold').fontSize(11).text('Map', left, contentY, { width: contentW })
    contentY += 14
    doc.font('Helvetica').fontSize(10)
    doc.font('Helvetica-Bold').text('Site: ', left, contentY, { continued: true })
    doc.font('Helvetica').text(String(jobCard.siteName || '—'), { width: contentW })
    contentY = doc.y + 4
    doc.font('Helvetica-Bold').text('Location: ', left, contentY, { continued: true })
    doc.font('Helvetica').text(String(jobCard.location || '—'), { width: contentW })
    contentY = doc.y + 4
    if (coords) {
      doc.font('Helvetica-Bold').text('Coordinates: ', left, contentY, { continued: true })
      doc.font('Helvetica').text(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`, { width: contentW })
    } else {
      doc.fillColor('#6b7280').font('Helvetica-Oblique').text('No GPS coordinates recorded.', left, contentY, {
        width: contentW
      })
    }
    contentY = doc.y + 10

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Site photos', left, contentY, { width: contentW })
    contentY += 14
    doc.font('Helvetica').fontSize(10)
    if (imageBuffers.length === 0) {
      doc.fillColor('#6b7280').font('Helvetica-Oblique').text(
        'No images were available for this job card.',
        left,
        contentY,
        { width: contentW }
      )
      contentY = doc.y + 6
    } else {
      doc.fillColor('#111827')
      for (const imgBuf of imageBuffers) {
        try {
          const imgY = contentY
          if (imgY > doc.page.height - 200) {
            doc.addPage()
            contentY = doc.page.margins.top
          }
          doc.image(imgBuf, left, contentY, { fit: [(contentW - 10) / 2, 140], align: 'left' })
          contentY += 150
        } catch {
          /* skip corrupt image */
        }
      }
    }

    doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
    doc.text(`${companyName} • Job Card ${jobCard.jobCardNumber || jobCard.id || ''}`, left, doc.page.height - 54, {
      width: contentW,
      align: 'center'
    })

    doc.end()
  })
}

async function notifyBillingRecipientsForJobCard(prismaClient, jobCard) {
  const { emails, users } = await resolveBillingRecipients(prismaClient)
  if (emails.length === 0 && users.length === 0) return

  const appUrl = getAppUrl()
  const jobCardLink = `${appUrl}/#/service-maintenance/${encodeURIComponent(jobCard.id)}`
  const title = `Job card ${jobCard.jobCardNumber || jobCard.id} is ready for invoice`
  const body =
    `A job card has been marked as Ready for Invoice.<br/>` +
    `<br/><strong>Client:</strong> ${String(jobCard.clientName || '—')}<br/>` +
    `<strong>Technician:</strong> ${String(jobCard.agentName || '—')}<br/>` +
    `<strong>Status:</strong> ${String(jobCard.status || 'ready_for_invoice')}<br/>` +
    `<br/><a href="${jobCardLink}">Open job card in ERP</a>`

  if (users.length > 0) {
    await prismaClient.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: 'invoice',
        title,
        message: `${title}.`,
        link: `#/service-maintenance/${encodeURIComponent(jobCard.id)}`,
        metadata: JSON.stringify({
          source: 'job_card_ready_for_invoice',
          jobCardId: jobCard.id,
          jobCardNumber: jobCard.jobCardNumber || null
        }),
        read: false
      }))
    })
  }

  if (emails.length > 0) {
    const pdfBuffer = await buildJobCardBillingPdf(prismaClient, jobCard)
    const safeNumber = String(jobCard.jobCardNumber || jobCard.id || 'job-card').replace(/[^a-zA-Z0-9_-]/g, '_')
    await sendEmail({
      to: emails,
      subject: title,
      html: `<p>${body}</p>`,
      text: `${title}\n\nClient: ${jobCard.clientName || '—'}\nTechnician: ${jobCard.agentName || '—'}\nLink: ${jobCardLink}`,
      attachments: [
        {
          filename: `${safeNumber}.pdf`,
          contentType: 'application/pdf',
          contentBase64: pdfBuffer.toString('base64')
        }
      ]
    })
  }
}

function parseFiniteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseOptionalDate(value) {
  if (!value) return null
  const dt = value instanceof Date ? value : new Date(value)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function parseNonNegativeFiniteNumber(value, fieldName) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${fieldName} must be a finite number >= 0`)
  }
  return n
}

function parseCreatedToInclusive(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
  }
  const dt = new Date(raw)
  return Number.isNaN(dt.getTime()) ? null : dt
}

async function resolveActorDisplayName(prismaClient, req) {
  const uid = req.user?.sub || req.user?.id
  if (!uid) return req.user?.name || req.user?.email || 'User'
  try {
    const u = await prismaClient.user.findUnique({
      where: { id: String(uid) },
      select: { name: true, email: true }
    })
    if (u) return u.name || u.email || 'User'
  } catch {
    /* non-fatal */
  }
  return req.user?.name || req.user?.email || 'User'
}

async function insertJobCardActivity(prismaClient, { jobCardId, req, action, metadata, source = 'web' }) {
  return insertJobCardActivityFromRequest(prismaClient, req, { jobCardId, action, metadata, source })
}

/**
 * Ensures at least one JobCardActivity row exists (legacy cards or edge cases with no events).
 */
async function ensureMinimumJobCardActivity(prismaClient, jobCardId) {
  return prismaClient.$transaction(async tx => {
    const n = await tx.jobCardActivity.count({ where: { jobCardId } })
    if (n > 0) return

    const jc = await tx.jobCard.findUnique({ where: { id: jobCardId } })
    if (!jc) return

    let actorName = ''
    const aid = jc.ownerId
    if (aid) {
      const u = await tx.user.findUnique({
        where: { id: String(aid) },
        select: { name: true, email: true }
      })
      if (u) {
        actorName = u.name && String(u.name).trim() ? u.name.trim() : u.email || ''
      }
    }

    await tx.jobCardActivity.create({
      data: {
        jobCardId,
        actorUserId: aid ? String(aid) : null,
        actorName: actorName || (aid ? 'User' : '—'),
        action: 'baseline_record',
        source: 'system',
        metadata: {
          note:
            'Baseline entry for this job card (no detailed activity was stored earlier, or the card predates activity logging).'
        },
        createdAt: jc.createdAt || new Date()
      }
    })
  })
}

const LIST_SORT_WHITELIST = {
  createdAt: true,
  updatedAt: true,
  jobCardNumber: true,
  clientName: true,
  status: true,
  agentName: true,
  reasonForVisit: true,
  callOutCategory: true
}

/** List responses only: keeps mobile list/search payloads small (full text comes from GET /api/jobcards/:id). */
const LIST_TEXT_PREVIEW_MAX = 420

function truncateJobCardListText(value, max = LIST_TEXT_PREVIEW_MAX) {
  if (value == null) return ''
  const s = String(value)
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

/**
 * Prisma select for GET one — all JobCard scalars except safetyCultureSnapshotJson
 * (import blob; never needed by the client and can be multi‑MB from DB).
 */
const JOB_CARD_GET_ONE_SELECT = {
  id: true,
  jobCardNumber: true,
  agentName: true,
  otherTechnicians: true,
  clientId: true,
  clientName: true,
  siteId: true,
  siteName: true,
  location: true,
  timeOfDeparture: true,
  timeOfArrival: true,
  vehicleUsed: true,
  kmReadingBefore: true,
  kmReadingAfter: true,
  travelKilometers: true,
  reasonForVisit: true,
  callOutCategory: true,
  diagnosis: true,
  futureWorkRequired: true,
  futureWorkScheduledAt: true,
  otherComments: true,
  photos: true,
  status: true,
  submittedAt: true,
  completedAt: true,
  startedAt: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  actionsTaken: true,
  materialsBought: true,
  stockUsed: true,
  totalMaterialsCost: true,
  arrivalBackAtOffice: true,
  departureFromSite: true,
  locationLatitude: true,
  locationLongitude: true,
  totalTimeMinutes: true,
  vehicleId: true,
  safetyCultureAuditId: true,
  safetyCultureIssueId: true,
  completedByUserId: true,
  completedByName: true
}

/** Same as JOB_CARD_GET_ONE_SELECT but skips `photos` (multi‑MB JSON) for fast detail shell loads. */
const JOB_CARD_GET_ONE_LITE_SELECT = (() => {
  const s = { ...JOB_CARD_GET_ONE_SELECT }
  delete s.photos
  return s
})()

async function handler(req, res) {
  // Strip query parameters before splitting
  const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
  const pathSegments = urlPath.split('/').filter(Boolean)
  const resourceType = pathSegments[0] // jobcards (direct endpoint, not nested like /api/manufacturing/*)
  const id = pathSegments[1]
  const subResource = pathSegments[2]
  const urlPathRaw = req.url.split('?')[0].split('#')[0]

  const auditManufacturing = (action, resource, entityId, details = {}) => {
    void logAuditFromRequest(prisma, req, {
      action,
      entity: 'manufacturing',
      entityId: entityId != null && String(entityId) !== '' ? String(entityId) : String(resource),
      details: {
        resource,
        method: req.method,
        path: urlPathRaw,
        ...details
      }
    })
  }

  const scheduleJobCardStockMovementSync = async (jobCardRow) => {
    if (!jobCardRow?.id) return
    const actorName = await resolveActorDisplayName(prisma, req)
    void syncJobCardStockMovements(prisma, {
      jobCard: jobCardRow,
      performedBy: actorName || jobCardRow.agentName || 'System',
      applyJobCardDate: true,
      audit: (action, entityId, details) => {
        auditManufacturing(action, 'stock-movements', entityId, {
          source: 'job_card_sync',
          jobCardId: jobCardRow.id,
          jobCardNumber: jobCardRow.jobCardNumber,
          ...details
        })
      }
    }).catch((err) => {
      console.warn('syncJobCardStockMovements failed (non-fatal):', err?.message || err)
    })
  }

  // Helper to read pagination params from the query string
  const getPagination = (allowLargePageSize = false) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const rawPage = parseInt(url.searchParams.get('page') || '1', 10)
      const rawPageSize = parseInt(url.searchParams.get('pageSize') || '50', 10)

      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
      // Keep page size within a safe range to avoid overloading the dashboard
      // Allow larger page sizes when filtering by clientId (for client detail views)
      let pageSize =
        Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 50
      const maxPageSize = allowLargePageSize ? 1000 : 100
      pageSize = Math.max(10, Math.min(pageSize, maxPageSize))

      return { page, pageSize }
    } catch {
      // Fallback to sensible defaults if URL parsing fails for any reason
      return { page: 1, pageSize: 50 }
    }
  }

  // Helper to parse JSON fields
  const parseJson = (str, defaultValue = []) => {
    try {
      if (!str) return defaultValue
      return typeof str === 'string' ? JSON.parse(str) : str
    } catch {
      return defaultValue
    }
  }

  // Helper to format dates
  const formatDate = (date) => {
    if (!date) return null
    if (date instanceof Date) return date.toISOString()
    return new Date(date).toISOString()
  }
  
  // Helper to format dates for datetime-local inputs (YYYY-MM-DDTHH:mm)
  const formatDateTimeLocal = (date) => {
    if (!date) return null
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d.getTime())) return null
    // Format as YYYY-MM-DDTHH:mm for datetime-local input
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // JOB CARDS
  if (resourceType === 'jobcards' && !subResource) {
    // LIST (GET /api/jobcards)
    if (req.method === 'GET' && !id) {
      try {
        // Support filtering by clientId or clientName via query parameters
        const url = new URL(req.url, 'http://localhost')
        const clientId = url.searchParams.get('clientId')
        const clientName = url.searchParams.get('clientName')
        const callOutCategory = (url.searchParams.get('callOutCategory') || '').trim()
        const statusParam = url.searchParams.get('status')
        const jobCardNumberParam = normalizeJobCardNumberToken(
          url.searchParams.get('jobCardNumber') || ''
        )
        let searchQ = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim()
        const normalizedSearchQ = normalizeJobCardNumberToken(searchQ)
        if (normalizedSearchQ && /^JC\d{4}$/.test(normalizedSearchQ)) {
          searchQ = normalizedSearchQ
        }
        const sortFieldRaw = url.searchParams.get('sortField') || 'createdAt'
        const sortDirectionRaw =
          url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc'

        const mineParam =
          url.searchParams.get('mine') === '1' ||
          String(url.searchParams.get('mine') || '').toLowerCase() === 'true'
        const ownerIdParamRaw = (url.searchParams.get('ownerId') || '').trim()
        const createdByNameRaw = (url.searchParams.get('createdByName') || '').trim()
        const createdFromRaw = (url.searchParams.get('createdFrom') || '').trim()
        const createdToRaw = (url.searchParams.get('createdTo') || '').trim()
        const siteFilterRaw = (url.searchParams.get('site') || url.searchParams.get('siteName') || '').trim()
        const locationFilterRaw = (url.searchParams.get('location') || '').trim()
        const agentNameFilterRaw = (
          url.searchParams.get('agentName') ||
          url.searchParams.get('technician') ||
          ''
        ).trim()
        const includeStockUsed =
          url.searchParams.get('includeStockUsed') === '1' ||
          String(url.searchParams.get('includeStockUsed') || '').toLowerCase() === 'true'
        const withStockUsedOnly =
          url.searchParams.get('withStockUsedOnly') === '1' ||
          String(url.searchParams.get('withStockUsedOnly') || '').toLowerCase() === 'true'
        const usageFilterRaw = (
          url.searchParams.get('usageFilter') ||
          url.searchParams.get('stockMaterials') ||
          ''
        ).trim()
        const includeTotal =
          url.searchParams.get('includeTotal') === '1' ||
          String(url.searchParams.get('includeTotal') || '').toLowerCase() === 'true'
        const omitFormCounts =
          url.searchParams.get('omitFormCounts') === '1' ||
          String(url.searchParams.get('omitFormCounts') || '').toLowerCase() === 'true'
        const needUsageJsonFields =
          includeStockUsed ||
          !!usageFilterRaw
        const listFieldsParam = (url.searchParams.get('listFields') || '').trim().toLowerCase()
        const useTableListFields =
          listFieldsParam === 'table' ||
          (listFieldsParam !== 'full' && (omitFormCounts || !includeStockUsed))

        function looksLikeJobCardOwnerId(value) {
          if (!value || typeof value !== 'string') return false
          const v = value.trim()
          if (v.length < 8 || v.length > 128) return false
          return /^[a-zA-Z0-9_-]+$/.test(v)
        }

        // Allow larger page sizes when filtering by client (for client detail views), text search, or narrow filters
        const allowLargePageSize = !!(
          clientId ||
          clientName ||
          callOutCategory ||
          searchQ ||
          siteFilterRaw ||
          locationFilterRaw ||
          agentNameFilterRaw ||
          mineParam ||
          ownerIdParamRaw ||
          createdByNameRaw ||
          createdFromRaw ||
          createdToRaw ||
          includeStockUsed ||
          usageFilterRaw
        )
        const { page, pageSize } = getPagination(allowLargePageSize)
        const owner = req.user?.sub

        // Build where clause for filtering
        // For clientName, use case-insensitive partial matching
        const baseFilters = {}
        if (clientId) {
          baseFilters.clientId = clientId
        } else if (clientName) {
          // Use case-insensitive contains search for clientName to catch variations
          // e.g., "AccuFarm" matches "AccuFarm (Pty) Ltd" and vice versa
          baseFilters.clientName = {
            contains: clientName,
            mode: 'insensitive'
          }
        }
        if (statusParam && statusParam !== 'all') {
          baseFilters.status = statusParam
        }
        if (callOutCategory) {
          baseFilters.callOutCategory = {
            equals: callOutCategory,
            mode: 'insensitive'
          }
        }
        if (jobCardNumberParam && /^JC\d{4}$/.test(jobCardNumberParam)) {
          baseFilters.jobCardNumber = jobCardNumberParam
        }
        if (withStockUsedOnly && !usageFilterRaw) {
          baseFilters.stockUsed = { notIn: ['[]', ''] }
        }

        if (mineParam && owner) {
          baseFilters.ownerId = String(owner)
        } else if (ownerIdParamRaw && looksLikeJobCardOwnerId(ownerIdParamRaw)) {
          baseFilters.ownerId = ownerIdParamRaw
        } else if (createdByNameRaw) {
          const ownerFilter = await resolveJobCardOwnerFilterByCreatorName(prisma, createdByNameRaw)
          if (ownerFilter) Object.assign(baseFilters, ownerFilter)
        }

        const createdRange = {}
        if (createdFromRaw) {
          const d = new Date(createdFromRaw)
          if (!Number.isNaN(d.getTime())) createdRange.gte = d
        }
        if (createdToRaw) {
          const d = parseCreatedToInclusive(createdToRaw)
          if (d) createdRange.lte = d
        }
        if (Object.keys(createdRange).length > 0) {
          baseFilters.createdAt = createdRange
        }

        const whereClause = buildJobCardListWhereClause(baseFilters, {
          searchQ,
          site: siteFilterRaw,
          location: locationFilterRaw,
          agentName: agentNameFilterRaw,
          usageFilter: usageFilterRaw || undefined
        })

        const sortField = LIST_SORT_WHITELIST[sortFieldRaw] ? sortFieldRaw : 'createdAt'
        const orderBy = { [sortField]: sortDirectionRaw }

        // Limit the number of job cards returned and support simple pagination
        // to keep the dashboard fast even as history grows.
        const listSelectFull = {
          id: true,
          jobCardNumber: true,
          agentName: true,
          clientId: true,
          clientName: true,
          siteId: true,
          siteName: true,
          location: true,
          status: true,
          reasonForVisit: true,
          callOutCategory: true,
          otherComments: true,
          ownerId: true,
          completedByUserId: true,
          completedByName: true,
          createdAt: true,
          updatedAt: true,
          totalTimeMinutes: true,
          travelKilometers: true,
          kmReadingBefore: true,
          kmReadingAfter: true,
          totalMaterialsCost: true,
          vehicleUsed: true,
          timeOfDeparture: true,
          timeOfArrival: true,
          departureFromSite: true,
          arrivalBackAtOffice: true,
          submittedAt: true,
          completedAt: true,
          startedAt: true,
          safetyCultureIssueId: true,
          safetyCultureAuditId: true,
          ...(needUsageJsonFields ? { stockUsed: true, materialsBought: true } : {})
        }

        const listSelectBase = useTableListFields ? JOB_CARD_LIST_TABLE_SELECT : listSelectFull

        const totalItemsPromise = includeTotal
          ? prisma.jobCard.count({ where: whereClause })
          : null

        const listSelect = {
          ...listSelectBase,
          ...(includeStockUsed ? { stockUsed: true } : {})
        }

        const findTake = includeTotal ? pageSize : pageSize + 1

        let jobCards
        const listSelectWithCounts = omitFormCounts
          ? listSelect
          : {
              ...listSelect,
              _count: {
                select: { serviceForms: true }
              }
            }
        try {
          jobCards = await prisma.jobCard.findMany({
            where: whereClause,
            select: listSelectWithCounts,
            orderBy,
            skip: (page - 1) * pageSize,
            take: findTake
          })
        } catch (err) {
          if (!isMissingServiceFormInstanceTables(err)) throw err
          jobCards = await prisma.jobCard.findMany({
            where: whereClause,
            select: { ...listSelect },
            orderBy,
            skip: (page - 1) * pageSize,
            take: findTake
          })
        }
        if (!omitFormCounts) {
          jobCards = jobCards.map((row) => ({
            ...row,
            _count: row._count || { serviceForms: 0 }
          }))
        } else {
          jobCards = jobCards.map((row) => ({
            ...row,
            _count: { serviceForms: 0 }
          }))
        }

        let hasMore = false
        if (!includeTotal && jobCards.length > pageSize) {
          hasMore = true
          jobCards = jobCards.slice(0, pageSize)
        }

        const totalItems = totalItemsPromise ? await totalItemsPromise : null

        const headingById = useTableListFields
          ? await fetchJobCardListHeadingsByIds(
              prisma,
              jobCards.map((row) => row.id)
            )
          : null

        // Format dates for response; flatten checklist count for clients
        const formatted = jobCards.map((jobCard) => {
          const {
            _count,
            otherComments,
            stockUsed: stockUsedRaw,
            materialsBought: materialsBoughtRaw,
            ...rest
          } = jobCard
          const heading = useTableListFields
            ? (headingById?.get(String(jobCard.id)) || '')
            : rest.heading != null && String(rest.heading).trim() !== ''
              ? String(rest.heading).trim()
              : extractHeadingFromOtherComments(otherComments)
          const row = {
            ...rest,
            heading,
            hasStockUsage: needUsageJsonFields
              ? jobCardJsonFieldHasEntries(stockUsedRaw)
              : false,
            hasMaterialsBought: needUsageJsonFields
              ? jobCardJsonFieldHasEntries(materialsBoughtRaw)
              : typeof rest.totalMaterialsCost === 'number' && rest.totalMaterialsCost > 0,
            serviceFormsCount: typeof _count?.serviceForms === 'number' ? _count.serviceForms : 0,
            reasonForVisit: truncateJobCardListText(rest.reasonForVisit),
            location: truncateJobCardListText(rest.location),
            createdAt: formatDate(rest.createdAt),
            startedAt: formatDate(rest.startedAt),
            ...(useTableListFields
              ? {}
              : {
                  updatedAt: formatDate(rest.updatedAt),
                  submittedAt: formatDate(rest.submittedAt),
                  completedAt: formatDate(rest.completedAt),
                  timeOfDeparture: formatDate(rest.timeOfDeparture),
                  timeOfArrival: formatDate(rest.timeOfArrival),
                  departureFromSite: formatDate(rest.departureFromSite),
                  arrivalBackAtOffice: formatDate(rest.arrivalBackAtOffice)
                })
          }
          if (includeStockUsed) {
            row.stockUsed = parseJson(stockUsedRaw, [])
          }
          return row
        })

        const enriched = await enrichJobCardRowsSiteNames(prisma, formatted)
        
        const pagination = {
          page,
          pageSize,
          hasMore: includeTotal
            ? page * pageSize < (totalItems ?? 0)
            : hasMore
        }
        if (includeTotal && typeof totalItems === 'number') {
          pagination.totalItems = totalItems
          pagination.totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
        }

        return ok(res, {
          jobCards: enriched,
          pagination
        })
      } catch (error) {
        console.error('❌ Failed to list job cards:', error)
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to list job cards', error.message)
      }
    }

    // GET ONE (GET /api/jobcards/:id)
    if (req.method === 'GET' && id) {
      try {
        const reqUrl = new URL(req.url, 'http://localhost')
        const omitPhotos =
          reqUrl.searchParams.get('omitPhotos') === '1' ||
          reqUrl.searchParams.get('omitPhotos') === 'true'

        const row = await findJobCardByLookupParam(
          prisma,
          id,
          omitPhotos ? JOB_CARD_GET_ONE_LITE_SELECT : JOB_CARD_GET_ONE_SELECT
        )

        if (!row) {
          return notFound(res, 'Job card not found')
        }

        const jobCard = row

        let recordedByName = ''
        let recordedByEmail = ''
        if (jobCard.ownerId) {
          try {
            const ownerUser = await prisma.user.findUnique({
              where: { id: String(jobCard.ownerId) },
              select: { name: true, email: true }
            })
            if (ownerUser) {
              recordedByName = (ownerUser.name && String(ownerUser.name).trim())
                ? ownerUser.name.trim()
                : (ownerUser.email || '')
              recordedByEmail = ownerUser.email || ''
            }
          } catch {
            /* non-fatal */
          }
        }

        const [enrichedRow] = await enrichJobCardRowsSiteNames(prisma, [jobCard])

        const common = withComputedJobCardHeading({
          ...enrichedRow,
          recordedByName,
          recordedByEmail,
          otherTechnicians: parseJson(jobCard.otherTechnicians),
          stockUsed: parseJson(jobCard.stockUsed || '[]'),
          materialsBought: parseJson(jobCard.materialsBought || '[]'),
          futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
          timeOfDeparture: formatDate(jobCard.timeOfDeparture),
          timeOfArrival: formatDate(jobCard.timeOfArrival),
          submittedAt: formatDate(jobCard.submittedAt),
          completedAt: formatDate(jobCard.completedAt),
          startedAt: formatDate(jobCard.startedAt),
          createdAt: formatDate(jobCard.createdAt),
          updatedAt: formatDate(jobCard.updatedAt)
        })

        if (omitPhotos) {
          let customerSignature = common.customerSignature || ''
          try {
            const photoRow = await findJobCardByLookupParam(prisma, jobCard.id, { photos: true })
            if (photoRow?.photos) {
              customerSignature =
                extractSignatureDataUrlFromPhotos(parseJson(photoRow.photos)) || customerSignature
            }
          } catch {
            /* non-fatal — detail shell still loads */
          }
          return ok(res, {
            jobCard: {
              ...common,
              customerSignature,
              attachmentsPending: true
            }
          })
        }

        return ok(res, { 
          jobCard: {
            ...common,
            photos: parseJson(jobCard.photos)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get job card:', error)
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to get job card', error.message)
      }
    }

    // CREATE (POST /api/jobcards)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      try {
        const clientDraftId = String(body.clientDraftId || '').trim()
        if (clientDraftId) {
          const existingDraft = await findJobCardByClientDraftId(prisma, clientDraftId)
          if (existingDraft) {
            return created(res, {
              jobCard: withComputedJobCardHeading({
                ...existingDraft,
                otherTechnicians: parseJson(existingDraft.otherTechnicians),
                photos: parseJson(existingDraft.photos),
                stockUsed: parseJson(existingDraft.stockUsed || '[]'),
                materialsBought: parseJson(existingDraft.materialsBought || '[]'),
                futureWorkScheduledAt: formatDate(existingDraft.futureWorkScheduledAt),
                timeOfDeparture: formatDate(existingDraft.timeOfDeparture),
                timeOfArrival: formatDate(existingDraft.timeOfArrival),
                submittedAt: formatDate(existingDraft.submittedAt),
                completedAt: formatDate(existingDraft.completedAt),
                createdAt: formatDate(existingDraft.createdAt),
                updatedAt: formatDate(existingDraft.updatedAt)
              }),
              idempotentReplay: true
            })
          }
        }

        // Parse JSON fields
        const otherTechnicians = Array.isArray(body.otherTechnicians) 
          ? JSON.stringify(body.otherTechnicians) 
          : body.otherTechnicians || '[]'
        const photos = Array.isArray(body.photos) 
          ? JSON.stringify(body.photos) 
          : body.photos || '[]'
        const stockUsed =
          body.stockUsed !== undefined
            ? serializeJobCardStockUsedForDb(body.stockUsed)
            : '[]'
        const materialsBought = Array.isArray(body.materialsBought) 
          ? JSON.stringify(body.materialsBought) 
          : body.materialsBought || '[]'
        
        // Calculate travel kilometers
        const kmBefore = parseFiniteNumber(body.kmReadingBefore, 0)
        const kmAfter = parseFiniteNumber(body.kmReadingAfter, 0)
        const travelKilometers = Math.max(0, kmAfter - kmBefore)
        
        // Calculate total materials cost
        const totalMaterialsCost = Array.isArray(body.materialsBought)
          ? body.materialsBought.reduce((sum, item) => sum + parseFiniteNumber(item?.cost, 0), 0)
          : parseFiniteNumber(body.totalMaterialsCost, 0)

        const lat =
          body.locationLatitude != null && body.locationLatitude !== ''
            ? String(body.locationLatitude)
            : body.latitude != null && body.latitude !== ''
              ? String(body.latitude)
              : ''
        const lng =
          body.locationLongitude != null && body.locationLongitude !== ''
            ? String(body.locationLongitude)
            : body.longitude != null && body.longitude !== ''
              ? String(body.longitude)
              : ''

        /** Align with public job card API: optional customer lines appended for search/display */
        const mergeJobCardOtherComments = (b) =>
          mergeCustomerSignoffIntoOtherComments({
            otherComments: b.otherComments != null ? String(b.otherComments) : '',
            customerName: b.customerName,
            customerTitle: b.customerTitle,
            customerPosition: b.customerPosition,
            customerFeedback: b.customerFeedback,
            hasSignature: Boolean(b.customerSignature && String(b.customerSignature).trim())
          })

        const otherCommentsForCreate =
          finalizeJobCardOtherCommentsForSave({
            otherComments: mergeJobCardOtherComments(body),
            heading: body.heading,
            existingOtherComments: ''
          }) ?? mergeJobCardOtherComments(body)

        const statusForCreate = normalizeJobCardStatus(body.status, 'draft')
        if (!statusForCreate) {
          return badRequest(res, 'Invalid job card status')
        }

        let completedByUserId = null
        let completedByName = ''
        if (isTerminalJobCardStatus(statusForCreate)) {
          completedByUserId = req.user?.sub ? String(req.user.sub) : null
          completedByName = await resolveActorDisplayName(prisma, req)
        }

        const clientCreatedAt = parseOptionalDate(body.createdAt)
        const clientStartedAt =
          parseOptionalDate(body.startedAt) || clientCreatedAt

        let createSiteId = String(body.siteId || '').trim()
        let createSiteName = String(body.siteName || '').trim()
        if (createSiteId && !createSiteName) {
          createSiteName = (await resolveClientSiteName(prisma, createSiteId)) || ''
        }

        const buildCreateArgs = jobCardNumber => {
          const data = {
            jobCardNumber,
            agentName: body.agentName || '',
            otherTechnicians,
            clientId: body.clientId || null,
            clientName: body.clientName || '',
            siteId: createSiteId,
            siteName: createSiteName,
            location: body.location || '',
            locationLatitude: lat,
            locationLongitude: lng,
            timeOfDeparture: body.timeOfDeparture ? new Date(body.timeOfDeparture) : null,
            timeOfArrival: body.timeOfArrival ? new Date(body.timeOfArrival) : null,
            departureFromSite: body.departureFromSite ? new Date(body.departureFromSite) : null,
            totalTimeMinutes: (() => {
              const mins = parseInt(body.totalTimeMinutes, 10)
              return Number.isFinite(mins) && mins >= 0 ? mins : 0
            })(),
            vehicleUsed: body.vehicleUsed || '',
            kmReadingBefore: kmBefore,
            kmReadingAfter: kmAfter,
            travelKilometers,
            reasonForVisit: body.reasonForVisit || '',
            callOutCategory: body.callOutCategory || '',
            diagnosis: body.diagnosis || '',
            futureWorkRequired: body.futureWorkRequired || '',
            futureWorkScheduledAt: body.futureWorkScheduledAt ? new Date(body.futureWorkScheduledAt) : null,
            actionsTaken: body.actionsTaken || '',
            stockUsed,
            materialsBought,
            totalMaterialsCost,
            otherComments: otherCommentsForCreate,
            photos,
            status: statusForCreate,
            startedAt: clientStartedAt,
            submittedAt: body.submittedAt ? new Date(body.submittedAt) : null,
            completedAt: body.completedAt ? new Date(body.completedAt) : null,
            ownerId: req.user?.sub || null,
            completedByUserId,
            completedByName
          }
          // Preserve original offline creation timestamp when supplied.
          if (clientCreatedAt) data.createdAt = clientCreatedAt
          return { data }
        }

        let jobCard = null
        const maxAttempts = 12
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const jobCardNumber = await computeNextJobCardNumber(prisma)
          try {
            jobCard = await prisma.jobCard.create(buildCreateArgs(jobCardNumber))
            break
          } catch (err) {
            const target = err?.meta?.target
            const targetStr = Array.isArray(target) ? target.join(',') : String(target || '')
            if (err.code === 'P2002' && targetStr.includes('jobCardNumber')) {
              continue
            }
            throw err
          }
        }
        if (!jobCard) {
          return serverError(
            res,
            'Failed to create job card',
            'Could not allocate a unique job card number'
          )
        }

        await insertJobCardActivity(prisma, {
          jobCardId: jobCard.id,
          req,
          action: 'created',
          metadata: {
            status: jobCard.status,
            jobCardNumber: jobCard.jobCardNumber,
            clientName: jobCard.clientName || '',
            siteName: jobCard.siteName || '',
            ...(clientDraftId ? { clientDraftId } : {})
          },
          source: 'web'
        })
        auditManufacturing('create', 'job-cards', jobCard.id, {
          summary: `Created job card ${jobCard.jobCardNumber}`,
          jobCardNumber: jobCard.jobCardNumber
        })

        await scheduleJobCardStockMovementSync(jobCard)

        return created(res, { 
          jobCard: withComputedJobCardHeading({
            ...jobCard,
            otherTechnicians: parseJson(jobCard.otherTechnicians),
            photos: parseJson(jobCard.photos),
            stockUsed: parseJson(jobCard.stockUsed || '[]'),
            materialsBought: parseJson(jobCard.materialsBought || '[]'),
            // Return full ISO strings for datetime fields
            futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
            timeOfDeparture: formatDate(jobCard.timeOfDeparture),
            timeOfArrival: formatDate(jobCard.timeOfArrival),
            submittedAt: formatDate(jobCard.submittedAt),
            completedAt: formatDate(jobCard.completedAt),
            createdAt: formatDate(jobCard.createdAt),
            updatedAt: formatDate(jobCard.updatedAt)
          })
        })
      } catch (error) {
        console.error('❌ Failed to create job card:', error)
        if (error?.message && error.message.includes('must be a finite number >= 0')) {
          return badRequest(res, error.message)
        }
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to create job card', error.message)
      }
    }

    // UPDATE (PATCH /api/jobcards/:id)
    if (req.method === 'PATCH' && id) {
      const body = req.body || {}
      
      try {
        const existing = await prisma.jobCard.findUnique({ where: { id } })
        if (!existing) {
          return notFound(res, 'Job card not found')
        }
        if (!canMutateJobCard(existing, req.user)) {
          return forbidden(res, 'You do not have permission to update this job card')
        }
        
        const updateData = {}
        
        if (body.agentName !== undefined) updateData.agentName = body.agentName
        if (body.otherTechnicians !== undefined) {
          updateData.otherTechnicians = Array.isArray(body.otherTechnicians) 
            ? JSON.stringify(body.otherTechnicians) 
            : body.otherTechnicians
        }
        if (body.clientId !== undefined) updateData.clientId = body.clientId
        if (body.clientName !== undefined) updateData.clientName = body.clientName
        if (body.siteId !== undefined) updateData.siteId = body.siteId
        if (body.siteName !== undefined) updateData.siteName = body.siteName
        if (body.location !== undefined) updateData.location = body.location
        if (body.latitude !== undefined) updateData.locationLatitude = String(body.latitude ?? '')
        if (body.longitude !== undefined) updateData.locationLongitude = String(body.longitude ?? '')
        if (body.locationLatitude !== undefined) {
          updateData.locationLatitude = String(body.locationLatitude ?? '')
        }
        if (body.locationLongitude !== undefined) {
          updateData.locationLongitude = String(body.locationLongitude ?? '')
        }
        if (body.timeOfDeparture !== undefined) updateData.timeOfDeparture = body.timeOfDeparture ? new Date(body.timeOfDeparture) : null
        if (body.timeOfArrival !== undefined) updateData.timeOfArrival = body.timeOfArrival ? new Date(body.timeOfArrival) : null
        if (body.departureFromSite !== undefined) {
          updateData.departureFromSite = body.departureFromSite ? new Date(body.departureFromSite) : null
        }
        if (body.totalTimeMinutes !== undefined) {
          const mins = parseInt(body.totalTimeMinutes, 10)
          updateData.totalTimeMinutes = Number.isFinite(mins) && mins >= 0 ? mins : 0
        }
        if (body.vehicleUsed !== undefined) updateData.vehicleUsed = body.vehicleUsed
        if (body.kmReadingBefore !== undefined) updateData.kmReadingBefore = parseFiniteNumber(body.kmReadingBefore, 0)
        if (body.kmReadingAfter !== undefined) updateData.kmReadingAfter = parseFiniteNumber(body.kmReadingAfter, 0)
        if (body.reasonForVisit !== undefined) updateData.reasonForVisit = body.reasonForVisit
        if (body.callOutCategory !== undefined) updateData.callOutCategory = body.callOutCategory
        if (body.diagnosis !== undefined) updateData.diagnosis = body.diagnosis
        if (body.futureWorkRequired !== undefined) updateData.futureWorkRequired = body.futureWorkRequired
        if (body.futureWorkScheduledAt !== undefined) {
          updateData.futureWorkScheduledAt = body.futureWorkScheduledAt ? new Date(body.futureWorkScheduledAt) : null
        }
        if (body.actionsTaken !== undefined) updateData.actionsTaken = body.actionsTaken
        if (body.stockUsed !== undefined) {
          updateData.stockUsed = serializeJobCardStockUsedForDb(body.stockUsed)
        }
        if (body.materialsBought !== undefined) {
          updateData.materialsBought = Array.isArray(body.materialsBought) 
            ? JSON.stringify(body.materialsBought) 
            : body.materialsBought
        }
        if (body.totalMaterialsCost !== undefined) {
          updateData.totalMaterialsCost = parseNonNegativeFiniteNumber(body.totalMaterialsCost, 'totalMaterialsCost')
        }
        if (
          body.otherComments !== undefined ||
          body.heading !== undefined ||
          body.customerName !== undefined ||
          body.customerTitle !== undefined ||
          body.customerPosition !== undefined ||
          body.customerFeedback !== undefined ||
          body.customerSignature !== undefined
        ) {
          const mergedBody = {
            otherComments:
              body.otherComments !== undefined
                ? body.otherComments
                : existing.otherComments || '',
            customerName: body.customerName,
            customerTitle: body.customerTitle,
            customerPosition: body.customerPosition,
            customerFeedback: body.customerFeedback,
            customerSignature: body.customerSignature
          }
          const base = mergeCustomerSignoffIntoOtherComments({
            otherComments:
              mergedBody.otherComments != null ? String(mergedBody.otherComments) : '',
            customerName: mergedBody.customerName,
            customerTitle: mergedBody.customerTitle,
            customerPosition: mergedBody.customerPosition,
            customerFeedback: mergedBody.customerFeedback,
            hasSignature: Boolean(
              mergedBody.customerSignature && String(mergedBody.customerSignature).trim()
            )
          })
          const finalized = finalizeJobCardOtherCommentsForSave({
            otherComments: base,
            heading: body.heading,
            existingOtherComments: existing.otherComments
          })
          if (finalized !== undefined) {
            updateData.otherComments = finalized
          }
        }
        if (body.photos !== undefined) {
          updateData.photos = Array.isArray(body.photos) 
            ? JSON.stringify(body.photos) 
            : body.photos
        }
        if (body.status !== undefined) {
          const normalizedStatus = normalizeJobCardStatus(body.status, null)
          if (!normalizedStatus) return badRequest(res, 'Invalid job card status')
          updateData.status = normalizedStatus
        }
        if (body.submittedAt !== undefined) updateData.submittedAt = body.submittedAt ? new Date(body.submittedAt) : null
        if (body.completedAt !== undefined) updateData.completedAt = body.completedAt ? new Date(body.completedAt) : null
        if (body.startedAt !== undefined) updateData.startedAt = body.startedAt ? new Date(body.startedAt) : null
        
        // Recalculate travel kilometers if readings changed
        if (body.kmReadingBefore !== undefined || body.kmReadingAfter !== undefined) {
          const kmBefore = body.kmReadingBefore !== undefined ? parseFiniteNumber(body.kmReadingBefore, 0) : existing.kmReadingBefore
          const kmAfter = body.kmReadingAfter !== undefined ? parseFiniteNumber(body.kmReadingAfter, 0) : existing.kmReadingAfter
          updateData.travelKilometers = Math.max(0, kmAfter - kmBefore)
        }
        
        // Recalculate total materials cost if materials changed
        if (body.materialsBought !== undefined) {
          const materials = Array.isArray(body.materialsBought) ? body.materialsBought : parseJson(body.materialsBought || '[]')
          updateData.totalMaterialsCost = materials.reduce((sum, item) => sum + parseFiniteNumber(item?.cost, 0), 0)
        }

        const nextStatus =
          updateData.status !== undefined ? updateData.status : existing.status
        if (isTerminalJobCardStatus(nextStatus) && !existing.completedByUserId) {
          updateData.completedByUserId = req.user?.sub ? String(req.user.sub) : null
          updateData.completedByName = await resolveActorDisplayName(prisma, req)
        }

        const nextSiteId =
          updateData.siteId !== undefined ? updateData.siteId : existing.siteId
        const nextSiteName =
          updateData.siteName !== undefined ? updateData.siteName : existing.siteName
        if (String(nextSiteId || '').trim() && !String(nextSiteName || '').trim()) {
          const resolved = await resolveClientSiteName(prisma, nextSiteId)
          if (resolved) updateData.siteName = resolved
        }

        if (Object.keys(updateData).length === 0) {
          const jobCard = existing
          /* No prisma update — audit not required for no-op PATCH (see eslint-rules/manufacturing-audit.mjs). */
          // eslint-disable-next-line mfg-audit/require-audit-before-mutation-success
          return ok(res, {
            jobCard: withComputedJobCardHeading({
              ...jobCard,
              otherTechnicians: parseJson(jobCard.otherTechnicians),
              photos: parseJson(jobCard.photos),
              stockUsed: parseJson(jobCard.stockUsed || '[]'),
              materialsBought: parseJson(jobCard.materialsBought || '[]'),
              futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
              timeOfDeparture: formatDate(jobCard.timeOfDeparture),
              timeOfArrival: formatDate(jobCard.timeOfArrival),
              submittedAt: formatDate(jobCard.submittedAt),
              completedAt: formatDate(jobCard.completedAt),
              startedAt: formatDate(jobCard.startedAt),
              createdAt: formatDate(jobCard.createdAt),
              updatedAt: formatDate(jobCard.updatedAt)
            })
          })
        }

        const prevStatus = existing.status
        const jobCard = await prisma.jobCard.update({
          where: { id },
          data: updateData
        })

        if (prevStatus !== jobCard.status) {
          await insertJobCardActivity(prisma, {
            jobCardId: id,
            req,
            action: 'status_changed',
            metadata: { from: prevStatus, to: jobCard.status },
            source: 'web'
          })
        }

        let changeRows = buildJobCardUpdateChanges(existing, updateData)
        if (prevStatus !== jobCard.status) {
          changeRows = changeRows.filter((c) => c.field !== 'status')
        }
        // Always log an "updated" row when Prisma persisted changes. The diff builder can
        // legitimately return no rows (normalized equality), but users still expect an activity entry.
        if (Object.keys(updateData).length > 0) {
          await insertJobCardActivity(prisma, {
            jobCardId: id,
            req,
            action: 'updated',
            metadata: {
              fields: Object.keys(updateData),
              status: jobCard.status,
              ...(changeRows.length > 0
                ? { changes: changeRows, changeCount: changeRows.length }
                : {})
            },
            source: 'web'
          })
        }
        auditManufacturing('update', 'job-cards', id, {
          summary: `Updated job card ${jobCard.jobCardNumber}`,
          jobCardNumber: jobCard.jobCardNumber
        })

        if (prevStatus !== jobCard.status && jobCard.status === 'ready_for_invoice') {
          try {
            await notifyBillingRecipientsForJobCard(prisma, jobCard)
          } catch (notifyError) {
            console.error('jobcards: failed to notify billing recipients', notifyError)
          }
        }

        await scheduleJobCardStockMovementSync(jobCard)

        return ok(res, { 
          jobCard: withComputedJobCardHeading({
            ...jobCard,
            otherTechnicians: parseJson(jobCard.otherTechnicians),
            photos: parseJson(jobCard.photos),
            stockUsed: parseJson(jobCard.stockUsed || '[]'),
            materialsBought: parseJson(jobCard.materialsBought || '[]'),
            // Return full ISO strings for datetime fields
            futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
            timeOfDeparture: formatDate(jobCard.timeOfDeparture),
            timeOfArrival: formatDate(jobCard.timeOfArrival),
            submittedAt: formatDate(jobCard.submittedAt),
            completedAt: formatDate(jobCard.completedAt),
            startedAt: formatDate(jobCard.startedAt),
            createdAt: formatDate(jobCard.createdAt),
            updatedAt: formatDate(jobCard.updatedAt)
          })
        })
      } catch (error) {
        console.error('❌ Failed to update job card:', error)
        if (error?.message && error.message.includes('must be a finite number >= 0')) {
          return badRequest(res, error.message)
        }
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        if (error.code === 'P2025') {
          return notFound(res, 'Job card not found')
        }
        return serverError(res, 'Failed to update job card', error.message)
      }
    }

    // DELETE (DELETE /api/jobcards/:id)
    if (req.method === 'DELETE' && id) {
      try {
        
        // Check if job card exists first
        const existing = await prisma.jobCard.findUnique({ where: { id } });
        if (!existing) {
          return notFound(res, 'Job card not found');
        }
        if (!canMutateJobCard(existing, req.user)) {
          return forbidden(res, 'You do not have permission to delete this job card');
        }
        
        auditManufacturing('delete', 'job-cards', id, {
          summary: `Deleted job card ${existing.jobCardNumber}`,
          jobCardNumber: existing.jobCardNumber
        })

        await prisma.jobCard.delete({ where: { id } });

        // Return simple deletion confirmation
        return ok(res, { deleted: true, id });
      } catch (error) {
        console.error('❌ Failed to delete job card:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        if (error.code === 'P2025') {
          return notFound(res, 'Job card not found')
        }
        return serverError(res, 'Failed to delete job card', error.message)
      }
    }
  }

  // JOB CARD ACTIVITY (nested resource)
  if (resourceType === 'jobcards' && subResource === 'activity') {
    const activitySub = pathSegments[3]

    if (!id) {
      return badRequest(res, 'Job card id is required')
    }

    if (req.method === 'GET' && !activitySub) {
      try {
        const jc = await findJobCardByLookupParam(prisma, id, { id: true })
        if (!jc) {
          return notFound(res, 'Job card not found')
        }
        const jobCardId = jc.id

        try {
          await ensureMinimumJobCardActivity(prisma, jobCardId)
        } catch (baselineErr) {
          console.warn('ensureMinimumJobCardActivity (non-fatal):', baselineErr?.message || baselineErr)
        }

        let orderDir = 'asc'
        try {
          const u = new URL(req.url, 'http://localhost')
          const o = (u.searchParams.get('order') || 'asc').toLowerCase()
          if (o === 'desc') orderDir = 'desc'
        } catch {
          /* default asc */
        }

        const rows = await prisma.jobCardActivity.findMany({
          where: { jobCardId },
          orderBy: { createdAt: orderDir },
          take: 500
        })

        const safeActivityCreatedAt = (d) => {
          if (!d) return null
          try {
            const x = d instanceof Date ? d : new Date(d)
            if (Number.isNaN(x.getTime())) return null
            return x.toISOString()
          } catch {
            return null
          }
        }

        const formatted = rows.map(r => ({
          id: r.id,
          jobCardId: r.jobCardId,
          actorUserId: r.actorUserId,
          actorName: r.actorName,
          action: r.action,
          source: r.source,
          metadata: r.metadata,
          createdAt: safeActivityCreatedAt(r.createdAt)
        }))

        return ok(res, { activities: formatted })
      } catch (error) {
        console.error('❌ Failed to list job card activity:', error)
        return serverError(res, 'Failed to list job card activity', error.message)
      }
    }

    if (activitySub === 'sync' && req.method === 'POST') {
      const body = req.body || {}
      try {
        const parentJob = await findJobCardByLookupParam(prisma, id)
        if (!parentJob) {
          return notFound(res, 'Job card not found')
        }
        const jobCardId = parentJob.id
        if (!canMutateJobCard(parentJob, req.user)) {
          return forbidden(res, 'You do not have permission to sync activity for this job card')
        }

        const events = Array.isArray(body.events) ? body.events : []
        let n = 0
        for (const ev of events.slice(0, 300)) {
          if (!ev || typeof ev.action !== 'string' || !ev.action.trim()) continue
          await insertJobCardActivity(prisma, {
            jobCardId,
            req,
            action: ev.action.trim(),
            metadata: ev.metadata,
            source: typeof ev.source === 'string' && ev.source ? ev.source : 'sync'
          })
          n += 1
        }

        auditManufacturing('sync', 'job-card-activity', jobCardId, {
          summary: `Synced ${n} job card activity event(s)`,
          count: n
        })
        return ok(res, { synced: n })
      } catch (error) {
        console.error('❌ Job card activity sync failed:', error)
        return serverError(res, 'Failed to sync job card activity', error.message)
      }
    }

    return badRequest(res, 'Invalid job card activity endpoint')
  }

  // JOB CARD FORMS (nested resource)
  if (resourceType === 'jobcards' && subResource === 'forms') {
    const formInstanceId = pathSegments[3]

    // LIST INSTANCES FOR A JOBCARD (GET /api/jobcards/:jobCardId/forms)
    if (req.method === 'GET' && id && !formInstanceId) {
      try {
        const parentJob = await findJobCardByLookupParam(prisma, id, { id: true })
        if (!parentJob) {
          return notFound(res, 'Job card not found')
        }
        const jobCardId = parentJob.id
        const instances = await prisma.serviceFormInstance.findMany({
          where: { jobCardId },
          orderBy: { createdAt: 'asc' },
          include: {
            template: {
              select: { id: true, name: true, description: true, fields: true, version: true }
            }
          }
        })

        const formatted = instances.map((inst) => ({
          ...inst,
          answers: parseJson(inst.answers, []),
          templateFields: parseJson(inst.template?.fields, [])
        }))

        return ok(res, { forms: formatted })
      } catch (error) {
        if (isMissingServiceFormInstanceTables(error)) {
          console.warn(
            '⚠️ Job card service form tables are missing; returning empty forms list instead of 500.'
          )
          return ok(res, { forms: [] })
        }

        console.error('❌ Failed to list job card forms:', error)
        return serverError(res, 'Failed to list job card forms', error.message)
      }
    }

    // ATTACH TEMPLATE / CREATE INSTANCE (POST /api/jobcards/:jobCardId/forms)
    if (req.method === 'POST' && id && !formInstanceId) {
      const body = req.body || {}
      const templateId = body.templateId

      if (!templateId) {
        return badRequest(res, 'templateId is required')
      }

      try {
        const parentJob = await findJobCardByLookupParam(prisma, id)
        if (!parentJob) {
          return notFound(res, 'Job card not found')
        }
        const jobCardId = parentJob.id
        if (!canMutateJobCard(parentJob, req.user)) {
          return forbidden(res, 'You do not have permission to attach forms to this job card')
        }

        const template = await prisma.serviceFormTemplate.findUnique({
          where: { id: templateId }
        })

        if (!template) {
          return notFound(res, 'Service form template not found')
        }

        const instance = await prisma.serviceFormInstance.create({
          data: {
            jobCardId,
            templateId: template.id,
            templateName: template.name,
            templateVersion: template.version,
            status: body.status || 'not_started',
            answers: Array.isArray(body.answers) ? JSON.stringify(body.answers) : body.answers || '[]'
          }
        })

        await insertJobCardActivity(prisma, {
          jobCardId,
          req,
          action: 'service_form_attached',
          metadata: { templateId: template.id, instanceId: instance.id },
          source: 'web'
        })
        auditManufacturing('create', 'job-card-service-form', instance.id, {
          summary: `Attached form ${template.name} to job card ${parentJob.jobCardNumber}`,
          jobCardId
        })

        return created(res, {
          form: {
            ...instance,
            answers: parseJson(instance.answers, [])
          }
        })
      } catch (error) {
        if (isMissingServiceFormInstanceTables(error)) {
          console.warn(
            '⚠️ Job card service form tables are missing; cannot attach forms in this environment.'
          )
          return serverError(
            res,
            'Job card forms feature is not available in this environment',
            'SERVICE_FORMS_TABLE_MISSING'
          )
        }

        console.error('❌ Failed to attach form to job card:', error)
        return serverError(res, 'Failed to attach form to job card', error.message)
      }
    }

    // UPDATE INSTANCE (PATCH /api/jobcards/:jobCardId/forms/:formInstanceId)
    if (req.method === 'PATCH' && id && formInstanceId) {
      const body = req.body || {}

      try {
        const parentJob = await findJobCardByLookupParam(prisma, id)
        if (!parentJob) {
          return notFound(res, 'Job card not found')
        }
        const jobCardId = parentJob.id

        const existing = await prisma.serviceFormInstance.findUnique({
          where: { id: formInstanceId }
        })

        if (!existing || existing.jobCardId !== jobCardId) {
          return notFound(res, 'Job card form not found')
        }

        if (!canMutateJobCard(parentJob, req.user)) {
          return forbidden(res, 'You do not have permission to update forms on this job card')
        }

        const data = {}

        if (body.status !== undefined) data.status = body.status
        if (body.answers !== undefined) {
          data.answers = Array.isArray(body.answers)
            ? JSON.stringify(body.answers)
            : body.answers
        }
        if (body.completedAt !== undefined) {
          data.completedAt = body.completedAt ? new Date(body.completedAt) : null
        }

        const updated = await prisma.serviceFormInstance.update({
          where: { id: formInstanceId },
          data
        })

        const formChanges = buildServiceFormInstanceChanges(existing, data)
        await insertJobCardActivity(prisma, {
          jobCardId,
          req,
          action: 'service_form_updated',
          metadata: {
            instanceId: formInstanceId,
            templateId: existing.templateId,
            templateName: existing.templateName,
            fields: Object.keys(data),
            changes: formChanges,
            changeCount: formChanges.length
          },
          source: 'web'
        })
        auditManufacturing('update', 'job-card-service-form', formInstanceId, {
          summary: `Updated service form on job card ${parentJob.jobCardNumber}`,
          jobCardId
        })

        return ok(res, {
          form: {
            ...updated,
            answers: parseJson(updated.answers, [])
          }
        })
      } catch (error) {
        if (isMissingServiceFormInstanceTables(error)) {
          console.warn(
            '⚠️ Job card service form tables are missing; cannot update forms in this environment.'
          )
          return serverError(
            res,
            'Job card forms feature is not available in this environment',
            'SERVICE_FORMS_TABLE_MISSING'
          )
        }

        console.error('❌ Failed to update job card form:', error)
        return serverError(res, 'Failed to update job card form', error.message)
      }
    }

    return badRequest(res, 'Invalid job card forms endpoint')
  }

  // JOB CARD PHOTOS (GET /api/jobcards/:id/photos) — attachments JSON only (split from GET one for performance)
  if (resourceType === 'jobcards' && subResource === 'photos' && id) {
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }
    try {
      const row = await findJobCardByLookupParam(prisma, id, { id: true, photos: true })
      if (!row) {
        return notFound(res, 'Job card not found')
      }
      const photos = parseJson(row.photos)
      return ok(res, {
        jobCardId: row.id,
        photos,
        customerSignature: extractSignatureDataUrlFromPhotos(photos)
      })
    } catch (error) {
      console.error('❌ Failed to get job card photos:', error)
      if (isConnectionError(error)) {
        return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
      }
      return serverError(res, 'Failed to get job card photos', error.message)
    }
  }

  return badRequest(res, 'Invalid job cards endpoint')
}

export default authRequired(handler)

