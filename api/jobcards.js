import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError } from './_lib/response.js'

async function handler(req, res) {
  const urlPath = req.url.replace(/^\/api\//, '/')
  const pathSegments = urlPath.split('/').filter(Boolean)
  const resourceType = pathSegments[1] // jobcards
  const id = pathSegments[2]

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
    if (date instanceof Date) return date.toISOString().split('T')[0]
    return new Date(date).toISOString().split('T')[0]
  }

  // JOB CARDS
  if (resourceType === 'jobcards') {
    // LIST (GET /api/jobcards)
    if (req.method === 'GET' && !id) {
      try {
        const owner = req.user?.sub
        const jobCards = await prisma.jobCard.findMany({
          orderBy: { createdAt: 'desc' }
        })
        console.log('📋 List job cards', { owner, count: jobCards.length })
        
        // Format dates for response
        const formatted = jobCards.map(jobCard => ({
          ...jobCard,
          otherTechnicians: parseJson(jobCard.otherTechnicians),
          photos: parseJson(jobCard.photos),
          timeOfDeparture: formatDate(jobCard.timeOfDeparture),
          timeOfArrival: formatDate(jobCard.timeOfArrival),
          submittedAt: formatDate(jobCard.submittedAt),
          completedAt: formatDate(jobCard.completedAt),
          createdAt: formatDate(jobCard.createdAt),
          updatedAt: formatDate(jobCard.updatedAt)
        }))
        
        return ok(res, { jobCards: formatted })
      } catch (error) {
        console.error('❌ Failed to list job cards:', error)
        return serverError(res, 'Failed to list job cards', error.message)
      }
    }

    // GET ONE (GET /api/jobcards/:id)
    if (req.method === 'GET' && id) {
      try {
        const jobCard = await prisma.jobCard.findUnique({
          where: { id }
        })
        
        if (!jobCard) {
          return notFound(res, 'Job card not found')
        }
        
        return ok(res, { 
          jobCard: {
            ...jobCard,
            otherTechnicians: parseJson(jobCard.otherTechnicians),
            photos: parseJson(jobCard.photos),
            timeOfDeparture: formatDate(jobCard.timeOfDeparture),
            timeOfArrival: formatDate(jobCard.timeOfArrival),
            submittedAt: formatDate(jobCard.submittedAt),
            completedAt: formatDate(jobCard.completedAt),
            createdAt: formatDate(jobCard.createdAt),
            updatedAt: formatDate(jobCard.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get job card:', error)
        return serverError(res, 'Failed to get job card', error.message)
      }
    }

    // CREATE (POST /api/jobcards)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      try {
        // Generate sequential job card number (JC0001, JC0002, etc.)
        const lastJobCard = await prisma.jobCard.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { jobCardNumber: true }
        })
        
        let nextNumber = 1
        if (lastJobCard?.jobCardNumber?.startsWith('JC')) {
          const match = lastJobCard.jobCardNumber.match(/JC(\d+)/)
          if (match) {
            nextNumber = parseInt(match[1]) + 1
          }
        }
        const jobCardNumber = `JC${String(nextNumber).padStart(4, '0')}`
        
        // Parse JSON fields
        const otherTechnicians = Array.isArray(body.otherTechnicians) 
          ? JSON.stringify(body.otherTechnicians) 
          : body.otherTechnicians || '[]'
        const photos = Array.isArray(body.photos) 
          ? JSON.stringify(body.photos) 
          : body.photos || '[]'
        
        // Calculate travel kilometers
        const kmBefore = parseFloat(body.kmReadingBefore) || 0
        const kmAfter = parseFloat(body.kmReadingAfter) || 0
        const travelKilometers = Math.max(0, kmAfter - kmBefore)
        
        const jobCard = await prisma.jobCard.create({
          data: {
            jobCardNumber,
            agentName: body.agentName || '',
            otherTechnicians,
            clientId: body.clientId || null,
            clientName: body.clientName || '',
            siteId: body.siteId || '',
            siteName: body.siteName || '',
            location: body.location || '',
            timeOfDeparture: body.timeOfDeparture ? new Date(body.timeOfDeparture) : null,
            timeOfArrival: body.timeOfArrival ? new Date(body.timeOfArrival) : null,
            vehicleUsed: body.vehicleUsed || '',
            kmReadingBefore: kmBefore,
            kmReadingAfter: kmAfter,
            travelKilometers,
            reasonForVisit: body.reasonForVisit || '',
            diagnosis: body.diagnosis || '',
            otherComments: body.otherComments || '',
            photos,
            status: body.status || 'draft',
            submittedAt: body.submittedAt ? new Date(body.submittedAt) : null,
            completedAt: body.completedAt ? new Date(body.completedAt) : null,
            ownerId: req.user?.sub || null
          }
        })
        
        console.log('✅ Created job card:', jobCard.id)
        return created(res, { 
          jobCard: {
            ...jobCard,
            otherTechnicians: parseJson(jobCard.otherTechnicians),
            photos: parseJson(jobCard.photos),
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
        if (body.timeOfDeparture !== undefined) updateData.timeOfDeparture = body.timeOfDeparture ? new Date(body.timeOfDeparture) : null
        if (body.timeOfArrival !== undefined) updateData.timeOfArrival = body.timeOfArrival ? new Date(body.timeOfArrival) : null
        if (body.vehicleUsed !== undefined) updateData.vehicleUsed = body.vehicleUsed
        if (body.kmReadingBefore !== undefined) updateData.kmReadingBefore = parseFloat(body.kmReadingBefore) || 0
        if (body.kmReadingAfter !== undefined) updateData.kmReadingAfter = parseFloat(body.kmReadingAfter) || 0
        if (body.reasonForVisit !== undefined) updateData.reasonForVisit = body.reasonForVisit
        if (body.diagnosis !== undefined) updateData.diagnosis = body.diagnosis
        if (body.otherComments !== undefined) updateData.otherComments = body.otherComments
        if (body.photos !== undefined) {
          updateData.photos = Array.isArray(body.photos) 
            ? JSON.stringify(body.photos) 
            : body.photos
        }
        if (body.status !== undefined) updateData.status = body.status
        if (body.submittedAt !== undefined) updateData.submittedAt = body.submittedAt ? new Date(body.submittedAt) : null
        if (body.completedAt !== undefined) updateData.completedAt = body.completedAt ? new Date(body.completedAt) : null
        
        // Recalculate travel kilometers if readings changed
        if (body.kmReadingBefore !== undefined || body.kmReadingAfter !== undefined) {
          const kmBefore = body.kmReadingBefore !== undefined ? parseFloat(body.kmReadingBefore) || 0 : existing.kmReadingBefore
          const kmAfter = body.kmReadingAfter !== undefined ? parseFloat(body.kmReadingAfter) || 0 : existing.kmReadingAfter
          updateData.travelKilometers = Math.max(0, kmAfter - kmBefore)
        }
        
        const jobCard = await prisma.jobCard.update({
          where: { id },
          data: updateData
        })
        
        console.log('✅ Updated job card:', id)
        return ok(res, { 
          jobCard: {
            ...jobCard,
            otherTechnicians: parseJson(jobCard.otherTechnicians),
            photos: parseJson(jobCard.photos),
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
        if (error.code === 'P2025') {
          return notFound(res, 'Job card not found')
        }
        return serverError(res, 'Failed to update job card', error.message)
      }
    }

    // DELETE (DELETE /api/jobcards/:id)
    if (req.method === 'DELETE' && id) {
      try {
        await prisma.jobCard.delete({ where: { id } })
        console.log('✅ Deleted job card:', id)
        return ok(res, { deleted: true })
      } catch (error) {
        console.error('❌ Failed to delete job card:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Job card not found')
        }
        return serverError(res, 'Failed to delete job card', error.message)
      }
    }
  }

  return badRequest(res, 'Invalid job cards endpoint')
}

export default authRequired(handler)

