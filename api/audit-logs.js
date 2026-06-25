import { prisma } from './_lib/prisma.js';
import { verifyToken } from './_lib/jwt.js';
import { parseJsonBody } from './_lib/body.js';
import { created, ok, badRequest, serverError, unauthorized, forbidden } from './_lib/response.js';
import { isAdminRole, isSuperAdminRole } from './_lib/authRoles.js';

const MAX_AUDIT_LOG_LIMIT = 5000;
const AUDIT_REPORT_TZ = 'Africa/Johannesburg';

function emptyHourBuckets() {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
}

function peakHourFromBuckets(byHour) {
  const peak = byHour.reduce((best, cur) => (cur.count > best.count ? cur : best), byHour[0]);
  return peak.count ? { hour: peak.hour, count: peak.count } : null;
}

function buildActivityTimeFromTimestamps(rows, actorById = {}) {
  const byHour = emptyHourBuckets();
  const dowOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const byDayOfWeek = dowOrder.map((day, dayIndex) => ({ day, dayIndex, count: 0 }));
  const byDateMap = new Map();
  const userBucketMap = new Map();

  const hourFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: AUDIT_REPORT_TZ,
    hour: 'numeric',
    hour12: false
  });
  const weekdayFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: AUDIT_REPORT_TZ,
    weekday: 'short'
  });
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: AUDIT_REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  for (const row of rows) {
    const d = new Date(row.createdAt);
    if (Number.isNaN(d.getTime())) continue;

    const hour = parseInt(hourFmt.format(d), 10);
    if (hour >= 0 && hour < 24) byHour[hour].count += 1;

    const dow = weekdayFmt.format(d);
    const dowIdx = dowOrder.indexOf(dow);
    if (dowIdx >= 0) byDayOfWeek[dowIdx].count += 1;

    const dateKey = dateFmt.format(d);
    byDateMap.set(dateKey, (byDateMap.get(dateKey) || 0) + 1);

    const actorKey = row.actorId || '__unknown__';
    if (!userBucketMap.has(actorKey)) {
      userBucketMap.set(actorKey, { byHour: emptyHourBuckets(), total: 0 });
    }
    const userBucket = userBucketMap.get(actorKey);
    userBucket.total += 1;
    if (hour >= 0 && hour < 24) userBucket.byHour[hour].count += 1;
  }

  const byDate = [...byDateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const byUser = [...userBucketMap.entries()]
    .map(([userId, bucket]) => {
      const actor = actorById[userId];
      const label = actor?.name || actor?.email || (userId === '__unknown__' ? 'Unknown' : userId);
      return {
        userId,
        label,
        email: actor?.email || null,
        total: bucket.total,
        byHour: bucket.byHour,
        peakHour: peakHourFromBuckets(bucket.byHour)
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  return {
    timezone: AUDIT_REPORT_TZ,
    byHour,
    byDayOfWeek,
    byDate,
    peakHour: peakHourFromBuckets(byHour),
    peakDay: (() => {
      const peak = byDayOfWeek.reduce((best, cur) => (cur.count > best.count ? cur : best), byDayOfWeek[0]);
      return peak.count ? { day: peak.day, count: peak.count } : null;
    })(),
    byUser
  };
}

async function buildAuditLogWhere(queryParams, prisma) {
  const userId = queryParams.get('userId');
  const email = queryParams.get('email');
  const module = queryParams.get('module');
  const action = queryParams.get('action');
  const startDate = queryParams.get('startDate');
  const endDate = queryParams.get('endDate');

  const where = {};

  if (email) {
    const userByEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true }
    });
    if (userByEmail) {
      where.actorId = userByEmail.id;
    } else {
      where.actorId = '__no_match__';
    }
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

  return where;
}

function transformAuditLogRow(log) {
  let diff = {};
  try {
    diff = JSON.parse(log.diff || '{}');
  } catch (e) {
    console.warn('⚠️ Failed to parse diff for log:', log.id, e);
  }
  const userName = log.actor?.name || log.actor?.email || diff.user || 'System';
  const userRole = log.actor?.role || diff.userRole || 'System';

  return {
    id: log.id,
    timestamp: log.createdAt.toISOString(),
    user: userName,
    userId: log.actorId,
    userEmail: log.actor?.email || null,
    userRole,
    action: log.action,
    module: log.entity,
    entityId: log.entityId || null,
    details: diff.details || {},
    ipAddress: diff.ipAddress || 'N/A',
    sessionId: diff.sessionId || 'N/A',
    success: diff.success !== undefined ? diff.success : true
  };
}

async function fetchAuditStats(prisma, where) {
  const [total, dateBounds, userGroups, moduleGroups] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.aggregate({
      where,
      _min: { createdAt: true },
      _max: { createdAt: true }
    }),
    prisma.auditLog.groupBy({
      by: ['actorId'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 15
    }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20
    })
  ]);

  const actorIds = userGroups.map((g) => g.actorId).filter(Boolean);
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true }
      })
    : [];
  const actorById = Object.fromEntries(actors.map((a) => [a.id, a]));

  const topUsers = userGroups.map((g) => {
    const actor = actorById[g.actorId];
    const label = actor?.name || actor?.email || g.actorId || 'Unknown';
    return {
      label,
      email: actor?.email || null,
      count: g._count.id
    };
  });

  const topModules = moduleGroups
    .filter((g) => g.entity)
    .map((g) => ({
      module: g.entity,
      count: g._count.id
    }));

  const [distinctActors, distinctEntities, timestampRows] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      distinct: ['actorId'],
      select: { actorId: true }
    }),
    prisma.auditLog.findMany({
      where,
      distinct: ['entity'],
      select: { entity: true }
    }),
    prisma.auditLog.findMany({
      where,
      select: { createdAt: true, actorId: true }
    })
  ]);

  const activityActorIds = [...new Set(timestampRows.map((r) => r.actorId).filter(Boolean))];
  const activityActors = activityActorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: activityActorIds } },
        select: { id: true, name: true, email: true }
      })
    : [];
  const activityActorById = Object.fromEntries([
    ...actors.map((a) => [a.id, a]),
    ...activityActors.map((a) => [a.id, a])
  ]);

  const activityTime = buildActivityTimeFromTimestamps(timestampRows, activityActorById);

  return {
    total,
    uniqueUsers: distinctActors.filter((row) => row.actorId).length,
    uniqueModules: distinctEntities.filter((row) => row.entity).length,
    dateMin: dateBounds._min.createdAt,
    dateMax: dateBounds._max.createdAt,
    topUsers,
    topModules,
    activityTime
  };
}

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
      // Only superadmins may attribute audit entries to another user (migration tooling).
      const isAdmin = isSuperAdminRole(user.role);
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
    // Only Superadmins can view the detailed audit trail (all users' interactions)
    if (req.method === 'GET') {
      if (!isSuperAdminRole(user.role)) {
        return forbidden(res, 'Access to the detailed audit trail is restricted to super-admins only.');
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const queryParams = url.searchParams;
      const includeStats = queryParams.get('stats') === '1';
      const requestedLimit = parseInt(queryParams.get('limit') || '1000', 10);
      const limit = Math.min(
        Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 1000,
        MAX_AUDIT_LOG_LIMIT
      );
      const offset = Math.max(0, parseInt(queryParams.get('offset') || '0', 10) || 0);

      const where = await buildAuditLogWhere(queryParams, prisma);

      try {
        const listPromise = prisma.auditLog.findMany({
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
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset
        });

        const [auditLogs, total] = await Promise.all([
          listPromise,
          prisma.auditLog.count({ where })
        ]);

        let stats = null;
        if (includeStats) {
          try {
            stats = await fetchAuditStats(prisma, where);
          } catch (statsError) {
            console.error('❌ Audit stats aggregation failed (logs still returned):', statsError);
          }
        }

        const transformedLogs = auditLogs.map(transformAuditLogRow);

        return ok(res, {
          logs: transformedLogs,
          total,
          limit,
          offset,
          truncated: total > auditLogs.length,
          ...(stats ? { stats } : {})
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

