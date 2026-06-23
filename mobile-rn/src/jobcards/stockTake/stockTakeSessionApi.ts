import { jobcardsApi } from '../api'

export type StockTakeSessionLine = { id?: string; sku?: string; countedQty?: number }

export type StockTakeSubmission = {
  id?: string
  status?: string
  locationId?: string
  sessionRevision?: number
  lines?: StockTakeSessionLine[]
}

type StockTakeApiEnvelope = {
  id?: string
  submission?: StockTakeSubmission
  data?: { submission?: StockTakeSubmission }
}

function unwrapSubmission(res: StockTakeApiEnvelope): StockTakeSubmission | null {
  return res?.data?.submission || res?.submission || null
}

export function sessionIdFromResponse(res: StockTakeApiEnvelope): string {
  const sub = unwrapSubmission(res)
  return String(sub?.id || res?.id || '')
}

export function lineIdMapFromLines(lines: StockTakeSessionLine[] | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of lines || []) {
    const sku = String(line?.sku || '').trim()
    if (sku && line?.id) map[sku] = String(line.id)
  }
  return map
}

export function buildLinePatches(
  counts: Record<string, string>,
  lineIdBySku: Record<string, string> = {}
): Array<{ sku: string; countedQty: number; id?: string }> {
  const linePatches: Array<{ sku: string; countedQty: number; id?: string }> = []
  for (const [sku, raw] of Object.entries(counts)) {
    if (raw === undefined || raw === null || String(raw).trim() === '') continue
    const countedQty = parseFloat(raw)
    if (!Number.isFinite(countedQty)) continue
    const patch: { sku: string; countedQty: number; id?: string } = { sku, countedQty }
    const lineId = lineIdBySku[sku]
    if (lineId) patch.id = lineId
    linePatches.push(patch)
  }
  return linePatches
}

export async function createStockTakeSession(
  token: string,
  locationId: string
): Promise<{ sessionId: string; submission: StockTakeSubmission }> {
  const res = (await jobcardsApi.stockTakeCreate(token, {
    mode: 'session',
    locationId,
    startedAt: new Date().toISOString()
  })) as StockTakeApiEnvelope
  const submission = unwrapSubmission(res)
  const sessionId = sessionIdFromResponse(res)
  if (!sessionId || !submission) {
    throw new Error('Could not create stock-take session')
  }
  return { sessionId, submission }
}

export async function patchStockTakeCounts(
  token: string,
  sessionId: string,
  counts: Record<string, string>,
  options: { lineIdBySku?: Record<string, string>; sessionRevision?: number } = {}
): Promise<StockTakeSubmission | null> {
  const linePatches = buildLinePatches(counts, options.lineIdBySku)
  if (!linePatches.length) return null
  const body: Record<string, unknown> = { linePatches }
  if (options.sessionRevision != null) body.sessionRevision = options.sessionRevision
  const res = (await jobcardsApi.stockTakePatch(token, sessionId, body)) as StockTakeApiEnvelope
  return unwrapSubmission(res)
}

export async function ensureStockTakeSession(
  token: string,
  locationId: string,
  existingSessionId?: string
): Promise<{ sessionId: string; submission: StockTakeSubmission }> {
  const trimmed = String(existingSessionId || '').trim()
  if (trimmed) {
    const res = (await jobcardsApi.stockTakeGet(token, trimmed)) as StockTakeApiEnvelope
    const submission = unwrapSubmission(res)
    if (submission?.id && submission.status === 'in_progress') {
      return { sessionId: String(submission.id), submission }
    }
  }
  return createStockTakeSession(token, locationId)
}
