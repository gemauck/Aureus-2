import { draftToApiBody, jobCardsApi } from './jobCardsApi'
import { loadPendingJobCards, removePendingJobCard, savePendingJobCards } from './jobCardOffline'
import type { PendingJobCardRecord } from '../types/jobCard'

export async function syncPendingJobCards(token: string): Promise<{
  synced: number
  failed: number
  remaining: PendingJobCardRecord[]
}> {
  const pending = await loadPendingJobCards()
  let synced = 0
  let failed = 0
  const remaining: PendingJobCardRecord[] = []

  for (const record of pending) {
    try {
      await jobCardsApi.create(token, draftToApiBody(record.payload))
      await removePendingJobCard(record.id)
      synced += 1
    } catch (error) {
      failed += 1
      remaining.push({
        ...record,
        lastError: error instanceof Error ? error.message : 'Sync failed'
      })
    }
  }

  if (remaining.length) {
    await savePendingJobCards(remaining)
  }

  return { synced, failed, remaining }
}
