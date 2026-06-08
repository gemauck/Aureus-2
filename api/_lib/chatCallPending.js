// Short-lived store for 1:1 call invites (SDP) when callee opens app from push/SSE miss.

const TTL_MS = 60_000
/** @type {Map<string, { callId: string, conversationId: string, media: string, fromUserId: string, fromName: string, offer: unknown, expiresAt: number }>} */
const byCallId = new Map()

function prune() {
  const now = Date.now()
  for (const [id, row] of byCallId) {
    if (row.expiresAt <= now) byCallId.delete(id)
  }
}

export function storePendingCallInvite(row) {
  if (!row?.callId) return
  prune()
  byCallId.set(String(row.callId), {
    callId: String(row.callId),
    conversationId: String(row.conversationId),
    media: row.media === 'video' ? 'video' : 'audio',
    fromUserId: String(row.fromUserId),
    fromName: String(row.fromName || 'Someone'),
    offer: row.offer || null,
    expiresAt: Date.now() + TTL_MS
  })
}

export function clearPendingCallInvite(callId) {
  if (!callId) return
  byCallId.delete(String(callId))
}

export function getPendingCallForConversation(conversationId, userId) {
  if (!conversationId || !userId) return null
  prune()
  for (const row of byCallId.values()) {
    if (row.conversationId === conversationId && row.fromUserId !== userId && row.expiresAt > Date.now()) {
      return row
    }
  }
  return null
}
