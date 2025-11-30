// Public API endpoint for job card form - returns stock locations without authentication
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    
    // Get all active stock locations
    const locations = await prisma.stockLocation.findMany({
      where: {
        status: {
          not: 'inactive'
        }
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    
    return ok(res, {
      locations: locations,
      count: locations.length
    })
  } catch (error) {
    console.error('❌ Public locations endpoint error:', error)
    return serverError(res, 'Failed to fetch locations', error.message)
  }
}

export default withHttp(handler)

