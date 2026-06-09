import { validateIncidentJobCardLink } from './incidentReportResolve.js'

/**
 * @param {unknown} body
 * @returns {string[]|null} null = field not provided; [] = explicitly clear links
 */
export function parseJobCardIdsFromBody(body) {
  if (!body || typeof body !== 'object') return null

  if (Array.isArray(body.jobCardIds)) {
    return [...new Set(body.jobCardIds.map((id) => String(id || '').trim()).filter(Boolean))]
  }

  if (Array.isArray(body.linkedJobCards)) {
    return [
      ...new Set(
        body.linkedJobCards
          .map((row) => String(row?.jobCardId || row?.id || '').trim())
          .filter(Boolean)
      )
    ]
  }

  if (body.jobCardId !== undefined) {
    const id = body.jobCardId != null && String(body.jobCardId).trim() !== '' ? String(body.jobCardId).trim() : null
    return id ? [id] : []
  }

  return null
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} jobCardIds
 * @param {string|null|undefined} clientId
 */
export async function validateIncidentJobCardLinks(prisma, jobCardIds, clientId) {
  const ids = Array.isArray(jobCardIds) ? jobCardIds : []
  const links = []
  for (const jobCardId of ids) {
    const linkCheck = await validateIncidentJobCardLink(prisma, jobCardId, clientId)
    if (!linkCheck.ok) return linkCheck
    links.push({
      jobCardId,
      jobCardNumber: linkCheck.jobCardNumber || ''
    })
  }
  return { ok: true, links }
}

/**
 * @param {{ jobCardId: string, jobCardNumber?: string }[]} links
 */
export function legacyJobCardFieldsFromLinks(links) {
  const first = Array.isArray(links) && links.length ? links[0] : null
  return {
    jobCardId: first?.jobCardId || null,
    jobCardNumber: first?.jobCardNumber || ''
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} incidentReportId
 * @param {{ jobCardId: string, jobCardNumber?: string }[]} links
 */
export async function syncIncidentJobCardLinks(prisma, incidentReportId, links) {
  const rows = Array.isArray(links) ? links : []
  const nextIds = new Set(rows.map((row) => String(row.jobCardId)))

  const existing = await prisma.incidentReportJobCard.findMany({
    where: { incidentReportId },
    select: { id: true, jobCardId: true }
  })

  const toDelete = existing.filter((row) => !nextIds.has(row.jobCardId)).map((row) => row.id)
  if (toDelete.length) {
    await prisma.incidentReportJobCard.deleteMany({ where: { id: { in: toDelete } } })
  }

  for (const row of rows) {
    await prisma.incidentReportJobCard.upsert({
      where: {
        incidentReportId_jobCardId: {
          incidentReportId,
          jobCardId: row.jobCardId
        }
      },
      create: {
        incidentReportId,
        jobCardId: row.jobCardId,
        jobCardNumber: String(row.jobCardNumber || '').trim()
      },
      update: {
        jobCardNumber: String(row.jobCardNumber || '').trim()
      }
    })
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} incidentReportIds
 */
export async function loadLinkedJobCardsByIncidentIds(prisma, incidentReportIds) {
  const ids = [...new Set((incidentReportIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
  const map = new Map()
  if (!ids.length) return map

  const rows = await prisma.incidentReportJobCard.findMany({
    where: { incidentReportId: { in: ids } },
    orderBy: { createdAt: 'asc' },
    select: {
      incidentReportId: true,
      jobCardId: true,
      jobCardNumber: true
    }
  })

  for (const row of rows) {
    const list = map.get(row.incidentReportId) || []
    list.push({
      id: row.jobCardId,
      jobCardId: row.jobCardId,
      jobCardNumber: String(row.jobCardNumber || '').trim()
    })
    map.set(row.incidentReportId, list)
  }
  return map
}

/**
 * @param {object} row
 * @param {{ id: string, jobCardId?: string, jobCardNumber?: string }[]} [linkedJobCards]
 */
export function formatLinkedJobCardLabels(incident) {
  const links =
    Array.isArray(incident?.linkedJobCards) && incident.linkedJobCards.length
      ? incident.linkedJobCards
      : incident?.jobCardId
        ? [{ jobCardNumber: incident.jobCardNumber, id: incident.jobCardId }]
        : []
  return links
    .map((row) => String(row?.jobCardNumber || row?.id || '').trim())
    .filter(Boolean)
    .join(', ')
}

export function attachLinkedJobCardsToIncidentRow(row, linkedJobCards) {
  if (!row) return row
  const links =
    Array.isArray(linkedJobCards) && linkedJobCards.length
      ? linkedJobCards
      : row.jobCardId
        ? [{ id: row.jobCardId, jobCardId: row.jobCardId, jobCardNumber: String(row.jobCardNumber || '').trim() }]
        : []
  return {
    ...row,
    linkedJobCards: links
  }
}
