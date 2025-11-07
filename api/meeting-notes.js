// Management Meeting Notes API
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// Department definitions
const DEPARTMENTS = [
  { id: 'compliance', name: 'Compliance' },
  { id: 'finance', name: 'Finance' },
  { id: 'technical', name: 'Technical' },
  { id: 'data', name: 'Data' },
  { id: 'support', name: 'Support' },
  { id: 'commercial', name: 'Commercial' },
  { id: 'business-development', name: 'Business Development' }
]

async function handler(req, res) {
  // Get all monthly meeting notes
  if (req.method === 'GET' && !req.query.monthKey && !req.query.id) {
    try {
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

      return ok(res, { monthlyNotes })
    } catch (error) {
      console.error('Error fetching monthly meeting notes:', error)
      return serverError(res, 'Failed to fetch meeting notes')
    }
  }

  // Get specific monthly meeting notes by monthKey
  if (req.method === 'GET' && req.query.monthKey) {
    try {
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
        return ok(res, { monthlyNotes: null })
      }

      return ok(res, { monthlyNotes })
    } catch (error) {
      console.error('Error fetching monthly meeting notes:', error)
      return serverError(res, 'Failed to fetch meeting notes')
    }
  }

  // Create monthly meeting notes
  if (req.method === 'POST' && !req.query.action) {
    try {
      const { monthKey, monthlyGoals } = req.body

      if (!monthKey) {
        return badRequest(res, 'monthKey is required')
      }

      const monthlyNotes = await prisma.monthlyMeetingNotes.create({
        data: {
          monthKey,
          monthlyGoals: monthlyGoals || '',
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
  if (req.method === 'PUT' && !req.query.action) {
    try {
      const { id, monthlyGoals, status } = req.body

      if (!id) {
        return badRequest(res, 'id is required')
      }

      const monthlyNotes = await prisma.monthlyMeetingNotes.update({
        where: { id },
        data: {
          ...(monthlyGoals !== undefined && { monthlyGoals }),
          ...(status !== undefined && { status })
        },
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

  // Create weekly meeting notes
  if (req.method === 'POST' && req.query.action === 'weekly') {
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
  if (req.method === 'PUT' && req.query.action === 'department') {
    try {
      const { id, successes, weekToFollow, frustrations, agendaPoints, assignedUserId } = req.body

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
  if (req.method === 'POST' && req.query.action === 'action-item') {
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
  if (req.method === 'PUT' && req.query.action === 'action-item') {
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
  if (req.method === 'DELETE' && req.query.action === 'action-item') {
    try {
      const { id } = req.query

      if (!id) {
        return badRequest(res, 'id is required')
      }

      await prisma.meetingActionItem.delete({
        where: { id }
      })

      return ok(res, { success: true })
    } catch (error) {
      console.error('Error deleting action item:', error)
      return serverError(res, 'Failed to delete action item')
    }
  }

  // Create comment
  if (req.method === 'POST' && req.query.action === 'comment') {
    try {
      const { monthlyNotesId, departmentNotesId, actionItemId, content } = req.body

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

      return ok(res, { comment })
    } catch (error) {
      console.error('Error creating comment:', error)
      return serverError(res, 'Failed to create comment')
    }
  }

  // Update user allocation
  if (req.method === 'POST' && req.query.action === 'allocation') {
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
  if (req.method === 'DELETE' && req.query.action === 'allocation') {
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
  if (req.method === 'POST' && req.query.action === 'generate-month') {
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
          monthlyGoals: previousMonthlyNotes?.monthlyGoals || '',
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

export default withHttp(withLogging(authRequired(handler)))

