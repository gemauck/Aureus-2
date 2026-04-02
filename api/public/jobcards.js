// Public API: create job cards (POST) and list prior cards by id (GET ?ids=) — no auth
import { prisma } from '../_lib/prisma.js'
import { ok, created, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

function formatDate(date) {
  if (!date) return null
  if (date instanceof Date) return date.toISOString()
  return new Date(date).toISOString()
}

/** GET /api/public/jobcards?ids=id1,id2 — only unowned cards whose ids are requested (capability URLs). */
async function handleGetList(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost')
    const idsParam = url.searchParams.get('ids') || ''
    const ids = [...new Set(
      idsParam
        .split(',')
        .map(s => s.trim())
        .filter(id => typeof id === 'string' && id.length > 0 && id.length <= 64)
    )].slice(0, 100)

    if (ids.length === 0) {
      return ok(res, { jobCards: [] })
    }

    const jobCards = await prisma.jobCard.findMany({
      where: {
        id: { in: ids },
        ownerId: null
      },
      select: {
        id: true,
        jobCardNumber: true,
        agentName: true,
        clientId: true,
        clientName: true,
        siteName: true,
        status: true,
        reasonForVisit: true,
        diagnosis: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    })

    const formatted = jobCards.map(jc => ({
      ...jc,
      createdAt: formatDate(jc.createdAt),
      updatedAt: formatDate(jc.updatedAt)
    }))

    return ok(res, { jobCards: formatted })
  } catch (error) {
    console.error('❌ Public job cards GET list error:', error)
    return serverError(res, 'Failed to list job cards', error.message)
  }
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

async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGetList(req, res)
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    
    const body = req.body || {}
    
    // Helper to parse JSON fields
    const parseJson = (str, defaultValue = []) => {
      try {
        if (!str) return defaultValue
        return typeof str === 'string' ? JSON.parse(str) : str
      } catch {
        return defaultValue
      }
    }

    // Parse and prepare data
    const otherTechnicians = parseJson(body.otherTechnicians, [])
    const stockUsed = parseJson(body.stockUsed, [])
    const materialsBought = parseJson(body.materialsBought, [])
    const photos = parseJson(body.photos, [])
    const serviceForms = parseJson(body.serviceForms, [])
    
    const kmBefore = parseFloat(body.kmReadingBefore) || 0
    const kmAfter = parseFloat(body.kmReadingAfter) || 0
    const travelKilometers = Math.max(0, kmAfter - kmBefore)
    
    const totalMaterialsCost = materialsBought && materialsBought.length > 0
      ? materialsBought.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0)
      : parseFloat(body.totalMaterialsCost) || 0

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

    const buildCreateArgs = jobCardNumber => ({
      data: {
        jobCardNumber,
        agentName: body.agentName || '',
        otherTechnicians: JSON.stringify(otherTechnicians),
        clientId:
          !body.clientId || body.clientId === 'NO_CLIENT' ? null : String(body.clientId),
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
        diagnosis: body.diagnosis || '',
        futureWorkRequired: body.futureWorkRequired || '',
        futureWorkScheduledAt: body.futureWorkScheduledAt ? new Date(body.futureWorkScheduledAt) : null,
        actionsTaken: body.actionsTaken || '',
        stockUsed: JSON.stringify(stockUsed),
        materialsBought: JSON.stringify(materialsBought),
        totalMaterialsCost,
        photos: JSON.stringify(photos),
        // Store customer signature and details in otherComments
        otherComments: [
          body.otherComments || '',
          body.customerName ? `Customer: ${body.customerName}` : '',
          body.customerPosition ? `Position: ${body.customerPosition}` : '',
          body.customerFeedback ? `Feedback: ${body.customerFeedback}` : '',
          body.customerSignature ? `Signature: [Captured]` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        status: body.status || 'draft',
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
        ownerId: null // Public form - no owner
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

    // Create service form instances if provided
    if (serviceForms.length > 0) {
      try {
        for (const formData of serviceForms) {
          if (!formData.templateId) continue

          // Verify template exists
          const template = await prisma.serviceFormTemplate.findUnique({
            where: { id: formData.templateId }
          })

          if (!template) {
            console.warn(`⚠️ Template ${formData.templateId} not found, skipping form instance`)
            continue
          }

          // Convert answers object to array format
          const answersArray = Object.entries(formData.answers || {}).map(([fieldId, value]) => ({
            fieldId,
            value: String(value || '')
          }))

          await prisma.serviceFormInstance.create({
            data: {
              jobCardId: jobCard.id,
              templateId: formData.templateId,
              templateName: formData.templateName || template.name,
              templateVersion: formData.templateVersion || template.version || 1,
              status: 'completed', // Mark as completed since it was submitted with the job card
              answers: JSON.stringify(answersArray),
              completedAt: new Date()
            }
          })

        }
      } catch (formError) {
        // Log but don't fail the job card creation if form instances fail
        console.error('⚠️ Error creating service form instances:', formError)
      }
    }
    
    return created(res, { 
      jobCard: {
        id: jobCard.id,
        jobCardNumber: jobCard.jobCardNumber,
        agentName: jobCard.agentName,
        clientName: jobCard.clientName,
        status: jobCard.status,
        createdAt: jobCard.createdAt
      }
    })
  } catch (error) {
    console.error('❌ Public job card endpoint error:', error)
    return serverError(res, 'Failed to create job card', error.message)
  }
}

export default withHttp(handler)

