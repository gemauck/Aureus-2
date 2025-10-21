// Accept invitation API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import bcrypt from 'bcryptjs'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        console.log('🎯 Processing invitation acceptance...')
        
        const { token, password, name } = req.body || {}
        
        if (!token || !password || !name) {
            return badRequest(res, 'Token, password, and name are required')
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
            return badRequest(res, 'Invitation has already been used or expired')
        }

        if (new Date() > invitation.expiresAt) {
            return badRequest(res, 'Invitation has expired')
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: invitation.email }
        })

        if (existingUser) {
            return badRequest(res, 'User with this email already exists')
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10)

        // Create user account
        const newUser = await prisma.user.create({
            data: {
                email: invitation.email,
                name: name || invitation.name,
                passwordHash,
                role: invitation.role,
                status: 'active',
                provider: 'local',
                invitedBy: invitation.invitedBy
            }
        })

        // Mark invitation as accepted
        await prisma.invitation.update({
            where: { id: invitation.id },
            data: {
                status: 'accepted',
                acceptedAt: new Date()
            }
        })

        console.log('✅ User account created successfully:', newUser.id)

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
        return serverError(res, 'Failed to accept invitation', error.message)
    }
}

export default withHttp(withLogging(handler))