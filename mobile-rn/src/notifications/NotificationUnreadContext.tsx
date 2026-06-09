import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useNetwork } from '../hooks/useNetwork'
import {
  cacheNotificationUnread,
  readCachedNotificationUnread
} from '../offline/erpReadCaches'
import { erpApi } from '../services/erpApi'
import { playNotificationSound } from '../services/notificationSounds'
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
  const { isOnline } = useNetwork()
  const [unreadCount, setUnreadCount] = useState(0)
  const prevUnreadRef = React.useRef(0)
  const primedRef = React.useRef(false)

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setUnreadCount(0)
      prevUnreadRef.current = 0
      primedRef.current = false
      return
    }
    if (!isOnline) {
      const cached = await readCachedNotificationUnread()
      if (cached != null) {
        setUnreadCount(cached)
        prevUnreadRef.current = cached
        primedRef.current = true
      }
      return
    }
    try {
      const count = await erpApi.getNotificationUnreadCount(accessToken)
      if (primedRef.current && count > prevUnreadRef.current) {
        void playNotificationSound('notification')
      }
      prevUnreadRef.current = count
      primedRef.current = true
      setUnreadCount(count)
      await cacheNotificationUnread(count)
    } catch {
      const cached = await readCachedNotificationUnread()
      if (cached != null) {
        setUnreadCount(cached)
        prevUnreadRef.current = cached
      }
    }
  }, [accessToken, isOnline])

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
