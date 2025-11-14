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
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    console.log('🔍 Projects API: Path segments:', pathSegments)
    const id = req.params?.id || pathSegments[pathSegments.length - 1]
    console.log('🔍 Projects API: Extracted ID:', id)
    console.log('🔍 Projects API: Path segments length:', pathSegments.length)

    // List Projects (GET /api/projects)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'projects') {
      try {
        const userRole = req.user?.role?.toLowerCase();
        
        // Build where clause
        let whereClause = {};
        
        // For guest users, filter by accessibleProjectIds
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
            
            // If no accessible projects specified, return empty array
            if (!accessibleProjectIds || accessibleProjectIds.length === 0) {
              console.log('✅ Guest user has no accessible projects');
              return ok(res, { projects: [] });
            }
            
            // Filter by accessible project IDs
            whereClause = {
              id: {
                in: accessibleProjectIds
              }
            };
            
            console.log('✅ Filtering projects for guest user:', accessibleProjectIds);
          } catch (parseError) {
            console.error('❌ Error parsing accessibleProjectIds:', parseError);
            return ok(res, { projects: [] });
          }
        }
        
        // Optimize: Only select fields needed for the list view
        const projects = await prisma.project.findMany({ 
          where: whereClause,
          select: {
            id: true,
            name: true,
            clientName: true,
            status: true,
            type: true,
            startDate: true,
            dueDate: true,
            assignedTo: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            monthlyProgress: true,
            tasksList: true, // Include to count tasks stored in JSON
            _count: {
              select: {
                tasks: true
              }
            }
            // Exclude other large JSON fields: taskLists, customFieldDefinitions, 
            // documents, comments, activityLog, team, documentSections
          },
          orderBy: { createdAt: 'desc' } 
        })
        
        // Calculate tasksCount from both tasks relation and tasksList JSON
        const projectsWithTaskCount = projects.map(project => {
          let tasksCount = project._count?.tasks || 0;
          
          // Also count tasks from tasksList JSON if available (fallback for legacy data)
          if (project.tasksList) {
            try {
              const tasksList = typeof project.tasksList === 'string' 
                ? JSON.parse(project.tasksList || '[]') 
                : (project.tasksList || []);
              
              if (Array.isArray(tasksList) && tasksList.length > 0) {
                // Use the larger count (either from relation or JSON)
                tasksCount = Math.max(tasksCount, tasksList.length);
              }
            } catch (e) {
              // If parsing fails, just use the relation count
              console.warn('Failed to parse tasksList for project', project.id, e);
            }
          }
          
          return {
            ...project,
            tasksCount
          };
        })
        
        console.log('✅ Projects retrieved successfully:', projectsWithTaskCount.length)
        return ok(res, { projects: projectsWithTaskCount })
      } catch (dbError) {
        console.error('❌ Database error listing projects:', {
          message: dbError.message,
          code: dbError.code,
          name: dbError.name,
          meta: dbError.meta,
          stack: dbError.stack?.substring(0, 500)
        })
        
        // Check if it's a connection error - comprehensive list including PrismaClientInitializationError
        const errorName = dbError.name || ''
        const errorMessage = dbError.message || ''
        const isConnectionError = 
          errorName === 'PrismaClientInitializationError' ||
          errorMessage.includes("Can't reach database server") ||
          errorMessage.includes("Can't reach database") ||
          (errorMessage.includes("connection") && (errorMessage.includes("timeout") || errorMessage.includes("refused") || errorMessage.includes("unreachable"))) ||
          dbError.code === 'P1001' || // Can't reach database server
          dbError.code === 'P1002' || // The database server is not reachable
          dbError.code === 'P1008' || // Operations timed out
          dbError.code === 'P1017' || // Server has closed the connection
          dbError.code === 'ETIMEDOUT' ||
          dbError.code === 'ECONNREFUSED' ||
          dbError.code === 'ENOTFOUND' ||
          dbError.code === 'EAI_AGAIN'
        
        if (isConnectionError) {
          console.error('🔌 Database connection issue detected - server may be unreachable')
          // Pass the error message to serverError which will format it as DATABASE_CONNECTION_ERROR
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to list projects', dbError.message)
      }
    }

    // Create Project (POST /api/projects)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'projects') {
      let body = req.body

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (parseError) {
          console.error('❌ Failed to parse string body for project creation:', parseError)
          body = {}
        }
      }

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        body = await parseJsonBody(req)
      }

      body = body || {}

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
      const normalizedStartDate = typeof body.startDate === 'string' ? body.startDate.trim() : ''
      let startDate = new Date();
      if (normalizedStartDate) {
        const parsedStartDate = new Date(normalizedStartDate);
        if (!isNaN(parsedStartDate.getTime())) {
          startDate = parsedStartDate;
        }
      }

      let dueDate = null;
      const normalizedDueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : ''
      if (normalizedDueDate) {
        const parsedDueDate = new Date(normalizedDueDate);
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
        ownerId: req.user?.sub || null,
        // Automatically add monthly document collection process to all new projects
        hasDocumentCollectionProcess: true,
        documentSections: typeof body.documentSections === 'string' ? body.documentSections : JSON.stringify(Array.isArray(body.documentSections) ? body.documentSections : []),
        monthlyProgress: typeof body.monthlyProgress === 'string'
          ? body.monthlyProgress
          : JSON.stringify(
              body.monthlyProgress && typeof body.monthlyProgress === 'object' && !Array.isArray(body.monthlyProgress)
                ? body.monthlyProgress
                : {}
            )
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
    console.log('🔍 Checking single project operation:', {
      pathSegmentsLength: pathSegments.length,
      firstSegment: pathSegments[0],
      id: id,
      method: req.method,
      hasParams: !!req.params?.id
    })
    
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
          hasDocumentCollectionProcess: body.hasDocumentCollectionProcess !== undefined ? Boolean(body.hasDocumentCollectionProcess === true || body.hasDocumentCollectionProcess === 'true' || body.hasDocumentCollectionProcess === 1) : undefined,
          documentSections: typeof body.documentSections === 'string' ? body.documentSections : JSON.stringify(body.documentSections)
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating project with data:', updateData)
        console.log('🔍 hasDocumentCollectionProcess in updateData:', {
          raw: body.hasDocumentCollectionProcess,
          processed: updateData.hasDocumentCollectionProcess,
          type: typeof updateData.hasDocumentCollectionProcess
        })
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
        console.log('🗑️ DELETE request received for project:', id)
        try {
          // Check if project exists first
          const projectExists = await prisma.project.findUnique({ where: { id } })
          if (!projectExists) {
            console.error('❌ Project not found:', id)
            return notFound(res, 'Project not found')
          }
          
          console.log('🔍 Deleting project and related records:', id)
          // Ensure referential integrity by removing dependents first, then the project
          await prisma.$transaction(async (tx) => {
            // First, handle task hierarchy - set parentTaskId to null for all tasks
            // This prevents foreign key constraint issues with self-referential tasks
            const tasksUpdated = await tx.task.updateMany({ 
              where: { projectId: id },
              data: { parentTaskId: null }
            })
            console.log('🔄 Updated tasks to remove parent references:', tasksUpdated.count)
            
            // Now delete all tasks (they no longer have parent references)
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
          return ok(res, { deleted: true, message: 'Project deleted successfully' })
        } catch (dbError) {
          console.error('❌ Database error deleting project (with cascade):', dbError)
          console.error('❌ Error details:', {
            message: dbError.message,
            code: dbError.code,
            meta: dbError.meta,
            stack: dbError.stack
          })
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
