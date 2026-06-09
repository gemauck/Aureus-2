import { incidentStatusLabel } from './constants.js'

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatIncidentPrintDate(value) {
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

function displayValue(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}

function hasDisplayValue(value) {
  const text = String(value ?? '').trim()
  return Boolean(text)
}

function formatLinkedJobCards(incident) {
  const links =
    Array.isArray(incident?.linkedJobCards) && incident.linkedJobCards.length
      ? incident.linkedJobCards
      : incident?.jobCardId
        ? [{ jobCardNumber: incident.jobCardNumber, id: incident.jobCardId }]
        : []
  const labels = links.map((row) => String(row?.jobCardNumber || row?.id || '').trim()).filter(Boolean)
  return labels.length ? labels.join(', ') : ''
}

function severityBadgeClass(severity) {
  const s = String(severity || '').trim().toLowerCase()
  if (s === 'critical') return 'badge badge-critical'
  if (s === 'high') return 'badge badge-high'
  if (s === 'medium') return 'badge badge-medium'
  if (s === 'low') return 'badge badge-low'
  return 'badge badge-neutral'
}

function summaryCell(label, valueHtml) {
  return `<td><div class="lbl">${escapeHtml(label)}</div><div class="val">${valueHtml}</div></td>`
}

function narrativeBlock(title, body) {
  const text = String(body ?? '').trim()
  if (!text) return ''
  return `<div class="narrative">
    <div class="narrative-head">${escapeHtml(title)}</div>
    <div class="narrative-body">${escapeHtml(text)}</div>
  </div>`
}

function buildSummaryCells(incident) {
  const cells = []
  const push = (label, value, valueHtml = null) => {
    const text = String(value ?? '').trim()
    if (!text) return
    cells.push({ label, valueHtml: valueHtml ?? escapeHtml(text) })
  }

  push('Client', incident.clientName)
  push('Incident type', incident.incidentType)
  const severity = String(incident.severity || '').trim()
  if (severity) {
    cells.push({
      label: 'Severity',
      valueHtml: `<span class="${severityBadgeClass(severity)}">${escapeHtml(severity)}</span>`
    })
  }
  const incidentAt = formatIncidentPrintDate(incident.incidentAt)
  if (incidentAt !== '—') push('Incident date & time', incidentAt)
  const statusLabel = incidentStatusLabel(incident.status)
  if (statusLabel) {
    cells.push({
      label: 'Status',
      valueHtml: `<span class="badge badge-status">${escapeHtml(statusLabel)}</span>`
    })
  }
  push('Technician', incident.technicianName)
  push('Author', incident.authorName)
  push('Linked job cards', formatLinkedJobCards(incident))
  const drafted = formatIncidentPrintDate(incident.createdAt)
  if (drafted !== '—') push('Draft recorded', drafted)
  const submitted = formatIncidentPrintDate(incident.submittedAt)
  if (submitted !== '—') push('Submitted', submitted)
  push('Location', formatLocation(incident))
  return cells
}

function summaryPanelHtml(cells) {
  if (!cells.length) return ''
  const rows = []
  for (let i = 0; i < cells.length; i += 4) {
    rows.push(cells.slice(i, i + 4))
  }
  const rowHtml = rows
    .map((row) => {
      const padded = [...row]
      while (padded.length < 4) padded.push(null)
      return `<tr>${padded.map((cell) => (cell ? summaryCell(cell.label, cell.valueHtml) : '<td></td>')).join('')}</tr>`
    })
    .join('')
  return `<div class="summary-panel"><table class="summary-table">${rowHtml}</table></div>`
}

function signOffSectionHtml(incident) {
  const authorName = String(incident.authorName || '').trim()
  const technicianName = String(incident.technicianName || '').trim()
  const drafted = formatIncidentPrintDate(incident.createdAt)
  const submitted = formatIncidentPrintDate(incident.submittedAt)
  const sig = String(incident.authorSignature || '').trim()
  const hasSig = sig.startsWith('data:image/')
  if (!authorName && !technicianName && drafted === '—' && submitted === '—' && !hasSig) return ''

  const fields = []
  if (authorName) {
    fields.push(`<div class="signoff-field"><div class="lbl">Author</div><div class="val">${escapeHtml(authorName)}</div></div>`)
  }
  if (technicianName) {
    fields.push(
      `<div class="signoff-field"><div class="lbl">Technician involved</div><div class="val">${escapeHtml(technicianName)}</div></div>`
    )
  }
  if (drafted !== '—') {
    fields.push(
      `<div class="signoff-field"><div class="lbl">Draft recorded</div><div class="val">${escapeHtml(drafted)}</div></div>`
    )
  }
  if (submitted !== '—') {
    fields.push(
      `<div class="signoff-field"><div class="lbl">Submitted</div><div class="val">${escapeHtml(submitted)}</div></div>`
    )
  }

  return `<div class="signoff">
    <div class="signoff-head">Author sign-off</div>
    <div class="signoff-body">
      ${fields.join('')}
      ${hasSig ? signatureBlockHtml(sig) : ''}
    </div>
  </div>`
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

function formatPeopleInvolved(people) {
  const rows = Array.isArray(people) ? people : []
  const lines = rows
    .map((person) => {
      const name = String(person?.name || '').trim()
      const role = String(person?.role || '').trim()
      const injured = person?.injured ? ' (injured)' : ''
      if (!name && !role) return ''
      if (name && role) return `${name} — ${role}${injured}`
      return `${name || role}${injured}`
    })
    .filter(Boolean)
  return lines.join('\n')
}

function signatureBlockHtml(signature) {
  const sig = String(signature || '').trim()
  if (sig.startsWith('data:image/')) {
    return `<div class="signoff-signature"><div class="lbl">Signature</div><img src="${escapeHtml(sig)}" alt="Author signature" /></div>`
  }
  return `<div class="signoff-signature"><div class="lbl">Signature</div><div class="val signature-empty">Not signed</div></div>`
}

export const INCIDENT_PRINT_CSS = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    color: #1f2937;
    font-size: 11pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { width: 100%; }
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 10px;
  }
  .letterhead-logo img { max-height: 52px; max-width: 160px; object-fit: contain; }
  .letterhead-contact { text-align: right; font-size: 9pt; line-height: 1.45; color: #4b5563; }
  .letterhead-contact h1 { margin: 0 0 4px; font-size: 14pt; color: #111827; font-weight: 700; }
  .title-band {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
    color: #fff;
    padding: 14px 18px;
    border-radius: 6px 6px 0 0;
    margin-top: 6px;
  }
  .title-band h2 { margin: 0; font-size: 14pt; font-weight: 700; letter-spacing: 0.1em; }
  .title-band .ref { text-align: right; }
  .title-band .ref-label { font-size: 8pt; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.06em; }
  .title-band .ref-value { font-size: 13pt; font-weight: 700; margin-top: 2px; }
  .summary-panel {
    border: 1px solid #d1d5db;
    border-top: none;
    border-radius: 0 0 6px 6px;
    overflow: hidden;
    margin-bottom: 20px;
  }
  .summary-table { width: 100%; border-collapse: collapse; }
  .summary-table td {
    padding: 11px 14px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
    width: 25%;
  }
  .summary-table tr:last-child td { border-bottom: none; }
  .summary-table .lbl {
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin-bottom: 4px;
  }
  .summary-table .val { font-size: 10.5pt; font-weight: 600; color: #111827; }
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 9pt;
    font-weight: 600;
    line-height: 1.3;
  }
  .badge-low { background: #d1fae5; color: #065f46; }
  .badge-medium { background: #fef3c7; color: #92400e; }
  .badge-high { background: #fee2e2; color: #991b1b; }
  .badge-critical { background: #7f1d1d; color: #fff; }
  .badge-neutral { background: #f3f4f6; color: #374151; }
  .badge-status { background: #e0e7ff; color: #3730a3; }
  .narrative { margin-bottom: 14px; page-break-inside: avoid; }
  .narrative-head {
    background: #f8fafc;
    border: 1px solid #d1d5db;
    border-bottom: none;
    padding: 8px 14px;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #374151;
    border-radius: 6px 6px 0 0;
  }
  .narrative-body {
    border: 1px solid #d1d5db;
    border-radius: 0 0 6px 6px;
    padding: 12px 14px;
    min-height: 56px;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1f2937;
    white-space: pre-wrap;
  }
  .narrative-body.empty { color: #9ca3af; font-style: italic; }
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    border: 1px solid #d1d5db;
    border-top: none;
    border-radius: 0 0 6px 6px;
    padding: 12px;
  }
  .photo-tile img, .photo-tile video {
    width: 100%;
    height: 140px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
  }
  .photo-cap { margin-top: 4px; font-size: 8pt; color: #6b7280; }
  .confidential {
    margin-top: 28px;
    font-size: 8pt;
    color: #6b7280;
    text-align: center;
    font-style: italic;
  }
  .doc-footer {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    font-size: 8pt;
    color: #9ca3af;
    text-align: center;
    line-height: 1.5;
  }
  .signoff {
    margin-top: 18px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .signoff-head {
    background: #f8fafc;
    padding: 8px 14px;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #374151;
    border-bottom: 1px solid #d1d5db;
  }
  .signoff-body { padding: 12px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
  .signoff-field .lbl { font-size: 8pt; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
  .signoff-field .val { font-size: 10.5pt; font-weight: 600; color: #111827; }
  .signoff-signature { grid-column: 1 / -1; margin-top: 4px; }
  .signoff-signature img { max-height: 72px; max-width: 280px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 4px; background: #fff; }
  .signature-empty { color: #9ca3af; font-style: italic; font-weight: 400; }
`

/**
 * Full incident report print layout (summary, narratives, photos, author sign-off).
 * @param {object} incident
 * @param {{ companyName?: string, letterhead?: object }} opts
 */
export function buildIncidentReportPrintHtml(incident, opts = {}) {
  const companyName = opts.companyName || 'Abcotronics'
  const letterhead = opts.letterhead || {}
  const addressLines = Array.isArray(letterhead.addressLines) ? letterhead.addressLines : []
  const logoMarkup = letterhead.logoDataUrl
    ? `<img src="${escapeHtml(letterhead.logoDataUrl)}" alt="Company logo" />`
    : ''
  const incidentNumber = displayValue(incident.incidentNumber || incident.id)
  const printedAt = formatIncidentPrintDate(new Date())
  const summaryCells = buildSummaryCells(incident)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Incident ${escapeHtml(incidentNumber)}</title>
  <style>${INCIDENT_PRINT_CSS}</style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="letterhead-logo">${logoMarkup}</div>
      <div class="letterhead-contact">
        <h1>${escapeHtml(companyName)}</h1>
        ${addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
        ${letterhead.phone ? `<div>Tel: ${escapeHtml(letterhead.phone)}</div>` : ''}
        ${letterhead.email ? `<div>Email: ${escapeHtml(letterhead.email)}</div>` : ''}
        ${letterhead.vatNumber ? `<div>VAT: ${escapeHtml(letterhead.vatNumber)}</div>` : ''}
      </div>
    </div>

    <div class="title-band">
      <h2>INCIDENT REPORT</h2>
      <div class="ref">
        <div class="ref-label">Reference</div>
        <div class="ref-value">${escapeHtml(incidentNumber)}</div>
      </div>
    </div>

    ${summaryPanelHtml(summaryCells)}

    ${narrativeBlock('Equipment / vehicle involved', incident.equipmentInvolved)}
    ${narrativeBlock('Relevant tanks / mobile bowsers', incident.relevantTanksMobileBowsers)}
    ${narrativeBlock('Description', incident.description)}
    ${narrativeBlock('Immediate actions', incident.immediateActions)}
    ${narrativeBlock('Investigation notes', incident.investigationNotes)}
    ${narrativeBlock('Corrective / follow-up actions', incident.correctiveActions)}
    ${incidentPhotoGalleryHtml(incident.photos)}

    ${signOffSectionHtml(incident)}

    <div class="confidential">This document contains operational incident information. Handle in accordance with company policy.</div>
    <div class="doc-footer">${escapeHtml(companyName)} &bull; Incident ${escapeHtml(incidentNumber)} &bull; Printed ${escapeHtml(printedAt)}</div>
  </div>
</body>
</html>`
}

/** Photos attached to incident reports (print/PDF). */
export function partitionIncidentPhotosForPrint(photos) {
  const rows = []
  const raw = (() => {
    try {
      if (!photos) return []
      if (Array.isArray(photos)) return photos
      return typeof photos === 'string' ? JSON.parse(photos) : []
    } catch {
      return []
    }
  })()
  raw.forEach((entry, idx) => {
    let url = ''
    if (typeof entry === 'string') url = entry.trim()
    else if (entry && typeof entry === 'object') {
      url = String(entry.url || entry.thumbUrl || entry.dataUrl || '').trim()
    }
    if (!url) return
    const isVideo = /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
    rows.push({
      entry,
      url,
      thumbUrl:
        entry && typeof entry === 'object'
          ? String(entry.thumbUrl || entry.previewUrl || url)
          : url,
      isVideo,
      label: entry && typeof entry === 'object' && entry.name ? String(entry.name) : `Photo ${idx + 1}`
    })
  })
  return rows
}

function resolvePrintPhotos(photos) {
  if (typeof window !== 'undefined' && window.IncidentPhotos?.partitionIncidentPhotosForPrint) {
    return window.IncidentPhotos.partitionIncidentPhotosForPrint(photos)
  }
  return partitionIncidentPhotosForPrint(photos)
}

function incidentPhotoGalleryHtml(photos) {
  const rows = resolvePrintPhotos(photos)
  if (!rows.length) return ''
  const tiles = rows
    .map((row) => {
      const src = escapeHtml(row.thumbUrl || row.url)
      if (row.isVideo) {
        return `<div class="photo-tile"><video src="${escapeHtml(row.url)}" controls style="max-width:100%;max-height:180px"></video><div class="photo-cap">${escapeHtml(row.label)}</div></div>`
      }
      return `<div class="photo-tile"><a href="${escapeHtml(row.url)}" target="_blank" rel="noopener"><img src="${src}" alt="${escapeHtml(row.label)}" /></a><div class="photo-cap">${escapeHtml(row.label)}</div></div>`
    })
    .join('')
  return `<div class="narrative"><div class="narrative-head">Photos</div><div class="photo-grid">${tiles}</div></div>`
}

if (typeof window !== 'undefined') {
  window.IncidentReportPrint = {
    buildIncidentReportPrintHtml,
    partitionIncidentPhotosForPrint,
    escapeHtml,
    formatIncidentPrintDate
  }
}
