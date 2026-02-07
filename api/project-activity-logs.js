// API endpoints for Project Activity Logs
// This uses a separate table instead of storing activity logs in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';
import { authRequired } from './_lib/authRequired.js';

let activityLogColumnsEnsured = false;
async function ensureActivityLogColumns() {
  if (activityLogColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "userName" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "description" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "metadata" TEXT DEFAULT \'{}\'' );
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT');
  } catch (e) {
    console.warn('⚠️ ProjectActivityLog column ensure failed:', e.message);
  } finally {
    activityLogColumnsEnsured = true;
  }
}

async function handler(req, res) {
  const { method } = req;
  const { id: logId, projectId, type, userId, startDate, endDate } = req.query;

  try {
    await ensureActivityLogColumns();
    if (method === 'GET') {
      if (logId) {
        // Get single activity log entry
        const log = await prisma.projectActivityLog.findUnique({
          where: { id: logId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        if (!log) {
          return notFound(res, 'Activity log not found');
        }

        return ok(res, { log });
      } else if (projectId) {
        // Get activity logs for a project with optional filters
        const where = {
          projectId: String(projectId)
        };

        if (type) {
          where.type = String(type);
        }

        if (userId) {
          where.userId = String(userId);
        }

        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) {
            where.createdAt.gte = new Date(startDate);
          }
          if (endDate) {
            where.createdAt.lte = new Date(endDate);
          }
        }

        const logs = await prisma.projectActivityLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          take: parseInt(req.query.limit) || 100 // Default limit 100
        });

        return ok(res, { logs });
      } else {
        return badRequest(res, 'Missing projectId or logId parameter');
      }
    }

    if (method === 'POST') {
      // Create a new activity log entry
      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          body = {};
        }
      }

      const { projectId, type, userId, userName, description, metadata, ipAddress, userAgent } = body;

      if (!projectId || !type || !description) {
        return badRequest(res, 'Missing required fields: projectId, type, and description are required');
      }

      // Get current user info if available
      const currentUser = req.user || {};
      const finalUserId = userId || currentUser.sub || currentUser.id || null;
      const finalUserName = userName || currentUser.name || 'System';

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: String(projectId) }
      });

      if (!project) {
        return notFound(res, 'Project not found');
      }

      const log = await prisma.projectActivityLog.create({
        data: {
          projectId: String(projectId),
          type: String(type),
          userId: finalUserId,
          userName: String(finalUserName),
          description: String(description),
          metadata: metadata ? JSON.stringify(metadata) : '{}',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      console.log('✅ Created activity log:', {
        logId: log.id,
        projectId: log.projectId,
        type: log.type
      });

      return ok(res, { log });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Project Activity Log API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));


