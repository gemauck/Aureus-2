function parseJsonArray(raw, defaultValue = []) {
  try {
    if (!raw) return defaultValue
    if (Array.isArray(raw)) return raw
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : defaultValue
  } catch {
    return defaultValue
  }
}

const TANK_BOWSER_RE = /tank|bowser|bower|mobile/i

export function pickIncidentAt(jobCard) {
  if (!jobCard || typeof jobCard !== 'object') return new Date().toISOString()
  for (const key of ['departureFromSite', 'timeOfArrival', 'startedAt', 'createdAt']) {
    const value = jobCard[key]
    if (!value) continue
    const dt = value instanceof Date ? value : new Date(value)
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }
  return new Date().toISOString()
}

export function toDatetimeLocalValue(value) {
  const dt = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 16)
  return dt.toISOString().slice(0, 16)
}

export function mapCallOutCategoryToIncidentType(category) {
  const normalized = String(category || '').trim()
  if (normalized === 'Near Miss') return 'Near Miss'
  if (normalized === 'Observation') return 'Observation'
  if (normalized) return 'Other'
  return ''
}

function parseStockUsed(jobCard) {
  return parseJsonArray(jobCard?.stockUsed, [])
}

export function formatStockLine(item) {
  const name = String(item?.itemName || item?.name || '').trim()
  const sku = String(item?.sku || '').trim()
  const qty = item?.quantity
  const parts = []
  if (name) parts.push(name)
  if (sku) parts.push(`(${sku})`)
  if (qty != null && qty !== '' && Number(qty) !== 0) parts.push(`× ${qty}`)
  return parts.join(' ').trim()
}

export function formatStockLines(stockUsed, tankBowserOnly = false) {
  const rows = Array.isArray(stockUsed) ? stockUsed : []
  return rows
    .map((item) => {
      const line = formatStockLine(item)
      if (!line) return ''
      const haystack = `${item?.itemName || ''} ${item?.sku || ''} ${line}`
      if (tankBowserOnly && !TANK_BOWSER_RE.test(haystack)) return ''
      return line
    })
    .filter(Boolean)
}

function buildTechnicianName(jobCard) {
  const lead = String(jobCard?.agentName || '').trim()
  const others = parseJsonArray(jobCard?.otherTechnicians, [])
    .map((entry) => (typeof entry === 'string' ? entry : String(entry?.name || entry || '')).trim())
    .filter(Boolean)
  if (lead && others.length) return `Lead: ${lead}; Others: ${others.join(', ')}`
  if (lead) return lead
  if (others.length) return others.join(', ')
  return ''
}

function buildPeopleInvolved(jobCard) {
  const rows = []
  const lead = String(jobCard?.agentName || '').trim()
  if (lead) rows.push({ name: lead, role: 'Technician', injured: false })
  parseJsonArray(jobCard?.otherTechnicians, []).forEach((entry) => {
    const name = (typeof entry === 'string' ? entry : String(entry?.name || '')).trim()
    if (name && name !== lead) rows.push({ name, role: 'Technician', injured: false })
  })
  return rows.length ? rows : [{ name: '', role: '', injured: false }]
}

function buildDescription(jobCard) {
  const parts = []
  const reason = String(jobCard?.reasonForVisit || '').trim()
  const comments = String(jobCard?.otherComments || '').trim()
  if (reason) parts.push(`Reason for visit:\n${reason}`)
  if (comments) parts.push(`Other comments:\n${comments}`)
  return parts.join('\n\n')
}

function buildLocationDescription(jobCard) {
  const location = String(jobCard?.location || jobCard?.locationDescription || '').trim()
  const siteName = String(jobCard?.siteName || '').trim()
  if (location && siteName && location !== siteName) return `${location} — ${siteName}`
  return location || siteName
}

function normalizePhotos(jobCard) {
  return parseJsonArray(jobCard?.photos, [])
}

/**
 * Map a job card (API row or wizard formData + meta) into incident form prefill.
 * @param {object} jobCard
 * @param {{ authorName?: string }} [opts]
 */
export function buildIncidentPrefillFromJobCard(jobCard, opts = {}) {
  if (!jobCard || typeof jobCard !== 'object') {
    return { status: 'draft', peopleInvolved: [{ name: '', role: '', injured: false }] }
  }

  const stockUsed = parseStockUsed(jobCard)
  const assetLines = formatStockLines(stockUsed, false)
  const tankLines = formatStockLines(stockUsed, true)
  const authorName = String(opts.authorName || jobCard.completedByName || '').trim()

  return {
    clientId: jobCard.clientId || '',
    clientName: String(jobCard.clientName || '').trim(),
    siteId: jobCard.siteId || '',
    siteName: String(jobCard.siteName || '').trim(),
    jobCardId: jobCard.id || jobCard.serverJobCardId || '',
    jobCardNumber: String(jobCard.jobCardNumber || '').trim(),
    incidentAt: toDatetimeLocalValue(pickIncidentAt(jobCard)),
    locationDescription: buildLocationDescription(jobCard),
    locationLatitude: String(jobCard.locationLatitude || jobCard.latitude || '').trim(),
    locationLongitude: String(jobCard.locationLongitude || jobCard.longitude || '').trim(),
    incidentType: mapCallOutCategoryToIncidentType(jobCard.callOutCategory),
    severity: '',
    description: buildDescription(jobCard),
    immediateActions: String(jobCard.actionsTaken || '').trim(),
    investigationNotes: String(jobCard.diagnosis || '').trim(),
    correctiveActions: String(jobCard.futureWorkRequired || '').trim(),
    witnesses: '',
    equipmentInvolved: String(jobCard.vehicleUsed || '').trim(),
    relevantAssets: assetLines.map((line) => `• ${line}`).join('\n'),
    relevantTanksMobileBowsers: tankLines.map((line) => `• ${line}`).join('\n'),
    technicianName: buildTechnicianName(jobCard),
    authorName,
    authorSignature: '',
    peopleInvolved: buildPeopleInvolved(jobCard),
    photos: normalizePhotos(jobCard),
    status: 'draft'
  }
}

/**
 * @param {string} token
 * @param {string} jobCardId
 * @returns {Promise<object[]>}
 */
export async function fetchDraftIncidentsForJobCard(token, jobCardId) {
  const jcId = String(jobCardId || '').trim()
  if (!token || !jcId) return []
  try {
    const params = new URLSearchParams({ jobCardId: jcId, status: 'draft', pageSize: '10' })
    const res = await fetch(`/api/incident-reports?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return []
    const list = data?.incidentReports || data?.data?.incidentReports || []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

if (typeof window !== 'undefined') {
  window.IncidentJobCardPrefill = {
    buildIncidentPrefillFromJobCard,
    fetchDraftIncidentsForJobCard,
    pickIncidentAt,
    mapCallOutCategoryToIncidentType,
    formatStockLine,
    formatStockLines,
    toDatetimeLocalValue
  }
}
