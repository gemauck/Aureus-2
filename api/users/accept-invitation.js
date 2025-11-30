// Accept invitation API endpoint
import { prisma, verifyConnection } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import bcrypt from 'bcryptjs'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        
        const { token, password, name, phone = '', department = '', jobTitle = '' } = req.body || {}
        
        if (!token || !password || !name) {
            return badRequest(res, 'Token, password, and name are required')
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

        // Find invitation by token
        let invitation
        try {
            invitation = await prisma.invitation.findUnique({
                where: { token }
            })
        } catch (dbError) {
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
            throw dbError
        }

        if (!invitation) {
            return badRequest(res, 'Invalid invitation token')
        }

        // Check if invitation is still valid
        if (invitation.status !== 'pending') {
            return badRequest(res, 'Invitation has already been used or expired')
        }

        if (new Date() > invitation.expiresAt) {
            return badRequest(res, 'Invitation has expired')
        }

        // Check if user already exists
        let existingUser
        try {
            existingUser = await prisma.user.findUnique({
                where: { email: invitation.email }
            })
        } catch (dbError) {
            const isConnectionError = 
                dbError.message?.includes("Can't reach database server") ||
                dbError.message?.includes("connection") ||
                dbError.code === 'P1001' ||
                dbError.code === 'P1002' ||
                dbError.code === 'P1008' ||
                dbError.code === 'ETIMEDOUT' ||
                dbError.code === 'ECONNREFUSED' ||
                dbError.code === 'ENOTFOUND'
            
            if (isConnectionError) {
                console.error('❌ Database connection error during user check:', dbError.message)
                return serverError(res, 'Database connection failed', 'Unable to connect to the database. Please try again later or contact support.')
            }
            throw dbError
        }

        if (existingUser) {
            return badRequest(res, 'User with this email already exists')
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10)

        // Prepare accessibleProjectIds from invitation
        let accessibleProjectIdsJson = '[]';
        if (invitation.accessibleProjectIds) {
            if (typeof invitation.accessibleProjectIds === 'string') {
                // Validate it's valid JSON
                try {
                    JSON.parse(invitation.accessibleProjectIds);
                    accessibleProjectIdsJson = invitation.accessibleProjectIds;
                } catch (e) {
                    accessibleProjectIdsJson = '[]';
                }
            } else if (Array.isArray(invitation.accessibleProjectIds)) {
                accessibleProjectIdsJson = JSON.stringify(invitation.accessibleProjectIds);
            }
        }

        // Create user account
        let newUser
        try {
            newUser = await prisma.user.create({
                data: {
                    email: invitation.email,
                    name: name || invitation.name,
                    passwordHash,
                    role: invitation.role,
                    accessibleProjectIds: accessibleProjectIdsJson,
                    status: 'active',
                    provider: 'local',
                    invitedBy: invitation.invitedBy,
                    phone: phone.trim() || '',
                    department: department.trim() || '',
                    jobTitle: jobTitle.trim() || ''
                }
            })
        } catch (dbError) {
            const isConnectionError = 
                dbError.message?.includes("Can't reach database server") ||
                dbError.message?.includes("connection") ||
                dbError.code === 'P1001' ||
                dbError.code === 'P1002' ||
                dbError.code === 'P1008' ||
                dbError.code === 'ETIMEDOUT' ||
                dbError.code === 'ECONNREFUSED' ||
                dbError.code === 'ENOTFOUND'
            
            if (isConnectionError) {
                console.error('❌ Database connection error during user creation:', dbError.message)
                return serverError(res, 'Database connection failed', 'Unable to connect to the database. Please try again later or contact support.')
            }
            throw dbError
        }

        // Mark invitation as accepted
        try {
            await prisma.invitation.update({
                where: { id: invitation.id },
                data: {
                    status: 'accepted',
                    acceptedAt: new Date()
                }
            })
        } catch (dbError) {
            // Log but don't fail if invitation update fails (user is already created)
            console.error('⚠️ Failed to update invitation status (user already created):', dbError.message)
        }


        return ok(res, {
            success: true,
            message: 'Account created successfully! You can now log in.',
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role
            }
        })

    } catch (error) {
        console.error('❌ Accept invitation error:', error)
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
        
        return serverError(res, 'Failed to accept invitation', error.message)
    }
}

export default withHttp(withLogging(handler))