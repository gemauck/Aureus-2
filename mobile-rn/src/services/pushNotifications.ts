import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { request } from './apiClient'
import type { PushNotificationData } from '../notifications/notificationNavigation'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
})

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Chat messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default'
  })
  await Notifications.setNotificationChannelAsync('erp', {
    name: 'ERP updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    sound: 'default'
  })
}

export async function registerPushToken(accessToken: string): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync()
  let final = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    final = status
  }
  if (final !== 'granted') return null

  await ensureAndroidChannels()

  const tokenData = await Notifications.getExpoPushTokenAsync()
  const token = tokenData.data
  if (!token) return null

  await request('/api/push', {
    method: 'POST',
    token: accessToken,
    body: { token, platform: 'expo' }
  })
  return token
}

export async function unregisterPushToken(accessToken: string, pushToken?: string) {
  try {
    await request('/api/push', {
      method: 'DELETE',
      token: accessToken,
      body: pushToken ? { token: pushToken } : {}
    })
  } catch {
    /* ignore logout cleanup errors */
  }
}

export function addNotificationResponseListener(handler: (data: PushNotificationData) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = (response.notification.request.content.data || {}) as PushNotificationData
    handler(data)
  })
  return () => sub.remove()
}
