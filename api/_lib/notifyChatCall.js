// Push + optional in-app notification when a 1:1 Messenger call starts ringing.
import { sendPushToUsers } from './expoPush.js'
import { createNotificationForUser } from '../notifications.js'

/**
 * @param {{ conversationId: string, callId: string, media: string, senderId: string, senderName: string, calleeUserIds: string[] }}
 */
export async function notifyChatCallInvite({
  conversationId,
  callId,
  media,
  senderId,
  senderName,
  calleeUserIds = []
}) {
  const ids = [...new Set((calleeUserIds || []).map(String).filter((id) => id && id !== senderId))]
  if (!ids.length) return

  const label = senderName || 'Someone'
  const isVideo = media === 'video'
  const title = isVideo ? `${label} — video call` : `${label} — voice call`
  const body = 'Tap to answer in Messenger'
  const link = `#/messages?conversation=${encodeURIComponent(conversationId)}&call=${encodeURIComponent(callId)}`
  const metadata = {
    source: 'chat_call',
    conversationId,
    callId,
    media,
    senderId
  }

  for (const userId of ids) {
    void createNotificationForUser(userId, 'message', title, body, link, metadata).catch(() => {})
  }

  void sendPushToUsers(ids, {
    title,
    body,
    channelId: 'call',
    data: {
      type: 'call_invite',
      conversationId,
      callId,
      media: isVideo ? 'video' : 'audio',
      fromUserId: senderId,
      fromName: label
    }
  }).catch((err) => {
    console.warn('[notifyChatCall] push failed:', err?.message || err)
  })
}
