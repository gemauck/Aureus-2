import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../state/AuthContext'
import { ApiRequestError, isRateLimitError } from '../services/apiClient'
import { trackError } from '../services/telemetry'

type UseErpQueryOptions = {
  enabled?: boolean
  refetchOnFocus?: boolean
}

type UseErpQueryResult<T> = {
  data: T | null
  loading: boolean
  error: string
  refresh: (opts?: { silent?: boolean }) => Promise<void>
}

export function useErpQuery<T>(
  key: string,
  fetcher: (token: string) => Promise<T>,
  options: UseErpQueryOptions = {}
): UseErpQueryResult<T> {
  const { accessToken } = useAuth()
  const enabled = options.enabled !== false
  const refetchOnFocus = options.refetchOnFocus !== false
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dataRef = useRef<T | null>(null)

  const refresh = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!enabled || !accessToken) return
      const silent = Boolean(opts.silent)
      if (!silent) setLoading(true)
      try {
        const next = await fetcher(accessToken)
        dataRef.current = next
        setData(next)
        setError('')
      } catch (err) {
        if (!(err instanceof ApiRequestError) || !isRateLimitError(err)) {
          trackError(err, `useErpQuery:${key}`)
        }
        setError(err instanceof Error ? err.message : 'Request failed')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [accessToken, enabled, fetcher, key]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useFocusEffect(
    useCallback(() => {
      if (!refetchOnFocus) return
      void refresh({ silent: dataRef.current != null })
    }, [refetchOnFocus, refresh])
  )

  return { data, loading, error, refresh }
}
