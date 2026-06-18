import { getOfflineStore } from './offlineStore'
import {
  listUnsyncedPendingIncidents,
  pendingToListRow
} from './incidents/incidentOfflineStore'
import { listPendingSubmits as listPendingStockTakeSubmits } from './stockTake/stockTakeOfflineStore'
import { listPendingSubmits as listPendingTransferSubmits } from './stockTransferRequest/stockTransferRequestOfflineStore'

export type PendingUploadKind = 'job_card' | 'incident' | 'stock_take' | 'stock_transfer_request'

export type PendingUploadItem = {
  id: string
  kind: PendingUploadKind
  title: string
  subtitle: string
  savedAt: string
  locationId?: string
  syncConflict?: boolean
}

function jobCardTitle(card: Record<string, unknown>) {
  return (
    String(card.jobCardNumber || card.heading || card.clientName || card.id || 'Job card').trim() ||
    'Job card'
  )
}

function jobCardSubtitle(card: Record<string, unknown>) {
  const parts = [card.clientName, card.siteName, card.agentName].map((v) => String(v || '').trim())
  return parts.filter(Boolean).join(' · ') || 'Waiting to sync'
}

export async function listPendingUploadItems(): Promise<PendingUploadItem[]> {
  const offlineStore = await getOfflineStore()
  const [jobCards, incidents, stockTakes, transferRequests] = await Promise.all([
    offlineStore.listUnsyncedLocalPendingJobCardsAsync(),
    listUnsyncedPendingIncidents(),
    listPendingStockTakeSubmits(),
    listPendingTransferSubmits()
  ])

  const items: PendingUploadItem[] = []

  for (const card of jobCards) {
    if (!card?.id) continue
    items.push({
      id: String(card.id),
      kind: 'job_card',
      title: jobCardTitle(card as Record<string, unknown>),
      subtitle: (card as Record<string, unknown>).syncConflict
        ? 'Sync conflict — tap Retry to choose which copy to keep'
        : jobCardSubtitle(card as Record<string, unknown>),
      savedAt: String(card.updatedAt || card.createdAt || new Date().toISOString()),
      syncConflict: Boolean((card as Record<string, unknown>).syncConflict)
    })
  }

  for (const incident of incidents) {
    const row = pendingToListRow(incident)
    items.push({
      id: incident.id,
      kind: 'incident',
      title: row.incidentNumber || 'Incident report',
      subtitle: [row.clientName, row.incidentType, row.severity].filter(Boolean).join(' · ') || 'Draft',
      savedAt: incident.savedAt
    })
  }

  for (const stockTake of stockTakes) {
    const lineCount = Object.values(stockTake.counts || {}).filter((v) => String(v).trim() !== '').length
    items.push({
      id: stockTake.id,
      kind: 'stock_take',
      title: 'Stock-take submission',
      subtitle: `${lineCount} line${lineCount === 1 ? '' : 's'} counted`,
      savedAt: stockTake.savedAt,
      locationId: stockTake.locationId
    })
  }

  for (const transfer of transferRequests) {
    items.push({
      id: transfer.id,
      kind: 'stock_transfer_request',
      title: 'Stock transfer request',
      subtitle: `${transfer.lines?.length || 0} line${transfer.lines?.length === 1 ? '' : 's'}`,
      savedAt: transfer.savedAt,
      locationId: transfer.fromLocationId
    })
  }

  items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
  return items
}
