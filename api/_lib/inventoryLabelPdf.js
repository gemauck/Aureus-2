import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { encodeInventoryQrPayload } from './inventoryQrPayload.js'
import {
  DEFAULT_INVENTORY_LABEL_PRESET_KEY,
  INVENTORY_LABEL_PRESETS,
  buildInventoryLabelHtmlDocument,
  buildSingleInventoryLabelHtmlDocument,
  clampSheetPositionIndex,
  getInventoryLabelPreset,
  inventoryLabelPdfFilename,
  chunkInventoryLabelItems,
  qrLabelsPerPage,
  sheetLayoutMetrics
} from '../../src/utils/inventoryLabelLayout.js'

export {
  DEFAULT_INVENTORY_LABEL_PRESET_KEY,
  INVENTORY_LABEL_PRESETS,
  inventoryLabelPdfFilename,
  getInventoryLabelPreset
}

const MAX_ITEMS_PER_REQUEST = 400
const MAX_QR_DATA_URL_BYTES = 900000

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i)
  if (!m) return null
  try {
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > MAX_QR_DATA_URL_BYTES) return null
    return { format: m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase(), buffer: buf }
  } catch {
    return null
  }
}

function mmToPt(mm) {
  return (Number(mm) * 72) / 25.4
}

function qrPixelWidth(apiSize) {
  const size = String(apiSize || '').trim().toLowerCase()
  if (size === 'xs' || size === 'small' || size === 'sm') return 160
  if (size === 'lg' || size === 'large') return 384
  if (size === 'xl' || size === 'xlarge') return 512
  return 256
}

async function qrPngBuffer(inventoryItemId, apiSize, targetMm) {
  const payload = encodeInventoryQrPayload(inventoryItemId)
  if (!payload) return null
  const fromMm = Number.isFinite(targetMm) && targetMm > 0 ? Math.round((targetMm * 300) / 25.4) : 0
  const width = Math.min(512, Math.max(qrPixelWidth(apiSize), fromMm || 0, 256))
  return QRCode.toBuffer(payload, {
    type: 'png',
    width,
    margin: 1,
    errorCorrectionLevel: 'M'
  })
}

async function resolveQrBuffer(item, preset) {
  const parsed = parseDataUrl(item.qrDataUrl)
  if (parsed) return parsed.buffer
  const targetMm =
    preset.mode === 'sheet' ? preset.labelHeightMm - 2 : (preset.cellHeightMm || 55) - 2
  return qrPngBuffer(item.inventoryItemId, preset.apiSize, targetMm)
}

async function renderHtmlToPdf(html) {
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 })
      await page.emulateMedia({ media: 'print' })
      const pdf = await page.pdf({
        width: '210mm',
        height: '297mm',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      })
      return Buffer.from(pdf)
    } finally {
      await browser.close()
    }
  } catch (error) {
    console.warn('Inventory label HTML PDF via Playwright unavailable:', error.message)
    return null
  }
}

function drawLabelCell(doc, preset, item, qrBuffer, xPt, yPt, cellWidthPt, cellHeightPt) {
  const insetTop = mmToPt(Number(preset.contentInsetTopMm ?? 1.5))
  const insetBottom = mmToPt(Number(preset.contentInsetBottomMm ?? 1.5))
  const insetLeft = mmToPt(Number(preset.contentInsetLeftMm ?? 1.5))
  const insetRight = mmToPt(Number(preset.contentInsetRightMm ?? 1))
  const qrColW = mmToPt(Number(preset.qrColWidthMm ?? (preset.labelWidthMm || 70) * 0.44))
  const innerH = Math.max(0, cellHeightPt - insetTop - insetBottom)
  const qrSize = Math.min(innerH, qrColW - mmToPt(0.2))
  const qrX = xPt + insetLeft + (qrColW - qrSize) / 2
  const qrY = yPt + insetTop + (innerH - qrSize) / 2
  const textX = xPt + insetLeft + qrColW + mmToPt(0.6)
  const textColW = Math.max(0, cellWidthPt - insetLeft - qrColW - mmToPt(0.6) - insetRight)
  const name = String(item?.name || '').trim() || '—'
  const sku = String(item?.sku || '').trim() || '—'

  if (qrBuffer && qrSize > 0) {
    try {
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize })
    } catch {
      /* skip broken image */
    }
  }

  doc.font('Helvetica-Bold').fontSize(preset.namePt || 7)
  const nameH = Math.min(doc.heightOfString(name, { width: textColW }), innerH * 0.72)
  doc.font('Helvetica').fontSize(preset.metaPt || 6)
  const skuH = doc.heightOfString(sku, { width: textColW })
  const gap = mmToPt(0.3)
  const blockH = Math.min(innerH, nameH + gap + skuH)
  const textY = yPt + insetTop + (innerH - blockH) / 2

  doc
    .font('Helvetica-Bold')
    .fontSize(preset.namePt || 7)
    .fillColor('#000000')
    .text(name, textX, textY, { width: textColW, align: 'left', ellipsis: true })

  doc
    .font('Helvetica')
    .fontSize(preset.metaPt || 6)
    .fillColor('#000000')
    .text(sku, textX, textY + nameH + gap, { width: textColW, align: 'left', ellipsis: true })
}

async function renderSheetPdfKit(doc, preset, items, sheetPositionIndex) {
  const perPage = qrLabelsPerPage(preset)
  const pages = chunkInventoryLabelItems(items, perPage)
  const metrics = sheetLayoutMetrics(preset)
  const labelW = mmToPt(metrics.labelW)
  const labelH = mmToPt(metrics.labelH)
  const pitchX = mmToPt(metrics.colPitch)
  const rowPitch = mmToPt(metrics.rowPitch)
  const originX = mmToPt(metrics.marginLeft)
  const originY = mmToPt(metrics.marginTop)

  const singleAtSlot =
    items.length === 1 &&
    sheetPositionIndex !== undefined &&
    sheetPositionIndex !== null &&
    preset.mode === 'sheet'

  if (singleAtSlot) {
    const idx = clampSheetPositionIndex(preset, sheetPositionIndex)
    const col = idx % preset.cols
    const row = Math.floor(idx / preset.cols)
    const x = originX + col * pitchX
    const y = originY + row * rowPitch
    const qrBuffer = await resolveQrBuffer(items[0], preset)
    drawLabelCell(doc, preset, items[0], qrBuffer, x, y, labelW, labelH)
    return
  }

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (pageIdx > 0) doc.addPage({ size: 'A4', margin: 0 })
    const pageItems = pages[pageIdx]
    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i]
      const col = i % preset.cols
      const row = Math.floor(i / preset.cols)
      const x = originX + col * pitchX
      const y = originY + row * rowPitch
      const qrBuffer = await resolveQrBuffer(item, preset)
      drawLabelCell(doc, preset, item, qrBuffer, x, y, labelW, labelH)
    }
  }
}

async function renderFlexPdfKit(doc, preset, items) {
  const margin = mmToPt(preset.marginMm || 10)
  const gap = mmToPt(preset.gapMm || 3)
  const pageW = mmToPt(210)
  const pageH = mmToPt(297)
  const usableW = pageW - margin * 2
  const cellW = (usableW - gap * (preset.cols - 1)) / preset.cols
  const cellH = mmToPt(preset.cellHeightMm || 55)
  const pitchX = cellW + gap
  const pitchY = cellH + gap
  const rowsPerPage = Math.max(1, Math.floor((pageH - margin * 2 + gap) / pitchY))
  const perPage = preset.cols * rowsPerPage

  for (let i = 0; i < items.length; i++) {
    const indexOnPage = i % perPage
    if (i > 0 && indexOnPage === 0) doc.addPage({ size: 'A4', margin: 0 })
    const col = indexOnPage % preset.cols
    const row = Math.floor(indexOnPage / preset.cols)
    const x = margin + col * pitchX
    const y = margin + row * pitchY
    const item = items[i]
    const qrBuffer = await resolveQrBuffer(item, preset)
    drawLabelCell(doc, preset, item, qrBuffer, x, y, cellW, cellH)
  }
}

async function buildInventoryLabelPdfKitBuffer({
  preset,
  items,
  locationLabel,
  presetKey,
  sheetPositionIndex
}) {
  return new Promise((resolve, reject) => {
    const title = locationLabel
      ? `Inventory labels — ${locationLabel}`
      : `Inventory labels — ${preset.label || presetKey}`
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: true,
      info: { Title: title, Author: 'Abcotronics ERP' }
    })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const run = async () => {
      try {
        if (preset.mode === 'sheet') {
          await renderSheetPdfKit(doc, preset, items, sheetPositionIndex)
        } else {
          await renderFlexPdfKit(doc, preset, items)
        }
        doc.end()
      } catch (err) {
        reject(err)
      }
    }

    void run()
  })
}

/**
 * @param {object} opts
 * @param {string} opts.presetKey
 * @param {string} [opts.locationLabel]
 * @param {number} [opts.sheetPositionIndex] — 0-based slot on a precut sheet (single-label print)
 * @param {Array<{ inventoryItemId: string, sku?: string, name?: string, qrDataUrl?: string }>} opts.items
 */
export async function buildInventoryLabelPdfBuffer(opts) {
  const presetKey = String(opts?.presetKey || '').trim()
  const preset = getInventoryLabelPreset(presetKey)
  const items = Array.isArray(opts?.items) ? opts.items : []
  const locationLabel = String(opts?.locationLabel || '').trim()
  const sheetPositionIndex = opts?.sheetPositionIndex

  if (!items.length) {
    throw new Error('No label items supplied')
  }
  if (items.length > MAX_ITEMS_PER_REQUEST) {
    throw new Error(`Too many labels (max ${MAX_ITEMS_PER_REQUEST})`)
  }

  const normalized = items.map((item, idx) => {
    const inventoryItemId = String(item?.inventoryItemId || '').trim()
    if (!inventoryItemId) {
      throw new Error(`Label item ${idx + 1} is missing inventoryItemId`)
    }
    return {
      inventoryItemId,
      sku: String(item?.sku || '').trim() || '—',
      name: String(item?.name || '').trim() || '—',
      qrDataUrl: String(item?.qrDataUrl || item?.qrSrc || '').trim()
    }
  })

  const singleAtSlot =
    normalized.length === 1 &&
    preset.mode === 'sheet' &&
    sheetPositionIndex !== undefined &&
    sheetPositionIndex !== null

  const html = singleAtSlot
    ? buildSingleInventoryLabelHtmlDocument({
        presetKey,
        item: normalized[0],
        sheetPositionIndex,
        locationLabel
      })
    : buildInventoryLabelHtmlDocument({
        presetKey,
        items: normalized,
        locationLabel
      })
  const htmlPdf = await renderHtmlToPdf(html)
  if (htmlPdf && htmlPdf.length > 0) {
    return htmlPdf
  }

  return buildInventoryLabelPdfKitBuffer({
    preset,
    items: normalized,
    locationLabel,
    presetKey,
    sheetPositionIndex
  })
}
