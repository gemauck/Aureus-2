// API endpoints for Project Comments
// This uses a separate table instead of storing comments in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';
import { authRequired } from './_lib/authRequired.js';
import { notifyCommentParticipants, resolveMentionedUserIds } from './_lib/notifyCommentParticipants.js';

async function handler(req, res) {
  const { method } = req;
  const { id: commentId, projectId } = req.query;

  try {
    if (method === 'GET') {
      // Get comments for a project
      if (commentId) {
        // Get single comment
        const comment = await prisma.projectComment.findUnique({
          where: { id: commentId },
          include: {
            authorUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            replies: {
              include: {
                authorUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              },
              orderBy: [{ createdAt: 'asc' }]
            }
          }
        });

        if (!comment) {
          return notFound(res, 'Comment not found');
        }

        return ok(res, { comment });
      } else if (projectId) {
        // Get all comments for a project (top-level only, replies included)
        const comments = await prisma.projectComment.findMany({
          where: { 
            projectId: String(projectId),
            parentId: null // Only top-level comments
          },
          orderBy: { createdAt: 'asc' },
          include: {
            authorUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            replies: {
              include: {
                authorUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              },
              orderBy: [{ createdAt: 'asc' }]
            }
          }
        });

        return ok(res, { comments });
      } else {
        return badRequest(res, 'Missing projectId or commentId parameter');
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
        // Try to parse from request stream
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

      const { projectId, text, author, authorId, userName, type, parentId,
        sectionId, documentId, month, year, docYear, source,
        weeklySectionId, weeklyDocumentId, docWeek, weekNumber } = body;

      if (!projectId || !text) {
        return badRequest(res, 'Missing required fields: projectId and text are required');
      }

      // Get current user info if available
      const currentUser = req.user || {};
      const finalAuthorId = authorId || currentUser.sub || currentUser.id || null;
      const finalAuthor = author || currentUser.name || 'Unknown User';
      const finalUserName = userName || currentUser.email || currentUser.name || '';

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: String(projectId) }
      });

      if (!project) {
        return notFound(res, 'Project not found');
      }

      const comment = await prisma.projectComment.create({
        data: {
          projectId: String(projectId),
          text: String(text),
          author: String(finalAuthor),
          authorId: finalAuthorId,
          userName: finalUserName || null,
          type: String(type || 'comment'),
          parentId: parentId || null,
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

      console.log('✅ Created project comment:', {
        commentId: comment.id,
        projectId: comment.projectId,
        author: comment.author
      });

      // Subscribe: comment author + @mentioned + prior commenters get email for all subsequent comments
      // Notify participants: project owner + all subscribers (prior commenters + previously mentioned)
      try {
        const [project, priorComments, mentionedIdsResolved] = await Promise.all([
          prisma.project.findUnique({ where: { id: String(projectId) }, select: { ownerId: true, name: true } }),
          prisma.projectComment.findMany({
            where: { projectId: String(projectId) },
            select: { authorId: true }
          }),
          resolveMentionedUserIds(text)
        ]);
        const priorAuthorIds = [...new Set((priorComments || []).map((c) => c.authorId).filter(Boolean))];
        const threadId = (sectionId || weeklySectionId) && (documentId || weeklyDocumentId)
          ? `${projectId}:${sectionId || weeklySectionId}:${documentId || weeklyDocumentId}:${month ?? ''}:${year ?? docYear ?? ''}`
          : String(projectId);
        const existingSubs = await prisma.commentThreadSubscription.findMany({
          where: { threadType: 'project', threadId },
          select: { userId: true }
        });
        const existingSubIds = (existingSubs || []).map((s) => s.userId).filter(Boolean);
        const subscriberIds = [...new Set([String(finalAuthorId), ...(mentionedIdsResolved || []), ...priorAuthorIds, ...existingSubIds])].filter(Boolean);
        await Promise.all(
          subscriberIds.map((uid) =>
            prisma.commentThreadSubscription.upsert({
              where: {
                threadType_threadId_userId: {
                  threadType: 'project',
                  threadId,
                  userId: String(uid)
                }
              },
              create: { threadType: 'project', threadId, userId: String(uid) },
              update: {}
            })
          )
        );
        const subscriberList = subscriberIds;
        const meta = {
          projectId,
          commentId: comment.id,
          commentText: text,
          sectionId: sectionId || weeklySectionId || undefined,
          documentId: documentId || weeklyDocumentId || undefined,
          month: month !== undefined && month !== null ? month : undefined,
          year: year !== undefined && year !== null ? year : undefined,
          docYear: docYear !== undefined && docYear !== null ? docYear : undefined,
          source: source || undefined,
          weeklySectionId: weeklySectionId || undefined,
          weeklyDocumentId: weeklyDocumentId || undefined,
          docWeek: docWeek !== undefined && docWeek !== null ? docWeek : undefined,
          weekNumber: weekNumber !== undefined && weekNumber !== null ? weekNumber : undefined
        };
        // Build one deep link (same format as trackers): docSectionId, docDocumentId, docMonth/docWeek, docYear, tab
        const sid = sectionId || weeklySectionId;
        const did = documentId || weeklyDocumentId;
        const yearVal = year ?? docYear;
        const weekVal = docWeek ?? weekNumber;
        const linkParts = [`commentId=${encodeURIComponent(comment.id)}`];
        if (sid) linkParts.push(`docSectionId=${encodeURIComponent(sid)}`);
        if (did) linkParts.push(`docDocumentId=${encodeURIComponent(did)}`);
        if (month != null) linkParts.push(`docMonth=${encodeURIComponent(month)}`);
        if (weekVal != null) linkParts.push(`docWeek=${encodeURIComponent(weekVal)}`);
        if (yearVal != null) linkParts.push(`docYear=${encodeURIComponent(yearVal)}`);
        if (source === 'monthlyFMSReview') linkParts.push('tab=monthlyFMSReview');
        const linkWithComment = `#/projects/${projectId}?${linkParts.join('&')}`;
        await notifyCommentParticipants({
          commentAuthorId: finalAuthorId,
          commentText: text,
          entityAuthorId: project?.ownerId || null,
          priorCommentAuthorIds: subscriberList,
          authorName: finalAuthor,
          contextTitle: `Project: ${project?.name || projectId}`,
          link: linkWithComment,
          metadata: meta
        });
      } catch (notifyErr) {
        console.error('Notify comment participants failed (project comment):', notifyErr);
      }

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

      // Check if comment exists
      const existingComment = await prisma.projectComment.findUnique({
        where: { id: commentId }
      });

      if (!existingComment) {
        return notFound(res, 'Comment not found');
      }

      const updateData = {};
      if (body.text !== undefined) updateData.text = String(body.text);
      if (body.type !== undefined) updateData.type = String(body.type);

      const updatedComment = await prisma.projectComment.update({
        where: { id: commentId },
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

      console.log('✅ Updated project comment:', commentId);
      return ok(res, { comment: updatedComment });
    }

    if (method === 'DELETE') {
      // Delete a comment
      if (!commentId) {
        return badRequest(res, 'Missing commentId parameter');
      }

      // Check if comment exists
      const existingComment = await prisma.projectComment.findUnique({
        where: { id: commentId }
      });

      if (!existingComment) {
        return notFound(res, 'Comment not found');
      }

      // Delete comment (replies will be cascade deleted if FK is configured)
      await prisma.projectComment.delete({
        where: { id: commentId }
      });

      console.log('✅ Deleted project comment:', commentId);
      return ok(res, { message: 'Comment deleted successfully' });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Project Comment API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));


