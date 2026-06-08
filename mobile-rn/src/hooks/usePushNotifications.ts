import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../state/AuthContext'
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  registerPushToken,
  unregisterPushToken
} from '../services/pushNotifications'
import type { PushNotificationData } from '../notifications/notificationNavigation'
import { useNotificationUnread } from '../notifications/NotificationUnreadContext'
import { useChatEvents } from '../messages/ChatEventsContext'

/** Registers Expo push token after login and handles notification taps + foreground receipt. */
export function usePushNotifications(onOpenNotification?: (data: PushNotificationData) => void) {
  const { accessToken } = useAuth()
  const pushTokenRef = useRef<string | null>(null)
  const onOpenRef = useRef(onOpenNotification)
  const handledColdStartRef = useRef(false)
  const { refresh: refreshNotificationUnread } = useNotificationUnread()
  const { refreshChatUnread } = useChatEvents()

  useEffect(() => {
    onOpenRef.current = onOpenNotification
  }, [onOpenNotification])

  const register = () => {
    if (!accessToken) return
    void registerPushToken(accessToken)
      .then((token) => {
        pushTokenRef.current = token
      })
      .catch((err) => {
        console.warn('[push] Registration error:', err instanceof Error ? err.message : err)
      })
  }

  useEffect(() => {
    if (!accessToken) return
    register()
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') register()
    })
    return () => sub.remove()
  }, [accessToken])

  useEffect(() => {
    if (handledColdStartRef.current) return
    handledColdStartRef.current = true

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return
      const data = (response.notification.request.content.data || {}) as PushNotificationData
      onOpenRef.current?.(data)
    })

    const removeOpen = addNotificationResponseListener((data) => {
      onOpenRef.current?.(data)
    })

    const removeReceived = addNotificationReceivedListener((data) => {
      const isChat = data.type === 'message' || !!data.conversationId
      if (isChat) {
        void refreshChatUnread()
      } else {
        void refreshNotificationUnread()
      }
    })

    return () => {
      removeOpen()
      removeReceived()
    }
  }, [refreshChatUnread, refreshNotificationUnread])

  useEffect(() => {
    return () => {
      if (accessToken && pushTokenRef.current) {
        void unregisterPushToken(accessToken, pushTokenRef.current)
      }
    }
  }, [accessToken])
}
