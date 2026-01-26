// API for comment-thread subscriptions (clients, leads, document items, etc.)
// Tasks use task.subscribers; other contexts use this table.

import { authRequired } from './_lib/authRequired.js';
import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest } from './_lib/response.js';
import { parseJsonBody } from './_lib/body.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';

async function handler(req, res) {
  const method = req.method?.toUpperCase() || 'GET';
  const { threadType, threadId, userId } = req.query;
  const currentUser = req.user || {};
  const currentUserId = currentUser.sub || currentUser.id;

  try {
    if (method === 'POST') {
      const body = await parseJsonBody(req);
      const list = body.userIds || (body.userId ? [body.userId] : []);
      const type = body.threadType || threadType;
      const id = body.threadId || threadId;
      if (!type || !id) {
        return badRequest(res, 'threadType and threadId are required');
      }
      const userIds = Array.isArray(list) ? list : [list].filter(Boolean);
      if (userIds.length === 0) {
        return ok(res, { updated: 0, subscribers: [] });
      }
      const created = await prisma.$transaction(
        userIds.map((uid) =>
          prisma.commentThreadSubscription.upsert({
            where: {
              threadType_threadId_userId: {
                threadType: String(type),
                threadId: String(id),
                userId: String(uid)
              }
            },
            create: {
              threadType: String(type),
              threadId: String(id),
              userId: String(uid)
            },
            update: {}
          })
        )
      );
      const subscribers = await prisma.commentThreadSubscription.findMany({
        where: { threadType: String(type), threadId: String(id) },
        select: { userId: true }
      });
      return ok(res, { updated: created.length, subscribers: subscribers.map((s) => s.userId) });
    }

    if (method === 'DELETE') {
      const type = threadType;
      const id = threadId;
      const targetUserId = userId || currentUserId;
      if (!type || !id || !targetUserId) {
        return badRequest(res, 'threadType and threadId are required (userId defaults to current user)');
      }
      await prisma.commentThreadSubscription.deleteMany({
        where: {
          threadType: String(type),
          threadId: String(id),
          userId: String(targetUserId)
        }
      });
      return ok(res, { unsubscribed: true });
    }

    if (method === 'GET') {
      const type = threadType;
      const id = threadId;
      if (!type || !id) {
        return badRequest(res, 'threadType and threadId are required');
      }
      const rows = await prisma.commentThreadSubscription.findMany({
        where: { threadType: String(type), threadId: String(id) },
        select: { userId: true, createdAt: true }
      });
      const mine = currentUserId
        ? rows.some((r) => String(r.userId) === String(currentUserId))
        : false;
      return ok(res, {
        subscribers: rows.map((r) => r.userId),
        isSubscribed: mine
      });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (e) {
    if (e.code === 'P2025') {
      return ok(res, { unsubscribed: true });
    }
    console.error('comment-subscriptions error:', e);
    return serverError(res, 'Failed to process request', e.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));
