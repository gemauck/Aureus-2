import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    await authRequired(req, res)
    
    // Extract ID from route params (set by Express) or from URL path
    let id = req.params?.id
    if (!id) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const pathSegments = url.pathname.split('/').filter(Boolean)
      // For /api/weekly-fms-review-templates/:id, the ID should be the last segment
      const templateIndex = pathSegments.indexOf('weekly-fms-review-templates')
      if (templateIndex >= 0 && pathSegments[templateIndex + 1]) {
        id = pathSegments[templateIndex + 1]
      } else {
        id = pathSegments[pathSegments.length - 1]
      }
    }
    
    if (!id) {
      return badRequest(res, 'Template ID required')
    }
    
    // Get single template
    if (req.method === 'GET') {
      try {
        const template = await prisma.documentCollectionTemplate.findFirst({
          where: { 
            id,
            type: 'weekly-fms-review'
          }
        })
        
        if (!template) {
          return notFound(res)
        }
        
        // Parse sections JSON
        const parsedTemplate = {
          ...template,
          sections: (() => {
            try {
              if (typeof template.sections === 'string') {
                return JSON.parse(template.sections)
              }
              return template.sections || []
            } catch (e) {
              console.error('Error parsing template sections:', e)
              return []
            }
          })()
        }
        
        return ok(res, { template: parsedTemplate })
      } catch (dbError) {
        console.error('❌ Database error getting weekly FMS review template:', dbError)
        return serverError(res, 'Failed to get template', dbError.message)
      }
    }
    
    // Update template
    if (req.method === 'PUT' || req.method === 'PATCH') {
      let body = req.body
      
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (parseError) {
          console.error('❌ Failed to parse string body:', parseError)
          body = {}
        }
      }
      
      if (!body || typeof body !== 'object') {
        body = await parseJsonBody(req)
      }
      
      body = body || {}
      
      try {
        // Check if template exists and is a weekly-fms-review template
        const existing = await prisma.documentCollectionTemplate.findFirst({
          where: { 
            id,
            type: 'weekly-fms-review'
          }
        })
        
        if (!existing) {
          return notFound(res)
        }
        
        // Prevent editing default templates (unless it's the system)
        if (existing.isDefault && req.user?.role !== 'admin') {
          return badRequest(res, 'Default templates cannot be edited')
        }
        
        const updateData = {}
        
        if (body.name !== undefined) {
          updateData.name = body.name.trim()
        }
        if (body.description !== undefined) {
          updateData.description = body.description || ''
        }
        if (body.sections !== undefined) {
          updateData.sections = typeof body.sections === 'string'
            ? body.sections
            : JSON.stringify(body.sections || [])
        }
        if (body.isDefault !== undefined && req.user?.role === 'admin') {
          updateData.isDefault = body.isDefault === true
        }
        updateData.updatedBy = req.user?.name || req.user?.email || ''
        
        const template = await prisma.documentCollectionTemplate.update({
          where: { id },
          data: updateData
        })
        
        // Parse sections for response
        const parsedTemplate = {
          ...template,
          sections: (() => {
            try {
              if (typeof template.sections === 'string') {
                return JSON.parse(template.sections)
              }
              return template.sections || []
            } catch (e) {
              return []
            }
          })()
        }
        
        return ok(res, { template: parsedTemplate })
      } catch (dbError) {
        console.error('❌ Database error updating weekly FMS review template:', dbError)
        return serverError(res, 'Failed to update template', dbError.message)
      }
    }
    
    // Delete template
    if (req.method === 'DELETE') {
      try {
        
        const template = await prisma.documentCollectionTemplate.findFirst({
          where: { 
            id,
            type: 'weekly-fms-review'
          }
        })
        
        if (!template) {
          return notFound(res, 'Template not found')
        }
        
        
        // Prevent deleting default templates
        if (template.isDefault) {
          return badRequest(res, 'Default templates cannot be deleted')
        }
        
        await prisma.documentCollectionTemplate.delete({
          where: { id }
        })
        
        return ok(res, { message: 'Template deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting weekly FMS review template:', dbError)
        return serverError(res, 'Failed to delete template', dbError.message)
      }
    }
    
    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ Error in weekly-fms-review-templates/[id] handler:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withLogging(withHttp(handler))

