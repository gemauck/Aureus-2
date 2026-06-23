import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../state/AuthContext'
import { request } from '../services/apiClient'
import { isRateLimited } from '../services/rateLimitGuard'
import { getMobileClientInfo } from '../services/clientPresence'

const HEARTBEAT_MS = 5 * 60 * 1000
const INITIAL_DELAY_MS = 60_000

/** Report mobile client + OTA version on heartbeat (mirrors browser AuthProvider keepalive). */
export function useClientPresence() {
  const { accessToken } = useAuth()
  const inFlightRef = useRef(false)

  const sendPresence = useCallback(async () => {
    if (!accessToken || inFlightRef.current || isRateLimited()) return
    inFlightRef.current = true
    try {
      await request('/api/users/heartbeat', {
        method: 'POST',
        token: accessToken,
        body: getMobileClientInfo(),
        silent: true
      })
    } catch {
      /* non-fatal */
    } finally {
      inFlightRef.current = false
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return

    const initial = setTimeout(() => {
      void sendPresence()
    }, INITIAL_DELAY_MS)

    const interval = setInterval(() => {
      void sendPresence()
    }, HEARTBEAT_MS)

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sendPresence()
    })

    return () => {
      clearTimeout(initial)
      clearInterval(interval)
      sub.remove()
    }
  }, [accessToken, sendPresence])
}
