// Public GET/PATCH for job cards created via /job-card (no auth; id acts as capability URL).
// Prefer authenticated /api/jobcards/:id when the user has permission.
import { prisma } from '../_lib/prisma.js'
import { ok, serverError, badRequest, notFound } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

function parseJson(str, defaultValue = []) {
  try {
    if (!str) return defaultValue
    return typeof str === 'string' ? JSON.parse(str) : str
  } catch {
    return defaultValue
  }
}

function formatDate(date) {
  if (!date) return null
  if (date instanceof Date) return date.toISOString()
  return new Date(date).toISOString()
}

async function handler(req, res) {
  const id = req.params?.id
  if (!id || typeof id !== 'string') {
    return badRequest(res, 'Job card id is required')
  }

  if (req.method === 'GET') {
    try {
      const jobCard = await prisma.jobCard.findUnique({
        where: { id }
      })
      if (!jobCard) {
        return notFound(res, 'Job card not found')
      }
      if (jobCard.ownerId) {
        return notFound(res, 'Job card not found')
      }
      return ok(res, {
        jobCard: {
          ...jobCard,
          otherTechnicians: parseJson(jobCard.otherTechnicians),
          photos: parseJson(jobCard.photos),
          stockUsed: parseJson(jobCard.stockUsed || '[]'),
          materialsBought: parseJson(jobCard.materialsBought || '[]'),
          timeOfDeparture: formatDate(jobCard.timeOfDeparture),
          timeOfArrival: formatDate(jobCard.timeOfArrival),
          submittedAt: formatDate(jobCard.submittedAt),
          completedAt: formatDate(jobCard.completedAt),
          createdAt: formatDate(jobCard.createdAt),
          updatedAt: formatDate(jobCard.updatedAt)
        }
      })
    } catch (error) {
      console.error('❌ Public job card GET error:', error)
      return serverError(res, 'Failed to get job card', error.message)
    }
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const existing = await prisma.jobCard.findUnique({ where: { id } })
    if (!existing) {
      return notFound(res, 'Job card not found')
    }

    const body = req.body || {}

    const otherTechnicians = Array.isArray(body.otherTechnicians)
      ? JSON.stringify(body.otherTechnicians)
      : body.otherTechnicians !== undefined
        ? typeof body.otherTechnicians === 'string'
          ? body.otherTechnicians
          : JSON.stringify(parseJson(body.otherTechnicians, []))
        : undefined

    const photos =
      body.photos !== undefined
        ? Array.isArray(body.photos)
          ? JSON.stringify(body.photos)
          : typeof body.photos === 'string'
            ? body.photos
            : JSON.stringify(parseJson(body.photos, []))
        : undefined

    const stockUsed =
      body.stockUsed !== undefined
        ? Array.isArray(body.stockUsed)
          ? JSON.stringify(body.stockUsed)
          : typeof body.stockUsed === 'string'
            ? body.stockUsed
            : JSON.stringify(parseJson(body.stockUsed, []))
        : undefined

    const materialsBought =
      body.materialsBought !== undefined
        ? Array.isArray(body.materialsBought)
          ? JSON.stringify(body.materialsBought)
          : typeof body.materialsBought === 'string'
            ? body.materialsBought
            : JSON.stringify(parseJson(body.materialsBought, []))
        : undefined

    const kmBefore =
      body.kmReadingBefore !== undefined
        ? parseFloat(body.kmReadingBefore) || 0
        : existing.kmReadingBefore
    const kmAfter =
      body.kmReadingAfter !== undefined ? parseFloat(body.kmReadingAfter) || 0 : existing.kmReadingAfter
    const travelKilometers = Math.max(0, kmAfter - kmBefore)

    const lat =
      body.locationLatitude != null && body.locationLatitude !== ''
        ? String(body.locationLatitude)
        : body.latitude != null && body.latitude !== ''
          ? String(body.latitude)
          : undefined
    const lng =
      body.locationLongitude != null && body.locationLongitude !== ''
        ? String(body.locationLongitude)
        : body.longitude != null && body.longitude !== ''
          ? String(body.longitude)
          : undefined

    let totalMaterialsCost = existing.totalMaterialsCost
    if (body.materialsBought !== undefined) {
      const mats = Array.isArray(body.materialsBought)
        ? body.materialsBought
        : parseJson(body.materialsBought || '[]')
      totalMaterialsCost = mats.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0)
    } else if (body.totalMaterialsCost !== undefined) {
      totalMaterialsCost = parseFloat(body.totalMaterialsCost) || 0
    }

    let otherCommentsUpdate
    if (
      body.otherComments !== undefined ||
      body.customerName !== undefined ||
      body.customerPosition !== undefined ||
      body.customerFeedback !== undefined ||
      body.customerSignature !== undefined
    ) {
      otherCommentsUpdate = [
        body.otherComments != null ? String(body.otherComments) : '',
        body.customerName ? `Customer: ${body.customerName}` : '',
        body.customerPosition ? `Position: ${body.customerPosition}` : '',
        body.customerFeedback ? `Feedback: ${body.customerFeedback}` : '',
        body.customerSignature ? `Signature: [Captured]` : ''
      ]
        .filter(Boolean)
        .join('\n')
    }

    const data = {}

    if (body.agentName !== undefined) data.agentName = body.agentName
    if (otherTechnicians !== undefined) data.otherTechnicians = otherTechnicians
    if (body.clientId !== undefined) {
      data.clientId =
        !body.clientId || body.clientId === 'NO_CLIENT' ? null : String(body.clientId)
    }
    if (body.clientName !== undefined) data.clientName = body.clientName
    if (body.siteId !== undefined) data.siteId = body.siteId
    if (body.siteName !== undefined) data.siteName = body.siteName
    if (body.location !== undefined) data.location = body.location
    if (lat !== undefined) data.locationLatitude = lat
    if (lng !== undefined) data.locationLongitude = lng
    if (body.timeOfDeparture !== undefined) {
      data.timeOfDeparture = body.timeOfDeparture ? new Date(body.timeOfDeparture) : null
    }
    if (body.timeOfArrival !== undefined) {
      data.timeOfArrival = body.timeOfArrival ? new Date(body.timeOfArrival) : null
    }
    if (body.vehicleUsed !== undefined) data.vehicleUsed = body.vehicleUsed
    if (body.kmReadingBefore !== undefined) data.kmReadingBefore = parseFloat(body.kmReadingBefore) || 0
    if (body.kmReadingAfter !== undefined) data.kmReadingAfter = parseFloat(body.kmReadingAfter) || 0
    data.travelKilometers = travelKilometers
    if (body.reasonForVisit !== undefined) data.reasonForVisit = body.reasonForVisit
    if (body.diagnosis !== undefined) data.diagnosis = body.diagnosis
    if (body.actionsTaken !== undefined) data.actionsTaken = body.actionsTaken
    if (stockUsed !== undefined) data.stockUsed = stockUsed
    if (materialsBought !== undefined) data.materialsBought = materialsBought
    data.totalMaterialsCost = totalMaterialsCost
    if (otherCommentsUpdate !== undefined) data.otherComments = otherCommentsUpdate
    if (photos !== undefined) data.photos = photos
    if (body.status !== undefined) data.status = body.status
    if (body.submittedAt !== undefined) {
      data.submittedAt = body.submittedAt ? new Date(body.submittedAt) : null
    }
    if (body.completedAt !== undefined) {
      data.completedAt = body.completedAt ? new Date(body.completedAt) : null
    }

    const updated = await prisma.jobCard.update({
      where: { id },
      data
    })

    return ok(res, {
      jobCard: {
        id: updated.id,
        jobCardNumber: updated.jobCardNumber,
        agentName: updated.agentName,
        clientName: updated.clientName,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      }
    })
  } catch (error) {
    console.error('❌ Public job card PATCH error:', error)
    return serverError(res, 'Failed to update job card', error.message)
  }
}

export default withHttp(handler)
