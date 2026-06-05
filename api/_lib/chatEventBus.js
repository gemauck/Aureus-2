// In-memory SSE subscribers for chat real-time events (per server process)

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const userStreams = new Map()

export function subscribeChatEvents(userId, res) {
  const id = String(userId)
  if (!userStreams.has(id)) userStreams.set(id, new Set())
  userStreams.get(id).add(res)

  const cleanup = () => {
    userStreams.get(id)?.delete(res)
    if (userStreams.get(id)?.size === 0) userStreams.delete(id)
  }
  res.on('close', cleanup)
  res.on('error', cleanup)
  return cleanup
}

function writeEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) return false
  try {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
    return true
  } catch {
    return false
  }
}

export function publishChatEvent(userIds, event, data) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))]
  for (const uid of ids) {
    const streams = userStreams.get(uid)
    if (!streams) continue
    for (const res of [...streams]) {
      if (!writeEvent(res, event, data)) {
        streams.delete(res)
      }
    }
  }
}

export function publishChatEventToConversation(participantUserIds, event, data) {
  publishChatEvent(participantUserIds, event, data)
}
