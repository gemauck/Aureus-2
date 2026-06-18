import { jobcardsApi } from '../api'
import type { StockTransferPendingSubmit } from './stockTransferRequestOfflineStore'
import { removePendingSubmit } from './stockTransferRequestOfflineStore'

export async function syncOnePendingStockTransferSubmit(
  token: string,
  pending: StockTransferPendingSubmit
): Promise<{ ok: boolean; errorText?: string }> {
  try {
    await jobcardsApi.createStockTransferRequest(token, {
      fromLocationId: pending.fromLocationId,
      toLocationId: pending.toLocationId,
      notes: pending.notes || '',
      lines: pending.lines
    })
    await removePendingSubmit(pending.id)
    return { ok: true }
  } catch (e) {
    return { ok: false, errorText: e instanceof Error ? e.message : 'Sync failed' }
  }
}

export async function syncAllPendingStockTransferSubmits(token: string) {
  const { listPendingSubmits } = await import('./stockTransferRequestOfflineStore')
  const pending = await listPendingSubmits()
  let synced = 0
  let failed = 0
  for (const row of pending) {
    const result = await syncOnePendingStockTransferSubmit(token, row)
    if (result.ok) synced += 1
    else failed += 1
  }
  return { synced, failed }
}
