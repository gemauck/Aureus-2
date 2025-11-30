// Update individual user - /api/users/:id
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized, notFound } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
    // Extract user ID from URL (strip query parameters)
    // Prefer req.params.id if available (from explicit route mapping), otherwise extract from URL
    const userId = req.params?.id || (() => {
        const urlPath = req.url.split('?')[0].split('#')[0]
        return urlPath.split('/').pop()
    })()

    if (req.method === 'GET') {
        try {
            if (!req.user) {
                return unauthorized(res, 'Authentication required')
            }

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    status: true,
                    department: true,
                    jobTitle: true,
                    phone: true,
                    employeeNumber: true,
                    position: true,
                    employmentDate: true,
                    idNumber: true,
                    taxNumber: true,
                    bankName: true,
                    accountNumber: true,
                    branchCode: true,
                    salary: true,
                    employmentStatus: true,
                    address: true,
                    emergencyContact: true,
                    createdAt: true,
                    lastLoginAt: true
                }
            })

            if (!user) {
                return notFound(res, 'User not found')
            }

            return ok(res, { user })

        } catch (error) {
            console.error('Get user error:', error)
            return serverError(res, 'Failed to get user', error.message)
        }
    }

    if (req.method === 'PUT') {
        try {
            if (!req.user) {
                return unauthorized(res, 'Authentication required')
            }

            // Allow users to update their own profile or admins to update anyone
            const currentUserId = req.user.sub || req.user.id
            if (currentUserId !== userId && req.user.role !== 'admin') {
                return unauthorized(res, 'Unauthorized to update this user')
            }

            const updateData = req.body || {}

            // Only admins can change roles
            if (updateData.role !== undefined && updateData.role !== null) {
                // Get current user from database to check role
                const currentUserRecord = await prisma.user.findUnique({
                    where: { id: currentUserId },
                    select: { role: true }
                })
                
                if (!currentUserRecord || currentUserRecord.role !== 'admin') {
                    return unauthorized(res, 'Only administrators can change user roles')
                }
            }

            // Filter out fields that shouldn't be updated via this endpoint
            const {
                id,
                passwordHash,
                provider,
                mustChangePassword,
                createdAt,
                updatedAt,
                ...allowedUpdates
            } = updateData


            // Update user
            const user = await prisma.user.update({
                where: { id: userId },
                data: allowedUpdates,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    permissions: true,
                    status: true,
                    department: true,
                    jobTitle: true,
                    phone: true,
                    employeeNumber: true,
                    position: true,
                    employmentDate: true,
                    idNumber: true,
                    taxNumber: true,
                    bankName: true,
                    accountNumber: true,
                    branchCode: true,
                    salary: true,
                    employmentStatus: true,
                    address: true,
                    emergencyContact: true,
                    createdAt: true,
                    lastLoginAt: true
                }
            })


            return ok(res, {
                success: true,
                message: 'User updated successfully',
                user
            })

        } catch (error) {
            console.error('Update user error:', error)
            return serverError(res, 'Failed to update user', error.message)
        }
    }

    if (req.method === 'DELETE') {
        try {
            
            if (!req.user || req.user.role !== 'admin') {
                return unauthorized(res, 'Admin access required')
            }

            // Prevent deleting own account
            const currentUserId = req.user.sub || req.user.id
            if (currentUserId === userId) {
                return badRequest(res, 'Cannot delete your own account')
            }

            // Check if user exists
            const userExists = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, name: true }
            })

            if (!userExists) {
                return notFound(res, 'User not found')
            }


            // Delete related records first to avoid foreign key constraints
            // Delete in order: dependent records first, then user
            try {
                // Delete memberships
                await prisma.membership.deleteMany({
                    where: { userId: userId }
                })

                // Delete password resets
                await prisma.passwordReset.deleteMany({
                    where: { userId: userId }
                })

                // Delete sessions
                await prisma.session.deleteMany({
                    where: { userId: userId }
                })

                // Delete two factor
                await prisma.twoFactor.deleteMany({
                    where: { userId: userId }
                })

                // Delete security events
                await prisma.securityEvent.deleteMany({
                    where: { userId: userId }
                })

                // Delete password history
                await prisma.passwordHistory.deleteMany({
                    where: { userId: userId }
                })

                // Delete starred clients
                await prisma.starredClient.deleteMany({
                    where: { userId: userId }
                })

                // Delete starred opportunities
                await prisma.starredOpportunity.deleteMany({
                    where: { userId: userId }
                })

                // Delete notification settings
                await prisma.notificationSetting.deleteMany({
                    where: { userId: userId }
                })

                // Delete notifications
                await prisma.notification.deleteMany({
                    where: { userId: userId }
                })

                // Delete audit logs
                await prisma.auditLog.deleteMany({
                    where: { actorId: userId }
                })

                // Delete feedback
                await prisma.feedback.deleteMany({
                    where: { userId: userId }
                })

                // Delete sent messages
                await prisma.message.deleteMany({
                    where: { senderId: userId }
                })

                // Delete calendar notes
                await prisma.calendarNote.deleteMany({
                    where: { userId: userId }
                })

                // Delete leave applications (all three relations)
                await prisma.leaveApplication.updateMany({
                    where: { userId: userId },
                    data: { userId: null }
                })
                await prisma.leaveApplication.updateMany({
                    where: { approvedById: userId },
                    data: { approvedById: null }
                })
                await prisma.leaveApplication.updateMany({
                    where: { rejectedById: userId },
                    data: { rejectedById: null }
                })

                // Delete leave balances
                await prisma.leaveBalance.deleteMany({
                    where: { userId: userId }
                })

                // Delete leave approvers
                await prisma.leaveApprover.deleteMany({
                    where: { userId: userId }
                })

                // Delete birthday
                await prisma.birthday.deleteMany({
                    where: { userId: userId }
                })

                // Delete meeting comments
                await prisma.meetingComment.deleteMany({
                    where: { authorId: userId }
                })

                // Delete meeting allocations
                await prisma.meetingUserAllocation.deleteMany({
                    where: { userId: userId }
                })

                // Delete department notes assigned
                await prisma.departmentNotes.updateMany({
                    where: { assigneeId: userId },
                    data: { assigneeId: null }
                })

                // Delete action items assigned
                await prisma.meetingActionItem.updateMany({
                    where: { assigneeId: userId },
                    data: { assigneeId: null }
                })

                // Delete user tasks
                await prisma.userTask.deleteMany({
                    where: { ownerId: userId }
                })

                // Delete user task tags
                await prisma.userTaskTag.deleteMany({
                    where: { ownerId: userId }
                })

                // Set owned clients to null (or delete if preferred)
                await prisma.client.updateMany({
                    where: { ownerId: userId },
                    data: { ownerId: null }
                })

                // Set owned projects to null
                await prisma.project.updateMany({
                    where: { ownerId: userId },
                    data: { ownerId: null }
                })

                // Set assigned tasks to null (using correct field name: assigneeId)
                await prisma.task.updateMany({
                    where: { assigneeId: userId },
                    data: { assigneeId: null }
                })

            } catch (relationError) {
                console.error('⚠️ Error deleting related records:', {
                    message: relationError.message,
                    code: relationError.code,
                    meta: relationError.meta,
                    stack: relationError.stack
                })
                // Continue with user deletion even if some relations fail
            }

            // Now delete the user
            await prisma.user.delete({
                where: { id: userId }
            })


            return ok(res, { success: true, message: 'User deleted successfully' })

        } catch (error) {
            console.error('❌ Delete user error:', {
                error: error.message,
                code: error.code,
                meta: error.meta,
                userId: userId,
                stack: error.stack
            })
            
            // Provide more specific error messages
            if (error.code === 'P2003') {
                return serverError(res, 'Cannot delete user: User is referenced by other records. Please remove all references first.')
            }
            if (error.code === 'P2025') {
                return notFound(res, 'User not found')
            }
            
            return serverError(res, 'Failed to delete user', error.message)
        }
    }

    return badRequest(res, 'Invalid method')
}

export default withHttp(withLogging(authRequired(handler)))
