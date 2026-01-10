// API endpoints for Tasks
// This uses the Task table instead of storing tasks in JSON

import { authRequired } from './_lib/authRequired.js';
import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';

async function handler(req, res) {
  const { method } = req;
  const { id: taskId, projectId } = req.query;

  try {
    if (method === 'GET') {
      // Get tasks for a project or single task
      if (taskId) {
        // Get single task with comments
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
            comments: {
              orderBy: { createdAt: 'asc' },
              include: {
                authorUser: {
                select: {
                  id: true,
                  name: true,
                  email: true
                  }
                }
              }
            },
            subtasks: {
              include: {
                comments: {
                  orderBy: { createdAt: 'asc' }
                }
              },
              orderBy: { createdAt: 'asc' }
            }
          }
        });

        if (!task) {
          return notFound(res, 'Task not found');
        }

        // Transform to match frontend expected format
        const transformedTask = {
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
          tags: JSON.parse(task.tags || '[]'),
          attachments: JSON.parse(task.attachments || '[]'),
          checklist: JSON.parse(task.checklist || '[]'),
          dependencies: JSON.parse(task.dependencies || '[]'),
          subscribers: JSON.parse(task.subscribers || '[]'),
          customFields: JSON.parse(task.customFields || '{}'),
          comments: task.comments.map(c => ({
            id: c.id,
            text: c.text,
            author: c.author,
            authorId: c.authorId,
            userName: c.userName,
            timestamp: c.createdAt.toISOString(),
            date: c.createdAt.toLocaleString(),
            createdAt: c.createdAt.toISOString()
          })),
          subtasks: task.subtasks.map(st => ({
            id: st.id,
            title: st.title,
            description: st.description || '',
            status: st.status,
            priority: st.priority || 'Medium',
            comments: st.comments.map(c => ({
              id: c.id,
              text: c.text,
              author: c.author,
              timestamp: c.createdAt.toISOString()
            }))
          })),
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString()
        };

        return ok(res, { task: transformedTask });
      } else if (projectId) {
        // Get all tasks for a project
        const tasks = await prisma.task.findMany({
          where: { 
            projectId: String(projectId),
            parentTaskId: null // Only top-level tasks (subtasks are included via relation)
          },
          include: {
            assigneeUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            comments: {
              orderBy: { createdAt: 'asc' }
            },
            subtasks: {
              include: {
                comments: {
                  orderBy: { createdAt: 'asc' }
                }
              },
              orderBy: { createdAt: 'asc' }
            }
          },
          orderBy: { createdAt: 'asc' }
        });

        // Transform to match frontend expected format
        const transformedTasks = tasks.map(task => ({
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
          tags: JSON.parse(task.tags || '[]'),
          attachments: JSON.parse(task.attachments || '[]'),
          checklist: JSON.parse(task.checklist || '[]'),
          dependencies: JSON.parse(task.dependencies || '[]'),
          subscribers: JSON.parse(task.subscribers || '[]'),
          customFields: JSON.parse(task.customFields || '{}'),
          comments: task.comments.map(c => ({
            id: c.id,
            text: c.text,
            author: c.author,
            timestamp: c.createdAt.toISOString()
          })),
          subtasks: task.subtasks.map(st => ({
            id: st.id,
            title: st.title,
            description: st.description || '',
            status: st.status,
            priority: st.priority || 'Medium',
            comments: st.comments.map(c => ({
              id: c.id,
              text: c.text,
              author: c.author,
              timestamp: c.createdAt.toISOString()
            }))
          })),
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString()
        }));

        return ok(res, { tasks: transformedTasks });
      } else {
        return badRequest(res, 'Missing taskId or projectId parameter');
      }
    }

    if (method === 'POST') {
      // Create a new task
      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          console.error('❌ Failed to parse string body for task creation:', parseError);
          body = {};
        }
      }

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        try {
          body = JSON.parse(buffer.toString());
        } catch (e) {
          body = {};
        }
      }

      const { projectId, title, description, status, priority, assignee, assigneeId, dueDate, listId, estimatedHours, actualHours, blockedBy, tags, attachments, checklist, dependencies, subscribers, customFields, parentTaskId } = body;

      if (!projectId || !title) {
        return badRequest(res, 'Missing required fields: projectId and title are required');
      }

      // Get assignee name if assigneeId provided
      let assigneeName = assignee || '';
      if (assigneeId && !assigneeName) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: assigneeId },
            select: { name: true }
          });
          assigneeName = user?.name || '';
        } catch (e) {
          // Ignore error, use provided assignee name or empty
        }
      }

      const task = await prisma.task.create({
        data: {
          projectId: String(projectId),
          parentTaskId: parentTaskId ? String(parentTaskId) : null,
          title: String(title),
          description: String(description || ''),
          status: String(status || 'todo'),
          priority: String(priority || 'Medium'),
          assigneeId: assigneeId || null,
          assignee: assigneeName,
          dueDate: dueDate ? new Date(dueDate) : null,
          listId: listId ? parseInt(listId, 10) : null,
          estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
          actualHours: actualHours ? parseFloat(actualHours) : null,
          blockedBy: String(blockedBy || ''),
          tags: JSON.stringify(Array.isArray(tags) ? tags : []),
          attachments: JSON.stringify(Array.isArray(attachments) ? attachments : []),
          checklist: JSON.stringify(Array.isArray(checklist) ? checklist : []),
          dependencies: JSON.stringify(Array.isArray(dependencies) ? dependencies : []),
          subscribers: JSON.stringify(Array.isArray(subscribers) ? subscribers : []),
          customFields: JSON.stringify(typeof customFields === 'object' ? customFields : {})
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

      // Transform for response
      const transformedTask = {
        ...task,
        tags: JSON.parse(task.tags || '[]'),
        attachments: JSON.parse(task.attachments || '[]'),
        checklist: JSON.parse(task.checklist || '[]'),
        dependencies: JSON.parse(task.dependencies || '[]'),
        subscribers: JSON.parse(task.subscribers || '[]'),
        customFields: JSON.parse(task.customFields || '{}'),
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString()
      };

      return ok(res, { task: transformedTask });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a task
      if (!taskId) {
        return badRequest(res, 'Missing taskId parameter');
      }

      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          console.error('❌ Failed to parse string body for task update:', parseError);
          body = {};
        }
      }

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        try {
          body = JSON.parse(buffer.toString());
        } catch (e) {
          body = {};
        }
      }

      const updateData = {};
      
      if (body.title !== undefined) updateData.title = String(body.title);
      if (body.description !== undefined) updateData.description = String(body.description || '');
      if (body.status !== undefined) updateData.status = String(body.status);
      if (body.priority !== undefined) updateData.priority = String(body.priority);
      if (body.assigneeId !== undefined) updateData.assigneeId = body.assigneeId || null;
      if (body.assignee !== undefined) updateData.assignee = String(body.assignee || '');
      if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.listId !== undefined) updateData.listId = body.listId ? parseInt(body.listId, 10) : null;
      if (body.estimatedHours !== undefined) updateData.estimatedHours = body.estimatedHours ? parseFloat(body.estimatedHours) : null;
      if (body.actualHours !== undefined) updateData.actualHours = body.actualHours ? parseFloat(body.actualHours) : null;
      if (body.blockedBy !== undefined) updateData.blockedBy = String(body.blockedBy || '');
      if (body.tags !== undefined) updateData.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);
      if (body.attachments !== undefined) updateData.attachments = JSON.stringify(Array.isArray(body.attachments) ? body.attachments : []);
      if (body.checklist !== undefined) updateData.checklist = JSON.stringify(Array.isArray(body.checklist) ? body.checklist : []);
      if (body.dependencies !== undefined) updateData.dependencies = JSON.stringify(Array.isArray(body.dependencies) ? body.dependencies : []);
      if (body.subscribers !== undefined) updateData.subscribers = JSON.stringify(Array.isArray(body.subscribers) ? body.subscribers : []);
      if (body.customFields !== undefined) updateData.customFields = JSON.stringify(typeof body.customFields === 'object' ? body.customFields : {});
      if (body.parentTaskId !== undefined) updateData.parentTaskId = body.parentTaskId ? String(body.parentTaskId) : null;

      // Update assignee name if assigneeId changed
      if (updateData.assigneeId && !updateData.assignee) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: updateData.assigneeId },
            select: { name: true }
          });
          updateData.assignee = user?.name || '';
        } catch (e) {
          // Ignore error
        }
      }

      if (Object.keys(updateData).length === 0) {
        return badRequest(res, 'No fields to update');
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
          comments: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      // Transform for response
      const transformedTask = {
        ...task,
        tags: JSON.parse(task.tags || '[]'),
        attachments: JSON.parse(task.attachments || '[]'),
        checklist: JSON.parse(task.checklist || '[]'),
        dependencies: JSON.parse(task.dependencies || '[]'),
        subscribers: JSON.parse(task.subscribers || '[]'),
        customFields: JSON.parse(task.customFields || '{}'),
        comments: task.comments.map(c => ({
          id: c.id,
          text: c.text,
          author: c.author,
          timestamp: c.createdAt.toISOString()
        })),
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString()
      };

      return ok(res, { task: transformedTask });
    }

    if (method === 'DELETE') {
      // Delete a task (cascade will delete subtasks and comments)
      if (!taskId) {
        return badRequest(res, 'Missing taskId parameter');
      }

      await prisma.task.delete({
        where: { id: String(taskId) }
      });

      console.log('✅ Deleted task:', taskId);

      return ok(res, { message: 'Task deleted successfully' });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Task API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));
