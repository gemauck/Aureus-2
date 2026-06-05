import { useEffect, useRef } from 'react'
import { useAuth } from '../state/AuthContext'
import { addNotificationResponseListener, registerPushToken, unregisterPushToken } from '../services/pushNotifications'

/** Registers Expo push token after login and handles notification taps → chat. */
export function usePushNotifications(onOpenConversation?: (conversationId: string) => void) {
  const { accessToken } = useAuth()
  const pushTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    registerPushToken(accessToken)
      .then((token) => {
        if (!cancelled) pushTokenRef.current = token
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accessToken])

  useEffect(() => {
    if (!onOpenConversation) return
    return addNotificationResponseListener((data) => {
      if (data.conversationId) onOpenConversation(data.conversationId)
    })
  }, [onOpenConversation])

  useEffect(() => {
    return () => {
      if (accessToken && pushTokenRef.current) {
        void unregisterPushToken(accessToken, pushTokenRef.current)
      }
    }
  }, [accessToken])
}
