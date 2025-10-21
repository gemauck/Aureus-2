// Users management API endpoint
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { PERMISSIONS } from '../../src/utils/permissions.js'

async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            // Check if user has permission to manage users
            if (!req.user || (req.user.role !== 'admin' && !req.user.permissions?.includes(PERMISSIONS.MANAGE_USERS))) {
                return unauthorized(res, 'Permission required: manage_users')
            }

            // Get all users
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
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
            // Check if user has permission to manage users
            if (!req.user || (req.user.role !== 'admin' && !req.user.permissions?.includes(PERMISSIONS.MANAGE_USERS))) {
                return unauthorized(res, 'Permission required: manage_users')
            }

            const { name, email, role = 'member', department, phone, status = 'active' } = req.body || {}
            
            if (!name || !email) {
                return badRequest(res, 'Name and email are required')
            }

            // Check if user already exists
            const existingUser = await prisma.user.findUnique({ where: { email } })
            if (existingUser) {
                return badRequest(res, 'User with this email already exists')
            }

            // Create new user
            const newUser = await prisma.user.create({
                data: {
                    name,
                    email,
                    role,
                    status,
                    provider: 'manual',
                    // Store additional fields in a JSON field or extend schema
                    // For now, we'll use the existing fields
                }
            })

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
                }
            })

        } catch (error) {
            console.error('Create user error:', error)
            return serverError(res, 'Failed to create user', error.message)
        }
    }

    if (req.method === 'PUT') {
        try {
            // Check if user has permission to manage users
            if (!req.user || (req.user.role !== 'admin' && !req.user.permissions?.includes(PERMISSIONS.MANAGE_USERS))) {
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
            // Check if user has permission to manage users
            if (!req.user || (req.user.role !== 'admin' && !req.user.permissions?.includes(PERMISSIONS.MANAGE_USERS))) {
                return unauthorized(res, 'Permission required: manage_users')
            }

            const { userId } = req.body || {}
            
            if (!userId) {
                return badRequest(res, 'User ID is required')
            }

            // Prevent deleting own account
            if (req.user.id === userId) {
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
