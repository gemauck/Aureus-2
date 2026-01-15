// API endpoints for Tasks
// This uses the Task table instead of storing tasks in JSON

import { authRequired } from './_lib/authRequired.js';
import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';
import { parseJsonBody } from './_lib/body.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';

// Helper to safely parse JSON fields from database
function safeParseJson(value, defaultValue = null) {
  if (!value || value === 'null' || value === '') {
    return defaultValue ?? (Array.isArray(defaultValue) ? [] : {});
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.warn('Failed to parse JSON field:', e.message);
      return defaultValue ?? (Array.isArray(defaultValue) ? [] : {});
    }
  }
  return value;
}

// Transform comment to frontend format
function transformComment(comment) {
  return {
    id: comment.id,
    text: comment.text,
    author: comment.author || '',
    authorId: comment.authorId || null,
    userName: comment.userName || comment.author || '',
    timestamp: comment.createdAt.toISOString(),
    date: comment.createdAt.toLocaleString(),
    createdAt: comment.createdAt.toISOString()
  };
}

// Transform subtask to frontend format
function transformSubtask(subtask) {
  return {
    id: subtask.id,
    title: subtask.title,
    description: subtask.description || '',
    status: subtask.status,
    priority: subtask.priority || 'Medium',
    ...(subtask.comments && {
      comments: subtask.comments.map(transformComment)
    })
  };
}

// Transform task to frontend format (with optional includeComments and includeSubtasks)
function transformTask(task, options = {}) {
  const { includeComments = true, includeSubtasks = true } = options;
  
  const transformed = {
    id: task.id,
    title: task.title,
    description: task.description || '',
    status: task.status,
    priority: task.priority || 'Medium',
    assignee: task.assignee || task.assigneeUser?.name || '',
    assigneeId: task.assigneeId,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    listId: task.listId,
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours,
    blockedBy: task.blockedBy || '',
    tags: safeParseJson(task.tags, []),
    attachments: safeParseJson(task.attachments, []),
    checklist: safeParseJson(task.checklist, []),
    dependencies: safeParseJson(task.dependencies, []),
    subscribers: safeParseJson(task.subscribers, []),
    customFields: safeParseJson(task.customFields, {}),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };

  // Include projectId if available
  if (task.projectId) {
    transformed.projectId = task.projectId;
  }

  // Include project information if available (for dashboard)
  if (task.project) {
    transformed.project = {
      id: task.project.id,
      name: task.project.name,
      clientName: task.project.clientName || ''
    };
  }

  // Include comments if requested and available
  if (includeComments && task.comments) {
    transformed.comments = task.comments.map(transformComment);
  }

  // Include subtasks if requested and available
  if (includeSubtasks && task.subtasks) {
    transformed.subtasks = task.subtasks.map(transformSubtask);
  }

  return transformed;
}

// Helper to get assignee name from assigneeId
async function getAssigneeName(assigneeId) {
  if (!assigneeId) return '';
  try {
    const user = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { name: true }
    });
    return user?.name || '';
  } catch (e) {
    console.warn('Failed to fetch assignee name:', e.message);
    return '';
  }
}

async function handler(req, res) {
  const { method } = req;
  const { id: taskId, projectId, lightweight, includeComments } = req.query;
  const userId = req.user?.sub;
  const isLightweight = lightweight === 'true' || lightweight === true;
  const shouldIncludeComments = includeComments === 'true' || includeComments === true;

  try {
    if (method === 'GET') {
      // Get single task by ID
      if (taskId) {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            assigneeUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            subtasks: {
              orderBy: { createdAt: 'asc' }
            }
          }
        });

        if (!task) {
          return notFound(res, 'Task not found');
        }

        // Fetch comments separately (since Task.comments relation doesn't exist yet)
        const allTaskIds = [
          task.id,
          ...(task.subtasks || []).map(st => st.id)
        ];

        const taskCommentsMap = {};
        if (allTaskIds.length > 0) {
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
        }

        // Attach comments manually
        const taskWithComments = {
          ...task,
          comments: taskCommentsMap[task.id] || [],
          subtasks: (task.subtasks || []).map(subtask => ({
            ...subtask,
            comments: taskCommentsMap[subtask.id] || []
          }))
        };

        return ok(res, { task: transformTask(taskWithComments) });
      }
      
      // Get tasks for a specific project
      if (projectId) {
        try {
          // Validate projectId is not empty
          const sanitizedProjectId = String(projectId).trim();
          if (!sanitizedProjectId) {
            return badRequest(res, 'Invalid projectId parameter');
          }

          // Fetch tasks (Task model doesn't have comments relation yet, so fetch them separately)
          const tasks = await prisma.task.findMany({
            where: { 
              projectId: sanitizedProjectId,
              parentTaskId: null // Only top-level tasks (subtasks included via relation)
            },
            include: {
              assigneeUser: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              subtasks: {
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: { createdAt: 'asc' }
          }).catch(dbError => {
            // Handle specific Prisma errors
            if (dbError.code === 'P2003') {
              console.error('❌ Foreign key constraint violation:', {
                projectId: sanitizedProjectId,
                error: dbError.message
              });
              // Return empty tasks array if project doesn't exist (non-critical)
              return [];
            }
            // Re-throw other database errors
            throw dbError;
          });

          // OPTIMIZATION: Only fetch comments if explicitly requested (default: skip for speed)
          const taskCommentsMap = {};
          if (shouldIncludeComments) {
            // Fetch all task IDs (including subtasks) to get comments
            const allTaskIds = [
              ...(tasks || []).map(t => t.id),
              ...(tasks || []).flatMap(t => ((t.subtasks || [])).map(st => st.id))
            ];

            // Fetch comments separately (since Task.comments relation doesn't exist yet)
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
                (taskComments || []).forEach(comment => {
                  if (!taskCommentsMap[comment.taskId]) {
                    taskCommentsMap[comment.taskId] = [];
                  }
                  taskCommentsMap[comment.taskId].push(comment);
                });
              } catch (commentsError) {
                // Log but don't fail the entire request if comments can't be fetched
                console.warn('⚠️ Failed to fetch task comments, continuing without comments:', {
                  error: commentsError.message,
                  taskIds: allTaskIds
                });
              }
            }
          }

          // Attach comments to tasks manually (empty arrays if comments not loaded)
          const tasksWithComments = (tasks || []).map(task => ({
            ...task,
            comments: taskCommentsMap[task.id] || [],
            subtasks: (task.subtasks || []).map(subtask => ({
              ...subtask,
              comments: taskCommentsMap[subtask.id] || []
            }))
          }));

          return ok(res, { 
            tasks: tasksWithComments.map(task => transformTask(task, { 
              includeComments: shouldIncludeComments 
            })) 
          });
        } catch (queryError) {
          console.error('❌ Database query error getting tasks by projectId:', {
            projectId,
            error: queryError.message,
            code: queryError.code,
            meta: queryError.meta,
            stack: queryError.stack
          });
          
          // Handle specific Prisma errors
          if (queryError.code === 'P2025') {
            // Record not found - return empty array instead of error
            return ok(res, { tasks: [] });
          }
          
          // Re-throw to be caught by outer try-catch
          throw queryError;
        }
      }
      
      // Lightweight mode: return tasks assigned to current user (for dashboard)
      if (isLightweight) {
        if (!userId) {
          return badRequest(res, 'User not authenticated');
        }
        
        console.log('📋 Loading project tasks for dashboard:', { userId, isLightweight });
        
        // First, fetch tasks where user is assignee (most common case)
        const assigneeTasks = await prisma.task.findMany({
          where: {
            assigneeId: userId,
            parentTaskId: null // Only top-level tasks
          },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            assignee: true,
            assigneeId: true,
            dueDate: true,
            projectId: true,
            listId: true,
            estimatedHours: true,
            actualHours: true,
            blockedBy: true,
            tags: true,
            attachments: true,
            checklist: true,
            dependencies: true,
            subscribers: true,
            customFields: true,
            createdAt: true,
            updatedAt: true,
            assigneeUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            project: {
              select: {
                id: true,
                name: true,
                clientName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50 // Limit results for performance
        });

        // Also fetch tasks where user might be a subscriber (if we have room)
        // Since subscribers is stored as JSON, we need to fetch and filter
        let subscriberTasks = [];
        if (assigneeTasks.length < 50) {
          try {
            const tasksWithSubscribers = await prisma.task.findMany({
              where: {
                subscribers: { not: null },
                parentTaskId: null,
                assigneeId: { not: userId } // Exclude tasks already fetched
              },
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                assignee: true,
                assigneeId: true,
                dueDate: true,
                projectId: true,
                listId: true,
                estimatedHours: true,
                actualHours: true,
                blockedBy: true,
                tags: true,
                attachments: true,
                checklist: true,
                dependencies: true,
                subscribers: true,
                customFields: true,
                createdAt: true,
                updatedAt: true,
                assigneeUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                },
                project: {
                  select: {
                    id: true,
                    name: true,
                    clientName: true
                  }
                }
              },
              orderBy: { createdAt: 'desc' },
              take: 100 // Fetch more to filter
            });

            // Filter tasks where user is in subscribers array
            subscriberTasks = tasksWithSubscribers.filter(task => {
              try {
                const subscribers = safeParseJson(task.subscribers, []);
                return Array.isArray(subscribers) && subscribers.includes(userId);
              } catch (e) {
                return false;
              }
            }).slice(0, 50 - assigneeTasks.length); // Only take what we need
          } catch (e) {
            console.warn('⚠️ Error fetching subscriber tasks:', e.message);
          }
        }

        // Combine assignee and subscriber tasks
        const tasks = [...assigneeTasks, ...subscriberTasks].slice(0, 50);

        console.log('📋 Found project tasks:', tasks.length, '(assignee:', assigneeTasks.length, ', subscriber:', subscriberTasks.length, ') for userId:', userId);
        
        const transformedTasks = tasks.map(task => transformTask(task, { 
          includeComments: false, 
          includeSubtasks: false 
        }));
        
        console.log('📋 Transformed project tasks:', transformedTasks.length);
        
        return ok(res, { 
          tasks: transformedTasks
        });
      }
      
      return badRequest(res, 'Missing taskId, projectId, or lightweight parameter');
    }

    if (method === 'POST') {
      // Create a new task
      const body = await parseJsonBody(req);
      const { 
        projectId, 
        title, 
        description = '', 
        status = 'todo', 
        priority = 'Medium', 
        assignee, 
        assigneeId, 
        dueDate, 
        listId, 
        estimatedHours, 
        actualHours, 
        blockedBy = '', 
        tags = [], 
        attachments = [], 
        checklist = [], 
        dependencies = [], 
        subscribers = [], 
        customFields = {}, 
        parentTaskId 
      } = body;

      // Validation
      if (!projectId || !title || !title.trim()) {
        return badRequest(res, 'Missing required fields: projectId and title are required');
      }

      // Get assignee name if assigneeId provided but assignee name not provided
      let assigneeName = assignee?.trim() || '';
      if (assigneeId && !assigneeName) {
        assigneeName = await getAssigneeName(assigneeId);
      }

      const task = await prisma.task.create({
        data: {
          projectId: String(projectId),
          parentTaskId: parentTaskId ? String(parentTaskId) : null,
          title: String(title).trim(),
          description: String(description || ''),
          status: String(status || 'todo'),
          priority: String(priority || 'Medium'),
          assigneeId: assigneeId || null,
          assignee: assigneeName,
          dueDate: dueDate ? new Date(dueDate) : null,
          listId: listId ? parseInt(String(listId), 10) : null,
          estimatedHours: estimatedHours ? parseFloat(String(estimatedHours)) : null,
          actualHours: actualHours ? parseFloat(String(actualHours)) : null,
          blockedBy: String(blockedBy || ''),
          tags: JSON.stringify(Array.isArray(tags) ? tags : []),
          attachments: JSON.stringify(Array.isArray(attachments) ? attachments : []),
          checklist: JSON.stringify(Array.isArray(checklist) ? checklist : []),
          dependencies: JSON.stringify(Array.isArray(dependencies) ? dependencies : []),
          subscribers: JSON.stringify(Array.isArray(subscribers) ? subscribers : []),
          customFields: JSON.stringify(typeof customFields === 'object' && customFields !== null ? customFields : {})
        },
        include: {
          assigneeUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      console.log('✅ Created task:', {
        taskId: task.id,
        projectId: task.projectId,
        title: task.title
      });

      return ok(res, { task: transformTask(task, { includeComments: false, includeSubtasks: false }) });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a task
      if (!taskId) {
        return badRequest(res, 'Missing taskId parameter');
      }

      const body = await parseJsonBody(req);
      const updateData = {};
      
      // Build update data object with proper type conversions
      if (body.title !== undefined) {
        const trimmed = String(body.title).trim();
        if (!trimmed) {
          return badRequest(res, 'Title cannot be empty');
        }
        updateData.title = trimmed;
      }
      if (body.description !== undefined) updateData.description = String(body.description || '');
      if (body.status !== undefined) updateData.status = String(body.status);
      if (body.priority !== undefined) updateData.priority = String(body.priority);
      if (body.assigneeId !== undefined) {
        updateData.assigneeId = body.assigneeId || null;
      }
      if (body.assignee !== undefined) {
        updateData.assignee = String(body.assignee || '');
      }
      if (body.dueDate !== undefined) {
        updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      }
      if (body.listId !== undefined) {
        updateData.listId = body.listId ? parseInt(String(body.listId), 10) : null;
      }
      if (body.estimatedHours !== undefined) {
        updateData.estimatedHours = body.estimatedHours ? parseFloat(String(body.estimatedHours)) : null;
      }
      if (body.actualHours !== undefined) {
        updateData.actualHours = body.actualHours ? parseFloat(String(body.actualHours)) : null;
      }
      if (body.blockedBy !== undefined) {
        updateData.blockedBy = String(body.blockedBy || '');
      }
      if (body.tags !== undefined) {
        updateData.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);
      }
      if (body.attachments !== undefined) {
        updateData.attachments = JSON.stringify(Array.isArray(body.attachments) ? body.attachments : []);
      }
      if (body.checklist !== undefined) {
        updateData.checklist = JSON.stringify(Array.isArray(body.checklist) ? body.checklist : []);
      }
      if (body.dependencies !== undefined) {
        updateData.dependencies = JSON.stringify(Array.isArray(body.dependencies) ? body.dependencies : []);
      }
      if (body.subscribers !== undefined) {
        updateData.subscribers = JSON.stringify(Array.isArray(body.subscribers) ? body.subscribers : []);
      }
      if (body.customFields !== undefined) {
        updateData.customFields = JSON.stringify(
          typeof body.customFields === 'object' && body.customFields !== null 
            ? body.customFields 
            : {}
        );
      }
      if (body.parentTaskId !== undefined) {
        updateData.parentTaskId = body.parentTaskId ? String(body.parentTaskId) : null;
      }

      // Get assignee name if assigneeId changed but assignee not provided
      if (updateData.assigneeId && !updateData.assignee) {
        updateData.assignee = await getAssigneeName(updateData.assigneeId);
      }

      if (Object.keys(updateData).length === 0) {
        return badRequest(res, 'No fields to update');
      }

      // Check if task exists before updating
      const existingTask = await prisma.task.findUnique({
        where: { id: String(taskId) },
        select: { id: true }
      });

      if (!existingTask) {
        return notFound(res, 'Task not found');
      }

      const task = await prisma.task.update({
        where: { id: String(taskId) },
        data: updateData,
        include: {
          assigneeUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Fetch comments separately (since Task.comments relation doesn't exist yet)
      const taskComments = await prisma.taskComment.findMany({
        where: { taskId: task.id },
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

      const taskWithComments = {
        ...task,
        comments: taskComments || []
      };

      return ok(res, { task: transformTask(taskWithComments, { includeSubtasks: false }) });
    }

    if (method === 'DELETE') {
      // Delete a task (cascade will delete subtasks and comments)
      if (!taskId) {
        return badRequest(res, 'Missing taskId parameter');
      }

      // Check if task exists before attempting deletion
      const existingTask = await prisma.task.findUnique({
        where: { id: String(taskId) },
        select: { id: true, title: true, projectId: true }
      });

      if (!existingTask) {
        return notFound(res, 'Task not found');
      }

      await prisma.task.delete({
        where: { id: String(taskId) }
      });

      console.log('✅ Deleted task:', {
        taskId,
        title: existingTask.title,
        projectId: existingTask.projectId
      });

      return ok(res, { 
        message: 'Task deleted successfully',
        deletedTaskId: taskId
      });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Task API error:', error);
    
    // Handle Prisma-specific errors
    if (error.code === 'P2025') {
      return notFound(res, 'Task not found');
    }
    if (error.code === 'P2002') {
      return badRequest(res, 'Unique constraint violation');
    }
    
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));
