// Users management API endpoint - Direct route
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            // Check if user is admin (req.user is set by authRequired)
            if (!req.user || req.user.role !== 'admin') {
                return unauthorized(res, 'Admin access required')
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
