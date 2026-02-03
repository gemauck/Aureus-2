/**
 * POST /api/notifications/comment-participants
 * Notify prior participants (prior commenters + prior @mentioned) when a new comment is added.
 * Used by Document Collection and FMS trackers that don't have a backend comment API.
 */
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, ok, serverError } from '../_lib/response.js';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { parseJsonBody } from '../_lib/body.js';
import { notifyCommentParticipants } from '../_lib/notifyCommentParticipants.js';

async function handler(req, res) {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.method !== 'POST') {
        return badRequest(res, 'Method not allowed');
    }

    try {
        const body = req.body || await parseJsonBody(req);
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
        } = body || {};

        if (!commentAuthorId || !commentText || !authorName || !contextTitle) {
            return badRequest(res, 'Missing required fields: commentAuthorId, commentText, authorName, contextTitle');
        }

        await notifyCommentParticipants({
            commentAuthorId,
            commentText,
            entityAuthorId: entityAuthorId || null,
            priorCommentAuthorIds: Array.isArray(priorCommentAuthorIds) ? priorCommentAuthorIds : [],
            priorCommentTexts: Array.isArray(priorCommentTexts) ? priorCommentTexts : [],
            authorName,
            contextTitle,
            link: link || '#/dashboard',
            metadata: typeof metadata === 'object' ? metadata : {}
        });

        return ok(res, { success: true });
    } catch (error) {
        console.error('❌ POST /api/notifications/comment-participants error:', error);
        return serverError(res, 'Failed to notify comment participants', error.message);
    }
}

export default withLogging(withHttp(authRequired(handler)));
