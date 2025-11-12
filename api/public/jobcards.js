// Public API endpoint for job card form - creates job cards without authentication
import { prisma } from '../_lib/prisma.js'
import { created, serverError, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('📡 Public job card endpoint: Creating job card from public form...')
    
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

    // Generate job card number
    const lastJobCard = await prisma.jobCard.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { jobCardNumber: true }
    })
    
    let jobCardNumber = 'JC0001'
    if (lastJobCard?.jobCardNumber) {
      const match = lastJobCard.jobCardNumber.match(/JC(\d+)/)
      if (match) {
        const num = parseInt(match[1], 10) + 1
        jobCardNumber = `JC${String(num).padStart(4, '0')}`
      }
    }

    // Parse and prepare data
    const otherTechnicians = parseJson(body.otherTechnicians, [])
    const stockUsed = parseJson(body.stockUsed, [])
    const materialsBought = parseJson(body.materialsBought, [])
    const photos = parseJson(body.photos, [])
    
    const kmBefore = parseFloat(body.kmReadingBefore) || 0
    const kmAfter = parseFloat(body.kmReadingAfter) || 0
    const travelKilometers = Math.max(0, kmAfter - kmBefore)
    
    const totalMaterialsCost = materialsBought && materialsBought.length > 0
      ? materialsBought.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0)
      : parseFloat(body.totalMaterialsCost) || 0

    // Create job card
    const jobCard = await prisma.jobCard.create({
      data: {
        jobCardNumber,
        agentName: body.agentName || '',
        otherTechnicians: JSON.stringify(otherTechnicians),
        clientId: body.clientId || null,
        clientName: body.clientName || '',
        siteId: body.siteId || '',
        siteName: body.siteName || '',
        location: body.location || '',
        locationLatitude: body.latitude || '',
        locationLongitude: body.longitude || '',
        timeOfDeparture: body.timeOfDeparture ? new Date(body.timeOfDeparture) : null,
        timeOfArrival: body.timeOfArrival ? new Date(body.timeOfArrival) : null,
        vehicleUsed: body.vehicleUsed || '',
        kmReadingBefore: kmBefore,
        kmReadingAfter: kmAfter,
        travelKilometers,
        reasonForVisit: body.reasonForVisit || '',
        diagnosis: body.diagnosis || '',
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
          body.customerSignature ? `Signature: [Captured]` : ''
        ].filter(Boolean).join('\n'),
        status: body.status || 'draft',
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
        ownerId: null // Public form - no owner
      }
    })
    
    console.log(`✅ Public job card endpoint: Created job card ${jobCard.id} (${jobCardNumber})`)
    
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

