// Projects API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Projects API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    // Add debugging for the specific issue
    console.log('🔍 Projects API: Starting handler execution')
    console.log('🔍 Projects API: Request method:', req.method)
    console.log('🔍 Projects API: Request URL:', req.url)
    console.log('🔍 Projects API: Full request path:', req.path)
    console.log('🔍 Projects API: Original URL:', req.originalUrl)
    
    // Parse the URL path - strip /api/ prefix if present
    const urlPath = req.url.replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    console.log('🔍 Projects API: Path segments:', pathSegments)
    const id = pathSegments[pathSegments.length - 1]
    console.log('🔍 Projects API: Extracted ID:', id)
    console.log('🔍 Projects API: Path segments length:', pathSegments.length)

    // List Projects (GET /api/projects)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'projects') {
      try {
        const projects = await prisma.project.findMany({ 
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Projects retrieved successfully:', projects.length)
        return ok(res, { projects })
      } catch (dbError) {
        console.error('❌ Database error listing projects:', dbError)
        return serverError(res, 'Failed to list projects', dbError.message)
      }
    }

    // Create Project (POST /api/projects)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'projects') {
      const body = req.body || {}
      console.log('🔍 POST request body:', JSON.stringify(body, null, 2))
      console.log('🔍 req.body type:', typeof req.body)
      console.log('🔍 req.body is null:', req.body === null)
      console.log('🔍 req.body is undefined:', req.body === undefined)
      console.log('🔍 req.body keys:', Object.keys(req.body || {}))
      console.log('🔍 body.name value:', body.name)
      console.log('🔍 body.name type:', typeof body.name)
      if (!body.name) {
        console.error('❌ No name provided in request body')
        console.error('❌ Full request details:', {
          method: req.method,
          url: req.url,
          headers: req.headers,
          bodyKeys: Object.keys(body)
        })
        return badRequest(res, 'name required')
      }

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

      // Parse dates safely
      let startDate = new Date();
      if (body.startDate && typeof body.startDate === 'string' && body.startDate.trim() !== '') {
        const parsedStartDate = new Date(body.startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          startDate = parsedStartDate;
        }
      }

      let dueDate = null;
      if (body.dueDate && typeof body.dueDate === 'string' && body.dueDate.trim() !== '') {
        const parsedDueDate = new Date(body.dueDate);
        if (!isNaN(parsedDueDate.getTime())) {
          dueDate = parsedDueDate;
        }
      } else if (body.dueDate === null || body.dueDate === '') {
        dueDate = null;
      }

      const projectData = {
        name: body.name,
        description: body.description || '',
        clientName: body.clientName || body.client || '',
        clientId: clientId || body.clientId || null,
        status: body.status || 'Planning',
        startDate: startDate,
        dueDate: dueDate,
        budget: parseFloat(body.budget) || 0,
        priority: body.priority || 'Medium',
        tasksList: typeof body.tasksList === 'string' ? body.tasksList : JSON.stringify(Array.isArray(body.tasksList) ? body.tasksList : []),
        taskLists: typeof body.taskLists === 'string' ? body.taskLists : JSON.stringify(Array.isArray(body.taskLists) ? body.taskLists : []),
        customFieldDefinitions: typeof body.customFieldDefinitions === 'string' ? body.customFieldDefinitions : JSON.stringify(Array.isArray(body.customFieldDefinitions) ? body.customFieldDefinitions : []),
        team: typeof body.team === 'string' ? body.team : JSON.stringify(Array.isArray(body.team) ? body.team : []),
        type: body.type || 'Project',
        assignedTo: body.assignedTo || '',
        notes: body.notes || '',
        ownerId: req.user?.sub || null
      }

      console.log('🔍 Creating project with data:', JSON.stringify(projectData, null, 2))
      console.log('🔍 Project data types:', {
        name: typeof projectData.name,
        clientName: typeof projectData.clientName,
        clientId: projectData.clientId,
        status: typeof projectData.status,
        startDate: projectData.startDate instanceof Date ? 'Date' : typeof projectData.startDate,
        dueDate: projectData.dueDate instanceof Date ? 'Date' : (projectData.dueDate ? typeof projectData.dueDate : 'null'),
        type: typeof projectData.type
      })
      
      try {
        const project = await prisma.project.create({
          data: projectData
        })
        console.log('✅ Project created successfully:', project.id)
        return created(res, { project })
      } catch (dbError) {
        console.error('❌ Database error creating project:', dbError)
        console.error('❌ Error details:', {
          message: dbError.message,
          code: dbError.code,
          meta: dbError.meta
        })
        return serverError(res, 'Failed to create project', dbError.message)
      }
    }

    // Get, Update, Delete Single Project (GET, PUT, DELETE /api/projects/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'projects' && id) {
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
      if (req.method === 'PUT') {
        const body = req.body || {}
        console.log('🔍 PUT request body:', body)
        
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
      if (req.method === 'DELETE') {
        try {
          // Ensure referential integrity by removing dependents first, then the project
          await prisma.$transaction(async (tx) => {
            await tx.task.deleteMany({ where: { projectId: id } })
            await tx.invoice.deleteMany({ where: { projectId: id } })
            await tx.timeEntry.deleteMany({ where: { projectId: id } })
            await tx.project.delete({ where: { id } })
          })
          console.log('✅ Project and related records deleted successfully:', id)
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting project (with cascade):', dbError)
          return serverError(res, 'Failed to delete project', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or project action')
  } catch (e) {
    return serverError(res, 'Project handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
