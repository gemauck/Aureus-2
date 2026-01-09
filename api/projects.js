// Projects API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

/**
 * Convert DocumentSection table data to JSON format (for backward compatibility)
 */
async function documentSectionsToJson(projectId) {
  try {
    // Check if table exists (for environments that haven't migrated yet)
    try {
      await prisma.$queryRaw`SELECT 1 FROM "DocumentSection" LIMIT 1`
    } catch (e) {
      // Table doesn't exist yet, return null to use JSON fallback
      return null
    }

    const sections = await prisma.documentSection.findMany({
      where: { projectId: projectId },
      include: {
        documents: {
          include: {
            statuses: true,
            comments: true
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: [{ year: 'desc' }, { order: 'asc' }]
    })

    if (sections.length === 0) {
      return null // Return null to indicate no table data, use JSON fallback
    }

    // Group by year: { "2024": [...], "2025": [...] }
    const byYear = {}
    for (const section of sections) {
      if (!byYear[section.year]) {
        byYear[section.year] = []
      }

      const sectionData = {
        id: section.id,
        name: section.name,
        description: section.description || '',
        documents: section.documents.map(doc => {
          // Build collectionStatus object: { "2024-01": "collected", ... }
          const collectionStatus = {}
          for (const status of doc.statuses) {
            const key = `${status.year}-${String(status.month).padStart(2, '0')}`
            collectionStatus[key] = status.status
          }

          // Build comments object: { "2024-01": [...], ... }
          const comments = {}
          for (const comment of doc.comments) {
            const key = `${comment.year}-${String(comment.month).padStart(2, '0')}`
            if (!comments[key]) {
              comments[key] = []
            }
            comments[key].push({
              id: comment.id,
              text: comment.text,
              author: comment.author,
              authorId: comment.authorId,
              authorName: comment.author,
              createdAt: comment.createdAt
            })
          }

          return {
            id: doc.id,
            name: doc.name,
            description: doc.description || '',
            required: doc.required || false,
            collectionStatus,
            comments
          }
        })
      }

      byYear[section.year].push(sectionData)
    }

    return byYear
  } catch (error) {
    console.error('Error converting documentSections to JSON:', error)
    return null
  }
}

/**
 * Convert WeeklyFMSReviewSection table data to JSON format (for backward compatibility)
 */
async function weeklyFMSReviewSectionsToJson(projectId) {
  try {
    // Check if table exists (for environments that haven't migrated yet)
    try {
      await prisma.$queryRaw`SELECT 1 FROM "WeeklyFMSReviewSection" LIMIT 1`
    } catch (e) {
      // Table doesn't exist yet, return null to use JSON fallback
      return null
    }

    const sections = await prisma.weeklyFMSReviewSection.findMany({
      where: { projectId },
      include: {
        items: {
          include: {
            statuses: true,
            comments: true
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: [{ year: 'desc' }, { order: 'asc' }]
    })

    if (sections.length === 0) {
      return null // Return null to indicate no table data, use JSON fallback
    }

    // Group by year: { "2024": [...], "2025": [...] }
    const byYear = {}
    for (const section of sections) {
      if (!byYear[section.year]) {
        byYear[section.year] = []
      }

      const sectionData = {
        id: section.id,
        name: section.name,
        description: section.description || '',
        documents: section.items.map(item => {
          // Build collectionStatus object: { "2024-01-W1": "completed", ... }
          const collectionStatus = {}
          for (const status of item.statuses) {
            const key = `${status.year}-${String(status.month).padStart(2, '0')}-W${status.week}`
            collectionStatus[key] = status.status
          }

          // Build comments object: { "2024-01-W1": [...], ... }
          const comments = {}
          for (const comment of item.comments) {
            const key = `${comment.year}-${String(comment.month).padStart(2, '0')}-W${comment.week}`
            if (!comments[key]) {
              comments[key] = []
            }
            comments[key].push({
              id: comment.id,
              text: comment.text,
              author: comment.author,
              authorId: comment.authorId,
              authorName: comment.author,
              createdAt: comment.createdAt
            })
          }

          return {
            id: item.id,
            name: item.name,
            description: item.description || '',
            required: item.required || false,
            collectionStatus,
            comments
          }
        })
      }

      byYear[section.year].push(sectionData)
    }

    return byYear
  } catch (error) {
    console.error('Error converting weeklyFMSReviewSections to JSON:', error)
    return null
  }
}

/**
 * Save documentSections JSON to table structure
 */
async function saveDocumentSectionsToTable(projectId, jsonData) {
  if (!jsonData) return

  try {
    // Check if table exists (for environments that haven't migrated yet)
    try {
      await prisma.$queryRaw`SELECT 1 FROM "DocumentSection" LIMIT 1`
    } catch (e) {
      // Table doesn't exist yet, skip table save (JSON will still be saved)
      console.warn('DocumentSection table does not exist, skipping table save')
      return
    }
    let sections = jsonData
    if (typeof jsonData === 'string') {
      sections = JSON.parse(jsonData)
    }

    // Delete existing sections for this project
    await prisma.documentSection.deleteMany({
      where: { projectId }
    })

    if (!sections || (typeof sections === 'object' && Object.keys(sections).length === 0)) {
      return
    }

    // Handle year-based structure: { "2024": [...], "2025": [...] }
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        const year = parseInt(yearStr, 10)
        if (isNaN(year) || year < 1900 || year > 3000) continue
        if (!Array.isArray(yearSections)) continue

        for (let i = 0; i < yearSections.length; i++) {
          const section = yearSections[i]
          if (!section || !section.name) continue

          await prisma.documentSection.create({
            data: {
              projectId,
              year,
              name: section.name || '',
              description: section.description || '',
              order: i,
              documents: {
                create: (section.documents || []).map((doc, docIdx) => {
                  const statuses = []
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          statuses.push({
                            year,
                            month,
                            status: String(status || 'pending')
                          })
                        }
                      }
                    }
                  }

                  const comments = []
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                          for (const comment of commentList) {
                            if (comment && (comment.text || comment)) {
                              comments.push({
                                year,
                                month,
                                text: comment.text || String(comment),
                                author: comment.author || comment.authorName || '',
                                authorId: comment.authorId || null
                              })
                            }
                          }
                        }
                      }
                    }
                  }

                  return {
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx,
                    statuses: { create: statuses },
                    comments: { create: comments }
                  }
                })
              }
            }
          })
        }
      }
    }
  } catch (error) {
    console.error('Error saving documentSections to table:', error)
    // Don't throw - allow JSON fallback to work
  }
}

/**
 * Save weeklyFMSReviewSections JSON to table structure
 */
async function saveWeeklyFMSReviewSectionsToTable(projectId, jsonData) {
  if (!jsonData) return

  try {
    // Check if table exists (for environments that haven't migrated yet)
    try {
      await prisma.$queryRaw`SELECT 1 FROM "WeeklyFMSReviewSection" LIMIT 1`
    } catch (e) {
      // Table doesn't exist yet, skip table save (JSON will still be saved)
      console.warn('WeeklyFMSReviewSection table does not exist, skipping table save')
      return
    }
    let sections = jsonData
    if (typeof jsonData === 'string') {
      sections = JSON.parse(jsonData)
    }

    // Delete existing sections for this project
    await prisma.weeklyFMSReviewSection.deleteMany({
      where: { projectId }
    })

    if (!sections || (typeof sections === 'object' && Object.keys(sections).length === 0)) {
      return
    }

    // Handle year-based structure: { "2024": [...], "2025": [...] }
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        const year = parseInt(yearStr, 10)
        if (isNaN(year) || year < 1900 || year > 3000) continue
        if (!Array.isArray(yearSections)) continue

        for (let i = 0; i < yearSections.length; i++) {
          const section = yearSections[i]
          if (!section || !section.name) continue

          await prisma.weeklyFMSReviewSection.create({
            data: {
              projectId,
              year,
              name: section.name || '',
              description: section.description || '',
              order: i,
              items: {
                create: (section.documents || []).map((doc, docIdx) => {
                  const statuses = []
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      // Parse "2024-01-W1" format
                      const match = key.match(/^(\d{4})-(\d{1,2})-W(\d+)$/)
                      if (match) {
                        const year = parseInt(match[1], 10)
                        const month = parseInt(match[2], 10)
                        const week = parseInt(match[3], 10)
                        if (!isNaN(year) && !isNaN(month) && !isNaN(week) && month >= 1 && month <= 12 && week >= 1 && week <= 5) {
                          statuses.push({
                            year,
                            month,
                            week,
                            status: String(status || 'pending')
                          })
                        }
                      }
                    }
                  }

                  const comments = []
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const match = key.match(/^(\d{4})-(\d{1,2})-W(\d+)$/)
                      if (match) {
                        const year = parseInt(match[1], 10)
                        const month = parseInt(match[2], 10)
                        const week = parseInt(match[3], 10)
                        if (!isNaN(year) && !isNaN(month) && !isNaN(week) && month >= 1 && month <= 12 && week >= 1 && week <= 5) {
                          const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                          for (const comment of commentList) {
                            if (comment && (comment.text || comment)) {
                              comments.push({
                                year,
                                month,
                                week,
                                text: comment.text || String(comment),
                                author: comment.author || comment.authorName || '',
                                authorId: comment.authorId || null
                              })
                            }
                          }
                        }
                      }
                    }
                  }

                  return {
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx,
                    statuses: { create: statuses },
                    comments: { create: comments }
                  }
                })
              }
            }
          })
        }
      }
    }
  } catch (error) {
    console.error('Error saving weeklyFMSReviewSections to table:', error)
    // Don't throw - allow JSON fallback to work
  }
}

async function handler(req, res) {
  try {
    
    // Add debugging for the specific issue
    
    // Parse the URL path - strip /api/ prefix if present
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = req.params?.id || pathSegments[pathSegments.length - 1]

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
              return ok(res, { projects: [] });
            }
            
            // Filter by accessible project IDs
            whereClause = {
              id: {
                in: accessibleProjectIds
              }
            };
            
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
            hasDocumentCollectionProcess: true, // Include to show Document Collection tab in list
            hasWeeklyFMSReviewProcess: true, // Include to show Weekly FMS Review tab in list
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
        
        return ok(res, { projects: projectsWithTaskCount })
      } catch (dbError) {
        console.error('❌ Database error listing projects:', {
          message: dbError.message,
          code: dbError.code,
          name: dbError.name,
          meta: dbError.meta,
          stack: dbError.stack?.substring(0, 500)
        })
        
        // Check if it's a connection error using utility
        if (isConnectionError(dbError)) {
          console.error('🔌 Database connection issue detected - server may be unreachable')
          // Pass the error message to serverError which will format it as DATABASE_CONNECTION_ERROR
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }

        // If the projects table or columns are missing in the database, fall back
        // to returning an empty list instead of a hard 500 so the UI can still load.
        const errorMessage = dbError.message || ''
        const isMissingTableOrColumn =
          dbError.code === 'P2021' || // table does not exist
          dbError.code === 'P2022' || // column does not exist
          /relation "project"/i.test(errorMessage) ||
          /no such table: .*project/i.test(errorMessage) ||
          /column .* does not exist/i.test(errorMessage)

        if (isMissingTableOrColumn) {
          console.warn('⚠️ Projects API: Project table/columns missing in database. Returning empty list fallback.')
          return ok(res, { projects: [] })
        }
        
        return serverError(res, 'Failed to list projects', dbError.message)
      }
    }

    // Create Project (POST /api/projects)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'projects') {
      let body = req.body

      // If body is a string, parse it
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (parseError) {
          console.error('❌ Failed to parse string body for project creation:', parseError)
          body = {}
        }
      }

      // Only try parseJsonBody if req.body is completely undefined
      // If req.body exists (even if empty), Express has already parsed it
      if (body === undefined) {
        body = await parseJsonBody(req)
      }

      // Ensure body is an object
      body = body || {}

      // Enhanced logging for debugging
      if (!body.name) {
        console.error('❌ No name provided in request body')
        console.error('❌ Full request details:', {
          method: req.method,
          url: req.url,
          headers: req.headers,
          bodyKeys: Object.keys(body),
          bodyType: typeof body,
          bodyValue: body,
          reqBodyExists: req.body !== undefined,
          reqBodyType: typeof req.body,
          reqBodyKeys: req.body ? Object.keys(req.body) : []
        })
        return badRequest(res, 'name required')
      }

      // Validate project type - only allow General, Monthly Review, or Audit
      const allowedTypes = ['General', 'Monthly Review', 'Audit'];
      if (body.type && !allowedTypes.includes(body.type)) {
        return badRequest(res, `Invalid project type. Allowed types are: ${allowedTypes.join(', ')}`)
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
        type: body.type || 'Monthly Review',
        assignedTo: body.assignedTo || '',
        notes: body.notes || '',
        ownerId: req.user?.sub || null,
        // Automatically add monthly document collection process to all new projects
        hasDocumentCollectionProcess: true,
        documentSections: typeof body.documentSections === 'string' ? body.documentSections : JSON.stringify(Array.isArray(body.documentSections) ? body.documentSections : []),
        weeklyFMSReviewSections: typeof body.weeklyFMSReviewSections === 'string' ? body.weeklyFMSReviewSections : JSON.stringify(
          body.weeklyFMSReviewSections && typeof body.weeklyFMSReviewSections === 'object'
            ? body.weeklyFMSReviewSections
            : {}
        ),
        hasWeeklyFMSReviewProcess: body.hasWeeklyFMSReviewProcess !== undefined 
          ? (typeof body.hasWeeklyFMSReviewProcess === 'boolean' 
            ? body.hasWeeklyFMSReviewProcess 
            : Boolean(body.hasWeeklyFMSReviewProcess === true || body.hasWeeklyFMSReviewProcess === 'true' || body.hasWeeklyFMSReviewProcess === 1))
          : false,
        monthlyProgress: typeof body.monthlyProgress === 'string'
          ? body.monthlyProgress
          : JSON.stringify(
              body.monthlyProgress && typeof body.monthlyProgress === 'object' && !Array.isArray(body.monthlyProgress)
                ? body.monthlyProgress
                : {}
            )
      }

      
      try {
        const project = await prisma.project.create({
          data: projectData
        })

        // Save to tables if documentSections or weeklyFMSReviewSections are provided
        if (body.documentSections !== undefined && body.documentSections !== null) {
          await saveDocumentSectionsToTable(project.id, body.documentSections)
        }
        if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
          await saveWeeklyFMSReviewSectionsToTable(project.id, body.weeklyFMSReviewSections)
        }

        // Fetch project again with table data converted to JSON
        const docSectionsFromTable = await documentSectionsToJson(project.id)
        const fmsSectionsFromTable = await weeklyFMSReviewSectionsToJson(project.id)

        const projectWithChecklists = {
          ...project,
          documentSections: docSectionsFromTable !== null
            ? JSON.stringify(docSectionsFromTable)
            : project.documentSections,
          weeklyFMSReviewSections: fmsSectionsFromTable !== null
            ? JSON.stringify(fmsSectionsFromTable)
            : project.weeklyFMSReviewSections
        }

        return created(res, { project: projectWithChecklists })
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

          // Convert table-based checklists to JSON format (with fallback to JSON fields)
          const docSectionsFromTable = await documentSectionsToJson(id)
          const fmsSectionsFromTable = await weeklyFMSReviewSectionsToJson(id)

          // Use table data if available, otherwise fall back to JSON fields
          const projectWithChecklists = {
            ...project,
            documentSections: docSectionsFromTable !== null
              ? JSON.stringify(docSectionsFromTable)
              : project.documentSections,
            weeklyFMSReviewSections: fmsSectionsFromTable !== null
              ? JSON.stringify(fmsSectionsFromTable)
              : project.weeklyFMSReviewSections
          }

          return ok(res, { project: projectWithChecklists })
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

        // DEBUG: Log what we're receiving
        let tasksListForDebug = null;
        if (body.tasksList !== undefined && body.tasksList !== null) {
          try {
            const parsed = typeof body.tasksList === 'string' ? JSON.parse(body.tasksList) : body.tasksList;
            const taskWithComments = Array.isArray(parsed) ? parsed.find(t => Array.isArray(t.comments) && t.comments.length > 0) : null;
            tasksListForDebug = {
              tasksCount: Array.isArray(parsed) ? parsed.length : 0,
              taskWithComments: taskWithComments ? {
                id: taskWithComments.id,
                title: taskWithComments.title,
                commentsCount: taskWithComments.comments.length,
                firstComment: taskWithComments.comments[0]?.text?.substring(0, 50)
              } : null
            };
            console.log('🔍 DEBUG API: Received tasksList:', tasksListForDebug);
          } catch (e) {
            console.error('❌ DEBUG API: Failed to parse tasksList for debug:', e);
          }
        }

        // BEST PRACTICE: Merge comments from database before saving to prevent data loss
        // This ensures comments added by other sessions/users are preserved
        let tasksListToSave = body.tasksList;
        if (tasksListToSave !== undefined && tasksListToSave !== null) {
          try {
            // Fetch current state from database
            const currentProject = await prisma.project.findUnique({
              where: { id },
              select: { tasksList: true }
            });
            
            if (currentProject?.tasksList) {
              const currentTasks = JSON.parse(currentProject.tasksList || '[]');
              const incomingTasks = typeof tasksListToSave === 'string' 
                ? JSON.parse(tasksListToSave) 
                : tasksListToSave;
              
              // Merge comments by task ID
              const mergedTasks = currentTasks.map(currentTask => {
                const incomingTask = incomingTasks.find(t => t.id === currentTask.id);
                if (!incomingTask) return currentTask;
                
                // Merge comments: combine database comments with incoming comments
                const dbComments = Array.isArray(currentTask.comments) ? currentTask.comments : [];
                const incomingComments = Array.isArray(incomingTask.comments) ? incomingTask.comments : [];
                
                // Use Map to deduplicate by comment ID
                const commentsMap = new Map();
                dbComments.forEach(comment => {
                  if (comment.id) commentsMap.set(comment.id, comment);
                });
                incomingComments.forEach(comment => {
                  if (comment.id) {
                    commentsMap.set(comment.id, comment); // Update existing or add new
                  } else {
                    // New comment without ID - add with temporary key
                    commentsMap.set(`new-${Date.now()}-${Math.random()}`, comment);
                  }
                });
                
                // Merge task data, preserving all comments
                return {
                  ...incomingTask,
                  comments: Array.from(commentsMap.values())
                };
              });
              
              // Add any new tasks that don't exist in database
              incomingTasks.forEach(incomingTask => {
                if (!mergedTasks.find(t => t.id === incomingTask.id)) {
                  mergedTasks.push(incomingTask);
                }
              });
              
              tasksListToSave = JSON.stringify(mergedTasks);
              
              console.log('🔄 Merged comments from database:', {
                projectId: id,
                currentTasksCount: currentTasks.length,
                incomingTasksCount: incomingTasks.length,
                mergedTasksCount: mergedTasks.length
              });
            } else {
              // No existing tasks, just stringify incoming
              tasksListToSave = typeof tasksListToSave === 'string' 
                ? tasksListToSave 
                : JSON.stringify(tasksListToSave);
            }
          } catch (mergeError) {
            console.warn('⚠️ Failed to merge comments from database, using incoming data:', mergeError);
            // Fallback to incoming data if merge fails
            tasksListToSave = typeof tasksListToSave === 'string' 
              ? tasksListToSave 
              : JSON.stringify(tasksListToSave);
          }
        }
        
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
          tasksList: tasksListToSave,
          taskLists: typeof body.taskLists === 'string' ? body.taskLists : JSON.stringify(body.taskLists),
          customFieldDefinitions: typeof body.customFieldDefinitions === 'string' ? body.customFieldDefinitions : JSON.stringify(body.customFieldDefinitions),
          team: typeof body.team === 'string' ? body.team : JSON.stringify(body.team),
          documents: typeof body.documents === 'string' ? body.documents : JSON.stringify(body.documents),
          comments: typeof body.comments === 'string' ? body.comments : JSON.stringify(body.comments),
          activityLog: typeof body.activityLog === 'string' ? body.activityLog : JSON.stringify(body.activityLog),
          notes: body.notes,
          // Always process hasDocumentCollectionProcess if provided, even if false
          // This ensures we can explicitly set it to false if needed
          hasDocumentCollectionProcess: body.hasDocumentCollectionProcess !== undefined 
            ? Boolean(body.hasDocumentCollectionProcess === true || body.hasDocumentCollectionProcess === 'true' || body.hasDocumentCollectionProcess === 1) 
            : undefined
        }
        
        // DEBUG: Log what we're about to save
        if (updateData.tasksList) {
          try {
            const parsed = typeof updateData.tasksList === 'string' ? JSON.parse(updateData.tasksList) : updateData.tasksList;
            const taskWithComments = Array.isArray(parsed) ? parsed.find(t => Array.isArray(t.comments) && t.comments.length > 0) : null;
            console.log('🔍 DEBUG API: About to save tasksList:', {
              tasksCount: Array.isArray(parsed) ? parsed.length : 0,
              tasksListStringLength: typeof updateData.tasksList === 'string' ? updateData.tasksList.length : 0,
              taskWithComments: taskWithComments ? {
                id: taskWithComments.id,
                title: taskWithComments.title,
                commentsCount: taskWithComments.comments.length,
                firstComment: taskWithComments.comments[0]?.text?.substring(0, 50)
              } : null
            });
          } catch (e) {
            console.error('❌ DEBUG API: Failed to parse tasksList before save:', e);
          }
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

        // Handle weeklyFMSReviewSections separately if provided - ensure it's properly saved
        if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
          try {
            if (typeof body.weeklyFMSReviewSections === 'string') {
              // Already a string, validate it's valid JSON
              const trimmed = body.weeklyFMSReviewSections.trim();
              if (trimmed === '') {
                // Empty string means empty object/array
                updateData.weeklyFMSReviewSections = JSON.stringify({});
              } else {
                try {
                  // Validate it's valid JSON
                  const parsed = JSON.parse(trimmed);
                  // If it parsed successfully, use it as-is (it's already a stringified JSON)
                  updateData.weeklyFMSReviewSections = trimmed;
                } catch (parseError) {
                  console.error('❌ Invalid weeklyFMSReviewSections JSON string:', parseError);
                  // If string is invalid JSON, stringify it (might be double-encoded or corrupted)
                  updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
                }
              }
            } else if (Array.isArray(body.weeklyFMSReviewSections)) {
              // It's an array, stringify it
              updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
            } else if (typeof body.weeklyFMSReviewSections === 'object') {
              // It's an object, stringify it
              updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
            } else {
              // It's something else (number, boolean, etc.), stringify it
              updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
            }
          } catch (error) {
            console.error('❌ Error processing weeklyFMSReviewSections:', error);
            // Don't fail the entire update, but log the error
          }
        }

        // Handle hasWeeklyFMSReviewProcess separately if provided
        if (body.hasWeeklyFMSReviewProcess !== undefined && body.hasWeeklyFMSReviewProcess !== null) {
          updateData.hasWeeklyFMSReviewProcess = typeof body.hasWeeklyFMSReviewProcess === 'boolean'
            ? body.hasWeeklyFMSReviewProcess
            : Boolean(body.hasWeeklyFMSReviewProcess === true || body.hasWeeklyFMSReviewProcess === 'true' || body.hasWeeklyFMSReviewProcess === 1);
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
            console.error('❌ Invalid monthlyProgress data in projects.js PUT handler:', error);
            return serverError(
              res,
              'Invalid monthlyProgress format. Must be valid JSON object.',
              error.message
            );
          }
        }
        
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        try {
          // Verify hasDocumentCollectionProcess is in updateData before updating
          if ('hasDocumentCollectionProcess' in updateData) {
          } else {
            console.warn('⚠️ hasDocumentCollectionProcess NOT in updateData - will not be updated');
          }
          
          // Save to tables if documentSections or weeklyFMSReviewSections are being updated
          if (body.documentSections !== undefined && body.documentSections !== null) {
            await saveDocumentSectionsToTable(id, body.documentSections)
          }
          if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
            await saveWeeklyFMSReviewSectionsToTable(id, body.weeklyFMSReviewSections)
          }
          
          const project = await prisma.project.update({ 
            where: { id }, 
            data: updateData 
          })
          
          // Verify the update actually worked
          const verifyProject = await prisma.project.findUnique({ where: { id } });
          
          // DEBUG: Verify what was actually saved
          if (verifyProject && verifyProject.tasksList) {
            try {
              const savedTasks = typeof verifyProject.tasksList === 'string' 
                ? JSON.parse(verifyProject.tasksList) 
                : verifyProject.tasksList;
              const savedTaskWithComments = Array.isArray(savedTasks) ? savedTasks.find(t => Array.isArray(t.comments) && t.comments.length > 0) : null;
              console.log('🔍 DEBUG API: Verified saved tasksList:', {
                tasksCount: Array.isArray(savedTasks) ? savedTasks.length : 0,
                taskWithComments: savedTaskWithComments ? {
                  id: savedTaskWithComments.id,
                  title: savedTaskWithComments.title,
                  commentsCount: savedTaskWithComments.comments.length,
                  firstComment: savedTaskWithComments.comments[0]?.text?.substring(0, 50)
                } : null
              });
            } catch (e) {
              console.error('❌ DEBUG API: Failed to parse saved tasksList:', e);
            }
          }
          
          return ok(res, { project })
        } catch (dbError) {
          console.error('❌ Database error updating project:', dbError)
          return serverError(res, 'Failed to update project', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          // Check if project exists first
          const projectExists = await prisma.project.findUnique({ where: { id } })
          if (!projectExists) {
            console.error('❌ Project not found:', id)
            return notFound(res, 'Project not found')
          }
          
          // Ensure referential integrity by removing dependents first, then the project
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
