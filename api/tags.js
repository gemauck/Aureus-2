import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    console.log('🔍 Tags API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] === 'tags' ? null : pathSegments[pathSegments.length - 1]

    // List All Tags (GET /api/tags)
    if (req.method === 'GET' && pathSegments[pathSegments.length - 1] === 'tags') {
      try {
        const tags = await prisma.tag.findMany({
          orderBy: { name: 'asc' }
        })
        console.log('✅ Tags retrieved successfully:', tags.length)
        return ok(res, { tags })
      } catch (dbError) {
        console.error('❌ Database error getting tags:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get tags', dbError.message)
      }
    }

    // Get Single Tag (GET /api/tags/[id])
    if (req.method === 'GET' && id) {
      try {
        const tag = await prisma.tag.findUnique({ 
          where: { id },
          include: {
            clients: {
              include: {
                client: true
              }
            }
          }
        })
        if (!tag) return notFound(res)
        console.log('✅ Tag retrieved successfully:', tag.id)
        return ok(res, { tag })
      } catch (dbError) {
        console.error('❌ Database error getting tag:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get tag', dbError.message)
      }
    }

    // Create Tag (POST /api/tags)
    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return badRequest(res, 'Tag name is required')
      }

      const name = String(body.name).trim()
      
      // Check if tag with this name already exists
      const existingTag = await prisma.tag.findUnique({
        where: { name }
      })
      
      if (existingTag) {
        return badRequest(res, 'A tag with this name already exists')
      }

      try {
        const tag = await prisma.tag.create({
          data: {
            name,
            color: body.color || '#3B82F6',
            description: body.description || '',
            ownerId: req.user?.sub || req.user?.id || null
          }
        })
        console.log('✅ Tag created successfully:', tag.id)
        return created(res, { tag })
      } catch (dbError) {
        console.error('❌ Database error creating tag:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to create tag', dbError.message)
      }
    }

    // Update Tag (PATCH /api/tags/[id])
    if (req.method === 'PATCH' && id) {
      const body = await parseJsonBody(req)
      
      // Check if tag exists
      const existingTag = await prisma.tag.findUnique({ where: { id } })
      if (!existingTag) {
        return notFound(res, 'Tag not found')
      }

      // If name is being updated, check for duplicates
      if (body.name && body.name !== existingTag.name) {
        const name = String(body.name).trim()
        if (name.length === 0) {
          return badRequest(res, 'Tag name cannot be empty')
        }
        
        const duplicateTag = await prisma.tag.findUnique({
          where: { name }
        })
        
        if (duplicateTag) {
          return badRequest(res, 'A tag with this name already exists')
        }
      }

      const updateData = {}
      if (body.name !== undefined) updateData.name = String(body.name).trim()
      if (body.color !== undefined) updateData.color = String(body.color)
      if (body.description !== undefined) updateData.description = String(body.description || '')

      try {
        const tag = await prisma.tag.update({
          where: { id },
          data: updateData
        })
        console.log('✅ Tag updated successfully:', tag.id)
        return ok(res, { tag })
      } catch (dbError) {
        console.error('❌ Database error updating tag:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to update tag', dbError.message)
      }
    }

    // Delete Tag (DELETE /api/tags/[id])
    if (req.method === 'DELETE' && id) {
      try {
        // Check if tag exists
        const existingTag = await prisma.tag.findUnique({ where: { id } })
        if (!existingTag) {
          return notFound(res, 'Tag not found')
        }

        // Delete the tag (cascade will handle ClientTag deletions)
        await prisma.tag.delete({ where: { id } })
        console.log('✅ Tag deleted successfully:', id)
        return ok(res, { message: 'Tag deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting tag:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to delete tag', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Tags API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

