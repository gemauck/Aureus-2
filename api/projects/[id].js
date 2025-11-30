import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = req.params?.id || pathSegments[pathSegments.length - 1] // Get the ID from params or URL


    if (!id) {
      return badRequest(res, 'Project ID required')
    }

    // Get Single Project (GET /api/projects/[id])
    if (req.method === 'GET') {
      try {
        
        const project = await prisma.project.findUnique({ where: { id } })
        if (!project) {
          return notFound(res);
        }
        
        // Also log the raw Prisma result to see what's actually in the database
        
        // Check if user is guest and has access to this project
        const userRole = req.user?.role?.toLowerCase();
        if (userRole === 'guest') {
          try {
            // Parse accessibleProjectIds from user
            let accessibleProjectIds = [];
            if (req.user?.accessibleProjectIds) {
              if (typeof req.user.accessibleProjectIds === 'string') {
                accessibleProjectIds = JSON.parse(req.user.accessibleProjectIds);
              } else if (Array.isArray(req.user.accessibleProjectIds)) {
                accessibleProjectIds = req.user.accessibleProjectIds;
              }
            }
            
            // Check if project ID is in accessible projects
            if (!accessibleProjectIds || !accessibleProjectIds.includes(project.id)) {
              return notFound(res); // Return not found to hide project existence
            }
          } catch (parseError) {
            console.error('❌ Error parsing accessibleProjectIds:', parseError);
            return notFound(res);
          }
        }
        
        return ok(res, { project })
      } catch (dbError) {
        console.error('❌ Database error getting project:', dbError)
        return serverError(res, 'Failed to get project', dbError.message)
      }
    }

    // Update Project (PUT /api/projects/[id])
    if (req.method === 'PUT' || req.method === 'PATCH') {
      let body = req.body

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (parseError) {
          console.error('❌ Failed to parse string body for project update:', parseError)
          body = {}
        }
      }

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        body = await parseJsonBody(req)
      }

      body = body || {}

      
      // Find or create client by name if clientName is provided
      let clientId = null;
      if (body.clientName) {
        try {
          let client = await prisma.client.findFirst({ 
            where: { name: body.clientName } 
          });
          
          // If client doesn't exist, create it
          if (!client) {
            client = await prisma.client.create({
              data: {
                name: body.clientName,
                type: 'client',
                industry: 'Other',
                status: 'active',
                ownerId: req.user?.sub || null
              }
            });
          }
          
          clientId = client.id;
        } catch (error) {
          console.error('Error finding/creating client:', error);
        }
      }
      
      const normalizedStartDate = typeof body.startDate === 'string' ? body.startDate.trim() : ''
      const normalizedDueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : ''

      const updateData = {
        name: body.name,
        description: body.description,
        clientName: body.clientName || body.client,
        clientId: clientId || body.clientId,
        status: body.status,
        startDate: normalizedStartDate ? new Date(normalizedStartDate) : undefined,
        dueDate: normalizedDueDate ? new Date(normalizedDueDate) : undefined,
        budget: body.budget,
        priority: body.priority,
        type: body.type,
        assignedTo: body.assignedTo,
        tasksList: typeof body.tasksList === 'string' ? body.tasksList : JSON.stringify(body.tasksList),
        taskLists: typeof body.taskLists === 'string' ? body.taskLists : JSON.stringify(body.taskLists),
        customFieldDefinitions: typeof body.customFieldDefinitions === 'string' ? body.customFieldDefinitions : JSON.stringify(body.customFieldDefinitions),
        team: typeof body.team === 'string' ? body.team : JSON.stringify(body.team),
        documents: typeof body.documents === 'string' ? body.documents : JSON.stringify(body.documents),
        comments: typeof body.comments === 'string' ? body.comments : JSON.stringify(body.comments),
        activityLog: typeof body.activityLog === 'string' ? body.activityLog : JSON.stringify(body.activityLog),
        notes: body.notes,
        hasDocumentCollectionProcess: body.hasDocumentCollectionProcess !== undefined ? body.hasDocumentCollectionProcess : undefined
      }
      
      // Handle documentSections separately if provided - ensure it's properly saved
      if (body.documentSections !== undefined && body.documentSections !== null) {
        try {
          
          if (typeof body.documentSections === 'string') {
            // Already a string, validate it's valid JSON
            const trimmed = body.documentSections.trim();
            if (trimmed === '') {
              // Empty string means empty array
              updateData.documentSections = JSON.stringify([]);
            } else {
              try {
                // Validate it's valid JSON
                const parsed = JSON.parse(trimmed);
                // If it parsed successfully, use it as-is (it's already a stringified JSON)
                updateData.documentSections = trimmed;
              } catch (parseError) {
                console.error('❌ Invalid documentSections JSON string:', parseError);
                // If string is invalid JSON, stringify it (might be double-encoded or corrupted)
                updateData.documentSections = JSON.stringify(body.documentSections);
              }
            }
          } else if (Array.isArray(body.documentSections)) {
            // It's an array, stringify it
            updateData.documentSections = JSON.stringify(body.documentSections);
          } else if (typeof body.documentSections === 'object') {
            // It's an object, stringify it
            updateData.documentSections = JSON.stringify(body.documentSections);
          } else {
            // It's something else (number, boolean, etc.), stringify it
            updateData.documentSections = JSON.stringify(body.documentSections);
          }
        } catch (error) {
          console.error('❌ Error processing documentSections:', error);
          // Don't fail the entire update, but log the error
        }
      } else {
      }
      
      // Handle monthlyProgress separately if provided - with validation for safety
      if (body.monthlyProgress !== undefined && body.monthlyProgress !== null) {
        try {
          let monthlyProgressString = body.monthlyProgress;
          
          // If it's already a string, validate it's valid JSON
          if (typeof monthlyProgressString === 'string') {
            // Validate JSON structure
            const parsed = JSON.parse(monthlyProgressString);
            
            // Ensure it's an object (not array, null, or primitive)
            if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
              throw new Error('monthlyProgress must be an object');
            }
            
            // Validate structure - each key should be a month-year format
            // and values should be objects with valid fields
            for (const key in parsed) {
              if (typeof parsed[key] !== 'object' || Array.isArray(parsed[key]) || parsed[key] === null) {
                console.warn(`⚠️ Invalid month data structure for key: ${key}`);
                // Don't fail, but log warning
              } else {
                // Check for valid field names (compliance, data, comments)
                const validFields = ['compliance', 'data', 'comments'];
                for (const field in parsed[key]) {
                  if (validFields.includes(field) && typeof parsed[key][field] !== 'string') {
                    // Convert non-string values to strings for safety
                    parsed[key][field] = String(parsed[key][field] || '');
                  }
                }
              }
            }
            
            // Re-stringify the validated/cleaned data
            monthlyProgressString = JSON.stringify(parsed);
          } else {
            // If it's an object, validate and stringify
            if (typeof monthlyProgressString !== 'object' || Array.isArray(monthlyProgressString)) {
              throw new Error('monthlyProgress must be an object');
            }
            monthlyProgressString = JSON.stringify(monthlyProgressString);
          }
          
          updateData.monthlyProgress = monthlyProgressString;
        } catch (error) {
          console.error('❌ Invalid monthlyProgress data:', error);
          return serverError(res, 'Invalid monthlyProgress format. Must be valid JSON object.', error.message);
        }
      }
      
      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })
      
      
      try {
        const project = await prisma.project.update({ 
          where: { id }, 
          data: updateData 
        });
        
        
        return ok(res, { project })
      } catch (dbError) {
        console.error('❌ Database error updating project:', dbError)
        return serverError(res, 'Failed to update project', dbError.message)
      }
    }

    // Delete Project (DELETE /api/projects/[id])
    if (req.method === 'DELETE') {
      try {
        // Ensure referential integrity by removing dependents first, then the project
        
        // Delete all related records in a transaction
        await prisma.$transaction(async (tx) => {
          // First, handle task hierarchy - set parentTaskId to null for all tasks
          // This prevents foreign key constraint issues with self-referential tasks
          const tasksUpdated = await tx.task.updateMany({ 
            where: { projectId: id },
            data: { parentTaskId: null }
          })
          
          // Now delete all tasks (they no longer have parent references)
          const tasksDeleted = await tx.task.deleteMany({ where: { projectId: id } })
          
          // Delete invoices
          const invoicesDeleted = await tx.invoice.deleteMany({ where: { projectId: id } })
          
          // Delete time entries
          const timeEntriesDeleted = await tx.timeEntry.deleteMany({ where: { projectId: id } })
          
          // Delete the project
          await tx.project.delete({ where: { id } })
        })
        
        return ok(res, { 
          deleted: true,
          message: `Project deleted successfully`
        })
      } catch (dbError) {
        console.error('❌ Database error deleting project (with cascade):', dbError)
        console.error('❌ Error details:', {
          message: dbError.message,
          code: dbError.code,
          meta: dbError.meta
        })
        return serverError(res, 'Failed to delete project', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Project [id] API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
