import AsyncStorage from '@react-native-async-storage/async-storage'

export const STOCK_TAKE_LOCAL_DRAFT_KEY = 'mobile_rn_stock_take_draft_v1'
export const STOCK_TAKE_PENDING_SUBMIT_KEY = 'mobile_rn_stock_take_pending_submit_v1'

export type StockTakeLocalDraft = {
  locationId: string
  counts: Record<string, string>
  sessionId?: string
  savedAt: string
}

export type StockTakePendingSubmit = {
  id: string
  locationId: string
  counts: Record<string, string>
  sessionId?: string
  savedAt: string
}

function localSubmitId() {
  return `st-pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function saveLocalDraft(draft: StockTakeLocalDraft) {
  await AsyncStorage.setItem(STOCK_TAKE_LOCAL_DRAFT_KEY, JSON.stringify(draft))
}

export async function readLocalDraft(): Promise<StockTakeLocalDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(STOCK_TAKE_LOCAL_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StockTakeLocalDraft
  } catch {
    return null
  }
}

export async function clearLocalDraft() {
  await AsyncStorage.removeItem(STOCK_TAKE_LOCAL_DRAFT_KEY)
}

async function readPendingSubmits(): Promise<StockTakePendingSubmit[]> {
  try {
    const raw = await AsyncStorage.getItem(STOCK_TAKE_PENDING_SUBMIT_KEY)
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function writePendingSubmits(list: StockTakePendingSubmit[]) {
  await AsyncStorage.setItem(STOCK_TAKE_PENDING_SUBMIT_KEY, JSON.stringify(list))
}

export async function queuePendingSubmit(
  draft: Omit<StockTakePendingSubmit, 'id' | 'savedAt'>
): Promise<string> {
  const list = await readPendingSubmits()
  const id = localSubmitId()
  const next = [{ ...draft, id, savedAt: new Date().toISOString() }, ...list]
  await writePendingSubmits(next)
  return id
}

export async function listPendingSubmits() {
  return readPendingSubmits()
}

export async function removePendingSubmit(id: string) {
  const list = await readPendingSubmits()
  await writePendingSubmits(list.filter((r) => r && String(r.id) !== String(id)))
}
