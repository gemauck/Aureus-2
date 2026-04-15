/**
 * Notify comment participants (task/project owner, prior commenters, @mentioned users)
 * when someone else comments. Sends in-app and email per user preferences.
 */
import { prisma } from './prisma.js';
import { createNotificationForUser } from '../notifications.js';

// Match @mention: allow letters, digits, dots, underscores, hyphens, apostrophe (O'Brien), and spaces between words
const MENTION_REGEX = /@([A-Za-z0-9._'-]+(?:\s+[A-Za-z0-9._'-]+)*)/g;

/** Normalize for matching: lowercase, strip non-alphanumeric, collapse accents (é -> e) */
function normalize(s) {
    if (!s) return '';
    const str = String(s).toLowerCase();
    // NFD = decomposed accents so "é" -> "e" + combining accent; then remove combining marks
    const decomposed = str.normalize && typeof str.normalize('NFD') === 'string' ? str.normalize('NFD').replace(/\p{M}/gu, '') : str;
    return decomposed.replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve one or more display names (e.g. prior comment authors) to user IDs.
 * Used when document collection comments only have author name, not authorId.
 * @param {string[]} authorNames - display names or email local parts
 * @returns {Promise<string[]>} user IDs of matched users
 */
export async function resolveAuthorNamesToUserIds(authorNames) {
    const names = Array.isArray(authorNames) ? authorNames : [];
    const trimmed = [...new Set(names.map((n) => (n != null && typeof n === 'string' ? n.trim() : '')).filter(Boolean))];
    if (trimmed.length === 0) return [];

    const users = await prisma.user.findMany({
        where: { status: { not: 'inactive' } },
        select: { id: true, name: true, email: true }
    });
    const ids = [];
    for (const raw of trimmed) {
        const norm = normalize(raw);
        const user = users.find((u) => {
            const n = normalize(u.name || '');
            const e = normalize((u.email || '').split('@')[0]);
            const fullEmail = normalize((u.email || '').replace('@', ''));
            // Strict match only to avoid false positives notifying unrelated users.
            return n === norm || e === norm || fullEmail === norm;
        });
        if (user && !ids.includes(user.id)) ids.push(user.id);
    }
    return ids;
}

/**
 * Resolve @mentions in comment text to user IDs by matching name/email.
 * @param {string} commentText
 * @returns {Promise<string[]>} user IDs of matched users
 */
export async function resolveMentionedUserIds(commentText) {
    if (!commentText || typeof commentText !== 'string') return [];
    const str = String(commentText).trim();
    if (!str.includes('@')) return [];
    const matches = [...str.matchAll(MENTION_REGEX)];
    const rawNames = [...new Set(matches.map((m) => (m[1] || '').trim()).filter(Boolean))];
    if (rawNames.length === 0) return [];

    const users = await prisma.user.findMany({
        where: { status: { not: 'inactive' } },
        select: { id: true, name: true, email: true }
    });
    const ids = [];
    for (const raw of rawNames) {
        const norm = normalize(raw);
        if (!norm) continue;
        const user = users.find((u) => {
            const n = normalize(u.name || '');
            const e = normalize((u.email || '').split('@')[0]);
            const fullEmail = normalize((u.email || '').replace('@', ''));
            // Strict match only to avoid false positives on short/partial mention text.
            return n === norm || e === norm || fullEmail === norm;
        });
        if (user) {
            const idStr = String(user.id);
            if (!ids.includes(idStr)) ids.push(idStr);
        }
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
 * @param {string[]} [opts.priorCommentAuthorNames] - display names of prior commenters (resolved to IDs when authorId missing)
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
        priorCommentAuthorNames = [],
        priorCommentTexts = [],
        authorName,
        contextTitle,
        link,
        metadata = {}
    } = opts;
    const mentionedIds = await resolveMentionedUserIds(commentText);
    // Resolve prior comment author names to IDs (document collection often has author name only, not authorId)
    const priorAuthorNames = Array.isArray(priorCommentAuthorNames) ? priorCommentAuthorNames : [];
    const priorAuthorIdsFromNames = priorAuthorNames.length > 0
        ? await resolveAuthorNamesToUserIds(priorAuthorNames)
        : [];
    const preview = (commentText && commentText.length > 100) ? commentText.slice(0, 100) + '...' : (commentText || '');
    const authorIdStr = commentAuthorId ? String(commentAuthorId) : null;
    const mentionedSet = new Set((mentionedIds || []).map(String));

    // Always notify users mentioned in this comment from backend so delivery
    // does not depend on a frontend helper being loaded.
    const mentionMeta = { ...metadata, commentText: commentText || '', fullComment: commentText || '' };
    const mentionTitle = `${authorName} mentioned you`;
    const mentionMessage = `${authorName} mentioned you in ${contextTitle}: "${preview}"`;
    const mentionedToNotify = [...mentionedSet].filter((id) => authorIdStr !== String(id));
    if (mentionedToNotify.length > 0) {
        const mentionResults = await Promise.allSettled(
            mentionedToNotify.map((userId) =>
                createNotificationForUser(userId, 'mention', mentionTitle, mentionMessage, link || '#/dashboard', mentionMeta)
            )
        );
        mentionResults.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error('Mention notification failed for user', mentionedToNotify[i], r.reason);
            }
        });
    }

    // Recipients: entity author and prior commenters only.
    // Exclude users @mentioned in this comment so they do not receive both
    // a mention and a generic comment notification.
    const recipientIds = new Set([
        entityAuthorId,
        ...priorCommentAuthorIds,
        ...priorAuthorIdsFromNames
    ].filter(Boolean));
    const toNotify = [...recipientIds].filter(
        (id) => authorIdStr !== String(id) && !mentionedSet.has(String(id))
    );
    if (toNotify.length === 0) return;

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
