import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PendingJobCardRecord } from '../types/jobCard'

const STORAGE_KEY = 'mobile_rn_pending_jobcards_v1'

export async function loadPendingJobCards(): Promise<PendingJobCardRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function savePendingJobCards(records: PendingJobCardRecord[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export async function enqueuePendingJobCard(record: PendingJobCardRecord) {
  const list = await loadPendingJobCards()
  const idx = list.findIndex((r) => r.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  await savePendingJobCards(list)
  return list
}

export async function removePendingJobCard(id: string) {
  const list = await loadPendingJobCards()
  const next = list.filter((r) => r.id !== id)
  await savePendingJobCards(next)
  return next
}
