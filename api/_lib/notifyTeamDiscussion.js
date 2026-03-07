/**
 * Notify team members and @mentioned users for team discussions.
 * - New discussion: in-app + email to all team members (except author).
 * - New reply: uses same path as other sections (notifyCommentParticipants for reply emails) + mention type for @mentioned users.
 */
import { prisma } from './prisma.js'
import { createNotificationForUser } from '../notifications.js'
import { resolveMentionedUserIds, notifyCommentParticipants } from './notifyCommentParticipants.js'

/** Decode common HTML entities so @ and names are preserved for mention parsing */
function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#64;|&#x40;/gi, '@')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

/** Strip HTML to plain text for mention parsing */
function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  const raw = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return decodeHtmlEntities(raw)
}

/**
 * Get all user IDs that are members of the team (from Membership).
 * When the team has no memberships, falls back to anyone who has posted in this team (discussion or reply authors)
 * so notification emails still get sent.
 * @param {string} teamId
 * @returns {Promise<string[]>}
 */
export async function getTeamMemberUserIds(teamId) {
  if (!teamId) return []
  const id = String(teamId)
  const memberships = await prisma.membership.findMany({
    where: { teamId: id },
    select: { userId: true }
  })
  let ids = [...new Set(memberships.map((m) => m.userId).filter(Boolean))]
  if (ids.length > 0) return ids
  // Fallback: team has no memberships — use anyone who has posted in this team (discussions or replies)
  const [discussionAuthors, replyAuthors] = await Promise.all([
    prisma.teamDiscussion.findMany({ where: { teamId: id }, select: { authorId: true } }),
    prisma.discussionReply.findMany({
      where: { discussion: { teamId: id } },
      select: { authorId: true }
    })
  ])
  const fromDiscussions = discussionAuthors.map((d) => d.authorId).filter(Boolean)
  const fromReplies = replyAuthors.map((r) => r.authorId).filter(Boolean)
  ids = [...new Set([...fromDiscussions, ...fromReplies])]
  return ids
}

/**
 * Build deep link to team discussions (optionally to a specific discussion).
 * @param {string} teamId
 * @param {string} [discussionId]
 * @returns {string}
 */
export function buildTeamsDiscussionLink(teamId, discussionId) {
  const base = `#/teams/${encodeURIComponent(teamId)}?tab=discussions&team=${encodeURIComponent(teamId)}`
  if (discussionId) return `${base}&discussion=${encodeURIComponent(discussionId)}`
  return base
}

/**
 * Notify all team members when a new discussion is created.
 * Uses type 'comment' so inAppComments/emailComments apply. Skips the author.
 */
export async function notifyTeamDiscussionCreated(opts) {
  const { teamId, teamName, discussionId, discussionTitle, authorId, authorName } = opts
  if (!teamId || !discussionId) return

  const memberIds = await getTeamMemberUserIds(teamId)
  const authorIdStr = authorId ? String(authorId) : null
  const recipientIds = memberIds.filter((id) => authorIdStr !== String(id))
  if (recipientIds.length === 0) return

  const teamLabel = teamName || teamId
  const title = `New discussion in ${teamLabel}: ${(discussionTitle || 'Untitled').slice(0, 60)}${(discussionTitle || '').length > 60 ? '…' : ''}`
  const message = `${authorName || 'Someone'} started a discussion: "${(discussionTitle || '').slice(0, 80)}${(discussionTitle || '').length > 80 ? '…' : ''}"`
  const link = buildTeamsDiscussionLink(teamId, discussionId)
  const metadata = { teamId, discussionId, discussionTitle, source: 'team_discussion', teamName: teamLabel }

  // Send sequentially with small delay to avoid email provider rate limiting (e.g. Resend)
  for (let i = 0; i < recipientIds.length; i++) {
    const userId = recipientIds[i]
    try {
      await createNotificationForUser(userId, 'comment', title, message, link, metadata)
      if (i < recipientIds.length - 1) await new Promise((r) => setTimeout(r, 300))
    } catch (e) {
      console.error('Team discussion created notification failed for user', userId, e)
    }
  }
}

/**
 * Notify team members when a reply is added, and notify @mentioned users (including non-team members) with type 'mention'.
 * - Team members (except author): type 'comment'.
 * - Mentioned users (except author): type 'mention'. Each user gets at most one notification (mention takes precedence).
 */
export async function notifyTeamDiscussionReply(opts) {
  const { teamId, teamName, discussionId, discussionTitle, replyBody, authorId, authorName } = opts
  if (!teamId || !discussionId) return

  const authorIdStr = authorId ? String(authorId) : null
  const link = buildTeamsDiscussionLink(teamId, discussionId)
  const metadata = { teamId, discussionId, discussionTitle, source: 'team_discussion_reply', teamName: teamName || teamId, commentText: replyBody || '', fullComment: replyBody || '' }

  // 1) Resolve @mentions from reply body (strip HTML first)
  const plainText = stripHtml(replyBody || '')
  const mentionedIds = await resolveMentionedUserIds(plainText)
  const mentionedSet = new Set((mentionedIds || []).map(String))

  // 2) Team members to notify for "new reply" (exclude author)
  const memberIds = await getTeamMemberUserIds(teamId)
  const teamRecipients = memberIds.filter((id) => authorIdStr !== String(id))

  // 3) Mentioned users get type 'mention' (exclude author; include non-team members)
  const preview = plainText.length > 100 ? plainText.slice(0, 100) + '…' : plainText
  const mentionTitle = `${authorName || 'Someone'} mentioned you in a reply`
  const mentionMessage = `${authorName || 'Someone'} mentioned you in "${preview}"`

  const mentionResults = await Promise.allSettled(
    mentionedIds
      .filter((id) => authorIdStr !== String(id))
      .map((userId) =>
        createNotificationForUser(userId, 'mention', mentionTitle, mentionMessage, link, metadata)
      )
  )
  mentionResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('Team discussion mention notification failed', r.reason)
    }
  })

  // 4) Team members who were NOT mentioned get "comment" via same path as helpdesk/project-comments/meeting-notes
  const contextTitle = `Team: ${teamName || teamId} — ${(discussionTitle || 'Discussion').slice(0, 50)}${(discussionTitle || '').length > 50 ? '…' : ''}`
  await notifyCommentParticipants({
    commentAuthorId: authorIdStr || undefined,
    commentText: plainText,
    entityAuthorId: null,
    priorCommentAuthorIds: teamRecipients,
    priorCommentTexts: [],
    authorName: authorName || 'Someone',
    contextTitle,
    link,
    metadata: { ...metadata, commentText: replyBody || '', fullComment: replyBody || '' }
  })
}
