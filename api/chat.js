// Chat messaging API — direct messages, group chats, read receipts, notifications
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { parseJsonBody } from './_lib/body.js'
import { badRequest, created, ok, serverError, notFound, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { notifyChatMessageParticipants } from './_lib/notifyChatMessage.js'
import { getChatTyping, setChatTyping } from './_lib/chatTypingStore.js'
import { publishChatEvent } from './_lib/chatEventBus.js'

const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥']

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  role: true,
  lastSeenAt: true,
  jobTitle: true,
  department: true
}

function previewText(content, attachments) {
  const text = String(content || '').trim()
  if (text) return text.length > 200 ? `${text.slice(0, 200)}…` : text
  const list = Array.isArray(attachments) ? attachments : []
  if (list.length) return `📎 ${list.length === 1 ? list[0].name || 'Attachment' : `${list.length} attachments`}`
  return ''
}

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000
}

async function getParticipant(conversationId, userId) {
  return prisma.chatParticipant.findFirst({
    where: { conversationId, userId, leftAt: null }
  })
}

async function getConversationParticipantIds(conversationId) {
  const rows = await prisma.chatParticipant.findMany({
    where: { conversationId, leftAt: null },
    select: { userId: true }
  })
  return rows.map((r) => r.userId)
}

function groupReactions(reactions) {
  const map = new Map()
  for (const r of reactions || []) {
    if (!map.has(r.emoji)) {
      map.set(r.emoji, { emoji: r.emoji, count: 0, userIds: [], users: [] })
    }
    const g = map.get(r.emoji)
    g.count += 1
    g.userIds.push(r.userId)
    if (r.user) g.users.push({ id: r.user.id, name: r.user.name || r.user.email })
  }
  return [...map.values()]
}

function mapMessageRow(m) {
  return {
    ...m,
    reactionGroups: groupReactions(m.reactions)
  }
}

async function createOrGetTeamConversation(teamId, userId) {
  const membership = await prisma.membership.findUnique({
    where: { userId_teamId: { userId: String(userId), teamId: String(teamId) } }
  })
  if (!membership) return { error: 'not_member' }

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } })
  if (!team) return { error: 'team_not_found' }

  let conv = await prisma.chatConversation.findFirst({
    where: { teamId: String(teamId), type: 'group' },
    include: {
      participants: {
        where: { leftAt: null },
        include: { user: { select: USER_SELECT } }
      }
    }
  })

  const memberRows = await prisma.membership.findMany({
    where: { teamId: String(teamId) },
    select: { userId: true }
  })
  const memberIds = [...new Set(memberRows.map((m) => m.userId))]

  if (!conv) {
    conv = await prisma.chatConversation.create({
      data: {
        type: 'group',
        name: team.name || 'Team chat',
        createdById: userId,
        teamId: String(teamId),
        participants: {
          create: memberIds.map((uid) => ({
            userId: uid,
            role: uid === userId ? 'admin' : 'member'
          }))
        }
      },
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: { select: USER_SELECT } }
        }
      }
    })
  } else {
    const existingIds = new Set(conv.participants.map((p) => p.userId))
    const missing = memberIds.filter((id) => !existingIds.has(id))
    if (missing.length) {
      await prisma.chatParticipant.createMany({
        data: missing.map((uid) => ({
          conversationId: conv.id,
          userId: uid,
          role: 'member'
        })),
        skipDuplicates: true
      })
      conv = await prisma.chatConversation.findUnique({
        where: { id: conv.id },
        include: {
          participants: {
            where: { leftAt: null },
            include: { user: { select: USER_SELECT } }
          }
        }
      })
    }
  }

  return { conversation: conv }
}

async function findExistingDirectConversation(userA, userB) {
  const sorted = [userA, userB].sort()
  const candidates = await prisma.chatConversation.findMany({
    where: {
      type: 'direct',
      AND: [
        { participants: { some: { userId: userA, leftAt: null } } },
        { participants: { some: { userId: userB, leftAt: null } } }
      ]
    },
    include: {
      participants: { where: { leftAt: null }, select: { userId: true } }
    }
  })
  return candidates.find((c) => {
    const ids = c.participants.map((p) => p.userId).sort()
    return ids.length === 2 && ids[0] === sorted[0] && ids[1] === sorted[1]
  })
}

/** Per-conversation unread counts in one query (avoids N+1 count per conversation). */
async function getUnreadCountMap(userId) {
  const rows = await prisma.$queryRaw`
    SELECT m."conversationId" AS "conversationId", COUNT(*)::int AS count
    FROM "ChatMessage" m
    INNER JOIN "ChatParticipant" p
      ON p."conversationId" = m."conversationId"
      AND p."userId" = ${userId}
      AND p."leftAt" IS NULL
    WHERE m."deletedAt" IS NULL
      AND m."senderId" <> ${userId}
      AND m."createdAt" > COALESCE(p."lastReadAt", TIMESTAMP '1970-01-01')
    GROUP BY m."conversationId"
  `
  return Object.fromEntries((rows || []).map((r) => [r.conversationId, Number(r.count) || 0]))
}

async function getTotalUnreadCount(userId) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM "ChatMessage" m
    INNER JOIN "ChatParticipant" p
      ON p."conversationId" = m."conversationId"
      AND p."userId" = ${userId}
      AND p."leftAt" IS NULL
    WHERE m."deletedAt" IS NULL
      AND m."senderId" <> ${userId}
      AND m."createdAt" > COALESCE(p."lastReadAt", TIMESTAMP '1970-01-01')
  `
  return Number(rows?.[0]?.total) || 0
}

function formatConversation(conv, currentUserId) {
  const activeParticipants = (conv.participants || []).filter((p) => !p.leftAt)
  const others = activeParticipants.filter((p) => p.userId !== currentUserId)
  let displayName = conv.name
  let displayAvatar = conv.avatar
  if (conv.type === 'direct' && others.length === 1) {
    const u = others[0].user
    displayName = u?.name || u?.email || 'Direct message'
    displayAvatar = u?.avatar || ''
  } else if (conv.type === 'group' && !displayName) {
    displayName = others.map((p) => p.user?.name || p.user?.email).filter(Boolean).slice(0, 3).join(', ') || 'Group chat'
  }

  const myParticipant = activeParticipants.find((p) => p.userId === currentUserId)
  const lastReadAt = myParticipant?.lastReadAt ? new Date(myParticipant.lastReadAt) : null
  const lastMsgAt = conv.lastMessageAt ? new Date(conv.lastMessageAt) : null
  const unreadCount =
    lastMsgAt && (!lastReadAt || lastReadAt < lastMsgAt)
      ? (conv._count?.messages || conv.unreadCount || 1)
      : 0

  return {
    id: conv.id,
    type: conv.type,
    name: displayName,
    avatar: displayAvatar,
    teamId: conv.teamId,
    lastMessageAt: conv.lastMessageAt,
    lastMessagePreview: conv.lastMessagePreview,
    unreadCount,
    muted: myParticipant?.muted || false,
    participants: activeParticipants.map((p) => ({
      id: p.id,
      userId: p.userId,
      role: p.role,
      user: p.user
        ? {
            ...p.user,
            online: isOnline(p.user.lastSeenAt)
          }
        : null
    })),
    createdAt: conv.createdAt
  }
}

async function listConversations(userId) {
  const [rows, unreadMap] = await Promise.all([
    prisma.chatConversation.findMany({
      where: {
        participants: { some: { userId, leftAt: null } }
      },
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: { select: USER_SELECT } }
        }
      },
      orderBy: { lastMessageAt: 'desc' }
    }),
    getUnreadCountMap(userId)
  ])

  return rows.map((conv) => {
    conv.unreadCount = unreadMap[conv.id] || 0
    return formatConversation(conv, userId)
  })
}

async function getMessages(conversationId, userId, { limit = 50, before } = {}) {
  const part = await getParticipant(conversationId, userId)
  if (!part) return null

  const where = { conversationId }
  if (before) where.createdAt = { lt: new Date(before) }

  const messages = await prisma.chatMessage.findMany({
    where,
    include: {
      sender: { select: USER_SELECT },
      replyTo: {
        select: {
          id: true,
          content: true,
          senderId: true,
          deletedAt: true,
          sender: { select: { id: true, name: true } }
        }
      },
      reads: { select: { userId: true, readAt: true } },
      reactions: {
        include: { user: { select: { id: true, name: true, email: true } } }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(parseInt(limit, 10) || 50, 100)
  })

  return messages.reverse().map(mapMessageRow)
}

async function getMessageReadReceipts(messageId, userId) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, createdAt: true, deletedAt: true }
  })
  if (!message || message.deletedAt) return null

  const part = await getParticipant(message.conversationId, userId)
  if (!part) return null

  const reads = await prisma.chatMessageRead.findMany({
    where: { messageId },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    orderBy: { readAt: 'asc' }
  })

  const participants = await prisma.chatParticipant.findMany({
    where: {
      conversationId: message.conversationId,
      leftAt: null,
      userId: { not: message.senderId }
    },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } }
  })

  const explicitIds = new Set(reads.map((r) => r.userId))
  const inferred = participants
    .filter((p) => p.lastReadAt && new Date(p.lastReadAt) >= new Date(message.createdAt))
    .filter((p) => !explicitIds.has(p.userId))
    .map((p) => ({
      userId: p.userId,
      readAt: p.lastReadAt,
      user: p.user
    }))

  const readBy = [
    ...reads.map((r) => ({ userId: r.userId, readAt: r.readAt, user: r.user })),
    ...inferred
  ].sort((a, b) => new Date(a.readAt) - new Date(b.readAt))

  const pending = participants
    .filter((p) => !readBy.some((r) => r.userId === p.userId))
    .map((p) => ({ userId: p.userId, user: p.user }))

  return {
    messageId,
    sentAt: message.createdAt,
    readBy,
    pending
  }
}

async function markConversationRead(conversationId, userId, upToMessageId) {
  const part = await getParticipant(conversationId, userId)
  if (!part) return null

  let readAt = new Date()
  if (upToMessageId) {
    const msg = await prisma.chatMessage.findFirst({
      where: { id: upToMessageId, conversationId },
      select: { createdAt: true }
    })
    if (msg) readAt = msg.createdAt
  }

  await prisma.chatParticipant.update({
    where: { id: part.id },
    data: { lastReadAt: readAt }
  })

  const unreadFromOthers = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      createdAt: { lte: readAt },
      reads: { none: { userId } }
    },
    select: { id: true }
  })

  if (unreadFromOthers.length) {
    await prisma.chatMessageRead.createMany({
      data: unreadFromOthers.map((m) => ({ messageId: m.id, userId })),
      skipDuplicates: true
    })
  }

  return { lastReadAt: readAt }
}

async function handler(req, res) {
  try {
    if (!req.user) return unauthorized(res, 'Authentication required')
    const userId = req.user.sub || req.user.id
    if (!userId) return badRequest(res, 'User not authenticated')

    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '')
    const segments = urlPath.split('/').filter(Boolean)
    // chat | chat/conversations | chat/conversations/:id | chat/conversations/:id/messages | chat/conversations/:id/read | chat/users | chat/unread
    const sub = segments.slice(1)

    // GET /api/chat/events — SSE stream for real-time updates
    if (req.method === 'GET' && sub[0] === 'events' && !sub[1]) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      })
      if (typeof res.flushHeaders === 'function') res.flushHeaders()
      res.write(': connected\n\n')

      const { subscribeChatEvents } = await import('./_lib/chatEventBus.js')
      subscribeChatEvents(userId, res)

      const heartbeat = setInterval(() => {
        if (res.writableEnded || res.destroyed) {
          clearInterval(heartbeat)
          return
        }
        try {
          res.write(': heartbeat\n\n')
        } catch {
          clearInterval(heartbeat)
        }
      }, 25000)

      req.on('close', () => clearInterval(heartbeat))
      return
    }

    // POST /api/chat/from-team/:teamId — open or create team group chat
    if (req.method === 'POST' && sub[0] === 'from-team' && sub[1]) {
      const result = await createOrGetTeamConversation(sub[1], userId)
      if (result.error === 'not_member') return unauthorized(res, 'You are not a member of this team')
      if (result.error === 'team_not_found') return notFound(res, 'Team not found')
      const participantIds = await getConversationParticipantIds(result.conversation.id)
      publishChatEvent(participantIds, 'conversation', { conversationId: result.conversation.id, teamId: sub[1] })
      return ok(res, { conversation: formatConversation(result.conversation, userId) })
    }

    // POST /api/chat/messages/:messageId/reactions — toggle emoji reaction
    if (req.method === 'POST' && sub[0] === 'messages' && sub[1] && sub[2] === 'reactions') {
      const messageId = sub[1]
      const body = await parseJsonBody(req)
      const emoji = String(body.emoji || '').trim()
      if (!ALLOWED_REACTIONS.includes(emoji)) return badRequest(res, 'Invalid reaction emoji')

      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        select: { id: true, conversationId: true, deletedAt: true }
      })
      if (!message || message.deletedAt) return notFound(res, 'Message not found')

      const part = await getParticipant(message.conversationId, userId)
      if (!part) return notFound(res, 'Conversation not found')

      const existing = await prisma.chatMessageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId, emoji } }
      })

      if (existing) {
        await prisma.chatMessageReaction.delete({ where: { id: existing.id } })
      } else {
        await prisma.chatMessageReaction.create({ data: { messageId, userId, emoji } })
      }

      const participantIds = await getConversationParticipantIds(message.conversationId)
      publishChatEvent(participantIds, 'reaction', {
        conversationId: message.conversationId,
        messageId,
        emoji,
        userId,
        removed: !!existing
      })

      const reactions = await prisma.chatMessageReaction.findMany({
        where: { messageId },
        include: { user: { select: { id: true, name: true, email: true } } }
      })

      return ok(res, { messageId, reactionGroups: groupReactions(reactions), toggled: emoji, removed: !!existing })
    }

    // GET /api/chat/messages/:messageId/reads — read receipt details
    if (req.method === 'GET' && sub[0] === 'messages' && sub[1] && sub[2] === 'reads') {
      const receipts = await getMessageReadReceipts(sub[1], userId)
      if (!receipts) return notFound(res, 'Message not found')
      return ok(res, receipts)
    }

    // PATCH /api/chat/messages/:messageId — edit own message
    if (req.method === 'PATCH' && sub[0] === 'messages' && sub[1] && !sub[2]) {
      const messageId = sub[1]
      const body = await parseJsonBody(req)
      const content = String(body.content || '').trim()
      if (!content) return badRequest(res, 'content is required')
      if (content.length > 10000) return badRequest(res, 'Message too long')

      const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } })
      if (!existing || existing.deletedAt) return notFound(res, 'Message not found')
      if (existing.senderId !== userId) return unauthorized(res, 'Only the sender can edit this message')

      const part = await getParticipant(existing.conversationId, userId)
      if (!part) return notFound(res, 'Conversation not found')

      const message = await prisma.chatMessage.update({
        where: { id: messageId },
        data: { content, editedAt: new Date() },
        include: {
          sender: { select: USER_SELECT },
          replyTo: {
            select: {
              id: true,
              content: true,
              senderId: true,
              deletedAt: true,
              sender: { select: { id: true, name: true } }
            }
          },
          reads: { select: { userId: true, readAt: true } },
          reactions: { include: { user: { select: { id: true, name: true, email: true } } } }
        }
      })

      const preview = previewText(content, message.attachments)
      await prisma.chatConversation.update({
        where: { id: existing.conversationId },
        data: { lastMessagePreview: preview || 'Message' }
      })

      const mapped = mapMessageRow(message)
      const participantIds = await getConversationParticipantIds(existing.conversationId)
      publishChatEvent(participantIds, 'message_updated', {
        conversationId: existing.conversationId,
        messageId,
        message: mapped
      })

      return ok(res, { message: mapped })
    }

    // DELETE /api/chat/messages/:messageId — soft-delete own message
    if (req.method === 'DELETE' && sub[0] === 'messages' && sub[1] && !sub[2]) {
      const messageId = sub[1]
      const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } })
      if (!existing || existing.deletedAt) return notFound(res, 'Message not found')
      if (existing.senderId !== userId) return unauthorized(res, 'Only the sender can delete this message')

      const part = await getParticipant(existing.conversationId, userId)
      if (!part) return notFound(res, 'Conversation not found')

      await prisma.chatMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date(), content: '' }
      })

      const participantIds = await getConversationParticipantIds(existing.conversationId)
      publishChatEvent(participantIds, 'message_deleted', {
        conversationId: existing.conversationId,
        messageId
      })

      return ok(res, { messageId, deleted: true })
    }

    // GET /api/chat/unread — total unread count for badge
    if (req.method === 'GET' && sub[0] === 'unread' && !sub[1]) {
      const unreadCount = await getTotalUnreadCount(userId)
      return ok(res, { unreadCount })
    }

    // GET /api/chat/users — search colleagues for new chat
    if (req.method === 'GET' && sub[0] === 'users') {
      const q = String(req.query?.q || '').trim().toLowerCase()
      const users = await prisma.user.findMany({
        where: {
          id: { not: userId },
          status: { not: 'inactive' },
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } }
                ]
              }
            : {})
        },
        select: USER_SELECT,
        orderBy: { name: 'asc' },
        take: 50
      })
      return ok(res, {
        users: users.map((u) => ({ ...u, online: isOnline(u.lastSeenAt) }))
      })
    }

    // GET /api/chat/conversations — list
    if (req.method === 'GET' && sub[0] === 'conversations' && !sub[1]) {
      const conversations = await listConversations(userId)
      const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
      return ok(res, { conversations, totalUnread })
    }

    // POST /api/chat/conversations — create DM or group
    if (req.method === 'POST' && sub[0] === 'conversations' && !sub[1]) {
      const body = await parseJsonBody(req)
      const participantIds = Array.isArray(body.participantIds)
        ? [...new Set(body.participantIds.map(String).filter((id) => id && id !== userId))]
        : []
      const type = body.type === 'group' || participantIds.length > 1 ? 'group' : 'direct'

      if (type === 'direct') {
        const otherId = participantIds[0] || body.userId
        if (!otherId) return badRequest(res, 'participantIds or userId required for direct chat')
        const existing = await findExistingDirectConversation(userId, otherId)
        if (existing) {
          const full = await prisma.chatConversation.findUnique({
            where: { id: existing.id },
            include: {
              participants: {
                where: { leftAt: null },
                include: { user: { select: USER_SELECT } }
              }
            }
          })
          return ok(res, { conversation: formatConversation(full, userId), existing: true })
        }
        participantIds.length = 0
        participantIds.push(otherId)
      }

      if (!participantIds.length) return badRequest(res, 'At least one participant required')

      const allIds = [userId, ...participantIds]
      const validUsers = await prisma.user.findMany({
        where: { id: { in: allIds }, status: { not: 'inactive' } },
        select: { id: true }
      })
      if (validUsers.length !== allIds.length) return badRequest(res, 'One or more users not found')

      const name = String(body.name || '').trim()
      const conversation = await prisma.chatConversation.create({
        data: {
          type,
          name: type === 'group' ? name : '',
          avatar: String(body.avatar || ''),
          createdById: userId,
          teamId: body.teamId || null,
          participants: {
            create: allIds.map((uid, idx) => ({
              userId: uid,
              role: uid === userId ? 'admin' : 'member'
            }))
          }
        },
        include: {
          participants: {
            where: { leftAt: null },
            include: { user: { select: USER_SELECT } }
          }
        }
      })

      return created(res, { conversation: formatConversation(conversation, userId) })
    }

    const conversationId = sub[0] === 'conversations' ? sub[1] : null

    if (conversationId) {
      // GET /api/chat/conversations/:id
      if (req.method === 'GET' && !sub[2]) {
        const conv = await prisma.chatConversation.findFirst({
          where: {
            id: conversationId,
            participants: { some: { userId, leftAt: null } }
          },
          include: {
            participants: {
              where: { leftAt: null },
              include: { user: { select: USER_SELECT } }
            }
          }
        })
        if (!conv) return notFound(res, 'Conversation not found')
        return ok(res, { conversation: formatConversation(conv, userId) })
      }

      // GET /api/chat/conversations/:id/typing
      if (req.method === 'GET' && sub[2] === 'typing') {
        const part = await getParticipant(conversationId, userId)
        if (!part) return notFound(res, 'Conversation not found')
        return ok(res, { typing: getChatTyping(conversationId, userId) })
      }

      // POST /api/chat/conversations/:id/typing
      if (req.method === 'POST' && sub[2] === 'typing') {
        const part = await getParticipant(conversationId, userId)
        if (!part) return notFound(res, 'Conversation not found')
        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true }
        })
        setChatTyping(conversationId, userId, sender?.name || sender?.email || 'Someone')
        const participantIds = await getConversationParticipantIds(conversationId)
        publishChatEvent(
          participantIds.filter((id) => id !== userId),
          'typing',
          { conversationId, userId, name: sender?.name || sender?.email || 'Someone' }
        )
        return ok(res, { ok: true })
      }

      // GET /api/chat/conversations/:id/messages
      if (req.method === 'GET' && sub[2] === 'messages') {
        const limit = req.query?.limit
        const before = req.query?.before
        const messages = await getMessages(conversationId, userId, { limit, before })
        if (messages === null) return notFound(res, 'Conversation not found')
        return ok(res, { messages })
      }

      // POST /api/chat/conversations/:id/messages
      if (req.method === 'POST' && sub[2] === 'messages') {
        const part = await getParticipant(conversationId, userId)
        if (!part) return notFound(res, 'Conversation not found')

        const body = await parseJsonBody(req)
        const content = String(body.content || '').trim()
        const attachments = Array.isArray(body.attachments) ? body.attachments : []
        const replyToId = body.replyToId || null

        if (!content && !attachments.length) return badRequest(res, 'Message content or attachment required')
        if (content.length > 10000) return badRequest(res, 'Message too long (max 10000 characters)')

        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true }
        })
        const senderName = sender?.name || sender?.email || 'Someone'

        const message = await prisma.chatMessage.create({
          data: {
            conversationId,
            senderId: userId,
            content,
            attachments,
            replyToId
          },
          include: {
            sender: { select: USER_SELECT },
            replyTo: {
              select: {
                id: true,
                content: true,
                senderId: true,
                deletedAt: true,
                sender: { select: { id: true, name: true } }
              }
            },
            reads: { select: { userId: true, readAt: true } },
            reactions: {
              include: { user: { select: { id: true, name: true, email: true } } }
            }
          }
        })

        const mappedMessage = mapMessageRow(message)

        const preview = previewText(content, attachments)
        await prisma.chatConversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: message.createdAt,
            lastMessagePreview: preview || 'New message'
          }
        })

        await markConversationRead(conversationId, userId, message.id)

        void notifyChatMessageParticipants({
          conversationId,
          messageId: message.id,
          senderId: userId,
          senderName,
          content,
          attachments
        })

        const participantIds = await getConversationParticipantIds(conversationId)
        publishChatEvent(participantIds, 'message', {
          conversationId,
          messageId: message.id,
          senderId: userId,
          senderName,
          preview: preview || 'New message'
        })

        return created(res, { message: mappedMessage })
      }

      // PATCH /api/chat/conversations/:id/read
      if (req.method === 'PATCH' && sub[2] === 'read') {
        const body = await parseJsonBody(req).catch(() => ({}))
        const result = await markConversationRead(conversationId, userId, body.messageId)
        if (!result) return notFound(res, 'Conversation not found')
        return ok(res, result)
      }

      // PATCH /api/chat/conversations/:id — mute, rename group
      if (req.method === 'PATCH' && !sub[2]) {
        const part = await getParticipant(conversationId, userId)
        if (!part) return notFound(res, 'Conversation not found')
        const body = await parseJsonBody(req)

        if (body.muted !== undefined) {
          await prisma.chatParticipant.update({
            where: { id: part.id },
            data: { muted: !!body.muted }
          })
        }

        const conv = await prisma.chatConversation.findUnique({ where: { id: conversationId } })
        if (body.name !== undefined && conv?.type === 'group' && part.role === 'admin') {
          await prisma.chatConversation.update({
            where: { id: conversationId },
            data: { name: String(body.name).trim() }
          })
        }

        const updated = await prisma.chatConversation.findFirst({
          where: { id: conversationId },
          include: {
            participants: {
              where: { leftAt: null },
              include: { user: { select: USER_SELECT } }
            }
          }
        })
        return ok(res, { conversation: formatConversation(updated, userId) })
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ Chat API error:', error)
    return serverError(res, 'Chat request failed', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
