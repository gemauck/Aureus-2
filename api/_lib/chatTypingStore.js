// Ephemeral in-memory typing indicators (per server process; cleared after ~5s)
const rooms = new Map()

const TYPING_TTL_MS = 5000

function roomMap(conversationId) {
  if (!rooms.has(conversationId)) rooms.set(conversationId, new Map())
  return rooms.get(conversationId)
}

function prune(conversationId) {
  const room = rooms.get(conversationId)
  if (!room) return
  const now = Date.now()
  for (const [userId, entry] of room) {
    if (entry.until < now) room.delete(userId)
  }
  if (room.size === 0) rooms.delete(conversationId)
}

export function setChatTyping(conversationId, userId, name) {
  if (!conversationId || !userId) return
  const room = roomMap(conversationId)
  room.set(userId, { name: name || 'Someone', until: Date.now() + TYPING_TTL_MS })
}

export function getChatTyping(conversationId, excludeUserId) {
  if (!conversationId) return []
  prune(conversationId)
  const room = rooms.get(conversationId)
  if (!room) return []
  const out = []
  for (const [userId, entry] of room) {
    if (userId === excludeUserId) continue
    out.push({ userId, name: entry.name })
  }
  return out
}
