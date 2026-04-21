import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError, forbidden } from './_lib/response.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'
import { isAdminRole } from './_lib/authRoles.js'
import { logAuditFromRequest } from './_lib/manufacturingAuditLog.js'
import { insertJobCardActivityFromRequest } from './_lib/jobCardActivity.js'
import { buildJobCardUpdateChanges, buildServiceFormInstanceChanges } from './_lib/jobCardActivityDiff.js'

// Some deployments may not yet have the optional service form tables used by
// the job card forms feature. When those tables are missing, Prisma throws
// a specific error. We treat that as "feature not available" instead of a
// hard failure so the rest of the job cards module remains usable.
function isMissingServiceFormInstanceTables(error) {
  if (!error) return false

  const message = String(error.message || '')
  const code = error.code

  if (code === 'P2021' || code === 'P2023') return true

  if (message.includes('ServiceFormTemplate') || message.includes('ServiceFormInstance')) {
    return true
  }

  return false
}

/** Roles that may create, update, or delete any job card (including public submissions with no owner). */
function jobCardMutateRole(user) {
  if (isAdminRole(user?.role)) return true
  const role = String(user?.role || 'user').toLowerCase()
  return role === 'service' || role === 'manager'
}

/** Owner may edit own card; elevated roles may edit any card. Unowned (public) cards: elevated roles only. */
function canMutateJobCard(jobCard, user) {
  if (jobCardMutateRole(user)) return true
  const userId = user?.sub || user?.id || null
  if (!userId) return false
  if (jobCard.ownerId && jobCard.ownerId === userId) return true
  return false
}

function isTerminalJobCardStatus(s) {
  return s === 'submitted' || s === 'completed'
}

const ALLOWED_JOB_CARD_STATUSES = new Set(['draft', 'open', 'submitted', 'completed', 'cancelled'])

function normalizeJobCardStatus(status, fallback = 'draft') {
  if (status === undefined || status === null || String(status).trim() === '') return fallback
  const normalized = String(status).trim().toLowerCase().replace(/\s+/g, '_')
  return ALLOWED_JOB_CARD_STATUSES.has(normalized) ? normalized : null
}

function parseFiniteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseNonNegativeFiniteNumber(value, fieldName) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${fieldName} must be a finite number >= 0`)
  }
  return n
}

function parseCreatedToInclusive(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
  }
  const dt = new Date(raw)
  return Number.isNaN(dt.getTime()) ? null : dt
}

async function resolveActorDisplayName(prismaClient, req) {
  const uid = req.user?.sub || req.user?.id
  if (!uid) return req.user?.name || req.user?.email || 'User'
  try {
    const u = await prismaClient.user.findUnique({
      where: { id: String(uid) },
      select: { name: true, email: true }
    })
    if (u) return u.name || u.email || 'User'
  } catch {
    /* non-fatal */
  }
  return req.user?.name || req.user?.email || 'User'
}

async function insertJobCardActivity(prismaClient, { jobCardId, req, action, metadata, source = 'web' }) {
  return insertJobCardActivityFromRequest(prismaClient, req, { jobCardId, action, metadata, source })
}

/**
 * Ensures at least one JobCardActivity row exists (legacy cards or edge cases with no events).
 */
async function ensureMinimumJobCardActivity(prismaClient, jobCardId) {
  return prismaClient.$transaction(async tx => {
    const n = await tx.jobCardActivity.count({ where: { jobCardId } })
    if (n > 0) return

    const jc = await tx.jobCard.findUnique({ where: { id: jobCardId } })
    if (!jc) return

    let actorName = ''
    const aid = jc.ownerId
    if (aid) {
      const u = await tx.user.findUnique({
        where: { id: String(aid) },
        select: { name: true, email: true }
      })
      if (u) {
        actorName = u.name && String(u.name).trim() ? u.name.trim() : u.email || ''
      }
    }

    await tx.jobCardActivity.create({
      data: {
        jobCardId,
        actorUserId: aid ? String(aid) : null,
        actorName: actorName || (aid ? 'User' : '—'),
        action: 'baseline_record',
        source: 'system',
        metadata: {
          note:
            'Baseline entry for this job card (no detailed activity was stored earlier, or the card predates activity logging).'
        },
        createdAt: jc.createdAt || new Date()
      }
    })
  })
}

async function computeNextJobCardNumber() {
  const lastJobCard = await prisma.jobCard.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { jobCardNumber: true }
  })
  let nextNumber = 1
  if (lastJobCard?.jobCardNumber?.startsWith('JC')) {
    const match = lastJobCard.jobCardNumber.match(/JC(\d+)/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }
  return `JC${String(nextNumber).padStart(4, '0')}`
}

const LIST_SORT_WHITELIST = {
  createdAt: true,
  updatedAt: true,
  jobCardNumber: true,
  clientName: true,
  status: true,
  agentName: true,
  reasonForVisit: true,
  callOutCategory: true
}

/** List responses only: keeps mobile list/search payloads small (full text comes from GET /api/jobcards/:id). */
const LIST_TEXT_PREVIEW_MAX = 420

function truncateJobCardListText(value, max = LIST_TEXT_PREVIEW_MAX) {
  if (value == null) return ''
  const s = String(value)
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

/**
 * Prisma select for GET one — all JobCard scalars except safetyCultureSnapshotJson
 * (import blob; never needed by the client and can be multi‑MB from DB).
 */
const JOB_CARD_GET_ONE_SELECT = {
  id: true,
  jobCardNumber: true,
  agentName: true,
  otherTechnicians: true,
  clientId: true,
  clientName: true,
  siteId: true,
  siteName: true,
  location: true,
  timeOfDeparture: true,
  timeOfArrival: true,
  vehicleUsed: true,
  kmReadingBefore: true,
  kmReadingAfter: true,
  travelKilometers: true,
  reasonForVisit: true,
  callOutCategory: true,
  diagnosis: true,
  futureWorkRequired: true,
  futureWorkScheduledAt: true,
  otherComments: true,
  photos: true,
  status: true,
  submittedAt: true,
  completedAt: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  actionsTaken: true,
  materialsBought: true,
  stockUsed: true,
  totalMaterialsCost: true,
  arrivalBackAtOffice: true,
  departureFromSite: true,
  locationLatitude: true,
  locationLongitude: true,
  totalTimeMinutes: true,
  vehicleId: true,
  safetyCultureAuditId: true,
  safetyCultureIssueId: true,
  completedByUserId: true,
  completedByName: true
}

/** Same as JOB_CARD_GET_ONE_SELECT but skips `photos` (multi‑MB JSON) for fast detail shell loads. */
const JOB_CARD_GET_ONE_LITE_SELECT = (() => {
  const s = { ...JOB_CARD_GET_ONE_SELECT }
  delete s.photos
  return s
})()

async function handler(req, res) {
  // Strip query parameters before splitting
  const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
  const pathSegments = urlPath.split('/').filter(Boolean)
  const resourceType = pathSegments[0] // jobcards (direct endpoint, not nested like /api/manufacturing/*)
  const id = pathSegments[1]
  const subResource = pathSegments[2]
  const urlPathRaw = req.url.split('?')[0].split('#')[0]

  const auditManufacturing = (action, resource, entityId, details = {}) => {
    void logAuditFromRequest(prisma, req, {
      action,
      entity: 'manufacturing',
      entityId: entityId != null && String(entityId) !== '' ? String(entityId) : String(resource),
      details: {
        resource,
        method: req.method,
        path: urlPathRaw,
        ...details
      }
    })
  }

  // Helper to read pagination params from the query string
  const getPagination = (allowLargePageSize = false) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const rawPage = parseInt(url.searchParams.get('page') || '1', 10)
      const rawPageSize = parseInt(url.searchParams.get('pageSize') || '50', 10)

      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
      // Keep page size within a safe range to avoid overloading the dashboard
      // Allow larger page sizes when filtering by clientId (for client detail views)
      let pageSize =
        Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 50
      const maxPageSize = allowLargePageSize ? 1000 : 100
      pageSize = Math.max(10, Math.min(pageSize, maxPageSize))

      return { page, pageSize }
    } catch {
      // Fallback to sensible defaults if URL parsing fails for any reason
      return { page: 1, pageSize: 50 }
    }
  }

  // Helper to parse JSON fields
  const parseJson = (str, defaultValue = []) => {
    try {
      if (!str) return defaultValue
      return typeof str === 'string' ? JSON.parse(str) : str
    } catch {
      return defaultValue
    }
  }

  // Helper to format dates
  const formatDate = (date) => {
    if (!date) return null
    if (date instanceof Date) return date.toISOString()
    return new Date(date).toISOString()
  }
  
  // Helper to format dates for datetime-local inputs (YYYY-MM-DDTHH:mm)
  const formatDateTimeLocal = (date) => {
    if (!date) return null
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d.getTime())) return null
    // Format as YYYY-MM-DDTHH:mm for datetime-local input
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // JOB CARDS
  if (resourceType === 'jobcards' && !subResource) {
    // LIST (GET /api/jobcards)
    if (req.method === 'GET' && !id) {
      try {
        // Support filtering by clientId or clientName via query parameters
        const url = new URL(req.url, 'http://localhost')
        const clientId = url.searchParams.get('clientId')
        const clientName = url.searchParams.get('clientName')
        const callOutCategory = (url.searchParams.get('callOutCategory') || '').trim()
        const statusParam = url.searchParams.get('status')
        const searchQ = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim()
        const sortFieldRaw = url.searchParams.get('sortField') || 'createdAt'
        const sortDirectionRaw =
          url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc'

        const mineParam =
          url.searchParams.get('mine') === '1' ||
          String(url.searchParams.get('mine') || '').toLowerCase() === 'true'
        const ownerIdParamRaw = (url.searchParams.get('ownerId') || '').trim()
        const createdFromRaw = (url.searchParams.get('createdFrom') || '').trim()
        const createdToRaw = (url.searchParams.get('createdTo') || '').trim()

        function looksLikeJobCardOwnerId(value) {
          if (!value || typeof value !== 'string') return false
          const v = value.trim()
          if (v.length < 8 || v.length > 128) return false
          return /^[a-zA-Z0-9_-]+$/.test(v)
        }

        // Allow larger page sizes when filtering by client (for client detail views), text search, or narrow filters
        const allowLargePageSize = !!(
          clientId ||
          clientName ||
          callOutCategory ||
          searchQ ||
          mineParam ||
          ownerIdParamRaw ||
          createdFromRaw ||
          createdToRaw
        )
        const { page, pageSize } = getPagination(allowLargePageSize)
        const owner = req.user?.sub

        // Build where clause for filtering
        // For clientName, use case-insensitive partial matching
        const baseFilters = {}
        if (clientId) {
          baseFilters.clientId = clientId
        } else if (clientName) {
          // Use case-insensitive contains search for clientName to catch variations
          // e.g., "AccuFarm" matches "AccuFarm (Pty) Ltd" and vice versa
          baseFilters.clientName = {
            contains: clientName,
            mode: 'insensitive'
          }
        }
        if (statusParam && statusParam !== 'all') {
          baseFilters.status = statusParam
        }
        if (callOutCategory) {
          baseFilters.callOutCategory = {
            equals: callOutCategory,
            mode: 'insensitive'
          }
        }

        if (mineParam && owner) {
          baseFilters.ownerId = String(owner)
        } else if (ownerIdParamRaw && looksLikeJobCardOwnerId(ownerIdParamRaw)) {
          baseFilters.ownerId = ownerIdParamRaw
        }

        const createdRange = {}
        if (createdFromRaw) {
          const d = new Date(createdFromRaw)
          if (!Number.isNaN(d.getTime())) createdRange.gte = d
        }
        if (createdToRaw) {
          const d = parseCreatedToInclusive(createdToRaw)
          if (d) createdRange.lte = d
        }
        if (Object.keys(createdRange).length > 0) {
          baseFilters.createdAt = createdRange
        }

        let whereClause = {}
        if (searchQ) {
          // Match any substantive text on the job card (string columns + JSON-as-text fields)
          const searchOr = {
            OR: [
              { jobCardNumber: { contains: searchQ, mode: 'insensitive' } },
              { status: { contains: searchQ, mode: 'insensitive' } },
              { agentName: { contains: searchQ, mode: 'insensitive' } },
              { otherTechnicians: { contains: searchQ, mode: 'insensitive' } },
              { clientId: { contains: searchQ, mode: 'insensitive' } },
              { clientName: { contains: searchQ, mode: 'insensitive' } },
              { siteId: { contains: searchQ, mode: 'insensitive' } },
              { siteName: { contains: searchQ, mode: 'insensitive' } },
              { location: { contains: searchQ, mode: 'insensitive' } },
              { locationLatitude: { contains: searchQ, mode: 'insensitive' } },
              { locationLongitude: { contains: searchQ, mode: 'insensitive' } },
              { vehicleUsed: { contains: searchQ, mode: 'insensitive' } },
              { reasonForVisit: { contains: searchQ, mode: 'insensitive' } },
              { callOutCategory: { contains: searchQ, mode: 'insensitive' } },
              { diagnosis: { contains: searchQ, mode: 'insensitive' } },
              { futureWorkRequired: { contains: searchQ, mode: 'insensitive' } },
              { actionsTaken: { contains: searchQ, mode: 'insensitive' } },
              { otherComments: { contains: searchQ, mode: 'insensitive' } },
              // Intentionally exclude `photos`: values are often huge (base64 JSON) and
              // `contains` on that column makes list/search unusably slow on mobile.
              { materialsBought: { contains: searchQ, mode: 'insensitive' } },
              { stockUsed: { contains: searchQ, mode: 'insensitive' } }
            ]
          }
          if (Object.keys(baseFilters).length === 0) {
            whereClause = searchOr
          } else {
            whereClause = { AND: [baseFilters, searchOr] }
          }
        } else {
          whereClause = baseFilters
        }

        const sortField = LIST_SORT_WHITELIST[sortFieldRaw] ? sortFieldRaw : 'createdAt'
        const orderBy = { [sortField]: sortDirectionRaw }

        // Limit the number of job cards returned and support simple pagination
        // to keep the dashboard fast even as history grows.
        const listSelectBase = {
          id: true,
          jobCardNumber: true,
          agentName: true,
          clientId: true,
          clientName: true,
          siteName: true,
          location: true,
          status: true,
          reasonForVisit: true,
          callOutCategory: true,
          diagnosis: true,
          ownerId: true,
          completedByUserId: true,
          completedByName: true,
          createdAt: true,
          updatedAt: true,
          totalTimeMinutes: true,
          travelKilometers: true,
          kmReadingBefore: true,
          kmReadingAfter: true,
          totalMaterialsCost: true,
          vehicleUsed: true,
          timeOfDeparture: true,
          timeOfArrival: true,
          departureFromSite: true,
          arrivalBackAtOffice: true,
          submittedAt: true,
          completedAt: true,
          safetyCultureIssueId: true,
          safetyCultureAuditId: true
        }

        const totalItemsPromise = prisma.jobCard.count({ where: whereClause })

        let jobCards
        try {
          jobCards = await prisma.jobCard.findMany({
            where: whereClause,
            select: {
              ...listSelectBase,
              _count: {
                select: { serviceForms: true }
              }
            },
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize
          })
        } catch (err) {
          if (!isMissingServiceFormInstanceTables(err)) throw err
          jobCards = await prisma.jobCard.findMany({
            where: whereClause,
            select: { ...listSelectBase },
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize
          })
          jobCards = jobCards.map((row) => ({
            ...row,
            _count: { serviceForms: 0 }
          }))
        }

        const totalItems = await totalItemsPromise

        // Format dates for response; flatten checklist count for clients
        const formatted = jobCards.map((jobCard) => {
          const { _count, ...rest } = jobCard
          return {
            ...rest,
            serviceFormsCount: typeof _count?.serviceForms === 'number' ? _count.serviceForms : 0,
            reasonForVisit: truncateJobCardListText(rest.reasonForVisit),
            diagnosis: truncateJobCardListText(rest.diagnosis),
            location: truncateJobCardListText(rest.location),
            createdAt: formatDate(rest.createdAt),
            updatedAt: formatDate(rest.updatedAt),
            submittedAt: formatDate(rest.submittedAt),
            completedAt: formatDate(rest.completedAt),
            timeOfDeparture: formatDate(rest.timeOfDeparture),
            timeOfArrival: formatDate(rest.timeOfArrival),
            departureFromSite: formatDate(rest.departureFromSite),
            arrivalBackAtOffice: formatDate(rest.arrivalBackAtOffice)
          }
        })
        
        return ok(res, { 
          jobCards: formatted,
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / pageSize))
          }
        })
      } catch (error) {
        console.error('❌ Failed to list job cards:', error)
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to list job cards', error.message)
      }
    }

    // GET ONE (GET /api/jobcards/:id)
    if (req.method === 'GET' && id) {
      try {
        const reqUrl = new URL(req.url, 'http://localhost')
        const omitPhotos =
          reqUrl.searchParams.get('omitPhotos') === '1' ||
          reqUrl.searchParams.get('omitPhotos') === 'true'

        const row = await prisma.jobCard.findUnique({
          where: { id },
          select: omitPhotos ? JOB_CARD_GET_ONE_LITE_SELECT : JOB_CARD_GET_ONE_SELECT
        })
        
        if (!row) {
          return notFound(res, 'Job card not found')
        }

        const jobCard = row

        let recordedByName = ''
        let recordedByEmail = ''
        if (jobCard.ownerId) {
          try {
            const ownerUser = await prisma.user.findUnique({
              where: { id: String(jobCard.ownerId) },
              select: { name: true, email: true }
            })
            if (ownerUser) {
              recordedByName = (ownerUser.name && String(ownerUser.name).trim())
                ? ownerUser.name.trim()
                : (ownerUser.email || '')
              recordedByEmail = ownerUser.email || ''
            }
          } catch {
            /* non-fatal */
          }
        }

        const common = {
          ...jobCard,
          recordedByName,
          recordedByEmail,
          otherTechnicians: parseJson(jobCard.otherTechnicians),
          stockUsed: parseJson(jobCard.stockUsed || '[]'),
          materialsBought: parseJson(jobCard.materialsBought || '[]'),
          futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
          timeOfDeparture: formatDate(jobCard.timeOfDeparture),
          timeOfArrival: formatDate(jobCard.timeOfArrival),
          submittedAt: formatDate(jobCard.submittedAt),
          completedAt: formatDate(jobCard.completedAt),
          createdAt: formatDate(jobCard.createdAt),
          updatedAt: formatDate(jobCard.updatedAt)
        }

        if (omitPhotos) {
          return ok(res, {
            jobCard: {
              ...common,
              attachmentsPending: true
            }
          })
        }

        return ok(res, { 
          jobCard: {
            ...common,
            photos: parseJson(jobCard.photos)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get job card:', error)
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to get job card', error.message)
      }
    }

    // CREATE (POST /api/jobcards)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      try {
        // Parse JSON fields
        const otherTechnicians = Array.isArray(body.otherTechnicians) 
          ? JSON.stringify(body.otherTechnicians) 
          : body.otherTechnicians || '[]'
        const photos = Array.isArray(body.photos) 
          ? JSON.stringify(body.photos) 
          : body.photos || '[]'
        const stockUsed = Array.isArray(body.stockUsed) 
          ? JSON.stringify(body.stockUsed) 
          : body.stockUsed || '[]'
        const materialsBought = Array.isArray(body.materialsBought) 
          ? JSON.stringify(body.materialsBought) 
          : body.materialsBought || '[]'
        
        // Calculate travel kilometers
        const kmBefore = parseFiniteNumber(body.kmReadingBefore, 0)
        const kmAfter = parseFiniteNumber(body.kmReadingAfter, 0)
        const travelKilometers = Math.max(0, kmAfter - kmBefore)
        
        // Calculate total materials cost
        const totalMaterialsCost = Array.isArray(body.materialsBought)
          ? body.materialsBought.reduce((sum, item) => sum + parseFiniteNumber(item?.cost, 0), 0)
          : parseFiniteNumber(body.totalMaterialsCost, 0)

        const lat =
          body.locationLatitude != null && body.locationLatitude !== ''
            ? String(body.locationLatitude)
            : body.latitude != null && body.latitude !== ''
              ? String(body.latitude)
              : ''
        const lng =
          body.locationLongitude != null && body.locationLongitude !== ''
            ? String(body.locationLongitude)
            : body.longitude != null && body.longitude !== ''
              ? String(body.longitude)
              : ''

        /** Align with public job card API: optional customer lines appended for search/display */
        const mergeJobCardOtherComments = (b) => {
          const base = b.otherComments != null ? String(b.otherComments) : ''
          if (
            !b.customerName &&
            !b.customerTitle &&
            !b.customerPosition &&
            !b.customerFeedback &&
            !b.customerSignature
          ) {
            return base
          }
          const pos = b.customerTitle || b.customerPosition
          return [
            base,
            b.customerName ? `Customer: ${b.customerName}` : '',
            pos ? `Position: ${pos}` : '',
            b.customerFeedback ? `Feedback: ${b.customerFeedback}` : '',
            b.customerSignature ? `Signature: [Captured]` : ''
          ]
            .filter(Boolean)
            .join('\n')
        }

        const otherCommentsForCreate = mergeJobCardOtherComments(body)

        const statusForCreate = normalizeJobCardStatus(body.status, 'draft')
        if (!statusForCreate) {
          return badRequest(res, 'Invalid job card status')
        }

        let completedByUserId = null
        let completedByName = ''
        if (isTerminalJobCardStatus(statusForCreate)) {
          completedByUserId = req.user?.sub ? String(req.user.sub) : null
          completedByName = await resolveActorDisplayName(prisma, req)
        }

        const buildCreateArgs = jobCardNumber => ({
          data: {
            jobCardNumber,
            agentName: body.agentName || '',
            otherTechnicians,
            clientId: body.clientId || null,
            clientName: body.clientName || '',
            siteId: body.siteId || '',
            siteName: body.siteName || '',
            location: body.location || '',
            locationLatitude: lat,
            locationLongitude: lng,
            timeOfDeparture: body.timeOfDeparture ? new Date(body.timeOfDeparture) : null,
            timeOfArrival: body.timeOfArrival ? new Date(body.timeOfArrival) : null,
            vehicleUsed: body.vehicleUsed || '',
            kmReadingBefore: kmBefore,
            kmReadingAfter: kmAfter,
            travelKilometers,
            reasonForVisit: body.reasonForVisit || '',
            callOutCategory: body.callOutCategory || '',
            diagnosis: body.diagnosis || '',
            futureWorkRequired: body.futureWorkRequired || '',
            futureWorkScheduledAt: body.futureWorkScheduledAt ? new Date(body.futureWorkScheduledAt) : null,
            actionsTaken: body.actionsTaken || '',
            stockUsed,
            materialsBought,
            totalMaterialsCost,
            otherComments: otherCommentsForCreate,
            photos,
            status: statusForCreate,
            submittedAt: body.submittedAt ? new Date(body.submittedAt) : null,
            completedAt: body.completedAt ? new Date(body.completedAt) : null,
            ownerId: req.user?.sub || null,
            completedByUserId,
            completedByName
          }
        })

        let jobCard = null
        const maxAttempts = 12
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const jobCardNumber = await computeNextJobCardNumber()
          try {
            jobCard = await prisma.jobCard.create(buildCreateArgs(jobCardNumber))
            break
          } catch (err) {
            const target = err?.meta?.target
            const targetStr = Array.isArray(target) ? target.join(',') : String(target || '')
            if (err.code === 'P2002' && targetStr.includes('jobCardNumber')) {
              continue
            }
            throw err
          }
        }
        if (!jobCard) {
          return serverError(
            res,
            'Failed to create job card',
            'Could not allocate a unique job card number'
          )
        }

        await insertJobCardActivity(prisma, {
          jobCardId: jobCard.id,
          req,
          action: 'created',
          metadata: {
            status: jobCard.status,
            jobCardNumber: jobCard.jobCardNumber,
            clientName: jobCard.clientName || '',
            siteName: jobCard.siteName || ''
          },
          source: 'web'
        })
        auditManufacturing('create', 'job-cards', jobCard.id, {
          summary: `Created job card ${jobCard.jobCardNumber}`,
          jobCardNumber: jobCard.jobCardNumber
        })

        return created(res, { 
          jobCard: {
            ...jobCard,
            otherTechnicians: parseJson(jobCard.otherTechnicians),
            photos: parseJson(jobCard.photos),
            stockUsed: parseJson(jobCard.stockUsed || '[]'),
            materialsBought: parseJson(jobCard.materialsBought || '[]'),
            // Return full ISO strings for datetime fields
            futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
            timeOfDeparture: formatDate(jobCard.timeOfDeparture),
            timeOfArrival: formatDate(jobCard.timeOfArrival),
            submittedAt: formatDate(jobCard.submittedAt),
            completedAt: formatDate(jobCard.completedAt),
            createdAt: formatDate(jobCard.createdAt),
            updatedAt: formatDate(jobCard.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to create job card:', error)
        if (error?.message && error.message.includes('must be a finite number >= 0')) {
          return badRequest(res, error.message)
        }
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to create job card', error.message)
      }
    }

    // UPDATE (PATCH /api/jobcards/:id)
    if (req.method === 'PATCH' && id) {
      const body = req.body || {}
      
      try {
        const existing = await prisma.jobCard.findUnique({ where: { id } })
        if (!existing) {
          return notFound(res, 'Job card not found')
        }
        if (!canMutateJobCard(existing, req.user)) {
          return forbidden(res, 'You do not have permission to update this job card')
        }
        
        const updateData = {}
        
        if (body.agentName !== undefined) updateData.agentName = body.agentName
        if (body.otherTechnicians !== undefined) {
          updateData.otherTechnicians = Array.isArray(body.otherTechnicians) 
            ? JSON.stringify(body.otherTechnicians) 
            : body.otherTechnicians
        }
        if (body.clientId !== undefined) updateData.clientId = body.clientId
        if (body.clientName !== undefined) updateData.clientName = body.clientName
        if (body.siteId !== undefined) updateData.siteId = body.siteId
        if (body.siteName !== undefined) updateData.siteName = body.siteName
        if (body.location !== undefined) updateData.location = body.location
        if (body.latitude !== undefined) updateData.locationLatitude = String(body.latitude ?? '')
        if (body.longitude !== undefined) updateData.locationLongitude = String(body.longitude ?? '')
        if (body.locationLatitude !== undefined) {
          updateData.locationLatitude = String(body.locationLatitude ?? '')
        }
        if (body.locationLongitude !== undefined) {
          updateData.locationLongitude = String(body.locationLongitude ?? '')
        }
        if (body.timeOfDeparture !== undefined) updateData.timeOfDeparture = body.timeOfDeparture ? new Date(body.timeOfDeparture) : null
        if (body.timeOfArrival !== undefined) updateData.timeOfArrival = body.timeOfArrival ? new Date(body.timeOfArrival) : null
        if (body.vehicleUsed !== undefined) updateData.vehicleUsed = body.vehicleUsed
        if (body.kmReadingBefore !== undefined) updateData.kmReadingBefore = parseFiniteNumber(body.kmReadingBefore, 0)
        if (body.kmReadingAfter !== undefined) updateData.kmReadingAfter = parseFiniteNumber(body.kmReadingAfter, 0)
        if (body.reasonForVisit !== undefined) updateData.reasonForVisit = body.reasonForVisit
        if (body.callOutCategory !== undefined) updateData.callOutCategory = body.callOutCategory
        if (body.diagnosis !== undefined) updateData.diagnosis = body.diagnosis
        if (body.futureWorkRequired !== undefined) updateData.futureWorkRequired = body.futureWorkRequired
        if (body.futureWorkScheduledAt !== undefined) {
          updateData.futureWorkScheduledAt = body.futureWorkScheduledAt ? new Date(body.futureWorkScheduledAt) : null
        }
        if (body.actionsTaken !== undefined) updateData.actionsTaken = body.actionsTaken
        if (body.stockUsed !== undefined) {
          updateData.stockUsed = Array.isArray(body.stockUsed) 
            ? JSON.stringify(body.stockUsed) 
            : body.stockUsed
        }
        if (body.materialsBought !== undefined) {
          updateData.materialsBought = Array.isArray(body.materialsBought) 
            ? JSON.stringify(body.materialsBought) 
            : body.materialsBought
        }
        if (body.totalMaterialsCost !== undefined) {
          updateData.totalMaterialsCost = parseNonNegativeFiniteNumber(body.totalMaterialsCost, 'totalMaterialsCost')
        }
        if (
          body.otherComments !== undefined ||
          body.customerName !== undefined ||
          body.customerTitle !== undefined ||
          body.customerPosition !== undefined ||
          body.customerFeedback !== undefined ||
          body.customerSignature !== undefined
        ) {
          const mergedBody = {
            otherComments:
              body.otherComments !== undefined
                ? body.otherComments
                : existing.otherComments || '',
            customerName: body.customerName,
            customerTitle: body.customerTitle,
            customerPosition: body.customerPosition,
            customerFeedback: body.customerFeedback,
            customerSignature: body.customerSignature
          }
          const base = mergedBody.otherComments != null ? String(mergedBody.otherComments) : ''
          if (
            mergedBody.customerName ||
            mergedBody.customerTitle ||
            mergedBody.customerPosition ||
            mergedBody.customerFeedback ||
            mergedBody.customerSignature
          ) {
            const pos = mergedBody.customerTitle || mergedBody.customerPosition
            updateData.otherComments = [
              base,
              mergedBody.customerName ? `Customer: ${mergedBody.customerName}` : '',
              pos ? `Position: ${pos}` : '',
              mergedBody.customerFeedback ? `Feedback: ${mergedBody.customerFeedback}` : '',
              mergedBody.customerSignature ? `Signature: [Captured]` : ''
            ]
              .filter(Boolean)
              .join('\n')
          } else {
            updateData.otherComments = base
          }
        }
        if (body.photos !== undefined) {
          updateData.photos = Array.isArray(body.photos) 
            ? JSON.stringify(body.photos) 
            : body.photos
        }
        if (body.status !== undefined) {
          const normalizedStatus = normalizeJobCardStatus(body.status, null)
          if (!normalizedStatus) return badRequest(res, 'Invalid job card status')
          updateData.status = normalizedStatus
        }
        if (body.submittedAt !== undefined) updateData.submittedAt = body.submittedAt ? new Date(body.submittedAt) : null
        if (body.completedAt !== undefined) updateData.completedAt = body.completedAt ? new Date(body.completedAt) : null
        
        // Recalculate travel kilometers if readings changed
        if (body.kmReadingBefore !== undefined || body.kmReadingAfter !== undefined) {
          const kmBefore = body.kmReadingBefore !== undefined ? parseFiniteNumber(body.kmReadingBefore, 0) : existing.kmReadingBefore
          const kmAfter = body.kmReadingAfter !== undefined ? parseFiniteNumber(body.kmReadingAfter, 0) : existing.kmReadingAfter
          updateData.travelKilometers = Math.max(0, kmAfter - kmBefore)
        }
        
        // Recalculate total materials cost if materials changed
        if (body.materialsBought !== undefined) {
          const materials = Array.isArray(body.materialsBought) ? body.materialsBought : parseJson(body.materialsBought || '[]')
          updateData.totalMaterialsCost = materials.reduce((sum, item) => sum + parseFiniteNumber(item?.cost, 0), 0)
        }

        const nextStatus =
          updateData.status !== undefined ? updateData.status : existing.status
        if (isTerminalJobCardStatus(nextStatus) && !existing.completedByUserId) {
          updateData.completedByUserId = req.user?.sub ? String(req.user.sub) : null
          updateData.completedByName = await resolveActorDisplayName(prisma, req)
        }

        if (Object.keys(updateData).length === 0) {
          const jobCard = existing
          /* No prisma update — audit not required for no-op PATCH (see eslint-rules/manufacturing-audit.mjs). */
          // eslint-disable-next-line mfg-audit/require-audit-before-mutation-success
          return ok(res, {
            jobCard: {
              ...jobCard,
              otherTechnicians: parseJson(jobCard.otherTechnicians),
              photos: parseJson(jobCard.photos),
              stockUsed: parseJson(jobCard.stockUsed || '[]'),
              materialsBought: parseJson(jobCard.materialsBought || '[]'),
              futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
              timeOfDeparture: formatDate(jobCard.timeOfDeparture),
              timeOfArrival: formatDate(jobCard.timeOfArrival),
              submittedAt: formatDate(jobCard.submittedAt),
              completedAt: formatDate(jobCard.completedAt),
              createdAt: formatDate(jobCard.createdAt),
              updatedAt: formatDate(jobCard.updatedAt)
            }
          })
        }

        const prevStatus = existing.status
        const jobCard = await prisma.jobCard.update({
          where: { id },
          data: updateData
        })

        if (prevStatus !== jobCard.status) {
          await insertJobCardActivity(prisma, {
            jobCardId: id,
            req,
            action: 'status_changed',
            metadata: { from: prevStatus, to: jobCard.status },
            source: 'web'
          })
        }

        let changeRows = buildJobCardUpdateChanges(existing, updateData)
        if (prevStatus !== jobCard.status) {
          changeRows = changeRows.filter((c) => c.field !== 'status')
        }
        // Always log an "updated" row when Prisma persisted changes. The diff builder can
        // legitimately return no rows (normalized equality), but users still expect an activity entry.
        if (Object.keys(updateData).length > 0) {
          await insertJobCardActivity(prisma, {
            jobCardId: id,
            req,
            action: 'updated',
            metadata: {
              fields: Object.keys(updateData),
              status: jobCard.status,
              ...(changeRows.length > 0
                ? { changes: changeRows, changeCount: changeRows.length }
                : {})
            },
            source: 'web'
          })
        }
        auditManufacturing('update', 'job-cards', id, {
          summary: `Updated job card ${jobCard.jobCardNumber}`,
          jobCardNumber: jobCard.jobCardNumber
        })

        return ok(res, { 
          jobCard: {
            ...jobCard,
            otherTechnicians: parseJson(jobCard.otherTechnicians),
            photos: parseJson(jobCard.photos),
            stockUsed: parseJson(jobCard.stockUsed || '[]'),
            materialsBought: parseJson(jobCard.materialsBought || '[]'),
            // Return full ISO strings for datetime fields
            futureWorkScheduledAt: formatDate(jobCard.futureWorkScheduledAt),
            timeOfDeparture: formatDate(jobCard.timeOfDeparture),
            timeOfArrival: formatDate(jobCard.timeOfArrival),
            submittedAt: formatDate(jobCard.submittedAt),
            completedAt: formatDate(jobCard.completedAt),
            createdAt: formatDate(jobCard.createdAt),
            updatedAt: formatDate(jobCard.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to update job card:', error)
        if (error?.message && error.message.includes('must be a finite number >= 0')) {
          return badRequest(res, error.message)
        }
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        if (error.code === 'P2025') {
          return notFound(res, 'Job card not found')
        }
        return serverError(res, 'Failed to update job card', error.message)
      }
    }

    // DELETE (DELETE /api/jobcards/:id)
    if (req.method === 'DELETE' && id) {
      try {
        
        // Check if job card exists first
        const existing = await prisma.jobCard.findUnique({ where: { id } });
        if (!existing) {
          return notFound(res, 'Job card not found');
        }
        if (!canMutateJobCard(existing, req.user)) {
          return forbidden(res, 'You do not have permission to delete this job card');
        }
        
        auditManufacturing('delete', 'job-cards', id, {
          summary: `Deleted job card ${existing.jobCardNumber}`,
          jobCardNumber: existing.jobCardNumber
        })

        await prisma.jobCard.delete({ where: { id } });

        // Return simple deletion confirmation
        return ok(res, { deleted: true, id });
      } catch (error) {
        console.error('❌ Failed to delete job card:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        
        // Check if it's a database connection error
        if (isConnectionError(error)) {
          return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        if (error.code === 'P2025') {
          return notFound(res, 'Job card not found')
        }
        return serverError(res, 'Failed to delete job card', error.message)
      }
    }
  }

  // JOB CARD ACTIVITY (nested resource)
  if (resourceType === 'jobcards' && subResource === 'activity') {
    const activitySub = pathSegments[3]

    if (!id) {
      return badRequest(res, 'Job card id is required')
    }

    if (req.method === 'GET' && !activitySub) {
      try {
        const jc = await prisma.jobCard.findUnique({ where: { id } })
        if (!jc) {
          return notFound(res, 'Job card not found')
        }

        try {
          await ensureMinimumJobCardActivity(prisma, id)
        } catch (baselineErr) {
          console.warn('ensureMinimumJobCardActivity (non-fatal):', baselineErr?.message || baselineErr)
        }

        let orderDir = 'asc'
        try {
          const u = new URL(req.url, 'http://localhost')
          const o = (u.searchParams.get('order') || 'asc').toLowerCase()
          if (o === 'desc') orderDir = 'desc'
        } catch {
          /* default asc */
        }

        const rows = await prisma.jobCardActivity.findMany({
          where: { jobCardId: id },
          orderBy: { createdAt: orderDir },
          take: 500
        })

        const safeActivityCreatedAt = (d) => {
          if (!d) return null
          try {
            const x = d instanceof Date ? d : new Date(d)
            if (Number.isNaN(x.getTime())) return null
            return x.toISOString()
          } catch {
            return null
          }
        }

        const formatted = rows.map(r => ({
          id: r.id,
          jobCardId: r.jobCardId,
          actorUserId: r.actorUserId,
          actorName: r.actorName,
          action: r.action,
          source: r.source,
          metadata: r.metadata,
          createdAt: safeActivityCreatedAt(r.createdAt)
        }))

        return ok(res, { activities: formatted })
      } catch (error) {
        console.error('❌ Failed to list job card activity:', error)
        return serverError(res, 'Failed to list job card activity', error.message)
      }
    }

    if (activitySub === 'sync' && req.method === 'POST') {
      const body = req.body || {}
      try {
        const parentJob = await prisma.jobCard.findUnique({ where: { id } })
        if (!parentJob) {
          return notFound(res, 'Job card not found')
        }
        if (!canMutateJobCard(parentJob, req.user)) {
          return forbidden(res, 'You do not have permission to sync activity for this job card')
        }

        const events = Array.isArray(body.events) ? body.events : []
        let n = 0
        for (const ev of events.slice(0, 300)) {
          if (!ev || typeof ev.action !== 'string' || !ev.action.trim()) continue
          await insertJobCardActivity(prisma, {
            jobCardId: id,
            req,
            action: ev.action.trim(),
            metadata: ev.metadata,
            source: typeof ev.source === 'string' && ev.source ? ev.source : 'sync'
          })
          n += 1
        }

        auditManufacturing('sync', 'job-card-activity', id, {
          summary: `Synced ${n} job card activity event(s)`,
          count: n
        })
        return ok(res, { synced: n })
      } catch (error) {
        console.error('❌ Job card activity sync failed:', error)
        return serverError(res, 'Failed to sync job card activity', error.message)
      }
    }

    return badRequest(res, 'Invalid job card activity endpoint')
  }

  // JOB CARD FORMS (nested resource)
  if (resourceType === 'jobcards' && subResource === 'forms') {
    const formInstanceId = pathSegments[3]

    // LIST INSTANCES FOR A JOBCARD (GET /api/jobcards/:jobCardId/forms)
    if (req.method === 'GET' && id && !formInstanceId) {
      try {
        const instances = await prisma.serviceFormInstance.findMany({
          where: { jobCardId: id },
          orderBy: { createdAt: 'asc' },
          include: {
            template: {
              select: { id: true, name: true, description: true, fields: true, version: true }
            }
          }
        })

        const formatted = instances.map((inst) => ({
          ...inst,
          answers: parseJson(inst.answers, []),
          templateFields: parseJson(inst.template?.fields, [])
        }))

        return ok(res, { forms: formatted })
      } catch (error) {
        if (isMissingServiceFormInstanceTables(error)) {
          console.warn(
            '⚠️ Job card service form tables are missing; returning empty forms list instead of 500.'
          )
          return ok(res, { forms: [] })
        }

        console.error('❌ Failed to list job card forms:', error)
        return serverError(res, 'Failed to list job card forms', error.message)
      }
    }

    // ATTACH TEMPLATE / CREATE INSTANCE (POST /api/jobcards/:jobCardId/forms)
    if (req.method === 'POST' && id && !formInstanceId) {
      const body = req.body || {}
      const templateId = body.templateId

      if (!templateId) {
        return badRequest(res, 'templateId is required')
      }

      try {
        const parentJob = await prisma.jobCard.findUnique({ where: { id } })
        if (!parentJob) {
          return notFound(res, 'Job card not found')
        }
        if (!canMutateJobCard(parentJob, req.user)) {
          return forbidden(res, 'You do not have permission to attach forms to this job card')
        }

        const template = await prisma.serviceFormTemplate.findUnique({
          where: { id: templateId }
        })

        if (!template) {
          return notFound(res, 'Service form template not found')
        }

        const instance = await prisma.serviceFormInstance.create({
          data: {
            jobCardId: id,
            templateId: template.id,
            templateName: template.name,
            templateVersion: template.version,
            status: body.status || 'not_started',
            answers: Array.isArray(body.answers) ? JSON.stringify(body.answers) : body.answers || '[]'
          }
        })

        await insertJobCardActivity(prisma, {
          jobCardId: id,
          req,
          action: 'service_form_attached',
          metadata: { templateId: template.id, instanceId: instance.id },
          source: 'web'
        })
        auditManufacturing('create', 'job-card-service-form', instance.id, {
          summary: `Attached form ${template.name} to job card ${parentJob.jobCardNumber}`,
          jobCardId: id
        })

        return created(res, {
          form: {
            ...instance,
            answers: parseJson(instance.answers, [])
          }
        })
      } catch (error) {
        if (isMissingServiceFormInstanceTables(error)) {
          console.warn(
            '⚠️ Job card service form tables are missing; cannot attach forms in this environment.'
          )
          return serverError(
            res,
            'Job card forms feature is not available in this environment',
            'SERVICE_FORMS_TABLE_MISSING'
          )
        }

        console.error('❌ Failed to attach form to job card:', error)
        return serverError(res, 'Failed to attach form to job card', error.message)
      }
    }

    // UPDATE INSTANCE (PATCH /api/jobcards/:jobCardId/forms/:formInstanceId)
    if (req.method === 'PATCH' && id && formInstanceId) {
      const body = req.body || {}

      try {
        const existing = await prisma.serviceFormInstance.findUnique({
          where: { id: formInstanceId }
        })

        if (!existing || existing.jobCardId !== id) {
          return notFound(res, 'Job card form not found')
        }

        const parentJob = await prisma.jobCard.findUnique({ where: { id } })
        if (!parentJob) {
          return notFound(res, 'Job card not found')
        }
        if (!canMutateJobCard(parentJob, req.user)) {
          return forbidden(res, 'You do not have permission to update forms on this job card')
        }

        const data = {}

        if (body.status !== undefined) data.status = body.status
        if (body.answers !== undefined) {
          data.answers = Array.isArray(body.answers)
            ? JSON.stringify(body.answers)
            : body.answers
        }
        if (body.completedAt !== undefined) {
          data.completedAt = body.completedAt ? new Date(body.completedAt) : null
        }

        const updated = await prisma.serviceFormInstance.update({
          where: { id: formInstanceId },
          data
        })

        const formChanges = buildServiceFormInstanceChanges(existing, data)
        await insertJobCardActivity(prisma, {
          jobCardId: id,
          req,
          action: 'service_form_updated',
          metadata: {
            instanceId: formInstanceId,
            templateId: existing.templateId,
            templateName: existing.templateName,
            fields: Object.keys(data),
            changes: formChanges,
            changeCount: formChanges.length
          },
          source: 'web'
        })
        auditManufacturing('update', 'job-card-service-form', formInstanceId, {
          summary: `Updated service form on job card ${parentJob.jobCardNumber}`,
          jobCardId: id
        })

        return ok(res, {
          form: {
            ...updated,
            answers: parseJson(updated.answers, [])
          }
        })
      } catch (error) {
        if (isMissingServiceFormInstanceTables(error)) {
          console.warn(
            '⚠️ Job card service form tables are missing; cannot update forms in this environment.'
          )
          return serverError(
            res,
            'Job card forms feature is not available in this environment',
            'SERVICE_FORMS_TABLE_MISSING'
          )
        }

        console.error('❌ Failed to update job card form:', error)
        return serverError(res, 'Failed to update job card form', error.message)
      }
    }

    return badRequest(res, 'Invalid job card forms endpoint')
  }

  // JOB CARD PHOTOS (GET /api/jobcards/:id/photos) — attachments JSON only (split from GET one for performance)
  if (resourceType === 'jobcards' && subResource === 'photos' && id) {
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }
    try {
      const row = await prisma.jobCard.findUnique({
        where: { id },
        select: { id: true, photos: true }
      })
      if (!row) {
        return notFound(res, 'Job card not found')
      }
      return ok(res, {
        jobCardId: id,
        photos: parseJson(row.photos)
      })
    } catch (error) {
      console.error('❌ Failed to get job card photos:', error)
      if (isConnectionError(error)) {
        return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
      }
      return serverError(res, 'Failed to get job card photos', error.message)
    }
  }

  return badRequest(res, 'Invalid job cards endpoint')
}

export default authRequired(handler)

