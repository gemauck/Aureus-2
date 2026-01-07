import { prisma } from './_lib/prisma.js';
import { verifyToken } from './_lib/jwt.js';
import { parseJsonBody } from './_lib/body.js';
import { created, ok, badRequest, serverError, unauthorized } from './_lib/response.js';

async function handler(req, res) {
  try {
    // Get authenticated user
    let user = req.user;
    if (!user) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = verifyToken(token);
        if (payload && payload.sub) {
          user = {
            ...payload,
            id: payload.sub,
            role: payload.role
          };
        }
      }
    }
    
    if (!user || !user.id) {
      return unauthorized(res);
    }
    
    // Load full user from database to get role
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      });
      
      if (dbUser) {
        user = {
          ...user,
          ...dbUser
        };
      }
    } catch (userError) {
      console.error('❌ Failed to load user:', userError);
      return serverError(res, 'Failed to load user', userError.message);
    }

    // Create Audit Log (POST /api/audit-logs)
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      
      if (!body.action) return badRequest(res, 'action required');
      if (!body.module) return badRequest(res, 'module required');

      // Always use authenticated user's ID as actorId (for security)
      const actorId = user.id;
      
      // Always use the authenticated user's information from database, not from body
      const userName = user.name || user.email || 'System';
      const userRole = user.role || 'System';
      
      const auditLogData = {
        actorId: actorId,
        action: body.action,
        entity: body.module,
        entityId: body.entityId || body.module || 'system',
        diff: JSON.stringify({
          user: userName, // Always use authenticated user's name
          userId: actorId,
          userRole: userRole, // Always use authenticated user's role
          details: body.details || {},
          ipAddress: body.ipAddress || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'N/A',
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
        console.log('✅ Audit log created:', auditLog.id, 'for user:', user.id);
        return created(res, { auditLog });
      } catch (dbError) {
        console.error('❌ Database error creating audit log:', dbError);
        console.error('❌ Audit log data:', JSON.stringify(auditLogData, null, 2));
        return serverError(res, 'Failed to create audit log', dbError.message);
      }
    }

    // Get Audit Logs (GET /api/audit-logs)
    if (req.method === 'GET') {
      // Parse query parameters from req.url
      const url = new URL(req.url, `http://${req.headers.host}`);
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
        console.log('📊 Fetching audit logs with where clause:', JSON.stringify(where, null, 2));
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

        console.log(`✅ Found ${auditLogs.length} audit logs (total: ${total}) for user: ${user.id}, role: ${user.role}`);

        // Transform logs to match the frontend format
        const transformedLogs = auditLogs.map(log => {
          let diff = {};
          try {
            diff = JSON.parse(log.diff || '{}');
          } catch (e) {
            console.warn('⚠️ Failed to parse diff for log:', log.id, e);
          }
          // Prioritize actor relation (database user) over diff (which might have 'System')
          // This ensures we show the actual user name from the database
          const userName = log.actor?.name || log.actor?.email || diff.user || 'System';
          const userRole = log.actor?.role || diff.userRole || 'System';
          
          // Log if actor is missing (for debugging)
          if (!log.actor && log.actorId) {
            console.warn(`⚠️ Audit log ${log.id} has actorId ${log.actorId} but actor relation is missing`);
          }
          
          return {
            id: log.id,
            timestamp: log.createdAt.toISOString(),
            user: userName,
            userId: log.actorId,
            userRole: userRole,
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
        console.error('❌ Error stack:', dbError.stack);
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

