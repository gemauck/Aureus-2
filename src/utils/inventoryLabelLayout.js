/**
 * Shared inventory QR label layout (screen, print, and PDF).
 * Keep api/_lib/inventoryLabelPdf.js in sync when changing presets or CSS.
 */

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

function sheetCellCss(preset) {
  return [
    '#erp-stock-qr-print-root .erp-qr-label-cell {',
    '  width:' + preset.labelWidthMm + 'mm;',
    '  height:' + preset.labelHeightMm + 'mm;',
    '  box-sizing:border-box; overflow:hidden;',
    '  padding:0.8mm 1mm; margin:0;',
    '  display:flex; flex-direction:row; align-items:center;',
    '  border:none; border-radius:0; background:#fff; color:#000;',
    '  break-inside:avoid; page-break-inside:avoid;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-qr {',
    '  flex:0 0 44%; height:100%; display:flex; align-items:center; justify-content:center;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-cell img {',
    '  max-width:100%; max-height:calc(100% - 0.8mm); width:auto; height:auto;',
    '  border:none; padding:0; object-fit:contain;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-label-text {',
    '  flex:1 1 auto; min-width:0; display:flex; flex-direction:column; justify-content:center;',
    '  text-align:left; padding-left:0.6mm; overflow:hidden;',
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
    '#erp-stock-qr-print-root .erp-qr-sheet-page {',
    '  width:210mm; min-height:297mm; box-sizing:border-box;',
    '  padding:' + preset.marginTopMm + 'mm 0 0 ' + preset.marginLeftMm + 'mm;',
    '  margin:0; page-break-after:always;',
    '  display:grid;',
    '  grid-template-columns:repeat(' + preset.cols + ',' + preset.labelWidthMm + 'mm);',
    '  grid-template-rows:repeat(' + preset.rows + ',' + preset.labelHeightMm + 'mm);',
    '  grid-auto-rows:' + preset.labelHeightMm + 'mm;',
    '  column-gap:' + preset.gapXmm + 'mm;',
    '  row-gap:' + (preset.gapYmm || 0) + 'mm;',
    '  border:none; background:#fff; color:#000;',
    '}',
    '#erp-stock-qr-print-root .erp-qr-sheet-page:last-child { page-break-after:auto; }'
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

function renderLabelCellHtml(item) {
  const qr = String(item.qrDataUrl || item.qrSrc || '').trim()
  const name = escapeHtml(item.name || '—')
  const sku = escapeHtml(item.sku || '—')
  return (
    '<div class="erp-qr-label-cell">' +
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
          pageItems.map(renderLabelCellHtml).join('') +
          '</div>'
        )
      })
      .join('')
  } else {
    body =
      '<div class="erp-qr-flex-grid">' + list.map(renderLabelCellHtml).join('') + '</div>'
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

export function inventoryLabelPdfFilename({ locationLabel, presetKey }) {
  const part = String(locationLabel || 'labels')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'labels'
  return 'inventory-labels-' + part + '-' + (presetKey || 'sheet') + '.pdf'
}
