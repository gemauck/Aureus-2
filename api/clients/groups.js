// Company Groups API endpoint
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'


async function handler(req, res) {
  try {
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '')
    const pathSegments = urlPath.split('/').filter(Boolean)
    console.log('🔍 Groups API handler - URL:', req.url, 'pathSegments:', pathSegments, 'method:', req.method)
    
    // GET /api/clients/groups - List all company groups
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[0] === 'clients' && pathSegments[1] === 'groups') {
      try {
        // Get only actual groups:
        // 1. Clients with type='group' (named groups like "Exxaro Group")
        // 2. Clients that are used as groups (have groupChildren - other clients assigned to them)
        const groups = await prisma.client.findMany({
          where: {
            OR: [
              {
                type: 'group' // Named groups
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
            createdAt: true,
            _count: {
              select: {
                groupChildren: true
              }
            }
          },
          orderBy: {
            name: 'asc'
          }
        })
        
        console.log(`✅ Fetched ${groups.length} groups from database`)
        return ok(res, { groups })
      } catch (error) {
        console.error('❌ Error fetching groups:', error)
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
                groupChildren: true
              }
            }
          }
        })
        
        console.log('✅ Standalone group created:', newGroup)
        return created(res, { group: newGroup })
      } catch (error) {
        // Log full error details for debugging
        console.error('❌ Error creating standalone group:', {
          message: error.message,
          name: error.name,
          code: error.code,
          meta: error.meta,
          stack: error.stack?.substring(0, 500),
          body: body,
          url: req.url,
          method: req.method
        })
        
        // Handle specific Prisma errors
        if (error.code === 'P2002') {
          return badRequest(res, 'A group with this name already exists')
        }
        
        // Handle validation errors
        if (error.code === 'P2003' || error.code === 'P2011') {
          return badRequest(res, 'Invalid data provided for group creation', error.message)
        }
        
        // Handle database connection errors
        if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008' || error.code === 'P1017') {
          return serverError(res, 'Database connection failed', error.message)
        }
        
        // Return detailed error message in development, generic in production
        const errorMessage = process.env.NODE_ENV === 'development' 
          ? `Failed to create group: ${error.message}` 
          : 'Failed to create group'
        
        return serverError(res, errorMessage, error.message)
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
                groupChildren: true
              }
            }
          }
        })
        
        if (!group) {
          return notFound(res, 'Group not found')
        }
        
        // Get all linked clients for detailed error message
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
          groupMembers: groupMembers.map(m => ({ id: m.client.id, name: m.client.name, type: m.client.type, relationship: 'Group Member' }))
        }
        
        const totalLinked = groupMembers.length
        
        // Check if group has any members (group memberships)
        const hasMembers = group._count.groupChildren > 0
        
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
        // First, try to get the client without includes to verify it exists
        const clientExists = await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true, name: true }
        })
        
        if (!clientExists) {
          return notFound(res, 'Client not found')
        }

        // Get group memberships with defensive handling - query separately to avoid join issues
        let memberships = []
        try {
          memberships = await prisma.clientCompanyGroup.findMany({
            where: { clientId },
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
        } catch (membershipError) {
          console.warn(`⚠️ Failed to query group memberships for client ${clientId}:`, membershipError.message)
          // Return empty array if query fails
          return ok(res, {
            clientId: clientId,
            groupMemberships: []
          })
        }

        // Filter out orphaned memberships (where group is null) and auto-cleanup
        const validMemberships = memberships.filter(m => m.group !== null)
        const orphanedMemberships = memberships.filter(m => m.group === null)
        const orphanedCount = orphanedMemberships.length

        // Auto-cleanup orphaned memberships in background (don't block response)
        if (orphanedCount > 0) {
          console.warn(`⚠️ Found ${orphanedCount} orphaned group memberships for client ${clientId} - cleaning up...`)
          
          // Cleanup in background (fire and forget)
          Promise.all(orphanedMemberships.map(m => 
            prisma.clientCompanyGroup.delete({ where: { id: m.id } }).catch(err => 
              console.error(`Failed to delete orphaned membership ${m.id}:`, err.message)
            )
          )).then(() => {
            console.log(`✅ Cleaned up ${orphanedCount} orphaned memberships for client ${clientId}`)
          }).catch(err => {
            console.error(`❌ Error during orphaned membership cleanup:`, err.message)
          })
        }
        
        return ok(res, {
          clientId: clientId,
          groupMemberships: validMemberships.map(m => ({
            id: m.id,
            group: m.group,
            role: m.role,
            createdAt: m.createdAt
          })),
          ...(orphanedCount > 0 ? { 
            warning: `${orphanedCount} orphaned membership(s) were filtered out and will be cleaned up`,
            cleanedUp: orphanedCount 
          } : {})
        })
      } catch (error) {
        console.error('❌ Error fetching client groups:', {
          clientId: clientId,
          errorCode: error.code,
          errorName: error.name,
          errorMessage: error.message,
          errorMeta: error.meta,
          stack: error.stack?.substring(0, 500)
        })
        
        // Check for specific Prisma errors
        if (error.code === 'P2025') {
          return notFound(res, 'Client not found')
        }
        
        if (error.code === 'P2002' || error.code === 'P2003') {
          return serverError(res, 'Database constraint error', `The client data may be corrupted. Error: ${error.message}`)
        }
        
        return serverError(res, 'Failed to fetch client groups', error.message || 'Unknown database error')
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
        // Log full error details for debugging
        console.error('❌ Error adding client to group:', {
          message: error.message,
          name: error.name,
          code: error.code,
          meta: error.meta,
          stack: error.stack?.substring(0, 500),
          clientId,
          groupId: finalGroupId,
          body: body,
          url: req.url,
          method: req.method
        })
        
        // Handle unique constraint violation
        if (error.code === 'P2002') {
          return badRequest(res, 'Client is already a member of this group')
        }
        
        // Handle validation errors
        if (error.code === 'P2003' || error.code === 'P2011') {
          return badRequest(res, 'Invalid data provided', error.message)
        }
        
        // Handle database connection errors
        if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008' || error.code === 'P1017') {
          return serverError(res, 'Database connection failed', error.message)
        }
        
        // Return detailed error message in development, generic in production
        const errorMessage = process.env.NODE_ENV === 'development' 
          ? `Failed to add client to group: ${error.message}` 
          : 'Failed to add client to group'
        
        return serverError(res, errorMessage, error.message)
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
    
    // GET /api/clients/groups/:groupId/members - Get all clients and leads in a group
    // URL: /api/clients/groups/:groupId/members
    // pathSegments after removing /api/: ['clients', 'groups', groupId, 'members']
    if (req.method === 'GET' && pathSegments.length === 4 && pathSegments[0] === 'clients' && pathSegments[1] === 'groups' && pathSegments[pathSegments.length - 1] === 'members') {
      const groupId = pathSegments[2]
      console.log('🔍 GET /api/clients/groups/:groupId/members - groupId:', groupId, 'pathSegments:', pathSegments)
      
      try {
        // Verify group exists
        const group = await prisma.client.findUnique({
          where: { id: groupId },
          select: { id: true, name: true, type: true }
        })
        
        if (!group) {
          return notFound(res, 'Group not found')
        }
        
        // Get all clients and leads that are members of this group
        // This includes direct groupChildren (via ClientCompanyGroup)
        // Note: parentGroupId relationship doesn't exist in database, so we only use ClientCompanyGroup
        const groupMembers = await prisma.clientCompanyGroup.findMany({
          where: { groupId },
          include: {
            client: {
              select: {
                id: true,
                name: true,
                type: true,
                industry: true,
                status: true,
                revenue: true,
                value: true,
                website: true,
                createdAt: true
              }
            }
          },
          orderBy: {
            client: {
              name: 'asc'
            }
          }
        })
        
        // Combine group members
        const allMembers = groupMembers.map(m => ({
          ...m.client,
          relationship: 'Group Member',
          membershipId: m.id,
          role: m.role
        }))
        
        // Separate clients and leads
        const clients = allMembers.filter(m => m.type === 'client' || !m.type)
        const leads = allMembers.filter(m => m.type === 'lead')
        
        console.log(`✅ Fetched ${allMembers.length} members for group ${groupId} (${clients.length} clients, ${leads.length} leads)`)
        
        return ok(res, {
          group: {
            id: group.id,
            name: group.name,
            type: group.type
          },
          members: allMembers,
          clients,
          leads,
          total: allMembers.length
        })
      } catch (error) {
        console.error('❌ Error fetching group members:', error)
        return serverError(res, 'Failed to fetch group members')
      }
    }
    
    return badRequest(res, 'Invalid endpoint')
  } catch (error) {
    console.error('Error in groups API:', error)
    return serverError(res, 'Internal server error')
  }
}

export default withHttp(withLogging(authRequired(handler)))

