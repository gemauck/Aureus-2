// Browser bundle — exposes print helpers for incident PDF (Service & Maintenance).
(function () {
  const INCIDENT_STATUS_OPTIONS = [
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'under_investigation', label: 'Under investigation' },
    { value: 'closed', label: 'Closed' }
  ]

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function formatIncidentPrintDate(value) {
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

  function incidentStatusLabel(status) {
    const normalized = String(status || 'draft').toLowerCase().replace(/\s+/g, '_')
    const hit = INCIDENT_STATUS_OPTIONS.find((o) => o.value === normalized)
    return hit?.label || String(status || 'draft')
  }

  function parsePeople(raw) {
    try {
      if (!raw) return []
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function photoUrl(item) {
    if (!item) return ''
    if (typeof item === 'string') return item
    return String(item.url || item.uri || '').trim()
  }

  function isVisualPhoto(item) {
    const url = photoUrl(item)
    if (!url) return false
    if (item?.kind === 'voice') return false
    const mt = String(item?.mediaType || item?.mimeType || '').toLowerCase()
    if (mt.includes('video') || mt.includes('audio')) return false
    return !/^data:video\//i.test(url) && !/^data:audio\//i.test(url)
  }

  const INCIDENT_PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  body { margin: 0; font-family: Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { width: 100%; }
  .header { display: flex; justify-content: space-between; gap: 12px; border-bottom: 3px solid #2563eb; padding-bottom: 10px; margin-bottom: 12px; }
  .brand-logo { max-height: 60px; max-width: 180px; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 19px; color: #111827; }
  .brand-meta { font-size: 11px; color: #4b5563; margin-top: 4px; text-align: right; }
  .doc-title { margin: 0 0 8px; color: #1d4ed8; font-size: 18px; letter-spacing: 0.3px; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
  .meta-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; min-height: 56px; }
  .label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.4px; margin-bottom: 2px; }
  .value { font-size: 12px; color: #111827; font-weight: 600; white-space: pre-wrap; }
  .section { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; page-break-inside: avoid; }
  .section h3 { margin: 0 0 6px; font-size: 13px; color: #111827; }
  p { margin: 4px 0; font-size: 12px; line-height: 1.45; white-space: pre-wrap; }
  .muted { color: #6b7280; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #d1d5db; padding: 6px; font-size: 11px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  .image-grid { margin-top: 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .image-grid img { width: 100%; height: auto; border: 1px solid #d1d5db; border-radius: 6px; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; text-align: center; }
`

  function buildIncidentReportPrintHtml(incident, opts = {}) {
    const companyName = opts.companyName || 'Abcotronics'
    const letterhead = opts.letterhead || {}
    const addressLines = Array.isArray(letterhead.addressLines) ? letterhead.addressLines : []
    const logoMarkup = letterhead.logoDataUrl
      ? `<img src="${escapeHtml(letterhead.logoDataUrl)}" alt="Company logo" class="brand-logo" />`
      : ''
    const people = parsePeople(incident.peopleInvolved)
    const peopleTable =
      people.length > 0
        ? `<table><thead><tr><th>Name</th><th>Role</th><th>Injured</th></tr></thead><tbody>${people
            .map(
              (p) =>
                `<tr><td>${escapeHtml(p.name || '—')}</td><td>${escapeHtml(p.role || '—')}</td><td>${p.injured ? 'Yes' : 'No'}</td></tr>`
            )
            .join('')}</tbody></table>`
        : '<p class="muted">No people recorded.</p>'
    const imageSrcs = Array.isArray(opts.imageSrcs) ? opts.imageSrcs.filter(Boolean) : []
    const imageMarkup =
      imageSrcs.length > 0
        ? `<div class="image-grid">${imageSrcs.map((src) => `<img src="${escapeHtml(src)}" alt="Evidence" />`).join('')}</div>`
        : '<p class="muted">No photos attached.</p>'
    const lat = String(incident.locationLatitude || '').trim()
    const lng = String(incident.locationLongitude || '').trim()
    const mapMarkup = opts.mapImageSrc
      ? `<div class="image-grid"><img src="${escapeHtml(opts.mapImageSrc)}" alt="Map" /></div>`
      : ''
    const section = (title, body) =>
      `<section class="section"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body || '—')}</p></section>`

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Incident ${escapeHtml(incident.incidentNumber || '')}</title><style>${INCIDENT_PRINT_CSS}</style></head>
<body><div class="sheet">
<div class="header"><div>${logoMarkup}</div><div class="brand"><h1>${escapeHtml(companyName)}</h1>
<div class="brand-meta">${addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
${letterhead.phone ? `<div>Tel: ${escapeHtml(letterhead.phone)}</div>` : ''}
${letterhead.email ? `<div>Email: ${escapeHtml(letterhead.email)}</div>` : ''}</div></div></div>
<h2 class="doc-title">INCIDENT REPORT</h2>
<div class="meta-grid">
<div class="meta-card"><div class="label">Incident number</div><div class="value">${escapeHtml(incident.incidentNumber || '—')}</div></div>
<div class="meta-card"><div class="label">Client</div><div class="value">${escapeHtml(incident.clientName || '—')}</div></div>
<div class="meta-card"><div class="label">Site</div><div class="value">${escapeHtml(incident.siteName || '—')}</div></div>
<div class="meta-card"><div class="label">Type</div><div class="value">${escapeHtml(incident.incidentType || '—')}</div></div>
<div class="meta-card"><div class="label">Severity</div><div class="value">${escapeHtml(incident.severity || '—')}</div></div>
<div class="meta-card"><div class="label">Status</div><div class="value">${escapeHtml(incidentStatusLabel(incident.status).toUpperCase())}</div></div>
<div class="meta-card"><div class="label">Incident date</div><div class="value">${escapeHtml(formatIncidentPrintDate(incident.incidentAt))}</div></div>
<div class="meta-card"><div class="label">Reported by</div><div class="value">${escapeHtml(incident.reportedByName || '—')}</div></div>
<div class="meta-card"><div class="label">Linked job card</div><div class="value">${escapeHtml(incident.jobCardNumber || incident.jobCardId || '—')}</div></div>
</div>
${section('Description', incident.description)}
${section('Immediate actions', incident.immediateActions)}
${section('Investigation notes', incident.investigationNotes)}
${section('Corrective actions', incident.correctiveActions)}
${section('Equipment involved', incident.equipmentInvolved)}
<section class="section"><h3>People involved</h3>${peopleTable}</section>
${section('Witnesses', incident.witnesses)}
<section class="section"><h3>Location</h3><p>${escapeHtml(incident.locationDescription || '—')}</p>
${lat && lng ? `<p><strong>Coordinates:</strong> ${escapeHtml(lat)}, ${escapeHtml(lng)}</p>` : ''}${mapMarkup}</section>
<section class="section"><h3>Evidence photos</h3>${imageMarkup}</section>
<div class="footer">${escapeHtml(companyName)} • Incident ${escapeHtml(incident.incidentNumber || '')}</div>
</div></body></html>`
  }

  function partitionIncidentPhotosForPrint(photos) {
    const list = Array.isArray(photos) ? photos : []
    return list.filter(isVisualPhoto)
  }

  window.IncidentReportPrint = {
    buildIncidentReportPrintHtml,
    partitionIncidentPhotosForPrint,
    escapeHtml,
    formatIncidentPrintDate
  }
})()
