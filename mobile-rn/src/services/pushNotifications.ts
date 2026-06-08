import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { request } from './apiClient'
import type { PushNotificationData } from '../notifications/notificationNavigation'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
})

function resolveExpoProjectId(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  if (extra?.eas?.projectId) return extra.eas.projectId
  const easConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig
  if (easConfig?.projectId) return easConfig.projectId
  return undefined
}

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Chat messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
  })
  await Notifications.setNotificationChannelAsync('erp', {
    name: 'ERP updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
  })
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
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
  if (final !== 'granted') {
    console.warn('[push] Notification permission not granted:', final)
    return null
  }

  await ensureAndroidChannels()

  const projectId = resolveExpoProjectId()
  let token: string | undefined
  try {
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync()
    token = tokenData.data
  } catch (err) {
    console.warn('[push] getExpoPushTokenAsync failed:', err instanceof Error ? err.message : err)
    if (!projectId) {
      console.warn('[push] Set EXPO_PUBLIC_EAS_PROJECT_ID in mobile-rn/.env for reliable push tokens')
    }
    return null
  }

  if (!token) return null

  try {
    await request('/api/push', {
      method: 'POST',
      token: accessToken,
      body: { token, platform: 'expo' }
    })
    console.log('[push] Registered device token with server')
  } catch (err) {
    console.warn('[push] Server token registration failed:', err instanceof Error ? err.message : err)
    return null
  }

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

export function addNotificationReceivedListener(
  handler: (data: PushNotificationData, title: string, body: string) => void
) {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const content = notification.request.content
    const data = (content.data || {}) as PushNotificationData
    handler(data, content.title || 'Notification', content.body || '')
  })
  return () => sub.remove()
}

export async function showLocalChatNotification(opts: {
  title: string
  body: string
  conversationId?: string
  messageId?: string
}) {
  const { title, body, conversationId, messageId } = opts
  await ensureAndroidChannels()
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: {
        type: 'message',
        conversationId,
        messageId
      } as PushNotificationData,
      ...(Platform.OS === 'android' ? { channelId: 'chat' } : {})
    },
    trigger: null
  })
}
