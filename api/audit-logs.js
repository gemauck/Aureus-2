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

      // For admins migrating logs, preserve the original userId from the log
      // For regular users, always use their own ID (security)
      let actorId = user.id;
      let actorName = user.name || user.email || 'System';
      let actorRole = user.role || 'System';
      
      // If admin and body has userId (migration scenario), try to use that user
      const isAdmin = user.role?.toLowerCase() === 'admin';
      if (isAdmin && body.userId && body.userId !== 'system' && body.userId !== user.id) {
        try {
          const originalUser = await prisma.user.findUnique({
            where: { id: body.userId },
            select: { id: true, name: true, email: true, role: true }
          });
          if (originalUser) {
            actorId = originalUser.id;
            actorName = originalUser.name || originalUser.email || 'System';
            actorRole = originalUser.role || 'System';
            console.log(`🔄 Migrating log for original user: ${actorName} (${actorId})`);
          }
        } catch (userLookupError) {
          console.warn('⚠️ Could not find original user for migration, using current user:', body.userId, userLookupError.message);
          // Fall back to current user
        }
      }
      
      const auditLogData = {
        actorId: actorId,
        action: body.action,
        entity: body.module,
        entityId: body.entityId || body.module || 'system',
        diff: JSON.stringify({
          user: actorName, // Use the actor's name (original user if migrated, current user otherwise)
          userId: actorId,
          userRole: actorRole, // Use the actor's role
          details: body.details || {},
          ipAddress: body.ipAddress || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'N/A',
          sessionId: body.sessionId || 'N/A',
          success: body.success !== undefined ? body.success : true
        }),
        createdAt: body.timestamp ? new Date(body.timestamp) : new Date()
      };

      try {
        console.log('📝 Creating audit log with data:', JSON.stringify(auditLogData, null, 2));
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
        console.log('✅ Audit log created:', auditLog.id, 'for user:', user.id, 'action:', auditLogData.action, 'entity:', auditLogData.entity);
        
        // Verify the log was saved by reading it back
        const verifyLog = await prisma.auditLog.findUnique({ where: { id: auditLog.id } });
        if (verifyLog) {
          console.log('✅ Verified audit log exists in database:', verifyLog.id);
        } else {
          console.error('❌ CRITICAL: Audit log was created but cannot be found in database!');
        }
        
        return created(res, { auditLog });
      } catch (dbError) {
        console.error('❌ Database error creating audit log:', dbError);
        console.error('❌ Error code:', dbError.code);
        console.error('❌ Error message:', dbError.message);
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
      const email = queryParams.get('email');
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
      } else {
        if (email) {
          const userByEmail = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true }
          });
          if (userByEmail) {
            where.actorId = userByEmail.id;
          }
        } else if (userId) {
          where.actorId = userId;
        }
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
        console.log('📊 User info:', { id: user.id, role: user.role, isAdmin });
        
        // First, let's just count ALL audit logs to see if any exist
        const totalAllLogs = await prisma.auditLog.count();
        console.log('📊 Total audit logs in database (no filter):', totalAllLogs);
        
        // Debug: Get the 3 most recent logs directly
        const recentLogs = await prisma.auditLog.findMany({
          take: 3,
          orderBy: { createdAt: 'desc' }
        });
        console.log('📊 Most recent 3 logs (raw):', recentLogs.map(l => ({ id: l.id, action: l.action, actorId: l.actorId, createdAt: l.createdAt })));
        
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
        console.log('📊 First 3 logs:', auditLogs.slice(0, 3).map(l => ({ id: l.id, action: l.action, entity: l.entity, actorId: l.actorId })));

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
            userEmail: log.actor?.email || null,
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
          totalAllLogs, // Debug: total logs in database without any filter
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

