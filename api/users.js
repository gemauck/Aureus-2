// Users management API endpoint - Direct route
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            // Check if user is authenticated (req.user is set by authRequired)
            if (!req.user) {
                console.error('❌ Users endpoint: req.user is missing')
                return unauthorized(res, 'Authentication required')
            }
            
            const userRole = req.user?.role?.toLowerCase();
            const isAdmin = userRole === 'admin';

            // All authenticated users get basic user info for mentions
            // Only admins get full HR data
            console.log(`✅ Users endpoint: Fetching users for ${isAdmin ? 'admin' : 'regular user'}...`)

            let users = []
            let invitations = []
            
            try {
                // Non-admins get minimal data for @mentions
                if (!isAdmin) {
                    const usersQuery = await prisma.user.findMany({
                        select: {
                            id: true,
                            email: true,
                            name: true,
                            status: true
                        },
                        where: {
                            status: { not: 'inactive' } // Only active users for mentions
                        },
                        orderBy: { name: 'asc' }
                    })
                    users = usersQuery
                    console.log(`✅ Users endpoint: Fetched ${users.length} users for mentions`)
                } else {
                    // Admins get full data
                    const usersQuery = await prisma.user.findMany({
                        select: {
                            id: true,
                            email: true,
                            name: true,
                            role: true,
                            // permissions: true, // Temporarily removed - will add back after fixing schema
                            status: true,
                            department: true,
                            jobTitle: true,
                            phone: true,
                            // HR/Employee fields
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
                            lastLoginAt: true,
                            lastSeenAt: true,
                            invitedBy: true
                        },
                        orderBy: { createdAt: 'desc' }
                    })
                    
                    // Manually add permissions field (default to empty array if column doesn't exist)
                    users = usersQuery.map(user => ({
                        ...user,
                        permissions: '[]' // Default permissions
                    }))
                    console.log(`✅ Users endpoint: Fetched ${users.length} users with full details`)
                    
                    // Get all invitations (only for admins)
                    try {
                        invitations = await prisma.invitation.findMany({
                            orderBy: { createdAt: 'desc' }
                        })
                        console.log(`✅ Users endpoint: Fetched ${invitations.length} invitations`)
                    } catch (invitationError) {
                        console.warn('⚠️ Invitation table not accessible, returning empty list:', invitationError.message)
                    }
                }
            } catch (userQueryError) {
                console.error('❌ Users endpoint: Failed to query users:', userQueryError)
                console.error('❌ Users endpoint: Error stack:', userQueryError.stack)
                throw new Error(`Database query failed: ${userQueryError.message}`)
            }

            return ok(res, {
                users,
                invitations
            })

        } catch (error) {
            console.error('❌ Get users error:', error)
            console.error('❌ Get users error stack:', error.stack)
            return serverError(res, 'Failed to get users', error.message)
        }
    }

    if (req.method === 'POST') {
        try {
            // Check if user is admin
            if (!req.user || req.user.role !== 'admin') {
                return unauthorized(res, 'Admin access required')
            }

            const { name, email, role = 'user', department = '', phone = '', status = 'active' } = req.body || {}
            
            if (!name || !email) {
                return badRequest(res, 'Name and email are required')
            }

            // Check if user already exists
            const existingUser = await prisma.user.findUnique({ where: { email } })
            if (existingUser) {
                return badRequest(res, 'User with this email already exists')
            }

            // Create user with a default temporary password
            const bcrypt = await import('bcryptjs')
            const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase()
            const passwordHash = await bcrypt.default.hash(tempPassword, 10)

            const user = await prisma.user.create({
                data: {
                    name,
                    email,
                    passwordHash,
                    role,
                    department,
                    phone,
                    status,
                    mustChangePassword: true,
                    provider: 'local'
                }
            })

            // TODO: Send email with temporary password
            console.log('User created with temporary password:', tempPassword)

            return ok(res, {
                success: true,
                message: 'User created successfully',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                },
                tempPassword // In production, send this via email instead
            })

        } catch (error) {
            console.error('Create user error:', error)
            return serverError(res, 'Failed to create user', error.message)
        }
    }

    if (req.method === 'PUT') {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return unauthorized(res, 'Authentication required')
            }

            const { userId, ...updateData } = req.body || {}
            
            if (!userId) {
                return badRequest(res, 'User ID is required')
            }

            // Allow users to update their own profile or admins to update anyone
            const currentUserId = req.user.sub || req.user.id
            if (currentUserId !== userId && req.user.role !== 'admin') {
                return unauthorized(res, 'Unauthorized to update this user')
            }

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
            // Check if user is admin (req.user is set by authRequired)
            if (!req.user || req.user.role !== 'admin') {
                return unauthorized(res, 'Admin access required')
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
                where: { id: userId }
            })

            if (!userToDelete) {
                return badRequest(res, 'User not found')
            }

            // Check for critical dependencies before deletion (count all, not just first)
            const [ownedClientsCount, ownedProjectsCount, tasksCount] = await Promise.all([
                prisma.client.count({ where: { ownerId: userId } }),
                prisma.project.count({ where: { ownerId: userId } }),
                prisma.task.count({ where: { assigneeId: userId } })
            ])

            if (ownedClientsCount > 0 || ownedProjectsCount > 0 || tasksCount > 0) {
                const issues = []
                if (ownedClientsCount > 0) issues.push(`${ownedClientsCount} client(s)`)
                if (ownedProjectsCount > 0) issues.push(`${ownedProjectsCount} project(s)`)
                if (tasksCount > 0) issues.push(`${tasksCount} task(s)`)
                
                return badRequest(res, `Cannot delete user: They are associated with ${issues.join(', ')}. Please reassign these items first.`)
            }

            // Delete user and related records in a transaction
            // Order matters: delete all records that reference User BEFORE deleting User
            await prisma.$transaction(async (tx) => {
                // 1. Delete memberships
                await tx.membership.deleteMany({
                    where: { userId: userId }
                })

                // 2. Delete one-to-one relationships (must use delete, not deleteMany)
                await tx.twoFactor.deleteMany({
                    where: { userId: userId }
                })
                
                await tx.notificationSetting.deleteMany({
                    where: { userId: userId }
                })

                // 3. Delete related records that reference User by foreign key
                await tx.passwordReset.deleteMany({
                    where: { userId: userId }
                })
                
                await tx.passwordHistory.deleteMany({
                    where: { userId: userId }
                })
                
                await tx.securityEvent.deleteMany({
                    where: { userId: userId }
                })
                
                await tx.calendarNote.deleteMany({
                    where: { userId: userId }
                })
                
                await tx.session.deleteMany({
                    where: { userId: userId }
                })
                
                await tx.auditLog.deleteMany({
                    where: { actorId: userId }
                })
                
                await tx.feedback.deleteMany({
                    where: { userId: userId }
                })
                
                await tx.message.deleteMany({
                    where: { senderId: userId }
                })
                
                // Note: Notification and NotificationSetting have onDelete: Cascade
                // but we delete them explicitly to be safe
                await tx.notification.deleteMany({
                    where: { userId: userId }
                })

                // 4. Finally delete the user
                await tx.user.delete({
                    where: { id: userId }
                })
            }, {
                timeout: 10000 // 10 second timeout for the transaction
            })

            console.log(`✅ User deleted successfully: ${userId}`)
            return ok(res, { success: true, message: 'User deleted successfully' })

        } catch (error) {
            console.error('❌ Delete user error:', error)
            console.error('❌ Error details:', {
                message: error.message,
                code: error.code,
                meta: error.meta
            })
            
            // Provide more specific error messages
            let errorMessage = error.message
            if (error.code === 'P2003') {
                errorMessage = 'Cannot delete user: They are still referenced in other records. Please reassign or remove those references first.'
            } else if (error.code === 'P2025') {
                errorMessage = 'User not found'
            }
            
            return serverError(res, 'Failed to delete user', errorMessage)
        }
    }

    return badRequest(res, 'Invalid method')
}

export default withHttp(withLogging(authRequired(handler)))
