import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'mobile_rn_entity_detail_cache_v1'
const MAX_ENTRIES = 40

type CacheEntry = {
  key: string
  data: unknown
  cachedAt: string
}

async function readMap(): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeMap(map: Record<string, CacheEntry>) {
  const entries = Object.values(map).sort(
    (a, b) => new Date(b.cachedAt).getTime() - new Date(a.cachedAt).getTime()
  )
  const trimmed = entries.slice(0, MAX_ENTRIES)
  const next: Record<string, CacheEntry> = {}
  for (const entry of trimmed) next[entry.key] = entry
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export async function cacheEntityDetail<T>(key: string, data: T): Promise<void> {
  const id = String(key || '').trim()
  if (!id) return
  const map = await readMap()
  map[id] = { key: id, data, cachedAt: new Date().toISOString() }
  await writeMap(map)
}

export async function readEntityDetail<T>(key: string): Promise<T | null> {
  const id = String(key || '').trim()
  if (!id) return null
  const map = await readMap()
  const hit = map[id]
  if (!hit?.data) return null
  map[id] = { ...hit, cachedAt: new Date().toISOString() }
  await writeMap(map)
  return hit.data as T
}

export function crmDetailCacheKey(entityType: string, entityId: string) {
  return `crm:${entityType}:${entityId}`
}

export function projectDetailCacheKey(projectId: string) {
  return `project:${projectId}`
}

export function projectTaskDetailCacheKey(taskId: string) {
  return `projectTask:${taskId}`
}

export function userTaskDetailCacheKey(taskId: string) {
  return `userTask:${taskId}`
}
