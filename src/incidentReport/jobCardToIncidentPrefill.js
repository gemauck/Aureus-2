const HEADING_PREFIX = 'Heading:'
const PROJECT_ASSOCIATION_PREFIX = 'Project Association:'

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

function parseMaterialsBought(jobCard) {
  return parseJsonArray(jobCard?.materialsBought, [])
}

export function formatStockLine(item) {
  const name = String(item?.itemName || item?.name || item?.description || '').trim()
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

function extractHeading(jobCard) {
  const explicit = String(jobCard?.heading || '').trim()
  if (explicit) return explicit
  const raw = String(jobCard?.otherComments || '')
  const line = raw
    .split('\n')
    .find((entry) => typeof entry === 'string' && entry.trim().startsWith(HEADING_PREFIX))
  return line ? line.slice(HEADING_PREFIX.length).trim() : ''
}

function technicianNotesFromOtherComments(rawComments) {
  const kept = []
  for (const line of String(rawComments || '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith(HEADING_PREFIX)) continue
    if (t.startsWith(PROJECT_ASSOCIATION_PREFIX)) continue
    if (
      t.startsWith('Customer:') ||
      t.startsWith('Position:') ||
      t.startsWith('Feedback:') ||
      t.startsWith('Signature:')
    ) {
      continue
    }
    kept.push(line)
  }
  return kept.join('\n').trim()
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
  const heading = extractHeading(jobCard)
  const category = String(jobCard?.callOutCategory || '').trim()
  const reason = String(jobCard?.reasonForVisit || '').trim()
  const notes = technicianNotesFromOtherComments(jobCard?.otherComments)

  if (heading) parts.push(`Heading:\n${heading}`)
  if (category) parts.push(`Call-out category: ${category}`)
  if (reason) parts.push(`Reason for visit:\n${reason}`)
  if (notes) parts.push(`Additional notes:\n${notes}`)

  return parts.join('\n\n')
}

function buildLocationDescription(jobCard) {
  const location = String(jobCard?.location || jobCard?.locationDescription || '').trim()
  const siteName = String(jobCard?.siteName || '').trim()
  if (location && siteName && location !== siteName) return `${location} — ${siteName}`
  return location || siteName
}

function buildRelevantAssets(jobCard) {
  const stockUsed = parseStockUsed(jobCard)
  const materials = parseMaterialsBought(jobCard)
  const stockLines = formatStockLines(stockUsed, false).map((line) => `• ${line}`)
  const materialLines = materials
    .map((item) => formatStockLine(item))
    .filter(Boolean)
    .map((line) => `• ${line} (purchased)`)
  return [...stockLines, ...materialLines].join('\n')
}

function normalizePhotos(jobCard) {
  const helpers = typeof window !== 'undefined' ? window.IncidentPhotos : null
  const raw = parseJsonArray(jobCard?.photos, [])
  if (helpers?.photosForIncidentFromJobCard) return helpers.photosForIncidentFromJobCard(raw)
  return raw.filter((entry) => {
    if (!entry || typeof entry !== 'object') return true
    const kind = String(entry.kind || '')
    return kind !== 'signature' && kind !== 'voice'
  })
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
  const tankLines = formatStockLines(stockUsed, true)
  const authorName = String(opts.authorName || jobCard.completedByName || '').trim()

  const jobCardId = jobCard.id || jobCard.serverJobCardId || ''
  const jobCardNumber = String(jobCard.jobCardNumber || '').trim()
  const linkedJobCards = jobCardId ? [{ id: jobCardId, jobCardId, jobCardNumber }] : []

  return {
    clientId: jobCard.clientId || '',
    clientName: String(jobCard.clientName || '').trim(),
    siteId: jobCard.siteId || '',
    siteName: String(jobCard.siteName || '').trim(),
    jobCardId,
    jobCardNumber,
    linkedJobCards,
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
    relevantAssets: buildRelevantAssets(jobCard),
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
 * @returns {Promise<object|null>}
 */
export async function fetchJobCardForPrefill(token, jobCardId) {
  const id = String(jobCardId || '').trim()
  if (!token || !id) return null
  try {
    const headers = { Authorization: `Bearer ${token}` }
    const [detailRes, photosRes] = await Promise.all([
      fetch(`/api/jobcards/${encodeURIComponent(id)}?omitPhotos=1`, { headers }),
      fetch(`/api/jobcards/${encodeURIComponent(id)}/photos`, { headers })
    ])
    const data = await detailRes.json().catch(() => ({}))
    if (!detailRes.ok) return null
    const row = data?.jobCard || data?.data?.jobCard || data?.data
    if (!row || !row.id) return null
    const photosData = await photosRes.json().catch(() => ({}))
    const photos =
      photosRes.ok && Array.isArray(photosData?.photos)
        ? photosData.photos
        : parseJsonArray(row.photos, [])
    const helpers = typeof window !== 'undefined' ? window.IncidentPhotos : null
    row.photos = helpers?.photosForIncidentFromJobCard
      ? helpers.photosForIncidentFromJobCard(photos)
      : photos
    return row
  } catch {
    return null
  }
}

/**
 * @param {string} token
 * @param {string} jobCardId
 * @returns {Promise<object[]>}
 */
export async function fetchJobCardPhotosForPrefill(token, jobCardId) {
  const id = String(jobCardId || '').trim()
  if (!token || !id) return []
  try {
    const res = await fetch(`/api/jobcards/${encodeURIComponent(id)}/photos`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !Array.isArray(data?.photos)) return []
    const helpers = typeof window !== 'undefined' ? window.IncidentPhotos : null
    return helpers?.photosForIncidentFromJobCard
      ? helpers.photosForIncidentFromJobCard(data.photos)
      : data.photos
  } catch {
    return []
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

/**
 * Wait for lazy-loaded prefill helper (max ~8s).
 * @param {number} [timeoutMs]
 */
export function waitForIncidentPrefillHelpers(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }
    const existing = window.IncidentJobCardPrefill
    if (existing?.buildIncidentPrefillFromJobCard) {
      resolve(existing)
      return
    }
    const started = Date.now()
    const tick = () => {
      const helpers = window.IncidentJobCardPrefill
      if (helpers?.buildIncidentPrefillFromJobCard) {
        resolve(helpers)
        return
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(helpers || null)
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

if (typeof window !== 'undefined') {
  window.IncidentJobCardPrefill = {
    buildIncidentPrefillFromJobCard,
    fetchJobCardForPrefill,
    fetchJobCardPhotosForPrefill,
    fetchDraftIncidentsForJobCard,
    waitForIncidentPrefillHelpers,
    pickIncidentAt,
    mapCallOutCategoryToIncidentType,
    formatStockLine,
    formatStockLines,
    toDatetimeLocalValue
  }
}
