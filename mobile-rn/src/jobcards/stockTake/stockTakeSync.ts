import { jobcardsApi } from '../api'
import {
  listPendingSubmits,
  removePendingSubmit,
  type StockTakePendingSubmit
} from './stockTakeOfflineStore'
import {
  ensureStockTakeSession,
  lineIdMapFromLines,
  patchStockTakeCounts
} from './stockTakeSessionApi'

export async function syncOnePendingStockTakeSubmit(
  token: string,
  draft: StockTakePendingSubmit,
  { submitForReview = false } = {}
): Promise<{ ok: boolean; errorText: string | null }> {
  try {
    const { sessionId, submission } = await ensureStockTakeSession(
      token,
      draft.locationId,
      draft.sessionId
    )
    const lineIdBySku = lineIdMapFromLines(submission.lines)
    await patchStockTakeCounts(token, sessionId, draft.counts, {
      lineIdBySku,
      sessionRevision: submission.sessionRevision
    })
    if (submitForReview) {
      await jobcardsApi.stockTakeSubmit(token, sessionId)
    }
    await removePendingSubmit(draft.id)
    return { ok: true, errorText: null }
  } catch (e) {
    return { ok: false, errorText: e instanceof Error ? e.message : 'Sync failed' }
  }
}

export async function syncAllPendingStockTakeSubmits(token: string) {
  const pending = await listPendingSubmits()
  let synced = 0
  let failed = 0
  for (const draft of pending) {
    const result = await syncOnePendingStockTakeSubmit(token, draft, { submitForReview: true })
    if (result.ok) synced += 1
    else failed += 1
  }
  return { synced, failed }
}
