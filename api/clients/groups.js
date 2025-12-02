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
        // Get all clients that can be used as groups:
        // 1. Clients with type='group' (named groups like "Exxaro Group")
        // 2. Clients that have child companies (parent companies)
        // 3. Clients that are used as groups (have groupChildren)
        // 4. All regular clients (can be assigned to groups)
        const groups = await prisma.client.findMany({
          where: {
            OR: [
              {
                type: 'group' // Named groups
              },
              {
                childCompanies: {
                  some: {}
                }
              },
              {
                groupChildren: {
                  some: {}
                }
              },
              {
                type: 'client' // Regular clients can also be groups
              }
            ]
          },
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            status: true,
            createdAt: true,
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
    
    // POST /api/clients/groups - Create a standalone group
    if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[0] === 'clients' && pathSegments[1] === 'groups') {
      try {
        const body = await parseJsonBody(req)
        console.log('POST /api/clients/groups - Received body:', body)
        const { name, industry, notes } = body
        
        if (!name || typeof name !== 'string' || !name.trim()) {
          console.error('❌ Invalid name provided:', { name, type: typeof name })
          return badRequest(res, 'Group name is required and must be a non-empty string')
        }
        
        // Check if group with this name already exists
        const existingGroup = await prisma.client.findFirst({
          where: {
            name: name.trim()
          }
        })
        
        if (existingGroup) {
          return badRequest(res, 'A group with this name already exists')
        }
        
        // Get current user for ownerId
        const userId = req.user?.sub
        let ownerId = null
        
        if (userId) {
          try {
            const user = await prisma.user.findUnique({ where: { id: userId } })
            if (user) {
              ownerId = userId
            }
          } catch (userError) {
            // Skip ownerId if error
          }
        }
        
        // Create new group entity
        const newGroup = await prisma.client.create({
          data: {
            name: name.trim(),
            type: 'group',
            industry: industry || 'Other',
            status: 'active',
            stage: 'Awareness',
            revenue: 0,
            value: 0,
            probability: 0,
            lastContact: new Date(),
            address: '',
            website: '',
            notes: notes || `Company group for organizing associated companies`,
            contacts: '[]',
            followUps: '[]',
            projectIds: '[]',
            comments: '[]',
            sites: '[]',
            contracts: '[]',
            activityLog: '[]',
            services: '[]',
            billingTerms: JSON.stringify({
              paymentTerms: 'Net 30',
              billingFrequency: 'Monthly',
              currency: 'ZAR',
              retainerAmount: 0,
              taxExempt: false,
              notes: ''
            }),
            ...(ownerId ? { ownerId } : {})
          },
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            status: true,
            createdAt: true,
            _count: {
              select: {
                childCompanies: true,
                groupChildren: true
              }
            }
          }
        })
        
        console.log('✅ Standalone group created:', newGroup)
        return created(res, { group: newGroup })
      } catch (error) {
        console.error('Error creating standalone group:', error)
        
        if (error.code === 'P2002') {
          return badRequest(res, 'A group with this name already exists')
        }
        
        return serverError(res, 'Failed to create group')
      }
    }
    
    // DELETE /api/clients/groups/:groupId - Delete a group
    if (req.method === 'DELETE' && pathSegments.length === 3 && pathSegments[0] === 'clients' && pathSegments[1] === 'groups') {
      const groupId = req.params?.groupId || pathSegments[2]
      
      try {
        // Check if group exists
        const group = await prisma.client.findUnique({
          where: { id: groupId },
          select: {
            id: true,
            name: true,
            type: true,
            _count: {
              select: {
                childCompanies: true,
                groupChildren: true
              }
            }
          }
        })
        
        if (!group) {
          return notFound(res, 'Group not found')
        }
        
        // Get all linked clients for detailed error message
        const childCompanies = await prisma.client.findMany({
          where: {
            parentGroupId: groupId
          },
          select: {
            id: true,
            name: true,
            type: true
          },
          orderBy: {
            name: 'asc'
          }
        })
        
        const groupMembers = await prisma.clientCompanyGroup.findMany({
          where: {
            groupId: groupId
          },
          include: {
            client: {
              select: {
                id: true,
                name: true,
                type: true
              }
            }
          }
        })
        
        // Sort group members by client name
        groupMembers.sort((a, b) => a.client.name.localeCompare(b.client.name))
        
        const linkedClients = {
          primaryParent: childCompanies.map(c => ({ id: c.id, name: c.name, type: c.type, relationship: 'Primary Parent' })),
          groupMembers: groupMembers.map(m => ({ id: m.client.id, name: m.client.name, type: m.client.type, relationship: 'Group Member' }))
        }
        
        const totalLinked = childCompanies.length + groupMembers.length
        
        // Check if group has any members (child companies or group memberships)
        const hasMembers = group._count.childCompanies > 0 || group._count.groupChildren > 0
        
        if (hasMembers || totalLinked > 0) {
          return badRequest(
            res, 
            `Cannot delete group that has ${totalLinked} linked client(s). Please remove all linked clients first.`,
            { linkedClients }
          )
        }
        
        // Delete the group
        await prisma.client.delete({
          where: { id: groupId }
        })
        
        console.log('✅ Group deleted:', groupId)
        return ok(res, { message: 'Group deleted successfully', deletedGroupId: groupId })
      } catch (error) {
        console.error('Error deleting group:', error)
        
        if (error.code === 'P2003') {
          return badRequest(res, 'Cannot delete group due to existing relationships. Please remove all members and parent associations first.')
        }
        
        return serverError(res, 'Failed to delete group')
      }
    }
    
    // GET /api/clients/:id/groups - Get groups for a specific client
    // Use req.params.id if available (from explicit route) or parse from URL
    if (req.method === 'GET' && pathSegments.length === 3 && pathSegments[0] === 'clients' && pathSegments[2] === 'groups') {
      const clientId = req.params?.id || pathSegments[1]
      console.log('GET /api/clients/:id/groups - clientId:', clientId, 'from req.params:', req.params?.id, 'from pathSegments:', pathSegments[1])
      
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
    
    // POST /api/clients/:id/groups - Add client to group OR create new group
    if (req.method === 'POST' && pathSegments.length === 3 && pathSegments[0] === 'clients' && pathSegments[2] === 'groups') {
      const clientId = req.params?.id || pathSegments[1]
      console.log('POST /api/clients/:id/groups - clientId:', clientId, 'from req.params:', req.params?.id, 'from pathSegments:', pathSegments[1])
      const body = await parseJsonBody(req)
      const { groupId, groupName, role } = body
      console.log('POST body:', { groupId, groupName, role })
      
      try {
        // Verify client exists
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true }
        })
        
        if (!client) {
          return notFound(res, 'Client not found')
        }
        
        let finalGroupId = groupId
        
        // If groupName is provided but no groupId, create a new group
        if (groupName && !groupId) {
          console.log('Creating new group with name:', groupName)
          
          // Check if group with this name already exists (any type)
          const existingGroup = await prisma.client.findFirst({
            where: {
              name: groupName.trim()
            }
          })
          
          if (existingGroup) {
            // Use existing group instead of creating duplicate
            finalGroupId = existingGroup.id
            console.log('Using existing group:', existingGroup.id, existingGroup.name)
          } else {
            // Create new group entity (as a Client with type='group')
            const userEmail = req.user?.email || 'unknown'
            const userId = req.user?.sub
            let ownerId = null
            
            if (userId) {
              try {
                const user = await prisma.user.findUnique({ where: { id: userId } })
                if (user) {
                  ownerId = userId
                }
              } catch (userError) {
                // Skip ownerId if error
              }
            }
            
            const newGroup = await prisma.client.create({
              data: {
                name: groupName.trim(),
                type: 'group', // Mark as a group entity
                industry: body.groupIndustry || 'Other',
                status: 'active',
                stage: 'Awareness', // Required field with default
                revenue: 0, // Required field with default
                value: 0, // Required field with default
                probability: 0, // Required field with default
                lastContact: new Date(), // Required field with default
                address: '',
                website: '',
                notes: body.groupNotes || `Company group for organizing associated companies`,
                contacts: '[]',
                followUps: '[]',
                projectIds: '[]',
                comments: '[]',
                sites: '[]',
                contracts: '[]',
                activityLog: '[]',
                services: '[]',
                billingTerms: JSON.stringify({
                  paymentTerms: 'Net 30',
                  billingFrequency: 'Monthly',
                  currency: 'ZAR',
                  retainerAmount: 0,
                  taxExempt: false,
                  notes: ''
                }),
                ...(ownerId ? { ownerId } : {})
              },
              select: {
                id: true,
                name: true,
                type: true,
                industry: true
              }
            })
            
            finalGroupId = newGroup.id
            console.log('✅ New group created:', newGroup)
          }
        } else if (!finalGroupId) {
          return badRequest(res, 'Either groupId or groupName is required')
        }
        
        // Verify group exists
        const group = await prisma.client.findUnique({
          where: { id: finalGroupId },
          select: { id: true, name: true, type: true }
        })
        
        if (!group) {
          return notFound(res, 'Group not found')
        }
        
        // Check if already a member
        const existing = await prisma.clientCompanyGroup.findUnique({
          where: {
            clientId_groupId: {
              clientId,
              groupId: finalGroupId
            }
          }
        })
        
        if (existing) {
          return badRequest(res, 'Client is already a member of this group')
        }
        
        // Validate no circular reference
        const validation = await validateNoCircularReference(clientId, finalGroupId)
        if (!validation.valid) {
          return badRequest(res, validation.reason)
        }
        
        // Add to group
        console.log('Creating membership:', { clientId, groupId: finalGroupId, role: role || 'member' })
        const membership = await prisma.clientCompanyGroup.create({
          data: {
            clientId,
            groupId: finalGroupId,
            role: role || 'member'
          },
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
        })
        console.log('✅ Membership created successfully:', membership)
        
        return created(res, { membership, groupCreated: !groupId })
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
      const clientId = req.params?.id || pathSegments[1]
      const groupId = req.params?.groupId || pathSegments[3]
      
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

