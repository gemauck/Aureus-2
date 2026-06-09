import AsyncStorage from '@react-native-async-storage/async-storage'

type CacheEnvelope<T> = {
  data: T
  cachedAt: string
}

export async function readListCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    return parsed?.data ?? null
  } catch {
    return null
  }
}

export async function writeListCache<T>(key: string, data: T) {
  try {
    const envelope: CacheEnvelope<T> = { data, cachedAt: new Date().toISOString() }
    await AsyncStorage.setItem(key, JSON.stringify(envelope))
  } catch {
    /* non-fatal */
  }
}
