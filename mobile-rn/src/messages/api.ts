import { request } from '../services/apiClient'
import { uriToDataUrl } from '../jobcards/media/mediaUri'

export type ChatUser = {
  id: string
  name?: string
  email?: string
  avatar?: string
  online?: boolean
  jobTitle?: string
  department?: string
}

export type ChatConversation = {
  id: string
  type: 'direct' | 'group'
  name: string
  avatar?: string
  lastMessageAt?: string
  lastMessagePreview?: string
  unreadCount?: number
  participants?: Array<{ userId: string; user?: ChatUser; lastReadAt?: string }>
}

export type ChatAttachment = {
  name?: string
  url?: string
  mimeType?: string
  kind?: string
  size?: number
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  content: string
  attachments?: ChatAttachment[]
  replyToId?: string | null
  replyTo?: { id: string; content?: string; sender?: { name?: string }; deletedAt?: string }
  createdAt: string
  editedAt?: string | null
  deletedAt?: string | null
  reads?: Array<{ userId: string; readAt: string }>
  sender?: ChatUser
  reactionGroups?: Array<{ emoji: string; count: number; userIds: string[] }>
}

export type MessageReadReceipts = {
  messageId: string
  sentAt: string
  readBy: Array<{ userId: string; readAt: string; user?: ChatUser }>
  pending: Array<{ userId: string; user?: ChatUser }>
}

export const chatApi = {
  listConversations(token: string) {
    return request<{ conversations: ChatConversation[] }>('/api/chat/conversations', { token }).then(
      (d) => d.conversations || []
    )
  },

  getUnreadCount(token: string) {
    return request<{ unreadCount: number }>('/api/chat/unread', { token, silent: true }).then(
      (d) => d.unreadCount || 0
    )
  },

  searchUsers(token: string, q = '') {
    return request<{ users: ChatUser[] }>(`/api/chat/users?q=${encodeURIComponent(q)}`, { token }).then(
      (d) => d.users || []
    )
  },

  createConversation(token: string, body: { type?: string; name?: string; participantIds: string[] }) {
    return request<{ conversation: ChatConversation }>('/api/chat/conversations', {
      token,
      method: 'POST',
      body
    }).then((d) => d.conversation)
  },

  getMessages(token: string, conversationId: string, limit = 80) {
    return request<{ messages: ChatMessage[] }>(
      `/api/chat/conversations/${conversationId}/messages?limit=${limit}`,
      { token }
    ).then((d) => d.messages || [])
  },

  sendMessage(
    token: string,
    conversationId: string,
    body: { content: string; attachments?: ChatAttachment[]; replyToId?: string | null }
  ) {
    return request<{ message: ChatMessage }>(`/api/chat/conversations/${conversationId}/messages`, {
      token,
      method: 'POST',
      body
    }).then((d) => d.message)
  },

  editMessage(token: string, messageId: string, content: string) {
    return request<{ message: ChatMessage }>(`/api/chat/messages/${messageId}`, {
      token,
      method: 'PATCH',
      body: { content }
    }).then((d) => d.message)
  },

  deleteMessage(token: string, messageId: string) {
    return request<{ messageId: string; deleted: boolean }>(`/api/chat/messages/${messageId}`, {
      token,
      method: 'DELETE'
    })
  },

  getMessageReads(token: string, messageId: string) {
    return request<MessageReadReceipts>(`/api/chat/messages/${messageId}/reads`, { token })
  },

  uploadFile(token: string, name: string, dataUrl: string, folder = 'chat') {
    return request<{ url: string; name: string; mimeType?: string; size?: number }>('/api/files', {
      token,
      method: 'POST',
      body: { name, dataUrl, folder }
    })
  },

  async uploadVoiceNote(token: string, localUri: string) {
    const dataUrl = await uriToDataUrl(localUri, 'audio/mp4')
    const ext = localUri.split('.').pop()?.toLowerCase() === 'webm' ? 'webm' : 'm4a'
    return chatApi.uploadFile(token, `voice-${Date.now()}.${ext}`, dataUrl, 'chat')
  },

  markRead(token: string, conversationId: string) {
    return request(`/api/chat/conversations/${conversationId}/read`, {
      token,
      method: 'PATCH',
      body: {}
    })
  },

  pingTyping(token: string, conversationId: string) {
    return request(`/api/chat/conversations/${conversationId}/typing`, {
      token,
      method: 'POST',
      body: {}
    })
  },

  getTyping(token: string, conversationId: string) {
    return request<{ typing: Array<{ userId: string; name: string }> }>(
      `/api/chat/conversations/${conversationId}/typing`,
      { token }
    ).then((d) => d.typing || [])
  },

  toggleReaction(token: string, messageId: string, emoji: string) {
    return request<{ messageId: string; reactionGroups: Array<{ emoji: string; count: number; userIds: string[] }> }>(
      `/api/chat/messages/${messageId}/reactions`,
      { token, method: 'POST', body: { emoji } }
    )
  },

  openTeamChat(token: string, teamId: string) {
    return request<{ conversation: ChatConversation }>(`/api/chat/from-team/${teamId}`, {
      token,
      method: 'POST',
      body: {}
    }).then((d) => d.conversation)
  },

  getNotificationSettings(token: string) {
    return request<{ settings: { emailMessages?: boolean } }>('/api/notifications/settings', { token }).then(
      (d) => d.settings || {}
    )
  },

  updateEmailMessages(token: string, emailMessages: boolean) {
    return request<{ settings: { emailMessages?: boolean } }>('/api/notifications/settings', {
      token,
      method: 'PUT',
      body: { emailMessages }
    }).then((d) => d.settings || {})
  },

  sendCallSignal(
    token: string,
    conversationId: string,
    body: { callId: string; type: string; media: 'audio' | 'video'; payload?: unknown }
  ) {
    return request(`/api/chat/conversations/${conversationId}/call-signal`, {
      token,
      method: 'POST',
      body
    })
  },

  getCallPending(token: string, conversationId: string) {
    return request<{
      pending: {
        callId: string
        conversationId: string
        media: string
        fromUserId: string
        fromName: string
        offer: { type?: string; sdp?: string }
      } | null
    }>(`/api/chat/conversations/${conversationId}/call-pending`, { token }).then((d) => d.pending)
  }
}
