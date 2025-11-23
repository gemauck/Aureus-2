import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    await authRequired(req, res)
    
    // Get all templates - SHARED ACROSS ALL USERS (no ownerId filtering)
    if (req.method === 'GET') {
      try {
        // IMPORTANT: Templates are shared across all users, so we return ALL templates
        // regardless of ownerId. The ownerId field is only for tracking who created the template.
        const templates = await prisma.documentCollectionTemplate.findMany({
          orderBy: [
            { isDefault: 'desc' }, // Default templates first
            { createdAt: 'desc' }
          ]
        })
        
        console.log(`📋 Retrieved ${templates.length} document collection templates (shared across all users)`)
        if (templates.length > 0) {
          console.log(`   - Default templates: ${templates.filter(t => t.isDefault).length}`)
          console.log(`   - User-created templates: ${templates.filter(t => !t.isDefault).length}`)
          // Log all template names for debugging
          console.log(`   - All template names:`, templates.map(t => ({
            id: t.id,
            name: t.name,
            ownerId: t.ownerId,
            createdBy: t.createdBy,
            isDefault: t.isDefault,
            createdAt: t.createdAt
          })))
        } else {
          console.warn('⚠️ WARNING: No templates found in database!')
          console.warn('   This could mean:')
          console.warn('   1. No templates have been created yet')
          console.warn('   2. Database query is failing')
          console.warn('   3. Templates table is empty')
        }
        
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
        
        console.log(`✅ Retrieved ${parsedTemplates.length} document collection templates for user: ${req.user?.email || req.user?.sub || 'unknown'}`)
        console.log(`   All templates are shared - visible to all users regardless of ownerId`)
        
        // Prevent caching to ensure all users see newly created templates immediately
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
        
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
          ownerId: req.user?.sub || null, // For tracking only - templates are shared across all users
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
        
        console.log(`✅ Created document collection template: ${template.id} by ${req.user?.email || req.user?.sub || 'unknown'}`)
        console.log(`   Template "${template.name}" is now available to ALL users (shared template)`)
        console.log(`   Template data:`, {
          id: template.id,
          name: template.name,
          ownerId: template.ownerId,
          createdBy: template.createdBy,
          sectionsCount: parsedTemplate.sections?.length || 0,
          isDefault: template.isDefault,
          sectionsLength: typeof template.sections === 'string' ? template.sections.length : 'not string'
        })
        
        // Verify the template was actually saved by querying it back
        try {
          const verifyTemplate = await prisma.documentCollectionTemplate.findUnique({
            where: { id: template.id }
          })
          if (verifyTemplate) {
            console.log(`✅ Template verified in database - ID: ${verifyTemplate.id}, Name: ${verifyTemplate.name}`)
            
            // Also verify it appears in the full list
            const allTemplates = await prisma.documentCollectionTemplate.findMany({})
            console.log(`✅ Database now contains ${allTemplates.length} total templates (including the new one)`)
            console.log(`   Template names in database:`, allTemplates.map(t => t.name))
          } else {
            console.error(`❌ WARNING: Template ${template.id} not found in database after creation!`)
            console.error(`   This is a critical error - template was not saved!`)
          }
        } catch (verifyError) {
          console.error(`❌ Error verifying template in database:`, verifyError)
        }
        
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

