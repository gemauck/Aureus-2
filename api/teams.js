// Teams Knowledge Hub API Routes
const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Middleware to get user from token
const authenticateToken = require('../middleware/auth')

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
  // First, get the management team ID from database
  // For now, we'll use the team name/id lookup
  // In production, this should be cached or looked up once
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

// ============ TEAMS CRUD ============

// Get all teams
router.get('/', authenticateToken, async (req, res) => {
  try {
    const isAdmin = isAdminUser(req.user)
    
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

    // Format teams with member count and permissions array
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

    res.json({ data: { teams: formattedTeams } })
  } catch (error) {
    console.error('Error fetching teams:', error)
    res.status(500).json({ error: 'Failed to fetch teams' })
  }
})

// Get single team
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    if (!isAdmin && isManagementTeam(id)) {
      return denyManagementAccess(res)
    }

    const team = await prisma.team.findUnique({
      where: { id },
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
      return res.status(404).json({ error: 'Team not found' })
    }

    // Format team response
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

    res.json({ data: { team: formattedTeam } })
  } catch (error) {
    console.error('Error fetching team:', error)
    res.status(500).json({ error: 'Failed to fetch team' })
  }
})

// Create team
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ error: 'Only administrators can create teams' })
    }

    const { name, icon, color, description, permissions = [], isActive = true } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Team name is required' })
    }

    // Create team with permissions in a transaction
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

      // Create permissions if provided
      if (Array.isArray(permissions) && permissions.length > 0) {
        await tx.teamPermission.createMany({
          data: permissions.map(permission => ({
            teamId: team.id,
            permission: String(permission)
          }))
        })
      }

      // Fetch complete team with permissions
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

    res.status(201).json({
      data: {
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
      }
    })
  } catch (error) {
    console.error('Error creating team:', error)
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Team with this name already exists' })
    }
    res.status(500).json({ error: 'Failed to create team' })
  }
})

// Update team
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    if (!isAdmin) {
      return res.status(403).json({ error: 'Only administrators can update teams' })
    }

    if (!isAdmin && isManagementTeam(id)) {
      return denyManagementAccess(res)
    }

    const existingTeam = await prisma.team.findUnique({
      where: { id },
      include: { permissions: true }
    })

    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found' })
    }

    const { name, icon, color, description, permissions, isActive } = req.body

    // Update team and permissions in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update team fields
      const updateData = {}
      if (name !== undefined) updateData.name = name
      if (icon !== undefined) updateData.icon = icon || null
      if (color !== undefined) updateData.color = color || null
      if (description !== undefined) updateData.description = description || null
      if (isActive !== undefined) updateData.isActive = isActive

      const team = await tx.team.update({
        where: { id },
        data: updateData
      })

      // Update permissions if provided
      if (Array.isArray(permissions)) {
        // Delete existing permissions
        await tx.teamPermission.deleteMany({
          where: { teamId: id }
        })

        // Create new permissions
        if (permissions.length > 0) {
          await tx.teamPermission.createMany({
            data: permissions.map(permission => ({
              teamId: id,
              permission: String(permission)
            }))
          })
        }
      }

      // Fetch complete team
      return tx.team.findUnique({
        where: { id },
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

    res.json({
      data: {
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
      }
    })
  } catch (error) {
    console.error('Error updating team:', error)
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Team with this name already exists' })
    }
    res.status(500).json({ error: 'Failed to update team' })
  }
})

// Delete team
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    if (!isAdmin) {
      return res.status(403).json({ error: 'Only administrators can delete teams' })
    }

    if (isManagementTeam(id)) {
      return res.status(403).json({ error: 'Cannot delete the Management team' })
    }

    const existingTeam = await prisma.team.findUnique({
      where: { id },
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
      return res.status(404).json({ error: 'Team not found' })
    }

    // Check if team has associated data
    const hasData = existingTeam._count.memberships > 0 ||
                    existingTeam._count.documents > 0 ||
                    existingTeam._count.workflows > 0 ||
                    existingTeam._count.checklists > 0 ||
                    existingTeam._count.notices > 0 ||
                    existingTeam._count.tasks > 0

    if (hasData) {
      // Soft delete: set isActive to false instead of hard delete
      await prisma.team.update({
        where: { id },
        data: { isActive: false }
      })
      return res.json({ 
        success: true, 
        message: 'Team deactivated (has associated data)',
        softDelete: true
      })
    }

    // Hard delete if no associated data (cascade will handle related records)
    await prisma.team.delete({
      where: { id }
    })

    res.json({ success: true, message: 'Team deleted successfully' })
  } catch (error) {
    console.error('Error deleting team:', error)
    res.status(500).json({ error: 'Failed to delete team' })
  }
})

// ============ TEAM DOCUMENTS ============

// Get all documents (optionally filtered by team)
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const { team, teamId } = req.query
    const isAdmin = isAdminUser(req.user)
    
    // Support both team (name/id) and teamId for backward compatibility
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

    res.json({ data: { documents } })
  } catch (error) {
    console.error('Error fetching team documents:', error)
    res.status(500).json({ error: 'Failed to fetch documents' })
  }
})

// Create document
router.post('/documents', authenticateToken, async (req, res) => {
  try {
    const { team, teamId, tags, attachments, ...rest } = req.body
    const isAdmin = isAdminUser(req.user)
    
    // Support both team and teamId, prefer teamId
    const targetTeamId = teamId || team
    if (!targetTeamId) {
      return res.status(400).json({ error: 'teamId is required' })
    }

    if (!isAdmin && isManagementTeam(targetTeamId)) {
      return denyManagementAccess(res)
    }

    // Convert tags and attachments to JSON if they're strings
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

    res.json({ data: { document } })
  } catch (error) {
    console.error('Error creating team document:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to create document' })
  }
})

// Update document
router.put('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingDocument = await prisma.teamDocument.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const { team, teamId, tags, attachments, ...rest } = req.body
    const targetTeamId = teamId || team || existingDocument.teamId

    if (
      !isAdmin &&
      (isManagementTeam(existingDocument.teamId) || isManagementTeam(targetTeamId))
    ) {
      return denyManagementAccess(res)
    }

    // Convert tags and attachments to JSON if they're strings
    const updateData = {
      ...rest
    }
    
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
      where: { id },
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

    res.json({ data: { document } })
  } catch (error) {
    console.error('Error updating team document:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to update document' })
  }
})

// Delete document
router.delete('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingDocument = await prisma.teamDocument.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' })
    }

    if (!isAdmin && isManagementTeam(existingDocument.teamId)) {
      return denyManagementAccess(res)
    }

    await prisma.teamDocument.delete({
      where: { id }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting team document:', error)
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

// ============ TEAM WORKFLOWS ============

// Get all workflows (optionally filtered by team)
router.get('/workflows', authenticateToken, async (req, res) => {
  try {
    const { team, teamId } = req.query
    const isAdmin = isAdminUser(req.user)
    
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

    res.json({ data: { workflows } })
  } catch (error) {
    console.error('Error fetching team workflows:', error)
    res.status(500).json({ error: 'Failed to fetch workflows' })
  }
})

// Create workflow
router.post('/workflows', authenticateToken, async (req, res) => {
  try {
    const { team, teamId, steps, tags, ...rest } = req.body
    const isAdmin = isAdminUser(req.user)
    
    const targetTeamId = teamId || team
    if (!targetTeamId) {
      return res.status(400).json({ error: 'teamId is required' })
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

    res.json({ data: { workflow } })
  } catch (error) {
    console.error('Error creating team workflow:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to create workflow' })
  }
})

// Update workflow
router.put('/workflows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingWorkflow = await prisma.teamWorkflow.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingWorkflow) {
      return res.status(404).json({ error: 'Workflow not found' })
    }

    const { team, teamId, steps, tags, ...rest } = req.body
    const targetTeamId = teamId || team || existingWorkflow.teamId

    if (
      !isAdmin &&
      (isManagementTeam(existingWorkflow.teamId) || isManagementTeam(targetTeamId))
    ) {
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
      where: { id },
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

    res.json({ data: { workflow } })
  } catch (error) {
    console.error('Error updating team workflow:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to update workflow' })
  }
})

// Delete workflow
router.delete('/workflows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingWorkflow = await prisma.teamWorkflow.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingWorkflow) {
      return res.status(404).json({ error: 'Workflow not found' })
    }

    if (!isAdmin && isManagementTeam(existingWorkflow.teamId)) {
      return denyManagementAccess(res)
    }

    await prisma.teamWorkflow.delete({
      where: { id }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting team workflow:', error)
    res.status(500).json({ error: 'Failed to delete workflow' })
  }
})

// ============ TEAM CHECKLISTS ============

// Get all checklists (optionally filtered by team)
router.get('/checklists', authenticateToken, async (req, res) => {
  try {
    const { team, teamId } = req.query
    const isAdmin = isAdminUser(req.user)
    
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

    res.json({ data: { checklists } })
  } catch (error) {
    console.error('Error fetching team checklists:', error)
    res.status(500).json({ error: 'Failed to fetch checklists' })
  }
})

// Create checklist
router.post('/checklists', authenticateToken, async (req, res) => {
  try {
    const { team, teamId, items, ...rest } = req.body
    const isAdmin = isAdminUser(req.user)
    
    const targetTeamId = teamId || team
    if (!targetTeamId) {
      return res.status(400).json({ error: 'teamId is required' })
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

    res.json({ data: { checklist } })
  } catch (error) {
    console.error('Error creating team checklist:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to create checklist' })
  }
})

// Update checklist
router.put('/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingChecklist = await prisma.teamChecklist.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingChecklist) {
      return res.status(404).json({ error: 'Checklist not found' })
    }

    const { team, teamId, items, ...rest } = req.body
    const targetTeamId = teamId || team || existingChecklist.teamId

    if (
      !isAdmin &&
      (isManagementTeam(existingChecklist.teamId) || isManagementTeam(targetTeamId))
    ) {
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
      where: { id },
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

    res.json({ data: { checklist } })
  } catch (error) {
    console.error('Error updating team checklist:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to update checklist' })
  }
})

// Delete checklist
router.delete('/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingChecklist = await prisma.teamChecklist.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingChecklist) {
      return res.status(404).json({ error: 'Checklist not found' })
    }

    if (!isAdmin && isManagementTeam(existingChecklist.teamId)) {
      return denyManagementAccess(res)
    }

    await prisma.teamChecklist.delete({
      where: { id }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting team checklist:', error)
    res.status(500).json({ error: 'Failed to delete checklist' })
  }
})

// ============ TEAM NOTICES ============

// Get all notices (optionally filtered by team)
router.get('/notices', authenticateToken, async (req, res) => {
  try {
    const { team, teamId } = req.query
    const isAdmin = isAdminUser(req.user)
    
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

    res.json({ data: { notices } })
  } catch (error) {
    console.error('Error fetching team notices:', error)
    res.status(500).json({ error: 'Failed to fetch notices' })
  }
})

// Create notice
router.post('/notices', authenticateToken, async (req, res) => {
  try {
    const { team, teamId, ...rest } = req.body
    const isAdmin = isAdminUser(req.user)
    
    const targetTeamId = teamId || team
    if (!targetTeamId) {
      return res.status(400).json({ error: 'teamId is required' })
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

    res.json({ data: { notice } })
  } catch (error) {
    console.error('Error creating team notice:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to create notice' })
  }
})

// Update notice
router.put('/notices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingNotice = await prisma.teamNotice.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingNotice) {
      return res.status(404).json({ error: 'Notice not found' })
    }

    const { team, teamId, ...rest } = req.body
    const targetTeamId = teamId || team || existingNotice.teamId

    if (
      !isAdmin &&
      (isManagementTeam(existingNotice.teamId) || isManagementTeam(targetTeamId))
    ) {
      return denyManagementAccess(res)
    }

    const updateData = { ...rest }
    if (targetTeamId && targetTeamId !== existingNotice.teamId) {
      updateData.teamId = targetTeamId
    }

    const notice = await prisma.teamNotice.update({
      where: { id },
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

    res.json({ data: { notice } })
  } catch (error) {
    console.error('Error updating team notice:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to update notice' })
  }
})

// Delete notice
router.delete('/notices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingNotice = await prisma.teamNotice.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingNotice) {
      return res.status(404).json({ error: 'Notice not found' })
    }

    if (!isAdmin && isManagementTeam(existingNotice.teamId)) {
      return denyManagementAccess(res)
    }

    await prisma.teamNotice.delete({
      where: { id }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting team notice:', error)
    res.status(500).json({ error: 'Failed to delete notice' })
  }
})

// ============ TEAM TASKS ============

// Get all tasks (optionally filtered by team)
router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const { team, teamId } = req.query
    const isAdmin = isAdminUser(req.user)
    
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

    res.json({ data: { tasks } })
  } catch (error) {
    console.error('Error fetching team tasks:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// Create task
router.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { team, teamId, tags, attachments, ...rest } = req.body
    const isAdmin = isAdminUser(req.user)
    
    const targetTeamId = teamId || team
    if (!targetTeamId) {
      return res.status(400).json({ error: 'teamId is required' })
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

    res.json({ data: { task } })
  } catch (error) {
    console.error('Error creating team task:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// Update task
router.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingTask = await prisma.teamTask.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const { team, teamId, tags, attachments, ...rest } = req.body
    const targetTeamId = teamId || team || existingTask.teamId

    if (
      !isAdmin &&
      (isManagementTeam(existingTask.teamId) || isManagementTeam(targetTeamId))
    ) {
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
      where: { id },
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

    res.json({ data: { task } })
  } catch (error) {
    console.error('Error updating team task:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team not found' })
    }
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// Delete task
router.delete('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = isAdminUser(req.user)

    const existingTask = await prisma.teamTask.findUnique({
      where: { id },
      include: { team: true }
    })

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' })
    }

    if (!isAdmin && isManagementTeam(existingTask.teamId)) {
      return denyManagementAccess(res)
    }

    await prisma.teamTask.delete({
      where: { id }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting team task:', error)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

// ============ WORKFLOW EXECUTIONS ============

// Get all executions (optionally filtered by workflowId or team)
router.get('/executions', authenticateToken, async (req, res) => {
  try {
    const { workflowId, team, teamId } = req.query
    const isAdmin = isAdminUser(req.user)
    
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

    res.json({ data: { executions } })
  } catch (error) {
    console.error('Error fetching workflow executions:', error)
    res.status(500).json({ error: 'Failed to fetch executions' })
  }
})

// Create execution
router.post('/executions', authenticateToken, async (req, res) => {
  try {
    const { team, teamId, completedSteps, ...rest } = req.body
    const isAdmin = isAdminUser(req.user)
    
    const targetTeamId = teamId || team
    if (!targetTeamId) {
      return res.status(400).json({ error: 'teamId is required' })
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

    res.json({ data: { execution } })
  } catch (error) {
    console.error('Error creating workflow execution:', error)
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Team or Workflow not found' })
    }
    res.status(500).json({ error: 'Failed to create execution' })
  }
})

module.exports = router;
