import { prisma } from './_lib/prisma.js';
import { authRequired } from './_lib/authRequired.js';
import { parseJsonBody } from './_lib/body.js';
import { created, ok, badRequest, serverError } from './_lib/response.js';

async function handler(req, res) {
  try {
    // Parse URL to get path segments
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Get authenticated user
    const user = await authRequired(req, res);
    if (!user) return; // authRequired already sent response

    // Create Audit Log (POST /api/audit-logs)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'audit-logs') {
      const body = await parseJsonBody(req);
      
      if (!body.action) return badRequest(res, 'action required');
      if (!body.module) return badRequest(res, 'module required');

      const auditLogData = {
        actorId: body.userId || user.id,
        action: body.action,
        entity: body.module,
        entityId: body.entityId || 'system',
        diff: JSON.stringify({
          user: body.user || user.name || 'System',
          userId: body.userId || user.id,
          userRole: body.userRole || user.role || 'System',
          details: body.details || {},
          ipAddress: body.ipAddress || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'N/A',
          sessionId: body.sessionId || 'N/A',
          success: body.success !== undefined ? body.success : true
        }),
        createdAt: body.timestamp ? new Date(body.timestamp) : new Date()
      };

      try {
        const auditLog = await prisma.auditLog.create({
          data: auditLogData,
          include: {
            actor: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
          }
        });
        return created(res, { auditLog });
      } catch (dbError) {
        console.error('❌ Database error creating audit log:', dbError);
        return serverError(res, 'Failed to create audit log', dbError.message);
      }
    }

    // Get Audit Logs (GET /api/audit-logs)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'audit-logs') {
      const queryParams = url.searchParams;
      const userId = queryParams.get('userId');
      const module = queryParams.get('module');
      const action = queryParams.get('action');
      const startDate = queryParams.get('startDate');
      const endDate = queryParams.get('endDate');
      const limit = parseInt(queryParams.get('limit') || '1000');
      const offset = parseInt(queryParams.get('offset') || '0');

      const where = {};
      
      // Check if user is admin - if not, only show their own logs
      const isAdmin = user.role?.toLowerCase() === 'admin';
      if (!isAdmin) {
        where.actorId = user.id;
      } else if (userId) {
        where.actorId = userId;
      }

      if (module) {
        where.entity = module;
      }

      if (action) {
        where.action = action;
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

      try {
        const [auditLogs, total] = await Promise.all([
          prisma.auditLog.findMany({
            where,
            include: {
              actor: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: limit,
            skip: offset
          }),
          prisma.auditLog.count({ where })
        ]);

        // Transform logs to match the frontend format
        const transformedLogs = auditLogs.map(log => {
          const diff = JSON.parse(log.diff || '{}');
          return {
            id: log.id,
            timestamp: log.createdAt.toISOString(),
            user: diff.user || log.actor?.name || 'System',
            userId: log.actorId,
            userRole: diff.userRole || log.actor?.role || 'System',
            action: log.action,
            module: log.entity,
            details: diff.details || {},
            ipAddress: diff.ipAddress || 'N/A',
            sessionId: diff.sessionId || 'N/A',
            success: diff.success !== undefined ? diff.success : true
          };
        });

        return ok(res, {
          logs: transformedLogs,
          total,
          limit,
          offset
        });
      } catch (dbError) {
        console.error('❌ Database error fetching audit logs:', dbError);
        return serverError(res, 'Failed to fetch audit logs', dbError.message);
      }
    }

    return badRequest(res, 'Invalid endpoint');
  } catch (error) {
    console.error('❌ Error in audit-logs handler:', error);
    return serverError(res, 'Internal server error', error.message);
  }
}

export default handler;

