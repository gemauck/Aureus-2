// Users management API endpoint
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import bcrypt from 'bcryptjs'

async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            // Check if user has permission to manage users (accept both uppercase and lowercase admin)
            const userRole = req.user?.role?.toLowerCase();
            if (!req.user || (userRole !== 'admin' && !req.user.permissions?.includes('manage_users'))) {
                return unauthorized(res, 'Permission required: manage_users')
            }

            // Get all users
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    permissions: true,
                    accessibleProjectIds: true,
                    status: true,
                    createdAt: true,
                    lastLoginAt: true,
                    invitedBy: true
                },
                orderBy: { createdAt: 'desc' }
            })

            // Get all invitations (graceful if table missing)
            let invitations = []
            try {
                invitations = await prisma.invitation.findMany({
                    orderBy: { createdAt: 'desc' }
                })
            } catch (e) {
                // If Invitation model/table isn't available yet, return empty list
                invitations = []
            }

            return ok(res, {
                users,
                invitations
            })

        } catch (error) {
            console.error('❌ Get users error:', {
              message: error.message,
              code: error.code,
              name: error.name
            })
            
            // Check if it's a connection error
            const isConnectionError = error.message?.includes("Can't reach database server") ||
                                     error.code === 'P1001' ||
                                     error.code === 'ETIMEDOUT' ||
                                     error.code === 'ECONNREFUSED'
            
            if (isConnectionError) {
              console.error('🔌 Database connection issue detected - server may be unreachable')
            }
            
            return serverError(res, 'Failed to get users', error.message)
        }
    }

    if (req.method === 'POST') {
        try {
            // Check if user has permission to manage users (accept both uppercase and lowercase admin)
            const userRole = req.user?.role?.toLowerCase();
            if (!req.user || (userRole !== 'admin' && !req.user.permissions?.includes('manage_users'))) {
                return unauthorized(res, 'Permission required: manage_users')
            }

            const { name, email, role = 'user', department = '', phone = '', status = 'active', accessibleProjectIds = [] } = req.body || {}
            
            console.log('📝 Creating user with data:', { name, email, role, department, phone, status, accessibleProjectIds });
            
            if (!name || !email) {
                return badRequest(res, 'Name and email are required')
            }

            // Check if user already exists
            const existingUser = await prisma.user.findUnique({ where: { email } })
            if (existingUser) {
                return badRequest(res, 'User with this email already exists')
            }

            // Create user with a default temporary password
            const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase()
            console.log('🔐 Generated temp password:', tempPassword);
            
            const passwordHash = await bcrypt.hash(tempPassword, 10)
            console.log('🔐 Password hashed successfully');

            // Prepare accessibleProjectIds - ensure it's a JSON string
            let accessibleProjectIdsJson = '[]';
            if (Array.isArray(accessibleProjectIds)) {
                accessibleProjectIdsJson = JSON.stringify(accessibleProjectIds);
            } else if (typeof accessibleProjectIds === 'string') {
                // Validate it's valid JSON
                try {
                    JSON.parse(accessibleProjectIds);
                    accessibleProjectIdsJson = accessibleProjectIds;
                } catch (e) {
                    accessibleProjectIdsJson = '[]';
                }
            }

            const newUser = await prisma.user.create({
                data: {
                    name,
                    email,
                    passwordHash,
                    role,
                    department,
                    phone,
                    status,
                    accessibleProjectIds: accessibleProjectIdsJson,
                    mustChangePassword: true,
                    provider: 'local'
                }
            })

            console.log('✅ User created successfully:', newUser.id);

            return ok(res, { 
                success: true, 
                message: 'User created successfully',
                user: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role,
                    status: newUser.status,
                    createdAt: newUser.createdAt
                },
                tempPassword // In production, send this via email instead
            })

        } catch (error) {
            console.error('❌ Create user error:', error)
            console.error('Error stack:', error.stack)
            return serverError(res, 'Failed to create user', error.message)
        }
    }

    if (req.method === 'PUT') {
        try {
            // Check if user has permission to manage users (accept both uppercase and lowercase admin)
            const userRole = req.user?.role?.toLowerCase();
            if (!req.user || (userRole !== 'admin' && !req.user.permissions?.includes('manage_users'))) {
                return unauthorized(res, 'Permission required: manage_users')
            }

            const { userId, name, email, role, status, department, phone, accessibleProjectIds } = req.body || {}
            
            if (!userId) {
                return badRequest(res, 'User ID is required')
            }

            // Check if user exists
            const existingUser = await prisma.user.findUnique({ where: { id: userId } })
            if (!existingUser) {
                return badRequest(res, 'User not found')
            }

            // Check if email is being changed and if it's already taken
            if (email && email !== existingUser.email) {
                const emailTaken = await prisma.user.findUnique({ where: { email } })
                if (emailTaken) {
                    return badRequest(res, 'Email already taken by another user')
                }
            }

            // Prepare accessibleProjectIds - ensure it's a JSON string
            let updateData = {
                ...(name && { name }),
                ...(email && { email }),
                ...(role && { role }),
                ...(status && { status }),
            };
            
            // Handle accessibleProjectIds if provided
            if (accessibleProjectIds !== undefined) {
                if (Array.isArray(accessibleProjectIds)) {
                    updateData.accessibleProjectIds = JSON.stringify(accessibleProjectIds);
                } else if (typeof accessibleProjectIds === 'string') {
                    // Validate it's valid JSON
                    try {
                        JSON.parse(accessibleProjectIds);
                        updateData.accessibleProjectIds = accessibleProjectIds;
                    } catch (e) {
                        updateData.accessibleProjectIds = '[]';
                    }
                } else {
                    updateData.accessibleProjectIds = '[]';
                }
            }

            // Update user
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: updateData
            })

            return ok(res, { 
                success: true, 
                message: 'User updated successfully',
                user: {
                    id: updatedUser.id,
                    name: updatedUser.name,
                    email: updatedUser.email,
                    role: updatedUser.role,
                    status: updatedUser.status,
                    updatedAt: updatedUser.updatedAt
                }
            })

        } catch (error) {
            console.error('Update user error:', error)
            return serverError(res, 'Failed to update user', error.message)
        }
    }

    if (req.method === 'DELETE') {
        try {
            // Check if user has permission to manage users (accept both uppercase and lowercase admin)
            const userRole = req.user?.role?.toLowerCase();
            if (!req.user || (userRole !== 'admin' && !req.user.permissions?.includes('manage_users'))) {
                return unauthorized(res, 'Permission required: manage_users')
            }

            const { userId } = req.body || {}
            
            if (!userId) {
                return badRequest(res, 'User ID is required')
            }

            // Prevent deleting own account
            const currentUserId = req.user.sub || req.user.id
            if (currentUserId === userId) {
                return badRequest(res, 'Cannot delete your own account')
            }

            // Check if user exists
            const userToDelete = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, name: true }
            })

            if (!userToDelete) {
                return badRequest(res, 'User not found')
            }

            // Use a transaction to handle cascading deletes/updates
            await prisma.$transaction(async (tx) => {
                // Delete related records that can be safely removed
                await tx.membership.deleteMany({
                    where: { userId }
                })

                await tx.session.deleteMany({
                    where: { userId }
                })

                await tx.passwordReset.deleteMany({
                    where: { userId }
                })

                await tx.passwordHistory.deleteMany({
                    where: { userId }
                })

                await tx.securityEvent.deleteMany({
                    where: { userId }
                })

                await tx.calendarNote.deleteMany({
                    where: { userId }
                })

                await tx.starredClient.deleteMany({
                    where: { userId }
                })

                // Delete or disconnect two-factor auth
                await tx.twoFactor.deleteMany({
                    where: { userId }
                })

                // Delete notification settings
                await tx.notificationSetting.deleteMany({
                    where: { userId }
                })

                // Delete notifications (or you could set recipientId to null, but deletion is cleaner)
                await tx.notification.deleteMany({
                    where: { userId }
                })

                // Set foreign keys to null for records that should remain but lose the user reference
                await tx.client.updateMany({
                    where: { ownerId: userId },
                    data: { ownerId: null }
                })

                await tx.project.updateMany({
                    where: { ownerId: userId },
                    data: { ownerId: null }
                })

                await tx.task.updateMany({
                    where: { assigneeId: userId },
                    data: { assigneeId: null }
                })

                // Delete audit logs, feedback, and messages (or set to null - choosing deletion for data cleanup)
                await tx.auditLog.deleteMany({
                    where: { userId }
                })

                await tx.feedback.deleteMany({
                    where: { userId }
                })

                await tx.message.deleteMany({
                    where: { senderId: userId }
                })

                // Finally, delete the user
                await tx.user.delete({
                    where: { id: userId }
                })
            })

            console.log('✅ User deleted successfully:', userId)

            return ok(res, { success: true, message: 'User deleted successfully' })

        } catch (error) {
            console.error('❌ Delete user error:', error)
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                meta: error.meta
            })

            // Check for foreign key constraint violations
            if (error.code === 'P2003' || error.message?.includes('Foreign key constraint')) {
                return serverError(res, 'Cannot delete user: User has related records that prevent deletion. Please reassign or remove related data first.', error.message)
            }

            // Check for record not found
            if (error.code === 'P2025') {
                return badRequest(res, 'User not found')
            }

            return serverError(res, 'Failed to delete user', error.message)
        }
    }

    return badRequest(res, 'Invalid method')
}

export default withHttp(withLogging(authRequired(handler)))
