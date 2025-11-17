import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    await authRequired(req, res)
    
    console.log('🔍 Document Collection Template [id] API:', {
      method: req.method,
      url: req.url,
      params: req.params
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = req.params?.id || pathSegments[pathSegments.length - 1]
    
    console.log('🔍 Extracted ID:', id, 'from path segments:', pathSegments)
    
    if (!id) {
      return badRequest(res, 'Template ID required')
    }
    
    // Get single template
    if (req.method === 'GET') {
      try {
        const template = await prisma.documentCollectionTemplate.findUnique({
          where: { id }
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
        console.error('❌ Database error getting template:', dbError)
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
        // Check if template exists
        const existing = await prisma.documentCollectionTemplate.findUnique({
          where: { id }
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
        
        console.log('✅ Updated document collection template:', template.id)
        return ok(res, { template: parsedTemplate })
      } catch (dbError) {
        console.error('❌ Database error updating template:', dbError)
        return serverError(res, 'Failed to update template', dbError.message)
      }
    }
    
    // Delete template
    if (req.method === 'DELETE') {
      try {
        console.log('🗑️ Attempting to delete template:', id)
        
        const template = await prisma.documentCollectionTemplate.findUnique({
          where: { id }
        })
        
        if (!template) {
          console.log('❌ Template not found in database:', id)
          return notFound(res, 'Template not found')
        }
        
        console.log('📋 Found template:', template.name, 'isDefault:', template.isDefault)
        
        // Prevent deleting default templates
        if (template.isDefault) {
          console.log('⚠️ Attempted to delete default template, blocking')
          return badRequest(res, 'Default templates cannot be deleted')
        }
        
        await prisma.documentCollectionTemplate.delete({
          where: { id }
        })
        
        console.log('✅ Deleted document collection template:', id)
        return ok(res, { message: 'Template deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting template:', dbError)
        return serverError(res, 'Failed to delete template', dbError.message)
      }
    }
    
    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ Error in document-collection-templates/[id] handler:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withLogging(withHttp(handler))

