import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { trackError } from '../services/telemetry'
import type { User } from '../types'

type EmbedState = {
  token: string | null
  user: User | null
  loading: boolean
}

/**
 * Short-lived WebView token (15 min). Falls back to the session access token if the
 * embed endpoint is unavailable (e.g. server not yet deployed).
 */
export function useEmbedToken(accessToken: string | null) {
  const [state, setState] = useState<EmbedState>({
    token: null,
    user: null,
    loading: Boolean(accessToken)
  })

  const refreshEmbedToken = useCallback(async () => {
    if (!accessToken) {
      setState({ token: null, user: null, loading: false })
      return
    }
    setState((prev) => ({ ...prev, loading: prev.token == null }))
    try {
      const data = await apiClient.mobileEmbedToken(accessToken)
      setState({ token: data.embedToken, user: data.user, loading: false })
    } catch (err) {
      trackError(err, 'mobileEmbedToken')
      // Keep the previous embed user/token so WebView auth does not flicker on transient errors.
      setState((prev) => ({
        token: prev.token || accessToken,
        user: prev.user,
        loading: false
      }))
    }
  }, [accessToken])

  useEffect(() => {
    void refreshEmbedToken()
  }, [refreshEmbedToken])

  useEffect(() => {
    if (!accessToken) return
    const timer = setInterval(() => {
      void refreshEmbedToken()
    }, 8 * 60 * 1000)
    return () => clearInterval(timer)
  }, [accessToken, refreshEmbedToken])

  return {
    embedToken: state.token,
    embedUser: state.user,
    embedLoading: state.loading,
    refreshEmbedToken
  }
}
