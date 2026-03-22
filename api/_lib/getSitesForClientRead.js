import { prisma } from './prisma.js'

/**
 * Sites for a client: normalized ClientSite rows, else legacy JSON / sitesJsonb on Client.
 * Matches GET /api/sites/client/:clientId data (read-only).
 */
export async function getSitesForClientRead(clientId) {
  if (typeof clientId !== 'string' || !clientId.trim()) {
    return []
  }
  const tid = clientId.trim()

  let sites = []
  try {
    sites = await prisma.clientSite.findMany({
      where: { clientId: tid },
      orderBy: { createdAt: 'asc' }
    })
  } catch (findErr) {
    console.warn('⚠️ ClientSite.findMany failed for', tid, findErr.message)
    sites = []
  }

  if (sites.length > 0) return sites

  let result = null
  try {
    result = await prisma.$queryRawUnsafe(
      'SELECT "sites", "sitesJsonb" FROM "Client" WHERE id = $1 LIMIT 1',
      tid
    )
  } catch (jsonbErr) {
    const msg = String(jsonbErr?.message || '')
    if (/column.*sitesjsonb|sitesJsonb.*does not exist/i.test(msg)) {
      try {
        result = await prisma.$queryRawUnsafe('SELECT "sites" FROM "Client" WHERE id = $1 LIMIT 1', tid)
      } catch (sitesOnlyErr) {
        console.warn('⚠️ Fallback query for sites failed:', sitesOnlyErr.message)
      }
    } else {
      console.warn('⚠️ Fallback query for sites failed:', msg)
    }
  }

  if (result && result[0]) {
    const row = result[0]
    if (row.sitesJsonb && Array.isArray(row.sitesJsonb) && row.sitesJsonb.length > 0) {
      return row.sitesJsonb
    }
    if (row.sites != null && typeof row.sites === 'string') {
      try {
        return JSON.parse(row.sites)
      } catch {
        return []
      }
    }
  }

  return []
}
