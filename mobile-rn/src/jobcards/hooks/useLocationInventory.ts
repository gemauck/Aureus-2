import { useCallback, useEffect, useState } from 'react'
import { jobcardsApi } from '../api'
import type { InventoryItem } from '../types'

const cache = new Map<string, InventoryItem[]>()

/** Fetch location-scoped inventory (same as web job card stock picker). */
export function useLocationInventory(locationId: string, enabled = true) {
  const [rows, setRows] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!locationId || !enabled) {
      setRows([])
      return
    }
    const cached = cache.get(locationId)
    if (cached) {
      setRows(cached)
    }
    setLoading(true)
    setError('')
    try {
      const inv = await jobcardsApi.getPublicInventory(locationId, {
        includeZero: true,
        allSkus: true
      })
      cache.set(locationId, inv)
      setRows(inv)
      if (!inv.length) {
        setError('No stock items found for this location.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load stock list')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [locationId, enabled])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, loading, error, reload: load }
}

export function clearLocationInventoryCache() {
  cache.clear()
}
