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
  const bodyClass = text ? 'narrative-body' : 'narrative-body empty'
  const content = text ? escapeHtml(text) : 'Not recorded'
  return `<div class="narrative">
    <div class="narrative-head">${escapeHtml(title)}</div>
    <div class="${bodyClass}">${content}</div>
  </div>`
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
  .signoff-signature img { max-height: 56px; max-width: 220px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 4px; background: #fff; }
`

/**
 * Web form fields: client, site, type, severity, date, status, description, immediate actions.
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
  const severity = displayValue(incident.severity)
  const severityHtml =
    severity === '—'
      ? '—'
      : `<span class="${severityBadgeClass(severity)}">${escapeHtml(severity)}</span>`
  const statusLabel = incidentStatusLabel(incident.status)
  const statusHtml = `<span class="badge badge-status">${escapeHtml(statusLabel)}</span>`
  const printedAt = formatIncidentPrintDate(new Date())

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

    <div class="summary-panel">
      <table class="summary-table">
        <tr>
          ${summaryCell('Client', escapeHtml(displayValue(incident.clientName)))}
          ${summaryCell('Site', escapeHtml(displayValue(incident.siteName)))}
          ${summaryCell('Incident type', escapeHtml(displayValue(incident.incidentType)))}
          ${summaryCell('Severity', severityHtml)}
        </tr>
        <tr>
          ${summaryCell('Incident date & time', escapeHtml(formatIncidentPrintDate(incident.incidentAt)))}
          ${summaryCell('Status', statusHtml)}
          ${summaryCell('Technician', escapeHtml(displayValue(incident.technicianName)))}
          ${summaryCell('Author', escapeHtml(displayValue(incident.authorName)))}
        </tr>
      </table>
    </div>

    ${narrativeBlock('Relevant assets', incident.relevantAssets)}
    ${narrativeBlock('Relevant tanks / mobile bowsers', incident.relevantTanksMobileBowsers)}
    ${narrativeBlock('Description', incident.description)}
    ${narrativeBlock('Immediate actions', incident.immediateActions)}

    <div class="signoff">
      <div class="signoff-head">Author sign-off</div>
      <div class="signoff-body">
        <div class="signoff-field">
          <div class="lbl">Author</div>
          <div class="val">${escapeHtml(displayValue(incident.authorName))}</div>
        </div>
        <div class="signoff-field">
          <div class="lbl">Technician involved</div>
          <div class="val">${escapeHtml(displayValue(incident.technicianName))}</div>
        </div>
        <div class="signoff-field">
          <div class="lbl">Draft recorded</div>
          <div class="val">${escapeHtml(formatIncidentPrintDate(incident.createdAt))}</div>
        </div>
        <div class="signoff-field">
          <div class="lbl">Submitted</div>
          <div class="val">${escapeHtml(formatIncidentPrintDate(incident.submittedAt))}</div>
        </div>
        ${
          String(incident.authorSignature || '').startsWith('data:image/')
            ? `<div class="signoff-signature"><div class="lbl">Signature</div><img src="${escapeHtml(incident.authorSignature)}" alt="Author signature" /></div>`
            : ''
        }
      </div>
    </div>

    <div class="confidential">This document contains operational incident information. Handle in accordance with company policy.</div>
    <div class="doc-footer">${escapeHtml(companyName)} &bull; Incident ${escapeHtml(incidentNumber)} &bull; Printed ${escapeHtml(printedAt)}</div>
  </div>
</body>
</html>`
}

/** @deprecated Photos are not part of the web incident form; kept for API compatibility. */
export function partitionIncidentPhotosForPrint(photos) {
  return []
}
