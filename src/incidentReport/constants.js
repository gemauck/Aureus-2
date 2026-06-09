export const INCIDENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_investigation', label: 'Under investigation' },
  { value: 'closed', label: 'Closed' }
]

export const INCIDENT_TYPE_OPTIONS = [
  'Near Miss',
  'Injury / First Aid',
  'Equipment Failure',
  'Fuel Spill / Leak',
  'Fire',
  'Environmental',
  'Security',
  'Property Damage',
  'Observation',
  'Other'
]

export const INCIDENT_SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical']

export const INCIDENT_ALLOWED_STATUSES = new Set(
  INCIDENT_STATUS_OPTIONS.map((o) => o.value)
)

export function normalizeIncidentStatus(status, fallback = 'draft') {
  if (status === undefined || status === null || String(status).trim() === '') return fallback
  const normalized = String(status).trim().toLowerCase().replace(/\s+/g, '_')
  return INCIDENT_ALLOWED_STATUSES.has(normalized) ? normalized : fallback
}

export function incidentStatusLabel(status) {
  const normalized = normalizeIncidentStatus(status, '')
  const hit = INCIDENT_STATUS_OPTIONS.find((o) => o.value === normalized)
  return hit?.label || String(status || 'draft')
}
