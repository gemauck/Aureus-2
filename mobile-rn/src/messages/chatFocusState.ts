/** Tracks which conversation is open so we can suppress alerts for the active thread. */
let activeConversationId: string | null = null

export function setActiveChatConversation(conversationId: string | null) {
  activeConversationId = conversationId ? String(conversationId) : null
}

export function getActiveChatConversation(): string | null {
  return activeConversationId
}
