// API endpoints for Project Team Members
// This uses a separate table instead of storing team members in JSON

import { prisma } from './_lib/prisma.js';
import { ok, serverError, badRequest, notFound, created } from './_lib/response.js';
import { withHttp } from './_lib/withHttp.js';
import { withLogging } from './_lib/logger.js';
import { authRequired } from './_lib/authRequired.js';

let teamMemberColumnsEnsured = false;
async function ensureTeamMemberColumns() {
  if (teamMemberColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTeamMember" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT \'member\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTeamMember" ADD COLUMN IF NOT EXISTS "permissions" TEXT DEFAULT \'[]\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTeamMember" ADD COLUMN IF NOT EXISTS "notes" TEXT DEFAULT \'\'');
  } catch (e) {
    console.warn('⚠️ ProjectTeamMember column ensure failed:', e.message);
  } finally {
    teamMemberColumnsEnsured = true;
  }
}

async function handler(req, res) {
  const { method } = req;
  const { id, projectId, userId } = req.query;

  try {
    await ensureTeamMemberColumns();
    if (method === 'GET') {
      if (id) {
        // Get single team member
        const member = await prisma.projectTeamMember.findUnique({
          where: { id },
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
          }
        });

        if (!member) {
          return notFound(res, 'Team member not found');
        }

        return ok(res, { member });
      } else if (projectId) {
        // Get all team members for a project
        const members = await prisma.projectTeamMember.findMany({
          where: { projectId: String(projectId) },
          orderBy: { addedDate: 'asc' },
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
          }
        });

        return ok(res, { members });
      } else if (userId) {
        // Get all projects a user is a team member of
        const memberships = await prisma.projectTeamMember.findMany({
          where: { userId: String(userId) },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                status: true
              }
            }
          }
        });

        return ok(res, { memberships });
      } else {
        return badRequest(res, 'Missing projectId, userId, or id parameter');
      }
    }

    if (method === 'POST') {
      // Add a team member to a project
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          body = {};
        }
      }

      const { projectId, userId, role, permissions, notes, addedBy } = body;

      if (!projectId || !userId) {
        return badRequest(res, 'Missing required fields: projectId and userId are required');
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: String(projectId) }
      });

      if (!project) {
        return notFound(res, 'Project not found');
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: String(userId) }
      });

      if (!user) {
        return notFound(res, 'User not found');
      }

      // Check if already a member
      const existing = await prisma.projectTeamMember.findUnique({
        where: {
          projectId_userId: {
            projectId: String(projectId),
            userId: String(userId)
          }
        }
      });

      if (existing) {
        return badRequest(res, 'User is already a team member of this project');
      }

      // Get current user for addedBy
      const currentUser = req.user || {};
      const finalAddedBy = addedBy || currentUser.sub || currentUser.id || null;

      const member = await prisma.projectTeamMember.create({
        data: {
          projectId: String(projectId),
          userId: String(userId),
          role: String(role || 'member'),
          permissions: Array.isArray(permissions) ? JSON.stringify(permissions) : '[]',
          notes: notes || '',
          addedById: finalAddedBy,
        },
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
        }
      });

      console.log('✅ Added project team member:', {
        memberId: member.id,
        projectId: member.projectId,
        userId: member.userId
      });

      return created(res, { member });
    }

    if (method === 'PUT' || method === 'PATCH') {
      // Update a team member
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

      const existing = await prisma.projectTeamMember.findUnique({
        where: { id }
      });

      if (!existing) {
        return notFound(res, 'Team member not found');
      }

      const updateData = {};
      if (body.role !== undefined) updateData.role = String(body.role);
      if (body.permissions !== undefined) {
        updateData.permissions = Array.isArray(body.permissions) ? JSON.stringify(body.permissions) : '[]';
      }
      if (body.notes !== undefined) updateData.notes = String(body.notes);

      const updated = await prisma.projectTeamMember.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      console.log('✅ Updated project team member:', id);
      return ok(res, { member: updated });
    }

    if (method === 'DELETE') {
      // Remove a team member from a project
      if (!id) {
        return badRequest(res, 'Missing id parameter');
      }

      const existing = await prisma.projectTeamMember.findUnique({
        where: { id }
      });

      if (!existing) {
        return notFound(res, 'Team member not found');
      }

      await prisma.projectTeamMember.delete({
        where: { id }
      });

      console.log('✅ Removed project team member:', id);
      return ok(res, { message: 'Team member removed successfully' });
    }

    return badRequest(res, `Method ${method} not allowed`);
  } catch (error) {
    console.error('❌ Project Team Member API error:', error);
    return serverError(res, 'Failed to process request', error.message);
  }
}

export default withHttp(withLogging(authRequired(handler)));


