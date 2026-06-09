import { jobcardsApi } from '../api'
import {
  listPendingSubmits,
  removePendingSubmit,
  type StockTakePendingSubmit
} from './stockTakeOfflineStore'

function buildBody(draft: StockTakePendingSubmit) {
  const lines = Object.entries(draft.counts)
    .filter(([, raw]) => raw !== undefined && raw !== null && String(raw).trim() !== '')
    .map(([sku, countedQty]) => ({
      sku,
      countedQty: parseFloat(countedQty) || 0
    }))
  return {
    locationId: draft.locationId,
    description: `Stock take ${new Date().toLocaleDateString()}`,
    lines,
    status: 'draft' as const
  }
}

export async function syncOnePendingStockTakeSubmit(
  token: string,
  draft: StockTakePendingSubmit,
  { submitForReview = false } = {}
): Promise<{ ok: boolean; errorText: string | null }> {
  try {
    const body = buildBody(draft)
    let sessionId = draft.sessionId || ''
    if (sessionId) {
      await jobcardsApi.stockTakePatch(token, sessionId, body)
    } else {
      const res = (await jobcardsApi.stockTakeCreate(token, body)) as {
        id?: string
        submission?: { id?: string }
        data?: { submission?: { id?: string } }
      }
      sessionId = String(res?.id || res?.submission?.id || res?.data?.submission?.id || '')
      if (!sessionId) {
        return { ok: false, errorText: 'Could not create stock-take session' }
      }
    }
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
