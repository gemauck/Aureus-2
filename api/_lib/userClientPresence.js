import {
  convertSHA256HashToUUID,
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  getMetadataAsync
} from './mobileOta/helpers.js'

let tableReady = false

export async function ensureUserClientPresenceTable(prisma) {
  if (tableReady) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserClientPresence" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "client" TEXT NOT NULL,
      "platform" TEXT,
      "runtimeVersion" TEXT,
      "updateId" TEXT,
      "nativeVersion" TEXT,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserClientPresence_pkey" PRIMARY KEY ("id")
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserClientPresence_userId_client_key" ON "UserClientPresence"("userId", "client")`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "UserClientPresence_userId_idx" ON "UserClientPresence"("userId")`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "UserClientPresence_lastSeenAt_idx" ON "UserClientPresence"("lastSeenAt")`
  )
  tableReady = true
}

function normalizeClient(raw) {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'browser' || v === 'web') return 'browser'
  if (v === 'mobile' || v === 'app') return 'mobile'
  return null
}

function normalizePlatform(raw, client) {
  const v = String(raw || '').trim().toLowerCase()
  if (client === 'browser') return 'web'
  if (v === 'android' || v === 'ios') return v
  return null
}

/** @param {Record<string, unknown>} body */
export function parseClientPresencePayload(body = {}) {
  const nested = body.clientInfo && typeof body.clientInfo === 'object' ? body.clientInfo : {}
  const client = normalizeClient(body.client ?? nested.client)
  if (!client) return null

  return {
    client,
    platform: normalizePlatform(body.platform ?? nested.platform, client),
    runtimeVersion: String(body.runtimeVersion ?? nested.runtimeVersion ?? '').trim().slice(0, 64) || null,
    updateId: String(body.updateId ?? nested.updateId ?? '').trim().slice(0, 64) || null,
    nativeVersion: String(body.nativeVersion ?? nested.nativeVersion ?? '').trim().slice(0, 32) || null
  }
}

export async function upsertUserClientPresence(prisma, userId, payload) {
  if (!userId || !payload?.client) return
  await ensureUserClientPresenceTable(prisma)
  const now = new Date()
  const data = {
    platform: payload.platform,
    runtimeVersion: payload.runtimeVersion,
    updateId: payload.updateId,
    nativeVersion: payload.nativeVersion,
    lastSeenAt: now,
    updatedAt: now
  }

  await prisma.userClientPresence.upsert({
    where: { userId_client: { userId, client: payload.client } },
    create: { userId, client: payload.client, ...data },
    update: data
  })
}

export async function getLatestPublishedOtaUpdate(runtimeVersion) {
  if (!runtimeVersion) return null
  try {
    const updateBundlePath = await getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion)
    const { id } = await getMetadataAsync({ updateBundlePath, runtimeVersion })
    return {
      runtimeVersion,
      updateId: convertSHA256HashToUUID(id)
    }
  } catch {
    return null
  }
}

function resolveOtaStatus(userUpdateId, latestUpdateId) {
  if (!userUpdateId || !latestUpdateId) return 'unknown'
  if (String(userUpdateId).toLowerCase() === String(latestUpdateId).toLowerCase()) return 'current'
  return 'update_available'
}

function serializePresenceEntry(entry, latestUpdateId) {
  const otaStatus =
    entry.client === 'mobile' ? resolveOtaStatus(entry.updateId, latestUpdateId) : null
  return {
    client: entry.client,
    platform: entry.platform,
    runtimeVersion: entry.runtimeVersion,
    updateId: entry.updateId,
    nativeVersion: entry.nativeVersion,
    lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt).toISOString() : null,
    otaStatus,
    latestUpdateId: entry.client === 'mobile' ? latestUpdateId : null,
    inferred: !!entry.inferred
  }
}

function parseMobileEventDetails(detailsRaw) {
  if (!detailsRaw) return { platform: null }
  try {
    const parsed = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw
    const platform = String(parsed?.platform || '').trim().toLowerCase()
    return { platform: platform === 'android' || platform === 'ios' ? platform : null }
  } catch {
    return { platform: null }
  }
}

/** Latest mobile login per user from SecurityEvent (before app reports version on heartbeat). */
async function loadMobileLoginFallbacks(prisma, userIds) {
  if (!userIds.length) return new Map()

  const events = await prisma.securityEvent.findMany({
    where: { userId: { in: userIds }, eventType: 'mobile_login_success' },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, details: true, createdAt: true }
  })

  const byUser = new Map()
  for (const event of events) {
    if (byUser.has(event.userId)) continue
    const { platform } = parseMobileEventDetails(event.details)
    byUser.set(event.userId, {
      client: 'mobile',
      platform,
      runtimeVersion: null,
      updateId: null,
      nativeVersion: null,
      lastSeenAt: event.createdAt,
      inferred: true
    })
  }
  return byUser
}

function buildBrowserFallback(user, mobileFallback) {
  if (!user?.lastSeenAt) return null
  const seenAt = new Date(user.lastSeenAt).getTime()
  if (Number.isNaN(seenAt)) return null

  if (mobileFallback?.lastSeenAt) {
    const mobileAt = new Date(mobileFallback.lastSeenAt).getTime()
    // Skip browser guess for mobile-only users (last activity matches last mobile login).
    if (!Number.isNaN(mobileAt) && seenAt <= mobileAt + 5 * 60 * 1000) return null
  }

  return {
    client: 'browser',
    platform: 'web',
    runtimeVersion: null,
    updateId: null,
    nativeVersion: null,
    lastSeenAt: user.lastSeenAt,
    inferred: true
  }
}

function mergePresenceRows(dbRows, user, mobileFallback) {
  const merged = [...dbRows]
  const hasClient = (client) => merged.some((row) => row.client === client)

  if (!hasClient('mobile') && mobileFallback) {
    merged.push(mobileFallback)
  }

  const browserFallback = buildBrowserFallback(user, mobileFallback)
  if (!hasClient('browser') && browserFallback) {
    merged.push(browserFallback)
  }

  return merged
}

/** Attach clientActivity for admin Users list (browser/app + OTA status). */
export async function enrichUsersWithClientActivity(prisma, users) {
  if (!users?.length) return users

  await ensureUserClientPresenceTable(prisma)
  const userIds = users.map((u) => u.id)

  let presences = []
  try {
    presences = await prisma.userClientPresence.findMany({
      where: { userId: { in: userIds } }
    })
  } catch {
    return users.map((u) => ({ ...u, clientActivity: null }))
  }

  const pushRows = await prisma.pushDeviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true }
  })
  const usersWithPush = new Set(pushRows.map((r) => r.userId))

  const byUser = new Map()
  for (const row of presences) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, [])
    byUser.get(row.userId).push(row)
  }

  const latestOtaCache = new Map()
  const runtimeVersions = [
    ...new Set(presences.filter((p) => p.client === 'mobile' && p.runtimeVersion).map((p) => p.runtimeVersion))
  ]
  await Promise.all(
    runtimeVersions.map(async (rv) => {
      latestOtaCache.set(rv, await getLatestPublishedOtaUpdate(rv))
    })
  )

  const mobileFallbacks = await loadMobileLoginFallbacks(prisma, userIds)

  return users.map((user) => {
    const dbRows = byUser.get(user.id) || []
    const rows = mergePresenceRows(dbRows, user, mobileFallbacks.get(user.id) || null)
    const entries = rows.map((row) => {
      const latest =
        row.client === 'mobile' && row.runtimeVersion
          ? latestOtaCache.get(row.runtimeVersion)?.updateId || null
          : null
      return serializePresenceEntry(row, latest)
    })

    let primaryClient = null
    let latestTs = 0
    for (const entry of entries) {
      const ts = entry.lastSeenAt ? new Date(entry.lastSeenAt).getTime() : 0
      if (ts >= latestTs) {
        latestTs = ts
        primaryClient = entry.client
      }
    }

    return {
      ...user,
      clientActivity: {
        primaryClient,
        hasPushToken: usersWithPush.has(user.id),
        entries
      }
    }
  })
}
