import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PriorListRow } from './types'

const DETAIL_CACHE_KEY = 'mobile_rn_jobcard_detail_cache_v1'
const PRIOR_CACHE_KEY = 'mobile_rn_jobcard_prior_cache_v1'
const MAX_CACHED_CARDS = 50

type DetailCacheEntry = {
  id: string
  jobCard: Record<string, unknown>
  cachedAt: string
}

async function readDetailMap(): Promise<Record<string, DetailCacheEntry>> {
  try {
    const raw = await AsyncStorage.getItem(DETAIL_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeDetailMap(map: Record<string, DetailCacheEntry>) {
  const entries = Object.values(map).sort(
    (a, b) => new Date(b.cachedAt).getTime() - new Date(a.cachedAt).getTime()
  )
  const trimmed = entries.slice(0, MAX_CACHED_CARDS)
  const next: Record<string, DetailCacheEntry> = {}
  for (const entry of trimmed) next[entry.id] = entry
  await AsyncStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(next))
}

export async function cacheJobCard(jobCard: Record<string, unknown>) {
  const id = String(jobCard.id || '').trim()
  if (!id) return
  const map = await readDetailMap()
  map[id] = {
    id,
    jobCard,
    cachedAt: new Date().toISOString()
  }
  await writeDetailMap(map)
}

export async function getCachedJobCard(id: string): Promise<Record<string, unknown> | null> {
  const sid = String(id || '').trim()
  if (!sid) return null
  const map = await readDetailMap()
  const hit = map[sid]
  if (!hit?.jobCard) return null
  map[sid] = { ...hit, cachedAt: new Date().toISOString() }
  await writeDetailMap(map)
  return hit.jobCard
}

export async function cachePriorList(rows: PriorListRow[]) {
  try {
    await AsyncStorage.setItem(
      PRIOR_CACHE_KEY,
      JSON.stringify({ cachedAt: new Date().toISOString(), rows })
    )
  } catch {
    /* non-fatal */
  }
}

export async function getCachedPriorList(): Promise<PriorListRow[]> {
  try {
    const raw = await AsyncStorage.getItem(PRIOR_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.rows) ? parsed.rows : []
  } catch {
    return []
  }
}
