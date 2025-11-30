import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  try {
    
    // Extract client ID from req.params
    const clientId = req.params.id

    if (!clientId) {
      return badRequest(res, 'Client ID required')
    }

    // Check if client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return notFound(res, 'Client not found')
    }

    // Get all tags for a client (GET /api/clients/[id]/tags)
    if (req.method === 'GET') {
      try {
        const clientTags = await prisma.clientTag.findMany({
          where: { clientId },
          include: {
            tag: true
          },
          orderBy: {
            tag: {
              name: 'asc'
            }
          }
        })
        
        const tags = clientTags.map(ct => ct.tag)
        return ok(res, { tags })
      } catch (dbError) {
        console.error('❌ Database error getting client tags:', dbError)
        return serverError(res, 'Failed to get client tags', dbError.message)
      }
    }

    // Add tag to client (POST /api/clients/[id]/tags)
    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      
      if (!body.tagId || typeof body.tagId !== 'string') {
        return badRequest(res, 'Tag ID is required')
      }

      const tagId = String(body.tagId).trim()

      // Check if tag exists
      const tag = await prisma.tag.findUnique({ where: { id: tagId } })
      if (!tag) {
        return notFound(res, 'Tag not found')
      }

      // Check if association already exists
      const existingAssociation = await prisma.clientTag.findUnique({
        where: {
          clientId_tagId: {
            clientId,
            tagId
          }
        }
      })

      if (existingAssociation) {
        return badRequest(res, 'Tag is already associated with this client')
      }

      try {
        const clientTag = await prisma.clientTag.create({
          data: {
            clientId,
            tagId
          },
          include: {
            tag: true
          }
        })
        return created(res, { tag: clientTag.tag })
      } catch (dbError) {
        console.error('❌ Database error associating tag:', dbError)
        return serverError(res, 'Failed to associate tag', dbError.message)
      }
    }

    // Remove tag from client (DELETE /api/clients/[id]/tags?tagId=...)
    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const tagId = url.searchParams.get('tagId')

      if (!tagId) {
        return badRequest(res, 'Tag ID is required')
      }

      try {
        await prisma.clientTag.delete({
          where: {
            clientId_tagId: {
              clientId,
              tagId
            }
          }
        })
        return ok(res, { message: 'Tag removed successfully' })
      } catch (dbError) {
        if (dbError.code === 'P2025') {
          return notFound(res, 'Tag association not found')
        }
        console.error('❌ Database error removing tag:', dbError)
        return serverError(res, 'Failed to remove tag', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Client Tags API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

