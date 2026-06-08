import type { ChatMessage } from './api'

export type ChatEventType =
  | 'message'
  | 'reaction'
  | 'typing'
  | 'conversation'
  | 'message_updated'
  | 'message_deleted'
  | 'call'

export type ChatEventPayload = {
  conversationId?: string
  messageId?: string
  senderId?: string
  senderName?: string
  preview?: string
  userId?: string
  name?: string
  message?: ChatMessage
  emoji?: string
  removed?: boolean
  teamId?: string
  callId?: string
  type?: string
  media?: string
  payload?: unknown
  fromUserId?: string
  fromName?: string
}

export type ChatEventListener = (event: ChatEventType, data: ChatEventPayload) => void
