// API endpoints for Tasks
// This uses the Task table instead of storing tasks in JSON

import { authRequired } from './_lib/authRequired.js';
import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';
import { parseJsonBody } from './_lib/body.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';
import { formatInSAST } from './_lib/sastDate.js';
import { createNotificationForUser } from './notifications.js';
import { logProjectActivity, getActivityUserFromRequest } from './_lib/projectActivityLog.js';

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
    date: formatInSAST(comment.createdAt),
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
    assigneeIds: safeParseJson(task.assigneeIds, []),
    startDate: task.startDate ? task.startDate.toISOString() : null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    reminderRecurrence: task.reminderRecurrence || null,
    lastReminderSentAt: task.lastReminderSentAt ? task.lastReminderSentAt.toISOString() : null,
    listId: task.listId,
    order: task.order != null ? task.order : 0,
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

// Resolve assignee name or email to userId (for PATCH when client sends assignee but not assigneeId)
async function resolveAssigneeToUserId(assignee) {
  const s = (assignee && String(assignee).trim()) || '';
  if (!s) return null;
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { name: { equals: s, mode: 'insensitive' } },
          { email: { equals: s, mode: 'insensitive' } }
        ]
      },
      select: { id: true, name: true }
    });
    return user ? { id: user.id, name: user.name || '' } : null;
  } catch (e) {
    console.warn('Failed to resolve assignee to user:', e.message);
    return null;
  }
}

async function handler(req, res) {
  const { method } = req;
  const { id: taskId, projectId, lightweight, includeComments, all: allParam } = req.query;
  const userId = req.user?.sub;
  const isLightweight = lightweight === 'true' || lightweight === true;
  const shouldIncludeComments = includeComments === 'true' || includeComments === true;
  const isAllTasks = allParam === 'true' || allParam === true;

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
              orderBy: [{ createdAt: 'asc' }]
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

        const transformed = transformTask(taskWithComments);
        // Single source of truth: always set assignee from User table when assigneeId is set
        if (transformed.assigneeId) {
          transformed.assignee = await getAssigneeName(transformed.assigneeId);
        }
        return ok(res, { task: transformed });
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
                orderBy: [{ createdAt: 'asc' }]
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

          // Single source of truth: resolve assignee from User table for every task with assigneeId
          const allAssigneeIds = [...new Set(tasksWithComments.map(t => t.assigneeId).filter(Boolean))];
          let assigneeNamesMap = {};
          if (allAssigneeIds.length > 0) {
            const users = await prisma.user.findMany({
              where: { id: { in: allAssigneeIds } },
              select: { id: true, name: true }
            });
            users.forEach(u => { assigneeNamesMap[u.id] = u.name || ''; });
          }
          return ok(res, {
            tasks: tasksWithComments.map(task => {
              const transformed = transformTask(task, { includeComments: shouldIncludeComments });
              if (transformed.assigneeId && assigneeNamesMap[transformed.assigneeId] !== undefined) {
                transformed.assignee = assigneeNamesMap[transformed.assigneeId] || '';
              }
              return transformed;
            })
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
      
      // All tasks mode: return all tasks across all projects (for Projects "All Tasks" view)
      if (isAllTasks) {
        if (!userId) {
          return badRequest(res, 'User not authenticated');
        }
        try {
          const tasks = await prisma.task.findMany({
            where: { parentTaskId: null },
            include: {
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
            orderBy: [{ updatedAt: 'desc' }],
            take: 500
          });
          // Always resolve assignee names from User table for every task with assigneeId
          // (avoids relying on assigneeUser relation which can be null in some edge cases)
          const allAssigneeIds = [...new Set(tasks.map(t => t.assigneeId).filter(Boolean))];
          let assigneeNames = {};
          if (allAssigneeIds.length > 0) {
            const users = await prisma.user.findMany({
              where: { id: { in: allAssigneeIds } },
              select: { id: true, name: true }
            });
            users.forEach(u => { assigneeNames[u.id] = u.name || ''; });
          }
          const transformedTasks = tasks.map(task => {
            const transformed = transformTask(task, {
              includeComments: false,
              includeSubtasks: false
            });
            if (transformed.assigneeId && assigneeNames[transformed.assigneeId] !== undefined) {
              transformed.assignee = assigneeNames[transformed.assigneeId] || '';
            }
            return transformed;
          });
          return ok(res, { tasks: transformedTasks });
        } catch (queryError) {
          console.error('❌ Error fetching all tasks:', queryError.message);
          throw queryError;
        }
      }
      
      // Lightweight mode: return tasks assigned to current user (for dashboard)
      if (isLightweight) {
        if (!userId) {
          return badRequest(res, 'User not authenticated');
        }
        
        console.log('📋 Loading project tasks for dashboard:', { userId, isLightweight });
        
        // Debug: Check if any tasks exist at all
        const totalTasks = await prisma.task.count({
          where: { parentTaskId: null }
        });
        const assignedToUser = await prisma.task.count({
          where: { assigneeId: userId, parentTaskId: null }
        });
        console.log('📊 Task counts:', { totalTasks, assignedToUser, userId });
        
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
        assigneeIds: bodyAssigneeIds, 
        startDate, 
        dueDate, 
        reminderRecurrence, 
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

      // Notify assignees unless explicitly disabled (omit field = notify, for API compatibility)
      const sendNotifications = body.sendNotifications !== false;

      // Validation
      if (!projectId || !title || !title.trim()) {
        return badRequest(res, 'Missing required fields: projectId and title are required');
      }

      // Resolve assignees: support assigneeIds[] (multi) or legacy assigneeId/assignee (single)
      const rawIds = Array.isArray(bodyAssigneeIds) && bodyAssigneeIds.length > 0
        ? bodyAssigneeIds.filter(Boolean).map((id) => String(id))
        : (assigneeId ? [String(assigneeId)] : assignee && String(assignee).trim() ? [] : []);
      if (assignee && String(assignee).trim() && rawIds.length === 0) {
        const resolved = await resolveAssigneeToUserId(assignee);
        if (resolved) rawIds.push(resolved.id);
      }
      const assigneeIdsFinal = [...new Set(rawIds)].filter(Boolean);
      let assigneeIdFinal = assigneeIdsFinal[0] || null;
      let assigneeName = '';
      if (assigneeIdsFinal.length > 0) {
        const names = await Promise.all(assigneeIdsFinal.map((id) => getAssigneeName(id)));
        assigneeName = names.filter(Boolean).join(', ') || (await getAssigneeName(assigneeIdFinal)) || '';
      } else if (assigneeIdFinal) {
        assigneeName = await getAssigneeName(assigneeIdFinal);
      }

      const task = await prisma.task.create({
        data: {
          projectId: String(projectId),
          parentTaskId: parentTaskId ? String(parentTaskId) : null,
          title: String(title).trim(),
          description: String(description || ''),
          status: String(status || 'todo'),
          priority: String(priority || 'Medium'),
          assigneeId: assigneeIdFinal || null,
          assignee: assigneeName,
          assigneeIds: JSON.stringify(assigneeIdsFinal),
          startDate: startDate ? new Date(startDate) : null,
          dueDate: dueDate ? new Date(dueDate) : null,
          reminderRecurrence: (reminderRecurrence && ['daily', 'weekly'].includes(String(reminderRecurrence))) ? String(reminderRecurrence) : null,
          listId: listId ? parseInt(String(listId), 10) : null,
          order: body.order != null ? parseInt(String(body.order), 10) : 0,
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

      const { userId: activityUserId, userName: activityUserName } = getActivityUserFromRequest(req);
      await logProjectActivity(prisma, {
        projectId: task.projectId,
        userId: activityUserId,
        userName: activityUserName,
        type: 'task_created',
        description: `Task created: ${task.title}`,
        metadata: { entityType: 'task', entityId: task.id, taskTitle: task.title }
      });

      // Send email/in-app notifications to assignees when requested (avoid duplicate with client POST /notifications)
      if (sendNotifications && assigneeIdsFinal.length > 0) {
        const currentUserId = req.user?.sub || req.user?.id;
        let assignerName = 'Someone';
        if (currentUserId) {
          try {
            const u = await prisma.user.findUnique({ where: { id: currentUserId }, select: { name: true, email: true } });
            assignerName = u?.name || u?.email || assignerName;
          } catch (_) {}
        }
        const taskTitle = String(title).trim();
        const taskDescription = (description && String(description).trim()) ? String(description).trim().slice(0, 500) : '';
        const message = taskDescription
          ? `You have been assigned to "${taskTitle}". ${taskDescription}`
          : `You have been assigned to "${taskTitle}".`;
        const link = `#/projects/${task.projectId}?task=${task.id}`;
        for (const uid of assigneeIdsFinal) {
          try {
            await createNotificationForUser(uid, 'task', `You have been assigned to ${taskTitle}`, message, link, {
              projectId: task.projectId,
              taskId: task.id,
              taskTitle,
              taskDescription: taskDescription || null
            });
          } catch (notifyErr) {
            console.warn('Failed to notify assignee', uid, notifyErr?.message);
          }
        }
      }

      return ok(res, { task: transformTask(task, { includeComments: false, includeSubtasks: false }) });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a task
      if (!taskId) {
        return badRequest(res, 'Missing taskId parameter');
      }

      const body = await parseJsonBody(req);
      const sendNotifications = body.sendNotifications !== false;
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
        // Single source of truth: assignee always derived from User table
        if (updateData.assigneeId) {
          updateData.assignee = await getAssigneeName(updateData.assigneeId);
        } else {
          updateData.assignee = '';
        }
      }
      if (body.assignee !== undefined) {
        // When client sends assignee but not assigneeId, resolve to user so we store assigneeId + canonical assignee
        if (updateData.assigneeId == null) {
          const assigneeVal = String(body.assignee || '').trim();
          if (assigneeVal) {
            const resolved = await resolveAssigneeToUserId(assigneeVal);
            if (resolved) {
              updateData.assigneeId = resolved.id;
              updateData.assignee = resolved.name || await getAssigneeName(resolved.id);
            } else {
              updateData.assignee = assigneeVal;
            }
          } else {
            updateData.assigneeId = null;
            updateData.assignee = '';
          }
        }
      }
      if (body.assigneeIds !== undefined) {
        const ids = Array.isArray(body.assigneeIds) ? body.assigneeIds.filter(Boolean).map((id) => String(id)) : [];
        const assigneeIdsUnique = [...new Set(ids)];
        updateData.assigneeIds = JSON.stringify(assigneeIdsUnique);
        updateData.assigneeId = assigneeIdsUnique[0] || null;
        if (assigneeIdsUnique.length > 0) {
          const names = await Promise.all(assigneeIdsUnique.map((id) => getAssigneeName(id)));
          updateData.assignee = names.filter(Boolean).join(', ') || '';
        } else {
          updateData.assignee = '';
        }
      }
      if (body.startDate !== undefined) {
        if (body.startDate === null || body.startDate === undefined || body.startDate === '') {
          updateData.startDate = null;
        } else {
          const d = new Date(body.startDate);
          updateData.startDate = Number.isNaN(d.getTime()) ? null : d;
        }
      }
      if (body.dueDate !== undefined || body.due_date !== undefined) {
        const raw = body.dueDate !== undefined ? body.dueDate : body.due_date;
        if (raw === null || raw === undefined || raw === '') {
          updateData.dueDate = null;
        } else {
          const d = new Date(raw);
          updateData.dueDate = Number.isNaN(d.getTime()) ? null : d;
        }
      }
      if (body.reminderRecurrence !== undefined) {
        const val = body.reminderRecurrence;
        updateData.reminderRecurrence = (val && ['daily', 'weekly'].includes(String(val))) ? String(val) : null;
      }
      if (body.listId !== undefined) {
        updateData.listId = body.listId ? parseInt(String(body.listId), 10) : null;
      }
      if (body.order !== undefined) {
        updateData.order = parseInt(String(body.order), 10);
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

      if (Object.keys(updateData).length === 0) {
        return badRequest(res, 'No fields to update');
      }

      // Check if task exists and get current values for activity log diff
      const existingTask = await prisma.task.findUnique({
        where: { id: String(taskId) },
        select: {
          id: true,
          projectId: true,
          title: true,
          status: true,
          priority: true,
          assigneeId: true,
          assignee: true,
          assigneeIds: true,
          dueDate: true,
          description: true,
          listId: true
        }
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
          },
          project: {
            select: {
              id: true,
              name: true,
              clientName: true
            }
          }
        }
      });

      // Activity log: one entry per logical change (non-fatal)
      const { userId: activityUserId, userName: activityUserName } = getActivityUserFromRequest(req);
      const taskTitle = task.title || existingTask.title || '';
      const metaBase = { entityType: 'task', entityId: task.id, taskTitle };
      if (updateData.status !== undefined && String(updateData.status) !== String(existingTask.status)) {
        await logProjectActivity(prisma, {
          projectId: task.projectId,
          userId: activityUserId,
          userName: activityUserName,
          type: 'task_status_change',
          description: `Task status changed: ${existingTask.status || ''} → ${updateData.status}`,
          metadata: { ...metaBase, field: 'status', oldValue: existingTask.status, newValue: updateData.status }
        });
      }
      if ((updateData.assigneeId !== undefined || updateData.assignee !== undefined) &&
          (String(updateData.assigneeId || '') !== String(existingTask.assigneeId || '') || (updateData.assignee || '') !== (existingTask.assignee || ''))) {
        await logProjectActivity(prisma, {
          projectId: task.projectId,
          userId: activityUserId,
          userName: activityUserName,
          type: 'task_assignee_change',
          description: `Task assignee changed: ${existingTask.assignee || '(none)'} → ${task.assignee || '(none)'}`,
          metadata: { ...metaBase, field: 'assignee', oldValue: existingTask.assignee, newValue: task.assignee }
        });
      }
      if (updateData.title !== undefined && String(updateData.title).trim() !== String(existingTask.title || '').trim()) {
        await logProjectActivity(prisma, {
          projectId: task.projectId,
          userId: activityUserId,
          userName: activityUserName,
          type: 'task_field_updated',
          description: `Task title updated`,
          metadata: { ...metaBase, field: 'title', oldValue: existingTask.title, newValue: updateData.title }
        });
      }
      if (updateData.priority !== undefined && String(updateData.priority) !== String(existingTask.priority || '')) {
        await logProjectActivity(prisma, {
          projectId: task.projectId,
          userId: activityUserId,
          userName: activityUserName,
          type: 'task_field_updated',
          description: `Task priority changed: ${existingTask.priority || ''} → ${updateData.priority}`,
          metadata: { ...metaBase, field: 'priority', oldValue: existingTask.priority, newValue: updateData.priority }
        });
      }
      if (updateData.dueDate !== undefined) {
        const oldDue = existingTask.dueDate ? existingTask.dueDate.toISOString() : null;
        const newDue = updateData.dueDate ? (updateData.dueDate instanceof Date ? updateData.dueDate.toISOString() : new Date(updateData.dueDate).toISOString()) : null;
        if (oldDue !== newDue) {
          await logProjectActivity(prisma, {
            projectId: task.projectId,
            userId: activityUserId,
            userName: activityUserName,
            type: 'task_field_updated',
            description: `Task due date ${newDue ? 'updated' : 'cleared'}`,
            metadata: { ...metaBase, field: 'dueDate', oldValue: oldDue, newValue: newDue }
          });
        }
      }
      if (updateData.listId !== undefined && String(updateData.listId || '') !== String(existingTask.listId ?? '')) {
        await logProjectActivity(prisma, {
          projectId: task.projectId,
          userId: activityUserId,
          userName: activityUserName,
          type: 'task_field_updated',
          description: `Task list/column changed`,
          metadata: { ...metaBase, field: 'listId', oldValue: existingTask.listId, newValue: updateData.listId }
        });
      }

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

      // Send email/in-app notifications when task assignment changed and client did not disable notifications
      const assignmentWasUpdated = body.assigneeIds !== undefined || body.assigneeId !== undefined;
      if (sendNotifications && assignmentWasUpdated) {
        const newIds = body.assigneeIds !== undefined
          ? (Array.isArray(body.assigneeIds) ? body.assigneeIds : []).filter(Boolean).map((id) => String(id))
          : body.assigneeId ? [String(body.assigneeId)] : [];
        const newAssigneeSet = new Set(newIds);
        const oldRaw = existingTask.assigneeIds != null ? safeParseJson(existingTask.assigneeIds, []) : [];
        const oldIds = Array.isArray(oldRaw) && oldRaw.length > 0 ? oldRaw : (existingTask.assigneeId ? [String(existingTask.assigneeId)] : []);
        const oldAssigneeSet = new Set(oldIds.map((id) => String(id)));
        const newlyAdded = [...newAssigneeSet].filter((id) => !oldAssigneeSet.has(id));
        if (newlyAdded.length > 0) {
          const currentUserId = req.user?.sub || req.user?.id;
          let assignerName = 'Someone';
          if (currentUserId) {
            try {
              const u = await prisma.user.findUnique({ where: { id: currentUserId }, select: { name: true, email: true } });
              assignerName = u?.name || u?.email || assignerName;
            } catch (_) {}
          }
          const taskTitle = task.title || '';
          const taskDescription = (task.description && String(task.description).trim()) ? String(task.description).trim().slice(0, 500) : '';
          const message = taskDescription
            ? `You have been assigned to "${taskTitle}". ${taskDescription}`
            : `You have been assigned to "${taskTitle}".`;
          const link = `#/projects/${task.projectId}?task=${task.id}`;
          for (const uid of newlyAdded) {
            try {
              await createNotificationForUser(uid, 'task', `You have been assigned to ${taskTitle}`, message, link, {
                projectId: task.projectId,
                taskId: task.id,
                taskTitle,
                taskDescription: taskDescription || null
              });
            } catch (notifyErr) {
              console.warn('Failed to notify assignee', uid, notifyErr?.message);
            }
          }
        }
      }

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
