import AsyncStorage from '@react-native-async-storage/async-storage'

export const STOCK_TRANSFER_PENDING_SUBMIT_KEY = 'mobile_rn_stock_transfer_pending_submit_v1'

export type StockTransferPendingSubmit = {
  id: string
  fromLocationId: string
  toLocationId: string
  lines: Array<{ sku: string; itemName: string; quantity: number; unit?: string }>
  notes?: string
  savedAt: string
}

function localSubmitId() {
  return `str-pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function readPendingSubmits(): Promise<StockTransferPendingSubmit[]> {
  try {
    const raw = await AsyncStorage.getItem(STOCK_TRANSFER_PENDING_SUBMIT_KEY)
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function writePendingSubmits(rows: StockTransferPendingSubmit[]) {
  await AsyncStorage.setItem(STOCK_TRANSFER_PENDING_SUBMIT_KEY, JSON.stringify(rows))
}

export async function listPendingSubmits() {
  return readPendingSubmits()
}

export async function queuePendingSubmit(payload: Omit<StockTransferPendingSubmit, 'id' | 'savedAt'>) {
  const rows = await readPendingSubmits()
  const row: StockTransferPendingSubmit = {
    ...payload,
    id: localSubmitId(),
    savedAt: new Date().toISOString()
  }
  rows.unshift(row)
  await writePendingSubmits(rows)
  return row
}

export async function removePendingSubmit(id: string) {
  const rows = await readPendingSubmits()
  await writePendingSubmits(rows.filter((r) => r.id !== id))
}
