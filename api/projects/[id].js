import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Project [id] API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // Get the ID from the URL

    console.log('🔍 Path segments:', pathSegments, 'ID:', id)

    if (!id) {
      return badRequest(res, 'Project ID required')
    }

    // Get Single Project (GET /api/projects/[id])
    if (req.method === 'GET') {
      try {
        const project = await prisma.project.findUnique({ where: { id } })
        if (!project) return notFound(res)
        console.log('✅ Project retrieved successfully:', project.id)
        return ok(res, { project })
      } catch (dbError) {
        console.error('❌ Database error getting project:', dbError)
        return serverError(res, 'Failed to get project', dbError.message)
      }
    }

    // Update Project (PUT /api/projects/[id])
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = req.body || {}
      console.log('🔍 PUT/PATCH request body:', body)
      
      // Find or create client by name if clientName is provided
      let clientId = null;
      if (body.clientName) {
        try {
          let client = await prisma.client.findFirst({ 
            where: { name: body.clientName } 
          });
          
          // If client doesn't exist, create it
          if (!client) {
            console.log('Creating new client:', body.clientName);
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
      
      const updateData = {
        name: body.name,
        description: body.description,
        clientName: body.clientName || body.client,
        clientId: clientId || body.clientId,
        status: body.status,
        startDate: body.startDate && body.startDate.trim() ? new Date(body.startDate) : undefined,
        dueDate: body.dueDate && body.dueDate.trim() ? new Date(body.dueDate) : undefined,
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
        hasDocumentCollectionProcess: body.hasDocumentCollectionProcess !== undefined ? body.hasDocumentCollectionProcess : undefined,
        documentSections: typeof body.documentSections === 'string' ? body.documentSections : JSON.stringify(body.documentSections)
      }
      
      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })
      
      console.log('🔍 Updating project with data:', updateData)
      try {
        const project = await prisma.project.update({ 
          where: { id }, 
          data: updateData 
        })
        console.log('✅ Project updated successfully:', project.id)
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
        console.log('🔍 Deleting project and related records:', id)
        
        // Delete all related records in a transaction
        await prisma.$transaction(async (tx) => {
          // Delete tasks
          const tasksDeleted = await tx.task.deleteMany({ where: { projectId: id } })
          console.log('🗑️ Deleted tasks:', tasksDeleted.count)
          
          // Delete invoices
          const invoicesDeleted = await tx.invoice.deleteMany({ where: { projectId: id } })
          console.log('🗑️ Deleted invoices:', invoicesDeleted.count)
          
          // Delete time entries
          const timeEntriesDeleted = await tx.timeEntry.deleteMany({ where: { projectId: id } })
          console.log('🗑️ Deleted time entries:', timeEntriesDeleted.count)
          
          // Delete the project
          await tx.project.delete({ where: { id } })
          console.log('✅ Project deleted successfully:', id)
        })
        
        console.log('✅ Project and related records deleted successfully:', id)
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
