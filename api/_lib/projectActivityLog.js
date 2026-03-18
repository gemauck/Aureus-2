/**
 * Central helper for writing project-scoped audit entries to ProjectActivityLog.
 * Used by tasks, task-comments, document sections, reviews, and project PATCH.
 * Logging failures are non-fatal: we log to console and do not throw.
 *
 * @param {object} prisma - Prisma client instance
 * @param {object} options
 * @param {string} options.projectId - Required project ID
 * @param {string} [options.userId] - User ID (from req.user?.sub or req.user?.id)
 * @param {string} [options.userName] - User display name
 * @param {string} options.type - Activity type (e.g. task_created, task_status_change, document_section_status_change)
 * @param {string} options.description - Human-readable one-liner
 * @param {object} [options.metadata] - Optional object (stored as JSON); entityType, entityId, field, oldValue, newValue, etc.
 * @param {string} [options.action] - Optional short action tag
 * @param {string} [options.details] - Optional extra details
 * @returns {Promise<object|null>} Created log entry or null on failure
 */
export async function logProjectActivity(prisma, options) {
  const {
    projectId,
    userId = null,
    userName = null,
    type,
    description,
    metadata = {},
    action = '',
    details = ''
  } = options;

  if (!projectId || !type || description == null) {
    console.warn('⚠️ logProjectActivity: missing required projectId, type, or description');
    return null;
  }

  try {
    const metadataStr = typeof metadata === 'object' && metadata !== null
      ? JSON.stringify(metadata)
      : (typeof metadata === 'string' ? metadata : '{}');

    const log = await prisma.projectActivityLog.create({
      data: {
        projectId: String(projectId),
        userId: userId ? String(userId) : null,
        userName: userName != null ? String(userName) : '',
        type: String(type),
        description: String(description),
        metadata: metadataStr,
        action: action != null ? String(action) : '',
        details: details != null ? String(details) : ''
      }
    });
    return log;
  } catch (err) {
    console.error('❌ logProjectActivity failed (non-fatal):', err?.message || err);
    return null;
  }
}

/**
 * Resolve userId and userName from request user (auth). Use when calling from API handlers.
 * @param {object} req - Express request (with req.user from auth)
 * @returns {{ userId: string|null, userName: string }}
 */
export function getActivityUserFromRequest(req) {
  const u = req?.user;
  const userId = u?.sub || u?.id || null;
  const userName = u?.name || u?.email || (userId ? 'User' : 'System');
  return { userId, userName };
}
