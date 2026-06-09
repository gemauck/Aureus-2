import { resolveClientSiteName } from './jobCardSiteResolve.js'

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string|null|undefined} jobCardId
 * @param {string|null|undefined} clientId
 */
export async function validateIncidentJobCardLink(prisma, jobCardId, clientId) {
  const jcId = String(jobCardId || '').trim()
  if (!jcId) return { ok: true, jobCardNumber: '' }
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jcId },
    select: { id: true, jobCardNumber: true, clientId: true }
  })
  if (!jobCard) return { ok: false, error: 'Linked job card not found' }
  const cid = String(clientId || '').trim()
  if (cid && jobCard.clientId && jobCard.clientId !== cid) {
    return { ok: false, error: 'Job card belongs to a different client' }
  }
  return { ok: true, jobCardNumber: String(jobCard.jobCardNumber || '').trim() }
}

/**
 * @template {{ siteId?: string, siteName?: string }} T
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {T[]} rows
 */
export async function enrichIncidentRowsSiteNames(prisma, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  const needIds = [
    ...new Set(
      rows
        .filter((r) => !String(r?.siteName || '').trim() && String(r?.siteId || '').trim())
        .map((r) => String(r.siteId).trim())
    )
  ]
  if (needIds.length === 0) return rows
  const sites = await prisma.clientSite.findMany({
    where: { id: { in: needIds } },
    select: { id: true, name: true }
  })
  const nameById = new Map(sites.map((s) => [s.id, String(s.name || '').trim()]))
  return rows.map((row) => {
    if (String(row?.siteName || '').trim()) return row
    const sid = String(row?.siteId || '').trim()
    const name = sid ? nameById.get(sid) : ''
    return name ? { ...row, siteName: name } : row
  })
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} siteId
 * @param {string} siteName
 */
export async function resolveIncidentSiteFields(prisma, siteId, siteName) {
  const sid = String(siteId || '').trim()
  let sname = String(siteName || '').trim()
  if (sid && !sname) {
    sname = await resolveClientSiteName(prisma, sid)
  }
  return { siteId: sid, siteName: sname }
}

export function parseIncidentPeopleInvolved(raw) {
  try {
    if (!raw) return []
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function serializeIncidentPeopleInvolved(value) {
  if (!Array.isArray(value)) return '[]'
  const rows = value
    .map((row) => ({
      name: String(row?.name || '').trim(),
      role: String(row?.role || '').trim(),
      injured: Boolean(row?.injured)
    }))
    .filter((row) => row.name || row.role)
  return JSON.stringify(rows)
}
