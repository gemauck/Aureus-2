// Get invitation details API endpoint
import { prisma, verifyConnection } from '../_lib/prisma.js'
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

        
        // Verify database connection first
        try {
            const isConnected = await verifyConnection()
            if (!isConnected) {
                console.error('❌ Database connection not available')
                return serverError(res, 'Database connection failed', 'Unable to connect to the database. Please try again later or contact support.')
            }
        } catch (connError) {
            console.error('❌ Database connection verification failed:', connError.message)
            return serverError(res, 'Database connection failed', 'Unable to connect to the database. Please try again later or contact support.')
        }
        
        // Find invitation
        let invitation
        try {
            invitation = await prisma.invitation.findUnique({
                where: { token }
            })
        } catch (dbError) {
            // Check if it's a connection error
            const isConnectionError = 
                dbError.message?.includes("Can't reach database server") ||
                dbError.message?.includes("connection") ||
                dbError.message?.includes("P1001") ||
                dbError.message?.includes("P1002") ||
                dbError.message?.includes("P1008") ||
                dbError.code === 'P1001' ||
                dbError.code === 'P1002' ||
                dbError.code === 'P1008' ||
                dbError.code === 'ETIMEDOUT' ||
                dbError.code === 'ECONNREFUSED' ||
                dbError.code === 'ENOTFOUND'
            
            if (isConnectionError) {
                console.error('❌ Database connection error during invitation lookup:', dbError.message)
                return serverError(res, 'Database connection failed', 'Unable to connect to the database. Please try again later or contact support.')
            }
            // Re-throw if it's not a connection error
            throw dbError
        }

        if (!invitation) {
            // Check if token format is valid (64 hex characters)
            if (!/^[a-f0-9]{64}$/i.test(token)) {
                return badRequest(res, 'Invalid invitation token format')
            }
            
            // Try to check for pending invitations (with error handling)
            try {
                const pendingCount = await prisma.invitation.count({
                    where: { status: 'pending' }
                })
                if (pendingCount === 0) {
                    return badRequest(res, 'Invalid invitation token. No pending invitations found. Please request a new invitation.')
                }
            } catch (countError) {
                console.error('❌ Error checking pending invitations count:', countError.message)
                // Continue with default message if count check fails
            }
            
            return badRequest(res, 'Invalid invitation token. This invitation may have expired or been cancelled. Please request a new invitation link.')
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
        // Check if it's a connection error
        const isConnectionError = 
            error.message?.includes("Can't reach database server") ||
            error.message?.includes("connection") ||
            error.message?.includes("P1001") ||
            error.message?.includes("P1002") ||
            error.message?.includes("P1008") ||
            error.code === 'P1001' ||
            error.code === 'P1002' ||
            error.code === 'P1008' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND'
        
        if (isConnectionError) {
            return serverError(res, 'Database connection failed', 'Unable to connect to the database. Please try again later or contact support.')
        }
        
        return serverError(res, 'Failed to get invitation details', error.message)
    }
}

export default withHttp(withLogging(handler))
