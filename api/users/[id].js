// Update individual user - /api/users/:id
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized, notFound } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
    // Extract user ID from URL (strip query parameters)
    const urlPath = req.url.split('?')[0].split('#')[0]
    const userId = urlPath.split('/').pop()

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

            console.log('📝 Updating user:', userId, 'with data:', allowedUpdates)

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

            console.log('✅ User updated successfully:', user.id)

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
            console.log('🗑️ DELETE request received:', { url: req.url, userId })
            
            if (!req.user || req.user.role !== 'admin') {
                console.log('❌ Unauthorized: user role:', req.user?.role)
                return unauthorized(res, 'Admin access required')
            }

            // Prevent deleting own account
            const currentUserId = req.user.sub || req.user.id
            if (currentUserId === userId) {
                console.log('❌ Cannot delete own account')
                return badRequest(res, 'Cannot delete your own account')
            }

            // Check if user exists
            const userExists = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, name: true }
            })

            if (!userExists) {
                console.log('❌ User not found:', userId)
                return notFound(res, 'User not found')
            }

            console.log('🗑️ Attempting to delete user:', { id: userId, email: userExists.email, name: userExists.name })

            // Delete related records first to avoid foreign key constraints
            // Delete in order: dependent records first, then user
            try {
                // Delete memberships
                await prisma.membership.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted memberships')

                // Delete password resets
                await prisma.passwordReset.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted password resets')

                // Delete sessions
                await prisma.session.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted sessions')

                // Delete two factor
                await prisma.twoFactor.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted two factor')

                // Delete security events
                await prisma.securityEvent.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted security events')

                // Delete password history
                await prisma.passwordHistory.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted password history')

                // Delete starred clients
                await prisma.starredClient.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted starred clients')

                // Delete notification settings
                await prisma.notificationSetting.deleteMany({
                    where: { userId: userId }
                })
                console.log('✅ Deleted notification settings')

                // Set owned clients to null (or delete if preferred)
                await prisma.client.updateMany({
                    where: { ownerId: userId },
                    data: { ownerId: null }
                })
                console.log('✅ Removed ownership from clients')

                // Set owned projects to null
                await prisma.project.updateMany({
                    where: { ownerId: userId },
                    data: { ownerId: null }
                })
                console.log('✅ Removed ownership from projects')

                // Set assigned tasks to empty string (or null if schema allows)
                await prisma.task.updateMany({
                    where: { assignedTo: userId },
                    data: { assignedTo: '' }
                })
                console.log('✅ Removed assignment from tasks')

            } catch (relationError) {
                console.error('⚠️ Error deleting related records:', relationError.message)
                // Continue with user deletion even if some relations fail
            }

            // Now delete the user
            await prisma.user.delete({
                where: { id: userId }
            })

            console.log('✅ User deleted successfully:', userId)

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
