import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    await authRequired(req, res)
    
    // Get all templates
    if (req.method === 'GET') {
      try {
        const templates = await prisma.documentCollectionTemplate.findMany({
          orderBy: [
            { isDefault: 'desc' }, // Default templates first
            { createdAt: 'desc' }
          ]
        })
        
        // Parse sections JSON for each template
        const parsedTemplates = templates.map(template => ({
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
        }))
        
        console.log(`✅ Retrieved ${parsedTemplates.length} document collection templates`)
        return ok(res, { templates: parsedTemplates })
      } catch (dbError) {
        console.error('❌ Database error getting templates:', dbError)
        return serverError(res, 'Failed to get templates', dbError.message)
      }
    }
    
    // Create template
    if (req.method === 'POST') {
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
      
      if (!body.name || !body.name.trim()) {
        return badRequest(res, 'Template name is required')
      }
      
      try {
        const templateData = {
          name: body.name.trim(),
          description: body.description || '',
          sections: typeof body.sections === 'string' 
            ? body.sections 
            : JSON.stringify(body.sections || []),
          isDefault: body.isDefault === true,
          ownerId: req.user?.sub || null,
          createdBy: req.user?.name || req.user?.email || '',
          updatedBy: req.user?.name || req.user?.email || ''
        }
        
        const template = await prisma.documentCollectionTemplate.create({
          data: templateData
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
        
        console.log('✅ Created document collection template:', template.id)
        return ok(res, { template: parsedTemplate })
      } catch (dbError) {
        console.error('❌ Database error creating template:', dbError)
        return serverError(res, 'Failed to create template', dbError.message)
      }
    }
    
    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ Error in document-collection-templates handler:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withLogging(withHttp(handler))

