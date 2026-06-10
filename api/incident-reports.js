import { authRequired } from './_lib/authRequired.js'
import { parseJsonBody } from './_lib/body.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError, forbidden } from './_lib/response.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'
import { isAdminRole } from './_lib/authRoles.js'
import { computeNextIncidentNumber } from './_lib/incidentReportNumber.js'
import {
  enrichIncidentRowsSiteNames,
  resolveIncidentSiteFields,
  serializeIncidentPeopleInvolved
} from './_lib/incidentReportResolve.js'
import { insertIncidentReportActivityFromRequest } from './_lib/incidentReportActivity.js'
import { buildIncidentReportPdfBuffer } from './_lib/incidentReportPdf.js'
import { normalizeIncidentStatus } from './_lib/incidentReportConstants.js'
import {
  attachLinkedJobCardsToIncidentRow,
  legacyJobCardFieldsFromLinks,
  loadLinkedJobCardsByIncidentIds,
  parseJobCardIdsFromBody,
  syncIncidentJobCardLinks,
  validateIncidentJobCardLinks
} from './_lib/incidentReportJobCards.js'
import {
  loadJobCardPhotosForIncident,
  parseIncidentPhotosArray
} from './_lib/incidentReportPhotos.js'

function incidentMutateRole(user) {
  if (isAdminRole(user?.role)) return true
  const role = String(user?.role || 'user').toLowerCase()
  return role === 'service' || role === 'manager'
}

function canMutateIncident(incident, user) {
  if (incidentMutateRole(user)) return true
  const userId = user?.sub || user?.id || null
  if (!userId) return false
  if (incident.ownerId && incident.ownerId === userId) return true
  if (incident.reportedById && incident.reportedById === userId) return true
  return false
}

function canDeleteIncident(user) {
  return isAdminRole(user?.role)
}

function parseJson(str, defaultValue = []) {
  try {
    if (!str) return defaultValue
    return typeof str === 'string' ? JSON.parse(str) : str
  } catch {
    return defaultValue
  }
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const LIST_SELECT = {
  id: true,
  incidentNumber: true,
  status: true,
  clientId: true,
  clientName: true,
  siteId: true,
  siteName: true,
  jobCardId: true,
  jobCardNumber: true,
  incidentAt: true,
  incidentType: true,
  severity: true,
  description: true,
  relevantAssets: true,
  relevantTanksMobileBowsers: true,
  technicianName: true,
  authorName: true,
  reportedById: true,
  reportedByName: true,
  ownerId: true,
  submittedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true
}

function formatIncidentRow(row, linkedJobCards) {
  if (!row) return row
  const formatted = {
    ...row,
    peopleInvolved: row.peopleInvolved !== undefined ? parseJson(row.peopleInvolved, []) : undefined,
    photos: row.photos !== undefined ? parseJson(row.photos, []) : undefined
  }
  return attachLinkedJobCardsToIncidentRow(formatted, linkedJobCards)
}

async function enrichIncidentRowsWithJobCardLinks(prisma, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  const linkMap = await loadLinkedJobCardsByIncidentIds(
    prisma,
    rows.map((row) => row.id)
  )
  return rows.map((row) => formatIncidentRow(row, linkMap.get(row.id)))
}

function getPagination(allowLargePageSize = false) {
  return (req) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const rawPage = parseInt(url.searchParams.get('page') || '1', 10)
      const rawPageSize = parseInt(url.searchParams.get('pageSize') || '50', 10)
      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
      let pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 50
      const maxPageSize = allowLargePageSize ? 1000 : 100
      pageSize = Math.max(10, Math.min(pageSize, maxPageSize))
      return { page, pageSize }
    } catch {
      return { page: 1, pageSize: 50 }
    }
  }
}

function normalizeSignature(value) {
  const sig = String(value ?? '').trim()
  if (!sig) return ''
  if (!sig.startsWith('data:image/')) return ''
  return sig.length > 600_000 ? '' : sig
}

async function resolveIncidentJobCardLinksForBody(body, clientId) {
  const jobCardIds = parseJobCardIdsFromBody(body)
  if (jobCardIds === null) return { links: [], legacy: legacyJobCardFieldsFromLinks([]) }
  const linkCheck = await validateIncidentJobCardLinks(prisma, jobCardIds, clientId)
  if (!linkCheck.ok) throw new Error(linkCheck.error)
  const links = linkCheck.links || []
  return { links, legacy: legacyJobCardFieldsFromLinks(links) }
}

async function buildIncidentCreateData(body, req) {
  const userId = req.user?.sub || req.user?.id || null
  const clientId = body.clientId != null && String(body.clientId).trim() !== '' ? String(body.clientId).trim() : null
  const { links, legacy } = await resolveIncidentJobCardLinksForBody(body, clientId)

  const siteFields = await resolveIncidentSiteFields(prisma, body.siteId, body.siteName)
  const status = normalizeIncidentStatus(body.status, 'draft')
  const incidentAt = parseOptionalDate(body.incidentAt) || new Date()
  let photos = parseIncidentPhotosArray(
    Array.isArray(body.photos) ? body.photos : body.photos
  )
  if (!photos.length && links.length) {
    photos = await loadJobCardPhotosForIncident(
      prisma,
      links.map((link) => link.id)
    )
  }

  return {
    clientId,
    clientName: String(body.clientName || '').trim(),
    siteId: siteFields.siteId,
    siteName: siteFields.siteName,
    jobCardId: legacy.jobCardId,
    jobCardNumber: legacy.jobCardNumber || String(body.jobCardNumber || '').trim(),
    _jobCardLinks: links,
    incidentAt,
    locationDescription: String(body.locationDescription || '').trim(),
    locationLatitude: String(body.locationLatitude || '').trim(),
    locationLongitude: String(body.locationLongitude || '').trim(),
    incidentType: String(body.incidentType || '').trim(),
    severity: String(body.severity || '').trim(),
    description: String(body.description || '').trim(),
    immediateActions: String(body.immediateActions || '').trim(),
    investigationNotes: String(body.investigationNotes || '').trim(),
    correctiveActions: String(body.correctiveActions || '').trim(),
    peopleInvolved: serializeIncidentPeopleInvolved(body.peopleInvolved),
    witnesses: String(body.witnesses || '').trim(),
    equipmentInvolved: String(body.equipmentInvolved || '').trim(),
    relevantAssets: String(body.relevantAssets || '').trim(),
    relevantTanksMobileBowsers: String(body.relevantTanksMobileBowsers || '').trim(),
    technicianName: String(body.technicianName || '').trim(),
    authorName: String(body.authorName || req.user?.name || '').trim(),
    authorSignature: normalizeSignature(body.authorSignature),
    photos: JSON.stringify(photos),
    reportedById: body.reportedById ? String(body.reportedById) : userId,
    reportedByName: String(body.reportedByName || req.user?.name || '').trim(),
    ownerId: body.ownerId ? String(body.ownerId) : userId,
    status,
    submittedAt: status === 'submitted' ? new Date() : null,
    closedAt: status === 'closed' ? new Date() : null
  }
}

async function buildIncidentUpdateData(body, existing) {
  const data = {}
  if (body.clientId !== undefined) {
    data.clientId = body.clientId != null && String(body.clientId).trim() !== '' ? String(body.clientId).trim() : null
  }
  if (body.clientName !== undefined) data.clientName = String(body.clientName || '').trim()
  if (body.siteId !== undefined || body.siteName !== undefined) {
    const siteFields = await resolveIncidentSiteFields(
      prisma,
      body.siteId !== undefined ? body.siteId : existing.siteId,
      body.siteName !== undefined ? body.siteName : existing.siteName
    )
    data.siteId = siteFields.siteId
    data.siteName = siteFields.siteName
  }
  const jobCardIds = parseJobCardIdsFromBody(body)
  if (jobCardIds !== null) {
    const clientId = data.clientId !== undefined ? data.clientId : existing.clientId
    const linkCheck = await validateIncidentJobCardLinks(prisma, jobCardIds, clientId)
    if (!linkCheck.ok) throw new Error(linkCheck.error)
    const links = linkCheck.links || []
    const legacy = legacyJobCardFieldsFromLinks(links)
    data.jobCardId = legacy.jobCardId
    data.jobCardNumber = legacy.jobCardNumber
    data._jobCardLinks = links
  }
  if (body.incidentAt !== undefined) data.incidentAt = parseOptionalDate(body.incidentAt)
  if (body.locationDescription !== undefined) data.locationDescription = String(body.locationDescription || '').trim()
  if (body.locationLatitude !== undefined) data.locationLatitude = String(body.locationLatitude || '').trim()
  if (body.locationLongitude !== undefined) data.locationLongitude = String(body.locationLongitude || '').trim()
  if (body.incidentType !== undefined) data.incidentType = String(body.incidentType || '').trim()
  if (body.severity !== undefined) data.severity = String(body.severity || '').trim()
  if (body.description !== undefined) data.description = String(body.description || '').trim()
  if (body.immediateActions !== undefined) data.immediateActions = String(body.immediateActions || '').trim()
  if (body.investigationNotes !== undefined) data.investigationNotes = String(body.investigationNotes || '').trim()
  if (body.correctiveActions !== undefined) data.correctiveActions = String(body.correctiveActions || '').trim()
  if (body.peopleInvolved !== undefined) data.peopleInvolved = serializeIncidentPeopleInvolved(body.peopleInvolved)
  if (body.witnesses !== undefined) data.witnesses = String(body.witnesses || '').trim()
  if (body.equipmentInvolved !== undefined) data.equipmentInvolved = String(body.equipmentInvolved || '').trim()
  if (body.relevantAssets !== undefined) data.relevantAssets = String(body.relevantAssets || '').trim()
  if (body.relevantTanksMobileBowsers !== undefined) {
    data.relevantTanksMobileBowsers = String(body.relevantTanksMobileBowsers || '').trim()
  }
  if (body.technicianName !== undefined) data.technicianName = String(body.technicianName || '').trim()
  if (body.authorName !== undefined) data.authorName = String(body.authorName || '').trim()
  if (body.authorSignature !== undefined) data.authorSignature = normalizeSignature(body.authorSignature)
  if (body.photos !== undefined) {
    let photos = parseIncidentPhotosArray(Array.isArray(body.photos) ? body.photos : body.photos)
    if (!photos.length) {
      const linkIds =
        jobCardIds !== null
          ? jobCardIds
          : (await loadLinkedJobCardsByIncidentIds(prisma, [existing.id])).get(existing.id)?.map((row) => row.id) || []
      if (linkIds.length) {
        photos = await loadJobCardPhotosForIncident(prisma, linkIds)
      }
    }
    data.photos = JSON.stringify(photos)
  }
  if (body.reportedById !== undefined) {
    data.reportedById = body.reportedById ? String(body.reportedById) : null
  }
  if (body.reportedByName !== undefined) data.reportedByName = String(body.reportedByName || '').trim()
  if (body.status !== undefined) {
    const nextStatus = normalizeIncidentStatus(body.status, existing.status || 'draft')
    data.status = nextStatus
    if (nextStatus === 'submitted' && !existing.submittedAt) data.submittedAt = new Date()
    if (nextStatus === 'closed' && !existing.closedAt) data.closedAt = new Date()
  }
  return data
}

async function handler(req, res) {
  const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
  const pathSegments = urlPath.split('/').filter(Boolean)
  const resourceType = pathSegments[0]
  const id = pathSegments[1]
  const subResource = pathSegments[2]

  if (resourceType !== 'incident-reports') {
    return badRequest(res, 'Invalid incident reports endpoint')
  }

  if (!id && req.method === 'GET') {
    try {
      const url = new URL(req.url, 'http://localhost')
      const clientId = (url.searchParams.get('clientId') || '').trim()
      const jobCardId = (url.searchParams.get('jobCardId') || '').trim()
      const status = (url.searchParams.get('status') || '').trim()
      const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim()
      const mine =
        url.searchParams.get('mine') === '1' ||
        String(url.searchParams.get('mine') || '').toLowerCase() === 'true'
      const allowLarge = !!(clientId || jobCardId || q)
      const { page, pageSize } = getPagination(allowLarge)(req)
      const owner = req.user?.sub || req.user?.id || null

      const where = {}
      if (clientId) where.clientId = clientId
      if (jobCardId) {
        where.AND = Array.isArray(where.AND) ? where.AND : []
        where.AND.push({
          OR: [{ jobCardId }, { jobCardLinks: { some: { jobCardId } } }]
        })
      }
      if (status && status !== 'all') where.status = status
      if (mine && owner) where.ownerId = String(owner)
      if (q) {
        where.OR = [
          { incidentNumber: { contains: q, mode: 'insensitive' } },
          { clientName: { contains: q, mode: 'insensitive' } },
          { siteName: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { incidentType: { contains: q, mode: 'insensitive' } },
          { reportedByName: { contains: q, mode: 'insensitive' } },
          { technicianName: { contains: q, mode: 'insensitive' } },
          { authorName: { contains: q, mode: 'insensitive' } },
          { relevantAssets: { contains: q, mode: 'insensitive' } },
          { relevantTanksMobileBowsers: { contains: q, mode: 'insensitive' } }
        ]
      }

      const [total, rows] = await Promise.all([
        prisma.incidentReport.count({ where }),
        prisma.incidentReport.findMany({
          where,
          select: LIST_SELECT,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize
        })
      ])
      const enriched = await enrichIncidentRowsSiteNames(prisma, rows)
      const withLinks = await enrichIncidentRowsWithJobCardLinks(prisma, enriched)
      return ok(res, {
        incidentReports: withLinks,
        pagination: {
          page,
          pageSize,
          total,
          hasMore: page * pageSize < total
        }
      })
    } catch (error) {
      console.error('Failed to list incident reports:', error)
      if (isConnectionError(error)) {
        return serverError(res, `Database connection failed: ${error.message}`)
      }
      return serverError(res, 'Failed to list incident reports', error.message)
    }
  }

  if (!id && req.method === 'POST') {
    try {
      const body = req.body || (await parseJsonBody(req))
      const createData = await buildIncidentCreateData(body, req)
      const jobCardLinks = createData._jobCardLinks || []
      delete createData._jobCardLinks
      let incident
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const incidentNumber = await computeNextIncidentNumber(prisma)
        try {
          incident = await prisma.$transaction(async (tx) => {
            const created = await tx.incidentReport.create({
              data: { incidentNumber, ...createData }
            })
            await syncIncidentJobCardLinks(tx, created.id, jobCardLinks)
            return created
          })
          break
        } catch (err) {
          if (err.code === 'P2002' && String(err.meta?.target || '').includes('incidentNumber')) continue
          throw err
        }
      }
      if (!incident) return serverError(res, 'Failed to allocate incident number')
      void insertIncidentReportActivityFromRequest(req, incident.id, 'created', {
        incidentNumber: incident.incidentNumber
      })
      const [formatted] = await enrichIncidentRowsWithJobCardLinks(prisma, [incident])
      return created(res, { incidentReport: formatted })
    } catch (error) {
      console.error('Failed to create incident report:', error)
      if (error.message && error.message.includes('job card')) return badRequest(res, error.message)
      return serverError(res, 'Failed to create incident report', error.message)
    }
  }

  if (id && !subResource && req.method === 'GET') {
    try {
      const row = await prisma.incidentReport.findUnique({ where: { id } })
      if (!row) return notFound(res, 'Incident report not found')
      const [enriched] = await enrichIncidentRowsSiteNames(prisma, [row])
      const [formatted] = await enrichIncidentRowsWithJobCardLinks(prisma, [enriched])
      return ok(res, { incidentReport: formatted })
    } catch (error) {
      return serverError(res, 'Failed to get incident report', error.message)
    }
  }

  if (id && !subResource && req.method === 'PATCH') {
    try {
      const existing = await prisma.incidentReport.findUnique({ where: { id } })
      if (!existing) return notFound(res, 'Incident report not found')
      if (!canMutateIncident(existing, req.user)) return forbidden(res, 'Not allowed to update this incident report')
      const body = req.body || (await parseJsonBody(req))
      const updateData = await buildIncidentUpdateData(body || {}, existing)
      const jobCardLinks = updateData._jobCardLinks
      delete updateData._jobCardLinks
      if (Object.keys(updateData).length === 0 && jobCardLinks === undefined) {
        return badRequest(res, 'No valid fields to update')
      }
      const incident = await prisma.$transaction(async (tx) => {
        const updated = Object.keys(updateData).length
          ? await tx.incidentReport.update({ where: { id }, data: updateData })
          : existing
        if (jobCardLinks !== undefined) {
          await syncIncidentJobCardLinks(tx, id, jobCardLinks)
        }
        return updated
      })
      void insertIncidentReportActivityFromRequest(req, incident.id, 'updated', {
        fields: [
          ...Object.keys(updateData),
          ...(jobCardLinks !== undefined ? ['linkedJobCards'] : [])
        ]
      })
      const [formatted] = await enrichIncidentRowsWithJobCardLinks(prisma, [incident])
      return ok(res, { incidentReport: formatted })
    } catch (error) {
      if (error.message && error.message.includes('job card')) return badRequest(res, error.message)
      return serverError(res, 'Failed to update incident report', error.message)
    }
  }

  if (id && !subResource && req.method === 'DELETE') {
    try {
      const existing = await prisma.incidentReport.findUnique({ where: { id } })
      if (!existing) return notFound(res, 'Incident report not found')
      if (!canDeleteIncident(req.user)) {
        return forbidden(res, 'Only administrators can delete incident reports')
      }
      await prisma.incidentReport.delete({ where: { id } })
      return ok(res, { deleted: true, id })
    } catch (error) {
      return serverError(res, 'Failed to delete incident report', error.message)
    }
  }

  if (id && subResource === 'photos' && req.method === 'GET') {
    try {
      const row = await prisma.incidentReport.findUnique({ where: { id }, select: { id: true, photos: true } })
      if (!row) return notFound(res, 'Incident report not found')
      return ok(res, { incidentReportId: row.id, photos: parseJson(row.photos) })
    } catch (error) {
      return serverError(res, 'Failed to get incident photos', error.message)
    }
  }

  if (id && subResource === 'pdf' && req.method === 'GET') {
    try {
      const row = await prisma.incidentReport.findUnique({ where: { id } })
      if (!row) return notFound(res, 'Incident report not found')
      const [formatted] = await enrichIncidentRowsWithJobCardLinks(prisma, [row])
      const pdfBuffer = await buildIncidentReportPdfBuffer(prisma, formatted)
      const filename = `${String(row.incidentNumber || row.id).replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Content-Length', String(pdfBuffer.length))
      return res.end(pdfBuffer)
    } catch (error) {
      console.error('Incident PDF error:', error)
      return serverError(res, 'Failed to generate incident PDF', error.message)
    }
  }

  return badRequest(res, 'Invalid incident reports endpoint')
}

export default authRequired(handler)
