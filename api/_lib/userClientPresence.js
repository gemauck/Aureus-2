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
    latestUpdateId: entry.client === 'mobile' ? latestUpdateId : null
  }
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

  return users.map((user) => {
    const rows = byUser.get(user.id) || []
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
