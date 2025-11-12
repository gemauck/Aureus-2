// Public API endpoint for job card form - returns active clients without authentication
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('📡 Public clients endpoint: Fetching active clients for job card form...')
    
    // Get only active clients (type = 'client')
    // Status can be 'active', 'Active', or empty - all are considered active for job cards
    const clients = await prisma.client.findMany({
      where: {
        type: 'client'
      },
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
        sites: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    // Parse sites JSON if present
    const clientsWithParsedSites = clients.map(client => {
      let sites = []
      if (client.sites) {
        try {
          sites = typeof client.sites === 'string' ? JSON.parse(client.sites) : client.sites
        } catch (e) {
          sites = []
        }
      }
      return {
        id: client.id,
        name: client.name,
        status: client.status,
        type: client.type,
        sites: Array.isArray(sites) ? sites : []
      }
    })

    console.log(`✅ Public clients endpoint: Returning ${clientsWithParsedSites.length} active clients`)
    
    return ok(res, {
      clients: clientsWithParsedSites,
      count: clientsWithParsedSites.length
    })
  } catch (error) {
    console.error('❌ Public clients endpoint error:', error)
    return serverError(res, 'Failed to fetch clients', error.message)
  }
}

export default withHttp(handler)

