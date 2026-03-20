// Update individual user - /api/users/:id
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

/** Fields allowed on PUT /api/users/:id (must match Prisma User model). */
const ALLOWED_USER_UPDATE_KEYS = new Set([
    'name', 'email', 'role', 'permissions', 'accessibleProjectIds', 'status',
    'department', 'jobTitle', 'phone', 'position', 'employeeNumber', 'employmentDate',
    'idNumber', 'taxNumber', 'bankName', 'accountNumber', 'branchCode', 'salary',
    'employmentStatus', 'address', 'emergencyContact', 'avatar'
])

function pickAllowedUserFields(data) {
    const out = {}
    if (!data || typeof data !== 'object') return out
    for (const key of ALLOWED_USER_UPDATE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            out[key] = data[key]
        }
    }
    return out
}

/**
 * Coerce values so Prisma never receives null for non-nullable User columns
 * (common cause of 500s from HR/profile forms).
 */
function sanitizeUserUpdatePayload(data) {
    const out = { ...data }

    if ('salary' in out) {
        if (out.salary === null || out.salary === undefined || out.salary === '') {
            out.salary = 0
        } else {
            const n = Number(out.salary)
            out.salary = Number.isFinite(n) ? n : 0
        }
    }

    // Schema: String (non-optional) — use empty string instead of null
    for (const key of ['department', 'jobTitle', 'phone', 'position', 'idNumber', 'address', 'emergencyContact', 'avatar']) {
        if (key in out && out[key] === null) {
            out[key] = ''
        }
    }
    if ('status' in out && out.status === null) {
        out.status = 'active'
    }
    if ('employmentStatus' in out && out.employmentStatus === null) {
        out.employmentStatus = 'Active'
    }
    if ('role' in out && out.role === null) {
        delete out.role
    }

    // Optional unique: avoid duplicate '' collisions
    if ('employeeNumber' in out && (out.employeeNumber === '' || out.employeeNumber === undefined)) {
        out.employeeNumber = null
    }

    // Stored as JSON strings in DB
    if (Array.isArray(out.permissions)) {
        out.permissions = JSON.stringify(out.permissions)
    }
    if (Array.isArray(out.accessibleProjectIds)) {
        out.accessibleProjectIds = JSON.stringify(out.accessibleProjectIds)
    }

    return out
}

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
                    permissions: true,
                    accessibleProjectIds: true,
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

            // Parse JSON fields for frontend (same shape as GET /api/users list)
            let parsedPermissions = [];
            if (user.permissions) {
                try {
                    const p = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
                    parsedPermissions = Array.isArray(p) ? p : [];
                } catch (_) {}
            }
            let parsedAccessibleProjectIds = [];
            if (user.accessibleProjectIds) {
                try {
                    const a = typeof user.accessibleProjectIds === 'string' ? JSON.parse(user.accessibleProjectIds) : user.accessibleProjectIds;
                    parsedAccessibleProjectIds = Array.isArray(a) ? a : [];
                } catch (_) {}
            }

            return ok(res, {
                user: {
                    ...user,
                    permissions: parsedPermissions,
                    accessibleProjectIds: parsedAccessibleProjectIds
                }
            })

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
            const reqUserRole = (req.user?.role || '').toString().trim().toLowerCase()
            const reqIsAdmin = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'].includes(reqUserRole)
            if (currentUserId !== userId && !reqIsAdmin) {
                return unauthorized(res, 'Unauthorized to update this user')
            }

            const rawBody = await parseJsonBody(req)
            const updateData = rawBody && typeof rawBody === 'object' ? rawBody : {}

            // Only admins can change roles
            if (updateData.role !== undefined && updateData.role !== null) {
                // Get current user from database to check role
                const currentUserRecord = await prisma.user.findUnique({
                    where: { id: currentUserId },
                    select: { role: true }
                })
                const dbRole = (currentUserRecord?.role || '').toString().trim().toLowerCase()
                const dbIsAdmin = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'].includes(dbRole)
                if (!currentUserRecord || !dbIsAdmin) {
                    return unauthorized(res, 'Only administrators can change user roles')
                }
                // Only a superadmin can assign the superadmin role
                const newRole = (updateData.role || '').toString().trim().toLowerCase()
                const isAssigningSuperAdmin = ['superadmin', 'super-admin', 'super_admin'].includes(newRole)
                const dbIsSuperAdmin = ['superadmin', 'super-admin', 'super_admin'].includes(dbRole)
                if (isAssigningSuperAdmin && !dbIsSuperAdmin) {
                    return res.status(403).json({ error: 'Only a Super Administrator can assign the Super Administrator role' })
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
                ...rest
            } = updateData

            const allowedUpdates = sanitizeUserUpdatePayload(pickAllowedUserFields(rest))

            if (Object.keys(allowedUpdates).length === 0) {
                return badRequest(res, 'No valid fields to update')
            }

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
            const userRole = (req.user?.role || '').toString().trim().toLowerCase()
            const isAdmin = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'].includes(userRole)
            if (!req.user || !isAdmin) {
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
