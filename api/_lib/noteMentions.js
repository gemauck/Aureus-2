import { prisma } from './prisma.js'
import { resolveMentionedUserIds } from './notifyCommentParticipants.js'
import { createNotificationForUser } from '../notifications.js'

function stripHtml(input) {
  if (!input || typeof input !== 'string') return ''
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildMentionMessage(authorName, contextTitle, plainText) {
  const preview = plainText && plainText.length > 140 ? `${plainText.slice(0, 140)}...` : (plainText || '')
  return `${authorName || 'Someone'} mentioned you in ${contextTitle}: "${preview}"`
}

async function notifyMentionedUsers({
  mentionedUserIds,
  authorId,
  authorName,
  contextTitle,
  link,
  metadata,
  plainText
}) {
  if (!Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) return
  const authorIdStr = authorId != null ? String(authorId) : null
  const recipients = [...new Set(mentionedUserIds.map((id) => String(id)).filter(Boolean))]
    .filter((id) => id !== authorIdStr)

  if (recipients.length === 0) return

  const title = `${authorName || 'Someone'} mentioned you`
  const message = buildMentionMessage(authorName, contextTitle, plainText)
  const payload = { ...(metadata || {}), commentText: plainText, fullComment: plainText }

  await Promise.allSettled(
    recipients.map((userId) => createNotificationForUser(userId, 'mention', title, message, link, payload))
  )
}

export async function syncMentionsOnUserNote({
  noteId,
  ownerId,
  title,
  content,
  clientId = null,
  projectId = null
}) {
  const plainText = stripHtml([title || '', content || ''].filter(Boolean).join('\n'))
  const mentionedIds = await resolveMentionedUserIds(plainText)
  const ownerIdStr = ownerId != null ? String(ownerId) : null
  const recipients = [...new Set((mentionedIds || []).map((id) => String(id)).filter(Boolean))]
    .filter((id) => id !== ownerIdStr)

  if (recipients.length > 0) {
    await prisma.userNoteShare.createMany({
      data: recipients.map((userId) => ({ noteId, userId })),
      skipDuplicates: true
    })
  }

  let contextTitle = 'a note'
  let link = '#/my-notes'
  const metadata = { noteId, source: 'user_note', clientId: clientId || null, projectId: projectId || null }
  if (projectId) {
    contextTitle = `Project Note: ${title || 'Untitled'}`
    link = `#/projects/${encodeURIComponent(projectId)}?tab=notes`
  } else if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, type: true } })
    const isLead = String(client?.type || '').toLowerCase() === 'lead'
    contextTitle = `${isLead ? 'Lead' : 'Client'} Note: ${title || 'Untitled'}`
    link = `#/${isLead ? 'leads' : 'clients'}/${encodeURIComponent(clientId)}?tab=notes`
    if (isLead) metadata.leadId = clientId
  } else {
    contextTitle = `My Note: ${title || 'Untitled'}`
  }

  const owner = ownerIdStr
    ? await prisma.user.findUnique({ where: { id: ownerIdStr }, select: { name: true, email: true } })
    : null
  const ownerName = owner?.name || owner?.email || 'Someone'

  await notifyMentionedUsers({
    mentionedUserIds: recipients,
    authorId: ownerIdStr,
    authorName: ownerName,
    contextTitle,
    link,
    metadata,
    plainText
  })
}

export async function syncMentionsFromEntityNote({
  entityType,
  entityNoteId,
  title,
  content,
  tags = [],
  authorId,
  authorName = null,
  projectId = null,
  clientId = null
}) {
  const plainText = stripHtml([title || '', content || ''].filter(Boolean).join('\n'))
  const mentionedIds = await resolveMentionedUserIds(plainText)
  const authorIdStr = authorId != null ? String(authorId) : null
  const recipients = [...new Set((mentionedIds || []).map((id) => String(id)).filter(Boolean))]
    .filter((id) => id !== authorIdStr)

  const safeEntity = entityType === 'project' ? 'project' : 'client'
  const linkedUserNoteId = `mention-${safeEntity}-note-${entityNoteId}`

  if (recipients.length === 0) {
    await prisma.userNote.deleteMany({ where: { id: linkedUserNoteId, ownerId: authorIdStr } })
  } else {
    await prisma.userNote.upsert({
      where: { id: linkedUserNoteId },
      update: {
        title: title || 'Untitled Note',
        content: content || '',
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        pinned: false,
        isPublic: false,
        ownerId: authorIdStr,
        projectId: projectId || null,
        clientId: clientId || null
      },
      create: {
        id: linkedUserNoteId,
        title: title || 'Untitled Note',
        content: content || '',
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        pinned: false,
        isPublic: false,
        ownerId: authorIdStr,
        projectId: projectId || null,
        clientId: clientId || null
      }
    })

    await prisma.userNoteShare.deleteMany({
      where: {
        noteId: linkedUserNoteId,
        userId: { notIn: recipients }
      }
    })
    await prisma.userNoteShare.createMany({
      data: recipients.map((userId) => ({ noteId: linkedUserNoteId, userId })),
      skipDuplicates: true
    })
  }

  let contextTitle = 'a note'
  let link = '#/my-notes'
  const metadata = {
    source: `${safeEntity}_note`,
    noteId: entityNoteId,
    projectId: projectId || null,
    clientId: clientId || null
  }

  if (safeEntity === 'project' && projectId) {
    contextTitle = `Project Note: ${title || 'Untitled'}`
    link = `#/projects/${encodeURIComponent(projectId)}?tab=notes`
  } else if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, type: true } })
    const isLead = String(client?.type || '').toLowerCase() === 'lead'
    contextTitle = `${isLead ? 'Lead' : 'Client'} Note: ${title || 'Untitled'}`
    link = `#/${isLead ? 'leads' : 'clients'}/${encodeURIComponent(clientId)}?tab=notes`
    if (isLead) metadata.leadId = clientId
  }

  await notifyMentionedUsers({
    mentionedUserIds: recipients,
    authorId: authorIdStr,
    authorName,
    contextTitle,
    link,
    metadata,
    plainText
  })
}
