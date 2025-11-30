// Starred Opportunities API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const userId = req.user?.sub
    if (!userId) {
      console.error('❌ No userId found in request')
      return badRequest(res, 'User authentication required')
    }

    // Parse the URL path
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const opportunityId = pathSegments[pathSegments.length - 1]

    // Star an opportunity (POST /api/starred-opportunities/[opportunityId])
    if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[0] === 'starred-opportunities') {
      if (!opportunityId) {
        return badRequest(res, 'Opportunity ID required')
      }

      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        select: { id: true }
      })

      if (!opportunity) {
        return notFound(res, 'Opportunity not found')
      }

      const existingStar = await prisma.starredOpportunity.findUnique({
        where: {
          userId_opportunityId: {
            userId,
            opportunityId
          }
        }
      })

      if (existingStar) {
        return ok(res, {
          message: 'Already starred',
          starred: true,
          starId: existingStar.id
        })
      }

      const starred = await prisma.starredOpportunity.create({
        data: {
          userId,
          opportunityId
        }
      })

      return created(res, {
        message: 'Opportunity starred successfully',
        starred: true,
        starId: starred.id
      })
    }

    // Unstar an opportunity (DELETE /api/starred-opportunities/[opportunityId])
    if (req.method === 'DELETE' && pathSegments.length === 2 && pathSegments[0] === 'starred-opportunities') {
      if (!opportunityId) {
        return badRequest(res, 'Opportunity ID required')
      }

      const existingStar = await prisma.starredOpportunity.findUnique({
        where: {
          userId_opportunityId: {
            userId,
            opportunityId
          }
        }
      })

      if (!existingStar) {
        return ok(res, {
          message: 'Not starred',
          starred: false
        })
      }

      await prisma.starredOpportunity.delete({
        where: {
          userId_opportunityId: {
            userId,
            opportunityId
          }
        }
      })

      return ok(res, {
        message: 'Opportunity unstarred successfully',
        starred: false
      })
    }

    // Toggle star (PUT /api/starred-opportunities/[opportunityId])
    if (req.method === 'PUT' && pathSegments.length === 2 && pathSegments[0] === 'starred-opportunities') {
      if (!opportunityId) {
        return badRequest(res, 'Opportunity ID required')
      }

      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        select: { id: true, title: true }
      })

      if (!opportunity) {
        return notFound(res, 'Opportunity not found')
      }

      const existingStar = await prisma.starredOpportunity.findUnique({
        where: {
          userId_opportunityId: {
            userId,
            opportunityId
          }
        }
      })

      if (existingStar) {
        await prisma.starredOpportunity.delete({
          where: {
            userId_opportunityId: {
              userId,
              opportunityId
            }
          }
        })
        return ok(res, {
          message: 'Opportunity unstarred',
          starred: false
        })
      } else {
        const starred = await prisma.starredOpportunity.create({
          data: {
            userId,
            opportunityId
          }
        })

        return ok(res, {
          message: 'Opportunity starred',
          starred: true,
          starId: starred.id
        })
      }
    }

    // List starred opportunities (GET /api/starred-opportunities)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'starred-opportunities') {
      const starred = await prisma.starredOpportunity.findMany({
        where: { userId },
        include: {
          opportunity: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return ok(res, {
        starredOpportunities: starred.map(s => ({
          id: s.id,
          opportunityId: s.opportunityId,
          createdAt: s.createdAt,
          opportunity: s.opportunity
        }))
      })
    }

    return badRequest(res, 'Invalid endpoint')
  } catch (error) {
    console.error('❌ Starred opportunities API error:', error)
    return serverError(res, 'Failed to process request', error.message)
  }
}

export default withLogging(withHttp(authRequired(handler)))

