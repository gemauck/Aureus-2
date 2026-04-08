/**
 * Resolve Safety Culture API key: non-empty env wins; otherwise single system row in DB.
 * Short TTL cache avoids repeated reads on multi-call feed handlers.
 */
import { prisma } from './prisma.js'

const TTL_MS = 60_000
let cacheAt = 0
let cached = ''

export function invalidateSafetyCultureApiKeyCache() {
  cacheAt = 0
  cached = ''
}

export async function resolveSafetyCultureApiKey() {
  const env = (process.env.SAFETY_CULTURE_API_KEY || '').trim()
  if (env.length > 0) {
    return env
  }

  const now = Date.now()
  if (cacheAt && now - cacheAt < TTL_MS) {
    return cached
  }

  const row = await prisma.systemSettings.findUnique({
    where: { id: 'system' },
    select: { safetyCultureApiKey: true }
  })
  const db = (row?.safetyCultureApiKey || '').trim()
  cached = db
  cacheAt = now
  return db
}
