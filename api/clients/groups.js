// Company Groups API endpoint
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

/**
 * Validates that assigning client to group won't create circular references
 */
async function validateNoCircularReference(clientId, groupId) {
  // Check if groupId is a descendant of clientId (would create cycle)
  const visited = new Set()
  let currentId = groupId
  
  while (currentId) {
    if (visited.has(currentId)) {
      // Circular path detected
      return { valid: false, reason: 'Circular reference detected' }
    }
    
    if (currentId === clientId) {
      // Group is a descendant of client - would create cycle
      return { valid: false, reason: 'Cannot assign client to its own descendant' }
    }
    
    visited.add(currentId)
    
    // Check if currentId has a parentGroupId
    try {
      const client = await prisma.client.findUnique({
        where: { id: currentId },
        select: { parentGroupId: true }
      })
      
      if (!client || !client.parentGroupId) {
        break // No more parents to check
      }
      
      currentId = client.parentGroupId
    } catch (error) {
      console.error('Error checking for circular reference:', error)
      break
    }
  }
  
  return { valid: true }
}

async function handler(req, res) {
  try {
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '')
    const pathSegments = urlPath.split('/').filter(Boolean)
    
    // GET /api/clients/groups - List all company groups
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[0] === 'clients' && pathSegments[1] === 'groups') {
      try {
        // Get all clients that are groups (have child companies or are used as groups)
        const groups = await prisma.client.findMany({
          where: {
            OR: [
              {
                childCompanies: {
                  some: {}
                }
              },
              {
                groupChildren: {
                  some: {}
                }
              }
            ]
          },
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            status: true,
            _count: {
              select: {
                childCompanies: true,
                groupChildren: true
              }
            }
          },
          orderBy: {
            name: 'asc'
          }
        })
        
        return ok(res, { groups })
      } catch (error) {
        console.error('Error fetching groups:', error)
        return serverError(res, 'Failed to fetch groups')
      }
    }
    
    // GET /api/clients/:id/groups - Get groups for a specific client
    if (req.method === 'GET' && pathSegments.length === 3 && pathSegments[0] === 'clients' && pathSegments[2] === 'groups') {
      const clientId = pathSegments[1]
      
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          include: {
            parentGroup: {
              select: {
                id: true,
                name: true,
                type: true
              }
            },
            groupMemberships: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    industry: true
                  }
                }
              }
            },
            childCompanies: {
              select: {
                id: true,
                name: true,
                type: true
              }
            }
          }
        })
        
        if (!client) {
          return notFound(res, 'Client not found')
        }
        
        return ok(res, {
          clientId: client.id,
          primaryParent: client.parentGroup,
          groupMemberships: client.groupMemberships.map(m => ({
            id: m.id,
            group: m.group,
            role: m.role,
            createdAt: m.createdAt
          })),
          childCompanies: client.childCompanies
        })
      } catch (error) {
        console.error('Error fetching client groups:', error)
        return serverError(res, 'Failed to fetch client groups')
      }
    }
    
    // POST /api/clients/:id/groups - Add client to group
    if (req.method === 'POST' && pathSegments.length === 3 && pathSegments[0] === 'clients' && pathSegments[2] === 'groups') {
      const clientId = pathSegments[1]
      const body = await parseJsonBody(req)
      const { groupId, role } = body
      
      if (!groupId) {
        return badRequest(res, 'groupId is required')
      }
      
      try {
        // Verify client exists
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true }
        })
        
        if (!client) {
          return notFound(res, 'Client not found')
        }
        
        // Verify group exists
        const group = await prisma.client.findUnique({
          where: { id: groupId },
          select: { id: true }
        })
        
        if (!group) {
          return notFound(res, 'Group not found')
        }
        
        // Check if already a member
        const existing = await prisma.clientCompanyGroup.findUnique({
          where: {
            clientId_groupId: {
              clientId,
              groupId
            }
          }
        })
        
        if (existing) {
          return badRequest(res, 'Client is already a member of this group')
        }
        
        // Validate no circular reference
        const validation = await validateNoCircularReference(clientId, groupId)
        if (!validation.valid) {
          return badRequest(res, validation.reason)
        }
        
        // Add to group
        const membership = await prisma.clientCompanyGroup.create({
          data: {
            clientId,
            groupId,
            role: role || 'member'
          },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                type: true
              }
            }
          }
        })
        
        return created(res, { membership })
      } catch (error) {
        console.error('Error adding client to group:', error)
        
        // Handle unique constraint violation
        if (error.code === 'P2002') {
          return badRequest(res, 'Client is already a member of this group')
        }
        
        return serverError(res, 'Failed to add client to group')
      }
    }
    
    // DELETE /api/clients/:id/groups/:groupId - Remove client from group
    if (req.method === 'DELETE' && pathSegments.length === 4 && pathSegments[0] === 'clients' && pathSegments[2] === 'groups') {
      const clientId = pathSegments[1]
      const groupId = pathSegments[3]
      
      try {
        const membership = await prisma.clientCompanyGroup.findUnique({
          where: {
            clientId_groupId: {
              clientId,
              groupId
            }
          }
        })
        
        if (!membership) {
          return notFound(res, 'Membership not found')
        }
        
        await prisma.clientCompanyGroup.delete({
          where: {
            clientId_groupId: {
              clientId,
              groupId
            }
          }
        })
        
        return ok(res, { message: 'Client removed from group' })
      } catch (error) {
        console.error('Error removing client from group:', error)
        return serverError(res, 'Failed to remove client from group')
      }
    }
    
    return badRequest(res, 'Invalid endpoint')
  } catch (error) {
    console.error('Error in groups API:', error)
    return serverError(res, 'Internal server error')
  }
}

export default withHttp(withLogging(authRequired(handler)))

