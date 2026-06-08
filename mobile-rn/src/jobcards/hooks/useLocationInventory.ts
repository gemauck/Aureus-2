import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { REFERENCE_CACHE_KEYS } from '../../../../src/jobCardWizard/constants.js'
import { useNetwork } from '../../hooks/useNetwork'
import { jobcardsApi } from '../api'
import type { InventoryItem } from '../types'

const memoryCache = new Map<string, InventoryItem[]>()
let diskCachePromise: Promise<Record<string, InventoryItem[]>> | null = null

async function readLocationInventoryDiskCache(): Promise<Record<string, InventoryItem[]>> {
  if (!diskCachePromise) {
    diskCachePromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(REFERENCE_CACHE_KEYS.locationInventory)
        const parsed = JSON.parse(raw || '{}')
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    })()
  }
  return diskCachePromise
}

async function writeLocationInventoryDiskCache(
  locationId: string,
  rows: InventoryItem[]
): Promise<void> {
  const disk = await readLocationInventoryDiskCache()
  disk[locationId] = rows
  diskCachePromise = Promise.resolve(disk)
  try {
    await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.locationInventory, JSON.stringify(disk))
  } catch {
    /* quota — keep in-memory cache */
  }
}

/** Fetch location-scoped inventory (van / warehouse stock picker). Cached offline per site. */
export function useLocationInventory(locationId: string, enabled = true) {
  const { isOnline } = useNetwork()
  const [rows, setRows] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const load = useCallback(async () => {
    if (!locationId || !enabled) {
      setRows([])
      setFromCache(false)
      return
    }

    const mem = memoryCache.get(locationId)
    if (mem) {
      setRows(mem)
      setFromCache(!isOnline)
    } else {
      const disk = await readLocationInventoryDiskCache()
      const cached = disk[locationId]
      if (Array.isArray(cached) && cached.length) {
        memoryCache.set(locationId, cached)
        setRows(cached)
        setFromCache(true)
      }
    }

    if (!isOnline) {
      if (!memoryCache.get(locationId)?.length) {
        setError('Stock list unavailable offline — open this location once while online.')
        setRows([])
      } else {
        setError('')
      }
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const inv = await jobcardsApi.getPublicInventory(locationId, {
        includeZero: true,
        allSkus: true
      })
      memoryCache.set(locationId, inv)
      setRows(inv)
      setFromCache(false)
      await writeLocationInventoryDiskCache(locationId, inv)
      if (!inv.length) {
        setError('No stock items found for this location.')
      }
    } catch (e) {
      const fallback = memoryCache.get(locationId)
      if (fallback?.length) {
        setRows(fallback)
        setFromCache(true)
        setError('')
      } else {
        setError(e instanceof Error ? e.message : 'Could not load stock list')
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }, [locationId, enabled, isOnline])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, loading, error, fromCache, reload: load }
}

/** Warm per-location stock caches while online (e.g. all vans on the stock step). */
export async function prefetchLocationInventory(locationIds: string[]): Promise<void> {
  const ids = [...new Set(locationIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return
  await Promise.all(
    ids.map(async (locationId) => {
      if (memoryCache.has(locationId)) return
      try {
        const inv = await jobcardsApi.getPublicInventory(locationId, {
          includeZero: true,
          allSkus: true
        })
        memoryCache.set(locationId, inv)
        await writeLocationInventoryDiskCache(locationId, inv)
      } catch {
        /* best-effort prefetch */
      }
    })
  )
}

export function clearLocationInventoryCache() {
  memoryCache.clear()
  diskCachePromise = null
}
