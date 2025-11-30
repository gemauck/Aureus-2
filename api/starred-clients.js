// Starred Clients API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
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
    const clientId = pathSegments[pathSegments.length - 1] // For /api/starred-clients/[clientId]

    // Star a client/lead (POST /api/starred-clients/[clientId])
    if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[0] === 'starred-clients') {
      if (!clientId) {
        return badRequest(res, 'Client ID required')
      }

      // Verify client exists
      const client = await prisma.client.findUnique({
        where: { id: clientId }
      })

      if (!client) {
        return notFound(res, 'Client or lead not found')
      }

      // Check if already starred
      const existingStar = await prisma.starredClient.findUnique({
        where: {
          userId_clientId: {
            userId,
            clientId
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

      // Create star
      const starred = await prisma.starredClient.create({
        data: {
          userId,
          clientId
        }
      })

      return created(res, {
        message: 'Client/lead starred successfully',
        starred: true,
        starId: starred.id
      })
    }

    // Unstar a client/lead (DELETE /api/starred-clients/[clientId])
    if (req.method === 'DELETE' && pathSegments.length === 2 && pathSegments[0] === 'starred-clients') {
      if (!clientId) {
        return badRequest(res, 'Client ID required')
      }

      // Check if starred
      const existingStar = await prisma.starredClient.findUnique({
        where: {
          userId_clientId: {
            userId,
            clientId
          }
        }
      })

      if (!existingStar) {
        return ok(res, {
          message: 'Not starred',
          starred: false
        })
      }

      // Remove star
      await prisma.starredClient.delete({
        where: {
          userId_clientId: {
            userId,
            clientId
          }
        }
      })

      return ok(res, {
        message: 'Client/lead unstarred successfully',
        starred: false
      })
    }

    // Get starred clients/leads for current user (GET /api/starred-clients)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'starred-clients') {
      const starred = await prisma.starredClient.findMany({
        where: {
          userId
        },
        include: {
          client: {
            include: {
              tags: {
                include: {
                  tag: true
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
        starredClients: starred.map(s => ({
          id: s.id,
          clientId: s.clientId,
          createdAt: s.createdAt,
          client: s.client
        }))
      })
    }

    // Toggle star status (PUT /api/starred-clients/[clientId])
    if (req.method === 'PUT' && pathSegments.length === 2 && pathSegments[0] === 'starred-clients') {
      if (!clientId) {
        console.error('❌ No clientId provided')
        return badRequest(res, 'Client ID required')
      }

      // Verify client exists
      const client = await prisma.client.findUnique({
        where: { id: clientId }
      })

      if (!client) {
        console.error(`❌ Client/lead not found: ${clientId}`)
        return notFound(res, 'Client or lead not found')
      }

      // Check current star status
      const existingStar = await prisma.starredClient.findUnique({
        where: {
          userId_clientId: {
            userId,
            clientId
          }
        }
      })

      if (existingStar) {
        // Unstar
        await prisma.starredClient.delete({
          where: {
            userId_clientId: {
              userId,
              clientId
            }
          }
        })
        return ok(res, {
          message: 'Client/lead unstarred',
          starred: false
        })
      } else {
        // Star
        const starred = await prisma.starredClient.create({
          data: {
            userId,
            clientId
          }
        })
        
        // Verify the star was created
        const verifyStar = await prisma.starredClient.findUnique({
          where: {
            userId_clientId: {
              userId,
              clientId
            }
          }
        })
        if (!verifyStar) {
          console.error(`❌ CRITICAL: Star was created but cannot be found on verification! userId=${userId}, clientId=${clientId}`)
        } else {
        }
        
        return ok(res, {
          message: 'Client/lead starred',
          starred: true,
          starId: starred.id
        })
      }
    }

    return badRequest(res, 'Invalid endpoint')
  } catch (error) {
    console.error('❌ Starred clients API error:', error)
    return serverError(res, 'Failed to process request', error.message)
  }
}

export default withLogging(withHttp(authRequired(handler)))
