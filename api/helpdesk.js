import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { notifyCommentParticipants, resolveMentionedUserIds } from './_lib/notifyCommentParticipants.js'

// Helper function to parse JSON fields from database responses
function parseTicketJsonFields(ticket) {
  try {
    const jsonFields = ['tags', 'attachments', 'comments', 'activityLog', 'customFields']
    const parsed = { ...ticket }
    
    for (const field of jsonFields) {
      const value = parsed[field]
      
      if (typeof value === 'string' && value) {
        try {
          parsed[field] = JSON.parse(value)
        } catch (e) {
          parsed[field] = field === 'customFields' ? {} : []
        }
      } else if (!value) {
        parsed[field] = field === 'customFields' ? {} : []
      }
    }
    
    return parsed
  } catch (error) {
    console.error(`❌ Error parsing ticket ${ticket.id}:`, error.message)
    return ticket
  }
}

// Generate unique ticket number: TKT-YYYY-NNNN
export async function generateTicketNumber() {
  const year = new Date().getFullYear()
  const prefix = `TKT-${year}-`
  
  // Find the highest ticket number for this year
  const lastTicket = await prisma.ticket.findFirst({
    where: {
      ticketNumber: {
        startsWith: prefix
      }
    },
    orderBy: {
      ticketNumber: 'desc'
    }
  })
  
  let sequence = 1
  if (lastTicket) {
    const lastSequence = parseInt(lastTicket.ticketNumber.split('-')[2] || '0')
    sequence = lastSequence + 1
  }
  
  return `${prefix}${sequence.toString().padStart(4, '0')}`
}

// Check if Ticket table exists
async function checkTicketTableExists() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "Ticket" LIMIT 1`
    return true
  } catch (error) {
    if (error.code === 'P2021' || error.message?.includes('does not exist') || error.message?.includes('relation') || error.message?.includes('table')) {
      return false
    }
    throw error
  }
}

async function handler(req, res) {
  try {
    // Check if Ticket table exists
    const tableExists = await checkTicketTableExists()
    if (!tableExists) {
      return serverError(res, 'Ticket table not found', 'The Ticket table has not been created yet. Please run the database migration: npx prisma migrate deploy')
    }

    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]
    const userId = req.user?.sub

    // List Tickets (GET /api/helpdesk)
    if (req.method === 'GET' && ((pathSegments.length === 1 && pathSegments[0] === 'helpdesk') || (pathSegments.length === 0 && req.url === '/helpdesk/'))) {
      try {
        const query = req.query || {}
        const {
          status,
          priority,
          category,
          type,
          assignedTo,
          createdBy,
          clientId,
          projectId,
          search,
          page = '1',
          limit = '50',
          sortBy = 'createdAt',
          sortOrder = 'desc'
        } = query

        // Build where clause
        const where = {}
        
        if (status && status !== 'all') {
          where.status = status
        }
        
        if (priority && priority !== 'all') {
          where.priority = priority
        }
        
        if (category && category !== 'all') {
          where.category = category
        }
        
        if (type && type !== 'all') {
          where.type = type
        }
        
        if (assignedTo) {
          where.assignedToId = assignedTo
        }
        
        if (createdBy) {
          where.createdById = createdBy
        }
        
        if (clientId) {
          where.clientId = clientId
        }
        
        if (projectId) {
          where.projectId = projectId
        }
        
        // Search on title and description
        if (search) {
          where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { ticketNumber: { contains: search, mode: 'insensitive' } }
          ]
        }

        // Pagination
        const pageNum = parseInt(page) || 1
        const limitNum = parseInt(limit) || 50
        const skip = (pageNum - 1) * limitNum

        // Sorting
        const orderBy = {}
        if (sortBy === 'priority') {
          const priorityOrder = { critical: 5, urgent: 4, high: 3, medium: 2, low: 1 }
          // Note: This is a simplified sort - for proper priority sorting, we'd need raw SQL
          orderBy.priority = sortOrder === 'asc' ? 'asc' : 'desc'
        } else {
          orderBy[sortBy] = sortOrder === 'asc' ? 'asc' : 'desc'
        }

        const [tickets, total] = await Promise.all([
          prisma.ticket.findMany({
            where,
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              },
              assignedTo: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              },
              client: {
                select: {
                  id: true,
                  name: true
                }
              },
              project: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy,
            skip,
            take: limitNum
          }),
          prisma.ticket.count({ where })
        ])

        // Parse JSON fields
        const parsedTickets = tickets.map(parseTicketJsonFields)

        return ok(res, {
          tickets: parsedTickets,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
          }
        })
      } catch (error) {
        console.error('❌ Error fetching tickets:', error)
        return serverError(res, 'Failed to fetch tickets', error.message)
      }
    }

    // Create Ticket (POST /api/helpdesk)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'helpdesk') {
      try {
        const body = await parseJsonBody(req)
        
        if (!body.title || !body.title.trim()) {
          return badRequest(res, 'Title is required')
        }

        if (!userId) {
          return badRequest(res, 'User ID is required')
        }

        // Verify user exists
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) {
          return badRequest(res, 'User not found')
        }

        // Generate ticket number
        const ticketNumber = await generateTicketNumber()

        // Build ticket data - ensure type is always explicitly set
        const ticketType = (body.type && body.type.trim() !== '') ? body.type.trim() : 'internal'
        
        // Build ticket data - support both manual and email creation
        // Note: Email fields are only included if provided (for email-created tickets)
        // They won't be in the object for manual tickets, which is fine since they're optional
        const ticketData = {
          ticketNumber,
          title: body.title.trim(),
          description: body.description || '',
          status: body.status || 'open',
          priority: body.priority || 'medium',
          category: body.category || 'general',
          type: ticketType, // Always explicitly set ('internal' for manual, 'email' for email)
          createdById: userId,
          assignedToId: body.assignedToId || null,
          clientId: body.clientId || null,
          projectId: body.projectId || null,
          relatedTicketId: body.relatedTicketId || null,
          tags: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
          attachments: JSON.stringify(Array.isArray(body.attachments) ? body.attachments : []),
          comments: JSON.stringify(Array.isArray(body.comments) ? body.comments : []),
          activityLog: JSON.stringify([{
            action: 'created',
            userId,
            userName: user.name || user.email,
            timestamp: new Date().toISOString(),
            source: ticketType === 'email' ? 'email' : 'manual'
          }]),
          customFields: JSON.stringify(typeof body.customFields === 'object' ? body.customFields : {}),
          dueDate: body.dueDate ? new Date(body.dueDate) : null
        }

        // Only add email fields if they're provided (email-created tickets)
        // These fields may not exist in DB until migration runs, but Prisma will handle null/undefined gracefully
        if (body.sourceEmail) ticketData.sourceEmail = body.sourceEmail
        if (body.emailThreadId) ticketData.emailThreadId = body.emailThreadId
        if (body.emailMessageId) ticketData.emailMessageId = body.emailMessageId
        if (body.emailSubject) ticketData.emailSubject = body.emailSubject

        console.log('📝 Creating ticket with data:', {
          ticketNumber: ticketData.ticketNumber,
          title: ticketData.title,
          type: ticketData.type,
          status: ticketData.status,
          priority: ticketData.priority,
          createdById: ticketData.createdById
        })

        const ticket = await prisma.ticket.create({
          data: ticketData,
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            },
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            },
            client: {
              select: {
                id: true,
                name: true
              }
            },
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        })

        const parsedTicket = parseTicketJsonFields(ticket)
        return created(res, { ticket: parsedTicket })
      } catch (error) {
        console.error('❌ Error creating ticket:', error)
        console.error('❌ Error details:', {
          message: error.message,
          code: error.code,
          meta: error.meta,
          body: {
            title: body?.title,
            hasTitle: !!body?.title,
            hasType: !!body?.type
          }
        })
        return serverError(res, 'Failed to create ticket', error.message)
      }
    }

    // Get, Update, Delete Single Ticket (GET, PATCH, DELETE /api/helpdesk/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'helpdesk' && id) {
      if (req.method === 'GET') {
        try {
          const ticket = await prisma.ticket.findUnique({
            where: { id },
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              },
              assignedTo: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              },
              client: {
                select: {
                  id: true,
                  name: true
                }
              },
              project: {
                select: {
                  id: true,
                  name: true
                }
              },
              relatedTicket: {
                select: {
                  id: true,
                  ticketNumber: true,
                  title: true,
                  status: true
                }
              },
              relatedTickets: {
                select: {
                  id: true,
                  ticketNumber: true,
                  title: true,
                  status: true
                }
              }
            }
          })

          if (!ticket) {
            return notFound(res, 'Ticket not found')
          }

          const parsedTicket = parseTicketJsonFields(ticket)
          return ok(res, { ticket: parsedTicket })
        } catch (error) {
          console.error('❌ Error fetching ticket:', error)
          return serverError(res, 'Failed to fetch ticket', error.message)
        }
      }

      if (req.method === 'PATCH') {
        try {
          const body = await parseJsonBody(req)
          
          // Get current ticket to track changes
          const currentTicket = await prisma.ticket.findUnique({
            where: { id },
            select: {
              status: true,
              priority: true,
              assignedToId: true,
              activityLog: true
            }
          })

          if (!currentTicket) {
            return notFound(res, 'Ticket not found')
          }

          // Build update data
          const updateData = {}
          
          if (body.title !== undefined) updateData.title = body.title.trim()
          if (body.description !== undefined) updateData.description = body.description
          if (body.status !== undefined) updateData.status = body.status
          if (body.priority !== undefined) updateData.priority = body.priority
          if (body.category !== undefined) updateData.category = body.category
          if (body.type !== undefined) updateData.type = body.type
          if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId || null
          if (body.clientId !== undefined) updateData.clientId = body.clientId || null
          if (body.projectId !== undefined) updateData.projectId = body.projectId || null
          if (body.relatedTicketId !== undefined) updateData.relatedTicketId = body.relatedTicketId || null
          if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null
          
          if (body.tags !== undefined) updateData.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags : [])
          if (body.attachments !== undefined) updateData.attachments = JSON.stringify(Array.isArray(body.attachments) ? body.attachments : [])
          if (body.comments !== undefined) updateData.comments = JSON.stringify(Array.isArray(body.comments) ? body.comments : [])
          if (body.customFields !== undefined) updateData.customFields = JSON.stringify(typeof body.customFields === 'object' ? body.customFields : {})

          // Handle status changes
          if (body.status && body.status !== currentTicket.status) {
            if (body.status === 'resolved') {
              updateData.resolvedAt = new Date()
            } else if (body.status === 'closed' || body.status === 'cancelled') {
              updateData.closedAt = new Date()
            }
          }

          // Track changes in activity log
          const activityEntries = []
          const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
          const userName = user?.name || user?.email || 'Unknown'

          if (body.status && body.status !== currentTicket.status) {
            activityEntries.push({
              action: 'status_changed',
              from: currentTicket.status,
              to: body.status,
              userId,
              userName,
              timestamp: new Date().toISOString()
            })
          }

          if (body.priority && body.priority !== currentTicket.priority) {
            activityEntries.push({
              action: 'priority_changed',
              from: currentTicket.priority,
              to: body.priority,
              userId,
              userName,
              timestamp: new Date().toISOString()
            })
          }

          if (body.assignedToId !== undefined && body.assignedToId !== currentTicket.assignedToId) {
            const oldAssignee = currentTicket.assignedToId ? await prisma.user.findUnique({ where: { id: currentTicket.assignedToId }, select: { name: true, email: true } }) : null
            const newAssignee = body.assignedToId ? await prisma.user.findUnique({ where: { id: body.assignedToId }, select: { name: true, email: true } }) : null
            
            activityEntries.push({
              action: 'assigned',
              from: oldAssignee?.name || oldAssignee?.email || 'Unassigned',
              to: newAssignee?.name || newAssignee?.email || 'Unassigned',
              userId,
              userName,
              timestamp: new Date().toISOString()
            })
          }

          // Update activity log
          if (activityEntries.length > 0) {
            const currentActivityLog = currentTicket.activityLog ? JSON.parse(currentTicket.activityLog) : []
            updateData.activityLog = JSON.stringify([...currentActivityLog, ...activityEntries])
          }

          const ticket = await prisma.ticket.update({
            where: { id },
            data: updateData,
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              },
              assignedTo: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              },
              client: {
                select: {
                  id: true,
                  name: true
                }
              },
              project: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          })

          const parsedTicket = parseTicketJsonFields(ticket)
          return ok(res, { ticket: parsedTicket })
        } catch (error) {
          console.error('❌ Error updating ticket:', error)
          return serverError(res, 'Failed to update ticket', error.message)
        }
      }

      if (req.method === 'DELETE') {
        try {
          const ticket = await prisma.ticket.findUnique({ where: { id } })
          
          if (!ticket) {
            return notFound(res, 'Ticket not found')
          }

          // Check permissions - only creator or admin can delete
          if (ticket.createdById !== userId && req.user?.role !== 'admin') {
            return badRequest(res, 'You do not have permission to delete this ticket')
          }

          await prisma.ticket.delete({ where: { id } })
          return ok(res, { message: 'Ticket deleted successfully' })
        } catch (error) {
          console.error('❌ Error deleting ticket:', error)
          return serverError(res, 'Failed to delete ticket', error.message)
        }
      }
    }

    // Add comment (POST /api/helpdesk/[id]/comments)
    if (req.method === 'POST' && pathSegments.length === 3 && pathSegments[0] === 'helpdesk' && pathSegments[2] === 'comments' && id) {
      try {
        const body = await parseJsonBody(req)
        
        if (!body.message || !body.message.trim()) {
          return badRequest(res, 'Comment message is required')
        }

        const ticket = await prisma.ticket.findUnique({ where: { id } })
        if (!ticket) {
          return notFound(res, 'Ticket not found')
        }

        const user = await prisma.user.findUnique({ 
          where: { id: userId },
          select: { id: true, name: true, email: true }
        })

        if (!user) {
          return badRequest(res, 'User not found')
        }

        // Get current comments
        const currentComments = ticket.comments ? JSON.parse(ticket.comments) : []
        
        // Add new comment
        const newComment = {
          id: `comment_${Date.now()}`,
          message: body.message.trim(),
          userId: userId,
          userName: user.name || user.email,
          timestamp: new Date().toISOString(),
          isInternal: body.isInternal || false
        }

        const updatedComments = [...currentComments, newComment]

        // Update ticket
        const updatedTicket = await prisma.ticket.update({
          where: { id },
          data: {
            comments: JSON.stringify(updatedComments),
            activityLog: JSON.stringify([
              ...(ticket.activityLog ? JSON.parse(ticket.activityLog) : []),
              {
                action: 'comment_added',
                userId,
                userName: user.name || user.email,
                timestamp: new Date().toISOString()
              }
            ])
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            },
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            },
            client: {
              select: {
                id: true,
                name: true
              }
            },
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        })

        const parsedTicket = parseTicketJsonFields(updatedTicket)

        // Subscribe: comment author + @mentioned + assignee + prior commenters get email for all subsequent comments
        // Notify participants: ticket creator, assignee, all subscribers (prior commenters + previously mentioned in any comment)
        try {
          const priorUserIds = [ticket.assignedToId, ...currentComments.map((c) => c.userId)].filter(Boolean)
          const priorCommentTexts = (currentComments || []).map((c) => c.message || c.body || c.text).filter(Boolean)
          const mentionedIdsResolved = await resolveMentionedUserIds(body.message.trim())
          const subscriberIds = [...new Set([String(userId), ...(mentionedIdsResolved || []), ...priorUserIds])].filter(Boolean)
          await Promise.all(
            subscriberIds.map((uid) =>
              prisma.commentThreadSubscription.upsert({
                where: {
                  threadType_threadId_userId: {
                    threadType: 'helpdesk',
                    threadId: String(id),
                    userId: String(uid)
                  }
                },
                create: { threadType: 'helpdesk', threadId: String(id), userId: String(uid) },
                update: {}
              })
            )
          )
          await notifyCommentParticipants({
            commentAuthorId: userId,
            commentText: body.message.trim(),
            entityAuthorId: ticket.createdById || null,
            priorCommentAuthorIds: subscriberIds,
            priorCommentTexts,
            authorName: user.name || user.email || 'Someone',
            contextTitle: `Ticket #${ticket.ticketNumber}: ${ticket.title || 'Helpdesk'}`,
            link: `#/helpdesk/${id}`,
            metadata: { ticketId: id, commentText: body.message.trim() }
          })
        } catch (notifyErr) {
          console.error('Notify comment participants failed (helpdesk):', notifyErr)
        }

        return created(res, { ticket: parsedTicket, comment: newComment })
      } catch (error) {
        console.error('❌ Error adding comment:', error)
        return serverError(res, 'Failed to add comment', error.message)
      }
    }

    // Stats endpoint (GET /api/helpdesk/stats)
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[0] === 'helpdesk' && pathSegments[1] === 'stats') {
      try {
        const stats = {
          total: await prisma.ticket.count(),
          byStatus: {
            open: await prisma.ticket.count({ where: { status: 'open' } }),
            inProgress: await prisma.ticket.count({ where: { status: 'in-progress' } }),
            resolved: await prisma.ticket.count({ where: { status: 'resolved' } }),
            closed: await prisma.ticket.count({ where: { status: 'closed' } }),
            cancelled: await prisma.ticket.count({ where: { status: 'cancelled' } })
          },
          byPriority: {
            low: await prisma.ticket.count({ where: { priority: 'low' } }),
            medium: await prisma.ticket.count({ where: { priority: 'medium' } }),
            high: await prisma.ticket.count({ where: { priority: 'high' } }),
            urgent: await prisma.ticket.count({ where: { priority: 'urgent' } }),
            critical: await prisma.ticket.count({ where: { priority: 'critical' } })
          },
          assignedToMe: userId ? await prisma.ticket.count({ where: { assignedToId: userId, status: { not: 'closed' } } }) : 0,
          createdByMe: userId ? await prisma.ticket.count({ where: { createdById: userId } }) : 0
        }

        return ok(res, { stats })
      } catch (error) {
        console.error('❌ Error fetching stats:', error)
        return serverError(res, 'Failed to fetch stats', error.message)
      }
    }

    return notFound(res, 'Endpoint not found')
  } catch (error) {
    console.error('❌ Helpdesk API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

