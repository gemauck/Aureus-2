import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { jobCardStockPickListFromCachedInventory } from '../../../../src/jobCardWizard/stockPickList.js'
import { REFERENCE_CACHE_KEYS } from '../../../../src/jobCardWizard/constants.js'
import { useNetwork } from '../../hooks/useNetwork'
import { useAuth } from '../../state/AuthContext'
import { jobcardsApi, seedInventoryIdToSkuCache } from '../api'
import type { InventoryItem } from '../types'

const memoryCache = new Map<string, InventoryItem[]>()
let diskCachePromise: Promise<Record<string, InventoryItem[]>> | null = null

/** jobCard: on-hand only (web parity). stockTake: full catalog incl. zero qty. */
export type LocationInventoryMode = 'jobCard' | 'stockTake'

function cacheKey(locationId: string, mode: LocationInventoryMode) {
  return `${mode}:${locationId}`
}

function apiOptsForMode(mode: LocationInventoryMode, token?: string | null) {
  if (mode === 'stockTake') {
    return { includeZero: true, allSkus: true, token: token || undefined }
  }
  return { token: token || undefined }
}

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
  key: string,
  rows: InventoryItem[]
): Promise<void> {
  const disk = await readLocationInventoryDiskCache()
  disk[key] = rows
  diskCachePromise = Promise.resolve(disk)
  try {
    await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.locationInventory, JSON.stringify(disk))
  } catch {
    /* quota — keep in-memory cache */
  }
}

type UseLocationInventoryOptions = {
  mode?: LocationInventoryMode
  /** Offline fallback for job card stock (global catalog cached on device). */
  catalogFallback?: InventoryItem[]
}

/** Fetch location-scoped inventory (van / warehouse stock picker). Cached offline per site. */
export function useLocationInventory(
  locationId: string,
  enabled = true,
  options: UseLocationInventoryOptions = {}
) {
  const mode = options.mode ?? 'jobCard'
  const catalogFallback = options.catalogFallback
  const { isOnline } = useNetwork()
  const { accessToken } = useAuth()
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

    const key = cacheKey(locationId, mode)
    const mem = memoryCache.get(key)
    if (mem) {
      setRows(mem)
      setFromCache(!isOnline)
    } else {
      const disk = await readLocationInventoryDiskCache()
      const cached = disk[key]
      if (Array.isArray(cached) && cached.length) {
        memoryCache.set(key, cached)
        setRows(cached)
        setFromCache(true)
      }
    }

    if (!isOnline) {
      const existing = memoryCache.get(key)
      if (existing?.length) {
        setError('')
        setLoading(false)
        return
      }
      if (mode === 'jobCard' && catalogFallback?.length) {
        const picked = jobCardStockPickListFromCachedInventory(catalogFallback, locationId)
        if (picked.length) {
          memoryCache.set(key, picked)
          setRows(picked)
          setFromCache(true)
          setError('')
          setLoading(false)
          return
        }
      }
      setError('Stock list unavailable offline — open this location once while online.')
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const inv = await jobcardsApi.getPublicInventory(
        locationId,
        apiOptsForMode(mode, accessToken)
      )
      memoryCache.set(key, inv)
      setRows(inv)
      setFromCache(false)
      await writeLocationInventoryDiskCache(key, inv)
      await seedInventoryIdToSkuCache(inv)
      if (!inv.length) {
        setError(
          mode === 'stockTake'
            ? 'No stock items found for this location.'
            : 'No on-hand stock at this location.'
        )
      }
    } catch (e) {
      const fallback = memoryCache.get(key)
      if (fallback?.length) {
        setRows(fallback)
        setFromCache(true)
        setError('')
      } else if (mode === 'jobCard' && catalogFallback?.length) {
        const picked = jobCardStockPickListFromCachedInventory(catalogFallback, locationId)
        setRows(picked)
        setFromCache(true)
        setError('')
      } else {
        setError(e instanceof Error ? e.message : 'Could not load stock list')
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }, [locationId, enabled, isOnline, mode, catalogFallback, accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, loading, error, fromCache, reload: load }
}

/** Warm one location cache while online (optional; job card step loads lazily per row). */
export async function prefetchLocationInventory(
  locationIds: string[],
  mode: LocationInventoryMode = 'jobCard',
  token?: string | null
): Promise<void> {
  const ids = [...new Set(locationIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return
  await Promise.all(
    ids.map(async (locationId) => {
      const key = cacheKey(locationId, mode)
      if (memoryCache.has(key)) return
      try {
        const inv = await jobcardsApi.getPublicInventory(
          locationId,
          apiOptsForMode(mode, token)
        )
        memoryCache.set(key, inv)
        await writeLocationInventoryDiskCache(key, inv)
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
