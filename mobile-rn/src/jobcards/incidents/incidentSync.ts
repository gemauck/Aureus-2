import { incidentApi } from './incidentApi'
import {
  markPendingIncidentSynced,
  type PendingIncident
} from './incidentOfflineStore'

export type IncidentSyncResult = {
  ok: boolean
  serverId: string | null
  incidentNumber: string | null
  errorText: string | null
}

export async function syncOnePendingIncident(
  token: string,
  record: PendingIncident
): Promise<IncidentSyncResult> {
  try {
    const payload = record.payload
    const res = record.serverId
      ? await incidentApi.patch(token, record.serverId, payload)
      : await incidentApi.create(token, payload)
    const row = res.incidentReport
    if (!row?.id) {
      return { ok: false, serverId: null, incidentNumber: null, errorText: 'No incident returned' }
    }
    await markPendingIncidentSynced(record.id, row.id)
    return {
      ok: true,
      serverId: row.id,
      incidentNumber: row.incidentNumber || null,
      errorText: null
    }
  } catch (e) {
    return {
      ok: false,
      serverId: null,
      incidentNumber: null,
      errorText: e instanceof Error ? e.message : 'Sync failed'
    }
  }
}

export async function syncAllPendingIncidents(
  token: string,
  pending: PendingIncident[]
): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0
  for (const record of pending) {
    const result = await syncOnePendingIncident(token, record)
    if (result.ok) synced += 1
    else failed += 1
  }
  return { synced, failed }
}
