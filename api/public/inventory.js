// Public API endpoint for job card form - returns inventory items without authentication
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    
    // Get all active inventory items
    // Note: InventoryItem doesn't have a 'description' field, and status values are: in_stock, low_stock, out_of_stock, in_production
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
        unitCost: true,
        unit: true,
        category: true,
        type: true,
        status: true,
        quantity: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    
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

