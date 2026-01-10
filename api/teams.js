// Teams Knowledge Hub API Routes
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// Management access control helpers
const MANAGEMENT_TEAM_ID = 'management'
const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'])
const ADMIN_PERMISSION_KEYS = new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'])
const MANAGEMENT_FORBIDDEN_MESSAGE = 'Only administrators can access the Management team.'

const isManagementTeam = (team) => {
  if (!team) return false
  // Handle both team object/ID and string
  const teamId = typeof team === 'string' ? team : (team.id || team.teamId)
  return teamId.toString().trim().toLowerCase() === MANAGEMENT_TEAM_ID
}

const getTeamId = (team) => {
  if (!team) return null
  // Handle team object, teamId string, or team name string
  if (typeof team === 'string') {
    return team
  }
  return team.id || team.teamId || null
}

const normalizePermissions = (permissions) => {
  if (!permissions) return []
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch (error) {
      return permissions
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    }
  }
  return []
}

const isAdminUser = (user) => {
  if (!user) return false

  const role = (user.role || '').toString().trim().toLowerCase()
  if (ADMIN_ROLES.has(role)) {
    return true
  }

  const normalizedPermissions = normalizePermissions(user.permissions).map((permission) =>
    (permission || '').toString().trim().toLowerCase()
  )

  return normalizedPermissions.some((permission) => ADMIN_PERMISSION_KEYS.has(permission))
}

const denyManagementAccess = (res) => {
  return res.status(403).json({ error: MANAGEMENT_FORBIDDEN_MESSAGE })
}

const withManagementRestriction = (where = {}) => {
  const restrictions = {
    NOT: {
      teamId: MANAGEMENT_TEAM_ID
    }
  }

  if (where.AND && Array.isArray(where.AND)) {
    where.AND.push(restrictions)
    return where
  }

  if (Object.keys(where).length === 0) {
    return restrictions
  }

  return {
    AND: [where, restrictions]
  }
}

// Helper function to get ownerId from request
const getOwnerId = (req) => {
  return req.user?.id || req.user?.userId || null
}

async function handler(req, res) {
  try {
    // Parse URL path to determine route
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.replace(/^\/api\/teams\/?/, '').split('/').filter(Boolean)
    
    const subResource = pathSegments[0] // documents, workflows, checklists, notices, tasks, executions
    const resourceId = pathSegments[1] // ID for sub-resources or team ID
    const isAdmin = isAdminUser(req.user)

    // Handle sub-resources (documents, workflows, checklists, notices, tasks, executions)
    if (subResource === 'documents') {
      return await handleDocuments(req, res, resourceId, isAdmin)
    }
    if (subResource === 'workflows') {
      return await handleWorkflows(req, res, resourceId, isAdmin)
    }
    if (subResource === 'checklists') {
      return await handleChecklists(req, res, resourceId, isAdmin)
    }
    if (subResource === 'notices') {
      return await handleNotices(req, res, resourceId, isAdmin)
    }
    if (subResource === 'tasks') {
      return await handleTasks(req, res, resourceId, isAdmin)
    }
    if (subResource === 'executions') {
      return await handleExecutions(req, res, isAdmin)
    }

    // Handle base team routes
    const teamId = pathSegments[0] // Could be team ID or empty for list

    // GET /api/teams - List all teams
    if (req.method === 'GET' && !teamId) {
      try {
        const teams = await prisma.team.findMany({
          where: isAdmin ? {} : { isActive: true },
          include: {
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                  }
                }
              }
            },
            permissions: {
              select: {
                id: true,
                permission: true
              }
            },
            _count: {
              select: {
                documents: true,
                workflows: true,
                checklists: true,
                notices: true,
                tasks: true,
                memberships: true
              }
            }
          },
          orderBy: { name: 'asc' }
        })

        const formattedTeams = teams.map(team => ({
          id: team.id,
          name: team.name,
          icon: team.icon,
          color: team.color,
          description: team.description,
          isActive: team.isActive,
          members: team._count.memberships,
          permissions: team.permissions.map(p => p.permission),
          memberships: team.memberships.map(m => ({
            userId: m.userId,
            user: m.user,
            role: m.role
          })),
          counts: {
            documents: team._count.documents,
            workflows: team._count.workflows,
            checklists: team._count.checklists,
            notices: team._count.notices,
            tasks: team._count.tasks
          },
          createdAt: team.createdAt,
          updatedAt: team.updatedAt
        }))

        return ok(res, { teams: formattedTeams })
      } catch (error) {
        console.error('Error fetching teams:', error)
        return serverError(res, 'Failed to fetch teams', error.message)
      }
    }

    // GET /api/teams/:id - Get single team
    if (req.method === 'GET' && teamId) {
      try {
        if (!isAdmin && isManagementTeam(teamId)) {
          return denyManagementAccess(res)
        }

        const team = await prisma.team.findUnique({
          where: { id: teamId },
          include: {
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    avatar: true
                  }
                }
              }
            },
            permissions: {
              select: {
                id: true,
                permission: true,
                createdAt: true
              }
            },
            _count: {
              select: {
                documents: true,
                workflows: true,
                checklists: true,
                notices: true,
                tasks: true,
                memberships: true
              }
            }
          }
        })

        if (!team) {
          return notFound(res, 'Team not found')
        }

        const formattedTeam = {
          id: team.id,
          name: team.name,
          icon: team.icon,
          color: team.color,
          description: team.description,
          isActive: team.isActive,
          members: team._count.memberships,
          permissions: team.permissions.map(p => p.permission),
          memberships: team.memberships.map(m => ({
            userId: m.userId,
            user: m.user,
            role: m.role
          })),
          counts: {
            documents: team._count.documents,
            workflows: team._count.workflows,
            checklists: team._count.checklists,
            notices: team._count.notices,
            tasks: team._count.tasks
          },
          createdAt: team.createdAt,
          updatedAt: team.updatedAt
        }

        return ok(res, { team: formattedTeam })
      } catch (error) {
        console.error('Error fetching team:', error)
        return serverError(res, 'Failed to fetch team', error.message)
      }
    }

    // POST /api/teams - Create team
    if (req.method === 'POST' && !teamId) {
      try {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Only administrators can create teams' })
        }

        const body = await parseJsonBody(req)
        const { name, icon, color, description, permissions = [], isActive = true } = body

        if (!name) {
          return badRequest(res, 'Team name is required')
        }

        const result = await prisma.$transaction(async (tx) => {
          const team = await tx.team.create({
            data: {
              name,
              icon: icon || null,
              color: color || null,
              description: description || null,
              isActive
            }
          })

          if (Array.isArray(permissions) && permissions.length > 0) {
            await tx.teamPermission.createMany({
              data: permissions.map(permission => ({
                teamId: team.id,
                permission: String(permission)
              }))
            })
          }

          return tx.team.findUnique({
            where: { id: team.id },
            include: {
              permissions: true,
              _count: {
                select: {
                  memberships: true
                }
              }
            }
          })
        })

        return created(res, {
          team: {
            id: result.id,
            name: result.name,
            icon: result.icon,
            color: result.color,
            description: result.description,
            isActive: result.isActive,
            members: result._count.memberships,
            permissions: result.permissions.map(p => p.permission),
            createdAt: result.createdAt,
            updatedAt: result.updatedAt
          }
        })
      } catch (error) {
        console.error('Error creating team:', error)
        if (error.code === 'P2002') {
          return res.status(409).json({ error: 'Team with this name already exists' })
        }
        return serverError(res, 'Failed to create team', error.message)
      }
    }

    // PUT /api/teams/:id - Update team
    if (req.method === 'PUT' && teamId) {
      try {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Only administrators can update teams' })
        }

        if (!isAdmin && isManagementTeam(teamId)) {
          return denyManagementAccess(res)
        }

        const existingTeam = await prisma.team.findUnique({
          where: { id: teamId },
          include: { permissions: true }
        })

        if (!existingTeam) {
          return notFound(res, 'Team not found')
        }

        const body = await parseJsonBody(req)
        const { name, icon, color, description, permissions, isActive } = body

        const result = await prisma.$transaction(async (tx) => {
          const updateData = {}
          if (name !== undefined) updateData.name = name
          if (icon !== undefined) updateData.icon = icon || null
          if (color !== undefined) updateData.color = color || null
          if (description !== undefined) updateData.description = description || null
          if (isActive !== undefined) updateData.isActive = isActive

          await tx.team.update({
            where: { id: teamId },
            data: updateData
          })

          if (Array.isArray(permissions)) {
            await tx.teamPermission.deleteMany({
              where: { teamId: teamId }
            })

            if (permissions.length > 0) {
              await tx.teamPermission.createMany({
                data: permissions.map(permission => ({
                  teamId: teamId,
                  permission: String(permission)
                }))
              })
            }
          }

          return tx.team.findUnique({
            where: { id: teamId },
            include: {
              permissions: true,
              _count: {
                select: {
                  memberships: true
                }
              }
            }
          })
        })

        return ok(res, {
          team: {
            id: result.id,
            name: result.name,
            icon: result.icon,
            color: result.color,
            description: result.description,
            isActive: result.isActive,
            members: result._count.memberships,
            permissions: result.permissions.map(p => p.permission),
            createdAt: result.createdAt,
            updatedAt: result.updatedAt
          }
        })
      } catch (error) {
        console.error('Error updating team:', error)
        if (error.code === 'P2002') {
          return res.status(409).json({ error: 'Team with this name already exists' })
        }
        return serverError(res, 'Failed to update team', error.message)
      }
    }

    // DELETE /api/teams/:id - Delete team
    if (req.method === 'DELETE' && teamId) {
      try {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Only administrators can delete teams' })
        }

        if (isManagementTeam(teamId)) {
          return res.status(403).json({ error: 'Cannot delete the Management team' })
        }

        const existingTeam = await prisma.team.findUnique({
          where: { id: teamId },
          include: {
            _count: {
              select: {
                memberships: true,
                documents: true,
                workflows: true,
                checklists: true,
                notices: true,
                tasks: true
              }
            }
          }
        })

        if (!existingTeam) {
          return notFound(res, 'Team not found')
        }

        const hasData = existingTeam._count.memberships > 0 ||
                        existingTeam._count.documents > 0 ||
                        existingTeam._count.workflows > 0 ||
                        existingTeam._count.checklists > 0 ||
                        existingTeam._count.notices > 0 ||
                        existingTeam._count.tasks > 0

        if (hasData) {
          await prisma.team.update({
            where: { id: teamId },
            data: { isActive: false }
          })
          return ok(res, { 
            success: true, 
            message: 'Team deactivated (has associated data)',
            softDelete: true
          })
        }

        await prisma.team.delete({
          where: { id: teamId }
        })

        return ok(res, { success: true, message: 'Team deleted successfully' })
      } catch (error) {
        console.error('Error deleting team:', error)
        return serverError(res, 'Failed to delete team', error.message)
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Error in teams handler:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

// Document handlers
async function handleDocuments(req, res, documentId, isAdmin) {
  try {
    if (req.method === 'GET' && !documentId) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const { team, teamId } = Object.fromEntries(url.searchParams)
      const targetTeamId = teamId || team

      if (targetTeamId && !isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      let where = {}
      if (targetTeamId) {
        where.teamId = targetTeamId
      }

      if (!isAdmin) {
        where = withManagementRestriction(where)
      }

      const documents = await prisma.teamDocument.findMany({
        where,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      return ok(res, { documents })
    }

    if (req.method === 'POST' && !documentId) {
      const body = await parseJsonBody(req)
      const { team, teamId, tags, attachments, ...rest } = body
      const targetTeamId = teamId || team

      if (!targetTeamId) {
        return badRequest(res, 'teamId is required')
      }

      if (!isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      const documentData = {
        ...rest,
        teamId: targetTeamId,
        ownerId: getOwnerId(req),
        tags: typeof tags === 'string' ? JSON.parse(tags || '[]') : (tags || []),
        attachments: typeof attachments === 'string' ? JSON.parse(attachments || '[]') : (attachments || [])
      }

      const document = await prisma.teamDocument.create({
        data: documentData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { document })
    }

    if (req.method === 'PUT' && documentId) {
      const existingDocument = await prisma.teamDocument.findUnique({
        where: { id: documentId },
        include: { team: true }
      })

      if (!existingDocument) {
        return notFound(res, 'Document not found')
      }

      const body = await parseJsonBody(req)
      const { team, teamId, tags, attachments, ...rest } = body
      const targetTeamId = teamId || team || existingDocument.teamId

      if (!isAdmin && (isManagementTeam(existingDocument.teamId) || isManagementTeam(targetTeamId))) {
        return denyManagementAccess(res)
      }

      const updateData = { ...rest }
      if (targetTeamId && targetTeamId !== existingDocument.teamId) {
        updateData.teamId = targetTeamId
      }
      if (tags !== undefined) {
        updateData.tags = typeof tags === 'string' ? JSON.parse(tags || '[]') : tags
      }
      if (attachments !== undefined) {
        updateData.attachments = typeof attachments === 'string' ? JSON.parse(attachments || '[]') : attachments
      }

      const document = await prisma.teamDocument.update({
        where: { id: documentId },
        data: updateData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { document })
    }

    if (req.method === 'DELETE' && documentId) {
      const existingDocument = await prisma.teamDocument.findUnique({
        where: { id: documentId },
        include: { team: true }
      })

      if (!existingDocument) {
        return notFound(res, 'Document not found')
      }

      if (!isAdmin && isManagementTeam(existingDocument.teamId)) {
        return denyManagementAccess(res)
      }

      await prisma.teamDocument.delete({
        where: { id: documentId }
      })

      return ok(res, { success: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Error handling documents:', error)
    if (error.code === 'P2003') {
      return notFound(res, 'Team not found')
    }
    return serverError(res, 'Failed to process document request', error.message)
  }
}

// Workflow handlers
async function handleWorkflows(req, res, workflowId, isAdmin) {
  try {
    if (req.method === 'GET' && !workflowId) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const { team, teamId } = Object.fromEntries(url.searchParams)
      const targetTeamId = teamId || team

      if (targetTeamId && !isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      let where = {}
      if (targetTeamId) {
        where.teamId = targetTeamId
      }

      if (!isAdmin) {
        where = withManagementRestriction(where)
      }

      const workflows = await prisma.teamWorkflow.findMany({
        where,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      return ok(res, { workflows })
    }

    if (req.method === 'POST' && !workflowId) {
      const body = await parseJsonBody(req)
      const { team, teamId, steps, tags, ...rest } = body
      const targetTeamId = teamId || team

      if (!targetTeamId) {
        return badRequest(res, 'teamId is required')
      }

      if (!isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      const workflowData = {
        ...rest,
        teamId: targetTeamId,
        ownerId: getOwnerId(req),
        steps: typeof steps === 'string' ? JSON.parse(steps || '[]') : (steps || []),
        tags: typeof tags === 'string' ? JSON.parse(tags || '[]') : (tags || [])
      }

      const workflow = await prisma.teamWorkflow.create({
        data: workflowData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { workflow })
    }

    if (req.method === 'PUT' && workflowId) {
      const existingWorkflow = await prisma.teamWorkflow.findUnique({
        where: { id: workflowId },
        include: { team: true }
      })

      if (!existingWorkflow) {
        return notFound(res, 'Workflow not found')
      }

      const body = await parseJsonBody(req)
      const { team, teamId, steps, tags, ...rest } = body
      const targetTeamId = teamId || team || existingWorkflow.teamId

      if (!isAdmin && (isManagementTeam(existingWorkflow.teamId) || isManagementTeam(targetTeamId))) {
        return denyManagementAccess(res)
      }

      const updateData = { ...rest }
      if (targetTeamId && targetTeamId !== existingWorkflow.teamId) {
        updateData.teamId = targetTeamId
      }
      if (steps !== undefined) {
        updateData.steps = typeof steps === 'string' ? JSON.parse(steps || '[]') : steps
      }
      if (tags !== undefined) {
        updateData.tags = typeof tags === 'string' ? JSON.parse(tags || '[]') : tags
      }

      const workflow = await prisma.teamWorkflow.update({
        where: { id: workflowId },
        data: updateData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { workflow })
    }

    if (req.method === 'DELETE' && workflowId) {
      const existingWorkflow = await prisma.teamWorkflow.findUnique({
        where: { id: workflowId },
        include: { team: true }
      })

      if (!existingWorkflow) {
        return notFound(res, 'Workflow not found')
      }

      if (!isAdmin && isManagementTeam(existingWorkflow.teamId)) {
        return denyManagementAccess(res)
      }

      await prisma.teamWorkflow.delete({
        where: { id: workflowId }
      })

      return ok(res, { success: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Error handling workflows:', error)
    if (error.code === 'P2003') {
      return notFound(res, 'Team not found')
    }
    return serverError(res, 'Failed to process workflow request', error.message)
  }
}

// Checklist handlers
async function handleChecklists(req, res, checklistId, isAdmin) {
  try {
    if (req.method === 'GET' && !checklistId) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const { team, teamId } = Object.fromEntries(url.searchParams)
      const targetTeamId = teamId || team

      if (targetTeamId && !isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      let where = {}
      if (targetTeamId) {
        where.teamId = targetTeamId
      }

      if (!isAdmin) {
        where = withManagementRestriction(where)
      }

      const checklists = await prisma.teamChecklist.findMany({
        where,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      return ok(res, { checklists })
    }

    if (req.method === 'POST' && !checklistId) {
      const body = await parseJsonBody(req)
      const { team, teamId, items, ...rest } = body
      const targetTeamId = teamId || team

      if (!targetTeamId) {
        return badRequest(res, 'teamId is required')
      }

      if (!isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      const checklistData = {
        ...rest,
        teamId: targetTeamId,
        ownerId: getOwnerId(req),
        items: typeof items === 'string' ? JSON.parse(items || '[]') : (items || [])
      }

      const checklist = await prisma.teamChecklist.create({
        data: checklistData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { checklist })
    }

    if (req.method === 'PUT' && checklistId) {
      const existingChecklist = await prisma.teamChecklist.findUnique({
        where: { id: checklistId },
        include: { team: true }
      })

      if (!existingChecklist) {
        return notFound(res, 'Checklist not found')
      }

      const body = await parseJsonBody(req)
      const { team, teamId, items, ...rest } = body
      const targetTeamId = teamId || team || existingChecklist.teamId

      if (!isAdmin && (isManagementTeam(existingChecklist.teamId) || isManagementTeam(targetTeamId))) {
        return denyManagementAccess(res)
      }

      const updateData = { ...rest }
      if (targetTeamId && targetTeamId !== existingChecklist.teamId) {
        updateData.teamId = targetTeamId
      }
      if (items !== undefined) {
        updateData.items = typeof items === 'string' ? JSON.parse(items || '[]') : items
      }

      const checklist = await prisma.teamChecklist.update({
        where: { id: checklistId },
        data: updateData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { checklist })
    }

    if (req.method === 'DELETE' && checklistId) {
      const existingChecklist = await prisma.teamChecklist.findUnique({
        where: { id: checklistId },
        include: { team: true }
      })

      if (!existingChecklist) {
        return notFound(res, 'Checklist not found')
      }

      if (!isAdmin && isManagementTeam(existingChecklist.teamId)) {
        return denyManagementAccess(res)
      }

      await prisma.teamChecklist.delete({
        where: { id: checklistId }
      })

      return ok(res, { success: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Error handling checklists:', error)
    if (error.code === 'P2003') {
      return notFound(res, 'Team not found')
    }
    return serverError(res, 'Failed to process checklist request', error.message)
  }
}

// Notice handlers
async function handleNotices(req, res, noticeId, isAdmin) {
  try {
    if (req.method === 'GET' && !noticeId) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const { team, teamId } = Object.fromEntries(url.searchParams)
      const targetTeamId = teamId || team

      if (targetTeamId && !isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      let where = {}
      if (targetTeamId) {
        where.teamId = targetTeamId
      }

      if (!isAdmin) {
        where = withManagementRestriction(where)
      }

      const notices = await prisma.teamNotice.findMany({
        where,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        },
        orderBy: { date: 'desc' }
      })

      return ok(res, { notices })
    }

    if (req.method === 'POST' && !noticeId) {
      const body = await parseJsonBody(req)
      const { team, teamId, ...rest } = body
      const targetTeamId = teamId || team

      if (!targetTeamId) {
        return badRequest(res, 'teamId is required')
      }

      if (!isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      const noticeData = {
        ...rest,
        teamId: targetTeamId,
        ownerId: getOwnerId(req)
      }

      const notice = await prisma.teamNotice.create({
        data: noticeData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { notice })
    }

    if (req.method === 'PUT' && noticeId) {
      const existingNotice = await prisma.teamNotice.findUnique({
        where: { id: noticeId },
        include: { team: true }
      })

      if (!existingNotice) {
        return notFound(res, 'Notice not found')
      }

      const body = await parseJsonBody(req)
      const { team, teamId, ...rest } = body
      const targetTeamId = teamId || team || existingNotice.teamId

      if (!isAdmin && (isManagementTeam(existingNotice.teamId) || isManagementTeam(targetTeamId))) {
        return denyManagementAccess(res)
      }

      const updateData = { ...rest }
      if (targetTeamId && targetTeamId !== existingNotice.teamId) {
        updateData.teamId = targetTeamId
      }

      const notice = await prisma.teamNotice.update({
        where: { id: noticeId },
        data: updateData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { notice })
    }

    if (req.method === 'DELETE' && noticeId) {
      const existingNotice = await prisma.teamNotice.findUnique({
        where: { id: noticeId },
        include: { team: true }
      })

      if (!existingNotice) {
        return notFound(res, 'Notice not found')
      }

      if (!isAdmin && isManagementTeam(existingNotice.teamId)) {
        return denyManagementAccess(res)
      }

      await prisma.teamNotice.delete({
        where: { id: noticeId }
      })

      return ok(res, { success: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Error handling notices:', error)
    if (error.code === 'P2003') {
      return notFound(res, 'Team not found')
    }
    return serverError(res, 'Failed to process notice request', error.message)
  }
}

// Task handlers
async function handleTasks(req, res, taskId, isAdmin) {
  try {
    if (req.method === 'GET' && !taskId) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const { team, teamId } = Object.fromEntries(url.searchParams)
      const targetTeamId = teamId || team

      if (targetTeamId && !isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      let where = {}
      if (targetTeamId) {
        where.teamId = targetTeamId
      }

      if (!isAdmin) {
        where = withManagementRestriction(where)
      }

      const tasks = await prisma.teamTask.findMany({
        where,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      return ok(res, { tasks })
    }

    if (req.method === 'POST' && !taskId) {
      const body = await parseJsonBody(req)
      const { team, teamId, tags, attachments, ...rest } = body
      const targetTeamId = teamId || team

      if (!targetTeamId) {
        return badRequest(res, 'teamId is required')
      }

      if (!isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      const taskData = {
        ...rest,
        teamId: targetTeamId,
        ownerId: getOwnerId(req),
        tags: typeof tags === 'string' ? JSON.parse(tags || '[]') : (tags || []),
        attachments: typeof attachments === 'string' ? JSON.parse(attachments || '[]') : (attachments || [])
      }

      const task = await prisma.teamTask.create({
        data: taskData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { task })
    }

    if (req.method === 'PUT' && taskId) {
      const existingTask = await prisma.teamTask.findUnique({
        where: { id: taskId },
        include: { team: true }
      })

      if (!existingTask) {
        return notFound(res, 'Task not found')
      }

      const body = await parseJsonBody(req)
      const { team, teamId, tags, attachments, ...rest } = body
      const targetTeamId = teamId || team || existingTask.teamId

      if (!isAdmin && (isManagementTeam(existingTask.teamId) || isManagementTeam(targetTeamId))) {
        return denyManagementAccess(res)
      }

      const updateData = { ...rest }
      if (targetTeamId && targetTeamId !== existingTask.teamId) {
        updateData.teamId = targetTeamId
      }
      if (tags !== undefined) {
        updateData.tags = typeof tags === 'string' ? JSON.parse(tags || '[]') : tags
      }
      if (attachments !== undefined) {
        updateData.attachments = typeof attachments === 'string' ? JSON.parse(attachments || '[]') : attachments
      }

      const task = await prisma.teamTask.update({
        where: { id: taskId },
        data: updateData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      })

      return ok(res, { task })
    }

    if (req.method === 'DELETE' && taskId) {
      const existingTask = await prisma.teamTask.findUnique({
        where: { id: taskId },
        include: { team: true }
      })

      if (!existingTask) {
        return notFound(res, 'Task not found')
      }

      if (!isAdmin && isManagementTeam(existingTask.teamId)) {
        return denyManagementAccess(res)
      }

      await prisma.teamTask.delete({
        where: { id: taskId }
      })

      return ok(res, { success: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Error handling tasks:', error)
    if (error.code === 'P2003') {
      return notFound(res, 'Team not found')
    }
    return serverError(res, 'Failed to process task request', error.message)
  }
}

// Execution handlers
async function handleExecutions(req, res, isAdmin) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const { workflowId, team, teamId } = Object.fromEntries(url.searchParams)
      const targetTeamId = teamId || team

      if (targetTeamId && !isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      let where = {}
      if (workflowId) where.workflowId = workflowId
      if (targetTeamId) where.teamId = targetTeamId

      if (!isAdmin) {
        where = withManagementRestriction(where)
      }

      const executions = await prisma.workflowExecution.findMany({
        where,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          },
          workflow: {
            select: {
              id: true,
              title: true
            }
          }
        },
        orderBy: { executionDate: 'desc' }
      })

      return ok(res, { executions })
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      const { team, teamId, completedSteps, ...rest } = body
      const targetTeamId = teamId || team

      if (!targetTeamId) {
        return badRequest(res, 'teamId is required')
      }

      if (!isAdmin && isManagementTeam(targetTeamId)) {
        return denyManagementAccess(res)
      }

      const executionData = {
        ...rest,
        teamId: targetTeamId,
        ownerId: getOwnerId(req),
        completedSteps: typeof completedSteps === 'string' ? JSON.parse(completedSteps || '[]') : (completedSteps || [])
      }

      const execution = await prisma.workflowExecution.create({
        data: executionData,
        include: {
          team: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          },
          workflow: {
            select: {
              id: true,
              title: true
            }
          }
        }
      })

      return ok(res, { execution })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Error handling executions:', error)
    if (error.code === 'P2003') {
      return notFound(res, 'Team or Workflow not found')
    }
    return serverError(res, 'Failed to process execution request', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
