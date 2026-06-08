import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../state/AuthContext'
import { addNotificationResponseListener, registerPushToken, unregisterPushToken } from '../services/pushNotifications'
import type { PushNotificationData } from '../notifications/notificationNavigation'

/** Registers Expo push token after login and handles notification taps. */
export function usePushNotifications(onOpenNotification?: (data: PushNotificationData) => void) {
  const { accessToken } = useAuth()
  const pushTokenRef = useRef<string | null>(null)
  const onOpenRef = useRef(onOpenNotification)
  const handledColdStartRef = useRef(false)

  useEffect(() => {
    onOpenRef.current = onOpenNotification
  }, [onOpenNotification])

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
    if (handledColdStartRef.current) return
    handledColdStartRef.current = true

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return
      const data = (response.notification.request.content.data || {}) as PushNotificationData
      onOpenRef.current?.(data)
    })

    return addNotificationResponseListener((data) => {
      onOpenRef.current?.(data)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (accessToken && pushTokenRef.current) {
        void unregisterPushToken(accessToken, pushTokenRef.current)
      }
    }
  }, [accessToken])
}
