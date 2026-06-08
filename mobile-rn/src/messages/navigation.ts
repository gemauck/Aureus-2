export type MessagesStackParamList = {
  MessagesHome: undefined
  Chat: { conversationId: string; title?: string; conversationType?: 'direct' | 'group'; callId?: string }
}
