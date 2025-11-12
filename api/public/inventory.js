// Public API endpoint for job card form - returns inventory items without authentication
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('📡 Public inventory endpoint: Fetching inventory items for job card form...')
    
    // Get all active inventory items
    const items = await prisma.inventoryItem.findMany({
      where: {
        status: {
          not: 'inactive'
        }
      },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        unitCost: true,
        unit: true,
        category: true,
        status: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    console.log(`✅ Public inventory endpoint: Returning ${items.length} inventory items`)
    
    return ok(res, {
      inventory: items,
      count: items.length
    })
  } catch (error) {
    console.error('❌ Public inventory endpoint error:', error)
    return serverError(res, 'Failed to fetch inventory', error.message)
  }
}

export default withHttp(handler)

