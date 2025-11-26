// Users management API endpoint - Direct route
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { sendNotificationEmail } from './_lib/email.js'
import { getAppUrl } from './_lib/getAppUrl.js'

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
            // Only admins get full employee profile data
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
                            permissions: true,
                            status: true,
                            department: true,
                            jobTitle: true,
                            phone: true,
                            // Employee profile fields
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
                    
                    // Use permissions from database, with fallback to empty array if null
                    users = usersQuery.map(user => ({
                        ...user,
                        permissions: user.permissions || '[]' // Use database value or default to empty array
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
            
            // Check if it's a connection error - comprehensive list including PrismaClientInitializationError
            const errorName = error.name || ''
            const errorMessage = error.message || ''
            const isConnectionError = 
              errorName === 'PrismaClientInitializationError' ||
              errorMessage.includes("Can't reach database server") ||
              errorMessage.includes("Can't reach database") ||
              (errorMessage.includes("connection") && (errorMessage.includes("timeout") || errorMessage.includes("refused") || errorMessage.includes("unreachable"))) ||
              error.code === 'P1001' || // Can't reach database server
              error.code === 'P1002' || // The database server is not reachable
              error.code === 'P1008' || // Operations timed out
              error.code === 'P1017' || // Server has closed the connection
              error.code === 'ETIMEDOUT' ||
              error.code === 'ECONNREFUSED' ||
              error.code === 'ENOTFOUND' ||
              error.code === 'EAI_AGAIN'
            
            if (isConnectionError) {
              console.error('🔌 Database connection issue detected - server may be unreachable')
              return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
            }
            
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

            console.log('User created with temporary password:', tempPassword)

            // Attempt to send a welcome email with the temporary password
            let emailSent = false
            let emailError = null
            try {
                const appUrl = getAppUrl()
                const loginUrl = `${appUrl}/login`

                const subject = 'Your Abcotronics account has been created'
                const message = `
                    <p>Hi ${name || email},</p>
                    <p>An administrator has created an account for you on the Abcotronics system.</p>
                    <p><strong>Login details:</strong></p>
                    <ul>
                        <li><strong>Email:</strong> ${email}</li>
                        <li><strong>Temporary password:</strong> ${tempPassword}</li>
                    </ul>
                    <p>Please log in using the button below and change your password when prompted.</p>
                    <p style="margin: 16px 0;">
                        <a href="${loginUrl}" style="background:#007bff;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;font-weight:bold;display:inline-block;">
                            Go to Abcotronics
                        </a>
                    </p>
                    <p>If you did not expect this email, please contact your administrator.</p>
                `

                await sendNotificationEmail(
                    email,
                    subject,
                    message,
                    { isProjectRelated: false }
                )
                emailSent = true
                console.log('✅ New user welcome email sent:', email)
            } catch (err) {
                emailError = err
                console.error('❌ Failed to send new user welcome email:', err)
            }

            return ok(res, {
                success: true,
                message: emailSent
                    ? 'User created successfully and welcome email sent'
                    : 'User created successfully, but sending the welcome email failed. Please share the temporary password manually.',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                },
                tempPassword, // Still returned so the UI can show it if needed
                emailSent,
                emailError: emailError ? emailError.message : null
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

            const {
                userId,
                permissions,
                accessibleProjectIds,
                ...updateData
            } = req.body || {}
            
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

            // Prepare mutable copy so we can transform specific fields safely
            const processedUpdates = { ...updateData }

            // Handle permissions updates (always persist as JSON string)
            if (permissions !== undefined && permissions !== null) {
                console.log('🔧 [api/users.js] Processing permissions update:', {
                    type: typeof permissions,
                    isArray: Array.isArray(permissions)
                })

                if (Array.isArray(permissions)) {
                    processedUpdates.permissions = JSON.stringify(permissions)
                    console.log('✅ [api/users.js] Permissions array stringified:', processedUpdates.permissions)
                } else if (typeof permissions === 'string') {
                    try {
                        const parsed = JSON.parse(permissions)
                        processedUpdates.permissions = Array.isArray(parsed)
                            ? permissions
                            : JSON.stringify([parsed])
                        console.log('✅ [api/users.js] Permissions string processed:', processedUpdates.permissions)
                    } catch (err) {
                        console.warn('⚠️ [api/users.js] Invalid permissions string, defaulting to []', err)
                        processedUpdates.permissions = '[]'
                    }
                } else {
                    console.warn('⚠️ [api/users.js] Permissions not array/string, defaulting to []')
                    processedUpdates.permissions = '[]'
                }
            }

            // Handle accessibleProjectIds the same way (persist as JSON string)
            if (accessibleProjectIds !== undefined && accessibleProjectIds !== null) {
                console.log('🔧 [api/users.js] Processing accessibleProjectIds update:', {
                    type: typeof accessibleProjectIds,
                    isArray: Array.isArray(accessibleProjectIds)
                })

                if (Array.isArray(accessibleProjectIds)) {
                    processedUpdates.accessibleProjectIds = JSON.stringify(accessibleProjectIds)
                    console.log('✅ [api/users.js] accessibleProjectIds array stringified:', processedUpdates.accessibleProjectIds)
                } else if (typeof accessibleProjectIds === 'string') {
                    try {
                        const parsed = JSON.parse(accessibleProjectIds)
                        processedUpdates.accessibleProjectIds = Array.isArray(parsed)
                            ? accessibleProjectIds
                            : JSON.stringify([parsed])
                        console.log('✅ [api/users.js] accessibleProjectIds string processed:', processedUpdates.accessibleProjectIds)
                    } catch (err) {
                        console.warn('⚠️ [api/users.js] Invalid accessibleProjectIds string, defaulting to []', err)
                        processedUpdates.accessibleProjectIds = '[]'
                    }
                } else {
                    console.warn('⚠️ [api/users.js] accessibleProjectIds not array/string, defaulting to []')
                    processedUpdates.accessibleProjectIds = '[]'
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
            } = processedUpdates

            console.log('📋 [api/users.js] Final allowedUpdates payload:', allowedUpdates)

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
        // If DELETE request has an ID in the URL path (e.g., /api/users/:id),
        // let the dynamic route handler at api/users/[id].js handle it
        const urlPath = req.url.split('?')[0].split('#')[0]
        const pathParts = urlPath.split('/').filter(Boolean)
        // If path is /api/users/:id, skip this handler
        if (pathParts.length >= 3 && pathParts[0] === 'api' && pathParts[1] === 'users' && pathParts[2] !== 'invite' && pathParts[2] !== 'invitation-details' && pathParts[2] !== 'accept-invitation' && pathParts[2] !== 'change-password') {
            // This should be handled by api/users/[id].js
            return badRequest(res, 'Use DELETE /api/users/:id endpoint')
        }
        
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
