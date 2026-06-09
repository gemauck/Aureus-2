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
  serializeIncidentPeopleInvolved,
  validateIncidentJobCardLink
} from './_lib/incidentReportResolve.js'
import { insertIncidentReportActivityFromRequest } from './_lib/incidentReportActivity.js'
import { buildIncidentReportPdfBuffer } from './_lib/incidentReportPdf.js'
import {
  INCIDENT_ALLOWED_STATUSES,
  normalizeIncidentStatus
} from '../src/incidentReport/constants.js'

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
  reportedById: true,
  reportedByName: true,
  ownerId: true,
  submittedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true
}

function formatIncidentRow(row) {
  if (!row) return row
  return {
    ...row,
    peopleInvolved: row.peopleInvolved !== undefined ? parseJson(row.peopleInvolved, []) : undefined,
    photos: row.photos !== undefined ? parseJson(row.photos, []) : undefined
  }
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

async function buildIncidentCreateData(body, req) {
  const userId = req.user?.sub || req.user?.id || null
  const clientId = body.clientId != null && String(body.clientId).trim() !== '' ? String(body.clientId).trim() : null
  const jobCardId = body.jobCardId != null && String(body.jobCardId).trim() !== '' ? String(body.jobCardId).trim() : null
  const linkCheck = await validateIncidentJobCardLink(prisma, jobCardId, clientId)
  if (!linkCheck.ok) throw new Error(linkCheck.error)

  const siteFields = await resolveIncidentSiteFields(prisma, body.siteId, body.siteName)
  const status = normalizeIncidentStatus(body.status, 'draft')
  const incidentAt = parseOptionalDate(body.incidentAt) || new Date()

  return {
    clientId,
    clientName: String(body.clientName || '').trim(),
    siteId: siteFields.siteId,
    siteName: siteFields.siteName,
    jobCardId,
    jobCardNumber: linkCheck.jobCardNumber || String(body.jobCardNumber || '').trim(),
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
    photos: JSON.stringify(Array.isArray(body.photos) ? body.photos : parseJson(body.photos, [])),
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
  if (body.jobCardId !== undefined) {
    const jobCardId =
      body.jobCardId != null && String(body.jobCardId).trim() !== '' ? String(body.jobCardId).trim() : null
    const clientId = data.clientId !== undefined ? data.clientId : existing.clientId
    const linkCheck = await validateIncidentJobCardLink(prisma, jobCardId, clientId)
    if (!linkCheck.ok) throw new Error(linkCheck.error)
    data.jobCardId = jobCardId
    data.jobCardNumber = linkCheck.jobCardNumber || ''
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
  if (body.photos !== undefined) {
    data.photos = JSON.stringify(Array.isArray(body.photos) ? body.photos : parseJson(body.photos, []))
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

  const paginate = getPagination()

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
      const { page, pageSize } = paginate(req)
      const owner = req.user?.sub || req.user?.id || null

      const where = {}
      if (clientId) where.clientId = clientId
      if (jobCardId) where.jobCardId = jobCardId
      if (status && status !== 'all') where.status = status
      if (mine && owner) where.ownerId = String(owner)
      if (q) {
        where.OR = [
          { incidentNumber: { contains: q, mode: 'insensitive' } },
          { clientName: { contains: q, mode: 'insensitive' } },
          { siteName: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { incidentType: { contains: q, mode: 'insensitive' } },
          { reportedByName: { contains: q, mode: 'insensitive' } }
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
      return ok(res, {
        incidentReports: enriched.map(formatIncidentRow),
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
      let incident
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const incidentNumber = await computeNextIncidentNumber(prisma)
        try {
          incident = await prisma.incidentReport.create({
            data: { incidentNumber, ...createData }
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
      return created(res, { incidentReport: formatIncidentRow(incident) })
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
      return ok(res, { incidentReport: formatIncidentRow(enriched) })
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
      if (Object.keys(updateData).length === 0) return badRequest(res, 'No valid fields to update')
      const incident = await prisma.incidentReport.update({ where: { id }, data: updateData })
      void insertIncidentReportActivityFromRequest(req, incident.id, 'updated', {
        fields: Object.keys(updateData)
      })
      return ok(res, { incidentReport: formatIncidentRow(incident) })
    } catch (error) {
      if (error.message && error.message.includes('job card')) return badRequest(res, error.message)
      return serverError(res, 'Failed to update incident report', error.message)
    }
  }

  if (id && !subResource && req.method === 'DELETE') {
    try {
      const existing = await prisma.incidentReport.findUnique({ where: { id } })
      if (!existing) return notFound(res, 'Incident report not found')
      if (!incidentMutateRole(req.user) && existing.ownerId !== (req.user?.sub || req.user?.id)) {
        return forbidden(res, 'Not allowed to delete this incident report')
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
      const pdfBuffer = await buildIncidentReportPdfBuffer(prisma, row)
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
