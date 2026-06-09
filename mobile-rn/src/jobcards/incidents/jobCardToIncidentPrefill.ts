import type { EditingMeta, JobCardFormData } from '../types'
import type { IncidentPerson, LinkedJobCard } from './incidentApi'
import type { JobCardFormData, MediaItem, SectionWorkMedia, EditingMeta } from '../types'

const HEADING_PREFIX = 'Heading:'
const PROJECT_ASSOCIATION_PREFIX = 'Project Association:'
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
  description?: string
  sku?: string
  quantity?: number
}): string {
  const name = String(item.itemName || item.name || item.description || '').trim()
  const sku = String(item.sku || '').trim()
  const qty = item.quantity
  const parts: string[] = []
  if (name) parts.push(name)
  if (sku) parts.push(`(${sku})`)
  if (qty != null && qty !== 0) parts.push(`× ${qty}`)
  return parts.join(' ').trim()
}

function technicianNotesFromOtherComments(rawComments: string): string {
  const kept: string[] = []
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
  const heading = String(formData.heading || '').trim()
  const category = String(formData.callOutCategory || '').trim()
  const reason = String(formData.reasonForVisit || '').trim()
  const notes = technicianNotesFromOtherComments(formData.otherComments)

  if (heading) parts.push(`Heading:\n${heading}`)
  if (category) parts.push(`Call-out category: ${category}`)
  if (reason) parts.push(`Reason for visit:\n${reason}`)
  if (notes) parts.push(`Additional notes:\n${notes}`)

  return parts.join('\n\n')
}

function buildLocationDescription(formData: JobCardFormData): string {
  const location = String(formData.location || '').trim()
  const siteName = String(formData.siteName || '').trim()
  if (location && siteName && location !== siteName) return `${location} — ${siteName}`
  return location || siteName
}

function buildRelevantAssets(formData: JobCardFormData): string {
  const stockUsed = Array.isArray(formData.stockUsed) ? formData.stockUsed : []
  const materials = Array.isArray(formData.materialsBought) ? formData.materialsBought : []
  const stockLines = stockUsed.map(formatStockLine).filter(Boolean).map((line) => `• ${line}`)
  const materialLines = materials
    .map(formatStockLine)
    .filter(Boolean)
    .map((line) => `• ${line} (purchased)`)
  return [...stockLines, ...materialLines].join('\n')
}

export type IncidentPrefillPayload = {
  clientId?: string
  clientName?: string
  siteId?: string
  siteName?: string
  jobCardId?: string
  jobCardNumber?: string
  linkedJobCards?: LinkedJobCard[]
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
  photos?: unknown[]
  status?: string
}

function photoEntryUrl(entry: unknown): string {
  if (!entry) return ''
  if (typeof entry === 'string') return entry.trim()
  if (typeof entry !== 'object') return ''
  const obj = entry as Record<string, unknown>
  if (obj.kind === 'signature' || obj.kind === 'voice') return ''
  return String(obj.url || obj.thumbUrl || obj.dataUrl || '').trim()
}

function photosForIncidentFromWizardMedia(
  formPhotos: JobCardFormData['photos'],
  sectionWorkMedia?: SectionWorkMedia,
  selectedPhotos?: MediaItem[]
): unknown[] {
  const out: unknown[] = []
  const seen = new Set<string>()
  const push = (entry: unknown) => {
    const url = photoEntryUrl(entry)
    if (!url || seen.has(url)) return
    seen.add(url)
    if (typeof entry === 'string') {
      out.push({ kind: 'imageMedia', name: 'Job card photo', url: entry, thumbUrl: entry })
      return
    }
    out.push(entry)
  }

  for (const entry of formPhotos || []) push(entry)
  for (const item of selectedPhotos || []) {
    push({
      kind: 'imageMedia',
      name: item.name || 'Job card photo',
      url: item.url,
      thumbUrl: item.thumbUrl || item.previewUrl || item.url,
      mediaType: item.mediaType
    })
  }
  if (sectionWorkMedia) {
    for (const sec of ['diagnosis', 'actionsTaken', 'futureWorkRequired'] as const) {
      for (const item of sectionWorkMedia[sec] || []) {
        push({
          kind: 'sectionMedia',
          section: sec,
          name: item.name || 'Job card photo',
          url: item.url,
          thumbUrl: item.thumbUrl || item.url,
          mediaType: item.mediaType
        })
      }
    }
  }
  return out
}

export function buildIncidentPrefillFromJobCard(
  formData: JobCardFormData,
  editingMeta: EditingMeta | null | undefined,
  opts: {
    authorName?: string
    sectionWorkMedia?: SectionWorkMedia
    selectedPhotos?: MediaItem[]
  } = {}
): IncidentPrefillPayload {
  const stockUsed = Array.isArray(formData.stockUsed) ? formData.stockUsed : []
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

  const jobCardId = editingMeta?.serverJobCardId || editingMeta?.localId || ''
  const jobCardNumber = String(editingMeta?.jobCardNumber || '').trim()
  const linkedJobCards = jobCardId ? [{ id: jobCardId, jobCardId, jobCardNumber }] : []

  return {
    clientId: formData.clientId || '',
    clientName: String(formData.clientName || '').trim(),
    siteId: formData.siteId || '',
    siteName: String(formData.siteName || '').trim(),
    jobCardId,
    jobCardNumber,
    linkedJobCards,
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
    relevantAssets: buildRelevantAssets(formData),
    relevantTanksMobileBowsers: tankLines.map((line) => `• ${line}`).join('\n'),
    technicianName: buildTechnicianName(formData),
    authorName: String(opts.authorName || formData.agentName || '').trim(),
    peopleInvolved: buildPeopleInvolved(formData),
    photos: photosForIncidentFromWizardMedia(formData.photos, opts.sectionWorkMedia, opts.selectedPhotos),
    status: 'draft'
  }
}
