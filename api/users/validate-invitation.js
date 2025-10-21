// Validate invitation API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        const { token } = req.body || {}
        
        if (!token) {
            return badRequest(res, 'Token is required')
        }

        // Find invitation by token
        const invitation = await prisma.invitation.findUnique({
            where: { token }
        })

        if (!invitation) {
            return badRequest(res, 'Invalid invitation token')
        }

        // Check if invitation is still valid
        if (invitation.status !== 'pending') {
            return badRequest(res, 'Invitation has already been used')
        }

        if (new Date() > invitation.expiresAt) {
            return badRequest(res, 'Invitation has expired')
        }

        return ok(res, {
            success: true,
            invitation: {
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                expiresAt: invitation.expiresAt
            }
        })

    } catch (error) {
        console.error('Validate invitation error:', error)
        return serverError(res, 'Failed to validate invitation', error.message)
    }
}

export default withHttp(withLogging(handler))
