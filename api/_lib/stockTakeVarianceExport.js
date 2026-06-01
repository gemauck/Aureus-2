import XLSX from 'xlsx'

function parseLineMeta(line) {
  try {
    return line?.meta ? JSON.parse(line.meta) : {}
  } catch {
    return {}
  }
}

function lineHasVariance(line) {
  const meta = parseLineMeta(line)
  if (meta?.isNewItem === true) return true
  const delta = Number(line?.deltaQty) || 0
  return Math.abs(delta) >= 0.0001
}

function formatIsoDate(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

/**
 * Build an xlsx buffer for a stock-take submission variance report.
 * Variances sheet includes a Comment column (prefilled from line meta.varianceComment when set).
 */
export function buildStockTakeVarianceWorkbookBuffer(submission, lines = []) {
  const varianceLines = (lines || []).filter(lineHasVariance).sort((a, b) => {
    const na = String(a?.itemName || a?.sku || '')
    const nb = String(b?.itemName || b?.sku || '')
    return na.localeCompare(nb, undefined, { sensitivity: 'base' })
  })

  const summaryRows = [
    ['Field', 'Value'],
    ['Submission ref', submission?.submissionRef || submission?.id || ''],
    ['Location', submission?.locationName || submission?.locationCode || ''],
    ['Location code', submission?.locationCode || ''],
    ['Status', submission?.status || ''],
    ['Submitted by', submission?.submittedBy || ''],
    ['Submitter email', submission?.submitterEmail || ''],
    ['Submitted at', formatIsoDate(submission?.submittedAt)],
    ['Started at', formatIsoDate(submission?.startedAt)],
    ['Finished at', formatIsoDate(submission?.finishedAt)],
    ['Session notes', submission?.notes || ''],
    ['Total lines', String((lines || []).length)],
    ['Lines with variance', String(varianceLines.length)]
  ]

  const varianceHeaders = [
    'LineId',
    'SKU',
    'Description',
    'Unit',
    'System qty',
    'Counted qty',
    'Variance',
    'New item',
    'Comment'
  ]

  const varianceAoa = [varianceHeaders]
  for (const line of varianceLines) {
    const meta = parseLineMeta(line)
    const isNewItem = meta?.isNewItem === true
    const systemQty = Number(line.systemQty) || 0
    const countedQty = Number(line.countedQty) || 0
    const delta = Number(line.deltaQty)
    const variance = Number.isFinite(delta) ? delta : countedQty - systemQty
    const comment = String(meta?.varianceComment || meta?.varianceNotes || '').trim()
    varianceAoa.push([
      line.id,
      isNewItem ? String(meta?.proposedSku || line.sku || 'AUTO') : line.sku,
      line.itemName || '',
      line.unit || 'pcs',
      systemQty,
      countedQty,
      variance,
      isNewItem ? 'Yes' : 'No',
      comment
    ])
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(varianceAoa), 'Variances')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

/** Safe email segment for attachment filenames (Windows-friendly). */
export function sanitizeEmailForFilename(email) {
  const raw = String(email || '').trim().toLowerCase()
  if (!raw) return 'unknown-user'
  return raw
    .replace(/@/g, '-at-')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 64) || 'unknown-user'
}

export function stockTakeVarianceExportFilename(submission, submitterEmail = '') {
  const emailPart = sanitizeEmailForFilename(submitterEmail)
  const ref = String(submission?.submissionRef || submission?.id || 'stock-take')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 48)
  const date = new Date().toISOString().slice(0, 10)
  return `stock-take-variance-${emailPart}-${ref}-${date}.xlsx`
}
