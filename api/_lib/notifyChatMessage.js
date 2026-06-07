// Notify chat participants of new messages (in-app + optional email + push + SSE)
import { prisma } from './prisma.js'
import { createNotificationForUser } from '../notifications.js'

const PREVIEW_MAX = 120

function messagePreview(content, attachments) {
  const text = String(content || '').trim()
  if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text
  const list = Array.isArray(attachments) ? attachments : []
  if (list.length === 1) return `📎 ${list[0].name || 'Attachment'}`
  if (list.length > 1) return `📎 ${list.length} attachments`
  return 'New message'
}

/**
 * @param {{ conversationId: string, messageId: string, senderId: string, senderName: string, content: string, attachments?: unknown[] }}
 */
export async function notifyChatMessageParticipants({
  conversationId,
  messageId,
  senderId,
  senderName,
  content,
  attachments = []
}) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        where: { leftAt: null },
        select: { userId: true, muted: true }
      }
    }
  })
  if (!conversation) return

  const preview = messagePreview(content, attachments)
  const title =
    conversation.type === 'group' && conversation.name
      ? `${senderName} in ${conversation.name}`
      : senderName || 'New message'

  const link = `#/messages?conversation=${encodeURIComponent(conversationId)}`
  const metadata = {
    source: 'chat_message',
    conversationId,
    messageId,
    senderId
  }

  for (const p of conversation.participants) {
    if (p.userId === senderId || p.muted) continue
    void createNotificationForUser(
      p.userId,
      'message',
      title,
      preview,
      link,
      metadata
    ).catch((err) => {
      console.error('notifyChatMessageParticipants failed for user', p.userId, err)
    })
  }
}
