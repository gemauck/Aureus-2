// User invitation API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { sendInvitationEmail } from '../_lib/email.js'
import crypto from 'crypto'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        const { email, name, role = 'user', invitedBy } = req.body || {}
        
        if (!email || !name) {
            return badRequest(res, 'Email and name are required')
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } })
        if (existingUser) {
            return badRequest(res, 'User with this email already exists')
        }

        // Generate invitation token
        const invitationToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        // Create invitation record
        const invitation = await prisma.invitation.create({
            data: {
                email,
                name,
                role,
                token: invitationToken,
                expiresAt,
                invitedBy: invitedBy || 'system',
                status: 'pending'
            }
        })

        // Generate invitation link and send email
        const invitationLink = `${process.env.APP_URL || 'http://localhost:3001'}/accept-invitation?token=${invitationToken}`
        
        try {
            // Send invitation email
            await sendInvitationEmail({
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                invitationLink: invitationLink
            });
            
            console.log(`✅ Invitation email sent to ${email}`);
        } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
            // Still return success but log the email error
        }

        return ok(res, {
            success: true,
            message: 'Invitation sent successfully via email',
            invitation: {
                id: invitation.id,
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                status: invitation.status,
                expiresAt: invitation.expiresAt
            },
            invitationLink
        })

    } catch (error) {
        console.error('Invitation creation error:', error)
        return serverError(res, 'Failed to create invitation', error.message)
    }
}

export default withHttp(withLogging(handler))
