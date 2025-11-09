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

            // Parse permissions and accessibleProjectIds from JSON strings to arrays
            const parsedUsers = users.map(user => {
                let parsedPermissions = [];
                if (user.permissions) {
                    try {
                        if (typeof user.permissions === 'string') {
                            const parsed = JSON.parse(user.permissions);
                            parsedPermissions = Array.isArray(parsed) ? parsed : [];
                        } else if (Array.isArray(user.permissions)) {
                            parsedPermissions = user.permissions;
                        }
                    } catch (e) {
                        parsedPermissions = [];
                    }
                }

                let parsedAccessibleProjectIds = [];
                if (user.accessibleProjectIds) {
                    try {
                        if (typeof user.accessibleProjectIds === 'string') {
                            const parsed = JSON.parse(user.accessibleProjectIds);
                            parsedAccessibleProjectIds = Array.isArray(parsed) ? parsed : [];
                        } else if (Array.isArray(user.accessibleProjectIds)) {
                            parsedAccessibleProjectIds = user.accessibleProjectIds;
                        }
                    } catch (e) {
                        parsedAccessibleProjectIds = [];
                    }
                }

                return {
                    ...user,
                    permissions: parsedPermissions,
                    accessibleProjectIds: parsedAccessibleProjectIds
                };
            });

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
                users: parsedUsers,
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

            const { userId, name, email, role, status, department, phone, accessibleProjectIds, permissions } = req.body || {}
            
            console.log('📝 PUT /api/users - Received update request:', {
                userId,
                hasPermissions: permissions !== undefined,
                permissionsType: typeof permissions,
                permissionsValue: permissions
            })
            
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

            // Prepare updateData - ensure it's a JSON string
            let updateData = {
                ...(name && { name }),
                ...(email && { email }),
                ...(role && { role }),
                ...(status && { status }),
                ...(department !== undefined && { department }),
                ...(phone !== undefined && { phone }),
            };
            
            // Handle permissions - ALWAYS process if provided (even if empty array)
            if (permissions !== undefined && permissions !== null) {
                console.log('🔧 Processing permissions update:', { permissions, type: typeof permissions });
                if (Array.isArray(permissions)) {
                    updateData.permissions = JSON.stringify(permissions);
                    console.log('✅ Permissions is array, stringified to:', updateData.permissions);
                } else if (typeof permissions === 'string') {
                    // Validate it's valid JSON
                    try {
                        const parsed = JSON.parse(permissions);
                        // If it parses to an array, use the stringified version
                        if (Array.isArray(parsed)) {
                            updateData.permissions = permissions; // Already a valid JSON string
                            console.log('✅ Permissions is valid JSON string:', updateData.permissions);
                        } else {
                            // If it's not an array, wrap it
                            updateData.permissions = JSON.stringify([parsed]);
                            console.log('⚠️ Permissions parsed to non-array, wrapped:', updateData.permissions);
                        }
                    } catch (e) {
                        console.warn('❌ Invalid permissions JSON, defaulting to empty array:', e);
                        updateData.permissions = '[]';
                    }
                } else {
                    console.warn('❌ Permissions is neither array nor string, defaulting to empty array');
                    updateData.permissions = '[]';
                }
            } else {
                console.log('ℹ️ No permissions field in request body (undefined or null)');
            }
            
            // Log what we're about to update
            console.log('📋 Final updateData:', JSON.stringify(updateData, null, 2));
            
            // Handle accessibleProjectIds if provided
            if (accessibleProjectIds !== undefined && accessibleProjectIds !== null) {
                console.log('🔧 Processing accessibleProjectIds update:', { 
                    accessibleProjectIds, 
                    type: typeof accessibleProjectIds,
                    isArray: Array.isArray(accessibleProjectIds)
                });
                
                if (Array.isArray(accessibleProjectIds)) {
                    updateData.accessibleProjectIds = JSON.stringify(accessibleProjectIds);
                    console.log('✅ accessibleProjectIds is array, stringified to:', updateData.accessibleProjectIds);
                } else if (typeof accessibleProjectIds === 'string') {
                    // Validate it's valid JSON
                    try {
                        const parsed = JSON.parse(accessibleProjectIds);
                        if (Array.isArray(parsed)) {
                            updateData.accessibleProjectIds = accessibleProjectIds; // Already a valid JSON string
                            console.log('✅ accessibleProjectIds is valid JSON string:', updateData.accessibleProjectIds);
                        } else {
                            // If it's not an array, wrap it
                            updateData.accessibleProjectIds = JSON.stringify([parsed]);
                            console.log('⚠️ accessibleProjectIds parsed to non-array, wrapped:', updateData.accessibleProjectIds);
                        }
                    } catch (e) {
                        console.warn('❌ Invalid accessibleProjectIds JSON, defaulting to empty array:', e);
                        updateData.accessibleProjectIds = '[]';
                    }
                } else {
                    console.warn('❌ accessibleProjectIds is neither array nor string, defaulting to empty array');
                    updateData.accessibleProjectIds = '[]';
                }
            } else {
                console.log('ℹ️ No accessibleProjectIds field in request body (undefined or null)');
            }

            // Final safety: ensure permissions & accessibleProjectIds are JSON strings before persisting
            if (updateData.permissions !== undefined && updateData.permissions !== null) {
                if (Array.isArray(updateData.permissions)) {
                    console.warn('⚠️ updateData.permissions is array before DB update – stringifying now');
                    updateData.permissions = JSON.stringify(updateData.permissions);
                } else if (typeof updateData.permissions !== 'string') {
                    console.warn('⚠️ updateData.permissions is not string (type:', typeof updateData.permissions, '), forcing empty array string');
                    updateData.permissions = '[]';
                }
            }

            if (updateData.accessibleProjectIds !== undefined && updateData.accessibleProjectIds !== null) {
                if (Array.isArray(updateData.accessibleProjectIds)) {
                    console.warn('⚠️ updateData.accessibleProjectIds is array before DB update – stringifying now');
                    updateData.accessibleProjectIds = JSON.stringify(updateData.accessibleProjectIds);
                } else if (typeof updateData.accessibleProjectIds !== 'string') {
                    console.warn('⚠️ updateData.accessibleProjectIds is not string (type:', typeof updateData.accessibleProjectIds, '), forcing empty array string');
                    updateData.accessibleProjectIds = '[]';
                }
            }

            console.log('💾 Updating user with data:', JSON.stringify(updateData, null, 2));
            console.log('🔍 Permissions in updateData:', updateData.permissions, 'Type:', typeof updateData.permissions);
            
            // Update user
            let updatedUser;
            try {
                updatedUser = await prisma.user.update({
                    where: { id: userId },
                    data: updateData,
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        permissions: true,
                        status: true,
                        department: true,
                        phone: true,
                        accessibleProjectIds: true,
                        updatedAt: true
                    }
                })
                
                console.log('💾 Database update completed. Permissions in response:', updatedUser.permissions, 'Type:', typeof updatedUser.permissions);
            } catch (dbError) {
                console.error('❌ Database update error:', {
                    message: dbError.message,
                    code: dbError.code,
                    meta: dbError.meta,
                    userId: userId,
                    updateData: JSON.stringify(updateData, null, 2),
                    hasPermissions: 'permissions' in updateData,
                    permissionsValue: updateData.permissions
                });
                throw dbError;
            }

            console.log('✅ User updated successfully:', {
                id: updatedUser.id,
                email: updatedUser.email,
                permissions: updatedUser.permissions,
                permissionsType: typeof updatedUser.permissions
            })

            // Parse permissions from JSON string to array for response
            let parsedPermissions = [];
            if (updatedUser.permissions) {
                try {
                    if (typeof updatedUser.permissions === 'string') {
                        const parsed = JSON.parse(updatedUser.permissions);
                        parsedPermissions = Array.isArray(parsed) ? parsed : [];
                    } else if (Array.isArray(updatedUser.permissions)) {
                        parsedPermissions = updatedUser.permissions;
                    }
                } catch (e) {
                    console.warn('⚠️ Failed to parse permissions, using empty array:', e);
                    parsedPermissions = [];
                }
            }

            // Parse accessibleProjectIds from JSON string to array for response
            let parsedAccessibleProjectIds = [];
            if (updatedUser.accessibleProjectIds) {
                try {
                    if (typeof updatedUser.accessibleProjectIds === 'string') {
                        const parsed = JSON.parse(updatedUser.accessibleProjectIds);
                        parsedAccessibleProjectIds = Array.isArray(parsed) ? parsed : [];
                    } else if (Array.isArray(updatedUser.accessibleProjectIds)) {
                        parsedAccessibleProjectIds = updatedUser.accessibleProjectIds;
                    }
                } catch (e) {
                    console.warn('⚠️ Failed to parse accessibleProjectIds, using empty array:', e);
                    parsedAccessibleProjectIds = [];
                }
            }

            // Return user with parsed permissions and accessibleProjectIds
            const responseUser = {
                ...updatedUser,
                permissions: parsedPermissions,
                accessibleProjectIds: parsedAccessibleProjectIds
            };

            return ok(res, { 
                success: true, 
                message: 'User updated successfully',
                user: responseUser
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
