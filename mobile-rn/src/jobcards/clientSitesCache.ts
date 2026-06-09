import AsyncStorage from '@react-native-async-storage/async-storage'

export const CLIENT_SITES_CACHE_KEY = 'mobile_rn_client_sites_cache_v1'

export type CachedSite = { id: string; name: string }

type ClientSitesEntry = {
  sites: CachedSite[]
  cachedAt: string
}

async function readMap(): Promise<Record<string, ClientSitesEntry>> {
  try {
    const raw = await AsyncStorage.getItem(CLIENT_SITES_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function cacheClientSites(clientId: string, sites: CachedSite[]) {
  const id = String(clientId || '').trim()
  if (!id || !sites.length) return
  const map = await readMap()
  map[id] = { sites, cachedAt: new Date().toISOString() }
  await AsyncStorage.setItem(CLIENT_SITES_CACHE_KEY, JSON.stringify(map))
}

export async function getCachedClientSites(clientId: string): Promise<CachedSite[]> {
  const id = String(clientId || '').trim()
  if (!id) return []
  const map = await readMap()
  return map[id]?.sites || []
}
