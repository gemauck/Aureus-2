/**
 * Shared inventory QR label layout (screen, print, and PDF).
 * Keep api/_lib/inventoryLabelPdf.js in sync when changing presets or CSS.
 */

export const A4_SHEET_WIDTH_MM = 210
export const A4_SHEET_HEIGHT_MM = 297

export const INVENTORY_LABEL_PRESETS = {
  w113: {
    mode: 'sheet',
    group: 'sheet',
    label: 'Tower W113 / Avery L7163 — 14 per sheet (99.1×38.1 mm)',
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
    group: 'sheet',
    label: 'Avery L7160 — 21 per sheet (63.5×38.1 mm)',
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
    group: 'sheet',
    label: 'Tower W107 / Avery L6011 — 24 per sheet (38.1×21.2 mm)',
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
    group: 'sheet',
    label: 'Red Fern 24-up / 70×37 mm — no border (3×8)',
    cols: 3,
    rows: 8,
    labelWidthMm: 70,
    labelHeightMm: 37,
    /** Divide A4 height evenly (297 ÷ 8 = 37.125 mm row slots; label face is 37 mm). */
    fillA4Height: true,
    marginTopMm: 0,
    marginBottomMm: 0,
    marginLeftMm: 0,
    gapXmm: 0,
    gapYmm: 0,
    /** Fixed insets so QR/text sit at the same spot in every cell (no flex drift). */
    contentInsetTopMm: 1.5,
    contentInsetBottomMm: 1.5,
    contentInsetLeftMm: 1.5,
    contentInsetRightMm: 1,
    qrColWidthMm: 29,
    apiSize: 'sm',
    qrMaxMm: 26,
    namePt: 7,
    metaPt: 6
  },
  small: {
    mode: 'flex',
    group: 'flex',
    apiSize: 'sm',
    label: 'Plain A4 — small (4 per row)',
    cols: 4,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 45,
    qrDisplayPx: 72,
    namePt: 7,
    metaPt: 6
  },
  medium: {
    mode: 'flex',
    group: 'flex',
    apiSize: 'md',
    label: 'Plain A4 — medium (3 per row)',
    cols: 3,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 55,
    qrDisplayPx: 96,
    namePt: 7,
    metaPt: 6
  },
  large: {
    mode: 'flex',
    group: 'flex',
    apiSize: 'lg',
    label: 'Plain A4 — large (2 per row)',
    cols: 2,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 70,
    qrDisplayPx: 128,
    namePt: 8,
    metaPt: 6.5
  },
  xlarge: {
    mode: 'flex',
    group: 'flex',
    apiSize: 'xl',
    label: 'Plain A4 — extra large (1 per row)',
    cols: 1,
    marginMm: 10,
    gapMm: 3,
    cellHeightMm: 90,
    qrDisplayPx: 200,
    namePt: 9,
    metaPt: 7
  }
}

export const DEFAULT_INVENTORY_LABEL_PRESET_KEY = 'rf2470x37'

export const INVENTORY_LABEL_PRESET_GROUPS = [
  { id: 'sheet', label: 'Precut A4 stickers (SA)' },
  { id: 'flex', label: 'Plain A4 (flexible grid)' }
]

export function getInventoryLabelPreset(key) {
  return INVENTORY_LABEL_PRESETS[key] || INVENTORY_LABEL_PRESETS[DEFAULT_INVENTORY_LABEL_PRESET_KEY]
}

export function qrLabelsPerPage(preset) {
  if (preset.mode === 'sheet') return preset.cols * preset.rows
  return null
}

export function chunkInventoryLabelItems(items, perPage) {
  if (!perPage || perPage < 1) return [items]
  const pages = []
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage))
  }
  return pages.length ? pages : [[]]
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sheetRowPitchMm(preset) {
  const explicit = Number(preset.rowPitchMm)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  if (preset.fillA4Height) {
    const marginTop = Number(preset.marginTopMm ?? 0)
    const marginBottom = Number(preset.marginBottomMm ?? 0)
    const rows = Number(preset.rows) || 1
    return (A4_SHEET_HEIGHT_MM - marginTop - marginBottom) / rows
  }
  return Number(preset.labelHeightMm || 0) + Number(preset.gapYmm || 0)
}

/** Computed sheet geometry for absolute label placement (print/PDF/preview). */
export function sheetLayoutMetrics(preset) {
  const marginTop = Number(preset.marginTopMm ?? 0)
  const marginBottom = Number(preset.marginBottomMm ?? 0)
  const marginLeft = Number(preset.marginLeftMm ?? 0)
  const rows = Number(preset.rows) || 1
  const cols = Number(preset.cols) || 1
  const labelW = Number(preset.labelWidthMm)
  const labelH = Number(preset.labelHeightMm)
  const gapX = Number(preset.gapXmm ?? 0)
  const rowPitch = sheetRowPitchMm(preset)
  const colPitch = labelW + gapX
  const pageHeight = preset.fillA4Height
    ? A4_SHEET_HEIGHT_MM
    : marginTop + marginBottom + rows * rowPitch
  return {
    marginTop,
    marginBottom,
    marginLeft,
    rowPitch,
    colPitch,
    labelW,
    labelH,
    rows,
    cols,
    pageWidth: A4_SHEET_WIDTH_MM,
    pageHeight
  }
}

export function labelCellPosition(preset, index) {
  const m = sheetLayoutMetrics(preset)
  const col = index % m.cols
  const row = Math.floor(index / m.cols)
  return {
    left: m.marginLeft + col * m.colPitch,
    top: m.marginTop + row * m.rowPitch,
    width: m.labelW,
    height: m.labelH
  }
}

export function labelCellPositionStyle(preset, index) {
  const p = labelCellPosition(preset, index)
  return (
    'left:' +
    p.left +
    'mm;top:' +
    p.top +
    'mm;width:' +
    p.width +
    'mm;height:' +
    p.height +
    'mm;'
  )
}

function sheetCellCss(preset) {
  const m = sheetLayoutMetrics(preset)
  const insetTop = Number(preset.contentInsetTopMm ?? 1.5)
  const insetBottom = Number(preset.contentInsetBottomMm ?? 1.5)
  const insetLeft = Number(preset.contentInsetLeftMm ?? 1.5)
  const insetRight = Number(preset.contentInsetRightMm ?? 1)
  const qrColW = Number(preset.qrColWidthMm ?? preset.labelWidthMm * 0.44)
  const textLeft = insetLeft + qrColW + 0.6
  return [
    '#erp-stock-qr-print-root .erp-qr-sheet-page {',
    '  position:relative;width:' + m.pageWidth + 'mm;height:' + m.pageHeight + 'mm;',
    '  max-width:' + m.pageWidth + 'mm;max-height:' + m.pageHeight + 'mm;',
    '  box-sizing:border-box;margin:0;padding:0;overflow:hidden;',
    '  page-break-after:always;break-after:page;',
    '  border:none;background:#fff;color:#000;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-cell {',
    '  box-sizing:border-box;overflow:hidden;',
    '  padding:0;margin:0;position:absolute;',
    '  border:none;border-radius:0;background:#fff;color:#000;',
    '  break-inside:avoid;page-break-inside:avoid;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-qr {',
    '  position:absolute; left:' + insetLeft + 'mm; top:' + insetTop + 'mm;',
    '  bottom:' + insetBottom + 'mm; width:' + qrColW + 'mm;',
    '  display:flex; align-items:center; justify-content:center;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-cell img {',
    '  max-width:100%; max-height:100%; width:auto; height:auto;',
    '  border:none; padding:0; object-fit:contain;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-text {',
    '  position:absolute; left:' + textLeft + 'mm; top:' + insetTop + 'mm;',
    '  bottom:' + insetBottom + 'mm; right:' + insetRight + 'mm;',
    '  display:flex; flex-direction:column; justify-content:center;',
    '  text-align:left; overflow:hidden;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-name {',
    '  font-weight:700; line-height:1.1; margin:0; overflow:hidden;',
    '  display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3;',
    '  font-size:' + preset.namePt + 'pt; text-align:left; width:100%; color:#000;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-meta {',
    '  font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;',
    '  line-height:1.1; margin:0.3mm 0 0; overflow:hidden;',
    '  font-size:' + preset.metaPt + 'pt; text-align:left; width:100%; color:#000;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-sheet-page:last-child { page-break-after:auto; break-after:auto; }'
  ].join('\n')
}

function flexCellCss(preset) {
  const margin = preset.marginMm || 10
  const gap = preset.gapMm || 3
  const usable = 210 - margin * 2
  const cellW = (usable - gap * (preset.cols - 1)) / preset.cols
  return [
    '#erp-stock-qr-print-root .erp-qr-label-cell {',
    '  width:' + cellW + 'mm; height:' + preset.cellHeightMm + 'mm;',
    '  box-sizing:border-box; overflow:hidden; padding:2mm; margin:0;',
    '  display:flex; flex-direction:row; align-items:center;',
    '  border:1px solid #e2e8f0; border-radius:0.5rem; background:#fff; color:#000;',
    '  break-inside:avoid; page-break-inside:avoid;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-qr {',
    '  flex:0 0 44%; display:flex; align-items:center; justify-content:center;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-cell img {',
    '  width:' + preset.qrDisplayPx + 'px; height:' + preset.qrDisplayPx + 'px; object-fit:contain;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-text {',
    '  flex:1 1 auto; min-width:0; display:flex; flex-direction:column; justify-content:center;',
    '  text-align:left; padding-left:2mm; overflow:hidden;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-name {',
    '  font-weight:700; font-size:' + preset.namePt + 'pt; line-height:1.1; margin:0;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-meta {',
    '  font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;',
    '  font-size:' + preset.metaPt + 'pt; margin:0.3mm 0 0;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-flex-grid {',
    '  display:grid; gap:' + gap + 'mm; padding:' + margin + 'mm;',
    '  grid-template-columns:repeat(' + preset.cols + ', minmax(0, 1fr));',
    '}'
  ].join('\n')
}

/** Screen + print CSS used by preview and PDF HTML. */
export function buildInventoryLabelCss(preset) {
  const sheet = preset.mode === 'sheet'
  const layout = sheet ? sheetCellCss(preset) : flexCellCss(preset)
  return (
    'html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
    '#erp-stock-qr-print-root{box-sizing:border-box;padding:0;margin:0;background:#fff;color:#000;' +
    (sheet ? 'width:210mm;' : 'width:100%;') +
    '}' +
    '#erp-stock-qr-print-root .erp-qr-preview-banner{display:none;}' +
    layout +
    '@media print{' +
    (sheet ? '@page{size:210mm 297mm;margin:0;}' : '@page{size:A4;margin:10mm;}') +
    'html,body{margin:0!important;padding:0!important;}' +
    '#erp-stock-qr-print-root{position:absolute;left:0;top:0;padding:0!important;margin:0!important;}' +
    '#erp-stock-qr-print-root .erp-qr-preview-banner{display:none!important;}' +
    '#erp-stock-qr-print-root .erp-qr-sheet-page{border:none!important;}' +
    '#erp-stock-qr-print-root .overflow-x-auto,#erp-stock-qr-print-root .overflow-x-auto>div{' +
    'margin:0!important;padding:0!important;overflow:visible!important;}' +
    '}'
  )
}

/** Browser print-only CSS (hides rest of ERP page). */
export function buildInventoryLabelPrintCss(preset) {
  return (
    '@media print{' +
    'body *{visibility:hidden!important;}' +
    '#erp-stock-qr-print-root,#erp-stock-qr-print-root *{visibility:visible!important;}' +
    buildInventoryLabelCss(preset) +
    '}'
  )
}

function renderLabelCellHtml(preset, item, index) {
  const qr = String(item.qrDataUrl || item.qrSrc || '').trim()
  const name = escapeHtml(item.name || '—')
  const sku = escapeHtml(item.sku || '—')
  const posStyle = typeof index === 'number' ? labelCellPositionStyle(preset, index) : ''
  return (
    '<div class="erp-qr-label-cell" style="' + posStyle + '">' +
    '<div class="erp-qr-label-qr">' +
    (qr ? '<img src="' + qr.replace(/"/g, '&quot;') + '" alt="" />' : '') +
    '</div>' +
    '<div class="erp-qr-label-text">' +
    '<p class="erp-qr-label-name">' +
    name +
    '</p>' +
    '<p class="erp-qr-label-meta">' +
    sku +
    '</p>' +
    '</div></div>'
  )
}

export function buildInventoryLabelHtmlDocument({ presetKey, items, locationLabel }) {
  const preset = getInventoryLabelPreset(presetKey)
  const list = Array.isArray(items) ? items : []
  const css = buildInventoryLabelCss(preset)
  let body = ''

  if (preset.mode === 'sheet') {
    const perPage = preset.cols * preset.rows
    const pages = chunkInventoryLabelItems(list, perPage)
    body = pages
      .map(function (pageItems) {
        return (
          '<div class="erp-qr-sheet-page">' +
          pageItems.map(function (item, idx) {
            return renderLabelCellHtml(preset, item, idx)
          }).join('') +
          '</div>'
        )
      })
      .join('')
  } else {
    body =
      '<div class="erp-qr-flex-grid">' +
      list.map(function (item) {
        return renderLabelCellHtml(preset, item)
      }).join('') +
      '</div>'
  }

  const title = locationLabel
    ? 'Inventory labels — ' + escapeHtml(locationLabel)
    : 'Inventory labels — ' + escapeHtml(preset.label)

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    title +
    '</title><style>' +
    css +
    '</style></head><body><div id="erp-stock-qr-print-root">' +
    body +
    '</div></body></html>'
  )
}

/** One label for stock labeling — optional sheet slot for partially used sticker sheets. */
export function buildSingleInventoryLabelHtmlDocument({
  presetKey,
  item,
  sheetPositionIndex = 0,
  locationLabel
}) {
  const preset = getInventoryLabelPreset(presetKey)
  const css = buildInventoryLabelCss(preset)
  let body = ''

  if (preset.mode === 'sheet') {
    const perPage = qrLabelsPerPage(preset) || 1
    const idx = Math.max(0, Math.min(Number(sheetPositionIndex) || 0, perPage - 1))
    body =
      '<div class="erp-qr-sheet-page">' + renderLabelCellHtml(preset, item, idx) + '</div>'
  } else {
    body = '<div class="erp-qr-flex-grid">' + renderLabelCellHtml(preset, item) + '</div>'
  }

  const sku = escapeHtml(item?.sku || '—')
  const title = locationLabel
    ? 'Inventory label — ' + escapeHtml(locationLabel)
    : 'Inventory label — ' + sku

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    title +
    '</title><style>' +
    css +
    '</style></head><body><div id="erp-stock-qr-print-root">' +
    body +
    '</div></body></html>'
  )
}

export function clampSheetPositionIndex(preset, sheetPositionIndex) {
  if (!preset || preset.mode !== 'sheet') return 0
  const perPage = qrLabelsPerPage(preset) || 1
  return Math.max(0, Math.min(Number(sheetPositionIndex) || 0, perPage - 1))
}

export function inventoryLabelPdfFilename({ locationLabel, presetKey }) {
  const part = String(locationLabel || 'labels')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'labels'
  return 'inventory-labels-' + part + '-' + (presetKey || 'sheet') + '.pdf'
}
