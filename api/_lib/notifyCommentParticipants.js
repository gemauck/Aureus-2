/**
 * Notify comment participants (task/project owner, prior commenters, @mentioned users)
 * when someone else comments. Sends in-app and email per user preferences.
 */
import { prisma } from './prisma.js';
import { createNotificationForUser } from '../notifications.js';

const MENTION_REGEX = /@([A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+)*)/g;

function normalize(s) {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve @mentions in comment text to user IDs by matching name/email.
 * @param {string} commentText
 * @returns {Promise<string[]>} user IDs of matched users
 */
export async function resolveMentionedUserIds(commentText) {
    if (!commentText || typeof commentText !== 'string') return [];
    const matches = [...commentText.matchAll(MENTION_REGEX)];
    const rawNames = [...new Set(matches.map((m) => (m[1] || '').trim()).filter(Boolean))];
    if (rawNames.length === 0) return [];

    const users = await prisma.user.findMany({
        where: { status: { not: 'inactive' } },
        select: { id: true, name: true, email: true }
    });
    const ids = [];
    for (const raw of rawNames) {
        const norm = normalize(raw);
        const user = users.find((u) => {
            const n = normalize(u.name || '');
            const e = normalize((u.email || '').split('@')[0]);
            return n === norm || e === norm || n.includes(norm) || norm.includes(n) || (e && e.includes(norm));
        });
        if (user && !ids.includes(user.id)) ids.push(user.id);
    }
    return ids;
}

/**
 * Notify all participants (entity author, prior commenters, prior @mentioned, @mentioned in new comment)
 * when a new comment is added. Skips the comment author. Uses type 'comment' so inAppComments/emailComments apply.
 * @param {Object} opts
 * @param {string} opts.commentAuthorId - current comment author (excluded from recipients)
 * @param {string} opts.commentText - text of the new comment
 * @param {string|null} opts.entityAuthorId - task assignee / project owner / ticket creator / etc.
 * @param {string[]} opts.priorCommentAuthorIds - user IDs of everyone who commented before
 * @param {string[]} [opts.priorCommentTexts] - text of prior comments (resolved @mentions also get notified)
 * @param {string} opts.authorName - display name of comment author
 * @param {string} opts.contextTitle - e.g. "Task: Fix bug", "Project: ABC", "Ticket #123"
 * @param {string} opts.link - deep link to the comment/thread
 * @param {Object} opts.metadata - passed to notifications (projectId, taskId, clientId, etc.)
 */
export async function notifyCommentParticipants(opts) {
    const {
        commentAuthorId,
        commentText,
        entityAuthorId,
        priorCommentAuthorIds = [],
        priorCommentTexts = [],
        authorName,
        contextTitle,
        link,
        metadata = {}
    } = opts;
    const mentionedIds = await resolveMentionedUserIds(commentText);
    const priorTexts = Array.isArray(priorCommentTexts) ? priorCommentTexts : [];
    const priorMentionedArrays = await Promise.all(
        priorTexts.filter((t) => t != null && typeof t === 'string' && String(t).trim()).map(resolveMentionedUserIds)
    );
    const priorMentionedIds = [...new Set(priorMentionedArrays.flat())].filter(Boolean);
    const recipientIds = new Set([
        entityAuthorId,
        ...priorCommentAuthorIds,
        ...mentionedIds,
        ...priorMentionedIds
    ].filter(Boolean));
    const authorIdStr = commentAuthorId ? String(commentAuthorId) : null;
    const toNotify = [...recipientIds].filter((id) => authorIdStr !== String(id));
    if (toNotify.length === 0) return;

    const preview = (commentText && commentText.length > 100) ? commentText.slice(0, 100) + '...' : (commentText || '');
    const title = `${authorName} commented on ${contextTitle}`;
    const message = `${authorName} commented: "${preview}"`;
    const meta = { ...metadata, commentText: commentText || '', fullComment: commentText || '' };

    const results = await Promise.allSettled(
        toNotify.map((userId) =>
            createNotificationForUser(userId, 'comment', title, message, link || '#/dashboard', meta)
        )
    );
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            console.error('Comment participant notification failed for user', toNotify[i], r.reason);
        }
    });
}
