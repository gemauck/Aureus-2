import AsyncStorage from '@react-native-async-storage/async-storage'
import type { IncidentReport } from './incidentApi'

export const INCIDENT_PENDING_KEY = 'mobile_rn_pending_incidents_v1'
export const INCIDENT_LIST_CACHE_KEY = 'mobile_rn_incidents_cache_v1'
export const MAX_PENDING_INCIDENTS = 50

export type PendingIncident = {
  id: string
  serverId?: string | null
  payload: Record<string, unknown>
  synced: boolean
  savedAt: string
  displayLabel?: string
}

export function localIncidentId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function isLocalIncidentId(id: string) {
  return String(id).startsWith('local-')
}

async function readPending(): Promise<PendingIncident[]> {
  try {
    const raw = await AsyncStorage.getItem(INCIDENT_PENDING_KEY)
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function writePending(list: PendingIncident[]) {
  await AsyncStorage.setItem(
    INCIDENT_PENDING_KEY,
    JSON.stringify(list.slice(0, MAX_PENDING_INCIDENTS))
  )
}

export async function upsertPendingIncident(record: PendingIncident) {
  const list = await readPending()
  const id = String(record.id)
  const next = [
    { ...record, synced: false },
    ...list.filter((r) => r && String(r.id) !== id)
  ].slice(0, MAX_PENDING_INCIDENTS)
  await writePending(next)
}

export async function removePendingIncident(id: string) {
  const list = await readPending()
  await writePending(list.filter((r) => r && String(r.id) !== String(id)))
}

export async function listUnsyncedPendingIncidents() {
  return (await readPending()).filter((r) => r && r.synced === false)
}

export async function getPendingIncident(id: string) {
  return (await readPending()).find((r) => r && String(r.id) === String(id)) || null
}

export async function markPendingIncidentSynced(localId: string, serverId: string) {
  const list = await readPending()
  await writePending(list.filter((r) => r && String(r.id) !== String(localId)))
  void serverId
}

export async function cacheIncidentList(rows: IncidentReport[]) {
  try {
    await AsyncStorage.setItem(INCIDENT_LIST_CACHE_KEY, JSON.stringify(rows))
  } catch {
    /* non-fatal */
  }
}

export async function readCachedIncidentList(): Promise<IncidentReport[]> {
  try {
    const raw = await AsyncStorage.getItem(INCIDENT_LIST_CACHE_KEY)
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function pendingToListRow(record: PendingIncident): IncidentReport {
  const p = record.payload
  const linkedIds = Array.isArray(p.jobCardIds) ? (p.jobCardIds as string[]) : []
  return {
    id: record.id,
    incidentNumber: record.displayLabel || 'Pending sync',
    status: String(p.status || 'draft'),
    clientId: (p.clientId as string) || null,
    clientName: String(p.clientName || ''),
    siteId: '',
    siteName: String(p.siteName || ''),
    jobCardId: linkedIds[0] || null,
    jobCardNumber: String(p.jobCardNumber || ''),
    incidentAt: (p.incidentAt as string) || record.savedAt,
    incidentType: String(p.incidentType || ''),
    severity: String(p.severity || ''),
    description: String(p.description || ''),
    immediateActions: String(p.immediateActions || ''),
    investigationNotes: String(p.investigationNotes || ''),
    correctiveActions: String(p.correctiveActions || ''),
    witnesses: '',
    equipmentInvolved: String(p.equipmentInvolved || ''),
    relevantAssets: String(p.relevantAssets || ''),
    relevantTanksMobileBowsers: String(p.relevantTanksMobileBowsers || ''),
    technicianName: String(p.technicianName || ''),
    authorName: String(p.authorName || ''),
    locationDescription: String(p.locationDescription || ''),
    locationLatitude: '',
    locationLongitude: '',
    reportedByName: String(p.reportedByName || ''),
    createdAt: record.savedAt
  }
}
