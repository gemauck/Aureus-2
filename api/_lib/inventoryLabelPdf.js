import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { encodeInventoryQrPayload } from './inventoryQrPayload.js'

const MAX_ITEMS_PER_REQUEST = 400

/** Keep in sync with QR_SHEET_PRESETS in StockCountView.jsx */
export const INVENTORY_LABEL_PRESETS = {
  w113: {
    mode: 'sheet',
    label: 'Tower W113 / Avery L7163',
    cols: 2,
    rows: 7,
    labelWidthMm: 99.1,
    labelHeightMm: 38.1,
    marginTopMm: 15.14,
    marginLeftMm: 4.65,
    gapXmm: 2.5,
    gapYmm: 0,
    apiSize: 'md',
    qrMaxMm: 30,
    namePt: 7,
    metaPt: 6
  },
  l7160: {
    mode: 'sheet',
    label: 'Avery L7160',
    cols: 3,
    rows: 7,
    labelWidthMm: 63.5,
    labelHeightMm: 38.1,
    marginTopMm: 15.14,
    marginLeftMm: 7.25,
    gapXmm: 6.5,
    gapYmm: 0,
    apiSize: 'sm',
    qrMaxMm: 26,
    namePt: 6.5,
    metaPt: 5.5
  },
  w107: {
    mode: 'sheet',
    label: 'Tower W107 / Avery L6011',
    cols: 3,
    rows: 8,
    labelWidthMm: 38.1,
    labelHeightMm: 21.2,
    marginTopMm: 10.7,
    marginLeftMm: 8.5,
    gapXmm: 31.9,
    gapYmm: 0,
    apiSize: 'xs',
    qrMaxMm: 16,
    namePt: 5.5,
    metaPt: 5
  },
  rf2470x37: {
    mode: 'sheet',
    label: 'Red Fern 24-up / 70×37 mm',
    cols: 3,
    rows: 8,
    labelWidthMm: 70,
    labelHeightMm: 37.125,
    marginTopMm: 0,
    marginLeftMm: 0,
    gapXmm: 0,
    gapYmm: 0,
    apiSize: 'sm',
    qrMaxMm: 26,
    namePt: 7,
    metaPt: 6
  },
  small: {
    mode: 'flex',
    label: 'Plain A4 — small',
    cols: 4,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 45,
    qrMaxMm: 18,
    apiSize: 'sm',
    namePt: 7,
    metaPt: 6
  },
  medium: {
    mode: 'flex',
    label: 'Plain A4 — medium',
    cols: 3,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 55,
    qrMaxMm: 24,
    apiSize: 'md',
    namePt: 7,
    metaPt: 6
  },
  large: {
    mode: 'flex',
    label: 'Plain A4 — large',
    cols: 2,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 70,
    qrMaxMm: 32,
    apiSize: 'lg',
    namePt: 8,
    metaPt: 6.5
  },
  xlarge: {
    mode: 'flex',
    label: 'Plain A4 — extra large',
    cols: 1,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 90,
    qrMaxMm: 45,
    apiSize: 'xl',
    namePt: 9,
    metaPt: 7
  }
}

export function getInventoryLabelPreset(key) {
  return INVENTORY_LABEL_PRESETS[key] || INVENTORY_LABEL_PRESETS.w113
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

async function qrPngBuffer(inventoryItemId, apiSize) {
  const payload = encodeInventoryQrPayload(inventoryItemId)
  if (!payload) return null
  return QRCode.toBuffer(payload, {
    type: 'png',
    width: qrPixelWidth(apiSize),
    margin: 2,
    errorCorrectionLevel: 'M'
  })
}

function chunkItems(items, perPage) {
  if (!perPage || perPage < 1) return [items]
  const pages = []
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage))
  }
  return pages.length ? pages : [[]]
}

function sanitizeFilenamePart(value) {
  return String(value || 'labels')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'labels'
}

export function inventoryLabelPdfFilename({ locationLabel, presetKey }) {
  const preset = getInventoryLabelPreset(presetKey)
  return `inventory-labels-${sanitizeFilenamePart(locationLabel)}-${presetKey || 'sheet'}.pdf`
}

function drawLabelCell(doc, preset, item, qrBuffer, xPt, yPt, cellWidthPt, cellHeightPt) {
  const padX = mmToPt(1)
  const padTop = mmToPt(0.8)
  const innerW = Math.max(0, cellWidthPt - padX * 2)
  const qrMaxPt = mmToPt(preset.qrMaxMm || 24)
  const qrSize = Math.min(qrMaxPt, innerW, Math.max(mmToPt(8), cellHeightPt * 0.55))
  const qrX = xPt + (cellWidthPt - qrSize) / 2
  const qrY = yPt + padTop

  if (qrBuffer) {
    try {
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize })
    } catch {
      /* skip broken image */
    }
  }

  const textY = qrY + qrSize + mmToPt(0.4)
  const textH = Math.max(mmToPt(4), yPt + cellHeightPt - textY - mmToPt(0.5))
  const name = String(item?.name || '').trim() || '—'
  const sku = String(item?.sku || '').trim() || '—'

  doc
    .font('Helvetica-Bold')
    .fontSize(preset.namePt || 7)
    .fillColor('#000000')
    .text(name, xPt + padX, textY, {
      width: innerW,
      height: textH * 0.62,
      align: 'center',
      ellipsis: true
    })

  doc
    .font('Helvetica')
    .fontSize(preset.metaPt || 6)
    .fillColor('#000000')
    .text(sku, xPt + padX, doc.y + mmToPt(0.2), {
      width: innerW,
      height: textH * 0.38,
      align: 'center',
      ellipsis: true
    })
}

async function renderSheetPdf(doc, preset, items) {
  const perPage = preset.cols * preset.rows
  const pages = chunkItems(items, perPage)
  const labelW = mmToPt(preset.labelWidthMm)
  const labelH = mmToPt(preset.labelHeightMm)
  const gapX = mmToPt(preset.gapXmm || 0)
  const gapY = mmToPt(preset.gapYmm || 0)
  const originX = mmToPt(preset.marginLeftMm || 0)
  const originY = mmToPt(preset.marginTopMm || 0)
  const pitchX = labelW + gapX
  const pitchY = labelH + gapY

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (pageIdx > 0) doc.addPage({ size: 'A4', margin: 0 })
    const pageItems = pages[pageIdx]
    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i]
      const col = i % preset.cols
      const row = Math.floor(i / preset.cols)
      const x = originX + col * pitchX
      const y = originY + row * pitchY
      const qrBuffer = await qrPngBuffer(item.inventoryItemId, preset.apiSize)
      drawLabelCell(doc, preset, item, qrBuffer, x, y, labelW, labelH)
    }
  }
}

async function renderFlexPdf(doc, preset, items) {
  const margin = mmToPt(preset.marginMm || 10)
  const gap = mmToPt(preset.gapMm || 3)
  const pageW = mmToPt(210)
  const pageH = mmToPt(297)
  const usableW = pageW - margin * 2
  const cellW = (usableW - gap * (preset.cols - 1)) / preset.cols
  const cellH = mmToPt(preset.cellHeightMm || 55)
  const pitchX = cellW + gap
  const pitchY = cellH + gap
  const colsPerRow = preset.cols
  const rowsPerPage = Math.max(
    1,
    Math.floor((pageH - margin * 2 + gap) / pitchY)
  )
  const perPage = colsPerRow * rowsPerPage

  for (let i = 0; i < items.length; i++) {
    const pageIndex = Math.floor(i / perPage)
    const indexOnPage = i % perPage
    if (i === 0) {
      /* first page already created */
    } else if (indexOnPage === 0) {
      doc.addPage({ size: 'A4', margin: 0 })
    }
    const col = indexOnPage % colsPerRow
    const row = Math.floor(indexOnPage / colsPerRow)
    const x = margin + col * pitchX
    const y = margin + row * pitchY
    const item = items[i]
    const qrBuffer = await qrPngBuffer(item.inventoryItemId, preset.apiSize)
    drawLabelCell(doc, preset, item, qrBuffer, x, y, cellW, cellH)
  }
}

/**
 * @param {object} opts
 * @param {string} opts.presetKey
 * @param {string} [opts.locationLabel]
 * @param {Array<{ inventoryItemId: string, sku?: string, name?: string }>} opts.items
 */
export async function buildInventoryLabelPdfBuffer(opts) {
  const presetKey = String(opts?.presetKey || '').trim()
  const preset = getInventoryLabelPreset(presetKey)
  const items = Array.isArray(opts?.items) ? opts.items : []
  const locationLabel = String(opts?.locationLabel || '').trim()

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
      name: String(item?.name || '').trim() || '—'
    }
  })

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
          await renderSheetPdf(doc, preset, normalized)
        } else {
          await renderFlexPdf(doc, preset, normalized)
        }
        doc.end()
      } catch (err) {
        reject(err)
      }
    }

    void run()
  })
}
