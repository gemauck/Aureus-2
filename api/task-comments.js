// API endpoints for Task Comments
// This uses a separate table instead of storing comments in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';

export default async function handler(req, res) {
  const { method } = req;
  const { id: commentId, taskId, projectId } = req.query;

  try {
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

        return ok(res, { comment });
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

        return ok(res, { comments });
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

        return ok(res, { comments });
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

      const { taskId, projectId, text, author, authorId, userName } = body;

      if (!taskId || !projectId || !text) {
        return badRequest(res, 'Missing required fields: taskId, projectId, and text are required');
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
          text: String(text),
          author: String(finalAuthor),
          authorId: finalAuthorId,
          userName: finalUserName || null
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

      return ok(res, { comment });
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

      return ok(res, { comment });
    }

    if (method === 'DELETE') {
      // Delete a comment
      if (!commentId) {
        return badRequest(res, 'Missing commentId parameter');
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

