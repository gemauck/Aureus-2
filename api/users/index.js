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
            console.error('Get users error:', error)
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

            const { name, email, role = 'user', department = '', phone = '', status = 'active' } = req.body || {}
            
            console.log('📝 Creating user with data:', { name, email, role, department, phone, status });
            
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

            const newUser = await prisma.user.create({
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

            const { userId, name, email, role, status, department, phone } = req.body || {}
            
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

            // Update user
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    ...(name && { name }),
                    ...(email && { email }),
                    ...(role && { role }),
                    ...(status && { status }),
                }
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
