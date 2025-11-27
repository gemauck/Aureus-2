import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError } from './_lib/response.js'

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

async function handler(req, res) {
  // Strip query parameters before splitting
  const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
  const pathSegments = urlPath.split('/').filter(Boolean)
  const resourceType = pathSegments[0] // jobcards (direct endpoint, not nested like /api/manufacturing/*)
  const id = pathSegments[1]
  const subResource = pathSegments[2]

  // Helper to read pagination params from the query string
  const getPagination = () => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const rawPage = parseInt(url.searchParams.get('page') || '1', 10)
      const rawPageSize = parseInt(url.searchParams.get('pageSize') || '50', 10)

      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
      // Keep page size within a safe range to avoid overloading the dashboard
      let pageSize =
        Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 50
      pageSize = Math.max(10, Math.min(pageSize, 100))

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
        const { page, pageSize } = getPagination()
        const owner = req.user?.sub
        // Limit the number of job cards returned and support simple pagination
        // to keep the dashboard fast even as history grows.
        const [totalItems, jobCards] = await Promise.all([
          prisma.jobCard.count(),
          prisma.jobCard.findMany({
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize
          })
        ])

        console.log('📋 List job cards', {
          owner,
          count: jobCards.length,
          page,
          pageSize,
          totalItems
        })
        
        // Format dates for response
        const formatted = jobCards.map(jobCard => ({
          ...jobCard,
          otherTechnicians: parseJson(jobCard.otherTechnicians),
          photos: parseJson(jobCard.photos),
          stockUsed: parseJson(jobCard.stockUsed || '[]'),
          materialsBought: parseJson(jobCard.materialsBought || '[]'),
          // Return full ISO strings for datetime fields (component needs them for datetime-local inputs)
          timeOfDeparture: formatDate(jobCard.timeOfDeparture),
          timeOfArrival: formatDate(jobCard.timeOfArrival),
          submittedAt: formatDate(jobCard.submittedAt),
          completedAt: formatDate(jobCard.completedAt),
          createdAt: formatDate(jobCard.createdAt),
          updatedAt: formatDate(jobCard.updatedAt)
        }))
        
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
            stockUsed: parseJson(jobCard.stockUsed || '[]'),
            materialsBought: parseJson(jobCard.materialsBought || '[]'),
            // Return full ISO strings for datetime fields
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
        const stockUsed = Array.isArray(body.stockUsed) 
          ? JSON.stringify(body.stockUsed) 
          : body.stockUsed || '[]'
        const materialsBought = Array.isArray(body.materialsBought) 
          ? JSON.stringify(body.materialsBought) 
          : body.materialsBought || '[]'
        
        // Calculate travel kilometers
        const kmBefore = parseFloat(body.kmReadingBefore) || 0
        const kmAfter = parseFloat(body.kmReadingAfter) || 0
        const travelKilometers = Math.max(0, kmAfter - kmBefore)
        
        // Calculate total materials cost
        const totalMaterialsCost = Array.isArray(body.materialsBought) 
          ? body.materialsBought.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0)
          : parseFloat(body.totalMaterialsCost) || 0
        
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
            actionsTaken: body.actionsTaken || '',
            stockUsed,
            materialsBought,
            totalMaterialsCost,
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
            stockUsed: parseJson(jobCard.stockUsed || '[]'),
            materialsBought: parseJson(jobCard.materialsBought || '[]'),
            // Return full ISO strings for datetime fields
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
          updateData.totalMaterialsCost = parseFloat(body.totalMaterialsCost) || 0
        }
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
        
        // Recalculate total materials cost if materials changed
        if (body.materialsBought !== undefined) {
          const materials = Array.isArray(body.materialsBought) ? body.materialsBought : parseJson(body.materialsBought || '[]')
          updateData.totalMaterialsCost = materials.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0)
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
            stockUsed: parseJson(jobCard.stockUsed || '[]'),
            materialsBought: parseJson(jobCard.materialsBought || '[]'),
            // Return full ISO strings for datetime fields
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
        console.log('🗑️ DELETE request received for job card:', id);
        console.log('🗑️ Request method:', req.method);
        console.log('🗑️ Request URL:', req.url);
        
        // Check if job card exists first
        const existing = await prisma.jobCard.findUnique({ where: { id } });
        if (!existing) {
          console.log('⚠️ Job card not found:', id);
          return notFound(res, 'Job card not found');
        }
        
        console.log('🗑️ Found job card, deleting:', id);
        await prisma.jobCard.delete({ where: { id } });
        console.log('✅ Deleted job card:', id);
        
        // Return simple deletion confirmation
        return ok(res, { deleted: true, id });
      } catch (error) {
        console.error('❌ Failed to delete job card:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        if (error.code === 'P2025') {
          return notFound(res, 'Job card not found')
        }
        return serverError(res, 'Failed to delete job card', error.message)
      }
    }
  }

  // JOB CARD FORMS (nested resource)
  if (resourceType === 'jobcards' && subResource === 'forms') {
    const formInstanceId = pathSegments[3]

    // LIST INSTANCES FOR A JOBCARD (GET /api/jobcards/:jobCardId/forms)
    if (req.method === 'GET' && id && !formInstanceId) {
      try {
        const instances = await prisma.serviceFormInstance.findMany({
          where: { jobCardId: id },
          orderBy: { createdAt: 'asc' }
        })

        const formatted = instances.map((inst) => ({
          ...inst,
          answers: parseJson(inst.answers, [])
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

  return badRequest(res, 'Invalid job cards endpoint')
}

export default authRequired(handler)

