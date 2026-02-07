// API endpoints for Project Task Lists (Kanban columns)
// This uses a separate table instead of storing task lists in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound, created } from './_lib/response.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';
import { authRequired } from './_lib/authRequired.js';

let taskListColumnsEnsured = false;
async function ensureTaskListColumns() {
  if (taskListColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTaskList" ADD COLUMN IF NOT EXISTS "listId" INTEGER DEFAULT 0');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTaskList" ADD COLUMN IF NOT EXISTS "color" TEXT DEFAULT \'blue\'');
  } catch (e) {
    console.warn('⚠️ ProjectTaskList column ensure failed:', e.message);
  } finally {
    taskListColumnsEnsured = true;
  }
}

async function handler(req, res) {
  const { method } = req;
  const { id, projectId } = req.query;

  try {
    await ensureTaskListColumns();
    if (method === 'GET') {
      if (id) {
        // Get single task list
        const taskList = await prisma.projectTaskList.findUnique({
          where: { id }
        });

        if (!taskList) {
          return notFound(res, 'Task list not found');
        }

        return ok(res, { taskList });
      } else if (projectId) {
        // Get all task lists for a project
        const taskLists = await prisma.projectTaskList.findMany({
          where: { projectId: String(projectId) },
          orderBy: { order: 'asc' }
        });

        return ok(res, { taskLists });
      } else {
        return badRequest(res, 'Missing projectId or id parameter');
      }
    }

    if (method === 'POST') {
      // Create a new task list
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          body = {};
        }
      }

      const { projectId, listId, name, color, order } = body;

      if (!projectId || !name) {
        return badRequest(res, 'Missing required fields: projectId and name are required');
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: String(projectId) }
      });

      if (!project) {
        return notFound(res, 'Project not found');
      }

      // Determine listId if not provided
      let finalListId = listId;
      if (!finalListId) {
        const existingLists = await prisma.projectTaskList.findMany({
          where: { projectId: String(projectId) },
          orderBy: { listId: 'desc' },
          take: 1
        });
        finalListId = existingLists.length > 0 ? existingLists[0].listId + 1 : 1;
      }

      // Check if listId already exists
      const existing = await prisma.projectTaskList.findUnique({
        where: {
          projectId_listId: {
            projectId: String(projectId),
            listId: parseInt(finalListId)
          }
        }
      });

      if (existing) {
        return badRequest(res, 'Task list with this listId already exists for this project');
      }

      const taskList = await prisma.projectTaskList.create({
        data: {
          projectId: String(projectId),
          listId: parseInt(finalListId),
          name: String(name),
          color: String(color || 'blue'),
          order: order !== undefined ? parseInt(order) : 0,
        }
      });

      console.log('✅ Created project task list:', {
        taskListId: taskList.id,
        projectId: taskList.projectId,
        name: taskList.name
      });

      return created(res, { taskList });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a task list
      if (!id) {
        return badRequest(res, 'Missing id parameter');
      }

      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          body = {};
        }
      }

      const existing = await prisma.projectTaskList.findUnique({
        where: { id }
      });

      if (!existing) {
        return notFound(res, 'Task list not found');
      }

      const updateData = {};
      if (body.name !== undefined) updateData.name = String(body.name);
      if (body.color !== undefined) updateData.color = String(body.color);
      if (body.order !== undefined) updateData.order = parseInt(body.order);

      const updated = await prisma.projectTaskList.update({
        where: { id },
        data: updateData
      });

      console.log('✅ Updated project task list:', id);
      return ok(res, { taskList: updated });
    }

    if (method === 'DELETE') {
      // Delete a task list
      if (!id) {
        return badRequest(res, 'Missing id parameter');
      }

      const existing = await prisma.projectTaskList.findUnique({
        where: { id }
      });

      if (!existing) {
        return notFound(res, 'Task list not found');
      }

      await prisma.projectTaskList.delete({
        where: { id }
      });

      console.log('✅ Deleted project task list:', id);
      return ok(res, { message: 'Task list deleted successfully' });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Project Task List API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));


