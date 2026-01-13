import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { saveDocumentSectionsToTable, saveWeeklyFMSReviewSectionsToTable, documentSectionsToJson, weeklyFMSReviewSectionsToJson } from '../projects.js'

/**
 * Safely load project with all relations, with fallback if relations fail
 */
async function loadProjectWithRelations(projectId) {
  try {
    // Try full query first
    return await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          where: { parentTaskId: null },
          include: {
            subtasks: {
              orderBy: { createdAt: 'asc' }
            },
            assigneeUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        documentSectionsTable: {
          include: {
            documents: {
              include: {
                statuses: true,
                comments: {
                  include: {
                    authorUser: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  },
                  orderBy: { createdAt: 'asc' }
                }
              },
              orderBy: { order: 'asc' }
            }
          },
          orderBy: [{ year: 'desc' }, { order: 'asc' }]
        },
        weeklyFMSReviewSectionsTable: {
          include: {
            items: {
              include: {
                statuses: true,
                comments: {
                  include: {
                    authorUser: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  },
                  orderBy: { createdAt: 'asc' }
                }
              },
              orderBy: { order: 'asc' }
            }
          },
          orderBy: [{ year: 'desc' }, { order: 'asc' }]
        }
      }
    });
  } catch (error) {
    console.error('❌ Full project query failed, attempting step-by-step load:', {
      error: error.message,
      code: error.code,
      projectId
    });
    
    // Fallback: Load project and relations separately
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          tasks: {
            where: { parentTaskId: null },
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      
      if (!project) {
        return null;
      }
      
      // Load relations separately with error handling
      try {
        project.documentSectionsTable = await prisma.documentSection.findMany({
          where: { projectId },
          include: {
            documents: {
              include: {
                statuses: true,
                comments: {
                  include: {
                    authorUser: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  },
                  orderBy: { createdAt: 'asc' }
                }
              },
              orderBy: { order: 'asc' }
            }
          },
          orderBy: [{ year: 'desc' }, { order: 'asc' }]
        });
      } catch (docError) {
        console.error('❌ Failed to load documentSectionsTable:', docError.message);
        project.documentSectionsTable = [];
      }
      
      try {
        project.weeklyFMSReviewSectionsTable = await prisma.weeklyFMSReviewSection.findMany({
          where: { projectId },
          include: {
            items: {
              include: {
                statuses: true,
                comments: {
                  include: {
                    authorUser: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  },
                  orderBy: { createdAt: 'asc' }
                }
              },
              orderBy: { order: 'asc' }
            }
          },
          orderBy: [{ year: 'desc' }, { order: 'asc' }]
        });
      } catch (fmsError) {
        console.error('❌ Failed to load weeklyFMSReviewSectionsTable:', fmsError.message);
        project.weeklyFMSReviewSectionsTable = [];
      }
      
      // Load task subtasks and assignees separately
      if (project.tasks && project.tasks.length > 0) {
        try {
          const taskIds = project.tasks.map(t => t.id);
          const subtasks = await prisma.task.findMany({
            where: {
              parentTaskId: { in: taskIds }
            },
            orderBy: { createdAt: 'asc' }
          });
          
          const assignees = await prisma.user.findMany({
            where: {
              id: { in: project.tasks.map(t => t.assigneeId).filter(Boolean) }
            },
            select: {
              id: true,
              name: true,
              email: true
            }
          });
          
          const assigneeMap = new Map(assignees.map(a => [a.id, a]));
          
          project.tasks = project.tasks.map(task => ({
            ...task,
            subtasks: subtasks.filter(st => st.parentTaskId === task.id),
            assigneeUser: task.assigneeId ? assigneeMap.get(task.assigneeId) : null
          }));
        } catch (taskError) {
          console.error('❌ Failed to load task relations:', taskError.message);
          project.tasks = project.tasks.map(task => ({
            ...task,
            subtasks: [],
            assigneeUser: null
          }));
        }
      }
      
      return project;
    } catch (fallbackError) {
      console.error('❌ Fallback query also failed:', fallbackError.message);
      throw fallbackError;
    }
  }
}

async function handler(req, res) {
  try {
    // Extract ID from Express params first (most reliable)
    let id = req.params?.id
    
    // Fallback: extract from URL if params not available
    if (!id) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const pathSegments = url.pathname.split('/').filter(Boolean)
      // Find 'projects' in path and get the next segment
      const projectsIndex = pathSegments.indexOf('projects')
      if (projectsIndex >= 0 && pathSegments[projectsIndex + 1]) {
        id = pathSegments[projectsIndex + 1]
      } else {
        // Last resort: use last segment
        id = pathSegments[pathSegments.length - 1]
      }
    }

    if (!id) {
      console.error('❌ No project ID found in request:', {
        url: req.url,
        params: req.params,
        pathname: req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : 'N/A'
      })
      return badRequest(res, 'Project ID required')
    }

    // Get Single Project (GET /api/projects/[id])
    if (req.method === 'GET') {
      try {
        // Try to add missing columns if they don't exist (one-time migration)
        try {
          await prisma.$executeRaw`
            ALTER TABLE "Project" 
            ADD COLUMN IF NOT EXISTS "monthlyFMSReviewSections" TEXT DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "hasMonthlyFMSReviewProcess" BOOLEAN DEFAULT false;
          `;
        } catch (migrationError) {
          // Ignore migration errors (columns might already exist or connection issues)
          if (!migrationError.message?.includes('already exists') && 
              !migrationError.message?.includes('duplicate column')) {
            console.log('⚠️ Migration note (non-critical):', migrationError.message?.substring(0, 100));
          }
        }
        
        // Check if user is guest and has access to this project
        const userRole = req.user?.role?.toLowerCase();
        let whereClause = { id };
        
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
            if (!accessibleProjectIds || !accessibleProjectIds.includes(id)) {
              return notFound(res); // Return not found to hide project existence
            }
          } catch (parseError) {
            console.error('❌ Error parsing accessibleProjectIds:', parseError);
            return notFound(res);
          }
        }
        
        // Load project with all related data from tables using safe loader
        let project;
        try {
          project = await loadProjectWithRelations(id);
          
          if (!project) {
            return notFound(res);
          }
          
          // Ensure all relation arrays exist
          if (!project.tasks) project.tasks = [];
          if (!project.documentSectionsTable) project.documentSectionsTable = [];
          if (!project.weeklyFMSReviewSectionsTable) project.weeklyFMSReviewSectionsTable = [];
        } catch (dbQueryError) {
          console.error('❌ Database query error getting project:', {
            error: dbQueryError.message,
            code: dbQueryError.code,
            name: dbQueryError.name,
            meta: dbQueryError.meta,
            stack: dbQueryError.stack?.substring(0, 1000),
            projectId: id,
            userRole: req.user?.role,
            userId: req.user?.sub
          });
          
          // Final fallback: try basic project query
          try {
            const basicProject = await prisma.project.findUnique({
              where: { id },
              select: { id: true, name: true }
            });
            if (!basicProject) {
              console.error('❌ Project not found in database:', id);
              return notFound(res);
            }
            // If project exists but we can't load relations, return error
            throw dbQueryError;
          } catch (basicError) {
            if (basicError.code === 'P2025' || basicError.message?.includes('not found')) {
              return notFound(res);
            }
            throw dbQueryError;
          }
        }
        
        if (!project) {
          return notFound(res);
        }
        
        // Load TaskComments for all tasks (since Task model doesn't have comments relation yet)
        const allTaskIds = [
          ...(project.tasks || []).map(t => t.id),
          ...(project.tasks || []).flatMap(t => (t.subtasks || []).map(st => st.id))
        ];
        
        const taskCommentsMap = {};
        if (allTaskIds.length > 0) {
          try {
            const taskComments = await prisma.taskComment.findMany({
              where: { taskId: { in: allTaskIds } },
              include: {
                authorUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              },
              orderBy: { createdAt: 'asc' }
            });
            
            // Group comments by taskId
            taskComments.forEach(comment => {
              if (!taskCommentsMap[comment.taskId]) {
                taskCommentsMap[comment.taskId] = [];
              }
              taskCommentsMap[comment.taskId].push(comment);
            });
          } catch (commentError) {
            console.error('❌ Error fetching task comments:', {
              error: commentError.message,
              code: commentError.code,
              allTaskIds
            });
            // Continue without comments rather than failing the entire request
          }
        }
        
        // Attach comments to tasks
        const tasksWithComments = (project.tasks || []).map(task => ({
          ...task,
          comments: taskCommentsMap[task.id] || [],
          subtasks: (task.subtasks || []).map(subtask => ({
            ...subtask,
            comments: taskCommentsMap[subtask.id] || []
          }))
        }));
        
        // Load data from separate tables (these are not relations in Prisma schema)
        // Query them separately and use table data instead of JSON fields
        let taskLists = [];
        let projectComments = [];
        let projectDocuments = [];
        let projectTeamMembers = [];
        let projectCustomFieldDefinitions = [];
        let projectActivityLogs = [];
        
        try {
          // Load task lists from ProjectTaskList table
          taskLists = await prisma.projectTaskList.findMany({
            where: { projectId: id },
            orderBy: { order: 'asc' }
          });
        } catch (e) {
          console.warn('⚠️ Failed to load task lists from table:', e.message);
        }
        
        try {
          // Load comments from ProjectComment table
          projectComments = await prisma.projectComment.findMany({
            where: { 
              projectId: id,
              parentId: null // Only top-level comments
            },
            include: {
              authorUser: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              replies: {
                include: {
                  authorUser: {
                    select: {
                      id: true,
                      name: true,
                      email: true
                    }
                  }
                },
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: { createdAt: 'asc' }
          });
        } catch (e) {
          console.warn('⚠️ Failed to load project comments from table:', e.message);
        }
        
        try {
          // Load documents from ProjectDocument table
          projectDocuments = await prisma.projectDocument.findMany({
            where: { 
              projectId: id,
              isActive: true
            },
            include: {
              uploader: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            },
            orderBy: { uploadDate: 'desc' }
          });
        } catch (e) {
          console.warn('⚠️ Failed to load project documents from table:', e.message);
        }
        
        try {
          // Load team members from ProjectTeamMember table
          projectTeamMembers = await prisma.projectTeamMember.findMany({
            where: { projectId: id },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              adder: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            },
            orderBy: { addedDate: 'asc' }
          });
        } catch (e) {
          console.warn('⚠️ Failed to load project team members from table:', e.message);
        }
        
        try {
          // Load custom field definitions from ProjectCustomFieldDefinition table
          projectCustomFieldDefinitions = await prisma.projectCustomFieldDefinition.findMany({
            where: { projectId: id },
            orderBy: { order: 'asc' }
          });
        } catch (e) {
          console.warn('⚠️ Failed to load project custom field definitions from table:', e.message);
        }
        
        try {
          // Load activity logs from ProjectActivityLog table (limit to most recent 50)
          projectActivityLogs = await prisma.projectActivityLog.findMany({
            where: { projectId: id },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
          });
        } catch (e) {
          console.warn('⚠️ Failed to load project activity logs from table:', e.message);
        }
        
        // Convert table data to JSON format that frontend expects
        // Frontend components expect year-based objects: { "2024": [...], "2025": [...] }
        let documentSectionsJson = null;
        let weeklyFMSReviewSectionsJson = null;
        
        try {
          // Convert documentSections from table to JSON format
          documentSectionsJson = await documentSectionsToJson(id);
          console.log('📊 GET /api/projects/[id]: documentSectionsToJson result:', {
            projectId: id,
            hasData: !!documentSectionsJson,
            isObject: typeof documentSectionsJson === 'object',
            keys: documentSectionsJson ? Object.keys(documentSectionsJson) : [],
            yearCount: documentSectionsJson ? Object.keys(documentSectionsJson).length : 0
          });
          
          // If no table data, fallback to JSON field if it exists
          if (!documentSectionsJson && project.documentSections) {
            try {
              if (typeof project.documentSections === 'string') {
                documentSectionsJson = JSON.parse(project.documentSections);
              } else {
                documentSectionsJson = project.documentSections;
              }
              console.log('📊 GET /api/projects/[id]: Using JSON field fallback for documentSections');
            } catch (e) {
              console.warn('⚠️ Failed to parse documentSections JSON field:', e.message);
              documentSectionsJson = {};
            }
          }
          
          // Ensure we always return an object (not null)
          if (!documentSectionsJson) {
            documentSectionsJson = {};
          }
        } catch (e) {
          console.error('❌ Failed to convert documentSections from table:', e);
          // Fallback to JSON field
          if (project.documentSections) {
            try {
              if (typeof project.documentSections === 'string') {
                documentSectionsJson = JSON.parse(project.documentSections);
              } else {
                documentSectionsJson = project.documentSections;
              }
            } catch (parseError) {
              console.error('❌ Failed to parse documentSections JSON field:', parseError);
              documentSectionsJson = {};
            }
          } else {
            documentSectionsJson = {};
          }
        }
        
        try {
          // Convert weeklyFMSReviewSections from table to JSON format
          weeklyFMSReviewSectionsJson = await weeklyFMSReviewSectionsToJson(id);
          console.log('📊 GET /api/projects/[id]: weeklyFMSReviewSectionsToJson result:', {
            projectId: id,
            hasData: !!weeklyFMSReviewSectionsJson,
            isObject: typeof weeklyFMSReviewSectionsJson === 'object',
            keys: weeklyFMSReviewSectionsJson ? Object.keys(weeklyFMSReviewSectionsJson) : [],
            yearCount: weeklyFMSReviewSectionsJson ? Object.keys(weeklyFMSReviewSectionsJson).length : 0
          });
          
          // If no table data, fallback to JSON field if it exists
          if (!weeklyFMSReviewSectionsJson && project.weeklyFMSReviewSections) {
            try {
              if (typeof project.weeklyFMSReviewSections === 'string') {
                weeklyFMSReviewSectionsJson = JSON.parse(project.weeklyFMSReviewSections);
              } else {
                weeklyFMSReviewSectionsJson = project.weeklyFMSReviewSections;
              }
              console.log('📊 GET /api/projects/[id]: Using JSON field fallback for weeklyFMSReviewSections');
            } catch (e) {
              console.warn('⚠️ Failed to parse weeklyFMSReviewSections JSON field:', e.message);
              weeklyFMSReviewSectionsJson = {};
            }
          }
          
          // Ensure we always return an object (not null)
          if (!weeklyFMSReviewSectionsJson) {
            weeklyFMSReviewSectionsJson = {};
          }
        } catch (e) {
          console.error('❌ Failed to convert weeklyFMSReviewSections from table:', e);
          // Fallback to JSON field
          if (project.weeklyFMSReviewSections) {
            try {
              if (typeof project.weeklyFMSReviewSections === 'string') {
                weeklyFMSReviewSectionsJson = JSON.parse(project.weeklyFMSReviewSections);
              } else {
                weeklyFMSReviewSectionsJson = project.weeklyFMSReviewSections;
              }
            } catch (parseError) {
              console.error('❌ Failed to parse weeklyFMSReviewSections JSON field:', parseError);
              weeklyFMSReviewSectionsJson = {};
            }
          } else {
            weeklyFMSReviewSectionsJson = {};
          }
        }
        
        // Transform project - use table data instead of JSON fields
        // Frontend expects these field names, so map table data to them
        const transformedProject = {
          ...project,
          // Map table data to expected field names (for frontend compatibility)
          tasksList: tasksWithComments, // Tasks from Task table with comments attached
          taskLists: taskLists, // Task lists from ProjectTaskList table
          customFieldDefinitions: projectCustomFieldDefinitions, // Custom fields from ProjectCustomFieldDefinition table
          documents: projectDocuments, // Documents from ProjectDocument table
          comments: projectComments, // Comments from ProjectComment table
          activityLog: projectActivityLogs, // Activity logs from ProjectActivityLog table
          team: projectTeamMembers, // Team from ProjectTeamMember table
          // Document sections: converted from table to JSON format, or fallback to empty object
          documentSections: documentSectionsJson || {},
          weeklyFMSReviewSections: weeklyFMSReviewSectionsJson || {}
        };
        
        // Remove the table relation fields to avoid confusion (keep only transformed fields)
        delete transformedProject.tasks; // Use tasksList instead
        delete transformedProject.documentSectionsTable;
        delete transformedProject.weeklyFMSReviewSectionsTable;
        
        return ok(res, { project: transformedProject })
      } catch (dbError) {
        console.error('❌ Database error getting project:', {
          error: dbError.message,
          code: dbError.code,
          name: dbError.name,
          meta: dbError.meta,
          stack: dbError.stack,
          projectId: id,
          userRole: req.user?.role,
          userId: req.user?.sub
        })
        // Return more detailed error in development
        const errorMessage = process.env.NODE_ENV === 'development' 
          ? `Failed to get project: ${dbError.message} (Code: ${dbError.code || 'N/A'})`
          : 'Failed to get project'
        return serverError(res, errorMessage, dbError.message)
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
        // JSON fields completely removed - data now stored ONLY in separate tables:
        // - tasksList → Task table (via /api/tasks)
        // - taskLists → ProjectTaskList table (via /api/project-task-lists)
        // - customFieldDefinitions → ProjectCustomFieldDefinition table (via /api/project-custom-fields)
        // - team → ProjectTeamMember table (via /api/project-team-members)
        // - documents → ProjectDocument table (via /api/project-documents)
        // - comments → ProjectComment table (via /api/project-comments)
        // - activityLog → ProjectActivityLog table (via /api/project-activity-logs)
        // These fields are no longer stored in Project table - use dedicated APIs instead
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
      
      // Handle hasWeeklyFMSReviewProcess separately if provided - normalize to boolean
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
      
      // Check if project exists before updating
      const projectExists = await prisma.project.findUnique({ where: { id } })
      if (!projectExists) {
        console.error('❌ Project not found for update:', id)
        return notFound(res, 'Project not found')
      }
      
      try {
        const project = await prisma.project.update({ 
          where: { id }, 
          data: updateData 
        });
        
        // CRITICAL: Save documentSections and weeklyFMSReviewSections to tables
        // The GET endpoint reads from tables, so we must save to tables for persistence
        // Pass the original body value (could be string or object) - save functions handle both
        if (body.documentSections !== undefined && body.documentSections !== null) {
          try {
            console.log('💾 PUT /api/projects/[id]: Saving documentSections to table', {
              projectId: id,
              type: typeof body.documentSections,
              isString: typeof body.documentSections === 'string',
              length: typeof body.documentSections === 'string' ? body.documentSections.length : 'N/A',
              preview: typeof body.documentSections === 'string' ? body.documentSections.substring(0, 200) : JSON.stringify(body.documentSections).substring(0, 200)
            });
            // Pass the original body value - saveDocumentSectionsToTable handles string parsing
            await saveDocumentSectionsToTable(id, body.documentSections)
            console.log('✅ PUT /api/projects/[id]: Successfully saved documentSections to table');
          } catch (tableError) {
            console.error('❌ CRITICAL: Error saving documentSections to table:', {
              error: tableError.message,
              stack: tableError.stack,
              projectId: id,
              dataType: typeof body.documentSections
            });
            // Re-throw to fail the request - table save is critical for persistence
            throw new Error(`Failed to save documentSections to table: ${tableError.message}`);
          }
        }
        
        if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
          try {
            console.log('💾 PUT /api/projects/[id]: Saving weeklyFMSReviewSections to table', {
              projectId: id,
              type: typeof body.weeklyFMSReviewSections,
              isString: typeof body.weeklyFMSReviewSections === 'string',
              length: typeof body.weeklyFMSReviewSections === 'string' ? body.weeklyFMSReviewSections.length : 'N/A',
              preview: typeof body.weeklyFMSReviewSections === 'string' ? body.weeklyFMSReviewSections.substring(0, 200) : JSON.stringify(body.weeklyFMSReviewSections).substring(0, 200)
            });
            // Pass the original body value - saveWeeklyFMSReviewSectionsToTable handles string parsing
            await saveWeeklyFMSReviewSectionsToTable(id, body.weeklyFMSReviewSections)
            console.log('✅ PUT /api/projects/[id]: Successfully saved weeklyFMSReviewSections to table');
          } catch (tableError) {
            console.error('❌ CRITICAL: Error saving weeklyFMSReviewSections to table:', {
              error: tableError.message,
              stack: tableError.stack,
              projectId: id,
              dataType: typeof body.weeklyFMSReviewSections
            });
            // Re-throw to fail the request - table save is critical for persistence
            throw new Error(`Failed to save weeklyFMSReviewSections to table: ${tableError.message}`);
          }
        }
        
        return ok(res, { project })
      } catch (dbError) {
        console.error('❌ Database error updating project:', dbError)
        // Check if it's a "record not found" error (P2025)
        if (dbError.code === 'P2025') {
          return notFound(res, 'Project not found')
        }
        return serverError(res, 'Failed to update project', dbError.message)
      }
    }

    // Delete Project (DELETE /api/projects/[id])
    if (req.method === 'DELETE') {
      try {
        console.log('🗑️ DELETE Project request:', {
          id,
          reqParams: req.params,
          url: req.url,
          pathname: req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : 'N/A',
          pathSegments: req.url ? new URL(req.url, `http://${req.headers.host}`).pathname.split('/').filter(Boolean) : []
        })
        
        // Check if project exists first
        const projectExists = await prisma.project.findUnique({ where: { id } })
        console.log('🔍 Project lookup result:', {
          id,
          found: !!projectExists,
          projectName: projectExists?.name || 'N/A'
        })
        
        if (!projectExists) {
          console.error('❌ Project not found for deletion:', {
            id,
            idType: typeof id,
            idLength: id?.length,
            reqParams: req.params,
            url: req.url
          })
          return notFound(res, 'Project not found')
        }
        
        // Ensure referential integrity by removing dependents first, then the project
        
        // Delete all related records in a transaction (cascade will handle most, but be explicit)
        await prisma.$transaction(async (tx) => {
          // Delete related table records (cascade may handle some, but be explicit for safety)
          // Tasks (cascade should handle this, but explicit for clarity)
          await tx.task.updateMany({ 
            where: { projectId: id },
            data: { parentTaskId: null }
          });
          await tx.task.deleteMany({ where: { projectId: id } });
          
          // Project comments (cascade should handle)
          await tx.projectComment.deleteMany({ where: { projectId: id } });
          
          // Project activity logs (cascade should handle)
          await tx.projectActivityLog.deleteMany({ where: { projectId: id } });
          
          // Project documents (cascade should handle)
          await tx.projectDocument.deleteMany({ where: { projectId: id } });
          
          // Project team members (cascade should handle)
          await tx.projectTeamMember.deleteMany({ where: { projectId: id } });
          
          // Project task lists (cascade should handle)
          await tx.projectTaskList.deleteMany({ where: { projectId: id } });
          
          // Project custom field definitions (cascade should handle)
          await tx.projectCustomFieldDefinition.deleteMany({ where: { projectId: id } });
          
          // Delete invoices
          await tx.invoice.deleteMany({ where: { projectId: id } });
          
          // Delete time entries
          await tx.timeEntry.deleteMany({ where: { projectId: id } });
          
          // Delete the project (cascade should handle document sections and weekly FMS sections)
          await tx.project.delete({ where: { id } });
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
        // Check if it's a "record not found" error (P2025)
        if (dbError.code === 'P2025') {
          return notFound(res, 'Project not found')
        }
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
