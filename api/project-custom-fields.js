// API endpoints for Project Custom Field Definitions
// This uses a separate table instead of storing custom field definitions in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound, created } from './_lib/response.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';
import { authRequired } from './_lib/authRequired.js';

async function handler(req, res) {
  const { method } = req;
  const { id, projectId } = req.query;

  try {
    if (method === 'GET') {
      if (id) {
        // Get single custom field definition
        const field = await prisma.projectCustomFieldDefinition.findUnique({
          where: { id }
        });

        if (!field) {
          return notFound(res, 'Custom field definition not found');
        }

        return ok(res, { field });
      } else if (projectId) {
        // Get all custom field definitions for a project
        const fields = await prisma.projectCustomFieldDefinition.findMany({
          where: { projectId: String(projectId) },
          orderBy: { order: 'asc' }
        });

        return ok(res, { fields });
      } else {
        return badRequest(res, 'Missing projectId or id parameter');
      }
    }

    if (method === 'POST') {
      // Create a new custom field definition
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          body = {};
        }
      }

      const { projectId, fieldId, name, type, required, options, defaultValue, order } = body;

      if (!projectId || !name || !type) {
        return badRequest(res, 'Missing required fields: projectId, name, and type are required');
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: String(projectId) }
      });

      if (!project) {
        return notFound(res, 'Project not found');
      }

      // Determine fieldId if not provided
      let finalFieldId = fieldId;
      if (!finalFieldId) {
        const existingFields = await prisma.projectCustomFieldDefinition.findMany({
          where: { projectId: String(projectId) }
        });
        finalFieldId = `field_${existingFields.length + 1}`;
      }

      // Check if fieldId already exists
      const existing = await prisma.projectCustomFieldDefinition.findUnique({
        where: {
          projectId_fieldId: {
            projectId: String(projectId),
            fieldId: String(finalFieldId)
          }
        }
      });

      if (existing) {
        return badRequest(res, 'Custom field definition with this fieldId already exists for this project');
      }

      const field = await prisma.projectCustomFieldDefinition.create({
        data: {
          projectId: String(projectId),
          fieldId: String(finalFieldId),
          name: String(name),
          type: String(type),
          required: Boolean(required || false),
          options: Array.isArray(options) ? JSON.stringify(options) : '[]',
          defaultValue: defaultValue ? String(defaultValue) : null,
          order: order !== undefined ? parseInt(order) : 0,
        }
      });

      console.log('✅ Created project custom field definition:', {
        fieldId: field.id,
        projectId: field.projectId,
        name: field.name
      });

      return created(res, { field });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a custom field definition
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

      const existing = await prisma.projectCustomFieldDefinition.findUnique({
        where: { id }
      });

      if (!existing) {
        return notFound(res, 'Custom field definition not found');
      }

      const updateData = {};
      if (body.name !== undefined) updateData.name = String(body.name);
      if (body.type !== undefined) updateData.type = String(body.type);
      if (body.required !== undefined) updateData.required = Boolean(body.required);
      if (body.options !== undefined) {
        updateData.options = Array.isArray(body.options) ? JSON.stringify(body.options) : '[]';
      }
      if (body.defaultValue !== undefined) updateData.defaultValue = body.defaultValue ? String(body.defaultValue) : null;
      if (body.order !== undefined) updateData.order = parseInt(body.order);

      const updated = await prisma.projectCustomFieldDefinition.update({
        where: { id },
        data: updateData
      });

      console.log('✅ Updated project custom field definition:', id);
      return ok(res, { field: updated });
    }

    if (method === 'DELETE') {
      // Delete a custom field definition
      if (!id) {
        return badRequest(res, 'Missing id parameter');
      }

      const existing = await prisma.projectCustomFieldDefinition.findUnique({
        where: { id }
      });

      if (!existing) {
        return notFound(res, 'Custom field definition not found');
      }

      await prisma.projectCustomFieldDefinition.delete({
        where: { id }
      });

      console.log('✅ Deleted project custom field definition:', id);
      return ok(res, { message: 'Custom field definition deleted successfully' });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Project Custom Field Definition API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));


