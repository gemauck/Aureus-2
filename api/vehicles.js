// Vehicles API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const urlPath = req.url.split('?')[0].split('#')[0]
    let pathSegments = urlPath.split('/').filter(Boolean)
    if (pathSegments[0] === 'api') {
      pathSegments = pathSegments.slice(1)
    }
    const id = req.params?.id || pathSegments[pathSegments.length - 1]

    // List Vehicles (GET /api/vehicles)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'vehicles') {
      try {
        const vehicles = await prisma.vehicle.findMany({
          where: {
            status: 'active' // Only return active vehicles by default
          },
          orderBy: { name: 'asc' }
        })
        console.log('✅ Vehicles retrieved successfully:', vehicles.length)
        return ok(res, { vehicles })
      } catch (dbError) {
        console.error('❌ Database error listing vehicles:', dbError)
        return serverError(res, 'Failed to list vehicles', dbError.message)
      }
    }

    // Get Vehicle by ID (GET /api/vehicles/:id)
    if (req.method === 'GET' && id && pathSegments[0] === 'vehicles') {
      try {
        const vehicle = await prisma.vehicle.findUnique({
          where: { id }
        })
        if (!vehicle) {
          return notFound(res, 'Vehicle not found')
        }
        return ok(res, { vehicle })
      } catch (dbError) {
        console.error('❌ Database error getting vehicle:', dbError)
        return serverError(res, 'Failed to get vehicle', dbError.message)
      }
    }

    // Create Vehicle (POST /api/vehicles) - Admin only
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'vehicles') {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return badRequest(res, 'Only admins can create vehicles')
      }

      const body = await parseJsonBody(req)
      const { name, model, type, reg, assetNumber, notes, status } = body

      if (!name || !reg) {
        return badRequest(res, 'Vehicle name and registration number are required')
      }

      try {
        // Check if registration already exists
        const existing = await prisma.vehicle.findUnique({
          where: { reg }
        })
        if (existing) {
          return badRequest(res, 'Vehicle with this registration number already exists')
        }

        const vehicle = await prisma.vehicle.create({
          data: {
            name,
            model: model || '',
            type: type || '',
            reg,
            assetNumber: assetNumber || '',
            status: status || 'active',
            notes: notes || '',
            ownerId: req.user.id
          }
        })
        console.log('✅ Vehicle created successfully:', vehicle.id)
        return created(res, { vehicle })
      } catch (dbError) {
        console.error('❌ Database error creating vehicle:', dbError)
        return serverError(res, 'Failed to create vehicle', dbError.message)
      }
    }

    // Update Vehicle (PATCH /api/vehicles/:id) - Admin only
    if (req.method === 'PATCH' && id && pathSegments[0] === 'vehicles') {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return badRequest(res, 'Only admins can update vehicles')
      }

      const body = await parseJsonBody(req)
      const { name, model, type, reg, assetNumber, notes, status } = body

      try {
        const existing = await prisma.vehicle.findUnique({
          where: { id }
        })
        if (!existing) {
          return notFound(res, 'Vehicle not found')
        }

        // Check if reg is being changed and if new reg already exists
        if (reg && reg !== existing.reg) {
          const regExists = await prisma.vehicle.findUnique({
            where: { reg }
          })
          if (regExists) {
            return badRequest(res, 'Vehicle with this registration number already exists')
          }
        }

        const vehicle = await prisma.vehicle.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(model !== undefined && { model }),
            ...(type !== undefined && { type }),
            ...(reg !== undefined && { reg }),
            ...(assetNumber !== undefined && { assetNumber }),
            ...(notes !== undefined && { notes }),
            ...(status !== undefined && { status })
          }
        })
        console.log('✅ Vehicle updated successfully:', vehicle.id)
        return ok(res, { vehicle })
      } catch (dbError) {
        console.error('❌ Database error updating vehicle:', dbError)
        return serverError(res, 'Failed to update vehicle', dbError.message)
      }
    }

    // Delete Vehicle (DELETE /api/vehicles/:id) - Admin only
    if (req.method === 'DELETE' && id && pathSegments[0] === 'vehicles') {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return badRequest(res, 'Only admins can delete vehicles')
      }

      try {
        const vehicle = await prisma.vehicle.findUnique({
          where: { id },
          include: {
            jobCards: {
              take: 1
            }
          }
        })
        if (!vehicle) {
          return notFound(res, 'Vehicle not found')
        }

        // Check if vehicle is used in any job cards
        if (vehicle.jobCards.length > 0) {
          // Instead of deleting, mark as inactive
          const updated = await prisma.vehicle.update({
            where: { id },
            data: { status: 'inactive' }
          })
          return ok(res, { vehicle: updated, message: 'Vehicle marked as inactive (cannot delete vehicles with job cards)' })
        }

        await prisma.vehicle.delete({
          where: { id }
        })
        console.log('✅ Vehicle deleted successfully:', id)
        return ok(res, { message: 'Vehicle deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting vehicle:', dbError)
        return serverError(res, 'Failed to delete vehicle', dbError.message)
      }
    }

    return notFound(res, 'Endpoint not found')
  } catch (error) {
    console.error('❌ Vehicles API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withLogging(withHttp(authRequired(handler)))

