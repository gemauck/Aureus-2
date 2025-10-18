// Get invitation details API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
    if (req.method !== 'GET') return badRequest(res, 'Invalid method')
    
    try {
        const { token } = req.query || {}
        
        if (!token) {
            return badRequest(res, 'Token is required')
        }

        // Find invitation
        const invitation = await prisma.invitation.findUnique({
            where: { token }
        })

        if (!invitation) {
            return badRequest(res, 'Invalid invitation token')
        }

        if (new Date() > invitation.expiresAt) {
            return badRequest(res, 'Invitation has expired')
        }

        if (invitation.status !== 'pending') {
            return badRequest(res, 'Invitation has already been used or cancelled')
        }

        return ok(res, {
            success: true,
            invitation: {
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                invitedBy: invitation.invitedBy,
                expiresAt: invitation.expiresAt
            }
        })

    } catch (error) {
        console.error('Get invitation details error:', error)
        return serverError(res, 'Failed to get invitation details', error.message)
    }
}

export default withHttp(withLogging(handler))
