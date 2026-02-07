// API endpoints for Project Documents
// This uses a separate table instead of storing documents in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound } from './_lib/response.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';
import { authRequired } from './_lib/authRequired.js';

let documentColumnsEnsured = false;
async function ensureDocumentColumns() {
  if (documentColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "description" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "url" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "type" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "size" INTEGER');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "mimeType" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "tags" TEXT DEFAULT \'[]\'');
  } catch (e) {
    console.warn('⚠️ ProjectDocument column ensure failed:', e.message);
  } finally {
    documentColumnsEnsured = true;
  }
}

async function handler(req, res) {
  const { method } = req;
  const { id: documentId, projectId, type } = req.query;

  try {
    await ensureDocumentColumns();
    if (method === 'GET') {
      if (documentId) {
        // Get single document
        const document = await prisma.projectDocument.findUnique({
          where: { id: documentId },
          include: {
            uploader: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        if (!document) {
          return notFound(res, 'Document not found');
        }

        return ok(res, { document });
      } else if (projectId) {
        // Get all documents for a project
        const where = {
          projectId: String(projectId),
          isActive: true
        };

        if (type) {
          where.type = String(type);
        }

        const documents = await prisma.projectDocument.findMany({
          where,
          orderBy: { uploadDate: 'desc' },
          include: {
            uploader: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        return ok(res, { documents });
      } else {
        return badRequest(res, 'Missing projectId or documentId parameter');
      }
    }

    if (method === 'POST') {
      // Create a new document
      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          body = {};
        }
      }

      const { projectId, name, description, url, filePath, type, size, mimeType, uploadedBy, tags } = body;

      if (!projectId || !name) {
        return badRequest(res, 'Missing required fields: projectId and name are required');
      }

      // Get current user info if available
      const currentUser = req.user || {};
      const finalUploadedBy = uploadedBy || currentUser.sub || currentUser.id || null;

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: String(projectId) }
      });

      if (!project) {
        return notFound(res, 'Project not found');
      }

      const document = await prisma.projectDocument.create({
        data: {
          project: { connect: { id: String(projectId) } },
          name: String(name),
          description: description || '',
          url: url || null,
          filePath: filePath ? String(filePath) : '',
          type: type || null,
          size: size ? parseInt(size) : null,
          mimeType: mimeType || null,
          ...(finalUploadedBy ? { uploader: { connect: { id: String(finalUploadedBy) } } } : {}),
          tags: Array.isArray(tags) ? JSON.stringify(tags) : '[]',
        },
        include: {
          uploader: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      console.log('✅ Created project document:', {
        documentId: document.id,
        projectId: document.projectId,
        name: document.name
      });

      return ok(res, { document });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a document
      if (!documentId) {
        return badRequest(res, 'Missing documentId parameter');
      }

      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          body = {};
        }
      }

      const existingDocument = await prisma.projectDocument.findUnique({
        where: { id: documentId }
      });

      if (!existingDocument) {
        return notFound(res, 'Document not found');
      }

      const updateData = {};
      if (body.name !== undefined) updateData.name = String(body.name);
      if (body.description !== undefined) updateData.description = String(body.description);
      if (body.url !== undefined) updateData.url = body.url || null;
      if (body.type !== undefined) updateData.type = body.type || null;
      if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
      if (body.tags !== undefined) {
        updateData.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';
      }

      const updatedDocument = await prisma.projectDocument.update({
        where: { id: documentId },
        data: updateData
      });

      console.log('✅ Updated project document:', documentId);
      return ok(res, { document: updatedDocument });
    }

    if (method === 'DELETE') {
      // Delete a document (soft delete by setting isActive to false, or hard delete)
      if (!documentId) {
        return badRequest(res, 'Missing documentId parameter');
      }

      const existingDocument = await prisma.projectDocument.findUnique({
        where: { id: documentId }
      });

      if (!existingDocument) {
        return notFound(res, 'Document not found');
      }

      // Soft delete (preferred)
      await prisma.projectDocument.update({
        where: { id: documentId },
        data: { isActive: false }
      });

      console.log('✅ Deleted (soft) project document:', documentId);
      return ok(res, { message: 'Document deleted successfully' });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Project Document API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));


