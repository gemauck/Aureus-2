/**
 * Shared JobCardActivity writes for api/jobcards.js, SafetyCulture imports, and public endpoints.
 */

async function resolveActorDisplayName(prismaClient, userId) {
  if (!userId) return ''
  try {
    const u = await prismaClient.user.findUnique({
      where: { id: String(userId) },
      select: { name: true, email: true }
    })
    if (u) {
      return u.name && String(u.name).trim() ? u.name.trim() : u.email || ''
    }
  } catch {
    /* non-fatal */
  }
  return ''
}

export async function insertJobCardActivityRecord(prismaClient, {
  jobCardId,
  actorUserId = null,
  actorName = '',
  action,
  metadata,
  source = 'web',
  createdAt
}) {
  try {
    await prismaClient.jobCardActivity.create({
      data: {
        jobCardId,
        actorUserId: actorUserId ? String(actorUserId) : null,
        actorName: actorName || '',
        action,
        source,
        metadata: metadata !== undefined && metadata !== null ? metadata : undefined,
        ...(createdAt ? { createdAt } : {})
      }
    })
  } catch (e) {
    console.error('JobCardActivity insert failed (non-fatal):', e?.message || e)
  }
}

export async function insertJobCardActivityFromRequest(prismaClient, req, { jobCardId, action, metadata, source = 'web' }) {
  const uid = req?.user?.sub || req?.user?.id || null
  let actorName = ''
  if (uid) {
    actorName = await resolveActorDisplayName(prismaClient, uid)
  }
  return insertJobCardActivityRecord(prismaClient, {
    jobCardId,
    actorUserId: uid,
    actorName,
    action,
    metadata,
    source
  })
}

export async function insertJobCardActivityForUser(prismaClient, { jobCardId, userId, action, metadata, source = 'web' }) {
  let actorName = ''
  if (userId) {
    actorName = await resolveActorDisplayName(prismaClient, userId)
  }
  return insertJobCardActivityRecord(prismaClient, {
    jobCardId,
    actorUserId: userId ? String(userId) : null,
    actorName,
    action,
    metadata,
    source
  })
}
