// Global Search API - Search across all modules
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const searchQuery = req.query?.q || ''
    
    if (!searchQuery || searchQuery.length < 2) {
      return ok(res, { results: [] })
    }

    const searchTerm = searchQuery.toLowerCase().trim()
    const results = []

    // Search Clients/Leads
    try {
      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { industry: { contains: searchTerm, mode: 'insensitive' } },
            { website: { contains: searchTerm, mode: 'insensitive' } },
            { notes: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          industry: true,
          website: true,
          type: true
        }
      })

      for (const client of clients) {
        results.push({
          id: `client-${client.id}`,
          type: client.type === 'lead' ? 'lead' : 'client',
          title: client.name,
          subtitle: client.industry || client.website || '',
          link: `#/${client.type === 'lead' ? 'clients' : 'clients'}?view=${client.type === 'lead' ? 'leads' : 'clients'}&highlight=${client.id}`
        })
      }
    } catch (error) {
      console.error('Error searching clients:', error)
    }

    // Search Projects
    try {
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { notes: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          clientId: true,
          client: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })

      for (const project of projects) {
        results.push({
          id: `project-${project.id}`,
          type: 'project',
          title: project.name,
          subtitle: project.client?.name || project.description,
          link: `#/projects?highlight=${project.id}`
        })
      }
    } catch (error) {
      console.error('Error searching projects:', error)
    }

    // Search Users
    try {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      })

      for (const user of users) {
        results.push({
          id: `user-${user.id}`,
          type: 'user',
          title: user.name,
          subtitle: user.email,
          link: `#/users?highlight=${user.id}`
        })
      }
    } catch (error) {
      console.error('Error searching users:', error)
    }

    // Search Opportunities
    try {
      const opportunities = await prisma.opportunity.findMany({
        where: {
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          clientId: true,
          client: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })

      for (const opportunity of opportunities) {
        results.push({
          id: `opportunity-${opportunity.id}`,
          type: 'opportunity',
          title: opportunity.title,
          subtitle: opportunity.client?.name || '',
          link: `#/clients?view=opportunities&highlight=${opportunity.id}`
        })
      }
    } catch (error) {
      console.error('Error searching opportunities:', error)
    }

    // Search Invoices
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          OR: [
            { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
            { notes: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          clientId: true,
          client: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })

      for (const invoice of invoices) {
        results.push({
          id: `invoice-${invoice.id}`,
          type: 'invoice',
          title: invoice.invoiceNumber || 'Invoice',
          subtitle: invoice.client?.name || '',
          link: `#/invoicing?highlight=${invoice.id}`
        })
      }
    } catch (error) {
      console.error('Error searching invoices:', error)
    }

    // Return results (limited to 50 total)
    return ok(res, { results: results.slice(0, 50) })

  } catch (error) {
    console.error('Error in search API:', error)
    return serverError(res, 'Search failed', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

