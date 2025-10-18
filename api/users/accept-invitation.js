// Accept invitation API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import bcrypt from 'bcryptjs'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        const { token, password, confirmPassword } = req.body || {}
        
        if (!token || !password || !confirmPassword) {
            return badRequest(res, 'Token, password and confirmation are required')
        }

        if (password !== confirmPassword) {
            return badRequest(res, 'Passwords do not match')
        }

        if (password.length < 6) {
            return badRequest(res, 'Password must be at least 6 characters')
        }

        // Find and validate invitation
        const invitation = await prisma.invitation.findUnique({
            where: { token }
        })

        if (!invitation) {
            return badRequest(res, 'Invalid invitation token')
        }

        if (invitation.status !== 'pending') {
            return badRequest(res, 'Invitation has already been used or cancelled')
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
        const passwordHash = await bcrypt.hash(password, 12)

        // Create user
        const user = await prisma.user.create({
            data: {
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                passwordHash,
                status: 'active',
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

        return ok(res, {
            success: true,
            message: 'Account created successfully! You can now log in.',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        })

    } catch (error) {
        console.error('Invitation acceptance error:', error)
        return serverError(res, 'Failed to accept invitation', error.message)
    }
}

export default withHttp(withLogging(handler))
