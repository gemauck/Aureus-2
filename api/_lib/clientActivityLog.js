/**
 * Helper for writing client-scoped audit entries to ClientActivityLog.
 * Used by client notes create/update/delete. Logging failures are non-fatal.
 *
 * @param {object} prisma - Prisma client instance
 * @param {object} options
 * @param {string} options.clientId - Required client ID
 * @param {string} [options.userId] - User ID
 * @param {string} [options.userName] - User display name
 * @param {string} options.type - Activity type (e.g. note_created, note_updated, note_deleted)
 * @param {string} options.description - Human-readable one-liner
 * @param {object} [options.metadata] - Optional object (stored as JSON); noteId, noteTitle, changes, etc.
 * @returns {Promise<object|null>} Created log entry or null on failure
 */
export async function logClientActivity(prisma, options) {
  const {
    clientId,
    userId = null,
    userName = null,
    type,
    description,
    metadata = {}
  } = options;

  if (!clientId || !type || description == null) {
    console.warn('⚠️ logClientActivity: missing required clientId, type, or description');
    return null;
  }

  try {
    const metadataStr = typeof metadata === 'object' && metadata !== null
      ? JSON.stringify(metadata)
      : (typeof metadata === 'string' ? metadata : '{}');

    const log = await prisma.clientActivityLog.create({
      data: {
        clientId: String(clientId),
        userId: userId ? String(userId) : null,
        userName: userName != null ? String(userName) : '',
        type: String(type),
        description: String(description),
        metadata: metadataStr,
        action: '',
        details: ''
      }
    });
    return log;
  } catch (err) {
    console.error('❌ logClientActivity failed (non-fatal):', err?.message || err);
    return null;
  }
}

/**
 * Resolve userId and userName from request (auth). Use when calling from API handlers.
 */
export function getActivityUserFromRequest(req) {
  const u = req?.user;
  const userId = u?.sub || u?.id || null;
  const userName = u?.name || u?.email || (userId ? 'User' : 'System');
  return { userId, userName };
}
