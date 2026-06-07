import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { erpApi } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'

const POLL_MS = 30_000

type NotificationUnreadContextValue = {
  unreadCount: number
  refresh: () => Promise<void>
  decrementUnread: (count?: number) => void
}

const NotificationUnreadContext = createContext<NotificationUnreadContextValue | undefined>(
  undefined
)

export function NotificationUnreadProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setUnreadCount(0)
      return
    }
    try {
      const count = await erpApi.getNotificationUnreadCount(accessToken)
      setUnreadCount(count)
    } catch {
      /* keep last count on transient errors */
    }
  }, [accessToken])

  const decrementUnread = useCallback((count = 1) => {
    setUnreadCount((prev) => Math.max(0, prev - count))
  }, [])

  useEffect(() => {
    void refresh()
    if (!accessToken) return

    const id = setInterval(() => void refresh(), POLL_MS)
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void refresh()
    }
    const sub = AppState.addEventListener('change', onAppState)
    return () => {
      clearInterval(id)
      sub.remove()
    }
  }, [accessToken, refresh])

  const value = useMemo(
    () => ({ unreadCount, refresh, decrementUnread }),
    [unreadCount, refresh, decrementUnread]
  )

  return (
    <NotificationUnreadContext.Provider value={value}>{children}</NotificationUnreadContext.Provider>
  )
}

export function useNotificationUnread() {
  const ctx = useContext(NotificationUnreadContext)
  if (!ctx) {
    throw new Error('useNotificationUnread must be used within NotificationUnreadProvider')
  }
  return ctx
}
