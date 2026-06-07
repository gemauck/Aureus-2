// Send push notifications via Expo Push API (mobile app)
import { prisma } from './prisma.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * @param {string[]} userIds
 * @param {{ title: string, body: string, data?: Record<string, unknown>, channelId?: string }}
 */
export async function sendPushToUsers(userIds, { title, body, data = {}, channelId = 'erp' }) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))]
  if (!ids.length) return

  const tokens = await prisma.pushDeviceToken.findMany({
    where: { userId: { in: ids } },
    select: { token: true }
  })
  const pushTokens = tokens.map((t) => t.token).filter((t) => t && t.startsWith('ExponentPushToken'))
  if (!pushTokens.length) return

  const messages = pushTokens.map((to) => ({
    to,
    title: title || 'New message',
    body: body || '',
    data,
    sound: 'default',
    priority: 'high',
    channelId: channelId || 'erp'
  }))

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messages)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('Expo push failed:', res.status, text.slice(0, 200))
    }
  } catch (err) {
    console.warn('Expo push error:', err.message)
  }
}
