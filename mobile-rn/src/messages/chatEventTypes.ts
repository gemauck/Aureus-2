import type { ChatMessage } from './api'

export type ChatEventType =
  | 'message'
  | 'reaction'
  | 'typing'
  | 'conversation'
  | 'message_updated'
  | 'message_deleted'

export type ChatEventPayload = {
  conversationId?: string
  messageId?: string
  senderId?: string
  userId?: string
  name?: string
  message?: ChatMessage
  emoji?: string
  removed?: boolean
  teamId?: string
}

export type ChatEventListener = (event: ChatEventType, data: ChatEventPayload) => void
