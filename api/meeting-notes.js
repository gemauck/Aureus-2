// Management Meeting Notes API
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, forbidden } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError, logDatabaseError } from './_lib/dbErrorHandler.js'
import { notifyCommentParticipants, resolveMentionedUserIds } from './_lib/notifyCommentParticipants.js'

// Department definitions
const DEPARTMENTS = [
  { id: 'management', name: 'Director + General' },
  { id: 'compliance', name: 'Compliance' },
  { id: 'finance', name: 'Finance' },
  { id: 'technical', name: 'Technical' },
  { id: 'data', name: 'Data & Analytics' },
  { id: 'support', name: 'Support' },
  { id: 'commercial', name: 'Commercial' },
  { id: 'business-development', name: 'Business Development' }
]

const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'])
const ADMIN_PERMISSION_KEYS = new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'])
const FORBIDDEN_MESSAGE = 'Only administrators can access Management meeting notes.'

function normalizePermissions(permissions) {
  if (!permissions) return []
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch (error) {
      // If JSON parsing fails, try comma-separated string
      try {
        return permissions
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      } catch (splitError) {
        console.warn('Error parsing permissions:', splitError)
        return []
      }
    }
  }
  return []
}

function isAdminUser(user) {
  if (!user) return false

  try {
    const role = (user.role || '').toString().trim().toLowerCase()
    if (ADMIN_ROLES.has(role)) {
      return true
    }

    const normalizedPermissions = normalizePermissions(user.permissions).map((permission) =>
      (permission || '').toString().trim().toLowerCase()
    )

    return normalizedPermissions.some((permission) => ADMIN_PERMISSION_KEYS.has(permission))
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

async function handler(req, res) {
  try {
    // Fetch full user data from database to get permissions
    let user = req.user
    if (req.user?.sub) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: req.user.sub },
          select: { id: true, email: true, role: true, permissions: true, name: true }
        })
        if (dbUser) {
          user = dbUser
        }
      } catch (dbError) {
        console.error('❌ Error fetching user for admin check:', dbError)
        logDatabaseError(dbError, 'fetch user for admin check')
        // Continue with JWT user if DB fetch fails
      }
    }

    if (!isAdminUser(user)) {
      console.warn('⚠️ Management meeting notes access denied for non-admin user', {
        userId: user?.id || user?.sub,
        email: user?.email,
        role: user?.role
      })
      return forbidden(res, FORBIDDEN_MESSAGE)
    }
  } catch (error) {
    console.error('❌ Error in meeting-notes handler admin check:', error)
    logDatabaseError(error, 'admin check')
    if (isConnectionError(error)) {
      return serverError(res, 'Database connection failed', 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
    }
    return serverError(res, 'Failed to verify user permissions', error.message)
  }

  const rawActionParam = req.query?.action ?? req.body?.action ?? ''
  const action = typeof rawActionParam === 'string' ? rawActionParam.trim().toLowerCase() : ''

  // Get all monthly meeting notes
  if (req.method === 'GET' && !req.query.monthKey && !req.query.id) {
    try {
      console.log('📋 Fetching all monthly meeting notes...')
      const monthlyNotes = await prisma.monthlyMeetingNotes.findMany({
        include: {
          weeklyNotes: {
            include: {
              departmentNotes: {
                include: {
                  comments: {
                    include: {
                      author: {
                        select: { id: true, name: true, email: true }
                      }
                    },
                    orderBy: { createdAt: 'asc' }
                  },
                  actionItems: {
                    include: {
                      assignedUser: {
                        select: { id: true, name: true, email: true }
                      },
                      comments: {
                        include: {
                          author: {
                            select: { id: true, name: true, email: true }
                          }
                        },
                        orderBy: { createdAt: 'asc' }
                      }
                    },
                    orderBy: { createdAt: 'asc' }
                  }
                }
              },
              actionItems: {
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  },
                  comments: {
                    include: {
                      author: {
                        select: { id: true, name: true, email: true }
                      }
                    },
                    orderBy: { createdAt: 'asc' }
                  }
                },
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: { weekStart: 'desc' }
          },
          actionItems: {
            include: {
              assignedUser: {
                select: { id: true, name: true, email: true }
              },
              comments: {
                include: {
                  author: {
                    select: { id: true, name: true, email: true }
                  }
                },
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          comments: {
            include: {
              author: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          userAllocations: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        },
        orderBy: { monthKey: 'desc' }
      })

      console.log(`✅ Successfully fetched ${monthlyNotes.length} monthly meeting notes`)
      return ok(res, { monthlyNotes })
    } catch (error) {
      console.error('❌ Error fetching monthly meeting notes:', error)
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack
      })
      logDatabaseError(error, 'fetch monthly meeting notes')
      
      if (isConnectionError(error)) {
        return serverError(res, 'Database connection failed', 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
      }
      
      // Check if tables/columns are missing and return empty array instead of 500
      const errorMessage = error.message || ''
      const isMissingTableOrColumn =
        error.code === 'P2021' || // table does not exist
        error.code === 'P2022' || // column does not exist
        /relation ".*monthly.*meeting.*notes"/i.test(errorMessage) ||
        /no such table: .*monthly.*meeting.*notes/i.test(errorMessage) ||
        /column .* does not exist/i.test(errorMessage)
      
      if (isMissingTableOrColumn) {
        console.warn('⚠️ Meeting Notes API: Meeting notes tables/columns missing in database. Returning empty list fallback.')
        return ok(res, { monthlyNotes: [] })
      }
      
      return serverError(res, 'Failed to fetch meeting notes', error.message || 'Unknown database error')
    }
  }

  // Get specific monthly meeting notes by monthKey
  if (req.method === 'GET' && req.query.monthKey) {
    try {
      console.log(`📋 Fetching monthly meeting notes for monthKey: ${req.query.monthKey}`)
      const monthlyNotes = await prisma.monthlyMeetingNotes.findUnique({
        where: { monthKey: req.query.monthKey },
        include: {
          weeklyNotes: {
            include: {
              departmentNotes: {
                include: {
                  comments: {
                    include: {
                      author: {
                        select: { id: true, name: true, email: true }
                      }
                    },
                    orderBy: { createdAt: 'asc' }
                  },
                  actionItems: {
                    include: {
                      assignedUser: {
                        select: { id: true, name: true, email: true }
                      },
                      comments: {
                        include: {
                          author: {
                            select: { id: true, name: true, email: true }
                          }
                        },
                        orderBy: { createdAt: 'asc' }
                      }
                    },
                    orderBy: { createdAt: 'asc' }
                  }
                }
              },
              actionItems: {
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  },
                  comments: {
                    include: {
                      author: {
                        select: { id: true, name: true, email: true }
                      }
                    },
                    orderBy: { createdAt: 'asc' }
                  }
                },
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: { weekStart: 'desc' }
          },
          actionItems: {
            include: {
              assignedUser: {
                select: { id: true, name: true, email: true }
              },
              comments: {
                include: {
                  author: {
                    select: { id: true, name: true, email: true }
                  }
                },
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          comments: {
            include: {
              author: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          userAllocations: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        }
      })

      if (!monthlyNotes) {
        console.log(`ℹ️ No monthly meeting notes found for monthKey: ${req.query.monthKey}`)
        return ok(res, { monthlyNotes: null })
      }

      console.log(`✅ Successfully fetched monthly meeting notes for monthKey: ${req.query.monthKey}`)
      return ok(res, { monthlyNotes })
    } catch (error) {
      console.error(`❌ Error fetching monthly meeting notes by monthKey (${req.query.monthKey}):`, error)
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack
      })
      logDatabaseError(error, 'fetch monthly meeting notes by monthKey')
      
      if (isConnectionError(error)) {
        return serverError(res, 'Database connection failed', 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
      }
      
      // Check if tables/columns are missing and return null instead of 500
      const errorMessage = error.message || ''
      const isMissingTableOrColumn =
        error.code === 'P2021' || // table does not exist
        error.code === 'P2022' || // column does not exist
        /relation ".*monthly.*meeting.*notes"/i.test(errorMessage) ||
        /no such table: .*monthly.*meeting.*notes/i.test(errorMessage) ||
        /column .* does not exist/i.test(errorMessage)
      
      if (isMissingTableOrColumn) {
        console.warn('⚠️ Meeting Notes API: Meeting notes tables/columns missing in database. Returning null fallback.')
        return ok(res, { monthlyNotes: null })
      }
      
      return serverError(res, 'Failed to fetch meeting notes', error.message || 'Unknown database error')
    }
  }

  // Create monthly meeting notes
  if (req.method === 'POST' && !action) {
    try {
      const { monthKey, monthlyGoals } = req.body

      if (!monthKey) {
        return badRequest(res, 'monthKey is required')
      }

      const monthlyNotes = await prisma.monthlyMeetingNotes.create({
        data: {
          monthKey,
          monthlyGoals: typeof monthlyGoals === 'string' ? monthlyGoals : '',
          ownerId: req.user?.sub || req.user?.id || null
        },
        include: {
          weeklyNotes: true,
          actionItems: true,
          comments: true,
          userAllocations: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        }
      })

      return ok(res, { monthlyNotes })
    } catch (error) {
      console.error('Error creating monthly meeting notes:', error)
      if (error.code === 'P2002') {
        return badRequest(res, 'Meeting notes for this month already exist')
      }
      return serverError(res, 'Failed to create meeting notes')
    }
  }

  // Update monthly meeting notes
  if (req.method === 'PUT' && !action) {
    try {
      const { id, status, monthlyGoals } = req.body

      if (!id) {
        return badRequest(res, 'id is required')
      }

      const updateData = {}
      if (status !== undefined) {
        updateData.status = status
      }
      if (monthlyGoals !== undefined) {
        updateData.monthlyGoals = typeof monthlyGoals === 'string' ? monthlyGoals : ''
      }

      if (Object.keys(updateData).length === 0) {
        return badRequest(res, 'No fields provided for update')
      }

      const monthlyNotes = await prisma.monthlyMeetingNotes.update({
        where: { id },
        data: updateData,
        include: {
          weeklyNotes: {
            include: {
              departmentNotes: true
            }
          },
          actionItems: true,
          comments: true,
          userAllocations: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        }
      })

      return ok(res, { monthlyNotes })
    } catch (error) {
      console.error('Error updating monthly meeting notes:', error)
      return serverError(res, 'Failed to update meeting notes')
    }
  }

  // Delete ALL meeting notes (purge)
  if (req.method === 'DELETE' && action === 'purge') {
    try {
      const { confirm } = req.query
      if (confirm !== 'true') {
        return badRequest(res, 'confirm=true is required to purge meeting notes')
      }

      const existingCount = await prisma.monthlyMeetingNotes.count()
      if (existingCount === 0) {
        return ok(res, { deleted: 0, message: 'No meeting notes to delete' })
      }

      const deleted = await prisma.monthlyMeetingNotes.deleteMany()
      return ok(res, { deleted: deleted.count, message: 'All meeting notes deleted' })
    } catch (error) {
      console.error('Error purging meeting notes:', error)
      return serverError(res, 'Failed to purge meeting notes')
    }
  }

  // Delete monthly meeting notes
  if (req.method === 'DELETE' && !action) {
    try {
      const { id, monthKey } = req.query
      if (!id && !monthKey) {
        return badRequest(res, 'id or monthKey is required')
      }

      const whereClause = id ? { id } : { monthKey }

      const deleted = await prisma.monthlyMeetingNotes.delete({
        where: whereClause
      })

      return ok(res, { deleted: true, monthlyNotes: deleted })
    } catch (error) {
      if (error.code === 'P2025') {
        return ok(res, { deleted: false, message: 'Monthly meeting notes not found' })
      }
      console.error('Error deleting monthly meeting notes:', error)
      return serverError(res, 'Failed to delete meeting notes')
    }
  }

  // Delete weekly meeting notes
  if (req.method === 'DELETE' && action === 'weekly') {
    try {
      const { id, weeklyNotesId } = req.query
      const targetId = weeklyNotesId || id
      if (!targetId) {
        return badRequest(res, 'weeklyNotesId (or id) is required')
      }

      const deleted = await prisma.weeklyMeetingNotes.delete({
        where: { id: targetId }
      })

      return ok(res, { deleted: true, weeklyNotes: deleted })
    } catch (error) {
      if (error.code === 'P2025') {
        return ok(res, { deleted: false, message: 'Weekly meeting notes not found' })
      }
      console.error('Error deleting weekly meeting notes:', error)
      return serverError(res, 'Failed to delete weekly meeting notes')
    }
  }

  // Create weekly meeting notes
  if (req.method === 'POST' && action === 'weekly') {
    try {
      const { monthlyNotesId, weekKey, weekStart, weekEnd } = req.body

      if (!monthlyNotesId || !weekKey || !weekStart) {
        return badRequest(res, 'monthlyNotesId, weekKey, and weekStart are required')
      }

      // Create weekly notes
      const weeklyNotes = await prisma.weeklyMeetingNotes.create({
        data: {
          monthlyNotesId,
          weekKey,
          weekStart: new Date(weekStart),
          weekEnd: weekEnd ? new Date(weekEnd) : null,
          ownerId: req.user?.sub || req.user?.id || null
        }
      })

      // Create department notes for all departments
      const departmentNotesData = DEPARTMENTS.map(dept => ({
        weeklyNotesId: weeklyNotes.id,
        departmentId: dept.id,
        ownerId: req.user?.sub || req.user?.id || null
      }))

      await prisma.departmentNotes.createMany({
        data: departmentNotesData
      })

      // Fetch the complete weekly notes with department notes
      const completeWeeklyNotes = await prisma.weeklyMeetingNotes.findUnique({
        where: { id: weeklyNotes.id },
        include: {
          departmentNotes: {
            include: {
              comments: {
                include: {
                  author: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              actionItems: {
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              }
            }
          },
          actionItems: {
            include: {
              assignedUser: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        }
      })

      return ok(res, { weeklyNotes: completeWeeklyNotes })
    } catch (error) {
      console.error('Error creating weekly meeting notes:', error)
      if (error.code === 'P2002') {
        return badRequest(res, 'Weekly notes for this week already exist')
      }
      return serverError(res, 'Failed to create weekly notes')
    }
  }

  // Update department notes
  if (req.method === 'PUT' && action === 'department') {
    try {
      const { id, successes, weekToFollow, frustrations, agendaPoints, attachments, assignedUserId } = req.body

      if (!id) {
        return badRequest(res, 'id is required')
      }

      const departmentNotes = await prisma.departmentNotes.update({
        where: { id },
        data: {
          ...(successes !== undefined && { successes }),
          ...(weekToFollow !== undefined && { weekToFollow }),
          ...(frustrations !== undefined && { frustrations }),
          ...(agendaPoints !== undefined && { agendaPoints: typeof agendaPoints === 'string' ? agendaPoints : JSON.stringify(agendaPoints) }),
          ...(attachments !== undefined && { attachments: typeof attachments === 'string' ? attachments : JSON.stringify(attachments) }),
          ...(assignedUserId !== undefined && { assignedUserId })
        },
        include: {
          comments: {
            include: {
              author: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          actionItems: {
            include: {
              assignedUser: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      })

      return ok(res, { departmentNotes })
    } catch (error) {
      console.error('Error updating department notes:', error)
      return serverError(res, 'Failed to update department notes')
    }
  }

  // Create action item
  if (req.method === 'POST' && action === 'action-item') {
    try {
      const { monthlyNotesId, weeklyNotesId, departmentNotesId, title, description, status, priority, assignedUserId, dueDate } = req.body

      if (!title) {
        return badRequest(res, 'title is required')
      }

      const actionItem = await prisma.meetingActionItem.create({
        data: {
          monthlyNotesId: monthlyNotesId || null,
          weeklyNotesId: weeklyNotesId || null,
          departmentNotesId: departmentNotesId || null,
          title,
          description: description || '',
          status: status || 'open',
          priority: priority || 'medium',
          assignedUserId: assignedUserId || null,
          dueDate: dueDate ? new Date(dueDate) : null,
          ownerId: req.user?.sub || req.user?.id || null
        },
        include: {
          assignedUser: {
            select: { id: true, name: true, email: true }
          },
          comments: {
            include: {
              author: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      })

      return ok(res, { actionItem })
    } catch (error) {
      console.error('Error creating action item:', error)
      return serverError(res, 'Failed to create action item')
    }
  }

  // Update action item
  if (req.method === 'PUT' && action === 'action-item') {
    try {
      const { id, title, description, status, priority, assignedUserId, dueDate, completedDate } = req.body

      if (!id) {
        return badRequest(res, 'id is required')
      }

      const updateData = {}
      if (title !== undefined) updateData.title = title
      if (description !== undefined) updateData.description = description
      if (status !== undefined) updateData.status = status
      if (priority !== undefined) updateData.priority = priority
      if (assignedUserId !== undefined) updateData.assignedUserId = assignedUserId
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
      if (completedDate !== undefined) updateData.completedDate = completedDate ? new Date(completedDate) : null

      const actionItem = await prisma.meetingActionItem.update({
        where: { id },
        data: updateData,
        include: {
          assignedUser: {
            select: { id: true, name: true, email: true }
          },
          comments: {
            include: {
              author: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      })

      return ok(res, { actionItem })
    } catch (error) {
      console.error('Error updating action item:', error)
      return serverError(res, 'Failed to update action item')
    }
  }

  // Delete action item
  if (req.method === 'DELETE' && action === 'action-item') {
    try {
      const { id } = req.query

      if (!id) {
        return badRequest(res, 'id is required')
      }

      // First check if the action item exists
      const existingActionItem = await prisma.meetingActionItem.findUnique({
        where: { id }
      })

      if (!existingActionItem) {
        return ok(res, { success: false, message: 'Action item not found' })
      }

      // Delete associated comments first (if any)
      await prisma.meetingComment.deleteMany({
        where: { actionItemId: id }
      })

      // Then delete the action item
      await prisma.meetingActionItem.delete({
        where: { id }
      })

      return ok(res, { success: true })
    } catch (error) {
      if (error.code === 'P2025') {
        return ok(res, { success: false, message: 'Action item not found' })
      }
      logDatabaseError(error, 'delete action item')
      if (isConnectionError(error)) {
        return serverError(res, 'Database connection failed', 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
      }
      console.error('Error deleting action item:', error)
      return serverError(res, 'Failed to delete action item', error.message)
    }
  }

  // Create comment
  if (req.method === 'POST' && action === 'comment') {
    try {
      const { monthlyNotesId, departmentNotesId, actionItemId, content, link } = req.body

      if (!content) {
        return badRequest(res, 'content is required')
      }

      if (!monthlyNotesId && !departmentNotesId && !actionItemId) {
        return badRequest(res, 'One of monthlyNotesId, departmentNotesId, or actionItemId is required')
      }

      const comment = await prisma.meetingComment.create({
        data: {
          monthlyNotesId: monthlyNotesId || null,
          departmentNotesId: departmentNotesId || null,
          actionItemId: actionItemId || null,
          content,
          authorId: req.user?.sub || req.user?.id
        },
        include: {
          author: {
            select: { id: true, name: true, email: true }
          }
        }
      })

      // Subscribe: comment author + @mentioned + prior commenters get email for all subsequent comments
      // Notify participants: all subscribers (prior commenters + previously mentioned in any comment)
      try {
        const authorId = req.user?.sub || req.user?.id
        const threadWhere = monthlyNotesId ? { monthlyNotesId } : departmentNotesId ? { departmentNotesId } : actionItemId ? { actionItemId } : {}
        const threadWhereExcludeSelf = Object.keys(threadWhere).length
          ? { ...threadWhere, id: { not: comment.id } }
          : {}
        const [priorComments, mentionedIdsResolved] = await Promise.all([
          Object.keys(threadWhereExcludeSelf).length > 0
            ? prisma.meetingComment.findMany({ where: threadWhereExcludeSelf, select: { authorId: true, content: true } })
            : [],
          resolveMentionedUserIds(content)
        ])
        const priorAuthorIds = [...new Set((priorComments || []).map((c) => c.authorId).filter(Boolean))]
        const priorCommentTexts = (priorComments || []).map((c) => c.content).filter(Boolean)
        const threadId = monthlyNotesId || departmentNotesId || actionItemId || 'meeting-notes'
        const subscriberIds = [...new Set([String(authorId), ...(mentionedIdsResolved || []), ...priorAuthorIds])].filter(Boolean)
        await Promise.all(
          subscriberIds.map((uid) =>
            prisma.commentThreadSubscription.upsert({
              where: {
                threadType_threadId_userId: {
                  threadType: 'meeting-notes',
                  threadId: String(threadId),
                  userId: String(uid)
                }
              },
              create: { threadType: 'meeting-notes', threadId: String(threadId), userId: String(uid) },
              update: {}
            })
          )
        )
        const authorName = comment.author?.name || comment.author?.email || 'Someone'
        await notifyCommentParticipants({
          commentAuthorId: authorId,
          commentText: content,
          entityAuthorId: null,
          priorCommentAuthorIds: subscriberIds,
          priorCommentTexts,
          authorName,
          contextTitle: 'Meeting notes',
          link: (link && String(link).trim()) ? link : '#/teams/meeting-notes',
          metadata: { monthlyNotesId, departmentNotesId, actionItemId, commentId: comment.id, commentText: content }
        })
      } catch (notifyErr) {
        console.error('Notify comment participants failed (meeting notes):', notifyErr)
      }

      return ok(res, { comment })
    } catch (error) {
      console.error('Error creating comment:', error)
      return serverError(res, 'Failed to create comment')
    }
  }

  // Delete comment
  if (req.method === 'DELETE' && action === 'comment') {
    try {
      const targetId = req.query.id || req.query.commentId || req.body?.id || req.body?.commentId

      if (!targetId) {
        return badRequest(res, 'comment id is required')
      }

      const deletedComment = await prisma.meetingComment.delete({
        where: { id: targetId },
        include: {
          author: {
            select: { id: true, name: true, email: true }
          }
        }
      })

      return ok(res, { success: true, comment: deletedComment })
    } catch (error) {
      if (error.code === 'P2025') {
        return ok(res, { success: false, message: 'Comment not found' })
      }
      console.error('Error deleting comment:', error)
      return serverError(res, 'Failed to delete comment')
    }
  }

  // Update user allocation
  if (req.method === 'POST' && action === 'allocation') {
    try {
      const { monthlyNotesId, departmentId, userId, role } = req.body

      if (!monthlyNotesId || !departmentId || !userId) {
        return badRequest(res, 'monthlyNotesId, departmentId, and userId are required')
      }

      const allocation = await prisma.meetingUserAllocation.upsert({
        where: {
          monthlyNotesId_departmentId_userId: {
            monthlyNotesId,
            departmentId,
            userId
          }
        },
        update: {
          role: role || 'contributor'
        },
        create: {
          monthlyNotesId,
          departmentId,
          userId,
          role: role || 'contributor'
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      })

      return ok(res, { allocation })
    } catch (error) {
      console.error('Error updating user allocation:', error)
      return serverError(res, 'Failed to update user allocation')
    }
  }

  // Delete user allocation
  if (req.method === 'DELETE' && action === 'allocation') {
    try {
      const { monthlyNotesId, departmentId, userId } = req.query

      if (!monthlyNotesId || !departmentId || !userId) {
        return badRequest(res, 'monthlyNotesId, departmentId, and userId are required')
      }

      await prisma.meetingUserAllocation.delete({
        where: {
          monthlyNotesId_departmentId_userId: {
            monthlyNotesId,
            departmentId,
            userId
          }
        }
      })

      return ok(res, { success: true })
    } catch (error) {
      console.error('Error deleting user allocation:', error)
      return serverError(res, 'Failed to delete user allocation')
    }
  }

  // Generate new monthly plan (copy from previous month)
  if (req.method === 'POST' && action === 'generate-month') {
    try {
      const { monthKey, copyFromMonthKey } = req.body

      if (!monthKey) {
        return badRequest(res, 'monthKey is required')
      }

      // Get previous month's notes if copyFromMonthKey is provided
      let previousMonthlyNotes = null
      if (copyFromMonthKey) {
        previousMonthlyNotes = await prisma.monthlyMeetingNotes.findUnique({
          where: { monthKey: copyFromMonthKey },
          include: {
            userAllocations: true
          }
        })
      }

      // Create new monthly notes
      const monthlyNotes = await prisma.monthlyMeetingNotes.create({
        data: {
          monthKey,
          ownerId: req.user?.sub || req.user?.id || null
        }
      })

      // Copy user allocations if previous month exists
      if (previousMonthlyNotes && previousMonthlyNotes.userAllocations.length > 0) {
        await prisma.meetingUserAllocation.createMany({
          data: previousMonthlyNotes.userAllocations.map(allocation => ({
            monthlyNotesId: monthlyNotes.id,
            departmentId: allocation.departmentId,
            userId: allocation.userId,
            role: allocation.role
          }))
        })
      }

      // Fetch complete monthly notes
      const completeMonthlyNotes = await prisma.monthlyMeetingNotes.findUnique({
        where: { id: monthlyNotes.id },
        include: {
          userAllocations: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        }
      })

      return ok(res, { monthlyNotes: completeMonthlyNotes })
    } catch (error) {
      console.error('Error generating monthly plan:', error)
      if (error.code === 'P2002') {
        return badRequest(res, 'Meeting notes for this month already exist')
      }
      return serverError(res, 'Failed to generate monthly plan')
    }
  }

  return badRequest(res, 'Invalid request')
}

// Wrap handler in additional error handling
const wrappedHandler = async (req, res) => {
  try {
    return await handler(req, res)
  } catch (error) {
    console.error('❌ Unhandled error in meeting-notes handler:', error)
    console.error('❌ Error stack:', error.stack)
    logDatabaseError(error, 'unhandled error in meeting-notes handler')
    if (isConnectionError(error)) {
      return serverError(res, 'Database connection failed', 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
    }
    return serverError(res, 'Internal server error', error.message || 'An unexpected error occurred')
  }
}

export default withHttp(withLogging(authRequired(wrappedHandler)))

