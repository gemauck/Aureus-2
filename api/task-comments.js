// API endpoints for Task Comments
// This uses a separate table instead of storing comments in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';
import { notifyCommentParticipants, resolveMentionedUserIds } from './_lib/notifyCommentParticipants.js';
import { logProjectActivity, getActivityUserFromRequest } from './_lib/projectActivityLog.js';

let taskCommentColumnsEnsured = false;
async function ensureTaskCommentColumns() {
  if (taskCommentColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "attachments" TEXT DEFAULT \'[]\'');
  } catch (e) {
    console.warn('⚠️ TaskComment column ensure failed:', e.message);
  } finally {
    taskCommentColumnsEnsured = true;
  }
}

function parseAttachments(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function normalizeComment(comment) {
  if (!comment) return comment;
  return {
    ...comment,
    attachments: parseAttachments(comment.attachments)
  };
}

export default async function handler(req, res) {
  const { method } = req;
  const { id: commentId, taskId, projectId } = req.query;

  try {
    await ensureTaskCommentColumns();
    if (method === 'GET') {
      // Get comments for a task or project
      if (commentId) {
        // Get single comment
        const comment = await prisma.taskComment.findUnique({
          where: { id: commentId },
          include: {
            authorUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        if (!comment) {
          return notFound(res, 'Comment not found');
        }

        return ok(res, { comment: normalizeComment(comment) });
      } else if (taskId) {
        // Get all comments for a specific task
        const comments = await prisma.taskComment.findMany({
          where: { taskId: String(taskId) },
          orderBy: { createdAt: 'asc' },
          include: {
            authorUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        return ok(res, { comments: comments.map(normalizeComment) });
      } else if (projectId) {
        // Get all comments for a project
        const comments = await prisma.taskComment.findMany({
          where: { projectId: String(projectId) },
          orderBy: { createdAt: 'asc' },
          include: {
            authorUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        return ok(res, { comments: comments.map(normalizeComment) });
      } else {
        return badRequest(res, 'Missing taskId or projectId parameter');
      }
    }

    if (method === 'POST') {
      // Create a new comment
      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          console.error('❌ Failed to parse string body for comment creation:', parseError);
          body = {};
        }
      }

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        // Try to parse from request
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        try {
          body = JSON.parse(buffer.toString());
        } catch (e) {
          body = {};
        }
      }

      const { taskId, projectId, text, author, authorId, userName, attachments } = body;
      const normalizedAttachments = parseAttachments(attachments);
      const normalizedText = String(text || '');

      if (!taskId || !projectId || (!normalizedText.trim() && normalizedAttachments.length === 0)) {
        return badRequest(res, 'Missing required fields: taskId, projectId, and either text or attachments are required');
      }

      // Get current user info if available
      const currentUser = req.user || {};
      const finalAuthorId = authorId || currentUser.sub || currentUser.id || null;
      const finalAuthor = author || currentUser.name || 'Unknown User';
      const finalUserName = userName || currentUser.email || currentUser.name || '';

      const comment = await prisma.taskComment.create({
        data: {
          taskId: String(taskId),
          projectId: String(projectId),
          text: normalizedText,
          author: String(finalAuthor),
          authorId: finalAuthorId,
          userName: finalUserName || null,
          attachments: JSON.stringify(normalizedAttachments)
        },
        include: {
          authorUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      console.log('✅ Created comment:', {
        commentId: comment.id,
        taskId: comment.taskId,
        projectId: comment.projectId,
        author: comment.author
      });

      // Notify participants: task assignee + all subscribers (prior commenters + previously @mentioned in any comment)
      try {
        const [task, priorComments, mentionedIdsResolved] = await Promise.all([
          prisma.task.findUnique({ where: { id: String(taskId) }, select: { assigneeId: true, title: true, subscribers: true } }),
          prisma.taskComment.findMany({
            where: { taskId: String(taskId), id: { not: comment.id } },
            select: { authorId: true, text: true }
          }),
          resolveMentionedUserIds(normalizedText)
        ]);
        const priorAuthorIds = [...new Set((priorComments || []).map((c) => c.authorId).filter(Boolean))];
        const priorCommentTexts = (priorComments || []).map((c) => c.text).filter(Boolean);
        const taskSubscribers = (() => {
          try {
            const raw = task?.subscribers;
            if (raw == null) return [];
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
          } catch (_) { return []; }
        })();
        const subscriberIds = [...new Set([String(finalAuthorId), ...(mentionedIdsResolved || []), ...priorAuthorIds, ...taskSubscribers])].filter(Boolean);
        await notifyCommentParticipants({
          commentAuthorId: finalAuthorId,
          commentText: normalizedText,
          entityAuthorId: task?.assigneeId || null,
          priorCommentAuthorIds: subscriberIds,
          priorCommentTexts,
          authorName: finalAuthor,
          contextTitle: `Task: ${task?.title || taskId}`,
          link: `#/projects/${projectId}?task=${taskId}&commentId=${comment.id}`,
          metadata: { projectId, taskId, taskTitle: task?.title, commentId: comment.id, commentText: normalizedText }
        });
      } catch (notifyErr) {
        console.error('Notify comment participants failed (task comment):', notifyErr);
      }

      const { userId: activityUserId, userName: activityUserName } = getActivityUserFromRequest(req);
      const taskForLog = await prisma.task.findUnique({ where: { id: String(taskId) }, select: { title: true } }).catch(() => null);
      await logProjectActivity(prisma, {
        projectId: String(projectId),
        userId: activityUserId,
        userName: activityUserName,
        type: 'task_comment_added',
        description: `Comment added on task: ${taskForLog?.title || taskId}`,
        metadata: {
          entityType: 'task',
          entityId: String(taskId),
          taskTitle: taskForLog?.title,
          commentId: comment.id,
          snippet: normalizedText.slice(0, 100)
        }
      });

      return ok(res, { comment: normalizeComment(comment) });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a comment
      if (!commentId) {
        return badRequest(res, 'Missing commentId parameter');
      }

      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          console.error('❌ Failed to parse string body for comment update:', parseError);
          body = {};
        }
      }

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        try {
          body = JSON.parse(buffer.toString());
        } catch (e) {
          body = {};
        }
      }

      const updateData = {};
      if (body.text !== undefined) updateData.text = String(body.text);
      if (body.author !== undefined) updateData.author = String(body.author);
      if (body.userName !== undefined) updateData.userName = body.userName || null;
      if (body.attachments !== undefined) updateData.attachments = JSON.stringify(parseAttachments(body.attachments));

      if (Object.keys(updateData).length === 0) {
        return badRequest(res, 'No fields to update');
      }

      const comment = await prisma.taskComment.update({
        where: { id: String(commentId) },
        data: updateData,
        include: {
          authorUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return ok(res, { comment: normalizeComment(comment) });
    }

    if (method === 'DELETE') {
      // Delete a comment
      if (!commentId) {
        return badRequest(res, 'Missing commentId parameter');
      }

      // Check if comment exists first
      const comment = await prisma.taskComment.findUnique({
        where: { id: String(commentId) }
      });

      if (!comment) {
        // Comment doesn't exist - return 404 instead of 500
        return notFound(res, 'Comment not found');
      }

      await prisma.taskComment.delete({
        where: { id: String(commentId) }
      });

      console.log('✅ Deleted comment:', commentId);

      return ok(res, { message: 'Comment deleted successfully' });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Task comment API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

