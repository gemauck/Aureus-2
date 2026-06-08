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
    // Badge is synced from in-app unread counts — do not apply stale badge from push payload.
    shouldSetBadge: false
  })
})

/** Home-screen app icon badge (iOS + supported Android launchers). */
export async function setAppIconBadge(count: number) {
  const next = Math.max(0, Math.floor(count))
  try {
    await Notifications.setBadgeCountAsync(next)
  } catch {
    /* unsupported on some Android launchers */
  }
}

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
  // Recreate chat channel so vibration/importance updates apply after app upgrades.
  await Notifications.deleteNotificationChannelAsync('chat').catch(() => {})
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Chat messages',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    enableVibrate: true,
    sound: 'message.wav',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false
  })
  await Notifications.deleteNotificationChannelAsync('erp').catch(() => {})
  await Notifications.setNotificationChannelAsync('erp', {
    name: 'ERP updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    enableVibrate: true,
    sound: 'notification.wav',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
  })
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default'
  })
  await Notifications.deleteNotificationChannelAsync('call').catch(() => {})
  await Notifications.setNotificationChannelAsync('call', {
    name: 'Voice & video calls',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 300, 500, 300, 500],
    enableVibrate: true,
    sound: 'notification.wav',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false
  })
}

export async function registerPushToken(accessToken: string): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync()
  let final = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true
      }
    })
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

export async function hasPushNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync()
  return status === 'granted'
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
      sound: 'message.wav',
      priority: Notifications.AndroidNotificationPriority.MAX,
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

export async function showLocalCallNotification(opts: {
  title: string
  body: string
  conversationId: string
  callId?: string
  media?: string
  fromUserId?: string
  fromName?: string
}) {
  const { title, body, conversationId, callId, media, fromUserId, fromName } = opts
  await ensureAndroidChannels()
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'notification.wav',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: {
        type: 'call_invite',
        conversationId,
        callId,
        media,
        fromUserId,
        fromName
      } as PushNotificationData,
      ...(Platform.OS === 'android' ? { channelId: 'call' } : {})
    },
    trigger: null
  })
}
