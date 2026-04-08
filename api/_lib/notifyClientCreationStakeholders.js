import { prisma } from './prisma.js'

/**
 * Comma-separated user IDs (cuid). When set, only these users receive client-creation alerts
 * (overrides name-based lookup).
 */
function stakeholderIdsFromEnv() {
  const raw = process.env.CLIENT_CREATION_NOTIFY_USER_IDS
  if (!raw || !String(raw).trim()) return []
  return [...new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean))]
}

async function resolveStakeholderUserIds() {
  const fromEnv = stakeholderIdsFromEnv()
  if (fromEnv.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: fromEnv } },
      select: { id: true }
    })
    if (users.length < fromEnv.length) {
      const found = new Set(users.map((u) => u.id))
      const missing = fromEnv.filter((id) => !found.has(id))
      console.warn('📧 CLIENT_CREATION_NOTIFY_USER_IDS: unknown user id(s):', missing.join(', '))
    }
    return users.map((u) => u.id)
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        {
          AND: [
            { name: { contains: 'Lindi', mode: 'insensitive' } },
            { name: { contains: 'Joubert', mode: 'insensitive' } }
          ]
        },
        {
          AND: [
            { name: { contains: 'Michelle', mode: 'insensitive' } },
            { name: { contains: 'Peel', mode: 'insensitive' } }
          ]
        },
        {
          AND: [
            { name: { contains: 'Gareth', mode: 'insensitive' } },
            { name: { contains: 'Mauck', mode: 'insensitive' } }
          ]
        }
      ]
    },
    select: { id: true, name: true, email: true }
  })
  return [...new Set(users.map((u) => u.id))]
}

/**
 * After a new client is created or a lead is converted to a client, notify fixed stakeholders
 * (in-app + email via createNotificationForUser, type system).
 *
 * @param {object} opts
 * @param {string} opts.clientId
 * @param {string} opts.clientName
 * @param {'created'|'converted'} opts.source
 * @param {string|null} [opts.actorId]
 * @param {string|null} [opts.actorName]
 * @param {string|null} [opts.actorEmail]
 */
export async function notifyClientCreationStakeholders(opts) {
  const { clientId, clientName, source, actorId, actorName, actorEmail } = opts
  if (!clientId) return

  let name = actorName || null
  let email = actorEmail || null
  if (actorId && (!name || !email)) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: String(actorId) },
        select: { name: true, email: true }
      })
      if (u) {
        name = name || u.name || null
        email = email || u.email || null
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  const safeClient = String(clientName || 'Client').trim() || 'Client'
  const isConverted = source === 'converted'
  const title = isConverted
    ? `Lead converted to client: ${safeClient.length > 80 ? `${safeClient.slice(0, 80)}…` : safeClient}`
    : `New client: ${safeClient.length > 80 ? `${safeClient.slice(0, 80)}…` : safeClient}`

  const who = name || 'Unknown user'
  const contact = email ? ` (${email})` : ''
  const idPart = actorId ? ` User ID: ${actorId}.` : ''
  const plainMessage = isConverted
    ? `Lead converted to client "${safeClient}" by ${who}${contact}.${idPart}`
    : `New client "${safeClient}" was added by ${who}${contact}.${idPart}`

  const link = `#/clients/${clientId}`
  const metadata = {
    clientId,
    source: isConverted ? 'lead_converted_to_client' : 'client_created',
    actorId: actorId || null,
    actorName: name || null,
    actorEmail: email || null
  }

  let recipientIds
  try {
    recipientIds = await resolveStakeholderUserIds()
  } catch (e) {
    console.error('📧 Client creation notify: failed to resolve stakeholders:', e?.message || e)
    return
  }

  if (recipientIds.length === 0) {
    console.warn(
      '📧 Client creation notify: no recipients. Set CLIENT_CREATION_NOTIFY_USER_IDS or ensure User.name matches Lindi Joubert, Michelle Peel, Gareth Mauck.'
    )
    return
  }

  let createNotificationForUser
  try {
    ;({ createNotificationForUser } = await import('../notifications.js'))
  } catch (e) {
    console.error('📧 Client creation notify: could not load notifications module:', e?.message || e)
    return
  }
  if (typeof createNotificationForUser !== 'function') {
    console.error('📧 Client creation notify: createNotificationForUser missing')
    return
  }

  const delayMs = 500
  for (let i = 0; i < recipientIds.length; i++) {
    const uid = recipientIds[i]
    try {
      await createNotificationForUser(uid, 'system', title, plainMessage, link, metadata)
      if (i < recipientIds.length - 1) await new Promise((r) => setTimeout(r, delayMs))
    } catch (e) {
      console.error('📧 Client creation notify failed for user', uid, e?.message || e)
    }
  }
}
