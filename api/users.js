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
                return unauthorized(res, 'Authentication required')
            }
            
            // For now, allow all authenticated users to see basic user info
            // TODO: Implement proper role-based access control

            // Get all users with HR fields
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
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

            // Get all invitations
            const invitations = await prisma.invitation.findMany({
                orderBy: { createdAt: 'desc' }
            })

            return ok(res, {
                users,
                invitations
            })

        } catch (error) {
            console.error('Get users error:', error)
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

            // Delete user
            await prisma.user.delete({
                where: { id: userId }
            })

            return ok(res, { success: true, message: 'User deleted successfully' })

        } catch (error) {
            console.error('Delete user error:', error)
            return serverError(res, 'Failed to delete user', error.message)
        }
    }

    return badRequest(res, 'Invalid method')
}

export default withHttp(withLogging(authRequired(handler)))
