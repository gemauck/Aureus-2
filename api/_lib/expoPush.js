// Send push notifications via Expo Push API (mobile app)
import { prisma } from './prisma.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * @param {string[]} userIds
 * @param {{ title: string, body: string, data?: Record<string, unknown>, channelId?: string }}
 */
export async function sendPushToUsers(userIds, { title, body, data = {}, channelId = 'erp' }) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))]
  if (!ids.length) return { sent: 0, reason: 'no_users' }

  const tokens = await prisma.pushDeviceToken.findMany({
    where: { userId: { in: ids } },
    select: { token: true, userId: true }
  })
  const pushTokens = tokens.map((t) => t.token).filter((t) => t && t.startsWith('ExponentPushToken'))
  if (!pushTokens.length) {
    console.warn('[expoPush] No Expo push tokens registered for user(s):', ids.join(', '))
    return { sent: 0, reason: 'no_tokens' }
  }

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
    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      console.warn('[expoPush] HTTP failed:', res.status, text.slice(0, 300))
      return { sent: 0, reason: 'http_error', status: res.status }
    }
    const tickets = json?.data
    if (Array.isArray(tickets)) {
      for (const ticket of tickets) {
        if (ticket?.status === 'error') {
          console.warn('[expoPush] Delivery error:', ticket.message, ticket.details || '')
        }
      }
    }
    return { sent: pushTokens.length, tickets }
  } catch (err) {
    console.warn('[expoPush] Request error:', err.message)
    return { sent: 0, reason: 'request_error', error: err.message }
  }
}
