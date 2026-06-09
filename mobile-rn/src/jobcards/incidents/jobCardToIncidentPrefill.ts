import type { EditingMeta, JobCardFormData } from '../types'
import type { IncidentPerson } from './incidentApi'

const TANK_BOWSER_RE = /tank|bowser|bower|mobile/i

function parseTechnicians(raw: string[] | unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => (typeof entry === 'string' ? entry : String((entry as { name?: string })?.name || '')).trim())
    .filter(Boolean)
}

export function pickIncidentAt(source: Record<string, unknown>): string {
  for (const key of ['departureFromSite', 'timeOfArrival', 'startedAt', 'createdAt']) {
    const value = source[key]
    if (!value) continue
    const dt = value instanceof Date ? value : new Date(String(value))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }
  return new Date().toISOString()
}

export function toDatetimeLocal(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 16)
  return dt.toISOString().slice(0, 16)
}

export function mapCallOutCategoryToIncidentType(category: string): string {
  const normalized = String(category || '').trim()
  if (normalized === 'Near Miss') return 'Near Miss'
  if (normalized === 'Observation') return 'Observation'
  if (normalized) return 'Other'
  return ''
}

function formatStockLine(item: {
  itemName?: string
  name?: string
  sku?: string
  quantity?: number
}): string {
  const name = String(item.itemName || item.name || '').trim()
  const sku = String(item.sku || '').trim()
  const qty = item.quantity
  const parts: string[] = []
  if (name) parts.push(name)
  if (sku) parts.push(`(${sku})`)
  if (qty != null && qty !== 0) parts.push(`× ${qty}`)
  return parts.join(' ').trim()
}

function buildTechnicianName(formData: JobCardFormData): string {
  const lead = String(formData.agentName || '').trim()
  const others = parseTechnicians(formData.otherTechnicians)
  if (lead && others.length) return `Lead: ${lead}; Others: ${others.join(', ')}`
  if (lead) return lead
  if (others.length) return others.join(', ')
  return ''
}

function buildPeopleInvolved(formData: JobCardFormData): IncidentPerson[] {
  const rows: IncidentPerson[] = []
  const lead = String(formData.agentName || '').trim()
  if (lead) rows.push({ name: lead, role: 'Technician', injured: false })
  parseTechnicians(formData.otherTechnicians).forEach((name) => {
    if (name && name !== lead) rows.push({ name, role: 'Technician', injured: false })
  })
  return rows
}

function buildDescription(formData: JobCardFormData): string {
  const parts: string[] = []
  const reason = String(formData.reasonForVisit || '').trim()
  const comments = String(formData.otherComments || '').trim()
  if (reason) parts.push(`Reason for visit:\n${reason}`)
  if (comments) parts.push(`Other comments:\n${comments}`)
  return parts.join('\n\n')
}

function buildLocationDescription(formData: JobCardFormData): string {
  const location = String(formData.location || '').trim()
  const siteName = String(formData.siteName || '').trim()
  if (location && siteName && location !== siteName) return `${location} — ${siteName}`
  return location || siteName
}

export type IncidentPrefillPayload = {
  clientId?: string
  clientName?: string
  siteId?: string
  siteName?: string
  jobCardId?: string
  jobCardNumber?: string
  incidentAt?: string
  locationDescription?: string
  locationLatitude?: string
  locationLongitude?: string
  incidentType?: string
  severity?: string
  description?: string
  immediateActions?: string
  investigationNotes?: string
  correctiveActions?: string
  witnesses?: string
  equipmentInvolved?: string
  relevantAssets?: string
  relevantTanksMobileBowsers?: string
  technicianName?: string
  authorName?: string
  peopleInvolved?: IncidentPerson[]
  status?: string
}

export function buildIncidentPrefillFromJobCard(
  formData: JobCardFormData,
  editingMeta: EditingMeta | null | undefined,
  opts: { authorName?: string } = {}
): IncidentPrefillPayload {
  const stockUsed = Array.isArray(formData.stockUsed) ? formData.stockUsed : []
  const assetLines = stockUsed.map(formatStockLine).filter(Boolean)
  const tankLines = stockUsed
    .filter((item) => TANK_BOWSER_RE.test(`${item.itemName || ''} ${item.sku || ''}`))
    .map(formatStockLine)
    .filter(Boolean)

  const timingSource: Record<string, unknown> = {
    departureFromSite: formData.departureFromSite,
    timeOfArrival: formData.timeOfArrival,
    startedAt: editingMeta?.startedAt,
    createdAt: editingMeta?.createdAt
  }

  return {
    clientId: formData.clientId || '',
    clientName: String(formData.clientName || '').trim(),
    siteId: formData.siteId || '',
    siteName: String(formData.siteName || '').trim(),
    jobCardId: editingMeta?.serverJobCardId || editingMeta?.localId || '',
    jobCardNumber: String(editingMeta?.jobCardNumber || '').trim(),
    incidentAt: toDatetimeLocal(pickIncidentAt(timingSource)),
    locationDescription: buildLocationDescription(formData),
    locationLatitude: String(formData.latitude || '').trim(),
    locationLongitude: String(formData.longitude || '').trim(),
    incidentType: mapCallOutCategoryToIncidentType(formData.callOutCategory),
    severity: '',
    description: buildDescription(formData),
    immediateActions: String(formData.actionsTaken || '').trim(),
    investigationNotes: String(formData.diagnosis || '').trim(),
    correctiveActions: String(formData.futureWorkRequired || '').trim(),
    witnesses: '',
    equipmentInvolved: String(formData.vehicleUsed || '').trim(),
    relevantAssets: assetLines.map((line) => `• ${line}`).join('\n'),
    relevantTanksMobileBowsers: tankLines.map((line) => `• ${line}`).join('\n'),
    technicianName: buildTechnicianName(formData),
    authorName: String(opts.authorName || formData.agentName || '').trim(),
    peopleInvolved: buildPeopleInvolved(formData),
    status: 'draft'
  }
}
