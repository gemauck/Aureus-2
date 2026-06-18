import { prisma } from './prisma.js'

/**
 * Resolve the ERP user responsible for a, a stock location.
 * Order: env JSON map → StockLocation.responsibleUserId → name keyword lookup.
 */

function envMapFromConfig() {
  const raw = process.env.STOCK_LOCATION_RESPONSIBLE_USER_IDS
  if (!raw || !String(raw).trim()) return null
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    console.warn('STOCK_LOCATION_RESPONSIBLE_USER_IDS is not valid JSON')
    return null
  }
}

async function resolveUserIdByNameKeywords(keywords) {
  const parts = keywords.filter(Boolean)
  if (!parts.length) return null
  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      AND: parts.map((part) => ({
        OR: [
          { name: { contains: part, mode: 'insensitive' } },
          { email: { contains: part, mode: 'insensitive' } }
        ]
      }))
    },
    select: { id: true, name: true, email: true },
    take: 5
  })
  if (users.length === 1) return users[0].id
  if (users.length > 1) {
    console.warn('resolveLocationResponsibleUser: ambiguous name match', keywords, users.map((u) => u.email))
  }
  return users[0]?.id || null
}

const DEFAULT_NAME_HINTS = [
  { match: (loc) => /pmb|pieter/i.test(loc.code) || /pmb|pieter/i.test(loc.name), keywords: ['Alana'] },
  { match: (loc) => /ethan/i.test(loc.code) || /ethan/i.test(loc.name), keywords: ['Ethan'] },
  { match: (loc) => /nathan/i.test(loc.code) || /nathan/i.test(loc.name), keywords: ['Nathan'] }
]

/**
 * @param {{ id: string, code?: string, name?: string, responsibleUserId?: string|null }} location
 * @returns {Promise<string|null>}
 */
export async function resolveLocationResponsibleUserId(location) {
  if (!location?.id) return null

  const envMap = envMapFromConfig()
  if (envMap) {
    const fromEnv = envMap[location.id] || envMap[location.code] || envMap[location.name]
    if (fromEnv) {
      const uid = String(fromEnv).trim()
      const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true } })
      if (user) return user.id
      console.warn('STOCK_LOCATION_RESPONSIBLE_USER_IDS: unknown user id', uid)
    }
  }

  if (location.responsibleUserId) {
    const user = await prisma.user.findUnique({
      where: { id: location.responsibleUserId },
      select: { id: true }
    })
    if (user) return user.id
  }

  const loc = {
    id: location.id,
    code: String(location.code || ''),
    name: String(location.name || '')
  }
  for (const hint of DEFAULT_NAME_HINTS) {
    if (hint.match(loc)) {
      const userId = await resolveUserIdByNameKeywords(hint.keywords)
      if (userId) return userId
    }
  }

  return null
}

/**
 * @param {string} locationId
 * @returns {Promise<string|null>}
 */
export async function resolveLocationResponsibleUserIdByLocationId(locationId) {
  const id = String(locationId || '').trim()
  if (!id) return null
  const location = await prisma.stockLocation.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, responsibleUserId: true }
  })
  if (!location) return null
  return resolveLocationResponsibleUserId(location)
}
