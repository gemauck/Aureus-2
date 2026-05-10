/**
 * In-memory presence for Management Meeting Notes (same Node process).
 * Entries expire after TTL if no heartbeat is received.
 */

const TTL_MS = 45_000

/** @type {Map<string, Map<string, { userId: string, name: string, email: string, avatar: string, lastSeen: number }>>} */
const rooms = new Map()

function pruneRoom(roomKey) {
  const room = rooms.get(roomKey)
  if (!room) return
  const now = Date.now()
  for (const [userId, entry] of room) {
    if (now - entry.lastSeen > TTL_MS) {
      room.delete(userId)
    }
  }
  if (room.size === 0) {
    rooms.delete(roomKey)
  }
}

/**
 * @param {string} roomKey
 * @param {{ id?: string, sub?: string, name?: string | null, email?: string | null, avatar?: string | null }} user
 */
export function touchMeetingNotesPresence(roomKey, user) {
  if (!roomKey || !(user?.id || user?.sub)) return
  const userId = String(user.id || user.sub)
  let room = rooms.get(roomKey)
  if (!room) {
    room = new Map()
    rooms.set(roomKey, room)
  }
  room.set(userId, {
    userId,
    name: (user.name && String(user.name).trim()) || user.email || 'User',
    email: user.email ? String(user.email) : '',
    avatar: user.avatar ? String(user.avatar) : '',
    lastSeen: Date.now()
  })
  pruneRoom(roomKey)
}

/**
 * @param {string} roomKey
 * @param {string} [excludeUserId] — omit current user from viewer list
 * @returns {Array<{ userId: string, name: string, email: string, avatar: string }>}
 */
export function getMeetingNotesPresence(roomKey, excludeUserId) {
  pruneRoom(roomKey)
  const room = rooms.get(roomKey)
  if (!room) return []
  const now = Date.now()
  const out = []
  for (const [, entry] of room) {
    if (now - entry.lastSeen > TTL_MS) continue
    if (excludeUserId && entry.userId === excludeUserId) continue
    out.push({
      userId: entry.userId,
      name: entry.name,
      email: entry.email,
      avatar: entry.avatar
    })
  }
  return out.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}
